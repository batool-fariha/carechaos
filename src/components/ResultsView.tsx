"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buildReport, reportToMarkdown, runComparison, describeFault, SERVICE_LABELS, type Evaluation, type ExperimentConfig } from "@/engine";
import { download } from "@/lib/download";
import { fmtPct, fmtSec, humanize } from "@/lib/format";
import { HealthStrip, HistogramChart, LatencyChart, OutcomeChart, QueueChart } from "./Charts";
import { EventTrace } from "./EventStream";
import { HeadlineMetrics, MoreMetrics } from "./MetricsGrid";
import { Button, Card, Disclosure, Empty, Pill, StatusBadge, linkButtonClass } from "./ui";
import { narrate } from "@/lib/narrate";

interface Props {
  id: string;
  config: ExperimentConfig;
  createdAt: string;
  onRunLive: () => void;
}

const FILTERS: Record<string, { label: string; test: (e: Evaluation["result"]["events"][number]) => boolean }> = {
  all: { label: "All events", test: () => true },
  lost: { label: "Lost / not processed", test: (e) => e.processedAt === null },
  alert_missing: { label: "Alerts not delivered", test: (e) => e.expectedAlert && e.deliveredAt === null },
  duplicated: { label: "Had duplicate copies", test: (e) => e.duplicateCopies > 0 },
  stale: { label: "Flagged stale", test: (e) => e.staleFlagged },
  late: { label: "Late arrivals / stale overwrites", test: (e) => e.lateArrival || e.staleOverwrite },
  retried: { label: "Retried or dead-lettered", test: (e) => e.retries > 0 || e.deadLettered },
};

