"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Layers, Sparkles } from "lucide-react";

/* ────────── 共通データ ────────── */

type Color = "emerald" | "blue";
type SubAxis = { id: string; name: string; weight: number };
type Group = { key: string; name: string; weight: number; color: Color; items: SubAxis[] };

const INITIAL: Group[] = [
  {
    key: "人間性",
    name: "人間性",
    weight: 5,
    color: "emerald",
    items: [
      { id: "主体性", name: "主体性", weight: 3 },
      { id: "コミュニケーション力", name: "コミュニケーション力", weight: 4 },
      { id: "学習意欲", name: "学習意欲", weight: 3 },
    ],
  },
  {
    key: "技術力",
    name: "技術力",
    weight: 5,
    color: "blue",
    items: [
      { id: "専門知識", name: "専門知識", weight: 4 },
      { id: "問題解決力", name: "問題解決力", weight: 4 },
      { id: "設計力", name: "設計力", weight: 3 },
    ],
  },
];

function colorClasses(color: Color) {
  return color === "emerald"
    ? {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-500/10",
        bar: "bg-emerald-500",
        soft: "bg-emerald-100 dark:bg-emerald-500/20",
        border: "border-emerald-300 dark:border-emerald-500/40",
        chip: "bg-emerald-500 text-white",
        amber: "bg-emerald-50 border-emerald-200",
      }
    : {
        text: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-50 dark:bg-blue-500/10",
        bar: "bg-blue-500",
        soft: "bg-blue-100 dark:bg-blue-500/20",
        border: "border-blue-300 dark:border-blue-500/40",
        chip: "bg-blue-500 text-white",
        amber: "bg-blue-50 border-blue-200",
      };
}

/* ────────── クロスコンテナ drag 状態管理 ────────── */

function useSortableGroups() {
  const [groups, setGroups] = useState<Group[]>(() => JSON.parse(JSON.stringify(INITIAL)));

  function findContainer(id: string): string | undefined {
    if (groups.some((g) => g.key === id)) return id;
    return groups.find((g) => g.items.some((i) => i.id === id))?.key;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to) return;

    if (from === to) {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.key !== from) return g;
          const a = g.items.findIndex((i) => i.id === active.id);
          const b = g.items.findIndex((i) => i.id === over.id);
          if (a === -1 || b === -1 || a === b) return g;
          return { ...g, items: arrayMove(g.items, a, b) };
        }),
      );
    } else {
      setGroups((prev) => {
        const src = prev.find((g) => g.key === from);
        const item = src?.items.find((i) => i.id === active.id);
        if (!item) return prev;
        const overIsContainer = prev.some((g) => g.key === String(over.id));
        return prev.map((g) => {
          if (g.key === from) return { ...g, items: g.items.filter((i) => i.id !== active.id) };
          if (g.key === to) {
            if (overIsContainer) return { ...g, items: [...g.items, item] };
            const idx = g.items.findIndex((i) => i.id === over.id);
            const next = [...g.items];
            next.splice(idx < 0 ? next.length : idx, 0, item);
            return { ...g, items: next };
          }
          return g;
        });
      });
    }
  }

  function addItem(groupKey: string, name: string) {
    const n = name.trim();
    if (!n) return false;
    if (groups.some((g) => g.items.some((i) => i.name === n))) return false;
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey
          ? { ...g, items: [...g.items, { id: `${groupKey}::${n}::${Date.now()}`, name: n, weight: 3 }] }
          : g,
      ),
    );
    return true;
  }

  function removeItem(id: string) {
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== id) })));
  }

  function renameItem(id: string, name: string) {
    setGroups((prev) =>
      prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === id ? { ...i, name } : i)) })),
    );
  }

  function setGroupWeight(key: string, w: number) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, weight: w } : g)));
  }

  return { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight };
}

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/* ────────── 共通 UI 部品 ────────── */

