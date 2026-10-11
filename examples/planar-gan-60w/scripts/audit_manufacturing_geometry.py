"""Measure native fabrication geometry; requires KiCad 10 pcbnew and Shapely.
Run with KiCad Python; add an environment containing Shapely to PYTHONPATH.
This is a supplier-rule screen, not factory DFM acceptance.
"""
from pathlib import Path
import sys, json, math, itertools, collections
if len(sys.argv)>1: sys.path.append(sys.argv[1])
import pcbnew as p
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[1]
b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
mm=lambda n: n/1e6
def convert(poly):
    out=[]
    def coords(chain): return [(mm(chain.CPoint(i).x),mm(chain.CPoint(i).y)) for i in range(chain.PointCount())]
    for i in range(poly.OutlineCount()):
        out.append(Polygon(coords(poly.Outline(i)),[coords(poly.Hole(i,j)) for j in range(poly.HoleCount(i))]))
    return unary_union(out)
def shape(item,layer):
    poly=p.SHAPE_POLY_SET();item.TransformShapeToPolygon(poly,layer,0,p.FromMM(.001),p.ERROR_OUTSIDE)
    return convert(poly)
parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']; purchased={x['ref'] for x in parts if x['lcsc']}
pads=[];holes=[];mask=[];paste=[];silk=[];padrows=[];courtyard_findings=[];polarity=[]
for f in b.GetFootprints():
    ref=f.GetReference()
    if ref in purchased:
        courtyard=convert(f.GetCourtyard(p.F_CrtYd))
        copper=unary_union([shape(q,p.F_Cu) for q in f.Pads() if q.IsOnLayer(p.F_Cu)])
        outside=copper.difference(courtyard.buffer(.002)).area if not courtyard.is_empty else copper.area
        if outside>.001:courtyard_findings.append({'ref':ref,'pad_area_outside_courtyard_mm2':round(outside,5)})
        if ref[0] in 'UDQ':
            polarity.append({'ref':ref,'footprint_has_top_silk_graphics':any(g.GetLayer()==p.F_SilkS for g in f.GraphicalItems()),'note':'Graphics presence alone does not prove an unambiguous pin-1/cathode marker.'})
    for q in f.Pads():
        ident=ref+'.'+q.GetNumber();c=shape(q,p.F_Cu);net=q.GetNetname()
        # Separate mask/paste-only pad objects have no electrical net. Attribute
        # their openings to the underlying numbered land before spacing checks.
        if not net and ref in purchased and not q.GetNumber() and q.IsOnLayer(p.F_Mask):
            lands=[(c.intersection(shape(a,p.F_Cu)).area,a) for a in f.Pads() if a.IsOnLayer(p.F_Cu) and a.GetNumber()]
            area,owner=max(lands,key=lambda a:a[0]);assert area>.001
            net=owner.GetNetname();ident=ref+'.'+owner.GetNumber()+'(mask)'
        if q.IsOnLayer(p.F_Cu):pads.append((ident,net,c,q))
        d=q.GetDrillSize()
        if d.x:
            pos=q.GetPosition();holes.append((ident,mm(pos.x),mm(pos.y),mm(d.x),mm(d.y),q.GetAttribute()!=p.PAD_ATTRIB_NPTH))
        if q.IsOnLayer(p.F_Mask):
            m=c.buffer(mm(q.GetSolderMaskExpansion(p.F_Mask)),quad_segs=16) if q.GetSolderMaskExpansion(p.F_Mask) else c
            mask.append((ident,net,m))
        if ref in purchased and q.GetNumber() and q.IsOnLayer(p.F_Cu):
            pm=q.GetSolderPasteMargin(p.F_Paste)
            padrows.append({'pad':ident,'net':net,'width_mm':mm(q.GetSize().x),'height_mm':mm(q.GetSize().y),'drill_mm':mm(d.x),'mask_expansion_mm':mm(q.GetSolderMaskExpansion(p.F_Mask)),'paste_margin_xy_mm':[mm(pm.x),mm(pm.y)],'smd':q.GetAttribute()==p.PAD_ATTRIB_SMD})
    for item in [f.Reference(),f.Value(),*list(f.GraphicalItems())]:
        if isinstance(item,p.PCB_TEXT) and item.GetLayer()==p.F_SilkS and item.IsVisible():
            silk.append({'text':item.GetText(),'ref':ref,'height_mm':mm(item.GetTextHeight()),'stroke_mm':mm(item.GetTextThickness())})
for item in b.GetDrawings():
    if isinstance(item,p.PCB_TEXT) and item.GetLayer()==p.F_SilkS:
        silk.append({'text':item.GetText(),'ref':'board','height_mm':mm(item.GetTextHeight()),'stroke_mm':mm(item.GetTextThickness())})
tracks=[t for t in b.GetTracks() if not isinstance(t,p.PCB_VIA)]
vias=[t for t in b.GetTracks() if isinstance(t,p.PCB_VIA)]
for i,t in enumerate(vias):
    pos=t.GetPosition();holes.append(('via'+str(i),mm(pos.x),mm(pos.y),mm(t.GetDrillValue()),mm(t.GetDrillValue()),True))
holepairs=[]
for a,z in itertools.combinations(holes,2):
    gap=math.hypot(a[1]-z[1],a[2]-z[2])-(a[3]+z[3])/2
    holepairs.append((gap,a[0],z[0]))
