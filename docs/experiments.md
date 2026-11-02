# Experiments and faults

## Fault types

| Fault | Target semantics | Parameters |
|---|---|---|
| Latency | Adds delay to every event entering the target; target shows *degraded* | `delaySec` (presets 5, 15, 60) |
| Duplicate delivery | Replays a fraction of events with the same event ID, 1 s later | `intensity` |
| Service outage | Target unavailable; manual or automatic recovery | `durationSec` or `null` (until recovered) |
| Packet loss | Drops a fraction of events entering the target | `intensity` (5/10/25 %) |
| Out-of-order | Holds a fraction of events so newer ones overtake | `intensity`, `delaySec` (hold) |
| Recovery backlog | Outage + low `drainCapacityPerSec` | scenario “Recovery backlog” |

The Device Simulator supports outages only.

## Outage and recovery semantics

* **Resilient:** a sender that cannot reach an unavailable service holds the event and retries with exponential backoff (max 8 attempts, ≈47 s). Exhausted events go to a dead-letter queue and are **redriven when the service is restored**. Queue depth = inbound queue + retry holds + dead-letter entries.
* **Faulty:** events sent to an unavailable service are dropped (`target_unavailable`) and the in-memory queue is lost at the moment of the crash (`queue_lost_on_crash`).
* **Recovery** begins when the service is restored (timer or manual). It is complete only when the 2 s warm-up has passed **and** queue, retry holds and dead-letter queue for that service are empty. While draining, the service runs at `drainCapacityPerSec`.

## Scenarios

| ID | Fault | Resilient passes? | Faulty fails |
|---|---|---|---|
| healthy-baseline | none | yes | – |
| delayed-readings | +15 s on processor | yes | stale-data flagging |
| duplicate-events | 30 % duplicates at ingestion | yes | duplicates rejected; no duplicate alerts |
| alert-service-outage | delivery down 60 s | yes | queue visibility, post-recovery delivery, unexpected loss |
| packet-loss | 10 % loss at ingestion | yes | gap detection |
| recovery-backlog | processor down 60 s @ 2 evt/s, drain 3/s | yes | backlog, post-recovery processing, unexpected loss |
| out-of-order | 25 % held 8 s | yes | no stale overwrite |

These expectations are enforced by `tests/integration.test.ts`.

## Creating an experiment

1. **New experiment** → pick a preset → adjust seed, volume, interval, window, resilience mode, and the fault.
2. Validation explains impossible combinations (e.g. generation time longer than the window, outage ending after the window).
3. Run it live, then open results, compare with the healthy baseline and the other mode, inspect supporting events, and export JSON/Markdown.

Live controls: pause, resume, stop, reset, replay, skip to end, manual recovery of unavailable services, and live fault injection (recorded as interventions so replay is exact).
