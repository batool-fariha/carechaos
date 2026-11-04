import type { FaultConfig } from "@/engine";
import { SERVICE_LABELS } from "@/engine";
import clsx from "clsx";

const TYPE_LABEL: Record<FaultConfig["type"], string> = {
  latency: "Latency",
  duplicate: "Duplicates",
  outage: "Outage",
  packet_loss: "Packet loss",
  out_of_order: "Out of order",
};

/** Horizontal schedule of faults across the observation window. Bars carry text labels, not just color. */
export function FaultTimeline({ faults, durationSec, compact = false }: { faults: FaultConfig[]; durationSec: number; compact?: boolean }) {
  if (!faults.length) return <p className="text-sm text-mute">No faults scheduled.</p>;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / durationSec) * 100))}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * durationSec));
  return (
    <div data-testid="fault-timeline" role="img" aria-label={`Fault schedule: ${faults.map((f) => `${TYPE_LABEL[f.type]} on ${SERVICE_LABELS[f.target]} from ${f.startSec}s${f.durationSec ? ` for ${f.durationSec}s` : " until recovered"}`).join("; ")}`}>
      <div className="space-y-1.5">
        {faults.map((f, i) => {
          const end = f.durationSec === null ? durationSec : Math.min(durationSec, f.startSec + f.durationSec);
          const open = f.durationSec === null;
          return (
            <div key={i} className="flex items-center gap-3">
              {!compact && <div className="w-44 shrink-0 truncate text-xs text-mute">{TYPE_LABEL[f.type]} · {SERVICE_LABELS[f.target]}</div>}
              <div className="relative h-6 flex-1 rounded bg-panel2">
                <div
                  className={clsx("absolute top-0 flex h-6 items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[11px] font-medium", f.type === "outage" ? "bg-red/20 text-ink ring-1 ring-red/60" : "bg-amber/20 text-ink ring-1 ring-amber/60", open && "border-r-4 border-dashed border-red")}
                  style={{ left: pct(f.startSec), width: `calc(${pct(end)} - ${pct(f.startSec)})`, minWidth: 4 }}
                >
                  {compact ? `${TYPE_LABEL[f.type]} · ${SERVICE_LABELS[f.target]}` : `${f.startSec}s–${open ? "recovered" : `${Math.round(end)}s`}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={clsx("relative mt-1 h-4 text-[10px] text-mute", !compact && "ml-[11.75rem]")} aria-hidden>
        {ticks.map((t, i) => (
          <span key={i} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>
            {t}s
          </span>
        ))}
      </div>
    </div>
  );
}
