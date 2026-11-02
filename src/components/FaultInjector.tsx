"use client";
import { useState } from "react";
import { SERVICE_IDS, SERVICE_LABELS, validateFault, makeFault, type FaultConfig, type FaultType, type ServiceId } from "@/engine";
import { Button, Field, inputClass } from "./ui";

export const FAULT_LABELS: Record<FaultType, string> = {
  latency: "Latency injection",
  duplicate: "Duplicate delivery",
  outage: "Service outage",
  packet_loss: "Packet loss",
  out_of_order: "Out-of-order delivery",
};

export const FAULT_HELP: Record<FaultType, string> = {
  latency: "Adds a fixed delay (virtual seconds) to every event entering the target service. The service is marked degraded while active.",
  duplicate: "Replays a fraction of events into the target service with the same event ID, 1s after the original.",
  outage: "Makes the target service unavailable. Resilient senders retry with backoff; faulty senders drop events. Recovery is only reported once the backlog drains.",
  packet_loss: "Drops a fraction of events before they reach the target service. Every drop is recorded with a reason.",
  out_of_order: "Holds a fraction of events for the hold time so newer readings overtake them. Event time is preserved.",
};

export function FaultFields({ fault, onChange, errors }: { fault: FaultConfig; onChange: (f: FaultConfig) => void; errors?: Record<string, string> }) {
  const set = (p: Partial<FaultConfig>) => onChange({ ...fault, ...p });
  const manual = fault.type === "outage" && fault.durationSec === null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Fault type" htmlFor="fault-type" hint={FAULT_HELP[fault.type]}>
        <select id="fault-type" className={inputClass} value={fault.type} onChange={(e) => {
          const type = e.target.value as FaultType;
          set({ type, delaySec: type === "latency" ? 15 : type === "out_of_order" ? 8 : 0, intensity: type === "latency" || type === "outage" ? 1 : type === "packet_loss" ? 0.1 : 0.25, durationSec: fault.durationSec ?? 60, target: type !== "outage" && fault.target === "device" ? "ingestion" : fault.target });
        }}>
          {(Object.keys(FAULT_LABELS) as FaultType[]).map((t) => (
            <option key={t} value={t}>{FAULT_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      <Field label="Target service" htmlFor="fault-target" hint="Latency, loss, duplicates and reordering affect events entering this service; an outage affects the service itself." error={errors?.target}>
        <select id="fault-target" className={inputClass} value={fault.target} onChange={(e) => set({ target: e.target.value as ServiceId })}>
          {SERVICE_IDS.map((s) => (
            <option key={s} value={s}>{SERVICE_LABELS[s]}</option>
          ))}
        </select>
      </Field>
      <Field label="Fault start (virtual s)" htmlFor="fault-start" hint="When the fault becomes active. Ignored for live injection (starts now)." error={errors?.startSec}>
        <input id="fault-start" type="number" min={0} step={1} className={inputClass} value={fault.startSec} onChange={(e) => set({ startSec: Number(e.target.value) })} />
      </Field>
      <Field label={fault.type === "outage" ? "Outage duration (s)" : "Fault duration (s)"} htmlFor="fault-duration" hint={fault.type === "outage" ? "Leave blank (use the checkbox) to keep the service down until you recover it manually." : "How long the fault stays active."} error={errors?.durationSec}>
        <input id="fault-duration" type="number" min={1} step={1} disabled={manual} className={inputClass} value={fault.durationSec ?? ""} onChange={(e) => set({ durationSec: e.target.value === "" ? null : Number(e.target.value) })} />
        {fault.type === "outage" && (
          <label className="mt-1 flex items-center gap-2 text-xs text-mute">
            <input type="checkbox" checked={manual} onChange={(e) => set({ durationSec: e.target.checked ? null : 60 })} /> Until manually recovered
          </label>
        )}
      </Field>
      {(fault.type === "latency" || fault.type === "out_of_order") && (
        <Field label={fault.type === "latency" ? "Added delay (s)" : "Hold time (s)"} htmlFor="fault-delay" hint={fault.type === "latency" ? "Presets: 5, 15, 60." : "Must exceed the spacing between readings from one device for reordering to occur."} error={errors?.delaySec}>
          <div className="flex flex-wrap gap-2">
            <input id="fault-delay" type="number" min={1} className={inputClass} value={fault.delaySec} onChange={(e) => set({ delaySec: Number(e.target.value) })} />
            {fault.type === "latency" && [5, 15, 60].map((d) => (
              <Button key={d} type="button" variant={fault.delaySec === d ? "primary" : "secondary"} onClick={() => set({ delaySec: d })}>{d}s</Button>
            ))}
          </div>
        </Field>
      )}
      {(fault.type === "packet_loss" || fault.type === "duplicate" || fault.type === "out_of_order") && (
        <Field label={`Intensity (${Math.round(fault.intensity * 100)}% of events)`} htmlFor="fault-intensity" hint="Fraction of eligible events affected, drawn from the seeded generator so runs are reproducible." error={errors?.intensity}>
          <div className="flex flex-wrap gap-2">
            <input id="fault-intensity" type="number" min={1} max={100} step={1} className={inputClass} value={Math.round(fault.intensity * 100)} onChange={(e) => set({ intensity: Number(e.target.value) / 100 })} />
            {fault.type === "packet_loss" && [5, 10, 25].map((p) => (
              <Button key={p} type="button" variant={Math.round(fault.intensity * 100) === p ? "primary" : "secondary"} onClick={() => set({ intensity: p / 100 })}>{p}%</Button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

/** Live injection while a run is active. */
export function FaultInjector({ durationSec, nowSec, disabled, onInject }: { durationSec: number; nowSec: number; disabled: boolean; onInject: (f: FaultConfig) => void }) {
  const [fault, setFault] = useState<FaultConfig>(makeFault({ type: "outage", target: "delivery", durationSec: null, intensity: 1 }));
  const issues = validateFault({ ...fault, startSec: nowSec }, { durationSec });
  const errors: Record<string, string> = {};
  issues.forEach((i) => (errors[i.path.split(".").pop() as string] = i.message));
  return (
    <div className="space-y-4" data-testid="fault-injector">
      <FaultFields fault={fault} onChange={setFault} errors={errors} />
      <Button variant="danger" disabled={disabled || issues.length > 0} onClick={() => onInject(fault)} data-testid="inject-fault">
        ⚡ Inject {FAULT_LABELS[fault.type].toLowerCase()} now
      </Button>
      {disabled && <p className="text-xs text-mute">Start or resume a run to inject faults live.</p>}
    </div>
  );
}
