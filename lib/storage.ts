/**
 * 面談AI評価ツール — ストレージ層
 *
 * すべての fs アクセスはここを通す。設計書 §7 のフォルダ構成に従う。
 * - settings は <project>/config/settings.json に固定
 * - その他データは settings.dataRoot 配下（既定: <project>/data）
 *
 * 注意: サーバ側専用（route handler / Server Component から呼ぶ）。
 */

import "server-only";
import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import type {
  Candidate,
  ConditionsSnapshot,
  EvalAxis,
  EvalCriteria,
  Evaluation,
  Minutes,
  ProviderConfig,
  ProviderId,
  Questions,
  Role,
  SessionMeta,
  Settings,
} from "./types";
import {
  validateEvalCriteriaObject,
  validateRoleObject,
} from "./validation";

const PROJECT_ROOT = process.cwd();
const SETTINGS_PATH = path.join(PROJECT_ROOT, "config", "settings.json");

/* ───────────── settings ───────────── */

/** プロバイダごとの既定モデル（旧 DEFAULT_MODELS 由来 + 他プロバイダの妥当な初期値） */
const PROVIDER_DEFAULTS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    key: "",
    defaultModel: "claude-sonnet-4-6",
    models: {
      summary: "claude-haiku-4-5-20251001",
      questions: "claude-sonnet-4-6",
      evaluation: "claude-sonnet-4-6",
      evaluationStrict: "claude-opus-4-7",
    },
  },
  openai: {
    key: "",
    defaultModel: "gpt-4o",
    models: {
      summary: "gpt-4o-mini",
      questions: "gpt-4o",
      evaluation: "gpt-4o",
      evaluationStrict: "o1",
    },
  },
  google: {
    key: "",
    defaultModel: "gemini-2.0-pro",
    models: {
      summary: "gemini-2.0-flash",
      questions: "gemini-2.0-pro",
      evaluation: "gemini-2.0-pro",
      evaluationStrict: "gemini-2.0-pro",
    },
  },
};

/** 旧 settings.json（api.key 一本）を新形式に正規化する */
function migrateSettings(raw: unknown): Settings {
  const s = raw as Partial<Settings> & {
    api?: { key?: string; defaultModel?: string };
  };

  // providers が無い旧 v1.4 以前の場合：旧 api.key を anthropic にマージ
  const providers: Record<ProviderId, ProviderConfig> = {
    anthropic: { ...PROVIDER_DEFAULTS.anthropic, models: { ...PROVIDER_DEFAULTS.anthropic.models } },
    openai: { ...PROVIDER_DEFAULTS.openai, models: { ...PROVIDER_DEFAULTS.openai.models } },
    google: { ...PROVIDER_DEFAULTS.google, models: { ...PROVIDER_DEFAULTS.google.models } },
  };

  if (s.providers) {
    // 新形式：欠けている工程モデルがあれば PROVIDER_DEFAULTS で補完
    for (const id of ["anthropic", "openai", "google"] as ProviderId[]) {
      const stored = s.providers[id];
      if (stored) {
        providers[id] = {
          key: stored.key ?? "",
          defaultModel: stored.defaultModel || PROVIDER_DEFAULTS[id].defaultModel,
          models: { ...PROVIDER_DEFAULTS[id].models, ...(stored.models ?? {}) },
        };
      }
    }
  } else if (s.api) {
    // 旧形式：api.key と api.defaultModel を anthropic 側に流し込む
    providers.anthropic.key = s.api.key ?? "";
    if (s.api.defaultModel) providers.anthropic.defaultModel = s.api.defaultModel;
  }

  const questionCounts = {
    nontech: Math.max(
      1,
      Math.min(50, Math.floor(s.questionCounts?.nontech ?? 7)),
    ),
    tech: Math.max(
      1,
      Math.min(50, Math.floor(s.questionCounts?.tech ?? 8)),
    ),
  };

  return {
    dataRoot: s.dataRoot ?? "./data",
    defaultProvider: s.defaultProvider ?? "anthropic",
    providers,
    questionCounts,
    retention: {
      enabled: s.retention?.enabled ?? true,
      anchor: "closedAt",
      days: s.retention?.days ?? { 採用: 0, 不採用: 180, 未確定: 0 },
      softDeleteGraceDays: s.retention?.softDeleteGraceDays ?? 14,
      keepAnonymizedEval: s.retention?.keepAnonymizedEval ?? true,
      backupKeepDays: s.retention?.backupKeepDays,
      backupMaxGenerations: s.retention?.backupMaxGenerations,
    },
  };
}

