/**
 * sessions.xlsx の中身を CLI で確認するためのスクリプト。
 * 「軸別評価」列が実際にどう保存されているかを目視確認用。
 *
 * 使い方: node scripts/preview-xlsx-cells.mjs
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = path.resolve(__dirname, "..", "data", "exports", "面談者一覧.xlsx");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

const ws = wb.worksheets[0];
console.log(`📄 sheet: ${ws.name}  (rows: ${ws.rowCount}, cols: ${ws.columnCount})\n`);

// 1 行目（ヘッダ）
const header = ws.getRow(1).values;
console.log("== ヘッダ ==");
for (let i = 1; i < header.length; i++) {
  console.log(`  [${i}] ${header[i]}`);
}
console.log();

// 各データ行の「候補者」と「軸別評価」を表示
// ヘッダから列番号を取得
const colCandidate = header.findIndex((v) => v === "候補者");
const colAxis = header.findIndex((v) => v === "軸別評価");

for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const name = row.getCell(colCandidate).value;
  const axisCell = row.getCell(colAxis).value;

  console.log("=".repeat(60));
  console.log(`行 ${r}: ${name}`);
  console.log("=".repeat(60));

  if (axisCell == null) {
    console.log("(空)");
    continue;
  }

  if (typeof axisCell === "object" && Array.isArray(axisCell.richText)) {
    console.log("[richText 形式]");
    for (const block of axisCell.richText) {
      const f = block.font ?? {};
      const tag = `${f.bold ? "B" : " "}${f.color?.argb ? ` color=${f.color.argb}` : ""} size=${f.size ?? "?"}`;
      // 改行を <↵> で可視化
      const displayText = block.text.replace(/\n/g, "<↵>");
      console.log(`  [${tag}] "${displayText}"`);
    }
    console.log();
    console.log("--- 実際にセルに見える文字列（改行付き） ---");
    const concat = axisCell.richText.map((b) => b.text).join("");
    console.log(concat);
  } else {
    console.log("[プレーンテキスト形式]");
    console.log(String(axisCell));
  }
  console.log();
}
