import { NextResponse } from "next/server";
import { getEvalCriteria, saveEvalCriteria } from "@/lib/storage";
import type { EvalCriteria } from "@/lib/types";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";
import { validateEvalCriteriaObject } from "@/lib/validation";

function assertCriteria(body: unknown): EvalCriteria {
  const result = validateEvalCriteriaObject(body);
  if (!result.ok) {
    throw new ApiError("VALIDATION_ERROR", result.error, 400);
  }
  return result.value;
}

export async function GET() {
  try {
    const c = getEvalCriteria();
    if (!c) {
      throw new ApiError("CRITERIA_NOT_FOUND", "評価条件が見つかりません", 404);
    }
    return NextResponse.json(c);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    ensureLocalOrigin(req);
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });
    const result = assertCriteria(body);
    saveEvalCriteria(result);
    writeAudit("master.criteria.update", {
      meta: {
        小軸数: result.人間性.小軸.length + result.技術力.小軸.length,
        合格ライン: result.合格ライン,
        普通ライン: result.普通ライン,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
