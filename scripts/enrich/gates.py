"""Three-band confidence gate for the enrichment pipeline.

A proposed title/description write is routed into one of three bands based on
the CoT critic score:

    score >= AUTO_APPLY_THRESHOLD          → 'apply'   (write to card)
    REVIEW_THRESHOLD <= score < AUTO        → 'review'  (queue for /review)
    score < REVIEW_THRESHOLD               → 'drop'    (log only)

Thresholds come from env by default (AUTO_APPLY_THRESHOLD, REVIEW_THRESHOLD).
Parameters are test hooks so gate logic can be unit-tested without monkey-
patching environment variables.
"""

import os
from typing import Literal

GateBand = Literal["apply", "review", "drop"]

DEFAULT_AUTO_APPLY = 0.9
DEFAULT_REVIEW = 0.6


def env_thresholds() -> tuple[float, float]:
    """Read the env-tuned thresholds. Safe to call in a hot loop — cheap."""
    auto = float(os.environ.get("AUTO_APPLY_THRESHOLD", DEFAULT_AUTO_APPLY))
    review = float(os.environ.get("REVIEW_THRESHOLD", DEFAULT_REVIEW))
    return auto, review


def apply_gate(
    score: float,
    auto: float | None = None,
    review: float | None = None,
) -> GateBand:
    """Return the gate band for `score`.

    Boundaries are closed-above: `score == auto` auto-applies; `score == review`
    queues for review; `score` just below review drops.
    """
    if auto is None or review is None:
        env_auto, env_review = env_thresholds()
        auto = env_auto if auto is None else auto
        review = env_review if review is None else review

    if score >= auto:
        return "apply"
    if score >= review:
        return "review"
    return "drop"
