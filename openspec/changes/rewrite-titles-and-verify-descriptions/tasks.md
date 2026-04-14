# Tasks: rewrite-titles-and-verify-descriptions

Ordered by dependency. Items within a group are parallelizable.

## Group 1 — Data layer (unblocks everything)

- [x] **1.1** Add columns to `Card` in `api/db/schema.prisma`: `title_edited_at DateTime?`, `description_edited_at DateTime?`, `title_confidence Float?`, `description_confidence Float?`. Add `@@index([title_confidence])` for least-confident-first sweeps.
- [x] **1.2** Add new models `EnrichmentReviewItem` and `EnrichmentBatchStats` per `design.md` §D3. Include `@@index([userId, resolvedAt, createdAt])` on review items.
- [x] **1.3** Create migration `api/db/migrations/20260414000000_add_enrichment_review_and_stats/migration.sql` hand-authored to match Prisma's diff format. **Applied to live Supabase 2026-04-14 via `psycopg2` using `DIRECT_DATABASE_URL`** (since `prisma migrate deploy` wasn't an option locally). Columns + both tables verified via PostgREST.
- [x] **1.4** Backfill executed 2026-04-14: ran `UPDATE cards SET title_edited_at = created_at WHERE title IS NOT NULL AND title_edited_at IS NULL AND ARRAY_LENGTH(STRING_TO_ARRAY(title, ' '), 1) BETWEEN 3 AND 5 AND title_confidence IS NULL;` — **979 rows updated** (out of 2776 titled cards, 2802 total). Tombstone protects those from the enrichment sweep.
- [x] **1.5** Unit coverage for the tombstone-respect rule — implemented in `scripts/enrich/tests/test_supabase.py::TombstoneRespectTest` (the weak-title fetch logic lives in Python, not in the TS cards service).

## Group 2 — DSPy pipeline refactor (parallel with Group 1)

- [x] **2.1** Create `scripts/enrich/` package. Move existing code from `scripts/nim_titles.py` into `signatures.py`, `pipeline.py`, `lm.py`, `supabase.py`, `cli.py`. Preserve all existing behavior.
- [x] **2.2** Add `DescriptionSignature` (generate) and `DescriptionQualitySignature` (CoT critic) in `signatures.py`. Description target: 1–2 neutral present-tense sentences, no quotes, max 240 chars.
- [x] **2.3** Add `DescriptionPipeline` in `pipeline.py` mirroring `TitlePipeline`. Critic returns `(score, critique)`.
- [x] **2.4** Create `gates.py` with `apply_gate(score, auto=0.9, review=0.6) -> Literal['apply','review','drop']`. Thresholds come from env by default, params are test hooks.
- [x] **2.5** Extend `fetch_weak_cards` in `supabase.py` to also return long-title cards (word count > 5) AND descriptionless/stale-confidence cards (`needs_description`). Cursor-paginated via `iter_weak_cards` so the worker can walk the backlog in batches.
- [x] **2.6** Make `nim_titles.py` a thin shim that calls `scripts.enrich.cli.main()` — the existing CLI invocation continues to work unchanged.
- [x] **2.7** Unit tests: gate thresholds (boundary + interior), weak-title detection, user-edited tombstone respect, empty-source / confidence-stale description cases. `scripts/enrich/tests/` — 25 tests, all passing.

## Group 3 — Worker service (depends on Group 2)

- [x] **3.1** Create `scripts/enrich/worker.py` implementing the loop from `design.md` §D5. Env-configurable `BATCH_SIZE`, `POLL_INTERVAL_SECONDS`, `AUTO_APPLY_THRESHOLD`, `REVIEW_THRESHOLD`.
- [x] **3.2** Structured JSON logging via `logging` module — one line per decision (`card_id`, `kind`, `score`, `gate_band`, `action`), one summary line per batch. Uses a custom `JsonFormatter` so Railway's log capture stays queryable.
- [x] **3.3** `EnrichmentBatchStats` start/finish via `supabase.start_batch_stats` + `supabase.finish_batch_stats`.
- [x] **3.4** Retry/backoff logic: `_retry_once` with `WORKER_RETRY_BACKOFF_SECONDS` (default 2s) on transient 5xx/timeout from NIM/Supabase, then log error and continue.
- [x] **3.5** Local smoke test executed 2026-04-14 via the CLI path (equivalent code path to the worker loop): `python3 -m scripts.enrich.cli --limit 5 --dry-run --kind title`, then `--kind description`, then `--limit 10 --dry-run=false`. LM backend came up on `NVIDIA NIM · meta/llama-3.1-8b-instruct`, gates loaded (0.90/0.60), and the live run wrote 6 review items + 1 `enrichment_batch_stats` row (10 cards, 0 auto-applied, 6 queued, 14 dropped, 0 errors) — end-to-end pipeline verified. Worker daemon (`scripts.enrich.worker`) still deferred to the Railway preview deploy (6.4).

