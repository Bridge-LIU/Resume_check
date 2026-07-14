/**
 * 匿名サマリの読み出し・集計層。
 *
 * 保存形式: data/analytics/<idHash>.json
 *   {
 *     idHash, 役割, closedAt, result,
 *     軸評価: [{ 軸, スコア }],
 *     総合スコア, 自己解決レベル, 合否
 *   }
 *
 * PII（氏名・履歴書本文・面談内容本文）は含まれない。
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot } from "./storage";

export interface AnonymizedSummary {
  idHash: string;
  役割: string;
  closedAt: string | null;
  result: "採用" | "不採用" | "未確定";
  /** 小軸を flat 化した配列。各エントリに「大分類」を付与（人間性 / 技術力） */
  軸評価: { 軸: string; スコア: number; 大分類?: "人間性" | "技術力" }[];
  総合スコア: number;
  自己解決レベル: number;
  合否: "合格" | "普通" | "不合格";
}

function analyticsDir(): string {
  return path.join(getDataRoot(), "analytics");
}

export function listAnonymizedSummaries(): AnonymizedSummary[] {
  const dir = analyticsDir();
  if (!fs.existsSync(dir)) return [];
  const out: AnonymizedSummary[] = [];

  function readJsonInto(absDir: string) {
    for (const f of fs.readdirSync(absDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(absDir, f), "utf-8"),
        ) as AnonymizedSummary;
        out.push(data);
      } catch {
        // 壊れた JSON はスキップ
      }
    }
  }

  readJsonInto(dir);

  return out;
}

export interface MonthlyBucket {
  month: string; // "YYYY-MM"
  total: number;
  pass: number; // 合格
  mid: number; // 普通
  fail: number; // 不合格
  avgTotal: number;
}

/** closedAt から年月別に集計（closedAt が null のものは "unknown" バケツに） */
export function aggregateByMonth(items: AnonymizedSummary[]): MonthlyBucket[] {
  const map = new Map<
    string,
    { total: number; pass: number; mid: number; fail: number; sum: number }
  >();
  for (const it of items) {
    const month = it.closedAt
      ? it.closedAt.slice(0, 7) // YYYY-MM
      : "unknown";
    const b = map.get(month) ?? { total: 0, pass: 0, mid: 0, fail: 0, sum: 0 };
    b.total++;
    b.sum += it.総合スコア;
    if (it.合否 === "合格") b.pass++;
    else if (it.合否 === "普通") b.mid++;
    else b.fail++;
    map.set(month, b);
  }
  return Array.from(map.entries())
    .map(([month, b]) => ({
      month,
      total: b.total,
      pass: b.pass,
      mid: b.mid,
      fail: b.fail,
      avgTotal: b.total > 0 ? b.sum / b.total : 0,
    }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface RoleBucket {
  役割: string;
  total: number;
  pass: number;
  mid: number;
  fail: number;
  avgTotal: number;
  passRate: number;
}

export function aggregateByRole(items: AnonymizedSummary[]): RoleBucket[] {
  const map = new Map<
    string,
    { total: number; pass: number; mid: number; fail: number; sum: number }
  >();
  for (const it of items) {
    const b = map.get(it.役割) ?? { total: 0, pass: 0, mid: 0, fail: 0, sum: 0 };
    b.total++;
    b.sum += it.総合スコア;
    if (it.合否 === "合格") b.pass++;
    else if (it.合否 === "普通") b.mid++;
    else b.fail++;
    map.set(it.役割, b);
  }
  return Array.from(map.entries())
    .map(([役割, b]) => ({
      役割,
      total: b.total,
      pass: b.pass,
      mid: b.mid,
      fail: b.fail,
      avgTotal: b.total > 0 ? b.sum / b.total : 0,
      passRate: b.total > 0 ? b.pass / b.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface AxisBucket {
  軸: string;
  count: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  /** 大分類。旧サマリで欠落している軸は undefined（分類なし扱い）。 */
  大分類?: "人間性" | "技術力";
}

export interface AxisVerdictBucket {
  軸: string;
  大分類?: "人間性" | "技術力";
  /** 全件平均 */
  allAvg: number;
  /** 合格者だけの平均（対象 0 のときは 0） */
  passAvg: number;
  /** 不合格者だけの平均（対象 0 のときは 0） */
  failAvg: number;
  /** passAvg - failAvg（合否を分ける決定要因判定用。大きいほど分化力が高い） */
  diff: number;
  passCount: number;
  failCount: number;
}

/**
 * 軸ごとに「合格者平均 / 不合格者平均 / 差分」を出す。
 * 差分が大きい軸 = 合否を分ける決定要因。/analytics「軸別分析」で使用。
 */
export function aggregateByAxisWithVerdict(
  items: AnonymizedSummary[],
): AxisVerdictBucket[] {
  const map = new Map<
    string,
    {
      allSum: number;
      allCount: number;
      passSum: number;
      passCount: number;
      failSum: number;
      failCount: number;
      大分類?: "人間性" | "技術力";
    }
  >();
  for (const it of items) {
    for (const a of it.軸評価) {
      const b = map.get(a.軸) ?? {
        allSum: 0,
        allCount: 0,
        passSum: 0,
        passCount: 0,
        failSum: 0,
        failCount: 0,
        大分類: a.大分類,
      };
      b.allSum += a.スコア;
      b.allCount++;
      if (it.合否 === "合格") {
        b.passSum += a.スコア;
        b.passCount++;
      } else if (it.合否 === "不合格") {
        b.failSum += a.スコア;
        b.failCount++;
      }
      // 旧データ混在対策: 後で確定した 大分類 を採用
      if (b.大分類 === undefined && a.大分類 !== undefined) b.大分類 = a.大分類;
      map.set(a.軸, b);
    }
  }
  return Array.from(map.entries()).map(([軸, b]) => {
    const passAvg = b.passCount > 0 ? b.passSum / b.passCount : 0;
    const failAvg = b.failCount > 0 ? b.failSum / b.failCount : 0;
    return {
      軸,
      大分類: b.大分類,
      allAvg: b.allCount > 0 ? b.allSum / b.allCount : 0,
      passAvg,
      failAvg,
      diff: passAvg - failAvg,
      passCount: b.passCount,
      failCount: b.failCount,
    };
  });
}

export function aggregateByAxis(items: AnonymizedSummary[]): AxisBucket[] {
  const map = new Map<
    string,
    {
      count: number;
      sum: number;
      min: number;
      max: number;
      大分類?: "人間性" | "技術力";
    }
  >();
  for (const it of items) {
    for (const a of it.軸評価) {
      const b = map.get(a.軸) ?? {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        大分類: a.大分類,
      };
      b.count++;
      b.sum += a.スコア;
      if (a.スコア < b.min) b.min = a.スコア;
      if (a.スコア > b.max) b.max = a.スコア;
      // 初回で undefined でも、以後の項目で確定できたら埋める（旧データ混在対策）
      if (b.大分類 === undefined && a.大分類 !== undefined) b.大分類 = a.大分類;
      map.set(a.軸, b);
    }
  }
  return Array.from(map.entries())
    .map(([軸, b]) => ({
      軸,
      count: b.count,
      avgScore: b.count > 0 ? b.sum / b.count : 0,
      minScore: b.count > 0 ? b.min : 0,
      maxScore: b.count > 0 ? b.max : 0,
      大分類: b.大分類,
    }))
    .sort((a, b) => b.count - a.count);
}
