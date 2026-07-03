/**
 * 入力値のバリデーション（Client / Server 両方で共有）。
 *
 * 設計書の前提：
 *   - 氏名はフォルダ名と一覧表示に使われる（§5 ①）
 *   - セッション ID は `YYYYMMDD_HHMMSS_<氏名>_<役割>` で構成される（§7、秒粒度は ID 衝突回避）
 * よってフォルダ名（FS）として安全な文字種・長さに収める必要がある。
 *
 * ⚠ Role.id は path traversal 防御のため ASCII 限定（lib/storage.ts:ROLE_ID_SAFE と
 * 同一パターン）に揃える。以前は import 経路だけ日本語 ID を受け入れていたが、
 * その役割は次回 get / save 時に storage.ts:assertRoleId で throw する不整合を生む。
 */

import type { EvalAxis, EvalCriteria, Role, RoleEvalOverride } from "./types";

export const NAME_MIN_LEN = 1;
export const NAME_MAX_LEN = 60;
export const ROLE_NAME_MAX_LEN = 60;
export const ROLE_ID_MAX_LEN = 30;

/* ───────────── Server Action 入力サイズ上限 ─────────────
 * Server Action は UI を経由せず直接呼ばれうるため、Client 側ガードだけでは
 * 巨大ペイロード送信 / OOM / ディスク満杯攻撃を防げない。各 action の冒頭で
 * これらの定数で弾く。利用者が常識的な範囲で使えば触れないラインに設定する。
 * （NextConfig.serverActions.bodySizeLimit "5mb" がさらに上の境界として効く）
 */

/** ②候補者要約・⑤質問・汎用テキスト系の最大バイト数（UTF-16 単位ではなくバイト数で評価） */
export const MAX_TEXT_BYTES = 1_000_000; // 約 100 万バイト ≒ 33 万字程度
/** ⑥議事録は本文量が多いので別枠（最終的に Server Action 5MB の中に収まればよい） */
export const MAX_MINUTES_BYTES = 2_000_000;
/** ②履歴書アップロードの base64 文字列長（≒ 元バイナリ × 4/3 + 改行）。5MB ≒ 7MB base64 */
export const MAX_RESUME_BASE64_LEN = 7_500_000;
/** 履歴書アップロードで許可する MIME（detectResumeKind と整合） */
export const ALLOWED_RESUME_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** UTF-8 換算のバイト数で上限チェック。超えていれば Error を throw する。 */
export function assertTextWithinLimit(
  text: string,
  max: number,
  fieldName: string,
): void {
  // TextEncoder.encode は UTF-8 バイト数を返す。length（UTF-16 code units）より厳密。
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > max) {
    throw new Error(
      `${fieldName} が大きすぎます（${bytes.toLocaleString()} バイト > 上限 ${max.toLocaleString()} バイト）`,
    );
  }
}

/** 履歴書アップロードのサイズ・MIME 検証（一致しなければ Error） */
export function assertResumeUpload(
  base64: string | null,
  mime: string | null,
): void {
  if (!base64) return;
  if (base64.length > MAX_RESUME_BASE64_LEN) {
    throw new Error(
      `履歴書ファイルが大きすぎます（base64 ${base64.length.toLocaleString()} 文字 > 上限 ${MAX_RESUME_BASE64_LEN.toLocaleString()}）`,
    );
  }
  // MIME 未指定なら拡張子で判定する経路があるためここでは弾かない
  if (mime && !ALLOWED_RESUME_MIMES.includes(mime as (typeof ALLOWED_RESUME_MIMES)[number])) {
    throw new Error(
      `対応していない MIME タイプです: ${mime}（PDF / Word / Excel のみ）`,
    );
  }
}

/** Windows + macOS + Linux すべてで FS パスに使えない記号 + 制御文字 */
const FS_FORBIDDEN = /[\\/:*?"<>|\x00-\x1f\x7f]/;
/** 改行（textarea 経由でも混入しない） */
const HAS_NEWLINE = /[\r\n]/;
/** Windows: フォルダ名末尾の "." と 半角スペース禁止 */
const TRAILING_BAD = /[. ]$/;
/** マスタ ID として安全（半角英数字・ハイフン・アンダースコア）。
 * lib/storage.ts:ROLE_ID_SAFE と一致させること。 */
const ROLE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type Validated<T = string> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** 候補者氏名（セッション作成時） */
export function validateName(input: string): Validated {
  const trimmed = input.trim();
  if (trimmed.length < NAME_MIN_LEN) {
    return { ok: false, error: "氏名は必須です" };
  }
  if (trimmed.length > NAME_MAX_LEN) {
    return { ok: false, error: `氏名は ${NAME_MAX_LEN} 文字以内にしてください` };
  }
  if (HAS_NEWLINE.test(trimmed)) {
    return { ok: false, error: "氏名に改行は使えません" };
  }
  if (FS_FORBIDDEN.test(trimmed)) {
    return {
      ok: false,
      error: '氏名に次の記号は使えません: / \\ : * ? " < > |',
    };
  }
  if (TRAILING_BAD.test(trimmed)) {
    return {
      ok: false,
      error: "氏名の末尾に「.」や半角スペースは使えません",
    };
  }
  return { ok: true, value: trimmed };
}

/** セッション作成時の役割（マスタに存在する ID を要求） */
export function validateRoleIdRef(
  input: string,
  validIds: readonly string[],
): Validated {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "役割は必須です" };
  if (!validIds.includes(trimmed)) {
    return {
      ok: false,
      error: `役割「${trimmed}」はマスタに存在しません`,
    };
  }
  return { ok: true, value: trimmed };
}

