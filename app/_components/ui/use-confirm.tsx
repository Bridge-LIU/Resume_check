"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  /** description の代わり / 追加で使えるリッチな本文。JSX を直接渡せる */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * window.confirm の置換。Promise ベース。
 *
 * 使い方:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: "削除しますか?", description: "..." })) { ... }
 *   ...
 *   <ConfirmDialog />  // JSX のどこかに置く
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleClose = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  // Enter → 確定 / Esc → キャンセル。
  // Esc は Radix AlertDialog が onOpenChange(false) を呼ぶので既に効いている。
  // Enter は既定だと Cancel ボタン (autoFocus) が押されて逆挙動になるので、
  // capture phase で先取りしてボタンの onClick より前に確定させる。
  // 入力欄内 (input/textarea/contenteditable) の Enter は無視する（改行や検索の邪魔になるため）。
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    handleClose(true);
  };

  const ConfirmDialog = () => (
    <AlertDialog open={state !== null} onOpenChange={(open) => !open && handleClose(false)}>
      <AlertDialogContent onKeyDownCapture={handleKeyDown}>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title ?? ""}</AlertDialogTitle>
          {state?.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {state?.body}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleClose(false)}>
            {state?.cancelLabel ?? "キャンセル"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleClose(true)}
            className={
              state?.destructive
                ? "bg-red-600 hover:bg-red-700"
                : undefined
            }
          >
            {state?.confirmLabel ?? "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
