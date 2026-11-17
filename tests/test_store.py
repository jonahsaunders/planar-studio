"""A failed save must leave both the library and its on-disk copy usable."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from planar_studio.app import Application
from planar_studio.kicad_link import KiCadLink
from planar_studio.server import RpcError
from planar_studio.store import Store


class SaveTests(unittest.TestCase):
    def test_failed_save_and_delete_preserve_last_good_design_then_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(KiCadLink, "settings_dir", return_value=directory):
                app = Application()
            params = {"id": "L1", "config": {"turns": 3}}
            app.api.call("designs.save", params)
            params["config"] = {"turns": 7}
            with patch("planar_studio.store.os.replace", side_effect=OSError("disk full")):
                for method in ("designs.save", "designs.delete"):
                    with self.assertRaisesRegex(RpcError, "disk full") as error:
                        app.api.call(method, params)
                    self.assertEqual(error.exception.kind, "io")
                    for store in (app.store, Store(directory)):
                        self.assertEqual(store.load_design("L1")["config"]["turns"], 3)
                    self.assertEqual(list(Path(directory).glob("*.tmp")), [])
            app.api.call("designs.save", params)
            self.assertEqual(Store(directory).load_design("L1")["config"]["turns"], 7)
