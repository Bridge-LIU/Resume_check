"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  Sparkles,
  X,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/* ────────── ダミーデータ ────────── */

type SubAxis = { name: string; weight: number };
type Category = { name: string; weight: number; color: "emerald" | "blue"; subAxes: SubAxis[] };

const INITIAL: Category[] = [
  {
    name: "人間性",
    weight: 5,
    color: "emerald",
    subAxes: [
      { name: "主体性", weight: 3 },
      { name: "コミュニケーション力", weight: 4 },
      { name: "学習意欲", weight: 3 },
    ],
  },
  {
    name: "技術力",
    weight: 5,
    color: "blue",
    subAxes: [
      { name: "専門知識", weight: 4 },
      { name: "問題解決力", weight: 4 },
      { name: "設計力", weight: 3 },
    ],
  },
];

/* ────────── ページ本体 ────────── */

export function EvalMasterVariants() {
  const [cats] = useState<Category[]>(INITIAL);

  const variants: { no: number; title: string; hint: string; render: ReactNode }[] = [
    { no: 1, title: "カード並列（Card Duo）", hint: "2 大分類を並列カードで並べる。最短で導入できる", render: <V1_CardDuo cats={cats} /> },
    { no: 2, title: "パネル分割（Split Panels）", hint: "画面幅を大分類で二分し、色でグループ視認性を最大化", render: <V2_SplitPanels cats={cats} /> },
    { no: 3, title: "ネストテーブル（Nested Table）", hint: "行=大分類/小軸の 2 段ヘッダ表。役割別重み表と親和", render: <V3_NestedTable cats={cats} /> },
    { no: 4, title: "アコーディオン（Accordion）", hint: "大分類を折り畳み。小軸が多いときにスッキリ", render: <V4_Accordion cats={cats} /> },
    { no: 5, title: "チップクラスタ（Chip Cluster）", hint: "軽量。名前だけを見せたいマスタ的な用途", render: <V5_ChipCluster cats={cats} /> },
    { no: 6, title: "カンバン列（Kanban Columns）", hint: "縦積みで小軸を追加しやすい。並び替え前提", render: <V6_Kanban cats={cats} /> },
    { no: 7, title: "加重分布バー（Weight Bar）", hint: "重みの比を 1 本の帯で直感的に把握", render: <V7_WeightBar cats={cats} /> },
    { no: 8, title: "ツリー階層（Tree）", hint: "設定画面の伝統。開閉と細かい上書きに強い", render: <V8_Tree cats={cats} /> },
    { no: 9, title: "天秤（Balance Scale）", hint: "人間性 vs 技術力 のバランスを絵で示す。プレゼン向き", render: <V9_Balance cats={cats} /> },
    { no: 10, title: "セグメントリング（Segment Ring）", hint: "小軸重みをリング分割で可視化。ダッシュボード寄り", render: <V10_SegmentRing cats={cats} /> },
  ];

  return (
    <div className="space-y-8">
      <header className="bg-card rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-blue-600" aria-hidden />
          <h1 className="font-bold text-lg">評価条件マスタ（BARS）— UI 案 × 10</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          大分類（人間性 / 技術力）と小軸（3 つずつ）の 2 階層を表現する UI を 10 パターンで並べています。
          気に入った番号を教えてください（ダミーデータ・見た目のみ）。
        </p>
      </header>

      {variants.map((v) => (
        <section key={v.no} className="space-y-2">
          <div className="flex items-baseline gap-3 px-1">
            <div className="text-2xl font-bold text-blue-600 tabular-nums">
              {String(v.no).padStart(2, "0")}
            </div>
            <div className="font-bold text-lg">{v.title}</div>
            <div className="text-xs text-muted-foreground">{v.hint}</div>
          </div>
          <div className="bg-card rounded-xl border shadow-sm p-6">{v.render}</div>
        </section>
      ))}
    </div>
  );
}

