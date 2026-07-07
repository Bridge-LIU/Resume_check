/**
 * Excel ミラー — JSON マスタ／セッションを Excel に書き戻す片方向同期。
 *
 * テンプレート `C:\Users\admin\Desktop\大体功能.xlsx` のシート構成に合わせる：
 *   - マスタ.xlsx    : "M_役割別"（役割マスタ）+ "評価条件"（グローバル既定）
 *   - 面談者一覧.xlsx : "①D_面談者一覧"（面談者ごとに 1 行）
 *
 * 配置先: `<dataRoot>/exports/{マスタ,面談者一覧}.xlsx`
 *
 * 自動ミラーはマスタ／セッション保存時に fire-and-forget で呼ばれる（storage.ts）。
 * 失敗してもメインの JSON 保存は成功扱い（console.warn のみ）。
 *
 * SheetJS Community は書き出し時にセルスタイルを保持できないため、ExcelJS を使用。
 * - ヘッダ行は太字＋灰色背景＋中央寄せ
 * - 数値・日付セルは中央寄せ
 * - 条件①/② などの複数行テキストは折返し＋左上揃え
 * - hold=true または retention=0 のセッションは「🔒 ロック中」表示
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  getCandidate,
  getConditionsSnapshot,
  getDataRoot,
  getEvalCriteria,
  getEvaluation,
  getMinutes,
  getQuestions,
  getSessionMeta,
  isValidSessionId,
  listRoles,
  listSessions,
  loadSettings,
  resolveEvalForRole,
} from "./storage";
import { parseQuestions } from "./questionParser";
import { parseStructuredSummary } from "./summaryFormat";

export const MASTER_FILE = "マスタ.xlsx";
export const SESSIONS_FILE = "面談者一覧.xlsx";
export const SESSION_FILE = "session.xlsx";
export const MASTER_FILE_ASCII = "master.xlsx";
export const SESSIONS_FILE_ASCII = "sessions.xlsx";

function exportsDir(): string {
  return path.join(getDataRoot(), "exports");
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

/* ─────────────── 共通スタイル ─────────────── */

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" }, // zinc-100
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FF334155" }, // zinc-700
  size: 11,
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

const BORDER_WHITE: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFFFFFFF" } },
  bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
  left: { style: "thin", color: { argb: "FFFFFFFF" } },
  right: { style: "thin", color: { argb: "FFFFFFFF" } },
};

/** 役割 id → pill 塗りつぶし色（argb） */
const ROLE_PILL_COLORS: Record<string, string> = {
  NW: "FF3B82F6",       // blue-500
  Server: "FF8B5CF6",   // violet-500
  Dev: "FF14B8A6",      // teal-500
  Special: "FFF59E0B",  // amber-500
  PMO: "FFEF4444",      // red-500
  ITSupport: "FF64748B",// slate-500
};

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = BORDER_THIN;
  });
}

function applyBordersTo(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.border) cell.border = BORDER_THIN;
    });
  });
}

/** 条件①/② の richText: 見出し（大きく色付き）＋ "• " 接頭辞の本文 */
function buildConditionRich(
  title: string,
  items: string[],
  titleArgb: string,
): ExcelJS.CellRichTextValue {
  const blocks: { text: string; font?: Partial<ExcelJS.Font> }[] = [
    {
      text: title + "\n\n",
      font: { bold: true, size: 12, color: { argb: titleArgb } },
    },
  ];
  items.forEach((item, i) => {
    blocks.push({
      text: "• " + item + (i === items.length - 1 ? "" : "\n"),
      font: { size: 10, color: { argb: "FF374151" } },
    });
  });
  return { richText: blocks };
}

/* ─────────────── マスタ.xlsx ─────────────── */

