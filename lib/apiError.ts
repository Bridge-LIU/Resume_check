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
