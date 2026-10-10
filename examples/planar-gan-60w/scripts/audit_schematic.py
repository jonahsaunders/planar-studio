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
# Check that visible IC pins actually reach their drawn rectangular body.
def walk(n,k):
 return ([n] if n and str(n[0])==k else [])+sum((walk(v,k) for v in n if isinstance(v,list)),[]) if isinstance(n,list) else []
pin_gaps=[];boxed_pins=0
for lib in children(first(root,'lib_symbols'),'symbol'):
 rects=walk(lib,'rectangle')
 if len(rects)!=1:continue
 rect=rects[0];a=coord(first(rect,'start'));b=coord(first(rect,'end'))
 lo=(min(a[0],b[0]),min(a[1],b[1]));hi=(max(a[0],b[0]),max(a[1],b[1]))
 for pin in walk(lib,'pin'):
  if children(pin,'hide') or str(pin[1])=='no_connect':continue
  x,y,angle=first(pin,'at')[1:4];length=float(first(pin,'length')[1]);theta=math.radians(angle)
  end=(x+length*math.cos(theta),y+length*math.sin(theta));boxed_pins+=1
  touches=(lo[0]-1e-6<=end[0]<=hi[0]+1e-6 and lo[1]-1e-6<=end[1]<=hi[1]+1e-6 and min(abs(end[0]-lo[0]),abs(end[0]-hi[0]),abs(end[1]-lo[1]),abs(end[1]-hi[1]))<1e-6)
  if not touches:pin_gaps.append([lib[1],first(pin,'number')[1]])
assert not pin_gaps,pin_gaps
# An upward supply symbol must enter a rail or feed wiring below its attachment,
# rather than sit on a dangling wire that points back into the arrow.
supply_issues=[];supply_count=0
for symbol in children(root,'symbol'):
 libid=first(symbol,'lib_id')[1]
 if not libid.startswith('PS:PWR_') or libid in ['PS:PWR_AGND','PS:PWR_PGND','PS:PWR_SGND']:continue
 point=coord(first(symbol,'at'));supply_count+=1;directions=[]
 for a,b in wires:
  if on(point,a,b):
   directions += [(q[0]-point[0],q[1]-point[1]) for q in [a,b] if math.dist(q,point)>1e-6]
 if not any(abs(dx)>1e-6 or dy>1e-6 for dx,dy in directions):supply_issues.append([libid,point])
assert not supply_issues,supply_issues

parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']
report={'revision':'A6','source':'kicad/PS-GAN-60W.kicad_sch','method':'Parse actual wire segments and explicit junctions; count distinct incident directions at every endpoint and junction. Reject any connected four-direction node.','four_way_connections':four,'wire_segments':len(wires),'three_way_wire_nodes':t_nodes,'junction_dots':len(junctions),'orthogonal_wires_only':True,'manifest_parts':len(parts),'visible_boxed_IC_pins_checked':boxed_pins,'pin_to_body_gaps':pin_gaps,'positive_supply_symbols_checked':supply_count,'floating_or_reversed_supply_stubs':supply_issues}
(R/'evidence/schematic-geometry.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
