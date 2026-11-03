import Link from "next/link";
import { SCENARIOS, describeFault } from "@/engine";
import { Card, linkButtonClass } from "@/components/ui";

export default function Scenarios() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Scenario library</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">Seven preconfigured experiments. Each states a hypothesis and carries assertions that really can fail. Run them against the resilient implementation or the deliberately weak reference to see the difference.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SCENARIOS.map((s) => (
          <Card key={s.id} title={s.name} id={s.id}>
            <div className="space-y-3 text-sm" data-testid={`scenario-${s.id}`}>
              <p>{s.description}</p>
              <p><b>Hypothesis:</b> <span className="text-mute">{s.hypothesis}</span></p>
              <p><b>Initial conditions:</b> <span className="text-mute">{s.initialConditions}</span></p>
              <div>
                <b>Fault configuration:</b>
                <ul className="list-disc pl-5 text-mute">{s.faults.length ? s.faults.map((f, i) => <li key={i}>{describeFault(f)}</li>) : <li>None</li>}</ul>
              </div>
              <p><b>Expected behavior:</b> <span className="text-mute">{s.expectedBehavior}</span></p>
              <div>
                <b>Assertions:</b>
                <ul className="list-disc pl-5 text-mute">{s.assertions.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
              </div>
              <p><b>Relevant metrics:</b> <span className="text-mute">{s.relevantMetrics.join(" · ")}</span></p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/lab?scenario=${s.id}`} className={linkButtonClass("primary")}>Open in lab</Link>
                <Link href={`/lab?scenario=${s.id}&mode=faulty`} className={linkButtonClass()}>Open weak system</Link>
                <Link href={`/experiments/new?scenario=${s.id}`} className={linkButtonClass()}>Customize</Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
