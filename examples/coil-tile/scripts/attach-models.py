#!/usr/bin/env python3
"""Attach checked-in STEP models to purchased footprints without changing geometry.

Requires KiCad 9 pcbnew. Can also restore model assignments after a native edit.
Printed coils, test pads and mounting holes are PCB geometry, not fitted parts.
"""
from pathlib import Path
import json
import pcbnew as pcb
from sexp import parse,dump
from design import PARTS
ROOT=Path(__file__).resolve().parents[1];CAD=ROOT/'kicad'
board_path=CAD/'CoilTile.kicad_pcb'

def without_models(node):
    if isinstance(node,list):return [without_models(x) for x in node if not(isinstance(x,list) and x and x[0]=='model')]
    return node

before=parse(board_path.read_text());board=pcb.LoadBoard(str(board_path))
fps={f.GetReference():f for f in board.GetFootprints()};records=[]
for p in PARTS:
    ref=p['ref'];f=fps[ref]
    if not p['bom']:
        assert len(f.Models())==0,ref
        records.append({'reference':ref,'representation':'native PCB geometry','reason':('printed copper winding' if ref.startswith('L') else 'copper test pad' if ref.startswith('TP') else 'NPTH hole and exposed substrate')})
        continue
    lib,name=p['stock_footprint'].split(':')
    rel=f'3dmodels/{lib}.3dshapes/{name}.step';path=CAD/rel
    assert path.is_file(),f'Missing required model: {path}'
    model=pcb.FP_3DMODEL();model.m_Filename='${KIPRJMOD}/'+rel
    model.m_Scale.x=model.m_Scale.y=model.m_Scale.z=1.0
    model.m_Show=True;f.Models().clear();f.Models().append(model)
    file=CAD/'CoilTile.pretty'/(name+'.kicad_mod');fp=parse(file.read_text());old=without_models(fp)
    fp[:]=[x for x in fp if not(isinstance(x,list) and x[0]=='model')]
    fp.append(parse(f'(model "${{KIPRJMOD}}/{rel}" (offset(xyz 0 0 0))(scale(xyz 1 1 1))(rotate(xyz 0 0 0)))'))
    assert without_models(fp)==old
    file.write_text(dump(fp))
    records.append({'reference':ref,'model':'${KIPRJMOD}/'+rel,'scale':[1,1,1],'offset_mm':[0,0,0],'rotation_deg':[0,0,0]})
pcb.SaveBoard(str(board_path),board)
assert without_models(parse(board_path.read_text()))==without_models(before),'Non-model board content changed'
report={'assembled_parts':20,'assembled_parts_with_local_models':sum('model' in r for r in records),
        'pcb_features':12,'electrical_and_fabrication_geometry_unchanged':True,'footprints':records}
assert report['assembled_parts_with_local_models']==20
(ROOT/'evidence/3d-model-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: 20/20 fitted parts have local STEP models; 12 PCB features use native geometry.')
