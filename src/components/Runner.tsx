"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_SCENARIO_ID, SCENARIOS, SERVICE_IDS, SERVICE_LABELS, getScenario, scenarioConfig, type Evaluation, type ExperimentConfig, type ResilienceMode, type ServiceId } from "@/engine";
import { fmtPct } from "@/lib/format";
import { SPEEDS, useSimulation } from "@/lib/useSimulation";
import { HealthStrip, LatencyChart, OutcomeChart, QueueChart } from "./Charts";
import { EventStream } from "./EventStream";
import { FaultInjector } from "./FaultInjector";
import { MetricsGrid } from "./MetricsGrid";
import { ServiceDetails } from "./ServiceDetails";
import { Topology } from "./Topology";
import { Button, Card, Pill, inputClass, linkButtonClass } from "./ui";

const STATE_META = {
  idle: { label: "Idle", tone: "gray" as const, glyph: "○" },
  running: { label: "Running", tone: "teal" as const, glyph: "▶" },
  paused: { label: "Paused", tone: "amber" as const, glyph: "❚❚" },
  completed: { label: "Completed", tone: "teal" as const, glyph: "■" },
  stopped: { label: "Stopped", tone: "red" as const, glyph: "■" },
};

interface Props {
  initialConfig?: ExperimentConfig;
  /** Existing experiment row to update (created from the New Experiment form). */
  experimentId?: string;
  startLabel?: string;
  /** Show scenario and mode pickers (dashboard demo). */
  selectable?: boolean;
  persist?: boolean;
}

