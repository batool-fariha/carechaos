import type { Metrics } from "@/engine";
import { fmtPct, fmtSec } from "@/lib/format";
import { Stat } from "./ui";

export function HeadlineMetrics({ m, started, waiting }: { m: Metrics; started: boolean; waiting: number }) {
  const dash = (v: React.ReactNode) => (started ? v : "—");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="metrics-grid">
      <Stat label="Readings sent" value={dash(m.readingsGenerated)} caption={started ? `${m.readingsProcessed} processed` : "synthetic readings"} testId="m-generated" />
      <Stat label="Alerts delivered" value={dash(m.alertsDelivered)} caption={started ? `of ${m.alertsExpected} expected · ${fmtPct(m.deliveryRate.value)}` : "to the clinician"} tone="teal" testId="m-delivered" />
      <Stat label="Waiting in queue" value={dash(waiting)} caption={started ? `peak ${m.peakQueueDepth}` : "messages held up"} tone={waiting > 0 ? "amber" : undefined} testId="m-queue" />
      <Stat
        label="Recovery time"
        value={dash(m.recoveryTimeSec === null ? (m.recoveryIncomplete ? "pending" : "—") : fmtSec(m.recoveryTimeSec))}
        caption="restore → backlog empty"
        tone={m.recoveryIncomplete ? "amber" : undefined}
        testId="m-recovery"
      />
    </div>
  );
}

export function MoreMetrics({ m, started }: { m: Metrics; started: boolean }) {
  const dash = (v: React.ReactNode) => (started ? v : "—");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="more-metrics">
      <Stat label="Readings processed" value={dash(m.readingsProcessed)} caption={started ? `${fmtPct(m.processingSuccessRate.value)} of expected (${m.processingSuccessRate.numerator}/${m.processingSuccessRate.denominator})` : undefined} testId="m-processed" />
      <Stat label="Alerts expected" value={dash(m.alertsExpected)} caption="readings that breach a rule" testId="m-expected" />
      <Stat label="Duplicates rejected" value={dash(m.duplicatesRejected)} caption={started ? `${m.duplicatesInjected} injected · ${m.duplicatesAccepted} accepted` : undefined} testId="m-duplicates" />
      <Stat label="Dropped events" value={dash(m.eventsDropped)} caption={started ? `${m.readingLoss.intentional} intentional · ${m.readingLoss.unexpected} unexpected` : undefined} tone={m.eventsDropped ? "red" : undefined} testId="m-dropped" />
      <Stat label="Alert latency (median)" value={dash(fmtSec(m.alertLatency.medianSec, 2))} caption={started ? `p95 ${fmtSec(m.alertLatency.p95Sec, 2)} · n=${m.alertLatency.n}` : undefined} testId="m-latency" />
    </div>
  );
}

/** Both sets, used by the results page. */
export function MetricsGrid({ m, started }: { m: Metrics; started: boolean }) {
  const waiting = m.finalQueueDepth;
  return (
    <div className="space-y-3">
      <HeadlineMetrics m={m} started={started} waiting={waiting} />
      <MoreMetrics m={m} started={started} />
    </div>
  );
}
