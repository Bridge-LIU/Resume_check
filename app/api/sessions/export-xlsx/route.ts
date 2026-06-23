import {
  buildSessionsXlsx,
  SESSIONS_FILE,
  SESSIONS_FILE_ASCII,
} from "@/lib/excelMirror";
import { apiErrorResponse } from "@/lib/apiError";

export async function GET() {
  try {
    const buf = await buildSessionsXlsx();
    const encoded = encodeURIComponent(SESSIONS_FILE);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${SESSIONS_FILE_ASCII}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
