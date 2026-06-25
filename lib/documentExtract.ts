import "server-only";

import { detectResumeKind, kindLabel, type ResumeKind } from "./resumeKind";

export { detectResumeKind, kindLabel };
export type { ResumeKind };

/**
 * 履歴書ファイル（PDF / DOCX / XLSX）からテキストを抽出する。
 *
 * 方針：「ローカル変換 → text ブロックで Claude へ送信」に統一。
 * - PDF: unpdf でテキスト抽出（Next.js サーバビルドで worker 不要）
 * - DOCX: mammoth で本文抽出
 * - XLSX: SheetJS でシートごとに Markdown 表へ整形
 *
 * Claude の document ブロック（PDF ネイティブ）を使わず、すべてテキスト送信に揃えることで
 * 入力トークン量・処理時間・コードパスを最小化する。
 */

export interface ResumeExtractResult {
  text: string;
  kind: ResumeKind;
  fileName: string;
  /** PDF のページ数（unpdf 由来） */
  pageCount?: number;
  /** XLSX のシート数 */
  sheetCount?: number;
}

/** 履歴書ファイルからテキストを抽出。失敗時は例外 throw。 */
export async function extractResumeText(
  base64: string,
  mimeType: string,
  fileName: string,
): Promise<ResumeExtractResult> {
  const kind = detectResumeKind(mimeType, fileName);
  if (!kind) {
    throw new Error(
      `対応していないファイル形式です: ${fileName}（${mimeType || "不明な MIME"}）。PDF / Word(.docx) / Excel(.xlsx / .xls) のみ受け付けます。`,
    );
  }

  const buffer = Buffer.from(base64, "base64");

  if (kind === "pdf") {
    // unpdf は serverless/Node 両対応で web worker を要求しない。
    // pdf-parse(v2) / pdfjs-dist 直接利用だと Next.js のサーバ側で worker パスが
    // 解決できず失敗するため、Vercel 製の unpdf を採用する。
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    const pdf = await getDocumentProxy(data);
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text)
      ? result.text.join("\n")
      : result.text;
    return {
      text: (text ?? "").trim(),
      kind,
      fileName,
      pageCount: result.totalPages,
    };
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: (result.value ?? "").trim(),
      kind,
      fileName,
    };
  }

  // xlsx
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const md = sheetToMarkdown(sheet, XLSX);
    parts.push(`## シート: ${name}\n\n${md}`);
  }
  return {
    text: parts.join("\n\n").trim(),
    kind,
    fileName,
    sheetCount: wb.SheetNames.length,
  };
}

/** XLSX の sheet を Markdown 表に変換（先頭行を見出しとして扱う） */
function sheetToMarkdown(
  sheet: import("xlsx").WorkSheet,
  XLSX: typeof import("xlsx"),
): string {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (rows.length === 0) return "（空）";

  const cellToStr = (c: unknown) =>
    c == null
      ? ""
      : String(c).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

  const maxCols = Math.max(...rows.map((r) => r.length));
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const padded = Array.from({ length: maxCols }, (_, j) =>
      cellToStr(row[j]),
    );
    lines.push("| " + padded.join(" | ") + " |");
    if (i === 0) {
      lines.push("|" + Array(maxCols).fill(" --- ").join("|") + "|");
    }
  });
  return lines.join("\n");
}
