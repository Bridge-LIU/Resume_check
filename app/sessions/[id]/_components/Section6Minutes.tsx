"use client";

import { useState, useTransition } from "react";
import type { Minutes } from "@/lib/types";
import { saveMinutesAction, summarizeMinutesApiAction } from "../actions";
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tip } from "@/components/ui/tooltip";

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
  const [summarized, setSummarized] = useState<boolean>(
    initial?.summarized ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSummarizing, startSummarize] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      await saveMinutesAction(sessionId, text);
      setSavedAt(new Date().toISOString());
      // 手で再保存したら「要約済」状態は解除する（生本文に戻った想定）
      setSummarized(false);
    });
  }

  async function handleSummarize() {
    if (!text.trim()) {
      setError("議事録が空です。先に貼り付けて保存してください。");
      return;
    }
    const ok = await confirm({
      title: "議事録本文を AI 要約で上書きしますか？",
      description: "元の本文には戻せません。よろしいですか？",
      confirmLabel: "要約で上書き",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    startSummarize(async () => {
      const res = await summarizeMinutesApiAction(sessionId);
      if (!res.ok) {
        setError(res.error ?? "要約に失敗しました");
        return;
      }
      if (res.text) {
        setText(res.text);
        setSavedAt(new Date().toISOString());
        setSummarized(true);
      }
    });
  }

  const busy = isPending || isSummarizing;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold">
          ⑥ 議事録{" "}
          <span className="text-xs text-zinc-500 ml-2">
            (Teamsからコピペ)
          </span>
          {summarized && (
            <Tip content="AI 要約済（API モード）">
              <span className="pill pill-pass ml-2">要約済</span>
            </Tip>
          )}
        </h3>
        <Tip content="設計書 §5 ⑥：本文を AI 要約で置き換える（既定 OFF）">
          <Button
            type="button"
            onClick={handleSummarize}
            disabled={busy || !text.trim()}
          >
            {isSummarizing ? "要約中…" : "要約する（API）"}
          </Button>
        </Tip>
      </div>
      {error && (
        <div className="mb-2 border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}
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
          disabled={busy}
        >
          {isPending ? "保存中…" : "保存"}
        </Button>
        {savedAt && (
          <span className="text-xs text-zinc-500">
            最終保存: {new Date(savedAt).toLocaleString("ja-JP")}
          </span>
        )}
        <span className="text-xs text-zinc-400 ml-auto tabular">
          {text.length.toLocaleString()} 文字
        </span>
      </div>
      <ConfirmDialog />
    </div>
  );
}
