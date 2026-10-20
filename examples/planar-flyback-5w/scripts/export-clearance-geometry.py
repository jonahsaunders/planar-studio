"""Export final PCB geometry for independent distance checks (read-only)."""
import json, hashlib
from pathlib import Path
import pcbnew as p
R=Path(__file__).resolve().parents[1]
F=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
b=p.LoadBoard(str(F))
def xy(v):return [p.ToMM(v.x),p.ToMM(v.y)]
def chain(c):return [xy(c.CPoint(i)) for i in range(c.PointCount())]
def poly(q):return [{'shell':chain(q.COutline(i)),'holes':[chain(q.CHole(i,j)) for j in range(q.HoleCount(i))]} for i in range(q.OutlineCount())]
def shape(o,l,margin=0):
    q=p.SHAPE_POLY_SET();o.TransformShapeToPolygon(q,l,margin,p.FromMM(.0001),p.ERROR_OUTSIDE)
    return poly(q)
outline=p.SHAPE_POLY_SET()
assert b.GetBoardPolygonOutlines(outline,False,None,False,False)
out={'board_sha256':hashlib.sha256(F.read_bytes()).hexdigest(),'outline':poly(outline),'pads':[],'mask':[],'drills':[],'routes':[]}
for f in b.GetFootprints():
    for pad in f.Pads():
        n=f'{f.GetReference()}.{pad.GetNumber()}'
        rec={'name':n,'net':pad.GetNetname(),'position':xy(pad.GetPosition()),'size':xy(pad.GetSize()),'angle':pad.GetOrientationDegrees(),'type':pad.GetAttribute()}
        out['pads'].append(rec)
        d=xy(pad.GetDrillSize())
        if max(d)>0:out['drills'].append({**rec,'drill':d})
        for l in [p.F_Mask,p.B_Mask]:
            if pad.IsOnLayer(l):out['mask'].append({**rec,'layer':b.GetLayerName(l),'expansion':p.ToMM(pad.GetSolderMaskExpansion(l)), 'geometry':shape(pad,p.F_Cu if l==p.F_Mask else p.B_Cu,pad.GetSolderMaskExpansion(l))})
    for i,g in enumerate(f.GraphicalItems()):
        if g.GetLayer() in [p.F_Mask,p.B_Mask]:out['mask'].append({'name':f'{f.GetReference()}.mask{i}','net':'','layer':b.GetLayerName(g.GetLayer()),'geometry':shape(g,g.GetLayer())})
for i,t in enumerate(b.GetTracks()):
    n=f'route{i}'
    if isinstance(t,p.PCB_VIA):
        rec={'name':n,'net':t.GetNetname(),'position':xy(t.GetPosition()),'drill':[p.ToMM(t.GetDrillValue())]*2,'angle':0}
        out['drills'].append(rec)
        for l in [p.F_Mask,p.B_Mask]:
            mode=t.GetFrontTentingMode() if l==p.F_Mask else t.GetBackTentingMode()
            if mode==p.TENTING_MODE_NOT_TENTED:out['mask'].append({**rec,'layer':b.GetLayerName(l),'geometry':shape(t,p.F_Cu if l==p.F_Mask else p.B_Cu)})
    else:out['routes'].append({'name':n,'net':t.GetNetname(),'layer':b.GetLayerName(t.GetLayer()),'width':p.ToMM(t.GetWidth()),'start':xy(t.GetStart()),'end':xy(t.GetEnd())})
for i,g in enumerate(b.GetDrawings()):
    if g.GetLayer() in [p.F_Mask,p.B_Mask]:out['mask'].append({'name':f'board.mask{i}','net':'','layer':b.GetLayerName(g.GetLayer()),'geometry':shape(g,g.GetLayer())})
dest=R/'.kicad-config/clearance-extras.json'
dest.write_text(json.dumps(out),encoding='utf8')
print(json.dumps({k:len(v) for k,v in out.items() if isinstance(v,list)}))
