"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEMO_SCENARIO_ID, SCENARIOS, SERVICE_IDS, SERVICE_LABELS, getScenario, scenarioConfig, type Evaluation, type ExperimentConfig, type ResilienceMode, type ServiceId } from "@/engine";
import { fmtPct } from "@/lib/format";
import { narrate } from "@/lib/narrate";
import { SPEEDS, useSimulation } from "@/lib/useSimulation";
import { HealthStrip, LatencyChart, OutcomeChart, QueueChart } from "./Charts";
import { EventStream } from "./EventStream";
import { FaultInjector } from "./FaultInjector";
import { HeadlineMetrics, MoreMetrics } from "./MetricsGrid";
import { ServiceDetails } from "./ServiceDetails";
import { Topology } from "./Topology";
import { Button, Card, Disclosure, Pill, inputClass, linkButtonClass } from "./ui";

const STATE_META = {
  idle: { label: "Idle", tone: "gray" as const, glyph: "○" },
  running: { label: "Running", tone: "teal" as const, glyph: "▶" },
  paused: { label: "Paused", tone: "amber" as const, glyph: "❚❚" },
  completed: { label: "Completed", tone: "teal" as const, glyph: "■" },
  stopped: { label: "Stopped", tone: "red" as const, glyph: "■" },
};

const BANNER = {
  teal: "border-teal/30 bg-teal/5",
  amber: "border-amber/40 bg-amber/5",
  red: "border-red/40 bg-red/5",
  gray: "border-line bg-panel",
};

interface Props {
  initialConfig?: ExperimentConfig;
  /** Existing experiment row to update (created from the New Experiment form). */
  experimentId?: string;
  startLabel?: string;
  /** Show scenario and mode pickers (lab page). */
  selectable?: boolean;
  persist?: boolean;
  autoStart?: boolean;
}

