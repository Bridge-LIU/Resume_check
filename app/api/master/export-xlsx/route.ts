import {
  buildMasterXlsx,
  MASTER_FILE,
  MASTER_FILE_ASCII,
} from "@/lib/excelMirror";
import { apiErrorResponse } from "@/lib/apiError";

export async function GET() {
  try {
    const buf = await buildMasterXlsx();
    // RFC 5987: 日本語ファイル名は filename*=UTF-8'' で渡し、ASCII fallback も併記
    const encoded = encodeURIComponent(MASTER_FILE);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${MASTER_FILE_ASCII}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
