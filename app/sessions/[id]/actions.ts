"use server";

import { revalidatePath } from "next/cache";
import {
  callLlm,
  hasAnyKey,
  hasKey,
  parseJsonResponse,
  resolveProviderAndModel,
} from "@/lib/llm/provider";
import { PROVIDERS } from "@/lib/llm/registry";
import type { LlmStage, ProviderId } from "@/lib/types";
import { extractResumeText, kindLabel } from "@/lib/documentExtract";
import { redirect } from "next/navigation";
import {
  duplicateSession,
  getCandidate,
  isValidSessionId,
  getConditionsSnapshot,
  getEvalCriteria,
  getMinutes,
  getQuestions,
  getRole,
  getSessionMeta,
  loadSettings,
  resolveEvalForRole,
  saveCandidate,
  saveConditionsSnapshot,
  saveEvaluation,
  saveMinutes,
  saveQuestions,
  saveSessionMeta,
} from "@/lib/storage";
import type {
  AxisEvaluation,
  Candidate,
  ConditionsSnapshot,
  Evaluation,
  Minutes,
  Mode,
  Questions,
  Role,
  SessionMeta,
} from "@/lib/types";
import { writeAudit } from "@/lib/auditLog";
import { flattenToItems, parseQuestions } from "@/lib/questionParser";
import { softDeleteSession } from "@/lib/retention";
import {
  MAX_MINUTES_BYTES,
  MAX_TEXT_BYTES,
  assertResumeUpload,
  assertTextWithinLimit,
  validateName,
} from "@/lib/validation";

function nowIso(): string {
  return new Date().toISOString();
}

/** 工程ごとに provider+model を解決。override が無ければ settings 既定を使う */
export interface LlmOverride {
  provider?: ProviderId;
  model?: string;
}

function resolveLlm(stage: LlmStage, override?: LlmOverride) {
  return resolveProviderAndModel(stage, override);
}

function noKeyError(provider: ProviderId): { ok: false; error: string } {
  const name = PROVIDERS[provider].displayName;
  return {
    ok: false,
    error: `${name} の API キーが設定されていません。/settings で設定してください。`,
  };
}

function bumpSession(id: string): void {
  revalidatePath(`/sessions/${id}`);
}

/**
 * 設計書 §9 の状態遷移を進める汎用ヘルパー。
 * - 後退しない（評価済 → 質問公開 のような下げは行わない）
 * - 同じ status のときは何もしない
 * - status の順序: 編集中(0) < 質問公開(1) < 面談済(2) < 評価済(3)
 */
const STATUS_ORDER: Record<SessionMeta["status"], number> = {
  編集中: 0,
  質問公開: 1,
  面談済: 2,
  評価済: 3,
};

function advanceStatus(id: string, target: SessionMeta["status"]): void {
  const meta = getSessionMeta(id);
  if (!meta) return;
  if (STATUS_ORDER[meta.status] >= STATUS_ORDER[target]) return;
  saveSessionMeta({ ...meta, status: target });
  revalidatePath("/");
}

/** ⑧評価が保存されたタイミングで status=評価済, closedAt=now を記録 */
function markEvaluated(id: string): void {
  const meta = getSessionMeta(id);
  if (!meta) return;
  saveSessionMeta({
    ...meta,
    status: "評価済",
    closedAt: meta.closedAt ?? nowIso(),
  });
  revalidatePath("/");
}

export async function toggleHoldAction(id: string, hold: boolean): Promise<void> {
  const meta = getSessionMeta(id);
  if (!meta) throw new Error("セッションが見つかりません");
  saveSessionMeta({ ...meta, hold });
  bumpSession(id);
  revalidatePath("/");
}

export async function setResultAction(
  id: string,
  result: "採用" | "不採用" | "未確定",
): Promise<void> {
  const meta = getSessionMeta(id);
  if (!meta) throw new Error("セッションが見つかりません");
  saveSessionMeta({ ...meta, result });
  writeAudit("session.saveEvaluation", {
    sessionId: id,
    meta: { kind: "setResult", result },
  });
  bumpSession(id);
  revalidatePath("/");
}

/**
 * セッションを複製する Server Action。
 *
 * ⚠️ 引数は **ASCII キーのオブジェクト**（`newName` / `newRole`）にしてある。
 * 過去に `{ 氏名, 役割 }` のような非 ASCII キーを使ったところ、Next.js 16 + Turbopack
 * + Windows の組み合わせで RSC payload のシリアライゼーション境界で値が
 * Shift-JIS 化けする事象が出たため（フォルダ名が mojibake になる）。
 */
