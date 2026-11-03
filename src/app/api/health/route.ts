import { NextResponse } from "next/server";
import { APP_VERSION, ENGINE_VERSION } from "@/engine";
import { storageInfo } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness plus storage status. Never returns secrets. */
export async function GET() {
  try {
    const s = await storageInfo();
    return NextResponse.json({ ok: true, version: APP_VERSION, engine: ENGINE_VERSION, storage: { kind: s.kind, persistent: s.persistent } });
  } catch {
    return NextResponse.json({ ok: false, version: APP_VERSION, engine: ENGINE_VERSION, storage: { kind: "unavailable", persistent: false } }, { status: 503 });
  }
}
