/**
 * 更新チェック route。v3 更新機構 §12 N6。
 *
 * POST /api/update/check
 *   - Origin 検証（`ensureLocalOrigin`）
 *   - GitHub Releases API → 現在バージョンと比較
 *   - state.json を `update-available` または `idle` に更新
 *   - `{ ok: true, state: UpdateState }` を返す
 *
 * 同時 check は許容（副作用は state 上書きのみ、409 判定は download/apply 側で）。
 */

import { NextResponse } from "next/server";
import { apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { checkForUpdate } from "@/lib/updater";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    const state = await checkForUpdate();
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
