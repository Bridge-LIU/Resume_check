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
  RoleEvalOverride,
  SessionMeta,
  Settings,
} from "./types";

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

  return {
    dataRoot: s.dataRoot ?? "./data",
    defaultProvider: s.defaultProvider ?? "anthropic",
    providers,
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

export function loadSettings(): Settings {
  const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
  return migrateSettings(JSON.parse(raw));
}

export function saveSettings(s: Settings): void {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), "utf-8");
}

/** settings.dataRoot を絶対パスで返す（相対パスはプロジェクトルート基準） */
export function getDataRoot(): string {
  const s = loadSettings();
  return path.isAbsolute(s.dataRoot)
    ? s.dataRoot
    : path.resolve(PROJECT_ROOT, s.dataRoot);
}

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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
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
  return readJson<Role>(path.join(rolesDir(), `${id}.json`));
}

export function saveRole(role: Role): void {
  writeJson(path.join(rolesDir(), `${role.id}.json`), role);
  fireMasterMirror();
}

export function deleteRole(id: string): void {
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
const ROLE_ID_PATTERN = /^[A-Za-z0-9_\-ぁ-んァ-ン一-龥]+$/;

function validateRoleForImport(raw: unknown, index: number): Role {
  if (!raw || typeof raw !== "object") {
    throw new Error(`roles[${index}] はオブジェクトで指定してください`);
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id.trim()) {
    throw new Error(`roles[${index}].id は必須です`);
  }
  if (!ROLE_ID_PATTERN.test(b.id)) {
    throw new Error(`roles[${index}].id に使用できない文字が含まれています`);
  }
  if (typeof b.役割 !== "string" || !b.役割.trim()) {
    throw new Error(`roles[${index}].役割 は必須です`);
  }
  if (typeof b.経験 !== "string") {
    throw new Error(`roles[${index}].経験 は文字列で指定してください`);
  }
  if (typeof b.未経験可 !== "boolean") {
    throw new Error(`roles[${index}].未経験可 は真偽値で指定してください`);
  }
  if (
    !Array.isArray(b.条件1_基本人物像) ||
    !b.条件1_基本人物像.every((x) => typeof x === "string")
  ) {
    throw new Error(`roles[${index}].条件1_基本人物像 は文字列配列で指定してください`);
  }
  if (
    !Array.isArray(b.条件2_未経験者必須) ||
    !b.条件2_未経験者必須.every((x) => typeof x === "string")
  ) {
    throw new Error(`roles[${index}].条件2_未経験者必須 は文字列配列で指定してください`);
  }
  return {
    id: b.id.trim(),
    役割: b.役割.trim(),
    経験: (b.経験 as string).trim(),
    未経験可: b.未経験可,
    条件1_基本人物像: b.条件1_基本人物像 as string[],
    条件2_未経験者必須: b.条件2_未経験者必須 as string[],
  };
}

function validateEvalCriteriaForImport(raw: unknown): EvalCriteria {
  if (!raw || typeof raw !== "object") {
    throw new Error("evalCriteria は必須です");
  }
  const b = raw as Record<string, unknown>;
  if (b.方式 !== "BARS") {
    throw new Error('evalCriteria.方式 は "BARS" のみ対応しています');
  }
  if (!Array.isArray(b.評価軸)) {
    throw new Error("evalCriteria.評価軸 は配列で指定してください");
  }
  if (b.評価軸.length === 0) {
    throw new Error("evalCriteria.評価軸 は1つ以上必要です");
  }
  const axes: EvalAxis[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < b.評価軸.length; i++) {
    const a = b.評価軸[i];
    if (typeof a === "string") {
      const 名前 = a.trim();
      if (!名前) throw new Error(`evalCriteria.評価軸[${i}].名前 が空です`);
      if (seen.has(名前)) throw new Error(`evalCriteria.評価軸「${名前}」が重複しています`);
      seen.add(名前);
      axes.push({ 名前, 重み: 1 });
      continue;
    }
    if (!a || typeof a !== "object") {
      throw new Error(`evalCriteria.評価軸[${i}] はオブジェクトで指定してください`);
    }
    const o = a as Record<string, unknown>;
    if (typeof o.名前 !== "string" || !o.名前.trim()) {
      throw new Error(`evalCriteria.評価軸[${i}].名前 は必須です`);
    }
    if (typeof o.重み !== "number" || !Number.isFinite(o.重み) || o.重み <= 0) {
      throw new Error(`evalCriteria.評価軸[${i}].重み は正の数値で指定してください`);
    }
    const 名前 = o.名前.trim();
    if (seen.has(名前)) throw new Error(`evalCriteria.評価軸「${名前}」が重複しています`);
    seen.add(名前);
    axes.push({ 名前, 重み: o.重み });
  }
  if (!b.スケール || typeof b.スケール !== "object") {
    throw new Error("evalCriteria.スケール が不正です");
  }
  const sc = b.スケール as Record<string, unknown>;
  if (typeof sc.最小 !== "number") throw new Error("evalCriteria.スケール.最小 は数値で指定してください");
  if (typeof sc.最大 !== "number") throw new Error("evalCriteria.スケール.最大 は数値で指定してください");
  if (typeof sc.刻み !== "number") throw new Error("evalCriteria.スケール.刻み は数値で指定してください");
  if (sc.最大 <= sc.最小) throw new Error("evalCriteria.スケール.最大 は最小より大きい必要があります");
  if (sc.刻み <= 0) throw new Error("evalCriteria.スケール.刻み は正の数で指定してください");
  if (typeof sc.段階数 !== "number") throw new Error("evalCriteria.スケール.段階数 は数値で指定してください");
  if (typeof b.合格ライン !== "number") throw new Error("evalCriteria.合格ライン は数値で指定してください");
  if (typeof b.普通ライン !== "number") throw new Error("evalCriteria.普通ライン は数値で指定してください");
  if (typeof b.自己解決レベル !== "string") {
    throw new Error("evalCriteria.自己解決レベル は文字列で指定してください");
  }
  if (!Array.isArray(b.出力) || !b.出力.every((x) => typeof x === "string")) {
    throw new Error("evalCriteria.出力 は文字列配列で指定してください");
  }
  const overrides: Record<string, RoleEvalOverride> | undefined = (() => {
    if (b.ロール別 === undefined) return undefined;
    if (!b.ロール別 || typeof b.ロール別 !== "object" || Array.isArray(b.ロール別)) {
      throw new Error("evalCriteria.ロール別 はオブジェクトで指定してください");
    }
    const out: Record<string, RoleEvalOverride> = {};
    for (const [roleId, val] of Object.entries(
      b.ロール別 as Record<string, unknown>,
    )) {
      if (!val || typeof val !== "object") {
        throw new Error(`evalCriteria.ロール別.${roleId} はオブジェクトで指定してください`);
      }
      const ov = val as Record<string, unknown>;
      const entry: RoleEvalOverride = {};
      if (ov.重み !== undefined) {
        if (
          !Array.isArray(ov.重み) ||
          !ov.重み.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
        ) {
          throw new Error(
            `evalCriteria.ロール別.${roleId}.重み は正の数値配列で指定してください`,
          );
        }
        if (ov.重み.length > axes.length) {
          throw new Error(
            `evalCriteria.ロール別.${roleId}.重み の長さ(${ov.重み.length})が評価軸数(${axes.length})を超えています`,
          );
        }
        entry.重み = ov.重み as number[];
      }
      if (ov.合格ライン !== undefined) {
        if (typeof ov.合格ライン !== "number" || !Number.isFinite(ov.合格ライン)) {
          throw new Error(`evalCriteria.ロール別.${roleId}.合格ライン は数値で指定してください`);
        }
        entry.合格ライン = ov.合格ライン;
      }
      if (ov.普通ライン !== undefined) {
        if (typeof ov.普通ライン !== "number" || !Number.isFinite(ov.普通ライン)) {
          throw new Error(`evalCriteria.ロール別.${roleId}.普通ライン は数値で指定してください`);
        }
        entry.普通ライン = ov.普通ライン;
      }
      out[roleId] = entry;
    }
    return out;
  })();
  return {
    方式: "BARS",
    評価軸: axes,
    スケール: {
      最小: sc.最小 as number,
      最大: sc.最大 as number,
      刻み: sc.刻み as number,
      段階数: sc.段階数 as number,
    },
    合格ライン: b.合格ライン as number,
    普通ライン: b.普通ライン as number,
    自己解決レベル: b.自己解決レベル as string,
    出力: b.出力 as string[],
    ...(overrides ? { ロール別: overrides } : {}),
  };
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
const sessionDir = (id: string) => path.join(sessionsDir(), id);

/** ID 生成: YYYYMMDD_HHMM_<氏名>_<役割> */
export function generateSessionId(氏名: string, 役割: string, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}`;
  return `${date}_${time}_${氏名}_${役割}`;
}

export function listSessions(): SessionMeta[] {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((id) => fs.statSync(path.join(dir, id)).isDirectory())
    .map((id) => getSessionMeta(id))
    .filter((m): m is SessionMeta => m !== null)
    .sort((a, b) => (a.作成日時 < b.作成日時 ? 1 : -1));
}

export function getSessionMeta(id: string): SessionMeta | null {
  return readJson<SessionMeta>(path.join(sessionDir(id), "session.json"));
}

export function saveSessionMeta(meta: SessionMeta): void {
  writeJson(path.join(sessionDir(meta.id), "session.json"), meta);
  fireSessionsMirror();
}

export function createSession(氏名: string, 役割: string): SessionMeta {
  const now = new Date();
  const id = generateSessionId(氏名, 役割, now);
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
  const dir = sessionDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fireSessionsMirror();
}

/**
 * セッションを複製する。設定済みの ②要約／④凍結条件／⑤質問／uploads/ を引き継ぎ、
 * ⑥議事録・⑧評価は引き継がない（同じ候補者で別ラウンドを行う想定）。
 */
export function duplicateSession(srcId: string): SessionMeta | null {
  const src = getSessionMeta(srcId);
  if (!src) return null;
  const meta = createSession(src.氏名, src.役割);
  const srcDir = sessionDir(srcId);
  const dstDir = sessionDir(meta.id);
  for (const name of ["candidate.json", "conditions_snapshot.json", "questions.json"]) {
    const f = path.join(srcDir, name);
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dstDir, name));
  }
  const srcUploads = path.join(srcDir, "uploads");
  if (fs.existsSync(srcUploads)) {
    fs.cpSync(srcUploads, path.join(dstDir, "uploads"), { recursive: true });
  }
  if (getConditionsSnapshot(meta.id)) {
    saveSessionMeta({ ...meta, status: "質問公開" });
  } else {
    // saveSessionMeta を通らない経路でも候補者一覧シートを必ず追従させる
    fireSessionsMirror();
  }
  return getSessionMeta(meta.id);
}

/* ───────────── セッション内の各セクション ───────────── */

const sectionPath = (id: string, file: string) => path.join(sessionDir(id), file);

export const getCandidate = (id: string) =>
  readJson<Candidate>(sectionPath(id, "candidate.json"));
export const saveCandidate = (id: string, data: Candidate) => {
  writeJson(sectionPath(id, "candidate.json"), data);
  fireSessionsMirror();
};

export const getConditionsSnapshot = (id: string) => {
  const raw = readJson<ConditionsSnapshot>(sectionPath(id, "conditions_snapshot.json"));
  if (!raw) return null;
  const evalNorm = normalizeEvalCriteria(raw.eval);
  if (evalNorm) raw.eval = evalNorm;
  return raw;
};
export const saveConditionsSnapshot = (id: string, data: ConditionsSnapshot) =>
  writeJson(sectionPath(id, "conditions_snapshot.json"), data);

export const getQuestions = (id: string) =>
  readJson<Questions>(sectionPath(id, "questions.json"));
export const saveQuestions = (id: string, data: Questions) =>
  writeJson(sectionPath(id, "questions.json"), data);

export const getMinutes = (id: string) =>
  readJson<Minutes>(sectionPath(id, "minutes.json"));
export const saveMinutes = (id: string, data: Minutes) =>
  writeJson(sectionPath(id, "minutes.json"), data);

export const getEvaluation = (id: string) =>
  readJson<Evaluation>(sectionPath(id, "evaluation.json"));
export const saveEvaluation = (id: string, data: Evaluation) => {
  writeJson(sectionPath(id, "evaluation.json"), data);
  fireSessionsMirror();
};
