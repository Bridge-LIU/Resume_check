/**
 * audit.log を読んで LLM API のコストを概算する。
 *
 * 入力は writeAudit に積んだ meta:
 *   - provider, model, inputChars, outputChars
 * を持つ AuditEvent（②候補者要約 / ⑤質問生成・整形 / ⑥面談内容要約 / ⑧評価API）。
 *
 * 概算ロジック: 文字数 → token は CHARS_PER_TOKEN（≈2.5字/token）の固定換算。
 * 実額は Console / 請求書 を正とし、本表示はあくまで「上限見積り」として使う。
 */

import "server-only";
import { readAudit, type AuditEvent, type AuditLogEntry } from "./auditLog";
import { estimateCost, type CostBreakdown } from "./pricing";
import type { ProviderId } from "./types";

const LLM_EVENTS: AuditEvent[] = [
  "session.candidateSummarize",
  "session.questionsGenerate",
  "session.questionsReformat",
  "session.minutesSummarize",
  "session.saveEvaluation",
];

/** UI 表示用に工程ラベルへ正規化 */
export type Stage =
  | "②要約"
  | "⑤生成"
  | "⑤整形"
  | "⑥面談内容"
  | "⑧評価";

const EVENT_TO_STAGE: Partial<Record<AuditEvent, Stage>> = {
  "session.candidateSummarize": "②要約",
  "session.questionsGenerate": "⑤生成",
  "session.questionsReformat": "⑤整形",
  "session.minutesSummarize": "⑥面談内容",
  "session.saveEvaluation": "⑧評価",
};

export interface CostRecord {
  ts: string;
  yyyymm: string; // "2026-06"
  stage: Stage;
  provider: ProviderId;
  model: string;
  inputChars: number;
  outputChars: number;
  cost: CostBreakdown;
  sessionId?: string;
  knownPricing: boolean;
}

function parseMeta(entry: AuditLogEntry): {
  provider?: ProviderId;
  model?: string;
  inputChars?: number;
  outputChars?: number;
} {
  const m = entry.meta ?? {};
  return {
    provider: typeof m.provider === "string" ? (m.provider as ProviderId) : undefined,
    model: typeof m.model === "string" ? m.model : undefined,
    inputChars: typeof m.inputChars === "number" ? m.inputChars : undefined,
    outputChars: typeof m.outputChars === "number" ? m.outputChars : undefined,
  };
}

/**
 * audit ログを CostRecord に正規化。
 * - LLM 以外のイベントはスキップ
 * - meta に provider/model がない（＝API 経路でない saveEvaluation 等）はスキップ
 * - inputChars/outputChars が無い古いログは 0 とみなす（コスト 0 で件数だけカウント）
 */
export function loadCostRecords(limit = 5000): CostRecord[] {
  const entries = readAudit({ limit });
  const out: CostRecord[] = [];
  for (const e of entries) {
    if (!LLM_EVENTS.includes(e.event)) continue;
    const stage = EVENT_TO_STAGE[e.event];
    if (!stage) continue;
    const { provider, model, inputChars, outputChars } = parseMeta(e);
    if (!provider || !model) continue; // 貼付モード等は記録なし
    const inCh = inputChars ?? 0;
    const outCh = outputChars ?? 0;
    const cost = estimateCost(model, inCh, outCh);
    out.push({
      ts: e.ts,
      yyyymm: e.ts.slice(0, 7),
      stage,
      provider,
      model,
      inputChars: inCh,
      outputChars: outCh,
      cost,
      sessionId: e.sessionId,
      knownPricing: cost.totalUsd > 0 || (inCh === 0 && outCh === 0 ? false : true),
    });
  }
  return out;
}

export interface Aggregate {
  count: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  totalJpy: number;
}

export const ZERO_AGG: Aggregate = {
  count: 0,
  inputChars: 0,
  outputChars: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalUsd: 0,
  totalJpy: 0,
};

function addRecord(agg: Aggregate, r: CostRecord): Aggregate {
  return {
    count: agg.count + 1,
    inputChars: agg.inputChars + r.inputChars,
    outputChars: agg.outputChars + r.outputChars,
    inputTokens: agg.inputTokens + r.cost.inputTokens,
    outputTokens: agg.outputTokens + r.cost.outputTokens,
    totalUsd: agg.totalUsd + r.cost.totalUsd,
    totalJpy: agg.totalJpy + r.cost.totalJpy,
  };
}

export function aggregateBy<K extends string>(
  records: CostRecord[],
  keyOf: (r: CostRecord) => K,
): { key: K; agg: Aggregate }[] {
  const map = new Map<K, Aggregate>();
  for (const r of records) {
    const k = keyOf(r);
    map.set(k, addRecord(map.get(k) ?? ZERO_AGG, r));
  }
  return Array.from(map.entries())
    .map(([key, agg]) => ({ key, agg }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function aggregateTotal(records: CostRecord[]): Aggregate {
  return records.reduce(addRecord, ZERO_AGG);
}
