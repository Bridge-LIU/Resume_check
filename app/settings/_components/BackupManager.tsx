"use client";

/**
 * バックアップ管理 UI。
 *
 * 保持期間スイープと連動する世代整理を提供する：
 *   - keepDays（保存日数）と maxGenerations（世代上限）を Settings.retention から受け取り表示
 *   - 「世代を整理」ボタンで POST /api/backup/sweep を呼び古い世代を一掃する
 *   - 値そのものの編集は「設定」フォーム側で行う（このコンポーネントは閲覧 + 実行のみ）
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/ui/use-confirm";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

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
type RestoreResponse =
  | {
      ok: true;
      result: {
        restoredMaster: number;
        restoredSessions: number;
        restoredSettings: boolean;
        snapshotPath: string;
      };
    }
  | ApiErrorBody;
type UploadResponse =
  | { ok: true; backup: { path: string; size: number; encrypted: boolean } }
  | ApiErrorBody;
type PreviewResponse =
  | {
      ok: true;
      result: {
        archiveMasterFiles: number;
        archiveSessionIds: string[];
        archiveHasSettings: boolean;
        currentSessionIds: string[];
        overlapSessionIds: string[];
        onlyInArchive: string[];
        onlyInCurrent: string[];
      };
    }
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
  // sweeping は「世代を整理」ボタン非表示中は未使用（handleSweep が使う）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sweeping, startSweep] = useTransition();
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    void refresh();
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
      setError("暗号化パスワードは必須です");
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

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  async function handleUploadRestore(ev: React.ChangeEvent<HTMLInputElement>) {
    const input = ev.target;
    const file = input.files?.[0];
    // 一度使ったら input 側の value をクリア（同じファイルを再選択できるように）
    input.value = "";
    if (!file) return;

    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/backup/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as UploadResponse;
      if (!data.ok) {
        setError(data.error.message);
        return;
      }
      setInfo(
        `アップロード完了: ${fmtBasename(data.backup.path)} (${fmtSize(data.backup.size)})。続けて復元ダイアログが開きます。`,
      );
      await refresh();
      // アップロード後、そのファイルに対して復元フロー（プレビュー→確認→復元）を起動
      const uploaded: Backup = {
        path: data.backup.path,
        size: data.backup.size,
        createdAt: new Date().toISOString(),
        encrypted: data.backup.encrypted,
      };
      await handleRestore(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleRestore(target: Backup) {
    // 1. パスワードは入力欄が空の場合のみ prompt で聞く
    let pw = password.trim();
    if (!pw) {
      const entered = window.prompt(
        `【復元】${fmtBasename(target.path)}\n\n` +
          `作成時に設定した暗号化パスワードを入力してください。`,
        "",
      );
      if (entered === null) return;
      pw = entered.trim();
      if (!pw) {
        setError("復号パスワードが空です");
        return;
      }
    }

    // 2. プレビュー（復号 + tar パースのみ、fs 書き込みなし）
    setError(null);
    setInfo(null);
    setRestoringPath(target.path);
    let preview: (PreviewResponse & { ok: true })["result"] | null = null;
    try {
      const res = await fetch("/api/backup/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path, password: pw }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!data.ok) {
        setError(data.error.message);
        setRestoringPath(null);
        return;
      }
      preview = data.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRestoringPath(null);
      return;
    }

    // 3. プレビュー結果を confirm ダイアログに提示
    const p = preview;
    const summary =
      `${fmtBasename(target.path)}\n\n` +
      `【アーカイブの内容】\n` +
      `・master ファイル: ${p.archiveMasterFiles} 件\n` +
      `・sessions: ${p.archiveSessionIds.length} 件\n` +
      `・settings.json: ${p.archiveHasSettings ? "含む" : "含まない"}\n\n` +
      `【現行データとの差分】\n` +
      `・両方に存在（上書きされる）: ${p.overlapSessionIds.length} 件\n` +
      `・アーカイブにのみ存在（追加）: ${p.onlyInArchive.length} 件\n` +
      `・現行にのみ存在（消滅）: ${p.onlyInCurrent.length} 件\n\n` +
      `⚠ 復元前の現行データは data/_restore_snapshots/ に自動退避されます。`;

    const ok = await confirm({
      title: "このバックアップから復元しますか？",
      description: summary,
      confirmLabel: "復元する",
      destructive: true,
    });
    if (!ok) {
      setRestoringPath(null);
      return;
    }

    // 4. 実復元
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path, password: pw }),
      });
      const data = (await res.json()) as RestoreResponse;
      if (!data.ok) {
        setError(data.error.message);
        return;
      }
      const r = data.result;
      setInfo(
        `復元しました。 master: ${r.restoredMaster} 件 / ` +
          `sessions: ${r.restoredSessions} 件 / ` +
          `settings: ${r.restoredSettings ? "含む" : "含まない"} ` +
          `(退避先: ${r.snapshotPath.split(/[\\/]/).slice(-2).join("/")})`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoringPath(null);
    }
  }

  // 現状の UI では非表示（将来復活する可能性があるため関数は残す）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // 現状の UI では非表示（handleSweep と同様、将来復活する可能性のため保持）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sweepRuleLabel =
    `保存 ${keepDays === 0 ? "無制限" : `${keepDays}日`} / ` +
    `上限 ${maxGenerations === 0 ? "無制限" : `${maxGenerations}件`}`;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        sessions/ と master/ を tar.gz でまとめて data/_backups/ に保存します。
        パスワードで AES-256-GCM 暗号化します（紛失時は復号不可）。
        <span className="text-amber-700">
          {" "}
          ※ バックアップ世代は「保存日数」「世代上限」のいずれかに該当したら削除されます（値の編集は上の「設定」フォーム）。
        </span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="grow min-w-[200px]">
          <Label htmlFor="backup-password" className="block text-xs text-muted-foreground mb-1">
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
          onClick={triggerUpload}
          disabled={creating || loading || uploading}
          title="別 PC で作った .enc.tar.gz を選んで復元します"
        >
          {uploading ? "復元中…" : "復元"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gz,.tar.gz"
          className="hidden"
          onChange={(e) => void handleUploadRestore(e)}
        />
        {/* 「世代を整理」「再読込」は現状のワークフローでは実用性が低いため非表示。
            必要になったら handleSweep / refresh の onClick を復活させれば OK。 */}
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
          <thead className="bg-muted text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-3 py-2">ファイル名</th>
              <th className="text-left px-3 py-2 w-40">作成日時</th>
              <th className="text-right px-3 py-2 w-24">サイズ</th>
              <th className="text-center px-3 py-2 w-20">暗号化</th>
              <th className="px-3 py-2 w-36"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {backups === null && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  読込中…
                </td>
              </tr>
            )}
            {backups && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  バックアップはまだありません。
                </td>
              </tr>
            )}
            {backups?.map((b) => (
              <tr key={b.path} className="hover:bg-accent">
                <td className="px-3 py-2 font-mono text-xs">{fmtBasename(b.path)}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {fmtDate(b.createdAt)}
                </td>
                <td className="px-3 py-2 text-right tabular text-muted-foreground text-xs">
                  {fmtSize(b.size)}
                </td>
                <td className="px-3 py-2 text-center">
                  {b.encrypted ? (
                    <span className="pill pill-pass">暗号化</span>
                  ) : (
                    <span className="pill pill-edit">平文</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => void handleRestore(b)}
                    disabled={restoringPath === b.path || deletingPath === b.path}
                    className="text-blue-600"
                  >
                    {restoringPath === b.path ? "復元中…" : "復元"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => void handleDelete(b)}
                    disabled={deletingPath === b.path || restoringPath === b.path}
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
