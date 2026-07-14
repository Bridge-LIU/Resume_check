"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Tip } from "@/ui/tooltip";
import { useConfirm } from "@/ui/use-confirm";
import type { RejectReason } from "@/lib/types";
import {
  duplicateSessionAction,
  setResultAction,
  softDeleteSessionAction,
  toggleHoldAction,
} from "../actions";
import { RejectReasonDialog } from "./RejectReasonDialog";

export interface RoleOption {
  id: string;
  label: string;
}

export function SessionMetaControls({
  sessionId,
  initialHold,
  initialResult,
  initialRejectReasons,
  initialRejectNote,
  current氏名,
  current役割,
  availableRoles,
}: {
  sessionId: string;
  initialHold: boolean;
  initialResult: "採用" | "不採用" | "未確定";
  initialRejectReasons?: RejectReason[];
  initialRejectNote?: string;
  current氏名: string;
  current役割: string;
  availableRoles: RoleOption[];
}) {
  const [hold, setHold] = useState(initialHold);
  const [result, setResult] = useState(initialResult);
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>(
    initialRejectReasons ?? [],
  );
  const [rejectNote, setRejectNote] = useState(initialRejectNote ?? "");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  /**
   * ダイアログ表示前の判定値。キャンセル時にここに戻す。
   * 「未確定 → 不採用 選択 → キャンセル」で「未確定」に戻したい。
   */
  const [prevResult, setPrevResult] = useState<typeof result>(initialResult);
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
    // 不採用 選択時は先に理由ダイアログを開き、保存はダイアログ側からトリガする。
    // optimistic に result を "不採用" にはするが、キャンセルで元に戻す。
    if (r === "不採用") {
      setPrevResult(result);
      setResult("不採用");
      setRejectDialogOpen(true);
      return;
    }

    // 採用 / 未確定 に切り替わったら理由はクリア（server 側も同じ挙動）
    setResult(r);
    setRejectReasons([]);
    setRejectNote("");
    startTransition(async () => {
      await setResultAction(sessionId, r);
    });
  }

  function handleRejectSave(reasons: RejectReason[], note: string) {
    // ダイアログ側で最低 1 つ選択チェック済みだが、念のため
    if (reasons.length === 0) return;
    setRejectReasons(reasons);
    setRejectNote(note);
    setRejectDialogOpen(false);
    startTransition(async () => {
      await setResultAction(sessionId, "不採用", reasons, note);
    });
  }

  function handleRejectCancel() {
    // キャンセル時: 「不採用 選択」自体を撤回する（server にはまだ送っていない）
    setResult(prevResult);
  }

  function openRejectEdit() {
    // 既に "不採用" のセッションで理由を編集し直したいとき
    setPrevResult("不採用"); // キャンセルしても不採用のまま
    setRejectDialogOpen(true);
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

      {/* 不採用時のみ表示: 選択された理由を pill で表示 + 編集ボタン */}
      {result === "不採用" && (
        <Tip
          content={
            rejectReasons.length > 0
              ? `不採用理由: ${rejectReasons.join(" · ")}${rejectNote ? "\n補足: " + rejectNote : ""}`
              : "不採用理由が未記入です。クリックで記入"
          }
        >
          <button
            type="button"
            onClick={openRejectEdit}
            disabled={isPending}
            className={
              "h-8 text-xs px-2 rounded border transition " +
              (rejectReasons.length > 0
                ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                : "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100")
            }
            aria-label="不採用理由を編集"
          >
            {rejectReasons.length === 0
              ? "⚠ 理由未記入"
              : rejectReasons.length === 1
                ? rejectReasons[0]
                : `${rejectReasons[0]} +${rejectReasons.length - 1}`}
          </button>
        </Tip>
      )}

      <Tip content="別の役割で再エントリー — 履歴書と①要約はそのまま引き継ぎます">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={openDuplicate}
          disabled={isPending}
          aria-label="別の役割で再エントリー"
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

      <RejectReasonDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        initialReasons={rejectReasons}
        initialNote={rejectNote}
        onCancel={handleRejectCancel}
        onSave={handleRejectSave}
        saving={isPending}
      />

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>別の役割で再エントリー</AlertDialogTitle>
            <AlertDialogDescription>
              同じ候補者を別の役割で新しく面談する用途です。
              履歴書（uploads/）と①要約はそのまま引き継ぎます。
              ④面談内容・⑤評価は毎回作り直します。
              役割を変更した場合は②凍結条件・③質問も新規（別役割用のため）。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="dup-name" className="text-xs text-muted-foreground">
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
              <Label htmlFor="dup-role" className="text-xs text-muted-foreground">
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
                ⚠ 役割を変更したため、②凍結条件と③質問は引き継がれません
                （元役割向けに作られているため）。作成後に②で再凍結してください。
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
              {isPending ? "作成中…" : "再エントリー作成"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