padgaps=[];maskgaps=[];betweenparts=[]
for a,z in itertools.combinations(pads,2):
    if a[1] and z[1] and a[1]!=z[1]:padgaps.append((a[2].distance(z[2]),a[0],z[0]))
    if a[0].split('.')[0]!=z[0].split('.')[0] and a[0].split('.')[0] in purchased and z[0].split('.')[0] in purchased:
        betweenparts.append((a[2].distance(z[2]),a[0],z[0]))
for a,z in itertools.combinations(mask,2):
    if a[1] and z[1] and a[1]!=z[1]:maskgaps.append((a[2].distance(z[2]),a[0],z[0]))
# Check each drilled via against all foreign copper on every internal layer.
# Copper polygons include pads, tracks and zone fill, not only bounding boxes.
layers=[p.In1_Cu,p.In2_Cu,p.In3_Cu,p.In4_Cu,p.In5_Cu,p.In6_Cu]
inner=[]
for layer in layers:
    bynet=collections.defaultdict(list)
    for f in b.GetFootprints():
        for q in f.Pads():
            if q.IsOnLayer(layer) and q.GetNetname(): bynet[q.GetNetname()].append(shape(q,layer))
    for t in b.GetTracks():
        if t.IsOnLayer(layer): bynet[t.GetNetname()].append(shape(t,layer))
    for z in b.Zones():
        if not z.GetIsRuleArea() and z.IsOnLayer(layer):bynet[z.GetNetname()].append(convert(z.GetFilledPolysList(layer)))
    bynet={n:unary_union(v) for n,v in bynet.items()}
    for i,t in enumerate(vias):
        xy=t.GetPosition();center=Point(mm(xy.x),mm(xy.y));rr=mm(t.GetDrillValue())/2
        ds=[(center.distance(c)-rr,n) for n,c in bynet.items() if n!=t.GetNetname() and not c.is_empty]
        d,n=min(ds);inner.append((d,'via'+str(i),b.GetLayerName(layer),n))
mask_to_foreign=[]
ftracks=[(t.GetNetname(),shape(t,p.F_Cu)) for t in tracks if t.IsOnLayer(p.F_Cu)]
for ident,net,m in mask:
    ds=[(m.distance(c),n) for n,c in ftracks if n!=net and n]
    if ds:
        d,n=min(ds);mask_to_foreign.append((d,ident,n))
vip=[]
for i,t in enumerate(vias):
    pos=t.GetPosition();hole=Point(mm(pos.x),mm(pos.y)).buffer(mm(t.GetDrillValue())/2)
    hits=[a[0] for a in pads if a[3].GetAttribute()==p.PAD_ATTRIB_SMD and a[0].split('.')[0] in purchased and hole.intersects(a[2])]
    if hits:vip.append({'via':'via'+str(i),'pads':hits})
def first(items,n=12):return [list(x) for x in sorted(items)[:n]]
report={'date':'2026-10-10','revision':'A12','method':'Native KiCad polygons approximated outward with maximum 0.001 mm error. Hole distances use nominal circular drills. Mask geometry uses copper polygon plus native mask expansion. Does not model registration tolerances, etch compensation, paste process, 3D collisions or supplier CAM edits.',
 'copper_layers':b.GetCopperLayerCount(),'board_nominal_thickness_mm':mm(b.GetDesignSettings().GetBoardThickness()),
 'min_routed_track_width_mm':min(mm(t.GetWidth()) for t in tracks),
 'via_count':len(vias),'via_sizes_mm':sorted(set((mm(t.GetWidth(p.F_Cu)),mm(t.GetDrillValue())) for t in vias)),
 'holes_by_diameter_and_plating':dict(collections.Counter(str((a[3],a[5])) for a in holes)),
 'smallest_hole_edge_gaps_mm':first(holepairs),'hole_gap_under_0p2_mm':[list(x) for x in sorted(holepairs) if x[0]<.199],
 'smallest_foreign_pad_copper_gaps_mm':first(padgaps),'smallest_foreign_mask_gaps_mm':first(maskgaps),
 'closest_different_component_pad_gaps_mm':first(betweenparts,25),
 'different_component_copper_overlaps':[[a,z] for d,a,z in betweenparts if d<.0001],
 'courtyard_does_not_enclose_copper_pads':courtyard_findings,
 'polarized_footprint_silk_graphic_screen':polarity,
 'foreign_mask_gaps_under_0p2_mm':[list(x) for x in sorted(maskgaps) if x[0]<.199],
 'smallest_internal_via_hole_to_foreign_copper_mm':first(inner),
 'internal_via_hole_clearance_under_0p2_mm':[list(x) for x in inner if x[0]<.199],
 'smallest_mask_opening_to_foreign_top_track_mm':first(mask_to_foreign),
 'silkscreen_below_1mm_height_or_0p15mm_stroke':[x for x in silk if x['height_mm']<.999 or x['stroke_mm']<.149],
 'routed_vias_intersecting_purchased_SMT_lands':vip,
 'purchased_pad_geometry':padrows,
 'purchased_unique_smt_terminals':len({x['pad'] for x in padrows if x['smd']}),
 'purchased_unique_tht_terminals':len({x['pad'] for x in padrows if not x['smd']})}
(R/'evidence/manufacturing-geometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ['purchased_pad_geometry','routed_vias_intersecting_purchased_SMT_lands']},indent=2))

