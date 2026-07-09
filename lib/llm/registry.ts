/**
 * プロバイダごとに「使用可能なモデル」と「ラベル/ティア」を持つカタログ。
 * UI（/settings の select、セッションの optgroup）はここを参照する。
 */

import type { ProviderId } from "../types";

export type Tier = "fast" | "balanced" | "max";

export interface ModelInfo {
  id: string;
  /** 表示名（短い） */
  label: string;
  tier: Tier;
}

export interface ProviderInfo {
  id: ProviderId;
  /** 日本語名 */
  displayName: string;
  /** 短い識別ラベル（pill 用） */
  shortName: string;
  /** UI のアクセントカラー（Tailwind 用） */
  accent: string;
  /** 絵文字アイコン */
  icon: string;
  models: ModelInfo[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic Claude",
    shortName: "Claude",
    accent: "amber",
    icon: "🟠",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tier: "fast" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6", tier: "balanced" },
      { id: "claude-opus-4-7", label: "Opus 4.7", tier: "max" },
    ],
  },
  openai: {
    id: "openai",
    displayName: "OpenAI ChatGPT",
    shortName: "ChatGPT",
    accent: "emerald",
    icon: "🟢",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "fast" },
      { id: "gpt-4o", label: "GPT-4o", tier: "balanced" },
      { id: "o1-mini", label: "o1-mini", tier: "balanced" },
      { id: "o1", label: "o1", tier: "max" },
    ],
  },
  google: {
    id: "google",
    displayName: "Google Gemini",
    shortName: "Gemini",
    accent: "indigo",
    icon: "🔵",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "fast" },
      { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro", tier: "balanced" },
    ],
  },
};

export const TIER_ICON: Record<Tier, string> = {
  fast: "⚡",
  balanced: "⚖",
  max: "🎯",
};

export const TIER_LABEL: Record<Tier, string> = {
  fast: "速い・安い",
  balanced: "標準",
  max: "高精度",
};

/**
 * 全プロバイダ ID（型定義と揃える）。
 * 過去データ（`provider: "openai"` 等の cost/評価記録）を読むためには
 * 3 種類とも型・アダプタ・pricing に残しておく必要がある。
 */
export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "google"];

/**
 * UI で選択可能な有効プロバイダ。
 * 現在は Claude のみサポート。/settings や既定選択ロジックはここを参照する。
 * OpenAI / Google を再開するときはこの配列に足すだけ（アダプタ・pricing は生きたまま）。
 */
export const PROVIDER_IDS_ACTIVE: ProviderId[] = ["anthropic"];

export function isActiveProvider(id: ProviderId): boolean {
  return PROVIDER_IDS_ACTIVE.includes(id);
}
