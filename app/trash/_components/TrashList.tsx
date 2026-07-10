"use client";

import { useState, useTransition } from "react";
import {
  purgeAllFromTrashAction,
  purgeSessionAction,
  restoreSessionAction,
} from "../../settings/actions";
import type { TrashItem } from "@/lib/retention";
import { useConfirm } from "@/ui/use-confirm";
import { Button } from "@/ui/button";

export function TrashList({ items: initial }: { items: TrashItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function handleRestore(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await restoreSessionAction(id);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error ?? "復元に失敗しました");
        return;
      }
      setItems((cur) => cur.filter((it) => it.id !== id));
    });
  }

  async function handlePurge(id: string, 氏名?: string) {
    const ok = await confirm({
      title: `${氏名 ?? id} を完全削除しますか？`,
      description: "元に戻せません。本当に削除しますか？",
      confirmLabel: "完全削除",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await purgeSessionAction(id);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error ?? "削除に失敗しました");
        return;
      }
      setItems((cur) => cur.filter((it) => it.id !== id));
    });
  }

  async function handlePurgeAll() {
    if (items.length === 0) return;
    const ok = await confirm({
      title: `ゴミ箱内の ${items.length} 件をすべて完全削除しますか？`,
      description:
        "元に戻せません。復元も不可能です。実行前に必要なデータがないことを確認してください。",
      confirmLabel: `${items.length} 件を完全削除`,
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBulkBusy(true);
    startTransition(async () => {
      const r = await purgeAllFromTrashAction();
      setBulkBusy(false);
      if (!r.ok) {
        setError(
          `${r.purgedCount} 件削除、${r.failed.length} 件失敗: ${r.failed.map((f) => f.id).join(", ")}`,
        );
      }
      // 成功したものだけ画面から除く
      const failedIds = new Set(r.failed.map((f) => f.id));
      setItems((cur) => cur.filter((it) => failedIds.has(it.id)));
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePurgeAll}
            disabled={bulkBusy || busyId !== null}
            className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            {bulkBusy ? "削除中…" : `全 ${items.length} 件を完全削除`}
          </Button>
        </div>
      )}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="text-left px-4 py-2">退避日時</th>
            <th className="text-left px-4 py-2">氏名</th>
            <th className="text-left px-4 py-2">役割</th>
            <th className="text-left px-4 py-2">元の合否</th>
            <th className="text-right px-4 py-2">猶予残</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it) => (
            <tr key={it.id} className="hover:bg-accent">
              <td className="px-4 py-2 tabular text-xs">
                {new Date(it.trashedAt).toLocaleString("ja-JP")}
              </td>
              <td className="px-4 py-2 font-medium">{it.meta?.氏名 ?? "—"}</td>
              <td className="px-4 py-2">{it.meta?.役割 ?? "—"}</td>
              <td className="px-4 py-2">{it.meta?.result ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular">
                <span
                  className={
                    it.remainingGraceDays <= 1
                      ? "text-red-600 font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {it.remainingGraceDays}日
                </span>
              </td>
              <td className="px-4 py-2 text-right space-x-2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => handleRestore(it.id)}
                  disabled={busyId === it.id}
                >
                  復元
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => handlePurge(it.id, it.meta?.氏名)}
                  disabled={busyId === it.id}
                  className="text-red-600"
                >
                  完全削除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground">{items.length}件</div>
      <ConfirmDialog />
    </div>
  );
}