export function Runner({ initialConfig, experimentId, startLabel = "Run demo", selectable = false, persist = true }: Props) {
  const [saved, setSaved] = useState<{ id?: string; error?: string } | null>(null);
  const [selected, setSelected] = useState<ServiceId | null>(null);
  const sim = useSimulation(initialConfig ?? scenarioConfig(DEMO_SCENARIO_ID), (ev) => void save(ev));
  const { result, metrics, status, config } = sim;

  async function save(ev: Evaluation) {
    if (!persist) return;
    try {
      const body = JSON.stringify({ config: ev.result.config, status: ev.result.status === "stopped" ? "stopped" : "completed" });
      const res = await fetch(experimentId ? `/api/experiments/${experimentId}` : "/api/experiments", { method: experimentId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved({ id: experimentId ?? data.id });
    } catch (e) {
      setSaved({ error: e instanceof Error ? e.message : "Could not save to history." });
    }
  }

  useEffect(() => {
    if (status === "idle" || status === "running") setSaved(null);
  }, [status]);

  const meta = STATE_META[status];
  const scenario = getScenario(config.scenarioId);
  const progress = Math.min(1, result.nowSec / config.durationSec);
  const live = status === "running" || status === "paused";
  const down = SERVICE_IDS.filter((s) => result.services[s].health === "unavailable");
  const verdict = sim.evaluation?.verdict;
  const started = status !== "idle";

  const pick = (id: string, mode: ResilienceMode) => sim.loadConfig(scenarioConfig(id, { mode }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reliability Lab</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-mute">
            Break a synthetic patient-monitoring pipeline on purpose and watch what happens to readings, alerts and recovery. Simulation only — every patient and value is fictional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            data-testid="run-demo"
            disabled={status === "running" || status === "paused"}
            onClick={() => (status === "idle" ? sim.start() : sim.replay())}
          >
            ▶ {status === "idle" ? startLabel : "Run again"}
          </Button>
          <Link href="/experiments/new" className={linkButtonClass()}>
            New experiment
          </Link>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {selectable && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-mute">Scenario</span>
                <select
                  aria-label="Scenario"
                  data-testid="scenario-select"
                  className={`${inputClass} !w-56 !py-1.5`}
                  value={config.scenarioId}
                  disabled={live}
                  onChange={(e) => pick(e.target.value, config.mode)}
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div role="group" aria-label="Resilience mode" className="inline-flex overflow-hidden rounded-md border border-line text-sm">
                {(["resilient", "faulty"] as const).map((m) => (
                  <button
                    key={m}
                    disabled={live}
                    aria-pressed={config.mode === m}
                    data-testid={`mode-${m}`}
                    onClick={() => pick(config.scenarioId, m)}
                    className={`px-3 py-1.5 capitalize disabled:opacity-40 ${config.mode === m ? "bg-panel2 text-ink" : "text-mute hover:text-ink"}`}
                  >
                    {m === "faulty" ? "Faulty reference" : "Resilient"}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Run controls">
            <Button onClick={sim.pause} disabled={status !== "running"} data-testid="ctl-pause">Pause</Button>
            <Button onClick={sim.resume} disabled={status !== "paused"} data-testid="ctl-resume">Resume</Button>
            <Button variant="danger" onClick={sim.stop} disabled={!live} data-testid="ctl-stop">Stop</Button>
            <Button onClick={sim.skipToEnd} disabled={!live} data-testid="ctl-skip">Skip to end</Button>
            <Button onClick={sim.reset} disabled={status === "idle"} data-testid="ctl-reset">Reset</Button>
            <Button onClick={sim.replay} disabled={status === "idle"} data-testid="ctl-replay">Replay</Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-mute">Speed</span>
            <select aria-label="Playback speed" className={`${inputClass} !w-20 !py-1.5`} value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div aria-live="polite" className="flex items-center gap-2" data-testid="run-state" data-state={status}>
            <Pill tone={meta.tone}>
              <span aria-hidden>{meta.glyph}</span> {meta.label}
            </Pill>
            {verdict && (
              <Pill tone={verdict === "passed" ? "teal" : verdict === "failed" ? "red" : "gray"} className="font-semibold" >
                {verdict === "passed" ? "✓ Assertions passed" : verdict === "failed" ? "✕ Assertions failed" : "Inconclusive (stopped early)"}
              </Pill>
            )}
          </div>
          <div className="tabnum font-mono text-sm text-mute" data-testid="clock">
            t = {result.nowSec.toFixed(1)}s / {config.durationSec}s virtual
          </div>
          <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded bg-line" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-teal transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="text-xs text-mute">
            {config.mode === "resilient" ? "Resilient mode" : "Faulty reference mode"} · seed {config.seed}
          </span>
        </div>
        {scenario && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-mute">
            <b className="text-ink">Hypothesis:</b> {scenario.hypothesis}
          </p>
        )}
      </Card>

      {saved?.id && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal/40 bg-teal/10 px-4 py-3 text-sm" data-testid="saved-banner">
          <span>
            Run finished and saved to history. {sim.evaluation && sim.evaluation.assertions.length > 0 && <>Assertion pass rate {fmtPct(sim.evaluation.metrics.assertionPassRate?.value)}.</>}
          </span>
          <Link href={`/experiments/${saved.id}`} className={linkButtonClass("primary")} data-testid="view-results">
            View results →
          </Link>
        </div>
      )}
      {saved?.error && (
        <div role="alert" className="rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          {saved.error}
        </div>
      )}
      {live && down.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red/40 bg-red/10 px-4 py-3 text-sm text-red" data-testid="outage-banner">
          ✕ Unavailable: {down.map((s) => SERVICE_LABELS[s]).join(", ")}
          {down.map((s) => (
            <Button key={s} variant="secondary" onClick={() => sim.recover(s)} data-testid={`recover-${s}`}>
              Recover {SERVICE_LABELS[s]}
            </Button>
          ))}
        </div>
      )}

      <Card title="System topology" action={<span className="text-xs text-mute">Click a node for details</span>}>
        <Topology result={result} selected={selected} onSelect={(s) => setSelected(selected === s ? null : s)} />
        {!started && <p className="mt-2 text-xs text-mute">Idle. Press “{startLabel}” to simulate the {scenario?.name ?? "experiment"} scenario. Nodes, queues and edges update from engine state.</p>}
      </Card>
      {selected && <ServiceDetails result={result} id={selected} onRecover={sim.recover} onClose={() => setSelected(null)} />}

      <MetricsGrid m={metrics} started={started} />

      <div className="grid gap-4 lg:grid-cols-2">
        <QueueChart samples={result.samples} />
        <LatencyChart samples={result.samples} />
        <OutcomeChart samples={result.samples} />
        <HealthStrip result={result} />
      </div>

      <details className="rounded-lg border border-line bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Inject a failure into the running experiment</summary>
        <div className="border-t border-line p-4">
          <FaultInjector durationSec={config.durationSec} nowSec={result.nowSec} disabled={!live} onInject={sim.inject} />
        </div>
      </details>

      <EventStream result={result} />
    </div>
  );
}
