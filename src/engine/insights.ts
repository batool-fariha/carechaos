/** Failure-mode detection and engineering recommendations. Every statement cites numbers from the actual run. */
import type { Metrics } from "./metrics";
import type { SimulationResult } from "./types";

export interface Insight {
  id: string;
  title: string;
  /** Observed evidence, taken from run output. */
  evidence: string;
  eventIds: string[];
}

export interface Recommendation extends Insight {
  action: string;
}

const ids = (list: { eventId: string }[], cap = 25) => list.slice(0, cap).map((e) => e.eventId);
const s2 = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100) / 100}s`);

export function detectFailureModes(r: SimulationResult, m: Metrics): Insight[] {
  const out: Insight[] = [];
  const byReason = (reason: string) => r.events.filter((e) => e.lossReason === reason && (e.processedAt === null || (e.expectedAlert && e.deliveredAt === null)));

  const unavailable = byReason("target_unavailable");
  if (unavailable.length)
    out.push({ id: "dropped-on-unavailable", title: "Events dropped while a downstream service was unavailable", evidence: `${unavailable.length} events were dropped with reason target_unavailable because the sender had no retry or buffer.`, eventIds: ids(unavailable) });
  const crash = byReason("queue_lost_on_crash");
  if (crash.length)
    out.push({ id: "queue-lost-on-crash", title: "In-memory queue lost when a service failed", evidence: `${crash.length} queued events were lost with reason queue_lost_on_crash.`, eventIds: ids(crash) });
  const exhausted = r.events.filter((e) => e.deadLettered);
  if (exhausted.length)
    out.push({ id: "retries-exhausted", title: "Bounded retries were exhausted during a long outage", evidence: `${exhausted.length} events exhausted their retry budget and were dead-lettered; ${exhausted.filter((e) => e.processedAt !== null).length} were later redriven and processed.`, eventIds: ids(exhausted) });
  if (m.duplicatesAccepted > 0)
    out.push({ id: "duplicates-accepted", title: "Duplicate events were processed more than once", evidence: `${m.duplicatesAccepted} duplicate deliveries were accepted; ${m.duplicateAlertsDelivered} duplicate alerts reached the clinician dashboard.`, eventIds: ids(r.events.filter((e) => e.duplicateCopies > 0)) });
  if (m.staleOverwrites > 0)
    out.push({ id: "stale-overwrite", title: "Older readings overwrote newer measurements", evidence: `${m.staleOverwrites} readings with an older event time replaced newer current values.`, eventIds: ids(r.events.filter((e) => e.staleOverwrite)) });
  if (m.reorderedReadings > 0 && m.staleOverwrites === 0)
    out.push({ id: "reordering-handled", title: "Out-of-order delivery occurred and was contained", evidence: `${m.reorderedReadings} readings arrived out of order; ${m.lateArrivals} were kept as late arrivals without overwriting newer values.`, eventIds: ids(r.events.filter((e) => e.lateArrival)) });
  const intentional = r.events.filter((e) => e.lossReason === "packet_loss_injected" && e.processedAt === null);
  if (intentional.length)
    out.push({ id: "packet-loss", title: "Readings missing due to injected packet loss", evidence: `${intentional.length} readings never arrived; ${r.gaps.detectedBySequence.length} were detected via sequence gaps and ${r.gaps.detectedByReconciliation.length} via end-of-run reconciliation.`, eventIds: ids(intentional) });
  const delayed = r.events.filter((e) => e.faultTags.some((t) => t.startsWith("latency@")));
  if (delayed.length && m.readingLatency.medianSec !== null)
    out.push({ id: "delayed-processing", title: "Readings delayed by injected latency", evidence: `${delayed.length} readings were delayed; overall median reading latency was ${s2(m.readingLatency.medianSec)}, max ${s2(m.readingLatency.maxSec)}.`, eventIds: ids(delayed) });
  if (m.peakQueueDepth >= 10)
    out.push({ id: "backlog", title: "Backlog accumulated", evidence: `Peak backlog was ${m.peakQueueDepth} events at ${m.peakQueueService}; ${m.finalQueueDepth} events remained queued, held or dead-lettered at the end of the window.`, eventIds: [] });
  if (m.recoveryIncomplete)
    out.push({ id: "recovery-incomplete", title: "Recovery had not completed when the window ended", evidence: `${m.recoveries.filter((x) => x.completedAt === null).length} recovery period(s) did not reach a healthy, drained state.`, eventIds: [] });
  return out;
}

export function buildRecommendations(r: SimulationResult, m: Metrics): Recommendation[] {
  const modes = new Map(detectFailureModes(r, m).map((f) => [f.id, f]));
  const recs: Recommendation[] = [];
  const add = (modeId: string, title: string, action: string) => {
    const f = modes.get(modeId);
    if (f) recs.push({ id: `rec-${modeId}`, title, evidence: f.evidence, eventIds: f.eventIds, action });
  };
  add("dropped-on-unavailable", "Buffer or retry instead of dropping", "Add a durable queue or bounded retry with backoff on the sender so a short outage does not become permanent data loss.");
  add("queue-lost-on-crash", "Make queues durable", "Persist the inbound queue (or use a broker) so a crash does not discard accepted events.");
  add("retries-exhausted", "Review the retry budget against expected outage length", "Keep the dead-letter queue and redrive on recovery; consider a longer or circuit-breaker style retry for outages longer than the backoff window.");
  add("duplicates-accepted", "Enforce idempotency by event ID", "Track processed event IDs in the processor and alert layers so replays are rejected, and alert on duplicate-rate spikes.");
  add("stale-overwrite", "Compare event time before overwriting current values", "Only update the latest measurement when the incoming event time is newer; store late arrivals as history.");
  add("packet-loss", "Keep sequence numbers and reconcile counts", "Detect gaps with per-device sequence numbers and reconcile expected versus received counts at the end of each window.");
  add("delayed-processing", "Surface data age to clinicians", "Flag readings older than a freshness threshold as stale so delayed data is not mistaken for current data.");
  add("backlog", "Size drain capacity for recovery", `Peak backlog was ${m.peakQueueDepth}; provision drain capacity above the steady arrival rate and alert on queue depth growth.`);
  add("recovery-incomplete", "Bound recovery time", "Define a recovery objective and alert when a service stays in recovering state beyond it.");
  if (!recs.length && m.readingsGenerated > 0)
    recs.push({ id: "rec-none", title: "No weaknesses observed in this run", evidence: `${m.readingsProcessed}/${m.readingsGenerated} readings processed and ${m.alertsDelivered}/${m.alertsExpected} alerts delivered. This does not establish clinical safety.`, eventIds: [], action: "Try a different seed, higher fault intensity, or faulty mode to explore other behavior." });
  return recs;
}
