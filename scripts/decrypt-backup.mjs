/**
 * 暗号化バックアップ（backup-YYYYMMDD-HHmm.enc.tar.gz）を復号 + 展開する CLI。
 *
 * 使い方:
 *   node scripts/decrypt-backup.mjs <backup-path> <output-dir> [--password <pw>]
 *
 * 例:
 *   node scripts/decrypt-backup.mjs data/_backups/backup-20260702-1034.enc.tar.gz restored/
 *
 * パスワードは --password で渡すか、対話プロンプトで入力する。
 * 出力先ディレクトリが既に master/ か sessions/ を含む場合は上書きせず終了する
 * （事故防止）。
 *
 * lib/backup.ts の暗号化フォーマットに対応:
 *   [ salt(16) ][ iv(12) ][ ciphertext ][ tag(16) ]
 *   key = PBKDF2-SHA256(password, salt, 200_000, 32)
 *   AES-256-GCM
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import readline from "node:readline";
import { promisify } from "node:util";

const gunzipAsync = promisify(zlib.gunzip);

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PBKDF2_ITERATIONS = 200_000;
const TAR_BLOCK = 512;

function parseArgs(argv) {
  const args = { _: [], password: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password") {
      args.password = argv[++i];
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printUsage() {
  console.log(
    "Usage: node scripts/decrypt-backup.mjs <backup-path> <output-dir> [--password <pw>]",
  );
}

async function promptPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  // TTY のときはエコーを消す
  const stdin = process.stdin;
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  return new Promise((resolve) => {
    process.stdout.write("暗号化パスワード: ");
    let pw = "";
    const onData = (buf) => {
      const s = buf.toString("utf8");
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        if (code === 0x0d || code === 0x0a) {
          stdin.removeListener("data", onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          rl.close();
          process.stdout.write("\n");
          resolve(pw);
          return;
        }
        if (code === 0x03) {
          // Ctrl+C
          process.exit(130);
        }
        if (code === 0x7f || code === 0x08) {
          pw = pw.slice(0, -1);
          continue;
        }
        pw += ch;
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

function parseTar(buf) {
  const entries = [];
  let offset = 0;
  while (offset + TAR_BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + TAR_BLOCK);
    // 終端: ゼロブロック
    let allZero = true;
    for (let i = 0; i < TAR_BLOCK; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      offset += TAR_BLOCK;
      continue;
    }
    const readStr = (start, len) => {
      const end = start + len;
      let e = start;
      while (e < end && header[e] !== 0) e++;
      return header.subarray(start, e).toString("utf8");
    };
    const readOctal = (start, len) => {
      const s = readStr(start, len).trim();
      return s ? parseInt(s, 8) : 0;
    };
    const nameField = readStr(0, 100);
    const size = readOctal(124, 12);
    const mtime = readOctal(136, 12);
    const typeflag = String.fromCharCode(header[156]) || "0";
    const magic = readStr(257, 6);
    let prefix = "";
    if (magic === "ustar" || magic.startsWith("ustar")) {
      prefix = readStr(345, 155);
    }
    const fullName = prefix ? `${prefix}/${nameField}` : nameField;
    offset += TAR_BLOCK;

    const isDir = typeflag === "5" || fullName.endsWith("/");
    let content = null;
    if (!isDir && size > 0) {
      content = buf.subarray(offset, offset + size);
      const pad = size % TAR_BLOCK === 0 ? 0 : TAR_BLOCK - (size % TAR_BLOCK);
      offset += size + pad;
    } else if (isDir) {
      const pad = size % TAR_BLOCK === 0 ? 0 : TAR_BLOCK - (size % TAR_BLOCK);
      offset += size + pad;
    }

    entries.push({ name: fullName, size, mtime, isDir, content });
  }
  return entries;
}

function safeJoin(baseAbs, relPath) {
  // path traversal 拒否: base の外に出るような相対パスは無効
  const joined = path.resolve(baseAbs, relPath);
  const baseWithSep = baseAbs.endsWith(path.sep) ? baseAbs : baseAbs + path.sep;
  if (joined !== baseAbs && !joined.startsWith(baseWithSep)) {
    throw new Error(`unsafe path in archive: ${relPath}`);
  }
  return joined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length < 2) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }
  const backupPath = path.resolve(args._[0]);
  const outDir = path.resolve(args._[1]);

  if (!fs.existsSync(backupPath)) {
    console.error("[NG] バックアップファイルが存在しません:", backupPath);
    process.exit(1);
  }
  if (fs.existsSync(outDir)) {
    const st = fs.statSync(outDir);
    if (!st.isDirectory()) {
      console.error("[NG] 出力先はディレクトリを指定してください:", outDir);
      process.exit(1);
    }
    if (
      fs.existsSync(path.join(outDir, "master")) ||
      fs.existsSync(path.join(outDir, "sessions"))
    ) {
      console.error(
        "[NG] 出力先に既に master/ または sessions/ が存在します。別のディレクトリを指定してください:",
        outDir,
      );
      process.exit(1);
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const password = args.password ?? (await promptPassword());
  if (!password) {
    console.error("[NG] パスワードが空です");
    process.exit(1);
  }

  const buf = fs.readFileSync(backupPath);
  const minLen = SALT_BYTES + IV_BYTES + TAG_BYTES + 20;
  if (buf.length < minLen) {
    console.error("[NG] ファイルが短すぎます");
    process.exit(1);
  }

  const salt = buf.subarray(0, SALT_BYTES);
  const iv = buf.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(SALT_BYTES + IV_BYTES, buf.length - TAG_BYTES);

  console.log("[1/4] PBKDF2 で鍵導出中 (200,000 回反復)…");
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_BYTES,
    "sha256",
  );

  console.log("[2/4] AES-256-GCM で復号中…");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let gz;
  try {
    gz = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (e) {
    console.error(
      "[NG] 復号失敗。パスワード違い、またはファイルが壊れています:",
      e?.message ?? e,
    );
    process.exit(2);
  }

  console.log("[3/4] gunzip 中…");
  const tarBuf = await gunzipAsync(gz);

  console.log("[4/4] tar 展開中… →", outDir);
  const entries = parseTar(tarBuf);
  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;
  for (const e of entries) {
    const target = safeJoin(outDir, e.name);
    if (e.isDir) {
      fs.mkdirSync(target, { recursive: true });
      dirCount++;
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.content ?? Buffer.alloc(0));
      if (e.mtime) {
        const t = new Date(e.mtime * 1000);
        fs.utimesSync(target, t, t);
      }
      fileCount++;
      totalBytes += e.size;
    }
  }

  console.log(
    `[OK] 展開完了: ${fileCount} ファイル / ${dirCount} ディレクトリ / 合計 ${totalBytes} bytes`,
  );
  console.log("     出力先:", outDir);
  console.log("");
  console.log("次のステップ（本番データを差し戻したい場合）:");
  console.log("  1. アプリを停止（コマンドプロンプトで Ctrl+C）");
  console.log("  2. data/master/ と data/sessions/ を退避（別フォルダにコピー）");
  console.log(
    `  3. ${path.join(outDir, "master")} と ${path.join(outDir, "sessions")} を data/ 直下に配置`,
  );
  console.log("  4. アプリ再起動");
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