export async function duplicateSessionAction(
  id: string,
  newName?: string,
  newRole?: string,
): Promise<void> {
  // NFC 正規化（macOS の NFD 入力や合成漏れによる差分を消す）
  const name = newName ? newName.normalize("NFC").trim() : undefined;
  const role = newRole ? newRole.normalize("NFC").trim() : undefined;

  // 受信バイト列を 16 進で残す（mojibake 再発時の決定打）
  // PII を含むため、デバッグ環境変数が立ったときのみ出力する。
  if (name !== undefined && process.env.DEBUG_DUPLICATE_HEX === "1") {
    console.log(
      "[duplicateSessionAction] name hex=",
      Buffer.from(name, "utf-8").toString("hex"),
      "raw=",
      JSON.stringify(name),
    );
  }
  console.log("[duplicateSessionAction] start", { id, role });

  let newId: string | null = null;
  try {
    const src = getSessionMeta(id);
    if (!src) throw new Error("複製元のセッションが見つかりません");

    // 氏名バリデーション（指定されている場合のみ）
    if (name !== undefined && name !== src.氏名) {
      const v = validateName(name);
      if (!v.ok) throw new Error(`氏名: ${v.error}`);
    }
    // 役割が指定されているならマスタ存在チェック（タイポによる詰みを防ぐ）
    if (role && role !== src.役割) {
      if (!getRole(role)) {
        throw new Error(`役割マスタが見つかりません: ${role}`);
      }
    }
    const meta = duplicateSession(id, { 氏名: name, 役割: role });
    if (!meta) throw new Error("複製元のセッションが見つかりません");
    newId = meta.id;
    console.log(
      "[duplicateSessionAction] copied",
      "newId=",
      newId,
      "hex=",
      Buffer.from(newId, "utf-8").toString("hex").slice(0, 80) + "...",
    );
    writeAudit("session.duplicate", {
      sessionId: meta.id,
      meta: {
        sourceId: id,
        nameChanged: meta.氏名 !== src.氏名,
        roleChanged: meta.役割 !== src.役割,
      },
    });
    revalidatePath("/");
    console.log("[duplicateSessionAction] redirecting to", newId);
  } catch (e) {
    console.error("[duplicateSessionAction] failed", e);
    throw e;
  }
  // redirect() は内部で NEXT_REDIRECT を throw するので try ブロック外で呼ぶ
  // meta.id には日本語（氏名）が含まれるため、x-action-redirect ヘッダで Invalid character になるのを防ぐ
  redirect(`/sessions/${encodeURIComponent(newId!)}`);
}

/**
 * セッションを手動でゴミ箱（_trash/）へ移動。完全削除ではなく、/trash から復元可能。
 * 猶予日数を超えると保存期間スイープが完全削除する。
 */
export async function softDeleteSessionAction(id: string): Promise<void> {
  softDeleteSession(id);
  revalidatePath("/");
  revalidatePath("/trash");
  redirect("/");
}

/**
 * 複数セッションをまとめてゴミ箱へ移動。一覧画面の一括削除ボタンから呼ばれる。
 * 1 件失敗しても他は継続する（呼び出し側が握るのでロールバックはしない）。
 *
 * DoS 対策として ids 件数と ID フォーマットを事前チェックし、
 * `fs.rmSync` の集中発火や監査ログ肥大化を防ぐ。
 */
const BULK_DELETE_MAX = 500;
export async function bulkSoftDeleteSessionsAction(
  ids: string[],
): Promise<{ deleted: number }> {
  if (!Array.isArray(ids)) {
    throw new Error("ids は配列で指定してください");
  }
  if (ids.length === 0) return { deleted: 0 };
  if (ids.length > BULK_DELETE_MAX) {
    throw new Error(
      `一括削除は ${BULK_DELETE_MAX} 件までです（受信: ${ids.length}）`,
    );
  }
  // 不正な ID を先に落とす（storage 側の assert で throw させると
  // 途中まで削除された歯抜け状態が残る）
  const valid = Array.from(new Set(ids.filter((id) => isValidSessionId(id))));
  let deleted = 0;
  for (const id of valid) {
    try {
      softDeleteSession(id);
      deleted += 1;
    } catch (e) {
      console.error("[bulkSoftDeleteSessions] skip", id, e);
    }
  }
  revalidatePath("/");
  revalidatePath("/trash");
  return { deleted };
}

/* ─────────── ② 面談者情報 ─────────── */

