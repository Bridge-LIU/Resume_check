"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, Filter } from "lucide-react";
import type { AnonymizedSummary } from "@/lib/analytics";

type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir } | null;

function rolePillClass(役割: string) {
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-zinc-100 text-zinc-700";
}

/** 各行から列値を取り出す */
function getValue(it: AnonymizedSummary, key: string): string | number {
  if (key === "closedAt") return it.closedAt ?? "";
  if (key === "役割") return it.役割;
  if (key === "総合") return it.総合スコア;
  if (key === "合否") return it.合否;
  if (key === "採否") return it.result;
  if (key === "自己解決") return it.自己解決レベル;
  if (key === "idHash") return it.idHash;
  if (key.startsWith("axis:")) {
    const 軸 = key.slice(5);
    const found = it.軸評価.find((a) => a.軸 === 軸);
    return found ? found.スコア : Number.NEGATIVE_INFINITY;
  }
  return "";
}

/** 表示用文字列（Set 比較やフィルタ表示で使う） */
function valueLabel(it: AnonymizedSummary, key: string): string {
  if (key === "closedAt") return it.closedAt ? it.closedAt.slice(0, 10) : "(なし)";
  const v = getValue(it, key);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "(なし)";
    if (key === "総合" || key.startsWith("axis:")) return v.toFixed(2);
    return String(v);
  }
  return v || "(なし)";
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  return String(a).localeCompare(String(b), "ja");
}

