"""Check actual copper near T1 independently of KiCad's net-tie exemption.

Run with KiCad Python. Intentional contacts are allowed only near the terminal
that belongs to that winding layer and net. All other routed copper, vias,
plated pads and filled zones must respect the board's 0.20 mm clearance.
"""
import argparse
import hashlib
import json
from pathlib import Path

import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
LAYERS = {'F.Cu': {'1', '5'}, 'B.Cu': {'2', '5'},
          'In1.Cu': {'3', '4'}, 'In4.Cu': {'3', '4'}}
MIN_CLEARANCE_MM = .20
POLYGON_ERROR_MM = .0005
CONTACT_RADIUS_MM = .8


def circle(center, radius):
    shape = pcb.PCB_SHAPE()
    shape.SetShape(pcb.SHAPE_T_CIRCLE)
    shape.SetCenter(center)
    shape.SetEnd(pcb.VECTOR2I(center.x + pcb.FromMM(radius), center.y))
    shape.SetFilled(True)
    shape.SetWidth(0)
    result = pcb.SHAPE_POLY_SET()
    shape.TransformShapeToPolygon(result, pcb.F_Cu, 0,
                                  pcb.FromMM(POLYGON_ERROR_MM), pcb.ERROR_INSIDE)
    return result


def inspect(board):
    transformer = next(f for f in board.GetFootprints() if f.GetReference() == 'T1')
    pads = {p.GetNumber(): p for p in transformer.Pads()}
    windings = {g.GetLayerName(): g for g in transformer.GraphicalItems()
                if isinstance(g, pcb.PCB_SHAPE) and g.GetLayerName() in LAYERS}
    assert set(windings) == set(LAYERS)
    items = [(t, 'via' if isinstance(t, pcb.PCB_VIA) else 'track')
             for t in board.GetTracks()]
    items += [(p, f'{f.GetReference()}.{p.GetNumber()}')
              for f in board.GetFootprints() for p in f.Pads()
              if p.GetAttribute() != pcb.PAD_ATTRIB_NPTH]
    items += [(z, 'zone') for z in board.Zones()]
    violations = []
    checks = 0
    for layer_name, winding in windings.items():
        layer = winding.GetLayer()
        guarded = pcb.SHAPE_POLY_SET(winding.GetPolyShape())
        guarded.Inflate(pcb.FromMM(MIN_CLEARANCE_MM + 2 * POLYGON_ERROR_MM),
                        pcb.CORNER_STRATEGY_ROUND_ALL_CORNERS,
                        pcb.FromMM(POLYGON_ERROR_MM))
        for item, description in items:
            if not item.IsOnLayer(layer):
                continue
            if isinstance(item, pcb.ZONE):
                copper = pcb.SHAPE_POLY_SET(item.GetFilledPolysList(layer))
            else:
                copper = pcb.SHAPE_POLY_SET()
                item.TransformShapeToPolygon(copper, layer, 0,
                                             pcb.FromMM(POLYGON_ERROR_MM), pcb.ERROR_OUTSIDE)
            checks += 1
            copper.BooleanIntersection(guarded)
            if copper.OutlineCount() == 0:
                continue
            # A net tie allows the entire primary electrically. This explicit
            # per-layer terminal map does not permit SW to contact F.Cu winding.
            for number in LAYERS[layer_name]:
                pad = pads[number]
                if item.GetNetname() == pad.GetNetname():
                    copper.BooleanSubtract(circle(pad.GetPosition(), CONTACT_RADIUS_MM))
            if copper.Area() > 0:
                violations.append({'layer': layer_name, 'item': description,
                                   'net': item.GetNetname(),
                                   'position_mm': list(pcb.ToMM(item.GetPosition())),
                                   'uuid': item.m_Uuid.AsString()})
    return {'checked_item_layers': checks, 'violations': violations}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--board', type=Path, default=ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb')
    parser.add_argument('--output', type=Path, default=ROOT/'evidence/audit/winding-clearance-checks.json')
    args = parser.parse_args()
    board = pcb.LoadBoard(str(args.board))
    report = inspect(board)
    report.update({'revision': board.GetTitleBlock().GetRevision(),
                   'status': 'FAIL' if report['violations'] else 'PASS',
                   'minimum_clearance_mm': MIN_CLEARANCE_MM,
                   'polygon_error_mm': POLYGON_ERROR_MM,
                   'allowed_contact_radius_mm': CONTACT_RADIUS_MM,
                   'allowed_terminal_numbers_by_layer': {k: sorted(v) for k, v in LAYERS.items()},
                   'board_sha256': hashlib.sha256(args.board.read_bytes()).hexdigest(),
                   'scope': 'Final-board copper clearance to the four winding polygons, with local terminal contacts only; independent of net-tie DRC permissions. Not a magnetic or thermal qualification.'})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(json.dumps(report, indent=2))
    if report['violations']:
        raise SystemExit('Unintended winding contact or insufficient clearance')


if __name__ == '__main__':
    main()
