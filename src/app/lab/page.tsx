import { Runner } from "@/components/Runner";
import { DEMO_SCENARIO_ID, getScenario, scenarioConfig } from "@/engine";

export default async function Lab({ searchParams }: { searchParams: Promise<{ scenario?: string; mode?: string; autostart?: string }> }) {
  const q = await searchParams;
  const id = q.scenario && getScenario(q.scenario) ? q.scenario : DEMO_SCENARIO_ID;
  const mode = q.mode === "faulty" ? "faulty" : "resilient";
  return <Runner key={`${id}-${mode}`} selectable autoStart={q.autostart === "1"} initialConfig={scenarioConfig(id, { mode })} />;
}
