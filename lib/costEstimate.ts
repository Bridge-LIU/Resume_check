/**
 * audit.log を読んで LLM API のコストを概算する。
 *
 * 入力は writeAudit に積んだ meta:
 *   - provider, model, inputChars, outputChars
 * を持つ AuditEvent（①候補者要約 / ③質問生成・整形 / ④面談内容要約 / ⑤評価API）。
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
  | "①要約"
  | "③生成"
  | "③整形"
  | "④面談内容"
  | "⑤評価";

const EVENT_TO_STAGE: Partial<Record<AuditEvent, Stage>> = {
  "session.candidateSummarize": "①要約",
  "session.questionsGenerate": "③生成",
  "session.questionsReformat": "③整形",
  "session.minutesSummarize": "④面談内容",
  "session.saveEvaluation": "⑤評価",
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
      // 月キーも Asia/Tokyo 基準。UTC で切ると月初/月末深夜の記録がズレる。
      yyyymm: jstMonthKey(e.ts),
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

/* ───────────── 日次時系列（/cost の推移チャート用） ───────────── */

export interface DailyPoint {
  /** "YYYY-MM-DD"（Asia/Tokyo の日付キー。UTC の午前 0 時ズレを吸収済み） */
  date: string;
  count: number;
  totalJpy: number;
  totalUsd: number;
}

/**
 * ISO 時刻文字列（"...Z" 想定）を Asia/Tokyo の "YYYY-MM-DD" に変換。
 * `sv-SE` locale は ISO 形式（YYYY-MM-DD）で日付を返すため、split 不要で 1 発でキーが取れる。
 * 用途: 日本国内での面談ツールの日次コスト集計。UTC 日で切ると朝 9 時前の記録が前日扱いになる。
 */
function jstDateKey(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Asia/Tokyo 基準の "YYYY-MM" 月キー。 */
function jstMonthKey(input: string | Date): string {
  return jstDateKey(input).slice(0, 7);
}

/**
 * 過去 `days` 日分の日次コスト系列を返す。データが 1 件も無い日は 0 埋め。
 * 出力は日付昇順（古い日 → 新しい日）。チャート描画にそのまま使える。
 * 日付境界は Asia/Tokyo 基準。
 */
export function aggregateByDay(records: CostRecord[], days = 30): DailyPoint[] {
  const map = new Map<string, { count: number; jpy: number; usd: number }>();
  for (const r of records) {
    const d = jstDateKey(r.ts);
    const cur = map.get(d) ?? { count: 0, jpy: 0, usd: 0 };
    map.set(d, {
      count: cur.count + 1,
      jpy: cur.jpy + r.cost.totalJpy,
      usd: cur.usd + r.cost.totalUsd,
    });
  }
  // 「今日」を基準に days 日分の空セルを用意して、実データをはめ込む。
  // 「今日」判定も Asia/Tokyo 基準にすることで、深夜 0-9 時に開いても当日が右端に来る。
  const today = new Date();
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = jstDateKey(d);
    const v = map.get(key);
    out.push({
      date: key,
      count: v?.count ?? 0,
      totalJpy: v?.jpy ?? 0,
      totalUsd: v?.usd ?? 0,
    });
  }
  return out;
}

/* ───────────── モデル別 想定単価（ハイブリッド推算） ───────────── */

/**
 * 工程別の想定 char 数フォールバック（実データが無いモデル用）。
 * 既存の prompt 実装を目安に、上限見積り寄りで設定。
 * ③整形は ③生成 の派生なので単独ではセット合計に含めない。
 */
export const STAGE_FALLBACK_CHARS: Record<
  "①要約" | "③生成" | "④面談内容" | "⑤評価",
  { inputChars: number; outputChars: number }
> = {
  "①要約": { inputChars: 8000, outputChars: 2000 },
  "③生成": { inputChars: 4000, outputChars: 4000 },
  "④面談内容": { inputChars: 6000, outputChars: 1200 },
  "⑤評価": { inputChars: 3500, outputChars: 3000 },
};

