/**
 * バージョン取得 & SemVer 比較。v3 更新機構 §12 N2 で追加。
 *
 * ⚠️ `package.json` の `version` は **runtime で fs.readFileSync** して読む。
 * `import pkg from '@/package.json'` は Turbopack で build 時に inline されるため、
 * 更新後に新 `package.json` がディスク上にあっても次回 build までは旧値が返る。
 * その結果 `applying` 状態の「バージョン差で成功検知」が永遠に成立しない。
 * 詳細: §2.1 バージョン基準 / §4.1
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";

/** GitHub Release を取得する repository の owner/name。 */
export const GITHUB_OWNER = "Bridge-LIU";
export const GITHUB_REPO = "Resume_check";

/**
 * 現在バージョンを runtime で読む。fs 読みが失敗した場合は "0.0.0" を返す
 * （バージョン取得失敗で API が 500 するのは避け、UI 側で「不明」表示させる）。
 *
 * ⚠️ process.cwd() を意図的に使う（getProjectRoot() ではない）。理由:
 * standalone モードでは cwd = .next/standalone/ で、Next.js standalone build が
 * ここに package.json を自動同梱する（"version" フィールド含む）。dev モードでも
 * cwd = プロジェクト根 = package.json 位置なので両モードで動く。
 * getProjectRoot() は pkg 根を返すが、pkg 根に package.json は copy されないため
 * "0.0.0" fallback に落ち、選 update の完了検知が壊れる。
 */
export function getCurrentVersion(): string {
  try {
    // eslint-disable-next-line no-restricted-syntax
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
    return "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * SemVer x.y.z の 3 要素比較。事前に `normalizeTag()` で prefix を除去してから渡す想定。
 * 3 要素より短い場合は 0 を補って比較する（"1.2" は "1.2.0" とみなす）。
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((s) => parseInt(s, 10));
  const pb = b.split(".").map((s) => parseInt(s, 10));
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const na = Number.isFinite(pa[i]) ? pa[i] : 0;
    const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * GitHub Release の `tag_name`（"v0.2.0" / "0.2.0" 等）を SemVer 文字列に正規化。
 * SemVer として解釈できない場合は null を返す（呼び出し側で GitHub API のノイズを弾く）。
 */
export function normalizeTag(tag: string): string | null {
  if (typeof tag !== "string") return null;
  const trimmed = tag.trim().replace(/^v/i, "");
  if (!/^\d+\.\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}
