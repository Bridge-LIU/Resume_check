import { NextResponse } from "next/server";

export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    hint?: string;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint?: string;

  constructor(code: string, message: string, status: number, hint?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

/**
 * Route Handler 用の CSRF ガード。破壊的な verb（POST / PUT / DELETE / PATCH）で呼ぶ。
 *
 * Next.js の Server Actions は same-origin 検査が組み込まれているが、Route Handlers には無い。
 * このツールは localhost 前提のため、下記のいずれかを満たさない要求は 403 で弾く：
 *   1. `Sec-Fetch-Site` が `same-origin` または `none`（ブラウザ発 same-origin ／ アドレスバー直打ち）
 *   2. `Origin` または `Referer` の host が localhost:${PORT} / 127.0.0.1:${PORT} / [::1]:${PORT}
 *
 * PORT は環境変数（既定 3939）に追従。scripts/next-with-port.mjs が起動時にサーバ側と一致させる。
 *
 * `Content-Type: text/plain` を使った simple CSRF fetch を防ぐのが主目的。
 */
const PORT = process.env.PORT || "3939";
const LOCAL_HOSTS = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  `[::1]:${PORT}`,
]);

export function ensureLocalOrigin(req: Request): void {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    throw new ApiError(
      "FORBIDDEN_ORIGIN",
      "ローカル以外からの破壊的操作は許可されていません",
      403,
    );
  }
  const originRaw = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  if (!originRaw) {
    // sec-fetch-site が付いている（=ブラウザ発）かつ same-origin/none は許可。
    // 3 ヘッダとも欠けているのは referrer policy を無効化した拡張 / iframe の可能性。
    if (fetchSite == null) {
      throw new ApiError(
        "FORBIDDEN_ORIGIN",
        "破壊的操作には Origin / Referer / Sec-Fetch-Site のいずれかが必要です",
        403,
      );
    }
    return;
  }
  let host = "";
  try {
    host = new URL(originRaw).host;
  } catch {
    throw new ApiError("FORBIDDEN_ORIGIN", "不正な Origin ヘッダです", 403);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new ApiError(
      "FORBIDDEN_ORIGIN",
      "ローカル以外からの破壊的操作は許可されていません",
      403,
    );
  }
}

export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.hint !== undefined ? { hint: err.hint } : {}),
      },
    };
    return NextResponse.json(body, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  const body: ApiErrorBody = {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  };
  return NextResponse.json(body, { status: 500 });
}
