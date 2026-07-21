/**
 * LLM プロバイダ × モデル の単価表（per 1M tokens、USD）
 *
 * - 価格は 2026-07 時点の公開価格を採用。実勢は Console / 請求書を正とする
 * - キャッシュ割引や Batch 割引は考慮しない（コストは「上限見積り」）
 * - 為替は USD→JPY を 1$ = ¥162 で固定（Settings 化は今後）
 * - 出力 token を `outputChars / CHARS_PER_TOKEN` で概算するため、日本語比率が高いほど
 *   実コストとズレやすい。実額は Phase B (adapter usage 取得) で正規化する予定
 * - 廃止済みモデル（gpt-4o 系 / gemini-2.0-*）は過去の cost 記録の再計算用に残す
 */

import type { ProviderId } from "./types";

export const USD_TO_JPY = 162;

/** 日本語想定。1 token ≈ 2.5 文字（英語は ≈ 4 文字、混在の妥協値） */
export const CHARS_PER_TOKEN = 2.5;

export interface ModelPricing {
  /** 入力 1M tokens あたりの USD */
  inputUsdPerMTok: number;
  /** 出力 1M tokens あたりの USD */
  outputUsdPerMTok: number;
}

/**
 * 既知モデルの単価表。registry.ts に登録されているモデル ID をキーにする。
 * 未登録モデルは推定不可（estimateCost で 0 にフォールバック）。
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ─── Anthropic（2026-07 現行） ───
  "claude-haiku-4-5-20251001": { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
  "claude-sonnet-4-6": { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
  // Opus 4.5 以降で新価格体系に。旧 Opus 4.1 の $15/$75 から大幅値下げ
  "claude-opus-4-7": { inputUsdPerMTok: 5.0, outputUsdPerMTok: 25.0 },
  // 参考: 現在 registry.ts 未登録の新モデル。単価表に入れておけば手動指定でも
  // 集計に載る。将来 registry に足す時にここは触らなくて済む
  "claude-opus-4-8": { inputUsdPerMTok: 5.0, outputUsdPerMTok: 25.0 },
  // Sonnet 5: 2026-08-31 まで導入価格 $2/$10、以降 $3/$15
  "claude-sonnet-5": { inputUsdPerMTok: 2.0, outputUsdPerMTok: 10.0 },

  // ─── OpenAI（現行 GPT-5 系） ───
  "gpt-5.5": { inputUsdPerMTok: 5.0, outputUsdPerMTok: 30.0 },
  "gpt-5.4": { inputUsdPerMTok: 2.5, outputUsdPerMTok: 15.0 },
  "gpt-5.4-mini": { inputUsdPerMTok: 0.75, outputUsdPerMTok: 4.5 },
  "gpt-5.4-nano": { inputUsdPerMTok: 0.2, outputUsdPerMTok: 1.25 },
  // OpenAI 廃止済（過去 cost 記録の再集計用に残す）
  "gpt-4o-mini": { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 },
  "gpt-4o": { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10.0 },
  "o1-mini": { inputUsdPerMTok: 3.0, outputUsdPerMTok: 12.0 },
  "o1": { inputUsdPerMTok: 15.0, outputUsdPerMTok: 60.0 },

  // ─── Google（現行 Gemini 2.5 / 3.5） ───
  "gemini-3.5-flash": { inputUsdPerMTok: 1.5, outputUsdPerMTok: 9.0 },
  // 2.5 Pro は ≤200k と >200k で 2 段階だが、上限見積として ≤200k 側で概算
  "gemini-2.5-pro": { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10.0 },
  "gemini-2.5-flash": { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
  // Gemini 2.0 Flash は 2026-06-01 に廃止済。過去記録用に単価を残す
  "gemini-2.0-flash": { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
  // gemini-2.0-pro は Google の公式ラインナップに存在しないが registry に登録済のため
  // 誤選択された過去記録の再集計用に単価を暫定で残す（実額は Console 参照）
  "gemini-2.0-pro": { inputUsdPerMTok: 1.25, outputUsdPerMTok: 5.0 },
};

export function getPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? null;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  totalJpy: number;
}

/**
 * 文字数 → token → コスト の換算（概算）。未知モデルは 0 を返す。
 * 単一呼び出しのコストを返す（合算は呼び出し側）。
 * 真の token 数が API レスポンスから取れる場合は `estimateCostFromTokens` を使う。
 */