/**
 * 1 面談セットに含める工程。
 * - ③整形は ③生成 の派生なので含めない。
 * - ④面談内容 は現在 UI 経由の API 呼び出し導線が無い（貼付だけで完結）。集計には載せない。
 *   dead code の summarizeMinutesApiAction が復活したらここに追加すること。
 */
export const SET_STAGES: ("①要約" | "③生成" | "④面談内容" | "⑤評価")[] = [
  "①要約",
  "③生成",
  "⑤評価",
];

export interface StageEstimate {
  stage: "①要約" | "③生成" | "④面談内容" | "⑤評価";
  inputChars: number;
  outputChars: number;
  cost: CostBreakdown;
  /** "real" = このプロジェクトの実データ中央値 / "fallback" = 既定見積 */
  source: "real" | "fallback";
  /** 中央値算出に使ったサンプル数（source=real のみ意味を持つ） */
  sampleCount: number;
}

export interface ModelEstimate {
  model: string;
  stages: StageEstimate[];
  /** 1 セット（SET_STAGES）を通したときの合計コスト */
  setCost: CostBreakdown;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * ハイブリッド推算：
 *   実データがあれば該当モデル × 工程の inputChars / outputChars の中央値、
 *   無ければ STAGE_FALLBACK_CHARS。
 * `estimateCost` を通してモデル単価で換算するため、他モデルの実績を借りて
 * 単価だけ差し替える形になる（=「もし Sonnet で同じ量をやったら」の見積になる）。
 * 実データを借りる範囲は「全モデル横断で該当工程の中央値」。
 */
export function estimateModelSetCost(
  model: string,
  allRecords: CostRecord[],
): ModelEstimate {
  const perStage: StageEstimate[] = SET_STAGES.map((stage) => {
    // まず「該当モデル自身の該当工程」の実データを優先
    const ownRecords = allRecords.filter(
      (r) => r.model === model && r.stage === stage,
    );
    // 自モデルに実績が無ければ「該当工程の他モデル実績」を借りる
    const pool = ownRecords.length > 0
      ? ownRecords
      : allRecords.filter((r) => r.stage === stage);

    if (pool.length > 0) {
      const inputChars = median(pool.map((r) => r.inputChars));
      const outputChars = median(pool.map((r) => r.outputChars));
      return {
        stage,
        inputChars,
        outputChars,
        cost: estimateCost(model, inputChars, outputChars),
        // 「実データを借用した」かどうかで real / fallback を区別。
        // 自モデル実績があれば real、他モデル借用は fallback 扱い（見積であることを明示）。
        source: ownRecords.length > 0 ? "real" : "fallback",
        sampleCount: ownRecords.length,
      } satisfies StageEstimate;
    }

    // 実データも借用元も無ければ既定見積
    const fb = STAGE_FALLBACK_CHARS[stage];
    return {
      stage,
      inputChars: fb.inputChars,
      outputChars: fb.outputChars,
      cost: estimateCost(model, fb.inputChars, fb.outputChars),
      source: "fallback",
      sampleCount: 0,
    } satisfies StageEstimate;
  });

  // セット合計 = 4 工程を合算した CostBreakdown
  const setCost: CostBreakdown = perStage.reduce<CostBreakdown>(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.cost.inputTokens,
      outputTokens: acc.outputTokens + s.cost.outputTokens,
      inputUsd: acc.inputUsd + s.cost.inputUsd,
      outputUsd: acc.outputUsd + s.cost.outputUsd,
      totalUsd: acc.totalUsd + s.cost.totalUsd,
      totalJpy: acc.totalJpy + s.cost.totalJpy,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      inputUsd: 0,
      outputUsd: 0,
      totalUsd: 0,
      totalJpy: 0,
    },
  );

  return { model, stages: perStage, setCost };
}
