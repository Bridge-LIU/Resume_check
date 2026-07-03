import { NextResponse } from "next/server";
import { getRole, listRoles, saveRole } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";
import { validateRoleObject } from "@/lib/validation";

function assertRole(body: unknown): Role {
  const result = validateRoleObject(body);
  if (!result.ok) {
    throw new ApiError("VALIDATION_ERROR", result.error, 400);
  }
  return result.value;
}

export async function GET() {
  try {
    return NextResponse.json(listRoles());
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });
    const result = assertRole(body);
    if (getRole(result.id)) {
      throw new ApiError("ROLE_ID_CONFLICT", `ID「${result.id}」は既に存在します`, 409);
    }
    saveRole(result);
    writeAudit("master.role.upsert", {
      meta: { id: result.id, created: true },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
