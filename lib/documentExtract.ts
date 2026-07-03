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
 * - XLSX: ExcelJS でシートごとに Markdown 表へ整形
 *
 * Claude の document ブロック（PDF ネイティブ）を使わず、すべてテキスト送信に揃えることで
 * 入力トークン量・処理時間・コードパスを最小化する。
 *
 * 注: 旧 .xls（BIFF 形式）は ExcelJS が読めないため、本実装では .xlsx のみ対応。
 * .xls がアップロードされた場合は load 時に throw され、ユーザに再保存を促す。
 * （以前は SheetJS の xlsx パッケージで対応していたが、CVE 履歴 + npm 公式配布なし
 *  のためアンインストールし、ExcelJS に統一した。）
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
      `対応していないファイル形式です: ${fileName}（${mimeType || "不明な MIME"}）。PDF / Word(.docx) / Excel(.xlsx) のみ受け付けます。`,
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

  // xlsx — ExcelJS で .xlsx を読み出す
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // Node の Buffer<ArrayBuffer> 型は ExcelJS の古い Buffer 型と非互換のため
  // 明示的に ArrayBuffer を切り出して渡す（参照ではなく独立コピー）。
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  try {
    await wb.xlsx.load(arrayBuffer);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Excel ファイルを読み込めませんでした: ${fileName}。` +
        `古い形式 (.xls) の場合は Excel で「.xlsx」として保存し直してください。詳細: ${detail}`,
    );
  }
  const parts: string[] = [];
  for (const ws of wb.worksheets) {
    const md = sheetToMarkdown(ws);
    parts.push(`## シート: ${ws.name}\n\n${md}`);
  }
  return {
    text: parts.join("\n\n").trim(),
    kind,
    fileName,
    sheetCount: wb.worksheets.length,
  };
}

/** ExcelJS のセル値を 1 行の文字列に正規化する（リッチテキスト / 数式 / ハイパーリンク等を吸収） */
function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // リッチテキスト（フォント装飾付き）
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((r) => {
          const t = (r as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        })
        .join("");
    }
    // ハイパーリンクセル
    if (typeof o.text === "string") return o.text;
    // 数式セル（result があれば再帰）
    if ("result" in o) return cellToStr(o.result);
    // それ以外（ShareString / FormulaError 等）は JSON 化で逃がす
    return JSON.stringify(v);
  }
  return String(v);
}

/** ExcelJS の Worksheet を Markdown 表に変換（先頭行を見出しとして扱う） */
function sheetToMarkdown(ws: import("exceljs").Worksheet): string {
  const escape = (s: string) =>
    s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();

  const rowsRaw: string[][] = [];
  let maxCols = 0;
  // includeEmpty: false でも row 内のセルは 1-indexed の sparse 配列。
  // 安全に配列化するため row.values をスキャンする。
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]; // [0] は undefined
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(escape(cellToStr(values[i])));
    }
    // 全セル空ならスキップ（SheetJS の blankrows:false 相当）
    if (cells.some((c) => c.length > 0)) {
      rowsRaw.push(cells);
      if (cells.length > maxCols) maxCols = cells.length;
    }
  });

  if (rowsRaw.length === 0) return "（空）";

  const lines: string[] = [];
  rowsRaw.forEach((row, i) => {
    const padded = Array.from({ length: maxCols }, (_, j) => row[j] ?? "");
    lines.push("| " + padded.join(" | ") + " |");
    if (i === 0) {
      lines.push("|" + Array(maxCols).fill(" --- ").join("|") + "|");
    }
  });
  return lines.join("\n");
}
