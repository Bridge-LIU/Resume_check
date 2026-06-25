import { readAudit } from "@/lib/auditLog";
import type { AuditEvent, AuditLogEntry } from "@/lib/auditLog";

const EVENT_LABEL: Record<AuditEvent, string> = {
  "session.create": "セッション作成",
  "session.delete": "セッション削除",
  "session.softDelete": "ゴミ箱へ移動",
  "session.restore": "ゴミ箱から復元",
  "session.duplicate": "セッション複製",
  "session.freezeConditions": "④条件凍結",
  "session.saveEvaluation": "⑧評価保存",
  "master.role.upsert": "役割マスタ更新",
  "master.role.delete": "役割マスタ削除",
  "master.criteria.update": "評価条件更新",
  "master.import": "マスタ取込",
  "backup.create": "バックアップ作成",
  "backup.delete": "バックアップ削除",
  "retention.schedulerStart": "定期スイープ開始",
  "retention.sweep.auto": "自動スイープ実行",
  "session.candidateSummarize": "②候補者 API 要約",
  "session.questionsGenerate": "⑤質問 API 生成",
  "session.questionsReformat": "⑤質問 API 整形",
  "session.minutesSummarize": "⑥議事録 API 要約",
};

const EVENT_PILL: Partial<Record<AuditEvent, string>> = {
  "session.create": "bg-emerald-100 text-emerald-800",
  "session.delete": "bg-red-100 text-red-800",
  "session.softDelete": "bg-amber-100 text-amber-800",
  "session.restore": "bg-blue-100 text-blue-800",
  "session.freezeConditions": "bg-violet-100 text-violet-800",
  "session.saveEvaluation": "bg-blue-100 text-blue-800",
  "master.role.upsert": "bg-zinc-100 text-zinc-700",
  "master.role.delete": "bg-red-100 text-red-800",
  "master.criteria.update": "bg-zinc-100 text-zinc-700",
  "master.import": "bg-violet-100 text-violet-800",
  "backup.create": "bg-emerald-100 text-emerald-800",
  "backup.delete": "bg-red-100 text-red-800",
  "retention.schedulerStart": "bg-zinc-100 text-zinc-700",
  "retention.sweep.auto": "bg-amber-100 text-amber-800",
  "session.candidateSummarize": "bg-blue-100 text-blue-800",
  "session.questionsGenerate": "bg-blue-100 text-blue-800",
  "session.questionsReformat": "bg-blue-100 text-blue-800",
  "session.minutesSummarize": "bg-blue-100 text-blue-800",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function metaSummary(entry: AuditLogEntry): string {
  if (!entry.meta) return "";
  const m = entry.meta;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    const s =
      typeof v === "string"
        ? v
        : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : JSON.stringify(v);
    parts.push(`${k}=${s}`);
  }
  return parts.join(" / ");
}

export function AuditLogViewer({ limit = 50 }: { limit?: number }) {
  let entries: AuditLogEntry[];
  try {
    entries = readAudit({ limit });
  } catch {
    entries = [];
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <details className="group">
        <summary className="p-6 cursor-pointer list-none flex items-center gap-3 hover:bg-zinc-50/50 rounded-xl">
          <svg
            className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z" />
          </svg>
          <h3 className="font-bold">直近の監査ログ</h3>
          <span className="text-xs text-zinc-500">
            最新 {limit} 件 ・ {entries.length}件記録
          </span>
          <div className="flex-1" />
          <span className="text-xs text-zinc-400 font-mono">
            data/logs/audit.log
          </span>
        </summary>
        <div className="px-6 pb-6 space-y-3">
          <div className="text-xs text-zinc-500">
            PII（氏名・履歴書本文・議事録本文）は記録しない方針。表示は時刻降順。
          </div>
          {entries.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-sm text-zinc-500">
              まだ監査ログがありません
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-44">時刻</th>
                    <th className="text-left px-3 py-2 font-medium w-36">イベント</th>
                    <th className="text-left px-3 py-2 font-medium w-56">対象</th>
                    <th className="text-left px-3 py-2 font-medium">補足</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e, i) => (
                    <tr key={`${e.ts}-${i}`} className="hover:bg-zinc-50">
                      <td className="px-3 py-1.5 tabular text-zinc-600">
                        {formatTime(e.ts)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                            EVENT_PILL[e.event] ?? "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {EVENT_LABEL[e.event] ?? e.event}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-700 break-all">
                        {e.sessionId ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-600 break-all">
                        {metaSummary(e) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
