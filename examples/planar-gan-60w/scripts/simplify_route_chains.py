"""Remove obsolete waypoints from complete, unbranched native route chains.

Preserve terminals, vias, branches, widths and layers. Shorter candidates must
remain within 0.8 mm of the old corridor and clear all foreign native copper.
This is geometric cleanup, followed by native DRC and reference-plane audits.
Executed after the octilinear conversion, in rebuild_board.py's namespace.
"""
def direction(a,b):
    return round(math.atan2(b[1]-a[1],b[0]-a[0])/(math.pi/4))%8

def turn(a,b):
    d=abs(a-b);return min(d,8-d)

def cost(points):
    dirs=[direction(a,b) for a,b in zip(points,points[1:])]
    length=sum(math.dist(a,b) for a,b in zip(points,points[1:]))
    bends=sum(a!=b for a,b in zip(dirs,dirs[1:]))
    return length,bends

tracks=[t for t in board.GetTracks() if not isinstance(t,pcb.PCB_VIA)]
nodes=defaultdict(list)
for t in tracks:
    key=(t.GetLayer(),t.GetNetname(),t.GetWidth())
    for q in [xy(t.GetStart()),xy(t.GetEnd())]:nodes[(*key,q)].append(t)
protected=set(anchors)
# An endpoint touching the interior of a same-net segment is a branch, even
# when the CAD segment was never split there. Keep both segment endpoints.
for t in tracks:
    a,b=xy(t.GetStart()),xy(t.GetEnd());line=LineString([a,b])
    for u in tracks:
        if u==t or u.GetLayer()!=t.GetLayer() or u.GetNetname()!=t.GetNetname():continue
        for q in [xy(u.GetStart()),xy(u.GetEnd())]:
            if q not in [a,b] and line.distance(Point(q))<.000002:
                protected.update([a,b,q])

visited=set();chains=[]
pad_launch={}
for f in board.GetFootprints():
    if not f.GetReference().startswith(('R','C')):continue
    pp=[q for q in f.Pads() if q.GetNumber()]
    if len(pp)!=2:continue
    for q,other in [pp,pp[::-1]]:
        pad_launch[xy(q.GetPosition())]=direction(xy(other.GetPosition()),xy(q.GetPosition()))
for t in tracks:
    if t.m_Uuid.AsString() in visited:continue
    key=(t.GetLayer(),t.GetNetname(),t.GetWidth())
    def terminal(q):return q in protected or len(nodes[(*key,q)])!=2
    ends=[q for q in [xy(t.GetStart()),xy(t.GetEnd())] if terminal(q)]
    if not ends:continue
    points=[ends[0]];items=[];u=t
    while True:
        uid=u.m_Uuid.AsString()
        if uid in visited:break
        visited.add(uid);items.append(u)
        a,b=xy(u.GetStart()),xy(u.GetEnd());q=b if a==points[-1] else a
        points.append(q)
        if terminal(q):break
        u=next(v for v in nodes[(*key,q)] if v.m_Uuid.AsString()!=uid)
    if len(items)>1:chains.append((items,points))

