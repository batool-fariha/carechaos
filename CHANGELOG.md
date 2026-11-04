# Changelog

## 0.1.1

- `pipeline.deadLetterRedrive: false` models a pipeline that discards an event after its last retry (no dead-letter queue). Exhausted events are recorded as lost with reason `retries_exhausted`, and the report names the failure mode and recommends a fix. Default behavior is unchanged.

## 0.1.0

First public release.

**Simulator**
- Deterministic, event-driven engine with a virtual clock and seeded randomness; six-stage synthetic pipeline from device to clinician dashboard.
- Faults: latency, duplicate delivery, outage (manual or timed recovery), packet loss, out-of-order delivery, recovery backlog with configurable drain rate. Up to 12 scheduled faults per experiment.
- Resilient mode (idempotency, bounded retries, durable queue with dead-letter redrive, stale-data flags, gap detection) and a documented weak reference mode.
- Eight scenarios with hypotheses and assertions that can fail, including a "game day" that stacks five faults.
- Bring-your-own pipeline: stage capacities, queue limits, retry policy and alert rules.

**App**
- Landing page, plain-language narrator, guided four-step tracker, live pipeline view, live fault injection and manual recovery, light theme.
- Results with assertion evidence, baseline vs run vs other-mode comparison, fault timeline, recommendations, per-event tracing, JSON (schema 1.0) and Markdown export.
- Share links, Open Graph preview, experiment file import/export.
- Per-browser history (SQLite or Postgres), optional "Sign in with GitHub" so history follows you across devices, rate-limited writes.

**Automation**
- `carechaos` CLI (`run`, `validate`, `init`, `list`), JUnit output, Markdown step summaries, and a reusable GitHub Action.

**Quality**
- 89 unit and integration tests, 27 Playwright end-to-end tests (OAuth exercised against a fake GitHub), automated accessibility checks.
