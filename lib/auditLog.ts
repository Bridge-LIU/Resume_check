/**
 * 監査ログ
 *
 * data/logs/audit.log に JSONL で1行ずつ追記。
 * PII（氏名・履歴書本文・面談内容本文）は payload.meta に絶対に積まない（呼び出し側責任）。
 * 書き込み失敗は本処理を巻き戻さない方針。console.error のみ。
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot } from "./storage";

export type AuditEvent =
  | "session.create"
  | "session.delete"
  | "session.softDelete"
  | "session.restore"
  | "session.duplicate"
  | "session.freezeConditions"
  | "session.candidateSummarize"
  | "session.questionsGenerate"
  | "session.questionsReformat"
  | "session.minutesSummarize"
  | "session.saveEvaluation"
  | "master.role.upsert"
  | "master.role.delete"
  | "master.criteria.update"
  | "master.import"
  | "backup.create"
  | "backup.delete"
  | "backup.restore"
  | "retention.schedulerStart"
  | "retention.sweep.auto";

export interface AuditLogEntry {
  ts: string;
  event: AuditEvent;
  sessionId?: string;
  actor?: string;
  meta?: Record<string, unknown>;
}

export interface AuditPayload {
  sessionId?: string;
  actor?: string;
  meta?: Record<string, unknown>;
}

function logDir(): string {
  return path.join(getDataRoot(), "logs");
}

function logPath(): string {
  return path.join(logDir(), "audit.log");
}

export function writeAudit(event: AuditEvent, payload: AuditPayload = {}): void {
  try {
    const entry: AuditLogEntry = {
      ts: new Date().toISOString(),
      event,
      ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
      ...(payload.actor !== undefined ? { actor: payload.actor } : {}),
      ...(payload.meta !== undefined ? { meta: payload.meta } : {}),
    };
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(logPath(), JSON.stringify(entry) + "\n", "utf-8");
  } catch (e) {
    console.error("[audit] writeAudit failed", event, e);
  }
}

export interface ReadAuditOptions {
  limit?: number;
  event?: AuditEvent;
  sessionId?: string;
}

/**
 * 末尾から新しい順に最大 limit 件を返す。
 * event / sessionId が指定されたら一致するものだけ。
 */
export function readAudit(opts: ReadAuditOptions = {}): AuditLogEntry[] {
  const file = logPath();
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const limit = opts.limit ?? 100;
  const out: AuditLogEntry[] = [];

  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let entry: AuditLogEntry;
    try {
      entry = JSON.parse(lines[i]) as AuditLogEntry;
    } catch {
      continue;
    }
    if (opts.event && entry.event !== opts.event) continue;
    if (opts.sessionId && entry.sessionId !== opts.sessionId) continue;
    out.push(entry);
  }
  return out;
}
