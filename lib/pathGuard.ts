/**
 * パストラバーサル防御。base ディレクトリの内側にのみ target が存在することを保証する。
 *
 * v3 更新機構 §12 N4 で追加。既存 `lib/backup.ts` の 4 箇所（269 / 488 / 600 / 673 行）は
 * 同じ pattern `!resolved.startsWith(base + path.sep)` を直書きしていたが、`updater.ts` /
 * `restore` route から再利用するため関数化。
 *
 * 既存 backup.ts の書き換えは影響範囲が大きいため段階的（本 P1 では新規追加のみ）。
 */

import "server-only";
import path from "node:path";

/**
 * target が base（含む同一パス）の内側かどうか判定。ZIP エントリの展開先や
 * ユーザ入力ファイルパスの検証に使う。
 *
 * @returns target === base または target が base の子孫なら true
 */
export function isUnder(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return (
    resolvedTarget === resolvedBase ||
    resolvedTarget.startsWith(resolvedBase + path.sep)
  );
}

/**
 * `isUnder` の失敗で例外を投げる版。呼び出し側で throw する分岐を書くのを省ける。
 */
export function assertUnder(base: string, target: string, label = "パス"): void {
  if (!isUnder(base, target)) {
    throw new Error(`${label}が許可ディレクトリ外です: ${target}`);
  }
}