/* ────────── 共通ヘルパー ────────── */

function colorClasses(color: Category["color"]) {
  return color === "emerald"
    ? {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-500/10",
        bar: "bg-emerald-500",
        soft: "bg-emerald-100 dark:bg-emerald-500/20",
        border: "border-emerald-300 dark:border-emerald-500/40",
        ring: "ring-emerald-300",
        chip: "bg-emerald-500 text-white",
      }
    : {
        text: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-50 dark:bg-blue-500/10",
        bar: "bg-blue-500",
        soft: "bg-blue-100 dark:bg-blue-500/20",
        border: "border-blue-300 dark:border-blue-500/40",
        ring: "ring-blue-300",
        chip: "bg-blue-500 text-white",
      };
}

function WeightPill({ w }: { w: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 border border-border">
      重み <span className="tabular-nums font-medium text-foreground">{w}</span>
    </span>
  );
}

function WeightInput({ value }: { value: number }) {
  return (
    <input
      type="number"
      min={1}
      max={5}
      defaultValue={value}
      className="w-12 h-7 text-center tabular-nums text-sm border rounded bg-card"
    />
  );
}

/* ────────── 案 1: カード並列 ────────── */

function V1_CardDuo({ cats }: { cats: Category[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cats.map((c) => {
        const cc = colorClasses(c.color);
        return (
          <div key={c.name} className={`rounded-lg border ${cc.border} overflow-hidden`}>
            <div className={`px-4 py-3 ${cc.bg} flex items-center gap-2`}>
              <Layers className={`w-4 h-4 ${cc.text}`} aria-hidden />
              <div className={`font-bold ${cc.text}`}>{c.name}</div>
              <div className="flex-1" />
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                大分類重み <WeightInput value={c.weight} />
              </label>
            </div>
            <ul className="divide-y">
              {c.subAxes.map((s) => (
                <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${cc.bar}`} aria-hidden />
                  <span className="text-sm flex-1 truncate">{s.name}</span>
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    重み <WeightInput value={s.weight} />
                  </label>
                </li>
              ))}
              <li className="px-4 py-2">
                <button className="text-xs text-blue-600 hover:underline">＋ 小軸を追加</button>
              </li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 2: パネル分割 ────────── */

function V2_SplitPanels({ cats }: { cats: Category[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 -m-6">
      {cats.map((c, i) => {
        const cc = colorClasses(c.color);
        return (
          <div key={c.name} className={`${cc.bg} p-6 ${i === 0 ? "md:border-r" : ""} border-border`}>
            <div className="flex items-baseline gap-3 mb-4">
              <div className={`text-2xl font-bold ${cc.text}`}>{c.name}</div>
              <div className="text-xs text-muted-foreground">大分類重み</div>
              <div className={`text-3xl font-bold tabular-nums ${cc.text}`}>{c.weight}</div>
            </div>
            <div className="space-y-2">
              {c.subAxes.map((s) => (
                <div
                  key={s.name}
                  className="bg-card rounded border border-border px-3 py-2 flex items-center gap-3"
                >
                  <span className="text-sm flex-1">{s.name}</span>
                  <WeightInput value={s.weight} />
                </div>
              ))}
              <button className="text-xs text-muted-foreground hover:text-foreground mt-2">
                ＋ 小軸追加
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 3: ネストテーブル ────────── */

function V3_NestedTable({ cats }: { cats: Category[] }) {
  const totalCols = cats.reduce((n, c) => n + c.subAxes.length, 0);
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        グローバル値。役割別の上書き表と同じ形にすると視線移動が減ります。
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-muted text-muted-foreground text-xs">
              {cats.map((c) => {
                const cc = colorClasses(c.color);
                return (
                  <th
                    key={c.name}
                    colSpan={c.subAxes.length}
                    className={`px-2 py-1.5 text-center ${cc.text} border-b`}
                  >
                    {c.name}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      重み{" "}
                      <span className="tabular-nums font-medium text-foreground">
                        {c.weight}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
            <tr className="bg-muted/60 text-muted-foreground text-xs">
              {cats.flatMap((c) => {
                const cc = colorClasses(c.color);
                return c.subAxes.map((s, i) => (
                  <th
                    key={`${c.name}-${s.name}`}
                    className={`px-2 py-2 text-center border-b ${cc.text}/70 ${
                      i === c.subAxes.length - 1 ? "border-r border-border" : ""
                    }`}
                  >
                    {s.name}
                  </th>
                ));
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cats.flatMap((c) =>
                c.subAxes.map((s) => (
                  <td key={`w-${c.name}-${s.name}`} className="px-2 py-2 text-center">
                    <WeightInput value={s.weight} />
                  </td>
                )),
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted-foreground">
        列数: {totalCols}（大分類 {cats.length} × 小軸 {cats[0].subAxes.length}）
      </div>
    </div>
  );
}

/* ────────── 案 4: アコーディオン ────────── */

function V4_Accordion({ cats }: { cats: Category[] }) {
  return (
    <div className="space-y-2">
      {cats.map((c, idx) => {
        const cc = colorClasses(c.color);
        return (
          <Collapsible
            key={c.name}
            defaultOpen={idx === 0}
            className={`rounded-lg border ${cc.border} bg-card`}
          >
            <CollapsibleTrigger
              className={`group w-full px-4 py-3 flex items-center gap-3 ${cc.bg} rounded-t-lg`}
            >
              <ChevronRight
                className={`w-4 h-4 ${cc.text} transition-transform group-data-[state=open]:rotate-90`}
                aria-hidden
              />
              <div className={`font-bold ${cc.text}`}>{c.name}</div>
              <div className="flex-1" />
              <div className="text-xs text-muted-foreground">小軸 {c.subAxes.length}</div>
              <WeightPill w={c.weight} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="divide-y">
                {c.subAxes.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground text-xs w-4">└</span>
                    <span className="text-sm flex-1">{s.name}</span>
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      重み <WeightInput value={s.weight} />
                    </label>
                    <button className="text-muted-foreground hover:text-red-600 text-xs">
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

/* ────────── 案 5: チップクラスタ ────────── */

function V5_ChipCluster({ cats }: { cats: Category[] }) {
  return (
    <div className="space-y-5">
      {cats.map((c) => {
        const cc = colorClasses(c.color);
        return (
          <div key={c.name} className="flex flex-wrap items-center gap-2">
            <div
              className={`px-3 py-1.5 rounded-full font-bold text-sm ${cc.chip} shadow-sm`}
            >
              {c.name} <span className="opacity-80 text-xs ml-1">×{c.weight}</span>
            </div>
            <span className="text-muted-foreground text-xs">→</span>
            {c.subAxes.map((s) => (
              <span
                key={s.name}
                className={`inline-flex items-center gap-1.5 rounded-full border ${cc.border} ${cc.bg} px-3 py-1 text-sm`}
              >
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground bg-card px-1.5 rounded border">
                  {s.weight}
                </span>
              </span>
            ))}
            <button className="text-xs text-blue-600 hover:underline">＋</button>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 6: カンバン列 ────────── */

function V6_Kanban({ cats }: { cats: Category[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cats.map((c) => {
        const cc = colorClasses(c.color);
        return (
          <div key={c.name} className={`rounded-lg border ${cc.border} ${cc.bg} p-3`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${cc.bar}`} aria-hidden />
              <div className={`font-bold ${cc.text}`}>{c.name}</div>
              <div className="flex-1" />
              <WeightPill w={c.weight} />
            </div>
            <div className="space-y-2">
              {c.subAxes.map((s) => (
                <div
                  key={s.name}
                  className="bg-card rounded-md border shadow-sm px-3 py-2 flex items-center gap-2 hover:shadow transition-shadow"
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-sm flex-1">{s.name}</span>
                  <WeightInput value={s.weight} />
                </div>
              ))}
              <button
                className={`w-full text-xs py-2 rounded border border-dashed ${cc.border} ${cc.text} hover:${cc.soft}`}
              >
                ＋ 小軸を追加
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 7: 加重分布バー ────────── */

function V7_WeightBar({ cats }: { cats: Category[] }) {
  const allSub = cats.flatMap((c) => c.subAxes.map((s) => ({ ...s, cat: c })));
  const total = allSub.reduce((n, s) => n + s.weight * s.cat.weight, 0);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground mb-2">
          小軸別 重み ×大分類重み の比率（合計 {total}）
        </div>
        <div className="flex h-8 rounded-lg overflow-hidden border">
          {allSub.map((s) => {
            const cc = colorClasses(s.cat.color);
            const pct = ((s.weight * s.cat.weight) / total) * 100;
            return (
              <div
                key={`${s.cat.name}-${s.name}`}
                className={`${cc.bar} flex items-center justify-center text-white text-[10px] px-1`}
                style={{ width: `${pct}%` }}
                title={`${s.cat.name} / ${s.name}: ${pct.toFixed(1)}%`}
              >
                {pct > 8 && `${s.name} ${pct.toFixed(0)}%`}
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cats.map((c) => {
          const cc = colorClasses(c.color);
          return (
            <div key={c.name} className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${cc.bar}`} aria-hidden />
                <div className={`font-bold text-sm ${cc.text}`}>{c.name}</div>
                <div className="flex-1" />
                <WeightPill w={c.weight} />
              </div>
              <ul className="text-sm space-y-1">
                {c.subAxes.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="flex-1">{s.name}</span>
                    <WeightInput value={s.weight} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────── 案 8: ツリー階層 ────────── */

function V8_Tree({ cats }: { cats: Category[] }) {
  return (
    <div className="font-mono text-sm max-w-2xl">
      {cats.map((c, ci) => {
        const cc = colorClasses(c.color);
        return (
          <div key={c.name} className="mb-3">
            <div className={`flex items-center gap-2 py-1.5 px-2 rounded ${cc.bg}`}>
              <ChevronDown className={`w-4 h-4 ${cc.text}`} aria-hidden />
              <Layers className={`w-4 h-4 ${cc.text}`} aria-hidden />
              <span className={`font-bold ${cc.text}`}>{c.name}</span>
              <span className="flex-1" />
              <label className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                重み <WeightInput value={c.weight} />
              </label>
            </div>
            <ul>
              {c.subAxes.map((s, si) => (
                <li key={s.name} className="flex items-center gap-1 py-1 pl-6 hover:bg-muted rounded">
                  <span className="text-muted-foreground select-none">
                    {si === c.subAxes.length - 1 ? "└──" : "├──"}
                  </span>
                  <span className="flex-1 pl-2">{s.name}</span>
                  <label className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                    重み <WeightInput value={s.weight} />
                  </label>
                </li>
              ))}
              <li className="pl-10 py-1">
                <button className="text-xs text-blue-600 hover:underline font-sans">＋ 小軸を追加</button>
              </li>
            </ul>
            {ci < cats.length - 1 && <div className="border-b my-2" />}
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 9: 天秤 ────────── */

function V9_Balance({ cats }: { cats: Category[] }) {
  const [left, right] = cats;
  const leftSum = left.subAxes.reduce((n, s) => n + s.weight, 0) * left.weight;
  const rightSum = right.subAxes.reduce((n, s) => n + s.weight, 0) * right.weight;
  const total = leftSum + rightSum;
  const tilt = ((leftSum - rightSum) / total) * 6;
  const leftCC = colorClasses(left.color);
  const rightCC = colorClasses(right.color);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center pt-6 pb-4">
        <svg viewBox="0 0 400 160" className="w-full max-w-2xl">
          <line x1="200" y1="20" x2="200" y2="140" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
          <g transform={`rotate(${tilt} 200 40)`}>
            <line x1="60" y1="40" x2="340" y2="40" stroke="currentColor" strokeWidth="3" className="text-foreground" />
            {/* left pan */}
            <line x1="80" y1="40" x2="80" y2="80" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="80" cy="90" rx="60" ry="8" className="fill-emerald-500 opacity-70" />
            <text x="80" y="94" textAnchor="middle" className="text-[10px] fill-white font-bold">
              {leftSum}
            </text>
            {/* right pan */}
            <line x1="320" y1="40" x2="320" y2="80" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="320" cy="90" rx="60" ry="8" className="fill-blue-500 opacity-70" />
            <text x="320" y="94" textAnchor="middle" className="text-[10px] fill-white font-bold">
              {rightSum}
            </text>
          </g>
          <polygon points="180,140 220,140 200,155" className="fill-muted-foreground" />
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[left, right].map((c, i) => {
          const cc = i === 0 ? leftCC : rightCC;
          return (
            <div key={c.name} className={`rounded-lg border ${cc.border} ${cc.bg} p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`font-bold ${cc.text}`}>{c.name}</div>
                <div className="flex-1" />
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  大分類重み <WeightInput value={c.weight} />
                </label>
              </div>
              <div className="space-y-1">
                {c.subAxes.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{s.name}</span>
                    <WeightInput value={s.weight} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────── 案 10: セグメントリング ────────── */

function V10_SegmentRing({ cats }: { cats: Category[] }) {
  const segments = cats.flatMap((c) => c.subAxes.map((s) => ({ ...s, cat: c })));
  const total = segments.reduce((n, s) => n + s.weight * s.cat.weight, 0);
  let acc = 0;
  const R = 70;
  const CX = 90;
  const CY = 90;
  const STROKE = 22;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
      <div className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 180 180" className="w-44 h-44">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-muted opacity-30" />
          {segments.map((s) => {
            const value = (s.weight * s.cat.weight) / total;
            const len = 2 * Math.PI * R * value;
            const gap = 2 * Math.PI * R - len;
            const offset = -2 * Math.PI * R * acc;
            acc += value;
            const stroke = s.cat.color === "emerald" ? "stroke-emerald-500" : "stroke-blue-500";
            return (
              <circle
                key={`${s.cat.name}-${s.name}`}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                strokeWidth={STROKE}
                className={stroke}
                strokeDasharray={`${len} ${gap}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${CX} ${CY})`}
                opacity={0.55 + 0.15 * (s.weight - 2)}
              />
            );
          })}
          <text x={CX} y={CY - 4} textAnchor="middle" className="text-[10px] fill-muted-foreground font-sans">
            合計重み
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" className="text-lg fill-foreground font-bold font-sans tabular-nums">
            {total}
          </text>
        </svg>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {cats.map((c) => {
          const cc = colorClasses(c.color);
          const catSum = c.subAxes.reduce((n, s) => n + s.weight, 0) * c.weight;
          return (
            <div key={c.name} className="border rounded-lg overflow-hidden">
              <div className={`px-3 py-2 ${cc.bg} flex items-center gap-2`}>
                <div className={`w-2 h-2 rounded-full ${cc.bar}`} aria-hidden />
                <div className={`font-bold text-sm ${cc.text}`}>{c.name}</div>
                <div className="flex-1" />
                <div className="text-xs text-muted-foreground">
                  合計 <span className="tabular-nums font-medium text-foreground">{catSum}</span>
                </div>
                <WeightPill w={c.weight} />
              </div>
              <ul className="divide-y text-sm">
                {c.subAxes.map((s) => {
                  const share = ((s.weight * c.weight) / total) * 100;
                  return (
                    <li key={s.name} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {share.toFixed(0)}%
                      </span>
                      <WeightInput value={s.weight} />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
