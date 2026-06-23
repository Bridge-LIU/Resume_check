"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  duplicateSessionAction,
  setResultAction,
  softDeleteSessionAction,
  toggleHoldAction,
} from "../actions";

export function SessionMetaControls({
  sessionId,
  initialHold,
  initialResult,
}: {
  sessionId: string;
  initialHold: boolean;
  initialResult: "採用" | "不採用" | "未確定";
}) {
  const [hold, setHold] = useState(initialHold);
  const [result, setResult] = useState(initialResult);
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function handleHold(next: boolean) {
    setHold(next);
    startTransition(async () => {
      await toggleHoldAction(sessionId, next);
    });
  }

  function handleResult(r: typeof result) {
    setResult(r);
    startTransition(async () => {
      await setResultAction(sessionId, r);
    });
  }

  async function handleDuplicate() {
    const ok = await confirm({
      title: "セッションを複製しますか？",
      description:
        "②要約・④凍結条件・⑤質問・uploads/ を引き継いで新しいセッションを作成します。",
      confirmLabel: "複製する",
    });
    if (!ok) return;
    startTransition(async () => {
      await duplicateSessionAction(sessionId);
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "この面談をゴミ箱へ移動しますか？",
      description:
        "猶予期間（既定14日）内なら /trash から復元できます。\n猶予を過ぎると保存期間スイープにより完全削除されます。",
      confirmLabel: "ゴミ箱へ移動",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await softDeleteSessionAction(sessionId);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Tip
        content={
          hold
            ? "自動削除しない（有効）— 保存期間が過ぎても自動削除されません。クリックで解除"
            : "自動削除しない（無効）— 保存期間で自動削除対象。クリックで保護"
        }
      >
        <Button
          type="button"
          variant={hold ? "default" : "outline"}
          size="icon"
          className={
            hold
              ? "h-8 w-8 bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200"
              : "h-8 w-8"
          }
          onClick={() => handleHold(!hold)}
          disabled={isPending}
          aria-pressed={hold}
          aria-label={hold ? "自動削除しない（有効）" : "自動削除しない（無効）"}
        >
          {hold ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </Button>
      </Tip>

      <Select
        value={result}
        onValueChange={(v) => handleResult(v as typeof result)}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 text-xs w-28" aria-label="判定">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="未確定">未確定</SelectItem>
          <SelectItem value="採用">採用</SelectItem>
          <SelectItem value="不採用">不採用</SelectItem>
        </SelectContent>
      </Select>

      <Tip content="複製 — 同じ候補者で別ラウンドの面談を作成">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleDuplicate}
          disabled={isPending}
          aria-label="複製"
        >
          <Copy className="h-4 w-4" />
        </Button>
      </Tip>

      <Tip content="削除 — ゴミ箱へ移動（/trash から復元可能）">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="削除"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </Tip>

      <ConfirmDialog />
    </div>
  );
}