export async function buildMasterXlsx(): Promise<Buffer> {
  const roles = listRoles();
  const ev = getEvalCriteria();
  const wb = new ExcelJS.Workbook();
  wb.creator = "面談AI評価ツール";
  wb.created = new Date();

  const axisNames = ev?.評価軸.map((a) => a.名前) ?? [
    "非技術",
    "技術",
    "総合",
  ];
  const axisCount = axisNames.length;

  // 列インデックス
  const COL_ROLE = 1;
  const COL_COND1 = 2;
  const COL_COND2 = 3;
  const COL_AXIS_START = 4;
  const COL_AXIS_END = 3 + axisCount;
  const COL_PASS = COL_AXIS_END + 1;
  const COL_NORMAL = COL_AXIS_END + 2;
  const COL_LAST = COL_NORMAL;

  // ── Sheet "M_役割別" ──
  const ws1 = wb.addWorksheet("M_役割別", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });

  ws1.columns = [
    { width: 22 }, // 役割
    { width: 50 }, // 条件①
    { width: 42 }, // 条件②
    ...axisNames.map(() => ({ width: 10 })),
    { width: 9 }, // 合格
    { width: 9 }, // 普通
  ];

  // ── Super header (row 1) ──
  const superRow = ws1.getRow(1);
  superRow.getCell(COL_ROLE).value = "役割";
  superRow.getCell(COL_COND1).value = "採用条件";
  superRow.getCell(COL_AXIS_START).value = "軸別重み (1–5)";
  superRow.getCell(COL_PASS).value = "判定閾値";
  ws1.mergeCells(1, COL_COND1, 1, COL_COND2);
  ws1.mergeCells(1, COL_AXIS_START, 1, COL_AXIS_END);
  ws1.mergeCells(1, COL_PASS, 1, COL_NORMAL);

  superRow.getCell(COL_ROLE).fill = solidFill("FF1F2937");
  superRow.getCell(COL_ROLE).font = {
    bold: true,
    size: 11,
    color: { argb: "FFFFFFFF" },
  };
  superRow.getCell(COL_COND1).fill = solidFill("FFE5E7EB");
  superRow.getCell(COL_COND1).font = {
    bold: true,
    size: 11,
    color: { argb: "FF1F2937" },
  };
  superRow.getCell(COL_AXIS_START).fill = solidFill("FFDBEAFE");
  superRow.getCell(COL_AXIS_START).font = {
    bold: true,
    size: 11,
    color: { argb: "FF1E40AF" },
  };
  superRow.getCell(COL_PASS).fill = solidFill("FFFEF3C7");
  superRow.getCell(COL_PASS).font = {
    bold: true,
    size: 11,
    color: { argb: "FF92400E" },
  };
  for (let c = 1; c <= COL_LAST; c++) {
    superRow.getCell(c).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    superRow.getCell(c).border = BORDER_THIN;
  }
  superRow.height = 28;

  // ── Sub header (row 2) ──
  const subRow = ws1.getRow(2);
  subRow.getCell(COL_ROLE).value = "役割と条件";
  subRow.getCell(COL_COND1).value = "条件①";
  subRow.getCell(COL_COND2).value = "条件②";
  axisNames.forEach((name, i) => {
    subRow.getCell(COL_AXIS_START + i).value = name;
  });
  subRow.getCell(COL_PASS).value = "合格";
  subRow.getCell(COL_NORMAL).value = "普通";
  styleHeaderRow(subRow);
  subRow.height = 22;
  // 軸列: blue-50 / amber-50 で super header と色トーンを揃える
  for (let i = 0; i < axisCount; i++) {
    const c = subRow.getCell(COL_AXIS_START + i);
    c.fill = solidFill("FFEFF6FF");
    c.font = { bold: true, size: 11, color: { argb: "FF1E40AF" } };
  }
  [COL_PASS, COL_NORMAL].forEach((col) => {
    const c = subRow.getCell(col);
    c.fill = solidFill("FFFFFBEB");
    c.font = { bold: true, size: 11, color: { argb: "FF92400E" } };
  });

  // ── Data rows ──
  roles.forEach((role, idx) => {
    const resolved = ev ? resolveEvalForRole(ev, role.id) : null;
    const weights = resolved?.評価軸.map((a) => a.重み) ?? [];
    const goal = resolved?.合格ライン ?? null;
    const pass = resolved?.普通ライン ?? null;

    const row = ws1.addRow([
      role.役割,
      null, // 条件① — richText で後埋め
      null, // 条件② — richText で後埋め
      ...weights,
      goal,
      pass,
    ]);

    // 1: 役割 — pill 風
    const roleColor = ROLE_PILL_COLORS[role.id] ?? "FF64748B";
    const roleCell = row.getCell(COL_ROLE);
    roleCell.fill = solidFill(roleColor);
    roleCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    roleCell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    roleCell.border = BORDER_WHITE;

    // 2: 条件① rich text（slate-900 見出し）
    const c1 = row.getCell(COL_COND1);
    c1.value = buildConditionRich(
      "条件①: 基本人物像（常に評価）",
      role.条件1_基本人物像,
      "FF111827",
    );
    c1.alignment = { vertical: "top", horizontal: "left", wrapText: true };

    // 3: 条件② rich text（amber-700 見出し）
    const c2 = row.getCell(COL_COND2);
    c2.value = buildConditionRich(
      "条件②: 未経験者必須",
      role.条件2_未経験者必須,
      "FFB45309",
    );
    c2.alignment = { vertical: "top", horizontal: "left", wrapText: true };

    // 軸列
    for (let i = 0; i < axisCount; i++) {
      const c = row.getCell(COL_AXIS_START + i);
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.numFmt = "0";
      c.font = { color: { argb: "FF1E3A8A" }, size: 11 };
    }

    // 合格 / 普通
    [COL_PASS, COL_NORMAL].forEach((col) => {
      const c = row.getCell(col);
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.numFmt = "0.0";
      c.font = { bold: true, color: { argb: "FF92400E" }, size: 11 };
    });

    // ゼブラ縞: 偶数番目の役割行 (idx=1,3,5..) のみ B〜I に zinc-50
    if (idx % 2 === 1) {
      for (let c = COL_COND1; c <= COL_LAST; c++) {
        const cell = row.getCell(c);
        if (!cell.fill) cell.fill = solidFill("FFF9FAFB");
      }
    }

    row.height = Math.max(
      80,
      Math.min(
        220,
        Math.max(
          role.条件1_基本人物像.length,
          role.条件2_未経験者必須.length,
        ) *
          18 +
          30,
      ),
    );
  });

  applyBordersTo(ws1);

  ws1.autoFilter = {
    from: { row: 2, column: COL_ROLE },
    to: { row: roles.length + 2, column: COL_LAST },
  };

  // ── Sheet "評価条件" ──
  const ws2 = wb.addWorksheet("評価条件", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  ws2.columns = [{ width: 24 }, { width: 36 }];

  // タイトル行（row 1）
  ws2.mergeCells(1, 1, 1, 2);
  const titleCell = ws2.getCell(1, 1);
  titleCell.value = "評価条件マスタ";
  titleCell.fill = solidFill("FFDBEAFE");
  titleCell.font = { bold: true, size: 13, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.border = BORDER_THIN;
  ws2.getRow(1).height = 32;

  let cursor = 2;
  const addSection = (label: string) => {
    ws2.mergeCells(cursor, 1, cursor, 2);
    const c = ws2.getCell(cursor, 1);
    c.value = label;
    c.fill = solidFill("FF1F2937");
    c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.border = BORDER_THIN;
    ws2.getRow(cursor).height = 24;
    cursor += 1;
  };
  const addKV = (
    key: string,
    value: string | number | null,
    opts?: { valueBg?: string; valueFmt?: string; valueColor?: string },
  ) => {
    const row = ws2.getRow(cursor);
    const k = row.getCell(1);
    k.value = key;
    k.fill = solidFill("FFF3F4F6");
    k.font = { bold: true, size: 11, color: { argb: "FF475569" } };
    k.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

    const v = row.getCell(2);
    v.value = value;
    v.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
      wrapText: true,
    };
    if (opts?.valueBg) v.fill = solidFill(opts.valueBg);
    if (opts?.valueFmt) v.numFmt = opts.valueFmt;
    if (opts?.valueColor) {
      v.font = { bold: true, color: { argb: opts.valueColor }, size: 11 };
    }
    row.height = 22;
    cursor += 1;
  };

  addSection("評価方式");
  addKV("方式", ev?.方式 ?? "BARS");

  addSection("軸の既定重み");
  addKV("軸重み（共通既定・固定）", 3);
  addKV("評価軸", axisNames.join(" / "));

  addSection("判定ライン既定");
  addKV("合格ライン", ev?.合格ライン ?? null, {
    valueBg: "FFFEF3C7",
    valueFmt: "0.0",
    valueColor: "FF92400E",
  });
  addKV("普通ライン", ev?.普通ライン ?? null, {
    valueBg: "FFFEF3C7",
    valueFmt: "0.0",
    valueColor: "FF92400E",
  });

  addSection("スケール定義");
  addKV("スケール最小", ev?.スケール.最小 ?? null);
  addKV("スケール最大", ev?.スケール.最大 ?? null);
  addKV("スケール刻み", ev?.スケール.刻み ?? null);
  addKV("スケール段階数", ev?.スケール.段階数 ?? null);
  addKV("自己解決レベル", ev?.自己解決レベル ?? "");

  applyBordersTo(ws2);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** マスタ.xlsx を `<dataRoot>/exports/` に書き出す。失敗は console.warn のみ。 */
export async function writeMasterMirror(): Promise<void> {
  try {
    const buf = await buildMasterXlsx();
    const dir = exportsDir();
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, MASTER_FILE), buf);
  } catch (e) {
    console.warn("[excelMirror] マスタ.xlsx 書込失敗:", e);
  }
}

