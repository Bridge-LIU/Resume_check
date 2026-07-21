/**
 * Release ZIP のダウンロード開始 route。§12 N7 / §12.8.9 準拠。
 *
 * POST /api/update/download
 *   - Origin 検証（ensureLocalOrigin）
 *   - 現在の state に `latest` があるか確認（update-available 前提、error からの再試行も許容）
 *   - state を downloading に遷移させて、Response は即 200 で返す
 *   - **DL 本体は fire-and-forget** で走らせ、progress は state.progress に書き戻す
 *   - 完了で state → downloaded、失敗で state → error
 *
 * 409 判定:
 *   - state が既に downloading / downloaded / applying / restoring の場合は 409 で拒否
 *
 * throttling:
 *   - state.progress の更新は fs 書き込みなので、500ms 間隔 or 5% 変化のいずれかを閾値に絞る
 */

import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError, ensureLocalOrigin } from "@/lib/apiError";
import {
  downloadRelease,
  extractStagedZip,
  fetchLatestRelease,
  readState,
  writeState,
  type ReleaseInfo,
  type UpdateState,
} from "@/lib/updater";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** state.progress を書き戻す間隔（ミリ秒） */
const PROGRESS_WRITE_INTERVAL_MS = 500;
/** state.progress を書き戻す % 差分 */
const PROGRESS_WRITE_DELTA = 5;

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);

    const current = readState();
    let latest: ReleaseInfo;

    if (current.phase === "update-available") {
      latest = current.latest;
    } else if (
      current.phase === "error" &&
      current.phaseFailed === "downloading"
    ) {
      // DL 失敗からの再試行: 最新 Release を再取得
      latest = await fetchLatestRelease();
    } else if (
      current.phase === "downloading" ||
      current.phase === "downloaded" ||
      current.phase === "applying" ||
      current.phase === "restoring"
    ) {
      throw new ApiError(
        "CONFLICT",
        "既に更新処理が進行中です。完了を待ってから再試行してください。",
        409,
      );
    } else {
      // idle / update-available 以外: check 未実行
      throw new ApiError(
        "NO_RELEASE",
        "先に「更新をチェック」を実行してください。",
        400,
      );
    }

    // state を downloading に。progress=0 でスタート
    const startedAt = new Date().toISOString();
    const initialState: UpdateState = {
      phase: "downloading",
      latest,
      progress: 0,
      startedAt,
    };
    writeState(initialState);

    // fire-and-forget DL。Response は返し終わってから走る
    // Node の event loop が Response 送信後もこの Promise を保持する
    const controller = new AbortController();
    void (async () => {
      try {
        let lastWriteAt = Date.now();
        let lastProgressPct = 0;
        const zipPath = await downloadRelease(
          latest,
          controller.signal,
          (loaded, total) => {
            const now = Date.now();
            const pct = total > 0 ? Math.floor((loaded / total) * 100) : 0;
            if (
              now - lastWriteAt >= PROGRESS_WRITE_INTERVAL_MS ||
              pct - lastProgressPct >= PROGRESS_WRITE_DELTA
            ) {
              lastWriteAt = now;
              lastProgressPct = pct;
              writeState({
                phase: "downloading",
                latest,
                progress: pct,
                startedAt,
              });
            }
          },
        );

        // ZIP を staging/extracted/ に展開してから downloaded 遷移する。
        // サーバ稼働中に済ませることで updater.bat の停止時間を約 7 秒短縮する
        // （もともと updater.bat の [Pre] Extract 段で行っていた作業）。
        // UI からは progress=100 のまま数秒経ってから phase 遷移して見える。
        writeState({
          phase: "downloading",
          latest,
          progress: 100,
          startedAt,
        });
        console.log(`[update/download] DL done, extracting v${latest.version}`);
        await extractStagedZip(zipPath);

        writeState({
          phase: "downloaded",
          latest,
          downloadedAt: new Date().toISOString(),
        });
        console.log(`[update/download] completed: v${latest.version}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        writeState({
          phase: "error",
          message,
          phaseFailed: "downloading",
          at: new Date().toISOString(),
        });
        console.error(`[update/download] failed: ${message}`);
      }
    })();

    return NextResponse.json({ ok: true, state: initialState });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
