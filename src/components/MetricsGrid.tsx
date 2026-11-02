import type { Metrics } from "@/engine";
import { fmtPct, fmtSec } from "@/lib/format";
import { Stat } from "./ui";

export function MetricsGrid({ m, started }: { m: Metrics; started: boolean }) {
  const dash = (v: React.ReactNode) => (started ? v : "—");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="metrics-grid">
      <Stat label="Readings generated" value={dash(m.readingsGenerated)} caption="synthetic readings" testId="m-generated" />
      <Stat label="Readings processed" value={dash(m.readingsProcessed)} caption={started ? `${fmtPct(m.processingSuccessRate.value)} of expected (${m.processingSuccessRate.numerator}/${m.processingSuccessRate.denominator})` : "unique readings"} tone="teal" testId="m-processed" />
      <Stat label="Alerts expected" value={dash(m.alertsExpected)} caption="readings that breach an alert rule" testId="m-expected" />
      <Stat label="Alerts delivered" value={dash(m.alertsDelivered)} caption={started ? `delivery rate ${fmtPct(m.deliveryRate.value)}` : "to clinician dashboard"} tone="teal" testId="m-delivered" />
      <Stat label="Duplicates rejected" value={dash(m.duplicatesRejected)} caption={started ? `${m.duplicatesInjected} injected · ${m.duplicatesAccepted} accepted` : "idempotency"} testId="m-duplicates" />
      <Stat label="Dropped events" value={dash(m.eventsDropped)} caption={started ? `${m.readingLoss.intentional} intentional · ${m.readingLoss.unexpected} unexpected` : "with recorded reasons"} tone={m.eventsDropped ? "red" : undefined} testId="m-dropped" />
      <Stat
        label="End-to-end latency"
        value={dash(fmtSec(m.alertLatency.medianSec, 2))}
        caption={started ? `alerts: median · p95 ${fmtSec(m.alertLatency.p95Sec, 2)} (n=${m.alertLatency.n})` : "event time → delivered"}
        testId="m-latency"
      />
      <Stat
        label="Recovery time"
        value={dash(m.recoveryTimeSec === null ? (m.recoveryIncomplete ? "pending" : "—") : fmtSec(m.recoveryTimeSec))}
        caption="restore → backlog drained"
        tone={m.recoveryIncomplete ? "amber" : undefined}
        testId="m-recovery"
      />
    </div>
  );
}
