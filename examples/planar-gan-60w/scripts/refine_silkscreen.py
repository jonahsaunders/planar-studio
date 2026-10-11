"""Place readable legends outside solder openings and component courtyards.
Runs in the board generator. Uses actual stroke geometry, before CAM clipping.
"""
def silk_shape(item):
    poly=pcb.SHAPE_POLY_SET()
    if isinstance(item,pcb.PCB_TEXT):item.TransformTextToPolySet(poly,0,mm(.001),pcb.ERROR_OUTSIDE)
    else:item.TransformShapeToPolygon(poly,pcb.F_SilkS,0,mm(.001),pcb.ERROR_OUTSIDE)
    return route_polygon(poly)

mask=unary_union([route_shape(q,F).buffer(pcb.ToMM(q.GetSolderMaskExpansion(pcb.F_Mask))) for f in board.GetFootprints() for q in f.Pads() if q.IsOnLayer(pcb.F_Mask)])
body=unary_union([route_polygon(f.GetCourtyard(pcb.F_CrtYd)) for f in board.GetFootprints() if f.GetReference()!='T1'])
edges=unary_union([route_shape(s,pcb.Edge_Cuts) for s in board.GetDrawings() if s.GetLayer()==pcb.Edge_Cuts])
safe=Polygon([(53.7,56.7),(116.3,56.7),(116.3,111.3),(53.7,111.3)])
printed=[];moves=[]
# Keep the polarized-package pin-1 dots visible with at least 0.22 mm mask gap.
for f in board.GetFootprints():
    for g in f.GraphicalItems():
        if g.GetLayer()!=pcb.F_SilkS:continue
        if silk_shape(g).distance(mask)>=.22:printed.append(silk_shape(g));continue
        old=g.GetPosition();found=False
        for radius in [.1,.2,.3,.4,.5,.6]:
            for dx,dy in [(0,-1),(-1,0),(1,0),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                g.SetPosition(pt(pcb.ToMM(old.x)+radius*dx,pcb.ToMM(old.y)+radius*dy))
                s=silk_shape(g)
                if s.distance(mask)>=.22:
                    moves.append({'owner':f.GetReference(),'item':'pin-1 marker','position_mm':xy(g.GetPosition())});printed.append(s);found=True;break
            if found:break
        assert found,('No clear marker location',f.GetReference())

# Deliberate field locations; the bounded grid search below only resolves local
# clearance conflicts. Text stays horizontal and equal-sized, aligned to rows.
targets={'ISOLATED':(-2.6,36.5),'PRIMARY':(52.5,36.5),'OVP':(18.5,40.0),
 'U1 / GaN':(44,1.3),'U2 / LLC':(24.8,29.8),'U4 / BIAS':(42,47.8),
 'U5':(38.5,27.0),'IN  GND':(52.5,32.0),'FB':(18.5,31.0)}
legend('U3 / SR',-2.7,8.5,1)
legend('Q1',8.2,4.0,1);legend('Q2',8.2,25.6,1)
for g in sorted(list(board.GetDrawings()),key=lambda q:0 if isinstance(q,pcb.PCB_TEXT) and q.GetText().startswith(('PLANAR','PS-GAN')) else 1):
    if not isinstance(g,pcb.PCB_TEXT) or g.GetLayer()!=pcb.F_SilkS:continue
    name=g.GetText();old=xy(g.GetPosition());start=targets.get(name,(old[0]-60,old[1]-60))
    if name in ['+','-']:
        if old[0]<80:start=(-3.0,11.3 if name=='-' else 25.7)
        else:start=(47.3,15.96 if name=='+' else 21.04)
    start=(start[0]+60,start[1]+60)
    offsets=[(0,0)]+sorted([(x*.25,y*.25) for x in range(-12,13) for y in range(-12,13) if x or y],key=lambda d:(math.hypot(*d)+(.15 if all(d) else 0),abs(d[1]),abs(d[0])))
    found=False
    for dx,dy in offsets:
        g.SetPosition(pt(start[0]+dx,start[1]+dy));s=silk_shape(g)
        if not safe.contains(s) or s.distance(mask)<.22 or s.distance(body)<.1 or s.distance(edges)<.3:continue
        if any(s.distance(v)<.3 for v in printed):continue
        printed.append(s);found=True;break
    assert found,('No clear legend location',name)
    moves.append({'owner':'board','item':name,'position_mm':xy(g.GetPosition())})
(ROOT/'evidence/silkscreen-placement.json').write_text(json.dumps({'revision':'A13','mask_clearance_target_mm':.22,'text_to_courtyard_target_mm':.1,'items':moves},indent=2)+'\n')
