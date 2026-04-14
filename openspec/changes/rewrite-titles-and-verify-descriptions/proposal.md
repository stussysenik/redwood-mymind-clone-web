## Why

The card corpus has a quality problem the current enrichment pipeline cannot solve on its own.

**Title pathology** (300-card sample, 2026-04-14):
- Median title length: **11 words** against a target of 3–5.
- **82% of non-null titles are >5 words**; **55% are >10 words**.
- The longest examples are raw social post captions copied verbatim (e.g. `max: "someones the new proud owner of a 42u server rack :3 and yes we dont have a car so we brought it h..."` — 24 words).

**Description pathology**:
- `cards.content` holds the raw scrape, often identical to the verbose title.
- `cards.metadata.summary` is the AI-generated description but is never re-verified after initial enrichment. Stale, off-topic, or parroted summaries persist silently.
- No confidence signal exists on existing descriptions, so we cannot sort the backlog by "least trustworthy first".

**Why automation alone is not enough.** BYOA is a human + community product. Blanket rewrites risk destroying titles the user has already edited; a low-threshold policy (`score ≥ 0.6`) would put mediocre output on the user's most-cared-about cards. We need a **three-band confidence gate**: auto-apply at `≥ 0.9`, route `0.6–0.9` to a human review surface, drop `< 0.6`.

The existing `scripts/nim_titles.py` already proves DSPy + NVIDIA NIM works for generation + scoring (7/7 validated writes on 2026-04-14). What is missing: (1) broader coverage of the long-title backlog, (2) description quality auditing, (3) a review surface for borderline cases, and (4) a deployed worker so the pipeline runs continuously instead of being a one-off CLI run.

## What Changes

### Modified — `source-title-preservation`

- Weak-title detection extends beyond null/`Untitled*` to include any title whose word count exceeds five (the 82%).
- A three-band confidence gate governs every write: **auto-apply `≥ 0.9`**, **human review `0.6–0.9`**, **drop `< 0.6`**.
- User-edited titles are never touched, tracked via a new `title_edited_at` tombstone column.
- Pipeline diagnostics now persist word count, critic score, critic reasoning, and gate band for every decision, and confidence is written to `cards.title_confidence` on auto-apply.

### New — `source-description-verification`

- DSPy `DescriptionSignature` generates a neutral 1–2 sentence description from URL + content.
- DSPy `DescriptionQualitySignature` (chain-of-thought critic) scores existing `metadata.summary` on specificity and source fidelity.
- Same three-band gate governs writes.
- `description_edited_at` tombstone protects user-authored summaries.
- Empty-source cards are explicitly skipped — no hallucination fallback.

### New — `enrichment-review-surface`

- A `/review` Redwood page that renders cards in the `0.6–0.9` band one at a time with a diff-style before/after of the proposed title and description.
- One-thumb mobile-first actions: **accept / reject / edit / skip**. Full keyboard parity on desktop (`j/k` navigate, `a` accept, `r` reject, `e` edit, `s` skip, `?` toggle help).
- Every interactive surface implements the full CSS interaction state matrix: `:hover`, `:focus-visible`, `:active`, `:focus-within`, `:target`. Enforced by Playwright assertions, not a stylistic afterthought.
- Design language follows `.impeccable.md`: crystalline, deliberate, connective. iA Writer is the typographic north star — system font stack, editorial density, zero decorative chrome. No side-stripe borders, no gradient text, no glass cards.
- WCAG 2.1 AA. Resolutions announced via `aria-live="polite"`. Motion uses grid-row collapse (never height), honors `prefers-reduced-motion`.

### New — `enrichment-worker-deployment`

- `scripts/enrich/worker.py` — a long-running worker that polls Supabase for weak/long-titled cards in batches, runs the DSPy pipeline, and routes decisions through the confidence gate.
- Deployed as a second Railway service via `railway.toml`, reusing the existing Dockerfile with a different entrypoint.
- Env: `NVIDIA_NIM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BATCH_SIZE=50`, `POLL_INTERVAL_SECONDS=600`, `AUTO_APPLY_THRESHOLD=0.9`, `REVIEW_THRESHOLD=0.6`.
- Observability: structured JSON logs to stdout (Railway captures) plus an `EnrichmentBatchStats` row per batch for SQL-queryable history.
- Restart-safe: zero in-memory state, Railway restart policy recovers from crashes automatically.

## Impact

- **Schema** (`api/db/schema.prisma`)
  - `Card`: adds `title_edited_at DateTime?`, `description_edited_at DateTime?`, `title_confidence Float?`, `description_confidence Float?`. Index `@@index([title_confidence])` for least-confident-first sweeps.
  - New `EnrichmentReviewItem` model: `{ id, cardId, kind, proposedValue, currentValue, confidence, critique, createdAt, resolvedAt, resolution }`.
  - New `EnrichmentBatchStats` model: `{ batchId, startedAt, finishedAt, cardsProcessed, autoApplied, queuedForReview, dropped, errors }`.
  - One migration: `add_enrichment_review_and_stats`.
- **API** (`api/src/graphql/enrichmentReviewItem.sdl.ts`, `services/enrichmentReviewItems/`)
  - Cursor-paginated `pendingEnrichmentReviewItems(first, after, kind)` query.
  - `resolveEnrichmentReviewItem(id, resolution, editedValue?)` mutation, `@requireAuth` with strict `userId` scoping.
- **Web** (`web/src/pages/ReviewPage/`, new `ReviewCard/`)
  - ~400 LOC for the review surface and a shared keyboard shortcut layer.
  - Storybook stories for every interaction state plus empty/loading/error.
  - Playwright e2e covering keyboard, hover, focus-visible, and `:target` states.
- **Scripts** (`scripts/enrich/`)
  - `nim_titles.py` becomes a shim importing from `scripts/enrich/cli.py`; existing CLI invocation continues to work.
  - New modules: `signatures.py`, `pipeline.py`, `gates.py`, `supabase.py`, `lm.py`, `worker.py`, `cli.py`.
- **Deployment** (`railway.toml`, `Dockerfile`)
  - Second service entry. Same container image, different start command.
- **Cost** (NVIDIA NIM free tier)
  - Full backlog sweep ≈ 4,100 cards × 2 calls × ~200 tokens — comfortably within free tier.
  - Steady-state ≈ 50 new cards/day × 2 calls — negligible.
- **No breaking changes.** Existing users see no UI difference until they visit `/review`; the CLI workflow is preserved.

## Out of Scope

- Automatic tag rewrites. The tag auditor stays CLI-only this change.
- Bulk undo of past title rewrites. Manual edit flips `title_edited_at` and future runs respect it; there is no mass-revert button.
- RLHF loops on review decisions. Decisions are recorded for later analysis but do not automatically retrain prompts in this change.
- Community review of other users' cards. Forward-compatible schema; no UI this change.
- Full i18n. All visible strings flow through a messages object (ready), but only English ships this change.
- Automatic cluster/embedding regeneration triggered by description rewrites. Flagged for a follow-up.
