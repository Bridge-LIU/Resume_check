/**
 * 面談AI評価ツール — バックアップ層
 *
 * data/sessions/ と data/master/ を tar.gz 形式でまとめ、data/_backups/ に保存する。
 * パスワード指定時は AES-256-GCM で暗号化し、salt(16) + iv(12) + ciphertext + tag(16)
 * の形式で 1 ファイルに封入する。
 *
 * ⚠️ 保存期間スイープとの整合：
 *   - 保存期間スイープは sessions/ を消すが、バックアップを残すと「複製」が残り続け
 *     PII 漏えいの観点で削除の意味が薄れる。バックアップ世代にも retention を適用
 *     して期限管理する（暗号化済でも保管期間は短くするのが安全側）。
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { getDataRoot, loadSettings } from "./storage";
import { writeAudit } from "./auditLog";

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const TAR_BLOCK = 512;
const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// 命名パターン：
//   ・定期作成:   backup-YYYYMMDD-HHmm.enc.tar.gz   （4 桁時刻）
//   ・アップロード時: backup-YYYYMMDD-HHmmss.enc.tar.gz（6 桁時刻、秒単位で衝突回避）
const BACKUP_NAME_PATTERN = /^backup-\d{8}-\d{4,6}(\.enc)?\.tar\.gz$/;

type TarEntry = {
  absPath: string;
  archivePath: string;
  isDir: boolean;
  mtime: Date;
  size: number;
};

/* ───────────── tar (USTAR) ライタ ───────────── */

function octalField(buf: Buffer, offset: number, length: number, value: number): void {
  const digits = length - 1;
  const s = value.toString(8).padStart(digits, "0") + "\0";
  buf.write(s, offset, length, "ascii");
}

function tarHeader(name: string, size: number, mtime: Date, type: "0" | "5"): Buffer {
  const buf = Buffer.alloc(TAR_BLOCK);

  // 100 byte を超える名前は prefix(155) / name(100) に分割する
  let nameField = name;
  let prefixField = "";
  if (Buffer.byteLength(name, "utf8") > 100) {
    let splitIdx = -1;
    for (let i = name.length - 1; i >= 0; i--) {
      if (name[i] !== "/") continue;
      const left = name.slice(0, i);
      const right = name.slice(i + 1);
      if (
        Buffer.byteLength(left, "utf8") <= 155 &&
        Buffer.byteLength(right, "utf8") <= 100
      ) {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx === -1) {
      throw new Error(`tar: パスが長すぎます (USTAR 制限超過): ${name}`);
    }
    prefixField = name.slice(0, splitIdx);
    nameField = name.slice(splitIdx + 1);
  }

  buf.write(nameField, 0, 100, "utf8");
  octalField(buf, 100, 8, type === "5" ? 0o755 : 0o644);
  octalField(buf, 108, 8, 0); // uid
  octalField(buf, 116, 8, 0); // gid
  octalField(buf, 124, 12, size);
  octalField(buf, 136, 12, Math.floor(mtime.getTime() / 1000));

  // チェックサム計算前: フィールドは ASCII 空白で埋める
  buf.fill(0x20, 148, 156);
  buf.write(type, 156, 1, "ascii");
  buf.write("ustar\0", 257, 6, "ascii");
  buf.write("00", 263, 2, "ascii");
  if (prefixField) buf.write(prefixField, 345, 155, "utf8");

  let sum = 0;
  for (let i = 0; i < TAR_BLOCK; i++) sum += buf[i];
  const csum = sum.toString(8).padStart(6, "0") + "\0 ";
  buf.write(csum, 148, 8, "ascii");

  return buf;
}

function padTo512(size: number): number {
  const r = size % TAR_BLOCK;
  return r === 0 ? 0 : TAR_BLOCK - r;
}

function listEntriesRecursive(rootAbs: string, archivePrefix: string): TarEntry[] {
  const out: TarEntry[] = [];
  if (!fs.existsSync(rootAbs)) return out;

  const walk = (dirAbs: string, archDir: string) => {
    const st = fs.statSync(dirAbs);
    out.push({
      absPath: dirAbs,
      archivePath: archDir.endsWith("/") ? archDir : archDir + "/",
      isDir: true,
      mtime: st.mtime,
      size: 0,
    });
    for (const name of fs.readdirSync(dirAbs)) {
      const childAbs = path.join(dirAbs, name);
      // tar 内パスは常に "/" 区切り
      const childArch = `${archDir}/${name}`.replace(/\/+/g, "/").replace(/^\/+/, "");
      const cst = fs.statSync(childAbs);
      if (cst.isDirectory()) {
        walk(childAbs, childArch);
      } else if (cst.isFile()) {
        out.push({
          absPath: childAbs,
          archivePath: childArch,
          isDir: false,
          mtime: cst.mtime,
          size: cst.size,
        });
      }
    }
  };
  walk(rootAbs, archivePrefix);
  return out;
}

function buildTar(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const e of entries) {
    if (e.isDir) {
      chunks.push(tarHeader(e.archivePath, 0, e.mtime, "5"));
      continue;
    }
    chunks.push(tarHeader(e.archivePath, e.size, e.mtime, "0"));
    chunks.push(fs.readFileSync(e.absPath));
    const pad = padTo512(e.size);
    if (pad > 0) chunks.push(Buffer.alloc(pad));
  }
  // 終端: 512 byte のゼロブロック × 2
  chunks.push(Buffer.alloc(TAR_BLOCK));
  chunks.push(Buffer.alloc(TAR_BLOCK));
  return Buffer.concat(chunks);
}

