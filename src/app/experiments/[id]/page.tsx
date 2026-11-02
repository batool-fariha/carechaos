import { notFound } from "next/navigation";
import { ExperimentView } from "@/components/ExperimentView";
import { getExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getExperiment(id);
  if (!row) notFound();
  return <ExperimentView id={row.id} config={row.config} status={row.status} createdAt={row.createdAt} />;
}
