"use client";

/**
 * バックアップ管理 UI（Phase 4）。
 *
 * §7.5 / §11 の保持期間スイープと連動する世代整理を提供する：
 *   - keepDays（保存日数）と maxGenerations（世代上限）を Settings.retention から受け取り表示
 *   - 「世代を整理」ボタンで POST /api/backup/sweep を呼び古い世代を一掃する
 *   - 値そのものの編集は「設定」フォーム側で行う（このコンポーネントは閲覧 + 実行のみ）
 */

import { useEffect, useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Backup = {
  path: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
};

type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string; hint?: string };
};

type ListResponse = { ok: true; backups: Backup[] } | ApiErrorBody;
type CreateResponse =
  | { ok: true; backup: { path: string; size: number; encrypted: boolean } }
  | ApiErrorBody;
type DeleteResponse = { ok: true } | ApiErrorBody;
type SweepResponse =
  | { ok: true; deleted: string[]; kept: number }
  | ApiErrorBody;

interface BackupManagerProps {
  /** Settings.retention.backupKeepDays（0 = 自動削除しない） */
  keepDays?: number;
  /** Settings.retention.backupMaxGenerations（0 = 無制限） */
  maxGenerations?: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fmtBasename(p: string): string {
  const m = /([^\\/]+)$/.exec(p);
  return m ? m[1] : p;
}

export function BackupManager({
  keepDays = 90,
  maxGenerations = 0,
}: BackupManagerProps = {}) {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [creating, startCreate] = useTransition();
  const [sweeping, startSweep] = useTransition();
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    return new Promise<void>((resolve) => {
      startLoad(async () => {
        try {
          const res = await fetch("/api/backup", { cache: "no-store" });
          const data = (await res.json()) as ListResponse;
          if (!data.ok) {
            setError(data.error.message);
          } else {
            setBackups(data.backups);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          resolve();
        }
      });
    });
  }

  function handleCreate() {
    setError(null);
    setInfo(null);
    if (!password) {
      setError("暗号化パスワードは必須です（設計書 §11）");
      return;
    }
    startCreate(async () => {
      try {
        const res = await fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = (await res.json()) as CreateResponse;
        if (!data.ok) {
          setError(data.error.message);
          return;
        }
        setInfo(
          `バックアップを作成しました: ${fmtBasename(data.backup.path)} ` +
            `(${fmtSize(data.backup.size)}${data.backup.encrypted ? " / 暗号化" : ""})`,
        );
        setPassword("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function handleDelete(target: Backup) {
    const ok = await confirm({
      title: "バックアップを削除しますか？",
      description: fmtBasename(target.path),
      confirmLabel: "削除する",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setInfo(null);
    setDeletingPath(target.path);
    try {
      const url = `/api/backup?path=${encodeURIComponent(target.path)}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = (await res.json()) as DeleteResponse;
      if (!data.ok) {
        setError(data.error.message);
        return;
      }
      setInfo(`削除しました: ${fmtBasename(target.path)}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingPath(null);
    }
  }

  async function handleSweep() {
    const ruleText =
      `保存日数 ${keepDays === 0 ? "無制限" : `${keepDays}日`} / ` +
      `世代上限 ${maxGenerations === 0 ? "無制限" : `${maxGenerations}件`}`;
    const ok = await confirm({
      title: "古いバックアップを削除しますか？",
      description: `現在のルール: ${ruleText}`,
      confirmLabel: "世代を整理",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setInfo(null);
    startSweep(async () => {
      try {
        const res = await fetch("/api/backup/sweep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as SweepResponse;
        if (!data.ok) {
          setError(data.error.message);
          return;
        }
        setInfo(
          `世代を整理しました: 削除 ${data.deleted.length} 件 / 残存 ${data.kept} 件`,
        );
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const sweepRuleLabel =
    `保存 ${keepDays === 0 ? "無制限" : `${keepDays}日`} / ` +
    `上限 ${maxGenerations === 0 ? "無制限" : `${maxGenerations}件`}`;

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500">
        sessions/ と master/ を tar.gz でまとめて data/_backups/ に保存します。
        パスワードで AES-256-GCM 暗号化します（設計書 §11／紛失時は復号不可）。
        <span className="text-amber-700">
          {" "}
          ※ §7.5 / §11：バックアップ世代は「保存日数」「世代上限」のいずれかに該当したら削除されます（値の編集は上の「設定」フォーム）。
        </span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="grow min-w-[200px]">
          <Label htmlFor="backup-password" className="block text-xs text-zinc-500 mb-1">
            暗号化パスワード <span className="text-red-600">*必須</span>
          </Label>
          <Input
            id="backup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="復号に必要。紛失時は復元不可"
            autoComplete="new-password"
            required
          />
        </div>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={creating || loading}
        >
          {creating ? "バックアップ中…" : "今すぐバックアップ"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSweep}
          disabled={creating || loading || sweeping}
          title={`現在ルール: ${sweepRuleLabel}`}
        >
          {sweeping ? "整理中…" : "世代を整理"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={creating || loading || sweeping}
        >
          再読込
        </Button>
      </div>

      <div className="text-xs text-zinc-500">
        現在の世代ルール: <span className="font-medium text-zinc-700">{sweepRuleLabel}</span>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}
      {info && (
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm rounded px-3 py-2">
          {info}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600 text-xs">
            <tr>
              <th className="text-left px-3 py-2">ファイル名</th>
              <th className="text-left px-3 py-2 w-40">作成日時</th>
              <th className="text-right px-3 py-2 w-24">サイズ</th>
              <th className="text-center px-3 py-2 w-20">暗号化</th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {backups === null && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-zinc-500 text-xs">
                  読込中…
                </td>
              </tr>
            )}
            {backups && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-zinc-500 text-xs">
                  バックアップはまだありません。
                </td>
              </tr>
            )}
            {backups?.map((b) => (
              <tr key={b.path} className="hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">{fmtBasename(b.path)}</td>
                <td className="px-3 py-2 text-zinc-600 text-xs">
                  {fmtDate(b.createdAt)}
                </td>
                <td className="px-3 py-2 text-right tabular text-zinc-600 text-xs">
                  {fmtSize(b.size)}
                </td>
                <td className="px-3 py-2 text-center">
                  {b.encrypted ? (
                    <span className="pill pill-pass">暗号化</span>
                  ) : (
                    <span className="pill pill-edit">平文</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => void handleDelete(b)}
                    disabled={deletingPath === b.path}
                    className="text-red-600"
                  >
                    {deletingPath === b.path ? "削除中…" : "削除"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog />
    </div>
  );
}
