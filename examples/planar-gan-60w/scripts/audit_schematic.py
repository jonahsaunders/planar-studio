"""Check actual native schematic geometry; requires sexpdata.

Checks junctions independently of the generator. KiCad ERC and the exported
netlist/manifest audit additionally check connectivity and component pin nets.
Unconnected wire crossings are permitted; four-branch connected nodes are not.
"""
from pathlib import Path
import json, math
import sexpdata as sx
R=Path(__file__).resolve().parents[1]
root=sx.loads((R/'kicad/PS-GAN-60W.kicad_sch').read_text(encoding='utf8'))
def children(n,k):return [x for x in n if isinstance(x,list) and x and str(x[0])==k]
def first(n,k):return children(n,k)[0]
def coord(n):return tuple(round(float(v),6) for v in n[1:3])
wires=[tuple(coord(p) for p in children(first(w,'pts'),'xy')) for w in children(root,'wire')]
junctions={coord(first(j,'at')) for j in children(root,'junction')}
ends={p for w in wires for p in w}
def on(p,a,b):
 return min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6 and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6 and abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-6
four=[];t_nodes=0
for point in ends|junctions:
 directions=set()
 for a,b in wires:
  if not on(point,a,b):continue
  for q in [a,b]:
   if math.dist(q,point)<1e-6:continue
   dx,dy=q[0]-point[0],q[1]-point[1]
   directions.add((int(dx>1e-6)-int(dx< -1e-6),int(dy>1e-6)-int(dy< -1e-6)))
 if len(directions)>=4:four.append(list(point))
 if len(directions)==3:t_nodes+=1
assert not four, four
assert all(abs(a[0]-b[0])<1e-6 or abs(a[1]-b[1])<1e-6 for a,b in wires)
parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']
report={'revision':'A3','source':'kicad/PS-GAN-60W.kicad_sch','method':'Parse actual wire segments and explicit junctions; count distinct incident directions at every endpoint and junction. Reject any connected four-direction node.','four_way_connections':four,'wire_segments':len(wires),'three_way_wire_nodes':t_nodes,'junction_dots':len(junctions),'orthogonal_wires_only':True,'manifest_parts':len(parts)}
(R/'evidence/schematic-geometry.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
