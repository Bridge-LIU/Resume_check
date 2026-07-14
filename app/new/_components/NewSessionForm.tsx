"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock } from "lucide-react";
import type { Role } from "@/lib/types";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { ActionLink } from "@/ui/action-link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { validateName, validateRoleIdRef } from "@/lib/validation";
import { createSessionAction } from "../actions";

function pillClassFor(id: string): string {
  if (id === "NW") return "pill pill-role-nw";
  if (id === "Server") return "pill pill-role-sv";
  if (id === "Dev") return "pill pill-role-dev";
  if (id === "Special") return "pill pill-role-sp";
  if (id === "PMO") return "pill pill-role-pm";
  if (id === "ITSupport") return "pill pill-role-it";
  return "pill bg-secondary text-foreground/85";
}

export function NewSessionForm({ roles }: { roles: Role[] }) {
  const [roleId, setRoleId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [nameTouched, setNameTouched] = useState(false);
  const roleIds = roles.map((r) => r.id);

  const nameResult = validateName(name);
  const roleResult = validateRoleIdRef(roleId, roleIds);
  const nameError = !nameResult.ok && (nameTouched || name.length > 0) ? nameResult.error : null;
  const canSubmit = nameResult.ok && roleResult.ok;

  return (
    <form action={createSessionAction} className="p-6 space-y-5 max-w-xl">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">
          役割 <span className="text-red-500">*</span>
        </label>
        {roles.length === 0 ? (
          <div className="border rounded px-3 py-2 text-sm bg-amber-50 text-amber-800">
            求人情報が未登録です。先に{" "}
            <ActionLink asChild variant="inline">
              <Link href="/master">/master</Link>
            </ActionLink>{" "}
            で役割を作成してください。
          </div>
        ) : (
          <>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="w-full h-auto py-2">
                <SelectValue placeholder="— 選択してください —" />
              </SelectTrigger>
              {/* max-h-96 の既定を撤廃。ビューポート近くまで縦に伸ばして
                 スクロール発生を最小化する（Radix の衝突検出で自動的に画面内に収まる） */}
              <SelectContent className="max-h-[calc(100vh-8rem)]">
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <div className="flex items-center gap-2.5 min-w-0 py-0.5 w-full">
                      {/* 左: pill (固定幅) */}
                      <span
                        className={`${pillClassFor(r.id)} shrink-0 w-20 text-center`}
                      >
                        {r.id}
                      </span>
                      {/* 中央: 役割名 (2 行構成) */}
                      <div className="flex-1 min-w-0 leading-tight">
                        <div className="font-medium text-foreground truncate">
                          {r.役割 || <span className="text-muted-foreground opacity-70">（名称未設定）</span>}
                        </div>
                        <div className="text-2xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span>経験 {r.経験 || "—"}</span>
                          {r.未経験可 && (
                            <>
                              <span className="text-muted-foreground opacity-50">·</span>
                              <span className="text-emerald-700">未経験可</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* 右: 編集不可アイコン */}
                      {r.編集不可 && (
                        <Lock
                          className="w-3.5 h-3.5 text-amber-600 shrink-0"
                          aria-label="編集不可"
                        />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* shadcn の Select は内部で hidden input を出さないので、Server Action に渡すために自分で出す */}
            <input type="hidden" name="役割" value={roleId} />
          </>
        )}
        <div className="text-xs text-muted-foreground">
          役割を選ぶと ② にマスタが読み込まれ、確定後に凍結されます。
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85" htmlFor="new-session-name">
          氏名 <span className="text-red-500">*</span>
        </label>
        <Input
          id="new-session-name"
          name="氏名"
          required
          autoFocus
          placeholder="例: 山田 太郎"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          maxLength={60}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "new-session-name-error" : "new-session-name-help"}
          className={`w-full ${nameError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
        />
        {nameError ? (
          <div id="new-session-name-error" className="text-xs text-red-600">
            {nameError}
          </div>
        ) : (
          <div id="new-session-name-help" className="text-xs text-muted-foreground">
            フォルダ名と一覧表示に使われます（60文字以内・記号 / \ : * ? &quot; &lt; &gt; | は不可）。
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/list">キャンセル</Link>
        </Button>
        <div className="flex-1" />
        <Button
          type="submit"
          disabled={roles.length === 0 || !canSubmit}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          作成して開く →
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        作成 →{" "}
        <code className="bg-muted px-1 rounded">
          data/sessions/&lt;日時&gt;_&lt;氏名&gt;_&lt;役割&gt;/
        </code>{" "}
        生成 → セッション画面へ
      </div>
    </form>
  );
}
