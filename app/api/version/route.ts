/**
 * 現在バージョンを返す。v3 更新機構 §12 N5。
 *
 * `force-dynamic` 必須（§12.7 の Next.js 特有チェックリスト）: runtime で package.json を
 * fs 読みするため、キャッシュされると更新後も旧値を返してしまう。updater.bat の完了検知
 * ポーリングもこの route が正しい新版を返すことに依存する。
 */

import { NextResponse } from "next/server";
import { getCurrentVersion } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ current: getCurrentVersion() });
}
