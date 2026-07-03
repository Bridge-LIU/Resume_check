import { NextResponse } from "next/server";
import { getRole, saveRole } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";
import { validateRoleObject } from "@/lib/validation";

// 共通バリデータに委譲。以前は ID パターンが ASCII+日本語混在で、
// storage.ts:assertRoleId の ASCII 限定と食い違っていた（次回 get で throw する不整合）。
function validateRole(body: unknown): Role | string {
  const result = validateRoleObject(body);
  return result.ok ? result.value : result.error;
}

/**
 * 一括 import。受け付ける形式:
 *   - { version: "1.0", roles: Role[], overwrite?: boolean }
 *   - { roles: Role[], overwrite?: boolean }
 *   - Role[]  （後方互換）
 * overwrite=false（既定）のとき、既存 ID は skipped に積む。
 */
// 通常数十 KB のマスタ JSON。10 MB を超える入力は明らかに異常 / 攻撃。
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);
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

    const rawText = await req.text();
    if (rawText.length > MAX_IMPORT_BYTES) {
      throw new ApiError(
        "PAYLOAD_TOO_LARGE",
        `本文が大きすぎます（${rawText.length.toLocaleString()} 文字 > 上限 ${MAX_IMPORT_BYTES.toLocaleString()}）`,
        413,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    }

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
