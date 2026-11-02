# CareChaos report: Alert service outage

> Simulation only. All data is synthetic. This report does not establish clinical safety or regulatory compliance.

| Field | Value |
|---|---|
| Experiment ID | `exp_sample` |
| Run timestamp | 2026-01-01T00:00:00.000Z |
| App version | 0.1.0 (engine 1) |
| Scenario | Alert service outage (`alert-service-outage`) |
| Seed | 42 |
| Resilience mode | faulty |
| Run status | completed |
| Verdict | **failed** |

**Hypothesis:** If the alert service becomes unavailable, events remain queued and are processed after recovery, within the configured limits.

## Configuration

```json
{
  "name": "Alert service outage",
  "scenarioId": "alert-service-outage",
  "seed": 42,
  "eventCount": 200,
  "intervalSec": 1,
  "durationSec": 300,
  "mode": "faulty",
  "drainCapacityPerSec": 5,
  "patientCount": 4,
  "staleThresholdSec": 10
}
```

## Injected faults

- **outage** on `delivery` from 60s, duration 60, intensity 0.1, delay 0s (scenario)

## Event counts

| Count | Value |
|---|---|
| generated | 200 |
| processed | 200 |
| alertsExpected | 26 |
| alertsDelivered | 14 |
| duplicatesInjected | 0 |
| duplicatesRejected | 0 |
| duplicatesAccepted | 0 |
| dropped | 12 |
| deadLettered | 0 |
| status_processed | 174 |
| status_delivered | 14 |
| status_dropped | 12 |

## Metrics

| Metric | Value | Basis |
|---|---|---|
| Delivery rate | 53.8% (14/26) | expected alerts delivered ÷ alerts expected |
| Processing success rate | 100% (200/200) | unique readings processed ÷ readings generated minus intentionally dropped |
| Duplicate rejection rate | n/a (0/0) | duplicates rejected ÷ duplicates injected — No duplicates were injected. |
| Reading latency (median / p95, s) | 0s / 0s (n=200) | event (generation) time → processed time, per unique reading |
| Alert latency (median / p95, s) | 0s / n/a (n=14) | event (generation) time → delivered-to-dashboard time, per unique alert |
| Recovery time | 2s | virtual seconds from restore until backlog drained and service healthy |
| Peak queue depth | 1 (device) | queued + retry-held + dead-lettered events |
| Reading loss | 0 (intentional 0, unexpected 0, pending 0) | readings not processed by end of window |
| Assertion pass rate | 62.5% (5/8) | assertions passed ÷ applicable assertions |

## Assertions

- **PASSED** — The service is marked unavailable during the fault  
  expected: target service is marked unavailable when the outage starts  
  actual: delivery unavailable at 60s
- **PASSED** — No alert is reported as delivered while the service is unavailable  
  expected: no work attributed to the target service while it is unavailable (delivery)  
  actual: 0 events handled during the outage
- **FAILED** — Queued events are visible during the outage  
  expected: queued events visible for delivery (peak depth ≥ 1)  
  actual: peak depth 0 during the outage
- **FAILED** — Queued events are delivered after recovery  
  expected: all 12 alerts generated during the outage are delivered after recovery  
  actual: 0/12 completed  
  events: evt-00064, evt-00065, evt-00068, evt-00081, evt-00083, evt-00085, evt-00089, evt-00105
- **PASSED** — Recovery completes within 60s  
  expected: recovery completes within 60s of restoration  
  actual: 2s (restore → backlog drained)
- **PASSED** — Queues are fully drained by the end of the window  
  expected: all queues, retry holds and dead-letter queues empty at end of window  
  actual: 0 events still queued/held/dead-lettered
- **PASSED** — No event is silently lost: every reading is processed or has a recorded loss reason  
  expected: every generated reading is processed, or lost/pending with a recorded reason (processed + lost + pending = generated)  
  actual: 200 processed + 0 lost/pending = 200 of 200 generated; 0 without a reason
- **FAILED** — No readings or alerts are lost for reasons other than the injected fault  
  expected: 0 events lost for reasons other than injected packet loss  
  actual: 12 unexpected losses (target_unavailable: 12)  
  events: evt-00064, evt-00065, evt-00068, evt-00081, evt-00083, evt-00085, evt-00089, evt-00105

## Recovery timeline

- 60s — Outage fault: delivery unavailable for 60s.
- 60s — delivery: healthy → unavailable (outage fault active).
- 120s — outage fault on delivery ended.
- 120s — delivery restored (automatic); draining backlog at 5/s.
- 120s — delivery: unavailable → recovering (draining backlog after restore).
- 122s — delivery recovered: backlog drained and service healthy.
- 122s — delivery: recovering → healthy (recovery condition met (queue drained)).

## Detected failure modes

- **Events dropped while a downstream service was unavailable** — 12 events were dropped with reason target_unavailable because the sender had no retry or buffer.

## Recommendations

- **Buffer or retry instead of dropping** — Add a durable queue or bounded retry with backoff on the sender so a short outage does not become permanent data loss.  
  Evidence: 12 events were dropped with reason target_unavailable because the sender had no retry or buffer.

## Limitations

- All data is synthetic and fictional. Readings are not medical observations.
- Alert thresholds are illustrative demo values and are not medically validated.
- Results describe a simulated pipeline model, not any real product or company's infrastructure.
- A passing experiment does not establish clinical safety or regulatory compliance.
- Time is virtual; latencies are model outputs, not real-world performance measurements.
