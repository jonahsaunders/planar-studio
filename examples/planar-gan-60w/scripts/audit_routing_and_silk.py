"""Audit native trace angles and the un-clipped silkscreen against mask openings.
KiCad 10 + Shapely; optional argument is the Shapely site-packages directory.
"""
from pathlib import Path
import sys, json, math, hashlib
from collections import defaultdict
if len(sys.argv)>1:sys.path.append(sys.argv[1])
import pcbnew as p
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[1]
def xy(v):return (v.x/1e6,v.y/1e6)
def convert(poly):
 def c(a):return [xy(a.CPoint(i)) for i in range(a.PointCount())]
 return unary_union([Polygon(c(poly.Outline(i)),[c(poly.Hole(i,j)) for j in range(poly.HoleCount(i))]) for i in range(poly.OutlineCount())])
def shape(q,l):
 poly=p.SHAPE_POLY_SET()
 if isinstance(q,p.PCB_TEXT):q.TransformTextToPolySet(poly,0,p.FromMM(.001),p.ERROR_OUTSIDE)
 else:q.TransformShapeToPolygon(poly,l,0,p.FromMM(.001),p.ERROR_OUTSIDE)
 return convert(poly)
def inspect(path):
 b=p.LoadBoard(str(path));tracks=[t for t in b.GetTracks() if not isinstance(t,p.PCB_VIA)]
 odd=[];nodes=defaultdict(list);anchors=set()
 lands=defaultdict(list)
 for f in b.GetFootprints():
  for q in f.Pads():
   anchors.add(xy(q.GetPosition()))
   if f.GetReference()!='T1':lands[q.GetNetname()].append(shape(q,p.F_Cu))
 for t in b.GetTracks():
  if isinstance(t,p.PCB_VIA):anchors.add(xy(t.GetPosition()))
 for t in tracks:
  a,z=xy(t.GetStart()),xy(t.GetEnd());dx,dy=abs(a[0]-z[0]),abs(a[1]-z[1])
  if min(dx,dy,abs(dx-dy))>.000003:odd.append({'net':t.GetNetname(),'layer':b.GetLayerName(t.GetLayer()),'a':a,'b':z})
  for v in [a,z]:nodes[(t.GetLayer(),t.GetNetname(),v)].append(t)
 elbows=[]
 for (l,n,v),ts in nodes.items():
  if len(ts)!=2:continue
  a=xy(ts[0].GetEnd()) if xy(ts[0].GetStart())==v else xy(ts[0].GetStart())
  z=xy(ts[1].GetEnd()) if xy(ts[1].GetStart())==v else xy(ts[1].GetStart())
  u=(a[0]-v[0],a[1]-v[1]);w=(z[0]-v[0],z[1]-v[1])
  if math.hypot(*u)<.02 or math.hypot(*w)<.02:continue
  if abs(u[0]*w[0]+u[1]*w[1])>1e-5:continue
  covered=any(s.buffer(.001).contains(Point(v)) for s in lands[n])
  elbows.append({'net':n,'layer':b.GetLayerName(l),'position':v,'anchor':v in anchors,'inside_same_net_land_projection':covered})
 mask=[];silk=[];courtyards=[]
 for f in b.GetFootprints():
  for q in f.Pads():
   if q.IsOnLayer(p.F_Mask):mask.append(shape(q,p.F_Cu).buffer(q.GetSolderMaskExpansion(p.F_Mask)/1e6))
  if f.GetReference()!='T1':courtyards.append((f.GetReference(),convert(f.GetCourtyard(p.F_CrtYd))))
  for g in [f.Reference(),f.Value(),*f.GraphicalItems()]:
   if g.GetLayer()==p.F_SilkS and (not isinstance(g,p.PCB_TEXT) or g.IsVisible()):silk.append((f.GetReference(),g))
 for g in b.GetDrawings():
  if g.GetLayer()==p.F_SilkS:silk.append(('board',g))
 # Tented vias have no mask opening; include any explicitly open top vias.
 open_vias=[v for v in b.GetTracks() if isinstance(v,p.PCB_VIA) and not v.IsTented(p.F_Cu)]
 mask += [shape(v,p.F_Cu).buffer(v.GetSolderMaskExpansion()/1e6) for v in open_vias]
 openings=unary_union(mask);gaps=[];bodyhits=[]
 for ref,g in silk:
  s=shape(g,p.F_SilkS)
  if s.is_empty:continue
  name=g.GetText() if isinstance(g,p.PCB_TEXT) else g.GetClass()
  gap=s.distance(openings);gaps.append({'owner':ref,'legend':name,'gap_mm':round(gap,4)})
  if ref=='board' and isinstance(g,p.PCB_TEXT):
   hits=[r for r,c in courtyards if not c.is_empty and s.intersection(c).area>.001]
   if hits:bodyhits.append({'legend':name,'courtyards':hits})
 return {'trace_segments':len(tracks),'non_octilinear_segments':odd,'right_angle_elbows':elbows,'unanchored_right_angles_outside_lands':[x for x in elbows if not x['anchor'] and not x['inside_same_net_land_projection']],
 'silk_items':len(gaps),'open_top_vias_included_in_mask_screen':len(open_vias),'minimum_silk_to_mask_gap_mm':min(x['gap_mm'] for x in gaps),'silk_mask_clearance_under_0p2mm':[x for x in gaps if x['gap_mm']<.199], 'board_text_inside_component_courtyards':bodyhits}
current=inspect(R/'kicad/PS-GAN-60W.kicad_pcb')
report={'revision':'A12','native_board_sha256':hashlib.sha256((R/'kicad/PS-GAN-60W.kicad_pcb').read_bytes()).hexdigest(),'method':'Native straight route segments only; T1 custom-pad winding unchanged. Elbows exclude branch junctions. Silkscreen uses actual stroke polygons without Gerber clipping, 0.001 mm polygon tolerance. Courtyard overlap is a conservative component-body visibility screen, excluding the transformer.','current':current}
baseline=Path(sys.argv[2]) if len(sys.argv)>2 else None
if baseline:report['baseline_A11']=inspect(baseline/'kicad/PS-GAN-60W.kicad_pcb')
(R/'evidence/routing-and-silk-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(current,indent=2))
assert not current['non_octilinear_segments']
assert not current['unanchored_right_angles_outside_lands']
assert not current['silk_mask_clearance_under_0p2mm']
assert not current['board_text_inside_component_courtyards']
