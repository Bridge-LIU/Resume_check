"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, Filter, Search } from "lucide-react";
import type { AnonymizedSummary } from "@/lib/analytics";
import { ActionLink } from "@/app/_components/ui/action-link";
import { Checkbox } from "@/app/_components/ui/checkbox";

type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir } | null;

function rolePillClass(役割: string) {
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-muted text-foreground/85";
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

/** 大分類の並び順（人間性 → 技術力 → 分類なし） */
const CATEGORY_ORDER = (c: "人間性" | "技術力" | undefined): number =>
  c === "人間性" ? 0 : c === "技術力" ? 1 : 2;

type AxisInput = { 軸: string; 大分類?: "人間性" | "技術力" };

export function DetailTable({
  items,
  axes,
}: {
  items: AnonymizedSummary[];
  axes: AxisInput[];
}) {
  /** 大分類でソートした軸列（表示順を確定） */
  const sortedAxes = useMemo(
    () =>
      [...axes].sort(
        (a, b) => CATEGORY_ORDER(a.大分類) - CATEGORY_ORDER(b.大分類),
      ),
    [axes],
  );

  // カラム定義
  const columns = useMemo(() => {
    const base: {
      key: string;
      label: string;
      align?: "left" | "right" | "center";
      width?: string;
      /** 大分類バンドの左端フラグ（データ行にも細い区切り線を入れる用） */
      groupStart?: "人間性" | "技術力" | "分類なし";
      /** filter icon を出すか。連続値の数値列は false（filter-by-value が無意味） */
      filterable?: boolean;
    }[] = [
      { key: "closedAt", label: "closedAt", align: "left", width: "w-28", filterable: true },
      { key: "役割", label: "役割", align: "left", width: "w-40", filterable: true },
    ];
    // 6 小軸（人間性 → 技術力 → 分類なし）
    let prevCat: "人間性" | "技術力" | "分類なし" | null = null;
    for (const a of sortedAxes) {
      const cat: "人間性" | "技術力" | "分類なし" = a.大分類 ?? "分類なし";
      base.push({
        key: `axis:${a.軸}`,
        label: a.軸,
        align: "right",
        width: "w-20",
        groupStart: cat !== prevCat ? cat : undefined,
        filterable: false, // 小軸は連続値、精確値 filter は使わない → sort のみ
      });
      prevCat = cat;
    }
    // 集計系（末尾に配置）
    base.push({ key: "総合", label: "総合", align: "right", width: "w-16", filterable: false });
    base.push({ key: "合否", label: "合否", align: "center", width: "w-16", filterable: true });
    base.push({ key: "採否", label: "採否", align: "center", width: "w-16", filterable: true });
    return base;
  }, [sortedAxes]);

  /** 分類バンドの列数（0 のバンドは表示しない） */
  const categorySpans = useMemo(() => {
    const 人間性 = sortedAxes.filter((a) => a.大分類 === "人間性").length;
    const 技術力 = sortedAxes.filter((a) => a.大分類 === "技術力").length;
    const 分類なし = sortedAxes.filter((a) => a.大分類 === undefined).length;
    return { 人間性, 技術力, 分類なし };
  }, [sortedAxes]);

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

  const filterCount = Object.keys(filters).length;

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap">
        <h3 className="font-bold">明細</h3>
        <span className="text-xs text-muted-foreground">
          匿名 1 件ずつ ・ 表示中{" "}
          <span className="font-medium text-foreground/85 tabular">
            {sorted.length}
          </span>{" "}
          / 全 {items.length} 件
        </span>
        {filterCount > 0 && (
          <span className="inline-flex items-center gap-1 text-2xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
            <Filter className="h-3 w-3 fill-primary" />
            {filterCount} 列で絞り込み中
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs">
          {sort && (
            <span className="text-muted-foreground">
              並び:{" "}
              <span className="text-foreground/85">
                {columns.find((c) => c.key === sort.key)?.label ?? sort.key}{" "}
                {sort.dir === "asc" ? "↑" : "↓"}
              </span>
            </span>
          )}
          {(hasFilter || sort?.key !== "closedAt" || sort?.dir !== "desc") && (
            <ActionLink onClick={resetAll} className="text-xs">
              並び替え/絞り込みをリセット
            </ActionLink>
          )}
        </div>
      </div>

      <div className="p-6">
        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            条件に一致する明細はありません。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                {/* 分類バンド（sticky top-0）: 大分類ごとに色帯 + ラベル */}
                <tr>
                  {/* 左端 2 列: closedAt / 役割 */}
                  <th
                    colSpan={2}
                    className="sticky top-0 z-10 h-7 bg-card border-b border-border"
                    aria-hidden
                  />
                  {categorySpans.人間性 > 0 && (
                    <th
                      colSpan={categorySpans.人間性}
                      className="sticky top-0 z-10 h-7 px-2 border-b border-amber-400/60 dark:border-amber-500/40 bg-amber-100/50 dark:bg-amber-500/10 text-2xs font-bold text-amber-800 dark:text-amber-300 text-center tracking-wide"
                    >
                      人間性
                    </th>
                  )}
                  {categorySpans.技術力 > 0 && (
                    <th
                      colSpan={categorySpans.技術力}
                      className="sticky top-0 z-10 h-7 px-2 border-b border-indigo-400/60 dark:border-indigo-500/40 bg-indigo-100/50 dark:bg-indigo-500/10 text-2xs font-bold text-indigo-800 dark:text-indigo-300 text-center tracking-wide"
                    >
                      技術力
                    </th>
                  )}
                  {categorySpans.分類なし > 0 && (
                    <th
                      colSpan={categorySpans.分類なし}
                      className="sticky top-0 z-10 h-7 px-2 border-b border-border bg-muted/50 text-2xs font-bold text-muted-foreground text-center tracking-wide"
                    >
                      分類なし
                    </th>
                  )}
                  {/* 右端 3 列: 総合 / 合否 / 採否（集計系） */}
                  <th
                    colSpan={3}
                    className="sticky top-0 z-10 h-7 px-2 border-b border-primary/40 bg-primary/5 dark:bg-primary/10 text-2xs font-bold text-primary/85 text-center tracking-wide"
                  >
                    集計
                  </th>
                </tr>
                {/* sort/filter 行（sticky top-7） */}
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
              <tbody>
                {sorted.map((it, i) => (
                  <Row
                    key={it.idHash}
                    it={it}
                    axes={sortedAxes}
                    zebra={i % 2 === 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
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
  column: {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    width?: string;
    /** false の列は sort のみ提供（filter icon を出さない） */
    filterable?: boolean;
  };
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
    <ChevronsUpDown className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />
  ) : sort.dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 text-primary" />
  );

  return (
    <th
      className={`
        sticky top-7 z-10 relative
        bg-muted/60 backdrop-blur-sm
        px-2 py-2 border-b border-border
        ${column.width ?? ""} ${align}
        whitespace-nowrap select-none
        text-xs font-medium text-muted-foreground
        ${column.key === "idHash" ? "font-mono text-2xs" : ""}
        ${isSorted ? "text-foreground" : ""}
      `}
    >
      <div className={`flex items-center gap-1 ${justify}`}>
        <button
          type="button"
          onClick={onToggleSort}
          className={`
            group inline-flex items-center gap-1
            px-1.5 -mx-1.5 py-0.5 rounded
            transition-colors
            hover:text-primary hover:bg-primary/5
            ${isSorted ? "text-foreground font-semibold" : ""}
          `}
          aria-label={`${column.label} で並び替え`}
        >
          <span>{column.label}</span>
          {sortIcon}
        </button>
        {column.filterable !== false && (
          <button
            type="button"
            onClick={onOpenFilter}
            className={`
              inline-flex items-center justify-center
              h-5 w-5 rounded transition-all
              ${
                activeFilter || isFilterOpen
                  ? "text-primary bg-primary/15 ring-1 ring-primary/40 opacity-100"
                  : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10 hover:opacity-100"
              }
            `}
            aria-label={`${column.label} で絞り込み`}
            aria-haspopup="menu"
            aria-expanded={isFilterOpen}
          >
            <Filter className={`h-3 w-3 ${activeFilter ? "fill-primary" : ""}`} />
          </button>
        )}
      </div>
      {column.filterable !== false && isFilterOpen && (
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

  const activeCount = selected.size;
  return (
    <div
      ref={ref}
      className="
        absolute z-20 mt-1 left-0 top-full
        bg-card border rounded-lg
        shadow-[0_8px_24px_-6px_rgba(0,0,0,0.15),0_0_0_1px_hsl(var(--border))]
        p-2 w-60
        text-foreground/85 normal-case font-normal
      "
      role="menu"
    >
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索…"
          className="
            w-full bg-muted/40 border border-transparent
            rounded pl-6 pr-2 py-1 text-xs
            focus:bg-card focus:border-primary/40
            focus:outline-none focus:ring-2 focus:ring-primary/20
            transition-colors
          "
        />
      </div>
      <div className="flex items-center justify-between text-2xs mb-1 px-0.5">
        <ActionLink onClick={selectAll} className="text-2xs">
          すべて選択
        </ActionLink>
        <ActionLink onClick={clearAll} className="text-2xs">
          すべて解除
        </ActionLink>
      </div>
      <div className="max-h-56 overflow-y-auto border-t pt-1">
        {visible.length === 0 ? (
          <div className="text-xs text-muted-foreground opacity-70 px-2 py-4 text-center">
            候補なし
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((label) => (
              <li key={label}>
                <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent cursor-pointer text-xs transition-colors">
                  <Checkbox
                    checked={isChecked(label)}
                    onCheckedChange={() => toggle(label)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate flex-1" title={label}>
                    {label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t text-2xs">
        <span
          className={
            activeCount > 0
              ? "text-primary font-medium"
              : "text-muted-foreground"
          }
        >
          {allChecked
            ? "全件表示中"
            : activeCount === 0
              ? "0 件（全除外）"
              : `${activeCount} 件選択`}
        </span>
        <ActionLink onClick={onClose} className="text-2xs">
          閉じる
        </ActionLink>
      </div>
    </div>
  );
}

/* ─────────── 行 ─────────── */

/** 総合スコア → 色階（emerald / 通常 / rose） */
function totalScoreCls(v: number): string {
  if (v >= 4) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 3) return "text-foreground";
  return "text-rose-600 dark:text-rose-400";
}

/** 軸スコアの薄い着色（弱点/強点だけほんのり色付け、通常はミュート） */
function axisScoreCls(v: number): string {
  if (v >= 4) return "text-emerald-700/85 dark:text-emerald-400/85";
  if (v < 3) return "text-rose-700/85 dark:text-rose-400/85";
  return "text-foreground/70";
}

function Row({
  it,
  axes,
  zebra,
}: {
  it: AnonymizedSummary;
  axes: { 軸: string }[];
  zebra: boolean;
}) {
  const axisMap = new Map(it.軸評価.map((a) => [a.軸, a.スコア]));
  const cellBase =
    "px-2 py-1.5 border-b border-border/60 transition-colors";
  return (
    <tr
      className={`
        group relative transition-all
        ${zebra ? "bg-muted/25" : "bg-card"}
        hover:z-10
        hover:[box-shadow:inset_0_0_0_1px_hsl(var(--primary)/0.5),0_0_14px_hsl(var(--primary)/0.25)]
      `}
    >
      <td className={`${cellBase} text-muted-foreground text-xs tabular`}>
        {it.closedAt ? it.closedAt.slice(0, 10) : "—"}
      </td>
      <td className={cellBase}>
        <span className={rolePillClass(it.役割)}>{it.役割}</span>
      </td>
      {axes.map((a) => {
        const score = axisMap.get(a.軸);
        return (
          <td
            key={a.軸}
            className={`${cellBase} text-right tabular text-xs ${
              score === undefined ? "text-muted-foreground/50" : axisScoreCls(score)
            }`}
          >
            {score === undefined ? "—" : score.toFixed(1)}
          </td>
        );
      })}
      <td
        className={`${cellBase} text-right tabular font-semibold ${totalScoreCls(it.総合スコア)}`}
      >
        {it.総合スコア.toFixed(2)}
      </td>
      <td className={`${cellBase} text-center`}>
        <span
          className={
            it.合否 === "合格"
              ? "pill pill-pass"
              : it.合否 === "普通"
                ? "pill pill-mid"
                : it.合否 === "不合格"
                  ? "pill pill-fail"
                  : "pill bg-muted text-muted-foreground"
          }
        >
          {it.合否 ?? "―"}
        </span>
      </td>
      <td className={`${cellBase} text-center text-xs text-muted-foreground`}>
        {it.result}
      </td>
    </tr>
  );
}