/** マスタの役割 ID（新規登録時の文字種チェック） */
export function validateRoleMasterId(input: string): Validated {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "ID は必須です（例: NW, Server）" };
  if (trimmed.length > ROLE_ID_MAX_LEN) {
    return {
      ok: false,
      error: `ID は ${ROLE_ID_MAX_LEN} 文字以内にしてください`,
    };
  }
  if (!ROLE_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "ID は半角英数字・ハイフン・アンダースコアのみ使えます",
    };
  }
  return { ok: true, value: trimmed };
}

/** マスタの役割名 */
export function validateRoleName(input: string): Validated {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "役割名は必須です" };
  if (trimmed.length > ROLE_NAME_MAX_LEN) {
    return {
      ok: false,
      error: `役割名は ${ROLE_NAME_MAX_LEN} 文字以内にしてください`,
    };
  }
  if (HAS_NEWLINE.test(trimmed)) {
    return { ok: false, error: "役割名に改行は使えません" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Role オブジェクト全体の構造検証。Route Handler / Import / Storage 全部で共有。
 * 以前は 4 箇所に同等の実装が散らばっていて、ID パターンが ASCII と
 * 「ASCII + ひらがな + カタカナ + 漢字」の 2 系統に分岐していた。これを統一する。
 *
 * @param input ラベル付きエラーのプレフィックス（例: "roles[3]"）。省略可。
 */
export function validateRoleObject(
  body: unknown,
  label?: string,
): Validated<Role> {
  const prefix = label ? `${label}.` : "";
  if (!body || typeof body !== "object") {
    return { ok: false, error: `${label ?? "body"} はオブジェクトで指定してください` };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.id !== "string") {
    return { ok: false, error: `${prefix}id は必須です` };
  }
  const idResult = validateRoleMasterId(b.id);
  if (!idResult.ok) {
    return { ok: false, error: `${prefix}id: ${idResult.error}` };
  }

  if (typeof b.役割 !== "string") {
    return { ok: false, error: `${prefix}役割は必須です` };
  }
  const nameResult = validateRoleName(b.役割);
  if (!nameResult.ok) {
    return { ok: false, error: `${prefix}役割: ${nameResult.error}` };
  }

  if (typeof b.経験 !== "string") {
    return { ok: false, error: `${prefix}経験は文字列で指定してください` };
  }
  if (typeof b.未経験可 !== "boolean") {
    return { ok: false, error: `${prefix}未経験可は真偽値で指定してください` };
  }
  if (
    !Array.isArray(b.条件1_基本人物像) ||
    !b.条件1_基本人物像.every((x) => typeof x === "string")
  ) {
    return {
      ok: false,
      error: `${prefix}条件1_基本人物像 は文字列配列で指定してください`,
    };
  }
  if (
    !Array.isArray(b.条件2_未経験者必須) ||
    !b.条件2_未経験者必須.every((x) => typeof x === "string")
  ) {
    return {
      ok: false,
      error: `${prefix}条件2_未経験者必須 は文字列配列で指定してください`,
    };
  }
  return {
    ok: true,
    value: {
      id: idResult.value,
      役割: nameResult.value,
      経験: b.経験.trim(),
      未経験可: b.未経験可,
      条件1_基本人物像: b.条件1_基本人物像 as string[],
      条件2_未経験者必須: b.条件2_未経験者必須 as string[],
    },
  };
}

/* ───────────── EvalCriteria ───────────── */

function validateAxes(raw: unknown): Validated<EvalAxis[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "評価軸 は配列で指定してください" };
  }
  if (raw.length === 0) {
    return { ok: false, error: "評価軸 は1つ以上必要です" };
  }
  const out: EvalAxis[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    // 旧形式（文字列）も受け付ける
    if (typeof a === "string") {
      const 名前 = a.trim();
      if (!名前) return { ok: false, error: `評価軸[${i}].名前 が空です` };
      if (seen.has(名前)) {
        return { ok: false, error: `評価軸「${名前}」が重複しています` };
      }
      seen.add(名前);
      out.push({ 名前, 重み: 1 });
      continue;
    }
    if (!a || typeof a !== "object") {
      return {
        ok: false,
        error: `評価軸[${i}] はオブジェクトで指定してください`,
      };
    }
    const o = a as Record<string, unknown>;
    if (typeof o.名前 !== "string" || !o.名前.trim()) {
      return { ok: false, error: `評価軸[${i}].名前 は必須です` };
    }
    if (
      typeof o.重み !== "number" ||
      !Number.isFinite(o.重み) ||
      o.重み <= 0
    ) {
      return {
        ok: false,
        error: `評価軸[${i}].重み は正の数値で指定してください`,
      };
    }
    const 名前 = o.名前.trim();
    if (seen.has(名前)) {
      return { ok: false, error: `評価軸「${名前}」が重複しています` };
    }
    seen.add(名前);
    out.push({ 名前, 重み: o.重み });
  }
  return { ok: true, value: out };
}

