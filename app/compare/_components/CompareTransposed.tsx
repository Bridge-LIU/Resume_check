"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type TransposedRow = {
  id: string;
  name: string;
  role: string;
  total: number | null;
  weighted: number | null;
  self: number | null;
  pass: "合格" | "普通" | "不合格" | null;
  /** 軸名 → スコア */
  axes: Record<string, number | null>;
  /** 軸名 → 根拠 */
  axisRationale: Record<string, string | null>;
  good: string | null;
  concern: string | null;
};

type SortKey =
  | "name"
  | "role"
  | "total"
  | "weighted"
  | "self"
  | "pass"
  | `axis:${string}`;
type SortDir = "asc" | "desc";

function rolePillClass(役割: string) {
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-muted text-foreground/85";
}

function passingPill(g: TransposedRow["pass"]) {
  if (g === "合格") return <span className="pill pill-pass">合格</span>;
  if (g === "不合格") return <span className="pill pill-fail">不合格</span>;
  if (g === "普通") return <span className="pill pill-mid">普通</span>;
  return <span className="text-muted-foreground opacity-70">―</span>;
}

const PASS_ORDER: Record<string, number> = { 合格: 3, 普通: 2, 不合格: 1 };

function scoreColor(score: number, pass: number, mid: number): string {
  if (score >= pass) return "text-emerald-700";
  if (score >= mid) return "text-amber-700";
  return "text-red-700";
}

function barColor(score: number, pass: number, mid: number): string {
  if (score >= pass) return "bg-emerald-400";
  if (score >= mid) return "bg-amber-400";
  return "bg-red-300";
}

