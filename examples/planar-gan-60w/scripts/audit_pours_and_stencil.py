"""Independent polygon/connection and GaN stencil screens; pcbnew + Shapely.
Run with KiCad Python and the Shapely site-packages path as the first argument.
These geometric screens do not predict impedance, EMI or solder yield.
"""
from pathlib import Path
import sys,json,csv,math
if len(sys.argv)>1:sys.path.append(sys.argv[1])
import pcbnew as p
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[1];b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
def cv(poly):
    def pts(q):return [(q.CPoint(i).x/1e6,q.CPoint(i).y/1e6) for i in range(q.PointCount())]
    return unary_union([Polygon(pts(poly.Outline(i)),[pts(poly.Hole(i,j)) for j in range(poly.HoleCount(i))]) for i in range(poly.OutlineCount())])
def shp(q,l):
    s=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(s,l,0,p.FromMM(.001),p.ERROR_OUTSIDE);return cv(s)
layers=[p.F_Cu,p.In1_Cu,p.In2_Cu,p.In3_Cu,p.In4_Cu,p.In5_Cu,p.In6_Cu,p.B_Cu]
pads=[(f,q) for f in b.GetFootprints() for q in f.Pads()]
tracks=list(b.GetTracks());via=[t for t in tracks if isinstance(t,p.PCB_VIA)]
aliases=json.loads((R/'net-aliases.json').read_text(encoding='utf8'))
hot=unary_union([shp(q,p.F_Cu) for f,q in pads if q.IsOnLayer(p.F_Cu) and q.GetNetname()==aliases['BIAS_SW']]+[shp(t,p.F_Cu) for t in tracks if not isinstance(t,p.PCB_VIA) and t.GetLayer()==p.F_Cu and t.GetNetname()==aliases['BIAS_SW']])
zones=[];fail=[]
for z in b.Zones():
    if z.GetIsRuleArea():continue
    l=z.GetLayer();net=z.GetNetname();fill=cv(z.GetFilledPolysList(l))
    bits=list(fill.geoms) if hasattr(fill,'geoms') else ([] if fill.is_empty else [fill])
    connections=unary_union([shp(q,l) for f,q in pads if q.IsOnLayer(l) and q.GetNetname()==net]+[shp(t,l) for t in tracks if t.IsOnLayer(l) and t.GetNetname()==net])
    floating=[round(a.area,6) for a in bits if a.distance(connections)>.002]
    overlap=fill.intersection(hot).area
    # A single ground region must not form a closed turn around the center leg.
    center=Point(82,75.5)
    encircles=any(Polygon(r).covers(center) for a in bits for r in a.interiors) if net in ['AGND','PGND','SGND'] else False
    row={'name':z.GetZoneName(),'net':net,'layer':b.GetLayerName(l),'filled_area_mm2':round(fill.area,4),'pieces':len(bits),'smallest_piece_mm2':round(min((a.area for a in bits),default=0),4),'pieces_without_same_net_pad_track_or_via':floating,'bias_hot_node_overlap_mm2':round(overlap,6),'closed_ground_ring_around_center_leg':encircles}
    zones.append(row)
    if floating or overlap>.0001 or encircles:fail.append(row)
stitches=json.loads((R/'evidence/stitching-audit.json').read_text(encoding='utf8'))
for v in stitches['vias']:
    x,y=v['position_mm'];xy=p.VECTOR2I(p.FromMM(x+60),p.FromMM(y+60))
    ls={z.GetLayer() for z in b.Zones() if not z.GetIsRuleArea() and z.GetNetname()==v['net'] and z.GetFilledPolysList(z.GetLayer()).Contains(xy)}
    v['final_connected_layers']=[b.GetLayerName(l) for l in sorted(ls)]
    assert len(ls)>=2,v
stencils=[];u=next(f for f in b.GetFootprints() if f.GetReference()=='U1')
cu={q.GetNumber():shp(q,p.F_Cu) for q in u.Pads() if q.GetNumber() and q.IsOnLayer(p.F_Cu)}
mask={n:[] for n in cu};paste={n:[] for n in cu}
for q in u.Pads():
    for layer,dest in [(p.F_Mask,mask),(p.F_Paste,paste)]:
        if not q.IsOnLayer(layer):continue
        geo=shp(q,layer)
        n=q.GetNumber() or max(cu,key=lambda k:cu[k].intersection(geo).area)
        dest[n].append(geo)
