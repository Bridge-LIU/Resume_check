import { NextResponse } from "next/server";
import { getRole, saveRole } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { ApiError, apiErrorResponse } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";

const ID_PATTERN = /^[A-Za-z0-9_\-ぁ-んァ-ン一-龥]+$/;

function validateRole(body: unknown): Role | string {
  if (!body || typeof body !== "object") return "オブジェクトではありません";
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id.trim()) return "id は必須です";
  if (!ID_PATTERN.test(b.id)) return "id に使用できない文字が含まれています";
  if (typeof b.役割 !== "string" || !b.役割.trim()) return "役割は必須です";
  if (typeof b.経験 !== "string") return "経験は文字列で指定してください";
  if (typeof b.未経験可 !== "boolean") return "未経験可は真偽値で指定してください";
  if (!Array.isArray(b.条件1_基本人物像) || !b.条件1_基本人物像.every((x) => typeof x === "string"))
    return "条件1_基本人物像 は文字列配列で指定してください";
  if (!Array.isArray(b.条件2_未経験者必須) || !b.条件2_未経験者必須.every((x) => typeof x === "string"))
    return "条件2_未経験者必須 は文字列配列で指定してください";
  return {
    id: b.id.trim(),
    役割: b.役割.trim(),
    経験: (b.経験 as string).trim(),
    未経験可: b.未経験可 as boolean,
    条件1_基本人物像: b.条件1_基本人物像 as string[],
    条件2_未経験者必須: b.条件2_未経験者必須 as string[],
  };
}

/**
 * 一括 import。受け付ける形式:
 *   - { version: "1.0", roles: Role[], overwrite?: boolean }
 *   - { roles: Role[], overwrite?: boolean }
 *   - Role[]  （後方互換）
 * overwrite=false（既定）のとき、既存 ID は skipped に積む。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });

    let rolesRaw: unknown;
    let overwrite = false;
    if (Array.isArray(body)) {
      rolesRaw = body;
    } else if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      rolesRaw = b.roles;
      overwrite = b.overwrite === true;
    } else {
      throw new ApiError("INVALID_BODY", "Invalid body", 400);
    }

    if (!Array.isArray(rolesRaw)) {
      throw new ApiError("VALIDATION_ERROR", "roles は配列で指定してください", 400);
    }
    if (rolesRaw.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "roles が空です", 400);
    }

    // 先に全件 validate して、1件でもエラーがあれば書き込まない（部分書き込み回避）
    const validated: Role[] = [];
    const rowErrors: { index: number; error: string }[] = [];
    for (let i = 0; i < rolesRaw.length; i++) {
      const r = validateRole(rolesRaw[i]);
      if (typeof r === "string") {
        rowErrors.push({ index: i, error: r });
        continue;
      }
      validated.push(r);
    }
    if (rowErrors.length > 0) {
      const hint = rowErrors.map((e) => `[${e.index}] ${e.error}`).join(" / ");
      throw new ApiError(
        "IMPORT_VALIDATION_FAILED",
        "検証エラーがあるため書き込みを中止しました",
        400,
        hint,
      );
    }

    // ファイル内の重複 ID
    const seen = new Set<string>();
    for (const r of validated) {
      if (seen.has(r.id)) {
        throw new ApiError(
          "IMPORT_DUPLICATE_ID",
          `ファイル内で ID「${r.id}」が重複しています`,
          400,
        );
      }
      seen.add(r.id);
    }

    const imported: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const r of validated) {
      const existing = getRole(r.id);
      if (existing && !overwrite) {
        skipped.push({ id: r.id, reason: "既存（overwrite=false のためスキップ）" });
        continue;
      }
      saveRole(r);
      imported.push(r.id);
    }

    writeAudit("master.import", {
      meta: {
        importedCount: imported.length,
        skippedCount: skipped.length,
        overwrite,
      },
    });
    return NextResponse.json({ imported, skipped, errors: [] });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
