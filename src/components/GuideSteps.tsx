import { describeFault, type SimulationResult } from "@/engine";
import clsx from "clsx";

/** A four-step "what to watch for" tracker, driven by the run's actual timeline. Hidden for fault-free runs. */
export function GuideSteps({ result }: { result: SimulationResult }) {
  const c = result.config;
  const injected = c.interventions.flatMap((i) => (i.type === "inject" ? [i.fault] : []));
  const fault = c.faults[0] ?? injected[0];
  if (!fault) return null;
  const tl = result.timeline;
  const started = tl.some((t) => t.kind === "fault_started");
  const impact =
    tl.some((t) => t.kind === "service_state" && !/→ healthy/.test(t.detail)) ||
    result.counters.duplicatesInjected + result.counters.packetsDropped + result.counters.lateArrivals + result.counters.staleOverwrites + result.counters.staleFlagged > 0 ||
    result.events.some((e) => e.status === "dropped");
  const recovered = tl.some((t) => t.kind === "fault_ended" || t.kind === "recovery_completed");
  const done = result.status === "completed" || result.status === "stopped";
  const flags = [started, impact, recovered, done];
  const current = flags.findIndex((f) => !f);
  const steps = [
    { t: "Failure starts", s: describeFault(fault).replace(/\.$/, "") },
    { t: "Impact appears", s: "Watch the banner, the stage that turns red or amber, and the queue" },
    { t: "System recovers", s: "The failure ends and the backlog drains" },
    { t: "Verdict", s: "Pass or fail, with evidence" },
  ];
  return (
    <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="What to watch for" data-testid="guide-steps">
      {steps.map((st, i) => {
        const state = flags[i] ? "done" : i === current ? "current" : "todo";
        return (
          <li key={st.t} data-state={state} className={clsx("rounded-lg border px-3 py-2.5 text-sm", state === "done" && "border-teal/40 bg-teal/5", state === "current" && "border-ink/40 bg-panel", state === "todo" && "border-line bg-panel/60 text-mute")}>
            <div className="flex items-center gap-2 font-medium">
              <span aria-hidden className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", state === "done" ? "bg-teal text-bg" : state === "current" ? "bg-ink text-bg" : "border border-line")}>
                {state === "done" ? "✓" : i + 1}
              </span>
              {st.t}
              <span className="sr-only"> ({state === "done" ? "done" : state === "current" ? "now" : "upcoming"})</span>
            </div>
            <p className="mt-1 text-xs leading-snug text-mute">{st.s}</p>
          </li>
        );
      })}
    </ol>
  );
}
