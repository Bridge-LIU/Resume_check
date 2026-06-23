import { NextResponse } from "next/server";
import { deleteRole, getRole, saveRole } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { ApiError, apiErrorResponse } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";
import { validateRoleMasterId, validateRoleName } from "@/lib/validation";

function validate(body: unknown): Role {
  if (!body || typeof body !== "object") {
    throw new ApiError("INVALID_BODY", "Invalid body", 400);
  }
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string") {
    throw new ApiError("VALIDATION_ERROR", "id は必須です", 400);
  }
  const idResult = validateRoleMasterId(b.id);
  if (!idResult.ok) {
    throw new ApiError("VALIDATION_ERROR", idResult.error, 400);
  }
  if (typeof b.役割 !== "string") {
    throw new ApiError("VALIDATION_ERROR", "役割は必須です", 400);
  }
  const nameResult = validateRoleName(b.役割);
  if (!nameResult.ok) {
    throw new ApiError("VALIDATION_ERROR", nameResult.error, 400);
  }
  if (typeof b.経験 !== "string") {
    throw new ApiError("VALIDATION_ERROR", "経験は文字列で指定してください", 400);
  }
  if (typeof b.未経験可 !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", "未経験可は真偽値で指定してください", 400);
  }
  if (!Array.isArray(b.条件1_基本人物像) || !b.条件1_基本人物像.every((x) => typeof x === "string")) {
    throw new ApiError("VALIDATION_ERROR", "条件1_基本人物像 は文字列配列で指定してください", 400);
  }
  if (!Array.isArray(b.条件2_未経験者必須) || !b.条件2_未経験者必須.every((x) => typeof x === "string")) {
    throw new ApiError("VALIDATION_ERROR", "条件2_未経験者必須 は文字列配列で指定してください", 400);
  }
  return {
    id: idResult.value,
    役割: nameResult.value,
    経験: (b.経験 as string).trim(),
    未経験可: b.未経験可 as boolean,
    条件1_基本人物像: b.条件1_基本人物像 as string[],
    条件2_未経験者必須: b.条件2_未経験者必須 as string[],
  };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/master/roles/[id]">) {
  try {
    const { id } = await ctx.params;
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
    const { id: originalId } = await ctx.params;
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });
    const result = validate(body);

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

export async function DELETE(_req: Request, ctx: RouteContext<"/api/master/roles/[id]">) {
  try {
    const { id } = await ctx.params;
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
