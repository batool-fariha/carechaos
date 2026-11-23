# Changelog

## Unreleased

- New `network_partition` fault: the link into a service is cut for a set duration while the service itself keeps running and reports healthy, so alerts pile up silently. Resilient senders retry, report a suspected partition after two consecutive failed deliveries to a target that still reports healthy, dead-letter after the retry limit and replay the backlog when the partition heals. Faulty senders drop the events with reason `network_partition`. The partition is time-bounded and heals on its own. Available from the fault injector, the pipeline file and a new `network-partition` scenario (ten scenarios in all). The exported report format is unchanged.

- New `clock_skew` fault: a fraction of readings is stamped ahead of when it was taken, like a device with a wrong clock. In resilient mode ingestion keeps a reading stamped more than 5 s in the future, replaces its timestamp with the arrival time and flags it, so no future-dated alert reaches clinicians unflagged; faulty mode shows it as is. Available from the fault injector, the pipeline file and a new `clock-skew` scenario (nine scenarios in all). The exported report format is unchanged.

## 0.1.2

- Shortened the top-level description in `action.yml` to meet GitHub Marketplace's description-length requirement. No runtime behavior changes; inputs and defaults are unchanged. The release tag is v0.1.2, while the app's internal version stays 0.1.1.

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
