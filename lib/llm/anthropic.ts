import "server-only";
import { loadSettings } from "../storage";
import type { LlmAdapter, LlmCallResult } from "./types";
import { LlmCallError, LlmKeyError } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

function getKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return loadSettings().providers.anthropic.key.trim();
}

export const anthropicAdapter: LlmAdapter = {
  id: "anthropic",
  hasKey: () => !!getKey(),
  async call({ model, system, user, maxTokens, cacheSystem }) {
    const key = getKey();
    if (!key) throw new LlmKeyError("anthropic");

    const systemField = cacheSystem
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens ?? 2000,
        system: systemField,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new LlmCallError("anthropic", res.status, text);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const text = data.content.map((c) => c.text ?? "").join("");
    const result: LlmCallResult = { text };
    if (data.usage) {
      result.usage = {
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
        cacheCreationTokens: data.usage.cache_creation_input_tokens,
        cacheReadTokens: data.usage.cache_read_input_tokens,
      };
    }
    return result;
  },
};
