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
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const IDLE_TIMEOUT_MS = 180_000;
const CHECK_INTERVAL_MS = 20_000;
const STARTUP_GRACE_MS = 120_000;

/** 直近 N 件だけ保持（起動から長時間経つとメモリを食うため） */
const PING_LOG_SIZE = 30;
const TICK_LOG_SIZE = 30;

/** setInterval 実測時刻 と 想定時刻 の差が超えたらスリープ復帰と判定 */
const SLEEP_OVERSHOOT_MS = 60_000;

/**
 * ⚠️ Next.js は `instrumentation.ts` と `app/api/*` を別々の webpack chunk に
 * バンドルするため、`import "@/lib/heartbeat"` が **2 回 evaluated される**。
 * その結果 module-level の `let lastPing` は 2 つ独立に存在し、
 * route が更新した lastPing を watcher が読めない（症状: `pings=0` のまま増えない）。
 *
 * globalThis に単一のオブジェクトを保持することで両 bundle から同じ実体を参照させる。
 */
type HeartbeatState = {
  lastPing: number;
  started: boolean;
  pingLog: number[];
  tickLog: Array<{ t: number; idleMs: number; overshootMs: number }>;
};

const STATE_KEY = Symbol.for("resume-claude.heartbeat.state");
type GlobalWithHeartbeat = typeof globalThis & { [STATE_KEY]?: HeartbeatState };

function getState(): HeartbeatState {
  const g = globalThis as GlobalWithHeartbeat;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      lastPing: Date.now(),
      started: false,
      pingLog: [],
      tickLog: [],
    };
  }
  return g[STATE_KEY]!;
}

/**
 * `start.bat` はサーバプロセスの exit code しか受け取れないため、詳細な
 * 終了理由（idle timeout / signal / etc）を伝えるにはファイル経由で受け渡す。
 * .gitignore 対象。start.bat 側が読み取り後に削除する。
 */
const REASON_FILE = path.join(process.cwd(), ".auto-shutdown.reason");

/**
 * app/api/heartbeat/route.ts が POST/GET 到達を追記する。ここで読んで診断に含める。
 * pingLog=0 かつ arrivals=0 なら POST 自体届いていない（layout / SSR / network 問題）。
 * pingLog=0 かつ arrivals>0 なら route まで届いてグローバル状態同期が失敗している。
 */
const ARRIVAL_LOG = path.join(process.cwd(), ".heartbeat-arrivals.log");

function writeExitReason(reason: string): void {
  try {
    writeFileSync(REASON_FILE, reason, "utf8");
  } catch {
    // I/O 失敗は無視: 終了自体はブロックしない
  }
}

