import { NextResponse } from "next/server";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { markPing } from "@/lib/heartbeat";
import { getProjectRoot } from "@/lib/storage";

// キャッシュ対象外
export const dynamic = "force-dynamic";

/**
 * 診断モード用：POST 到達を module state と独立に `.heartbeat-arrivals.log`
 * へ追記する。これで lib/heartbeat の pingLog が 0 のとき、
 *   - arrivals.log も 0  → そもそも POST が届いていない（network / layout / SSR 問題）
 *   - arrivals.log ≥ 1  → route まで届いているが markPing がグローバル状態を
 *                          更新できていない（webpack chunk 分離仮説がまだ生きている）
 * を切り分ける。gitignore 対象。start.bat が終了時に rename して残す。
 */
const ARRIVAL_LOG = path.join(getProjectRoot(), ".heartbeat-arrivals.log");

function recordArrival(method: "GET" | "POST") {
  const line = `${method} ${new Date().toISOString()}\n`;
  try {
    appendFileSync(ARRIVAL_LOG, line, "utf8");
  } catch {
    // I/O 失敗は無視
  }
  console.log(`[route] ${method} /api/heartbeat at ${new Date().toISOString()}`);
}

/**
 * ブラウザ心拍受信エンドポイント。
 * layout に埋め込まれた HeartbeatPing クライアントコンポーネントが 20 秒ごとに POST する。
 * AUTO_SHUTDOWN=1 の場合、180 秒間このエンドポイントへ ping が無いと
 * サーバが自動で process.exit(0) する。
 */
export async function POST() {
  recordArrival("POST");
  markPing();
  return NextResponse.json({ ok: true });
}

/**
 * 診断用 GET ハンドラ：curl / ブラウザからの手動 smoke test 用。
 *   `curl http://localhost:3939/api/heartbeat`
 * POST が届かないとき、まず route 層が生きているかをこれで確認する。
 */
export async function GET() {
  recordArrival("GET");
  markPing();
  return NextResponse.json({ ok: true, note: "diagnostic GET" });
}
