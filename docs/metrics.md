# Metrics

All values come from `src/engine/metrics.ts` over a `SimulationResult`. Times are **virtual seconds**. Every ratio exposes numerator, denominator and label; a zero denominator gives `null` plus a note, never 0 % or 100 %.

| Metric | Definition |
|---|---|
| Delivery rate | unique expected alerts delivered ÷ alerts expected (readings breaching an illustrative rule) |
| Processing success rate | unique readings processed ÷ (readings generated − intentionally dropped by packet loss) |
| Duplicate rejection rate | duplicates rejected ÷ duplicates injected |
| Reading latency | event (generation) time → processed time, per unique reading |
| End-to-end alert latency | event (generation) time → delivered-to-dashboard time, per unique alert |
| Median / p95 | nearest-rank; p95 is withheld below 20 samples |
| Recovery time | restore (timer or manual) → backlog drained and service `healthy`; longest completed recovery reported, incomplete ones flagged |
| Data loss | readings not processed (and alerts not delivered) at the end of the window, classified by reason |
| Assertion pass rate | passed ÷ applicable (not-applicable assertions are excluded) |

## Loss classification

* **Intentional:** `packet_loss_injected`.
* **Unexpected:** `target_unavailable`, `queue_lost_on_crash`, `queue_overflow`, `retries_exhausted` (when never redriven).
* **Pending (not lost):** `in_flight_at_window_end`, `stopped_before_completion`.

Dropped events (`status = dropped`) and rejected duplicates (`rejected_duplicate`) are distinct and never summed.

No metric is a “clinical safety score”, and none should be read as one.
