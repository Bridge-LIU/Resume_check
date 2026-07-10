"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { SessionMeta } from "@/lib/types";
import { rolePillClass, statusPillClass, verdictPillClass } from "@/lib/uiClass";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Tip } from "@/ui/tooltip";
import { useConfirm } from "@/ui/use-confirm";
import {
  bulkSoftDeleteSessionsAction,
  softDeleteSessionAction,
} from "@/app/sessions/[id]/actions";
import { useRouter } from "next/navigation";

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

/** 合否（自動判定：⑧評価保存時に評価 JSON から由来） */
function verdictCell(verdict: SessionMeta["合否"] | undefined) {
  const cls = verdictPillClass(verdict);
  if (cls) return <span className={`${cls} -ml-2`}>{verdict}</span>;
  return <span className="text-muted-foreground opacity-70">―</span>;
}

/** 採否（人工判断：採用 / 不採用 / 未確定） */
function decisionCell(result: SessionMeta["result"]) {
  if (result === "採用")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        採用
      </span>
    );
  if (result === "不採用")
    return (
      <span className="inline-flex items-center gap-1 text-red-700 font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        不採用
      </span>
    );
  return <span className="text-muted-foreground opacity-70">未確定</span>;
}

const MAX_COMPARE = 20;
const PAGE_SIZE = 20;

/**
 * mode:
 *   "list" (既定) — 一覧ページ。複数選択 = 一括削除
 *   "compare"     — 比較ページ。複数選択 = 比較へ遷移（評価済のみ、最大 20 件）
 *                    行の削除ボタンは非表示（削除は一覧で行う）
 */