function readArrivalLog(): string[] {
  try {
    return readFileSync(ARRIVAL_LOG, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** 起動直後に古い arrivals.log を消しておく（前回実行の残骸を混入させない） */
function clearArrivalLog(): void {
  try {
    unlinkSync(ARRIVAL_LOG);
  } catch {
    // 存在しなくてもOK
  }
}

export function markPing(): void {
  const s = getState();
  const now = Date.now();
  s.lastPing = now;
  s.pingLog.push(now);
  if (s.pingLog.length > PING_LOG_SIZE) s.pingLog.shift();
  // 診断モード: route → markPing の呼び出しが確かに届いているか肉眼確認用
  console.log(`[heartbeat] markPing at ${new Date(now).toISOString()} (total=${s.pingLog.length})`);
}

function iso(t: number): string {
  return new Date(t).toISOString();
}

/**
 * 退出時の根本原因分類。tickLog / pingLog の観測データから推定する。
 */
function categorizeExitReason(): string {
  const { pingLog, tickLog } = getState();
  const maxOvershoot = tickLog.reduce((m, x) => Math.max(m, x.overshootMs), 0);
  if (maxOvershoot > SLEEP_OVERSHOOT_MS) return "SLEEP_LIKELY";
  if (pingLog.length === 0) return "NEVER_PINGED";
  const now = Date.now();
  const gapSinceLast = now - pingLog[pingLog.length - 1];
  if (pingLog.length >= 2) {
    const prevGaps: number[] = [];
    for (let i = 1; i < pingLog.length; i++) prevGaps.push(pingLog[i] - pingLog[i - 1]);
    const avgGap = prevGaps.reduce((a, b) => a + b, 0) / prevGaps.length;
    // 直前まで規則的に ping が来ていて、突然止まった → タブが閉じられた / discard された
    if (avgGap < 30_000 && gapSinceLast > IDLE_TIMEOUT_MS) return "TAB_CLOSED_OR_DISCARDED";
    // ping 間隔がだんだん伸びていた → throttling / freeze 進行中
    if (avgGap > 30_000) return "PING_INTERVAL_DEGRADED";
  }
  return "PING_STOPPED";
}

function buildDiagnostic(
  startedAt: number,
  now: number,
  idleMs: number,
  category: string,
): string {
  const { pingLog, tickLog } = getState();
  const arrivals = readArrivalLog();
  const lines: string[] = [];
  lines.push(`${category}`);
  lines.push(`# auto-shutdown diagnostic`);
  lines.push(`server_started : ${iso(startedAt)}`);
  lines.push(`exited_at      : ${iso(now)}`);
  lines.push(`uptime_sec     : ${Math.floor((now - startedAt) / 1000)}`);
  lines.push(`idle_sec       : ${Math.floor(idleMs / 1000)}  (limit ${IDLE_TIMEOUT_MS / 1000}s)`);
  lines.push(`total_pings    : ${pingLog.length}  (markPing calls seen by watcher)`);
  lines.push(`arrivals_route : ${arrivals.length}  (POST/GET recorded by route handler)`);
  lines.push(
    `last_ping      : ${pingLog.length > 0 ? iso(pingLog[pingLog.length - 1]) : "NEVER"}`,
  );
  lines.push(
    `first_ping     : ${pingLog.length > 0 ? iso(pingLog[0]) : "NEVER"}`,
  );
  const maxOvershoot = tickLog.reduce((m, x) => Math.max(m, x.overshootMs), 0);
  lines.push(`max_overshoot  : ${maxOvershoot}ms  (>${SLEEP_OVERSHOOT_MS}ms ⇒ SLEEP_LIKELY)`);
  lines.push(``);
  lines.push(`## interpretation`);
  if (pingLog.length === 0 && arrivals.length === 0) {
    lines.push(`  ping=0 & arrivals=0 → POST never reached the server.`);
    lines.push(`  Investigate: browser opened? layout mounted? SSR/hydration error?`);
    lines.push(`  Smoke test: curl http://localhost:${process.env.PORT ?? "3939"}/api/heartbeat`);
  } else if (pingLog.length === 0 && arrivals.length > 0) {
    lines.push(`  ping=0 but arrivals>0 → route runs but markPing state not shared.`);
    lines.push(`  globalThis Symbol.for("resume-claude.heartbeat.state") isolation problem.`);
  } else if (pingLog.length > 0) {
    lines.push(`  ping>0 → markPing wiring healthy. Idle timeout genuinely elapsed.`);
  }
  lines.push(``);
  lines.push(`## last ${tickLog.length} tick(s)  [wall_time  idle=Xs  overshoot=Yms]`);
  for (const t of tickLog) {
    lines.push(
      `  ${iso(t.t)}  idle=${Math.floor(t.idleMs / 1000)}s  overshoot=${t.overshootMs}ms`,
    );
  }
  lines.push(``);
  lines.push(`## last ${pingLog.length} ping(s) [watcher-visible]`);
  for (const p of pingLog) lines.push(`  ${iso(p)}`);
  lines.push(``);
  const recent = arrivals.slice(-PING_LOG_SIZE);
  lines.push(`## last ${recent.length}/${arrivals.length} arrival(s) [route-recorded]`);
  for (const a of recent) lines.push(`  ${a}`);
  return lines.join("\n") + "\n";
}

export function startAutoShutdownWatcher(): void {
  const s = getState();
  if (s.started) return;
  if (process.env.AUTO_SHUTDOWN !== "1") return;
  s.started = true;
  clearArrivalLog();
  const startedAt = Date.now();
  let expectedNext = startedAt + CHECK_INTERVAL_MS;
  console.log(
    `[auto-shutdown] enabled: idle_timeout=${IDLE_TIMEOUT_MS / 1000}s check=${CHECK_INTERVAL_MS / 1000}s grace=${STARTUP_GRACE_MS / 1000}s`,
  );
  const timer = setInterval(() => {
    const st = getState();
    const now = Date.now();
    const overshootMs = Math.max(0, now - expectedNext);
    expectedNext = now + CHECK_INTERVAL_MS;
    const idleMs = now - st.lastPing;
    st.tickLog.push({ t: now, idleMs, overshootMs });
    if (st.tickLog.length > TICK_LOG_SIZE) st.tickLog.shift();

    // 毎 tick 可視化（cmd 画面で状態が見える）
    console.log(
      `[auto-shutdown] tick idle=${Math.floor(idleMs / 1000)}s overshoot=${overshootMs}ms pings=${st.pingLog.length}`,
    );

    // 大きな overshoot はスリープ復帰の可能性が高い → その tick だけは exit しない
    // （lastPing はリセットしないので、本当にタブが閉じていれば次の tick で exit する）
    if (overshootMs > SLEEP_OVERSHOOT_MS) {
      console.log(
        `[auto-shutdown] large overshoot=${overshootMs}ms → sleep-wake suspected, skipping this tick`,
      );
      return;
    }

    // 起動直後は grace（ブラウザがまだ開いていない可能性）
    if (now - startedAt < STARTUP_GRACE_MS) return;

    if (idleMs > IDLE_TIMEOUT_MS) {
      const category = categorizeExitReason();
      const detail = buildDiagnostic(startedAt, now, idleMs, category);
      console.log(`[auto-shutdown] exiting → ${category}`);
      console.log(detail);
      writeExitReason(detail);
      process.exit(0);
    }
  }, CHECK_INTERVAL_MS);
  // Node のイベントループ終了を妨げないよう unref
  timer.unref();
}
