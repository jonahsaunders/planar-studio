"""Independent projection check for the sensitive bias network and L2 body."""
from pathlib import Path
import json,sys,pcbnew as p
R=Path(__file__).resolve().parents[1]
def inspect(root):
 b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'));aliases=json.loads((root/'net-aliases.json').read_text(encoding='utf8'))
 # Conservative 7.6 mm square covering the manufacturer's max body envelope.
 body=p.SHAPE_POLY_SET();body.NewOutline()
 for x,y in [(36.7,36.7),(44.3,36.7),(44.3,44.3),(36.7,44.3)]:body.Append(p.FromMM(x+60),p.FromMM(y+60))
 out=[]
 for net in ['RIPPLE','BIAS_FB']:
  areas=[]
  for t in b.GetTracks():
   if isinstance(t,p.PCB_VIA) or t.GetNetname()!=aliases[net]:continue
   shape=p.SHAPE_POLY_SET();t.TransformShapeToPolygon(shape,t.GetLayer(),0,p.FromMM(.005),p.ERROR_OUTSIDE);shape.BooleanIntersection(body)
   if shape.Area()>0:areas.append({'layer':b.GetLayerName(t.GetLayer()),'overlap_mm2':round(shape.Area()/1e12,6)})
  out.append({'net':net,'L2_body_track_projection_overlap':areas})
 return out
current=inspect(R)
assert not any(row['L2_body_track_projection_overlap'] for row in current)
result={'revision':'A8','method':'Native track polygon projection versus a conservative 7.6 mm square around L2; checks sensitive RIPPLE and BIAS_FB on every copper layer. This is a geometry screen, not extracted magnetic coupling.','current':current}
if len(sys.argv)>1:result['previous_A7']=inspect(Path(sys.argv[1]))
(R/'evidence/bias-layout-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
