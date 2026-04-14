# Enrichment SQL — saved queries

Quick SQL queries for inspecting the enrichment pipeline's live behavior.
Run these in the Supabase SQL editor.

## Last 7 days of batch stats

```sql
SELECT
  batch_id,
  started_at,
  finished_at,
  cards_processed,
  auto_applied,
  queued_for_review,
  dropped,
  errors,
  (finished_at - started_at) AS duration
FROM enrichment_batch_stats
WHERE started_at >= NOW() - INTERVAL '7 days'
ORDER BY started_at DESC;
```

## Least-confident titles (sweep target)

```sql
SELECT id, title, title_confidence, created_at
FROM cards
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND title_edited_at IS NULL
  AND title_confidence IS NOT NULL
ORDER BY title_confidence ASC
LIMIT 50;
```

## Pending review queue size by kind

```sql
SELECT kind, COUNT(*) AS pending
FROM enrichment_review_items
WHERE resolved_at IS NULL
GROUP BY kind;
```

## Accept/reject ratio

```sql
SELECT
  resolution,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM enrichment_review_items
WHERE resolved_at IS NOT NULL
GROUP BY resolution
ORDER BY n DESC;
```

## Long-title backlog (word count > 5)

```sql
SELECT COUNT(*) AS long_titled
FROM cards
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND title_edited_at IS NULL
  AND title IS NOT NULL
  AND ARRAY_LENGTH(STRING_TO_ARRAY(title, ' '), 1) > 5;
```
