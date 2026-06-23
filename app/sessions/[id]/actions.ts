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
  getConditionsSnapshot,
  getEvalCriteria,
  getMinutes,
  getQuestions,
  getRole,
  getSessionMeta,
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

export async function duplicateSessionAction(id: string): Promise<void> {
  const meta = duplicateSession(id);
  if (!meta) throw new Error("複製元のセッションが見つかりません");
  writeAudit("session.duplicate", {
    sessionId: meta.id,
    meta: { sourceId: id },
  });
  revalidatePath("/");
  // meta.id には日本語（氏名）が含まれるため、x-action-redirect ヘッダで Invalid character になるのを防ぐ
  redirect(`/sessions/${encodeURIComponent(meta.id)}`);
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

/* ─────────── ② 面談者情報 ─────────── */

export async function saveCandidateAction(
  id: string,
  mode: Mode,
  要約: string,
  structured?: { 経歴?: string; 主要スキル?: string; 強み?: string },
): Promise<void> {
  const data: Candidate = {
    mode,
    要約,
    updatedAt: nowIso(),
    ...(structured?.経歴 ? { 経歴: structured.経歴 } : {}),
    ...(structured?.主要スキル ? { 主要スキル: structured.主要スキル } : {}),
    ...(structured?.強み ? { 強み: structured.強み } : {}),
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
  経歴?: string;
  主要スキル?: string;
  強み?: string;
}> {
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
    let raw = await callLlm({
      provider,
      model,
      system: SUMMARY_SYSTEM,
      user: SUMMARY_TEXT_INSTRUCTION + kindNote + resumeText,
      jsonMode: true,
    });
    raw = raw.trim();
    if (!raw) {
      return { ok: false, error: "AI から空の応答が返りました。" };
    }
    const parts = parseSummaryJson(raw);
    let data: Candidate;
    if (parts) {
      // 構造化 JSON が取得できた → 3 フィールド + 統合要約を保存
      data = {
        mode: "api",
        要約: composeCombinedSummary(parts),
        updatedAt: nowIso(),
        provider,
        経歴: parts.経歴,
        主要スキル: parts.主要スキル,
        強み: parts.強み,
      };
    } else {
      // JSON 解析失敗 → 生テキストを 要約 にフォールバック保存
      data = {
        mode: "api",
        要約: raw,
        updatedAt: nowIso(),
        provider,
      };
    }
    saveCandidate(id, data);
    bumpSession(id);
    return {
      ok: true,
      summary: data.要約,
      経歴: data.経歴,
      主要スキル: data.主要スキル,
      強み: data.強み,
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

const QUESTIONS_SYSTEM_PROMPT =
  "あなたは面接設計の専門家です。候補者の経歴要約と求める人材条件を入力として、面談で使う質問を2セクションに分けて作ってください。\n\n" +
  "【非技術】候補者によらず採用面談で共通して聞きたい質問を **7問**（自己紹介・キャリア・強み弱み・努力したこと・対人・趣味/ストレス対処・志望動機 等）。\n" +
  "【技術】候補者の経歴・求める人材条件に紐づく専門質問を **6〜8問**（STAR法・コンピテンシー・キラー質問の観点で深掘り）。\n\n" +
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
  "（…全7問）\n\n" +
  "## 技術\n" +
  "⭐ T1. 質問文\n" +
  "  狙い: ...\n" +
  "  解答例: ...\n" +
  "（…6〜8問）\n";

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
        "④ 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }

  const candidate = getCandidate(id);
  if (!candidate || !candidate.要約.trim()) {
    return {
      ok: false,
      error:
        "② 面談者情報が空です。候補者の要約を入力（または API要約）して保存してから生成してください。",
    };
  }

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
      system: QUESTIONS_SYSTEM_PROMPT,
      user,
      maxTokens: 2000,
      cacheSystem: true,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const text = responseText.trim();
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
      error: "⑤ 質問テキストが空です。整形するには先に質問を保存してください。",
    };
  }

  let responseText: string;
  try {
    responseText = await callLlm({
      provider,
      model,
      system: REFORMAT_SYSTEM_PROMPT,
      user: REFORMAT_USER_PREFIX + existing.rawText,
      maxTokens: 2000,
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
    meta: { provider, model, originalMode: existing.mode },
  });
  bumpSession(id);

  return { ok: true, text };
}

/* ─────────── ⑥ 議事録 ─────────── */

export async function saveMinutesAction(
  id: string,
  text: string,
): Promise<void> {
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
        "⑥ 議事録が空です。要約する前に議事録を貼り付けて保存してください。",
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
  const 合否Raw = p["合否"];
  if (合否Raw !== "合格" && 合否Raw !== "普通" && 合否Raw !== "不合格") {
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
    合否: 合否Raw,
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
      error: "④ 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }
  const candidate = getCandidate(id);
  if (!candidate || !candidate.要約.trim()) {
    return {
      ok: false,
      error: "② 面談者情報が空です。候補者の要約を保存してからコピーしてください。",
    };
  }
  const prompt =
    QUESTIONS_SYSTEM_PROMPT +
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
    return { ok: false, error: "④ 求める人材条件が未凍結です。" };
  }
  const minutes = getMinutes(id);
  if (!minutes || !minutes.text.trim()) {
    return {
      ok: false,
      error: "⑥ 議事録が空です。議事録を貼り付けて保存してからコピーしてください。",
    };
  }
  const prompt =
    EVAL_SYSTEM_PROMPT +
    "\n\n---\n\n" +
    "# 評価条件（④凍結スナップショット）\n" +
    JSON.stringify(snapshot, null, 2) +
    "\n\n# 面談議事録（⑥）\n" +
    minutes.text +
    "\n\n# 出力スキーマ（このキー構造で返す。コードフェンスは付けず、JSON 1個のみ。プロパティの順序は問わない）\n" +
    EVAL_OUTPUT_SCHEMA;
  return { ok: true, prompt };
}

const EVAL_SYSTEM_PROMPT =
  "あなたは採用評価の専門家です。BARS（行動基準評価）で厳正に採点し、説明文や前置きなしに、指定スキーマの JSON のみを出力してください。" +
  "総合スコアは軸スコア × 軸重みの加重平均（重みが未指定なら単純平均）。" +
  "合否は提示された評価条件の「合格ライン」以上=合格、「普通ライン」以上=普通、未満=不合格（数値はユーザーメッセージの評価条件 JSON から読み取り、自分で仮定しないこと）。" +
  "軸ごとの『根拠』は必ず議事録の該当発言を短く引用すること（一般論で埋めない）。" +
  "議事録に明確な根拠が無い項目は推測で採点せず、その軸スコアは控えめに付け、『懸念点』に『要確認: <項目>（議事録未確認）』と明記すること。" +
  "『良い点』『懸念点』も議事録の事実に基づいて記述する。" +
  "『自己解決レベル』(0〜5) は、議事録上で候補者が問題に対し自ら仮説・解決策を提示できているか、他者依存度はどうかを見て採点する（5=完全に自己解決、0=全面的に他者依存）。";

const EVAL_OUTPUT_SCHEMA =
  '{"軸評価":[{"軸":"","スコア":0,"根拠":""}],"自己解決レベル":0,"総合スコア":0,"合否":"","良い点":"","懸念点":""}';

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
        "④ 求める人材条件が未凍結です。先に「この内容で凍結する」を押してください。",
    };
  }

  const minutes = getMinutes(id);
  if (!minutes || !minutes.text.trim()) {
    return {
      ok: false,
      error: "⑥ 議事録が空です。議事録を貼り付けて保存してから評価してください。",
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
      maxTokens: 2000,
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
    },
  });
  bumpSession(id);
  return { ok: true, data: evalData };
}
