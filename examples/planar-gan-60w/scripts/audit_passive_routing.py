"""Audit the revised low-current resistor launches, not a reflow simulation."""
from pathlib import Path
import pcbnew as p,json,math,sys,hashlib
sys.path.append(sys.argv[1])
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union
R=Path(__file__).resolve().parents[1]
b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
def xy(v):return (v.x/1e6,v.y/1e6)
def shape(q,layer):
 poly=p.SHAPE_POLY_SET();q.TransformShapeToPolygon(poly,layer,0,p.FromMM(.001),p.ERROR_OUTSIDE)
 def co(c):return [xy(c.CPoint(i)) for i in range(c.PointCount())]
 return unary_union([Polygon(co(poly.Outline(i)),[co(poly.Hole(i,j)) for j in range(poly.HoleCount(i))]) for i in range(poly.OutlineCount())])
tracks=[t for t in b.GetTracks() if not isinstance(t,p.PCB_VIA)]
vias=[v for v in b.GetTracks() if isinstance(v,p.PCB_VIA)]
refs=['R20','R21','R22','R23','R25','R26','R27','R28']
rows=[]
for f in b.GetFootprints():
 if f.GetReference() not in refs:continue
 pp=list(f.Pads());assert len(pp)==2
 lands=[shape(q,p.F_Cu) for q in pp];paste=[shape(q,p.F_Paste) for q in pp]
 assert abs(lands[0].area-lands[1].area)<.0001
 assert abs(paste[0].area-paste[1].area)<.0001
 pads=[]
 for q in pp:
  pos=xy(q.GetPosition());land=shape(q,p.F_Cu)
  entries=[t for t in tracks if t.GetLayer()==p.F_Cu and t.GetNetname()==q.GetNetname()
           and (xy(t.GetStart())==pos or xy(t.GetEnd())==pos)]
  assert len(entries)==1,(f.GetReference(),q.GetNumber(),len(entries))
  t=entries[0];other=xy(t.GetEnd()) if xy(t.GetStart())==pos else xy(t.GetStart())
  assert abs(t.GetWidth()/1e6-.2)<1e-6
  # The eight revised resistors are vertical: the sole launch points outward
  # along their long component axis, rather than sideways or through the body.
  assert abs(other[0]-pos[0])<.000002
  assert (other[1]-pos[1])*(pos[1]-xy(f.GetPosition())[1])>0
  edge_distance=Point(other).distance(land)
  assert edge_distance>=.249,(f.GetReference(),q.GetNumber(),edge_distance)
  launch=LineString([pos,other]);branch_distances=[edge_distance]
  for u in tracks:
   if u==t or u.GetLayer()!=p.F_Cu or u.GetNetname()!=q.GetNetname():continue
   for endpoint in [xy(u.GetStart()),xy(u.GetEnd())]:
    if math.dist(endpoint,pos)>.000002 and launch.distance(Point(endpoint))<.000002:
     branch_distances.append(Point(endpoint).distance(land))
  unbranched=min(branch_distances)
  assert unbranched>=.249,(f.GetReference(),q.GetNumber(),unbranched)
  hole_gap=min(land.distance(Point(xy(v.GetPosition())).buffer(v.GetDrillValue()/2e6)) for v in vias)
  assert hole_gap>=.249,(f.GetReference(),q.GetNumber(),hole_gap)
  pads.append({'pin':q.GetNumber(),'entry_width_mm':t.GetWidth()/1e6,'entry':'single outward axial top-layer neck',
    'neck_to_first_vertex_beyond_land_mm':round(edge_distance,4),'unbranched_neck_beyond_land_mm':round(unbranched,4),'nearest_via_hole_edge_gap_mm':round(hole_gap,4)})
 rows.append({'ref':f.GetReference(),'equal_copper_land_areas':True,'equal_paste_areas':True,'pads':pads})
aliases=json.loads((R/'net-aliases.json').read_text())
feedback=['VREF','OV_REF','FB_K','OV_K','FB_LED','OV_LED','COMP']
topology=[]
for name in feedback:
 net=aliases[name];ts=[t for t in tracks if t.GetNetname()==net]
 assert all(t.GetLayer()==p.F_Cu for t in ts),name
 assert not any(v.GetNetname()==net for v in vias),name
 topology.append({'net':name,'length_mm':round(sum(t.GetLength()/1e6 for t in ts),3),'segments':len(ts),'signal_vias':0,'layers':['F.Cu']})
report={'revision':'A14','native_board_sha256':hashlib.sha256((R/'kicad/PS-GAN-60W.kicad_pcb').read_bytes()).hexdigest(),
 'scope':'Eight low-current feedback/OVP resistors. Geometric assembly-risk reduction only, not equal thermal impedance, reflow validation or a no-tombstoning guarantee.',
 'sources':['https://www.eurocircuits.com/technical-guidelines/pcb-assembly-guidelines/tombstoning/','https://article.murata.com/en-eu/article/basics-of-capacitors-6'],
 'resistors':sorted(rows,key=lambda x:int(x['ref'][1:])),'local_feedback_routes':topology,
 'native_routing':{'segments':len(tracks),'length_mm':round(sum(t.GetLength()/1e6 for t in tracks),3),'vias':len(vias)}}
if len(sys.argv)>2:
 old=p.LoadBoard(str(Path(sys.argv[2])/'kicad/PS-GAN-60W.kicad_pcb'))
 ot=[t for t in old.GetTracks() if not isinstance(t,p.PCB_VIA)]
 report['baseline_A13']={'segments':len(ot),'length_mm':round(sum(t.GetLength()/1e6 for t in ot),3),'vias':sum(isinstance(t,p.PCB_VIA) for t in old.GetTracks()),
 'local_feedback_routes':[{'net':n,'length_mm':round(sum(t.GetLength()/1e6 for t in ot if t.GetNetname()==aliases[n]),3),'signal_vias':sum(isinstance(t,p.PCB_VIA) and t.GetNetname()==aliases[n] for t in old.GetTracks())} for n in feedback]}
(R/'evidence/passive-routing-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='resistors'},indent=2))
