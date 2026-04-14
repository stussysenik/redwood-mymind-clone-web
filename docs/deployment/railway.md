# Railway Deployment

BYOA runs as two services in the same Railway project, both built from the
root `Dockerfile`. The web service serves the Redwood app via
`docker-entrypoint.sh`; the enrichment worker runs the long-running Python
loop defined in `scripts/enrich/worker.py`.

## Services

| Service | Start command | Purpose |
|---|---|---|
| `byoa-web` (default) | `/app/docker-entrypoint.sh` | Redwood API + SSR web |
| `enrichment-worker` | `python3 -m scripts.enrich.worker` | DSPy title/description critic loop |

See `railway.toml` for the service wiring.

## Required environment variables

Both services share a single Railway project so most vars can be set at
project scope. Worker-only vars live under the `enrichment-worker` service.

### Web service

| Var | Description |
|---|---|
| `DATABASE_URL` | Supabase Postgres (pooled) |
| `DIRECT_DATABASE_URL` | Supabase Postgres (direct, for Prisma migrate) |
| `REDWOOD_ENV_SUPABASE_URL` | Public Supabase URL (client-visible) |
| `REDWOOD_ENV_SUPABASE_ANON_KEY` | Public Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key |
| `SESSION_SECRET` | Redwood cookie session secret |

### Enrichment worker

| Var | Default | Description |
|---|---|---|
| `NVIDIA_NIM_API_KEY` | — | NVIDIA NIM API key (required) |
| `SUPABASE_URL` | — | Supabase base URL (PostgREST target) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service-role key for writes |
| `BATCH_SIZE` | `50` | Cards per poll iteration |
| `POLL_INTERVAL_SECONDS` | `600` | Sleep between batches |
| `AUTO_APPLY_THRESHOLD` | `0.9` | Score at/above which the pipeline writes directly |
| `REVIEW_THRESHOLD` | `0.6` | Score at/above which proposals queue for `/review` |
| `WORKER_RETRY_BACKOFF_SECONDS` | `2` | Transient-error backoff before retry |

## Deploy

1. `git push` to main.
2. Railway builds the image once and deploys both services from it.
3. Confirm the web service responds at its assigned domain.
4. Confirm the worker logs one `batch.start` + `batch.finish` JSON line within
   the first `POLL_INTERVAL_SECONDS` window — see `docs/enrichment/queries.md`
   for the SQL-side sanity check.

## Rollback

Railway retains image history per service; use `Deployments → Redeploy` on
the previous green build. The worker is idempotent and restart-safe — no
cleanup needed.
