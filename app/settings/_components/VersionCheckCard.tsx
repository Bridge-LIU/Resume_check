"use client";

/**
 * システムバージョン + 更新機構の統合カード。§12.8.9 準拠。
 *
 * 4 つの UI ステート:
 *   1. **initial** — まだチェックしていない or state.phase === "idle" だが 前回チェック未 or successVersion 直後
 *   2. **up-to-date** — 最新版を使用中（idle + 前回チェック時刻あり）
 *   3. **update-available** — 新版あり、release notes 表示、「更新」ボタン活性
 *   4. **error** — チェック失敗 or 更新失敗（rollback 済表示含む）
 *
 * 「更新」ボタンフロー:
 *   → POST /api/update/download          （state = downloading）
 *   → UpdateProgressDialog を開く         （polling で progress を更新）
 *   → state === "downloaded" を検知
 *   → POST /api/update/apply              （state = applying → サーバ shutdown → updater.bat）
 *   → サーバ再起動後 /api/version が新バージョンを返す
 *   → updateSuccessFlag が立つ → モーダル成功表示
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { UpdateProgressDialog } from "./UpdateProgressDialog";

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

type ProgressResponse = {
  state: UpdateState;
  updateSuccessFlag: { shown: false } | { shown: true; version: string };
  logTail: string[];
};

type Props = {
  currentVersion: string;
};

/** ISO → "2026-07-14 15:42" */
function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** state が "モーダル表示すべき phase" か */
function isInProgress(state: UpdateState): boolean {
  return (
    state.phase === "downloading" ||
    state.phase === "downloaded" ||
    state.phase === "applying" ||
    state.phase === "restoring"
  );
}

