"use client";

import { useState, useTransition } from "react";
import type { Minutes } from "@/lib/types";
import { saveMinutesAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tip } from "@/components/ui/tooltip";
import { SectionHeaderBar } from "./SectionHeaderBar";

export function Section6Minutes({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Minutes | null;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(
    initial?.updatedAt ?? null,
  );
  const summarized = initial?.summarized ?? false;
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await saveMinutesAction(sessionId, text);
      setSavedAt(new Date().toISOString());
    });
  }

  return (
    <div>
      <SectionHeaderBar
        title="④ 議事録"
        hasData={!!initial?.text?.trim()}
        extra={
          <>
            <span className="text-xs text-zinc-500">(Teamsからコピペ)</span>
            {summarized && (
              <Tip content="AI 要約済（過去データ）">
                <span className="pill pill-pass">要約済</span>
              </Tip>
            )}
          </>
        }
      />
      <Textarea
        className="w-full text-sm"
        rows={10}
        placeholder="議事録テキストを貼り付け"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3 mt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "保存中…" : "保存"}
        </Button>
        {savedAt && (
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-zinc-500"
          >
            最終保存: {new Date(savedAt).toLocaleString("ja-JP")}
          </span>
        )}
        {/* 文字数カウンタは頻繁に変動するため announce しない（aria-hidden）。
            色は zinc-400 だが情報は textarea から取得可能なので装飾扱い。 */}
        <span className="text-xs text-zinc-500 ml-auto tabular" aria-hidden="true">
          {text.length.toLocaleString()} 文字
        </span>
      </div>
    </div>
  );
}
