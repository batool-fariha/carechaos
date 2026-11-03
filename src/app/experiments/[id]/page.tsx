import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperimentView } from "@/components/ExperimentView";
import { getExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getExperiment(id).catch(() => null);
  if (!row) return { title: "Experiment not found · CareChaos" };
  return { title: `${row.name} · CareChaos`, description: `${row.scenarioId} in ${row.mode} mode, seed ${row.seed}. A simulated run: all data is fictional.` };
}

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getExperiment(id);
  if (!row) notFound();
  return <ExperimentView id={row.id} config={row.config} status={row.status} createdAt={row.createdAt} />;
}
