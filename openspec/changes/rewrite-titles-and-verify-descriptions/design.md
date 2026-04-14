# Design: rewrite-titles-and-verify-descriptions

## D1 — Confidence gate

Three bands, monotonic, evaluated per proposal:

| Band | Range | Action |
|------|-------|--------|
| **apply** | `score ≥ AUTO_APPLY_THRESHOLD` (default 0.9) | Write proposed value to card, persist score |
| **review** | `REVIEW_THRESHOLD ≤ score < AUTO_APPLY_THRESHOLD` (default 0.6–0.9) | Insert `EnrichmentReviewItem`, do not touch card |
| **drop** | `score < REVIEW_THRESHOLD` (default 0.6) | Log for diagnostics, no action |

**Why three bands, not two.** The CoT critic on `meta/llama-3.1-8b-instruct` produces a fat middle: in a 20-card sample on 2026-04-14, 9/20 scores landed in `[0.4, 0.7]` with real signal in the critic reasoning. Auto-applying the middle damages quality; dropping it wastes useful work. The review surface captures the middle so a human can make fast yes/no calls without writing titles from scratch.

**Why env vars, not constants.** First-week empirical tuning will almost certainly shift both thresholds by ±0.05. Hard-coded constants would require a deploy per tuning attempt.

**Why 0.9 and not 0.95.** At `0.9`, the critic is emphatic ("This title effectively conveys..."). At `0.95+`, the critic is so rare that the auto-apply rate collapses to near-zero and we never make backlog progress. `0.9` is the Goldilocks anchor until we have real data.

## D2 — DSPy pipeline module layout

```
scripts/enrich/
├── __init__.py
├── signatures.py     # TitleSignature, TitleQualitySignature (CoT),
│                     # DescriptionSignature, DescriptionQualitySignature (CoT)
├── pipeline.py       # TitlePipeline, DescriptionPipeline (dspy.Module)
├── gates.py          # apply_gate(score, auto, review) -> 'apply'|'review'|'drop'
├── supabase.py       # fetch_weak_cards, write_title, write_description,
│                     # upsert_review_item, log_batch_stats
├── lm.py             # configure_lm() — NIM / local fallback
├── worker.py         # run_worker() — polling loop, retry, stats
└── cli.py            # main() — argparse wrapper shared with the worker
```

The existing `scripts/nim_titles.py` becomes a two-line shim so existing muscle memory keeps working:

```python
from scripts.enrich.cli import main
if __name__ == "__main__":
    main()
```

## D3 — Schema rationale

**New columns on `Card`:**
- `title_edited_at DateTime?` — tombstone. Non-null means the user (or an accepted edit from the review surface) owns this title; the pipeline must never overwrite it.
- `description_edited_at DateTime?` — mirror for `metadata.summary`.
- `title_confidence Float?` — the critic score that produced the current title. Lets us sort the DB by "least trustworthy first" without re-running the critic.
- `description_confidence Float?` — mirror for descriptions.

**New model `EnrichmentReviewItem`:**
- Append-only log of queued proposals. Resolution flips `resolvedAt`/`resolution` in place.
- Fields: `id`, `cardId` (FK), `kind: 'title' | 'description'`, `proposedValue`, `currentValue`, `confidence`, `critique`, `createdAt`, `resolvedAt`, `resolution: 'accept' | 'reject' | 'edit' | 'skip' | null`.
- Index: `@@index([userId, resolvedAt, createdAt])` via the card relation — lets the `/review` query paginate efficiently on the pending slice.
- Retention: resolved items pruned after 30 days by a cron cleanup (out of scope this change, but flagged).

**New model `EnrichmentBatchStats`:**
- One row per worker batch. Enables SQL queries like "how many cards improved this week" without scraping Railway logs.
- Fields: `batchId` (PK), `startedAt`, `finishedAt`, `cardsProcessed`, `autoApplied`, `queuedForReview`, `dropped`, `errors`.

