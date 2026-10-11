"""Sample native filled copper immediately adjacent to selected signal layers.
This checks geometry, not return-current density, impedance, or loop inductance.
"""
from pathlib import Path
import pcbnew as p, json, math, sys
R=Path(__file__).resolve().parents[1]
checks=[('LLC GD1','Net-(U2-GD1)',p.In4_Cu,'AGND',[p.In3_Cu,p.In5_Cu]),('LLC GD2','Net-(U2-GD2)',p.In2_Cu,'AGND',[p.In1_Cu,p.In3_Cu]),('LLC GD2 local detour','Net-(U2-GD2)',p.In6_Cu,'AGND',[p.In5_Cu,p.B_Cu]),('Rectifier VG1','Net-(U3-VG1)',p.F_Cu,'SGND',[p.In1_Cu]),('Rectifier VG2','Net-(U3-VG2)',p.In2_Cu,'SGND',[p.In1_Cu,p.In3_Cu])]
def inspect(root):
 b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'));result=[]
 for title,net,layer,ground,adj in checks:
  polys=[z.GetFilledPolysList(l) for z in b.Zones() for l in adj if z.GetNetname()==ground and z.IsOnLayer(l)]
  vias=[t.GetPosition() for t in b.GetTracks() if isinstance(t,p.PCB_VIA) and t.GetNetname()==net]
  total=covered=checked=qualified=0.;bad=[]
  for t in b.GetTracks():
   if t.GetNetname()!=net or isinstance(t,p.PCB_VIA) or t.GetLayer()!=layer:continue
   a,c=t.GetStart(),t.GetEnd();n=max(1,math.ceil(t.GetLength()/p.FromMM(.05)));dl=p.ToMM(t.GetLength())/n
   for i in range(n):
    f=(i+.5)/n;q=p.VECTOR2I(round(a.x+(c.x-a.x)*f),round(a.y+(c.y-a.y)*f));ok=any(poly.Contains(q) for poly in polys)
    total+=dl;covered+=dl*ok
    if any(math.hypot(q.x-v.x,q.y-v.y)<p.FromMM(.65) for v in vias):continue
    checked+=dl;qualified+=dl*ok
    if not ok:bad.append([round(p.ToMM(q.x)-60,3),round(p.ToMM(q.y)-60,3)])
  result.append({'path':title,'signal_layer':b.GetLayerName(layer),'adjacent_return_layers':[b.GetLayerName(l) for l in adj],'return_net':ground,'total_track_length_mm':round(total,3),'covered_percent':round(100*covered/total,2) if total else None,'outside_signal_via_antipads_coverage_percent':round(100*qualified/checked,2) if checked else None,'uncovered_sample_count_outside_antipads':len(bad),'first_20_uncovered_samples_mm':bad[:20]})
 return result
report={'revision':'A11','method':'Track centerline sampled every <=0.05 mm against native filled zone polygons on immediately adjacent copper layers. Coverage is union of those layers. A second figure excludes 0.65 mm around same-net signal vias because their required antipads remove reference copper. Coverage does not prove low inductance, uninterrupted current flow, EMI or electrical performance. Coordinates relative to circuit datum (60,60) mm.','current':inspect(R)}
if len(sys.argv)>1:report['previous_A4']=inspect(Path(sys.argv[1]))
assert all(r['outside_signal_via_antipads_coverage_percent']>=99.5 for r in report['current']),report['current']
(R/'evidence/return-path-audit.json').write_text(json.dumps(report,indent=2)+'\n')
for r in report['current']:print(r['path'],r['covered_percent'],r['outside_signal_via_antipads_coverage_percent'],r['uncovered_sample_count_outside_antipads'])
