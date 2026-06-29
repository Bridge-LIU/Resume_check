import { NextResponse } from "next/server";
import { createBackup, deleteBackup, listBackups } from "@/lib/backup";
import { ApiError, apiErrorResponse } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * ローカル端末で動かす前提のため、Origin / Referer を localhost に限定し、
 * 他オリジン（ブラウザ拡張・別タブからの fetch）からの破壊的操作を拒否する。
 * GET（listBackups）は影響が小さいので適用しない。
 */
function ensureLocalOrigin(req: Request): void {
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  if (!origin) return; // same-origin fetch では Origin が付かないこともある（許可）
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    throw new ApiError("FORBIDDEN_ORIGIN", "不正な Origin ヘッダです", 403);
  }
  const allowed = new Set([
    "localhost:3939",
    "127.0.0.1:3939",
    "[::1]:3939",
  ]);
  if (!allowed.has(host)) {
    throw new ApiError(
      "FORBIDDEN_ORIGIN",
      "ローカル以外からの破壊的操作は許可されていません",
      403,
    );
  }
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, backups: listBackups() });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    const body = await req.json().catch(() => ({}));
    if (body !== null && typeof body !== "object") {
      throw new ApiError("INVALID_BODY", "リクエスト本文が不正です", 400);
    }
    const raw = (body as Record<string, unknown> | null)?.password;
    if (raw === undefined || raw === null || raw === "") {
      throw new ApiError(
        "PASSWORD_REQUIRED",
        "暗号化パスワードは必須です（設計書 §11）",
        400,
      );
    }
    if (typeof raw !== "string") {
      throw new ApiError(
        "INVALID_PASSWORD",
        "password は文字列で指定してください",
        400,
      );
    }
    const password = raw;
    const backup = await createBackup({ password });
    writeAudit("backup.create", {
      meta: {
        file: basename(backup.path),
        size: backup.size,
        encrypted: backup.encrypted,
      },
    });
    return NextResponse.json({ ok: true, backup });
  } catch (e) {
    if (e instanceof ApiError) return apiErrorResponse(e);
    const message = e instanceof Error ? e.message : String(e);
    return apiErrorResponse(
      new ApiError("BACKUP_FAILED", message, 500),
    );
  }
}

export async function DELETE(req: Request) {
  try {
    ensureLocalOrigin(req);
    const url = new URL(req.url);
    const target = url.searchParams.get("path");
    if (!target) {
      throw new ApiError(
        "INVALID_PATH",
        "削除対象の path を指定してください",
        400,
      );
    }
    try {
      deleteBackup(target);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ApiError("DELETE_FAILED", message, 400);
    }
    writeAudit("backup.delete", { meta: { file: basename(target) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
