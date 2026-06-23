/**
 * Excel ミラー — JSON マスタ／セッションを Excel に書き戻す片方向同期。
 *
 * テンプレート `C:\Users\admin\Desktop\大体功能.xlsx` のシート構成に合わせる：
 *   - マスタ.xlsx    : "M_役割別"（役割マスタ）+ "評価条件"（グローバル既定）
 *   - 候補者一覧.xlsx : "①D_候補者一覧"（候補者ごとに 1 行）
 *
 * 配置先: `<dataRoot>/exports/{マスタ,候補者一覧}.xlsx`
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
  getDataRoot,
  getEvalCriteria,
  getEvaluation,
  listRoles,
  listSessions,
  loadSettings,
  resolveEvalForRole,
} from "./storage";

export const MASTER_FILE = "マスタ.xlsx";
export const SESSIONS_FILE = "候補者一覧.xlsx";
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

/* ─────────────── マスタ.xlsx ─────────────── */

export async function buildMasterXlsx(): Promise<Buffer> {
  const roles = listRoles();
  const ev = getEvalCriteria();
  const wb = new ExcelJS.Workbook();
  wb.creator = "面談AI評価ツール";
  wb.created = new Date();

  const axisNames = ev?.評価軸.map((a) => a.名前) ?? [
    "主体性",
    "問題解決力",
    "対人影響力",
    "柔軟性",
  ];

  // ── Sheet "M_役割別" ──
  const ws1 = wb.addWorksheet("M_役割別", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const header = [
    "役割と条件",
    "条件①",
    "条件②",
    ...axisNames,
    "合格",
    "普通",
  ];
  ws1.addRow(header);
  styleHeaderRow(ws1.getRow(1));

  // 列幅
  ws1.columns = [
    { width: 32 },
    { width: 48 },
    { width: 38 },
    ...axisNames.map(() => ({ width: 10 })),
    { width: 8 },
    { width: 8 },
  ];

  for (const role of roles) {
    const resolved = ev ? resolveEvalForRole(ev, role.id) : null;
    const weights = resolved?.評価軸.map((a) => a.重み) ?? [];
    const goal = resolved?.合格ライン ?? null;
    const pass = resolved?.普通ライン ?? null;
    const cond1Text =
      "条件①: 基本人物像（常に評価）\n" + role.条件1_基本人物像.join("\n");
    const cond2Text =
      "条件②: 未経験者必須\n" + role.条件2_未経験者必須.join("\n");
    const row = ws1.addRow([
      role.役割,
      cond1Text,
      cond2Text,
      ...weights,
      goal,
      pass,
    ]);

    // 役割名: 左中央
    row.getCell(1).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(1).font = { bold: true };

    // 条件①/②: 左上揃え＋折返し
    row.getCell(2).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    row.getCell(3).alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };

    // 軸重み・合格・普通: 中央寄せ
    for (let i = 4; i <= 3 + axisNames.length + 2; i++) {
      row.getCell(i).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      row.getCell(i).numFmt = i > 3 + axisNames.length ? "0.0" : "0";
    }

    // 行高さは内容に応じて自動（ExcelJS は wrapText を有効にすると Excel 側で自動高さ）
    row.height = Math.max(
      80,
      Math.min(220, Math.max(role.条件1_基本人物像.length, role.条件2_未経験者必須.length) * 18 + 30),
    );
  }
  applyBordersTo(ws1);

  // ── Sheet "評価条件" ──
  const ws2 = wb.addWorksheet("評価条件", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws2.addRow(["項目", "値"]);
  styleHeaderRow(ws2.getRow(1));
  ws2.columns = [{ width: 32 }, { width: 50 }];

  const evRows: (string | number | null)[][] = [
    ["方式", ev?.方式 ?? "BARS"],
    ["軸重み（共通既定・固定）", 3],
    ["合格ライン（既定）", ev?.合格ライン ?? null],
    ["普通ライン（既定）", ev?.普通ライン ?? null],
    ["評価軸", axisNames.join(" / ")],
    ["スケール最小", ev?.スケール.最小 ?? null],
    ["スケール最大", ev?.スケール.最大 ?? null],
    ["スケール刻み", ev?.スケール.刻み ?? null],
    ["スケール段階数", ev?.スケール.段階数 ?? null],
    ["自己解決レベル", ev?.自己解決レベル ?? ""],
  ];
  for (const r of evRows) {
    const row = ws2.addRow(r);
    row.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
    row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
  }
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

/* ─────────────── 候補者一覧.xlsx ─────────────── */

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
    "主体性",
    "問題解決力",
    "対人影響力",
    "柔軟性",
  ];

  const ws = wb.addWorksheet("①D_候補者一覧", {
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
    // 経歴サマリ列: 構造化された 経歴 フィールドがあれば優先、無ければ 要約 をフォールバック
    const career = candidate?.経歴?.trim() ?? "";
    const skills = candidate?.主要スキル?.trim() ?? "";
    const strengths = candidate?.強み?.trim() ?? "";
    const careerCol = career || (candidate?.要約 ?? "");
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
    console.warn("[excelMirror] 候補者一覧.xlsx 書込失敗:", e);
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
