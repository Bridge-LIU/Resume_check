import { NextResponse } from "next/server";
import { getEvalCriteria, saveEvalCriteria } from "@/lib/storage";
import type { EvalAxis, EvalCriteria, RoleEvalOverride } from "@/lib/types";
import { ApiError, apiErrorResponse } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";

function parseRoleOverrides(
  raw: unknown,
  axisCount: number,
): Record<string, RoleEvalOverride> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("VALIDATION_ERROR", "ロール別 はオブジェクトで指定してください", 400);
  }
  const out: Record<string, RoleEvalOverride> = {};
  for (const [roleId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") {
      throw new ApiError("VALIDATION_ERROR", `ロール別.${roleId} はオブジェクトで指定してください`, 400);
    }
    const ov = val as Record<string, unknown>;
    const entry: RoleEvalOverride = {};
    if (ov.重み !== undefined) {
      if (
        !Array.isArray(ov.重み) ||
        !ov.重み.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
      ) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `ロール別.${roleId}.重み は正の数値配列で指定してください`,
          400,
        );
      }
      if (ov.重み.length > axisCount) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `ロール別.${roleId}.重み の長さ(${ov.重み.length})が評価軸数(${axisCount})を超えています`,
          400,
        );
      }
      entry.重み = ov.重み as number[];
    }
    if (ov.合格ライン !== undefined) {
      if (typeof ov.合格ライン !== "number" || !Number.isFinite(ov.合格ライン)) {
        throw new ApiError("VALIDATION_ERROR", `ロール別.${roleId}.合格ライン は数値で指定してください`, 400);
      }
      entry.合格ライン = ov.合格ライン;
    }
    if (ov.普通ライン !== undefined) {
      if (typeof ov.普通ライン !== "number" || !Number.isFinite(ov.普通ライン)) {
        throw new ApiError("VALIDATION_ERROR", `ロール別.${roleId}.普通ライン は数値で指定してください`, 400);
      }
      entry.普通ライン = ov.普通ライン;
    }
    if (Object.keys(entry).length > 0) out[roleId] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseAxes(raw: unknown): EvalAxis[] {
  if (!Array.isArray(raw)) {
    throw new ApiError("VALIDATION_ERROR", "評価軸 は配列で指定してください", 400);
  }
  if (raw.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "評価軸 は1つ以上必要です", 400);
  }
  const out: EvalAxis[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    // 旧形式（文字列）も受け付ける
    if (typeof a === "string") {
      const 名前 = a.trim();
      if (!名前) throw new ApiError("VALIDATION_ERROR", `評価軸[${i}].名前 が空です`, 400);
      if (seen.has(名前)) throw new ApiError("VALIDATION_ERROR", `評価軸「${名前}」が重複しています`, 400);
      seen.add(名前);
      out.push({ 名前, 重み: 1 });
      continue;
    }
    if (!a || typeof a !== "object") {
      throw new ApiError("VALIDATION_ERROR", `評価軸[${i}] はオブジェクトで指定してください`, 400);
    }
    const o = a as Record<string, unknown>;
    if (typeof o.名前 !== "string" || !o.名前.trim()) {
      throw new ApiError("VALIDATION_ERROR", `評価軸[${i}].名前 は必須です`, 400);
    }
    if (typeof o.重み !== "number" || !Number.isFinite(o.重み) || o.重み <= 0) {
      throw new ApiError("VALIDATION_ERROR", `評価軸[${i}].重み は正の数値で指定してください`, 400);
    }
    const 名前 = o.名前.trim();
    if (seen.has(名前)) throw new ApiError("VALIDATION_ERROR", `評価軸「${名前}」が重複しています`, 400);
    seen.add(名前);
    out.push({ 名前, 重み: o.重み });
  }
  return out;
}

function validate(body: unknown): EvalCriteria {
  if (!body || typeof body !== "object") {
    throw new ApiError("INVALID_BODY", "Invalid body", 400);
  }
  const b = body as Record<string, unknown>;
  if (b.方式 !== "BARS") {
    throw new ApiError("VALIDATION_ERROR", "方式 は \"BARS\" のみ対応しています", 400);
  }
  const axes = parseAxes(b.評価軸);
  if (!b.スケール || typeof b.スケール !== "object") {
    throw new ApiError("VALIDATION_ERROR", "スケール が不正です", 400);
  }
  const sc = b.スケール as Record<string, unknown>;
  if (typeof sc.最小 !== "number") throw new ApiError("VALIDATION_ERROR", "スケール.最小 は数値で指定してください", 400);
  if (typeof sc.最大 !== "number") throw new ApiError("VALIDATION_ERROR", "スケール.最大 は数値で指定してください", 400);
  if (typeof sc.刻み !== "number") throw new ApiError("VALIDATION_ERROR", "スケール.刻み は数値で指定してください", 400);
  if (sc.最大 <= sc.最小) throw new ApiError("VALIDATION_ERROR", "スケール.最大 は最小より大きい必要があります", 400);
  if (sc.刻み <= 0) throw new ApiError("VALIDATION_ERROR", "スケール.刻み は正の数で指定してください", 400);
  if (typeof sc.段階数 !== "number") throw new ApiError("VALIDATION_ERROR", "スケール.段階数 は数値で指定してください", 400);
  if (typeof b.合格ライン !== "number") throw new ApiError("VALIDATION_ERROR", "合格ライン は数値で指定してください", 400);
  if (typeof b.普通ライン !== "number") throw new ApiError("VALIDATION_ERROR", "普通ライン は数値で指定してください", 400);
  if (typeof b.自己解決レベル !== "string") throw new ApiError("VALIDATION_ERROR", "自己解決レベル は文字列で指定してください", 400);
  if (!Array.isArray(b.出力) || !b.出力.every((x) => typeof x === "string")) {
    throw new ApiError("VALIDATION_ERROR", "出力 は文字列配列で指定してください", 400);
  }
  const overrides = parseRoleOverrides(b.ロール別, axes.length);
  return {
    方式: "BARS",
    評価軸: axes,
    スケール: {
      最小: sc.最小 as number,
      最大: sc.最大 as number,
      刻み: sc.刻み as number,
      段階数: sc.段階数 as number,
    },
    合格ライン: b.合格ライン as number,
    普通ライン: b.普通ライン as number,
    自己解決レベル: b.自己解決レベル as string,
    出力: b.出力 as string[],
    ...(overrides ? { ロール別: overrides } : {}),
  };
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
    const body = await req.json().catch(() => {
      throw new ApiError("JSON_PARSE_FAILED", "JSON を解析できませんでした", 400);
    });
    const result = validate(body);
    saveEvalCriteria(result);
    writeAudit("master.criteria.update", {
      meta: {
        軸数: result.評価軸.length,
        合格ライン: result.合格ライン,
        普通ライン: result.普通ライン,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