export function DetailTable({
  items,
  axes,
}: {
  items: AnonymizedSummary[];
  axes: { 軸: string }[];
}) {
  // カラム定義
  const columns = useMemo(() => {
    const base: { key: string; label: string; align?: "left" | "right" | "center"; width?: string }[] = [
      { key: "closedAt", label: "closedAt", align: "left", width: "w-28" },
      { key: "役割", label: "役割", align: "left", width: "w-40" },
      { key: "総合", label: "総合", align: "right", width: "w-16" },
      { key: "合否", label: "合否", align: "center", width: "w-16" },
      { key: "採否", label: "採否", align: "center", width: "w-16" },
      { key: "自己解決", label: "自己解決", align: "right", width: "w-16" },
    ];
    for (const a of axes) {
      base.push({ key: `axis:${a.軸}`, label: a.軸, align: "right", width: "w-20" });
    }
    base.push({ key: "idHash", label: "idHash", align: "left", width: "w-24" });
    return base;
  }, [axes]);

  const [sort, setSort] = useState<SortState>({ key: "closedAt", dir: "desc" });
  // filters: column key → 選択中の表示ラベル Set（空でない＝そのラベルだけ通す）
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // 各列の出現ラベル一覧（フィルタ UI 用）
  const labelsByCol = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const col of columns) {
      const set = new Set<string>();
      for (const it of items) set.add(valueLabel(it, col.key));
      map.set(
        col.key,
        Array.from(set).sort((a, b) => a.localeCompare(b, "ja")),
      );
    }
    return map;
  }, [items, columns]);

  // フィルタ適用
  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, s]) => s.size > 0);
    if (active.length === 0) return items;
    return items.filter((it) =>
      active.every(([key, allowed]) => allowed.has(valueLabel(it, key))),
    );
  }, [items, filters]);

  // ソート適用
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // null/欠損は常に末尾
      const va = getValue(a, key);
      const vb = getValue(b, key);
      const aMissing = va === "" || va === Number.NEGATIVE_INFINITY;
      const bMissing = vb === "" || vb === Number.NEGATIVE_INFINITY;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return compare(va, vb) * sign;
    });
  }, [filtered, sort]);

  function toggleSort(key: string) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null; // desc → 解除
    });
  }

  function setColFilter(key: string, next: Set<string>) {
    setFilters((cur) => {
      const n = { ...cur };
      if (next.size === 0) delete n[key];
      else n[key] = next;
      return n;
    });
  }

  function resetAll() {
    setFilters({});
    setSort({ key: "closedAt", dir: "desc" });
  }

  const hasFilter = Object.keys(filters).length > 0;

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap">
        <h3 className="font-bold">明細</h3>
        <span className="text-xs text-zinc-500">
          匿名 1 件ずつ ・ 表示中{" "}
          <span className="font-medium text-zinc-700 tabular">
            {sorted.length}
          </span>{" "}
          / 全 {items.length} 件
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {sort && (
            <span className="text-zinc-500">
              並び:{" "}
              <span className="text-zinc-700">
                {columns.find((c) => c.key === sort.key)?.label ?? sort.key}{" "}
                {sort.dir === "asc" ? "↑" : "↓"}
              </span>
            </span>
          )}
          {(hasFilter || sort?.key !== "closedAt" || sort?.dir !== "desc") && (
            <button
              type="button"
              onClick={resetAll}
              className="text-blue-600 hover:underline"
            >
              並び替え/絞り込みをリセット
            </button>
          )}
        </div>
      </div>

      <div className="p-6 overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="text-sm text-zinc-500 py-8 text-center">
            条件に一致する明細はありません。
          </div>
        ) : (
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-zinc-50 text-zinc-600 text-xs">
              <tr>
                {columns.map((col) => (
                  <HeaderCell
                    key={col.key}
                    column={col}
                    sort={sort}
                    activeFilter={!!filters[col.key]?.size}
                    isFilterOpen={openFilter === col.key}
                    onToggleSort={() => toggleSort(col.key)}
                    onOpenFilter={() =>
                      setOpenFilter((cur) => (cur === col.key ? null : col.key))
                    }
                    onCloseFilter={() => setOpenFilter(null)}
                    labels={labelsByCol.get(col.key) ?? []}
                    selected={filters[col.key] ?? new Set<string>()}
                    onChangeSelected={(next) => setColFilter(col.key, next)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((it) => (
                <Row key={it.idHash} it={it} axes={axes} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─────────── ヘッダセル（ソート + フィルタ）─────────── */

function HeaderCell({
  column,
  sort,
  activeFilter,
  isFilterOpen,
  onToggleSort,
  onOpenFilter,
  onCloseFilter,
  labels,
  selected,
  onChangeSelected,
}: {
  column: { key: string; label: string; align?: "left" | "right" | "center"; width?: string };
  sort: SortState;
  activeFilter: boolean;
  isFilterOpen: boolean;
  onToggleSort: () => void;
  onOpenFilter: () => void;
  onCloseFilter: () => void;
  labels: string[];
  selected: Set<string>;
  onChangeSelected: (next: Set<string>) => void;
}) {
  const align =
    column.align === "right"
      ? "text-right"
      : column.align === "center"
        ? "text-center"
        : "text-left";

  const justify =
    column.align === "right"
      ? "justify-end"
      : column.align === "center"
        ? "justify-center"
        : "justify-start";

  const isSorted = sort?.key === column.key;
  const sortIcon = !isSorted ? (
    <ChevronsUpDown className="h-3 w-3 text-zinc-300 group-hover:text-zinc-500" />
  ) : sort.dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-blue-600" />
  ) : (
    <ArrowDown className="h-3 w-3 text-blue-600" />
  );

  return (
    <th
      className={`relative px-2 py-2 ${column.width ?? ""} ${align} whitespace-nowrap select-none ${
        column.key === "idHash" ? "font-mono text-2xs" : ""
      }`}
    >
      <div className={`flex items-center gap-1 ${justify}`}>
        <button
          type="button"
          onClick={onToggleSort}
          className="group inline-flex items-center gap-1 hover:text-blue-600"
          aria-label={`${column.label} で並び替え`}
        >
          <span>{column.label}</span>
          {sortIcon}
        </button>
        <button
          type="button"
          onClick={onOpenFilter}
          className={`inline-flex items-center hover:text-blue-600 ${
            activeFilter ? "text-blue-600" : "text-zinc-300 hover:text-zinc-600"
          }`}
          aria-label={`${column.label} で絞り込み`}
          aria-haspopup="menu"
          aria-expanded={isFilterOpen}
        >
          <Filter className={`h-3 w-3 ${activeFilter ? "fill-blue-600" : ""}`} />
        </button>
      </div>
      {isFilterOpen && (
        <FilterPopover
          labels={labels}
          selected={selected}
          onChange={onChangeSelected}
          onClose={onCloseFilter}
        />
      )}
    </th>
  );
}

/* ─────────── フィルタ ポップオーバ ─────────── */

function FilterPopover({
  labels,
  selected,
  onChange,
  onClose,
}: {
  labels: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  // 外側クリック & Esc で閉じる
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) => l.toLowerCase().includes(q));
  }, [labels, query]);

  // 表示中の全てが選択されているか
  const allChecked =
    visible.length > 0 && visible.every((l) => selected.size === 0 || selected.has(l));

  // 未選択 = 全件通す扱いなので、checkbox の見た目は「空 = 全件」とする
  function isChecked(label: string): boolean {
    return selected.size === 0 ? true : selected.has(label);
  }

  function toggle(label: string) {
    // 初回トグル: 全選択状態（空 Set）から、その項目を外す＝他全て選択へ
    let next: Set<string>;
    if (selected.size === 0) {
      next = new Set(labels);
      next.delete(label);
    } else {
      next = new Set(selected);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      // 全ラベルを含む状態は「フィルタなし」と等価にする
      if (next.size === labels.length) next = new Set();
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set()); // 空 = 全件通過
  }

  function clearAll() {
    onChange(new Set(["__none__"])); // ありえないラベル＝全件除外
  }

  return (
    <div
      ref={ref}
      className="absolute z-20 mt-1 left-0 top-full bg-white border rounded-lg shadow-lg p-2 w-56 text-zinc-700 normal-case font-normal"
      role="menu"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="検索..."
        className="w-full border rounded px-2 py-1 text-xs mb-2"
      />
      <div className="flex items-center justify-between text-xs mb-1">
        <button
          type="button"
          onClick={selectAll}
          className="text-blue-600 hover:underline"
        >
          すべて選択
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="text-blue-600 hover:underline"
        >
          すべて解除
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto border-t pt-1">
        {visible.length === 0 ? (
          <div className="text-xs text-zinc-400 px-2 py-3 text-center">
            候補なし
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((label) => (
              <li key={label}>
                <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-50 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={isChecked(label)}
                    onChange={() => toggle(label)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate" title={label}>
                    {label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t text-2xs text-zinc-500">
        <span>{allChecked ? "全件表示中" : `${selected.size} 件選択`}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-blue-600 hover:underline"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

/* ─────────── 行 ─────────── */

function Row({
  it,
  axes,
}: {
  it: AnonymizedSummary;
  axes: { 軸: string }[];
}) {
  const axisMap = new Map(it.軸評価.map((a) => [a.軸, a.スコア]));
  const isFake = it.役割.startsWith("[FAKE]");
  return (
    <tr
      className={
        isFake ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-zinc-50"
      }
    >
      <td className="px-2 py-1.5 text-zinc-600 text-xs tabular">
        {it.closedAt ? it.closedAt.slice(0, 10) : "—"}
      </td>
      <td className="px-2 py-1.5">
        <span className={rolePillClass(it.役割)}>{it.役割}</span>
      </td>
      <td className="px-2 py-1.5 text-right tabular font-medium">
        {it.総合スコア.toFixed(2)}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span
          className={
            it.合否 === "合格"
              ? "pill pill-pass"
              : it.合否 === "普通"
                ? "pill pill-mid"
                : it.合否 === "不合格"
                  ? "pill pill-fail"
                  : "pill bg-zinc-100 text-zinc-600"
          }
        >
          {it.合否 ?? "―"}
        </span>
      </td>
      <td className="px-2 py-1.5 text-center text-xs text-zinc-600">
        {it.result}
      </td>
      <td className="px-2 py-1.5 text-right tabular">
        {it.自己解決レベル}
      </td>
      {axes.map((a) => {
        const score = axisMap.get(a.軸);
        return (
          <td
            key={a.軸}
            className="px-2 py-1.5 text-right tabular text-xs text-zinc-700"
          >
            {score === undefined ? "—" : score.toFixed(1)}
          </td>
        );
      })}
      <td className="px-2 py-1.5 font-mono text-2xs text-zinc-400">
        {it.idHash.slice(0, 8)}
      </td>
    </tr>
  );
}
