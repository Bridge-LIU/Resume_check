import "server-only";
import { loadSettings } from "../storage";
import type { LlmStage, ProviderId } from "../types";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import type { LlmAdapter, LlmCallOptions, LlmCallResult, LlmUsage } from "./types";

export { LlmCallError, LlmKeyError } from "./types";
export type { LlmCallOptions, LlmCallResult, LlmStage, LlmUsage, ProviderId };

const ADAPTERS: Record<ProviderId, LlmAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

export function getAdapter(provider: ProviderId): LlmAdapter {
  return ADAPTERS[provider];
}

/** 既定プロバイダ（settings.defaultProvider） */
export function getDefaultProvider(): ProviderId {
  return loadSettings().defaultProvider;
}

/** 指定プロバイダ × 工程の既定モデル（工程モデルが空なら provider.defaultModel） */
export function resolveModel(provider: ProviderId, stage: LlmStage): string {
  const cfg = loadSettings().providers[provider];
  return cfg.models[stage] ?? cfg.defaultModel;
}

/** プロバイダ + 工程から override 込みで model を決める。session 側の override が最優先 */
export function resolveProviderAndModel(
  stage: LlmStage,
  override?: { provider?: ProviderId; model?: string },
): { provider: ProviderId; model: string } {
  const provider = override?.provider ?? getDefaultProvider();
  const model = override?.model ?? resolveModel(provider, stage);
  return { provider, model };
}

/** どのプロバイダでもいいので使えるキーがあるか（既定プロバイダ優先） */
export function hasAnyKey(): boolean {
  const def = getDefaultProvider();
  if (ADAPTERS[def].hasKey()) return true;
  return (Object.keys(ADAPTERS) as ProviderId[]).some((id) => ADAPTERS[id].hasKey());
}

/** 指定プロバイダにキーがあるか */
export function hasKey(provider: ProviderId): boolean {
  return ADAPTERS[provider].hasKey();
}

/**
 * プロバイダを指定して LLM 呼び出し。actions.ts が使うメインエントリ。
 *
 * 戻り値は `{ text, usage? }`（LlmCallResult）。`usage` はプロバイダのレスポンスから
 * 取れた真の token 数で、audit meta に書けば cost 集計が概算ではなく実測になる。
 * プロバイダが usage を返さないケース（過去モデル・エラー等）は undefined でフォールバック。
 */
export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  return ADAPTERS[opts.provider].call({
    model: opts.model,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens,
    cacheSystem: opts.cacheSystem,
    jsonMode: opts.jsonMode,
  });
}

/**
 * LLM が返したテキストを JSON としてパース。
 * - ```json ... ``` のコードフェンスを取り除く
 * - 前後の説明文があっても最外側の { ... } を抜き出す
 */
export function parseJsonResponse<T>(text: string): T {
  let cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned) as T;
}
