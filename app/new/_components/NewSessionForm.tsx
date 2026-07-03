"use client";

import Link from "next/link";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateName, validateRoleIdRef } from "@/lib/validation";
import { createSessionAction } from "../actions";

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
        <label className="text-sm font-medium text-zinc-700">
          役割 <span className="text-red-500">*</span>
        </label>
        {roles.length === 0 ? (
          <div className="border rounded px-3 py-2 text-sm bg-amber-50 text-amber-800">
            役割マスタが未登録です。先に{" "}
            <Link href="/master" className="underline">
              /master
            </Link>{" "}
            で役割を作成してください。
          </div>
        ) : (
          <>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— 選択してください —" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.役割}（{r.id}） / 経験: {r.経験} / 未経験可:{" "}
                    {r.未経験可 ? "はい" : "いいえ"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* shadcn の Select は内部で hidden input を出さないので、Server Action に渡すために自分で出す */}
            <input type="hidden" name="役割" value={roleId} />
          </>
        )}
        <div className="text-xs text-zinc-500">
          役割を選ぶと ④ にマスタが読み込まれ、確定後に凍結されます。
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-700" htmlFor="new-session-name">
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
          <div id="new-session-name-help" className="text-xs text-zinc-500">
            フォルダ名と一覧表示に使われます（60文字以内・記号 / \ : * ? &quot; &lt; &gt; | は不可）。
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/">キャンセル</Link>
        </Button>
        <div className="flex-1" />
        <Button
          type="submit"
          disabled={roles.length === 0 || !canSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          作成して開く →
        </Button>
      </div>
      <div className="text-xs text-zinc-500">
        作成 →{" "}
        <code className="bg-zinc-100 px-1 rounded">
          data/sessions/&lt;日時&gt;_&lt;氏名&gt;_&lt;役割&gt;/
        </code>{" "}
        生成 → セッション画面へ
      </div>
    </form>
  );
}
