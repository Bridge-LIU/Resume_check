// 履歴書 3 形式（PDF / DOCX / XLSX）のテスト用サンプルを生成し、
// そのまま unpdf / mammoth / xlsx で抽出し直して中身を確認するスクリプト。
//
// 実行: node scripts/gen-resume-samples.mjs
// 出力: test-files/sample-resume.{pdf,docx,xlsx}

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "test-files");

const CAND = {
  name: "高橋 太郎",
  age: 32,
  role: "サーバサイドエンジニア",
  summary:
    "Web 系の SaaS で6年間バックエンド開発を担当。Go と TypeScript を中心に、Kubernetes 上の決済基盤の設計・運用に従事。直近 2 年はテックリードとして 5 名チームを牽引。",
  skills: [
    ["Go", "5年", "本番運用・チーム標準化"],
    ["TypeScript / Node.js", "6年", "BFF・社内ツール"],
    ["PostgreSQL", "6年", "パーティショニング含む"],
    ["AWS (EKS, RDS, SQS)", "4年", "IaC は Terraform"],
    ["gRPC", "3年", "社内マイクロサービス間"],
  ],
  careers: [
    {
      period: "2022-04 〜 現在",
      company: "株式会社サンプルペイ",
      role: "テックリード",
      detail:
        "決済処理のリプレース。Rails モノリスから Go マイクロサービスへ段階移行。リリース頻度を週 1 → 日 3 に。",
    },
    {
      period: "2019-04 〜 2022-03",
      company: "Sample Cloud Inc.",
      role: "バックエンドエンジニア",
      detail: "ファイル共有 SaaS の API 設計。GraphQL → gRPC 移行を主導。",
    },
    {
      period: "2017-04 〜 2019-03",
      company: "Sample Web 株式会社",
      role: "ジュニアエンジニア",
      detail: "Rails での EC サイト開発。新卒研修も担当。",
    },
  ],
  strengths: [
    "0→1 と 1→10 の両方の経験あり",
    "技術選定と PoC を任せられた回数が多い",
    "コードレビュー文化を 0 から立ち上げた経験",
  ],
  concerns: [
    "フロントエンドの実装は最近触れていない",
    "マネジメント比率が高くなり、ハンズオン時間が減少傾向",
  ],
};

async function genPDF() {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({
    size: "A4",
    margin: 56,
    info: { Title: "履歴書サンプル", Author: "Resume_Claude" },
  });

  // 日本語フォント埋め込み（Noto Sans CJK が無ければ system fonts を探索）
  const fontPath = findJpFont();
  if (fontPath) {
    doc.registerFont("jp", fontPath);
    doc.font("jp");
  } else {
    console.warn(
      "  ⚠ 日本語フォントが見つからず、ASCII にフォールバックします（unpdf 抽出時に文字化けする可能性あり）",
    );
  }

  const out = resolve(OUT, "sample-resume.pdf");
  const stream = createWriteStream(out);
  doc.pipe(stream);

  doc.fontSize(18).text("履歴書", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(11);

  doc.text(`氏名: ${CAND.name}（${CAND.age}）`);
  doc.text(`志望ロール: ${CAND.role}`);
  doc.moveDown();

  doc.fontSize(13).text("経歴サマリ");
  doc.fontSize(10).text(CAND.summary);
  doc.moveDown();

  doc.fontSize(13).text("スキル");
  doc.fontSize(10);
  for (const [name, years, note] of CAND.skills) {
    doc.text(`・${name}（${years}）— ${note}`);
  }
  doc.moveDown();

  doc.fontSize(13).text("職歴");
  doc.fontSize(10);
  for (const c of CAND.careers) {
    doc.text(`[${c.period}] ${c.company} / ${c.role}`);
    doc.text(`  ${c.detail}`);
    doc.moveDown(0.3);
  }
  doc.moveDown();

  doc.fontSize(13).text("強み");
  doc.fontSize(10);
  for (const s of CAND.strengths) doc.text(`・${s}`);
  doc.moveDown();
  doc.fontSize(13).text("懸念点");
  doc.fontSize(10);
  for (const s of CAND.concerns) doc.text(`・${s}`);

  doc.end();
  await new Promise((res, rej) => {
    stream.on("finish", res);
    stream.on("error", rej);
  });
  return out;
}

async function genEmptyPDF() {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const out = resolve(OUT, "sample-resume-empty.pdf");
  const stream = createWriteStream(out);
  doc.pipe(stream);
  doc.addPage();
  doc.end();
  await new Promise((res, rej) => {
    stream.on("finish", res);
    stream.on("error", rej);
  });
  return out;
}

function findJpFont() {
  // pdfkit + fontkit は .ttc（TrueType Collection）の createSubset に失敗するため
  // 単体 .ttf を優先する
  const candidates = [
    "C:/Windows/Fonts/NotoSansJP-VF.ttf",
    "C:/Windows/Fonts/yumin.ttf",
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

async function genDOCX() {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import("docx");

  const heading = (t) =>
    new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
  const para = (t) =>
    new Paragraph({ children: [new TextRun({ text: t, size: 22 })] });

  const skillsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ["スキル", "経験年数", "備考"].map(
          (h) => new TableCell({ children: [new Paragraph({ text: h })] }),
        ),
      }),
      ...CAND.skills.map(
        (row) =>
          new TableRow({
            children: row.map(
              (v) =>
                new TableCell({ children: [new Paragraph({ text: String(v) })] }),
            ),
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "履歴書",
            heading: HeadingLevel.HEADING_1,
          }),
          para(`氏名: ${CAND.name}（${CAND.age}）`),
          para(`志望ロール: ${CAND.role}`),
          heading("経歴サマリ"),
          para(CAND.summary),
          heading("スキル"),
          skillsTable,
          heading("職歴"),
          ...CAND.careers.flatMap((c) => [
            para(`[${c.period}] ${c.company} / ${c.role}`),
            para(`  ${c.detail}`),
          ]),
          heading("強み"),
          ...CAND.strengths.map((s) => para(`・${s}`)),
          heading("懸念点"),
          ...CAND.concerns.map((s) => para(`・${s}`)),
        ],
      },
    ],
  });

  const out = resolve(OUT, "sample-resume.docx");
  const buf = await Packer.toBuffer(doc);
  await writeFile(out, buf);
  return out;
}

