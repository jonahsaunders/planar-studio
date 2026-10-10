from pathlib import Path
import pcbnew as p
import json,math,heapq,hashlib,sys
R=Path(__file__).resolve().parents[1];old=Path(sys.argv[1])
a=p.LoadBoard(str(old/'kicad/PS-GAN-60W.kicad_pcb'));b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
layers=[p.F_Cu,p.In1_Cu,p.In2_Cu,p.In3_Cu,p.In4_Cu,p.In5_Cu,p.In6_Cu,p.B_Cu]
def xy(v):return (round(p.ToMM(v.x),4),round(p.ToMM(v.y),4))
def pads(board):return {(f.GetReference(),q.GetNumber()):q for f in board.GetFootprints() for q in f.Pads()}
def route(board,start,end):
 ps=pads(board);sp=ps[start];ep=ps[end];assert sp.GetNetname()==ep.GetNetname(),(start,end)
 g={}
 def edge(u,v,d,n):g.setdefault(u,[]).append((v,d,n));g.setdefault(v,[]).append((u,d,n))
 for t in board.GetTracks():
  if t.GetNetname()!=sp.GetNetname():continue
  x,y=xy(t.GetStart())
  if isinstance(t,p.PCB_VIA):
   for l in layers:
    for k in layers:
     if l<k:edge((x,y,l),(x,y,k),0,1)
  else:
   X,Y=xy(t.GetEnd());edge((x,y,t.GetLayer()),(X,Y,t.GetLayer()),math.hypot(X-x,Y-y),0)
 start=(*xy(sp.GetPosition()),p.F_Cu);end=(*xy(ep.GetPosition()),p.F_Cu)
 q=[(0.,0,start)];best={start:(0.,0)}
 while q:
  d,n,u=heapq.heappop(q)
  if (d,n)!=best[u]:continue
  if u==end:return {'trace_length_mm':round(d,3),'through_via_transitions':n}
  for v,dd,nn in g.get(u,[]):
   val=(d+dd,n+nn)
   if val<best.get(v,(float('inf'),999)):best[v]=val;heapq.heappush(q,(*val,v))
 raise RuntimeError((start,end,'No explicit track path'))
pairs=[('GaN bootstrap HB',('U1','10'),('C4','1')),('GaN bootstrap HS',('U1','11'),('C4','2')),('GaN VCC bypass',('U1','14'),('C6','1')),('GaN AGND bypass',('U1','15'),('C6','2')),('Bias switch to inductor',('U4','8'),('L2','1')),('Bias bootstrap',('U4','7'),('C20','1')),('High-side divider to GaN',('R5','1'),('U1','12')),('Low-side divider to GaN',('R7','1'),('U1','13'))]
metrics=[]
for title,start,end in pairs:
 m={'path':title,'from':'.'.join(start),'to':'.'.join(end),'A3':route(a,start,end),'A4':route(b,start,end)};metrics.append(m)
pa=json.loads((old/'circuit.json').read_text())['parts'];pb=json.loads((R/'circuit.json').read_text())['parts']
assert len(pa)==len(pb)==82
netchanges=[]
for x,y in zip(pa,pb):
 for key in ['ref','value','footprint','mpn','lcsc']:assert x[key]==y[key],(key,x['ref'])
 for pin,net in x['nets'].items():
  if y['nets'][pin]!=net:netchanges.append([x['ref'],pin,net,y['nets'][pin]])
assert sorted(netchanges)==sorted([['U1','11','SW','HS_LOCAL'],['C4','2','SW','HS_LOCAL']]),netchanges
for name in ['Planar_ELP22_4_2_2.kicad_mod','MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod']:
 assert (old/'kicad/PS.pretty'/name).read_bytes()==(R/'kicad/PS.pretty'/name).read_bytes()
af={f.GetReference():f for f in a.GetFootprints()};bf={f.GetReference():f for f in b.GetFootprints()}
for ref in ['T1','H1','H2','H3','H4','J1','J2']:
 assert af[ref].GetPosition()==bf[ref].GetPosition() and af[ref].GetOrientationDegrees()==bf[ref].GetOrientationDegrees(),ref
vs=pads(b)[('U3','5')];sense=vs.GetPosition()
zones=[z for z in b.Zones() if z.GetNetname()==vs.GetNetname()]
assert all(not z.Outline().Contains(sense) for z in zones),'VSS must enter its dedicated trace, not a ground pour'
moved=[ref for ref in af if af[ref].GetPosition()!=bf[ref].GetPosition() or af[ref].GetOrientationDegrees()!=bf[ref].GetOrientationDegrees()]
report={'revision':'A6 schematic / A4 hardware','comparison':'A5 schematic / A3 hardware','method':'Shortest path through explicit native track/via endpoints; trace length in XY, excluding vertical barrel distance and pours. Via count is layer transitions along that path. Geometric comparison, not extracted loop inductance or performance measurement.','paths':metrics,'moved_parts':sorted(moved),'part_identities_values_footprints_unchanged':True,'intentional_pin_net_changes':netchanges,'winding_artwork_mounting_footprints_and_connector_mount_positions_unchanged':True,'U3_VSS_excluded_from_all_SGND_zone_outlines':True,'routed_vias_before':sum(isinstance(t,p.PCB_VIA) for t in a.GetTracks()),'routed_vias_after':sum(isinstance(t,p.PCB_VIA) for t in b.GetTracks()),'qualification':'unbuilt; no measured efficiency, switching loss, AC magnetics loss or temperature'}
(R/'evidence/A6-layout-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