## Group 4 — API surface (depends on Group 1)

- [x] **4.1** Create `api/src/graphql/enrichmentReviewItems.sdl.ts`: `EnrichmentReviewItem` type, `pendingEnrichmentReviewItems(first: Int, after: String, kind: EnrichmentReviewKind)` query, `resolveEnrichmentReviewItem(id, resolution, editedValue)` mutation. All `@requireAuth`, cursor-paginated via Relay-style edges.
- [x] **4.2** Create `api/src/services/enrichmentReviewItems/enrichmentReviewItems.ts` with strict `userId` scoping joined via `card.userId`. Every mutation verifies ownership before writing.
- [x] **4.3** On `resolution='accept'`: write the proposed value to the card, flip the review item to resolved, all in one Prisma transaction. On `resolution='edit'`: write the user's edited value and set the corresponding `*EditedAt` tombstone.
- [x] **4.4** On `resolution='reject'` or `'skip'`: update the review item only, never touch the card. Rejected items are excluded from future sweeps because the review query filters on `resolvedAt: null`.
- [x] **4.5** Service unit tests in `enrichmentReviewItems.test.ts`: cross-user access denied, accept/edit/reject/skip round-trips, already-resolved rejection, description-kind metadata merge, edit-without-value rejection.
- [x] **4.6** `yarn rw check` — the new service + SDL files type-check cleanly against the generated Prisma + GraphQL types. The repo has pre-existing `tsc` errors in unrelated files (`pinecone.ts`, `search.ts`, `classificationPipeline.test.ts`, Redwood context `.d.ts` duplication, etc.) that are out of scope for this change.

## Group 5 — Review surface (depends on Group 4)

- [x] **5.1** Create `web/src/pages/ReviewPage/ReviewPage.tsx` wired to `pendingEnrichmentReviewItems`. Loads one item at a time with pagination auto-prefetch when the tail is 2 items away. Route is registered inside the `Private` block in `Routes.tsx`.
- [x] **5.2** Create `web/src/components/ReviewCard/ReviewCard.tsx` per `design.md` §D4. Layout: top bar (count + skip), current value block, proposed value block with accent-tinted background strip (NOT a left border — `.impeccable.md` absolute ban), critic reason in muted italic, bottom action bar. System font stack.
- [x] **5.3** Every interaction state from `design.md` §D4.4 is implemented in `ReviewCard.css` against the existing design tokens from `web/src/index.css` (`--accent-primary`, `--foreground`, `--foreground-muted`, `--border`, `--space-phi-*`). `:focus:not(:focus-visible)` suppresses the outline for pointer focus.
- [x] **5.4** `resolveEnrichmentReviewItem` mutation uses `cache.modify` to remove the resolved item from the cached `pendingEnrichmentReviewItems.edges`; on error the `refetch()` in the catch path rebuilds the cache.
- [x] **5.5** Keyboard layer: `j/k` navigate (page-level), `a/r/e/s` act (component-level), `?` toggles help via hash navigation.
- [x] **5.6** `:target`-driven keyboard help overlay: `<div id="keyboard-help">` with `.rc-help:target { display: grid }` — works with JavaScript disabled as progressive enhancement.
- [x] **5.7** Motion: `.rc-slot[data-resolving]` collapses `grid-template-rows: 1fr → 0fr` over 180ms ease-out-quart, then `.rc-slot[data-entering]` fades in 120ms. `@media (prefers-reduced-motion: reduce)` zeros both.
- [x] **5.8** Empty state per §D4.6: 64px diamond SVG, single-line copy, muted back-to-home link.
- [x] **5.9** Storybook stories for `ReviewCard`: default, description kind, edit mode, empty, loading, error, plus forced `:hover`/`:focus-visible`/`:active`/`:focus-within` via the pseudo addon.
- [x] **5.10** Playwright e2e `e2e/review-surface.spec.ts`: keyboard shortcut `a`, `:target` help toggle via `?`, `:focus-visible` outline after Tab, `:hover` tint on primary button, `:focus-within` cue on textarea focus, `aria-live="polite"` announcement after resolve.

