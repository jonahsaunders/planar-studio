"""Render A9/A10 native front-winding copper at the closest turn pair."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import pcbnew as pcb
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
BASE='3b78238ea610fda599e0ad74c3479fc5de1ed315'
spec=importlib.util.spec_from_file_location('integrity',Path(__file__).with_name('verify-winding-integrity.py'))
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=ROOT)
def font(size):
    for p in ['C:/Windows/Fonts/segoeui.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(p).exists():return ImageFont.truetype(p,size)
    return ImageFont.load_default(size=size)
with tempfile.TemporaryDirectory() as temp:
    path=Path(temp)/'A9.kicad_pcb';path.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
    before=pcb.LoadBoard(str(path))
after=pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
reports=[check.inspect(before,json.loads(old('planar-studio/T1-artwork.json'))),
         check.inspect(after,json.loads((ROOT/'planar-studio/T1-artwork.json').read_text()))]
image=Image.new('RGB',(1320,770),'#f3f6fa');d=ImageDraw.Draw(image)
d.text((35,24),'Winding turn spacing: A9 to A10',font=font(35),fill='#182b3e')
d.text((35,76),'Actual saved-board copper, shown at the same scale. A10 acceptance threshold: 0.260 mm.',font=font(23),fill='#48576a')
for index,(board,report,label,color) in enumerate(zip([before,after],reports,['A9: 0.25 mm nominal spacing','A10: 0.30 mm nominal spacing'],['#b75825','#27856d'])):
    x=35+index*650;y=142
    d.text((x,y),label,font=font(25),fill='#182b3e')
    bx=x;by=y+55;width=600;height=480
    d.rectangle((bx,by,bx+width,by+height),fill='#101c2b')
    def project(p):return bx+(p[0]-104.3)*300,by+(p[1]-73.2)*300
    t1=next(f for f in board.GetFootprints() if f.GetReference()=='T1')
    g=next(g for g in t1.GraphicalItems() if isinstance(g,pcb.PCB_SHAPE) and g.GetLayer()==pcb.F_Cu)
    poly=pcb.SHAPE_POLY_SET(g.GetPolyShape())
    poly.BooleanIntersection(check.polygon([(104.3,73.2),(106.3,73.2),(106.3,74.8),(104.3,74.8)]))
    for ring in check.rings(poly):d.polygon([project(p) for p in ring],fill=color)
    record=report['layers']['F.Cu'];a,b=map(project,record['gap_endpoints_mm'])
    d.line((a,b),fill='white',width=3)
    for p in [a,b]:d.line((p[0]-10,p[1],p[0]+10,p[1]),fill='white',width=3)
    cy=(a[1]+b[1])/2
    d.line((a[0]+15,cy,bx+width-20,cy),fill='#f7d47b',width=2)
    text=f"{record['saved_polygon_gap_at_tightest_pair_mm']:.3f} mm"
    d.rounded_rectangle((bx+width-185,cy-47,bx+width-12,cy-12),radius=5,fill='#101c2b')
    d.text((bx+width-175,cy-47),text,font=font(26),fill='#f7d47b')
    d.text((x,by+495),'F.Cu example; all four winding layers checked.',font=font(19),fill='#48576a')
d.text((35,731),'A10 retains 0.6 mm conductor width and 4:2 turns. See COMMON-ISSUES.md for recorded defects and checks.',font=font(21),fill='#182b3e')
image.save(ROOT/'evidence/audit/turn-spacing-before-after.png')
print('Saved A9/A10 native turn-spacing comparison.')