**Why persist `currentValue` on the review item.** The user reviews a diff. If we only stored the proposed value and read `cards.title` live, a concurrent edit (e.g. user renames on another device) would silently change the "before" side of the diff between creation and review. Snapshotting `currentValue` at queue time makes the review surface deterministic.

## D4 — Review surface design

The review surface is the one place in BYOA where the user is asked to make a judgment call on AI output. The design quality target is **iA Writer**: editorial density, system fonts, one idea per screen, ruthless restraint.

### D4.1 — Information architecture

One page, one item at a time. No lists. No dashboards. No progress bars. A small top-right counter (`14 of 87`) is the only chrome.

### D4.2 — Layout

Mobile (one-thumb reach):
```
┌──────────────────────────────┐
│  14 of 87             skip ✕ │  48px top bar
├──────────────────────────────┤
│                              │
│  CURRENT TITLE               │
│  max: "someones the new      │
│  proud owner of a 42u        │
│  server rack :3 and yes…"    │
│                              │
│  PROPOSED                    │
│  ┌────────────────────────┐  │
│  │ Home Server Rack Haul  │  │  accent-tinted bg strip
│  └────────────────────────┘  │  (NOT left border)
│  why: title is 4 words and   │  critic reasoning
│       captures the specific  │  muted, italic
│       subject                │
│                              │
│  CURRENT DESCRIPTION         │
│  (muted block)               │
│                              │
│  PROPOSED DESCRIPTION        │
│  (accent-tinted block)       │
│                              │
├──────────────────────────────┤
│  reject    edit    accept    │  56px bottom bar, 44pt min target
└──────────────────────────────┘
```

Desktop: same content, centered in `max-width: 72ch`, keyboard-first. The bottom bar becomes an inline row; a persistent shortcut hint (`a accept · r reject · e edit · s skip · ? help`) sits below it in muted text.

### D4.3 — Typography (iA Writer as north star)

- **Font stack**: system UI, per `.impeccable.md`. No custom webfonts.
- **Labels** (`CURRENT TITLE`, `PROPOSED`): set in small caps via `font-variant-caps: all-small-caps` + `letter-spacing: 0.04em`. One size smaller than body.
- **Current value**: regular weight, 0.72 opacity, body color. Wraps freely.
- **Proposed value**: medium weight, full opacity, inside a rounded rectangle with a 4% accent-hue background. Padding `var(--space-md)` on x, `var(--space-sm)` on y. Never a left-border stripe — `.impeccable.md` absolute ban.
- **Critic reasoning**: 0.64 opacity, italic, one size smaller. Single paragraph, clipped at 3 lines with a fade-out.
- **Body line length**: capped at `72ch`. Line height `1.55` for normal, `1.6` on dark surfaces per `.impeccable.md` light-on-dark guidance.
- **No all-caps runs longer than a label.** Headings and prose use sentence case.

### D4.4 — Interaction state matrix (all enforced)

Every interactive surface — accept/reject/edit/skip buttons, the inline edit textarea, the shortcut help link, the count badge if clickable — implements the full matrix:

| State | Visual | Required by |
|-------|--------|-------------|
| `:hover` | 2% accent-hue background tint | Pointer users |
| `:focus` | suppressed via `:focus:not(:focus-visible)` | Prevents ugly focus ring on pointer clicks |
| `:focus-visible` | 2px outline in `--focus-ring`, offset 2px | Keyboard users, WCAG 2.4.7 |
| `:active` | 4% accent-hue tint + `transform: scale(0.98)` 80ms | Tactile feedback |
| `:focus-within` | Parent review card gains 1% accent tint | Composition cue when the edit field is focused |
| `:target` | `#keyboard-help:target { display: block }` for the help overlay | Progressive enhancement — help works with JS disabled |

These are **spec requirements**, not stylistic nice-to-haves. Tested explicitly in Playwright via `page.locator().hover()`, `page.keyboard.press('Tab')`, and URL hash navigation for `:target`. Storybook stories force each state via the pseudo addon so visual regressions are caught.

### D4.5 — Motion