function validateRoleOverrides(
  raw: unknown,
  axisCount: number,
): Validated<Record<string, RoleEvalOverride> | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "ロール別 はオブジェクトで指定してください" };
  }
  const out: Record<string, RoleEvalOverride> = {};
  for (const [roleId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") {
      return {
        ok: false,
        error: `ロール別.${roleId} はオブジェクトで指定してください`,
      };
    }
    const ov = val as Record<string, unknown>;
    const entry: RoleEvalOverride = {};
    if (ov.重み !== undefined) {
      if (
        !Array.isArray(ov.重み) ||
        !ov.重み.every(
          (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
        )
      ) {
        return {
          ok: false,
          error: `ロール別.${roleId}.重み は正の数値配列で指定してください`,
        };
      }
      if (ov.重み.length > axisCount) {
        return {
          ok: false,
          error: `ロール別.${roleId}.重み の長さ(${ov.重み.length})が評価軸数(${axisCount})を超えています`,
        };
      }
      entry.重み = ov.重み as number[];
    }
    if (ov.合格ライン !== undefined) {
      if (typeof ov.合格ライン !== "number" || !Number.isFinite(ov.合格ライン)) {
        return {
          ok: false,
          error: `ロール別.${roleId}.合格ライン は数値で指定してください`,
        };
      }
      entry.合格ライン = ov.合格ライン;
    }
    if (ov.普通ライン !== undefined) {
      if (typeof ov.普通ライン !== "number" || !Number.isFinite(ov.普通ライン)) {
        return {
          ok: false,
          error: `ロール別.${roleId}.普通ライン は数値で指定してください`,
        };
      }
      entry.普通ライン = ov.普通ライン;
    }
    if (Object.keys(entry).length > 0) out[roleId] = entry;
  }
  return {
    ok: true,
    value: Object.keys(out).length > 0 ? out : undefined,
  };
}

export function validateEvalCriteriaObject(
  body: unknown,
): Validated<EvalCriteria> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "evalCriteria はオブジェクトで指定してください" };
  }
  const b = body as Record<string, unknown>;
  if (b.方式 !== "BARS") {
    return { ok: false, error: '方式 は "BARS" のみ対応しています' };
  }
  const axes = validateAxes(b.評価軸);
  if (!axes.ok) return axes;
  if (!b.スケール || typeof b.スケール !== "object") {
    return { ok: false, error: "スケール が不正です" };
  }
  const sc = b.スケール as Record<string, unknown>;
  if (typeof sc.最小 !== "number") {
    return { ok: false, error: "スケール.最小 は数値で指定してください" };
  }
  if (typeof sc.最大 !== "number") {
    return { ok: false, error: "スケール.最大 は数値で指定してください" };
  }
  if (typeof sc.刻み !== "number") {
    return { ok: false, error: "スケール.刻み は数値で指定してください" };
  }
  if (sc.最大 <= sc.最小) {
    return { ok: false, error: "スケール.最大 は最小より大きい必要があります" };
  }
  if (sc.刻み <= 0) {
    return { ok: false, error: "スケール.刻み は正の数で指定してください" };
  }
  if (typeof sc.段階数 !== "number") {
    return { ok: false, error: "スケール.段階数 は数値で指定してください" };
  }
  if (typeof b.合格ライン !== "number") {
    return { ok: false, error: "合格ライン は数値で指定してください" };
  }
  if (typeof b.普通ライン !== "number") {
    return { ok: false, error: "普通ライン は数値で指定してください" };
  }
  if (typeof b.自己解決レベル !== "string") {
    return { ok: false, error: "自己解決レベル は文字列で指定してください" };
  }
  if (!Array.isArray(b.出力) || !b.出力.every((x) => typeof x === "string")) {
    return { ok: false, error: "出力 は文字列配列で指定してください" };
  }
  const overrides = validateRoleOverrides(b.ロール別, axes.value.length);
  if (!overrides.ok) return overrides;
  return {
    ok: true,
    value: {
      方式: "BARS",
      評価軸: axes.value,
      スケール: {
        最小: sc.最小,
        最大: sc.最大,
        刻み: sc.刻み,
        段階数: sc.段階数,
      },
      合格ライン: b.合格ライン,
      普通ライン: b.普通ライン,
      自己解決レベル: b.自己解決レベル,
      出力: b.出力 as string[],
      ...(overrides.value ? { ロール別: overrides.value } : {}),
    },
  };
}