/* ─────────────── 面談者一覧.xlsx ─────────────── */

/** スコア → ◎/○/△/× と色（emerald/blue/amber/red） */
function scoreMark(score: number | null): { symbol: string; color: string } {
  if (score == null) return { symbol: "—", color: "FF9CA3AF" };
  if (score >= 4.5) return { symbol: "◎", color: "FF15803D" };
  if (score >= 4.0) return { symbol: "○", color: "FF1D4ED8" };
  if (score >= 3.5) return { symbol: "△", color: "FFB45309" };
  return { symbol: "×", color: "FFB91C1C" };
}

/**
 * 4軸 + 自己解決 を 1セル内に縦ブロックで積む rich text。
 * 各ブロック: 「軸名（太字） 記号（色付き太字大） スコア(0.0)」改行「根拠（小グレー）」
 * ブロック間は空行で区切る。最後に自己解決レベル (0〜5) を 1 行で追加。
 */
function axisBlockRichText(
  names: string[],
  scores: (number | null)[],
  rationales: string[],
  selfLevel: number | null,
): ExcelJS.CellRichTextValue {
  const blocks: { text: string; font?: Partial<ExcelJS.Font> }[] = [];
  for (let i = 0; i < names.length; i++) {
    const score = scores[i];
    const rationale = rationales[i] ?? "";
    const { symbol, color } = scoreMark(score);
    blocks.push({
      text: names[i] + "  ",
      font: { bold: true, color: { argb: "FF1F2937" }, size: 11 },
    });
    blocks.push({
      text: symbol,
      font: { bold: true, color: { argb: color }, size: 13 },
    });
    if (typeof score === "number") {
      blocks.push({
        text: ` ${score.toFixed(1)}`,
        font: { color: { argb: "FF1F2937" }, size: 11 },
      });
    }
    if (rationale.trim()) {
      blocks.push({
        text: "\n" + rationale,
        font: { color: { argb: "FF374151" }, size: 10 },
      });
    }
    blocks.push({ text: "\n\n", font: { size: 6 } });
  }
  // 自己解決レベル (0〜5)。軸とは別評価。
  blocks.push({
    text: "自己解決  ",
    font: { bold: true, color: { argb: "FF1F2937" }, size: 11 },
  });
  if (typeof selfLevel === "number") {
    blocks.push({
      text: `${selfLevel}`,
      font: { bold: true, color: { argb: "FF6D28D9" }, size: 13 },
    });
    blocks.push({
      text: " / 5",
      font: { color: { argb: "FF6B7280" }, size: 10 },
    });
  } else {
    blocks.push({
      text: "—",
      font: { color: { argb: "FF9CA3AF" }, size: 11 },
    });
  }
  return { richText: blocks };
}

