"use client";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERVICE_IDS, type Health, type ServiceId, type Sample, type SimulationResult } from "@/engine";
import { HEALTH_META, SERVICE_SHORT } from "@/lib/format";
import { Card, Empty } from "./ui";

const axis = { stroke: "#6b7683", fontSize: 11 } as const;
const tooltipStyle = { background: "#12161c", border: "1px solid #252c36", borderRadius: 6, fontSize: 12 };

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function ChartBox({ title, empty, children, caption }: { title: string; empty: boolean; children: React.ReactNode; caption?: string }) {
  const mounted = useMounted();
  return (
    <Card title={title}>
      {empty ? (
        <Empty>No data yet. Run an experiment to populate this chart from engine output.</Empty>
      ) : (
        <div className="h-52 w-full">{mounted && <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>}</div>
      )}
      {caption && <p className="mt-2 text-xs text-mute">{caption}</p>}
    </Card>
  );
}

export function QueueChart({ samples }: { samples: Sample[] }) {
  return (
    <ChartBox title="Queue depth over time" empty={samples.length < 2} caption="Events queued, held for retry, or dead-lettered, summed across services (virtual seconds).">
      <AreaChart data={samples} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#252c36" strokeDasharray="3 3" />
        <XAxis dataKey="t" {...axis} tickFormatter={(v) => `${Math.round(v)}s`} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `t = ${v}s`} />
        <Area type="stepAfter" dataKey="totalDepth" name="Queue depth" stroke="#f5b13d" fill="#f5b13d" fillOpacity={0.2} isAnimationActive={false} />
      </AreaChart>
    </ChartBox>
  );
}

export function LatencyChart({ samples }: { samples: Sample[] }) {
  return (
    <ChartBox title="Latency over time" empty={samples.length < 2} caption="Mean event-time → processed-time latency of readings processed in each virtual second.">
      <LineChart data={samples} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#252c36" strokeDasharray="3 3" />
        <XAxis dataKey="t" {...axis} tickFormatter={(v) => `${Math.round(v)}s`} />
        <YAxis {...axis} unit="s" />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `t = ${v}s`} formatter={(v) => (typeof v === "number" ? `${v.toFixed(2)}s` : v)} />
        <Line type="monotone" dataKey="latencySec" name="Mean latency" stroke="#2dd4bf" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ChartBox>
  );
}

export function OutcomeChart({ samples }: { samples: Sample[] }) {
  return (
    <ChartBox title="Successful vs failed events" empty={samples.length < 2} caption="Cumulative unique events. Failed = dropped or dead-lettered at the time of sampling.">
      <LineChart data={samples} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#252c36" strokeDasharray="3 3" />
        <XAxis dataKey="t" {...axis} tickFormatter={(v) => `${Math.round(v)}s`} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `t = ${v}s`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="processed" name="Processed" stroke="#2dd4bf" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="delivered" name="Alerts delivered" stroke="#e7ebf0" strokeDasharray="5 3" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="failed" name="Failed" stroke="#f4616a" strokeDasharray="2 3" dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  );
}

/** Service health strip: one row per service. Non-color cues: glyph legend + hatch/dot patterns. */
export function HealthStrip({ result }: { result: SimulationResult }) {
  const samples = result.samples;
  const mounted = useMounted();
  const rowH = 18;
  const cols = Math.min(samples.length, 240);
  const step = samples.length / Math.max(cols, 1);
  const W = 600;
  const cw = W / Math.max(cols, 1);
  return (
    <Card title="Service health over time">
      {samples.length < 2 ? (
        <Empty>No data yet. Run an experiment to populate this chart from engine output.</Empty>
      ) : (
        <div>
          <svg viewBox={`0 0 ${W + 90} ${SERVICE_IDS.length * (rowH + 4) + 18}`} className="w-full" role="img" aria-label="Service health over time">
            <defs>
              <pattern id="hs-deg" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="#f5b13d" />
                <rect width="2" height="5" fill="#12161c" />
              </pattern>
              <pattern id="hs-rec" width="5" height="5" patternUnits="userSpaceOnUse">
                <rect width="5" height="5" fill="#12161c" />
                <circle cx="2.5" cy="2.5" r="1.4" fill="#f5b13d" />
              </pattern>
            </defs>
            {mounted &&
              SERVICE_IDS.map((id, r) => (
                <g key={id} transform={`translate(0 ${r * (rowH + 4)})`}>
                  <text x={0} y={rowH - 5} fontSize="10.5" fill="#98a2b0">
                    {SERVICE_SHORT[id]}
                  </text>
                  {Array.from({ length: cols }, (_, c) => {
                    const smp = samples[Math.min(samples.length - 1, Math.floor(c * step))];
                    return <rect key={c} x={90 + c * cw} y={0} width={cw + 0.4} height={rowH} fill={fillFor(smp.health[id])} />;
                  })}
                </g>
              ))}
            <text x={90} y={SERVICE_IDS.length * (rowH + 4) + 12} fontSize="10" fill="#6b7683">
              0s
            </text>
            <text x={90 + W} y={SERVICE_IDS.length * (rowH + 4) + 12} fontSize="10" fill="#6b7683" textAnchor="end">
              {Math.round(samples[samples.length - 1].t)}s
            </text>
          </svg>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
            {(["healthy", "degraded", "recovering", "unavailable"] as Health[]).map((h) => (
              <li key={h} className="flex items-center gap-1.5">
                <svg width="14" height="14" aria-hidden>
                  <rect width="14" height="14" rx="2" fill={fillFor(h)} stroke="#252c36" />
                </svg>
                <span className={HEALTH_META[h].text}>{HEALTH_META[h].glyph}</span> {HEALTH_META[h].label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function fillFor(h: Health): string {
  return h === "healthy" ? "#1f6f66" : h === "degraded" ? "url(#hs-deg)" : h === "recovering" ? "url(#hs-rec)" : "#f4616a";
}

export function HistogramChart({ title, values, caption }: { title: string; values: number[]; caption?: string }) {
  const bins = histogram(values);
  return (
    <ChartBox title={title} empty={values.length === 0} caption={caption}>
      <BarChart data={bins} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#252c36" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="Events" fill="#2dd4bf" isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}

function histogram(values: number[], nBins = 12): { label: string; count: number }[] {
  if (!values.length) return [];
  const max = Math.max(...values);
  const min = 0;
  const width = (max - min) / nBins || 1;
  const out = Array.from({ length: nBins }, (_, i) => ({ label: `${(min + i * width).toFixed(width < 1 ? 1 : 0)}s`, count: 0 }));
  for (const v of values) out[Math.min(nBins - 1, Math.floor((v - min) / width))].count++;
  return out;
}

export type { ServiceId };
