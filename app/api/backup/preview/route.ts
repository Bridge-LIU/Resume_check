import { NextResponse } from "next/server";
import { previewBackup } from "@/lib/backup";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    const body = await req.json().catch(() => ({}));
    if (body === null || typeof body !== "object") {
      throw new ApiError("INVALID_BODY", "リクエスト本文が不正です", 400);
    }
    const b = body as Record<string, unknown>;
    const targetPath = b.path;
    const password = b.password;
    if (typeof targetPath !== "string" || !targetPath) {
      throw new ApiError(
        "INVALID_PATH",
        "プレビュー対象の path を指定してください",
        400,
      );
    }
    if (typeof password !== "string" || password.length === 0) {
      throw new ApiError(
        "PASSWORD_REQUIRED",
        "復号パスワードを入力してください",
        400,
      );
    }
    try {
      const result = await previewBackup({ path: targetPath, password });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isPasswordIssue = /復号失敗|パスワード/.test(message);
      throw new ApiError(
        isPasswordIssue ? "DECRYPT_FAILED" : "PREVIEW_FAILED",
        message,
        isPasswordIssue ? 400 : 500,
      );
    }
  } catch (e) {
    return apiErrorResponse(e);
  }
}
