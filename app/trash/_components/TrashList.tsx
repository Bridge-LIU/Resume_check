"use client";

import { useState, useTransition } from "react";
import { purgeSessionAction, restoreSessionAction } from "../../settings/actions";
import type { TrashItem } from "@/lib/retention";
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";

export function TrashList({ items: initial }: { items: TrashItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  return (
    <div className="space-y-3">
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-zinc-50 text-zinc-600 text-xs">
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
            <tr key={it.id} className="hover:bg-zinc-50">
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
                      : "text-zinc-600"
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
      <div className="text-xs text-zinc-500">{items.length}件</div>
      <ConfirmDialog />
    </div>
  );
}
