"""Audit schematic PDF text clearance; requires pypdfium2 and sexpdata."""
from pathlib import Path
import sys,json
import pypdfium2 as pdf
import sexpdata as sx
R=Path(__file__).resolve().parents[1]
page=pdf.PdfDocument(R/'Schematic.pdf')[0];tp=page.get_textpage();W,H=page.get_size()
def children(n,k):return [x for x in n if isinstance(x,list) and x and str(x[0])==k]
def first(n,k):return children(n,k)[0]
sch=sx.loads((R/'kicad/PS-GAN-60W.kicad_sch').read_text(encoding='utf8'))
wires=[]
for w in children(sch,'wire'):
 a,b=children(first(w,'pts'),'xy')
 wires.append(tuple(tuple(float(t)*72/25.4 for t in p[1:3]) for p in [a,b]))
chars=[]
for i in range(tp.count_chars()):
 t=tp.get_text_range(i,1)
 if not t.strip():continue
 x0,y0,x1,y1=tp.get_charbox(i)
 chars.append((t,(x0,H-y1,x1,H-y0),i))
wire_hits=[]
for t,(x0,y0,x1,y1),i in chars:
 for a,b in wires:
  # Actual glyph ink box, with a small clearance reserve (0.15 mm).
  m=.15*72/25.4
  if a[0]==b[0] and x0-m<a[0]<x1+m and max(y0-m,min(a[1],b[1]))<min(y1+m,max(a[1],b[1])) or a[1]==b[1] and y0-m<a[1]<y1+m and max(x0-m,min(a[0],b[0]))<min(x1+m,max(a[0],b[0])):
   wire_hits.append({'text':tp.get_text_range(max(0,i-8),17).replace('\r','').replace('\n',' '),'at_mm':[round(x0*25.4/72,1),round(y0*25.4/72,1)]});break
report={'result':'pass' if not wire_hits else 'fail','method':'Rendered PDF glyph ink boxes checked against native orthogonal schematic wire segments. Text-to-text spacing is reviewed visually.','clearance_reserve_mm':0.15,'text_wire_hits':wire_hits}
(R/'evidence/readability-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert not wire_hits,wire_hits