export async function buildSessionsXlsx(): Promise<Buffer> {
  const sessions = listSessions();
  const ev = getEvalCriteria();
  const settings = loadSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = "面談AI評価ツール";
  wb.created = new Date();

  const axisNames = ev?.評価軸.map((a) => a.名前) ?? [
    "非技術",
    "技術",
    "総合",
  ];

  const ws = wb.addWorksheet("①D_面談者一覧", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
  });

  // 列構成（左→右、案B + 自己解決は軸別評価セルに統合 + 経歴を 3 列に分割）:
  //   候補者 | 役割 | 経歴サマリ | 主要スキル | 強み | 軸別評価 | 良い点 | 懸念点
  //     | 使用AI | 総合スコア | 合否 | 面談日 | 結果 | 状態 | 自動削除
  const header = [
    "候補者",
    "役割",
    "経歴サマリ",
    "主要スキル",
    "強み",
    "軸別評価",
    "良い点",
    "懸念点",
    "使用AI",
    "総合スコア",
    "合否",
    "面談日",
    "結果",
    "状態",
    "自動削除",
  ];
  ws.addRow(header);
  styleHeaderRow(ws.getRow(1));

  // ヘッダ列ごとの文字色（セマンティックグループに合わせる）
  const headerColors = [
    "FF334155", // 候補者 (slate-700)
    "FF334155", // 役割
    "FF1E40AF", // 経歴サマリ (blue-800)
    "FF2563EB", // 主要スキル (blue-600)
    "FF6D28D9", // 強み (violet-700)
    "FF7C3AED", // 軸別評価 (violet-600)
    "FF15803D", // 良い点 (emerald-700)
    "FFB91C1C", // 懸念点 (red-700)
    "FF475569", // 使用AI (slate-600)
    "FF1F2937", // 総合スコア (gray-800)
    "FF1F2937", // 合否
    "FF334155", // 面談日
    "FF475569", // 結果
    "FF475569", // 状態
    "FF6B7280", // 自動削除 (gray-500)
  ];
  const headerRow = ws.getRow(1);
  headerColors.forEach((argb, i) => {
    headerRow.getCell(i + 1).font = {
      ...HEADER_FONT,
      color: { argb },
    };
  });

  ws.columns = [
    { width: 18 }, // 候補者
    { width: 22 }, // 役割
    { width: 36 }, // 経歴サマリ
    { width: 28 }, // 主要スキル
    { width: 28 }, // 強み
    { width: 56 }, // 軸別評価（4軸 + 自己解決）
    { width: 32 }, // 良い点
    { width: 32 }, // 懸念点
    { width: 12 }, // 使用AI
    { width: 10 }, // 総合スコア
    { width: 8 }, // 合否
    { width: 12 }, // 面談日
    { width: 8 }, // 結果
    { width: 10 }, // 状態
    { width: 12 }, // 自動削除
  ];

  // ソート：作成日時 desc（新しい順）。同日内では氏名昇順
  const sorted = [...sessions].sort((a, b) => {
    const ta = new Date(a.作成日時).getTime();
    const tb = new Date(b.作成日時).getTime();
    if (tb !== ta) return tb - ta;
    return a.氏名.localeCompare(b.氏名, "ja");
  });

  for (const s of sorted) {
    const candidate = getCandidate(s.id);
    const evalu = getEvaluation(s.id);
    // 使用AI: ⑧評価の provider を優先、無ければ②要約の provider、どちらも未設定なら defaultProvider。
    // 両工程とも paste なら「貼付」。
    const usedAi = (() => {
      if (evalu?.mode === "api") {
        return providerLabel(evalu.provider ?? settings.defaultProvider);
      }
      if (candidate?.mode === "api") {
        return providerLabel(candidate.provider ?? settings.defaultProvider);
      }
      return "貼付";
    })();
    const axisScores = axisNames.map((name) => {
      const a = evalu?.軸評価.find((x) => x.軸 === name);
      return typeof a?.スコア === "number" ? a.スコア : null;
    });
    const axisRationales = axisNames.map((name) => {
      const a = evalu?.軸評価.find((x) => x.軸 === name);
      return a?.根拠 ?? "";
    });
    const total = typeof evalu?.総合スコア === "number" ? evalu.総合スコア : null;
    const grade = evalu?.合否 ?? null;
    const selfLevel =
      typeof evalu?.自己解決レベル === "number" ? evalu.自己解決レベル : null;
    const meetingDate = s.closedAt ? formatDate(s.closedAt) : null;
    const retentionDays = settings.retention.days[s.result];
    const retentionCell: number | null =
      s.hold || !retentionDays || retentionDays <= 0 ? null : retentionDays;
    // 3 列の取り出し：
    //   保存方針は 要約 単一テキストに統一。Excel 出力時に見出しで 3 列へ分割する。
    //   旧データで構造化フィールドが残っている場合のみ、それを優先（後方互換）。
    const hasLegacyStructured = !!(
      candidate?.経歴 ||
      candidate?.主要スキル ||
      candidate?.強み
    );
    const parsed = hasLegacyStructured
      ? {
          経歴: candidate?.経歴?.trim() ?? "",
          主要スキル: candidate?.主要スキル?.trim() ?? "",
          強み: candidate?.強み?.trim() ?? "",
        }
      : parseStructuredSummary(candidate?.要約 ?? "");
    const career = parsed.経歴;
    const skills = parsed.主要スキル;
    const strengths = parsed.強み;
    const careerCol = career;
    const good = evalu?.良い点 ?? "";
    const concern = evalu?.懸念点 ?? "";

    // 列番号:
    //   1: 候補者 / 2: 役割 / 3: 経歴サマリ / 4: 主要スキル / 5: 強み / 6: 軸別評価
    //   7: 良い点 / 8: 懸念点 / 9: 使用AI / 10: 総合スコア
    //   11: 合否 / 12: 面談日 / 13: 結果 / 14: 状態 / 15: 自動削除
    const row = ws.addRow([
      s.氏名,
      s.役割,
      careerCol,
      skills,
      strengths,
      null, // 軸別評価 は後で richText で埋める
      good,
      concern,
      usedAi,
      total,
      grade,
      meetingDate,
      s.result,
      s.status,
      retentionCell,
    ]);

    // 1: 候補者
    row.getCell(1).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(1).font = { bold: true };

    // 2: 役割
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };

    // 3: 経歴サマリ
    row.getCell(3).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(3).font = { size: 10, color: { argb: "FF374151" } };

    // 4: 主要スキル
    row.getCell(4).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(4).font = { size: 10, color: { argb: "FF374151" } };

    // 5: 強み
    row.getCell(5).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(5).font = { size: 10, color: { argb: "FF1E40AF" } };

    // 6: 軸別評価（4軸 + 自己解決 を 1セルに縦積み）
    const axisCell = row.getCell(6);
    axisCell.value = axisBlockRichText(
      axisNames,
      axisScores,
      axisRationales,
      selfLevel,
    );
    axisCell.alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };

    // 7: 良い点
    row.getCell(7).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(7).font = { size: 10, color: { argb: "FF166534" } };

    // 8: 懸念点
    row.getCell(8).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(8).font = { size: 10, color: { argb: "FF991B1B" } };

    // 9: 使用AI
    row.getCell(9).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(9).font = { color: { argb: "FF475569" }, size: 10 };

    // 10: 総合スコア
    const totalCell = row.getCell(10);
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    totalCell.font = { bold: true };
    if (typeof totalCell.value === "number") {
      totalCell.numFmt = "0.00";
      const score = totalCell.value;
      const roleId = getRoleIdFromLabel(s.役割) ?? "";
      const goalLine =
        (ev && resolveEvalForRole(ev, roleId)?.合格ライン) ??
        ev?.合格ライン ??
        4.2;
      const passLine =
        (ev && resolveEvalForRole(ev, roleId)?.普通ライン) ??
        ev?.普通ライン ??
        3.5;
      totalCell.font = {
        ...totalCell.font,
        color: {
          argb:
            score >= goalLine
              ? "FF15803D"
              : score >= passLine
                ? "FFB45309"
                : "FFB91C1C",
        },
      };
    }

    // 11: 合否
    const gradeCell = row.getCell(11);
    gradeCell.alignment = { vertical: "middle", horizontal: "center" };
    if (grade === "合格") {
      gradeCell.font = { bold: true, color: { argb: "FF166534" } };
      gradeCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDCFCE7" },
      };
    } else if (grade === "不合格") {
      gradeCell.font = { bold: true, color: { argb: "FF991B1B" } };
      gradeCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEE2E2" },
      };
    } else if (grade === "普通") {
      gradeCell.font = { color: { argb: "FF3F3F46" } };
      gradeCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE4E4E7" },
      };
    }

    // 12-14: 面談日 / 結果 / 状態
    row.getCell(12).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(13).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(14).alignment = { vertical: "middle", horizontal: "center" };

    // 15: 自動削除
    const retCell = row.getCell(15);
    retCell.alignment = { vertical: "middle", horizontal: "center" };
    if (retCell.value == null) {
      retCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF5F3FF" },
      };
    } else if (typeof retCell.value === "number") {
      retCell.numFmt = '0"日"';
    }

    // 行高さ：軸別評価が最も縦に伸びる。各軸ブロック ≈ 1ヘッダ行 + 根拠行数 + 1空行
    const axisBlockLines = axisRationales.reduce(
      (sum, r) => sum + (r.split(/\r?\n/).length + 2),
      0,
    );
    const maxLines = Math.max(
      careerCol.split(/\r?\n/).length,
      skills.split(/\r?\n/).length,
      strengths.split(/\r?\n/).length,
      good.split(/\r?\n/).length,
      concern.split(/\r?\n/).length,
      axisBlockLines,
    );
    row.height = Math.max(28, Math.min(400, maxLines * 16 + 12));
  }

  applyBordersTo(ws);

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sorted.length + 1, column: header.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function writeSessionsMirror(): Promise<void> {
  try {
    const buf = await buildSessionsXlsx();
    const dir = exportsDir();
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, SESSIONS_FILE), buf);
  } catch (e) {
    console.warn("[excelMirror] 面談者一覧.xlsx 書込失敗:", e);
  }
}

