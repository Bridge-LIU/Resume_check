import { NextResponse } from "next/server";
import { importMaster } from "@/lib/storage";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";

// マスタ JSON は通常 数十 KB 程度。10 MB を超える入力は明らかに異常 / 攻撃。
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    // Content-Type 検査: text/plain か application/json のみ受け付ける
    const contentType = req.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("application/json") &&
      !contentType.includes("text/plain")
    ) {
      throw new ApiError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type は application/json または text/plain を指定してください",
        415,
      );
    }

    // Content-Length での先制チェック（Body 全体を読まずに弾く）
    const lenHeader = req.headers.get("content-length");
    if (lenHeader) {
      const len = Number(lenHeader);
      if (Number.isFinite(len) && len > MAX_IMPORT_BYTES) {
        throw new ApiError(
          "PAYLOAD_TOO_LARGE",
          `本文が大きすぎます（${len.toLocaleString()} バイト > 上限 ${MAX_IMPORT_BYTES.toLocaleString()}）`,
          413,
        );
      }
    }

    const text = await req.text();
    if (text.length > MAX_IMPORT_BYTES) {
      throw new ApiError(
        "PAYLOAD_TOO_LARGE",
        `本文が大きすぎます（${text.length.toLocaleString()} 文字 > 上限 ${MAX_IMPORT_BYTES.toLocaleString()}）`,
        413,
      );
    }

    const imported = importMaster(text);
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    if (e instanceof ApiError) {
      return apiErrorResponse(e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, imported: { roles: 0, evalAxes: 0 } },
      { status: 400 },
    );
  }
}