export async function saveCandidateAction(
  id: string,
  mode: Mode,
  要約: string,
): Promise<void> {
  // Server Action は UI を経由せず直接呼ばれうるため Server 側でも上限を弾く。
  assertTextWithinLimit(要約, MAX_TEXT_BYTES, "候補者要約");
  // 構造化 3 フィールドは保存しない方針に統一（Excel 出力時に 要約 を見出しでパースして分解）
  const data: Candidate = {
    mode,
    要約,
    updatedAt: nowIso(),
  };
  saveCandidate(id, data);
  bumpSession(id);
}

const SUMMARY_SYSTEM =
  "あなたは採用担当者のアシスタントです。履歴書を構造化 JSON で要約してください。説明文や前置きなし、JSON 1個のみを返すこと。";

const SUMMARY_OUTPUT_SCHEMA =
  '{"経歴":"職種・年数・主要案件を箇条書きまたは段落で 3〜5 項目","主要スキル":"技術・資格・ツールを 3〜5 項目","強み":"具体例つきで 2〜3 点","懸念点":"事実ベースで（推測なら「要確認」と明記）"}';

const SUMMARY_TEXT_INSTRUCTION =
  "以下のテキストを履歴書として扱い、4 観点を構造化 JSON で日本語要約してください。" +
  "各フィールドは Markdown を使わない素のテキスト（改行可）で 3〜5 項目程度。" +
  "Excel 由来の場合は Markdown 表として渡されているので列見出しを尊重すること。" +
  "コードフェンス・前置きなし、JSON 1 個のみ。\n\n# 出力スキーマ\n" +
  SUMMARY_OUTPUT_SCHEMA +
  "\n\n--- 履歴書テキスト ---\n";

