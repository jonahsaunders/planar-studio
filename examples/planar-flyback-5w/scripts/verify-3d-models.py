"""Validate every saved-board model reference, asset hash and pose. KiCad Python."""
import hashlib,json
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1];cad=R/'kicad'
board=pcb.LoadBoard(str(cad/'PS-FLYBACK-5W.kicad_pcb'))
index=json.loads((cad/'3dmodels/model-index.json').read_text())
records=[]
for fp in sorted(board.GetFootprints(),key=lambda f:f.GetReference()):
    models=list(fp.Models());assert len(models)==1,(fp.GetReference(),len(models))
    m=models[0];name=m.m_Filename
    assert name.startswith('${KIPRJMOD}/3dmodels/'),name
    file=cad/name.removeprefix('${KIPRJMOD}/')
    assert file.is_file(),('Missing model',fp.GetReference(),name)
    assert m.m_Show and m.m_Opacity==1,('Hidden model',fp.GetReference())
    assert tuple(m.m_Scale)==(1,1,1) and tuple(m.m_Offset)==(0,0,0) and tuple(m.m_Rotation)==(0,0,0)
    assert not fp.IsFlipped(),'Bottom placement requires extending the pose verifier'
    key=name.removeprefix('${KIPRJMOD}/3dmodels/')
    digest=hashlib.sha256(file.read_bytes()).hexdigest()
    assert digest==index['assets'][key]['sha256'],('Model hash changed',key)
    records.append({'reference':fp.GetReference(),'model':file.relative_to(R).as_posix(),
                    'sha256':digest,'position_mm':[pcb.ToMM(fp.GetPosition().x),pcb.ToMM(fp.GetPosition().y)],
                    'rotation_deg':fp.GetOrientationDegrees(),'side':'top'})
assert len(records)==index['covered_footprints']==len(json.loads((R/'circuit.json').read_text())['parts'])
assert {x['reference'] for x in records}=={x['reference'] for x in index['footprints']}
result={'footprints':len(records),'unique_STEP_assets':len({x['model'] for x in records}),
        'missing_or_hidden_models':[],'board_thickness_mm':pcb.ToMM(board.GetDesignSettings().GetBoardThickness()),
        'coordinate_convention':'KiCad board X right / Y down; model world uses X right / Y up, top PCB surface Z=0; footprint angles are degrees CCW.',
        'models':records}
(R/'evidence/audit/3d-model-checks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(f"All {len(records)} footprints have visible, local, hash-verified STEP models.")
