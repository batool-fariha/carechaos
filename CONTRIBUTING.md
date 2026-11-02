# Contributing to CareChaos

Thanks for helping. CareChaos is a **simulation-only** tool: never add real patient data, real device/EHR connectivity, or claims of clinical safety or regulatory compliance.

## Setup

```bash
node -v   # 22.5 or newer (uses the built-in node:sqlite)
npm install
npx playwright install chromium   # only needed for e2e tests
npm run dev
```

## Where things live

| Path | Purpose |
|---|---|
| `src/engine/` | Pure TypeScript simulation. **No React, no DOM, no real time.** |
| `src/engine/simulation.ts` | Event loop, services, faults, recovery |
| `src/engine/assertions.ts`, `metrics.ts` | Evaluation derived only from engine output |
| `src/engine/scenarios.ts` | Scenario library and assertion sets |
| `src/components/`, `src/app/` | UI (Next.js App Router) |
| `src/lib/db.ts` | Optional SQLite persistence |
| `tests/`, `e2e/` | Vitest and Playwright |

## Ground rules

1. Engine changes need unit tests. If behavior changes, check `tests/integration.test.ts` still shows resilient mode passing and faulty mode failing the *intended* assertions.
2. Determinism is a feature. Draw randomness only from `makeRng(seed, label)`; never use `Math.random()` or `Date.now()` in the engine. Same config must give byte-identical results (there is a test).
3. Every number shown in the UI must come from engine output. No hardcoded demo metrics.
4. Never silently drop an event: every drop, rejection or dead-letter needs a reason.
5. Bump `REPORT_SCHEMA_VERSION` only for breaking changes to the exported JSON; document it in `docs/report-schema.md`.

## Before opening a PR

```bash
npm run typecheck && npm test && npm run build && npm run test:e2e
```

## Adding a scenario

Add an entry to `SCENARIOS` in `src/engine/scenarios.ts` with a hypothesis, faults and assertions, then add an expectation for the faulty reference mode in `tests/integration.test.ts`.