for n in ['5','6','7','17']:
    m=unary_union(mask[n]);s=unary_union(paste[n]);outside=m.difference(cu[n].buffer(.002)).area
    row={'pad':n,'copper_mm2':round(cu[n].area,6),'mask_opening_mm2':round(m.area,6),'paste_mm2':round(s.area,6),'paste_percent_of_mask_opening':round(100*s.area/m.area,2),'mask_outside_copper_mm2':round(outside,6),'paste_outside_mask_mm2':round(s.difference(m.buffer(.002)).area,6)}
    stencils.append(row);assert outside<.0001 and row['paste_outside_mask_mm2']<.0001,row
    assert 73<row['paste_percent_of_mask_opening']<78,row
thermals=[]
for f,q in pads:
    if f.GetReference() in ['J1','J2']:
        assert q.GetLocalZoneConnection()==p.ZONE_CONNECTION_THERMAL
        assert not any(not isinstance(t,p.PCB_VIA) and (t.GetStart()==q.GetPosition() or t.GetEnd()==q.GetPosition()) for t in tracks),'Track bypasses connector thermal relief'
        xy=q.GetPosition();radius=max(q.GetSize().x,q.GetSize().y)/2+q.GetThermalGap()+50000
        connected=[]
        for z in b.Zones():
            if z.GetNetname()!=q.GetNetname():continue
            poly=z.GetFilledPolysList(z.GetLayer())
            count=sum(poly.Contains(p.VECTOR2I(round(xy.x+radius*math.cos(math.radians(q.GetThermalSpokeAngleDegrees()+a))),round(xy.y+radius*math.sin(math.radians(q.GetThermalSpokeAngleDegrees()+a))))) for a in [0,90,180,270])
            if count:connected.append({'layer':b.GetLayerName(z.GetLayer()),'spokes_present_at_gap_outer_edge':count})
        assert any(x['spokes_present_at_gap_outer_edge']==4 for x in connected),(f.GetReference(),q.GetNumber(),connected)
        thermals.append({'pad':f.GetReference()+'.'+q.GetNumber(),'layers':connected})
drills=[];origin=b.GetDesignSettings().GetAuxOrigin()
for i,q in enumerate(via):
    xy=q.GetPosition();drills.append({'ID':f'V{i+1}','X_mm':round((xy.x-origin.x)/1e6,6),'Y_mm':round((origin.y-xy.y)/1e6,6),'Drill_mm':q.GetDrillValue()/1e6,'Process':'RESIN FILL / COPPER CAP / PLANARIZE','Net':q.GetNetname()})
for f,q in pads:
    if not q.GetDrillSize().x:continue
    xy=q.GetPosition();drills.append({'ID':f.GetReference()+'.'+q.GetNumber(),'X_mm':round((xy.x-origin.x)/1e6,6),'Y_mm':round((origin.y-xy.y)/1e6,6),'Drill_mm':q.GetDrillSize().x/1e6,'Process':'RESIN FILL / COPPER CAP / PLANARIZE' if f.GetReference()=='T1' else 'KEEP OPEN','Net':q.GetNetname()})
with (R/'manufacturing-prototype/Drill-process-map.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=drills[0]);w.writeheader();w.writerows(drills)
report={'revision':'A13','method':'Actual filled zone polygons at 0.001 mm conversion error. Each piece must touch a same-net pad, explicit track or via. KiCad connectivity/DRC separately checks the resulting network. No ground-ring hole may contain the center leg. Fast-node projection exclusions checked separately; isolated copper always removed. No current-density, loop-inductance or EMC claim.','zones':zones,'failures':fail,'final_stitches':stitches['vias'],'GaN_power_stencil':stencils,'filled_capped_drills':sum(x['Process'].startswith('RESIN') for x in drills),'open_drills':sum(x['Process']=='KEEP OPEN' for x in drills),'connector_thermal_spokes_mm':.6,'connector_thermal_gap_mm':.3,'connector_direct_track_bypasses':0,'bias_sense_exception':'The low-current BIAS_SW In6 sense-tap trace retains adjacent shielding. The high-current top switching lands/routes have projection voids.','limits':'Factory must approve mask registration, paste transfer, cap planarity, thermal soldering, X-ray and panel construction.'}
(R/'evidence/pour-and-stencil-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
report['connector_thermal_spoke_screen']=thermals
(R/'evidence/pour-and-stencil-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ['zones','final_stitches']},indent=2));assert not fail,fail