async function genXLSX() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const summary = [
    ["項目", "内容"],
    ["氏名", CAND.name],
    ["年齢", CAND.age],
    ["志望ロール", CAND.role],
    ["経歴サマリ", CAND.summary],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    "基本情報",
  );

  const skills = [["スキル", "経験年数", "備考"], ...CAND.skills];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(skills), "スキル");

  const careers = [
    ["期間", "会社", "役割", "詳細"],
    ...CAND.careers.map((c) => [c.period, c.company, c.role, c.detail]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(careers), "職歴");

  const out = resolve(OUT, "sample-resume.xlsx");
  XLSX.writeFile(wb, out);
  return out;
}

// ---- 抽出検証（lib/documentExtract.ts と同じロジックを最小再実装） ----

async function extractBack(path, kind) {
  const buf = await readFile(path);

  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const pdf = await getDocumentProxy(data);
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text)
      ? result.text.join("\n")
      : result.text;
    return { text: (text ?? "").trim(), meta: `${result.totalPages}ページ` };
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return { text: (r.value ?? "").trim(), meta: "" };
  }

  // xlsx
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`## ${name}\n${csv}`);
  }
  return { text: parts.join("\n\n").trim(), meta: `${wb.SheetNames.length}シート` };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log("=== サンプル生成 ===");
  const pdf = await genPDF();
  console.log(`  PDF  : ${pdf}`);
  const docx = await genDOCX();
  console.log(`  DOCX : ${docx}`);
  const xlsx = await genXLSX();
  console.log(`  XLSX : ${xlsx}`);

  // テキストゼロ PDF（スキャン画像のみ PDF 相当のエラーパス検証用）
  const emptyPdf = await genEmptyPDF();
  console.log(`  PDF空: ${emptyPdf}`);

  console.log("\n=== 抽出検証 ===");
  for (const [path, kind] of [
    [pdf, "pdf"],
    [docx, "docx"],
    [xlsx, "xlsx"],
    [emptyPdf, "pdf"],
  ]) {
    try {
      const { text, meta } = await extractBack(path, kind);
      const len = text.length;
      const hit = text.includes(CAND.name);
      const preview = text.slice(0, 120).replace(/\n+/g, " / ");
      console.log(
        `  [${kind.toUpperCase()}] ${len} chars / ${meta} / 氏名ヒット: ${hit ? "○" : "✗"}\n    head: ${preview}…`,
      );
    } catch (e) {
      console.error(`  [${kind.toUpperCase()}] 抽出失敗: ${e?.message ?? e}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
