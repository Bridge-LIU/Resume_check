/**
 * エディション判定。
 *
 * 起動 .bat が環境変数 EDITION=lite|full をセットして `npm run dev` / `npm start` する。
 * 未指定は "lite" 扱い（＝安全側：貼付版のみ有効）。
 *
 * 使い方（Server Component / Route Handler / Server Action）:
 *   import { isFullEdition } from "@/lib/edition";
 *   if (isFullEdition()) { ... }
 *
 * Client Component からはこの関数を直接呼ばない。
 * layout.tsx (Server) で判定 → EditionProvider → useEdition() で読む。
 */

export type Edition = "lite" | "full";

export function getEdition(): Edition {
  const raw = (process.env.EDITION ?? "").trim().toLowerCase();
  return raw === "full" ? "full" : "lite";
}

export function isFullEdition(): boolean {
  return getEdition() === "full";
}
