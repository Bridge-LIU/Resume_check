/**
 * 更新機構コア。§12.8.9 準拠（決定 1 = D: Next.js standalone 預打包）。
 *
 * P1 で追加:
 *  - `UpdateState` 型（`restoring` phase 含む）
 *  - `readState()` / `writeState()` — 素の fs で state.json を原子書き込み
 *  - `selfHealOnBoot()` — 起動時自己修復
 *
 * P2 で追加:
 *  - `fetchLatestRelease()` — GitHub Releases API
 *  - `checkForUpdate()` — check route の主ロジック
 *  - `consumeUpdateSuccessFlag()` — 成功トースト用フラグ
 *
 * P3 で追加（本 refactor）:
 *  - パス helper を §12.8.2 に沿って再編:
 *    - staging / state / lock は `data/.update/` (getDataRoot 経由)
 *    - **backup は `<project>/.backup/vX.Y.Z/`** — move の同盘保証のため project 根に固定
 *  - `downloadRelease()` — 実 ZIP DL（stream + progress + Content-Length 検証）
 *  - `cleanStaging()` / `listBackups()` / `getUpdaterLogPath()` / `tailUpdaterLog()`
 *  - `selfHealOnBoot()` を §12.8.9.6 の 3 段階に合わせて拡張
 *
 * ⚠️ **module-level cache 禁止**（§12.7 CR-7）: `readState()` は毎回 fs 読み。Turbopack が
 * RSC / route handler / instrumentation の 3 コンテキストで同じモジュールを別評価する
 * 可能性があるため、in-memory cache は state 不整合の温床になる。fs が真実源。
 *
 * ⚠️ **backup ディレクトリの配置**（§12.8.2）: `<project>/.backup/` に配置。
 * `getDataRoot()` を経由**しない**。理由:
 * - Windows `move` は同盘内でのみ瞬時（メタデータ操作）。異なるドライブへ move すると
 *   実複製に退化して 30-60 秒 + 800MB の複製が発生する
 * - `getDataRoot()` はユーザーが `/settings` で別ドライブに向けられる → backup を同居させると
 *   move が copy に退化する
 * - project 根への配置で同盘保証、backup / restore が瞬時完了
 * - トレードオフ: `data/` gitignore とは別に `.backup/` gitignore が必要 (§12.7.4 M8)
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot, getProjectRoot } from "@/lib/storage";
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  compareVersions,
  getCurrentVersion,
  normalizeTag,
} from "@/lib/version";

/* ───────────── 型 ───────────── */

export type ReleaseInfo = {
  /** "v0.2.0" 形式そのまま */
  tag: string;
  /** normalizeTag() で "0.2.0" にした値 */
  version: string;
  name: string;
  /** Release body（マークダウン） */
  notes: string;
  publishedAt: string;
  /** ZIP asset の browser_download_url。zipball_url は使わない (§2.1) */
  downloadUrl: string;
  /** DL 時の Content-Length 検証用 (§12.7 CR-6) */
  sizeBytes?: number;
};

/**
 * 更新状態。§2.2 の 6 状態 + §12.7 C3 で `restoring` を追加、`error.phaseFailed` を拡張。
 * `error.rollbackZipPath` は復旧 UI が `restore.bat` を spawn するときに使う。
 */
export type UpdateState =
  | { phase: "idle" }
  | { phase: "update-available"; latest: ReleaseInfo; checkedAt: string }
  | {
      phase: "downloading";
      latest: ReleaseInfo;
      progress: number;
      startedAt: string;
    }
  | { phase: "downloaded"; latest: ReleaseInfo; downloadedAt: string }
  | { phase: "applying"; from: string; to: string; startedAt: string }
  | { phase: "restoring"; from: string; to: string; startedAt: string }
  | {
      phase: "error";
      message: string;
      phaseFailed: "downloading" | "applying" | "restoring";
      at: string;
      rollbackZipPath?: string;
    };

/* ───────────── パス ───────────── */

/**
 * `<getDataRoot()>/.update` — 更新機構の可変作業領域（PII を含まないが gitignore 対象）。
 * state.json / staging / lock / previous-version.txt / success-flag.txt を配置する。
 */
export function getUpdateDir(): string {
  return path.join(getDataRoot(), ".update");
}

/** ZIP DL の保存先。 */
export function getStagingDir(): string {
  return path.join(getUpdateDir(), "staging");
}

/** ZIP 展開先。updater.bat が robocopy の source に使う。 */
export function getStagingExtractedDir(): string {
  return path.join(getStagingDir(), "extracted");
}

