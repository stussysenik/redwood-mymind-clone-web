"""Long-running enrichment worker — designed for Railway.

Runs the DSPy title + description pipeline against weak/long-titled cards on a
poll interval, routes decisions through the three-band gate, and records one
`EnrichmentBatchStats` row per batch for SQL-queryable history.

Zero in-memory state between batches: a crash mid-loop is fully recovered by
Railway's restart policy, and the polling loop resumes from the current
backlog state automatically.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

# Load .env early so env reads below pick up project-local values.
try:
    from dotenv import load_dotenv
    _root = Path(__file__).resolve().parents[2]
    load_dotenv(_root / ".env")
    load_dotenv(_root / ".env.local", override=True)
except ImportError:
    pass

from .gates import apply_gate, env_thresholds
from .lm import configure_lm
from .pipeline import DescriptionPipeline, TitlePipeline
from .supabase import (
    SupabaseError,
    fetch_weak_cards,
    finish_batch_stats,
    needs_description,
    needs_title,
    start_batch_stats,
    upsert_review_item,
    write_description,
    write_title,
)


BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "50"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "600"))
RETRY_BACKOFF = float(os.environ.get("WORKER_RETRY_BACKOFF_SECONDS", "2"))


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object.

    Railway captures stdout and line-based JSON keeps downstream log queries
    simple. Extra kwargs on a `logger.info(...)` call appear as top-level
    fields.
    """

    def format(self, record: logging.LogRecord) -> str:  # pragma: no cover
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
        }
        if hasattr(record, "extra_fields"):
            payload.update(record.extra_fields)  # type: ignore[attr-defined]
        return json.dumps(payload, default=str)


def _logger() -> logging.Logger:
    log = logging.getLogger("byoa.enrichment.worker")
    if log.handlers:
        return log
    log.setLevel(logging.INFO)
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    log.addHandler(h)
    log.propagate = False
    return log


log = _logger()


def _log(event: str, **fields: Any) -> None:
    """Emit a JSON log line with arbitrary structured fields."""
    rec = logging.LogRecord(
        name=log.name,
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg=event,
        args=None,
        exc_info=None,
    )
    rec.extra_fields = fields  # type: ignore[attr-defined]
    log.handle(rec)


def _is_transient(exc: BaseException) -> bool:
    from urllib.error import HTTPError

    if isinstance(exc, HTTPError):
        return exc.code in (408, 425, 429, 500, 502, 503, 504)
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    return False


def _retry_once(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        if not _is_transient(exc):
            raise
        time.sleep(RETRY_BACKOFF)
        return fn(*args, **kwargs)


def process_card(
    card: dict,
    title_pipeline: TitlePipeline,
    desc_pipeline: DescriptionPipeline,
    auto: float,
    review: float,
    stats: dict[str, int],
) -> None:
    card_id = card["id"]
    user_id = card["user_id"]

    if needs_title(card):
        try:
            result = _retry_once(title_pipeline, card)
        except Exception as e:
            stats["errors"] += 1
            _log(
                "title.error",
                card_id=card_id,
                kind="title",
                error=str(e),
            )
        else:
            _route("title", card, user_id, result, auto, review, stats)

    if needs_description(card):
        md = card.get("metadata") or {}
        existing = md.get("summary") if isinstance(md, dict) else None
        try:
            result = _retry_once(desc_pipeline, card, existing_description=existing)
        except Exception as e:
            stats["errors"] += 1
            _log(
                "description.error",
                card_id=card_id,
                kind="description",
                error=str(e),
            )
        else:
            _route("description", card, user_id, result, auto, review, stats)


def _route(
    kind: str,
    card: dict,
    user_id: str,
    result: dict,
    auto: float,
    review: float,
    stats: dict[str, int],
) -> None:
    proposed = result.get("title") if kind == "title" else result.get("description")
    if not proposed:
        stats["dropped"] += 1
        _log(
            f"{kind}.drop",
            card_id=card["id"],
            kind=kind,
            reason="empty-proposal",
        )
        return

    score = float(result.get("score", 0.0))
    band = apply_gate(score, auto=auto, review=review)
    current = (
        card.get("title")
        if kind == "title"
        else ((card.get("metadata") or {}).get("summary") if isinstance(card.get("metadata"), dict) else None)
    )
    word_count = len((proposed or "").split())

    _log(
        f"{kind}.decision",
        card_id=card["id"],
        kind=kind,
        proposed=proposed,
        word_count=word_count,
        score=score,
        gate_band=band,
    )

    if band == "apply":
        try:
            if kind == "title":
                write_title(card["id"], proposed, score)
            else:
                write_description(card["id"], proposed, score, card.get("metadata") or {})
            stats["auto_applied"] += 1
            _log(f"{kind}.apply", card_id=card["id"], kind=kind, score=score)
        except SupabaseError as e:
            stats["errors"] += 1
            _log(f"{kind}.write_error", card_id=card["id"], error=str(e))
    elif band == "review":
        try:
            upsert_review_item(
                card_id=card["id"],
                user_id=user_id,
                kind=kind,
                proposed_value=proposed,
                current_value=current,
                confidence=score,
                critique=result.get("critique", ""),
            )
            stats["queued_for_review"] += 1
            _log(f"{kind}.review", card_id=card["id"], kind=kind, score=score)
        except SupabaseError as e:
            stats["errors"] += 1
            _log(f"{kind}.queue_error", card_id=card["id"], error=str(e))
    else:
        stats["dropped"] += 1
        _log(f"{kind}.drop", card_id=card["id"], kind=kind, score=score)


def run_batch(
    title_pipeline: TitlePipeline,
    desc_pipeline: DescriptionPipeline,
) -> dict[str, int]:
    batch_id = str(uuid.uuid4())
    stats = {
        "cards_processed": 0,
        "auto_applied": 0,
        "queued_for_review": 0,
        "dropped": 0,
        "errors": 0,
    }
    auto, review = env_thresholds()

    try:
        cards = fetch_weak_cards(limit=BATCH_SIZE)
    except SupabaseError as e:
        _log("batch.fetch_error", error=str(e))
        return stats

    if not cards:
        _log("batch.empty", batch_id=batch_id)
        return stats

    try:
        start_batch_stats(batch_id)
    except SupabaseError as e:
        _log("batch.start_stats_error", error=str(e))

    _log("batch.start", batch_id=batch_id, batch_size=len(cards), auto=auto, review=review)

    for card in cards:
        stats["cards_processed"] += 1
        try:
            process_card(card, title_pipeline, desc_pipeline, auto, review, stats)
        except Exception as e:
            stats["errors"] += 1
            _log("card.error", card_id=card.get("id"), error=str(e))

    try:
        finish_batch_stats(batch_id, **stats)
    except SupabaseError as e:
        _log("batch.finish_stats_error", error=str(e))

    _log("batch.finish", batch_id=batch_id, **stats)
    return stats


def run_worker() -> None:
    label = configure_lm()
    _log(
        "worker.start",
        lm=label,
        batch_size=BATCH_SIZE,
        poll_interval_s=POLL_INTERVAL,
    )
    title_pipeline = TitlePipeline()
    desc_pipeline = DescriptionPipeline()

    while True:
        try:
            run_batch(title_pipeline, desc_pipeline)
        except KeyboardInterrupt:
            _log("worker.stop", reason="keyboard-interrupt")
            return
        except Exception as e:
            # Any exception at batch level is logged and the loop continues —
            # zero in-memory state means the next batch simply re-fetches.
            _log("worker.batch_error", error=str(e))
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run_worker()
