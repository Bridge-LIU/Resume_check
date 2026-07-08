"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  MoreHorizontal,
  Layers,
  Sparkles,
  X,
} from "lucide-react";

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

function cc(color: Category["color"]) {
  return color === "emerald"
    ? {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-500/10",
        bar: "bg-emerald-500",
        soft: "bg-emerald-100 dark:bg-emerald-500/20",
        border: "border-emerald-300 dark:border-emerald-500/40",
        chip: "bg-emerald-500 text-white",
      }
    : {
        text: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-50 dark:bg-blue-500/10",
        bar: "bg-blue-500",
        soft: "bg-blue-100 dark:bg-blue-500/20",
        border: "border-blue-300 dark:border-blue-500/40",
        chip: "bg-blue-500 text-white",
      };
}

function W({ value }: { value: number }) {
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

function WeightPill({ w }: { w: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 border border-border">
      重み <span className="tabular-nums font-medium text-foreground">{w}</span>
    </span>
  );
}

/* ────────── ページ本体 ────────── */

export function EvalMasterVariantsV2() {
  const [cats] = useState<Category[]>(INITIAL);
  const variants: { no: number; title: string; hint: string; render: ReactNode }[] = [
    { no: 11, title: "Excel 風 colspan 表", hint: "案 3 を密にした版。大分類重みも表内に持つ", render: <V11 cats={cats} /> },
    { no: 12, title: "rowspan 縦統合表", hint: "1 列目に大分類を rowspan で。縦に読める業務表", render: <V12 cats={cats} /> },
    { no: 13, title: "展開可能テーブル", hint: "大分類行をクリックで小軸行が展開。表 + アコーディオン", render: <V13 cats={cats} /> },
    { no: 14, title: "Notion 風 Database", hint: "Group by 大分類 のデータベース風。件数バッジ付き", render: <V14 cats={cats} /> },
    { no: 15, title: "カード + 罫線 mini 表", hint: "案 1 の外枠 + 表本文。印刷しても見やすい", render: <V15 cats={cats} /> },
    { no: 16, title: "セクション + 3 列タイル", hint: "見出しの下に小軸を並べたタイル。カード寄りだが密", render: <V16 cats={cats} /> },
    { no: 17, title: "フォルダアイコンツリー", hint: "案 8 を GitHub 風に。開閉状態でアイコンが変化", render: <V17 cats={cats} /> },
    { no: 18, title: "インデント表（ツリー + 表）", hint: "案 8 と案 3 のハイブリッド。表なのに階層が読める", render: <V18 cats={cats} /> },
    { no: 19, title: "カード外枠 + ツリー本文", hint: "案 1 の外側 + 案 8 の内側。カラフルな階層感", render: <V19 cats={cats} /> },
    { no: 20, title: "マスタ・詳細（サイドバー）", hint: "左に大分類ナビ、右に小軸表。項目が増えても崩れない", render: <V20 cats={cats} /> },
  ];

  return (
    <div className="space-y-8">
      <header className="bg-card rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-blue-600" aria-hidden />
          <h1 className="font-bold text-lg">評価条件マスタ（BARS）— UI 案 11〜20</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          気に入った候補 1 / 3 / 8（カード・ネスト表・ツリー）の延長 10 案です。ダミーデータ・見た目のみ。
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

/* ────────── 案 11: Excel 風 colspan 表 ────────── */

function V11({ cats }: { cats: Category[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-2 border-border">
        <thead>
          <tr>
            {cats.map((c) => {
              const s = cc(c.color);
              return (
                <th
                  key={c.name}
                  colSpan={c.subAxes.length}
                  className={`px-3 py-2 text-center font-bold ${s.text} ${s.bg} border-2 border-border`}
                >
                  {c.name}
                </th>
              );
            })}
          </tr>
          <tr>
            {cats.map((c) => {
              const s = cc(c.color);
              return (
                <th
                  key={`${c.name}-w`}
                  colSpan={c.subAxes.length}
                  className={`px-3 py-1.5 text-center text-xs ${s.text} ${s.bg} border-2 border-border`}
                >
                  大分類重み <W value={c.weight} />
                </th>
              );
            })}
          </tr>
          <tr>
            {cats.flatMap((c) =>
              c.subAxes.map((s) => (
                <th
                  key={`${c.name}-${s.name}`}
                  className="px-3 py-2 text-xs text-muted-foreground bg-muted border-2 border-border"
                >
                  {s.name}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cats.flatMap((c) =>
              c.subAxes.map((s) => (
                <td key={`v-${c.name}-${s.name}`} className="px-3 py-2 text-center border-2 border-border">
                  <W value={s.weight} />
                </td>
              )),
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ────────── 案 12: rowspan 縦統合表 ────────── */

function V12({ cats }: { cats: Category[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="text-left px-3 py-2 w-40">大分類</th>
            <th className="text-center px-3 py-2 w-24">大分類重み</th>
            <th className="text-left px-3 py-2">小軸</th>
            <th className="text-center px-3 py-2 w-24">小軸重み</th>
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cats.map((c) => {
            const s = cc(c.color);
            return c.subAxes.map((sub, i) => (
              <tr key={`${c.name}-${sub.name}`} className="hover:bg-accent">
                {i === 0 && (
                  <>
                    <td
                      rowSpan={c.subAxes.length}
                      className={`px-3 py-2 align-top font-bold ${s.text} ${s.bg} border-r`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" aria-hidden />
                        {c.name}
                      </div>
                    </td>
                    <td
                      rowSpan={c.subAxes.length}
                      className={`px-3 py-2 text-center align-top ${s.bg} border-r`}
                    >
                      <W value={c.weight} />
                    </td>
                  </>
                )}
                <td className="px-3 py-2">{sub.name}</td>
                <td className="px-3 py-2 text-center">
                  <W value={sub.weight} />
                </td>
                <td className="px-2 py-2 text-center">
                  <button className="text-muted-foreground hover:text-red-600">
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────── 案 13: 展開可能テーブル ────────── */

function V13({ cats }: { cats: Category[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ 人間性: true, 技術力: true });
  return (
    <table className="w-full text-sm border rounded-lg overflow-hidden">
      <thead className="bg-muted text-muted-foreground text-xs">
        <tr>
          <th className="text-left px-3 py-2">名前</th>
          <th className="text-center px-3 py-2 w-24">重み</th>
          <th className="text-center px-3 py-2 w-20">件数</th>
          <th className="w-10 px-2 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {cats.map((c) => {
          const s = cc(c.color);
          const isOpen = !!open[c.name];
          return (
            <Fragment key={c.name}>
              <tr className={`${s.bg} cursor-pointer`} onClick={() => setOpen({ ...open, [c.name]: !isOpen })}>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 font-bold">
                    {isOpen ? (
                      <ChevronDown className={`w-4 h-4 ${s.text}`} aria-hidden />
                    ) : (
                      <ChevronRight className={`w-4 h-4 ${s.text}`} aria-hidden />
                    )}
                    <Layers className={`w-4 h-4 ${s.text}`} aria-hidden />
                    <span className={s.text}>{c.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <W value={c.weight} />
                </td>
                <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                  {c.subAxes.length}
                </td>
                <td className="px-2 py-2 text-center">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground mx-auto" aria-hidden />
                </td>
              </tr>
              {isOpen &&
                c.subAxes.map((sub) => (
                  <tr key={`${c.name}-${sub.name}`} className="hover:bg-accent">
                    <td className="pl-11 pr-3 py-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className="opacity-40">└</span>
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-foreground">{sub.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <W value={sub.weight} />
                    </td>
                    <td className="px-3 py-2 text-center">—</td>
                    <td className="px-2 py-2 text-center">
                      <button className="text-muted-foreground hover:text-red-600">
                        <X className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* ────────── 案 14: Notion 風 Database ────────── */

function V14({ cats }: { cats: Category[] }) {
  return (
    <div className="space-y-4">
      {cats.map((c) => {
        const s = cc(c.color);
        return (
          <div key={c.name}>
            <div className="flex items-center gap-2 mb-1.5 pl-1">
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${s.bg} ${s.text} text-sm font-medium`}>
                {c.name}
              </div>
              <span className="text-xs text-muted-foreground">{c.subAxes.length} 件</span>
              <div className="flex-1" />
              <WeightPill w={c.weight} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left px-3 py-1.5 font-normal w-8">#</th>
                  <th className="text-left px-3 py-1.5 font-normal">名前</th>
                  <th className="text-left px-3 py-1.5 font-normal w-32">タイプ</th>
                  <th className="text-center px-3 py-1.5 font-normal w-24">重み</th>
                </tr>
              </thead>
              <tbody>
                {c.subAxes.map((sub, i) => (
                  <tr key={sub.name} className="border-b border-border/60 hover:bg-accent">
                    <td className="px-3 py-1.5 text-muted-foreground text-xs tabular-nums">{i + 1}</td>
                    <td className="px-3 py-1.5">{sub.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
                        小軸
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <W value={sub.weight} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="text-xs text-muted-foreground hover:text-foreground pl-3 py-1.5">
              + 新規
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 15: カード + 罫線 mini 表 ────────── */

function V15({ cats }: { cats: Category[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cats.map((c) => {
        const s = cc(c.color);
        return (
          <div key={c.name} className={`rounded-lg border-2 ${s.border} overflow-hidden`}>
            <div className={`px-4 py-2.5 ${s.bg} flex items-center gap-3 border-b-2 ${s.border}`}>
              <Layers className={`w-4 h-4 ${s.text}`} aria-hidden />
              <div className={`font-bold ${s.text}`}>{c.name}</div>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">大分類重み</span>
              <W value={c.weight} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left px-3 py-1.5 font-normal">小軸</th>
                  <th className="text-center px-3 py-1.5 font-normal w-24 border-l">重み</th>
                  <th className="w-10 border-l"></th>
                </tr>
              </thead>
              <tbody>
                {c.subAxes.map((sub) => (
                  <tr key={sub.name} className="border-b border-border/60">
                    <td className="px-3 py-2">{sub.name}</td>
                    <td className="px-3 py-2 text-center border-l">
                      <W value={sub.weight} />
                    </td>
                    <td className="text-center border-l">
                      <button className="text-muted-foreground hover:text-red-600">
                        <X className="w-3.5 h-3.5 mx-auto" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-1.5 bg-muted/40">
              <button className="text-xs text-blue-600 hover:underline">＋ 小軸を追加</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 16: セクション + 3 列タイル ────────── */

function V16({ cats }: { cats: Category[] }) {
  return (
    <div className="space-y-6">
      {cats.map((c) => {
        const s = cc(c.color);
        return (
          <section key={c.name}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-1 h-5 rounded-full ${s.bar}`} aria-hidden />
              <div className={`font-bold text-lg ${s.text}`}>{c.name}</div>
              <span className="text-xs text-muted-foreground">大分類重み</span>
              <W value={c.weight} />
              <div className="flex-1" />
              <button className="text-xs text-blue-600 hover:underline">＋ 小軸を追加</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {c.subAxes.map((sub) => (
                <div
                  key={sub.name}
                  className={`border rounded-lg p-3 ${s.bg} flex items-center gap-3`}
                >
                  <div className={`w-8 h-8 rounded ${s.chip} flex items-center justify-center font-bold text-sm`}>
                    {sub.weight}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{sub.name}</div>
                    <div className="text-[10px] text-muted-foreground">小軸</div>
                  </div>
                  <button className="text-muted-foreground hover:text-red-600">
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ────────── 案 17: フォルダアイコンツリー ────────── */

function V17({ cats }: { cats: Category[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ 人間性: true, 技術力: true });
  return (
    <div className="max-w-xl text-sm">
      {cats.map((c) => {
        const s = cc(c.color);
        const isOpen = !!open[c.name];
        return (
          <div key={c.name} className="mb-1">
            <div
              className="group flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-muted cursor-pointer"
              onClick={() => setOpen({ ...open, [c.name]: !isOpen })}
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
              )}
              {isOpen ? (
                <FolderOpen className={`w-4 h-4 ${s.text}`} aria-hidden />
              ) : (
                <Folder className={`w-4 h-4 ${s.text}`} aria-hidden />
              )}
              <span className={`font-medium ${s.text}`}>{c.name}</span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs text-muted-foreground">({c.subAxes.length})</span>
              <div className="flex-1" />
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-muted-foreground">重み</span>
                <W value={c.weight} />
              </div>
            </div>
            {isOpen &&
              c.subAxes.map((sub) => (
                <div
                  key={sub.name}
                  className="group flex items-center gap-1.5 py-1 pl-8 pr-1.5 rounded hover:bg-muted"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                  <span>{sub.name}</span>
                  <div className="flex-1" />
                  <div className="opacity-60 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">重み</span>
                    <W value={sub.weight} />
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600">
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              ))}
          </div>
        );
      })}
      <button className="text-xs text-blue-600 hover:underline pl-8 pt-2">＋ 大分類を追加</button>
    </div>
  );
}

/* ────────── 案 18: インデント表（ツリー + 表） ────────── */

function V18({ cats }: { cats: Category[] }) {
  return (
    <table className="w-full text-sm border rounded-lg overflow-hidden">
      <thead className="bg-muted text-muted-foreground text-xs">
        <tr>
          <th className="text-left px-3 py-2">名前（階層）</th>
          <th className="text-center px-3 py-2 w-32">重み</th>
          <th className="text-left px-3 py-2 w-40">備考</th>
          <th className="w-10 px-2 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {cats.map((c) => {
          const s = cc(c.color);
          return (
            <Fragment key={c.name}>
              <tr className={s.bg}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-bold">
                    <Folder className={`w-4 h-4 ${s.text}`} aria-hidden />
                    <span className={s.text}>{c.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <W value={c.weight} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  大分類 · 小軸 {c.subAxes.length} 件
                </td>
                <td className="px-2 py-2 text-center">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground mx-auto" aria-hidden />
                </td>
              </tr>
              {c.subAxes.map((sub, i) => (
                <tr key={`${c.name}-${sub.name}`} className="hover:bg-accent">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 pl-6">
                      <span className="text-muted-foreground text-xs select-none">
                        {i === c.subAxes.length - 1 ? "└──" : "├──"}
                      </span>
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                      {sub.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <W value={sub.weight} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">小軸</td>
                  <td className="px-2 py-2 text-center">
                    <button className="text-muted-foreground hover:text-red-600">
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* ────────── 案 19: カード外枠 + ツリー本文 ────────── */

function V19({ cats }: { cats: Category[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cats.map((c) => {
        const s = cc(c.color);
        return (
          <div key={c.name} className={`rounded-lg border ${s.border} overflow-hidden`}>
            <div className={`px-4 py-3 ${s.bg} flex items-center gap-2 border-b ${s.border}`}>
              <Folder className={`w-4 h-4 ${s.text}`} aria-hidden />
              <div className={`font-bold ${s.text}`}>{c.name}</div>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">大分類重み</span>
              <W value={c.weight} />
            </div>
            <div className="p-4 font-mono text-sm">
              {c.subAxes.map((sub, i) => (
                <div
                  key={sub.name}
                  className="group flex items-center gap-2 py-1.5 rounded hover:bg-muted px-2"
                >
                  <span className="text-muted-foreground select-none">
                    {i === c.subAxes.length - 1 ? "└──" : "├──"}
                  </span>
                  <FileText className={`w-3.5 h-3.5 ${s.text}`} aria-hidden />
                  <span className="flex-1 font-sans">{sub.name}</span>
                  <span className="text-xs text-muted-foreground font-sans">重み</span>
                  <W value={sub.weight} />
                  <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600">
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              <button className="text-xs text-blue-600 hover:underline font-sans pl-8 pt-2">
                ＋ 小軸を追加
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── 案 20: マスタ・詳細（サイドバー） ────────── */

function V20({ cats }: { cats: Category[] }) {
  const [selected, setSelected] = useState<string>(cats[0].name);
  const active = cats.find((c) => c.name === selected)!;
  const s = cc(active.color);

  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[280px]">
      {/* 左サイドバー: 大分類ナビ */}
      <aside className="border rounded-lg p-2 bg-muted/30 space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1">
          大分類
        </div>
        {cats.map((c) => {
          const isActive = c.name === selected;
          const t = cc(c.color);
          return (
            <button
              key={c.name}
              onClick={() => setSelected(c.name)}
              className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                isActive ? `${t.bg} ${t.text} font-medium` : "hover:bg-muted text-foreground/80"
              }`}
            >
              <Folder className={`w-4 h-4 ${isActive ? t.text : "text-muted-foreground"}`} aria-hidden />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-[10px] bg-card border rounded px-1.5 py-0.5 tabular-nums text-foreground">
                {c.subAxes.length}
              </span>
            </button>
          );
        })}
        <button className="w-full text-left px-2 py-2 rounded text-xs text-muted-foreground hover:bg-muted">
          ＋ 大分類を追加
        </button>
      </aside>

      {/* 右詳細 */}
      <div className={`border rounded-lg overflow-hidden`}>
        <div className={`px-4 py-3 ${s.bg} border-b ${s.border} flex items-center gap-3`}>
          <div className={`font-bold ${s.text}`}>{active.name}</div>
          <span className="text-xs text-muted-foreground">大分類重み</span>
          <W value={active.weight} />
          <div className="flex-1" />
          <button className="text-xs text-blue-600 hover:underline">＋ 小軸を追加</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left px-4 py-1.5 font-normal">名前</th>
              <th className="text-center px-3 py-1.5 font-normal w-24">重み</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {active.subAxes.map((sub) => (
              <tr key={sub.name} className="hover:bg-accent">
                <td className="px-4 py-2 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                  {sub.name}
                </td>
                <td className="px-3 py-2 text-center">
                  <W value={sub.weight} />
                </td>
                <td className="text-center">
                  <button className="text-muted-foreground hover:text-red-600">
                    <X className="w-3.5 h-3.5 mx-auto" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
