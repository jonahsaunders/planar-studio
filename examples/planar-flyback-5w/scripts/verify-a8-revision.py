"""Bound A8 to the two short SW necks and revision markings. KiCad Python."""
from collections import Counter
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import tempfile

import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
BASE = '8dca6ed98bcd7ba8268f86910679d13682896f17'


def old(name):
    return subprocess.check_output(['git', 'show', f'{BASE}:examples/planar-flyback-5w/{name}'], cwd=ROOT)


def point(p):
    return p.x, p.y


def routes(board):
    result = []
    for t in board.GetTracks():
        if isinstance(t, pcb.PCB_VIA):
            result.append(('via', t.GetNetname(), point(t.GetPosition()), t.GetWidth(t.TopLayer()),
                           t.GetDrillValue(), t.TopLayer(), t.BottomLayer()))
        else:
            result.append(('track', t.GetNetname(), tuple(sorted([point(t.GetStart()), point(t.GetEnd())])),
                           t.GetWidth(), t.GetLayer()))
    return Counter(result)


def pads(footprint):
    return sorted((p.GetNumber(), p.GetNetname(), point(p.GetPosition()), point(p.GetSize()),
                   point(p.GetDrillSize()), p.GetOrientationDegrees(), p.GetLayerSet().FmtHex())
                  for p in footprint.Pads())


def edges(board):
    return sorted((g.GetShape(), point(g.GetStart()), point(g.GetEnd()), point(g.GetArcMid()), g.GetWidth())
                  for g in board.GetDrawings() if g.GetLayer() == pcb.Edge_Cuts)


def polygons(footprint):
    return sorted((g.GetLayer(), g.GetPolyShape().Format()) for g in footprint.GraphicalItems()
                  if isinstance(g, pcb.PCB_SHAPE) and g.GetShape() == pcb.SHAPE_T_POLY)


unchanged = ['circuit.json', 'parts.json', 'requirements.json', 'layout.json', 'mechanical.json',
             'magnetics.json', 'stackup.json', 'planar-studio/T1-artwork.json',
             'planar-studio/T1-config.json', 'planar-studio/T1.planar.json',
             'evidence/winding-model.json', 'kicad/PS-FLYBACK-5W.kicad_pro']
for name in unchanged:
    assert json.loads(old(name)) == json.loads((ROOT/name).read_text(encoding='utf8')), name