export function Runner({ initialConfig, experimentId, startLabel = "Run demo", selectable = false, persist = true, autoStart = false }: Props) {
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

  const started0 = useRef(false);
  useEffect(() => {
    if (autoStart && !started0.current) {
      started0.current = true;
      sim.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const meta = STATE_META[status];
  const scenario = getScenario(config.scenarioId);
  const progress = Math.min(1, result.nowSec / config.durationSec);
  const live = status === "running" || status === "paused";
  const down = SERVICE_IDS.filter((s) => result.services[s].health === "unavailable");
  const verdict = sim.evaluation?.verdict;
  const started = status !== "idle";
  const waiting = SERVICE_IDS.reduce((a, id) => a + result.services[id].queueDepth, 0);
  const story = narrate(result, metrics);

  const pick = (id: string, mode: ResilienceMode) => sim.loadConfig(scenarioConfig(id, { mode }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reliability Lab</h1>
          <p className="mt-1 text-sm text-mute">Break a fictional patient-monitoring pipeline and watch what happens.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" data-testid="run-demo" disabled={live} onClick={() => (status === "idle" ? sim.start() : sim.replay())}>
            ▶ {status === "idle" ? startLabel : "Run again"}
          </Button>
          <Link href="/experiments/new" className={linkButtonClass()}>
            New experiment
          </Link>
        </div>
      </div>

      {selectable && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-mute">Scenario</span>
            <select aria-label="Scenario" data-testid="scenario-select" className={`${inputClass} !w-56 !py-1.5`} value={config.scenarioId} disabled={live} onChange={(e) => pick(e.target.value, config.mode)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Resilience mode" className="inline-flex overflow-hidden rounded-md border border-line bg-panel text-sm">
            {(["resilient", "faulty"] as const).map((m) => (
              <button key={m} disabled={live} aria-pressed={config.mode === m} data-testid={`mode-${m}`} onClick={() => pick(config.scenarioId, m)} className={`px-3 py-1.5 disabled:opacity-40 ${config.mode === m ? "bg-teal text-bg" : "text-mute hover:text-ink"}`}>
                {m === "faulty" ? "Weak system" : "Resilient system"}
              </button>
            ))}
          </div>
        </div>
      )}

      <section aria-label="What is happening" className={`rounded-xl border p-5 ${BANNER[story.tone]}`} data-testid="narrator">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div aria-live="polite" className="flex flex-wrap items-center gap-2" data-testid="run-state" data-state={status}>
              <Pill tone={meta.tone}>
                <span aria-hidden>{meta.glyph}</span> {meta.label}
              </Pill>
              {verdict && (
                <Pill tone={verdict === "passed" ? "teal" : verdict === "failed" ? "red" : "gray"} className="font-semibold">
                  {verdict === "passed" ? "✓ Assertions passed" : verdict === "failed" ? "✕ Assertions failed" : "Inconclusive (stopped early)"}
                </Pill>
              )}
              <span className="tabnum font-mono text-sm text-mute" data-testid="clock">
                t = {result.nowSec.toFixed(1)}s / {config.durationSec}s virtual
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold" data-testid="story-headline">{story.headline}</h2>
            <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-ink/80">{story.detail}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Run controls">
            {status === "paused" ? (
              <Button onClick={sim.resume} data-testid="ctl-resume">Resume</Button>
            ) : (
              <Button onClick={sim.pause} disabled={status !== "running"} data-testid="ctl-pause">Pause</Button>
            )}
            <Button variant="danger" onClick={sim.stop} disabled={!live} data-testid="ctl-stop">Stop</Button>
            <Button onClick={sim.skipToEnd} disabled={!live} data-testid="ctl-skip">Skip to end</Button>
            <Button variant="ghost" onClick={sim.reset} disabled={status === "idle"} data-testid="ctl-reset">Reset</Button>
            <label className="flex items-center gap-1.5 text-sm text-mute">
              Speed
              <select aria-label="Playback speed" className={`${inputClass} !w-[4.5rem] !py-1`} value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded bg-line" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-teal transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        {live && down.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="outage-banner">
            {down.map((s) => (
              <Button key={s} variant="secondary" onClick={() => sim.recover(s)} data-testid={`recover-${s}`}>
                Recover {SERVICE_LABELS[s]} now
              </Button>
            ))}
          </div>
        )}
        {scenario && (
          <p className="mt-4 text-xs text-mute">
            <b className="text-ink/80">Hypothesis:</b> {scenario.hypothesis}
          </p>
        )}
      </section>

      {saved?.id && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal/40 bg-teal/5 px-4 py-3 text-sm" data-testid="saved-banner">
          <span>
            Saved to history. {sim.evaluation && sim.evaluation.assertions.length > 0 && <>Assertion pass rate {fmtPct(sim.evaluation.metrics.assertionPassRate?.value)}.</>}
          </span>
          <Link href={`/experiments/${saved.id}`} className={linkButtonClass("primary")} data-testid="view-results">
            View results →
          </Link>
        </div>
      )}
      {saved?.error && (
        <div role="alert" className="rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
          {saved.error}
        </div>
      )}

      <Card title="The pipeline" action={<span className="text-xs text-mute">Click a stage for details</span>}>
        <Topology result={result} selected={selected} onSelect={(s) => setSelected(selected === s ? null : s)} />
      </Card>
      {selected && <ServiceDetails result={result} id={selected} onRecover={sim.recover} onClose={() => setSelected(null)} />}

      <HeadlineMetrics m={metrics} started={started} waiting={waiting} />

      <div className="grid gap-4 lg:grid-cols-2">
        <QueueChart samples={result.samples} />
        <OutcomeChart samples={result.samples} />
      </div>

      <div className="space-y-3">
        <Disclosure title="More numbers" hint="processing, duplicates, drops, latency">
          <MoreMetrics m={metrics} started={started} />
        </Disclosure>
        <Disclosure title="More charts" hint="latency and service health over time">
          <div className="grid gap-4 lg:grid-cols-2">
            <LatencyChart samples={result.samples} />
            <HealthStrip result={result} />
          </div>
        </Disclosure>
        <Disclosure title="Inject a failure into the running experiment">
          <FaultInjector durationSec={config.durationSec} nowSec={result.nowSec} disabled={!live} onInject={sim.inject} />
        </Disclosure>
        <Disclosure title="Event log" hint="every state change, traceable per event">
          <EventStream result={result} bare />
        </Disclosure>
      </div>
    </div>
  );
}