changes=[]
mechanical=json.loads((ROOT/'mechanical.json').read_text())
mount_centers=[Point(53+h['x_mm'],56+h['y_mm']) for h in mechanical['holes']]
edge_shapes=unary_union([route_shape(s,pcb.Edge_Cuts) for s in board.GetDrawings() if s.GetLayer()==pcb.Edge_Cuts])
for items,points in chains:
    t=items[0];key=(t.GetLayer(),t.GetNetname())
    reference=None
    # Keep GD1 within its deliberate reference corridor. Actual filled-plane
    # coverage (including antipads and switch-node exclusions) is audited later.
    if key==(I4,nets['GD1'].GetNetname()):
        reference=unary_union([route_polygon(z.Outline()) for z in board.Zones()
            if z.GetLayer() in [I3,I5] and z.GetNetname()==nets['AGND'].GetNetname()])
        switch_projection=unary_union([route_shape(q,F).buffer(.251) for f in board.GetFootprints()
            for q in f.Pads() if q.GetNetname()==nets['SW'].GetNetname()]+
            [route_shape(q,F).buffer(.251) for q in board.GetTracks()
             if q.GetNetname()==nets['SW'].GetNetname() and not isinstance(q,pcb.PCB_VIA)])
        reference=reference.difference(switch_projection)
    # Rebuild blockers for each net after any earlier net was improved.
    blocker=unary_union([route_shape(q,key[0]) for f in board.GetFootprints()
        for q in f.Pads() if q.IsOnLayer(key[0]) and q.GetNetname()!=key[1]]+
        [route_shape(q,key[0]) for q in board.GetTracks()
         if q.IsOnLayer(key[0]) and q.GetNetname()!=key[1]])
    corridor=LineString(points).buffer(.80001)
    n=len(points);states=[{} for _ in points];states[0][None]=(0.,[points[0]])
    width=pcb.ToMM(t.GetWidth())
    for i in range(n-1):
        if not states[i]:continue
        for j in range(i+1,n):
            options=[[points[i],points[j]]] if oriented(points[i],points[j]) else list(candidates(points[i],points[j]))
            for seq in options:
                if not corridor.covers(LineString(seq)):continue
                if reference is not None and not reference.covers(LineString(seq)):continue
                if LineString(seq).distance(blocker)<width/2+.199:continue
                if any(LineString(seq).distance(h)<5+width/2 for h in mount_centers):continue
                if LineString(seq).distance(edge_shapes)<.25+width/2:continue
                dirs=[direction(a,b) for a,b in zip(seq,seq[1:])]
                if any(turn(a,b)>1 for a,b in zip(dirs,dirs[1:])):continue
                if i==0 and points[0] in anchors:
                    ok={direction(points[0],points[1])}
                    if points[0] in pad_launch:ok.add(pad_launch[points[0]])
                    if dirs[0] not in ok:continue
                if j==n-1 and points[-1] in anchors:
                    ok={direction(points[-2],points[-1])}
                    if points[-1] in pad_launch:ok.add((pad_launch[points[-1]]+4)%8)
                    if dirs[-1] not in ok:continue
                length,bends=cost(seq)
                for prev,(score,path0) in list(states[i].items()):
                    if prev is not None and turn(prev,dirs[0])>1:continue
                    score1=score+length+.65*(bends+(prev is not None and prev!=dirs[0]))
                    if score1 < states[j].get(dirs[-1],(float('inf'),))[0]-.000001:
                        states[j][dirs[-1]]=(score1,path0+seq[1:])
    if not states[-1]:continue
    seq=min(states[-1].values(),key=lambda x:x[0])[1]
    # Collapse collinear joins created by the graph, without changing geometry.
    clean=[]
    for q in seq:
        if len(clean)>1 and direction(clean[-2],clean[-1])==direction(clean[-1],q):clean.pop()
        clean.append(q)
    before,b0=cost(points);after,b1=cost(clean)
    if after>before+.00001 or (b1>=b0 and after>=before-.05):continue
    # Launch screening above permits the old approach or an outward axial
    # entry into a two-terminal passive. Never replace it with a corner entry.
    for u in items:board.Remove(u)
    for a,b in zip(clean,clean[1:]):
        u=pcb.PCB_TRACK(board);u.SetNet(t.GetNet());u.SetLayer(t.GetLayer());u.SetWidth(t.GetWidth());u.SetStart(pt(*a));u.SetEnd(pt(*b));board.Add(u);intended_items.append((u,u.GetNetname()))
    changes.append({'net':key[1],'layer':board.GetLayerName(key[0]),'before_mm':round(before,4),'after_mm':round(after,4),'before_bends':b0,'after_bends':b1,'before':points,'after':clean})
# A formerly branched boundary can become a free elbow after a neighboring
# collinear chain is consolidated. Finish those two-segment joins as well.
final_nodes=defaultdict(list)
for t in board.GetTracks():
    if isinstance(t,pcb.PCB_VIA):continue
    for q in [xy(t.GetStart()),xy(t.GetEnd())]:final_nodes[(t.GetLayer(),t.GetNetname(),q)].append(t)
final_chamfers=0
for (l,n,v),ts in final_nodes.items():
    if v in anchors or len(ts)!=2:continue
    t,u=ts
    if t.GetWidth()!=u.GetWidth():continue
    a=xy(t.GetEnd()) if xy(t.GetStart())==v else xy(t.GetStart())
    b=xy(u.GetEnd()) if xy(u.GetStart())==v else xy(u.GetStart())
    va=(a[0]-v[0],a[1]-v[1]);vb=(b[0]-v[0],b[1]-v[1]);la=math.hypot(*va);lb=math.hypot(*vb)
    if min(la,lb)<.1 or abs(va[0]*vb[0]+va[1]*vb[1])/(la*lb)>.00001:continue
    d=min(.3,la*.3,lb*.3)
    c=tuple(round(v[i]+d*va[i]/la,6) for i in [0,1]);e=tuple(round(v[i]+d*vb[i]/lb,6) for i in [0,1])
    blockers=unary_union([route_shape(q,l) for f in board.GetFootprints() for q in f.Pads() if q.IsOnLayer(l) and q.GetNetname()!=n]+[route_shape(q,l) for q in board.GetTracks() if q.IsOnLayer(l) and q.GetNetname()!=n])
    if LineString([a,c,e,b]).distance(blockers)<pcb.ToMM(t.GetWidth())/2+.199:continue
    if xy(t.GetStart())==v:t.SetStart(pt(*c))
    else:t.SetEnd(pt(*c))
    if xy(u.GetStart())==v:u.SetStart(pt(*e))
    else:u.SetEnd(pt(*e))
    s=pcb.PCB_TRACK(board);s.SetNet(t.GetNet());s.SetLayer(l);s.SetWidth(t.GetWidth());s.SetStart(pt(*c));s.SetEnd(pt(*e));board.Add(s);intended_items.append((s,n));final_chamfers+=1
(ROOT/'evidence/route-chain-cleanup.json').write_text(json.dumps({'corridor_radius_mm':.8,'chains_examined':len(chains),'changes':changes,'boundary_chamfers':final_chamfers},indent=2)+'\n')
print('Complete-chain cleanup:',len(changes),'chains;',sum(x['before_bends']-x['after_bends'] for x in changes),'bends removed')
