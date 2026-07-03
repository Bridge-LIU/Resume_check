"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";

export default function MasterIO() {
  const [busy, setBusy] = useState<"export" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onExport() {
    setBusy("export");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/master/export", { cache: "no-store" });
      if (!res.ok) throw new Error(`エクスポートに失敗しました (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="?([^";]+)"?/.exec(disposition);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const filename = m?.[1] ?? `master-${stamp}.json`;
      triggerDownload(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onExportXlsx() {
    setBusy("xlsx");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/master/export-xlsx", { cache: "no-store" });
      if (!res.ok) throw new Error(`Excel エクスポートに失敗しました (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const utf8 = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const ascii = /filename="?([^";]+)"?/.exec(disposition);
      const filename = utf8
        ? decodeURIComponent(utf8[1])
        : ascii?.[1] ?? "マスタ.xlsx";
      triggerDownload(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white rounded-xl border shadow-sm">
      <header className="px-6 py-3 border-b flex items-center gap-3">
        <h2 className="font-bold text-sm">マスタ一括 export</h2>
        <span className="text-xs text-zinc-500">役割 + 評価条件をまとめて書き出します</span>
        <div className="flex-1" />
        <Tip content="役割 + 評価条件をまとめて JSON で書き出す">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={busy !== null}
          >
            {busy === "export" ? "書出中…" : "📥 JSON"}
          </Button>
        </Tip>
        <Tip content="役割 + 評価条件を Excel (.xlsx) で書き出す（テンプレ準拠）">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportXlsx}
            disabled={busy !== null}
          >
            {busy === "xlsx" ? "書出中…" : "📊 Excel"}
          </Button>
        </Tip>
      </header>

      {(error || success) && (
        <div className="px-6 py-3 space-y-2">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              {success}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
