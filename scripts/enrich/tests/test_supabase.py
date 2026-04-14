"""Unit tests for supabase.is_weak_title and tombstone respect."""

import unittest

from scripts.enrich.supabase import is_weak_title, needs_description, needs_title


class WeakTitleTest(unittest.TestCase):
    def test_null_title_is_weak(self):
        self.assertTrue(is_weak_title(None))
        self.assertTrue(is_weak_title(""))
        self.assertTrue(is_weak_title("   "))

    def test_placeholder_literals_are_weak(self):
        for t in ("Untitled", "untitled note", "Link", "Saved Item", "Instagram Post"):
            self.assertTrue(is_weak_title(t), f"{t!r} should be weak")

    def test_bare_urls_are_weak(self):
        self.assertTrue(is_weak_title("https://example.com/foo"))
        self.assertTrue(is_weak_title("http://anything"))

    def test_long_titles_are_weak(self):
        t = "someones the new proud owner of a 42u server rack"
        self.assertTrue(is_weak_title(t))

    def test_good_titles_are_not_weak(self):
        self.assertFalse(is_weak_title("Home Server Rack Haul"))
        self.assertFalse(is_weak_title("Oklab Color Space"))

    def test_boundary_five_words_is_not_weak(self):
        self.assertFalse(is_weak_title("Home Server Rack Haul Today"))

    def test_six_words_is_weak(self):
        self.assertTrue(is_weak_title("Home Server Rack Haul Today Again"))


class TombstoneRespectTest(unittest.TestCase):
    def test_user_edited_title_blocks_needs_title(self):
        card = {
            "title": "x" * 40,
            "title_edited_at": "2026-04-14T00:00:00Z",
        }
        self.assertFalse(needs_title(card))

    def test_weak_title_with_no_tombstone_needs_title(self):
        card = {"title": None, "title_edited_at": None}
        self.assertTrue(needs_title(card))

    def test_good_title_no_tombstone_not_weak(self):
        card = {"title": "Oklab Color Notes", "title_edited_at": None}
        self.assertFalse(needs_title(card))

    def test_user_edited_description_blocks_needs_description(self):
        card = {
            "metadata": {"summary": "user wrote this"},
            "description_edited_at": "2026-04-14T00:00:00Z",
        }
        self.assertFalse(needs_description(card))

    def test_missing_summary_needs_description(self):
        card = {"metadata": {}, "description_edited_at": None}
        self.assertTrue(needs_description(card))

    def test_summary_without_confidence_needs_rescore(self):
        card = {
            "metadata": {"summary": "A solid description"},
            "description_edited_at": None,
            "description_confidence": None,
        }
        self.assertTrue(needs_description(card))

    def test_summary_with_confidence_not_needed(self):
        card = {
            "metadata": {"summary": "A solid description"},
            "description_edited_at": None,
            "description_confidence": 0.91,
        }
        self.assertFalse(needs_description(card))


if __name__ == "__main__":
    unittest.main()
