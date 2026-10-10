"""Draw a source-derived route comparison, not a fabrication layer export."""
from pathlib import Path
import pcbnew as p,sys
R=Path(__file__).resolve().parents[1];old=Path(sys.argv[1])
def xy(v):return (v.x/1e6-60,v.y/1e6-60)
def polygon(poly):
    paths=[]
    def ring(chain):
        pts=[xy(chain.CPoint(j)) for j in range(chain.PointCount())]
        return 'M'+' L'.join(f'{x:.5f},{y:.5f}' for x,y in pts)+' Z'
    for i in range(poly.OutlineCount()):
        paths.append(ring(poly.COutline(i)))
        for j in range(poly.HoleCount(i)):paths.append(ring(poly.CHole(i,j)))
    return ' '.join(paths)
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="850" viewBox="0 0 1080 850">',
     '<rect width="1080" height="850" fill="#f5f7f4"/>',
     '<style>text{font-family:Arial,sans-serif;fill:#19362f}</style>',
     '<text x="35" y="40" font-size="26" font-weight="bold">Output reservoir to connector</text>',
     '<text x="35" y="69" font-size="16">Amber: VOUT on In4.Cu (L5). Teal: actual SGND fill on adjacent In5.Cu (L6).</text>']
for i,(root,title,length) in enumerate([(old,'Before / A7 hardware','60.90 mm'),(R,'After / A8 hardware','10.21 mm')]):
    b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'));left=35+i*535
    svg.extend([f'<text x="{left}" y="112" font-size="22" font-weight="bold">{title}</text>',
                f'<text x="{left}" y="139" font-size="17">C13 positive pad to J2 positive pin: {length}</text>',
                f'<svg x="{left}" y="160" width="500" height="635" viewBox="-10 1 28 35.56">',
                '<rect x="-10" y="1" width="28" height="35.56" fill="white"/>'])
    for z in b.Zones():
        if not z.GetIsRuleArea() and z.GetNetname()=='SGND' and z.GetLayer()==p.In5_Cu:
            svg.append(f'<path d="{polygon(z.GetFilledPolysList(p.In5_Cu))}" fill="#cae2d7" fill-rule="evenodd"/>')
    for t in b.GetTracks():
        if isinstance(t,p.PCB_VIA) or t.GetNetname()!='VOUT' or t.GetLayer()!=p.In4_Cu:continue
        a=xy(t.GetStart());c=xy(t.GetEnd())
        svg.append(f'<path d="M{a[0]},{a[1]} L{c[0]},{c[1]}" stroke="#d69929" stroke-width="{t.GetWidth()/1e6}" stroke-linecap="round" fill="none"/>')
    for t in b.GetTracks():
        if not isinstance(t,p.PCB_VIA) or t.GetNetname()!='VOUT':continue
        x,y=xy(t.GetPosition());svg.append(f'<circle cx="{x}" cy="{y}" r=".3" fill="#965917"/><circle cx="{x}" cy="{y}" r=".15" fill="white"/>')
    fs={f.GetReference():f for f in b.GetFootprints()}
    for ref in ['C13','C14','C15','C16','J2']:
        for pad in fs[ref].Pads():
            if pad.GetNumber() not in ['1','2']:continue
            x,y=xy(pad.GetPosition());net=pad.GetNetname();colour='#94571b' if net=='VOUT' else '#36795e'
            svg.append(f'<circle cx="{x}" cy="{y}" r=".45" fill="{colour}" stroke="white" stroke-width=".1"/>')
    for ref,x,y in [('C15',3.6,2.8),('C13',-.9,30.2),('C14',6.5,31.2),('C16',1.8,36.0),('J2 / OUT',-9.2,18.4),('T1 CT',11.5,15.8)]:
        svg.append(f'<text x="{x}" y="{y}" font-size=".85" font-weight="bold">{ref}</text>')
    svg.append('</svg>')
svg.append('<text x="35" y="827" font-size="15">Same scale; selected native copper only. Length is a track-centerline measurement, not extracted loop inductance.</text></svg>')
(R/'evidence/Output-route-comparison.svg').write_text('\n'.join(svg),encoding='utf8')
print('Native route comparison saved.')