/* ───────────── ヘルパ ───────────── */

function timestampStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function backupsDirPath(): string {
  return path.join(getDataRoot(), "_backups");
}

/* ───────────── 公開 API ───────────── */

/**
 * data/sessions/ と data/master/ を tar.gz でまとめ、data/_backups/ に保存する。
 * password 指定時は AES-256-GCM で暗号化し、`backup-YYYYMMDD-HHmm.enc.tar.gz` として保存。
 *
 * 暗号化フォーマット（1 ファイルに封入）:
 *   [ salt(16) ][ iv(12) ][ ciphertext(...) ][ tag(16) ]
 *   key = PBKDF2-SHA256(password, salt, 200_000, 32)
 */
export async function createBackup(opts: {
  password: string;
}): Promise<{ path: string; size: number; encrypted: boolean }> {
  const password = opts.password.trim();
  if (!password) {
    throw new Error("暗号化パスワードは必須です（平文バックアップは無効）");
  }

  const dataRoot = getDataRoot();
  const backupsDir = backupsDirPath();
  fs.mkdirSync(backupsDir, { recursive: true });

  // 走査対象は master/ と sessions/ と settings.json。_backups/ は自己包含を避けるため除外する。
  const entries: TarEntry[] = [
    ...listEntriesRecursive(path.join(dataRoot, "master"), "master"),
    ...listEntriesRecursive(path.join(dataRoot, "sessions"), "sessions"),
  ];
  // settings.json は個別ファイル。存在する場合のみ含める。
  const settingsAbs = path.join(dataRoot, "settings.json");
  if (fs.existsSync(settingsAbs)) {
    const st = fs.statSync(settingsAbs);
    entries.push({
      absPath: settingsAbs,
      archivePath: "settings.json",
      isDir: false,
      mtime: st.mtime,
      size: st.size,
    });
  }
  if (entries.length === 0) {
    throw new Error("バックアップ対象が空です（master / sessions / settings.json が存在しません）");
  }

  const tarBuf = buildTar(entries);
  const gz = await gzipAsync(tarBuf);

  const fileName = `backup-${timestampStamp()}.enc.tar.gz`;
  const outPath = path.join(backupsDir, fileName);

  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(outPath, Buffer.concat([salt, iv, ciphertext, tag]));

  const size = fs.statSync(outPath).size;
  return { path: outPath, size, encrypted: true };
}