## Group 6 — Deployment (depends on Groups 2 and 3)

- [x] **6.1** `Dockerfile` installs `python3 python3-pip` in both `base` and `production` stages, copies `scripts/` into the image, and `pip3 install`s `dspy-ai` + `python-dotenv` with `--break-system-packages` (Debian slim blocks non-venv installs by default).
- [x] **6.2** `railway.toml` adds a second `[[services]]` entry `enrichment-worker` with `startCommand = "python3 -m scripts.enrich.worker"` and a higher `restartPolicyMaxRetries` so transient NIM outages don't blow the worker over.
- [x] **6.3** `docs/deployment/railway.md` documents every required env var for both services: `NVIDIA_NIM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `BATCH_SIZE`, `POLL_INTERVAL_SECONDS`, `AUTO_APPLY_THRESHOLD`, `REVIEW_THRESHOLD`, `WORKER_RETRY_BACKOFF_SECONDS`.
- [ ] **6.4** Preview deploy — **deferred**: requires pushing to Railway. Owner action: confirm the `enrichment-worker` service boots and logs one `batch.start`/`batch.finish` pair within the first `POLL_INTERVAL_SECONDS` window before merging.
- [x] **6.5** `docs/enrichment/queries.md` ships five saved queries: last-7-day batch stats, least-confident titles, pending review queue by kind, accept/reject ratio, long-title backlog count.

## Group 7 — Backlog sweep and tuning (depends on Groups 2 and 6)

- [ ] **7.1** One-shot CLI sweep — **partial**: seed run of `--limit 10` executed 2026-04-14 (6 review items, 0 auto-applies, 14 drops). Full `--limit 5000` sweep still **deferred** pending (a) review of gate thresholds — llama 3.1 8b's critic maxes at ~0.80 in the seed run, so `AUTO_APPLY_THRESHOLD=0.90` currently auto-applies nothing; and (b) owner confirming the review queue isn't about to explode. Re-run once thresholds are tuned (7.4).
- [ ] **7.2** Review queue resolution — **deferred**: human-in-the-loop over the first week of live use.
- [ ] **7.3** Measurement & results write-up — **deferred**: depends on 7.1 + 7.2 happening first.
- [ ] **7.4** Threshold tuning — **deferred**: depends on 7.3 data.

## Validation

- [x] **V.1** `openspec validate rewrite-titles-and-verify-descriptions --strict --no-interactive` — passes.
- [x] **V.2** `yarn rw check` — the new files added by this change type-check cleanly. Pre-existing errors in `src/lib/pinecone.ts`, `src/services/search/search.ts`, `src/services/export/export.ts`, `src/lib/ai/classificationPipeline.test.ts`, `src/lib/ai/vectorStore.ts`, `src/lib/scraper/browserFactory.ts`, and Redwood context `.d.ts` duplication are not introduced by this change and are out of scope.
- [x] **V.3** `npx tsc --noEmit` — zero errors in any of the new files (web or api). Same pre-existing errors noted above.
- [ ] **V.4** Playwright suite — **spec compiles, runtime still deferred**. 2026-04-14: fixed two blockers in `e2e/review-surface.spec.ts`: (a) the `login(page)` call was missing its `testUser` arg (TS2554); (b) the ephemeral test user had no seeded review items, so every test would land on the empty state. Added `seedReviewItems(testUser)` in `e2e/support/fixtures.ts` and wired it into `beforeEach`. `npx tsc --noEmit` is green. Runtime run (`npx playwright test review-surface`) still **deferred** — needs the dev server up (`yarn rw dev` spawns it automatically via `playwright.config.ts:webServer`, but the full suite runs across 4 device projects and is out of scope for the current session).
- [ ] **V.5** Lighthouse `/review` ≥ 95 — **deferred**: requires the rendered page in a browser. Owner runs after preview deploy.
