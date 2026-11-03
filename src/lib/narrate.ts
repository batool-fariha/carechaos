import { SERVICE_IDS, SERVICE_LABELS, type Metrics, type SimulationResult } from "@/engine";

export type Tone = "teal" | "amber" | "red" | "gray";

export interface Narration {
  tone: Tone;
  headline: string;
  detail: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain-language description of what the simulation is doing right now, derived only from engine state. */
export function narrate(result: SimulationResult, m: Metrics): Narration {
  const { status, services, config } = result;
  const resilient = config.mode === "resilient";
  if (status === "idle") {
    return { tone: "gray", headline: "Ready to run", detail: "Press Run. Fictional patient readings will flow through the pipeline while a failure is injected, so you can watch how the system copes." };
  }
  const waiting = SERVICE_IDS.reduce((a, id) => a + services[id].queueDepth, 0);
  if (status === "stopped") {
    return { tone: "gray", headline: "Stopped early", detail: `You stopped the run at ${result.nowSec.toFixed(0)}s, so no pass or fail verdict is given. ${plural(m.readingsProcessed, "reading")} had been processed.` };
  }
  if (status === "completed") {
    const rate = m.deliveryRate.value;
    const delivered = rate === null ? "no alerts were expected" : `${m.alertsDelivered} of ${m.alertsExpected} alerts reached the clinician`;
    return {
      tone: m.readingLoss.unexpected + m.alertLoss.unexpected > 0 ? "red" : "teal",
      headline: "Run finished",
      detail: `${delivered}. ${m.readingLoss.unexpected + m.alertLoss.unexpected > 0 ? `${m.readingLoss.unexpected + m.alertLoss.unexpected} items were lost because of the failure.` : "Nothing was lost to the failure."}${m.recoveryTimeSec !== null ? ` Recovery took ${m.recoveryTimeSec.toFixed(1)}s.` : ""}`,
    };
  }
  const down = SERVICE_IDS.filter((s) => services[s].health === "unavailable");
  if (down.length) {
    const name = SERVICE_LABELS[down[0]];
    return {
      tone: "red",
      headline: `${name} is down`,
      detail: resilient
        ? `${plural(waiting, "message")} ${waiting === 1 ? "is" : "are"} waiting and being retried. Nothing is lost yet. They will be delivered once it recovers.`
        : "Messages sent to it are being dropped. This weak reference system has no retry or buffer, so they are lost.",
    };
  }
  const recovering = SERVICE_IDS.filter((s) => services[s].health === "recovering");
  if (recovering.length) {
    return { tone: "amber", headline: `${SERVICE_LABELS[recovering[0]]} is back`, detail: `It is catching up on a backlog of ${plural(waiting, "message")}. Recovery is only complete once the backlog is empty.` };
  }
  const f = SERVICE_IDS.flatMap((s) => services[s].activeFaults)[0];
  if (f) {
    const where = SERVICE_LABELS[f.target];
    const text: Record<string, string> = {
      latency: `Messages to ${where} are arriving ${f.delaySec}s late. ${resilient ? "Old data is flagged as stale." : "Nothing marks the data as stale."}`,
      duplicate: `Some messages to ${where} are being sent twice. ${resilient ? "Duplicates are rejected by event ID." : "Duplicates are accepted, so clinicians may see repeats."}`,
      packet_loss: `${Math.round(f.intensity * 100)}% of messages to ${where} are being lost on the way. ${resilient ? "Gaps are detected from sequence numbers." : "Nothing detects the gaps."}`,
      out_of_order: `Some messages to ${where} arrive out of order. ${resilient ? "Newer readings are never overwritten by older ones." : "Older readings can overwrite newer ones."}`,
    };
    return { tone: "amber", headline: "A failure is being injected", detail: text[f.type] ?? "A fault is active." };
  }
  return {
    tone: "teal",
    headline: status === "paused" ? "Paused" : "All systems healthy",
    detail: `${plural(m.readingsProcessed, "reading")} processed and ${plural(m.alertsDelivered, "alert")} delivered so far.${waiting ? ` ${waiting} waiting.` : ""} The failure has not started yet or has ended.`,
  };
}
