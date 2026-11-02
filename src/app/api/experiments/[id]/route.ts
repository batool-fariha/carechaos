import { NextResponse } from "next/server";
import { z } from "zod";
import { validateConfig } from "@/engine";
import { deleteExperiment, getExperiment, saveExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const row = getExperiment(id);
  return row ? NextResponse.json({ experiment: row }) : NextResponse.json({ error: "Experiment not found." }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = z.object({ config: z.unknown(), status: z.enum(["created", "completed", "stopped"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { config, status }." }, { status: 400 });
  if (!getExperiment(id)) return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  const v = validateConfig(parsed.data.config);
  if (!v.ok) return NextResponse.json({ error: "Invalid experiment configuration.", issues: v.issues }, { status: 422 });
  return NextResponse.json({ experiment: saveExperiment(v.config, parsed.data.status, id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteExperiment(id);
  return NextResponse.json({ deleted: id });
}