export function CompareTransposed({
  rows,
  axes,
  axisWeights,
  passLine,
  midLine,
}: {
  rows: TransposedRow[];
  axes: string[];
  axisWeights: Record<string, number>;
  passLine: number;
  midLine: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "name" || key === "role" || key === "pass" ? "asc" : "desc",
      );
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const compare = (a: TransposedRow, b: TransposedRow): number => {
      const dir = sortDir === "asc" ? 1 : -1;
      function cmpNum(x: number | null, y: number | null) {
        // null は常に最下位
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x - y) * dir;
      }
      function cmpStr(x: string, y: string) {
        return x.localeCompare(y, "ja") * dir;
      }
      switch (sortKey) {
        case "name":
          return cmpStr(a.name, b.name);
        case "role":
          return cmpStr(a.role, b.role);
        case "total":
          return cmpNum(a.total, b.total);
        case "weighted":
          return cmpNum(a.weighted, b.weighted);
        case "self":
          return cmpNum(a.self, b.self);
        case "pass":
          return cmpNum(
            a.pass ? PASS_ORDER[a.pass] ?? null : null,
            b.pass ? PASS_ORDER[b.pass] ?? null : null,
          );
        default: {
          // axis:xxx
          const axis = sortKey.slice("axis:".length);
          return cmpNum(a.axes[axis] ?? null, b.axes[axis] ?? null);
        }
      }
    };
    return [...rows].sort(compare);
  }, [rows, sortKey, sortDir]);

  // ベスト/ワースト計算（合否別の色分け用）
  const totalsExt = bestWorst(rows.map((r) => r.total));
  const weightedExt = bestWorst(rows.map((r) => r.weighted));
  const selfsExt = bestWorst(rows.map((r) => r.self));
  const axisExt = useMemo(() => {
    const m: Record<string, { best: number | null; worst: number | null }> = {};
    for (const ax of axes) {
      m[ax] = bestWorst(rows.map((r) => r.axes[ax] ?? null));
    }
    return m;
  }, [axes, rows]);

  function sortMark(key: SortKey) {
    if (sortKey !== key) return <span className="text-muted-foreground opacity-50">⇅</span>;
    return (
      <span className="text-blue-600">{sortDir === "asc" ? "▲" : "▼"}</span>
    );
  }

  function ariaSortOf(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground leading-relaxed">
        7 件以上は転置ビュー（候補者を行・項目を列）。列ヘッダクリックでソート、行クリックで根拠・コメントを展開。
        <span className="text-emerald-700 font-medium">緑</span>＝列内最高値、
        <span className="text-red-700 font-medium">赤</span>＝最低値。
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs">
            <tr>
              <Th onClick={() => toggleSort("name")} ariaSort={ariaSortOf("name")} className="text-left min-w-[180px] sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-muted z-10">
                候補者 {sortMark("name")}
              </Th>
              <Th onClick={() => toggleSort("role")} ariaSort={ariaSortOf("role")} className="text-left min-w-[100px]">
                役割 {sortMark("role")}
              </Th>
              <Th onClick={() => toggleSort("total")} ariaSort={ariaSortOf("total")} className="text-right min-w-[80px]">
                総合 {sortMark("total")}
              </Th>
              <Th onClick={() => toggleSort("weighted")} ariaSort={ariaSortOf("weighted")} className="text-right min-w-[90px]">
                重み付き {sortMark("weighted")}
              </Th>
              {axes.map((ax) => (
                <Th
                  key={ax}
                  onClick={() => toggleSort(`axis:${ax}`)}
                  ariaSort={ariaSortOf(`axis:${ax}`)}
                  className="text-right min-w-[90px]"
                >
                  {ax}
                  {axisWeights[ax] != null && (
                    <span className="ml-1 text-2xs text-muted-foreground opacity-70 font-normal">
                      ×{axisWeights[ax]}
                    </span>
                  )}{" "}
                  {sortMark(`axis:${ax}`)}
                </Th>
              ))}
              <Th onClick={() => toggleSort("self")} ariaSort={ariaSortOf("self")} className="text-right min-w-[80px]">
                自己解決 {sortMark("self")}
              </Th>
              <Th onClick={() => toggleSort("pass")} ariaSort={ariaSortOf("pass")} className="text-center min-w-[80px]">
                合否 {sortMark("pass")}
              </Th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => {
              const isExpanded = expanded.has(r.id);
              return (
                <FragmentRow
                  key={r.id}
                  row={r}
                  axes={axes}
                  passLine={passLine}
                  midLine={midLine}
                  totalsExt={totalsExt}
                  weightedExt={weightedExt}
                  selfsExt={selfsExt}
                  axisExt={axisExt}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(r.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">{rows.length} 件を比較中</div>
    </div>
  );
}

function Th({
  children,
  onClick,
  ariaSort,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaSort?: "ascending" | "descending" | "none";
  className?: string;
}) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTableCellElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }
  return (
    <th
      role="button"
      tabIndex={0}
      aria-sort={ariaSort}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`px-3 py-2 font-medium cursor-pointer hover:bg-accent select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function FragmentRow({
  row,
  axes,
  passLine,
  midLine,
  totalsExt,
  weightedExt,
  selfsExt,
  axisExt,
  expanded,
  onToggle,
}: {
  row: TransposedRow;
  axes: string[];
  passLine: number;
  midLine: number;
  totalsExt: ReturnType<typeof bestWorst>;
  weightedExt: ReturnType<typeof bestWorst>;
  selfsExt: ReturnType<typeof bestWorst>;
  axisExt: Record<string, ReturnType<typeof bestWorst>>;
  expanded: boolean;
  onToggle: () => void;
}) {
  function numCell(
    v: number | null,
    ext: ReturnType<typeof bestWorst>,
    digits = 1,
    align: "left" | "right" = "right",
  ) {
    if (v == null) {
      return (
        <td className={`px-3 py-2 text-${align} text-muted-foreground opacity-70`}>―</td>
      );
    }
    const isBest = v === ext.best && ext.best !== ext.worst;
    const isWorst = v === ext.worst && ext.best !== ext.worst;
    const cls = isBest
      ? "text-emerald-700"
      : isWorst
        ? "text-red-700"
        : scoreColor(v, passLine, midLine);
    return (
      <td className={`px-3 py-2 text-${align} tabular font-semibold ${cls}`}>
        {v.toFixed(digits)}
      </td>
    );
  }

  function axisCell(axis: string) {
    const v = row.axes[axis] ?? null;
    const ext = axisExt[axis];
    if (v == null) {
      return (
        <td key={axis} className="px-3 py-2 text-right text-muted-foreground opacity-70">
          ―
        </td>
      );
    }
    const isBest = v === ext.best && ext.best !== ext.worst;
    const isWorst = v === ext.worst && ext.best !== ext.worst;
    const cls = isBest
      ? "text-emerald-700"
      : isWorst
        ? "text-red-700"
        : scoreColor(v, passLine, midLine);
    return (
      <td key={axis} className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5 justify-end">
          <span className={`tabular font-semibold ${cls}`}>{v.toFixed(1)}</span>
          <div className="h-1 bg-muted rounded overflow-hidden w-12">
            <div
              className={`h-full ${barColor(v, passLine, midLine)}`}
              style={{ width: `${Math.min(100, (v / 5) * 100)}%` }}
            />
          </div>
        </div>
      </td>
    );
  }

  return (
    <>
      <tr
        className="hover:bg-accent cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card z-10">
          <Link
            href={`/sessions/${encodeURIComponent(row.id)}`}
            className="font-medium text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name}
          </Link>
          <div className="text-2xs text-muted-foreground opacity-70 tabular">{row.id}</div>
        </td>
        <td className="px-3 py-2">
          <span className={rolePillClass(row.role)}>{row.role}</span>
        </td>
        {numCell(row.total, totalsExt, 1)}
        {numCell(row.weighted, weightedExt, 2)}
        {axes.map((ax) => axisCell(ax))}
        <td className="px-3 py-2 text-right tabular">
          {row.self == null ? (
            <span className="text-muted-foreground opacity-70">―</span>
          ) : (
            <span
              className={
                row.self === selfsExt.best && selfsExt.best !== selfsExt.worst
                  ? "text-emerald-700 font-semibold"
                  : row.self === selfsExt.worst &&
                      selfsExt.best !== selfsExt.worst
                    ? "text-red-700 font-semibold"
                    : ""
              }
            >
              {row.self}
              <span className="text-xs text-muted-foreground opacity-70"> / 5</span>
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-center">{passingPill(row.pass)}</td>
        <td className="px-2 py-2 text-center text-muted-foreground opacity-70 text-xs select-none">
          {expanded ? "▼" : "▶"}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/50">
          <td colSpan={6 + axes.length} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
              <div>
                <div className="text-muted-foreground font-medium mb-1">良い点</div>
                <div className="text-foreground/85">
                  {row.good || <span className="text-muted-foreground opacity-70">―</span>}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground font-medium mb-1">懸念点</div>
                <div className="text-foreground/85">
                  {row.concern || <span className="text-muted-foreground opacity-70">―</span>}
                </div>
              </div>
              {axes.map((ax) => {
                const rationale = row.axisRationale[ax];
                if (!rationale) return null;
                return (
                  <div key={ax} className="md:col-span-2">
                    <div className="text-muted-foreground font-medium mb-1">
                      {ax} の根拠
                    </div>
                    <div className="text-foreground/85">{rationale}</div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function bestWorst(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return { best: null as number | null, worst: null as number | null };
  return { best: Math.max(...nums), worst: Math.min(...nums) };
}
