/**
 * 保存期間スイープの定期実行スケジューラ（設計書 §7.5）
 *
 * - settings.retention.enabled=true: 起動時 1 回 + 24h ごとに runSweep() を呼ぶ
 * - settings.retention.enabled=false: 何もしない
 * - 1 プロセス 1 スケジューラ（モジュールスコープの started フラグ）
 * - sweep 失敗は console.error で握りつぶす（プロセスを落とさない）
 *
 * 設定変更は再起動で反映（起動時に 1 回だけ enabled を判定）。
 */

import "server-only";
import { loadSettings } from "./storage";
import { runSweep } from "./retention";
import { writeAudit } from "./auditLog";

const DAY_MS = 24 * 60 * 60 * 1000;

let started = false;
let timer: NodeJS.Timeout | null = null;
let startedAt: string | null = null;
let lastRunAt: string | null = null;
let nextRunAt: string | null = null;
let enabledAtStart = false;

function runSweepSafe(source: "startup" | "interval"): void {
  try {
    const result = runSweep();
    const now = new Date();
    lastRunAt = now.toISOString();
    nextRunAt = new Date(now.getTime() + DAY_MS).toISOString();
    writeAudit("retention.sweep.auto", {
      meta: {
        source,
        softDeleted: result.softDeleted.length,
        hardDeleted: result.hardDeleted.length,
        anonymized: result.anonymized.length,
      },
    });
  } catch (e) {
    console.error("[retention scheduler] sweep failed", e);
  }
}

export interface RetentionSchedulerHandle {
  stop: () => void;
}

export function startRetentionScheduler(): RetentionSchedulerHandle {
  if (started) {
    return { stop: stopScheduler };
  }

  let enabled = false;
  try {
    enabled = loadSettings().retention.enabled === true;
  } catch (e) {
    console.error("[retention scheduler] failed to load settings", e);
  }

  started = true;
  startedAt = new Date().toISOString();
  enabledAtStart = enabled;

  if (!enabled) {
    writeAudit("retention.schedulerStart", { meta: { enabled: false } });
    return { stop: stopScheduler };
  }

  // 起動時に 1 回
  runSweepSafe("startup");
  // その後 24h ごと
  timer = setInterval(() => runSweepSafe("interval"), DAY_MS);
  // タイマーがイベントループを生かし続けないように（プロセス終了を妨げない）
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  // 直近の sweep 後 24h を nextRunAt とするが、起動時に runSweepSafe 内で既にセット済
  // 念のため未設定だったら入れる
  if (!nextRunAt) {
    nextRunAt = new Date(Date.now() + DAY_MS).toISOString();
  }

  writeAudit("retention.schedulerStart", {
    meta: { enabled: true, intervalMs: DAY_MS },
  });

  return { stop: stopScheduler };
}

function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
  startedAt = null;
  nextRunAt = null;
  enabledAtStart = false;
}

export interface RetentionSchedulerStatus {
  /** 起動時に判定した有効/無効。設定変更後は再起動で反映 */
  enabled: boolean;
  /** スケジューラが register された時刻 */
  startedAt: string | null;
  /** 直近のスケジューラ駆動 sweep 実行時刻（手動 sweep は含まない） */
  lastRunAt: string | null;
  /** 次回スケジューラ駆動 sweep の予定時刻（簡易計算: 直近実行 + 24h） */
  nextRunAt: string | null;
}

export function getRetentionSchedulerStatus(): RetentionSchedulerStatus {
  return {
    enabled: enabledAtStart,
    startedAt,
    lastRunAt,
    nextRunAt,
  };
}
