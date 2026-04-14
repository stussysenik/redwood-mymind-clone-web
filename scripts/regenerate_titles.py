#!/usr/bin/env python3
"""
BYOA — Title Regeneration Script
Finds cards with weak or missing titles and regenerates them as 3-5 word summaries.

Strategy (in priority order):
  1. Claude API  — best quality, uses existing content/summary/url
  2. Heuristic   — URL slug / content first sentence extraction (no API key needed)

Usage:
    # Dry run (preview only, no writes)
    python scripts/regenerate_titles.py --dry-run

    # Heuristic only (no API key needed)
    python scripts/regenerate_titles.py --strategy heuristic

    # AI-powered (requires ANTHROPIC_API_KEY in env or .env)
    python scripts/regenerate_titles.py --strategy claude

    # Limit batch size
    python scripts/regenerate_titles.py --limit 50

Requirements:
    pip install psycopg2-binary python-dotenv anthropic
"""

import argparse
import os
import re
import sys
import json
from pathlib import Path
from urllib.parse import urlparse

# ── Load .env ────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # dotenv optional — env vars may already be set

# ── ANSI colours ─────────────────────────────────────────────────────────────
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def fail(msg): print(f"  {RED}✗{RESET}  {msg}")
def info(msg): print(f"  {CYAN}·{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{msg}{RESET}")

# ── Weak title detection (mirrors api/src/lib/ai/titleOptimization.ts) ────────
GENERIC_TITLES = {
    "untitled", "untitled note", "link", "saved link",
    "saved item", "website", "instagram post", "twitter post", "x post",
}

def is_weak_title(title: str | None) -> bool:
    if not title or not title.strip():
        return True
    t = title.strip().lower()
    if t in GENERIC_TITLES:
        return True
    if t.startswith("untitled"):
        return True
    if re.match(r'^https?://', t):
        return True
    if len(title.strip()) < 5:
        return True
    return False

# ── Heuristic title generation ────────────────────────────────────────────────
def slug_to_words(slug: str) -> list[str]:
    """Convert a URL slug like 'my-cool-article' → ['my', 'cool', 'article']."""
    return re.split(r'[-_]', slug)

def heuristic_title(card: dict) -> str | None:
    """Generate a 3-5 word title from card metadata, no API required."""
    url    = card.get("url") or ""
    content = card.get("content") or ""
    meta   = card.get("metadata") or {}
    tags   = card.get("tags") or []

    # 1. Try the URL slug (last meaningful path segment)
    if url:
        try:
            path = urlparse(url).path.rstrip("/")
            segments = [s for s in path.split("/") if s and not s.isdigit()]
            if segments:
                slug = segments[-1]
                words = slug_to_words(slug)
                # Filter noise
                words = [w for w in words if len(w) > 2 and not w.isdigit()]
                if 2 <= len(words) <= 8:
                    title = " ".join(words[:5]).title()
                    if len(title) >= 8:
                        return title
        except Exception:
            pass

    # 2. Try first sentence of content/summary
    for field in [meta.get("summary"), content]:
        if field and isinstance(field, str) and len(field) > 10:
            # Extract first sentence
            sentence = re.split(r'[.!?]\s', field.strip())[0]
            words = sentence.split()
            if 3 <= len(words) <= 6:
                return sentence[:80]
            if len(words) > 6:
                return " ".join(words[:5]) + "…"

    # 3. Tags as last resort
    if tags and len(tags) >= 2:
        return " · ".join(tags[:3]).title()

    return None

