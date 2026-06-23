/**
 * @deprecated 旧 Claude 専用クライアント。
 * 新コードは `@/lib/llm/provider` (callLlm / resolveModel / hasKey / parseJsonResponse) を直接 import すること。
 * このファイルは既存呼び出し（app/sessions/[id]/actions.ts）の互換のために
 * Anthropic 既定の薄いラッパとして残す。
 */

import "server-only";
import {
  callLlm,
  hasAnyKey,
  parseJsonResponse as _parseJsonResponse,
  resolveModel,
} from "./llm/provider";

/** 旧 API：工程別の既定 Claude モデル */
export const DEFAULT_MODELS = {
  get summary() {
    return resolveModel("anthropic", "summary");
  },
  get questions() {
    return resolveModel("anthropic", "questions");
  },
  get evaluation() {
    return resolveModel("anthropic", "evaluation");
  },
  get evaluationStrict() {
    return resolveModel("anthropic", "evaluationStrict");
  },
} as const;

export function getApiKey(): string {
  // 旧呼び出し互換。新コードは hasKey("anthropic") を使う。
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  // storage に依存させない（古い getApiKey 利用箇所が無いことを期待しつつ最低限のフォールバック）
  return "";
}

export function hasApiKey(): boolean {
  return hasAnyKey();
}

export async function callClaude(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  cacheSystem?: boolean;
}): Promise<string> {
  return callLlm({
    provider: "anthropic",
    model: opts.model,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens,
    cacheSystem: opts.cacheSystem,
  });
}

export const parseJsonResponse = _parseJsonResponse;
