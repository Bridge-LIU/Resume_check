"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { SessionMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tip } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ui/use-confirm";
import { softDeleteSessionAction } from "@/app/sessions/[id]/actions";

type Row = {
  meta: SessionMeta;
  score: number | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function rolePillClass(役割: string) {
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-zinc-100 text-zinc-700";
}

function statusPillClass(status: SessionMeta["status"]) {
  switch (status) {
    case "編集中":
      return "pill pill-edit";
    case "質問公開":
      return "pill pill-qpub";
    case "面談済":
      return "pill pill-itv";
    case "評価済":
      return "pill pill-eval";
  }
}

function resultCell(result: SessionMeta["result"]) {
  if (result === "採用") return <span className="pill pill-pass">合格</span>;
  if (result === "不採用") return <span className="pill pill-fail">不合格</span>;
  return <span className="text-zinc-400">―</span>;
}

const MAX_COMPARE = 20;

export function SessionListTable({ rows, total }: { rows: Row[]; total: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  async function handleDelete(meta: SessionMeta) {
    const ok = await confirm({
      title: `${meta.氏名} の面談をゴミ箱へ移動しますか？`,
      description:
        "猶予期間（既定14日）内なら /trash から復元できます。\n猶予を過ぎると保存期間スイープにより完全削除されます。",
      confirmLabel: "ゴミ箱へ移動",
      destructive: true,
    });
    if (!ok) return;
    setPendingDeleteId(meta.id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(meta.id);
      return next;
    });
    startTransition(async () => {
      await softDeleteSessionAction(meta.id);
      setPendingDeleteId(null);
    });
  }

  const evaluableIds = useMemo(
    () => rows.filter((r) => r.meta.status === "評価済").map((r) => r.meta.id),
    [rows],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  function toggleAllVisible() {
    if (evaluableIds.every((id) => selected.has(id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of evaluableIds) next.delete(id);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of evaluableIds) {
        if (next.size >= MAX_COMPARE) break;
        next.add(id);
      }
      return next;
    });
  }

  const compareHref =
    selected.size >= 2
      ? `/compare?ids=${Array.from(selected).map(encodeURIComponent).join(",")}`
      : null;

  const allEvaluableSelected =
    evaluableIds.length > 0 && evaluableIds.every((id) => selected.has(id));

  return (
    <>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-zinc-50 text-zinc-600 text-xs">
          <tr>
            <th className="px-3 py-2 w-8">
              <Checkbox
                aria-label="表示中の評価済セッションを全選択"
                checked={allEvaluableSelected}
                onCheckedChange={toggleAllVisible}
                disabled={evaluableIds.length === 0}
              />
            </th>
            <th className="text-left px-4 py-2">日時</th>
            <th className="text-left px-4 py-2">氏名</th>
            <th className="text-left px-4 py-2">役割</th>
            <th className="text-left px-4 py-2">状態</th>
            <th className="text-right px-4 py-2">総合スコア</th>
            <th className="text-left px-4 py-2">合否</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ meta, score }) => {
            const isEvaluated = meta.status === "評価済";
            const isSelected = selected.has(meta.id);
            const disabled =
              !isEvaluated || (!isSelected && selected.size >= MAX_COMPARE);
            return (
              <tr
                key={meta.id}
                className={`hover:bg-zinc-50 ${isSelected ? "bg-blue-50/50" : ""}`}
              >
                <td className="px-3 py-2 align-middle">
                  <Tip
                    content={
                      !isEvaluated
                        ? "評価済のみ比較できます"
                        : disabled
                          ? `比較は最大 ${MAX_COMPARE} 件まで`
                          : null
                    }
                  >
                    <Checkbox
                      aria-label={`${meta.氏名} を比較対象に追加`}
                      checked={isSelected}
                      onCheckedChange={() => toggle(meta.id)}
                      disabled={disabled}
                    />
                  </Tip>
                </td>
                <td className="px-4 py-2 tabular">{formatDateTime(meta.作成日時)}</td>
                <td className="px-4 py-2 font-medium">{meta.氏名}</td>
                <td className="px-4 py-2">
                  <span className={rolePillClass(meta.役割)}>{meta.役割}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={statusPillClass(meta.status)}>{meta.status}</span>
                </td>
                <td className="px-4 py-2 text-right tabular font-medium">
                  {score != null ? (
                    score.toFixed(1)
                  ) : (
                    <span className="text-zinc-400">―</span>
                  )}
                </td>
                <td className="px-4 py-2">{resultCell(meta.result)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                    >
                      <Link
                        href={`/sessions/${encodeURIComponent(meta.id)}`}
                        aria-label={`${meta.氏名} の詳細を開く`}
                      >
                        詳細
                      </Link>
                    </Button>
                    <Tip content="ゴミ箱へ移動（/trash から復元可能）">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => handleDelete(meta)}
                        disabled={pendingDeleteId === meta.id}
                        aria-label={`${meta.氏名} の面談を削除`}
                      >
                        削除
                      </Button>
                    </Tip>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ConfirmDialog />
      <div className="text-xs text-zinc-500">
        {rows.length}件 / 全{total}件 ・ 評価済のみ複数選択して比較できます（最大 {MAX_COMPARE} 件・7件以上は転置ビュー）
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 bg-white border shadow-lg rounded-xl px-4 py-3 text-sm">
          <span className="font-medium">
            {selected.size} 件選択中
            {selected.size >= MAX_COMPARE && (
              <span className="text-amber-600 ml-2 text-xs">上限</span>
            )}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={clearAll}
            className="text-xs text-zinc-500 px-1"
          >
            選択解除
          </Button>
          <div className="flex-1" />
          {compareHref ? (
            <Button asChild size="sm">
              <Link href={compareHref}>{selected.size} 件を比較 →</Link>
            </Button>
          ) : (
            <Tip content="2 件以上で比較できます">
              <Button disabled size="sm">
                2 件以上で比較
              </Button>
            </Tip>
          )}
        </div>
      )}
    </>
  );
}
