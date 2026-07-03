// バックアップファイル構造の簡易検証（復号は行わない）
// 使い方: node scripts/verify-backup.mjs data/_backups/backup-YYYYMMDD-HHmm.enc.tar.gz
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/verify-backup.mjs <path>");
  process.exit(1);
}
const abs = path.resolve(target);
const buf = fs.readFileSync(abs);

const SALT = 16, IV = 12, TAG = 16;
const minLen = SALT + IV + TAG + 20; // 20 は gzip 最小サイズの目安
console.log("file :", abs);
console.log("size :", buf.length, "bytes");

if (buf.length < minLen) {
  console.log("[NG] ファイルが短すぎます（暗号ヘッダ+末尾で最低", minLen, "byte 必要）");
  process.exit(2);
}

const salt = buf.subarray(0, SALT);
const iv = buf.subarray(SALT, SALT + IV);
const tag = buf.subarray(buf.length - TAG);
const cipherLen = buf.length - SALT - IV - TAG;
console.log("salt :", salt.toString("hex"));
console.log("iv   :", iv.toString("hex"));
console.log("tag  :", tag.toString("hex"));
console.log("ciphertext size:", cipherLen, "bytes");
console.log("[OK] 構造は AES-256-GCM(salt16|iv12|ct|tag16) の想定と一致");
