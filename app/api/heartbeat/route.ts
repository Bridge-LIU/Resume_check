import { NextResponse } from "next/server";
import { markPing } from "@/lib/heartbeat";

// キャッシュ対象外
export const dynamic = "force-dynamic";

/**
 * ブラウザ心拍受信エンドポイント。
 * layout に埋め込まれた HeartbeatPing クライアントコンポーネントが 10 秒ごとに POST する。
 * AUTO_SHUTDOWN=1 の場合、60 秒間このエンドポイントへ ping が無いと
 * サーバが自動で process.exit(0) する。
 */
export async function POST() {
  markPing();
  return NextResponse.json({ ok: true });
}
