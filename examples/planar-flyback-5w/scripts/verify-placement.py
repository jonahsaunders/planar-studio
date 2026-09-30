"""Check exported catalog pads against actual PCB pads/nets. KiCad Python."""
import copy
import csv
import json
import math
from pathlib import Path
import pcbnew as pcb

R = Path(__file__).resolve().parents[1]
parts = {p['ref']: p for p in json.loads((R / 'circuit.json').read_text())['parts']
         if p['ref'] != 'T1' and not p.get('exclude_from_bom')}
library = json.loads((R / 'sources/placement-library.json').read_text())['parts']
board = pcb.LoadBoard(str(R / 'kicad/PS-FLYBACK-5W.kicad_pcb'))
footprints = {f.GetReference(): f for f in board.GetFootprints()}
raw = list(csv.DictReader((R / 'manufacturing/KiCad-positions.csv').open(encoding='utf-8-sig')))
cpl = list(csv.DictReader((R / 'manufacturing/CPL-JLCPCB.csv').open(encoding='utf-8-sig')))


def transform(x, y, angle):
    """Local X-right/Y-down to board X-right/Y-up."""
    a = math.radians(angle)
    return x * math.cos(a) + y * math.sin(a), x * math.sin(a) - y * math.cos(a)


def close(a, b):
    return abs(a-b) < 0.00001


def validate(rows):
    assert len(rows) == len(parts) and {r['Designator'] for r in rows} == set(parts), 'Reference mismatch'
    checks = []
    for row in rows:
        ref = row['Designator']; part = parts[ref]; fp = footprints[ref]
        entry = library[part['lcsc']]
        assert entry['mpn'] == part['mpn'] and entry['footprint'] == part['footprint'], ref
        assert ref in entry['references'] and row['Layer'] == 'T', ref
        x, y, angle = (float(row[k]) for k in ['Mid X', 'Mid Y', 'Rotation'])
        assert 0 <= angle < 360, ref
        origin = fp.GetPosition(); rotation = fp.GetOrientationDegrees() % 360
        dx, dy = transform(*entry['origin_in_footprint_mm'], rotation)
        assert close(x, pcb.ToMM(origin.x)-75+dx) and close(y, 137-pcb.ToMM(origin.y)+dy), f'{ref}: origin'
        assert close(angle, (rotation+entry['rotation_offset_deg']) % 360), f'{ref}: orientation'
        raw_row = next(r for r in raw if r['Ref'] == ref)
        assert close(float(raw_row['PosX']), pcb.ToMM(origin.x)-75), f'{ref}: stale raw X'
        assert close(float(raw_row['PosY']), 137-pcb.ToMM(origin.y)), f'{ref}: stale raw Y'
        assert close(float(raw_row['Rot']) % 360, rotation), f'{ref}: stale raw rotation'
        pads = [p for p in fp.Pads() if p.GetNumber()]
        pad_results = []
        for land in entry['catalog_pads']:
            number = entry['catalog_to_pcb_pad'][land['number']]
            u, v = transform(*land['xy_mm'], angle)
            catalog_x, catalog_y = x+u, y+v
            candidates = [p for p in pads if p.GetNumber() == number]
            target = min(candidates, key=lambda p: math.hypot(catalog_x-(pcb.ToMM(p.GetPosition().x)-75), catalog_y-(137-pcb.ToMM(p.GetPosition().y))))
            tx, ty = pcb.ToMM(target.GetPosition().x)-75, 137-pcb.ToMM(target.GetPosition().y)
            # Invert each actual PCB pad orientation. Different recommended
            # land lengths are allowed, but the catalog center must lie inside
            # its intended copper pad (0.05 mm coordinate/land-pattern allowance).
            a = math.radians(target.GetOrientationDegrees())
            local_x = (catalog_x-tx)*math.cos(a)+(catalog_y-ty)*math.sin(a)
            local_y = (catalog_x-tx)*math.sin(a)-(catalog_y-ty)*math.cos(a)
            size = target.GetSize()
            assert abs(local_x) <= pcb.ToMM(size.x)/2+0.05, f'{ref}: catalog pin {land["number"]} misses PCB pad {number} X'
            assert abs(local_y) <= pcb.ToMM(size.y)/2+0.05, f'{ref}: catalog pin {land["number"]} misses PCB pad {number} Y'
            assert target.GetNetname().lstrip('/') == part['nets'][number], f'{ref}: net mismatch'
            pad_results.append({'catalog_pin': land['number'], 'pcb_pad': number, 'net': target.GetNetname(),
                                'catalog_center_mm': [round(catalog_x, 6), round(catalog_y, 6)],
                                'pcb_center_mm': [round(tx, 6), round(ty, 6)]})
        checks.append({'reference': ref, 'lcsc': part['lcsc'], 'x_mm': x, 'y_mm': y, 'rotation_deg': angle, 'pads': pad_results})
    return checks


checks = validate(cpl)
# A legacy export, reversed polarized component, misplaced connector, or stale
# origin must fail. These mutations exercise the actual exported-file checker.
mutations = []
for ref, field, delta in [('U1', 'Rotation', 90), ('D1', 'Rotation', 180), ('D2', 'Rotation', 180),
                          ('D3', 'Rotation', 180), ('D4', 'Rotation', 180), ('C3', 'Rotation', 180),
                          ('C7', 'Rotation', 180), ('C8', 'Rotation', 180), ('J1', 'Rotation', 180),
                          ('J2', 'Rotation', 180), ('D1', 'Mid Y', -0.3375), ('D3', 'Mid Y', 0.3375),
                          ('D2', 'Mid Y', -0.9), ('J1', 'Mid Y', -0.2), ('J2', 'Mid Y', 0.2)]:
    changed = copy.deepcopy(cpl)
    row = next(r for r in changed if r['Designator'] == ref)
    row[field] = str((float(row[field])+delta) % 360 if field == 'Rotation' else float(row[field])+delta)
    try:
        validate(changed)
    except AssertionError:
        mutations.append(f'{ref}: wrong {field} rejected')
    else:
        raise AssertionError(f'{ref}: invalid {field} accepted')
out = {'status': 'PASS: saved catalog geometry and PCB net/pad mapping; live factory preview remains unverified',
       'placements': len(checks), 'catalog_parts': len(library), 'catalog_pads_checked': sum(len(c['pads']) for c in checks),
       'regressions_rejected': mutations, 'checks': checks}
(R / 'evidence/audit/placement-checks.json').write_text(json.dumps(out, indent=2)+'\n', encoding='utf8')
print(json.dumps({k: v for k, v in out.items() if k != 'checks'}, indent=2))