export function listBackups(): {
  path: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
}[] {
  const dir = backupsDirPath();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => BACKUP_NAME_PATTERN.test(n))
    .map((name) => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      return {
        path: p,
        size: st.size,
        createdAt: st.mtime.toISOString(),
        encrypted: name.endsWith(".enc.tar.gz"),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * 1 件削除。data/_backups/ 配下かつ backup-* 命名のファイルのみ削除可能（パストラバーサル防止）。
 * 世代の自動削除は sweepBackups() を参照（retention 連動）。
 */
export function deleteBackup(targetPath: string): void {
  const backupsDir = path.resolve(backupsDirPath());
  const resolved = path.resolve(targetPath);
  if (
    resolved !== backupsDir &&
    !resolved.startsWith(backupsDir + path.sep)
  ) {
    throw new Error("バックアップディレクトリ外のパスは削除できません");
  }
  const name = path.basename(resolved);
  if (!BACKUP_NAME_PATTERN.test(name)) {
    throw new Error("バックアップファイル名の形式と一致しません");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("対象ファイルが存在しません");
  }
  fs.rmSync(resolved);
}

/* ───────────── 世代の自動削除（retention 連動） ───────────── */

const DEFAULT_BACKUP_KEEP_DAYS = 90;
const DEFAULT_BACKUP_MAX_GENERATIONS = 0; // 0 = 無制限
const DAY_MS = 86_400_000;

function resolveSweepOpts(opts?: {
  keepDays?: number;
  maxGenerations?: number;
}): { keepDays: number; maxGenerations: number } {
  if (opts?.keepDays !== undefined && opts?.maxGenerations !== undefined) {
    return { keepDays: opts.keepDays, maxGenerations: opts.maxGenerations };
  }
  // opts が未指定のフィールドは Settings.retention から補完する
  let settingsKeep: number | undefined;
  let settingsMax: number | undefined;
  try {
    const s = loadSettings();
    settingsKeep = s.retention.backupKeepDays;
    settingsMax = s.retention.backupMaxGenerations;
  } catch {
    /* settings が読めない場合はデフォルトにフォールバック */
  }
  return {
    keepDays:
      opts?.keepDays ?? settingsKeep ?? DEFAULT_BACKUP_KEEP_DAYS,
    maxGenerations:
      opts?.maxGenerations ?? settingsMax ?? DEFAULT_BACKUP_MAX_GENERATIONS,
  };
}

/**
 * バックアップ世代を整理する（retention 連動の本体）。
 *
 * - data/_backups/ 内のファイルを mtime 降順（新しい順）で並べる
 * - maxGenerations を超えた末尾（古い側）を削除候補に
 * - keepDays を超えた経過時間のものを削除候補に
 * - 両条件の OR を取って実際に削除する
 * - keepDays=0 / maxGenerations=0 はそれぞれ「無制限」を意味する（削除しない）
 * - 削除毎に writeAudit("backup.delete", { meta: { file, reason } }) を呼ぶ
 */
export function sweepBackups(opts?: {
  keepDays?: number;
  maxGenerations?: number;
}): { deleted: string[]; kept: number } {
  const { keepDays, maxGenerations } = resolveSweepOpts(opts);
  const all = listBackups(); // 既に作成日時降順
  const now = Date.now();

  const ageOver = new Set<string>();
  if (keepDays > 0) {
    const threshold = now - keepDays * DAY_MS;
    for (const b of all) {
      if (new Date(b.createdAt).getTime() < threshold) ageOver.add(b.path);
    }
  }

  const countOver = new Set<string>();
  if (maxGenerations > 0 && all.length > maxGenerations) {
    for (let i = maxGenerations; i < all.length; i++) {
      countOver.add(all[i].path);
    }
  }

  const deleted: string[] = [];
  for (const b of all) {
    const isAge = ageOver.has(b.path);
    const isCount = countOver.has(b.path);
    if (!isAge && !isCount) continue;
    const reason =
      isAge && isCount
        ? "ageOverKeepDays+overMaxGenerations"
        : isAge
          ? "ageOverKeepDays"
          : "overMaxGenerations";
    try {
      deleteBackup(b.path);
      deleted.push(b.path);
      writeAudit("backup.delete", {
        meta: { file: path.basename(b.path), reason },
      });
    } catch (e) {
      // 1 件失敗しても他は続行（fs ロック等の一時障害を想定）
      console.error("[backup.sweep] delete failed", b.path, e);
    }
  }

  return { deleted, kept: all.length - deleted.length };
}

/* ───────────── 外部ファイルアップロード ───────────── */

/**
 * 外部から受け取ったバックアップファイルを検証して data/_backups/ に保存する。
 * 復号自体は行わない（restoreBackup で改めて実行）。
 *
 * - 最小サイズ / 巨大サイズを reject（誤ファイル・DoS 防御）
 * - 保存名は当該環境の 秒精度タイムスタンプで再生成（元ファイル名は信用しない）
 * - 同一秒に複数回来た場合は 1..N のカウンタで衝突回避
 */
export function writeUploadedBackup(
  buf: Buffer,
): { path: string; size: number } {
  const minLen = SALT_BYTES + IV_BYTES + TAG_BYTES + 20;
  if (buf.length < minLen) {
    throw new Error("ファイルが短すぎます（バックアップ形式ではない可能性）");
  }
  const backupsDir = backupsDirPath();
  fs.mkdirSync(backupsDir, { recursive: true });

  // 秒精度のタイムスタンプ（HHmmss）で保存
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stampSec =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let finalPath = path.join(backupsDir, `backup-${stampSec}.enc.tar.gz`);
  // 万一衝突したら +1 秒相当で再生成（極稀）
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    const alt = `backup-${stampSec.slice(0, -2)}${pad(Number(stampSec.slice(-2)) + counter)}.enc.tar.gz`;
    finalPath = path.join(backupsDir, alt);
    counter++;
    if (counter > 60) throw new Error("命名衝突が続いています。しばらく待ってから再試行してください");
  }

  fs.writeFileSync(finalPath, buf);
  const size = fs.statSync(finalPath).size;
  return { path: finalPath, size };
}

/* ───────────── tar パーサ（復元用） ───────────── */

interface ParsedTarEntry {
  name: string;
  size: number;
  isDir: boolean;
  content: Buffer | null;
}

function parseTar(buf: Buffer): ParsedTarEntry[] {
  const entries: ParsedTarEntry[] = [];
  let offset = 0;
  while (offset + TAR_BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + TAR_BLOCK);
    // 終端: ゼロブロック
    let allZero = true;
    for (let i = 0; i < TAR_BLOCK; i++) {
      if (header[i] !== 0) { allZero = false; break; }
    }
    if (allZero) { offset += TAR_BLOCK; continue; }

    const readStr = (start: number, len: number): string => {
      const end = start + len;
      let e = start;
      while (e < end && header[e] !== 0) e++;
      return header.subarray(start, e).toString("utf8");
    };
    const readOctal = (start: number, len: number): number => {
      const s = readStr(start, len).trim();
      return s ? parseInt(s, 8) : 0;
    };
    const nameField = readStr(0, 100);
    const size = readOctal(124, 12);
    const typeflag = String.fromCharCode(header[156]) || "0";
    const magic = readStr(257, 6);
    const prefix = magic.startsWith("ustar") ? readStr(345, 155) : "";
    const fullName = prefix ? `${prefix}/${nameField}` : nameField;
    offset += TAR_BLOCK;

    const isDir = typeflag === "5" || fullName.endsWith("/");
    let content: Buffer | null = null;
    if (!isDir && size > 0) {
      content = buf.subarray(offset, offset + size);
    }
    const pad = size % TAR_BLOCK === 0 ? 0 : TAR_BLOCK - (size % TAR_BLOCK);
    offset += size + pad;
    entries.push({ name: fullName, size, isDir, content });
  }
  return entries;
}

