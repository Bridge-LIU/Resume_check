"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tip } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  duplicateSessionAction,
  setResultAction,
  softDeleteSessionAction,
  toggleHoldAction,
} from "../actions";

export interface RoleOption {
  id: string;
  label: string;
}

export function SessionMetaControls({
  sessionId,
  initialHold,
  initialResult,
  current氏名,
  current役割,
  availableRoles,
}: {
  sessionId: string;
  initialHold: boolean;
  initialResult: "採用" | "不採用" | "未確定";
  current氏名: string;
  current役割: string;
  availableRoles: RoleOption[];
}) {
  const [hold, setHold] = useState(initialHold);
  const [result, setResult] = useState(initialResult);
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  // 複製ダイアログ用 state
  const [dupOpen, setDupOpen] = useState(false);
  const [dup氏名, setDup氏名] = useState(current氏名);
  const [dup役割, setDup役割] = useState(current役割);
  const [dupError, setDupError] = useState<string | null>(null);

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

  function openDuplicate() {
    setDup氏名(current氏名);
    setDup役割(current役割);
    setDupError(null);
    setDupOpen(true);
  }

  function submitDuplicate() {
    const 氏名 = dup氏名.trim();
    const 役割 = dup役割.trim();
    if (!氏名) {
      setDupError("氏名を入力してください");
      return;
    }
    if (!役割) {
      setDupError("役割を選択してください");
      return;
    }
    // FS 禁止記号の事前チェック（Server 側でも弾くが先に出す）
    if (/[\\/:*?"<>|]/.test(氏名) || /[\r\n]/.test(氏名)) {
      setDupError('氏名に使えない文字が含まれています: / \\ : * ? " < > | 改行');
      return;
    }
    setDupOpen(false);
    startTransition(async () => {
      try {
        // ⚠️ 非 ASCII キー（'氏名'/'役割'）の object を Server Action に渡すと
        // Next.js 16 + Turbopack + Windows で値が Shift-JIS 化けすることがあったため、
        // 位置引数で渡している（actions.ts のコメント参照）。
        await duplicateSessionAction(sessionId, 氏名.normalize("NFC"), 役割.normalize("NFC"));
      } catch (e) {
        setDupError(e instanceof Error ? e.message : String(e));
        setDupOpen(true);
      }
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

  const roleChanged = dup役割 !== current役割;

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

      <Tip content="複製 — 氏名・役割を編集して新しい面談を作成">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={openDuplicate}
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

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>セッションを複製</AlertDialogTitle>
            <AlertDialogDescription>
              氏名・役割を編集できます。①要約と uploads/ は常に引き継ぎ、
              ④議事録・⑤評価は引き継ぎません。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="dup-name" className="text-xs text-zinc-500">
                氏名
              </Label>
              <Input
                id="dup-name"
                value={dup氏名}
                onChange={(e) => setDup氏名(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="dup-role" className="text-xs text-zinc-500">
                役割
              </Label>
              <Select value={dup役割} onValueChange={setDup役割}>
                <SelectTrigger id="dup-role" className="w-full">
                  <SelectValue placeholder="役割を選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {roleChanged && (
              <div className="text-xs border border-amber-200 bg-amber-50 text-amber-800 rounded px-3 py-2">
                ⚠ 役割を変更したため、④凍結条件と⑤質問は引き継がれません
                （元役割向けに作られているため）。複製後に④で再凍結してください。
              </div>
            )}

            {dupError && (
              <div className="text-xs border border-red-200 bg-red-50 text-red-700 rounded px-3 py-2">
                {dupError}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDupOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" onClick={submitDuplicate} disabled={isPending}>
              {isPending ? "複製中…" : "複製する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
