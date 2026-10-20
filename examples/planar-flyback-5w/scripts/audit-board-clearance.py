"""Independent checks on saved PCB copper/holes/mask/outline; millimetres."""
import json,hashlib,itertools,math
from pathlib import Path
from collections import defaultdict
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union,nearest_points
from shapely.affinity import rotate,translate
R=Path(__file__).resolve().parents[1]
W=R/'.kicad-config'
d=json.loads((R/'.kicad-config/copper-audit-geometry.json').read_text())
x=json.loads((W/'clearance-extras.json').read_text())
assert d['board_sha256']==x['board_sha256']==hashlib.sha256((R/'kicad/PS-FLYBACK-5W.kicad_pcb').read_bytes()).hexdigest()
def geom(ps):
    g=unary_union([Polygon(q['shell'],q['holes']) for q in ps]);h=g.buffer(0)
    assert abs(g.area-h.area)<1e-7
    return h
def record(g,h,**kw):return {'gap_mm':g.distance(h),'points_mm':[list(v.coords)[0] for v in nearest_points(g,h)],**kw}
def group(n):
    if n in ['/VIN','/SW','unconnected-(T1-P_MID-Pad5)']:return 'PRIMARY'
    if n in ['/SEC_A','/GND_ISO']:return 'SECONDARY'
    return n
items={i['name']:i for i in d['items']}
gs={(i['name'],l):geom(ps) for i in d['items'] for l,ps in i['geometry'].items()}
edges=geom(x['outline']).boundary
out={'board_sha256':d['board_sha256'],'geometry_approximation_mm':.0001,'counts':{'copper_items':len(items),'copper_item_layers':len(gs),'drilled_holes':len(x['drills']),'mask_objects':len(x['mask'])}}
ordinary=[];isolated=[];edge=[];outside=[]
for (n,l),g in gs.items():
    edge.append(record(g,edges,item=n,layer=l))
    if not geom(x['outline']).buffer(.0002).covers(g):outside.append([n,l])
for ((n,l),g),((m,ll),h) in itertools.combinations(gs.items(),2):
    if l!=ll:continue
    a,b=items[n],items[m]
    if a['kind']=='graphic' or b['kind']=='graphic':continue
    if a['net']!=b['net']:ordinary.append(record(g,h,items=[n,m],nets=[a['net'],b['net']],layer=l))
    if (group(a['net'])=='PRIMARY' and group(b['net'])=='SECONDARY') or (group(b['net'])=='PRIMARY' and group(a['net'])=='SECONDARY'):
        isolated.append(record(g,h,items=[n,m],layer=l))
def smallest(rs,n=20):return sorted(rs,key=lambda r:r['gap_mm'])[:n]
out['ordinary_copper_nearest']=smallest(ordinary)
out['ordinary_copper_below_0_199_mm']=[r for r in ordinary if r['gap_mm']<.199]
out['edge_nearest']=smallest(edge)
out['copper_outside_board']=outside
out['primary_secondary_nearest_excluding_winding_graphics']=smallest(isolated,8)
holes={}
for a in x['drills']:
    dx,dy=a['drill'];rr=min(dx,dy)/2;length=abs(dx-dy)/2
    s=LineString([(-length,0),(length,0)]) if dx>=dy else LineString([(0,-length),(0,length)])
    g=s.buffer(rr,quad_segs=128) if length>0 else Point(0,0).buffer(rr,quad_segs=128)
    holes[a['name']]=translate(rotate(g,-a['angle'],origin=(0,0)),*a['position'])
dh=[];hc=[];he=[]
drills={a['name']:a for a in x['drills']}
for (n,g),(m,h) in itertools.combinations(holes.items(),2):dh.append(record(g,h,items=[n,m]))
for n,h in holes.items():
    he.append(record(h,edges,item=n))
    for (m,l),g in gs.items():
        if n==m:continue
        other=items[m]
        # Net-tie copper joins only the intended terminals on each layer.
        intended={'F.Cu':['T1.1','T1.5'],'B.Cu':['T1.2','T1.5'],'In1.Cu':['T1.3','T1.4'],'In4.Cu':['T1.3','T1.4']}
        if other['kind']=='graphic' and n in intended.get(l,[]):continue
        if other['kind']!='graphic' and other['net']==drills[n]['net']:continue
        hc.append(record(h,g,hole=n,copper=m,layer=l,nets=[drills[n]['net'],other['net']]))