function SortablePill({
  item,
  color,
  onRename,
  onRemove,
}: {
  item: SubAxis;
  color: Color;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const cc = colorClasses(color);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1 bg-card border rounded-full pl-1 pr-1 py-0.5 shadow-sm transition-shadow ${
        isDragging ? `shadow-lg ${cc.border}` : "border-border"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="ドラッグで並び替え・移動"
        aria-label={`${item.name} を移動`}
        className="text-muted-foreground opacity-70 hover:text-blue-600 cursor-grab active:cursor-grabbing px-0.5 flex items-center touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={item.name}
        onChange={(e) => onRename(item.id, e.target.value)}
        className="bg-transparent text-sm border-0 outline-none focus:bg-muted focus:rounded px-1 min-w-[5rem]"
        style={{ width: `${Math.max(item.name.length, 4)}ch` }}
      />
      <span className={`text-[10px] rounded px-1 tabular-nums ${cc.bg} ${cc.text}`}>
        {item.weight}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        title="削除"
        className="text-muted-foreground opacity-70 hover:text-red-600 text-xs px-1"
      >
        ×
      </button>
    </div>
  );
}

function GroupDroppable({
  groupKey,
  children,
  className,
}: {
  groupKey: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${
        isOver ? "ring-2 ring-blue-400 ring-offset-1" : ""
      } transition-shadow rounded-lg`}
    >
      {children}
    </div>
  );
}

function AddInput({
  onAdd,
  placeholder,
  color,
}: {
  onAdd: (name: string) => boolean;
  placeholder: string;
  color: Color;
}) {
  const [text, setText] = useState("");
  const cc = colorClasses(color);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (onAdd(text)) setText("");
          }
        }}
        className="text-sm border rounded px-2 py-1 bg-card w-40"
      />
      <button
        type="button"
        onClick={() => onAdd(text) && setText("")}
        className={`text-xs px-2 py-1 rounded border ${cc.text} ${cc.border} hover:${cc.bg}`}
      >
        追加
      </button>
    </span>
  );
}

function GroupWeight({
  weight,
  color,
  onChange,
}: {
  weight: number;
  color: Color;
  onChange: (w: number) => void;
}) {
  const cc = colorClasses(color);
  return (
    <label className={`text-xs flex items-center gap-1 ${cc.text}`}>
      大分類重み
      <input
        type="number"
        min={1}
        max={5}
        value={weight}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-12 h-7 text-center tabular-nums text-sm border rounded bg-card"
      />
    </label>
  );
}

/* ────────── ページ本体 ────────── */

export function EvalMasterVariantsV3() {
  const variants: { no: number; title: string; hint: string; render: ReactNode }[] = [
    { no: 21, title: "アンバーバー headers（現行踏襲）", hint: "現在の CommonDefaultBar をそのまま大分類ヘッダに", render: <V21 /> },
    { no: 22, title: "カード並列（2 大分類カード）", hint: "現行カード骨格を 2 個並列、それぞれに pill リスト", render: <V22 /> },
    { no: 23, title: "枠付き 2 セクション（fieldset 風・色付き背景）", hint: "枠の左上に大分類ラベル + emerald/blue 色帯", render: <V23 /> },
    { no: 24, title: "色帯ゾーン（左右分割）", hint: "emerald / blue の薄い色帯で視覚グルーピング", render: <V24 /> },
    { no: 25, title: "行分割（2 行 pill リスト）", hint: "現在の 1 行を 2 行に。行頭に大分類ラベルを固定", render: <V25 /> },
    { no: 26, title: "ラベルチップ + pill 群（横並び）", hint: "案 5 の親戚。大分類チップに続けて小軸 pill", render: <V26 /> },
    { no: 27, title: "上下ゾーン（縦分割）", hint: "画面横幅を活かして pill を大きく並べる", render: <V27 /> },
    { no: 28, title: "アコーディオン式（省スペース）", hint: "大分類ヘッダをクリックで展開／折り畳み", render: <V28 /> },
    { no: 29, title: "タブ切替 + サブラベル", hint: "上部タブで切替、非選択タブも drop target になる", render: <V29 /> },
    { no: 30, title: "サイドラベル + pill 群", hint: "左に縦書き風のラベル、右に pill リスト。大分類が動きにくく安定", render: <V30 /> },
  ];

  return (
    <div className="space-y-8">
      <header className="bg-card rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-blue-600" aria-hidden />
          <h1 className="font-bold text-lg">評価条件マスタ — 案 21〜30（2 大分類 + クロス drag）</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          現行 <code>/master</code> の pill / 罫線スタイルを踏襲し、人間性 / 技術力の 2 大分類に組み分けた案です。
          <strong>実際にドラッグして pill を大分類間で移動できます</strong>（各案は独立状態）。
        </p>
      </header>

      {variants.map((v) => (
        <section key={v.no} className="space-y-2">
          <div className="flex items-baseline gap-3 px-1">
            <div className="text-2xl font-bold text-blue-600 tabular-nums">{String(v.no).padStart(2, "0")}</div>
            <div className="font-bold text-lg">{v.title}</div>
            <div className="text-xs text-muted-foreground">{v.hint}</div>
          </div>
          <div className="bg-card rounded-xl border shadow-sm p-6">{v.render}</div>
        </section>
      ))}
    </div>
  );
}

/* ────────── 案 21: アンバーバー headers（現行踏襲） ────────── */

function V21() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <div key={g.key}>
              <div
                className={`border ${cc.border} ${cc.bg} rounded-lg px-3 py-2 flex items-center gap-4 text-sm flex-wrap mb-2`}
              >
                <span className={`font-bold text-xs ${cc.text}`}>{g.name}</span>
                <span className="text-muted-foreground opacity-50">｜</span>
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
                <span className="text-xs text-muted-foreground opacity-70">
                  下の pill をこのバーへドロップすると本大分類に所属します
                </span>
                <div className="flex-1" />
                <span className="text-[10px] text-muted-foreground">
                  {g.items.length} 件
                </span>
              </div>
              <GroupDroppable groupKey={g.key} className={`p-3 border-2 border-dashed ${cc.border} bg-card`}>
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.items.map((item) => (
                      <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                    ))}
                    <AddInput
                      onAdd={(n) => addItem(g.key, n)}
                      placeholder={`＋ ${g.name}の軸`}
                      color={g.color}
                    />
                  </div>
                </SortableContext>
              </GroupDroppable>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 22: カード並列 ────────── */

function V22() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <div key={g.key} className={`rounded-lg border ${cc.border} overflow-hidden`}>
              <div className={`px-4 py-3 ${cc.bg} flex items-center gap-2 border-b ${cc.border}`}>
                <Layers className={`w-4 h-4 ${cc.text}`} aria-hidden />
                <div className={`font-bold ${cc.text}`}>{g.name}</div>
                <span className="text-xs text-muted-foreground">({g.items.length})</span>
                <div className="flex-1" />
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
              <GroupDroppable groupKey={g.key} className="p-4 min-h-[90px]">
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.items.map((item) => (
                      <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                    ))}
                  </div>
                </SortableContext>
                <div className="mt-3">
                  <AddInput onAdd={(n) => addItem(g.key, n)} placeholder={`＋ 新しい軸`} color={g.color} />
                </div>
              </GroupDroppable>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 23: 枠付き 2 セクション（fieldset 風） ────────── */

function V23() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <GroupDroppable
              key={g.key}
              groupKey={g.key}
              className={`relative border ${cc.border} ${cc.bg} pt-5 pb-4 px-4`}
            >
              <div
                className={`absolute -top-2.5 left-3 px-2 text-xs font-bold ${cc.text} bg-card inline-flex items-center gap-2 rounded`}
              >
                <span>{g.name}</span>
                <span className="text-muted-foreground font-normal">
                  ({g.items.length} 件)
                </span>
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
              <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap items-center gap-2">
                  {g.items.map((item) => (
                    <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                  ))}
                  <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                </div>
              </SortableContext>
            </GroupDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 24: 色帯ゾーン（左右分割） ────────── */

function V24() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <GroupDroppable key={g.key} groupKey={g.key} className={`${cc.bg} p-4 min-h-[140px]`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-1 h-5 rounded-full ${cc.bar}`} aria-hidden />
                <div className={`font-bold ${cc.text}`}>{g.name}</div>
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
              <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap items-center gap-2">
                  {g.items.map((item) => (
                    <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                  ))}
                  <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                </div>
              </SortableContext>
            </GroupDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 25: 行分割（2 行 pill リスト） ────────── */

function V25() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="divide-y border rounded-lg overflow-hidden">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <GroupDroppable key={g.key} groupKey={g.key} className="flex items-start gap-3 p-3">
              <div className={`w-32 shrink-0 pt-1`}>
                <div className={`font-bold text-sm ${cc.text} flex items-center gap-1.5`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cc.bar}`} aria-hidden />
                  {g.name}
                </div>
                <div className="mt-1">
                  <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
                </div>
              </div>
              <div className={`flex-1 border-l-2 ${cc.border} pl-3 min-h-[42px]`}>
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.items.map((item) => (
                      <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                    ))}
                    <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                  </div>
                </SortableContext>
              </div>
            </GroupDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 26: ラベルチップ + pill 群 ────────── */

function V26() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <GroupDroppable key={g.key} groupKey={g.key} className="min-h-[42px]">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className={`px-3 py-1.5 rounded-full font-bold text-sm shadow-sm ${cc.chip} inline-flex items-center gap-2`}
                >
                  {g.name}
                  <span className="opacity-80 text-xs">×{g.weight}</span>
                </div>
                <span className="text-muted-foreground text-xs mr-1">→</span>
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                  {g.items.map((item) => (
                    <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                  ))}
                </SortableContext>
                <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                <div className="flex-1" />
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
            </GroupDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 27: 上下ゾーン（縦分割・大画面向け） ────────── */

function V27() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <div key={g.key}>
              <div className={`flex items-center gap-3 mb-2 pb-2 border-b ${cc.border}`}>
                <div className={`text-lg font-bold ${cc.text}`}>{g.name}</div>
                <span className="text-xs text-muted-foreground">({g.items.length})</span>
                <div className="flex-1" />
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
              <GroupDroppable groupKey={g.key} className={`${cc.bg} rounded-lg p-4 min-h-[80px]`}>
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={rectSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.items.map((item) => (
                      <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                    ))}
                    <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                  </div>
                </SortableContext>
              </GroupDroppable>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 28: アコーディオン式（省スペース） ────────── */

function V28() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  const [open, setOpen] = useState<Record<string, boolean>>({ 人間性: true, 技術力: true });
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-2">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          const isOpen = !!open[g.key];
          return (
            <div key={g.key} className={`border ${cc.border} rounded-lg overflow-hidden`}>
              <button
                type="button"
                onClick={() => setOpen({ ...open, [g.key]: !isOpen })}
                className={`w-full ${cc.bg} px-3 py-2 flex items-center gap-2 text-left`}
              >
                {isOpen ? (
                  <ChevronDown className={`w-4 h-4 ${cc.text}`} aria-hidden />
                ) : (
                  <ChevronRight className={`w-4 h-4 ${cc.text}`} aria-hidden />
                )}
                <span className={`font-bold ${cc.text}`}>{g.name}</span>
                <span className="text-xs text-muted-foreground">({g.items.length})</span>
                <div className="flex-1" />
                <div onClick={(e) => e.stopPropagation()}>
                  <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
                </div>
              </button>
              {isOpen && (
                <GroupDroppable groupKey={g.key} className="p-3 min-h-[70px]">
                  <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap items-center gap-2">
                      {g.items.map((item) => (
                        <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                      ))}
                      <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                    </div>
                  </SortableContext>
                </GroupDroppable>
              )}
              {!isOpen && (
                <GroupDroppable groupKey={g.key} className="px-3 py-1.5 text-xs text-muted-foreground">
                  折り畳み中もこの領域に pill をドロップすると本大分類に追加されます
                </GroupDroppable>
              )}
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

/* ────────── 案 29: タブ切替 + サブラベル ────────── */

function V29() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  const [tab, setTab] = useState<string>(groups[0]?.key ?? "");
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div>
        <div className="flex items-end gap-2 border-b mb-3">
          {groups.map((g) => {
            const cc = colorClasses(g.color);
            const active = tab === g.key;
            return (
              <GroupDroppable key={g.key} groupKey={g.key} className="">
                <button
                  type="button"
                  onClick={() => setTab(g.key)}
                  className={`px-4 py-2 border-b-2 -mb-px text-sm ${
                    active
                      ? `${cc.text} ${cc.border} font-bold ${cc.bg}`
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${cc.bar}`} aria-hidden />
                    {g.name}
                    <span className="text-[10px] bg-card border rounded px-1.5 py-0.5 tabular-nums text-foreground">
                      {g.items.length}
                    </span>
                  </span>
                </button>
              </GroupDroppable>
            );
          })}
          <div className="flex-1" />
          {groups
            .filter((g) => g.key === tab)
            .map((g) => (
              <div key={g.key} className="pb-2">
                <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
              </div>
            ))}
        </div>
        {groups
          .filter((g) => g.key === tab)
          .map((g) => (
            <GroupDroppable key={g.key} groupKey={g.key} className="min-h-[80px] p-2">
              <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap items-center gap-2">
                  {g.items.map((item) => (
                    <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                  ))}
                  <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                </div>
              </SortableContext>
              <div className="text-xs text-muted-foreground mt-2">
                💡 pill を上のタブへドラッグすると、その大分類へ移動します
              </div>
            </GroupDroppable>
          ))}
      </div>
    </DndContext>
  );
}

/* ────────── 案 30: サイドラベル + pill 群 ────────── */

function V30() {
  const { groups, handleDragEnd, addItem, removeItem, renameItem, setGroupWeight } = useSortableGroups();
  const sensors = useDndSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {groups.map((g) => {
          const cc = colorClasses(g.color);
          return (
            <GroupDroppable key={g.key} groupKey={g.key} className="flex overflow-hidden border rounded-lg">
              <div className={`w-16 shrink-0 ${cc.chip} flex flex-col items-center justify-center py-3`}>
                <div className="font-bold text-sm tracking-wider" style={{ writingMode: "vertical-rl" }}>
                  {g.name}
                </div>
                <div className="text-[10px] mt-2 opacity-90">×{g.weight}</div>
              </div>
              <div className="flex-1 p-3">
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="text-muted-foreground">{g.items.length} 件</span>
                  <div className="flex-1" />
                  <GroupWeight weight={g.weight} color={g.color} onChange={(w) => setGroupWeight(g.key, w)} />
                </div>
                <SortableContext id={g.key} items={g.items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.items.map((item) => (
                      <SortablePill key={item.id} item={item} color={g.color} onRename={renameItem} onRemove={removeItem} />
                    ))}
                    <AddInput onAdd={(n) => addItem(g.key, n)} placeholder="＋ 軸" color={g.color} />
                  </div>
                </SortableContext>
              </div>
            </GroupDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}
