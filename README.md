# CareChaos

**Chaos engineering for remote patient-monitoring software — in simulation.**

CareChaos lets you deliberately break a *synthetic* patient-monitoring data pipeline and see what happens to readings, alerts and recovery. It is inspired by Netflix's Chaos Monkey, but runs entirely locally on fictional data. It is a developer and educational tool, **not** a clinical decision-support system.

> ⚠️ Simulation only. All patients, devices and readings are fictional. A passing experiment does **not** establish clinical safety or regulatory compliance. See [docs/safety.md](docs/safety.md).

<!-- Screenshots: add docs/img/dashboard.png and docs/img/results.png -->
![Landing page](docs/img/landing.png)
![Lab mid-run: the Delivery Service is down and the page says so in plain language](docs/img/dashboard.png)
![Results page with assertions, baseline comparison and recommendations](docs/img/results.png)

Regenerate with `npm run screenshots` (against a running app).

## The problem

Digital-health pipelines move readings from devices to clinicians through several services. Real networks drop, delay, duplicate and reorder messages, and services go down. Teams rarely test *what the downstream workflow does* in those moments: Is a delayed alert flagged stale? Is a duplicate alert shown twice? Do queued events survive an outage? How long until the backlog drains?

## Why chaos engineering

Failure is cheaper to learn about on purpose, in a sandbox, with a hypothesis and an assertion, than during an incident. CareChaos gives engineers a two-minute loop: configure a failure → run → inspect impact → verify recovery → export a report.

## How it works

```mermaid
flowchart LR
  D[Device Simulator] --> I[Ingestion API] --> P[Readings Processor] --> R[Alert Rules Engine] --> V[Delivery Service] --> C[Clinician Dashboard]
  F{{Faults: latency · duplicates · outage · loss · reordering}} -.-> I & P & R & V & C
```

```mermaid
sequenceDiagram
  participant You
  participant Engine as Deterministic engine
  participant Eval as Metrics + assertions
  You->>Engine: config (scenario, seed, faults, mode)
  Engine->>Engine: virtual clock, seeded PRNG, event queue
  Engine-->>You: live state (services, queues, events)
  Engine->>Eval: SimulationResult
  Eval-->>You: metrics, assertion verdicts, recommendations, report
```

* **Real engine first.** A deterministic, event-driven simulation with a virtual clock. The UI only chooses playback speed; tests run a full experiment in milliseconds. Same seed + config ⇒ identical results.
* **Every chart is engine output.** No hardcoded metrics.
* **Two modes.** *Resilient* (idempotency, bounded retries with backoff, durable queue and dead-letter redrive, stale-data flags, sequence-gap detection, newest-wins ordering) vs a documented *faulty reference* implementation, for side-by-side comparison on the same seed and volume.
* **Assertions can fail.** Each scenario states a hypothesis and checks it against what actually happened.

See [docs/architecture.md](docs/architecture.md), [docs/experiments.md](docs/experiments.md), [docs/metrics.md](docs/metrics.md), [docs/report-schema.md](docs/report-schema.md).

## Install and run

Requirements: **Node.js ≥ 22.5** (uses built-in `node:sqlite`; developed on Node 26) and npm. No API keys, Docker or external services.

```bash
npm install
npm run dev          # http://localhost:3000 (landing page; the lab is at /lab)
```

Production:

```bash
npm run build
npm start
```

Environment (all optional):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | Use Postgres for experiment history (e.g. Neon, Vercel Postgres). Table is created automatically. |
| `CARECHAOS_DB_PATH` | SQLite file for history when no Postgres URL is set (default `data/carechaos.db`). |

On Vercel without `DATABASE_URL`, history falls back to ephemeral `/tmp` SQLite and the Settings page says so.

## Try it

1. Open `/` and press **Run the demo** (or go to `/lab`) (alert-service outage, resilient mode). Watch the Delivery node go *unavailable*, the queue build, then *recovering → healthy*.
2. Open the *Faulty reference* mode toggle and run again to see the same fault lose alerts.
3. **Inject a failure** into a running experiment, or **Recover** a down service manually.
4. When it finishes, **View results**: assertions, baseline vs run vs other mode, timeline, recoveries, failure modes, recommendations, event tracing. Export **JSON** or **Markdown**.

### Creating an experiment

`/experiments/new` → choose a preset, set seed, event volume, reading interval, window, resilience mode and up to four faults (type, target, start, duration, intensity/delay) that run simultaneously. Validation tells you what to fix (for example when the outage would end after the window).

## Headless scenario runner (CI)

```bash
npm run scenarios                              # all scenarios, resilient mode
npm run scenarios -- --mode both --out reports  # also run the faulty reference, write JSON + Markdown reports
npm run scenarios -- --scenario packet-loss,out-of-order --seed 7
```

Exit code is 1 if any **resilient** scenario fails an assertion (faulty runs are reference runs and never fail the suite), 2 for bad arguments. `.github/workflows/ci.yml` runs typecheck, unit tests, the scenario suite and the Playwright tests.

## Tests

```bash
npm run typecheck
npm test              # Vitest: unit + integration (engine, metrics, assertions, reports)
npm run test:e2e      # Playwright: builds the app, drives the real UI, runs axe accessibility checks (npx playwright install chromium first)
TEST_DATABASE_URL=postgres://… npm test   # also exercises the Postgres storage adapter
```

## Project layout

```
src/engine/       simulation, faults, metrics, assertions, scenarios, reports (no React)
src/app/          Next.js App Router pages and API routes
src/components/   UI (topology SVG, charts, event stream, results)
src/lib/          browser simulation driver, SQLite persistence
tests/  e2e/      Vitest and Playwright
docs/             architecture, experiments, metrics, safety, report schema, sample report
```

## Limitations

* Simplified pipeline model; latencies are virtual-time model outputs, not performance benchmarks.
* At most four faults per experiment. Events with an injected duplicate copy are excluded from latency assertions, because a copy bypasses the link fault.
* Alert thresholds are illustrative, not validated.
* Reading volume is capped at 2000 per experiment; the browser runs the engine, so very long runs at high speed use more CPU.
* History stores configs and replays them; it does not archive raw event logs. If you change engine logic, old experiments will replay with the new logic (`engineVersion` is recorded in reports).
* `node:sqlite` may print an experimental-feature warning on some Node versions.

## Roadmap

* Fault schedules and chaos "game days".
* Network partition and clock-skew faults; rate limiting and backpressure.
* Archive raw logs for exact historical results across engine versions.
* Pluggable pipeline definitions and user-supplied processing code.
* Light theme and screen-reader testing beyond automated axe checks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed — see [LICENSE](LICENSE).