# ── Claude API title generation ───────────────────────────────────────────────
def claude_title(card: dict, client) -> str | None:
    """Ask Claude to generate a 3-5 word title for this card."""
    url     = card.get("url") or ""
    content = (card.get("content") or "")[:400]
    meta    = card.get("metadata") or {}
    summary = (meta.get("summary") or "")[:300]
    tags    = ", ".join(card.get("tags") or [])

    context_parts = []
    if url:       context_parts.append(f"URL: {url}")
    if summary:   context_parts.append(f"Summary: {summary}")
    if content:   context_parts.append(f"Content: {content}")
    if tags:      context_parts.append(f"Tags: {tags}")

    if not context_parts:
        return None

    context = "\n".join(context_parts)

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=40,
            messages=[{
                "role": "user",
                "content": (
                    f"Generate a concise 3-5 word title for this saved item. "
                    f"Output ONLY the title, no quotes, no punctuation at end.\n\n{context}"
                ),
            }],
        )
        title = resp.content[0].text.strip().strip('"\'').strip()
        # Sanity check: 2-8 words, not suspiciously long
        words = title.split()
        if 2 <= len(words) <= 8 and len(title) <= 80:
            return title
    except Exception as e:
        fail(f"Claude API error: {e}")

    return None

# ── Database helpers ──────────────────────────────────────────────────────────
def connect():
    try:
        import psycopg2
    except ImportError:
        print(f"{RED}Error: psycopg2-binary not installed.{RESET}")
        print("  pip install psycopg2-binary")
        sys.exit(1)

    db_url = os.environ.get("DIRECT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        print(f"{RED}Error: DATABASE_URL not set.{RESET}")
        sys.exit(1)

    return psycopg2.connect(db_url)

def fetch_weak_title_cards(conn, limit: int) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, title, content, url, tags, metadata
            FROM cards
            WHERE deleted_at IS NULL
              AND archived_at IS NULL
              AND (
                title IS NULL
                OR LOWER(TRIM(title)) = ANY(ARRAY[
                  'untitled','untitled note','link','saved link',
                  'saved item','website','instagram post','twitter post','x post'
                ])
                OR LOWER(title) LIKE 'untitled%'
                OR title ~ '^https?://'
                OR LENGTH(TRIM(title)) < 5
              )
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

def update_title(conn, card_id: str, new_title: str, dry_run: bool) -> None:
    if dry_run:
        return
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE cards SET title = %s, updated_at = NOW() WHERE id = %s",
            (new_title, card_id),
        )
    conn.commit()

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Regenerate weak card titles")
    parser.add_argument("--strategy", choices=["heuristic", "claude"], default="heuristic")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    header(f"BYOA Title Regeneration  (strategy={args.strategy}, limit={args.limit}, dry_run={args.dry_run})")

    # Set up Claude client if needed
    claude_client = None
    if args.strategy == "claude":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            fail("ANTHROPIC_API_KEY not set — falling back to heuristic")
            args.strategy = "heuristic"
        else:
            try:
                import anthropic
                claude_client = anthropic.Anthropic(api_key=api_key)
                ok("Claude API client ready")
            except ImportError:
                fail("anthropic package not installed  →  pip install anthropic")
                sys.exit(1)

    conn = connect()
    ok("Database connected")

    cards = fetch_weak_title_cards(conn, args.limit)
    info(f"Found {len(cards)} cards with weak titles")

    if not cards:
        ok("Nothing to do.")
        conn.close()
        return

    updated = skipped = errors = 0

    for card in cards:
        card_id = card["id"]
        old_title = card.get("title") or "(null)"

        new_title = None
        if args.strategy == "claude" and claude_client:
            new_title = claude_title(card, claude_client)
            if not new_title:
                new_title = heuristic_title(card)  # fallback
        else:
            new_title = heuristic_title(card)

        if not new_title or is_weak_title(new_title):
            info(f"  skip  {card_id[:8]}  no good title found  (url={card.get('url', '')[:40]})")
            skipped += 1
            continue

        try:
            update_title(conn, card_id, new_title, args.dry_run)
            prefix = "[dry-run] " if args.dry_run else ""
            ok(f"  {prefix}{card_id[:8]}  {old_title!r:30} → {new_title!r}")
            updated += 1
        except Exception as e:
            fail(f"  {card_id[:8]}  update failed: {e}")
            errors += 1

    conn.close()

    header("Summary")
    ok(f"Updated:  {updated}")
    info(f"Skipped:  {skipped}")
    if errors:
        fail(f"Errors:   {errors}")
    if args.dry_run:
        print(f"\n{YELLOW}Dry run — no writes made. Remove --dry-run to apply.{RESET}")

if __name__ == "__main__":
    main()
