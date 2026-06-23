"use client";

import type { Mode } from "@/lib/types";

export function ModeSwitch({
  mode,
  onChange,
  apiLabel = "API自動",
  apiEnabled = false,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  apiLabel?: string;
  apiEnabled?: boolean;
}) {
  return (
    <div className="text-xs flex items-center gap-1">
      <span className="text-zinc-500 mr-1">モード:</span>
      <button
        type="button"
        onClick={() => onChange("paste")}
        className={`pill ${
          mode === "paste"
            ? "pill-eval"
            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
        }`}
      >
        ● 貼付
      </button>
      {apiEnabled ? (
        <button
          type="button"
          onClick={() => onChange("api")}
          className={`pill ${
            mode === "api"
              ? "pill-eval"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
          }`}
        >
          ○ {apiLabel}
        </button>
      ) : (
        <button
          type="button"
          disabled
          title="Phase 2 で有効化"
          className="pill bg-zinc-200 text-zinc-400 opacity-50 cursor-not-allowed"
        >
          ○ {apiLabel}
        </button>
      )}
    </div>
  );
}
