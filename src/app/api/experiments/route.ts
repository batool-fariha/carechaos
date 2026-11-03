import { NextResponse } from "next/server";
import { z } from "zod";
import { validateConfig } from "@/engine";
import { clearExperiments, listExperiments, publicRow, saveExperiment } from "@/lib/db";
import { ensureOwner, getOwner } from "@/lib/owner";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const body = z.object({ config: z.unknown(), status: z.enum(["created", "completed", "stopped"]).default("created") });

/** Lists the caller's own experiments (identified by an anonymous cookie). */
export async function GET() {
  try {
    const owner = await getOwner();
    return NextResponse.json({ experiments: owner ? (await listExperiments(owner)).map(publicRow) : [] });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const limited = rateLimit(`w:${clientKey(req)}`);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { config, status }." }, { status: 400 });
  const v = validateConfig(parsed.data.config);
  if (!v.ok) return NextResponse.json({ error: "Invalid experiment configuration.", issues: v.issues }, { status: 422 });
  try {
    const owner = await ensureOwner();
    const row = await saveExperiment(v.config, parsed.data.status, owner);
    return NextResponse.json({ id: row.id, experiment: publicRow(row) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** Deletes the caller's own experiment history only. */
export async function DELETE(req: Request) {
  const limited = rateLimit(`w:${clientKey(req)}`);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  try {
    const owner = await getOwner();
    return NextResponse.json({ deleted: owner ? await clearExperiments(owner) : 0 });
  } catch (e) {
    return fail(e);
  }
}

export function tooMany(retryAfterSec: number) {
  return NextResponse.json({ error: `Too many requests. Try again in ${retryAfterSec}s.` }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}

function fail(e: unknown) {
  console.error(JSON.stringify({ level: "error", msg: "experiments api failure", error: String(e) }));
  return NextResponse.json({ error: "Experiment storage is unavailable. The simulator still works; results just won't be saved." }, { status: 500 });
}
