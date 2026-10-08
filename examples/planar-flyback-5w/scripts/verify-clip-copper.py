"""Check a conservative clip metal shadow against every saved copper layer."""
import hashlib,json
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1];file=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
board=pcb.LoadBoard(str(file));layers=[pcb.F_Cu,pcb.In1_Cu,pcb.In2_Cu,pcb.In3_Cu,pcb.In4_Cu,pcb.B_Cu]
# Full hook/body projection, wider than TDK nominal CAD (inner x8.5211,
# outer x11.8, strip2.3). Include 0.5 mm lateral float of the whole pair.
rects=[[-13.1,-1.7,-7.7,1.7],[7.7,-1.7,13.1,1.7]]
results=[]
for layer in layers:
    shapes=[]
    for t in board.GetTracks():
        if t.IsOnLayer(layer):shapes.append(t.GetEffectiveShape(layer))
    for f in board.GetFootprints():
        for p in f.Pads():
            if p.GetAttribute()!=pcb.PAD_ATTRIB_NPTH and p.IsOnLayer(layer):shapes.append(p.GetEffectiveShape(layer))
        for g in f.GraphicalItems():
            if g.GetLayer()==layer:shapes.append(g.GetEffectiveShape())
    for z in board.Zones():
        if z.IsOnLayer(layer) and not z.GetIsRuleArea():shapes.append(z.GetFilledPolysList(layer))
    minima=[]
    for a,b,c,d in rects:
        clip=pcb.SHAPE_POLY_SET();clip.NewOutline()
        for x,y in [(a,b),(c,b),(c,d),(a,d)]:clip.Append(pcb.FromMM(100+x),pcb.FromMM(85-y))
        assert not any(clip.Collide(s,pcb.FromMM(.5)) for s in shapes),(board.GetLayerName(layer),'metal shadow within 0.5 mm of copper')
        lo,hi=.5,20
        for _ in range(18):
            mid=(lo+hi)/2
            if any(clip.Collide(s,pcb.FromMM(mid)) for s in shapes):hi=mid
            else:lo=mid
        minima.append(lo)
    results.append({'layer':board.GetLayerName(layer),'minimum_projected_copper_clearance_mm':min(minima)})
record={'method':__doc__,'clip_shadow_local_rectangles_mm':rects,'includes_pair_xy_float_mm':.5,
 'scope':'Conservative projection including hooks above/below the board; no soldermask insulation credit. Spring opening/retention force remains a first-article check.',
 'minimum_copper_clearance_mm':min(x['minimum_projected_copper_clearance_mm'] for x in results),'layers':results,
 'source_SHA256':{'kicad/PS-FLYBACK-5W.kicad_pcb':hashlib.sha256(file.read_bytes()).hexdigest()}}
(R/'evidence/audit/clip-copper-checks.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print(json.dumps(record,indent=2))
