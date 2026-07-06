/**
 * 履歴書ファイルの種別判定（Client / Server 共通）。
 * 実際のテキスト抽出は server-only な lib/documentExtract.ts 側で行う。
 */

export type ResumeKind = "pdf" | "docx" | "doc" | "xlsx";

// .xls (BIFF 形式) は「ブラウザ側で SheetJS で .xlsx に変換してからサーバへ」に統一。
// サーバ側は常に .xlsx 以降しか触らない → Node プロセスが SheetJS CVE の攻撃面にならない。
// Chrome/Edge/Firefox/Safari 等の V8/SpiderMonkey/JSC サンドボックス内で解析されるため
// Prototype Pollution が発生しても影響はそのブラウザ tab のみで完結する。
// .doc は word-extractor（MIT / CVE 無し）でサーバ側テキスト抽出。
const EXT_TO_KIND: Record<string, ResumeKind> = {
  pdf: "pdf",
  docx: "docx",
  doc: "doc",
  xlsx: "xlsx",
};

const MIME_TO_KIND: Record<string, ResumeKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/**
 * ファイル入力の accept 属性に渡す MIME + 拡張子。
 * .xls / application/vnd.ms-excel も許可するが、
 * これらは Section2Candidate 側で .xlsx にブラウザ変換されてから使われる。
 */
export const RESUME_FILE_ACCEPT =
  ".pdf,.docx,.doc,.xlsx,.xls,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel";

/** 選ばれたファイルが旧 .xls かどうかを判定（ブラウザ側変換の要否判定用） */
export function isLegacyXls(mimeType: string, fileName: string): boolean {
  if (mimeType === "application/vnd.ms-excel") return true;
  return fileName.toLowerCase().endsWith(".xls");
}

export function detectResumeKind(
  mimeType: string,
  fileName: string,
): ResumeKind | null {
  if (mimeType && MIME_TO_KIND[mimeType]) return MIME_TO_KIND[mimeType];
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXT_TO_KIND[ext] ?? null;
}

export function kindLabel(kind: ResumeKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "docx":
      return "Word";
    case "doc":
      return "Word(旧)";
    case "xlsx":
      return "Excel";
  }
}

export function kindIcon(kind: ResumeKind): string {
  switch (kind) {
    case "pdf":
      return "📄";
    case "docx":
      return "📝";
    case "doc":
      return "📝";
    case "xlsx":
      return "📊";
  }
}
