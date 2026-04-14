"""Unit tests for the three-band confidence gate."""

import os
import unittest
from unittest.mock import patch

from scripts.enrich.gates import apply_gate, env_thresholds


class GateBandsTest(unittest.TestCase):
    def test_score_at_auto_threshold_applies(self):
        self.assertEqual(apply_gate(0.9, auto=0.9, review=0.6), "apply")

    def test_score_above_auto_applies(self):
        self.assertEqual(apply_gate(0.95, auto=0.9, review=0.6), "apply")

    def test_score_at_review_threshold_queues(self):
        self.assertEqual(apply_gate(0.6, auto=0.9, review=0.6), "review")

    def test_score_between_thresholds_queues(self):
        self.assertEqual(apply_gate(0.75, auto=0.9, review=0.6), "review")

    def test_score_just_below_auto_queues(self):
        self.assertEqual(apply_gate(0.8999, auto=0.9, review=0.6), "review")

    def test_score_below_review_drops(self):
        self.assertEqual(apply_gate(0.59, auto=0.9, review=0.6), "drop")

    def test_score_zero_drops(self):
        self.assertEqual(apply_gate(0.0, auto=0.9, review=0.6), "drop")

    def test_custom_thresholds(self):
        self.assertEqual(apply_gate(0.85, auto=0.8, review=0.5), "apply")
        self.assertEqual(apply_gate(0.5, auto=0.8, review=0.5), "review")


class EnvThresholdsTest(unittest.TestCase):
    def test_defaults_when_unset(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AUTO_APPLY_THRESHOLD", None)
            os.environ.pop("REVIEW_THRESHOLD", None)
            auto, review = env_thresholds()
            self.assertEqual(auto, 0.9)
            self.assertEqual(review, 0.6)

    def test_override_via_env(self):
        with patch.dict(
            os.environ,
            {"AUTO_APPLY_THRESHOLD": "0.92", "REVIEW_THRESHOLD": "0.55"},
        ):
            auto, review = env_thresholds()
            self.assertEqual(auto, 0.92)
            self.assertEqual(review, 0.55)

    def test_apply_gate_uses_env_by_default(self):
        with patch.dict(
            os.environ,
            {"AUTO_APPLY_THRESHOLD": "0.8", "REVIEW_THRESHOLD": "0.5"},
        ):
            self.assertEqual(apply_gate(0.8), "apply")
            self.assertEqual(apply_gate(0.79), "review")
            self.assertEqual(apply_gate(0.49), "drop")


if __name__ == "__main__":
    unittest.main()
