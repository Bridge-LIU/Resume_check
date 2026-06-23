import "server-only";
import { loadSettings } from "../storage";
import type { LlmAdapter } from "./types";
import { LlmCallError, LlmKeyError } from "./types";

const API_URL = "https://api.openai.com/v1/chat/completions";

function getKey(): string {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return loadSettings().providers.openai.key.trim();
}

export const openaiAdapter: LlmAdapter = {
  id: "openai",
  hasKey: () => !!getKey(),
  async call({ model, system, user, maxTokens, jsonMode }) {
    const key = getKey();
    if (!key) throw new LlmKeyError("openai");

    // o1 系は system role 非対応 → user に畳み込む
    const isReasoning = model.startsWith("o1") || model.startsWith("o3");
    const messages = isReasoning
      ? [{ role: "user", content: `${system}\n\n---\n\n${user}` }]
      : [
          { role: "system", content: system },
          { role: "user", content: user },
        ];

    const body: Record<string, unknown> = { model, messages };
    if (!isReasoning) {
      // o1 系は max_tokens / response_format 非対応
      body.max_tokens = maxTokens ?? 2000;
      if (jsonMode) body.response_format = { type: "json_object" };
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new LlmCallError("openai", res.status, text);
    }

    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
    };
    return data.choices[0]?.message?.content ?? "";
  },
};
