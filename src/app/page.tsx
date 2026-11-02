import { Runner } from "@/components/Runner";
import { DEMO_SCENARIO_ID, getScenario, scenarioConfig } from "@/engine";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ scenario?: string; mode?: string }> }) {
  const q = await searchParams;
  const id = q.scenario && getScenario(q.scenario) ? q.scenario : DEMO_SCENARIO_ID;
  const mode = q.mode === "faulty" ? "faulty" : "resilient";
  return <Runner key={`${id}-${mode}`} selectable initialConfig={scenarioConfig(id, { mode })} />;
}
