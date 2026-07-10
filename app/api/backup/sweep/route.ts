import { NextResponse } from "next/server";
import { sweepBackups } from "@/lib/backup";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";

function parseOptionalNumber(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new ApiError(
      "INVALID_PARAM",
      `${field} は 0 以上の数値で指定してください`,
      400,
    );
  }
  return Math.floor(raw);
}

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    const body = await req.json().catch(() => ({}));
    if (body !== null && typeof body !== "object") {
      throw new ApiError("INVALID_BODY", "リクエスト本文が不正です", 400);
    }
    const b = (body as Record<string, unknown> | null) ?? {};
    const keepDays = parseOptionalNumber(b.keepDays, "keepDays");
    const maxGenerations = parseOptionalNumber(b.maxGenerations, "maxGenerations");
    const result = sweepBackups({ keepDays, maxGenerations });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ApiError) return apiErrorResponse(e);
    const message = e instanceof Error ? e.message : String(e);
    return apiErrorResponse(new ApiError("SWEEP_FAILED", message, 500));
  }
}
