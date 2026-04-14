"""DSPy modules — title + description generation and CoT quality scoring."""

import dspy

from .signatures import (
    DescriptionQualitySignature,
    DescriptionSignature,
    TagQualitySignature,
    TitleQualitySignature,
    TitleSignature,
)


# Heuristic blocklist for tag auditing — kept in sync with scripts/nim_titles.py.
GENERIC_TAG_BLOCKLIST = {
    # content-type noise (already encoded in card.type)
    "visual", "text", "link", "article", "content", "post", "image",
    # vague quality adjectives
    "dense", "composition", "layout", "minimal", "clean", "simple",
    "complex", "detailed", "modern", "classic", "new", "old", "best",
    "top", "great", "good", "nice", "cool", "interesting", "useful",
    # social / engagement noise
    "conversation", "discussion", "thread", "comment", "reply",
    "popular", "viral", "trending",
    # filler
    "stuff", "things", "misc", "other", "general", "various", "more",
    # audit-confirmed noise from live data (2026-04-14)
    "raw", "studio-lit", "tweet",
}


def _truncate(text: str, limit: int) -> str:
    return text[:limit] + "…" if len(text) > limit else text


class TitlePipeline(dspy.Module):
    """Generates a 3–5 word title and scores it with a CoT critic."""

    def __init__(self) -> None:
        self.generate = dspy.Predict(TitleSignature)
        self.score = dspy.ChainOfThought(TitleQualitySignature)

    def forward(self, card: dict) -> dict:
        url = card.get("url") or ""
        content = _truncate(
            card.get("content") or (card.get("metadata") or {}).get("summary") or "",
            300,
        )
        tags_str = ", ".join(card.get("tags") or [])
        ctype = card.get("type") or "website"

        gen = self.generate(url=url, content=content, tags=tags_str, card_type=ctype)
        raw_title = gen.title.strip().strip('"\'').rstrip(".,!?")

        words = raw_title.split()
        if len(words) > 5:
            raw_title = " ".join(words[:5])
        elif len(words) < 2:
            return {"title": None, "score": 0.0, "critique": "Too short"}

        sc = self.score(proposed_title=raw_title, url=url, content=content)
        try:
            score = float(sc.score)
        except (ValueError, TypeError):
            score = 0.5

        return {"title": raw_title, "score": score, "critique": sc.critique}


class DescriptionPipeline(dspy.Module):
    """Generates and/or critiques a 1–2 sentence description.

    `forward` returns both a generated proposal and an optional score for the
    existing description — the worker decides which to write based on gate
    band.
    """

    def __init__(self) -> None:
        self.generate = dspy.Predict(DescriptionSignature)
        self.score = dspy.ChainOfThought(DescriptionQualitySignature)

    def forward(self, card: dict, existing_description: str | None = None) -> dict:
        url = card.get("url") or ""
        content = _truncate(card.get("content") or "", 1200)
        title = card.get("title") or ""
        ctype = card.get("type") or "website"

        if not content and not title:
            return {
                "description": None,
                "score": 0.0,
                "critique": "Empty source — skipping to avoid hallucination.",
            }

        gen = self.generate(url=url, content=content, title=title, card_type=ctype)
        proposed = (gen.description or "").strip().strip('"\'')
        if len(proposed) > 240:
            proposed = proposed[:240].rsplit(" ", 1)[0] + "…"

        target = existing_description if existing_description else proposed
        if not target:
            return {
                "description": None,
                "score": 0.0,
                "critique": "No description available to score.",
            }

        sc = self.score(
            proposed_description=target,
            url=url,
            content=content,
            title=title,
        )
        try:
            score = float(sc.score)
        except (ValueError, TypeError):
            score = 0.5

        return {
            "description": proposed,
            "score": score,
            "critique": sc.critique,
        }


class TagAuditor(dspy.Module):
    """Retained from scripts/nim_titles.py for CLI parity."""

    def __init__(self) -> None:
        self.evaluate = dspy.Predict(TagQualitySignature)

    def forward(self, tag: str, title: str, card_type: str) -> dict:
        if tag.lower() in GENERIC_TAG_BLOCKLIST or len(tag) <= 2:
            return {"useful": False, "reason": "blocklist", "source": "heuristic"}
        if tag.lower() == card_type.lower():
            return {"useful": False, "reason": "duplicates card type", "source": "heuristic"}
        try:
            result = self.evaluate(tag=tag, card_title=title, card_type=card_type)
            return {
                "useful": bool(result.is_useful),
                "reason": result.reason,
                "source": "dspy",
            }
        except Exception:
            return {"useful": True, "reason": "eval failed, keeping", "source": "error"}
