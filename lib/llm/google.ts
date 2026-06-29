import "server-only";
import { loadSettings } from "../storage";
import type { LlmAdapter } from "./types";
import { LlmCallError, LlmKeyError } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function getKey(): string {
  const fromEnv =
    process.env.GOOGLE_API_KEY?.trim() ?? process.env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return loadSettings().providers.google.key.trim();
}

export const googleAdapter: LlmAdapter = {
  id: "google",
  hasKey: () => !!getKey(),
  async call({ model, system, user, maxTokens, jsonMode }) {
    const key = getKey();
    if (!key) throw new LlmKeyError("google");

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens ?? 2000,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };

    // ⚠ キーは URL クエリではなくヘッダで渡す。クエリ方式だと
    // 上流エラーレスポンスに URL がエコーされた際にキーが漏れる経路ができる。
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new LlmCallError("google", res.status, text);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  },
};
