"""Regression cases for failures hidden inside one winding polygon."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import pcbnew as pcb

ROOT=Path(__file__).resolve().parents[1]
BASE='58b86796b28c1d9d602b02cedf423923a5b672eb'
spec=importlib.util.spec_from_file_location('integrity',Path(__file__).with_name('verify-winding-integrity.py'))
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)


class WindingIntegrity(unittest.TestCase):
    def setUp(self):
        self.board=pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
        self.art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text())
        t1=next(f for f in self.board.GetFootprints() if f.GetReference()=='T1')
        self.front=next(g for g in t1.GraphicalItems() if isinstance(g,pcb.PCB_SHAPE) and g.GetLayer()==pcb.F_Cu)

    def test_current_copper_passes(self):
        self.assertEqual(check.inspect(self.board,self.art)['status'],'PASS')

    def test_old_0p191mm_gap_fails_all_four_layers(self):
        def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=ROOT)
        with tempfile.TemporaryDirectory() as temp:
            file=Path(temp)/'A8.kicad_pcb';file.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
            result=check.inspect(pcb.LoadBoard(str(file)),json.loads(old('planar-studio/T1-artwork.json')))
        self.assertEqual({v['layer'] for v in result['violations']},check.LAYERS)
        for layer in result['layers'].values():
            self.assertLess(layer['saved_polygon_gap_at_tightest_pair_mm'],.192)

    def test_extra_copper_cannot_hide_behind_centerline_containment(self):
        poly=pcb.SHAPE_POLY_SET(self.front.GetPolyShape())
        poly.Inflate(pcb.FromMM(.03),pcb.CORNER_STRATEGY_ROUND_ALL_CORNERS,pcb.FromMM(.0001))
        self.front.SetPolyShape(poly)
        r=check.inspect(self.board,self.art)
        self.assertGreater(r['layers']['F.Cu']['extra_copper_outside_tolerance_mm2'],0)
        self.assertEqual(r['status'],'FAIL')

    def test_missing_copper_is_rejected(self):
        poly=pcb.SHAPE_POLY_SET(self.front.GetPolyShape())
        poly.BooleanSubtract(check.polygon([(93.3,84.99),(96,84.99),(96,85.01),(93.3,85.01)]))
        self.front.SetPolyShape(poly)
        r=check.inspect(self.board,self.art)
        self.assertGreater(r['layers']['F.Cu']['missing_copper_inside_tolerance_mm2'],0)
        self.assertEqual(r['status'],'FAIL')


if __name__=='__main__':unittest.main()