spec = importlib.util.spec_from_file_location('clearance', Path(__file__).with_name('verify-winding-clearance.py'))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
with tempfile.TemporaryDirectory() as temp:
    baseline = Path(temp)/'baseline.kicad_pcb'
    baseline.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
    before = pcb.LoadBoard(str(baseline))
    after = pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
    bf = {f.GetReference(): f for f in before.GetFootprints()}
    af = {f.GetReference(): f for f in after.GetFootprints()}
    assert bf.keys() == af.keys()
    for ref in bf:
        assert point(bf[ref].GetPosition()) == point(af[ref].GetPosition()), ref
        assert bf[ref].GetOrientationDegrees() == af[ref].GetOrientationDegrees(), ref
        assert pads(bf[ref]) == pads(af[ref]), ref
        assert bf[ref].GetFPID() == af[ref].GetFPID(), ref
        assert bf[ref].GetValue() == af[ref].GetValue(), ref
    assert polygons(bf['T1']) == polygons(af['T1']), 'Winding copper changed'
    assert edges(before) == edges(after), 'Board or core-slot outline changed'
    assert before.GetDesignSettings().GetBoardThickness() == after.GetDesignSettings().GetBoardThickness()
    assert after.GetTitleBlock().GetRevision() == 'A8-development'
    removed = list((routes(before) - routes(after)).elements())
    added = list((routes(after) - routes(before)).elements())
    assert len(removed) == 2 and len(added) == 4, (removed, added)
    terminal = point(next(p for p in af['T1'].Pads() if p.GetNumber() == '2').GetPosition())
    assert sorted(r[3] for r in removed) == [pcb.FromMM(.8), pcb.FromMM(1.2)]
    remaining = added.copy()
    for route in removed:
        assert route[0:2] == ('track', '/SW') and route[4] == pcb.F_Cu and terminal in route[2]
        other = next(p for p in route[2] if p != terminal)
        neck = next(r for r in remaining if r[0:2] == ('track', '/SW') and terminal in r[2]
                    and r[3:5] == (pcb.FromMM(.6), pcb.F_Cu)
                    and abs(math.dist(other, next(p for p in r[2] if p != terminal))
                            + math.dist(*r[2]) - math.dist(*route[2])) < 3)
        join = next(p for p in neck[2] if p != terminal)
        trunk = ('track', '/SW', tuple(sorted([join, other])), route[3], pcb.F_Cu)
        assert trunk in remaining
        assert abs(math.dist(*neck[2]) - pcb.FromMM(1)) < 3
        remaining.remove(neck)
        remaining.remove(trunk)
    assert not remaining
    bz = {(z.GetNetname(), z.GetLayer()): z for z in before.Zones()}
    az = {(z.GetNetname(), z.GetLayer()): z for z in after.Zones()}
    assert bz.keys() == az.keys()
    route_envelope = pcb.SHAPE_POLY_SET()
    for t in before.GetTracks():
        if (not isinstance(t, pcb.PCB_VIA) and t.GetNetname() == '/SW'
                and t.GetLayer() == pcb.F_Cu and terminal in (point(t.GetStart()), point(t.GetEnd()))):
            t.TransformShapeToPolygon(route_envelope, pcb.F_Cu, pcb.FromMM(.40),
                                      pcb.FromMM(.0005), pcb.ERROR_OUTSIDE)
    route_envelope.Simplify()
    pour_difference_mm2 = 0
    for key in bz:
        assert bz[key].Outline().Format() == az[key].Outline().Format()
        for a, b in [(bz[key], az[key]), (az[key], bz[key])]:
            difference = pcb.SHAPE_POLY_SET(a.GetFilledPolysList(a.GetLayer()))
            difference.BooleanSubtract(b.GetFilledPolysList(b.GetLayer()))
            pour_difference_mm2 += difference.Area()/1e12
            if key == ('/PGND', pcb.F_Cu):
                difference.BooleanSubtract(route_envelope)
            assert difference.Area() == 0, ('Ground pour changed outside SW routing envelope', key)
    # Splitting an oblique segment rounds its new point to integer nanometres.
    # Refill may therefore produce tiny boundary slivers beside those routes.
    assert pour_difference_mm2 < .00001, ('Unexpected ground-pour change', pour_difference_mm2)
    baseline_failures = check.inspect(before)['violations']
    assert len(baseline_failures) == 2
    assert all(v['item'] == 'track' and v['net'] == '/SW' and v['layer'] == 'F.Cu' for v in baseline_failures)
    assert not check.inspect(after)['violations']

report = {'revision': 'A8-development', 'baseline_commit': BASE, 'status': 'PASS',
          'changed_routes': {'removed': removed, 'added': added, 'neck_width_mm': .6, 'neck_length_mm_each': 1.0},
          'unchanged_component_pads_placements_values': True,
          'unchanged_winding_polygons_stack_outline_vias': True,
          'unchanged_ground_pours_outside_SW_clearance_envelope': True,
          'local_pour_difference_mm2': pour_difference_mm2,
          'unchanged_inputs': unchanged, 'original_A7_rejected': baseline_failures,
          'scope': 'Exact geometric containment of the routing repair and rejection of the shipped A7 fault. No measured hardware qualification.',
          'source_SHA256': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
                           ['kicad/PS-FLYBACK-5W.kicad_pcb', 'scripts/generate-board.py',
                            'scripts/verify-winding-clearance.py', 'scripts/verify-a8-revision.py']}}
(ROOT/'evidence/audit/a8-revision-checks.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
print('A8 containment passed: only two 1 mm SW necks; A7 rejected by independent clearance check.')
