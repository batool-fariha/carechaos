import { ExperimentForm } from "@/components/ExperimentForm";

export default async function NewExperiment({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { scenario } = await searchParams;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New experiment</h1>
        <p className="mt-1 text-sm text-mute">Choose a preset, adjust the workload and fault, then run it. Everything is validated before it reaches the engine.</p>
      </div>
      <ExperimentForm initialScenario={scenario ?? "alert-service-outage"} />
    </div>
  );
}