/** AI が返した JSON から経歴/主要スキル/強み/懸念点を取り出す。失敗時は null を返す */
function parseSummaryJson(
  raw: string,
): { 経歴: string; 主要スキル: string; 強み: string; 懸念点: string } | null {
  let obj: Record<string, unknown>;
  try {
    obj = parseJsonResponse<Record<string, unknown>>(raw);
  } catch {
    return null;
  }
  const pick = (k: string) => {
    const v = obj[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const 経歴 = pick("経歴");
  const 主要スキル = pick("主要スキル");
  const 強み = pick("強み");
  const 懸念点 = pick("懸念点");
  if (!経歴 && !主要スキル && !強み && !懸念点) return null;
  return { 経歴, 主要スキル, 強み, 懸念点 };
}

/** 3 フィールド + 懸念点を 1 つの読み物テキストに合成（要約欄や旧 UI フォールバック用） */
function composeCombinedSummary(parts: {
  経歴: string;
  主要スキル: string;
  強み: string;
  懸念点: string;
}): string {
  const sections: string[] = [];
  if (parts.経歴) sections.push("# 経歴\n" + parts.経歴);
  if (parts.主要スキル) sections.push("# 主要スキル\n" + parts.主要スキル);
  if (parts.強み) sections.push("# 強み\n" + parts.強み);
  if (parts.懸念点) sections.push("# 懸念点\n" + parts.懸念点);
  return sections.join("\n\n");
}

export async function summarizeCandidateApiAction(
  id: string,
  fileBase64: string | null,
  fileName: string | null,
  fileMime: string | null,
  fallbackText: string,
  override?: LlmOverride,
): Promise<{
  ok: boolean;
  error?: string;
  summary?: string;
}> {
  // Server 側ガード: Client の 3.7MB 制約は ad-hoc 呼び出しでは無効。
  try {
    assertResumeUpload(fileBase64, fileMime);
    assertTextWithinLimit(fallbackText, MAX_TEXT_BYTES, "貼付テキスト");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const { provider, model } = resolveLlm("summary", override);
  if (!hasKey(provider)) return noKeyError(provider);

  // ファイルが指定されていればローカル抽出してテキスト化
  let resumeText = fallbackText.trim();
  let kindNote = "";
  if (fileBase64 && fileName) {
    try {
      const extracted = await extractResumeText(
        fileBase64,
        fileMime ?? "",
        fileName,
      );
      if (!extracted.text) {
        return {
          ok: false,
          error: `${kindLabel(extracted.kind)} からテキストを抽出できませんでした（スキャン画像のみの PDF 等の可能性）。OCR が必要な場合は貼付モードを使ってください。`,
        };
      }
      resumeText = extracted.text;
      kindNote = `[ファイル: ${extracted.fileName} / 形式: ${kindLabel(extracted.kind)}` +
        (extracted.pageCount ? ` / ${extracted.pageCount}ページ` : "") +
        (extracted.sheetCount ? ` / ${extracted.sheetCount}シート` : "") +
        "]\n\n";
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (!resumeText) {
    return {
      ok: false,
      error: "履歴書ファイル または貼付テキストのどちらかを指定してください。",
    };
  }

  try {
    const userPrompt = SUMMARY_TEXT_INSTRUCTION + kindNote + resumeText;
    let raw = await callLlm({
      provider,
      model,
      system: SUMMARY_SYSTEM,
      user: userPrompt,
      jsonMode: true,
    });
    raw = raw.trim();
    if (!raw) {
      return { ok: false, error: "AI から空の応答が返りました。" };
    }
    writeAudit("session.candidateSummarize", {
      sessionId: id,
      meta: {
        provider,
        model,
        inputChars: SUMMARY_SYSTEM.length + userPrompt.length,
        outputChars: raw.length,
      },
    });
    const parts = parseSummaryJson(raw);
    // 構造化 3 フィールドは保存しない方針：JSON が取れたら見出し付きで 要約 に統合、
    // 取れなければ生テキストをそのまま 要約 に。Excel 出力時に見出しでパースする。
    const data: Candidate = parts
      ? {
          mode: "api",
          要約: composeCombinedSummary(parts),
          updatedAt: nowIso(),
          provider,
        }
      : {
          mode: "api",
          要約: raw,
          updatedAt: nowIso(),
          provider,
        };
    saveCandidate(id, data);
    bumpSession(id);
    return {
      ok: true,
      summary: data.要約,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ─────────── ④ 求める人材条件 ─────────── */

export async function freezeConditionsAction(
  id: string,
  role: Role,
): Promise<void> {
  const evalCriteria = getEvalCriteria();
  if (!evalCriteria) {
    throw new Error("評価条件マスタ（eval_criteria.json）が見つかりません");
  }
  const snapshot: ConditionsSnapshot = {
    role,
    eval: resolveEvalForRole(evalCriteria, role.id),
    frozenAt: nowIso(),
  };
  saveConditionsSnapshot(id, snapshot);
  writeAudit("session.freezeConditions", {
    sessionId: id,
    meta: { roleId: role.id, frozenAt: snapshot.frozenAt },
  });
  bumpSession(id);
}

export async function reloadRoleFromMasterAction(
  roleId: string,
): Promise<Role | null> {
  return getRole(roleId);
}

/* ─────────── ⑤ 質問リスト ─────────── */

export async function saveQuestionsAction(
  id: string,
  mode: Mode,
  rawText: string,
): Promise<void> {
  assertTextWithinLimit(rawText, MAX_TEXT_BYTES, "質問テキスト");
  // 設計書 §5 ⑤: 構造化パーサーで items も自動生成して保存
  const { nonTech, tech } = parseQuestions(rawText);
  const items = flattenToItems(nonTech, tech).map((q) => ({
    star: q.star,
    question: q.question,
    aim: q.aim,
    example: q.example,
  }));
  const data: Questions = {
    mode,
    rawText,
    items,
    updatedAt: nowIso(),
  };
  saveQuestions(id, data);
  // 設計書 §9：⑤を公開（質問テキストが空でないとき）で 編集中 → 質問公開 へ
  if (rawText.trim().length > 0) {
    advanceStatus(id, "質問公開");
  }
  bumpSession(id);
}

/**
 * 質問生成 system prompt を問数から組み立てる。
 * - 非技術 N問・技術 M問の数値が prompt と maxTokens の両方を駆動する
 */
function buildQuestionsSystemPrompt(nontech: number, tech: number): string {
  return (
    "あなたは面接設計の専門家です。候補者の経歴要約と求める人材条件を入力として、面談で使う質問を2セクションに分けて作ってください。\n\n" +
    `【非技術】候補者によらず採用面談で共通して聞きたい質問を **${nontech}問**（自己紹介・キャリア・強み弱み・努力したこと・対人・趣味/ストレス対処・志望動機 等）。\n` +
    `【技術】候補者の経歴・求める人材条件に紐づく専門質問を **${tech}問**（STAR法・コンピテンシー・キラー質問の観点で深掘り）。\n\n` +
    "各質問には『狙い』（評価したい軸）と『簡単な解答例』を必ず添えてください。最重要の必須質問には『⭐』を先頭に付けてください。\n" +
    "前置き・コードフェンス・後書きは不要。下記フォーマットを厳守してください。\n\n" +
    "出力フォーマット:\n" +
    "## 非技術\n" +
    "⭐ Q1. 質問文\n" +
    "  狙い: 評価したい軸\n" +
    "  解答例: 想定される良い回答の要点\n\n" +
    "Q2. 質問文\n" +
    "  狙い: ...\n" +
    "  解答例: ...\n" +
    `（…全${nontech}問）\n\n` +
    "## 技術\n" +
    "⭐ T1. 質問文\n" +
    "  狙い: ...\n" +
    "  解答例: ...\n" +
    `（…全${tech}問）\n`
  );
}

/**
 * 問数から maxTokens を算出。
 * 1問あたり日本語で 質問文+狙い+解答例 ≈ 200〜400 tokens。
 * 安全係数で 1問=500 tokens、+ ヘッダ・前置きで 1000 tokens の buffer。
 *   maxTokens = (nontech + tech) × 500 + 1000
 * 例: 7+8=15 → 8500 / 10+10=20 → 11000 / 15+15=30 → 16000
 */
function estimateQuestionsMaxTokens(nontech: number, tech: number): number {
  return (nontech + tech) * 500 + 1000;
}

export async function generateQuestionsApiAction(
  id: string,
  override?: LlmOverride,
): Promise<{ ok: boolean; error?: string; text?: string }> {
  const { provider, model } = resolveLlm("questions", override);
  if (!hasKey(provider)) return noKeyError(provider);

  const snapshot = getConditionsSnapshot(id);
  if (!snapshot) {
    return {
      ok: false,
      error:
        "② 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }

  const candidate = getCandidate(id);
  if (!candidate || !candidate.要約.trim()) {
    return {
      ok: false,
      error:
        "① 面談者情報が空です。候補者の要約を入力（または API要約）して保存してから生成してください。",
    };
  }

  const { nontech, tech } = loadSettings().questionCounts;
  const systemPrompt = buildQuestionsSystemPrompt(nontech, tech);
  const user =
    "# 候補者情報（②要約）\n" +
    candidate.要約 +
    "\n\n# 求める人材条件（④凍結）\n" +
    JSON.stringify(snapshot.role, null, 2);

  let responseText: string;
  try {
    responseText = await callLlm({
      provider,
      model,
      system: systemPrompt,
      user,
      // 問数から動的算出。設定が変わると上限も自動追従
      maxTokens: estimateQuestionsMaxTokens(nontech, tech),
      cacheSystem: true,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const text = responseText.trim();
  writeAudit("session.questionsGenerate", {
    sessionId: id,
    meta: {
      provider,
      model,
      questionCounts: { nontech, tech },
      inputChars: systemPrompt.length + user.length,
      outputChars: text.length,
    },
  });
  const existing = getQuestions(id);
  const data: Questions = {
    mode: "api",
    rawText: text,
    items: existing?.items ?? [],
    updatedAt: nowIso(),
  };
  saveQuestions(id, data);
  if (text.length > 0) {
    advanceStatus(id, "質問公開");
  }
  bumpSession(id);

  return { ok: true, text };
}

const REFORMAT_SYSTEM_PROMPT =
  "面談質問テキストを構造化するアシスタント";

const REFORMAT_USER_PREFIX =
  "以下の質問テキストを、指定フォーマットに整形してください。質問本文の意味は変えず、足りない『狙い』『解答例』を推測で補ってください（推測は『要確認』と明記）。\n\n# 出力フォーマット\n⭐ Q1. 質問文\n  狙い: 評価したい軸\n  解答例: 想定される良い回答の要点\n\nQ2. 質問文\n  狙い: ...\n  解答例: ...\n\n--- 整形元テキストここから ---\n";

/**
 * 既存の ⑤ 質問テキストを Haiku 4.5 で構造化フォーマットに整形して上書き。
 * mode は元の Questions.mode を維持（paste で読み込んだものは paste のまま）。
 */
export async function reformatQuestionsApiAction(
  id: string,
  override?: LlmOverride,
): Promise<{ ok: boolean; error?: string; text?: string }> {
  const { provider, model } = resolveLlm("summary", override);
  if (!hasKey(provider)) return noKeyError(provider);

  const existing = getQuestions(id);
  if (!existing || !existing.rawText.trim()) {
    return {
      ok: false,
      error: "③ 質問テキストが空です。整形するには先に質問を保存してください。",
    };
  }

  let responseText: string;
  try {
    responseText = await callLlm({
      provider,
      model,
      system: REFORMAT_SYSTEM_PROMPT,
      user: REFORMAT_USER_PREFIX + existing.rawText,
      // 質問本文の整形なので、元の長さと同等以上を返せるよう余裕を持たせる
      maxTokens: 8000,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const text = responseText.trim();
  if (!text) {
    return { ok: false, error: "AI から空の応答が返りました。" };
  }

  const data: Questions = {
    mode: existing.mode,
    rawText: text,
    items: existing.items,
    updatedAt: nowIso(),
  };
  saveQuestions(id, data);
  writeAudit("session.questionsReformat", {
    sessionId: id,
    meta: {
      provider,
      model,
      originalMode: existing.mode,
      inputChars:
        REFORMAT_SYSTEM_PROMPT.length +
        (REFORMAT_USER_PREFIX + existing.rawText).length,
      outputChars: text.length,
    },
  });
  bumpSession(id);

  return { ok: true, text };
}

/* ─────────── ⑥ 議事録 ─────────── */

export async function saveMinutesAction(
  id: string,
  text: string,
): Promise<void> {
  assertTextWithinLimit(text, MAX_MINUTES_BYTES, "議事録");
  const data: Minutes = { text, updatedAt: nowIso() };
  saveMinutes(id, data);
  // 設計書 §9：⑥議事録を登録（テキストが空でないとき）で 質問公開 → 面談済 へ
  if (text.trim().length > 0) {
    advanceStatus(id, "面談済");
  }
  bumpSession(id);
}

const MINUTES_SUMMARIZE_SYSTEM =
  "面談議事録を採点用に圧縮するアシスタント";

const MINUTES_SUMMARIZE_INSTRUCTION =
  "以下の議事録を、評価につながる発言だけを残して 1500 字以内に要約してください。" +
  "発言者・時系列は維持。誇張・推測なし、原文に無い情報は『要確認』と書く。\n\n" +
  "--- 議事録ここから ---\n";

/**
 * ⑥ 議事録の任意 API 要約（設計書 §5 ⑥：既定 OFF）。
 * 既存本文を要約結果で上書きし、summarized=true フラグを立てる。
 * 元の本文は履歴として残さない（PII の二重保有を避ける方針）。
 */
export async function summarizeMinutesApiAction(
  id: string,
  override?: LlmOverride,
): Promise<{ ok: boolean; error?: string; text?: string }> {
  const { provider, model } = resolveLlm("summary", override);
  if (!hasKey(provider)) return noKeyError(provider);

  const minutes = getMinutes(id);
  if (!minutes || !minutes.text.trim()) {
    return {
      ok: false,
      error:
        "④ 議事録が空です。要約する前に議事録を貼り付けて保存してください。",
    };
  }

  let summary: string;
  try {
    summary = await callLlm({
      provider,
      model,
      system: MINUTES_SUMMARIZE_SYSTEM,
      user: MINUTES_SUMMARIZE_INSTRUCTION + minutes.text,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  summary = summary.trim();
  if (!summary) {
    return { ok: false, error: "AI から空の応答が返りました。" };
  }

  const data: Minutes = {
    text: summary,
    updatedAt: nowIso(),
    summarized: true,
  };
  saveMinutes(id, data);
  writeAudit("session.minutesSummarize", {
    sessionId: id,
    meta: {
      provider,
      model,
      inputChars:
        MINUTES_SUMMARIZE_SYSTEM.length +
        (MINUTES_SUMMARIZE_INSTRUCTION + minutes.text).length,
      outputChars: summary.length,
      // 互換用: 旧キーも維持（既存ログ集計が壊れないように）
      originalChars: minutes.text.length,
      summaryChars: summary.length,
    },
  });
  bumpSession(id);
  return { ok: true, text: summary };
}

/* ─────────── ⑧ 評価結果 ─────────── */

interface EvaluationParseResult {
  ok: boolean;
  error?: string;
  data?: Evaluation;
}

/**
 * Max チャットは ```json ... ``` で囲んで返してくることがあるので、
 * 先頭末尾のコードフェンスと前後の説明文を剥がしてから JSON.parse する。
 */
function stripCodeFenceAndPreamble(raw: string): string {
  let t = raw.trim();
  // ```json ... ``` で囲まれていれば中身を取る（json は任意）
  const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence) t = fence[1].trim();
  // 前後に説明文が混ざっていたら { ... } の範囲だけ取る
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

/**
 * AI が返す 合否 文字列を正規化する。
 * 「合格（条件付き）」「不合格・見送り」など装飾が付いていても
 * 3値（合格 / 普通 / 不合格）に丸めて受け入れる。
 * 判定順は「不合格」を先に見る（"合格" を部分文字列として含むため）。
 */
function normalizeVerdict(raw: unknown): "合格" | "普通" | "不合格" | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("不合格")) return "不合格";
  if (s.includes("合格")) return "合格";
  if (s.includes("普通")) return "普通";
  return null;
}

function parseEvaluationJson(rawText: string, mode: Mode): EvaluationParseResult {
  const cleaned = stripCodeFenceAndPreamble(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `JSON として解釈できません: ${(e as Error).message}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "JSON はオブジェクトである必要があります" };
  }
  const p = parsed as Record<string, unknown>;

  const 軸評価Raw = p["軸評価"];
  if (!Array.isArray(軸評価Raw)) {
    return { ok: false, error: "「軸評価」が配列ではありません" };
  }
  const 軸評価: AxisEvaluation[] = [];
  for (let i = 0; i < 軸評価Raw.length; i++) {
    const a = 軸評価Raw[i];
    if (typeof a !== "object" || a === null) {
      return { ok: false, error: `軸評価[${i}] がオブジェクトではありません` };
    }
    const ax = a as Record<string, unknown>;
    if (typeof ax["軸"] !== "string") {
      return { ok: false, error: `軸評価[${i}].軸 が文字列ではありません` };
    }
    if (typeof ax["スコア"] !== "number") {
      return { ok: false, error: `軸評価[${i}].スコア が数値ではありません` };
    }
    軸評価.push({
      軸: ax["軸"] as string,
      スコア: ax["スコア"] as number,
      根拠: typeof ax["根拠"] === "string" ? (ax["根拠"] as string) : "",
    });
  }

  if (typeof p["自己解決レベル"] !== "number") {
    return { ok: false, error: "「自己解決レベル」が数値ではありません" };
  }
  if (typeof p["総合スコア"] !== "number") {
    return { ok: false, error: "「総合スコア」が数値ではありません" };
  }
  const 合否 = normalizeVerdict(p["合否"]);
  if (!合否) {
    return {
      ok: false,
      error: "「合否」は \"合格\" / \"普通\" / \"不合格\" のいずれかにしてください",
    };
  }

  const data: Evaluation = {
    mode,
    軸評価,
    自己解決レベル: p["自己解決レベル"] as number,
    総合スコア: p["総合スコア"] as number,
    合否,
    良い点: typeof p["良い点"] === "string" ? (p["良い点"] as string) : "",
    懸念点: typeof p["懸念点"] === "string" ? (p["懸念点"] as string) : "",
    updatedAt: nowIso(),
  };
  return { ok: true, data };
}

export async function saveEvaluationFromJsonAction(
  id: string,
  mode: Mode,
  rawText: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = parseEvaluationJson(rawText, mode);
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? "不明なエラー" };
  }
  saveEvaluation(id, result.data);
  markEvaluated(id);
  writeAudit("session.saveEvaluation", {
    sessionId: id,
    meta: {
      mode,
      合否: result.data.合否,
      総合スコア: result.data.総合スコア,
    },
  });
  bumpSession(id);
  return { ok: true };
}

export async function hasApiKeyAction(): Promise<boolean> {
  return hasAnyKey();
}

/* ─────────── Max チャット用プロンプト生成（API なし運用支援） ─────────── */

type PromptResult = { ok: true; prompt: string } | { ok: false; error: string };

/** ② 履歴書要約プロンプト — 履歴書テキストは Max 側で貼り直す前提（PII を Server に置かない） */
export async function buildSummaryPromptAction(_id: string): Promise<PromptResult> {
  void _id;
  const prompt =
    "あなたは採用担当者のアシスタントです。以下に貼り付ける履歴書（PDF または本文テキスト）を、採用面談用に簡潔に要約してください。前置きなし、800字以内、箇条書きベース。\n\n" +
    "# 出力フォーマット\n" +
    "- 経歴サマリ（職種・年数・主要案件）\n" +
    "- 保有スキル（技術・資格）\n" +
    "- 強み（具体例つきで2〜3点）\n" +
    "- 懸念（事実ベースで。憶測は「要確認」と明記）\n\n" +
    "後でツールに貼り戻すので、推測を断定で書かないこと。情報が無い項目は『―』。\n\n" +
    "--- 履歴書ここから ---\n" +
    "（ここに履歴書PDFを添付 or テキスト貼付）";
  return { ok: true, prompt };
}

/** ⑤ 質問生成プロンプト — Max チャットに丸ごと貼れる1メッセージ */
export async function buildQuestionsPromptAction(id: string): Promise<PromptResult> {
  const snapshot = getConditionsSnapshot(id);
  if (!snapshot) {
    return {
      ok: false,
      error: "② 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }
  const candidate = getCandidate(id);
  if (!candidate || !candidate.要約.trim()) {
    return {
      ok: false,
      error: "① 面談者情報が空です。候補者の要約を保存してからコピーしてください。",
    };
  }
  const { nontech, tech } = loadSettings().questionCounts;
  const prompt =
    buildQuestionsSystemPrompt(nontech, tech) +
    "\n\n---\n\n" +
    "# 候補者情報（②要約）\n" +
    candidate.要約 +
    "\n\n# 求める人材条件（④凍結）\n" +
    JSON.stringify(snapshot.role, null, 2) +
    "\n\n上記をもとに指定フォーマットで質問を生成してください。コードフェンスや前置きは付けず、本文のみ返してください。";
  return { ok: true, prompt };
}

/** ⑧ 評価プロンプト — Max チャットに丸ごと貼れる1メッセージ。JSON のみ返すよう明示 */
export async function buildEvaluationPromptAction(id: string): Promise<PromptResult> {
  const snapshot = getConditionsSnapshot(id);
  if (!snapshot) {
    return { ok: false, error: "② 求める人材条件が未凍結です。" };
  }
  const minutes = getMinutes(id);
  if (!minutes || !minutes.text.trim()) {
    return {
      ok: false,
      error: "④ 議事録が空です。議事録を貼り付けて保存してからコピーしてください。",
    };
  }
  const prompt =
    EVAL_SYSTEM_PROMPT +
    "\n\n---\n\n" +
    "# 評価条件\n" +
    JSON.stringify(snapshot, null, 2) +
    "\n\n# 面談議事録\n" +
    minutes.text +
    "\n\n# 出力スキーマ（このキー構造で返す）\n" +
    EVAL_OUTPUT_SCHEMA;
  return { ok: true, prompt };
}

// 設計書 v1.0 の文言。短く、JSON のみ返させる最小ルールに揃える。
const EVAL_SYSTEM_PROMPT =
  "あなたは採用評価の専門家です。BARS（行動基準評価）で厳正に採点し、説明文や前置きなしに、指定スキーマのJSONのみを出力してください。\n" +
  "重要ルール:\n" +
  "- 「合否」は必ず \"合格\" / \"普通\" / \"不合格\" のいずれか1つの完全一致文字列で返すこと。\n" +
  "  （\"合格（条件付き）\" のような修飾は禁止。条件やニュアンスは「良い点」「懸念点」に書く）\n" +
  "- スコアは数値のみ（文字列不可）。小数第1位まで。\n" +
  "- コードフェンスは付けない。";

const EVAL_OUTPUT_SCHEMA =
  '{"軸評価":[{"軸":"","スコア":0,"根拠":""}],"自己解決レベル":0,"総合スコア":0,"合否":"合格|普通|不合格 のいずれか1つ","良い点":"","懸念点":""}';

export async function evaluateInterviewApiAction(
  id: string,
  strict: boolean,
  override?: LlmOverride,
): Promise<{ ok: boolean; error?: string; data?: Evaluation }> {
  const stage: LlmStage = strict ? "evaluationStrict" : "evaluation";
  const { provider, model } = resolveLlm(stage, override);
  if (!hasKey(provider)) return noKeyError(provider);

  const snapshot = getConditionsSnapshot(id);
  if (!snapshot) {
    return {
      ok: false,
      error:
        "② 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }

  const minutes = getMinutes(id);
  if (!minutes || !minutes.text.trim()) {
    return {
      ok: false,
      error: "④ 議事録が空です。議事録を貼り付けて保存してから評価してください。",
    };
  }

  const user =
    "# 評価条件\n" +
    JSON.stringify(snapshot, null, 2) +
    "\n\n# 面談議事録\n" +
    minutes.text +
    "\n\n# 出力スキーマ（このキー構造で返す）\n" +
    EVAL_OUTPUT_SCHEMA;

  let responseText: string;
  try {
    responseText = await callLlm({
      provider,
      model,
      system: EVAL_SYSTEM_PROMPT,
      user,
      // 4軸 × 根拠 + 良い点 + 懸念点 を JSON で日本語生成するため余裕を持たせる
      maxTokens: 4000,
      cacheSystem: true,
      jsonMode: true,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  let extracted: string;
  try {
    const obj = parseJsonResponse<Record<string, unknown>>(responseText);
    extracted = JSON.stringify(obj);
  } catch (e) {
    return {
      ok: false,
      error: `API のレスポンスを JSON として解釈できません: ${(e as Error).message}`,
    };
  }

  const result = parseEvaluationJson(extracted, "api");
  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? "API レスポンスのスキーマが不正です",
    };
  }
  const evalData: Evaluation = { ...result.data, provider };
  saveEvaluation(id, evalData);
  markEvaluated(id);
  writeAudit("session.saveEvaluation", {
    sessionId: id,
    meta: {
      mode: "api",
      strict,
      provider,
      model,
      合否: evalData.合否,
      総合スコア: evalData.総合スコア,
      inputChars: EVAL_SYSTEM_PROMPT.length + user.length,
      outputChars: responseText.length,
    },
  });
  bumpSession(id);
  return { ok: true, data: evalData };
}
