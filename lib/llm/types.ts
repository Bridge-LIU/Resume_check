/**
 * LLM プロバイダ抽象化層の共通型。
 * 個別プロバイダ実装（anthropic.ts / openai.ts / google.ts）が満たすべき契約。
 */

import type { LlmStage, ProviderId } from "../types";

export type { LlmStage, ProviderId };

export interface LlmCallOptions {
  provider: ProviderId;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** 同じ system を繰り返す処理で、プロバイダ側のキャッシュ機能を使う */
  cacheSystem?: boolean;
  /** JSON モード（OpenAI: response_format / Gemini: responseMimeType）。プロバイダが未対応なら無視 */
  jsonMode?: boolean;
}

export interface LlmAdapter {
  /** プロバイダ ID */
  id: ProviderId;
  /** API キーが設定されているか（環境変数 or settings ファイル） */
  hasKey(): boolean;
  /** プロバイダごとの呼び出し実装 */
  call(opts: Omit<LlmCallOptions, "provider">): Promise<string>;
}

/**
 * LLM レスポンス本文や HTTP ヘッダから漏れる可能性のある秘密値をマスクする。
 * `LlmCallError.message` はそのまま actions の戻り値として client に渡るため、
 * 必ずここを通してから super() に渡す。
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-(?:ant|proj|live|test)[-_][A-Za-z0-9_-]{8,}/g, // Anthropic / OpenAI
  /sk-[A-Za-z0-9_-]{20,}/g, // 汎用 sk- 接頭辞
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi,
  /key=[A-Za-z0-9_-]{16,}/g,
  /x-api-key:\s*[^\s,;]+/gi,
  /x-goog-api-key:\s*[^\s,;]+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pat of SECRET_PATTERNS) out = out.replace(pat, "[REDACTED]");
  // 長すぎる HTML エラーページ等を切り詰める（漏洩の二次予防）
  if (out.length > 500) out = out.slice(0, 500) + "…";
  return out;
}

export class LlmKeyError extends Error {
  constructor(public provider: ProviderId) {
    super(`APIキーが設定されていません（${provider}）。/settings で設定してください。`);
    this.name = "LlmKeyError";
  }
}

export class LlmCallError extends Error {
  constructor(
    public provider: ProviderId,
    public status: number,
    message: string,
  ) {
    super(`${provider} API error ${status}: ${redactSecrets(message)}`);
    this.name = "LlmCallError";
  }
}
