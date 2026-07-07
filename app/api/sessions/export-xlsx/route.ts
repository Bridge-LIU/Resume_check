import {
  buildSessionsXlsx,
  type SessionsFilter,
} from "@/lib/excelMirror";
import { apiErrorResponse } from "@/lib/apiError";

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 絞込条件を「_」区切りの短い文字列に。氏名検索は「検索-xxx」で区別 */
function filterSuffix(filter: SessionsFilter): string {
  const parts: string[] = [];
  if (filter.state) parts.push(filter.state);
  if (filter.role) parts.push(filter.role);
  if (filter.verdict) parts.push(filter.verdict);
  if (filter.result) parts.push(filter.result);
  if (filter.q) parts.push(`検索-${filter.q}`);
  return parts.join("_");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter: SessionsFilter = {
      state: url.searchParams.get("state") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      result: url.searchParams.get("result") ?? undefined,
      verdict: url.searchParams.get("verdict") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    };
    const hasFilter = Object.values(filter).some((v) => v && v.length > 0);
    const buf = await buildSessionsXlsx(hasFilter ? filter : undefined);

    // ファイル名: 面談者一覧_YYYY-MM-DD[_絞込条件].xlsx
    const date = todayYmd();
    const suffix = hasFilter ? `_${filterSuffix(filter)}` : "";
    const jpFileName = `面談者一覧_${date}${suffix}.xlsx`;
    // 一部ブラウザの ASCII fallback。日本語は落として date + filtered だけ残す
    const asciiFileName = `sessions_${date}${hasFilter ? "_filtered" : ""}.xlsx`;
    const encoded = encodeURIComponent(jpFileName);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
