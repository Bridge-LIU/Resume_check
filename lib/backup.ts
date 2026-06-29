/**
 * 面談AI評価ツール — バックアップ層（Phase 4）
 *
 * data/sessions/ と data/master/ を tar.gz 形式でまとめ、data/_backups/ に保存する。
 * パスワード指定時は AES-256-GCM で暗号化し、salt(16) + iv(12) + ciphertext + tag(16)
 * の形式で 1 ファイルに封入する。
 *
 * ⚠️ §7.5 / §11 との整合（別タスク）：
 *   - 保存期間スイープは sessions/ を消すが、バックアップを残すと「複製」が残り続け
 *     PII 漏えいの観点で削除の意味が薄れる。バックアップ世代にも `retention` を適用
 *     して期限管理する必要がある（暗号化済でも保管期間は短くするのが安全側）。
 *   - 本ファイルでは作成/列挙/削除のみを提供し、retention の自動適用は別タスクに切り出す。
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

const TAR_BLOCK = 512;
const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const BACKUP_NAME_PATTERN = /^backup-\d{8}-\d{4}(\.enc)?\.tar\.gz$/;

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
    throw new Error(
      "暗号化パスワードは必須です（設計書 §11 / 平文バックアップは禁止）",
    );
  }

  const dataRoot = getDataRoot();
  const backupsDir = backupsDirPath();
  fs.mkdirSync(backupsDir, { recursive: true });

  // 走査対象は master/ と sessions/ のみ。_backups/ は自己包含を避けるため除外する。
  const entries: TarEntry[] = [
    ...listEntriesRecursive(path.join(dataRoot, "master"), "master"),
    ...listEntriesRecursive(path.join(dataRoot, "sessions"), "sessions"),
  ];
  if (entries.length === 0) {
    throw new Error("バックアップ対象が空です（master / sessions が存在しません）");
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
 * 世代の自動削除は sweepBackups() を参照（§7.5 / §11 の retention 連動）。
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

/* ───────────── 世代の自動削除（§7.5 / §11 連動） ───────────── */

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
 * バックアップ世代を整理する（§7.5 / §11 の retention 連動の本体）。
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
