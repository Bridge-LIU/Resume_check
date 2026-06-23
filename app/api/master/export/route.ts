import { NextResponse } from "next/server";
import { exportMaster } from "@/lib/storage";

export async function GET() {
  const body = exportMaster();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="master-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
