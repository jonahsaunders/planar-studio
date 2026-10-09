"""Check standard legend dimensions and optional non-silkscreen revision parity.

Run with KiCad Python. --baseline-board establishes that only silkscreen changed;
native DRC independently checks clipping/clearance with the tightened rules.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import pcbnew as pcb

R = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--baseline-board', type=Path)
p.add_argument('--baseline-id')
a = p.parse_args()
path = R/'kicad/PS-FLYBACK-5W.kicad_pcb'
board = pcb.LoadBoard(str(path))
silk = (pcb.F_SilkS, pcb.B_SilkS)
items = list(board.GetDrawings())
for f in board.GetFootprints():
    items += list(f.GraphicalItems()) + list(f.GetFields())
texts = []
strokes = []
for item in items:
    if item.GetLayer() not in silk:
        continue
    if isinstance(item, pcb.PCB_TEXT) and item.IsVisible():
        size = item.GetTextSize()
        h = min(pcb.ToMM(size.x), pcb.ToMM(size.y))
        w = pcb.ToMM(item.GetTextThickness())
        assert h >= 1.0-1e-6 and w >= .15-1e-6, (item.GetText(), h, w)
        texts.append({'text': item.GetText(), 'layer': item.GetLayerName(),
                      'height_mm': h, 'stroke_mm': w})
    elif isinstance(item, pcb.PCB_SHAPE) and item.GetWidth() > 0:
        w = pcb.ToMM(item.GetWidth())
        assert w >= .15-1e-6, ('silkscreen graphic stroke', w)
        strokes.append(w)
rules = json.loads((R/'kicad/PS-FLYBACK-5W.kicad_pro').read_text())['board']['design_settings']['rules']
for key, limit in {'min_text_height': 1.0, 'min_text_thickness': .15, 'min_silk_clearance': .15}.items():
    assert rules[key] >= limit, (key, rules[key])
drc = json.loads((R/'evidence/board-drc.json').read_text())
assert not drc['violations'] and not drc['unconnected_items'] and not drc['schematic_parity']


def parse(source):
    stack = []; root = []
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', source):
        if token == '(':
            node = []
            (stack[-1] if stack else root).append(node)
            stack.append(node)
        elif token == ')':
            stack.pop()
        else:
            stack[-1].append(token)
    assert not stack
    return root[0]


def non_silk(node):
    # Ignore only artwork on the two legend layers. Copper, mask, paste,
    # drills, outline, models, placement, nets and stack remain exact.
    layer = next((x for x in node if isinstance(x, list) and x[0] == 'layer'), None)
    if layer and layer[1] in ('"F.SilkS"', '"B.SilkS"'):
        if node[0] == 'property':
            return node[:3]  # Preserve reference/value/MPN identities.
        return None
    return [value for x in node if (value := non_silk(x) if isinstance(x, list) else x) is not None]


record = {'text_count': len(texts), 'graphic_stroke_count': len(strokes),
          'minimum_text_height_mm': min(t['height_mm'] for t in texts),
          'minimum_text_stroke_mm': min(t['stroke_mm'] for t in texts),
          'minimum_graphic_stroke_mm': min(strokes),
          'silkscreen_clearance_rule_mm': rules['min_silk_clearance'],
          'native_DRC_violations': 0, 'unconnected_items': 0, 'schematic_parity_issues': 0,
          'texts': texts, 'source': 'https://jlcpcb.com/capabilities/pcb-capabilities/',
          'scope': 'CAD legend/clearance verification, not factory process or hardware qualification.'}
if a.baseline_board:
    assert a.baseline_id, '--baseline-id is required'
    assert non_silk(parse(path.read_text())) == non_silk(parse(a.baseline_board.read_text())), 'Non-silkscreen board content changed'
    record.update(baseline_id=a.baseline_id,
                  baseline_board_SHA256=hashlib.sha256(a.baseline_board.read_bytes()).hexdigest(),
                  all_non_silkscreen_board_content_identical=True)
inputs = ['kicad/PS-FLYBACK-5W.kicad_pcb', 'kicad/PS-FLYBACK-5W.kicad_pro',
          'evidence/board-drc.json', 'scripts/verify-silkscreen.py']
record['source_SHA256'] = {f: hashlib.sha256((R/f).read_bytes()).hexdigest() for f in inputs}
(R/'evidence/audit/silkscreen-checks.json').write_text(json.dumps(record, indent=2)+'\n')
print(f"{len(texts)} legend texts and {len(strokes)} strokes pass; native DRC clean.")
