/**
 * 入力値のバリデーション（Client / Server 両方で共有）。
 *
 * 前提：
 *   - 氏名はフォルダ名と一覧表示に使われる
 *   - セッション ID は `YYYYMMDD_HHMMSS_<氏名>_<役割>` で構成される（秒粒度は ID 衝突回避）
 * よってフォルダ名（FS）として安全な文字種・長さに収める必要がある。
 *
 * ⚠ Role.id は path traversal 防御のため ASCII 限定（lib/storage.ts:ROLE_ID_SAFE と
 * 同一パターン）に揃える。以前は import 経路だけ日本語 ID を受け入れていたが、
 * その役割は次回 get / save 時に storage.ts:assertRoleId で throw する不整合を生む。
 */

import { CATEGORY_KEYS, type CategoryKey, type EvalCategoryData, type EvalCriteria, type EvalSubAxis, type Role, type RoleEvalOverride } from "./types";

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
/** ⑥面談内容は本文量が多いので別枠（最終的に Server Action 5MB の中に収まればよい） */
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
  // v1.x 時代の旧フィールド名 `ロック` を「編集不可」として受け入れる（片方向）
  const editLocked =
    b.編集不可 !== undefined ? b.編集不可 : b.ロック;
  if (editLocked !== undefined && typeof editLocked !== "boolean") {
    return { ok: false, error: `${prefix}編集不可は真偽値で指定してください` };
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
      ...(editLocked === true ? { 編集不可: true } : {}),
    },
  };
}

/* ───────────── EvalCriteria ───────────── */

function validateSubAxes(raw: unknown, label: string): Validated<EvalSubAxis[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${label} は配列で指定してください` };
  }
  if (raw.length === 0) {
    return { ok: false, error: `${label} は 1 つ以上必要です` };
  }
  const out: EvalSubAxis[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a || typeof a !== "object") {
      return { ok: false, error: `${label}[${i}] はオブジェクトで指定してください` };
    }
    const o = a as Record<string, unknown>;
    if (typeof o.名前 !== "string" || !o.名前.trim()) {
      return { ok: false, error: `${label}[${i}].名前 は必須です` };
    }
    if (typeof o.重み !== "number" || !Number.isFinite(o.重み) || o.重み <= 0) {
      return { ok: false, error: `${label}[${i}].重み は正の数値で指定してください` };
    }
    const 名前 = o.名前.trim();
    if (seen.has(名前)) {
      return { ok: false, error: `${label} に「${名前}」が重複しています` };
    }
    seen.add(名前);
    out.push({ 名前, 重み: o.重み });
  }
  return { ok: true, value: out };
}

function validateCategory(raw: unknown, key: CategoryKey): Validated<EvalCategoryData> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `${key} はオブジェクトで指定してください` };
  }
  const o = raw as Record<string, unknown>;
  const sub = validateSubAxes(o.小軸, `${key}.小軸`);
  if (!sub.ok) return sub;
  return { ok: true, value: { 小軸: sub.value } };
}

function validateRoleOverrides(
  raw: unknown,
  validSubAxisNames: Set<string>,
): Validated<Record<string, RoleEvalOverride> | undefined> {
  if (raw == null) return { ok: true, value: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "ロール別 はオブジェクトで指定してください" };
  }
  const out: Record<string, RoleEvalOverride> = {};
  for (const [roleId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") {
      return { ok: false, error: `ロール別.${roleId} はオブジェクトで指定してください` };
    }
    const ov = val as Record<string, unknown>;
    const entry: RoleEvalOverride = {};
    if (ov.小軸重み !== undefined) {
      if (typeof ov.小軸重み !== "object" || Array.isArray(ov.小軸重み) || ov.小軸重み == null) {
        return { ok: false, error: `ロール別.${roleId}.小軸重み はオブジェクトで指定してください` };
      }
      const raw小軸重み = ov.小軸重み as Record<string, unknown>;
      const 小軸重み: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw小軸重み)) {
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
          return {
            ok: false,
            error: `ロール別.${roleId}.小軸重み.${k} は正の数値で指定してください`,
          };
        }
        // マスタに無い小軸名は無視（GC）。厳格に弾くと運用でロックしやすいので緩め。
        if (validSubAxisNames.has(k)) 小軸重み[k] = v;
      }
      if (Object.keys(小軸重み).length > 0) entry.小軸重み = 小軸重み;
    }
    if (ov.合格ライン !== undefined) {
      if (typeof ov.合格ライン !== "number" || !Number.isFinite(ov.合格ライン)) {
        return { ok: false, error: `ロール別.${roleId}.合格ライン は数値で指定してください` };
      }
      entry.合格ライン = ov.合格ライン;
    }
    if (ov.普通ライン !== undefined) {
      if (typeof ov.普通ライン !== "number" || !Number.isFinite(ov.普通ライン)) {
        return { ok: false, error: `ロール別.${roleId}.普通ライン は数値で指定してください` };
      }
      entry.普通ライン = ov.普通ライン;
    }
    if (Object.keys(entry).length > 0) out[roleId] = entry;
  }
  return { ok: true, value: Object.keys(out).length > 0 ? out : undefined };
}

export function validateEvalCriteriaObject(body: unknown): Validated<EvalCriteria> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "evalCriteria はオブジェクトで指定してください" };
  }
  const b = body as Record<string, unknown>;
  if (b.方式 !== "BARS") {
    return { ok: false, error: '方式 は "BARS" のみ対応しています' };
  }

  const cats: Record<CategoryKey, EvalCategoryData> = {} as Record<CategoryKey, EvalCategoryData>;
  for (const key of CATEGORY_KEYS) {
    const v = validateCategory(b[key], key);
    if (!v.ok) return v;
    cats[key] = v.value;
  }

  // 大分類間で小軸名の重複を禁止（LLM 出力パースを一意にするため）
  const names = new Set<string>();
  for (const key of CATEGORY_KEYS) {
    for (const s of cats[key].小軸) {
      if (names.has(s.名前)) {
        return { ok: false, error: `小軸「${s.名前}」が大分類間で重複しています` };
      }
      names.add(s.名前);
    }
  }

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

  const overrides = validateRoleOverrides(b.ロール別, names);
  if (!overrides.ok) return overrides;

  return {
    ok: true,
    value: {
      方式: "BARS",
      人間性: cats["人間性"],
      技術力: cats["技術力"],
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
