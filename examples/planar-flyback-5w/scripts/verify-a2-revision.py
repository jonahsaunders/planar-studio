"""Compare A2 with pinned A1 using native saved-board geometry. KiCad Python."""
import hashlib, json, os, subprocess, tempfile
from pathlib import Path
import pcbnew as pcb
R = Path(__file__).resolve().parents[1]
REPO = Path(os.environ.get('PLANAR_STUDIO_ROOT', R.parents[1]))
BASE = '0ef077898a9e2ab8689aa1481984faa3b62f406d'
def original(name):
    return subprocess.check_output(['git', 'show', f'{BASE}:examples/planar-flyback-5w/{name}'], cwd=REPO)
before = {p['ref']: p for p in json.loads(original('circuit.json'))['parts']}
after = {p['ref']: p for p in json.loads((R/'circuit.json').read_text())['parts']}
assert set(before) == set(after)
assert before['T1']['nets'] == after['T1']['nets']
for ref in before.keys() - {'T1'}:
    assert before[ref] == after[ref], ('Electronic circuit/BOM changed', ref)
def snapshot(board):
    placements, pads, identities = {}, {}, {}
    for f in board.GetFootprints():
        ref = f.GetReference()
        placements[ref] = [f.GetPosition().x, f.GetPosition().y, f.GetOrientationDegrees(), f.GetLayer()]
        identities[ref] = [str(f.GetFPID().GetLibNickname()), str(f.GetFPID().GetLibItemName()), f.GetValue()]
        pads[ref] = sorted((p.GetNumber(), p.GetNetname(), p.GetPosition().x, p.GetPosition().y,
                            p.GetSize().x, p.GetSize().y, p.GetDrillSize().x, p.GetDrillSize().y)
                           for p in f.Pads())
    perimeter = []
    for d in board.GetDrawings():
        if d.GetLayer() != pcb.Edge_Cuts: continue
        start, end = d.GetStart(), d.GetEnd()
        # The eight exterior edges lie outside the central core region.
        if not any(pcb.ToMM(v.x) <= 77 or pcb.ToMM(v.x) >= 123 or
                   pcb.ToMM(v.y) <= 35 or pcb.ToMM(v.y) >= 135 for v in (start, end)): continue
        arc = d.GetArcMid() if d.GetShape() == pcb.SHAPE_T_ARC else start
        perimeter.append([int(d.GetShape()), start.x, start.y, end.x, end.y, arc.x, arc.y])
    assert len(perimeter) == 8
    return placements, pads, identities, sorted(perimeter), board.GetCopperLayerCount(), board.GetDesignSettings().GetBoardThickness()
temp_root = R/'.kicad-config'
temp_root.mkdir(exist_ok=True)
base_board_bytes = original('kicad/PS-FLYBACK-5W.kicad_pcb')
with tempfile.TemporaryDirectory(dir=temp_root, prefix='a1-comparison-') as temp:
    file = Path(temp)/'A1.kicad_pcb'
    file.write_bytes(base_board_bytes)
    old = snapshot(pcb.LoadBoard(str(file)))
new = snapshot(pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb')))
assert old[0] == new[0], 'Footprint centers/rotations changed'
assert old[3:] == new[3:], 'Exterior outline/layer count/thickness changed'
for ref in before.keys() - {'T1'}:
    assert old[1][ref] == new[1][ref], ('Non-transformer pad geometry/net changed', ref)
    assert old[2][ref] == new[2][ref], ('Non-transformer footprint/value changed', ref)
for ref in before:
    assert sorted(p[:2] for p in old[1][ref]) == sorted(p[:2] for p in new[1][ref]), ('Pad connectivity changed', ref)
result = {
    'baseline_commit': BASE,
    'baseline_board_SHA256': hashlib.sha256(base_board_bytes).hexdigest(),
    'unchanged_footprint_placements': len(new[0]),
    'unchanged_non_transformer_parts_and_pad_geometry': len(before)-1,
    'unchanged_all_pad_net_assignments': True,
    'unchanged_exterior_outline_segments_and_arcs': len(new[3]),
    'unchanged_board_size_mm': [50, 104],
    'unchanged_copper_layers': new[4],
    'unchanged_board_thickness_mm': pcb.ToMM(new[5]),
    'intentional_changes': ['T1 core, winding geometry, terminal positions, adjoining routes and core cutouts',
                            'T1 BOM identity, model, inductance, assembly instructions and qualification limits'],
    'scope': 'Digital baseline comparison; does not validate equivalent magnetic fault/thermal behavior.',
    'source_SHA256': {name: hashlib.sha256((R/name).read_bytes()).hexdigest()
                      for name in ['circuit.json', 'kicad/PS-FLYBACK-5W.kicad_pcb']},
}
(R/'evidence/audit/a2-baseline-comparison.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(f"A1/A2 comparison passed: {len(before)} placements and all pad nets unchanged; {len(before)-1} non-transformer parts unchanged.")
