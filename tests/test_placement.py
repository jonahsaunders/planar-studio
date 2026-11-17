"""Exercise the board RPCs with real IPC items and a controlled KiCad commit."""
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, call, patch

from planar_studio.app import Application
from planar_studio import kicad_link as k
from planar_studio.server import RpcError
from planar_studio.store import Store


@unittest.skipUnless(k.HAVE_KIPY, "Install requirements.txt to test board edits")
class PlacementTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        with patch.object(k.KiCadLink, "settings_dir", return_value=directory.name):
            self.app = Application()
        self.old_via = SimpleNamespace(id="old-via")
        self.old_label = SimpleNamespace(id="old-label")
        self.board = Mock()
        self.board.get_enabled_layers.return_value = [k._resolve_layer(n) for n in ("F.Cu", "B.Cu")]
        self.board.begin_commit.return_value = "commit"
        self.board.get_tracks.return_value = [SimpleNamespace(id="unrelated")]
        self.board.get_vias.return_value = [self.old_via]
        self.board.get_footprints.return_value = []
        self.board.get_text.return_value = [self.old_label]
        self.board.create_items.return_value = [SimpleNamespace(id="new-via")]
        self.app.link._board = lambda: self.board
        self.app.link.board_context = lambda: {"name": "demo"}
        self.old_ids = ["old-via", "old-label", "manually-deleted"]
        self.app.store.record_placement("L1", "demo", self.old_ids)
        self.params = {
            "replace": True,
            "placement": {"designId": "L1", "name": "L1", "vias": [{"x": 1, "y": 1}]},
        }

    def replace(self):
        return self.app.api.call("board.place", self.params)

    def persisted_ids(self):
        return Store(self.app.store.dir).get_placement("L1", "demo")["ids"]

    def restored_ids(self):
        store = Store(self.app.store.dir)
        entry = store.get_placement("L1", "demo")
        return store.live_revision(entry, {"old-label", "old-via"})["ids"]

    def test_replacement_is_one_undo_step_and_removes_only_recorded_items(self):
        out = self.replace()
        self.assertEqual(out["created"], 1)
        self.assertEqual(out["replaced"], 2)
        new_items = self.board.create_items.call_args.args[0]
        self.board.assert_has_calls([
            call.begin_commit(), call.create_items(new_items),
            call.remove_items([self.old_via, self.old_label]),
            call.push_commit("commit", "Planar Studio: replace L1"),
        ])
        self.board.begin_commit.assert_called_once()
        self.board.push_commit.assert_called_once()
        self.assertEqual(self.persisted_ids(), ["new-via"])

    def test_rejected_edits_keep_previous_registry(self):
        for method in ("begin_commit", "create_items", "remove_items", "push_commit"):
            with self.subTest(method=method):
                self.board.reset_mock(side_effect=True)
                getattr(self.board, method).side_effect = RuntimeError(method)
                with self.assertRaises(RpcError) as error:
                    self.replace()
                self.assertEqual(error.exception.kind, "boardedit")
                self.assertEqual(self.restored_ids(), ["old-via", "old-label"])
                if method == "begin_commit":
                    self.board.create_items.assert_not_called()
                    self.board.drop_commit.assert_not_called()
                else:
                    self.board.drop_commit.assert_called_once_with("commit")
                if method in ("begin_commit", "create_items"):
                    self.board.remove_items.assert_not_called()

    def test_incomplete_creation_does_not_retire_previous_items(self):
        for returned in ([], [SimpleNamespace(id="")]):
            with self.subTest(returned=returned):
                self.board.reset_mock()
                self.board.create_items.return_value = returned
                with self.assertRaisesRegex(RpcError, "unique ID"):
                    self.replace()
                self.board.remove_items.assert_not_called()
                self.board.drop_commit.assert_called_once_with("commit")
                self.assertEqual(self.persisted_ids(), self.old_ids)

    def test_unusable_replacement_is_rejected_before_editing(self):
        self.params["placement"]["tracks"] = [{"layer": "unknown", "pts": [[0, 0], [1, 0]]}]
        with self.assertRaisesRegex(RpcError, "unknown layer"):
            self.replace()
        self.board.begin_commit.assert_not_called()
        self.assertEqual(self.persisted_ids(), self.old_ids)

    def test_failed_rollback_reports_uncertain_board_state(self):
        self.board.push_commit.side_effect = RuntimeError("connection lost")
        self.board.drop_commit.side_effect = RuntimeError("disconnected")
        with self.assertRaisesRegex(RpcError, "Check the board before retrying"):
            self.replace()
        self.assertEqual(self.restored_ids(), ["old-via", "old-label"])
        self.assertEqual(self.persisted_ids(), ["new-via"])

    def test_fresh_placement_does_not_scan_or_remove_old_items(self):
        self.params["placement"]["designId"] = "L2"
        out = self.replace()
        self.assertEqual(out["replaced"], 0)
        self.board.get_tracks.assert_not_called()
        self.board.remove_items.assert_not_called()
        self.assertEqual(self.persisted_ids(), self.old_ids)

    def test_unplace_can_be_retried_after_a_failed_commit(self):
        self.board.push_commit.side_effect = RuntimeError("busy")
        with self.assertRaises(RpcError):
            self.app.api.call("board.unplace", {"designId": "L1"})
        self.assertEqual(self.persisted_ids(), self.old_ids)
        self.board.push_commit.side_effect = None
        out = self.app.api.call("board.unplace", {"designId": "L1"})
        self.assertEqual(out["removed"], 2)
        self.board.get_vias.return_value = []
        self.board.get_text.return_value = []
        self.assertEqual(self.app.api.call("board.context", {})["placements"], [])
        self.board.get_vias.return_value = [self.old_via]
        self.assertEqual(self.app.api.call("board.context", {})["placements"][0]["count"], 1)

    def test_undo_redo_and_replace_after_restart_use_the_live_revision(self):
        self.replace()
        self.app.store = Store(self.app.store.dir)
        self.app.link.board_snapshot = lambda: {"name": "demo", "text": "board"}
        self.app.link.board_context = lambda: {"name": "demo", "selectionIds": ["old-via"]}
        for live_vias, labels, expected in [
            ([self.old_via], [self.old_label], ["old-via", "old-label"]),
            ([SimpleNamespace(id="new-via")], [], ["new-via"]),
            ([self.old_via], [], ["old-via"]),
        ]:
            self.board.get_vias.return_value = live_vias
            self.board.get_text.return_value = labels
            self.assertEqual(self.app.api.call("board.snapshot", {"designId": "L1"})["excludedIds"], expected)
            context = self.app.api.call("board.context", {})
            self.assertEqual(context["placements"][0]["count"], len(expected))
            self.assertEqual(context["selectedDesign"], "L1" if "old-via" in expected else None)
        self.board.create_items.return_value = [SimpleNamespace(id="third-via")]
        self.assertEqual(self.replace()["replaced"], 1)
        self.board.remove_items.assert_called_with([self.old_via])

    def test_registry_write_failure_rolls_back_the_board(self):
        with patch("planar_studio.store.os.replace", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(RpcError, "disk full"):
                self.replace()
        self.board.drop_commit.assert_called_once_with("commit")
        self.board.push_commit.assert_not_called()
        self.assertEqual(self.persisted_ids(), self.old_ids)

    def test_live_layer_check_rejects_a_changed_stack_before_any_edit(self):
        self.board.get_stackup.side_effect = RuntimeError("unavailable")
        self.board.get_enabled_layers.return_value += [k._resolve_layer(n) for n in ("In1.Cu", "In2.Cu")]
        context = k.KiCadLink.board_context(self.app.link)
        self.assertEqual([c["name"] for c in context["copperLayers"]], k.COPPER_ORDER[:3] + ["B.Cu"])
        self.board.get_enabled_layers.return_value = [k._resolve_layer(n) for n in ("F.Cu", "B.Cu")]
        self.params["placement"]["tracks"] = [{"layer": "In1.Cu", "pts": [[0, 0], [1, 1]]}]
        with self.assertRaisesRegex(RpcError, "In1.Cu"):
            self.replace()
        self.board.begin_commit.assert_not_called()
        self.board.remove_items.assert_not_called()

    def test_count_only_and_unknown_board_layers(self):
        self.board.get_enabled_layers.side_effect = RuntimeError("unavailable")
        self.board.get_stackup.side_effect = RuntimeError("unavailable")
        self.board.get_copper_layer_count.return_value = 2
        context = k.KiCadLink.board_context(self.app.link)
        self.assertEqual([c["name"] for c in context["copperLayers"]], ["F.Cu", "B.Cu"])
        self.params["placement"]["texts"] = [{"x": 0, "y": 1, "value": "L1"}]
        with self.assertRaisesRegex(RpcError, "F.SilkS"):
            self.replace()
        del self.params["placement"]["texts"]
        self.board.get_copper_layer_count.side_effect = RuntimeError("disconnected")
        self.assertEqual(k.KiCadLink.board_context(self.app.link)["layerCount"], 0)
        with self.assertRaisesRegex(RpcError, "destination layers"):
            self.replace()
        self.board.begin_commit.assert_not_called()

    def test_disabled_pad_mask_and_legacy_stackup(self):
        self.board.get_enabled_layers.side_effect = AttributeError()
        self.board.get_stackup.return_value = SimpleNamespace(layers=[
            SimpleNamespace(layer=k._resolve_layer(n), enabled=True) for n in ("F.Cu", "B.Cu")
        ])
        self.params["placement"]["pads"] = [{"layer": "B.Cu", "x": 0, "y": 0, "w": 1, "h": 1}]
        with self.assertRaisesRegex(RpcError, "B.Mask"):
            self.replace()
        self.board.begin_commit.assert_not_called()
        del self.params["placement"]["pads"]
        self.assertEqual(self.replace()["created"], 1)

    def test_empty_enabled_layer_set_takes_precedence_over_the_stack(self):
        self.board.get_enabled_layers.return_value = []
        self.board.get_copper_layer_count.return_value = 4
        self.assertEqual(k.KiCadLink.board_context(self.app.link)["copperLayers"], [])
        with self.assertRaisesRegex(RpcError, "destination layers"):
            self.replace()
        self.board.begin_commit.assert_not_called()

    def test_placement_rejects_changes_after_review(self):
        state = {"name": "demo", "text": "before", "nets": []}
        self.app.link.board_snapshot = lambda: state
        review = self.app.api.call("board.snapshot", {"designId": "L1"})
        self.params["expectedSnapshot"] = review["revision"]
        state["text"] = "after"
        with self.assertRaises(RpcError) as error:
            self.replace()
        self.assertEqual(error.exception.kind, "stale-board")
        self.board.begin_commit.assert_not_called()
        self.assertEqual(self.persisted_ids(), self.old_ids)