/**
 * `<project>/.backup/` — バックアップ配置場所（§12.8.2）。
 * **`getDataRoot()` を経由しない**（move の同盘保証のため project 根に固定）。
 */
export function getBackupDir(): string {
  return path.join(getProjectRoot(), ".backup");
}

/** `<project>/.backup/v0.1.0/` — 特定バージョンのバックアップ。 */
export function getBackupVersionDir(version: string): string {
  return path.join(getBackupDir(), `v${version}`);
}

/**
 * 保存済のバックアップ一覧（新しい順）。§12.8.2 で保留は 1 代のみだが、
 * 何らかの理由で複数残っている場合の掃除に使う。
 */
export function listBackups(): string[] {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^v\d+\.\d+(\.\d+)?$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function getStateFilePath(): string {
  return path.join(getUpdateDir(), "state.json");
}

export function getPreviousVersionFilePath(): string {
  return path.join(getUpdateDir(), "previous-version.txt");
}

export function getUpdateSuccessFlagPath(): string {
  return path.join(getUpdateDir(), "success-flag.txt");
}

/**
 * `updater.bat` が cmd 出力を tee するログファイル。
 * `/api/update/progress` が末尾 N 行を tail してモーダルの cmd log 表示に返す。
 */
export function getUpdaterLogPath(): string {
  return path.join(getUpdateDir(), "updater.log");
}

/**
 * `<project>/.update/updater.lock` — start.bat がここを見て競合起動を拒否する。
 * `data/.update/` は dataRoot カスタム時に到達不能な可能性があるため、start.bat から
 * 確実に到達できるプロジェクト直下にもミラーする (§12.7 C2 妥協点)。
 */
export function getProjectMirrorLockPath(): string {
  return path.join(getProjectRoot(), ".update", "updater.lock");
}

/** `data/.update/updater.lock` — Node 側の実 lock 位置。 */
export function getDataLockPath(): string {
  return path.join(getUpdateDir(), "updater.lock");
}

/* ───────────── state 読み書き ───────────── */

function ensureUpdateDir(): void {
  fs.mkdirSync(getUpdateDir(), { recursive: true });
}

/**
 * state.json を読む。存在しない or 壊れているなら idle を返す（不可視の自己修復）。
 */
export function readState(): UpdateState {
  const filePath = getStateFilePath();
  if (!fs.existsSync(filePath)) {
    return { phase: "idle" };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as UpdateState;
    if (isValidState(parsed)) return parsed;
    // 未知の phase 値 → idle に降格（実装バグや手動編集からの保護）
    return { phase: "idle" };
  } catch {
    // 破損 JSON → idle に降格
    return { phase: "idle" };
  }
}

/**
 * state.json に書く。§11.1 C4 修正: tmp + rename で原子書き込み（電源断でファイル破損しない）。
 */
export function writeState(state: UpdateState): void {
  ensureUpdateDir();
  const filePath = getStateFilePath();
  const tmpPath = filePath + ".tmp";
  const body = JSON.stringify(state, null, 2);
  fs.writeFileSync(tmpPath, body, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function isValidState(s: unknown): s is UpdateState {
  if (!s || typeof s !== "object") return false;
  const phase = (s as { phase?: unknown }).phase;
  return (
    phase === "idle" ||
    phase === "update-available" ||
    phase === "downloading" ||
    phase === "downloaded" ||
    phase === "applying" ||
    phase === "restoring" ||
    phase === "error"
  );
}

/* ───────────── previous-version.txt ───────────── */

export function getPreviousVersion(): string | null {
  const filePath = getPreviousVersionFilePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setPreviousVersion(version: string): void {
  ensureUpdateDir();
  fs.writeFileSync(getPreviousVersionFilePath(), version, "utf8");
}

/* ───────────── 起動時自己修復 ───────────── */

const APPLYING_TIMEOUT_MS = 30 * 60_000; // 30 分
const RESTORING_TIMEOUT_MS = 30 * 60_000;
const DOWNLOADING_TIMEOUT_MS = 10 * 60_000; // 10 分

/**
 * 起動時に state.json を検査し、破綻状態を回収する。
 * §2.2 疑似コード + §12.7 C3 の `restoring` 分岐。instrumentation.ts から呼ばれる。
 *
 * P1 での実装範囲: state 破損 / 明らかな timeout の降格のみ。
 * P3 で `applying` / `restoring` 中のバージョン照合分岐を追加する。
 */
export function selfHealOnBoot(): void {
  try {
    ensureUpdateDir();
    const state = readState();
    const now = new Date();

    if (state.phase === "downloading") {
      const startedAt = new Date(state.startedAt).getTime();
      if (isNaN(startedAt) || now.getTime() - startedAt > DOWNLOADING_TIMEOUT_MS) {
        writeState({
          phase: "error",
          message: "download-interrupted",
          phaseFailed: "downloading",
          at: now.toISOString(),
        });
        console.log("[updater:self-heal] downloading → error (interrupted)");
      }
      return;
    }

    if (state.phase === "applying") {
      // §2.2 疑似コード: getCurrentVersion() と state.to の照合で成功/失敗を判定
      const running = getCurrentVersion();
      if (running === state.to) {
        // apply 成功、bat が state.json 更新前に死んだケース or 起動確認前に落ちた
        setPreviousVersion(state.from);
        markUpdateSuccess(state.to);
        writeState({ phase: "idle" });
        console.log(
          `[updater:self-heal] applying(${state.from}→${state.to}) → idle (version confirmed)`,
        );
        return;
      }
      const startedAt = new Date(state.startedAt).getTime();
      if (isNaN(startedAt) || now.getTime() - startedAt > APPLYING_TIMEOUT_MS) {
        writeState({
          phase: "error",
          message: "apply-interrupted",
          phaseFailed: "applying",
          at: now.toISOString(),
        });
        console.log("[updater:self-heal] applying → error (timeout, version mismatch)");
      }
      return;
    }

    if (state.phase === "restoring") {
      // rollback 中に落ちたケース。バージョンが `state.from`（＝復旧目標）に一致すれば成功。
      const running = getCurrentVersion();
      if (running === state.from) {
        writeState({ phase: "idle" });
        console.log(
          `[updater:self-heal] restoring(${state.to}→${state.from}) → idle (rollback confirmed)`,
        );
        return;
      }
      const startedAt = new Date(state.startedAt).getTime();
      if (isNaN(startedAt) || now.getTime() - startedAt > RESTORING_TIMEOUT_MS) {
        writeState({
          phase: "error",
          message: "restore-interrupted",
          phaseFailed: "restoring",
          at: now.toISOString(),
        });
        console.log("[updater:self-heal] restoring → error (timeout, version mismatch)");
      }
      return;
    }

    // idle / update-available / downloaded / error はそのまま
  } catch (e) {
    console.error("[updater:self-heal] failed:", e);
  }
}

/* ───────────── 更新成功トーストフラグ ───────────── */

/**
 * §11.1 C5 修正: state.json ではなく専用ファイルに分離。複数タブ間で state.json を
 * 共有すると 1 タブで consume 後に他タブで表示できないバグを避けるため、成功フラグは
 * ファイル存在で表現し、read の atomic swap で消費する。
 */
export function markUpdateSuccess(newVersion: string): void {
  ensureUpdateDir();
  fs.writeFileSync(getUpdateSuccessFlagPath(), newVersion, "utf8");
}

/**
 * 更新成功フラグを 1 度だけ消費する。UI マウント時に呼ばれ、shown=true なら
 * ファイル削除してトースト表示、以降は shown=false。
 */
export function consumeUpdateSuccessFlag():
  | { shown: false }
  | { shown: true; version: string } {
  const filePath = getUpdateSuccessFlagPath();
  if (!fs.existsSync(filePath)) return { shown: false };
  try {
    const version = fs.readFileSync(filePath, "utf8").trim();
    fs.rmSync(filePath, { force: true });
    if (version.length === 0) return { shown: false };
    return { shown: true, version };
  } catch {
    return { shown: false };
  }
}

/* ───────────── GitHub Releases API ───────────── */

/** §4.2: 許可ホスト白リスト。302 追跡後の最終ホスト再検証もこれで行う。 */
const ALLOWED_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

/** URL のホストが白リストに含まれるか。含まれなければ throw。 */
function assertAllowedHost(url: string, label: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${label}の URL が不正: ${url}`);
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`${label}の host が許可リスト外: ${host}`);
  }
}

/** Release notes は 100KB まで（§7 サイズ上限） */
const RELEASE_NOTES_LIMIT = 100 * 1024;

type GithubReleaseAsset = {
  name?: string;
  size?: number;
  browser_download_url?: string;
  content_type?: string;
};

type GithubReleaseResponse = {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  assets?: GithubReleaseAsset[];
  message?: string; // rate limit の 403 レスポンスに入る
};

/**
 * GitHub Releases API から最新版を取得。ZIP asset が無ければ throw。
 * §4.2: `zipball_url` フォールバックはしない（源码 tarball 構造が別で robocopy と噛み合わない）。
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  assertAllowedHost(apiUrl, "GitHub API");

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${GITHUB_OWNER}-${GITHUB_REPO}-updater`,
    },
    cache: "no-store",
    redirect: "follow",
  });

  // 302 追跡後の最終ホスト再検証 (§4.2)
  assertAllowedHost(res.url || apiUrl, "GitHub API (final)");

  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error(
      "GitHub API のレート制限に達しました。しばらくしてから再試行してください。",
    );
  }
  if (res.status === 404) {
    throw new Error("公開されている Release がありません。");
  }
  if (!res.ok) {
    throw new Error(`GitHub API エラー: HTTP ${res.status}`);
  }

  const data = (await res.json()) as GithubReleaseResponse;
  const tag = typeof data.tag_name === "string" ? data.tag_name : "";
  const version = normalizeTag(tag);
  if (!version) {
    throw new Error(`Release のタグ形式が不正: ${tag}`);
  }

  // ZIP asset を探す。asset name は release.yml が命名する `app.zip` 前提だが、
  // 命名が変わっても .zip 拡張子で fallback 検索。
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const zipAsset =
    assets.find(
      (a): a is Required<Pick<GithubReleaseAsset, "browser_download_url">> & GithubReleaseAsset =>
        typeof a?.browser_download_url === "string" &&
        typeof a.name === "string" &&
        a.name.toLowerCase().endsWith(".zip"),
    );
  if (!zipAsset || !zipAsset.browser_download_url) {
    throw new Error(
      "Release に ZIP アセットが添付されていません。管理者に連絡してください。",
    );
  }
  assertAllowedHost(zipAsset.browser_download_url, "ZIP DL");

  const notes = typeof data.body === "string" ? data.body.slice(0, RELEASE_NOTES_LIMIT) : "";

  return {
    tag,
    version,
    name: typeof data.name === "string" && data.name.length > 0 ? data.name : tag,
    notes,
    publishedAt: typeof data.published_at === "string" ? data.published_at : "",
    downloadUrl: zipAsset.browser_download_url,
    sizeBytes: typeof zipAsset.size === "number" ? zipAsset.size : undefined,
  };
}

