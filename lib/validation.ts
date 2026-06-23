/**
 * 入力値のバリデーション（Client / Server 両方で共有）。
 *
 * 設計書の前提：
 *   - 氏名はフォルダ名と一覧表示に使われる（§5 ①）
 *   - セッション ID は `YYYYMMDD_HHMM_<氏名>_<役割>` で構成される（§7）
 * よってフォルダ名（FS）として安全な文字種・長さに収める必要がある。
 */

export const NAME_MIN_LEN = 1;
export const NAME_MAX_LEN = 60;
export const ROLE_NAME_MAX_LEN = 60;
export const ROLE_ID_MAX_LEN = 30;

/** Windows + macOS + Linux すべてで FS パスに使えない記号 + 制御文字 */
const FS_FORBIDDEN = /[\\/:*?"<>|\x00-\x1f\x7f]/;
/** 改行（textarea 経由でも混入しない） */
const HAS_NEWLINE = /[\r\n]/;
/** Windows: フォルダ名末尾の "." と 半角スペース禁止 */
const TRAILING_BAD = /[. ]$/;
/** マスタ ID として安全（半角英数字・ハイフン・アンダースコア） */
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
