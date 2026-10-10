"""Export native pad positions for supplier placement verification, not P&P input."""
from pathlib import Path
import pcbnew as p,json,csv,html
R=Path(__file__).resolve().parents[1];b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
parts={x['ref']:x for x in json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts'] if x['lcsc']}
origin=b.GetDesignSettings().GetAuxOrigin();rows=[]
fps={f.GetReference():f for f in b.GetFootprints()}
for ref in sorted(parts):
    f=fps[ref]
    for q in f.Pads():
        if not q.GetNumber():continue
        pos=q.GetPosition()
        rows.append({'Designator':ref,'MPN':parts[ref]['mpn'],'LCSC':parts[ref]['lcsc'],'Pad':q.GetNumber(),'Net':q.GetNetname(),'Pad_X_mm':round((pos.x-origin.x)/1e6,6),'Pad_Y_mm':round((origin.y-pos.y)/1e6,6),'Footprint_anchor_X_mm':round((f.GetPosition().x-origin.x)/1e6,6),'Footprint_anchor_Y_mm':round((origin.y-f.GetPosition().y)/1e6,6),'Native_footprint_rotation_deg':f.GetOrientationDegrees(),'Process':'THT' if q.GetAttribute()==p.PAD_ATTRIB_PTH else 'SMT','Use':'Inspection reference only; not a placement file'})
with (R/'manufacturing-prototype/Assembly-pad-map.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
assert len({x['Designator'] for x in rows})==75
# Draw source copper directly from KiCad, showing issues that electrical DRC misses.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="550" viewBox="0 0 1120 550"><rect width="1120" height="550" fill="#fff"/><style>text{font-family:Arial,sans-serif;fill:#20362f} .t{font-size:23px;font-weight:bold}.s{font-size:15px}.p{font-size:11px}</style>', '<text x="28" y="34" class="t">Actual A8 solder-land geometry — unresolved manufacturing findings</text>']
def panel(refs,box,offset,title,notes):
    x0,y0,x1,y1=box;ox,oy=offset;scale=min(490/(x1-x0),340/(y1-y0))
    svg.append(f'<text x="{ox}" y="{oy}" class="t">{title}</text>')
    for ref in refs:
        f=fps[ref]
        for q in f.Pads():
            poly=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(poly,p.F_Cu,0,p.FromMM(.001),p.ERROR_OUTSIDE)
            color='#acc9eb' if ref=='C26' else '#e9bf79' if ref=='U1' and q.GetNumber() in ['1','2','10','11'] else '#a8c3b4'
            for i in range(poly.OutlineCount()):
                c=poly.Outline(i);coords=[(ox+(c.CPoint(j).x/1e6-x0)*scale,oy+20+(c.CPoint(j).y/1e6-y0)*scale) for j in range(c.PointCount())]
                svg.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+f'" fill="{color}" fill-opacity=".65" stroke="#406758" stroke-width="1"/>')
            v=q.GetPosition();x=ox+(v.x/1e6-x0)*scale;y=oy+20+(v.y/1e6-y0)*scale
            label=q.GetNumber() if ref=='U1' else ref+'.'+q.GetNumber()
            svg.append(f'<text x="{x:.2f}" y="{y+3:.2f}" class="p" text-anchor="middle">{html.escape(label)}</text>')
    for i,n in enumerate(notes):svg.append(f'<text x="{ox}" y="{oy+393+i*21}" class="s">{html.escape(n)}</text>')
panel(['U5','C26'],(94.8,81.8,101.0,85.7),(28,78),'U5 / C26: same-net land overlap',['U5.5 and C26.1 overlap on V5.','Their separate placements need distinct solder lands.'])
panel(['U1'],(101.1,69.0,107.0,76.0),(588,78),'U1: mask spacing and paste',['Two adjacent pad pairs have about 0.194 mm gaps.','Power/thermal lands have full-area paste openings.'])
svg.append('<text x="28" y="528" class="s">Copper polygons from native KiCad; no component body or solder-process tolerance is implied.</text></svg>')
(R/'evidence/Manufacturing-findings.svg').write_text(''.join(svg),encoding='utf8')
print(f'{len(rows)} pad anchors, all 75 components; manufacturing findings drawing generated.')
