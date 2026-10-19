"""Regression tests for copper contacts hidden by T1's net tie. KiCad Python."""
import importlib.util
from pathlib import Path
import unittest

import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('winding_clearance', Path(__file__).with_name('verify-winding-clearance.py'))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class WindingClearance(unittest.TestCase):
    def setUp(self):
        self.board = pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
        self.t1 = next(f for f in self.board.GetFootprints() if f.GetReference() == 'T1')
        self.pad = next(p for p in self.t1.Pads() if p.GetNumber() == '2')

    def approaches(self):
        return [t for t in self.board.GetTracks() if not isinstance(t, pcb.PCB_VIA)
                and t.GetNetname() == '/SW' and t.GetLayer() == pcb.F_Cu
                and self.pad.GetPosition() in (t.GetStart(), t.GetEnd())]

    def test_corrected_board_and_intentional_terminal_contacts_pass(self):
        self.assertFalse(check.inspect(self.board)['violations'])

    def test_original_width_short_is_rejected(self):
        track = self.approaches()[0]
        track.SetWidth(pcb.FromMM(1.2))
        self.assertTrue(check.inspect(self.board)['violations'])

    def test_nonshorting_but_insufficient_clearance_is_rejected(self):
        # 0.8 mm does not overlap, but leaves only about 0.125 mm clearance.
        for track in self.approaches():
            original = track.GetWidth()
            track.SetWidth(pcb.FromMM(.8))
            self.assertTrue(check.inspect(self.board)['violations'])
            track.SetWidth(original)

    def test_added_sw_via_on_front_winding_is_rejected(self):
        via = pcb.PCB_VIA(self.board)
        via.SetPosition(pcb.VECTOR2I(pcb.FromMM(97.13), pcb.FromMM(72.75)))
        via.SetWidth(pcb.FromMM(.6))
        via.SetDrill(pcb.FromMM(.3))
        via.SetLayerPair(pcb.F_Cu, pcb.B_Cu)
        via.SetNetCode(self.pad.GetNetCode())
        self.board.Add(via)
        self.assertTrue(check.inspect(self.board)['violations'])

    def test_oversize_sw_pad_is_rejected(self):
        self.pad.SetSize(pcb.VECTOR2I(pcb.FromMM(1.2), pcb.FromMM(1.2)))
        self.assertTrue(check.inspect(self.board)['violations'])


if __name__ == '__main__':
    unittest.main()
