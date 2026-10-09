"""Independently bound A5 changes to the 2 W snubber and nearby routing."""
import hashlib,json,subprocess,tempfile
from collections import Counter
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
BASE='d50da5e73e18db090fe29968531e7b02828afc73'
def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=R)
def read(name):return json.loads((R/name).read_text())
def point(p):return p.x,p.y
def pads(f):return sorted((p.GetNumber(),p.GetNetname(),point(p.GetPosition()),point(p.GetSize()),point(p.GetDrillSize()),p.GetOrientationDegrees(),p.GetLayerSet().FmtHex()) for p in f.Pads())
def polygons(f):
 out=[]
 for g in f.GraphicalItems():
  if g.GetLayer() in [pcb.F_Cu,pcb.In1_Cu,pcb.In4_Cu,pcb.B_Cu]:
   q=g.GetPolyShape();out.append((g.GetLayer(),tuple(tuple(point(q.COutline(i).CPoint(j)) for j in range(q.COutline(i).PointCount())) for i in range(q.OutlineCount()))))
 return sorted(out)
def routes(b):
 out=[]
 for t in b.GetTracks():
  if isinstance(t,pcb.PCB_VIA):out.append(('via',t.GetNetname(),point(t.GetPosition()),t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()))
  else:out.append(('track',t.GetNetname(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())])),t.GetWidth(),t.GetLayer()))
 return Counter(out)
def geom(g):return g.GetShape(),g.GetLayer(),point(g.GetStart()),point(g.GetEnd()),point(g.GetArcMid()),g.GetWidth()
# Electronic topology and every unrelated part must remain identical.
a=json.loads(old('circuit.json'));b=read('circuit.json')
allowed={'value','mpn','mfr','lcsc','source','purpose','footprint','source_footprint'}
changes=[]
for x,y in zip(a['parts'],b['parts']):
 assert x['ref']==y['ref']
 keys={k for k in x.keys()|y.keys() if x.get(k)!=y.get(k)}
 if keys:assert x['ref']=='R6' and keys==allowed;changes=sorted(keys)
