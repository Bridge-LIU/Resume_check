"use client";

import { useCallback, useState } from "react";
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

  const ConfirmDialog = () => (
    <AlertDialog open={state !== null} onOpenChange={(open) => !open && handleClose(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title ?? ""}</AlertDialogTitle>
          {state?.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
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
