"use client";

import type { Mode } from "@/lib/types";

/**
 * モード切替表示。
 * 現在は API モードを UI から隠しているため、「貼付」だけを表示する。
 * onChange / apiLabel / apiEnabled は呼び出し側の互換性のために受け付けるが未使用。
 */
export function ModeSwitch({
  mode,
}: {
  mode: Mode;
  onChange?: (m: Mode) => void;
  apiLabel?: string;
  apiEnabled?: boolean;
}) {
  // 現状は表示専用（操作不能）なのでフォーカス可能なボタンではなく静的な表示にする。
  // aria-label でスクリーンリーダーにも「モード: 貼付（固定）」と伝える。
  return (
    <div
      className="text-xs flex items-center gap-1"
      aria-label="モード: 貼付（固定）"
    >
      <span className="text-zinc-500 mr-1" aria-hidden="true">モード:</span>
      <span
        className={`pill ${
          mode === "paste" ? "pill-eval" : "bg-zinc-100 text-zinc-500"
        }`}
        aria-hidden="true"
      >
        ● 貼付
      </span>
    </div>
  );
}
