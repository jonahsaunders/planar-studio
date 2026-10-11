"""Draw native copper, mask and paste separately; no illustrative pad geometry."""
from pathlib import Path
import pcbnew as p,html
R=Path(__file__).resolve().parents[1];b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
fs={f.GetReference():f for f in b.GetFootprints()}
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660" viewBox="0 0 1200 660"><rect width="1200" height="660" fill="#fff"/><style>text{font-family:Arial;fill:#20362f}.t{font-size:23px;font-weight:bold}.h{font-size:17px;font-weight:bold}.n{font-size:13px}</style><text x="28" y="35" class="t">A12 repaired manufacturing geometry</text>']
def draw(refs,layer,box,ox,oy,width,height,color):
    x0,y0,x1,y1=box;scale=min(width/(x1-x0),height/(y1-y0))
    for ref in refs:
        for q in fs[ref].Pads():
            if not q.IsOnLayer(layer):continue
            z=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(z,layer,0,p.FromMM(.001),p.ERROR_OUTSIDE)
            for i in range(z.OutlineCount()):
                c=z.Outline(i);pts=[(ox+(c.CPoint(j).x/1e6-x0)*scale,oy+(c.CPoint(j).y/1e6-y0)*scale) for j in range(c.PointCount())]
                s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)+f'" fill="{color}" stroke="#36594c" stroke-width=".6"/>')
for i,(l,title,color) in enumerate([(p.F_Cu,'U1 · copper lands','#dbb276'),(p.F_Mask,'U1 · mask openings','#8cb49b'),(p.F_Paste,'U1 · stencil apertures','#94b7d3')]):
    ox=28+296*i;s.append(f'<text x="{ox}" y="78" class="h">{title}</text>');draw(['U1'],l,(101.45,69.575,106.55,75.725),ox,100,260,330,color)
s+=['<text x="932" y="78" class="h">U5 / C26 · lands</text>']
draw(['U5','C26'],p.F_Cu,(93.4,82.4,101.4,87),920,135,260,260,'#8cb49b')
for i,t in enumerate(['Separate copper, solder mask and paste; actual native polygons shown at enlarged scales.', 'U1 power-land paste: 75.08–75.52% of mask openings. Small differences include rounded corners and polygon conversion.', 'U1 origin is package-centered. U5 uses TI DBV0005A lands; its C26 bypass is physically separated.', 'Supplier review remains required for the 0.125 mm stencil example, mask registration, cap planarity and X-ray criteria.']):
    s.append(f'<text x="28" y="{485+34*i}" class="n">{html.escape(t)}</text>')
s.append('</svg>');(R/'evidence/Manufacturing-findings.svg').write_text(''.join(s),encoding='utf8')
