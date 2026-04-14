"""Supabase (PostgREST) helpers for the enrichment pipeline.

Single source of truth for column names. The worker and the CLI both speak
through this module rather than touching PostgREST URLs directly.
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Iterable


SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("REDWOOD_ENV_SUPABASE_URL")
    or ""
).rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_KEY")
    or ""
)

WEAK_TITLE_LITERALS = {
    "untitled", "untitled note", "link", "saved link", "saved item",
    "website", "instagram post", "twitter post", "x post",
}


class SupabaseError(RuntimeError):
    """Raised for non-retryable PostgREST errors."""


def is_weak_title(title: str | None) -> bool:
    """Return True if the title is a known placeholder, bare URL, too short,
    or exceeds five words (the new long-title pathology)."""
    if not title or not title.strip():
        return True
    t = title.strip()
    lowered = t.lower()
    if lowered in WEAK_TITLE_LITERALS or lowered.startswith("untitled"):
        return True
    if re.match(r"^https?://", lowered):
        return True
    if len(lowered) < 5:
        return True
    if len(t.split()) > 5:
        return True
    return False


def _headers(prefer: str = "") -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SupabaseError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
        )
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _qs(params: dict[str, Any]) -> str:
    return "&".join(
        f"{k}={urllib.parse.quote(str(v), safe=',*.=()')}" for k, v in params.items()
    )


def supabase_get(path: str, params: dict[str, Any] | None = None) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url = f"{url}?{_qs(params)}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SupabaseError(
            f"GET {path} failed: HTTP {e.code}: {e.read().decode()[:200]}"
        ) from e


def supabase_patch(path: str, params: dict[str, Any], payload: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/{path}?{_qs(params)}"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="PATCH",
        headers=_headers(prefer="return=minimal"),
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        raise SupabaseError(
            f"PATCH {path} failed: HTTP {e.code}: {e.read().decode()[:200]}"
        ) from e


def supabase_post(path: str, payload: dict | list[dict]) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers=_headers(prefer="return=representation"),
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SupabaseError(
            f"POST {path} failed: HTTP {e.code}: {e.read().decode()[:200]}"
        ) from e


# ── Card selection ───────────────────────────────────────────────────────────


def fetch_weak_cards(limit: int, before_created_at: str | None = None) -> list[dict]:
    """Return cards with weak or long titles OR stale descriptions.

    User-edited titles (title_edited_at IS NOT NULL) are excluded server-side
    so the pipeline never wastes a call on a protected card. The long-title
    dimension is post-filtered in `is_weak_title` because PostgREST cannot
    count words in a filter expression.

    `before_created_at` supports cursor-style pagination through the backlog;
    pass the `created_at` of the last card returned by the previous batch.
    """
    title_or = "or=(title.is.null,title.ilike.untitled*,title.ilike.link,title.ilike.saved*)"
    params: dict[str, Any] = {
        "select": "id,user_id,type,title,content,url,tags,metadata,title_edited_at,description_edited_at,title_confidence,description_confidence,created_at",
        "deleted_at": "is.null",
        "archived_at": "is.null",
        "title_edited_at": "is.null",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if before_created_at:
        params["created_at"] = f"lt.{before_created_at}"

    qs = f"{title_or}&{_qs(params)}"
    rows = supabase_get(f"cards?{qs}")
    weak: list[dict] = [r for r in rows if is_weak_title(r.get("title"))]

    # Also fetch long-title cards whose title doesn't match the placeholder OR.
    # Long-title detection is cheaper to do over a fresh window than combining
    # into one query.
    long_params: dict[str, Any] = {
        "select": "id,user_id,type,title,content,url,tags,metadata,title_edited_at,description_edited_at,title_confidence,description_confidence,created_at",
        "deleted_at": "is.null",
        "archived_at": "is.null",
        "title_edited_at": "is.null",
        "title": "not.is.null",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if before_created_at:
        long_params["created_at"] = f"lt.{before_created_at}"

    long_rows = supabase_get(f"cards?{_qs(long_params)}")
    seen_ids = {r["id"] for r in weak}
    for r in long_rows:
        if r["id"] in seen_ids:
            continue
        if is_weak_title(r.get("title")):
            weak.append(r)
    return weak[:limit]


def needs_title(card: dict) -> bool:
    if card.get("title_edited_at"):
        return False
    return is_weak_title(card.get("title"))


def needs_description(card: dict) -> bool:
    if card.get("description_edited_at"):
        return False
    md = card.get("metadata") or {}
    summary = (md.get("summary") or "").strip() if isinstance(md, dict) else ""
    # Missing summary → needs one. Has summary but no confidence → needs re-score.
    if not summary:
        return True
    if card.get("description_confidence") is None:
        return True
    return False


# ── Writes ───────────────────────────────────────────────────────────────────


def write_title(card_id: str, new_title: str, confidence: float) -> bool:
    return supabase_patch(
        "cards",
        {"id": f"eq.{card_id}"},
        {"title": new_title, "title_confidence": confidence},
    )


def write_description(
    card_id: str,
    new_description: str,
    confidence: float,
    existing_metadata: dict | None = None,
) -> bool:
    md = dict(existing_metadata or {})
    md["summary"] = new_description
    return supabase_patch(
        "cards",
        {"id": f"eq.{card_id}"},
        {"metadata": md, "description_confidence": confidence},
    )


def upsert_review_item(
    *,
    card_id: str,
    user_id: str,
    kind: str,
    proposed_value: str,
    current_value: str | None,
    confidence: float,
    critique: str,
) -> None:
    supabase_post(
        "enrichment_review_items",
        {
            "card_id": card_id,
            "user_id": user_id,
            "kind": kind,
            "proposed_value": proposed_value,
            "current_value": current_value,
            "confidence": confidence,
            "critique": critique,
        },
    )


def start_batch_stats(batch_id: str) -> None:
    supabase_post(
        "enrichment_batch_stats",
        {
            "batch_id": batch_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "cards_processed": 0,
            "auto_applied": 0,
            "queued_for_review": 0,
            "dropped": 0,
            "errors": 0,
        },
    )


def finish_batch_stats(
    batch_id: str,
    *,
    cards_processed: int,
    auto_applied: int,
    queued_for_review: int,
    dropped: int,
    errors: int,
) -> None:
    supabase_patch(
        "enrichment_batch_stats",
        {"batch_id": f"eq.{batch_id}"},
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "cards_processed": cards_processed,
            "auto_applied": auto_applied,
            "queued_for_review": queued_for_review,
            "dropped": dropped,
            "errors": errors,
        },
    )


def iter_weak_cards(
    *,
    batch_size: int,
    total_limit: int | None = None,
) -> Iterable[list[dict]]:
    """Yield batches of weak/long-title cards until the backlog is empty."""
    emitted = 0
    cursor: str | None = None
    while True:
        batch = fetch_weak_cards(
            limit=batch_size,
            before_created_at=cursor,
        )
        if not batch:
            return
        yield batch
        emitted += len(batch)
        if total_limit and emitted >= total_limit:
            return
        cursor = batch[-1].get("created_at")