/**
 * settings.json を読み込み、新形式に正規化して返す。
 * `react.cache` でリクエスト単位にメモ化されるため、同一リクエストで何度呼んでも
 * fs アクセスは1回。書き込み（saveSettings）と同一リクエスト内で再読しない前提。
 */
export const loadSettings = cache((): Settings => {
  const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
  // 旧バージョンで作成された settings.json は 0o600 が付いていない可能性がある。
  // API キーの機密性を守るため、読み込むたびに chmod で締め直す（Windows では noop）。
  try {
    fs.chmodSync(SETTINGS_PATH, 0o600);
  } catch {
    // Windows / 権限不足で失敗するのは想定内、握りつぶす。
  }
  return migrateSettings(JSON.parse(raw));
});

/**
 * dataRoot として受け入れられる値かを検証し、保存に使うべき文字列を返す。
 *
 * 防御の意図: settings 経路はユーザ入力をそのまま fs パスに採用するため、
 * 以下のような destructive な値を弾く必要がある:
 *   - システムディレクトリ（C:\Windows, /etc 等）── アプリは dataRoot 配下を
 *     `fs.rmSync(..., { recursive: true, force: true })` する経路を持つため、
 *     ここを誤指定すると OS そのものを破壊しうる
 *   - ファイルシステム/ドライブのルート（C:\, /）
 *   - 通常ファイル（ディレクトリでない）
 *   - 設定ファイル自身が住む config/ ── settings.json を巻き込むため
 *
 * 戻り値: 保存時の dataRoot 文字列（入力フォーマット — 相対 or 絶対 — は保つ）。
 * 不正なら Error を投げる（呼び出し側で UI に出すなりキャッチするなり）。
 */
function isFilesystemRoot(abs: string): boolean {
  const parsed = path.parse(abs);
  return parsed.root === abs;
}

