"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { Textarea } from "@/ui/textarea";
import { REJECT_REASONS, type RejectReason } from "@/lib/types";

/**
 * 不採用理由の選択ダイアログ。
 * - 初回選択（未確定/採用 → 不採用）でも、既存不採用の編集でも同じ形。
 * - "その他" を含めて最低 1 つ選択必須。
 * - キャンセルは呼び出し側で「元の result に戻す」ハンドリングをする。
 */
export function RejectReasonDialog({
  open,
  onOpenChange,
  initialReasons,
  initialNote,
  onCancel,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialReasons: RejectReason[];
  initialNote: string;
  /** バツ / キャンセル押下時。元の result に戻す責務は親側。 */
  onCancel: () => void;
  onSave: (reasons: RejectReason[], note: string) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<RejectReason>>(
    () => new Set(initialReasons),
  );
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  // open が false→true になったら state を初期化。
  // 既存不採用を再編集する時に前回の内容が残らないようにする。
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialReasons));
      setNote(initialNote);
      setError(null);
    }
    // initialReasons / initialNote は open 遷移時のみ反映（open 中は親からの再供給を無視）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(r: RejectReason) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
    setError(null);
  }

  function handleSave() {
    const reasons = REJECT_REASONS.filter((r) => selected.has(r));
    if (reasons.length === 0) {
      setError("理由を 1 つ以上選択してください");
      return;
    }
    onSave(reasons, note.trim());
  }

  function handleCancel() {
    onCancel();
    onOpenChange(false);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        // Escape / 外側クリックでの閉鎖もキャンセル扱い
        if (!v) onCancel();
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>不採用にする理由を選択</AlertDialogTitle>
          <AlertDialogDescription>
            複数選択できます。集計（/analytics）で「なぜ不採用にしたか」の傾向を出すのに使います。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {REJECT_REASONS.map((r) => {
              const id = `reject-reason-${r}`;
              return (
                <div key={r} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={selected.has(r)}
                    onCheckedChange={() => toggle(r)}
                    disabled={saving}
                  />
                  <Label
                    htmlFor={id}
                    className="text-sm cursor-pointer select-none"
                  >
                    {r}
                  </Label>
                </div>
              );
            })}
          </div>

          <div>
            <Label
              htmlFor="reject-note"
              className="text-xs text-muted-foreground"
            >
              補足（任意 / 最大 2000 文字）
            </Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              placeholder="具体的な発言・場面・懸念点など"
              rows={3}
              className="mt-1 text-sm"
              disabled={saving}
            />
            <div className="text-2xs text-muted-foreground opacity-70 mt-0.5 text-right tabular">
              {note.length} / 2000
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {saving ? "保存中…" : "不採用として保存"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
