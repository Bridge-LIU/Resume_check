"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getDeletionLogAction,
  getRetentionSchedulerStatusAction,
  previewSweepAction,
  runSweepAction,
} from "../actions";
import type { PreviewItem, SweepResult } from "@/lib/retention";
import type { RetentionSchedulerStatus } from "@/lib/retentionScheduler";
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";

function formatJp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { hour12: false });
}

function SchedulerStatusBanner({
  status,
}: {
  status: RetentionSchedulerStatus | null;
}) {
  if (!status) {
    return (
      <div className="border rounded px-3 py-2 text-xs text-zinc-500">
        定期実行ステータスを取得中…
      </div>
    );
  }
  const active = status.enabled && status.startedAt !== null;
  return (
    <div
      className={`border rounded px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${
        active
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-zinc-50 text-zinc-600"
      }`}
    >
      <div>
        <span className="font-medium">定期実行: </span>
        {active ? "有効（起動時 + 24h ごと）" : "無効"}
      </div>
      {status.startedAt && (
        <div>
          <span className="text-zinc-500">起動: </span>
          {formatJp(status.startedAt)}
        </div>
      )}
      {active && (
        <div>
          <span className="text-zinc-500">次回予定: </span>
          {formatJp(status.nextRunAt)}
        </div>
      )}
      {!active && status.startedAt && (
        <div className="text-zinc-500">
          ※ 設定変更後の反映は再起動が必要です
        </div>
      )}
    </div>
  );
}

export function RetentionManager() {
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [lastResult, setLastResult] = useState<SweepResult | null>(null);
  const [log, setLog] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<RetentionSchedulerStatus | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isRunning, startRun] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    getRetentionSchedulerStatusAction()
      .then(setSchedulerStatus)
      .catch(() => {
        /* スケジューラ状態は補助情報なので失敗は無視 */
      });
  }, []);

  function handlePreview() {
    setError(null);
    setLastResult(null);
    startLoad(async () => {
      try {
        const list = await previewSweepAction();
        setPreview(list);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleRun() {
    if (!preview || preview.length === 0) {
      const ok = await confirm({
        title: "今の設定でスイープを実行しますか？",
        description:
          "プレビューがありません。\nhold=ON / 未確定 / 期間内のセッションは対象外です。",
        confirmLabel: "実行する",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: `${preview.length}件をゴミ箱(_trash/)に移しますか？`,
        description: "猶予期間内なら /trash から復元できます。",
        confirmLabel: "ゴミ箱へ移動",
        destructive: true,
      });
      if (!ok) return;
    }
    setError(null);
    startRun(async () => {
      try {
        const r = await runSweepAction();
        setLastResult(r);
        setPreview(null);
        const lg = await getDeletionLogAction(30);
        setLog(lg);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function handleLoadLog() {
    setError(null);
    try {
      const lg = await getDeletionLogAction(30);
      setLog(lg);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const busy = isLoading || isRunning;

  return (
    <div className="space-y-3">
      <SchedulerStatusBanner status={schedulerStatus} />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePreview}
          disabled={busy}
        >
          {isLoading ? "確認中…" : "次に消える面談を確認"}
        </Button>
        <Button
          type="button"
          onClick={handleRun}
          disabled={busy}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isRunning ? "スイープ中…" : "今すぐスイープ実行"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLoadLog}
          disabled={busy}
        >
          削除ログを読込
        </Button>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}

      {preview && (
        <div className="border rounded p-3 text-sm">
          <div className="font-medium mb-2 text-zinc-700">
            次に消える面談 ({preview.length}件)
          </div>
          {preview.length === 0 ? (
            <div className="text-zinc-500 text-xs">対象なし</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left py-1">氏名</th>
                  <th className="text-left py-1">役割</th>
                  <th className="text-left py-1">合否</th>
                  <th className="text-right py-1">経過/保存日</th>
                  <th className="text-left py-1 pl-2">匿名化</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1 font-medium">{p.氏名}</td>
                    <td className="py-1">{p.役割}</td>
                    <td className="py-1">{p.result}</td>
                    <td className="py-1 text-right tabular">
                      {p.ageDays}/{p.keepDays}日
                    </td>
                    <td className="py-1 pl-2">{p.willAnonymize ? "あり" : "なし"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {lastResult && (
        <div className="border rounded p-3 text-sm bg-emerald-50 border-emerald-200">
          <div className="font-medium mb-1">スイープ完了</div>
          <div className="text-xs space-y-0.5">
            <div>ソフト削除（→ ゴミ箱）: {lastResult.softDeleted.length}件</div>
            <div>匿名サマリ保存: {lastResult.anonymized.length}件</div>
            <div>完全削除（猶予超過）: {lastResult.hardDeleted.length}件</div>
          </div>
        </div>
      )}

      {log && (
        <details className="border rounded text-sm" open>
          <summary className="cursor-pointer px-3 py-1.5 bg-zinc-50 text-xs text-zinc-600">
            削除ログ（直近30件）
          </summary>
          {log.length === 0 ? (
            <div className="px-3 py-2 text-zinc-500 text-xs">ログなし</div>
          ) : (
            <ul className="px-3 py-2 text-xs font-mono space-y-0.5 max-h-48 overflow-auto">
              {log.map((line, i) => (
                <li key={i} className="text-zinc-600">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      <ConfirmDialog />
    </div>
  );
}