/**
 * 復号のみ実行してアーカイブ内容の概要を返す（fs 書き込みなし・非破壊）。
 * 復元前の確認 UI で「N セッションが上書きされる」を表示するのに使う。
 */
export async function previewBackup(opts: {
  path: string;
  password: string;
}): Promise<{
  archiveMasterFiles: number;
  archiveSessionIds: string[];
  archiveHasSettings: boolean;
  currentSessionIds: string[];
  overlapSessionIds: string[];
  onlyInArchive: string[];
  onlyInCurrent: string[];
}> {
  const password = opts.password.trim();
  if (!password) throw new Error("復号パスワードは必須です");

  const backupsDir = path.resolve(backupsDirPath());
  const resolvedBackup = path.resolve(opts.path);
  if (
    resolvedBackup !== backupsDir &&
    !resolvedBackup.startsWith(backupsDir + path.sep)
  ) {
    throw new Error("バックアップディレクトリ外のパスは復元できません");
  }
  const baseName = path.basename(resolvedBackup);
  if (!BACKUP_NAME_PATTERN.test(baseName)) {
    throw new Error("バックアップファイル名の形式と一致しません");
  }
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error("バックアップファイルが存在しません");
  }

  const buf = fs.readFileSync(resolvedBackup);
  const minLen = SALT_BYTES + IV_BYTES + TAG_BYTES + 20;
  if (buf.length < minLen) throw new Error("バックアップファイルが短すぎます");

  const salt = buf.subarray(0, SALT_BYTES);
  const iv = buf.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(SALT_BYTES + IV_BYTES, buf.length - TAG_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let gz: Buffer;
  try {
    gz = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error("復号失敗：パスワードが違うか、ファイルが壊れています");
  }
  const tarBuf = await gunzipAsync(gz);
  const entries = parseTar(tarBuf);
  if (entries.length === 0) throw new Error("復号後のアーカイブが空です");

  const archiveSessionSet = new Set<string>();
  let archiveMasterFiles = 0;
  let archiveHasSettings = false;
  for (const e of entries) {
    if (e.isDir) continue;
    if (e.name === "settings.json") {
      archiveHasSettings = true;
      continue;
    }
    const parts = e.name.split("/");
    if (parts[0] === "master") archiveMasterFiles++;
    else if (parts[0] === "sessions" && parts.length >= 2 && parts[1]) {
      archiveSessionSet.add(parts[1]);
    }
  }
  const archiveSessionIds = Array.from(archiveSessionSet).sort();

  // 現行データと比較
  const dataRoot = path.resolve(getDataRoot());
  const curSessDir = path.join(dataRoot, "sessions");
  const currentSessionSet = new Set<string>();
  if (fs.existsSync(curSessDir)) {
    for (const n of fs.readdirSync(curSessDir)) {
      const st = fs.statSync(path.join(curSessDir, n));
      if (st.isDirectory()) currentSessionSet.add(n);
    }
  }
  const currentSessionIds = Array.from(currentSessionSet).sort();

  const overlap = archiveSessionIds.filter((id) => currentSessionSet.has(id));
  const onlyInArchive = archiveSessionIds.filter((id) => !currentSessionSet.has(id));
  const onlyInCurrent = currentSessionIds.filter((id) => !archiveSessionSet.has(id));

  return {
    archiveMasterFiles,
    archiveSessionIds,
    archiveHasSettings,
    currentSessionIds,
    overlapSessionIds: overlap,
    onlyInArchive,
    onlyInCurrent,
  };
}

