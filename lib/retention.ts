/**
 * 保存期間スイープ（設計書 §7.5）
 *
 * 二段階削除:
 *   sessions/<id>/   → _trash/<id>/   (ソフト削除)
 *   _trash/<id>/     → 完全削除       (猶予日数超過後)
 *
 * 守る条件:
 *   - hold = true は対象外
 *   - closedAt が null（未確定）は対象外
 *   - retention.days[result] = 0 は「自動削除しない」
 *
 * ログ:
 *   - logs/deletion.log に ID のみ追記（PII は書かない）
 *
 * 匿名サマリ:
 *   - keepAnonymizedEval=true なら analytics/<id>.json に保存（氏名・履歴書は除く）
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDataRoot, getEvaluation, getSessionMeta, loadSettings } from "./storage";
import type { SessionMeta, Settings } from "./types";
import { writeAudit } from "./auditLog";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  softDeleted: string[];
  hardDeleted: string[];
  anonymized: string[];
}

export interface PreviewItem {
  id: string;
  氏名: string;
  役割: string;
  closedAt: string;
  result: SessionMeta["result"];
  ageDays: number;
  keepDays: number;
  willAnonymize: boolean;
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function sessionsDir() {
  return path.join(getDataRoot(), "sessions");
}
function trashDir() {
  return path.join(getDataRoot(), "_trash");
}
function analyticsDir() {
  return path.join(getDataRoot(), "analytics");
}
function logPath() {
  return path.join(getDataRoot(), "logs", "deletion.log");
}

function appendLog(line: string): void {
  const file = logPath();
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, line + "\n", "utf-8");
}

function saveAnonymized(id: string, meta: SessionMeta): void {
  const ev = getEvaluation(id);
  if (!ev) return; // 評価がなければ匿名サマリ作成しない
  const anon = {
    idHash: Buffer.from(id).toString("base64").slice(0, 16),
    役割: meta.役割,
    closedAt: meta.closedAt,
    result: meta.result,
    軸評価: ev.軸評価.map((a) => ({ 軸: a.軸, スコア: a.スコア })),
    総合スコア: ev.総合スコア,
    自己解決レベル: ev.自己解決レベル,
    合否: ev.合否,
  };
  const dir = analyticsDir();
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, `${anon.idHash}.json`),
    JSON.stringify(anon, null, 2),
    "utf-8",
  );
}

/** 設定取得（外部から渡すケースもあるので引数化可能） */
function getCfg(override?: Settings["retention"]): Settings["retention"] {
  return override ?? loadSettings().retention;
}

/** 「次に消える面談」プレビュー（実削除はしない） */
/**
 * セッションをゴミ箱（_trash/<id>/）へ移動する手動ソフト削除。
 * runSweep の sessions → _trash ロジックを「単発・無条件」版に切り出したもの。
 * 復元は restoreFromTrash(id)、完全削除は purgeFromTrash(id) または猶予超過後の sweep。
 */
export function softDeleteSession(id: string): void {
  const sessions = sessionsDir();
  const trash = trashDir();
  const from = path.join(sessions, id);
  if (!fs.existsSync(from)) {
    throw new Error(`セッションが見つかりません: ${id}`);
  }
  // rename 後はメタ取得不能になるので先に読む
  const meta = getSessionMeta(id);

  ensureDir(trash);
  const to = path.join(trash, id);
  // ゴミ箱に同名がある場合は上書き
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);

  const nowIso = new Date().toISOString();
  appendLog(`${nowIso} soft ${id} manual`);
  writeAudit("session.softDelete", {
    sessionId: id,
    meta: {
      result: meta?.result,
      source: "manual",
    },
  });
}

export function previewSweep(now = new Date(), overrideCfg?: Settings["retention"]): PreviewItem[] {
  const cfg = getCfg(overrideCfg);
  if (!cfg.enabled) return [];

  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return [];

  const items: PreviewItem[] = [];
  for (const id of fs.readdirSync(dir)) {
    const meta = getSessionMeta(id);
    if (!meta || meta.hold) continue;
    if (!meta.closedAt) continue;

    const keepDays = cfg.days[meta.result] ?? 0;
    if (keepDays === 0) continue;

    const ageDays = (now.getTime() - new Date(meta.closedAt).getTime()) / DAY_MS;
    if (ageDays < keepDays) continue;

    items.push({
      id: meta.id,
      氏名: meta.氏名,
      役割: meta.役割,
      closedAt: meta.closedAt,
      result: meta.result,
      ageDays: Math.floor(ageDays),
      keepDays,
      willAnonymize: cfg.keepAnonymizedEval,
    });
  }
  return items.sort((a, b) => b.ageDays - a.ageDays);
}

