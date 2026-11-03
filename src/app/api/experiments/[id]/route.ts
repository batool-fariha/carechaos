import { NextResponse } from "next/server";
import { z } from "zod";
import { validateConfig } from "@/engine";
import { deleteExperiment, getExperiment, publicRow, saveExperiment } from "@/lib/db";
import { getOwner } from "@/lib/owner";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { tooMany } from "../route";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Anyone with the link can read an experiment (that is how sharing works). Only its owner can change it. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const row = await getExperiment(id);
  return row ? NextResponse.json({ experiment: publicRow(row) }) : NextResponse.json({ error: "Experiment not found." }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const limited = rateLimit(`w:${clientKey(req)}`);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const { id } = await params;
  const parsed = z.object({ config: z.unknown(), status: z.enum(["created", "completed", "stopped"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { config, status }." }, { status: 400 });
  const row = await getExperiment(id);
  if (!row) return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  const owner = await getOwner();
  if (!owner || row.owner !== owner) return NextResponse.json({ error: "Only the browser that created this experiment can change it." }, { status: 403 });
  const v = validateConfig(parsed.data.config);
  if (!v.ok) return NextResponse.json({ error: "Invalid experiment configuration.", issues: v.issues }, { status: 422 });
  return NextResponse.json({ experiment: publicRow(await saveExperiment(v.config, parsed.data.status, owner, id)) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const limited = rateLimit(`w:${clientKey(req)}`);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const { id } = await params;
  const owner = await getOwner();
  const ok = owner ? await deleteExperiment(id, owner) : false;
  return ok ? NextResponse.json({ deleted: id }) : NextResponse.json({ error: "Not found, or not yours to delete." }, { status: 404 });
}
