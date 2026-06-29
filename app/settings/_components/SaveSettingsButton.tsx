"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * 設定フォームの「保存」ボタン。
 * useFormStatus の pending が true → false に落ちたタイミングを
 * Server Action 完了とみなし、3 秒だけ「✓ 保存しました」を表示する。
 */
export function SaveSettingsButton() {
  const { pending } = useFormStatus();
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowSaved(false), 3000);
    }
    wasPending.current = pending;
  }, [pending]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* スクリーンリーダー通知用の live region。要素は常に DOM 上に残し、テキストの増減のみで announce する */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          showSaved
            ? "text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1"
            : "sr-only"
        }
      >
        {showSaved ? "✓ 保存しました" : ""}
      </span>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
