# Changelog

## Unreleased

- Share links: "Copy share link" on results; unique page titles and an Open Graph preview image.
- Guided four-step tracker in the lab.
- Per-browser history ownership (anonymous cookie); edit and delete are owner-only; rate-limited writes; `/api/health`.
- New logo and favicon; credits footer; working GitHub links; error page.
- Documentation overhaul: README, API, security, deployment; issue and PR templates, security policy, code of conduct.

- Light theme, landing page at `/` with a pipeline diagram, lab moved to `/lab`.
- Plain-language narrator banner; secondary numbers, charts, injector and event log are collapsed by default.
- Headless scenario runner (`npm run scenarios`) with CI exit codes and report output; GitHub Actions workflow.
- Experiment form supports up to four simultaneous faults; assertions are generated per fault type.
- Storage adapter: Postgres via `DATABASE_URL`, SQLite otherwise; Settings shows which is active and whether it persists.
- Automated axe accessibility checks; real README screenshots (`npm run screenshots`).

## 0.1.0 — MVP

- Deterministic, event-driven simulation engine with a virtual clock and seeded PRNG.
- Six-stage synthetic pipeline: device → ingestion → processor → alert rules → delivery → clinician dashboard.
- Fault injection: latency, duplicate delivery, service outage, packet loss, out-of-order delivery, recovery backlog.
- Resilient mode (idempotency, bounded retries, durable queue + dead-letter redrive, stale-data flags, gap detection) and a documented faulty reference mode.
- Seven scenarios with hypotheses and assertions that can fail.
- Metrics with explicit denominators; failure-mode detection; evidence-based recommendations.
- Dashboard, topology view, live fault injection, manual recovery, experiment form, results page with baseline/mode comparison.
- SQLite experiment history (Node built-in `node:sqlite`), JSON (schema 1.0) and Markdown report export.
- Vitest unit/integration tests and Playwright end-to-end tests.
