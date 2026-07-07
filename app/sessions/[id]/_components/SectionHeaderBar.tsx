import type { ReactNode } from "react";

/**
 * 各工程セクションの共通ヘッダーバー（緑の左ボーダー強調）。
 * hasData=true で「保存済」チップ＋緑トーン、false で zinc グレートーン（未着手）。
 * 右側の actions は children として渡す。
 */
export function SectionHeaderBar({
  title,
  hasData,
  extra,
  children,
}: {
  title: ReactNode;
  hasData: boolean;
  /** タイトル直後・保存済チップの前に挟む追加チップ等（任意） */
  extra?: ReactNode;
  /** 右側に置くボタンや ModeSwitch（任意） */
  children?: ReactNode;
}) {
  const tone = hasData
    ? "border-emerald-500 bg-emerald-50/40"
    : "border-border bg-muted";
  return (
    <div
      className={`border-l-4 ${tone} pl-3 pr-2 py-2 rounded-r-md mb-3 flex items-center justify-between gap-3 flex-wrap min-h-[2.5rem]`}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <h3 className="font-bold text-foreground whitespace-nowrap">{title}</h3>
        {extra}
        {hasData && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            保存済
          </span>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-nowrap min-w-0">
          {children}
        </div>
      )}
    </div>
  );
}
