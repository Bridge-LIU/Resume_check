"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import {
  CATEGORY_KEYS,
  type CategoryKey,
  type EvalCriteria,
  type EvalSubAxis,
  type Role,
  type RoleEvalOverride,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WEIGHT_MIN = 1;
const WEIGHT_MAX = 5;

function calcSteps(min: number, max: number, step: number): number {
  if (step <= 0) return 0;
  return Math.floor((max - min) / step) + 1;
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(n)));
}

function categoryColor(key: CategoryKey) {
  return key === "人間性"
    ? {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-500/10",
        border: "border-emerald-300 dark:border-emerald-500/40",
        bar: "bg-emerald-500",
      }
    : {
        text: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-50 dark:bg-blue-500/10",
        border: "border-blue-300 dark:border-blue-500/40",
        bar: "bg-blue-500",
      };
}

/** dnd-kit のアイテム ID。名前は編集で変わりうるので、識別は uid で行う。 */
type SubAxisItem = EvalSubAxis & { uid: string };

const DROP_ANIMATION: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

export default function EvalCriteriaEditor({
  initial,
  roles,
}: {
  initial: EvalCriteria;
  roles: Role[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EvalCriteria>(initial);
  const [items, setItems] = useState<Record<CategoryKey, SubAxisItem[]>>(() => hydrate(initial));
  const [overrides, setOverrides] = useState<Record<string, RoleEvalOverride>>(
    () => initial.ロール別 ?? {},
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findContainer(
    id: string,
    src: Record<CategoryKey, SubAxisItem[]> = items,
  ): CategoryKey | undefined {
    if ((CATEGORY_KEYS as readonly string[]).includes(id)) return id as CategoryKey;
    for (const k of CATEGORY_KEYS) {
      if (src[k].some((i) => i.uid === id)) return k;
    }
    return undefined;
  }

  const activeItem = activeId
    ? items["人間性"].find((i) => i.uid === activeId) ??
      items["技術力"].find((i) => i.uid === activeId) ??
      null
    : null;
  const activeCategory = activeId ? findContainer(activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    setItems((prev) => {
      const from = findContainer(activeIdStr, prev);
      const to = findContainer(overIdStr, prev);
      if (!from || !to || from === to) return prev;
      const item = prev[from].find((i) => i.uid === activeIdStr);
      if (!item) return prev;
      const overIsContainer = (CATEGORY_KEYS as readonly string[]).includes(overIdStr);
      const dst = prev[to];
      const dstIdx = overIsContainer ? dst.length : dst.findIndex((i) => i.uid === overIdStr);
      const nextDst = [...dst];
      nextDst.splice(dstIdx < 0 ? dst.length : dstIdx, 0, item);
      return {
        ...prev,
        [from]: prev[from].filter((i) => i.uid !== activeIdStr),
        [to]: nextDst,
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    setItems((prev) => {
      const from = findContainer(String(active.id), prev);
      const to = findContainer(String(over.id), prev);
      if (!from || !to || from !== to) return prev;
      const list = prev[from];
      const a = list.findIndex((i) => i.uid === active.id);
      const b = list.findIndex((i) => i.uid === over.id);
      if (a === -1 || b === -1 || a === b) return prev;
      return { ...prev, [from]: arrayMove(list, a, b) };
    });
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function addSubAxis(key: CategoryKey, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const dup =
      items["人間性"].some((i) => i.名前 === trimmed) ||
      items["技術力"].some((i) => i.名前 === trimmed);
    if (dup) {
      setError(`小軸「${trimmed}」は既に存在します`);
      return false;
    }
    setError(null);
    setItems((prev) => ({
      ...prev,
      [key]: [...prev[key], { uid: nextUid(), 名前: trimmed, 重み: 3 }],
    }));
    return true;
  }

  function removeSubAxis(uid: string) {
    setItems((prev) => ({
      人間性: prev["人間性"].filter((i) => i.uid !== uid),
      技術力: prev["技術力"].filter((i) => i.uid !== uid),
    }));
  }

  function renameSubAxis(uid: string, name: string) {
    setItems((prev) => {
      const out = { ...prev };
      for (const k of CATEGORY_KEYS) {
        out[k] = out[k].map((i) => (i.uid === uid ? { ...i, 名前: name } : i));
      }
      return out;
    });
  }

  function setSubAxisWeight(uid: string, w: number) {
    const clamped = clampWeight(w);
    setItems((prev) => {
      const out = { ...prev };
      for (const k of CATEGORY_KEYS) {
        out[k] = out[k].map((i) => (i.uid === uid ? { ...i, 重み: clamped } : i));
      }
      return out;
    });
  }

  function setScale(field: "最小" | "最大" | "刻み", value: number) {
    const next = { ...draft.スケール, [field]: value };
    next.段階数 = calcSteps(next.最小, next.最大, next.刻み);
    setDraft({ ...draft, スケール: next });
  }

  /* ────────── 役割別上書き（名前ベース） ────────── */

  function setOverrideSubWeight(roleId: string, axisName: string, w: number | null) {
    setOverrides((prev) => {
      const cur = prev[roleId] ?? {};
      const nextSub = { ...(cur.小軸重み ?? {}) };
      if (w == null || !Number.isFinite(w) || w <= 0) {
        delete nextSub[axisName];
      } else {
        nextSub[axisName] = clampWeight(w);
      }
      const next: RoleEvalOverride = { ...cur };
      if (Object.keys(nextSub).length > 0) next.小軸重み = nextSub;
      else delete next.小軸重み;
      const out = { ...prev };
      if (Object.keys(next).length > 0) out[roleId] = next;
      else delete out[roleId];
      return out;
    });
  }

  function setOverrideLine(roleId: string, field: "合格ライン" | "普通ライン", v: number | null) {
    setOverrides((prev) => {
      const cur = prev[roleId] ?? {};
      const next: RoleEvalOverride = { ...cur };
      if (v == null || !Number.isFinite(v)) delete next[field];
      else next[field] = v;
      const out = { ...prev };
      if (Object.keys(next).length > 0) out[roleId] = next;
      else delete out[roleId];
      return out;
    });
  }

  function clearOverride(roleId: string) {
    setOverrides((prev) => {
      const out = { ...prev };
      delete out[roleId];
      return out;
    });
  }

  /* ────────── 保存 ────────── */

  async function save() {
    setError(null);
    for (const k of CATEGORY_KEYS) {
      if (items[k].length === 0) {
        setError(`${k} に小軸が 1 つも設定されていません`);
        return;
      }
      if (items[k].some((i) => !i.名前.trim())) {
        setError(`${k} に空欄の小軸名があります`);
        return;
      }
    }
    if (draft.スケール.最大 <= draft.スケール.最小) {
      setError("スケールの最大は最小より大きい必要があります");
      return;
    }
    if (draft.スケール.刻み <= 0) {
      setError("スケールの刻みは正の数である必要があります");
      return;
    }

    // GC: マスタから消えた小軸名の override エントリを保存前に削除する
    const validNames = new Set(
      [...items["人間性"], ...items["技術力"]].map((i) => i.名前.trim()),
    );
    const cleanedOverrides: Record<string, RoleEvalOverride> = {};
    for (const [roleId, ov] of Object.entries(overrides)) {
      const next: RoleEvalOverride = {};
      if (ov.小軸重み) {
        const filtered: Record<string, number> = {};
        for (const [name, w] of Object.entries(ov.小軸重み)) {
          if (validNames.has(name)) filtered[name] = w;
        }
        if (Object.keys(filtered).length > 0) next.小軸重み = filtered;
      }
      if (typeof ov.合格ライン === "number") next.合格ライン = ov.合格ライン;
      if (typeof ov.普通ライン === "number") next.普通ライン = ov.普通ライン;
      if (Object.keys(next).length > 0) cleanedOverrides[roleId] = next;
    }

    setSaving(true);
    try {
      const payload: EvalCriteria = {
        方式: "BARS",
        人間性: {
          小軸: items["人間性"].map(({ 名前, 重み }) => ({ 名前: 名前.trim(), 重み: clampWeight(重み) })),
        },
        技術力: {
          小軸: items["技術力"].map(({ 名前, 重み }) => ({ 名前: 名前.trim(), 重み: clampWeight(重み) })),
        },
        スケール: draft.スケール,
        合格ライン: draft.合格ライン,
        普通ライン: draft.普通ライン,
        自己解決レベル: draft.自己解決レベル,
        出力: draft.出力,
        ...(Object.keys(cleanedOverrides).length > 0 ? { ロール別: cleanedOverrides } : {}),
      };
      const res = await fetch("/api/master/eval-criteria", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `保存に失敗しました (${res.status})`);
      }
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card rounded-xl border shadow-sm">
      <header className="px-6 py-3 border-b flex items-center gap-3">
        <h2 className="font-bold text-sm">評価条件マスタ（BARS）</h2>
        <span className="text-xs text-muted-foreground">
          大分類（人間性 / 技術力）のグループ配下に小軸を並べる。重みは小軸ごとに設定
        </span>
        <div className="flex-1" />
        {savedAt && (
          <span className="text-xs text-emerald-700">保存しました（{savedAt}）</span>
        )}
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </header>

      <div className="p-6 space-y-5">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* ─── 大分類 × 小軸 ─── */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="space-y-4">
            {CATEGORY_KEYS.map((key) => {
              const cc = categoryColor(key);
              const list = items[key];
              return (
                <GroupDroppable
                  key={key}
                  groupKey={key}
                  className={`relative border ${cc.border} ${cc.bg} pt-5 pb-4 px-4`}
                >
                  <div
                    className={`absolute -top-2.5 left-3 px-2 text-xs font-bold ${cc.text} bg-card inline-flex items-center gap-2 rounded`}
                  >
                    <span>{key}</span>
                    <span className="text-muted-foreground font-normal">({list.length} 件)</span>
                  </div>
                  <SortableContext
                    id={key}
                    items={list.map((i) => i.uid)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {list.map((item) => (
                        <SortablePill
                          key={item.uid}
                          item={item}
                          categoryKey={key}
                          onRename={renameSubAxis}
                          onRemove={removeSubAxis}
                          onWeight={setSubAxisWeight}
                        />
                      ))}
                      <AddInput onAdd={(n) => addSubAxis(key, n)} categoryKey={key} />
                    </div>
                  </SortableContext>
                </GroupDroppable>
              );
            })}
          </div>
          <DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeItem && activeCategory ? (
              <PillPreview item={activeItem} categoryKey={activeCategory} />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* ─── 共通既定バー ─── */}
        <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-amber-900 font-medium text-xs">共通既定</span>
          <label className="text-foreground/85 flex items-center gap-1">
            合格ライン{" "}
            <Input
              type="number"
              step="0.1"
              value={draft.合格ライン}
              onChange={(e) => setDraft({ ...draft, 合格ライン: Number(e.target.value) })}
              className="w-16 h-7 tabular text-center bg-card"
            />
          </label>
          <label className="text-foreground/85 flex items-center gap-1">
            普通ライン{" "}
            <Input
              type="number"
              step="0.1"
              value={draft.普通ライン}
              onChange={(e) => setDraft({ ...draft, 普通ライン: Number(e.target.value) })}
              className="w-16 h-7 tabular text-center bg-card"
            />
          </label>
          <span className="text-muted-foreground opacity-70 text-xs ml-auto">
            下の役割別テーブルで空欄のセルはこの値を使用
          </span>
        </div>

        {/* ─── 役割別上書き表 ─── */}
        <RoleOverrideTable
          roles={roles}
          humanAxes={items["人間性"]}
          techAxes={items["技術力"]}
          overrides={overrides}
          baseGoal={draft.合格ライン}
          basePass={draft.普通ライン}
          onSubWeight={setOverrideSubWeight}
          onGoal={(rid, v) => setOverrideLine(rid, "合格ライン", v)}
          onPass={(rid, v) => setOverrideLine(rid, "普通ライン", v)}
          onClear={clearOverride}
        />

        {/* ─── 詳細（折りたたみ） ─── */}
        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
            スケール・自己解決レベル・出力項目（詳細）
          </summary>
          <div className="mt-3 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">スケール</div>
              <div className="grid grid-cols-4 gap-3 max-w-2xl">
                <label className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">最小</div>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.スケール.最小}
                    onChange={(e) => setScale("最小", Number(e.target.value))}
                    className="w-full tabular"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">最大</div>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.スケール.最大}
                    onChange={(e) => setScale("最大", Number(e.target.value))}
                    className="w-full tabular"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">刻み</div>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.スケール.刻み}
                    onChange={(e) => setScale("刻み", Number(e.target.value))}
                    className="w-full tabular"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-xs text-muted-foreground mb-1">段階数（自動）</div>
                  <Input
                    type="number"
                    value={draft.スケール.段階数}
                    readOnly
                    className="w-full tabular bg-muted text-muted-foreground"
                  />
                </label>
              </div>
            </div>

            <label className="text-sm block max-w-xl">
              <div className="text-xs text-muted-foreground mb-1">
                自己解決レベル（説明文）
              </div>
              <Input
                value={draft.自己解決レベル}
                onChange={(e) => setDraft({ ...draft, 自己解決レベル: e.target.value })}
                className="w-full"
              />
            </label>

            <div>
              <div className="text-xs text-muted-foreground mb-2">出力項目（固定）</div>
              <div className="flex flex-wrap gap-2">
                {draft.出力.map((item) => (
                  <span
                    key={item}
                    className="inline-block bg-muted text-foreground/85 text-xs px-3 py-1 rounded-full border"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground opacity-70 mt-1">
                ※ 設計書 §6 準拠
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

/* ────────── サブ部品 ────────── */

function hydrate(c: EvalCriteria): Record<CategoryKey, SubAxisItem[]> {
  return {
    人間性: c.人間性.小軸.map((s) => ({ ...s, uid: nextUid() })),
    技術力: c.技術力.小軸.map((s) => ({ ...s, uid: nextUid() })),
  };
}

let uidSeq = 0;
function nextUid(): string {
  uidSeq += 1;
  return `sub-${Date.now().toString(36)}-${uidSeq}`;
}

function GroupDroppable({
  groupKey,
  children,
  className,
}: {
  groupKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-blue-400 ring-offset-1" : ""} transition-shadow rounded-lg`}
    >
      {children}
    </div>
  );
}

function SortablePill({
  item,
  categoryKey,
  onRename,
  onRemove,
  onWeight,
}: {
  item: SubAxisItem;
  categoryKey: CategoryKey;
  onRename: (uid: string, name: string) => void;
  onRemove: (uid: string) => void;
  onWeight: (uid: string, w: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid,
  });
  const cc = categoryColor(categoryKey);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1 bg-card border rounded-full pl-1 pr-1 py-0.5 shadow-sm ${
        isDragging ? "border-transparent shadow-none" : "border-border"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="ドラッグで並び替え / 大分類間で移動"
        aria-label={`${item.名前} を移動`}
        className="text-muted-foreground opacity-70 hover:text-blue-600 cursor-grab active:cursor-grabbing px-0.5 flex items-center touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={item.名前}
        onChange={(e) => onRename(item.uid, e.target.value)}
        className="bg-transparent text-sm border-0 outline-none focus:bg-muted focus:rounded px-1 min-w-[5rem]"
        style={{ width: `${Math.max(item.名前.length, 4)}ch` }}
      />
      <input
        type="number"
        min={WEIGHT_MIN}
        max={WEIGHT_MAX}
        step={1}
        value={item.重み}
        onChange={(e) => onWeight(item.uid, Number(e.target.value))}
        className={`w-10 h-6 text-center tabular text-xs rounded ${cc.bg} ${cc.text} border-0 focus:outline-none focus:ring-1 focus:ring-blue-400`}
        aria-label="重み"
      />
      <button
        type="button"
        onClick={() => onRemove(item.uid)}
        title="削除"
        className="text-muted-foreground opacity-70 hover:text-red-600 text-xs px-1"
      >
        ×
      </button>
    </div>
  );
}

function PillPreview({ item, categoryKey }: { item: SubAxisItem; categoryKey: CategoryKey }) {
  const cc = categoryColor(categoryKey);
  return (
    <div
      className={`inline-flex items-center gap-1 bg-card border rounded-full pl-1 pr-1 py-0.5 shadow-xl ${cc.border} rotate-2`}
      style={{ cursor: "grabbing" }}
    >
      <GripVertical className="h-3.5 w-3.5 text-blue-600" />
      <span
        className="text-sm px-1"
        style={{ minWidth: "5rem", width: `${Math.max(item.名前.length, 4)}ch` }}
      >
        {item.名前}
      </span>
      <span className={`w-10 h-6 flex items-center justify-center tabular text-xs rounded ${cc.bg} ${cc.text}`}>
        {item.重み}
      </span>
    </div>
  );
}

function AddInput({
  onAdd,
  categoryKey,
}: {
  onAdd: (name: string) => boolean;
  categoryKey: CategoryKey;
}) {
  const [text, setText] = useState("");
  const cc = categoryColor(categoryKey);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={text}
        placeholder={`＋ ${categoryKey}の軸`}
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

/* ────────── 役割別上書き表 ────────── */

function RoleOverrideTable({
  roles,
  humanAxes,
  techAxes,
  overrides,
  baseGoal,
  basePass,
  onSubWeight,
  onGoal,
  onPass,
  onClear,
}: {
  roles: Role[];
  humanAxes: SubAxisItem[];
  techAxes: SubAxisItem[];
  overrides: Record<string, RoleEvalOverride>;
  baseGoal: number;
  basePass: number;
  onSubWeight: (roleId: string, axisName: string, w: number | null) => void;
  onGoal: (roleId: string, v: number | null) => void;
  onPass: (roleId: string, v: number | null) => void;
  onClear: (roleId: string) => void;
}) {
  if (roles.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground text-sm">
        求人情報が空です。上の「求める人材条件マスタ」で役割を追加すると、ここに 1 行ずつ並びます。
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-3 flex-wrap">
        <span className="font-medium text-foreground/85">役割別上書き</span>
        <span className="opacity-70">
          空欄＝共通既定を使用（プレースホルダで予告表示）。②凍結時に反映
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-muted-foreground text-xs">
            <tr>
              <th
                rowSpan={2}
                className="text-left px-3 py-2 w-44 border-r border-border/60"
              >
                役割
              </th>
              <th
                colSpan={humanAxes.length}
                className="text-center px-2 py-1.5 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-r border-border/60"
              >
                人間性の小軸重み
              </th>
              <th
                colSpan={techAxes.length}
                className="text-center px-2 py-1.5 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border-r border-border/60"
              >
                技術力の小軸重み
              </th>
              <th
                colSpan={2}
                className="text-center px-2 py-1.5 text-amber-900 bg-amber-50 dark:bg-amber-500/10 border-r border-border/60"
              >
                判定ライン
              </th>
              <th rowSpan={2} className="w-10 px-2 py-2"></th>
            </tr>
            <tr>
              {humanAxes.map((a) => (
                <th
                  key={`h-${a.uid}`}
                  className="text-center px-2 py-1.5 font-normal bg-emerald-50/50 dark:bg-emerald-500/5"
                  title={a.名前}
                >
                  <span className="line-clamp-1">{a.名前}</span>
                </th>
              ))}
              {techAxes.map((a) => (
                <th
                  key={`t-${a.uid}`}
                  className="text-center px-2 py-1.5 font-normal bg-blue-50/50 dark:bg-blue-500/5"
                  title={a.名前}
                >
                  <span className="line-clamp-1">{a.名前}</span>
                </th>
              ))}
              <th className="text-center px-2 py-1.5 font-normal bg-amber-50/50 dark:bg-amber-500/5">
                合格
              </th>
              <th className="text-center px-2 py-1.5 font-normal bg-amber-50/50 dark:bg-amber-500/5">
                普通
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {roles.map((role) => {
              const ov = overrides[role.id];
              const hasOverride = !!ov && Object.keys(ov).length > 0;
              return (
                <tr key={role.id} className="hover:bg-accent">
                  <td className="px-3 py-2 border-r border-border/60">
                    <div className="font-medium">{role.役割}</div>
                    <div className="text-xs text-muted-foreground">{role.id}</div>
                  </td>
                  {humanAxes.map((a) => {
                    const v = ov?.小軸重み?.[a.名前];
                    return (
                      <td key={`hw-${role.id}-${a.uid}`} className="px-1 py-2 text-center">
                        <Input
                          type="number"
                          min={WEIGHT_MIN}
                          max={WEIGHT_MAX}
                          step={1}
                          value={typeof v === "number" ? v : ""}
                          placeholder={String(a.重み)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            onSubWeight(role.id, a.名前, raw === "" ? null : Number(raw));
                          }}
                          className="w-12 h-7 tabular text-center mx-auto"
                        />
                      </td>
                    );
                  })}
                  {techAxes.map((a) => {
                    const v = ov?.小軸重み?.[a.名前];
                    return (
                      <td key={`tw-${role.id}-${a.uid}`} className="px-1 py-2 text-center">
                        <Input
                          type="number"
                          min={WEIGHT_MIN}
                          max={WEIGHT_MAX}
                          step={1}
                          value={typeof v === "number" ? v : ""}
                          placeholder={String(a.重み)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            onSubWeight(role.id, a.名前, raw === "" ? null : Number(raw));
                          }}
                          className="w-12 h-7 tabular text-center mx-auto"
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-2 text-center">
                    <Input
                      type="number"
                      step="0.1"
                      value={typeof ov?.合格ライン === "number" ? ov.合格ライン : ""}
                      placeholder={String(baseGoal)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        onGoal(role.id, raw === "" ? null : Number(raw));
                      }}
                      className="w-16 h-7 tabular text-center mx-auto"
                    />
                  </td>
                  <td className="px-1 py-2 text-center border-r border-border/60">
                    <Input
                      type="number"
                      step="0.1"
                      value={typeof ov?.普通ライン === "number" ? ov.普通ライン : ""}
                      placeholder={String(basePass)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        onPass(role.id, raw === "" ? null : Number(raw));
                      }}
                      className="w-16 h-7 tabular text-center mx-auto"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {hasOverride && (
                      <button
                        type="button"
                        className="text-muted-foreground opacity-70 hover:text-red-600 text-sm"
                        onClick={() => onClear(role.id)}
                        title="この役割の上書きをクリア"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
