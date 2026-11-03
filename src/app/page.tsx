import Link from "next/link";
import { PipelineDiagram } from "@/components/PipelineDiagram";
import { linkButtonClass } from "@/components/ui";

const STEPS = [
  { n: "1", t: "Pick a failure", d: "An outage, a delay, lost, duplicated or reordered messages." },
  { n: "2", t: "Watch it run", d: "Fictional readings flow through the pipeline while the failure plays out, in plain language." },
  { n: "3", t: "Get a verdict", d: "Did alerts still reach the clinician? Pass or fail, with the evidence." },
];

export default function Home() {
  return (
    <div className="space-y-16 py-6 md:py-10">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-teal">Chaos engineering for remote patient monitoring</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">See what breaks when your patient-monitoring pipeline fails.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mute">
          CareChaos breaks a simulated pipeline on purpose and shows what happens to readings and alerts, and whether the system recovers. Everything is fictional data. Nothing touches a real patient or system.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/lab?autostart=1" className={linkButtonClass("primary")} data-testid="landing-demo">
            ▶ Run the demo
          </Link>
          <Link href="/scenarios" className={linkButtonClass()}>
            Browse scenarios
          </Link>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="text-xl font-semibold">What happens</h2>
        <p className="mt-1 text-sm text-mute">A reading travels left to right. You choose where it goes wrong.</p>
        <div className="mt-5 rounded-xl border border-line bg-panel p-4">
          <PipelineDiagram />
        </div>
      </section>

      <section aria-labelledby="steps">
        <h2 id="steps" className="sr-only">How to use it</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-panel p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal text-sm font-semibold text-bg">{s.n}</div>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-mute">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold">Two systems, same failure</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-mute">
          Run any scenario against a resilient system (retries, no duplicate alerts, flags stale data) and a deliberately weak one, using the same random seed, to see exactly what the safeguards buy you.
        </p>
      </section>
    </div>
  );
}
