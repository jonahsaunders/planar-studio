"""Constrained octilinear cleanup of the explicit routes, before zone filling.

Keep all pad/via anchors and branch vertices. Candidates stay inside the original
route corridor and are screened against foreign pads, tracks and vias. KiCad DRC
and the winding/return-plane audits remain the final acceptance gates.
Executed in rebuild_board.py's namespace; requires Shapely.
"""
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from collections import defaultdict

def route_polygon(poly):
    def coords(c):return [(pcb.ToMM(c.CPoint(i).x),pcb.ToMM(c.CPoint(i).y)) for i in range(c.PointCount())]
    return unary_union([Polygon(coords(poly.Outline(i)),[coords(poly.Hole(i,j)) for j in range(poly.HoleCount(i))]) for i in range(poly.OutlineCount())])

def route_shape(q,l):
    poly=pcb.SHAPE_POLY_SET();q.TransformShapeToPolygon(poly,l,0,mm(.001),pcb.ERROR_OUTSIDE)
    return route_polygon(poly)

routes=[t for t in board.GetTracks() if not isinstance(t,pcb.PCB_VIA)]
obstacles=defaultdict(list)
for l in [F,I1,I2,I3,I4,I5,I6,B]:
    for f in board.GetFootprints():
        for q in f.Pads():
            if q.IsOnLayer(l):obstacles[l].append((q.GetNetname(),route_shape(q,l)))
    for t in board.GetTracks():
        if t.IsOnLayer(l):obstacles[l].append((t.GetNetname(),route_shape(t,l)))
foreign={}
def allowed(points,t):
    key=(t.GetLayer(),t.GetNetname())
    if key not in foreign:foreign[key]=unary_union([s for n,s in obstacles[key[0]] if n!=key[1]])
    return LineString(points).distance(foreign[key])>=pcb.ToMM(t.GetWidth())/2+.199

def oriented(a,b):
    dx,dy=abs(b[0]-a[0]),abs(b[1]-a[1])
    return min(dx,dy,abs(dx-dy))<.000002

def candidates(a,b):
    dx,dy=b[0]-a[0],b[1]-a[1];sx=1 if dx>0 else -1;sy=1 if dy>0 else -1
    d=min(abs(dx),abs(dy));major=abs(dx)-abs(dy)
    # Centered diagonal minimizes displacement from the original straight path.
    for fraction in [.5,0,1,.25,.75]:
        if major>=0:
            c=(a[0]+sx*major*fraction,a[1]);e=(c[0]+sx*d,c[1]+sy*d)
        else:
            c=(a[0],a[1]+sy*(-major)*fraction);e=(c[0]+sx*d,c[1]+sy*d)
        seq=[a,c,e,b];out=[]
        for q in seq:
            q=tuple(round(v,6) for v in q)
            if not out or math.dist(out[-1],q)>.000002:out.append(q)
        yield out

unresolved=[];converted=0
for t in routes:
    a,b=xy(t.GetStart()),xy(t.GetEnd())
    if oriented(a,b):continue
    options=[q for q in candidates(a,b) if allowed(q,t)]
    if not options:
        unresolved.append({'net':t.GetNetname(),'layer':board.GetLayerName(t.GetLayer()),'a':a,'b':b});continue
    seq=options[0];board.Remove(t)
    for a,b in zip(seq,seq[1:]):
        u=pcb.PCB_TRACK(t);u.SetUuid(pcb.KIID());u.SetNet(t.GetNet());u.SetLayer(t.GetLayer());u.SetWidth(t.GetWidth());u.SetStart(pt(*a));u.SetEnd(pt(*b));board.Add(u);intended_items.append((u,u.GetNetname()))
    converted+=1

# Chamfer isolated right-angle elbows; never trim a branch, pad anchor or via.
# Refresh blockers after moving the route segments so obsolete geometry cannot
# prevent a valid chamfer, and changed foreign routes are included in screening.
for l in [F,I1,I2,I3,I4,I5,I6,B]:
    obstacles[l]=[(q.GetNetname(),route_shape(q,l)) for f in board.GetFootprints() for q in f.Pads() if q.IsOnLayer(l)]
    obstacles[l]+=[(t.GetNetname(),route_shape(t,l)) for t in board.GetTracks() if t.IsOnLayer(l)]
foreign.clear()
anchors=set()
for f in board.GetFootprints():
    for q in f.Pads():anchors.add(tuple(xy(q.GetPosition())))
for t in board.GetTracks():
    if isinstance(t,pcb.PCB_VIA):anchors.add(tuple(xy(t.GetPosition())))
nodes=defaultdict(list)
for t in board.GetTracks():
    if isinstance(t,pcb.PCB_VIA):continue
    for q in [xy(t.GetStart()),xy(t.GetEnd())]:nodes[(t.GetLayer(),t.GetNetname(),q)].append(t)
chamfered=0
for (l,n,v),items in nodes.items():
    if len(items)!=2 or v in anchors:continue
    t,u=items
    if t.GetWidth()!=u.GetWidth():continue
    # Endpoints may have changed at the opposite end of the segment.
    if v not in [xy(t.GetStart()),xy(t.GetEnd())] or v not in [xy(u.GetStart()),xy(u.GetEnd())]:continue
    a=xy(t.GetEnd()) if xy(t.GetStart())==v else xy(t.GetStart())
    b=xy(u.GetEnd()) if xy(u.GetStart())==v else xy(u.GetStart())
    va=(a[0]-v[0],a[1]-v[1]);vb=(b[0]-v[0],b[1]-v[1]);la=math.hypot(*va);lb=math.hypot(*vb)
    if la<.02 or lb<.02 or abs(va[0]*vb[0]+va[1]*vb[1])/(la*lb)>1e-4:continue
    length=min(.7,max(.25,pcb.ToMM(t.GetWidth())),la*.4,lb*.4)
    for scale in [1,.6,.3]:
        d=length*scale
        if d<.025:continue
        c=tuple(round(v[i]+va[i]/la*d,6) for i in [0,1]);e=tuple(round(v[i]+vb[i]/lb*d,6) for i in [0,1])
        if not allowed([a,c,e,b],t):continue
        if xy(t.GetStart())==v:t.SetStart(pt(*c))
        else:t.SetEnd(pt(*c))
        if xy(u.GetStart())==v:u.SetStart(pt(*e))
        else:u.SetEnd(pt(*e))
        s=pcb.PCB_TRACK(t);s.SetUuid(pcb.KIID());s.SetNet(t.GetNet());s.SetLayer(t.GetLayer());s.SetWidth(t.GetWidth());s.SetStart(pt(*c));s.SetEnd(pt(*e));board.Add(s);intended_items.append((s,s.GetNetname()))
        chamfered+=1;break
(ROOT/'evidence/routing-cleanup.json').write_text(json.dumps({'converted_oblique_segments':converted,'chamfered_elbows':chamfered,'unresolved':unresolved},indent=2)+'\n')
print('Routing cleanup:',converted,'oblique segments;',chamfered,'elbows;',len(unresolved),'pending')
