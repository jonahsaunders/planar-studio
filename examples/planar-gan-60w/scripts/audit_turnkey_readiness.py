"""Native JLC fabrication/assembly screen. This cannot grant factory acceptance.

Run after export_review and the geometry/pour audits, with KiCad Python and a
Shapely site-packages directory as the first argument. No network or ordering.
"""
from pathlib import Path
import sys,json,csv,hashlib,collections
if len(sys.argv)>1:sys.path.append(sys.argv[1])
import pcbnew as p
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[1];E=R/'evidence';M=R/'manufacturing-prototype'
pcb=R/'kicad/PS-GAN-60W.kicad_pcb';b=p.LoadBoard(str(pcb))
parts={x['ref']:x for x in json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts'] if x['lcsc']}
fps={f.GetReference():f for f in b.GetFootprints()}
def poly(s):
    def ring(c):return [(c.CPoint(i).x/1e6,c.CPoint(i).y/1e6) for i in range(c.PointCount())]
    return unary_union([Polygon(ring(s.Outline(i)),[ring(s.Hole(i,j)) for j in range(s.HoleCount(i))]) for i in range(s.OutlineCount())])
def shape(q,l):
    s=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(s,l,0,p.FromMM(.001),p.ERROR_OUTSIDE);return poly(s)
checks=[]
def check(name,ok,measured,requirement):
    checks.append(dict(check=name,passed=bool(ok),measured=measured,requirement=requirement))
check('All purchased placements on top',all(fps[r].GetLayer()==p.F_Cu for r in parts),len(parts),'75 top-side placements')
tht=[r for r in parts if any(q.GetAttribute()==p.PAD_ATTRIB_PTH for q in fps[r].Pads())]
check('Mixed assembly identity',set(tht)=={'J1','J2'},tht,'73 SMT components and J1/J2 insertion headers; Standard PCBA')
check('Copper layers',b.GetCopperLayerCount()==8,b.GetCopperLayerCount(),'8, requiring Standard PCBA')
tracks=[t for t in b.GetTracks() if not isinstance(t,p.PCB_VIA)]
minimum=min(t.GetWidth()/1e6 for t in tracks)
check('Routed width margin',minimum>=.1999,minimum,'0.20 mm design minimum; JLC 2 oz published minimum 0.16 mm')
# Connector annuli use the PTH rule. Filled/capped T1 interconnects are vias by
# manufacturing function even though the native artwork represents them as pads.
annuli=[]
for r in tht:
    for q in fps[r].Pads():
        d=q.GetDrillSize().x/1e6;ring=(min(q.GetSize().x,q.GetSize().y)/1e6-d)/2
        annuli.append(dict(pad=f'{r}.{q.GetNumber()}',drill_mm=d,annular_ring_mm=ring))
check('2 oz connector annuli',all(x['annular_ring_mm']>=.254 for x in annuli),annuli,'At least 0.254 mm nominal ring for insertion PTH')
g=json.loads((E/'manufacturing-geometry.json').read_text(encoding='utf8'))
for key in ['hole_gap_under_0p2_mm','different_component_copper_overlaps','courtyard_does_not_enclose_copper_pads','foreign_mask_gaps_under_0p2_mm','internal_via_hole_clearance_under_0p2_mm','silkscreen_below_1mm_height_or_0p15mm_stroke']:
    check(key,not g[key],g[key],'No findings in the native geometry screen')
gap=g['smallest_mask_opening_to_foreign_top_track_mm'][0][0]
check('Mask opening to foreign trace',gap>=.09,round(gap,4),'JLC minimum 0.09 mm')
# Separate U1 mask/paste objects are intentionally unnamed. Inspect actual
# apertures, including each disconnected polygon, not a footprint bounding box.
apertures=[];stencil=.125
for r in sorted(parts):
    for q in fps[r].Pads():
        if not q.IsOnLayer(p.F_Paste):continue
        s=shape(q,p.F_Cu);m=q.GetSolderPasteMargin(p.F_Paste)
        # Current supplied apertures have no paste offsets; reject silently
        # treating an anisotropic aperture as the copper shape in future edits.
        assert m.x==0 and m.y==0,(r,'Add exact native paste-margin handling')
        for a in ([s] if s.geom_type=='Polygon' else s.geoms):
            if a.area<=0:continue
            apertures.append(dict(ref=r,pad=q.GetNumber() or 'separate aperture',area_mm2=round(a.area,6),perimeter_mm=round(a.length,6),area_ratio=round(a.area/(a.length*stencil),4)))
lowest=sorted(apertures,key=lambda x:x['area_ratio'])[:12]
# 0.66 is an engineering transfer screen, not a JLC acceptance guarantee.
stencil_holds=[x for x in apertures if x['area_ratio']<.66]
check('Stencil area-ratio screen',not stencil_holds,lowest,'At 0.125 mm stencil, area/(wall perimeter x thickness) >= 0.66; supplier still approves transfer')
with (M/'Stencil-aperture-screen.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=apertures[0]);w.writeheader();w.writerows(apertures)
cpl=list(csv.DictReader((M/'CPL-JLCPCB-review.csv').open(encoding='utf-8-sig')))
bom=list(csv.DictReader((M/'BOM-JLCPCB.csv').open(encoding='utf-8-sig')))
cplrefs=[x['Designator'] for x in cpl];bomrefs=[]
for row in bom:
    refs=[x.strip() for x in row['Designator'].split(',')];bomrefs+=refs
    for ref in refs:
        assert ref in parts and row['LCSC Part #']==parts[ref]['lcsc'] and row['Comment']==parts[ref]['mpn'],ref
check('BOM/CPL reference bijection',len(cplrefs)==len(set(cplrefs))==len(bomrefs)==len(set(bomrefs))==75 and set(cplrefs)==set(bomrefs)==set(parts),{'placements':len(cplrefs),'BOM_groups':len(bom)},'Exactly one CPL entry per fitted BOM reference; exact MPN/C-code preserved')
cat=json.loads((R/'sourcing/manufacturing-catalog-2026-10-11.json').read_text(encoding='utf8'))
counts=collections.Counter(x['lcsc'] for x in parts.values());stocks=[]
for c,n in counts.items():
    v=cat['parts'][c];q=5*n
    assert v['model']==next(x['mpn'] for x in parts.values() if x['lcsc']==c)
    stocks.append(dict(code=c,MPN=v['model'],fitted=q,public_stock=v['stock'],surplus_before_attrition=v['stock']-q))
check('Five-board fitted-stock screen',all(x['surplus_before_attrition']>=0 for x in stocks),sorted(stocks,key=lambda x:x['surplus_before_attrition'])[:5],'Public exact-code stock covers fitted quantity; order-specific attrition/MOQ and allocation remain unknown')
pour=json.loads((E/'pour-and-stencil-audit.json').read_text(encoding='utf8'))
check('Pours and drill treatment',not pour['failures'],{'filled_capped_holes':pour['filled_capped_drills'],'zones':len(pour['zones']),'ground_stitches':len(pour['final_stitches'])},'No disconnected filled islands or connector thermal bypasses; separate drill-treatment map')
holds=[
 'Standard PCBA publishes a 70 x 70 mm minimum handling size, edge rails and fiducials. This 64 x 56 mm board needs JLC-defined handling rails/panel. Customer data remain single-board.',
 'Exact 8-layer 2 oz construction, minimum delivered copper, laminate and thickness tolerance need order-specific acceptance.',
 'Approve factory part-model rotations/pin 1 for all 75 placements and hidden-joint inspection/stencil process.',
 'No factory acceptance for procurement and post-solder installation of two ferrite halves and two clips per board. Global sourcing acceptance alone is not assembly acceptance.',
 'Ten mating plugs need an agreed accessory fitting/delivery operation. Library stock is for assembly and does not guarantee loose accessory delivery.',
 'JLC BOM tool redirects to sign-in in this session. Actual assembly MOQ/attrition, stock allocation and full build quote are not obtained.',
 'Physical core/clip fit and electrical bring-up remain open; the converter has not been built or qualified at 60 W.'
]
sources={
 'stencil_transfer':'https://www.ti.com/lit/an/slua271c/slua271c.pdf',
 'fabrication':'https://jlcpcb.com/capabilities/pcb-capabilities',
 'copper':'https://jlcpcb.com/help/article/jlcpcb-copper-weight',
 'assembly':'https://jlcpcb.com/capabilities/pcb-assembly-capabilities',
 'sourcing':'https://jlcpcb.com/help/article/global-sourcing-parts-order-terms-conditions',
 'inventory':'https://jlcpcb.com/help/article/pre-ordering-parts-terms-conditions',
 'MOQ_attrition':'https://jlcpcb.com/help/article/pcb-assembly-faqs-part-2'
}
report=dict(revision='A14',checked_date='2026-10-11',native_board_sha256=hashlib.sha256(pcb.read_bytes()).hexdigest(),verdict='Ready for supplier engineering review only; full turnkey release NOT confirmed',cad_checks=checks,failed_cad_checks=[x for x in checks if not x['passed']],external_release_holds=holds,sources=sources,catalog_retrieved_utc=cat['retrieved_utc'],note='Native CAD and public capabilities screen, not supplier CAM acceptance or measured performance. No upload, order, reservation or supplier message.')
(E/'turnkey-readiness.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'checks':len(checks),'failures':report['failed_cad_checks'],'stencil_lowest':lowest[:2],'external_holds':len(holds)},indent=2))
assert not report['failed_cad_checks']
