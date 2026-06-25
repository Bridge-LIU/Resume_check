/**
 * LLM プロバイダ × モデル の単価表（per 1M tokens、USD）
 *
 * - 価格は 2026-06 時点の公開価格を採用。実勢は Console / 請求書を正とする
 * - キャッシュ割引や Batch 割引は考慮しない（コストは「上限見積り」）
 * - 為替は USD→JPY を 1$ = ¥160 で固定（Settings 化は今後）
 * - 出力 token を `outputChars / CHARS_PER_TOKEN` で概算するため、日本語比率が高いほど
 *   実コストとズレやすい。実額は Phase B (adapter usage 取得) で正規化する予定
 */

import type { ProviderId } from "./types";

export const USD_TO_JPY = 160;

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
  // Anthropic
  "claude-haiku-4-5-20251001": { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
  "claude-sonnet-4-6": { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
  "claude-opus-4-7": { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 },

  // OpenAI
  "gpt-4o-mini": { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 },
  "gpt-4o": { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10.0 },
  "o1-mini": { inputUsdPerMTok: 3.0, outputUsdPerMTok: 12.0 },
  "o1": { inputUsdPerMTok: 15.0, outputUsdPerMTok: 60.0 },

  // Google
  "gemini-2.0-flash": { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
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
 * 文字数 → token → コスト の換算。未知モデルは 0 を返す。
 * 単一呼び出しのコストを返す（合算は呼び出し側）。
 */
export function estimateCost(
  model: string,
  inputChars: number,
  outputChars: number,
): CostBreakdown {
  const p = getPricing(model);
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
