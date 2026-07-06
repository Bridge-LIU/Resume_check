"use client";

import { useEffect, useRef, useState } from "react";

type SaveResult = { ok?: boolean; error?: string } | void;

export type AutoSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/**
 * 自動保存共通フック。
 * - `save(fn)` を呼ぶと fn() を実行し、失敗時に 1 回だけ 800ms 後にリトライする
 * - 成功: state を "saved" にして 2.5 秒後に "idle" へ戻す（呼び出し側で「自動保存済み ✓」を表示）
 * - 失敗（リトライも失敗）: state を "error" にする（呼び出し側でエラー文言を表示）
 * - 呼び出し側は `dirty` を自前でチェックしてから save() を呼ぶ想定
 *
 * 表示は toast（全画面右下）ではなく、各セクションの入力欄右下にインラインで表示する方針。
 */
export function useAutoSave() {
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<AutoSaveState>({ kind: "idle" });
  const inFlightRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function scheduleIdle(delayMs: number): void {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setState({ kind: "idle" });
    }, delayMs);
  }

  async function attempt(fn: () => Promise<SaveResult>): Promise<{
    ok: boolean;
    error?: string;
  }> {
    try {
      const res = await fn();
      if (res && typeof res === "object" && "ok" in res && res.ok === false) {
        return { ok: false, error: res.error };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function save(fn: () => Promise<SaveResult>): Promise<boolean> {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setIsSaving(true);
    setState({ kind: "saving" });
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    try {
      let res = await attempt(fn);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 800));
        res = await attempt(fn);
      }
      if (!res.ok) {
        setState({ kind: "error", message: res.error ?? "保存に失敗しました" });
        return false;
      }
      setSavedAt(new Date().toISOString());
      setState({ kind: "saved" });
      scheduleIdle(2500);
      return true;
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  }

  return { save, isSaving, savedAt, setSavedAt, state };
}

/**
 * 入力欄の右下に浮かせるインライン自動保存インジケータ。
 * 親要素に `relative` を付けて、その中で `absolute` 表示される。
 */
export function AutoSaveIndicator({ state }: { state: AutoSaveState }) {
  if (state.kind === "idle") return null;
  const base =
    "pointer-events-none absolute bottom-2 right-3 text-xs font-medium " +
    "flex items-center gap-1 select-none transition-opacity duration-200";
  if (state.kind === "saving") {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`${base} text-zinc-500`}
      >
        <svg
          className="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        保存中…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`${base} text-emerald-600`}
      >
        自動保存済み
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  // error
  return (
    <span
      role="alert"
      aria-live="assertive"
      className={`${base} text-red-600`}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      保存失敗: {state.message}
    </span>
  );
}
