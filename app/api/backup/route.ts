import { NextResponse } from "next/server";
import { createBackup, deleteBackup, listBackups } from "@/lib/backup";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

const MIN_PASSWORD_LEN = 8;

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
        "暗号化パスワードは必須です",
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
    if (raw.length < MIN_PASSWORD_LEN) {
      throw new ApiError(
        "PASSWORD_TOO_SHORT",
        `パスワードは ${MIN_PASSWORD_LEN} 文字以上にしてください`,
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
      // ファイル存在オラクル防止のため、詳細メッセージはサーバログにのみ残し、
      // クライアントには一般化した文言を返す。
      console.error("[backup.delete] failed", target, e);
      throw new ApiError("DELETE_FAILED", "削除できませんでした", 400);
    }
    writeAudit("backup.delete", { meta: { file: basename(target) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
