// 操作マニュアル用スクショ生成（Playwright 版）
// - 前提: dev server (http://127.0.0.1:3939) が動いていること
// - 出力: manual/assets/*.png
// - 実行: node scripts/manual-screenshot.mjs
//
// マニュアル HTML が参照する 11 画像:
//   home / list / new / trash / master / settings / cost / analytics /
//   compare / compare-transposed / session

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "manual", "assets");
const BASE = process.env.BASE || "http://127.0.0.1:3939";
const SESSIONS_ROOT = path.join(REPO_ROOT, "data", "sessions");

fs.mkdirSync(OUT_DIR, { recursive: true });

/** 評価済（evaluation.json あり）のセッションを新しい順に返す */
function evaluatedSessions() {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  return fs
    .readdirSync(SESSIONS_ROOT)
    .filter((id) => fs.existsSync(path.join(SESSIONS_ROOT, id, "evaluation.json")))
    .sort()
    .reverse();
}

/** セッション詳細用: 「測試」を優先、なければ任意の評価済 */
function pickSessionForDetail() {
  const all = evaluatedSessions();
  const test = all.find((id) => id.includes("測試"));
  return test ?? all[0] ?? null;
}

/** 比較用 ID を最大 max 件、URL エンコード + カンマ連結で返す */
function collectCompareIds(max) {
  return evaluatedSessions()
    .slice(0, max)
    .map((id) => encodeURIComponent(id))
    .join(",");
}

const sessionId = pickSessionForDetail();
if (!sessionId) {
  console.error("⚠ 評価済のセッションが 1 件もありません。data/sessions/ に評価済セッションを用意してから再実行してください。");
  process.exit(1);
}
const sessionIdEnc = encodeURIComponent(sessionId);
console.log(`📋 セッション詳細用: ${sessionId}`);

const compareSmallIds = collectCompareIds(3);
const compareLargeIdsRaw = evaluatedSessions().slice(0, 12);
const compareLargeIds = compareLargeIdsRaw.map((id) => encodeURIComponent(id)).join(",");
const compareLargeN = compareLargeIdsRaw.length;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: "light",
});

/**
 * 指定 URL のフルページスクショを撮る。
 * @param name 出力ファイル名（拡張子なし）
 * @param url  対象 URL
 * @param opts 追加オプション（width / fullPage / delay）
 */
async function shoot(name, url, opts = {}) {
  const width = opts.width ?? 1200;
  const fullPage = opts.fullPage ?? true;
  const delay = opts.delay ?? 500; // JS 描画待ち
  const page = await context.newPage();
  await page.setViewportSize({ width, height: opts.height ?? 800 });
  console.log(`📷 ${name}  ← ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // ダッシュボードのフォント / SVG / チャートが安定するまで少し待つ
    await page.waitForTimeout(delay);
    const out = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: out, fullPage });
    const size = fs.statSync(out).size;
    console.log(`   ✅ ${(size / 1024).toFixed(1)} KB  →  ${out}`);
  } catch (e) {
    console.error(`   ❌ ${name} 失敗:`, e.message);
  } finally {
    await page.close();
  }
}

try {
  // 主要画面
  await shoot("home",       `${BASE}/`);
  await shoot("list",       `${BASE}/list`);
  await shoot("new",        `${BASE}/new`);
  await shoot("trash",      `${BASE}/trash`);
  await shoot("master",     `${BASE}/master`);
  await shoot("settings",   `${BASE}/settings`);
  await shoot("cost",       `${BASE}/cost`);
  await shoot("analytics",  `${BASE}/analytics`);

  // 比較 (2〜6 件の標準ビュー)
  if (compareSmallIds) {
    await shoot("compare", `${BASE}/compare?ids=${compareSmallIds}`);
  }
  // 比較 (7 件以上の転置ビュー)
  if (compareLargeN >= 7) {
    await shoot("compare-transposed", `${BASE}/compare?ids=${compareLargeIds}`);
  }

  // セッション詳細（縦に長いので追加の待機）
  await shoot("session", `${BASE}/sessions/${sessionIdEnc}`, { delay: 1000 });
} finally {
  await browser.close();
}

// 生成状況を最後にまとめて出す
console.log("\n=== 生成された画像 ===");
for (const f of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")).sort()) {
  const size = fs.statSync(path.join(OUT_DIR, f)).size;
  console.log(`  ${f}  ${(size / 1024).toFixed(1)} KB`);
}
console.log("\n✅ 完了");
