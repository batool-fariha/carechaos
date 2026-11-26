import { SERVICE_IDS, SERVICE_LABELS, type Health, type Sample, type ServiceId } from "@/engine";

/** Text alternatives for the charts, so a screen-reader user gets the same takeaways as a sighted one. */

const secs = (t: number) => `${Math.round(t)}s`;

export function queueSummary(samples: Sample[]): string {
  if (samples.length < 2) return "";
  const peak = samples.reduce((a, b) => (b.totalDepth > a.totalDepth ? b : a));
  const last = samples[samples.length - 1];
  if (peak.totalDepth === 0) return "No events were queued at any point.";
  return `Queue depth peaked at ${peak.totalDepth} events at ${secs(peak.t)} and was ${last.totalDepth} at the end (${secs(last.t)}).`;
}

export function latencySummary(samples: Sample[]): string {
  const xs = samples.filter((s): s is Sample & { latencySec: number } => typeof s.latencySec === "number");
  if (xs.length === 0) return samples.length < 2 ? "" : "No readings were processed, so there is no latency to show.";
  const peak = xs.reduce((a, b) => (b.latencySec > a.latencySec ? b : a));
  const mean = xs.reduce((a, b) => a + b.latencySec, 0) / xs.length;
  return `Mean latency averaged ${mean.toFixed(2)}s and peaked at ${peak.latencySec.toFixed(2)}s at ${secs(peak.t)}.`;
}

export function outcomeSummary(samples: Sample[]): string {
  if (samples.length < 2) return "";
  const last = samples[samples.length - 1];
  return `By ${secs(last.t)}: ${last.processed} events processed, ${last.delivered} alerts delivered, ${last.failed} failed.`;
}

/** Seconds each service spent in each non-healthy state, from the sampled timeline. */
export function healthSummary(samples: Sample[]): { id: ServiceId; text: string }[] {
  if (samples.length < 2) return [];
  return SERVICE_IDS.map((id) => {
    const time: Record<Health, number> = { healthy: 0, degraded: 0, recovering: 0, unavailable: 0 };
    for (let i = 0; i < samples.length - 1; i++) time[samples[i].health[id]] += samples[i + 1].t - samples[i].t;
    const bad = (["unavailable", "degraded", "recovering"] as Health[]).filter((h) => time[h] > 0).map((h) => `${h} for ${secs(time[h])}`);
    return { id, text: `${SERVICE_LABELS[id]}: ${bad.length ? bad.join(", ") : "healthy throughout"}.` };
  });
}

/** Distribution charts: count, median, 95th percentile and maximum. Units are given by the chart's caption. */
export function histogramSummary(values: number[]): string {
  if (!values.length) return "";
  const xs = [...values].sort((a, b) => a - b);
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `${xs.length} values: median ${f(at(0.5))}, 95th percentile ${f(at(0.95))}, maximum ${f(xs[xs.length - 1])}.`;
}
