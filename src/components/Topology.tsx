"use client";
import { SERVICE_IDS, SERVICE_LABELS, describeFault, type Health, type ServiceId, type SimulationResult } from "@/engine";
import { HEALTH_META } from "@/lib/format";

const W = 152;
const H = 112;
const GAP = 38;
const X0 = 8;
const Y = 28;

const STRIPE_ID = "topo-stripe";

export function Topology({ result, selected, onSelect }: { result: SimulationResult; selected: ServiceId | null; onSelect: (s: ServiceId) => void }) {
  const total = SERVICE_IDS.length * W + (SERVICE_IDS.length - 1) * GAP + X0 * 2;
  const running = result.status === "running";
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${total} 210`} role="group" aria-label="Pipeline topology" className="min-w-[980px] w-full">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#6b7683" />
          </marker>
          <pattern id={STRIPE_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="transparent" />
            <rect width="2" height="6" fill="#f4616a" opacity="0.18" />
          </pattern>
        </defs>
        {SERVICE_IDS.map((id, i) => {
          if (i === SERVICE_IDS.length - 1) return null;
          const next = SERVICE_IDS[i + 1];
          const x1 = X0 + i * (W + GAP) + W;
          const x2 = X0 + (i + 1) * (W + GAP);
          const y = Y + H / 2;
          const tgt = result.services[next];
          const down = tgt.health === "unavailable";
          const slow = tgt.activeFaults.some((f) => f.type === "latency" || f.type === "out_of_order");
          const lossy = tgt.activeFaults.some((f) => f.type === "packet_loss" || f.type === "duplicate");
          const stroke = down ? "#f4616a" : slow || lossy ? "#f5b13d" : "#3a4552";
          return (
            <g key={id}>
              <line x1={x1 + 2} y1={y} x2={x2 - 4} y2={y} stroke={stroke} strokeWidth={2} strokeDasharray={down ? "2 5" : running ? "6 6" : undefined} className={running && !down ? "edge-flow" : undefined} markerEnd="url(#arrow)" />
              <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontSize="10" fill="#98a2b0" className="tabnum">
                {tgt.received}
              </text>
              {down && (
                <text x={(x1 + x2) / 2} y={y + 18} textAnchor="middle" fontSize="10" fill="#f4616a">
                  blocked
                </text>
              )}
            </g>
          );
        })}
        {SERVICE_IDS.map((id, i) => {
          const s = result.services[id];
          const meta = HEALTH_META[s.health as Health];
          const x = X0 + i * (W + GAP);
          const sel = selected === id;
          const hex = meta.hex;
          const fault = s.activeFaults[0];
          return (
            <g
              key={id}
              transform={`translate(${x} ${Y})`}
              role="button"
              tabIndex={0}
              aria-pressed={sel}
              aria-label={`${SERVICE_LABELS[id]}: ${meta.label}, queue depth ${s.queueDepth}, ${s.failed} failures. Open details.`}
              data-testid={`node-${id}`}
              data-health={s.health}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(id))}
              style={{ cursor: "pointer" }}
            >
              <rect width={W} height={H} rx={10} fill="#12161c" stroke={sel ? "#e7ebf0" : hex} strokeWidth={sel ? 2 : 1.5} strokeDasharray={s.health === "recovering" ? "5 3" : undefined} />
              {s.health === "unavailable" && <rect width={W} height={H} rx={10} fill={`url(#${STRIPE_ID})`} />}
              <text x={10} y={20} fontSize="12" fontWeight="600" fill="#e7ebf0">
                {SERVICE_LABELS[id]}
              </text>
              <text x={10} y={38} fontSize="11" fontWeight="600" fill={hex}>
                {meta.glyph} {meta.label}
              </text>
              <text x={10} y={58} fontSize="10.5" fill="#98a2b0" className="tabnum">
                in {s.received} · out {s.processed}
              </text>
              <text x={10} y={73} fontSize="10.5" fill={s.failed ? "#f4616a" : "#98a2b0"} className="tabnum">
                failed {s.failed} · dup rej {s.duplicatesRejected}
              </text>
              <rect x={10} y={83} width={W - 20} height={18} rx={4} fill="#0c0f13" />
              <text x={16} y={96} fontSize="10.5" fill={s.queueDepth ? "#f5b13d" : "#98a2b0"} className="tabnum">
                queue {s.queueDepth}
                {s.peakQueueDepth ? ` (peak ${s.peakQueueDepth})` : ""}
              </text>
              {fault && (
                <g transform={`translate(0 ${H + 8})`}>
                  <rect width={W} height={34} rx={6} fill="#f4616a" fillOpacity={0.1} stroke="#f4616a" strokeOpacity={0.5} />
                  <text x={8} y={14} fontSize="10" fontWeight="700" fill="#f4616a">
                    ⚡ FAULT · {fault.type.replace("_", " ")}
                  </text>
                  <text x={8} y={27} fontSize="9.5" fill="#98a2b0">
                    {faultShort(fault)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function faultShort(f: SimulationResult["services"][ServiceId]["activeFaults"][number]): string {
  switch (f.type) {
    case "latency":
      return `+${f.delaySec}s on input`;
    case "outage":
      return f.durationSec ? `down ${f.durationSec}s from ${f.startSec}s` : "down until recovered";
    default:
      return `${Math.round(f.intensity * 100)}% of events` + (f.type === "out_of_order" ? `, hold ${f.delaySec}s` : "");
  }
}

export { describeFault };