export function SessionListTable({
  rows,
  total,
  mode = "list",
}: {
  rows: Row[];
  total: number;
  mode?: "list" | "compare";
}) {
  const isCompareMode = mode === "compare";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();

  // page 状態は 1..N の入力、currentPage は「今のデータで有効な」ページ番号。
  // rows が減ったときは currentPage が縮んで表示され、次操作時に page も追随する。
  // useEffect + setPage は React 19 の set-state-in-effect ルールに反するため回避。
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.meta.id, r.meta.氏名);
    return m;
  }, [rows]);

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

  // list モード = 表示中の全 row、compare モード = 評価済のみ
  const selectableIds = useMemo(
    () =>
      isCompareMode
        ? visibleRows.filter((r) => r.meta.status === "評価済").map((r) => r.meta.id)
        : visibleRows.map((r) => r.meta.id),
    [visibleRows, isCompareMode],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (!isCompareMode || next.size < MAX_COMPARE) {
        // list モードは上限なし。compare モードは 20 件まで
        next.add(id);
      }
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const names = ids
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n);
    const visibleNames = names.slice(0, 8);
    const overflow = names.length - visibleNames.length;
    const ok = await confirm({
      title: `${ids.length} 件をゴミ箱へ移動`,
      body: (
        <div className="space-y-4 -mt-1">
          <div className="rounded-lg border bg-muted p-3">
            <div className="text-xs text-muted-foreground mb-2">対象セッション</div>
            <div className="flex flex-wrap gap-1.5">
              {visibleNames.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className="inline-flex items-center rounded-md bg-card border px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {n}
                </span>
              ))}
              {overflow > 0 && (
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  +{overflow}
                </span>
              )}
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                猶予期間内（既定 <strong className="text-foreground">14 日</strong>）は
                <Link href="/trash" className="text-primary hover:underline mx-1">ゴミ箱</Link>
                から復元可能
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">✕</span>
              <span>猶予を過ぎると保存期間スイープにより<strong className="text-red-600">完全削除</strong></span>
            </li>
          </ul>
        </div>
      ),
      confirmLabel: `${ids.length} 件を削除`,
      destructive: true,
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      await bulkSoftDeleteSessionsAction(ids);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      console.error("[handleBulkDelete] failed", e);
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleAllVisible() {
    if (selectableIds.every((id) => selected.has(id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) {
        if (isCompareMode && next.size >= MAX_COMPARE) break;
        next.add(id);
      }
      return next;
    });
  }

  const compareHref =
    isCompareMode && selected.size >= 2
      ? `/compare?ids=${Array.from(selected).map(encodeURIComponent).join(",")}`
      : null;

  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  return (
    <>
      <table className="w-full text-sm border rounded-lg overflow-hidden [&_td]:align-middle [&_th]:align-middle">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 w-8">
              <Checkbox
                aria-label={
                  isCompareMode
                    ? "表示中の評価済セッションを全選択"
                    : "表示中の全セッションを選択"
                }
                checked={allSelectableSelected}
                onCheckedChange={toggleAllVisible}
                disabled={selectableIds.length === 0}
              />
            </th>
            <th className="text-left px-4 py-2">日時</th>
            <th className="text-left px-4 py-2">氏名</th>
            <th className="text-left px-4 py-2">役割</th>
            <th className="text-left px-4 py-2">状態</th>
            <th className="text-right px-4 py-2">総合スコア</th>
            <th className="text-left px-4 py-2">合否</th>
            <th className="text-left px-4 py-2">採否</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {visibleRows.map(({ meta, score }) => {
            const isEvaluated = meta.status === "評価済";
            const isSelected = selected.has(meta.id);
            // list モード: 全 row 選択可、上限なし
            // compare モード: 評価済のみ、20 件上限
            const disabled = isCompareMode
              ? !isEvaluated || (!isSelected && selected.size >= MAX_COMPARE)
              : false;
            return (
              <tr
                key={meta.id}
                className={`hover:bg-accent ${isSelected ? "bg-blue-50/50" : ""}`}
              >
                <td className="px-3 py-2">
                  <Tip
                    content={
                      isCompareMode
                        ? !isEvaluated
                          ? "評価済のみ比較できます"
                          : disabled
                            ? `比較は最大 ${MAX_COMPARE} 件まで`
                            : null
                        : null
                    }
                  >
                    <Checkbox
                      aria-label={
                        isCompareMode
                          ? `${meta.氏名} を比較対象に追加`
                          : `${meta.氏名} を選択`
                      }
                      checked={isSelected}
                      onCheckedChange={() => toggle(meta.id)}
                      disabled={disabled}
                    />
                  </Tip>
                </td>
                <td className="px-4 py-2 tabular">{formatDateTime(meta.作成日時)}</td>
                <td className="px-4 py-2 font-medium">{meta.氏名}</td>
                <td className="px-4 py-2">
                  <span className={`${rolePillClass(meta.役割)} -ml-2`}>{meta.役割}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`${statusPillClass(meta.status)} -ml-2`}>{meta.status}</span>
                </td>
                <td className="px-4 py-2 text-right tabular font-medium">
                  {score != null ? (
                    score.toFixed(1)
                  ) : (
                    <span className="text-muted-foreground opacity-70">―</span>
                  )}
                </td>
                <td className="px-4 py-2">{verdictCell(meta.合否)}</td>
                <td className="px-4 py-2">{decisionCell(meta.result)}</td>
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
                    {!isCompareMode && (
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
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ConfirmDialog />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {rows.length}件 / 全{total}件
          {isCompareMode
            ? ` ・ 評価済のみ複数選択して比較できます（最大 ${MAX_COMPARE} 件・7件以上は転置ビュー）`
            : " ・ チェックで複数選択 → 一括削除できます"}
        </span>
        <div className="flex-1" />
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="border rounded px-2 py-1 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              前へ
            </button>
            <span className="tabular px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="border rounded px-2 py-1 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 bg-card border shadow-lg rounded-xl px-4 py-3 text-sm">
          <span className="font-medium">
            {selected.size} 件選択中
            {isCompareMode && selected.size >= MAX_COMPARE && (
              <span className="text-amber-600 ml-2 text-xs">上限</span>
            )}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={clearAll}
            className="text-xs text-muted-foreground px-1"
          >
            選択解除
          </Button>
          <div className="flex-1" />
          {isCompareMode ? (
            compareHref ? (
              <Button asChild size="sm">
                <Link href={compareHref}>{selected.size} 件を比較 →</Link>
              </Button>
            ) : (
              <Tip content="2 件以上で比較できます">
                <Button disabled size="sm">
                  2 件以上で比較
                </Button>
              </Tip>
            )
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {bulkDeleting ? "削除中…" : `${selected.size} 件を一括削除`}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