out['hole_to_hole_nearest']=smallest(dh,10)
out['hole_to_foreign_copper_nearest']=smallest(hc,12)
out['hole_to_foreign_copper_below_0_299_mm']=[r for r in hc if r['gap_mm']<.299]
out['hole_to_edge_nearest']=smallest(he,8)
masks={(i['name'],i['layer']):geom(i['geometry']) for i in x['mask']}
maskitems={(i['name'],i['layer']):i for i in x['mask']}
webs=[];exposed=[];foreignmask=[]
for ((n,l),g),((m,ll),h) in itertools.combinations(masks.items(),2):
    if l==ll and n!=m:
        a,b=maskitems[n,l],maskitems[m,ll]
        if a['net']!=b['net'] and a['net'] and b['net']:webs.append(record(g,h,items=[n,m],layer=l))
for (n,l),g in masks.items():
    a=maskitems[n,l];cl='F.Cu' if l=='F.Mask' else 'B.Cu'
    if not a['net']:continue
    for (m,ll),h in gs.items():
        if ll!=cl or n==m or items[m]['net']==a['net']:continue
        if items[m]['kind']=='graphic' and n in {'F.Cu':['T1.1','T1.5'],'B.Cu':['T1.2','T1.5']}.get(cl,[]):continue
        row=record(g,h,mask=n,copper=m,layer=l,nets=[a['net'],items[m]['net']])
        foreignmask.append(row)
        if g.intersection(h).area>1e-7:exposed.append(row)
out['mask_web_nearest_between_different_nets']=smallest(webs,12)
out['mask_to_foreign_copper_nearest']=smallest(foreignmask,16)
out['mask_exposes_foreign_copper']=exposed
# Morphological screen for narrow copper necks after removal of actual drill voids.
# Report only previously connected regions that become multiple substantial pieces.
necks=[]
for l in sorted({l for n,l in gs}):
    un=unary_union([g for (n,ll),g in gs.items() if ll==l]).difference(unary_union(list(holes.values())))
    for k,g in enumerate(un.geoms if hasattr(un,'geoms') else [un]):
        for width in [.15,.2,.24]:
            shrunk=g.buffer(-width/2,quad_segs=32)
            pieces=[v for v in (shrunk.geoms if hasattr(shrunk,'geoms') else [shrunk]) if v.area>.01]
            if len(pieces)>1:necks.append({'layer':l,'component':k,'eroded_diameter_mm':width,'pieces':len(pieces),'bounds':[list(v.bounds) for v in pieces]})
out['erosion_neck_screen']=necks
out['scope']='Distances in saved nominal CAD; no component conduction or tolerance/thermal/voltage qualification. Edge outlines approximated by KiCad. Ordinary comparisons exclude winding graphics (separate winding-specific checks). Mask shapes independently reconstructed from native pads/margins and explicit mask graphics; final mask Gerbers checked separately.'
assert not out['ordinary_copper_below_0_199_mm'] and not out['copper_outside_board']
assert min(r['gap_mm'] for r in edge)>=.499
assert min(r['gap_mm'] for r in hc)>=.299
assert min(r['gap_mm'] for r in dh)>=.249
assert min(r['gap_mm'] for r in webs)>=.099
assert min(r['gap_mm'] for r in foreignmask)>=.089
assert not exposed
out['status']='PASS'
(R/'evidence/audit/board-clearance-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:(len(v) if 'below' in k or k in ['mask_exposes_foreign_copper','copper_outside_board'] else v[:3]) if isinstance(v,list) else v for k,v in out.items()},indent=2))
