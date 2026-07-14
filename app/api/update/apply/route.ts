/**
 * 更新適用 route。§12 N9 / §12.8.9 準拠。
 *
 * POST /api/update/apply
 *   - Origin 検証（ensureLocalOrigin）
 *   - state=downloaded 必須（他状態は 409）
 *   - staging に ZIP が実在することを確認
 *   - state を applying に更新（from, to, startedAt を記録）
 *   - `updater.bat` を detached spawn（新 cmd 窓が開き、独立プロセスで実行される）
 *   - `queueMicrotask + setTimeout(process.exit(0), 2000)` で Response 送信後に自己終了
 *     （§12.7 C4: Next.js 16 App Router は `res.on('finish')` が使えないため）
 *
 * updater.bat の argv:
 *   %1 = staging ZIP のフルパス（例 C:\...\data\.update\staging\app-v0.2.0.zip）
 *   %2 = staging 展開先のフルパス（例 C:\...\data\.update\staging\extracted）
 *   %3 = 新バージョン（例 "0.2.0"）
 *   %4 = 旧バージョン（例 "0.1.0"）
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { getCurrentVersion } from "@/lib/version";
import {
  getStagingExtractedDir,
  getStagingZipPath,
  readState,
  writeState,
} from "@/lib/updater";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** shutdown までの猶予（Response 送信 → ブラウザ受信 → state 反映のための余裕） */
const SHUTDOWN_DELAY_MS = 2000;

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);

    const current = readState();
    if (current.phase !== "downloaded") {
      if (current.phase === "applying" || current.phase === "restoring") {
        throw new ApiError(
          "CONFLICT",
          "既に更新処理が進行中です。",
          409,
        );
      }
      throw new ApiError(
        "INVALID_STATE",
        "先に「ダウンロード」を実行してください。",
        400,
      );
    }

    const latest = current.latest;
    const zipPath = getStagingZipPath(latest.version);
    if (!fs.existsSync(zipPath)) {
      // downloaded 状態だが ZIP が消えている（掃除された等） → 再ダウンロードから
      writeState({
        phase: "error",
        message: "ダウンロード済 ZIP が見つかりません。再ダウンロードしてください。",
        phaseFailed: "downloading",
        at: new Date().toISOString(),
      });
      throw new ApiError(
        "ZIP_MISSING",
        "ダウンロード済 ZIP が見つかりません。再ダウンロードしてください。",
        409,
      );
    }

    const from = getCurrentVersion();
    const to = latest.version;
    const startedAt = new Date().toISOString();

    // updater.bat のパス（scripts/ 直下、配布 ZIP に同梱される想定）
    const updaterBat = path.join(process.cwd(), "scripts", "updater.bat");
    if (!fs.existsSync(updaterBat)) {
      throw new ApiError(
        "UPDATER_MISSING",
        "updater.bat が見つかりません。配布 ZIP が正しく展開されていません。",
        500,
      );
    }

    // applying state に遷移（bat から見えるファイル真実源）
    writeState({
      phase: "applying",
      from,
      to,
      startedAt,
    });

    const extractDir = getStagingExtractedDir();
    fs.mkdirSync(extractDir, { recursive: true });

    // updater.bat を detached spawn。cmd 窓が新しく開き、Node プロセスとは独立に走る。
    // stdio: "ignore" で親プロセス（Node）と切り離す → Node が process.exit しても bat は生き残る。
    const child = spawn(
      "cmd",
      ["/c", "start", "", "/wait", updaterBat, zipPath, extractDir, to, from],
      {
        detached: true,
        stdio: "ignore",
        shell: false,
        windowsHide: false,
        cwd: process.cwd(),
      },
    );
    child.unref();
    console.log(
      `[update/apply] spawned updater.bat pid=${child.pid} zip=${zipPath} ${from}→${to}`,
    );

    // §12.7 C4: Next.js 16 では res.on('finish') が使えない。
    // Response を return したあと queueMicrotask → setTimeout で shutdown。
    queueMicrotask(() => {
      setTimeout(() => {
        console.log("[update/apply] shutting down for updater.bat takeover");
        process.exit(0);
      }, SHUTDOWN_DELAY_MS);
    });

    return NextResponse.json({
      ok: true,
      state: { phase: "applying", from, to, startedAt },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