export function estimateCost(
  model: string,
  inputChars: number,
  outputChars: number,
  opts?: { pricingOverride?: ModelPricing | null },
): CostBreakdown {
  const p = opts?.pricingOverride ?? getPricing(model);
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN);
  const outputTokens = Math.ceil(outputChars / CHARS_PER_TOKEN);
  if (!p) {
    return {
      inputTokens,
      outputTokens,
      inputUsd: 0,
      outputUsd: 0,
      totalUsd: 0,
      totalJpy: 0,
    };
  }
  const inputUsd = (inputTokens / 1_000_000) * p.inputUsdPerMTok;
  const outputUsd = (outputTokens / 1_000_000) * p.outputUsdPerMTok;
  const totalUsd = inputUsd + outputUsd;
  return {
    inputTokens,
    outputTokens,
    inputUsd,
    outputUsd,
    totalUsd,
    totalJpy: totalUsd * USD_TO_JPY,
  };
}

/**
 * 真の token 数（provider の usage 由来）からコストを算出。文字数概算より精度が高い。
 * cache read は 0.1x 割引、cache creation は 1.25x 加算（Anthropic 5m キャッシュ料金体系）。
 * 未知モデルは 0 を返す。
 *
 * `pricingOverride` を渡せば MODEL_PRICING を無視してその単価で計算する（server-only の
 * 自動取得キャッシュから値を注入するのに使う。pricing.ts 本体は client bundle に載るため
 * fs アクセス禁止 → 呼び出し側で cache を解決して override として渡す設計）。
 */
export function estimateCostFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  opts?: {
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    pricingOverride?: ModelPricing | null;
  },
): CostBreakdown {
  const p = opts?.pricingOverride ?? getPricing(model);
  if (!p) {
    return {
      inputTokens,
      outputTokens,
      inputUsd: 0,
      outputUsd: 0,
      totalUsd: 0,
      totalJpy: 0,
    };
  }
  // Anthropic の場合: input_tokens は「cache 以外の通常入力」の値になる。
  // cache_creation は 1.25x、cache_read は 0.1x で個別課金。
  const baseInputUsd = (inputTokens / 1_000_000) * p.inputUsdPerMTok;
  const cacheCreationUsd = opts?.cacheCreationTokens
    ? (opts.cacheCreationTokens / 1_000_000) * p.inputUsdPerMTok * 1.25
    : 0;
  const cacheReadUsd = opts?.cacheReadTokens
    ? (opts.cacheReadTokens / 1_000_000) * p.inputUsdPerMTok * 0.1
    : 0;
  const inputUsd = baseInputUsd + cacheCreationUsd + cacheReadUsd;
  const outputUsd = (outputTokens / 1_000_000) * p.outputUsdPerMTok;
  const totalUsd = inputUsd + outputUsd;
  return {
    inputTokens,
    outputTokens,
    inputUsd,
    outputUsd,
    totalUsd,
    totalJpy: totalUsd * USD_TO_JPY,
  };
}

/** UI 用ヘルパ */
export function fmtJpy(jpy: number): string {
  if (jpy < 1) return `¥${jpy.toFixed(2)}`;
  if (jpy < 100) return `¥${jpy.toFixed(1)}`;
  return `¥${Math.round(jpy).toLocaleString()}`;
}

export function fmtUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function knownModels(): string[] {
  return Object.keys(MODEL_PRICING);
}

export function isPricingKnown(model: string): boolean {
  return model in MODEL_PRICING;
}

export type { ProviderId };
