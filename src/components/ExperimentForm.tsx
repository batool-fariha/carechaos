"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SCENARIOS, getScenario, makeFault, scenarioConfig, validateConfig, type ExperimentConfig, type FaultConfig } from "@/engine";
import { FaultFields } from "./FaultInjector";
import { Button, Card, Field, inputClass } from "./ui";

export function ExperimentForm({ initialScenario }: { initialScenario: string }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ExperimentConfig>(() => scenarioConfig(getScenario(initialScenario) ? initialScenario : "alert-service-outage"));
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validation = useMemo(() => validateConfig(cfg), [cfg]);
  const issues = validation.ok ? [] : validation.issues;
  const err = (path: string) => issues.find((i) => i.path === path || i.path.endsWith(`.${path}`))?.message;
  const faultErrors = (idx: number) => {
    const out: Record<string, string> = {};
    issues.filter((i) => i.path.startsWith(`faults.${idx}.`)).forEach((i) => (out[i.path.split(".").pop() as string] = i.message));
    return out;
  };
  const setFault = (idx: number, f: FaultConfig) => set({ faults: cfg.faults.map((x, i) => (i === idx ? f : x)) });
  const set = (p: Partial<ExperimentConfig>) => setCfg({ ...cfg, ...p });
  const num = (v: string) => (v === "" ? NaN : Number(v));

  function applyPreset(id: string) {
    const next = scenarioConfig(id, { seed: cfg.seed, mode: cfg.mode });
    setCfg(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.ok) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: validation.config, status: "created" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create experiment");
      router.push(`/experiments/${data.id}`);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Could not create experiment");
      setBusy(false);
    }
  }

  const scenario = getScenario(cfg.scenarioId);
  return (
    <form onSubmit={submit} className="space-y-5" noValidate data-testid="experiment-form">
      <Card title="1 · Scenario preset">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Preset" htmlFor="scenario" hint={scenario?.description}>
            <select id="scenario" className={inputClass} value={cfg.scenarioId} onChange={(e) => applyPreset(e.target.value)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Experiment name" htmlFor="name" error={err("name")}>
            <input id="name" className={inputClass} value={cfg.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
        </div>
        {scenario && <p className="mt-3 text-sm text-mute"><b className="text-ink">Hypothesis:</b> {scenario.hypothesis}</p>}
      </Card>

      <Card title="2 · Workload and window">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Simulation seed" htmlFor="seed" hint="Same seed and configuration always reproduce the same result." error={err("seed")}>
            <input id="seed" type="number" className={inputClass} value={Number.isNaN(cfg.seed) ? "" : cfg.seed} onChange={(e) => set({ seed: num(e.target.value) })} />
          </Field>
          <Field label="Event volume (readings)" htmlFor="eventCount" hint="Synthetic readings to generate (1–2000)." error={err("eventCount")}>
            <input id="eventCount" type="number" className={inputClass} value={Number.isNaN(cfg.eventCount) ? "" : cfg.eventCount} onChange={(e) => set({ eventCount: num(e.target.value) })} />
          </Field>
          <Field label="Reading interval (s)" htmlFor="intervalSec" hint="Virtual seconds between readings." error={err("intervalSec")}>
            <input id="intervalSec" type="number" step={0.1} className={inputClass} value={Number.isNaN(cfg.intervalSec) ? "" : cfg.intervalSec} onChange={(e) => set({ intervalSec: num(e.target.value) })} />
          </Field>
          <Field label="Simulation duration (s)" htmlFor="durationSec" hint="Observation window in virtual seconds. Unfinished events at the end are reported." error={err("durationSec")}>
            <input id="durationSec" type="number" className={inputClass} value={Number.isNaN(cfg.durationSec) ? "" : cfg.durationSec} onChange={(e) => set({ durationSec: num(e.target.value) })} />
          </Field>
          <Field label="Resilience mode" htmlFor="mode" hint="Resilient: idempotency, bounded retries, durable queue, stale-data flags, gap detection. Faulty: a deliberately weak reference implementation for comparison.">
            <select id="mode" className={inputClass} value={cfg.mode} onChange={(e) => set({ mode: e.target.value as ExperimentConfig["mode"] })}>
              <option value="resilient">Resilient</option>
              <option value="faulty">Faulty reference</option>
            </select>
          </Field>
          <Field label="Drain capacity (events/s)" htmlFor="drain" hint="Throughput of a service while it drains its backlog after an outage." error={err("drainCapacityPerSec")}>
            <input id="drain" type="number" step={0.5} className={inputClass} value={Number.isNaN(cfg.drainCapacityPerSec) ? "" : cfg.drainCapacityPerSec} onChange={(e) => set({ drainCapacityPerSec: num(e.target.value) })} />
          </Field>
          <Field label="Stale threshold (s)" htmlFor="stale" hint="Resilient mode flags data older than this as stale." error={err("staleThresholdSec")}>
            <input id="stale" type="number" className={inputClass} value={Number.isNaN(cfg.staleThresholdSec) ? "" : cfg.staleThresholdSec} onChange={(e) => set({ staleThresholdSec: num(e.target.value) })} />
          </Field>
          <Field label="Fictional patients/devices" htmlFor="patients" error={err("patientCount")}>
            <input id="patients" type="number" className={inputClass} value={Number.isNaN(cfg.patientCount) ? "" : cfg.patientCount} onChange={(e) => set({ patientCount: num(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card
        title={`3 · Faults (${cfg.faults.length}/4)`}
        action={
          <Button type="button" disabled={cfg.faults.length >= 4} onClick={() => set({ faults: [...cfg.faults, makeFault({ type: "latency", target: "processor", startSec: 20, durationSec: 40, delaySec: 15, intensity: 1 })] })} data-testid="add-fault">
            + Add fault
          </Button>
        }
      >
        {cfg.faults.length === 0 && <p className="text-sm text-mute">No faults: this will be a healthy baseline run. Add one or more faults to combine failure modes.</p>}
        <div className="space-y-5">
          {cfg.faults.map((f, i) => (
            <div key={i} className="rounded-md border border-line bg-bg/40 p-4" data-testid={`fault-${i}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Fault {i + 1}</h3>
                <Button type="button" variant="ghost" onClick={() => set({ faults: cfg.faults.filter((_, k) => k !== i) })} aria-label={`Remove fault ${i + 1}`}>
                  Remove
                </Button>
              </div>
              <FaultFields idPrefix={`fault-${i}`} fault={f} errors={faultErrors(i)} onChange={(nf) => setFault(i, nf)} />
            </div>
          ))}
        </div>
      </Card>

      {issues.length > 0 && (
        <div role="alert" className="rounded-lg border border-red/40 bg-red/10 p-4 text-sm text-red" data-testid="form-errors">
          <p className="font-semibold">Fix these before running:</p>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      {serverError && <div role="alert" className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm text-amber">{serverError}</div>}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={issues.length > 0 || busy} data-testid="create-experiment">
          {busy ? "Creating…" : "Create and open experiment"}
        </Button>
      </div>
    </form>
  );
}
