"use client";
import { SERVICE_IDS, SERVICE_LABELS, type Health, type ServiceId, type SimulationResult } from "@/engine";
import { HEALTH_META } from "@/lib/format";

const W = 148;
const H = 78;
const GAP = 38;
const X0 = 8;
const Y = 14;

export function Topology({ result, selected, onSelect }: { result: SimulationResult; selected: ServiceId | null; onSelect: (s: ServiceId) => void }) {
  const total = SERVICE_IDS.length * W + (SERVICE_IDS.length - 1) * GAP + X0 * 2;
  const running = result.status === "running";
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${total} 122`} role="group" aria-label="Pipeline topology" className="min-w-[960px] w-full">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="#8b95a3" />
          </marker>
          <pattern id="topo-stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="6" fill="#b91c1c" opacity="0.12" />
          </pattern>
        </defs>
        {SERVICE_IDS.slice(0, -1).map((id, i) => {
          const next = SERVICE_IDS[i + 1];
          const x1 = X0 + i * (W + GAP) + W;
          const x2 = X0 + (i + 1) * (W + GAP);
          const y = Y + H / 2;
          const tgt = result.services[next];
          const down = tgt.health === "unavailable";
          const odd = tgt.activeFaults.some((f) => f.type !== "outage");
          const stroke = down ? "#b91c1c" : odd ? "#b45309" : "#b7c0cc";
          return (
            <line key={id} x1={x1 + 2} y1={y} x2={x2 - 4} y2={y} stroke={stroke} strokeWidth={2} strokeDasharray={down ? "2 5" : running ? "6 6" : undefined} className={running && !down ? "edge-flow" : undefined} markerEnd="url(#arrow)" />
          );
        })}
        {SERVICE_IDS.map((id, i) => {
          const s = result.services[id];
          const meta = HEALTH_META[s.health as Health];
          const x = X0 + i * (W + GAP);
          const sel = selected === id;
          const fault = s.activeFaults[0];
          return (
            <g
              key={id}
              transform={`translate(${x} ${Y})`}
              role="button"
              tabIndex={0}
              aria-pressed={sel}
              aria-label={`${SERVICE_LABELS[id]}: ${meta.label}, ${s.queueDepth} waiting. Open details.`}
              data-testid={`node-${id}`}
              data-health={s.health}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(id))}
              style={{ cursor: "pointer" }}
            >
              <rect width={W} height={H} rx={10} fill="#ffffff" stroke={sel ? "#14181f" : meta.hex} strokeWidth={sel ? 2.5 : 1.5} strokeDasharray={s.health === "recovering" ? "5 3" : undefined} />
              {s.health === "unavailable" && <rect width={W} height={H} rx={10} fill="url(#topo-stripe)" />}
              <text x={12} y={26} fontSize="13" fontWeight="600" fill="#14181f">
                {SERVICE_LABELS[id]}
              </text>
              <text x={12} y={47} fontSize="12" fontWeight="600" fill={meta.hex}>
                {meta.glyph} {meta.label}
              </text>
              {s.queueDepth > 0 && (
                <text x={12} y={66} fontSize="11.5" fill="#b45309" className="tabnum">
                  {s.queueDepth} waiting
                </text>
              )}
              {fault && (
                <g transform={`translate(0 ${H + 8})`}>
                  <text x={2} y={12} fontSize="11" fontWeight="700" fill="#b91c1c">
                    ⚡ {fault.type.replace("_", " ")}
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
