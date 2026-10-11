"""Render actual native copper around the lower-left feedback banks."""
from pathlib import Path
import pcbnew as p,sys,html
R=Path(__file__).resolve().parents[1];old=Path(sys.argv[1])
def xy(v):return v.x/1e6,v.y/1e6
def polygon(q,layer):
 poly=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(poly,layer,0,p.FromMM(.005),p.ERROR_OUTSIDE)
 def chain(c):return 'M'+' L'.join(f'{x:.5f},{y:.5f}' for x,y in (xy(c.CPoint(i)) for i in range(c.PointCount())))+' Z'
 return ' '.join(chain(poly.Outline(i))+' '+' '.join(chain(poly.Hole(i,j)) for j in range(poly.HoleCount(i))) for i in range(poly.OutlineCount()))
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="990" viewBox="0 0 1600 990"><rect width="1600" height="990" fill="#f5f6f2"/><style>text{font-family:Arial;fill:#19362f}</style>']
for col,(root,title) in enumerate([(old,'A12 · Before'),(R,'A13 · Direct connections')]):
 b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'))
 left=col*800
 s.append(f'<text x="{left+42}" y="48" font-size="26" font-weight="bold">{title}</text>')
 s.append(f'<svg x="{left+32}" y="76" width="736" height="846" viewBox="63.5 89.5 18 20.7"><rect x="63.5" y="89.5" width="18" height="20.7" fill="white"/>')
 # Internal routes are dashed centerlines so layer changes are explicit.
 for t in b.GetTracks():
  if isinstance(t,p.PCB_VIA) or t.GetLayer()==p.F_Cu:continue
  x,y=xy(t.GetStart());X,Y=xy(t.GetEnd())
  if max(y,Y)<89.5 or min(x,X)>81.5:continue
  color='#8d9b9a' if t.GetNetname() in ['VOUT','SGND'] else '#3b72a5'
  s.append(f'<path d="M{x},{y} L{X},{Y}" stroke="{color}" stroke-width="{min(.25,t.GetWidth()/1e6)}" stroke-dasharray=".22 .13" fill="none"/>')
 for t in b.GetTracks():
  if isinstance(t,p.PCB_VIA):continue
  if t.GetLayer()==p.F_Cu:s.append(f'<path d="{polygon(t,p.F_Cu)}" fill="#c33442"/>')
 for f in b.GetFootprints():
  for q in f.Pads():
   if q.IsOnLayer(p.F_Cu):s.append(f'<path d="{polygon(q,p.F_Cu)}" fill="#c33442" fill-rule="evenodd"/>')
 for t in b.GetTracks():
  if not isinstance(t,p.PCB_VIA):continue
  x,y=xy(t.GetPosition());s.append(f'<circle cx="{x}" cy="{y}" r=".3" fill="#9b5361"/><circle cx="{x}" cy="{y}" r=".15" fill="white"/>')
 refs=['R'+str(i) for i in range(20,29)]+['C27','C28','C29','U6','U7','U8','U9']
 for f in b.GetFootprints():
  if f.GetReference() not in refs:continue
  x,y=xy(f.GetPosition());label=html.escape(f.GetReference())
  s.append(f'<rect x="{x-.52}" y="{y-.25}" width="1.04" height=".5" rx=".08" fill="white"/><text x="{x}" y="{y+.13}" text-anchor="middle" font-size=".37">{label}</text>')
 s.append('</svg>')
s.append('<text x="42" y="961" font-size="19">Actual native geometry · red: top copper · dashed: internal tracks · white centers: drilled vias</text></svg>')
(R/'evidence/Feedback-routing-before-after.svg').write_text('\n'.join(s),encoding='utf8')
