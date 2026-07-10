"use client";

import { useState, useTransition } from "react";
import type { ConditionsSnapshot, Role } from "@/lib/types";
import {
  freezeConditionsAction,
  reloadRoleFromMasterAction,
} from "../actions";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { Tip } from "@/ui/tooltip";
import { SectionHeaderBar } from "./SectionHeaderBar";

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
  // 凍結済からの「修正」モード切替（snapshot.role を初期値に編集）
  const [editing, setEditing] = useState(false);

  function handleFreeze(role: Role): void {
    setError(null);
    startTransition(async () => {
      try {
        await freezeConditionsAction(sessionId, role);
        setEditing(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  // マスタから役割の標準条件を取得して返す。EditableConditions が自分の state を上書きする。
  async function fetchMasterRole(): Promise<Role | null> {
    const fresh = await reloadRoleFromMasterAction(roleId);
    if (!fresh) {
      setError("マスタの取得に失敗しました");
      return null;
    }
    setError(null);
    return fresh;
  }

  // 凍結済かつ「修正」ボタン未押下：読み取り表示（F案：チップ群ヘッダー + 緑バー）
  if (snapshot && !editing) {
    const frozenShort = new Date(snapshot.frozenAt).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const isLocked = snapshot.role.編集不可 === true;
    const editButton = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="inline-flex items-center gap-1 text-xs h-7 px-2.5"
        disabled={isLocked}
        onClick={() => {
          setError(null);
          setEditing(true);
        }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
        </svg>
        修正
      </Button>
    );
    return (
      <div>
        <div className="border-l-4 border-emerald-500 bg-emerald-50/40 pl-3 pr-2 py-2 rounded-r-md mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground">② 求める人材条件</h3>
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {snapshot.role.役割}
            </span>
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
              経験 {snapshot.role.経験}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" />
              </svg>
              凍結 {frozenShort}
            </span>
            {isLocked && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 118 0v4" />
                </svg>
                編集不可
              </span>
            )}
          </div>
          {isLocked ? (
            <Tip content="この人材条件はマスタで編集不可に設定されているため修正できません">
              <span className="inline-block">{editButton}</span>
            </Tip>
          ) : (
            editButton
          )}
        </div>
        <ConditionsReadView snapshot={snapshot} />
      </div>
    );
  }

  // 凍結済の修正モード：snapshot.role を初期値に編集
  if (snapshot && editing) {
    return (
      <EditableConditions
        sessionId={sessionId}
        roleId={roleId}
        initial={snapshot.role}
        isPending={isPending}
        error={error}
        revising
        onLoadMaster={fetchMasterRole}
        onCancel={() => {
          setError(null);
          setEditing(false);
        }}
        onFreeze={handleFreeze}
      />
    );
  }

  // 未凍結：マスタを編集して初回凍結
  if (!roleMaster) {
    return (
      <div>
        <SectionHeaderBar title="② 求める人材条件" hasData={false} />
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
      onLoadMaster={fetchMasterRole}
      onFreeze={handleFreeze}
    />
  );
}

function ConditionsReadView({ snapshot }: { snapshot: ConditionsSnapshot }) {
  const { role } = snapshot;
  return (
    <div className="border rounded p-4 text-sm bg-muted space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-foreground/85">
        <div>役割: {role.役割}</div>
        <div>経験: {role.経験}</div>
        <div>
          未経験可:{" "}
          <strong className={role.未経験可 ? "text-emerald-700" : "text-red-600"}>
            {role.未経験可 ? "はい" : "いいえ"}
          </strong>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <div className="font-medium">条件①: 基本人物像（常に評価）</div>
          <ul className="list-disc list-inside text-foreground/85 text-xs mt-1 space-y-0.5">
            {role.条件1_基本人物像.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        {role.未経験可 ? (
          <div>
            <div className="font-medium">条件②: 未経験者必須</div>
            <ul className="list-disc list-inside text-foreground/85 text-xs mt-1 space-y-0.5">
              {role.条件2_未経験者必須.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <div className="font-medium text-muted-foreground opacity-70">条件②: 未経験者必須</div>
            <div className="text-xs text-muted-foreground mt-1">
              未経験可=false のため評価対象外
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableConditions({
  initial,
  isPending,
  error,
  revising = false,
  onLoadMaster,
  onCancel,
  onFreeze,
}: {
  sessionId: string;
  roleId: string;
  initial: Role;
  isPending: boolean;
  error: string | null;
  revising?: boolean;
  onLoadMaster: () => Promise<Role | null>;
  onCancel?: () => void;
  onFreeze: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(initial);
  // textarea の生テキストはここで保持し、role.条件* は正規化済みの配列だけ持つ。
  // こうしないと controlled な textarea で改行直後の空行が消えてカーソルが進めなくなる。
  const [text1, setText1] = useState(() => listToText(initial.条件1_基本人物像));
  const [text2, setText2] = useState(() => listToText(initial.条件2_未経験者必須));
  const [loadingMaster, setLoadingMaster] = useState(false);

  function updateConditions1(text: string) {
    setText1(text);
    setRole((prev) => ({ ...prev, 条件1_基本人物像: textToList(text) }));
  }
  function updateConditions2(text: string) {
    setText2(text);
    setRole((prev) => ({ ...prev, 条件2_未経験者必須: textToList(text) }));
  }

  // 役割マスタの標準値をフォームに流し込む（ページ遷移なし・フォーム state だけ書き換え）。
  async function handleLoadMaster() {
    setLoadingMaster(true);
    try {
      const fresh = await onLoadMaster();
      if (!fresh) return;
      setRole(fresh);
      setText1(listToText(fresh.条件1_基本人物像));
      setText2(listToText(fresh.条件2_未経験者必須));
    } finally {
      setLoadingMaster(false);
    }
  }

  return (
    <div>
      <SectionHeaderBar
        title="② 求める人材条件"
        hasData={false}
        extra={
          revising ? (
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              修正中
            </span>
          ) : null
        }
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLoadMaster}
          disabled={isPending || loadingMaster}
          className="inline-flex items-center gap-1 text-xs h-7 px-2.5"
        >
          <svg
            className={`w-3 h-3 ${loadingMaster ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 0115.5-6.36L21 8" />
            <polyline points="21 3 21 8 16 8" />
            <path d="M21 12a9 9 0 01-15.5 6.36L3 16" />
            <polyline points="3 21 3 16 8 16" />
          </svg>
          {loadingMaster ? "読込中…" : "役割の標準条件を読み込む"}
        </Button>
      </SectionHeaderBar>
      <div className="border rounded p-4 space-y-3 bg-muted text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-foreground/85 items-center">
          <div>
            <span className="text-muted-foreground">役割:</span> {role.役割}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">経験:</span>
            <Input
              className="h-7 text-sm bg-card w-32"
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
            className="w-full text-sm bg-card"
            rows={6}
            value={text1}
            onChange={(e) => updateConditions1(e.target.value)}
          />
          <div className="text-xs text-muted-foreground">1行1項目</div>
        </div>

        <div className={role.未経験可 ? "" : "opacity-50"}>
          <div className="font-medium mb-1">
            条件②: 未経験者必須
            {!role.未経験可 && (
              <span className="text-xs text-muted-foreground ml-2">
                （未経験可=false のため評価対象外）
              </span>
            )}
          </div>
          <Textarea
            className="w-full text-sm bg-card"
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
          {isPending
            ? revising
              ? "再凍結中…"
              : "凍結中…"
            : revising
              ? "この内容で再凍結する"
              : "この内容で凍結する"}
        </Button>
        {revising && onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {revising
            ? "再凍結しても ③質問・④面談内容には影響しません。"
            : "凍結後はマスタを変更してもこの面談には影響しません。"}
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