/** 実スイープ実行（sessions → _trash、_trash → 完全削除） */
export function runSweep(now = new Date(), overrideCfg?: Settings["retention"]): SweepResult {
  const cfg = getCfg(overrideCfg);
  if (!cfg.enabled) {
    return { softDeleted: [], hardDeleted: [], anonymized: [] };
  }

  const sessions = sessionsDir();
  const trash = trashDir();
  ensureDir(trash);

  const result: SweepResult = { softDeleted: [], hardDeleted: [], anonymized: [] };
  const nowIso = now.toISOString();

  // 1) sessions → _trash（保存期限超過）
  if (fs.existsSync(sessions)) {
    for (const id of fs.readdirSync(sessions)) {
      const meta = getSessionMeta(id);
      if (!meta || meta.hold) continue;
      if (!meta.closedAt) continue;

      const keepDays = cfg.days[meta.result] ?? 0;
      if (keepDays === 0) continue;

      const ageDays = (now.getTime() - new Date(meta.closedAt).getTime()) / DAY_MS;
      if (ageDays < keepDays) continue;

      if (cfg.keepAnonymizedEval) {
        try {
          saveAnonymized(id, meta);
          result.anonymized.push(id);
        } catch (e) {
          appendLog(`${nowIso} anon-fail ${id} ${(e as Error).message}`);
        }
      }

      const from = path.join(sessions, id);
      const to = path.join(trash, id);
      // ゴミ箱に同名がある場合は上書き
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);

      appendLog(`${nowIso} soft ${id} ${meta.result}`);
      writeAudit("session.softDelete", {
        sessionId: id,
        meta: { result: meta.result, source: "auto-sweep" },
      });
      result.softDeleted.push(id);
    }
  }

  // 2) _trash → 完全削除（猶予超過）
  if (fs.existsSync(trash)) {
    for (const id of fs.readdirSync(trash)) {
      const dir = path.join(trash, id);
      if (!fs.statSync(dir).isDirectory()) continue;
      const trashedAt = fs.statSync(dir).mtime;
      const ageDays = (now.getTime() - trashedAt.getTime()) / DAY_MS;
      if (ageDays < cfg.softDeleteGraceDays) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      appendLog(`${nowIso} hard ${id}`);
      writeAudit("session.delete", {
        sessionId: id,
        meta: { source: "auto-sweep" },
      });
      result.hardDeleted.push(id);
    }
  }

  return result;
}

export interface TrashItem {
  id: string;
  trashedAt: string;
  meta: SessionMeta | null;
  remainingGraceDays: number;
}

/** ゴミ箱内のセッションを列挙 */
export function listTrash(now = new Date(), overrideCfg?: Settings["retention"]): TrashItem[] {
  const cfg = getCfg(overrideCfg);
  const trash = trashDir();
  if (!fs.existsSync(trash)) return [];

  return fs
    .readdirSync(trash)
    .filter((id) => {
      const p = path.join(trash, id);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    })
    .map((id) => {
      const dir = path.join(trash, id);
      const trashedAt = fs.statSync(dir).mtime;
      const metaPath = path.join(dir, "session.json");
      let meta: SessionMeta | null = null;
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as SessionMeta;
        } catch {}
      }
      const ageDays = (now.getTime() - trashedAt.getTime()) / DAY_MS;
      const remaining = Math.max(0, Math.ceil(cfg.softDeleteGraceDays - ageDays));
      return {
        id,
        trashedAt: trashedAt.toISOString(),
        meta,
        remainingGraceDays: remaining,
      };
    })
    .sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : -1));
}

/** ゴミ箱から sessions/ に復元 */
export function restoreFromTrash(id: string): void {
  const from = path.join(trashDir(), id);
  const to = path.join(sessionsDir(), id);
  if (!fs.existsSync(from)) throw new Error(`ゴミ箱に ${id} が見つかりません`);
  if (fs.existsSync(to)) throw new Error(`sessions/ に同名 ${id} が既に存在します`);
  ensureDir(sessionsDir());
  fs.renameSync(from, to);
  appendLog(`${new Date().toISOString()} restore ${id}`);
  writeAudit("session.restore", { sessionId: id });
}

/** ゴミ箱から完全削除（手動・即時） */
export function purgeFromTrash(id: string): void {
  const dir = path.join(trashDir(), id);
  if (!fs.existsSync(dir)) throw new Error(`ゴミ箱に ${id} が見つかりません`);
  fs.rmSync(dir, { recursive: true, force: true });
  appendLog(`${new Date().toISOString()} purge ${id}`);
  writeAudit("session.delete", {
    sessionId: id,
    meta: { source: "manual-purge" },
  });
}

/** logs/deletion.log を末尾から N 行読む */
export function tailDeletionLog(n = 50): string[] {
  const file = logPath();
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  return lines.slice(-n).reverse();
}