function isSystemPath(abs: string): boolean {
  const sep = path.sep;
  if (process.platform === "win32") {
    const parsed = path.parse(abs);
    const drive = parsed.root.toLowerCase(); // 例: "c:\\"
    const FORBIDDEN_WIN = [
      "windows",
      "program files",
      "program files (x86)",
      "programdata",
      "system volume information",
      "$recycle.bin",
    ];
    const norm = abs.toLowerCase();
    for (const sys of FORBIDDEN_WIN) {
      const blocked = (drive + sys).toLowerCase();
      if (norm === blocked || norm.startsWith(blocked + sep.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
  // POSIX
  const FORBIDDEN_POSIX = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/var",
    "/boot",
    "/dev",
    "/proc",
    "/sys",
    "/System",
    "/Library/System",
  ];
  for (const sys of FORBIDDEN_POSIX) {
    if (abs === sys || abs.startsWith(sys + "/")) return true;
  }
  return false;
}

export function validateDataRoot(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("dataRoot は文字列で指定してください");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("dataRoot は空にできません");
  }
  // 制御文字（NUL 等）を含むパスは拒否
  if (/[\x00-\x1f]/.test(trimmed)) {
    throw new Error("dataRoot に制御文字を含めることはできません");
  }
  const absolute = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(PROJECT_ROOT, trimmed);

  if (isFilesystemRoot(absolute)) {
    throw new Error(
      `dataRoot にファイルシステムのルートは指定できません: ${absolute}`,
    );
  }
  if (isSystemPath(absolute)) {
    throw new Error(
      `dataRoot にシステムディレクトリは指定できません: ${absolute}`,
    );
  }
  // config/ 自身を巻き込まないように
  const configDir = path.dirname(SETTINGS_PATH);
  if (absolute === configDir || absolute.startsWith(configDir + path.sep)) {
    throw new Error(
      `dataRoot にアプリ設定ディレクトリ (${configDir}) は指定できません`,
    );
  }
  // 既存パスが通常ファイルなら拒否（ディレクトリ作成時にエラーになる前にここで弾く）
  if (fs.existsSync(absolute) && !fs.statSync(absolute).isDirectory()) {
    throw new Error(`dataRoot にファイルは指定できません: ${absolute}`);
  }
  return trimmed;
}

export function saveSettings(s: Settings): void {
  // 防御の最後の砦: 直接 saveSettings({...dataRoot:...}) が叩かれた場合も弾く。
  // UI 経由のフローでは事前にも検証されている前提だが、二重防御する。
  validateDataRoot(s.dataRoot);
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  // ⚠ settings.json には API キーが平文で書かれる。最低限本人のみ
  // 読めるようパーミッションを絞る。Windows では POSIX bit は無視されるが、
  // WSL / Linux / macOS では実効的に rw------- になる。
  // 真に安全にしたいなら環境変数 (ANTHROPIC_API_KEY 等) を使うこと。
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(SETTINGS_PATH, 0o600);
  } catch {
    // Windows では noop。失敗しても運用上の支障は無いので握りつぶす。
  }
}

/**
 * settings.dataRoot を絶対パスで返す（相対パスはプロジェクトルート基準）。
 * `react.cache` でリクエスト単位にメモ化。1リクエスト中に多数の storage 呼び出しが
 * 重なっても settings.json の再読は発生しない。
 */
export const getDataRoot = cache((): string => {
  const s = loadSettings();
  return path.isAbsolute(s.dataRoot)
    ? s.dataRoot
    : path.resolve(PROJECT_ROOT, s.dataRoot);
});

function dataPath(...segments: string[]): string {
  return path.join(getDataRoot(), ...segments);
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  // 原子書き込み: crash / power-loss で中間状態が残り、次回 JSON.parse で
  // 全画面が落ちるのを防ぐ。同一ボリューム内での rename はほぼ atomic。
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/**
 * fs.cpSync の代わりに使う、再帰ディレクトリコピー。
 * Windows + Node.js で、ディレクトリ／ファイル名に日本語が混在すると
 * `fs.cpSync` がネイティブクラッシュ（プロセスごと死亡）する事象を回避するために用意。
 * 1 ファイルずつ copyFileSync する素直な実装。失敗ファイルは警告して continue（中断しない）。
 */
function copyDirRecursiveSafe(srcDir: string, dstDir: string): void {
  ensureDir(dstDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch (e) {
    console.warn("[copyDirRecursiveSafe] readdir 失敗:", srcDir, e);
    return;
  }
  for (const ent of entries) {
    const sp = path.join(srcDir, ent.name);
    const dp = path.join(dstDir, ent.name);
    try {
      if (ent.isDirectory()) {
        copyDirRecursiveSafe(sp, dp);
      } else if (ent.isFile()) {
        fs.copyFileSync(sp, dp);
      }
      // symlink 等はスキップ（uploads/ には基本入らない想定）
    } catch (e) {
      console.warn("[copyDirRecursiveSafe] コピー失敗:", sp, "→", dp, e);
    }
  }
}

/* ───────────── Excel ミラー（fire-and-forget） ───────────── */

/**
 * マスタ書き込み完了後に master.xlsx を再生成する。
 * 動的 import で循環参照を回避（excelMirror は storage に依存）。失敗は警告のみ。
 */
function fireMasterMirror(): void {
  void import("./excelMirror")
    .then((m) => m.writeMasterMirror())
    .catch((e) => console.warn("[storage] excelMirror.master 起動失敗:", e));
}

/** セッション書き込み完了後に sessions.xlsx を再生成する。 */
function fireSessionsMirror(): void {
  void import("./excelMirror")
    .then((m) => m.writeSessionsMirror())
    .catch((e) => console.warn("[storage] excelMirror.sessions 起動失敗:", e));
}

/* ───────────── マスタ: 役割 ───────────── */

const rolesDir = () => dataPath("master", "roles");

/** role ID として安全な文字種（半角英数字・ハイフン・アンダースコア）。
 * URL 段の検証 (validateRoleMasterId) と二重防御で、将来別の呼び出し元が
 * 増えた場合に path traversal が storage 層を素通りしないようにする。 */
const ROLE_ID_SAFE = /^[a-zA-Z0-9_-]+$/;

function assertRoleId(id: string): void {
  if (typeof id !== "string" || !ROLE_ID_SAFE.test(id)) {
    throw new Error(`invalid role id: ${id}`);
  }
}

export function listRoleIds(): string[] {
  const dir = rolesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function listRoles(): Role[] {
  return listRoleIds()
    .map((id) => getRole(id))
    .filter((r): r is Role => r !== null);
}

export function getRole(id: string): Role | null {
  assertRoleId(id);
  return readJson<Role>(path.join(rolesDir(), `${id}.json`));
}

export function saveRole(role: Role): void {
  assertRoleId(role.id);
  writeJson(path.join(rolesDir(), `${role.id}.json`), role);
  fireMasterMirror();
}

export function deleteRole(id: string): void {
  assertRoleId(id);
  const p = path.join(rolesDir(), `${id}.json`);
  if (fs.existsSync(p)) fs.rmSync(p);
  fireMasterMirror();
}

/* ───────────── マスタ: 評価条件 ───────────── */

const evalCriteriaPath = () => dataPath("master", "eval_criteria.json");

/**
 * 旧形式（評価軸: string[]）を新形式（EvalAxis[]）に正規化する。
 * 既存データを破壊せず、読み出し時に変換するだけ（保存時に新形式になる）。
 */
function normalizeAxis(a: unknown): EvalAxis {
  if (typeof a === "string") return { 名前: a, 重み: 1 };
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    const 名前 = typeof o.名前 === "string" ? o.名前 : "";
    const 重みRaw = typeof o.重み === "number" ? o.重み : Number(o.重み);
    const 重み = Number.isFinite(重みRaw) && 重みRaw > 0 ? 重みRaw : 1;
    return { 名前, 重み };
  }
  return { 名前: String(a ?? ""), 重み: 1 };
}

function normalizeEvalCriteria(raw: unknown): EvalCriteria | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as EvalCriteria;
  const axes = Array.isArray(r.評価軸) ? r.評価軸.map(normalizeAxis) : [];
  return { ...r, 評価軸: axes };
}

export function getEvalCriteria(): EvalCriteria | null {
  return normalizeEvalCriteria(readJson<unknown>(evalCriteriaPath()));
}

export function saveEvalCriteria(c: EvalCriteria): void {
  writeJson(evalCriteriaPath(), c);
  fireMasterMirror();
}

/**
 * グローバル EvalCriteria に役割別オーバーライドを畳み込んで、その役割向けの
 * 「実効評価条件」を返す。snapshot に保存する用。
 * - 重みは評価軸の順序で要素ごとに上書き
 * - 合格ライン / 普通ライン は値が定義されていれば上書き
 * - 戻り値には ロール別 は含めない（snapshot は単一役割向けに解決済み）
 */
export function resolveEvalForRole(
  base: EvalCriteria,
  roleId: string,
): EvalCriteria {
  const override = base.ロール別?.[roleId];
  const { ロール別: _omit, ...rest } = base;
  void _omit;
  if (!override) return rest;
  const axes = base.評価軸.map((a, i) => {
    const w = override.重み?.[i];
    return typeof w === "number" && Number.isFinite(w) && w > 0
      ? { ...a, 重み: w }
      : a;
  });
  return {
    ...rest,
    評価軸: axes,
    合格ライン:
      typeof override.合格ライン === "number"
        ? override.合格ライン
        : base.合格ライン,
    普通ライン:
      typeof override.普通ライン === "number"
        ? override.普通ライン
        : base.普通ライン,
  };
}

/* ───────────── マスタ全体: import / export ───────────── */

const MASTER_EXPORT_VERSION = "1.0";

/** 共通バリデータ（lib/validation.ts）を import 経路で薄くラップして Error 化する。
 * 以前は ID パターンが 2 系統に分岐していたため統一した。詳細は validation.ts コメント参照。 */
function validateRoleForImport(raw: unknown, index: number): Role {
  const result = validateRoleObject(raw, `roles[${index}]`);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function validateEvalCriteriaForImport(raw: unknown): EvalCriteria {
  const result = validateEvalCriteriaObject(raw);
  if (!result.ok) throw new Error(`evalCriteria: ${result.error}`);
  return result.value;
}

/**
 * 全マスタを 1 つの JSON 文字列にまとめて返す。
 * 形式: { version, exportedAt, roles: Role[], evalCriteria: EvalCriteria | null }
 */
export function exportMaster(): string {
  const payload = {
    version: MASTER_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    roles: listRoles(),
    evalCriteria: getEvalCriteria(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * JSON 文字列を検証して全マスタを置き換える（既存役割は全削除して入れ替え）。
 * 検証エラーは throw（書き込み前に全件検証してから一括書き込みするので部分反映は発生しない）。
 */
export function importMaster(json: string): { roles: number; evalAxes: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("JSON として解析できませんでした");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON のトップレベルはオブジェクトで指定してください");
  }
  const b = parsed as Record<string, unknown>;
  if (!Array.isArray(b.roles)) {
    throw new Error("roles 配列が見つかりません");
  }
  const rolesValidated: Role[] = b.roles.map((r, i) => validateRoleForImport(r, i));
  const seenIds = new Set<string>();
  for (const r of rolesValidated) {
    if (seenIds.has(r.id)) {
      throw new Error(`ファイル内で role ID「${r.id}」が重複しています`);
    }
    seenIds.add(r.id);
  }
  const evalValidated = validateEvalCriteriaForImport(b.evalCriteria);

  for (const id of listRoleIds()) {
    deleteRole(id);
  }
  for (const r of rolesValidated) {
    saveRole(r);
  }
  saveEvalCriteria(evalValidated);
  return { roles: rolesValidated.length, evalAxes: evalValidated.評価軸.length };
}

/* ───────────── セッション ───────────── */

const sessionsDir = () => dataPath("sessions");

/**
 * Path traversal 防御。session ID は user-controlled な値が
 * `fs.rmSync(..., { recursive: true })` まで到達するため、id に
 * `..\\..\\config` のような細工があると外部の任意ディレクトリを破壊できる。
 *
 * 厳密な YYYYMMDD_HHMMSS_<氏名>_<役割> 形式は強制しない:
 *   - 旧データには YYYYMMDD_HHMM_... (4 桁時刻) が存在する
 *   - 氏名にはモジバケ含む任意の non-ASCII が入りうる
 * セキュリティ目的としては、id が sessions/ から脱出できないことが必要十分。
 * したがって path separator・NUL・制御文字・`.`/`..` のみブロックする。
 */
// Windows で予約された文字（< > : " | ? *）と ADS 用の ':' を含める。
// path.join(sessionsDir, "foo:bar") は Windows で foo の ADS になり、
// disc 上のプライマリファイルと別ストリームを触るオラクルになりうる。
const SESSION_ID_FORBIDDEN = /[\\/:<>"|?*\x00-\x1f]/;

export function isValidSessionId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0) return false;
  if (id === "." || id === "..") return false;
  if (SESSION_ID_FORBIDDEN.test(id)) return false;
  return true;
}

export function assertSessionId(id: string): void {
  if (!isValidSessionId(id)) {
    throw new Error(`invalid session id: ${id}`);
  }
}

const sessionDir = (id: string) => path.join(sessionsDir(), id);

/**
 * ID 生成: YYYYMMDD_HHMMSS_<氏名>_<役割>（ユーザ希望により日本語フォルダ名を維持）。
 * 秒まで含めることで、同一分内の連続複製による ID 衝突＝既存セッション上書きを防ぐ。
 * 旧形式 (YYYYMMDD_HHMM_...) のディレクトリはそのまま読み書き可（ID は単なる文字列）。
 */
export function generateSessionId(氏名: string, 役割: string, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${date}_${time}_${氏名}_${役割}`;
}

export function listSessions(): SessionMeta[] {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return [];
  // withFileTypes で N 回の statSync を避ける（旧実装: readdir → 各 statSync）
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => getSessionMeta(d.name))
    .filter((m): m is SessionMeta => m !== null)
    .sort((a, b) => (a.作成日時 < b.作成日時 ? 1 : -1));
}

export function getSessionMeta(id: string): SessionMeta | null {
  if (!isValidSessionId(id)) return null;
  return readJson<SessionMeta>(path.join(sessionDir(id), "session.json"));
}

export function saveSessionMeta(meta: SessionMeta): void {
  assertSessionId(meta.id);
  writeJson(path.join(sessionDir(meta.id), "session.json"), meta);
  fireSessionsMirror();
}

export function createSession(氏名: string, 役割: string): SessionMeta {
  const now = new Date();
  const id = generateSessionId(氏名, 役割, now);
  assertSessionId(id);
  ensureDir(sessionDir(id));
  ensureDir(path.join(sessionDir(id), "uploads"));
  const meta: SessionMeta = {
    id,
    氏名,
    役割,
    作成日時: now.toISOString(),
    status: "編集中",
    closedAt: null,
    result: "未確定",
    hold: false,
  };
  saveSessionMeta(meta);
  return meta;
}

export function deleteSession(id: string): void {
  assertSessionId(id);
  const dir = sessionDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fireSessionsMirror();
}

/**
 * セッションを複製する。
 * - 引き継ぎ: ②要約 / uploads/（履歴書は役割に依らない）
 * - 同じ役割なら ④凍結条件 / ⑤質問 も引き継ぐ
 * - 役割を変えた場合 ④⑤ は破棄（旧役割向けに作られたものなので意味がない）
 * - ⑥議事録 / ⑧評価は常に引き継がない（別ラウンドのため）
 *
 * @param srcId 複製元のセッション ID
 * @param opts.氏名 上書きする氏名（省略時は元と同じ）
 * @param opts.役割 上書きする役割（省略時は元と同じ。変えると ④⑤ はコピーされない）
 */
export function duplicateSession(
  srcId: string,
  opts: { 氏名?: string; 役割?: string } = {},
): SessionMeta | null {
  assertSessionId(srcId);
  // ステップログは PII を含むため、デバッグ環境変数下のみ出力。
  const dbg = process.env.DEBUG_DUPLICATE === "1";
  if (dbg) console.log("[duplicateSession] step:start", { srcId });
  const src = getSessionMeta(srcId);
  if (!src) {
    if (dbg) console.log("[duplicateSession] step:src-not-found");
    return null;
  }
  const 氏名 = (opts.氏名?.trim() || src.氏名).trim();
  const 役割 = (opts.役割?.trim() || src.役割).trim();
  const roleChanged = 役割 !== src.役割;
  if (dbg) {
    console.log("[duplicateSession] step:before-createSession", {
      役割,
      roleChanged,
    });
  }
  const meta = createSession(氏名, 役割);
  if (dbg) console.log("[duplicateSession] step:after-createSession", { newId: meta.id });
  const srcDir = sessionDir(srcId);
  const dstDir = sessionDir(meta.id);

  // ②要約は役割に依らないので常にコピー
  const filesToCopy = roleChanged
    ? ["candidate.json"]
    : ["candidate.json", "conditions_snapshot.json", "questions.json"];
  if (dbg) console.log("[duplicateSession] step:copying-files", filesToCopy);
  for (const name of filesToCopy) {
    const f = path.join(srcDir, name);
    if (fs.existsSync(f)) {
      if (dbg) console.log("[duplicateSession] step:copy", name);
      fs.copyFileSync(f, path.join(dstDir, name));
    }
  }
  const srcUploads = path.join(srcDir, "uploads");
  if (fs.existsSync(srcUploads)) {
    if (dbg) console.log("[duplicateSession] step:copy-uploads");
    // fs.cpSync は Windows + Node.js で日本語フォルダ／ファイル名混在時に
    // ネイティブクラッシュ（プロセスごと死亡）する事象あり。手動再帰コピーに置換。
    copyDirRecursiveSafe(srcUploads, path.join(dstDir, "uploads"));
    if (dbg) console.log("[duplicateSession] step:copy-uploads-done");
  }
  if (dbg) console.log("[duplicateSession] step:before-mirror", { roleChanged });
  if (!roleChanged && getConditionsSnapshot(meta.id)) {
    saveSessionMeta({ ...meta, status: "質問公開" });
  } else {
    // saveSessionMeta を通らない経路でも面談者一覧シートを必ず追従させる
    fireSessionsMirror();
  }
  const result = getSessionMeta(meta.id);
  if (dbg) console.log("[duplicateSession] step:done", { ok: !!result });
  return result;
}

/* ───────────── セッション内の各セクション ───────────── */

const sectionPath = (id: string, file: string) => path.join(sessionDir(id), file);

/** read 系: 不正 id は null を返す（既存 API 契約「ファイル無し = null」を維持） */
function readSection<T>(id: string, file: string): T | null {
  if (!isValidSessionId(id)) return null;
  return readJson<T>(sectionPath(id, file));
}

export const getCandidate = (id: string) =>
  readSection<Candidate>(id, "candidate.json");
export const saveCandidate = (id: string, data: Candidate) => {
  assertSessionId(id);
  writeJson(sectionPath(id, "candidate.json"), data);
  fireSessionsMirror();
};

export const getConditionsSnapshot = (id: string) => {
  const raw = readSection<ConditionsSnapshot>(id, "conditions_snapshot.json");
  if (!raw) return null;
  const evalNorm = normalizeEvalCriteria(raw.eval);
  if (evalNorm) raw.eval = evalNorm;
  return raw;
};
export const saveConditionsSnapshot = (id: string, data: ConditionsSnapshot) => {
  assertSessionId(id);
  writeJson(sectionPath(id, "conditions_snapshot.json"), data);
};

export const getQuestions = (id: string) =>
  readSection<Questions>(id, "questions.json");
export const saveQuestions = (id: string, data: Questions) => {
  assertSessionId(id);
  writeJson(sectionPath(id, "questions.json"), data);
};

export const getMinutes = (id: string) =>
  readSection<Minutes>(id, "minutes.json");
export const saveMinutes = (id: string, data: Minutes) => {
  assertSessionId(id);
  writeJson(sectionPath(id, "minutes.json"), data);
};

export const getEvaluation = (id: string) =>
  readSection<Evaluation>(id, "evaluation.json");
export const saveEvaluation = (id: string, data: Evaluation) => {
  assertSessionId(id);
  writeJson(sectionPath(id, "evaluation.json"), data);
  // 一覧の N+1 を消すため、総合スコアと合否を SessionMeta にデノーマライズして保持。
  // saveSessionMeta は fireSessionsMirror も呼ぶため、ここでは追加でミラーを焚かない。
  const meta = getSessionMeta(id);
  if (meta && (meta.総合スコア !== data.総合スコア || meta.合否 !== data.合否)) {
    saveSessionMeta({
      ...meta,
      総合スコア: data.総合スコア,
      合否: data.合否,
    });
  } else {
    fireSessionsMirror();
  }
};
