"""Catch missing release inputs before an installer reaches publication."""
import json
from pathlib import Path
import tempfile
import unittest

from scripts.check_release import check_release


class ReleasePreflightTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.package = {"version": "1.6.0", "status": "development"}
        (self.root / "metadata.json").write_text(
            json.dumps({"versions": [self.package]}), encoding="utf-8")
        self.notes = self.root / "docs" / "releases" / "1.6.0.md"
        self.notes.parent.mkdir(parents=True)

    def test_previous_version_notes_do_not_satisfy_current_release(self):
        self.notes.with_name("1.3.0.md").write_text("Old release", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Missing release notes: docs/releases/1.6.0.md"):
            check_release(self.root)

    def test_empty_release_notes_are_rejected(self):
        self.notes.write_text(" \n\t", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Empty release notes"):
            check_release(self.root)

    def test_matching_notes_allow_development_release(self):
        self.notes.write_text("# 1.6.0\nTransformer workflow → export", encoding="utf-8")
        self.assertEqual(check_release(self.root), self.package)


if __name__ == "__main__":
    unittest.main()
