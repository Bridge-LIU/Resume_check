/**
 * 更新状態 polling route。§12 N8 / §12.8.5 UI モーダル対応。
 *
 * GET /api/update/progress
 *   - `{ state, updateSuccessFlag, logTail }` を返す
 *   - `state`: fs 上の state.json の現在値（毎回読み直し、cache しない — §12.7 CR-7）
 *   - `updateSuccessFlag`: `consumeUpdateSuccessFlag()` で 1 度だけ trigger
 *   - `logTail`: `updater.bat` の tee log 末尾 30 行（モーダル cmd log 表示用）
 *
 * `force-dynamic` 必須: fs 読みなのでキャッシュされると polling が固まる。
 */

import { NextResponse } from "next/server";
import {
  consumeUpdateSuccessFlag,
  readState,
  tailUpdaterLog,
} from "@/lib/updater";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = readState();
  // applying / restoring 中のみ log tail を返す（idle 時は無駄な fs read を省く）
  const wantLog =
    state.phase === "applying" || state.phase === "restoring";
  return NextResponse.json({
    state,
    updateSuccessFlag: consumeUpdateSuccessFlag(),
    logTail: wantLog ? tailUpdaterLog() : [],
  });
}