/* ─────────────── 補助 ─────────────── */

function providerLabel(p: string): string {
  switch (p) {
    case "anthropic":
      return "Claude";
    case "openai":
      return "ChatGPT";
    case "google":
      return "Gemini";
    default:
      return p;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * セッションメタの「役割」（ラベル文字列）から role.id を推測する。
 * 完全一致が無い場合は startsWith でフォールバック。
 */
function getRoleIdFromLabel(label: string): string | null {
  const roles = listRoles();
  const exact = roles.find((r) => r.役割 === label);
  if (exact) return exact.id;
  const prefix = roles.find((r) => label.startsWith(r.id));
  return prefix?.id ?? null;
}

/* ─────────────── session.xlsx（1 セッション = 1 ファイル） ─────────────── */

/**
 * 1 セッションを 1 xlsx にまとめる。5 sheet 構成:
 *   ①候補者 / ②条件 / ③質問 / ④議事録 / ⑤評価
 *
 * JSON が正本、xlsx は閲覧専用のミラー（設計）。
 * セクションが未作成の場合は、そのシートに「未入力」プレースホルダを置く。
 */
export async function buildSessionXlsx(id: string): Promise<Buffer | null> {
  if (!isValidSessionId(id)) return null;
  const meta = getSessionMeta(id);
  if (!meta) return null;

  const candidate = getCandidate(id);
  const snap = getConditionsSnapshot(id);
  const questions = getQuestions(id);
  const minutes = getMinutes(id);
  const evalu = getEvaluation(id);

  const wb = new ExcelJS.Workbook();
  wb.creator = "面談AI評価ツール";
  wb.created = new Date();
  wb.title = `面談: ${meta.氏名} / ${meta.役割}`;
  wb.subject = meta.status;
  wb.keywords = [meta.氏名, meta.役割, meta.status].join(", ");

  addCandidateSheet(wb, meta, candidate);
  addConditionsSheet(wb, meta, snap);
  addQuestionsSheet(wb, meta, questions);
  addMinutesSheet(wb, meta, minutes);
  addEvaluationSheet(wb, meta, evalu);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

type SessionMeta = NonNullable<ReturnType<typeof getSessionMeta>>;

/** sessions/<id>/session.xlsx に書き出す。失敗は console.warn のみ。 */
export async function writeSessionMirror(id: string): Promise<void> {
  try {
    const buf = await buildSessionXlsx(id);
    if (!buf) return;
    const dir = path.join(getDataRoot(), "sessions", id);
    if (!fs.existsSync(dir)) return; // セッション未生成/削除済ならスキップ
    fs.writeFileSync(path.join(dir, SESSION_FILE), buf);
  } catch (e) {
    console.warn(`[excelMirror] session.xlsx 書込失敗 (${id}):`, e);
  }
}

/* ── session.xlsx 内の各シート生成ヘルパー ── */

function addSectionHeader(
  ws: ExcelJS.Worksheet,
  title: string,
  meta: SessionMeta,
  cols: number,
): void {
  // Row 1: タイトル + 閲覧専用の警告
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.fill = solidFill("FF1F2937");
  t.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  // Row 2: メタ帯（氏名 / 役割 / 状態 / 面談日）
  ws.mergeCells(2, 1, 2, cols);
  const m = ws.getCell(2, 1);
  m.value = {
    richText: [
      { text: "候補者: ", font: { bold: true, size: 10, color: { argb: "FF475569" } } },
      { text: `${meta.氏名}   `, font: { size: 11, color: { argb: "FF111827" } } },
      { text: "役割: ", font: { bold: true, size: 10, color: { argb: "FF475569" } } },
      { text: `${meta.役割}   `, font: { size: 11, color: { argb: "FF111827" } } },
      { text: "状態: ", font: { bold: true, size: 10, color: { argb: "FF475569" } } },
      { text: `${meta.status}   `, font: { size: 11, color: { argb: "FF111827" } } },
      { text: "面談日: ", font: { bold: true, size: 10, color: { argb: "FF475569" } } },
      {
        text: meta.closedAt ? formatDate(meta.closedAt) : "（未設定）",
        font: { size: 11, color: { argb: "FF111827" } },
      },
    ],
  };
  m.fill = solidFill("FFF8FAFC");
  m.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  ws.getRow(2).height = 22;

  // Row 3: 閲覧専用の注意
  ws.mergeCells(3, 1, 3, cols);
  const w = ws.getCell(3, 1);
  w.value =
    "※ 本ファイルはシステムが自動生成する閲覧専用ミラーです。編集はシステム画面から行ってください（次回保存で上書きされます）。";
  w.fill = solidFill("FFFEF3C7");
  w.font = { italic: true, size: 9, color: { argb: "FF92400E" } };
  w.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  ws.getRow(3).height = 20;
}

/** ①候補者 シート */
function addCandidateSheet(
  wb: ExcelJS.Workbook,
  meta: SessionMeta,
  cand: ReturnType<typeof getCandidate>,
): void {
  const ws = wb.addWorksheet("①候補者", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  ws.columns = [{ width: 22 }, { width: 90 }];
  addSectionHeader(ws, "① 候補者情報", meta, 2);

  if (!cand) {
    placeholder(ws, 4, 2, "候補者情報は未入力です。");
    return;
  }

  // 統合要約から 経歴 / 主要スキル / 強み を分解。旧データ用 fallback は Candidate 直下フィールド。
  const parsed = parseStructuredSummary(cand.要約 ?? "");
  const 経歴 = (cand.経歴?.trim() ? cand.経歴 : parsed.経歴).trim();
  const 主要スキル = (cand.主要スキル?.trim() ? cand.主要スキル : parsed.主要スキル).trim();
  const 強み = (cand.強み?.trim() ? cand.強み : parsed.強み).trim();

  let cursor = 4;
  cursor = addKV(ws, cursor, "モード", cand.mode === "api" ? "API 自動要約" : "貼付");
  if (cand.provider) cursor = addKV(ws, cursor, "使用 AI", providerLabel(cand.provider));
  cursor = addKV(ws, cursor, "更新日時", formatDateTime(cand.updatedAt));
  cursor += 1;
  cursor = addLongText(ws, cursor, "経歴サマリ", 経歴 || "（未記入）", "FFE0E7FF", "FF3730A3");
  cursor = addLongText(ws, cursor, "主要スキル", 主要スキル || "（未記入）", "FFDBEAFE", "FF1E40AF");
  addLongText(ws, cursor, "強み", 強み || "（未記入）", "FFEDE9FE", "FF6D28D9");

  applyBordersTo(ws);
}

/** ②条件 シート（凍結スナップショット） */
function addConditionsSheet(
  wb: ExcelJS.Workbook,
  meta: SessionMeta,
  snap: ReturnType<typeof getConditionsSnapshot>,
): void {
  const ws = wb.addWorksheet("②条件", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  ws.columns = [{ width: 22 }, { width: 90 }];
  addSectionHeader(ws, "② 求める人材条件（凍結スナップショット）", meta, 2);

  if (!snap) {
    placeholder(ws, 4, 2, "条件はまだ凍結されていません。");
    return;
  }

  const { role, eval: ev, frozenAt } = snap;
  let cursor = 4;
  cursor = addKV(ws, cursor, "凍結日時", formatDateTime(frozenAt));
  cursor = addKV(ws, cursor, "役割", role.役割);
  cursor = addKV(ws, cursor, "経験", role.経験);
  cursor = addKV(ws, cursor, "未経験可", role.未経験可 ? "はい" : "いいえ");
  cursor += 1;

  cursor = addBulletList(
    ws,
    cursor,
    "条件①: 基本人物像（常に評価）",
    role.条件1_基本人物像,
    "FF111827",
    "FFF9FAFB",
  );
  if (role.未経験可) {
    cursor = addBulletList(
      ws,
      cursor,
      "条件②: 未経験者必須",
      role.条件2_未経験者必須,
      "FFB45309",
      "FFFFFBEB",
    );
  } else {
    cursor = addKV(ws, cursor, "条件②", "（未経験可=false のため評価対象外）");
  }
  cursor += 1;

  // 評価軸重み
  cursor = addKV(ws, cursor, "評価軸", ev.評価軸.map((a) => a.名前).join(" / "));
  cursor = addKV(
    ws,
    cursor,
    "軸重み",
    ev.評価軸.map((a) => `${a.名前}=${a.重み}`).join(" / "),
  );
  cursor = addKV(ws, cursor, "合格ライン", ev.合格ライン.toFixed(2));
  cursor = addKV(ws, cursor, "普通ライン", ev.普通ライン.toFixed(2));
  addKV(
    ws,
    cursor,
    "スケール",
    `${ev.スケール.最小}〜${ev.スケール.最大}（刻み ${ev.スケール.刻み}）`,
  );

  applyBordersTo(ws);
}

/** ③質問 シート */
function addQuestionsSheet(
  wb: ExcelJS.Workbook,
  meta: SessionMeta,
  q: ReturnType<typeof getQuestions>,
): void {
  const ws = wb.addWorksheet("③質問", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });
  ws.columns = [{ width: 8 }, { width: 8 }, { width: 60 }, { width: 40 }, { width: 40 }];
  addSectionHeader(ws, "③ 質問リスト", meta, 5);

  if (!q || !q.rawText.trim()) {
    placeholder(ws, 4, 5, "質問はまだ作成されていません。");
    return;
  }

  // 表ヘッダ
  const hdr = ws.getRow(4);
  hdr.values = ["No.", "★", "質問", "狙い", "解答例"];
  styleHeaderRow(hdr);
  ws.getRow(4).height = 22;

  // parseQuestions で構造化して 1 行 = 1 質問
  const { nonTech, tech } = parseQuestions(q.rawText);
  let cursor = 5;
  const emit = (
    items: typeof nonTech,
    prefix: "Q" | "T",
    bgTitle: string,
    bgTitleColor: string,
  ) => {
    if (items.length === 0) return;
    ws.mergeCells(cursor, 1, cursor, 5);
    const c = ws.getCell(cursor, 1);
    c.value = prefix === "Q" ? "非技術（共通質問）" : "技術（役割別）";
    c.fill = solidFill(bgTitle);
    c.font = { bold: true, size: 11, color: { argb: bgTitleColor } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(cursor).height = 22;
    cursor += 1;
    items.forEach((item, i) => {
      const row = ws.addRow([
        `${prefix}${i + 1}`,
        item.star ? "★" : "",
        item.question,
        item.aim,
        item.example,
      ]);
      row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(2).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(2).font = { color: { argb: "FFF59E0B" }, size: 12 };
      for (let ci = 3; ci <= 5; ci++) {
        row.getCell(ci).alignment = { vertical: "top", horizontal: "left", wrapText: true };
      }
      row.getCell(3).font = { size: 10, color: { argb: "FF111827" } };
      row.getCell(4).font = { size: 9, color: { argb: "FF92400E" }, italic: true };
      row.getCell(5).font = { size: 9, color: { argb: "FF1E40AF" }, italic: true };
      const lines = Math.max(
        (item.question || "").split(/\r?\n/).length,
        (item.aim || "").split(/\r?\n/).length,
        (item.example || "").split(/\r?\n/).length,
      );
      row.height = Math.max(28, Math.min(160, lines * 16 + 8));
      cursor += 1;
    });
  };
  emit(nonTech, "Q", "FFDCFCE7", "FF166534");
  emit(tech, "T", "FFDBEAFE", "FF1E40AF");

  applyBordersTo(ws);
}

/** ④議事録 シート */
function addMinutesSheet(
  wb: ExcelJS.Workbook,
  meta: SessionMeta,
  min: ReturnType<typeof getMinutes>,
): void {
  const ws = wb.addWorksheet("④議事録", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  ws.columns = [{ width: 22 }, { width: 100 }];
  addSectionHeader(ws, "④ 議事録", meta, 2);

  if (!min || !min.text.trim()) {
    placeholder(ws, 4, 2, "議事録はまだ入力されていません。");
    return;
  }

  let cursor = 4;
  cursor = addKV(ws, cursor, "更新日時", formatDateTime(min.updatedAt));
  if (min.summarized) cursor = addKV(ws, cursor, "AI 要約", "済");
  cursor += 1;

  // 議事録本文はセル 1 つに折返し表示
  ws.mergeCells(cursor, 1, cursor, 2);
  const body = ws.getCell(cursor, 1);
  body.value = min.text;
  body.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  body.font = { size: 10, color: { argb: "FF1F2937" } };
  const lines = min.text.split(/\r?\n/).length;
  ws.getRow(cursor).height = Math.min(600, Math.max(80, lines * 15));

  applyBordersTo(ws);
}

/** ⑤評価 シート */
function addEvaluationSheet(
  wb: ExcelJS.Workbook,
  meta: SessionMeta,
  ev: ReturnType<typeof getEvaluation>,
): void {
  const ws = wb.addWorksheet("⑤評価", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  ws.columns = [{ width: 22 }, { width: 12 }, { width: 76 }];
  addSectionHeader(ws, "⑤ 評価・合否判定", meta, 3);

  if (!ev) {
    placeholder(ws, 4, 3, "評価はまだ入力されていません。");
    return;
  }

  let cursor = 4;
  cursor = addKV3(ws, cursor, "モード", ev.mode === "api" ? "API 評価" : "貼付", null);
  if (ev.provider) cursor = addKV3(ws, cursor, "使用 AI", providerLabel(ev.provider), null);
  cursor = addKV3(ws, cursor, "更新日時", formatDateTime(ev.updatedAt), null);
  cursor += 1;

  // 総合 / 合否 / 自己解決 のサマリ
  const gradeColors: Record<string, { bg: string; fg: string }> = {
    合格: { bg: "FFDCFCE7", fg: "FF166534" },
    普通: { bg: "FFE4E4E7", fg: "FF3F3F46" },
    不合格: { bg: "FFFEE2E2", fg: "FF991B1B" },
  };
  const g = gradeColors[ev.合否] ?? { bg: "FFF3F4F6", fg: "FF334155" };
  cursor = addKV3(ws, cursor, "総合スコア", ev.総合スコア.toFixed(2), {
    bg: "FFFEF3C7",
    fg: "FF92400E",
  });
  cursor = addKV3(ws, cursor, "合否", ev.合否, g);
  cursor = addKV3(ws, cursor, "自己解決レベル", `${ev.自己解決レベル} / 5`, null);
  cursor += 1;

  // 軸別評価テーブル
  const hdr = ws.getRow(cursor);
  hdr.values = ["軸", "スコア", "根拠"];
  styleHeaderRow(hdr);
  ws.getRow(cursor).height = 22;
  cursor += 1;
  for (const a of ev.軸評価) {
    const { symbol, color } = scoreMark(a.スコア);
    const row = ws.getRow(cursor);
    row.getCell(1).value = a.軸;
    row.getCell(1).font = { bold: true, size: 11 };
    row.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.getCell(2).value = {
      richText: [
        { text: symbol + " ", font: { bold: true, color: { argb: color }, size: 13 } },
        { text: a.スコア.toFixed(1), font: { color: { argb: "FF1F2937" }, size: 11 } },
      ],
    };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(3).value = a.根拠;
    row.getCell(3).alignment = { vertical: "top", horizontal: "left", wrapText: true };
    row.getCell(3).font = { size: 10, color: { argb: "FF374151" } };
    const lines = (a.根拠 || "").split(/\r?\n/).length;
    row.height = Math.max(28, Math.min(140, lines * 15 + 8));
    cursor += 1;
  }
  cursor += 1;

  cursor = addLongText(ws, cursor, "良い点", ev.良い点 || "（なし）", "FFDCFCE7", "FF166534");
  cursor = addLongText(ws, cursor, "懸念点", ev.懸念点 || "（なし）", "FFFEE2E2", "FF991B1B");

  applyBordersTo(ws);
}

/* ── session.xlsx 用の小道具 ── */

function placeholder(ws: ExcelJS.Worksheet, row: number, cols: number, msg: string): void {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = msg;
  c.fill = solidFill("FFF3F4F6");
  c.font = { italic: true, size: 11, color: { argb: "FF6B7280" } };
  c.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 40;
}

function addKV(
  ws: ExcelJS.Worksheet,
  row: number,
  key: string,
  value: string,
): number {
  const r = ws.getRow(row);
  const k = r.getCell(1);
  k.value = key;
  k.fill = solidFill("FFF3F4F6");
  k.font = { bold: true, size: 10, color: { argb: "FF475569" } };
  k.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  const v = r.getCell(2);
  v.value = value;
  v.font = { size: 11, color: { argb: "FF1F2937" } };
  v.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  r.height = 22;
  return row + 1;
}

/** 3 列版の KV（label / value / 装飾）。value に背景色付けたい時に使う。 */
function addKV3(
  ws: ExcelJS.Worksheet,
  row: number,
  key: string,
  value: string,
  emphasis: { bg: string; fg: string } | null,
): number {
  const r = ws.getRow(row);
  const k = r.getCell(1);
  k.value = key;
  k.fill = solidFill("FFF3F4F6");
  k.font = { bold: true, size: 10, color: { argb: "FF475569" } };
  k.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

  const v = r.getCell(2);
  v.value = value;
  v.alignment = { vertical: "middle", horizontal: "center" };
  if (emphasis) {
    v.fill = solidFill(emphasis.bg);
    v.font = { bold: true, size: 12, color: { argb: emphasis.fg } };
  } else {
    v.font = { size: 11, color: { argb: "FF1F2937" } };
  }

  const rest = r.getCell(3);
  rest.value = "";
  rest.alignment = { vertical: "middle", horizontal: "left" };
  r.height = 24;
  return row + 1;
}

function addLongText(
  ws: ExcelJS.Worksheet,
  row: number,
  title: string,
  text: string,
  titleBg: string,
  titleFg: string,
): number {
  ws.mergeCells(row, 1, row, 2);
  const h = ws.getCell(row, 1);
  h.value = title;
  h.fill = solidFill(titleBg);
  h.font = { bold: true, size: 11, color: { argb: titleFg } };
  h.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 22;

  ws.mergeCells(row + 1, 1, row + 1, 2);
  const body = ws.getCell(row + 1, 1);
  body.value = text;
  body.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  body.font = { size: 10, color: { argb: "FF1F2937" } };
  const lines = text.split(/\r?\n/).length;
  ws.getRow(row + 1).height = Math.min(300, Math.max(40, lines * 15 + 8));

  return row + 2;
}

function addBulletList(
  ws: ExcelJS.Worksheet,
  row: number,
  title: string,
  items: string[],
  titleFg: string,
  titleBg: string,
): number {
  ws.mergeCells(row, 1, row, 2);
  const h = ws.getCell(row, 1);
  h.value = title;
  h.fill = solidFill(titleBg);
  h.font = { bold: true, size: 11, color: { argb: titleFg } };
  h.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 22;

  const text = items.length ? items.map((s) => "• " + s).join("\n") : "（未記入）";
  ws.mergeCells(row + 1, 1, row + 1, 2);
  const body = ws.getCell(row + 1, 1);
  body.value = text;
  body.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  body.font = { size: 10, color: { argb: "FF374151" } };
  ws.getRow(row + 1).height = Math.min(300, Math.max(40, items.length * 18 + 8));

  return row + 2;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