/**
 * check route の主ロジック。最新 Release を取って現在バージョンと比較し、state を更新する。
 * 戻り値は state 変化後のオブジェクト（UI が即座に表示できるように）。
 */
export async function checkForUpdate(): Promise<UpdateState> {
  const latest = await fetchLatestRelease();
  const current = getCurrentVersion();
  const cmp = compareVersions(latest.version, current);
  const now = new Date().toISOString();
  if (cmp > 0) {
    const state: UpdateState = {
      phase: "update-available",
      latest,
      checkedAt: now,
    };
    writeState(state);
    return state;
  }
  const state: UpdateState = { phase: "idle" };
  writeState(state);
  return state;
}

/* ───────────── ZIP ダウンロード ───────────── */

/** ZIP サイズ上限 200MB（§4.2）。standalone ZIP は 50-80MB 想定だが余裕を持つ。 */
const ZIP_SIZE_LIMIT = 200 * 1024 * 1024;

/**
 * staging ディレクトリ内の一時 ZIP パスを返す（バージョン別に命名）。
 */
export function getStagingZipPath(version: string): string {
  return path.join(getStagingDir(), `app-v${version}.zip`);
}

/** staging を完全に消去。DL 開始前 / 失敗時 / apply 成功後に呼ばれる。 */
export function cleanStaging(): void {
  const dir = getStagingDir();
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Release ZIP を staging に stream DL。
 *
 * - AbortSignal サポート（UI からキャンセル可能）
 * - Content-Length ヘッダを取得、DL 完了後に実 byte 数と照合（§12.7 CR-6）
 * - サイズ上限 200MB を超えたら abort
 * - 進捗コールバック（bytes DL 済 / total）
 *
 * 完了で writeState(downloaded) を呼び、失敗で throw する（呼び出し側で writeState(error)）。
 * ZIP 展開はここでは行わない — updater.bat 側で robocopy 前に行う想定に変更予定。
 */
export async function downloadRelease(
  release: ReleaseInfo,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  ensureUpdateDir();
  fs.mkdirSync(getStagingDir(), { recursive: true });

  assertAllowedHost(release.downloadUrl, "ZIP DL");

  // GitHub CDN の初回接続がまれに fetch failed（DNS / TLS 瞬時遅延）で失敗するので
  // 指数バックオフで最大 3 回リトライする。ユーザ体験を守るために必要。
  let res: Response | null = null;
  let lastError: unknown = null;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new Error("キャンセルされました");
    try {
      res = await fetch(release.downloadUrl, {
        signal,
        redirect: "follow",
        headers: {
          "User-Agent": `${GITHUB_OWNER}-${GITHUB_REPO}-updater`,
        },
      });
      break; // 成功
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      console.log(
        `[update/download] fetch attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`,
      );
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `ZIP DL 失敗: ネットワーク接続を確認してください (${message})`,
        );
      }
      // 指数バックオフ: 1s, 3s
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  if (!res) {
    throw new Error(
      `ZIP DL 失敗: fetch が予期せず失敗 (${lastError instanceof Error ? lastError.message : String(lastError)})`,
    );
  }

  // 302 追跡後の最終ホスト再検証（§4.2）
  assertAllowedHost(res.url || release.downloadUrl, "ZIP DL (final)");

  if (!res.ok) {
    throw new Error(`ZIP DL 失敗: HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("ZIP DL 失敗: レスポンスに body が無い");
  }

  const contentLengthHeader = res.headers.get("content-length");
  const declaredSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;
  const total = Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : 0;

  if (total > ZIP_SIZE_LIMIT) {
    throw new Error(
      `ZIP DL 失敗: サイズが上限を超えています (${Math.floor(total / 1024 / 1024)}MB > 200MB)`,
    );
  }

  const zipPath = getStagingZipPath(release.version);
  // 既存の同名 ZIP は削除して再 DL（部分書き込みを引きずらない）
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

  const writeStream = fs.createWriteStream(zipPath);
  let loaded = 0;

  try {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new Error("キャンセルされました");
      loaded += value.byteLength;
      if (loaded > ZIP_SIZE_LIMIT) {
        throw new Error(
          `ZIP DL 失敗: 実サイズが上限を超えました (>200MB)`,
        );
      }
      // Node の Writable.write は Uint8Array を受け付ける
      const ok = writeStream.write(value);
      if (!ok) {
        await new Promise<void>((resolve) => writeStream.once("drain", () => resolve()));
      }
      onProgress(loaded, total);
    }
  } finally {
    writeStream.end();
    await new Promise<void>((resolve) => writeStream.once("close", () => resolve()));
  }

  // §12.7 CR-6: Content-Length と実 byte 数の照合
  if (total > 0 && loaded !== total) {
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
    throw new Error(
      `ZIP DL 失敗: サイズ不一致（declared=${total}, actual=${loaded}）`,
    );
  }

  return zipPath;
}

/* ───────────── updater.bat log tail ───────────── */

/** モーダルの cmd log 表示に返す末尾行数（§12.8.5 UI モーダル）。 */
const LOG_TAIL_LINES = 30;

/**
 * `updater.bat` が tee している log の末尾 N 行を返す。UI モーダルが 2 秒間隔で polling する。
 * ファイルが存在しない or 空なら空配列。
 */
export function tailUpdaterLog(n = LOG_TAIL_LINES): string[] {
  const filePath = getUpdaterLogPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    // ログサイズが小さければ全部読んで tail、大きければ末尾から chunk 読み
    const stat = fs.statSync(filePath);
    if (stat.size < 128 * 1024) {
      const raw = fs.readFileSync(filePath, "utf8");
      return raw.split(/\r?\n/).filter((l) => l.length > 0).slice(-n);
    }
    // 128KB 超は末尾 128KB のみ読む（updater.bat の 1 回の出力はこれで足りる）
    const CHUNK = 128 * 1024;
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(CHUNK);
      fs.readSync(fd, buf, 0, CHUNK, stat.size - CHUNK);
      const text = buf.toString("utf8");
      // 先頭 1 行は途中で切れているので捨てる
      const lines = text.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
      return lines.slice(-n);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

/* ───────────── バックアップ管理 ───────────── */

/**
 * バックアップ世代掃除（§12.8.2: 1 代のみ保留）。
 * 現在の getCurrentVersion() より新しい or 現在と同じバックアップは残さない、
 * それ以前のバージョンで最新 1 個だけ残して他は削除する。
 */
export function sweepBackups(): void {
  const backups = listBackups();
  if (backups.length <= 1) return;
  // 1 代保留: 先頭（新しい方）だけ残して残りを削除
  const [keep, ...remove] = backups;
  for (const version of remove) {
    const dir = path.join(getBackupDir(), version);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[updater:sweep-backup] removed ${version} (kept ${keep})`);
    } catch (e) {
      console.error(`[updater:sweep-backup] failed to remove ${version}:`, e);
    }
  }
}
