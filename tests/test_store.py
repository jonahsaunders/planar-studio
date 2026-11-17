"""A failed save must leave both the library and its on-disk copy usable."""
import json
import multiprocessing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from planar_studio.app import Application
from planar_studio.kicad_link import KiCadLink
from planar_studio.server import RpcError
from planar_studio.store import DesignConflict, Store, StoreError


def save_from_process(directory, name, barrier, results):
    store = Store(directory)
    store.load_design(name)
    barrier.wait(timeout=15)
    try:
        store.save_design(name, name, "inductor", {"turns": 7})
        results.put("saved")
    except DesignConflict:
        results.put("conflict")


class SaveTests(unittest.TestCase):
    def test_concurrent_processes_preserve_both_designs_or_report_a_conflict(self):
        ctx = multiprocessing.get_context("spawn")
        for names, expected in [(("L1", "L2"), ["saved", "saved"]),
                                (("L1", "L1"), ["conflict", "saved"])]:
            with self.subTest(names=names), tempfile.TemporaryDirectory() as directory:
                if names[0] == names[1]:
                    Store(directory).save_design(names[0], names[0], "inductor", {"turns": 3})
                results, barrier = ctx.Queue(), ctx.Barrier(2)
                writers = [ctx.Process(target=save_from_process, args=(directory, n, barrier, results))
                           for n in names]
                for writer in writers:
                    writer.start()
                for writer in writers:
                    writer.join(25)
                    self.assertEqual(writer.exitcode, 0)
                self.assertEqual(sorted(results.get(timeout=2) for _ in writers), expected)
                self.assertEqual({e["id"] for e in Store(directory).list_designs()}, set(names))
                results.close()

    def test_unreadable_state_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "state.json")
            path.write_bytes(b'{"schema":1,')
            with self.assertRaises(StoreError):
                Store(directory).set_prefs({"theme": "dark"})
            self.assertEqual(path.read_bytes(), b'{"schema":1,')

    def test_legacy_design_and_two_clients_of_one_plugin(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "state.json").write_text(json.dumps({
                "schema": 1, "designs": {"L1": {"saved": 1, "name": "L1", "config": {}}}}))
            with patch.object(KiCadLink, "settings_dir", return_value=directory):
                app = Application()
            first = app.api.call("designs.load", {"id": "L1"})
            params = {"id": "L1", "expectedRevision": first["revision"]}
            saved = app.api.call("designs.save", {**params, "config": {"turns": 8}})
            self.assertNotEqual(first["revision"], saved["revision"])
            for method in ("designs.save", "designs.delete"):
                with self.assertRaises(RpcError) as error:
                    app.api.call(method, params)
                self.assertEqual(error.exception.kind, "conflict")
            self.assertEqual(app.api.call("designs.load", {"id": "L1"})["config"], {"turns": 8})

    def test_independent_sections_merge_and_reads_refresh(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Store(directory), Store(directory)
            a.set_prefs({"theme": "dark"})
            a.record_placement("L1", "demo", ["one"])
            b.save_design("L2", "second", "inductor", {})
            b.record_placement("L1", "demo", ["two"])
            self.assertEqual(b.set_prefs({"scale": 2}), {"theme": "dark", "scale": 2})
            self.assertEqual(a.get_placement("L1", "demo")["history"][0]["ids"], ["one"])
            self.assertEqual(a.list_designs()[0]["id"], "L2")

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
