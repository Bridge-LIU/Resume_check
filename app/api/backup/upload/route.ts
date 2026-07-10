import { NextResponse } from "next/server";
import { writeUploadedBackup } from "@/lib/backup";
import { ApiError, apiErrorResponse, ensureLocalOrigin } from "@/lib/apiError";
import { writeAudit } from "@/lib/auditLog";

// バックアップ本体はメガバイト級もありうるので上限を大きめに。
// ただし DoS 防御として明示上限を設ける。
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500 MB

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export async function POST(req: Request) {
  try {
    ensureLocalOrigin(req);

    // multipart/form-data で file フィールドを受け取る
    const form = await req.formData().catch(() => null);
    if (!form) {
      throw new ApiError(
        "INVALID_BODY",
        "multipart/form-data として受信できませんでした",
        400,
      );
    }
    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw new ApiError(
        "INVALID_FILE",
        "file フィールドにファイルを添付してください",
        400,
      );
    }
    if (file.size === 0) {
      throw new ApiError("INVALID_FILE", "空ファイルです", 400);
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      throw new ApiError(
        "FILE_TOO_LARGE",
        `ファイルサイズは ${Math.floor(MAX_UPLOAD_SIZE / 1024 / 1024)} MB 以下にしてください`,
        400,
      );
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    let saved: { path: string; size: number };
    try {
      saved = writeUploadedBackup(buf);
    } catch (e) {
      throw new ApiError(
        "UPLOAD_REJECTED",
        e instanceof Error ? e.message : String(e),
        400,
      );
    }

    writeAudit("backup.create", {
      meta: {
        file: basename(saved.path),
        size: saved.size,
        encrypted: true,
        source: "upload",
      },
    });

    return NextResponse.json({
      ok: true,
      backup: {
        path: saved.path,
        size: saved.size,
        encrypted: true,
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
