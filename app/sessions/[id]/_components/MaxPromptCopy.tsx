"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Result = { ok: true; prompt: string } | { ok: false; error: string };

export function MaxPromptCopy({
  label = "📋 コピー",
  hint,
  fetcher,
  className = "",
}: {
  label?: string;
  hint?: React.ReactNode;
  fetcher: () => Promise<Result>;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await fetcher();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(res.prompt);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      } catch (e) {
        setError("クリップボードへのコピーに失敗: " + (e as Error).message);
      }
    });
  }

  return (
    <div
      className={`border border-dashed rounded p-2 bg-zinc-50 flex items-center gap-3 text-xs ${className}`}
    >
      {hint && <span className="text-zinc-600 flex-1">{hint}</span>}
      <div className="flex flex-col gap-1 items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={isPending}
          className="whitespace-nowrap"
        >
          {isPending ? "生成中…" : state === "copied" ? "コピー済 ✓" : label}
        </Button>
        {error && <span className="text-red-600 text-[10px]">{error}</span>}
      </div>
    </div>
  );
}
