"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";

interface ImportResponse {
  ok: boolean;
  error?: string;
  imported: { roles: number; evalAxes: number };
}

export default function MasterIO() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

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
      // filename*=UTF-8''<encoded> 優先、無ければ filename=
      const utf8 = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const ascii = /filename="?([^";]+)"?/.exec(disposition);
      const filename = utf8
        ? decodeURIComponent(utf8[1])
        : ascii?.[1] ?? "マスタ.xlsx";
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
      setBusy(null);
    }
  }

  function triggerImport() {
    setError(null);
    setSuccess(null);
    fileInputRef.current?.click();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = await confirm({
      title: "現在のマスタを上書きします",
      description: "取り込みファイルに含まれる役割・評価条件で上書きします。続行しますか？",
      confirmLabel: "上書きする",
      destructive: true,
    });
    if (!ok) return;

    setBusy("import");
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/master/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = (await res.json().catch(() => null)) as ImportResponse | null;
      if (!data) throw new Error("レスポンスを解析できませんでした");
      if (!data.ok) throw new Error(data.error ?? "import に失敗しました");
      setSuccess(
        `取り込み完了: 役割 ${data.imported.roles} 件 / 評価軸 ${data.imported.evalAxes} 件`,
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white rounded-xl border shadow-sm">
      <header className="px-6 py-3 border-b flex items-center gap-3">
        <h2 className="font-bold text-sm">マスタ一括 import / export</h2>
        <span className="text-xs text-zinc-500">役割 + 評価条件をまとめて取り扱います</span>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onImportFile}
        />
        <Tip content="JSON ファイルから役割 + 評価条件をまとめて取り込む">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={triggerImport}
            disabled={busy !== null}
          >
            {busy === "import" ? "取込中…" : "📤 インポート"}
          </Button>
        </Tip>
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

      <ConfirmDialog />
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
