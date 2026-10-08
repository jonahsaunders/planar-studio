"""Draw actual PCB lands with corrected catalog pin centers; no simulated preview."""
import html
import json
from pathlib import Path
import pcbnew as pcb

R = Path(__file__).resolve().parents[1]
checks = {c['reference']: c for c in json.loads((R / 'evidence/audit/placement-checks.json').read_text())['checks']}
board = pcb.LoadBoard(str(R / 'kicad/PS-FLYBACK-5W.kicad_pcb'))
origin = board.GetDesignSettings().GetAuxOrigin()
ox, oy = pcb.ToMM(origin.x), pcb.ToMM(origin.y)
bounds = json.loads((R / 'layout.json').read_text())['board_bounds_mm']
assert [ox, oy] == [bounds[0], bounds[3]], 'Placement origin differs from lower-left board datum'
fps = {f.GetReference(): f for f in board.GetFootprints()}
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1190" viewBox="0 0 1200 1190">',
       '<rect width="1200" height="1190" fill="#f0f4f7"/><style>text{font-family:Arial,sans-serif;fill:#183247}.title{font-size:30px;font-weight:700}.head{font-size:21px;font-weight:700}.small{font-size:16px}.pin{font-size:13px;font-weight:700}</style>']


def text(x, y, label, cls='small'):
    svg.append(f'<text x="{x}" y="{y}" class="{cls}">{html.escape(label)}</text>')


text(30, 48, 'Flyback A4 | Placement and polarity check', 'title')
text(30, 80, 'Top-side view. Gold = actual PCB pads; green dots = corrected catalog pin centers.')
text(30, 106, 'Numbers identify PCB pads. Pin positions use the saved catalog geometry, not a live JLCPCB preview.')
cards = [
    ('U1', 'U1 · LT8302', 'Pin 1 at upper-left; CPL 270°.', 'Pin 1 = EN/UVLO; exposed pad = GND.'),
    ('D2', 'D2 · PowerDI5', 'Cathode below; two anodes above.', 'Catalog pins 1/2 → A; pin 3 → K.'),
    ('J1', 'J1 · Input connector', 'Wire openings toward top board edge.', 'Left + VIN_RAW; right − PGND.'),
    ('D1', 'D1 · Input protection', 'Cathode below → VIN.', 'Anode above → VIN_FUSED.'),
    ('D3', 'D3 · Clamp diode', 'Cathode above → CLAMP.', 'Anode below → SW.'),
    ('J2', 'J2 · Output connector', 'Wire openings toward bottom edge.', 'Left − GND_ISO; right + 5V_ISO.'),
    ('D4', 'D4 · TVS', 'Cathode above → CLAMP.', 'Anode below → VIN.'),
    ('C7', 'C7 · Input capacitor', '+ on left → VIN_DAMP.', '− on right → PGND.'),
    ('C3', 'C3 and C8 · Output capacitors', '+ on right → 5V_ISO.', '− on left → GND_ISO; same orientation.'),
]
for i, (ref, title, line1, line2) in enumerate(cards):
    left, top = 30+(i % 3)*390, 135+(i//3)*330
    svg.append(f'<rect x="{left}" y="{top}" width="370" height="312" rx="14" fill="white" stroke="#d2dde6"/>')
    text(left+18, top+34, title, 'head')
    f = fps[ref]; pads = [p for p in f.Pads() if p.GetNumber()]
    check = checks[ref]
    x0 = sum(pcb.ToMM(p.GetPosition().x)-ox for p in pads)/len(pads)
    y0 = sum(oy-pcb.ToMM(p.GetPosition().y) for p in pads)/len(pads)
    scale = 19; cx, cy = left+185, top+148
    for pad in pads:
        x, y = pcb.ToMM(pad.GetPosition().x)-ox, oy-pcb.ToMM(pad.GetPosition().y)
        px, py = cx+(x-x0)*scale, cy-(y-y0)*scale
        w, h = pcb.ToMM(pad.GetSize().x)*scale, pcb.ToMM(pad.GetSize().y)*scale
        svg.append(f'<rect x="{px-w/2:.2f}" y="{py-h/2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="2" fill="#e9c96d" stroke="#927220" transform="rotate({-pad.GetOrientationDegrees():.2f} {px:.2f} {py:.2f})"/>')
        # Labels sit beside the pad center, preserving the pin-center dots.
        text(px+8, py-9, pad.GetNumber(), 'pin')
    for pad in check['pads']:
        x, y = pad['catalog_center_mm']; px, py = cx+(x-x0)*scale, cy-(y-y0)*scale
        svg.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="4" fill="#087f69" stroke="white" stroke-width="1"/>')
    if ref == 'U1':
        p = next(p for p in check['pads'] if p['pcb_pad'] == '1')
        x, y = p['pcb_center_mm']; px, py = cx+(x-x0)*scale, cy-(y-y0)*scale
        svg.append(f'<path d="M{px-22:.2f} {py-18:.2f}h14" stroke="#143b83" stroke-width="4"/>')
        text(left+18, top+219, 'Blue mark: pin-1 corner on board.')
    if ref.startswith('J'):
        direction = -1 if ref == 'J1' else 1
        y1, y2 = cy+direction*29, cy+direction*65
        svg.append(f'<path d="M{cx} {y1}V{y2}m-6 {-direction*8}l6 {direction*8}l6 {-direction*8}" fill="none" stroke="#1466bc" stroke-width="3"/>')
    text(left+18, top+262, line1)
    text(left+18, top+289, line2)
text(30, 1150, 'Re-upload CPL-JLCPCB.csv and verify these orientations in the new JLCPCB assembly preview before fabrication.')
text(30, 1176, 'J1/J2 have unpolarized contacts. Their catalog contact numbers differ from PCB pad numbers; follow board +/− labels.')
svg.append('</svg>')
(R / 'manufacturing/placement-review.svg').write_text('\n'.join(svg)+'\n', encoding='utf8')
