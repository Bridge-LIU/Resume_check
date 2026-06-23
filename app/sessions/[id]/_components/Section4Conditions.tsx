"use client";

import { useState, useTransition } from "react";
import type { ConditionsSnapshot, Role } from "@/lib/types";
import {
  freezeConditionsAction,
  reloadRoleFromMasterAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function Section4Conditions({
  sessionId,
  roleId,
  roleMaster,
  snapshot,
}: {
  sessionId: string;
  roleId: string;
  roleMaster: Role | null;
  snapshot: ConditionsSnapshot | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 凍結済：読み取り表示
  if (snapshot) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">
            ④ 求める人材条件{" "}
            <span className="text-xs text-emerald-700 ml-2">凍結済 ✓</span>
          </h3>
          <span className="text-xs text-zinc-400">
            凍結: {new Date(snapshot.frozenAt).toLocaleString("ja-JP")}
          </span>
        </div>
        <ConditionsReadView snapshot={snapshot} />
      </div>
    );
  }

  // 未凍結：マスタを編集して凍結
  if (!roleMaster) {
    return (
      <div>
        <h3 className="font-bold mb-2">④ 求める人材条件</h3>
        <div className="border rounded p-4 text-sm bg-amber-50 text-amber-800">
          役割「{roleId}」のマスタが見つかりません。/master で作成してください。
        </div>
      </div>
    );
  }

  return (
    <EditableConditions
      sessionId={sessionId}
      roleId={roleId}
      initial={roleMaster}
      isPending={isPending}
      error={error}
      onReload={() => {
        startTransition(async () => {
          const fresh = await reloadRoleFromMasterAction(roleId);
          if (!fresh) {
            setError("マスタの再読込に失敗しました");
            return;
          }
          // 再読込はリロードで反映（簡単のため state 持ち回しはしない）
          setError(null);
          if (typeof window !== "undefined") window.location.reload();
        });
      }}
      onFreeze={(role) => {
        setError(null);
        startTransition(async () => {
          try {
            await freezeConditionsAction(sessionId, role);
          } catch (e) {
            setError((e as Error).message);
          }
        });
      }}
    />
  );
}

function ConditionsReadView({ snapshot }: { snapshot: ConditionsSnapshot }) {
  const { role } = snapshot;
  return (
    <div className="border rounded p-4 text-sm bg-zinc-50 space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-700">
        <div>役割: {role.役割}</div>
        <div>経験: {role.経験}</div>
        <div>
          未経験可:{" "}
          <strong className={role.未経験可 ? "text-emerald-700" : "text-red-600"}>
            {role.未経験可 ? "はい" : "いいえ"}
          </strong>
        </div>
      </div>
      <div>
        <div className="font-medium">条件①: 基本人物像（常に評価）</div>
        <ul className="list-disc list-inside text-zinc-700 text-xs grid grid-cols-1 md:grid-cols-2 gap-x-4 mt-1">
          {role.条件1_基本人物像.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>
      {role.未経験可 ? (
        <div>
          <div className="font-medium">条件②: 未経験者必須</div>
          <ul className="list-disc list-inside text-zinc-700 text-xs grid grid-cols-1 md:grid-cols-2 gap-x-4 mt-1">
            {role.条件2_未経験者必須.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 pt-1">
          条件②: 未経験者必須（未経験可=false のため評価対象外）
        </div>
      )}
    </div>
  );
}

function EditableConditions({
  initial,
  isPending,
  error,
  onReload,
  onFreeze,
}: {
  sessionId: string;
  roleId: string;
  initial: Role;
  isPending: boolean;
  error: string | null;
  onReload: () => void;
  onFreeze: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(initial);
  // textarea の生テキストはここで保持し、role.条件* は正規化済みの配列だけ持つ。
  // こうしないと controlled な textarea で改行直後の空行が消えてカーソルが進めなくなる。
  const [text1, setText1] = useState(() => listToText(initial.条件1_基本人物像));
  const [text2, setText2] = useState(() => listToText(initial.条件2_未経験者必須));

  function updateConditions1(text: string) {
    setText1(text);
    setRole((prev) => ({ ...prev, 条件1_基本人物像: textToList(text) }));
  }
  function updateConditions2(text: string) {
    setText2(text);
    setRole((prev) => ({ ...prev, 条件2_未経験者必須: textToList(text) }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold">④ 求める人材条件</h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onReload}
          disabled={isPending}
        >
          マスタ再読込
        </Button>
      </div>
      <div className="border rounded p-4 space-y-3 bg-zinc-50 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-zinc-700 items-center">
          <div>
            <span className="text-zinc-500">役割:</span> {role.役割}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">経験:</span>
            <Input
              className="h-7 text-sm bg-white w-32"
              value={role.経験}
              onChange={(e) => setRole({ ...role, 経験: e.target.value })}
            />
          </div>
          <Label
            htmlFor="conditions-未経験可"
            className="flex items-center gap-2 text-sm font-normal cursor-pointer"
          >
            <Checkbox
              id="conditions-未経験可"
              checked={role.未経験可}
              onCheckedChange={(v) => setRole({ ...role, 未経験可: v === true })}
            />
            未経験可
          </Label>
        </div>

        <div>
          <div className="font-medium mb-1">条件①: 基本人物像（常に評価）</div>
          <Textarea
            className="w-full text-sm bg-white"
            rows={6}
            value={text1}
            onChange={(e) => updateConditions1(e.target.value)}
          />
          <div className="text-xs text-zinc-500">1行1項目</div>
        </div>

        <div className={role.未経験可 ? "" : "opacity-50"}>
          <div className="font-medium mb-1">
            条件②: 未経験者必須
            {!role.未経験可 && (
              <span className="text-xs text-zinc-500 ml-2">
                （未経験可=false のため評価対象外）
              </span>
            )}
          </div>
          <Textarea
            className="w-full text-sm bg-white"
            rows={4}
            value={text2}
            onChange={(e) => updateConditions2(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 mt-2">{error}</div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <Button
          type="button"
          onClick={() => onFreeze(role)}
          disabled={isPending}
        >
          {isPending ? "凍結中…" : "この内容で凍結する"}
        </Button>
        <span className="text-xs text-zinc-500">
          凍結後はマスタを変更してもこの面談には影響しません。
        </span>
      </div>
    </div>
  );
}

function textToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-・•\s]+/, "").trim())
    .filter((s) => s.length > 0);
}

function listToText(list: string[]): string {
  return list.map((s) => `- ${s}`).join("\n");
}