assert len(a['parts'])==len(b['parts'])==29
assert {k:v for k,v in a.items() if k!='parts'}=={k:v for k,v in b.items() if k!='parts'}
p=read('parts.json');op=json.loads(old('parts.json'))
assert {k:v for k,v in p.items() if k!='R6'}=={k:v for k,v in op.items() if k!='R6'}
r=p['R6'];assert r['mpn']=='CRH2512F39R0E04Z' and r['lcsc']=='C175263' and r['resistance_ohm']==39 and r['power_rating_W_at_70C']==2
assert r['footprint']=='Flyback:R_EverOhms_CRH2512'
unchanged=['planar-studio/T1-artwork.json','planar-studio/T1-config.json','planar-studio/T1.planar.json','evidence/winding-model.json','stackup.json','mechanical.json']
for name in unchanged:assert json.loads(old(name))==read(name),(name,'changed')
with tempfile.TemporaryDirectory(dir=R/'.kicad-config') as temp:
 f=Path(temp)/'baseline.kicad_pcb';f.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
 before=pcb.LoadBoard(str(f));after=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'))
 bf={f.GetReference():f for f in before.GetFootprints()};af={f.GetReference():f for f in after.GetFootprints()}
 assert bf.keys()==af.keys()
 for ref in bf:
  assert bf[ref].GetOrientationDegrees()==af[ref].GetOrientationDegrees(),ref
  if ref not in ['R6','D4']:
   assert point(bf[ref].GetPosition())==point(af[ref].GetPosition()) and pads(bf[ref])==pads(af[ref]),ref
 assert polygons(bf['T1'])==polygons(af['T1'])
 for ref,expected in [('R6',(107.2,68.4)),('D4',(113.5,65.9))]:assert point(af[ref].GetPosition())==tuple(pcb.FromMM(x) for x in expected)
 for a,b in zip(pads(bf['D4']),pads(af['D4'])):
  assert a[:2]==b[:2] and (a[2][0]+pcb.FromMM(4.5),a[2][1])==b[2] and a[3:]==b[3:]
 for pad in af['R6'].Pads():
  assert point(pad.GetSize())==(pcb.FromMM(1.6),pcb.FromMM(3.4))
  x=110.45 if pad.GetNumber()=='1' else 103.95
  assert point(pad.GetPosition())==(pcb.FromMM(x),pcb.FromMM(68.4))
 assert sorted(geom(d) for d in before.GetDrawings() if d.GetLayer()==pcb.Edge_Cuts)==sorted(geom(d) for d in after.GetDrawings() if d.GetLayer()==pcb.Edge_Cuts)
 assert before.GetCopperLayerCount()==after.GetCopperLayerCount()==6
 assert before.GetDesignSettings().GetBoardThickness()==after.GetDesignSettings().GetBoardThickness()
 removed=routes(before)-routes(after);added=routes(after)-routes(before)
 expected_moves=[((114,63),(115.5,63)),((114,68),(115.5,68)),((112,68),(115.5,69))]
 for records,index in [(removed,0),(added,1)]:
  actual=[]
  for t,count in records.items():
   if t[0]=='via':
    assert count==1 and t[1]=='/PGND' and t[3:]==(600000,300000,pcb.F_Cu,pcb.B_Cu),t
    actual.append(t[2])
   else:
    assert t[1] in ['/VIN','/SNUB','/CLAMP'] and t[4]==pcb.F_Cu,t
    assert t[3] in [600000,1000000,1200000],t
    assert all(98.5e6<=x<=117e6 and 62e6<=y<=72.5e6 for x,y in t[2]),t
  assert sorted(actual)==sorted(tuple(pcb.FromMM(x) for x in pair[index]) for pair in expected_moves),actual
 # Filled-pour changes must also remain in the local snubber region.
 local=pcb.SHAPE_POLY_SET();local.NewOutline()
 for x,y in [(98.5,62),(117,62),(117,72.5),(98.5,72.5)]:local.Append(pcb.FromMM(x),pcb.FromMM(y))
 bz={(z.GetNetname(),z.GetLayer()):z for z in before.Zones()};az={(z.GetNetname(),z.GetLayer()):z for z in after.Zones()}
 assert bz.keys()==az.keys()
 for key in bz:
  x,y=bz[key],az[key];assert x.Outline().Format()==y.Outline().Format()
  for u,v in [(x,y),(y,x)]:
   difference=pcb.SHAPE_POLY_SET(u.GetFilledPolysList(u.GetLayer()))
   difference.BooleanSubtract(v.GetFilledPolysList(v.GetLayer()))
   difference.BooleanSubtract(local)
   assert difference.Area()==0,(key,'Ground pour changed outside local snubber region',difference.Area())
drc=read('evidence/board-drc.json');assert not any(drc[k] for k in ['violations','unconnected_items','schematic_parity'])
report={'revision':'A5-development','baseline_commit':BASE,'status':'PASS','changed_R6_fields':changes,
 'unchanged_electrical_topology':True,'unchanged_other_parts':True,'unchanged_winding_stack_and_mechanics':unchanged,
 'unchanged_component_poses_and_pads_except':['R6','D4'],'R6_land_size_mm':[1.6,3.4],'R6_land_pitch_mm':6.5,
 'ground_stitch_moves_mm':expected_moves,'route_segments_removed':sum(v for t,v in removed.items() if t[0]=='track'),'route_segments_added':sum(v for t,v in added.items() if t[0]=='track'),
 'routing_and_pour_change_bounds_mm':[98.5,62,117,72.5], 'unchanged_outline_and_mounting_geometry':True,
 'scope':'Geometric change containment and connectivity; no thermal, repetitive-pulse or hardware qualification.',
 'source_SHA256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in ['kicad/PS-FLYBACK-5W.kicad_pcb','circuit.json','parts.json','layout.json','scripts/verify-snubber-revision.py']}}
(R/'evidence/audit/snubber-revision-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
