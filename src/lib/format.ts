import type { Health, ServiceId } from "@/engine";

export const fmtSec = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${n.toFixed(digits)}s`);
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${(Math.round(n * 1000) / 10).toFixed(1)}%`);
export const clock = (n: number) => `${n.toFixed(1).padStart(6, " ")}s`;

export const HEALTH_META: Record<Health, { label: string; glyph: string; text: string; bg: string; border: string; hex: string }> = {
  healthy: { label: "Healthy", glyph: "✓", text: "text-teal", bg: "bg-teal/10", border: "border-teal/40", hex: "#0b6b63" },
  degraded: { label: "Degraded", glyph: "▲", text: "text-amber", bg: "bg-amber/10", border: "border-amber/40", hex: "#b45309" },
  unavailable: { label: "Unavailable", glyph: "✕", text: "text-red", bg: "bg-red/10", border: "border-red/40", hex: "#b91c1c" },
  recovering: { label: "Recovering", glyph: "↻", text: "text-amber", bg: "bg-amber/10", border: "border-amber/40", hex: "#b45309" },
};

export const SERVICE_SHORT: Record<ServiceId, string> = {
  device: "Device",
  ingestion: "Ingestion",
  processor: "Processor",
  rules: "Rules",
  delivery: "Delivery",
  dashboard: "Clinician UI",
};

export const STATUS_TONE: Record<string, "teal" | "amber" | "red" | "gray"> = {
  generated: "gray",
  in_transit: "gray",
  delayed: "amber",
  received: "gray",
  queued: "amber",
  processed: "teal",
  alert_generated: "teal",
  delivered: "teal",
  dropped: "red",
  rejected_duplicate: "amber",
  failed: "red",
};

export const STATUS_GLYPH: Record<string, string> = {
  generated: "○",
  in_transit: "→",
  delayed: "…",
  received: "↓",
  queued: "≡",
  processed: "✓",
  alert_generated: "!",
  delivered: "✓✓",
  dropped: "✕",
  rejected_duplicate: "⧉",
  failed: "✕",
};

export const humanize = (s: string) => s.replace(/_/g, " ");
