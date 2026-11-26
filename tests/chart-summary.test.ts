import { describe, expect, it } from "vitest";
import { SERVICE_IDS, type Health, type Sample, type ServiceId } from "@/engine";
import { healthSummary, histogramSummary, latencySummary, outcomeSummary, queueSummary } from "@/lib/chart-summary";

const health = (over: Partial<Record<ServiceId, Health>> = {}) =>
  Object.fromEntries(SERVICE_IDS.map((id) => [id, over[id] ?? "healthy"])) as Record<ServiceId, Health>;
const sample = (t: number, o: Partial<Sample> = {}): Sample => ({
  t, depth: Object.fromEntries(SERVICE_IDS.map((id) => [id, 0])) as Record<ServiceId, number>, totalDepth: 0,
  health: health(), generated: 0, processed: 0, delivered: 0, failed: 0, latencySec: null, ...o,
});

describe("chart text alternatives", () => {
  it("say nothing before there is data", () => {
    expect(queueSummary([sample(0)])).toBe("");
    expect(outcomeSummary([])).toBe("");
    expect(healthSummary([sample(0)])).toEqual([]);
  });

  it("queue: the peak and where it ended", () => {
    expect(queueSummary([sample(0), sample(10, { totalDepth: 42 }), sample(20, { totalDepth: 3 })])).toBe(
      "Queue depth peaked at 42 events at 10s and was 3 at the end (20s).",
    );
    expect(queueSummary([sample(0), sample(1)])).toBe("No events were queued at any point.");
  });

  it("latency: mean and peak, ignoring seconds with nothing processed", () => {
    expect(latencySummary([sample(0, { latencySec: 1 }), sample(1), sample(2, { latencySec: 3 })])).toBe("Mean latency averaged 2.00s and peaked at 3.00s at 2s.");
    expect(latencySummary([sample(0), sample(1)])).toMatch(/no latency/);
  });

  it("outcomes: the final counts", () => {
    expect(outcomeSummary([sample(0), sample(60, { processed: 100, delivered: 7, failed: 2 })])).toBe("By 60s: 100 events processed, 7 alerts delivered, 2 failed.");
  });

  it("health: seconds in each unhealthy state per service", () => {
    const s = [sample(0), sample(10, { health: health({ ingestion: "unavailable" }) }), sample(25, { health: health({ ingestion: "recovering" }) }), sample(30)];
    const ing = healthSummary(s).find((x) => x.id === "ingestion")!;
    expect(ing.text).toBe("Ingestion API: unavailable for 15s, recovering for 5s.");
    expect(healthSummary(s).filter((x) => x.text.endsWith("healthy throughout.")).length).toBe(SERVICE_IDS.length - 1);
  });

  it("histogram: count, median, p95 and max", () => {
    expect(histogramSummary([])).toBe("");
    expect(histogramSummary(Array.from({ length: 100 }, (_, i) => i + 1))).toBe("100 values: median 51, 95th percentile 96, maximum 100.");
    expect(histogramSummary([0.5, 1.25])).toBe("2 values: median 1.25, 95th percentile 1.25, maximum 1.25.");
  });
});
