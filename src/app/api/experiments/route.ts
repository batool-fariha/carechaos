import { NextResponse } from "next/server";
import { z } from "zod";
import { validateConfig } from "@/engine";
import { clearExperiments, listExperiments, saveExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";

const body = z.object({ config: z.unknown(), status: z.enum(["created", "completed", "stopped"]).default("created") });

export async function GET() {
  try {
    return NextResponse.json({ experiments: await listExperiments() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { config, status }." }, { status: 400 });
  const v = validateConfig(parsed.data.config);
  if (!v.ok) return NextResponse.json({ error: "Invalid experiment configuration.", issues: v.issues }, { status: 422 });
  try {
    const row = await saveExperiment(v.config, parsed.data.status);
    return NextResponse.json({ id: row.id, experiment: row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** Deletes all stored experiments (Settings page). */
export async function DELETE() {
  try {
    return NextResponse.json({ deleted: await clearExperiments() });
  } catch (e) {
    return fail(e);
  }
}

function fail(e: unknown) {
  console.error(JSON.stringify({ level: "error", msg: "experiments api failure", error: String(e) }));
  return NextResponse.json({ error: "Experiment storage is unavailable. The simulator still works; results just won't be saved." }, { status: 500 });
}
