"""BYOA enrichment CLI — preserves the scripts/nim_titles.py entrypoint.

Invokable as:
    python3 -m scripts.enrich.cli --limit 20 --dry-run
or indirectly via the legacy shim:
    python3 scripts/nim_titles.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

# Load .env before any other imports touch os.environ.
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
    SUPABASE_URL,
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


# ── ANSI ────────────────────────────────────────────────────────────────────
G = "\033[32m"; R = "\033[31m"; Y = "\033[33m"; C = "\033[36m"
B = "\033[1m";  D = "\033[2m";  N = "\033[0m"


def ok(msg: str) -> None: print(f"  {G}✓{N}  {msg}")
def fail(msg: str) -> None: print(f"  {R}✗{N}  {msg}")
def info(msg: str) -> None: print(f"  {C}·{N}  {msg}")
def warn(msg: str) -> None: print(f"  {Y}~{N}  {msg}")
def header(msg: str) -> None: print(f"\n{B}{msg}{N}")
def rule() -> None: print(f"  {D}{'─' * 70}{N}")


def score_bar(score: float) -> str:
    filled = round(max(0.0, min(1.0, score)) * 10)
    bar = "█" * filled + "░" * (10 - filled)
    color = G if score >= 0.9 else (Y if score >= 0.6 else R)
    return f"{color}{bar}{N} {score:.2f}"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="BYOA DSPy + NVIDIA NIM title & description quality pipeline",
    )
    p.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    p.add_argument("--limit", type=int, default=20, help="Max cards to process")
    p.add_argument(
        "--auto-apply-threshold",
        type=float,
        default=None,
        help="Override AUTO_APPLY_THRESHOLD (default 0.9)",
    )
    p.add_argument(
        "--review-threshold",
        type=float,
        default=None,
        help="Override REVIEW_THRESHOLD (default 0.6)",
    )
    p.add_argument("--nim-key", default="", help="NVIDIA NIM API key override")
    p.add_argument("--local-model", default="", help="Local model name fallback")
    p.add_argument(
        "--kind",
        choices=["title", "description", "both"],
        default="both",
        help="Which critic(s) to run",
    )
    return p


def main() -> None:
    args = build_parser().parse_args()

    print(f"\n{B}{C}{'═' * 72}{N}")
    print(f"{B}{C}  BYOA Enrichment Pipeline{N}")
    print(
        f"{B}{C}  {time.strftime('%Y-%m-%d %H:%M:%S')}  │  "
        f"dry_run={args.dry_run}  │  limit={args.limit}  │  kind={args.kind}{N}"
    )
    print(f"{B}{C}{'═' * 72}{N}")

    lm_label = configure_lm(nim_key=args.nim_key, local_model=args.local_model)
    ok(f"LM backend: {lm_label}")

    auto, review = env_thresholds()
    if args.auto_apply_threshold is not None:
        auto = args.auto_apply_threshold
    if args.review_threshold is not None:
        review = args.review_threshold
    info(f"Gate thresholds — apply≥{auto:.2f}  review≥{review:.2f}")

    title_pipeline = TitlePipeline() if args.kind in ("title", "both") else None
    desc_pipeline = DescriptionPipeline() if args.kind in ("description", "both") else None

    try:
        header("Fetching weak-title cards from Supabase…")
        cards = fetch_weak_cards(limit=args.limit)
    except SupabaseError as e:
        fail(str(e))
        fail(f"Supabase URL: {SUPABASE_URL or '(missing)'}")
        sys.exit(1)

    if not cards:
        warn("No weak-title cards found — backlog is clean.")
        sys.exit(0)

    info(f"Fetched {len(cards)} cards")

    batch_id = str(uuid.uuid4())
    stats = {"cards_processed": 0, "auto_applied": 0, "queued_for_review": 0, "dropped": 0, "errors": 0}

    if not args.dry_run:
        try:
            start_batch_stats(batch_id)
        except SupabaseError as e:
            warn(f"start_batch_stats failed: {e}")

    rule()
    for card in cards:
        stats["cards_processed"] += 1
        try:
            if title_pipeline and needs_title(card):
                result = title_pipeline(card)
                _route_title(card, result, auto, review, args.dry_run, stats)
            if desc_pipeline and needs_description(card):
                md = card.get("metadata") or {}
                existing = md.get("summary") if isinstance(md, dict) else None
                result = desc_pipeline(card, existing_description=existing)
                _route_description(card, result, auto, review, args.dry_run, stats)
        except Exception as e:
            stats["errors"] += 1
            print(f"  {R}ERR{N} {card['id'][:8]}  {e}")
    rule()

    if not args.dry_run:
        try:
            finish_batch_stats(batch_id, **stats)
        except SupabaseError as e:
            warn(f"finish_batch_stats failed: {e}")

    header("Summary")
    ok(f"Processed:        {stats['cards_processed']}")
    ok(f"Auto-applied:     {stats['auto_applied']}")
    info(f"Queued for review: {stats['queued_for_review']}")
    info(f"Dropped:          {stats['dropped']}")
    if stats["errors"]:
        fail(f"Errors:           {stats['errors']}")
    print()


def _route_title(card, result, auto, review, dry_run, stats):
    title = result.get("title")
    if not title:
        stats["dropped"] += 1
        return
    score = float(result.get("score", 0.0))
    band = apply_gate(score, auto=auto, review=review)
    print(
        f"  {D}{card['id'][:8]}{N}  [title]  "
        f"{Y}{(card.get('title') or '(null)')[:32]:<32}{N} → "
        f"{B}{title[:32]:<32}{N} {score_bar(score)}  {band}"
    )
    if band == "apply":
        if not dry_run:
            write_title(card["id"], title, score)
        stats["auto_applied"] += 1
    elif band == "review":
        if not dry_run:
            upsert_review_item(
                card_id=card["id"],
                user_id=card["user_id"],
                kind="title",
                proposed_value=title,
                current_value=card.get("title"),
                confidence=score,
                critique=result.get("critique", ""),
            )
        stats["queued_for_review"] += 1
    else:
        stats["dropped"] += 1


def _route_description(card, result, auto, review, dry_run, stats):
    desc = result.get("description")
    if not desc:
        stats["dropped"] += 1
        return
    score = float(result.get("score", 0.0))
    band = apply_gate(score, auto=auto, review=review)
    existing = ((card.get("metadata") or {}).get("summary") or "")
    print(
        f"  {D}{card['id'][:8]}{N}  [desc]   "
        f"{Y}{existing[:32]:<32}{N} → "
        f"{B}{desc[:32]:<32}{N} {score_bar(score)}  {band}"
    )
    if band == "apply":
        if not dry_run:
            write_description(card["id"], desc, score, card.get("metadata") or {})
        stats["auto_applied"] += 1
    elif band == "review":
        if not dry_run:
            upsert_review_item(
                card_id=card["id"],
                user_id=card["user_id"],
                kind="description",
                proposed_value=desc,
                current_value=existing or None,
                confidence=score,
                critique=result.get("critique", ""),
            )
        stats["queued_for_review"] += 1
    else:
        stats["dropped"] += 1


if __name__ == "__main__":
    main()
