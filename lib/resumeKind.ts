/**
 * 履歴書ファイルの種別判定（Client / Server 共通）。
 * 実際のテキスト抽出は server-only な lib/documentExtract.ts 側で行う。
 */

export type ResumeKind = "pdf" | "docx" | "xlsx";

const EXT_TO_KIND: Record<string, ResumeKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
};

const MIME_TO_KIND: Record<string, ResumeKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
};

/** ファイル入力の accept 属性に渡す MIME + 拡張子 */
export const RESUME_FILE_ACCEPT =
  ".pdf,.docx,.xlsx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
    case "xlsx":
      return "📊";
  }
}
