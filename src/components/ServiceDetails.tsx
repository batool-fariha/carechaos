"use client";
import { SERVICE_LABELS, describeFault, type ServiceId, type SimulationResult } from "@/engine";
import { HEALTH_META, humanize } from "@/lib/format";
import { Button, Card, Pill } from "./ui";

export function ServiceDetails({ result, id, onRecover, onClose }: { result: SimulationResult; id: ServiceId; onRecover?: (s: ServiceId) => void; onClose: () => void }) {
  const s = result.services[id];
  const meta = HEALTH_META[s.health];
  const recent = [];
  for (let i = result.log.length - 1; i >= 0 && recent.length < 6; i--) if (result.log[i].component === id) recent.push(result.log[i]);
  const canRecover = s.health === "unavailable" && onRecover && (result.status === "running" || result.status === "paused");
  return (
    <Card
      title={`${SERVICE_LABELS[id]} — details`}
      action={
        <Button variant="ghost" onClick={onClose} aria-label="Close details">
          ✕ Close
        </Button>
      }
      id="service-details"
    >
      <div data-testid="service-details" className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Pill tone={s.health === "healthy" ? "teal" : s.health === "unavailable" ? "red" : "amber"}>
            {meta.glyph} {meta.label}
          </Pill>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-mute">Received</dt><dd className="tabnum text-right">{s.received}</dd>
            <dt className="text-mute">Processed</dt><dd className="tabnum text-right">{s.processed}</dd>
            <dt className="text-mute">Failures</dt><dd className="tabnum text-right">{s.failed}</dd>
            <dt className="text-mute">Duplicates rejected</dt><dd className="tabnum text-right">{s.duplicatesRejected}</dd>
            <dt className="text-mute">Queue depth</dt><dd className="tabnum text-right">{s.queueDepth}</dd>
            <dt className="text-mute">Peak queue</dt><dd className="tabnum text-right">{s.peakQueueDepth}</dd>
            <dt className="text-mute">Capacity</dt><dd className="tabnum text-right">{s.capacityPerSec === Infinity ? "instant" : `${s.capacityPerSec}/s`}</dd>
          </dl>
          {canRecover && (
            <Button variant="primary" onClick={() => onRecover(id)} data-testid="recover-now">
              Recover now
            </Button>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">Active faults</h3>
          {s.activeFaults.length ? <ul className="space-y-1 text-sm">{s.activeFaults.map((f, i) => <li key={i}>{describeFault(f)}</li>)}</ul> : <p className="text-sm text-mute">None.</p>}
          <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-mute">Recovery history</h3>
          {s.recoveries.length ? (
            <ul className="space-y-1 text-sm">
              {s.recoveries.map((r, i) => (
                <li key={i}>
                  restored {r.initiatedAt.toFixed(1)}s ({r.trigger}) →{" "}
                  {r.completedAt === null ? <span className="text-amber">draining…</span> : <span className="text-teal">healthy at {r.completedAt.toFixed(1)}s ({(r.completedAt - r.initiatedAt).toFixed(1)}s)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">No recoveries yet.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">State transitions</h3>
          {s.transitions.length ? (
            <ul className="space-y-1 text-xs">
              {s.transitions.slice(-6).map((t, i) => (
                <li key={i}>
                  <span className="tabnum font-mono text-mute">{t.t.toFixed(1)}s</span> {t.from} → <b>{t.to}</b> <span className="text-mute">({t.reason})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">Always healthy so far.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">Recent events</h3>
          {recent.length ? (
            <ul className="space-y-1 text-xs">
              {recent.map((l) => (
                <li key={l.n}>
                  <span className="font-mono text-teal">{l.eventId}</span> {humanize(l.type)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">Nothing handled yet.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
