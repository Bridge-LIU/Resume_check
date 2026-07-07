"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EvalAxis, EvalCriteria, Role, RoleEvalOverride } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** グローバル軸重みは UI 編集不可（常に 3）。役割行で上書き可能。 */
const GLOBAL_DEFAULT_WEIGHT = 3;
const WEIGHT_MIN = 1;
const WEIGHT_MAX = 5;

function calcSteps(min: number, max: number, step: number): number {
  if (step <= 0) return 0;
  return Math.floor((max - min) / step) + 1;
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return GLOBAL_DEFAULT_WEIGHT;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(n)));
}

/** 保存時にグローバル軸重みを必ず 3 に正規化（UI 上は固定表示なので drift しない想定だが防御） */
function normalizeForSave(c: EvalCriteria): EvalCriteria {
  return {
    ...c,
    評価軸: c.評価軸.map((a) => ({ ...a, 重み: GLOBAL_DEFAULT_WEIGHT })),
  };
}

export default function EvalCriteriaEditor({
  initial,
  roles,
}: {
  initial: EvalCriteria;
  roles: Role[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EvalCriteria>(initial);
  const [newAxis, setNewAxis] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setRoleOverride(roleId: string, patch: Partial<RoleEvalOverride>) {
    const current: RoleEvalOverride = draft.ロール別?.[roleId] ?? {};
    const next: RoleEvalOverride = { ...current, ...patch };
    if (next.重み && next.重み.length === 0) delete next.重み;
    const ロール別 = { ...(draft.ロール別 ?? {}), [roleId]: next };
    setDraft({ ...draft, ロール別 });
  }

  function clearRoleOverride(roleId: string) {
    const ロール別 = { ...(draft.ロール別 ?? {}) };
    delete ロール別[roleId];
    setDraft({
      ...draft,
      ロール別: Object.keys(ロール別).length > 0 ? ロール別 : undefined,
    });
  }

  function setRoleWeight(roleId: string, axisIndex: number, w: number) {
    const current =
      draft.ロール別?.[roleId]?.重み ??
      draft.評価軸.map(() => GLOBAL_DEFAULT_WEIGHT);
    const next = [...current];
    next[axisIndex] = clampWeight(w);
    setRoleOverride(roleId, { 重み: next });
  }

  function setScale(field: "最小" | "最大" | "刻み", value: number) {
    const next = { ...draft.スケール, [field]: value };
    next.段階数 = calcSteps(next.最小, next.最大, next.刻み);
    setDraft({ ...draft, スケール: next });
  }

  function addAxis() {
    const v = newAxis.trim();
    if (!v) return;
    if (draft.評価軸.some((a) => a.名前 === v)) {
      setError(`評価軸「${v}」は既に存在します`);
      return;
    }
    setError(null);
    setDraft({
      ...draft,
      評価軸: [...draft.評価軸, { 名前: v, 重み: GLOBAL_DEFAULT_WEIGHT }],
    });
    setNewAxis("");
  }

  function removeAxis(name: string) {
    setDraft({ ...draft, 評価軸: draft.評価軸.filter((a) => a.名前 !== name) });
  }

  function renameAxis(index: number, name: string) {
    setDraft({
      ...draft,
      評価軸: draft.評価軸.map((a, i) =>
        i === index ? { ...a, 名前: name } : a,
      ),
    });
  }

  function moveAxis(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= draft.評価軸.length) return;
    const next = [...draft.評価軸];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, 評価軸: next });
  }

  function reorderAxis(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    if (from >= draft.評価軸.length || to >= draft.評価軸.length) return;
    const next = [...draft.評価軸];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraft({ ...draft, 評価軸: next });
  }

  async function save() {
    setError(null);
    if (draft.評価軸.length === 0) {
      setError("評価軸は1つ以上必要です");
      return;
    }
    if (draft.評価軸.some((a) => !a.名前.trim())) {
      setError("評価軸の名前は空にできません");
      return;
    }
    const seen = new Set<string>();
    for (const a of draft.評価軸) {
      if (seen.has(a.名前)) {
        setError(`評価軸「${a.名前}」が重複しています`);
        return;
      }
      seen.add(a.名前);
    }
    if (draft.スケール.最大 <= draft.スケール.最小) {
      setError("スケールの最大は最小より大きい必要があります");
      return;
    }
    if (draft.スケール.刻み <= 0) {
      setError("スケールの刻みは正の数である必要があります");
      return;
    }

    setSaving(true);
    try {
      const payload = normalizeForSave(draft);
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
          軸は全役割共通／重み・合格ラインは役割別
        </span>
        <div className="flex-1" />
        {savedAt && (
          <span className="text-xs text-emerald-700">
            保存しました（{savedAt}）
          </span>
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

        {/* ─── ① 軸定義（pill 風、軽量エディタ） ─── */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">
            評価軸（名前と並び順のみ。重みは下の役割別表で設定）
          </div>
          <AxisPillList
            axes={draft.評価軸}
            onRename={renameAxis}
            onReorder={reorderAxis}
            onRemove={removeAxis}
          />
          <div className="flex gap-2 mt-3">
            <Input
              value={newAxis}
              onChange={(e) => setNewAxis(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAxis();
                }
              }}
              placeholder="＋ 新しい軸（例: 非技術）"
              className="flex-1 max-w-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={addAxis}>
              追加
            </Button>
          </div>
        </div>

        {/* ─── ② 共通既定（コンパクト 1 行） ─── */}
        <CommonDefaultBar
          baseGoal={draft.合格ライン}
          basePass={draft.普通ライン}
          onBaseGoal={(v) => setDraft({ ...draft, 合格ライン: v })}
          onBasePass={(v) => setDraft({ ...draft, 普通ライン: v })}
        />

        {/* ─── ③ 役割別表（既定行なし） ─── */}
        <RoleOverrideTable
          axes={draft.評価軸}
          roles={roles}
          overrides={draft.ロール別 ?? {}}
          baseGoal={draft.合格ライン}
          basePass={draft.普通ライン}
          onWeight={setRoleWeight}
          onGoal={(roleId, v) => setRoleOverride(roleId, { 合格ライン: v })}
          onPass={(roleId, v) => setRoleOverride(roleId, { 普通ライン: v })}
          onClear={clearRoleOverride}
        />

        {/* ─── ④ 詳細（折りたたみ） ─── */}
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
                onChange={(e) =>
                  setDraft({ ...draft, 自己解決レベル: e.target.value })
                }
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

/* ─────────────── 共通既定バー ─────────────── */

function CommonDefaultBar({
  baseGoal,
  basePass,
  onBaseGoal,
  onBasePass,
}: {
  baseGoal: number;
  basePass: number;
  onBaseGoal: (v: number) => void;
  onBasePass: (v: number) => void;
}) {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 flex items-center gap-4 text-sm flex-wrap">
      <span className="text-amber-900 font-medium text-xs">共通既定</span>
      <span className="text-foreground/85">
        軸重み ={" "}
        <strong className="tabular text-amber-900">
          {GLOBAL_DEFAULT_WEIGHT}
        </strong>
        <span className="text-muted-foreground opacity-70 text-xs ml-1">（固定）</span>
      </span>
      <span className="text-muted-foreground opacity-50">｜</span>
      <label className="text-foreground/85 flex items-center gap-1">
        合格ライン{" "}
        <Input
          type="number"
          step="0.1"
          value={baseGoal}
          onChange={(e) => onBaseGoal(Number(e.target.value))}
          className="w-16 h-7 tabular text-center bg-card"
        />
      </label>
      <label className="text-foreground/85 flex items-center gap-1">
        普通ライン{" "}
        <Input
          type="number"
          step="0.1"
          value={basePass}
          onChange={(e) => onBasePass(Number(e.target.value))}
          className="w-16 h-7 tabular text-center bg-card"
        />
      </label>
      <span className="text-muted-foreground opacity-70 text-xs ml-auto">
        下の役割行で空欄のセルはこの値を使用
      </span>
    </div>
  );
}

/* ─────────────── 軸 pill リスト ─────────────── */

function AxisPillList({
  axes,
  onRename,
  onReorder,
  onRemove,
}: {
  axes: EvalAxis[];
  onRename: (i: number, name: string) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (name: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // ハンドル以外のクリック（input フォーカス・×ボタン等）でドラッグ起動しないよう、8px のしきい値
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 同名 axis を許容しない前提だが、念のため index 付き ID にして衝突回避
  const ids = axes.map((a, i) => `${i}::${a.名前}`);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  if (axes.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground text-sm">
        評価軸が未設定です。下の入力欄から追加してください。
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap items-center gap-2">
          {axes.map((a, i) => (
            <SortableAxisPill
              key={ids[i]}
              id={ids[i]}
              index={i}
              axis={a}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableAxisPill({
  id,
  index,
  axis,
  onRename,
  onRemove,
}: {
  id: string;
  index: number;
  axis: EvalAxis;
  onRename: (i: number, name: string) => void;
  onRemove: (name: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
      className={`inline-flex items-center gap-1 bg-card border rounded-full px-2 py-0.5 shadow-sm transition-shadow ${
        isDragging ? "shadow-lg border-blue-400" : "border-border hover:border-border"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="ドラッグで並び替え"
        aria-label={`${axis.名前} を並び替え`}
        className="text-muted-foreground opacity-70 hover:text-blue-600 cursor-grab active:cursor-grabbing px-0.5 flex items-center touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <input
        value={axis.名前}
        onChange={(e) => onRename(index, e.target.value)}
        className="bg-transparent text-sm border-0 outline-none focus:bg-muted focus:rounded px-1 min-w-[5rem]"
        style={{ width: `${Math.max(axis.名前.length, 4)}ch` }}
      />
      <button
        type="button"
        onClick={() => onRemove(axis.名前)}
        title="削除"
        className="text-muted-foreground opacity-70 hover:text-red-600 text-xs px-1"
      >
        ×
      </button>
    </div>
  );
}

/* ─────────────── 役割別表（既定行なし） ─────────────── */

function RoleOverrideTable({
  axes,
  roles,
  overrides,
  baseGoal,
  basePass,
  onWeight,
  onGoal,
  onPass,
  onClear,
}: {
  axes: EvalAxis[];
  roles: Role[];
  overrides: Record<string, RoleEvalOverride>;
  baseGoal: number;
  basePass: number;
  onWeight: (roleId: string, axisIndex: number, w: number) => void;
  onGoal: (roleId: string, v: number) => void;
  onPass: (roleId: string, v: number) => void;
  onClear: (roleId: string) => void;
}) {
  if (axes.length === 0) {
    return null;
  }
  if (roles.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground text-sm">
        求人情報が空です。上の「求める人材条件マスタ」で役割を追加すると、ここに 1 行ずつ並びます。
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">
        役割別の重み・合格ライン
        <span className="text-muted-foreground opacity-70 ml-2">
          ※ 空欄＝共通既定を使用（プレースホルダで予告表示）。④凍結時に反映
        </span>
      </div>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="text-left px-3 py-2 w-44">役割</th>
            {axes.map((a) => (
              <th key={a.名前} className="text-center px-2 py-2">
                {a.名前}
              </th>
            ))}
            <th className="text-center px-3 py-2 w-20">合格</th>
            <th className="text-center px-3 py-2 w-20">普通</th>
            <th className="px-2 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {roles.map((role) => {
            const ov = overrides[role.id];
            const weights = ov?.重み ?? [];
            const goal = ov?.合格ライン;
            const pass = ov?.普通ライン;
            const hasOverride = !!ov && Object.keys(ov).length > 0;
            return (
              <tr key={role.id} className="hover:bg-accent">
                <td className="px-3 py-2">
                  <div className="font-medium">{role.役割}</div>
                  <div className="text-xs text-muted-foreground">{role.id}</div>
                </td>
                {axes.map((_, axisIndex) => {
                  const w = weights[axisIndex];
                  return (
                    <td key={axisIndex} className="px-2 py-2 text-center">
                      <Input
                        type="number"
                        min={WEIGHT_MIN}
                        max={WEIGHT_MAX}
                        step={1}
                        value={typeof w === "number" ? w : ""}
                        placeholder={String(GLOBAL_DEFAULT_WEIGHT)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          onWeight(role.id, axisIndex, Number(v));
                        }}
                        className="w-12 h-7 tabular text-center mx-auto"
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  <Input
                    type="number"
                    step="0.1"
                    value={typeof goal === "number" ? goal : ""}
                    placeholder={String(baseGoal)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return;
                      onGoal(role.id, Number(v));
                    }}
                    className="w-16 h-7 tabular text-center mx-auto"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <Input
                    type="number"
                    step="0.1"
                    value={typeof pass === "number" ? pass : ""}
                    placeholder={String(basePass)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return;
                      onPass(role.id, Number(v));
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
  );
}