export function VersionCheckCard({ currentVersion }: Props) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [logTail, setLogTail] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [successVersion, setSuccessVersion] = useState<string | undefined>();

  /** state=downloaded を検知したら自動で apply を叩くための ref */
  const applyingRef = useRef(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/update/progress", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ProgressResponse;
      setState(data.state);
      setLogTail(data.logTail);
      if (data.state.phase === "update-available") {
        setLastCheckedAt(data.state.checkedAt);
      }
      if (data.updateSuccessFlag.shown) {
        setSuccessVersion(data.updateSuccessFlag.version);
        setModalOpen(true);
        // 5 秒後にページ全体を reload して底部の currentVersion も新版に反映
        // (成功時のみ、失敗時は reload しない)
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      }
      // downloaded を検知したら 1 回だけ apply を叩く
      if (data.state.phase === "downloaded" && !applyingRef.current) {
        applyingRef.current = true;
        try {
          await fetch("/api/update/apply", { method: "POST" });
          // Response 後にサーバは 2 秒で自己終了 → 以降は polling が接続失敗する
          // その間 UI は「applying」表示、サーバ再起動後 polling が再開して progress を追う
        } catch {
          // apply リクエスト直後に接続断は正常（サーバ shutdown）
        }
      }
      // 進行中の phase なら modal を開いておく
      if (isInProgress(data.state)) {
        setModalOpen(true);
      }
    } catch {
      // polling 失敗は無視（サーバ再起動中の一時的接続断）
    }
  }, []);

  // 初回マウント時に一度取得。fetchProgress は setState を含む fetch。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState は fetch の callback 内で発生（非同期）
    void fetchProgress();
  }, [fetchProgress]);

  // 進行中は 2 秒間隔で polling
  useEffect(() => {
    if (!isInProgress(state) && !successVersion) return;
    const interval = setInterval(() => {
      void fetchProgress();
    }, 2000);
    return () => clearInterval(interval);
  }, [state, successVersion, fetchProgress]);

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch("/api/update/check", { method: "POST" });
      const data = (await res.json()) as
        | { ok: true; state: UpdateState }
        | { ok: false; error: { message: string } };
      if (!res.ok || !("ok" in data) || data.ok !== true) {
        const msg = "error" in data && data.error ? data.error.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setState(data.state);
      if (data.state.phase === "update-available") {
        setLastCheckedAt(data.state.checkedAt);
      } else if (data.state.phase === "idle") {
        setLastCheckedAt(new Date().toISOString());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCheckError(msg);
    } finally {
      setChecking(false);
    }
  }

  async function handleUpdate() {
    if (state.phase !== "update-available") return;
    applyingRef.current = false;
    setModalOpen(true);
    try {
      const res = await fetch("/api/update/download", { method: "POST" });
      const data = (await res.json()) as
        | { ok: true; state: UpdateState }
        | { ok: false; error: { message: string } };
      if (!res.ok || !("ok" in data) || data.ok !== true) {
        const msg = "error" in data && data.error ? data.error.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setState(data.state);
      void fetchProgress();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCheckError(msg);
      setModalOpen(false);
    }
  }

  function handleModalClose() {
    // 成功後: /settings のバージョンカード（サーバ側で render）は client cache
    // 上の値を握ったままで、閉じても "現バージョン: v旧" 表示になる。
    // フルリロードで新版バージョンを反映させる。onbeforeunload 抑止のため直接 reload。
    if (successVersion) {
      window.location.reload();
      return;
    }
    setModalOpen(false);
    setSuccessVersion(undefined);
    applyingRef.current = false;
  }

  // 描画分岐
  const showUpdateAvailable = state.phase === "update-available";
  const showError =
    checkError !== null ||
    (state.phase === "error" && !modalOpen);

  // コンパクトモード: 新版なし + エラーなし → 1 行だけ
  const compact = !showUpdateAvailable && !showError;

  return (
    <>
      <div className="bg-card rounded-xl border shadow-sm" data-manual-shot="version">
        {compact ? (
          /* コンパクト表示 (1 行) */
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-sm font-bold">システムバージョン</span>
            <span className="text-sm tabular text-muted-foreground">v{currentVersion}</span>
            {state.phase === "idle" && lastCheckedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ 最新版
              </span>
            )}
            <span className="text-2xs text-muted-foreground ml-auto">
              {lastCheckedAt ? `最終確認 ${formatDateTime(lastCheckedAt)}` : "未確認"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2.5"
              onClick={handleCheck}
              disabled={checking}
            >
              {checking ? "確認中..." : lastCheckedAt ? "再チェック" : "更新をチェック"}
            </Button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="font-bold">システムバージョン</h3>
              {lastCheckedAt && (
                <span className="text-xs text-muted-foreground ml-auto">
                  最終確認 {formatDateTime(lastCheckedAt)}
                </span>
              )}
            </div>

            {showUpdateAvailable && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    🎉 新しいバージョンが利用可能
                  </span>
                  {state.latest.publishedAt && (
                    <span className="text-2xs text-muted-foreground ml-auto">
                      公開日 {formatDateTime(state.latest.publishedAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-xl tabular font-medium text-muted-foreground">
                    v{currentVersion}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-xl tabular font-bold text-emerald-600 dark:text-emerald-400">
                    v{state.latest.version}
                  </span>
                </div>
                {state.latest.notes && (
                  <div className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap max-h-32 overflow-y-auto border-t border-emerald-200 dark:border-emerald-800 pt-2">
                    {state.latest.notes}
                  </div>
                )}
              </div>
            )}

            {showError && (
              <div
                role="alert"
                className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-red-800 dark:text-red-200 text-sm rounded px-3 py-2"
              >
                <div>チェックに失敗しました:</div>
                <div className="text-xs mt-1">
                  {checkError ??
                    (state.phase === "error" ? state.message : "不明なエラー")}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button asChild variant="outline" size="sm" className="text-xs">
                <a
                  href="https://github.com/Bridge-LIU/Resume_check/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Releases を開く
                </a>
              </Button>
              {showUpdateAvailable ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleUpdate}
                >
                  🚀 今すぐ更新
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCheck}
                  disabled={checking}
                >
                  {checking ? "確認中..." : lastCheckedAt ? "再チェック" : "更新をチェック"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: 進行中 or 成功直後 or 明示 error */}
      {modalOpen && (
        <UpdateProgressDialog
          state={state}
          logTail={logTail}
          successVersion={successVersion}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}
