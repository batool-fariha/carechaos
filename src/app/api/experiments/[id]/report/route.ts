import { NextResponse } from "next/server";
import { buildReport, reportToMarkdown, runExperiment } from "@/engine";
import { getExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/experiments/:id/report?format=json|md — regenerated from the stored config by replaying the engine. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getExperiment(id);
  if (!row) return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  if (row.status === "created") return NextResponse.json({ error: "Experiment has not been run yet." }, { status: 409 });
  const report = buildReport(runExperiment(row.config), { experimentId: row.id, runTimestamp: row.createdAt });
  const format = new URL(req.url).searchParams.get("format") === "md" ? "md" : "json";
  const headers = { "Content-Disposition": `attachment; filename="carechaos-${row.id}.${format}"` };
  if (format === "md") return new NextResponse(reportToMarkdown(report), { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" } });
  return new NextResponse(JSON.stringify(report, null, 2), { headers: { ...headers, "Content-Type": "application/json" } });
}
