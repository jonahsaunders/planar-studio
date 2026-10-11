"""Geometric LMG2100 layout screens; no parasitic extraction or EMI prediction."""
from pathlib import Path
import pcbnew as p,json,math,sys
R=Path(__file__).resolve().parents[1]
def inspect(path):
 b=p.LoadBoard(str(path));fs={f.GetReference():f for f in b.GetFootprints()}
 pads={(f.GetReference(),q.GetNumber()):q for f in b.GetFootprints() for q in f.Pads()}
 def xy(v):return [p.ToMM(v.x),p.ToMM(v.y)]
 sw=pads['U1','5'].GetNetname();pg=pads['U1','6'].GetNetname()
 shape=p.SHAPE_POLY_SET()
 for f in b.GetFootprints():
  for q in f.Pads():
   if q.GetNetname()==sw:q.TransformShapeToPolygon(shape,p.F_Cu,0,p.FromMM(.005),p.ERROR_OUTSIDE)
 for t in b.GetTracks():
  if t.GetNetname()==sw:t.TransformShapeToPolygon(shape,t.GetLayer(),0,p.FromMM(.005),p.ERROR_OUTSIDE)
 shape.Simplify()
 overlaps=[]
 for z in b.Zones():
  if z.GetIsRuleArea() or z.GetNetname()==sw:continue
  poly=p.SHAPE_POLY_SET(z.GetFilledPolysList(z.GetLayer()));poly.BooleanIntersection(shape)
  if poly.Area()/1e12>.0001:overlaps.append({'net':z.GetNetname(),'layer':b.GetLayerName(z.GetLayer()),'area_mm2':round(poly.Area()/1e12,6)})
 trackover=[]
 for t in b.GetTracks():
  if t.GetLayer()==p.F_Cu or t.GetNetname()==sw or isinstance(t,p.PCB_VIA):continue
  poly=p.SHAPE_POLY_SET();t.TransformShapeToPolygon(poly,t.GetLayer(),0,p.FromMM(.005),p.ERROR_OUTSIDE);poly.BooleanIntersection(shape)
  if poly.Area()/1e12>.0001:trackover.append({'net':t.GetNetname(),'layer':b.GetLayerName(t.GetLayer()),'area_mm2':round(poly.Area()/1e12,6)})
 loop=[xy(pads[k].GetPosition()) for k in [('U1','7'),('C3','1'),('C3','2'),('U1','6')]]
 area=abs(sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(loop,loop[1:]+loop[:1])))/2
 start,end=loop[:2];n=max(1,math.ceil(math.dist(start,end)/.025))
 ref=[z.GetFilledPolysList(p.In1_Cu) for z in b.Zones() if not z.GetIsRuleArea() and z.GetLayer()==p.In1_Cu and z.GetNetname()==pg]
 coverage=sum(any(poly.Contains(p.VECTOR2I(p.FromMM(start[0]+(end[0]-start[0])*i/n),p.FromMM(start[1]+(end[1]-start[1])*i/n))) for poly in ref) for i in range(n+1))/(n+1)
 return {'projected_input_loop_pad_center_area_mm2':round(area,4),'VIN_trace_over_adjacent_PGND_percent':round(100*coverage,2),'SW_projection_area_mm2':round(shape.Area()/1e12,4),'SW_projection_foreign_plane_overlap':overlaps,'SW_projection_foreign_internal_track_overlap':trackover}
current=inspect(R/'kicad/PS-GAN-60W.kicad_pcb')
report={'revision':'A11','method':'Native custom pads and track polygons define SW projection; intersect with actual filled planes and internal traces. Input loop area is a pad-center polygon including a straight package-closing segment, not actual internal die geometry. VIN centerline sampled at <=0.025 mm for adjacent In1 PGND coverage. No inductance or emissions claim.','A11':current,'manufacturer_references':['https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf','https://www.ti.com/tool/LMG2100EVM-078','https://epc-co.com/epc/Portals/0/epc/documents/papers/optimizing%20pcb%20layout%20with%20egan%20fets.pdf']}
if len(sys.argv)>1:report['A7']=inspect(Path(sys.argv[1])/'kicad/PS-GAN-60W.kicad_pcb')
(R/'evidence/GaN-layout-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert not current['SW_projection_foreign_plane_overlap']
assert not current['SW_projection_foreign_internal_track_overlap']
assert current['VIN_trace_over_adjacent_PGND_percent']==100
