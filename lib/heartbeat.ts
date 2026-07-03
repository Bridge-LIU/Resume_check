/**
 * ブラウザ心拍検知による自動シャットダウン。
 *
 * - start-app.bat が AUTO_SHUTDOWN=1 を設定して起動した場合のみ有効
 * - ブラウザから /api/heartbeat が定期 POST される（layout の HeartbeatPing）
 * - IDLE_TIMEOUT_MS の間 heartbeat が届かなければ「ブラウザが閉じられた」と
 *   みなして process.exit(0) でサーバを終了する。npm run start が終わると
 *   start-app.bat も末尾に到達して自動的にウィンドウが閉じる。
 *
 * 起動直後 120 秒間は grace period（初回ブラウザ起動待ち）。
 *
 * ⚠️ Chrome/Edge は非フォーカスのバックグラウンドタブで setInterval を
 * 約 60 秒間隔に間引く（Intensive Throttling）。閾値を短くしすぎるとタブは
 * 開いたままなのに「ping 途絶」と誤判定されるので、余裕を持って 180 秒に
 * している（バックグラウンドでも 1 分に 1 回は届く前提で 3 倍のマージン）。
 */

import "server-only";

let lastPing = Date.now();
let started = false;

const IDLE_TIMEOUT_MS = 180_000;
const CHECK_INTERVAL_MS = 20_000;
const STARTUP_GRACE_MS = 120_000;

export function markPing(): void {
  lastPing = Date.now();
}

export function startAutoShutdownWatcher(): void {
  if (started) return;
  if (process.env.AUTO_SHUTDOWN !== "1") return;
  started = true;
  const startedAt = Date.now();
  console.log(
    `[auto-shutdown] enabled: exits when no browser ping for ${IDLE_TIMEOUT_MS / 1000}s`,
  );
  const timer = setInterval(() => {
    // 起動直後は grace（ブラウザがまだ開いていない可能性）
    if (Date.now() - startedAt < STARTUP_GRACE_MS) return;
    const idleMs = Date.now() - lastPing;
    if (idleMs > IDLE_TIMEOUT_MS) {
      console.log(
        `[auto-shutdown] no browser ping for ${Math.floor(idleMs / 1000)}s → exiting`,
      );
      process.exit(0);
    }
  }, CHECK_INTERVAL_MS);
  // Node のイベントループ終了を妨げないよう unref
  timer.unref();
}
