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
    super(`${provider} API error ${status}: ${message}`);
    this.name = "LlmCallError";
  }
}
