# Report schema (version 1.0)

Reports are produced by `buildReport` (`src/engine/report.ts`) from a completed evaluation. Download them from the results page, or `GET /api/experiments/:id/report?format=json|md`. A sample lives in [`sample-report.json`](./sample-report.json) / [`sample-report.md`](./sample-report.md) (`npm run sample-report`).

```jsonc
{
  "schemaVersion": "1.0",
  "generator": { "name": "CareChaos", "appVersion": "0.1.0", "engineVersion": "1" },
  "experimentId": "exp_…",
  "runTimestamp": "ISO-8601",           // when the experiment was stored
  "runStatus": "completed | stopped",
  "verdict": "passed | failed | inconclusive",
  "scenario": { "id": "", "name": "", "hypothesis": "" | null },
  "seed": 42,
  "resilienceMode": "resilient | faulty",
  "configuration": { /* ExperimentConfig, including recorded interventions */ },
  "injectedFaults": [{ "type", "target", "startSec", "durationSec", "intensity", "delaySec", "source": "scenario | operator" }],
  "eventCounts": { "generated", "processed", "alertsExpected", "alertsDelivered", "duplicatesInjected", "duplicatesRejected", "duplicatesAccepted", "dropped", "deadLettered", "status_<final status>": n },
  "metrics": { /* see docs/metrics.md; ratios are {value, numerator, denominator, label, note?} */ },
  "assertions": [{ "id", "kind", "title", "status": "passed|failed|not_applicable", "expected", "actual", "eventIds": [] }],
  "recoveryTimeline": [{ "t", "kind", "service", "detail" }],
  "relevantEventIds": { "assertion:<id>": [], "failure_mode:<id>": [] },
  "failureModes": [{ "id", "title", "evidence", "eventIds" }],
  "recommendations": [{ "id", "title", "evidence", "action", "eventIds" }],
  "limitations": ["…"]
}
```

Stability: fields are only added in minor versions. Removing or changing the meaning of a field bumps `schemaVersion`. Because the configuration includes the seed and interventions, a report can be reproduced by re-running its `configuration`.
