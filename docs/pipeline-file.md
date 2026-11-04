# Experiment file format

A JSON file describes one experiment, or a list of them. It is used by the [`carechaos` CLI](cli.md) and by **Import file / Download file** on the New experiment page. Unknown keys are rejected with a path, so typos do not silently do nothing.

```jsonc
{
  "name": "Alerts survive a delivery outage on my pipeline",
  "scenario": "alert-service-outage",      // optional: start from a built-in scenario (see `carechaos list`)
  "seed": 42,                              // everything below overrides the scenario / defaults
  "eventCount": 200,                       // readings to generate (1-2000)
  "intervalSec": 1,                        // seconds between readings
  "durationSec": 300,                      // observation window
  "mode": "resilient",                     // "resilient" | "faulty" (the CLI's --mode overrides this)
  "patientCount": 4,
  "staleThresholdSec": 10,
  "drainCapacityPerSec": 5,

  "pipeline": {                            // describe YOUR pipeline; omit anything to keep the default
    "capacities": { "processor": 15, "delivery": 6 },   // events/s per stage
    "queueCapacity": 500,                  // inbound queue limit per stage (default 1000)
    "retry": { "maxRetries": 8, "baseSec": 1, "capSec": 8 },
    "deadLetterRedrive": true,             // false = events are discarded after the last retry
    "recoveryWarmupSec": 2,
    "degradedQueueDepth": 25,
    "alertRules": { "heart_rate": { "op": ">", "threshold": 130 } }
  },

  "faults": [                              // up to 12; replaces the scenario's faults when present
    { "type": "outage", "target": "delivery", "startSec": 60, "durationSec": 60, "intensity": 1, "delaySec": 0 }
  ],

  "assertions": [                          // optional: replaces the default assertions
    { "kind": "no_work_during_outage", "title": "No alert is delivered while delivery is down" },
    { "kind": "recovery_time_max", "title": "Recovery within 90 s", "params": { "maxSec": 90 } }
  ]
}
```

A file may also be `{ "experiments": [ {...}, {...} ] }`.

## Stages

`device`, `ingestion`, `processor`, `rules`, `delivery`, `dashboard`. The profile tunes these six stages; it does not add or reorder them.

## Faults

| `type` | Uses | Notes |
|---|---|---|
| `latency` | `delaySec` | Adds delay to events entering `target` |
| `duplicate` | `intensity` 0-1 | Replays that fraction of events with the same ID |
| `packet_loss` | `intensity` 0-1 | Drops that fraction |
| `out_of_order` | `intensity`, `delaySec` (hold) | Holds events so newer ones overtake |
| `outage` | `durationSec` (`null` = until manual recovery) | Target unavailable |

The `device` stage supports `outage` only.

## Assertion kinds

`all_processed`, `all_alerts_delivered` (`min`), `no_unexpected_loss`, `accounted_for`, `healthy_throughout`, `p95_alert_latency_max` (`maxSec`), `service_unavailable_during_fault`, `no_work_during_outage`, `queue_visible_during_outage` (`min`), `processed_after_recovery`, `recovery_time_max` (`maxSec`), `queue_drains`, `peak_queue_at_least` (`min`), `duplicates_all_rejected`, `no_duplicate_alerts_delivered`, `latency_reflects_delay`, `stale_flagged_when_delayed`, `latency_recovers` (`maxSec`), `target_degraded_during_latency`, `loss_rate_within` (`tolerance`), `gaps_detected`, `no_stale_overwrite`, `reordering_observed`, `event_time_preserved`.

An assertion whose precondition is absent (for example an outage assertion on a run with no outage) is reported as not applicable and does not count for or against.