export function ResultsView({ id, config, createdAt, onRunLive }: Props) {
  const cmp = useMemo(() => runComparison(config), [config]);
  const ev = cmp.faulted;
  const { result: r, metrics: m } = ev;
  const [filter, setFilter] = useState("all");
  const [trace, setTrace] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    const url = `${window.location.origin}/experiments/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const traced = trace ? r.events.find((e) => e.eventId === trace) : null;
  const filtered = useMemo(() => r.events.filter(FILTERS[filter].test), [r, filter]);
  const stopped = r.status === "stopped";
  const timelineEntries = r.timeline.filter((t) => t.kind !== "gap_detected");
  const gapNotes = r.timeline.filter((t) => t.kind === "gap_detected");

  const report = () => buildReport(ev, { experimentId: id, runTimestamp: createdAt });
  const other = config.mode === "resilient" ? "Faulty reference" : "Resilient";

  return (
    <div className="space-y-5" data-testid="results">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/history" className="text-sm text-mute hover:text-ink">← History</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{config.name}</h1>
          <p className="mt-1 text-sm text-mute">
            <span className="font-mono">{id}</span> · {createdAt.slice(0, 16).replace("T", " ")} UTC · scenario {config.scenarioId} · {config.mode} mode · seed {config.seed}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="verdict">
            <Pill tone={ev.verdict === "passed" ? "teal" : ev.verdict === "failed" ? "red" : "gray"} className="font-semibold">
              {ev.verdict === "passed" ? "✓ All applicable assertions passed" : ev.verdict === "failed" ? "✕ Assertions failed" : "Inconclusive: run was stopped"}
            </Pill>
            {m.assertionPassRate && <Pill>assertion pass rate {fmtPct(m.assertionPassRate.value)} ({m.assertionPassRate.numerator}/{m.assertionPassRate.denominator})</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="copy-link" onClick={copyLink}>{copied ? "✓ Link copied" : "Copy share link"}</Button>
          <Button data-testid="export-json" onClick={() => download(`carechaos-${id}.json`, JSON.stringify(report(), null, 2), "application/json")}>Export JSON</Button>
          <Button data-testid="export-md" onClick={() => download(`carechaos-${id}.md`, reportToMarkdown(report()), "text/markdown")}>Export Markdown</Button>
          <Button variant="primary" onClick={onRunLive} data-testid="run-live">▶ Replay live</Button>
        </div>
      </div>

      <section className={`rounded-xl border p-5 ${ev.verdict === "passed" ? "border-teal/30 bg-teal/5" : ev.verdict === "failed" ? "border-red/40 bg-red/5" : "border-line bg-panel"}`} data-testid="in-short">
        <h2 className="text-lg font-semibold">{narrate(r, m).headline === "Run finished" ? "In short" : narrate(r, m).headline}</h2>
        <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-ink/80">{narrate(r, m).detail}</p>
      </section>

      <Card title="Experiment summary">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-mute">Injected faults</h3>
            {r.config.faults.length + r.config.interventions.filter((i) => i.type === "inject").length === 0 ? <p>None (healthy baseline).</p> : (
              <ul className="mt-1 list-disc pl-4">
                {r.config.faults.map((f, i) => <li key={i}>{describeFault(f)}</li>)}
                {r.config.interventions.flatMap((iv, i) => (iv.type === "inject" ? [<li key={`i${i}`}>{describeFault(iv.fault)} <span className="text-mute">(operator, t={iv.atSec.toFixed(1)}s)</span></li>] : []))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-mute">Operator actions</h3>
            {r.config.interventions.length === 0 ? <p>None.</p> : <ul className="mt-1 list-disc pl-4">{r.config.interventions.map((iv, i) => <li key={i}>t={iv.atSec.toFixed(1)}s — {iv.type}{iv.type === "recover" ? ` ${iv.service}` : ""}</li>)}</ul>}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wider text-mute">Run</h3>
            <p>{r.events.length} readings · {config.durationSec}s window{stopped ? ` · stopped at ${r.nowSec.toFixed(1)}s` : ""}</p>
            <p className="text-mute">Replaying the stored config reproduces these numbers exactly.</p>
          </div>
        </div>
      </Card>

      <HeadlineMetrics m={m} started waiting={m.finalQueueDepth} />
      <Disclosure title="More numbers"><MoreMetrics m={m} started /></Disclosure>

      <Card title="Assertions" id="assertions">
        {ev.assertions.length === 0 ? (
          <Empty>Assertions are only evaluated for completed runs. This run was stopped before the observation window ended.</Empty>
        ) : (
          <ul className="divide-y divide-line" data-testid="assertion-list">
            {ev.assertions.map((a) => (
              <li key={a.id} className="grid gap-1 py-3 md:grid-cols-[9rem_1fr]" data-status={a.status}>
                <div>
                  <Pill tone={a.status === "passed" ? "teal" : a.status === "failed" ? "red" : "gray"}>
                    {a.status === "passed" ? "✓ Passed" : a.status === "failed" ? "✕ Failed" : "– N/A"}
                  </Pill>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-mute">Expected: {a.expected}</div>
                  <div className={a.status === "failed" ? "text-red" : "text-mute"}>Actual: {a.actual}</div>
                  {a.eventIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-mute">Supporting events:</span>
                      {a.eventIds.slice(0, 8).map((e) => (
                        <button key={e} onClick={() => setTrace(e)} className="rounded border border-line px-1.5 py-0.5 font-mono text-teal hover:bg-panel2">{e}</button>
                      ))}
                      {a.eventIds.length > 8 && <span className="text-mute">+{a.eventIds.length - 8} more</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {traced && <EventTrace event={traced} onClose={() => setTrace(null)} />}

      <Card title="Comparison: healthy baseline vs this run vs other resilience mode">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="comparison">
            <thead className="text-left text-xs text-mute">
              <tr>
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="pr-4 font-medium">Healthy baseline ({config.mode}, no faults)</th>
                <th className="pr-4 font-medium">This run ({config.mode})</th>
                <th className="font-medium">Same config, {other.toLowerCase()} mode</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Delivery rate", (e: Evaluation) => fmtPct(e.metrics.deliveryRate.value)],
                  ["Processing success rate", (e: Evaluation) => fmtPct(e.metrics.processingSuccessRate.value)],
                  ["Median alert latency", (e: Evaluation) => fmtSec(e.metrics.alertLatency.medianSec, 2)],
                  ["p95 alert latency", (e: Evaluation) => fmtSec(e.metrics.alertLatency.p95Sec, 2)],
                  ["Duplicates accepted / injected", (e: Evaluation) => `${e.metrics.duplicatesAccepted} / ${e.metrics.duplicatesInjected}`],
                  ["Unexpected loss (readings)", (e: Evaluation) => String(e.metrics.readingLoss.unexpected)],
                  ["Peak queue depth", (e: Evaluation) => String(e.metrics.peakQueueDepth)],
                  ["Recovery time", (e: Evaluation) => fmtSec(e.metrics.recoveryTimeSec)],
                  ["Assertions passed", (e: Evaluation) => (e.metrics.assertionPassRate ? `${e.metrics.assertionPassRate.numerator}/${e.metrics.assertionPassRate.denominator}` : "—")],
                ] as [string, (e: Evaluation) => string][]
              ).map(([label, f]) => (
                <tr key={label} className="border-t border-line">
                  <td className="py-2 pr-4 text-mute">{label}</td>
                  <td className="tabnum pr-4">{f(cmp.baseline)}</td>
                  <td className="tabnum pr-4 font-medium">{f(cmp.faulted)}</td>
                  <td className="tabnum">{f(cmp.alternate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mute">All three columns use the same seed and event volume. Verdict for the other mode: <b>{cmp.alternate.verdict}</b>.</p>
      </Card>

      <Disclosure title="Charts" hint="queue, latency, outcomes, service health">
      <div className="grid gap-4 lg:grid-cols-2">
        <QueueChart samples={r.samples} />
        <LatencyChart samples={r.samples} />
        <OutcomeChart samples={r.samples} />
        <HealthStrip result={r} />
        <HistogramChart title="Alert latency distribution" values={r.events.filter((e) => e.deliveredAt !== null).map((e) => (e.deliveredAt as number) - e.eventTime)} caption="Histogram of event time → delivered time for unique alerts." />
        <HistogramChart title="Reading latency distribution" values={r.events.filter((e) => e.processedAt !== null).map((e) => (e.processedAt as number) - e.eventTime)} caption="Histogram of event time → processed time for unique readings." />
      </div>

      </Disclosure>

      <Disclosure title="Event counts, data loss and recovery" testId="counts-disclosure">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event counts by outcome">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(m.outcomes).map(([k, v]) => (
                <tr key={k} className="border-t border-line first:border-0">
                  <td className="py-1.5"><StatusBadge status={k} /></td>
                  <td className="tabnum text-right">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-4 text-xs uppercase tracking-wider text-mute">Data loss by reason (readings not processed)</h3>
          {m.readingLoss.total === 0 ? <p className="mt-1 text-sm text-mute">None. Denominator: {m.readingsGenerated} readings generated.</p> : (
            <ul className="mt-1 text-sm">
              {Object.entries(m.readingLoss.byReason).map(([k, v]) => <li key={k}><span className="tabnum">{v}</span> × {humanize(k)}</li>)}
              <li className="mt-1 text-xs text-mute">intentional {m.readingLoss.intentional} · unexpected {m.readingLoss.unexpected} · still pending at end {m.readingLoss.pending}</li>
            </ul>
          )}
          <h3 className="mt-4 text-xs uppercase tracking-wider text-mute">Alerts not delivered by reason</h3>
          {m.alertLoss.total === 0 ? <p className="mt-1 text-sm text-mute">None. Denominator: {m.alertsExpected} alerts expected.</p> : (
            <ul className="mt-1 text-sm">{Object.entries(m.alertLoss.byReason).map(([k, v]) => <li key={k}><span className="tabnum">{v}</span> × {humanize(k)}</li>)}</ul>
          )}
        </Card>
        <Card title="Recovery">
          {m.recoveries.length === 0 ? <Empty>No outage recovery occurred in this run.</Empty> : (
            <table className="w-full text-sm" data-testid="recovery-table">
              <thead className="text-left text-xs text-mute"><tr><th className="py-1 font-medium">Service</th><th className="font-medium">Restored</th><th className="font-medium">Healthy</th><th className="font-medium">Duration</th></tr></thead>
              <tbody>
                {m.recoveries.map((x, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5">{SERVICE_LABELS[x.service]}</td>
                    <td className="tabnum">{x.initiatedAt.toFixed(1)}s ({x.trigger})</td>
                    <td className="tabnum">{x.completedAt === null ? "not yet" : `${x.completedAt.toFixed(1)}s`}</td>
                    <td className="tabnum">{fmtSec(x.durationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {gapNotes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wider text-mute">Sequence-gap detections</h3>
              <ul className="mt-1 max-h-32 overflow-auto text-xs text-mute">{gapNotes.slice(0, 20).map((g, i) => <li key={i}>{g.t.toFixed(1)}s — {g.detail}</li>)}</ul>
              {gapNotes.length > 20 && <p className="text-xs text-mute">+{gapNotes.length - 20} more.</p>}
            </div>
          )}
        </Card>
      </div>

      </Disclosure>

      <Disclosure title="Timeline" hint="faults, service state changes, recovery">
      <div>
        <ol className="max-h-80 space-y-1 overflow-auto text-sm" data-testid="timeline">
          {timelineEntries.map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabnum w-16 shrink-0 text-right font-mono text-mute">{t.t.toFixed(1)}s</span>
              <span className={t.kind.startsWith("fault") ? "text-red" : t.kind.startsWith("recovery") ? "text-teal" : t.kind === "service_state" ? "text-amber" : "text-ink/80"}>{t.detail}</span>
            </li>
          ))}
        </ol>
      </div>

      </Disclosure>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Detected failure modes">
          {ev.verdict === "inconclusive" && ev.assertions.length === 0 && <p className="mb-2 text-xs text-mute">Partial run: unfinished events are counted as stopped, not lost.</p>}
          {detectedList(ev, setTrace)}
        </Card>
        <Card title="Engineering recommendations">
          <RecList ev={ev} onTrace={setTrace} id={id} createdAt={createdAt} report={report} />
        </Card>
      </div>

      <Disclosure title="Event explorer" hint="trace any event through the pipeline">
      <div>
        <div className="mb-3 flex justify-end">{
          <select aria-label="Event filter" className="rounded-md border border-line bg-bg px-2 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {Object.entries(FILTERS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
        }</div>
        <p className="mb-2 text-xs text-mute">{filtered.length} matching events (showing first 40). Select an ID to trace it through the pipeline.</p>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel text-left text-mute"><tr><th className="py-1 font-medium">Event</th><th className="font-medium">Reading</th><th className="font-medium">Status</th><th className="font-medium">Reason / notes</th></tr></thead>
            <tbody>
              {filtered.slice(0, 40).map((e) => (
                <tr key={e.eventId} className="border-t border-line/60">
                  <td className="py-1"><button className="font-mono text-teal hover:underline" onClick={() => setTrace(e.eventId)}>{e.eventId}</button></td>
                  <td>{e.measurement.replace("_", " ")} {e.value}{e.unit}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="text-mute">{[e.lossReason && humanize(e.lossReason), e.staleFlagged && "stale", e.lateArrival && "late arrival", e.staleOverwrite && "stale overwrite", e.duplicateCopies && `${e.duplicateCopies} dup`, e.retries && `${e.retries} retries`].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      </Disclosure>

      <p className="text-xs leading-relaxed text-mute">Limitations: synthetic data only; thresholds are illustrative; a passing experiment does not establish clinical safety or regulatory compliance; time is virtual.</p>
      <Link href="/history" className={linkButtonClass()}>Back to history</Link>
    </div>
  );
}

function detectedList(ev: Evaluation, onTrace: (id: string) => void) {
  const modes = buildReport(ev, { experimentId: "x", runTimestamp: "" }).failureModes;
  if (!modes.length) return <Empty>No failure modes were observed in this run.</Empty>;
  return (
    <ul className="space-y-3 text-sm" data-testid="failure-modes">
      {modes.map((f) => (
        <li key={f.id}>
          <div className="font-medium">{f.title}</div>
          <div className="text-mute">{f.evidence}</div>
          {f.eventIds.length > 0 && <Chips ids={f.eventIds} onTrace={onTrace} />}
        </li>
      ))}
    </ul>
  );
}

function RecList({ ev, onTrace, id, createdAt, report }: { ev: Evaluation; onTrace: (id: string) => void; id: string; createdAt: string; report: () => ReturnType<typeof buildReport> }) {
  void id; void createdAt;
  const recs = report().recommendations;
  return (
    <ul className="space-y-3 text-sm" data-testid="recommendations">
      {recs.map((x) => (
        <li key={x.id}>
          <div className="font-medium">{x.title}</div>
          <div className="text-mute"><b className="text-ink/80">Evidence:</b> {x.evidence}</div>
          <div className="text-ink/90"><b>Suggested change:</b> {x.action}</div>
          {x.eventIds.length > 0 && <Chips ids={x.eventIds} onTrace={onTrace} />}
        </li>
      ))}
      {ev.verdict === "inconclusive" && <li className="text-xs text-mute">Recommendations are based on a partial run.</li>}
    </ul>
  );
}

function Chips({ ids, onTrace }: { ids: string[]; onTrace: (id: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      {ids.slice(0, 6).map((e) => (
        <button key={e} onClick={() => onTrace(e)} className="rounded border border-line px-1.5 py-0.5 font-mono text-teal hover:bg-panel2">{e}</button>
      ))}
      {ids.length > 6 && <span className="text-mute">+{ids.length - 6} more</span>}
    </div>
  );
}
