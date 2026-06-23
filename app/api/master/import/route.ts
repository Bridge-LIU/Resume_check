import { NextResponse } from "next/server";
import { importMaster } from "@/lib/storage";

export async function POST(req: Request) {
  const text = await req.text();
  try {
    const imported = importMaster(text);
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, imported: { roles: 0, evalAxes: 0 } },
      { status: 400 },
    );
  }
}
