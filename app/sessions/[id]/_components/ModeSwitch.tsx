"use client";

import type { Mode } from "@/lib/types";

/**
 * モード切替表示。貼付 / API をクリックでトグル。
 */
export function ModeSwitch({
  mode,
  onChange,
  apiLabel = "API",
  apiEnabled = true,
}: {
  mode: Mode;
  onChange?: (m: Mode) => void;
  apiLabel?: string;
  apiEnabled?: boolean;
}) {
  return (
    <div
      className="text-xs flex items-center gap-1 min-h-8"
      role="radiogroup"
      aria-label="モード切替"
    >
      <span className="text-muted-foreground mr-1">モード:</span>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "paste"}
        onClick={() => onChange?.("paste")}
        className={`pill ${
          mode === "paste" ? "pill-eval" : "bg-muted text-muted-foreground hover:bg-accent"
        }`}
      >
        ● 貼付
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "api"}
        onClick={() => apiEnabled && onChange?.("api")}
        disabled={!apiEnabled}
        title={apiEnabled ? undefined : "API 未設定のため利用不可"}
        className={`pill ${
          mode === "api"
            ? "pill-qpub"
            : "bg-muted text-muted-foreground hover:bg-accent"
        } ${!apiEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        ● {apiLabel}
      </button>
    </div>
  );
}
