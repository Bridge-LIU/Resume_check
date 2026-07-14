"use client";

/**
 * 更新中モーダル。§12.8.6 UI モーダル準拠。
 *
 * 表示条件: `progressState.phase === "downloading" | "applying" | "restoring"` の間。
 * また "success" 直後（idle 遷移 + updateSuccessFlag）、および直近の "error"（rollback 済）も
 * "閉じる" ボタン付きで表示する。
 *
 * 構成:
 *   - Title: フェーズと version 遷移
 *   - Progress bar: ステップカウンタ換算（downloading=25/50, applying=75, verifying=90, success=100）
 *   - Cmd log box: `logTail` を末尾 6 行程度スクロール表示（黒背景・monospace）
 *   - Bottom hint: 「通常 30〜60 秒。閉じないでください」
 *   - 完了時のみ「閉じる」ボタン
 *
 * ⚠️ ×閉じるボタンは無し（apply 中に閉じると更新が中断されない、勘違いを防ぐ）
 */

import { useEffect, useRef } from "react";
import { Button } from "@/ui/button";

type ReleaseInfo = {
  tag: string;
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  downloadUrl: string;
  sizeBytes?: number;
};

type UpdateState =
  | { phase: "idle" }
  | { phase: "update-available"; latest: ReleaseInfo; checkedAt: string }
  | { phase: "downloading"; latest: ReleaseInfo; progress: number; startedAt: string }
  | { phase: "downloaded"; latest: ReleaseInfo; downloadedAt: string }
  | { phase: "applying"; from: string; to: string; startedAt: string }
  | { phase: "restoring"; from: string; to: string; startedAt: string }
  | {
      phase: "error";
      message: string;
      phaseFailed: "downloading" | "applying" | "restoring";
      at: string;
      rollbackZipPath?: string;
    };

type Props = {
  /** 現在の state（親コンポーネントから polling 経由で渡す） */
  state: UpdateState;
  /** モーダルを閉じる（成功後 or 明示的なユーザー操作） */
  onClose: () => void;
  /** cmd log 表示用（末尾 30 行程度） */
  logTail: string[];
  /** 表示用: apply 完了直後の成功トースト */
  successVersion?: string;
};

/** 状態別のプログレスバー % */
function computeProgress(state: UpdateState): number {
  switch (state.phase) {
    case "downloading":
      // downloading の progress は 0-100、全体では 0-50 に圧縮
      return Math.floor(state.progress * 0.5);
    case "downloaded":
      return 50;
    case "applying":
      // applying 中は 50→95。bat 側の [N/3] を UI に反映するのは logTail 経由でカバー
      return 75;
    case "restoring":
      return 60;
    case "error":
      return 100;
    default:
      return 0;
  }
}

/** 状態別のラベル */
function computeLabel(state: UpdateState, successVersion?: string): string {
  switch (state.phase) {
    case "downloading":
      return `[1/3] 新バージョン v${state.latest.version} をダウンロード中`;
    case "downloaded":
      return `[2/3] ダウンロード完了、適用開始待ち`;
    case "applying":
      return `[3/3] v${state.from} → v${state.to} 適用中`;
    case "restoring":
      return `更新失敗、v${state.from} に回滾中`;
    case "error":
      return state.phaseFailed === "restoring"
        ? "回滾も失敗しました"
        : `更新失敗（${state.phaseFailed}）`;
    default:
      return successVersion ? `v${successVersion} に更新完了` : "";
  }
}

function computeTitle(state: UpdateState, successVersion?: string): string {
  switch (state.phase) {
    case "downloading":
    case "downloaded":
    case "applying":
      if ("from" in state && "to" in state) return `更新中 v${state.from} → v${state.to}`;
      if ("latest" in state) return `更新中 → v${state.latest.version}`;
      return "更新中";
    case "restoring":
      return `回滾中 v${state.to} → v${state.from}`;
    case "error":
      return state.phaseFailed === "restoring" ? "回滾失敗" : "更新失敗";
    default:
      return successVersion ? `更新完了 v${successVersion}` : "";
  }
}

export function UpdateProgressDialog({
  state,
  onClose,
  logTail,
  successVersion,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logTail]);

  const isDone =
    (state.phase === "idle" && !!successVersion) ||
    state.phase === "error";
  const isError =
    state.phase === "error" || state.phase === "restoring";
  const progress = successVersion && state.phase === "idle" ? 100 : computeProgress(state);
  const title = computeTitle(state, successVersion);
  const label = computeLabel(state, successVersion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card rounded-xl border shadow-2xl w-[600px] max-w-[90vw]">
        <div className="p-6 space-y-4">
          {/* Title */}
          <div className="flex items-center gap-2">
            {isDone && !isError && <span className="text-emerald-600">✅</span>}
            {isError && <span className="text-amber-500">⚠️</span>}
            {!isDone && (
              <span className="text-blue-600 animate-pulse" aria-hidden="true">
                🔄
              </span>
            )}
            <h3 className="font-bold text-base">{title}</h3>
          </div>

          {/* Progress bar + step label */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span
                className={
                  isError ? "text-amber-600 font-medium" : "text-foreground font-medium"
                }
              >
                {label}
              </span>
              <span className="tabular text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isError
                    ? "bg-amber-500"
                    : isDone
                      ? "bg-emerald-500"
                      : "bg-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* CMD log box */}
          <div
            ref={logRef}
            className="bg-zinc-950 text-zinc-100 font-mono text-2xs rounded-md p-3 h-32 overflow-y-auto whitespace-pre-wrap"
          >
            {logTail.length === 0 ? (
              <span className="text-zinc-500">
                $ waiting for updater.bat output...
              </span>
            ) : (
              logTail.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("ERROR") || line.includes("❌")
                      ? "text-red-400"
                      : line.startsWith("[ROLLBACK]") || line.startsWith("⚠")
                        ? "text-amber-300"
                        : line.startsWith("$") || line.startsWith(">") || line.startsWith("[")
                          ? "text-emerald-400"
                          : ""
                  }
                >
                  {line || " "}
                </div>
              ))
            )}
          </div>

          {/* Error detail (state.error 時のみ) */}
          {state.phase === "error" && (
            <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
              {state.message}
              {state.rollbackZipPath && (
                <div className="text-2xs mt-1 opacity-70">
                  復旧が必要な場合は{" "}
                  <code className="px-1 rounded bg-amber-100 dark:bg-amber-900">
                    scripts\restore.bat
                  </code>{" "}
                  を実行してください。
                </div>
              )}
            </div>
          )}

          {/* Bottom hint / close button */}
          {!isDone && (
            <div className="text-xs text-muted-foreground">
              通常 30〜60 秒で完了します。この画面は閉じないでください。
            </div>
          )}
          {isDone && (
            <div className="flex justify-end">
              <Button size="sm" onClick={onClose}>
                閉じる
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