- **Resolve animation**: the resolved card's wrapper transitions `grid-template-rows: 1fr → 0fr` over 180ms with `cubic-bezier(0.5, 1, 0.89, 1)` (ease-out-quart). The next card's wrapper fades in over 120ms with `opacity: 0 → 1`.
- **Edit toggle**: same grid-row technique to reveal the inline textarea.
- **Never** animate `height`, `padding`, or `margin` directly.
- `@media (prefers-reduced-motion: reduce)` sets all durations to `0ms` — the experience remains fully functional.

### D4.6 — Empty state

When the queue is empty: the diamond icon at 64px (the brand north star), a single line ("All caught up. **N** cards improved this week."), and a muted text link back to `/`. No illustrations, no celebration confetti, no "great job!" copy.

### D4.7 — Copy principles

- Labels are nouns, actions are verbs in base form: `accept`, `reject`, `edit`, `skip`.
- The critic reason is shown verbatim, prefixed with a lowercase `why:` in small caps.
- Error copy is factual, not apologetic: "Couldn't save. Check your connection and try again." — not "Oops!".

## D5 — Worker architecture

Single long-running Python process. Loop body:

```python
while True:
    batch = new_batch()
    cards = fetch_weak_cards(limit=BATCH_SIZE)
    if not cards:
        log_batch(batch, empty=True)
        sleep(POLL_INTERVAL)
        continue

    for card in cards:
        try:
            title_result = title_pipeline(card) if needs_title(card) else None
            desc_result = desc_pipeline(card) if needs_desc(card) else None
            route(card, title_result, desc_result, batch)
        except TransientError:
            retry_once_with_backoff()
        except Exception as e:
            log_error(card, e, batch)

    log_batch_stats(batch)
    sleep(POLL_INTERVAL)
```

**Zero in-memory state.** The worker holds nothing between batches — a crash mid-loop is fully recovered by Railway restart policy. The polling loop naturally resumes from the current backlog state.

**Concurrency**: one worker, strictly sequential per card. DSPy / NIM calls are cheap compared to the per-batch SQL, and sequential execution keeps logs readable. If throughput becomes a bottleneck, parallelism is added in a follow-up (scoped out of this change).

**Supabase writes** all flow through `supabase.py` which is the single source of truth for column names. The worker never touches Prisma — it speaks PostgREST.

## D6 — Failure modes

| Mode | Detection | Recovery |
|------|-----------|----------|
| Transient NIM 5xx / timeout | `httpx.HTTPStatusError` or `TimeoutError` in the DSPy call | Single retry with 2s backoff, then log `error` and continue |
| Permanent NIM auth error | 401/403 on startup | Worker logs, exits non-zero, Railway restarts with exponential backoff — operator sees the failure in logs |
| Card deleted mid-flight | PostgREST 404 on write | Log as `stale`, continue |
| Supabase outage | Repeated 5xx on fetch | Log per-attempt, sleep `POLL_INTERVAL`, keep retrying — no user-visible error |
| DSPy module crash | Python exception | Per-card try/except, other cards in the batch proceed |
| Worker crash | Railway health check | Restart policy brings it back, next batch picks up from current state |

## D7 — Open questions

1. **Community review mode.** "Human + community product" suggests non-owner review is eventually wanted. Out of scope here, but the `EnrichmentReviewItem` model is forward-compatible — ownership flows via the card FK, and a future role check can expand read access without schema changes.
2. **Threshold tuning.** Should `AUTO_APPLY_THRESHOLD` be per-space (user's personal space vs. community space), or global? Starting global; revisit after first week of data.
3. **Graceful degradation when NIM is down.** Current plan: worker logs and sleeps, review queue continues serving existing items. No user-visible error banner — per `.impeccable.md` principle "no error banners". Surfacing NIM downtime to the user at all is flagged as a future consideration.
4. **Embedding refresh on description rewrites.** When `metadata.summary` changes, downstream embeddings (used in the graph) are stale. Out of scope this change; flagged for a follow-up that hooks a regeneration trigger into the `EnrichmentBatchStats` watcher.
