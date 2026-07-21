/**
 * Anthropic 公式 docs から Claude モデルの単価を自動取得する。
 *
 * データ源: https://platform.claude.com/docs/en/about-claude/pricing
 * キャッシュ先: `<dataRoot>/.pricing-cache.json`（24h TTL）
 *
 * 呼び出しフロー:
 *   instrumentation.ts (server 起動時) → ensurePricingFreshOrRefresh() → 24h 経過なら fetch
 *   /settings ページの「即時更新」ボタン → refreshPricingNow() → 強制 fetch
 *   lib/pricing.ts → getPricing() 内で cache を先に見る → hardcoded fallback
 *
 * 3 段 fallback（§ 障害耐性）:
 *   1. cache 有効（<24h）→ そのまま使う
 *   2. cache 無効 or 無し → 官方 docs を fetch → 成功したら cache 更新
 *   3. fetch 失敗 → 古い cache を使う（あれば）
 *   4. cache も無い → lib/pricing.ts の hardcoded 値
 *
 * ⚠ HTML パーサは Anthropic docs のテーブル構造に依存する。構造が変わったら
 * `parsePricingHtml` を調整する。フォールバック連鎖のおかげで壊れても即死しない。
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot } from "./storage";
import type { ModelPricing } from "./pricing";

const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "resume-claude-app/1.0 (pricing sync from official docs)";

export interface PricingCache {
  /** ISO timestamp — cache 保存時刻 */
  fetchedAt: string;
  /** 参照した URL（変更時のトレース用） */
  source: string;
  /** API ID → 単価 */
  models: Record<string, ModelPricing>;
}

function cachePath(): string {
  return path.join(getDataRoot(), ".pricing-cache.json");
}

export function readPricingCache(): PricingCache | null {
  const p = cachePath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as PricingCache;
    if (!parsed.fetchedAt || !parsed.models) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheAgeMs(): number | null {
  const c = readPricingCache();
  if (!c) return null;
  const t = new Date(c.fetchedAt).getTime();
  if (isNaN(t)) return null;
  return Date.now() - t;
}

function writePricingCache(cache: PricingCache): void {
  const p = cachePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // 原子書き込み（tmp + rename）
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

/**
 * 官方 docs から HTML を取って parse。失敗時は throw。成功時は cache に書いて返す。
 */
export async function refreshPricingNow(): Promise<PricingCache> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(PRICING_URL, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Anthropic docs HTTP ${res.status}`);
    }
    const html = await res.text();
    const models = parsePricingHtml(html);
    if (Object.keys(models).length === 0) {
      throw new Error("HTML パース結果が 0 件（テーブル構造変更の可能性）");
    }
    const cache: PricingCache = {
      fetchedAt: new Date().toISOString(),
      source: PRICING_URL,
      models,
    };
    writePricingCache(cache);
    console.log(
      `[pricingFetch] refreshed: ${Object.keys(models).length} models from ${PRICING_URL}`,
    );
    return cache;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 起動時に呼ばれる。cache が新鮮（<24h）ならスキップ、古ければ background で fetch。
 * ネットワーク失敗しても throw しない（起動をブロックしない）。
 */
export async function ensurePricingFreshOrRefresh(): Promise<void> {
  const age = cacheAgeMs();
  if (age !== null && age < CACHE_TTL_MS) {
    console.log(`[pricingFetch] cache fresh (age=${Math.floor(age / 60000)}min), skip`);
    return;
  }
  try {
    await refreshPricingNow();
  } catch (e) {
    console.error(
      `[pricingFetch] refresh failed (will keep old cache if any):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/* ─────────────── HTML パーサ ─────────────── */

/**
 * Anthropic docs の Markdown/HTML から Claude モデルの単価を抽出。
 *
 * 想定パターン: 各モデル行が
 *   Claude <name> ... $<input> / MTok ... ($cache_5m) ... ($cache_1h) ... ($cache_read) ... $<output> / MTok
 *
 * HTML の <td> やスペースが混じっても平坦化してから regex を当てる。
 * display 名 → API ID の写像は下の DISPLAY_TO_ID テーブルに集約。
 */
export function parsePricingHtml(html: string): Record<string, ModelPricing> {
  // タグを空白に置換し、複数空白を 1 個に纏める（改行 / 属性 / <br> 対策）
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const models: Record<string, ModelPricing> = {};

  // 「Claude <name> ... $A / MTok ... $B / MTok ... $C / MTok ... $D / MTok ... $E / MTok」
  // 5 個の $X / MTok が並ぶ = base input, 5m cache write, 1h cache write, cache read, output
  const rowRe =
    /Claude\s+([A-Za-z0-9. ]+?)(?:\s*\([^)]*\))?\s+\$([\d.]+)\s*\/\s*MTok\s+\$[\d.]+\s*\/\s*MTok\s+\$[\d.]+\s*\/\s*MTok\s+\$[\d.]+\s*\/\s*MTok\s+\$([\d.]+)\s*\/\s*MTok/g;

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(flat)) !== null) {
    const displayName = m[1].trim();
    const inputUsd = parseFloat(m[2]);
    const outputUsd = parseFloat(m[3]);
    const apiId = displayNameToApiId(displayName);
    if (apiId && !models[apiId]) {
      // 最初の match を優先（"Model pricing" 表 = 通常価格、下の Batch 表は 50% off で別）
      models[apiId] = {
        inputUsdPerMTok: inputUsd,
        outputUsdPerMTok: outputUsd,
      };
    }
  }

  return models;
}

/**
 * docs の Model 列は display 名（例: "Claude Fable 5"）のみのため、API ID との写像を持つ。
 * 新モデルが登場したら display 名を追加すれば拾われる。未登録の名前は null → cache に載らないが
 * lib/pricing.ts の hardcoded 側で拾える or 次回ここを更新。
 */
function displayNameToApiId(name: string): string | null {
  const s = name.replace(/\s+/g, " ").trim().toLowerCase();
  // Fable / Mythos
  if (/^fable\s*5\b/.test(s)) return "claude-fable-5";
  if (/^mythos\s*5\b/.test(s)) return "claude-mythos-5";
  // Opus 系
  if (/^opus\s*4\.?8\b/.test(s)) return "claude-opus-4-8";
  if (/^opus\s*4\.?7\b/.test(s)) return "claude-opus-4-7";
  if (/^opus\s*4\.?6\b/.test(s)) return "claude-opus-4-6";
  if (/^opus\s*4\.?5\b/.test(s)) return "claude-opus-4-5-20251101";
  if (/^opus\s*4\.?1\b/.test(s)) return "claude-opus-4-1-20250805";
  // Sonnet 系
  if (/^sonnet\s*5\b/.test(s)) return "claude-sonnet-5";
  if (/^sonnet\s*4\.?6\b/.test(s)) return "claude-sonnet-4-6";
  if (/^sonnet\s*4\.?5\b/.test(s)) return "claude-sonnet-4-5-20250929";
  // Haiku 系
  if (/^haiku\s*4\.?5\b/.test(s)) return "claude-haiku-4-5-20251001";
  return null;
}
