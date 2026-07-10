"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Trash2 } from "lucide-react";
import type { Role } from "@/lib/types";
import {
  validateRoleMasterId,
  validateRoleName,
} from "@/lib/validation";
import { useConfirm } from "@/ui/use-confirm";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { Tip } from "@/ui/tooltip";

const EXPORT_VERSION = "1.0";

type DraftRole = Role & { _isNew?: boolean; _originalId?: string };

function pillClassFor(id: string): string {
  if (id === "NW") return "pill pill-role-nw";
  if (id === "Server") return "pill pill-role-sv";
  if (id === "Special") return "pill pill-role-sp";
  if (id === "PMO") return "pill pill-role-pm";
  if (id === "ITSupport") return "pill pill-role-it";
  return "pill bg-secondary text-foreground/85";
}

function emptyRole(): DraftRole {
  return {
    id: "",
    役割: "",
    経験: "",
    未経験可: false,
    条件1_基本人物像: [],
    条件2_未経験者必須: [],
    編集不可: false,
    _isNew: true,
  };
}

function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function arrayToLines(arr: string[]): string {
  return arr.map((s) => `- ${s}`).join("\n");
}

/** 新エラーフォーマット { ok:false, error:{code,message,hint?} } を読んで人間向け文字列に整形 */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.clone().json()) as {
      error?: { message?: string; hint?: string };
    };
    const msg = body?.error?.message?.trim() || `${fallback} (HTTP ${res.status})`;
    const hint = body?.error?.hint?.trim();
    return hint ? `${msg}\n${hint}` : msg;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export default function RolesEditor({ initialRoles }: { initialRoles: Role[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [editing, setEditing] = useState<DraftRole | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // textarea の生テキストは編集フォーム子コンポーネント側で保持し、
  // key={editingKey} で編集対象切替時に再マウントして初期化する。
  // 旧実装は useEffect 内で setText を呼び set-state-in-effect ルールに抵触していた。
  const editingKey = editing
    ? editing._isNew
      ? "__new__"
      : editing._originalId ?? editing.id
    : null;

  function beginEdit(role: Role) {
    setError(null);
    setEditing({ ...role, _originalId: role.id });
  }

  function beginNew() {
    setError(null);
    setEditing(emptyRole());
  }

  function cancel() {
    setEditing(null);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    const idResult = validateRoleMasterId(editing.id);
    if (!idResult.ok) {
      setError(idResult.error);
      return;
    }
    const nameResult = validateRoleName(editing.役割);
    if (!nameResult.ok) {
      setError(nameResult.error);
      return;
    }
    const isNew = editing._isNew;
    const idChanged = !isNew && editing._originalId && editing._originalId !== idResult.value;
    if ((isNew || idChanged) && roles.some((r) => r.id === idResult.value)) {
      setError(`ID「${idResult.value}」は既に存在します`);
      return;
    }

    const payload: Role = {
      id: idResult.value,
      役割: nameResult.value,
      経験: editing.経験.trim(),
      未経験可: editing.未経験可,
      条件1_基本人物像: editing.条件1_基本人物像,
      条件2_未経験者必須: editing.条件2_未経験者必須,
      ...(editing.編集不可 === true ? { 編集不可: true } : {}),
    };

    setError(null);
    try {
      const url = isNew
        ? "/api/master/roles"
        : `/api/master/roles/${encodeURIComponent(editing._originalId ?? editing.id)}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "保存に失敗しました"));
      }
      // 楽観更新
      setRoles((prev) => {
        if (isNew) return [...prev, payload];
        return prev.map((r) => (r.id === editing._originalId ? payload : r));
      });
      setEditing(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function exportRoles() {
    setError(null);
    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      roles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `roles_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function remove(role: Role) {
    const ok = await confirm({
      title: `役割「${role.役割}」を削除しますか？`,
      description: `ID: ${role.id}\n削除すると、この役割を使った新規面談が作成できなくなります（既存の面談は②凍結スナップショットを使うため影響なし）。`,
      confirmLabel: "削除する",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/master/roles/${encodeURIComponent(role.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readApiError(res, "削除に失敗しました"));
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (editing?._originalId === role.id) setEditing(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="bg-card rounded-xl border shadow-sm">
      <header className="px-6 py-3 border-b flex items-center gap-3">
        <h2 className="font-bold text-sm">求める人材条件マスタ（役割別）</h2>
        <span className="text-xs text-muted-foreground">{roles.length} 件</span>
        <div className="flex-1" />
        <Tip content="現在の求人情報を JSON で書き出す">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportRoles}
            disabled={roles.length === 0}
          >
            エクスポート
          </Button>
        </Tip>
        <Button
          type="button"
          onClick={beginNew}
        >
          ＋ 新規役割
        </Button>
      </header>

      <div className="p-6 space-y-4">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-line"
          >
            {error}
          </div>
        )}

        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-4 py-2 w-24">ID</th>
              <th className="text-left px-4 py-2">役割</th>
              <th className="text-left px-4 py-2 w-28">経験</th>
              <th className="text-left px-4 py-2 w-20">未経験可</th>
              <th className="text-right px-4 py-2 w-20">条件①</th>
              <th className="text-right px-4 py-2 w-20">条件②</th>
              <th className="text-center px-4 py-2 w-20">編集不可</th>
              <th className="px-4 py-2 w-40"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {roles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  求人情報がありません。右上の「＋ 新規役割」から追加してください。
                </td>
              </tr>
            )}
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-accent">
                <td className="px-4 py-2">
                  <span className={pillClassFor(r.id)}>{r.id}</span>
                </td>
                <td className="px-4 py-2 font-medium">{r.役割}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.経験 || "—"}</td>
                <td className="px-4 py-2">
                  {r.未経験可 ? (
                    <span className="text-emerald-700">はい</span>
                  ) : (
                    <span className="text-muted-foreground">いいえ</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular text-muted-foreground">
                  {r.条件1_基本人物像.length}
                </td>
<td className="px-4 py-2 text-right tabular text-muted-foreground">
                  {r.条件2_未経験者必須.length}
                </td>
                <td className="px-4 py-2 text-center">
                  {r.編集不可 ? (
                    <Tip content="編集不可：新規面談は自動凍結・修正不可">
                      <Lock className="inline-block h-4 w-4 text-amber-600" aria-label="編集不可" />
                    </Tip>
                  ) : (
                    <span className="text-muted-foreground opacity-50">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <Tip content="編集">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => beginEdit(r)}
                        aria-label={`${r.役割 || r.id} を編集`}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Tip>
                    <Tip content="削除">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => remove(r)}
                        aria-label={`${r.役割 || r.id} を削除`}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editing && editingKey && (
          <RoleEditForm
            key={editingKey}
            initial={editing}
            isPending={isPending}
            onChange={setEditing}
            onCancel={cancel}
            onSave={save}
          />
        )}
      </div>
      <ConfirmDialog />
    </section>
  );
}

/**
 * 編集フォーム本体。text1/text2 (textarea の生テキスト) を内部 state で保持する。
 * 親 RolesEditor 側で key={editingKey} を付けて、編集対象切替時に再マウントすることで
 * 初期値を新 editing から取り直す（旧 useEffect+setState 同期パターンの代替）。
 */
function RoleEditForm({
  initial,
  isPending,
  onChange,
  onCancel,
  onSave,
}: {
  initial: DraftRole;
  isPending: boolean;
  onChange: (next: DraftRole) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [text1, setText1] = useState<string>(
    arrayToLines(initial.条件1_基本人物像),
  );
  const [text2, setText2] = useState<string>(
    arrayToLines(initial.条件2_未経験者必須),
  );
  // editing 本体は親の state を直接表示・編集する（フィールドごとの onChange で親へ）。
  const editing = initial;

  return (
    <div className="border rounded-lg p-4 bg-muted space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-sm">
          {editing._isNew ? "新規役割を追加" : `編集: ${editing._originalId}`}
        </h3>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="button" onClick={onSave} disabled={isPending}>
          保存
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <label className="col-span-3 text-sm">
          <div className="text-xs text-muted-foreground mb-1">ID（ファイル名）</div>
          <Input
            value={editing.id}
            onChange={(e) => onChange({ ...editing, id: e.target.value })}
            placeholder="NW / Server など"
            className="w-full bg-card"
          />
        </label>
        <label className="col-span-6 text-sm">
          <div className="text-xs text-muted-foreground mb-1">役割名</div>
          <Input
            value={editing.役割}
            onChange={(e) => onChange({ ...editing, 役割: e.target.value })}
            placeholder="NW（ネットワーク） など"
            className="w-full bg-card"
          />
        </label>
        <label className="col-span-3 text-sm">
          <div className="text-xs text-muted-foreground mb-1">経験</div>
          <div className="relative">
            <Input
              value={editing.経験}
              onChange={(e) => onChange({ ...editing, 経験: e.target.value })}
              onBlur={(e) => {
                // 数値のみ（半角/全角対応、小数 OK）が入力されたら「年」を自動補完
                //   "1" → "1年"、"0.5" → "0.5年"、"3年以上" などはそのまま
                const raw = e.target.value.trim();
                if (!raw) return;
                if (/^[0-9０-９]+(\.[0-9０-９]+)?$/.test(raw)) {
                  onChange({ ...editing, 経験: `${raw}年` });
                }
              }}
              placeholder="1 / 0.5 / 3年以上 など"
              className="w-full bg-card pr-8"
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
              aria-hidden="true"
            >
              年
            </span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Label
          htmlFor="role-mikeiken-ka"
          className="inline-flex items-center gap-2 text-sm font-normal cursor-pointer"
        >
          <Checkbox
            id="role-mikeiken-ka"
            checked={editing.未経験可}
            onCheckedChange={(v) => onChange({ ...editing, 未経験可: v === true })}
          />
          未経験可（OFF のとき条件②は評価対象外）
        </Label>
        <Tip content="ON: 新規面談を自動凍結し、面談画面で修正不可にする">
          <Label
            htmlFor="role-uneditable"
            className="inline-flex items-center gap-2 text-sm font-normal cursor-pointer"
          >
            <Checkbox
              id="role-uneditable"
              checked={editing.編集不可 === true}
              onCheckedChange={(v) => onChange({ ...editing, 編集不可: v === true })}
            />
            <Lock className="h-3.5 w-3.5 text-amber-600" />
            編集不可（新規面談を自動凍結）
          </Label>
        </Tip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            条件①: 基本人物像（常に評価）— 1 行 1 項目（先頭の「- 」は任意）
          </div>
          <Textarea
            rows={8}
            value={text1}
            onChange={(e) => {
              const t = e.target.value;
              setText1(t);
              onChange({ ...editing, 条件1_基本人物像: linesToArray(t) });
            }}
            className="w-full bg-card font-mono"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {editing.条件1_基本人物像.length} 項目
          </div>
        </div>

        <div className={editing.未経験可 ? "" : "opacity-60"}>
          <div className="text-xs text-muted-foreground mb-1">
            条件②: 未経験者必須（未経験可=ON のときだけ評価対象）
          </div>
          <Textarea
            rows={8}
            value={text2}
            onChange={(e) => {
              const t = e.target.value;
              setText2(t);
              onChange({ ...editing, 条件2_未経験者必須: linesToArray(t) });
            }}
            className="w-full bg-card font-mono"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {editing.条件2_未経験者必須.length} 項目
          </div>
        </div>
      </div>
    </div>
  );
}