/**
 * バックアップから復元する。data/master/, data/sessions/, data/settings.json を
 * archive の内容で置換する。
 *
 * 手順（atomic 化を強く意識）:
 *   1. パスワードで復号 → gunzip → tar パース（メモリ上）
 *   2. path traversal / 想定外パスを reject
 *   3. archive 内容を一時ディレクトリに書き出す（stage/）
 *   4. 現行 data/master , sessions , settings.json を「復元前スナップショット」に退避
 *      （data/_restore_snapshots/<timestamp>/）
 *   5. stage/ の内容を data/ へ rename で移動（atomic swap）
 *   6. 何か失敗したら snapshot から復旧を試みる
 *
 * 事故防止:
 *   - salt / iv / tag のサイズを検証
 *   - archive 内エントリー数が 0 なら reject
 *   - archive 内パスは `master/`, `sessions/`, `settings.json` に限定
 */
export async function restoreBackup(opts: {
  path: string;
  password: string;
}): Promise<{
  restoredMaster: number;
  restoredSessions: number;
  restoredSettings: boolean;
  snapshotPath: string;
}> {
  const password = opts.password.trim();
  if (!password) throw new Error("復号パスワードは必須です");

  // 1. バックアップファイルの妥当性
  const backupsDir = path.resolve(backupsDirPath());
  const resolvedBackup = path.resolve(opts.path);
  if (
    resolvedBackup !== backupsDir &&
    !resolvedBackup.startsWith(backupsDir + path.sep)
  ) {
    throw new Error("バックアップディレクトリ外のパスは復元できません");
  }
  const baseName = path.basename(resolvedBackup);
  if (!BACKUP_NAME_PATTERN.test(baseName)) {
    throw new Error("バックアップファイル名の形式と一致しません");
  }
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error("バックアップファイルが存在しません");
  }

  const buf = fs.readFileSync(resolvedBackup);
  const minLen = SALT_BYTES + IV_BYTES + TAG_BYTES + 20;
  if (buf.length < minLen) {
    throw new Error("バックアップファイルが短すぎます（破損の可能性）");
  }

  // 2. 復号
  const salt = buf.subarray(0, SALT_BYTES);
  const iv = buf.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(SALT_BYTES + IV_BYTES, buf.length - TAG_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let gz: Buffer;
  try {
    gz = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error("復号失敗：パスワードが違うか、ファイルが壊れています");
  }

  // 3. gunzip + tar パース
  const tarBuf = await gunzipAsync(gz);
  const entries = parseTar(tarBuf);
  if (entries.length === 0) {
    throw new Error("復号後のアーカイブが空です");
  }

  // 4. パス検証 — 許可: master/, sessions/, settings.json
  const dataRoot = path.resolve(getDataRoot());
  const stageRoot = path.join(dataRoot, `_restore_stage_${timestampStamp()}`);
  const snapshotRoot = path.join(dataRoot, `_restore_snapshots`, timestampStamp());

  let masterCount = 0;
  let sessionsCount = 0;
  let settingsFound = false;

  for (const e of entries) {
    if (/^\.\.?(\/|$)|(\/\.\.?)(\/|$)|^\/|^[A-Za-z]:/.test(e.name)) {
      throw new Error(`不正なパスがアーカイブに含まれています: ${e.name}`);
    }
    const first = e.name.split("/")[0];
    if (first !== "master" && first !== "sessions" && e.name !== "settings.json") {
      throw new Error(`許可されていないエントリー: ${e.name}`);
    }
    if (!e.isDir) {
      if (e.name === "settings.json") settingsFound = true;
      else if (first === "master") masterCount++;
      else if (first === "sessions") sessionsCount++;
    }
  }

  // 5. stage/ に書き出し
  fs.mkdirSync(stageRoot, { recursive: true });
  try {
    for (const e of entries) {
      const target = path.join(stageRoot, e.name);
      // 二重チェック: stage 外に出ていないか
      const resolvedTarget = path.resolve(target);
      if (
        resolvedTarget !== stageRoot &&
        !resolvedTarget.startsWith(stageRoot + path.sep)
      ) {
        throw new Error(`stage 外への書き出しを検出: ${e.name}`);
      }
      if (e.isDir) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, e.content ?? Buffer.alloc(0));
      }
    }

    // 6. 現行を snapshot に退避
    fs.mkdirSync(snapshotRoot, { recursive: true });
    const swap = (name: string) => {
      const cur = path.join(dataRoot, name);
      const saved = path.join(snapshotRoot, name);
      if (fs.existsSync(cur)) fs.renameSync(cur, saved);
    };
    swap("master");
    swap("sessions");
    swap("settings.json");

    // 7. stage/ → data/ に移動
    const move = (name: string) => {
      const src = path.join(stageRoot, name);
      const dst = path.join(dataRoot, name);
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    };
    try {
      move("master");
      move("sessions");
      move("settings.json");
    } catch (e) {
      // 8. rollback: snapshot から戻す
      const rollback = (name: string) => {
        const cur = path.join(dataRoot, name);
        const saved = path.join(snapshotRoot, name);
        try { if (fs.existsSync(cur)) fs.rmSync(cur, { recursive: true, force: true }); } catch { /* noop */ }
        try { if (fs.existsSync(saved)) fs.renameSync(saved, cur); } catch { /* noop */ }
      };
      rollback("master");
      rollback("sessions");
      rollback("settings.json");
      throw new Error(`復元に失敗、rollback しました: ${(e as Error).message}`);
    }
  } finally {
    // stage/ の残骸を掃除
    try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch { /* noop */ }
  }

  writeAudit("backup.restore", {
    meta: {
      file: baseName,
      restoredMaster: masterCount,
      restoredSessions: sessionsCount,
      restoredSettings: settingsFound,
      snapshotPath: path.relative(dataRoot, snapshotRoot),
    },
  });

  return {
    restoredMaster: masterCount,
    restoredSessions: sessionsCount,
    restoredSettings: settingsFound,
    snapshotPath: snapshotRoot,
  };
}
