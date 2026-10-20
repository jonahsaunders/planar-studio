"""Render the original A7 and current F.Cu at the repaired SW landing."""
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont
import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
BASE = '8dca6ed98bcd7ba8268f86910679d13682896f17'
SCALE = 180
X0, Y0 = 95.3, 70.0
SIZE = (630, 650)


def font(size):
    for candidate in ['C:/Windows/Fonts/segoeui.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


def xy(p):
    x, y = pcb.ToMM(p)
    return (x-X0)*SCALE, (y-Y0)*SCALE


def render(board):
    im = Image.new('RGB', SIZE, '#f6f7f9')
    draw = ImageDraw.Draw(im)
    t1 = next(f for f in board.GetFootprints() if f.GetReference() == 'T1')
    items = [g for g in t1.GraphicalItems() if isinstance(g, pcb.PCB_SHAPE) and g.GetLayer() == pcb.F_Cu]
    items += [t for t in board.GetTracks() if t.IsOnLayer(pcb.F_Cu)]
    items += list(t1.Pads())
    for item in items:
        polygon = pcb.SHAPE_POLY_SET()
        item.TransformShapeToPolygon(polygon, pcb.F_Cu, 0, pcb.FromMM(.0005), pcb.ERROR_INSIDE)
        for n in range(polygon.OutlineCount()):
            outline = polygon.COutline(n)
            draw.polygon([xy(outline.CPoint(i)) for i in range(outline.PointCount())], fill='#b32d36')
    for pad in t1.Pads():
        x, y = xy(pad.GetPosition())
        radius = pcb.ToMM(pad.GetDrillSize().x)/2*SCALE
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill='#232b38')
    x, y = xy(next(p for p in t1.Pads() if p.GetNumber() == '2').GetPosition())
    draw.text((x+68, y-32), 'SW / pad 2', fill='#172331', font=font(21))
    draw.text((420, 30), 'F.Cu only\nSame scale', fill='#38475a', font=font(20))
    return im


with tempfile.TemporaryDirectory() as temp:
    path = Path(temp)/'baseline.kicad_pcb'
    path.write_bytes(subprocess.check_output(['git', 'show', f'{BASE}:examples/planar-flyback-5w/kicad/PS-FLYBACK-5W.kicad_pcb'], cwd=ROOT))
    before = render(pcb.LoadBoard(str(path)))
current=pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
after = render(current)
t1=next(f for f in current.GetFootprints() if f.GetReference()=='T1')
pad=next(p for p in t1.Pads() if p.GetNumber()=='2')
winding=next(g for g in t1.GraphicalItems() if isinstance(g,pcb.PCB_SHAPE) and g.GetLayer()==pcb.F_Cu)
landing_gap=pcb.ToMM(winding.GetEffectiveShape().Distance(pad.GetPosition()))-pcb.ToMM(pad.GetSize().x)/2
out = Image.new('RGB', (1330, 830), 'white')
draw = ImageDraw.Draw(out)
draw.text((30, 20), 'SW landing: copper bridge removed', fill='#172331', font=font(30))
for x, panel, title, caption in [(25, before, 'A7 — original', '1.2 mm approach overlaps winding by about 0.075 mm'),
                                  (675, after, 'A10 — corrected', f'0.6 mm landing; about {landing_gap:.3f} mm pad-to-winding gap')]:
    draw.text((x, 72), title, fill='#172331', font=font(25))
    out.paste(panel, (x, 116))
    draw.text((x, 783), caption, fill='#38475a', font=font(18))
out.save(ROOT/'evidence/audit/sw-landing-before-after.png')
print('Saved A7/A10 native-copper comparison.')
