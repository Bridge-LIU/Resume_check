"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/ui/button";
import { Tip } from "@/ui/tooltip";

export function SessionsExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // 現在ページの絞込 (state / role / result / q) を API に引き継ぐ。
  const filterParams = (() => {
    const p = new URLSearchParams();
    for (const k of ["state", "role", "result", "verdict", "q"] as const) {
      const v = searchParams.get(k);
      if (v) p.set(k, v);
    }
    return p.toString();
  })();
  const hasFilter = filterParams.length > 0;

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const apiUrl = filterParams
        ? `/api/sessions/export-xlsx?${filterParams}`
        : "/api/sessions/export-xlsx";
      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Excel エクスポートに失敗しました (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const utf8 = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const ascii = /filename="?([^";]+)"?/.exec(disposition);
      const filename = utf8
        ? decodeURIComponent(utf8[1])
        : ascii?.[1] ?? "面談者一覧.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-red-700" title={error}>
          ✗ {error.length > 40 ? error.slice(0, 40) + "…" : error}
        </span>
      )}
      <Tip
        content={
          hasFilter
            ? "現在の絞込結果のみ Excel (.xlsx) で書き出す"
            : "応募者一覧（評価結果込み）を Excel (.xlsx) で書き出す"
        }
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={busy}
        >
          {busy
            ? "書出中…"
            : hasFilter
              ? "📊 Excel エクスポート（絞込）"
              : "📊 Excel エクスポート"}
        </Button>
      </Tip>
    </div>
  );
}
