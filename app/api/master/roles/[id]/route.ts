import { NextResponse } from "next/server";
import { deleteRole, getRole, saveRole } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";
import { validateRoleMasterId, validateRoleObject } from "@/lib/validation";

function assertRole(body: unknown): Role {
  const result = validateRoleObject(body);
  if (!result.ok) {
    throw new ApiError("VALIDATION_ERROR", result.error, 400);
  }
  return result.value;
}

/**
 * URL セグメントの `[id]` を検証する。未検証で getRole/deleteRole に渡すと
 * `..%2F..%2Fconfig%2Fsettings` のような細工で sensitive ファイル
 * （config/settings.json には API キーが平文で入る）を読み書き／削除できる。
 */
function assertUrlId(id: string): string {
  const v = validateRoleMasterId(id);
  if (!v.ok) {
    throw new ApiError("VALIDATION_ERROR", v.error, 400);
  }
  return v.value;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/master/roles/[id]">) {
  try {
    const { id: rawId } = await ctx.params;
    const id = assertUrlId(rawId);
    const role = getRole(id);
    if (!role) {
      throw new ApiError("ROLE_NOT_FOUND", `ID「${id}」が存在しません`, 404);
    }
    return NextResponse.json(role);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: RouteContext<"/api/master/roles/[id]">) {
  try {
    ensureLocalOrigin(req);
    const { id: rawOriginalId } = await ctx.params;
    const originalId = assertUrlId(rawOriginalId);
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });
    const result = assertRole(body);

    const original = getRole(originalId);
    if (!original) {
      throw new ApiError("ROLE_NOT_FOUND", `ID「${originalId}」が存在しません`, 404);
    }

    // ID を変更している場合: 新 ID が他にぶつからないか確認 → 旧ファイル削除
    if (result.id !== originalId) {
      if (getRole(result.id)) {
        throw new ApiError("ROLE_ID_CONFLICT", `ID「${result.id}」は既に存在します`, 409);
      }
      deleteRole(originalId);
    }

    saveRole(result);
    writeAudit("master.role.upsert", {
      meta: {
        id: result.id,
        ...(result.id !== originalId ? { renamedFrom: originalId } : {}),
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/master/roles/[id]">) {
  try {
    ensureLocalOrigin(req);
    const { id: rawId } = await ctx.params;
    const id = assertUrlId(rawId);
    if (!getRole(id)) {
      throw new ApiError("ROLE_NOT_FOUND", `ID「${id}」が存在しません`, 404);
    }
    deleteRole(id);
    writeAudit("master.role.delete", { meta: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
