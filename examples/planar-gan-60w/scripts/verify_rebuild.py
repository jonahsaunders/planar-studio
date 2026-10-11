from pathlib import Path
import json,hashlib,shutil,sys
import pcbnew as p
R=Path(__file__).resolve().parents[1];S=Path(sys.argv[1])
drc=(S/'evidence/rebuild-DRC.rpt').read_text(encoding='utf8')
for required in ['** Found 0 DRC violations **','** Found 0 unconnected pads **','** Found 0 Footprint errors **']:
 assert required in drc, 'Rebuild DRC did not pass: '+required
def xy(v):return [v.x,v.y]
def polyshape(poly):
 def chain(c):return [(c.CPoint(j).x,c.CPoint(j).y) for j in range(c.PointCount())]
 return [(chain(poly.COutline(i)),[chain(poly.CHole(i,j)) for j in range(poly.HoleCount(i))]) for i in range(poly.OutlineCount())]
def geometry(root):
 b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'))
 tracks=sorted([(t.GetClass(),t.GetNetname(),t.GetLayer(),xy(t.GetStart()),xy(t.GetEnd()),t.GetWidth(p.F_Cu) if isinstance(t,p.PCB_VIA) else t.GetWidth(),t.GetDrillValue() if isinstance(t,p.PCB_VIA) else 0) for t in b.GetTracks()])
 fps=sorted([(f.GetReference(),xy(f.GetPosition()),f.GetOrientationDegrees(),sorted([(d.GetNumber(),d.GetNetname(),xy(d.GetPosition()),xy(d.GetSize()),xy(d.GetDrillSize())) for d in f.Pads()])) for f in b.GetFootprints()])
 return {'tracks_vias':tracks,'footprints_pads':fps,'layers':b.GetCopperLayerCount(),'zones':sorted([(z.GetNetname(),z.GetLayer(),polyshape(z.Outline())) for z in b.Zones()])}
assert (R/'kicad/PS-GAN-60W.kicad_sch').read_bytes()==(S/'kicad/PS-GAN-60W.kicad_sch').read_bytes(), 'Schematic rebuild differs'
a=geometry(R);c=geometry(S)
ba=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'));bc=p.LoadBoard(str(S/'kicad/PS-GAN-60W.kicad_pcb'))
def zones(board):return sorted(board.Zones(),key=lambda z:(z.GetNetname(),z.GetLayer(),polyshape(z.Outline())))
def physical_copper(board,z):
 poly=p.SHAPE_POLY_SET(z.GetFilledPolysList(z.GetLayer()))
 for f in board.GetFootprints():
  for q in f.Pads():
   if q.IsOnLayer(z.GetLayer()) and q.GetNetname()==z.GetNetname():
    v=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(v,z.GetLayer(),0,p.FromMM(.001),p.ERROR_OUTSIDE);poly.BooleanAdd(v)
 for q in board.GetTracks():
  if q.IsOnLayer(z.GetLayer()) and q.GetNetname()==z.GetNetname():
   v=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(v,z.GetLayer(),0,p.FromMM(.001),p.ERROR_OUTSIDE);poly.BooleanAdd(v)
 return poly
fill_differences=[]
for za,zc in zip(zones(ba),zones(bc)):
 delta=physical_copper(ba,za);delta.BooleanXor(physical_copper(bc,zc))
 area=delta.Area()/1e12
 assert area<0.01,(za.GetNetname(),za.GetLayer(),area)
 fill_differences.append({'net':za.GetNetname(),'layer':ba.GetLayerName(za.GetLayer()),'symmetric_difference_mm2':round(area,8)})
if a!=c:
 for key in a:
  if a[key]!=c[key]:
   print('Mismatch',key)
   if isinstance(a[key],list):
    print('Lengths',len(a[key]),len(c[key]));print([(x,y) for x,y in zip(a[key],c[key]) if x!=y][:3])
   else:print(a[key],c[key])
assert a==c,'Rebuilt geometry differs'
report={'result':'pass','schematic_rebuild_byte_identical':True,'KiCad_version':p.GetBuildVersion(),'method':'Rebuild in a separate copied example directory using bundled libraries and scripts; compare every track/via, footprint and pad geometry/net assignment, layer count and zone outlines exactly; compare the physical union of filled copper, same-net pads and tracks (zone overlap hidden beneath lands can vary with KiCad fill order) with a symmetric-difference area limit of 0.01 mm2 per zone for KiCad corner tessellation; run KiCad DRC with schematic parity. UUIDs intentionally not compared.','footprints':len(a['footprints_pads']),'track_via_items':len(a['tracks_vias']),'copper_layers':a['layers'],'zones':len(a['zones']),'zone_outlines_identical':True,'filled_zone_corner_tessellation_tolerance_mm2':0.01,'filled_zone_symmetric_differences':fill_differences,'geometry_sha256':hashlib.sha256(json.dumps(a,sort_keys=True).encode()).hexdigest(),'DRC_violations':0,'unconnected_items':0,'schematic_parity_issues':0}
(R/'evidence/rebuild-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
shutil.copy2(S/'evidence/rebuild-DRC.rpt',R/'evidence/rebuild-DRC.rpt')
print(json.dumps(report,indent=2))
