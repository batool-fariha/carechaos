"use client";
import { useMemo, useState } from "react";
import { SERVICE_IDS, SERVICE_LABELS, type EventRecord, type SimulationResult } from "@/engine";
import { clock, humanize } from "@/lib/format";
import { Card, Empty, StatusBadge, inputClass } from "./ui";

export function EventTrace({ event, onClose }: { event: EventRecord; onClose?: () => void }) {
  return (
    <div className="rounded-md border border-line bg-bg p-3 text-sm" data-testid="event-trace">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-teal">{event.eventId}</div>
          <div className="mt-0.5 text-ink">
            {event.measurement.replace("_", " ")} {event.value} {event.unit} · {event.patientId} · {event.deviceId} · seq {event.seq}
          </div>
          <div className="mt-0.5 text-xs text-mute">
            synthetic · event time {event.eventTime.toFixed(2)}s · processed {event.processedAt?.toFixed(2) ?? "—"}s · delivered {event.deliveredAt?.toFixed(2) ?? "—"}s · expects alert: {event.expectedAlert ? "yes" : "no"}
            {event.duplicateCopies ? ` · ${event.duplicateCopies} duplicate cop${event.duplicateCopies > 1 ? "ies" : "y"}` : ""}
            {event.retries ? ` · ${event.retries} retries` : ""}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded border border-line px-2 py-0.5 text-xs text-mute hover:text-ink" aria-label="Close trace">
            Close
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-1.5 border-l border-line pl-3">
        {event.transitions.map((t, i) => (
          <li key={i} className="text-xs">
            <span className="tabnum font-mono text-mute">{t.t.toFixed(2)}s</span> <StatusBadge status={t.status} /> <span className="text-mute">{SERVICE_LABELS[t.component]}{t.copy ? ` · copy ${t.copy}` : ""}</span>
            <div className="ml-1 text-ink/80">{t.reason}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EventStream({ result, limit = 60, bare = false }: { result: SimulationResult; limit?: number; bare?: boolean }) {
  const [component, setComponent] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const out = [];
    for (let i = result.log.length - 1; i >= 0 && out.length < limit; i--) {
      const l = result.log[i];
      if (component !== "all" && l.component !== component) continue;
      if (q && !l.eventId.includes(q.trim()) && !l.explanation.toLowerCase().includes(q.trim().toLowerCase())) continue;
      out.push(l);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.log.length, result, component, q, limit]);
  const openEvent = open ? result.events.find((e) => e.eventId === open) : null;
  const Wrap = bare
    ? ({ action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) => (
        <div>
          <div className="mb-3 flex justify-end">{action}</div>
          {children}
        </div>
      )
    : Card;
  return (
    <Wrap
      title={`Event stream (latest ${limit})`}
      action={
        <div className="flex flex-wrap gap-2">
          <input aria-label="Filter events" placeholder="event ID or text" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} !w-40 !py-1`} />
          <select aria-label="Filter by component" value={component} onChange={(e) => setComponent(e.target.value)} className={`${inputClass} !w-36 !py-1`}>
            <option value="all">All components</option>
            {SERVICE_IDS.map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {openEvent && <div className="mb-3"><EventTrace event={openEvent} onClose={() => setOpen(null)} /></div>}
      {rows.length === 0 ? (
        <Empty>No events yet. Start an experiment and every state change in the pipeline will appear here.</Empty>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-xs" data-testid="event-stream">
            <thead className="sticky top-0 bg-panel text-mute">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Time</th>
                <th className="pr-3 font-medium">Event ID</th>
                <th className="pr-3 font-medium">Component</th>
                <th className="pr-3 font-medium">Event type</th>
                <th className="pr-3 font-medium">Status</th>
                <th className="font-medium">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.n} className="border-t border-line/60 align-top">
                  <td className="tabnum whitespace-pre py-1.5 pr-3 font-mono text-mute">{clock(l.t)}</td>
                  <td className="pr-3 font-mono">
                    <button className="text-teal underline-offset-2 hover:underline" onClick={() => setOpen(l.eventId)} aria-label={`Trace ${l.eventId}`}>
                      {l.eventId}
                      {l.copy ? `#${l.copy}` : ""}
                    </button>
                  </td>
                  <td className="whitespace-nowrap pr-3 text-mute">{SERVICE_LABELS[l.component]}</td>
                  <td className="whitespace-nowrap pr-3">{humanize(l.type)}</td>
                  <td className="pr-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="text-ink/80">{l.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Wrap>
  );
}
