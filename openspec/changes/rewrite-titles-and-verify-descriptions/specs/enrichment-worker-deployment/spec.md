## Capability: enrichment-worker-deployment

The DSPy enrichment pipeline runs continuously as a distinct Railway service alongside the existing web/api services, polling Supabase in batches, routing decisions through the three-band gate, and emitting structured observability stats per batch.

## ADDED Requirements

### Requirement: The enrichment pipeline runs as a long-lived Railway service

A worker process SHALL be deployed as a second Railway service using the same container image as the web/api services but with a distinct start command, polling Supabase for weak/long-titled and weak/stale-description cards on a configurable interval.

#### Scenario: Worker boots and processes a first batch

Given the worker service starts on Railway with valid environment,
When the process begins its polling loop,
Then it MUST read `NVIDIA_NIM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BATCH_SIZE`, `POLL_INTERVAL_SECONDS`, `AUTO_APPLY_THRESHOLD`, and `REVIEW_THRESHOLD` from the environment,
And fetch up to `BATCH_SIZE` cards matching the weak-card query,
And process each card through the pipeline and gate,
And sleep for `POLL_INTERVAL_SECONDS` before the next batch.

#### Scenario: Empty batch triggers a quiet sleep

Given a batch fetch returns zero cards,
When the worker loop continues,
Then the worker MUST sleep for `POLL_INTERVAL_SECONDS` without error or cost,
And MUST emit a single log line recording the empty batch.

#### Scenario: Second service shares the Dockerfile

Given `railway.toml` declares two services,
When Railway builds the project,
Then both services MUST use the same container image,
And the worker service MUST override only the start command to `python3 -m scripts.enrich.worker`.

### Requirement: Transient errors are retried once with backoff

The worker SHALL tolerate transient NIM failures by retrying individual per-card calls once with a short delay before logging an error and continuing.

#### Scenario: NIM 5xx retries and succeeds

Given the NIM API returns a 5xx status on the first DSPy call for a card,
When the worker detects the failure,
Then it MUST wait 2 seconds and retry the call exactly once,
And if the retry succeeds, the decision MUST proceed normally through the gate.

#### Scenario: NIM retry fails and the worker continues

Given both the initial call and the retry fail,
When the worker detects the second failure,
Then it MUST log the card as `error` with the exception type,
And MUST continue processing the next card in the batch.

#### Scenario: Supabase outage is tolerated without alert fatigue

Given Supabase returns repeated 5xx on fetch,
When the worker cannot fetch cards,
Then it MUST log the failure once per attempt at WARN level,
And MUST sleep `POLL_INTERVAL_SECONDS` before retrying,
And MUST NOT exit the process or escalate past WARN.

### Requirement: Worker crashes are recovered automatically

The worker process SHALL hold zero persistent in-memory state between batches so that Railway's restart policy produces a correct recovery with no manual intervention.

#### Scenario: Crash during a batch restarts cleanly

Given the worker process exits with a non-zero status mid-batch,
When Railway's restart policy fires,
Then the new process MUST start from the same polling loop entry point,
And the next fetch MUST pick up the current backlog state from Supabase,
And no partial-batch duplicates MUST result (the polling query is idempotent with respect to completed writes).

### Requirement: Every batch emits observability stats

The worker SHALL persist structured stats per batch so operators can answer "how many cards did we fix today" via SQL without scraping logs.

#### Scenario: Completed batch writes an EnrichmentBatchStats row

Given a batch finishes processing (success, partial failure, or empty),
When the loop wraps up,
Then the worker MUST insert a row into `EnrichmentBatchStats` with `batchId`, `startedAt`, `finishedAt`, `cardsProcessed`, `autoApplied`, `queuedForReview`, `dropped`, and `errors`,
And emit a single structured JSON log line summarizing the batch to stdout.

#### Scenario: Stats are queryable for the last 7 days

Given an operator wants to know the enrichment throughput,
When they run the saved SQL query `docs/enrichment/queries.md` against the `EnrichmentBatchStats` table,
Then the query MUST return one row per batch for the last 7 days, with totals by `autoApplied`, `queuedForReview`, `dropped`, and `errors`.
