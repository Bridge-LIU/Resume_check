"use client";

import { useMemo, useState, useTransition } from "react";
import {
  purgeAllFromTrashAction,
  purgeMultipleFromTrashAction,
  purgeSessionAction,
  restoreMultipleFromTrashAction,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  const allChecked = items.length > 0 && selectedIds.size === items.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < items.length;
  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const anyBusy = bulkBusy || busyId !== null;

  function toggleOne(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((cur) =>
      cur.size === items.length ? new Set() : new Set(items.map((it) => it.id)),
    );
  }

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
      setSelectedIds((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
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
      setSelectedIds((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
    });
  }

  async function handleRestoreSelected() {
    if (selectedItems.length === 0) return;
    const ok = await confirm({
      title: `選択した ${selectedItems.length} 件を復元しますか？`,
      description: "sessions/ に戻り、一覧から編集できるようになります。",
      confirmLabel: `${selectedItems.length} 件を復元`,
    });
    if (!ok) return;
    setError(null);
    setBulkBusy(true);
    const ids = selectedItems.map((it) => it.id);
    startTransition(async () => {
      const r = await restoreMultipleFromTrashAction(ids);
      setBulkBusy(false);
      if (!r.ok) {
        setError(
          `${r.restoredCount} 件復元、${r.failed.length} 件失敗: ${r.failed.map((f) => f.id).join(", ")}`,
        );
      }
      const failedIds = new Set(r.failed.map((f) => f.id));
      setItems((cur) => cur.filter((it) => failedIds.has(it.id) || !ids.includes(it.id)));
      setSelectedIds(failedIds);
    });
  }

  async function handlePurgeSelected() {
    if (selectedItems.length === 0) return;
    const ok = await confirm({
      title: `選択した ${selectedItems.length} 件を完全削除しますか？`,
      description: "元に戻せません。復元も不可能です。",
      confirmLabel: `${selectedItems.length} 件を完全削除`,
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBulkBusy(true);
    const ids = selectedItems.map((it) => it.id);
    startTransition(async () => {
      const r = await purgeMultipleFromTrashAction(ids);
      setBulkBusy(false);
      if (!r.ok) {
        setError(
          `${r.purgedCount} 件削除、${r.failed.length} 件失敗: ${r.failed.map((f) => f.id).join(", ")}`,
        );
      }
      const failedIds = new Set(r.failed.map((f) => f.id));
      setItems((cur) => cur.filter((it) => failedIds.has(it.id) || !ids.includes(it.id)));
      setSelectedIds(failedIds);
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
      const failedIds = new Set(r.failed.map((f) => f.id));
      setItems((cur) => cur.filter((it) => failedIds.has(it.id)));
      setSelectedIds(failedIds);
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
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {selectedIds.size} 件
                </span>
                <span className="mx-1">/</span>
                {items.length} 件を選択中
              </>
            ) : (
              <>チェックボックスで複数選択できます</>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRestoreSelected}
                  disabled={anyBusy}
                  className="h-8 px-3 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
                >
                  {bulkBusy ? "復元中…" : `選択した ${selectedIds.size} 件を復元`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePurgeSelected}
                  disabled={anyBusy}
                  className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  {bulkBusy ? "削除中…" : `選択した ${selectedIds.size} 件を完全削除`}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePurgeAll}
                disabled={anyBusy}
                className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                {bulkBusy ? "削除中…" : `全 ${items.length} 件を完全削除`}
              </Button>
            )}
          </div>
        </div>
      )}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 w-9">
              <input
                type="checkbox"
                aria-label="すべて選択"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={toggleAll}
                disabled={anyBusy}
                className="align-middle cursor-pointer"
              />
            </th>
            <th className="text-left px-4 py-2">退避日時</th>
            <th className="text-left px-4 py-2">氏名</th>
            <th className="text-left px-4 py-2">役割</th>
            <th className="text-left px-4 py-2">元の合否</th>
            <th className="text-right px-4 py-2">猶予残</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it) => {
            const checked = selectedIds.has(it.id);
            return (
              <tr
                key={it.id}
                className={checked ? "bg-blue-50/60 hover:bg-blue-50" : "hover:bg-accent"}
              >
                <td className="px-3 py-2 w-9">
                  <input
                    type="checkbox"
                    aria-label={`${it.meta?.氏名 ?? it.id} を選択`}
                    checked={checked}
                    onChange={() => toggleOne(it.id)}
                    disabled={anyBusy}
                    className="align-middle cursor-pointer"
                  />
                </td>
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
                    disabled={busyId === it.id || bulkBusy}
                  >
                    復元
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => handlePurge(it.id, it.meta?.氏名)}
                    disabled={busyId === it.id || bulkBusy}
                    className="text-red-600"
                  >
                    完全削除
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground">{items.length}件</div>
      <ConfirmDialog />
    </div>
  );
}
