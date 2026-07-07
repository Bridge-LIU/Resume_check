"use client";

import { useEffect, useRef, useState } from "react";
import type { Minutes } from "@/lib/types";
import { saveMinutesAction } from "../actions";
import { Textarea } from "@/components/ui/textarea";
import { Tip } from "@/components/ui/tooltip";
import { SectionHeaderBar } from "./SectionHeaderBar";
import { AutoSaveIndicator, useAutoSave } from "./useAutoSave";

export function Section6Minutes({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Minutes | null;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const summarized = initial?.summarized ?? false;
  const { save, savedAt, setSavedAt, state } = useAutoSave();
  const lastSavedRef = useRef(initial?.text ?? "");
  useEffect(() => {
    setSavedAt(initial?.updatedAt ?? null);
  }, [initial?.updatedAt, setSavedAt]);

  async function handleAutoSave() {
    if (text === lastSavedRef.current) return;
    const snapshot = text;
    const ok = await save(() => saveMinutesAction(sessionId, snapshot));
    if (ok) lastSavedRef.current = snapshot;
  }

  return (
    <div>
      <SectionHeaderBar
        title="④ 面談内容"
        hasData={!!initial?.text?.trim()}
        extra={
          <>
            <span className="text-xs text-muted-foreground">(Teamsからコピペ)</span>
            {summarized && (
              <Tip content="AI 要約済（過去データ）">
                <span className="pill pill-pass">要約済</span>
              </Tip>
            )}
          </>
        }
      />
      <div className="relative">
        <Textarea
          className="w-full text-sm pr-3 pb-6"
          rows={10}
          placeholder="面談内容テキストを貼り付け"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleAutoSave}
        />
        <AutoSaveIndicator state={state} />
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>
          {savedAt
            ? `最終保存: ${new Date(savedAt).toLocaleString("ja-JP")}`
            : "未保存（フォーカスを外すと自動保存）"}
        </span>
        <span className="ml-auto tabular" aria-hidden="true">
          {text.length.toLocaleString()} 文字
        </span>
      </div>
    </div>
  );
}
