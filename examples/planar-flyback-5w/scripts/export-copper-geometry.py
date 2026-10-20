import hashlib
import json
import re
import argparse
from pathlib import Path
import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT
parser=argparse.ArgumentParser()
parser.add_argument('--board',type=Path,default=SRC/'kicad/PS-FLYBACK-5W.kicad_pcb')
parser.add_argument('--output',type=Path,default=ROOT/'.kicad-config/copper-audit-geometry.json')
args=parser.parse_args()
FILE = args.board
board = pcb.LoadBoard(str(FILE))
layers = [pcb.F_Cu, pcb.In1_Cu, pcb.In2_Cu, pcb.In3_Cu, pcb.In4_Cu, pcb.B_Cu]

def xy(p): return [pcb.ToMM(p.x), pcb.ToMM(p.y)]

def points(chain):
    return [xy(chain.CPoint(i)) for i in range(chain.PointCount())]

def polygons(poly):
    return [{'shell': points(poly.COutline(i)),
             'holes': [points(poly.CHole(i,j)) for j in range(poly.HoleCount(i))]}
            for i in range(poly.OutlineCount())]

items = []
def export(item, name, kind, barrel=False):
    geometry = {}
    for layer in layers:
        if not item.IsOnLayer(layer): continue
        poly = pcb.SHAPE_POLY_SET()
        if isinstance(item, pcb.ZONE):
            poly = item.GetFilledPolysList(layer)
        else:
            item.TransformShapeToPolygon(poly, layer, 0, pcb.FromMM(.0001), pcb.ERROR_INSIDE)
        if poly.OutlineCount(): geometry[board.GetLayerName(layer)] = polygons(poly)
    if not geometry: return
    record = {'name':name, 'kind':kind, 'barrel':barrel, 'position':xy(item.GetPosition()),
              'net':item.GetNetname() if hasattr(item,'GetNetname') else '', 'geometry':geometry}
    if kind=='pad':
        record['drill'] = xy(item.GetDrillSize())
    if kind=='via': record['drill'] = [pcb.ToMM(item.GetDrillValue())]*2
    items.append(record)

ties=[]
for f in board.GetFootprints():
    if f.IsNetTie(): ties.append({'ref':f.GetReference()})
    for p in f.Pads():
        if p.GetAttribute()!=pcb.PAD_ATTRIB_NPTH:
            export(p, f'{f.GetReference()}.{p.GetNumber()}', 'pad', p.GetAttribute()==pcb.PAD_ATTRIB_PTH)
    for i,g in enumerate(f.GraphicalItems()):
        if g.IsOnCopperLayer(): export(g,f'{f.GetReference()}.graphic{i}','graphic')
for i,t in enumerate(board.GetTracks()):
    via=isinstance(t,pcb.PCB_VIA)
    export(t,f'route{i}','via' if via else 'track',via)
for i,z in enumerate(board.Zones()):
    if not z.GetIsRuleArea(): export(z,f'zone{i}','zone')
for i,g in enumerate(board.GetDrawings()):
    if g.IsOnCopperLayer(): export(g,f'drawing{i}','graphic')
result={'board_sha256':hashlib.sha256(FILE.read_bytes()).hexdigest(),'net_ties':ties,
        'net_tie_declarations': re.findall(r'\(net_tie_pad_groups[^)]*\)',FILE.read_text()),
        'polygon_approximation_mm':.0001,'items':items}
args.output.write_text(json.dumps(result),encoding='utf8')
print(json.dumps({'net_ties':ties,'items':len(items),'copper_graphics':[i['name'] for i in items if i['kind']=='graphic']}))
