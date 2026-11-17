"""Verify that placement DRC uses the saved project on isolated KiCad boards."""

import tempfile
import unittest
from pathlib import Path

from planar_studio.drc import _candidate, compare_placement, current_rules_revision, find_cli
from planar_studio.kicad_link import Placement


UUID = "b68b21ad-967f-4999-bdda-6eed18bdd427"
BOARD = """(kicad_pcb
 (version 20240108) (generator pcbnew)
 (general (thickness 1.6))
 (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user)
         (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user))
 (setup (pad_to_mask_clearance 0))
 (net 0 "") (net 1 "A") (net 2 "B")
 (gr_rect (start 0 0) (end 60 40) (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts"))
 (segment (start 10 10) (end 20 10) (width 0.25) (layer "F.Cu") (net 1))
 (segment (start 35 10) (end 45 10) (width 0.25) (layer "F.Cu") (net 1))
 (segment (start 35 11) (end 45 11) (width 0.25) (layer "F.Cu") (net 2))
 (segment (start 35 31) (end 45 31) (width 0.25) (layer "B.Cu") (net 2)
          (uuid "REMOVE_UUID"))
)
""".replace("REMOVE_UUID", UUID)


class PlacementDrc(unittest.TestCase):
    def test_replacement_preserves_original_board_fields(self):
        board = BOARD.replace(' (setup (pad_to_mask_clearance 0))',
                              ' (setup (pad_to_mask_clearance 0))\n (gr_text "test (quoted)" (at 5 5))')
        placement = Placement(origin=(10, 10), tracks=[
            {"pts": [[0, 1], [10, 1]], "width": 0.25, "layer": "F.Cu", "net": "B"},
        ])
        text = _candidate(board, placement, [UUID], ["A", "B"])
        self.assertIn('(start 10.000000 11.000000) (end 20.000000 11.000000)', text)
        self.assertIn('(net 2)', text)
        self.assertIn('(gr_text "test (quoted)" (at 5 5))', text)
        self.assertNotIn(UUID, text)

    @unittest.skipUnless(find_cli(), "KiCad command-line checker is required")
    def test_kicad_reports_new_custom_rule_violation_without_editing_board(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "rules.kicad_pcb")
            path.write_text(BOARD, encoding="utf-8")
            project = path.with_suffix(".kicad_pro")
            project.write_text("{}", encoding="utf-8")
            rule = path.with_suffix(".kicad_dru")
            rule.write_text(
                '(version 1)\n(rule "Probe clearance" (constraint clearance (min 1.5mm))'
                ' (condition "A.Type == \'Track\' && B.Type == \'Track\'"))\n',
                encoding="utf-8",
            )
            snapshot = {"boardId": str(path), "text": BOARD, "excludedIds": [UUID], "nets": ["A", "B"]}
            placement = Placement(origin=(10, 10), tracks=[
                {"pts": [[0, 1], [10, 1]], "width": 0.25, "layer": "F.Cu", "net": "B"},
            ], arcs=[
                {"start": [12, 10], "mid": [13, 11], "end": [14, 10], "layer": "F.Cu", "net": None},
            ], vias=[
                {"x": 4, "y": 10, "diameter": 0.7, "drill": 0.35, "net": "B"},
            ], pads=[
                {"x": 18, "y": 10, "w": 1, "h": 1, "number": "1", "layer": "B.Cu", "net": "A"},
            ], texts=[
                {"x": 15, "y": 17, "value": "Test (1)", "layer": "F.SilkS"},
            ])
            report = compare_placement(snapshot, placement)
            self.assertTrue(report["projectSettings"])
            self.assertTrue(report["customRules"])
            self.assertGreater(report["baselineCount"], 0)
            clearance = [item for item in report["findings"] if item["type"] == "clearance"]
            self.assertEqual(len(clearance), 1, report)
            self.assertIn("Probe clearance", clearance[0]["description"])
            self.assertGreater(report["newErrorCount"], 0)
            self.assertEqual(path.read_text(encoding="utf-8"), BOARD)
            self.assertEqual(report["rulesRevision"], current_rules_revision(snapshot))
            rule.unlink()
            self.assertNotEqual(report["rulesRevision"], current_rules_revision(snapshot))
