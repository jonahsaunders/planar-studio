"""Check the A4 default-stack handoff and retained winding against published A3."""
import hashlib,json,os,subprocess
from pathlib import Path
import pcbnew as pcb

R=Path(__file__).resolve().parents[1]
repo=Path(os.environ.get('PLANAR_STUDIO_ROOT',R.parents[1]))
baseline='81d4d69b00f03c73f7c4649d1f1d6e00366bb0ff'
def read(name):return json.loads((R/name).read_text(encoding='utf8'))
def old(name):return json.loads(subprocess.check_output(['git','show',f'{baseline}:examples/planar-flyback-5w/{name}'],cwd=repo))
stack=read('stackup.json');source=read('sources/jlcpcb-default-1oz-stack.json')
cfg=read('planar-studio/T1-config.json');model=read('evidence/winding-model.json')
assert stack['code']=='No requirement' and stack['specify_stackup'] is False
assert stack['impedance_control'] is False and stack['nominal_order_thickness_mm']==1.6
assert source['selection']=={'layers':6,'nominal_thickness_mm':1.6,'outer_copper_oz':1,'inner_copper_oz':1,'table':'No requirement'}
# Dimensions independently transcribed from the selected published default table.
assert stack['copper_mm']==source['copper_mm']==[.035,.03,.03,.03,.03,.035]
assert stack['dielectric_mm']==source['dielectric_mm']==[.203,.25,.513,.25,.203]
assert abs(sum(source['central_prepregs_mm'])-.513)<1e-12
total=sum(stack['copper_mm'])+sum(stack['dielectric_mm'])
assert abs(total-1.609)<1e-12 and abs(total-stack['published_copper_plus_dielectric_mm'])<1e-12
centers=[0]
for i,d in enumerate(stack['dielectric_mm']):centers.append(centers[-1]+stack['copper_mm'][i]/2+d+stack['copper_mm'][i+1]/2)
winding_z=[centers[i] for i in [0,1,4,5]]
for data in [stack['winding_centers_relative_top_center_mm'],list(map(float,cfg['layerPositions'].split(','))),[s['z'] for s in model['layerStack']]]:
    assert len(data)==4 and all(abs(a-b)<1e-10 for a,b in zip(data,winding_z)),('Layer heights differ',data,winding_z)
assert model['manufacturingStack']==stack
old_cfg=old('planar-studio/T1-config.json')
changed={k for k in cfg.keys()|old_cfg.keys() if cfg.get(k)!=old_cfg.get(k)}
assert changed=={'layerPositions','dielectricEr'},('Unexpected winding change',changed)
assert cfg['dielectricEr']==stack['winding_model_dielectric_er']==4.4
assert old('circuit.json')==read('circuit.json'),'Circuit/BOM changed'
before_art=old('planar-studio/T1-artwork.json');after_art=read('planar-studio/T1-artwork.json')
before_art['meta'].pop('stack');after_art['meta'].pop('stack')
assert before_art==after_art,'Two-dimensional winding/core-slot artwork changed'
before=old('evidence/winding-model.json')
assert model['magnetizingInductance_H']==before['magnetizingInductance_H']
assert abs(model['analysis']['R1']/before['analysis']['R1']-1)<.001
assert model['analysis']['R2']==before['analysis']['R2']
board=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'))
assert board.GetTitleBlock().GetRevision()=='A4-development'
assert abs(pcb.ToMM(board.GetDesignSettings().GetBoardThickness())-total)<1e-6
report={'revision':'A4-development','baseline_commit':baseline,
 'ordering':{'layers':6,'nominal_thickness_mm':1.6,'outer_copper_oz':1,'inner_copper_oz':1,'specify_stackup':False,'impedance_control':False},
 'unchanged_circuit_BOM_and_2D_winding_artwork':True,
 'changed_winding_parameters':sorted(changed),'reference_stack_total_mm':total,'reference_winding_centers_mm':winding_z,
 'old':{k:before['analysis'][k] for k in ['R1','R2','leakage','capacitance']},
 'new':{k:model['analysis'][k] for k in ['R1','R2','leakage','capacitance']},
 'scope':'Published default reference, not an exact supplier stack commitment. 30 um conservative copper / 25 um assumed barrel plating; shared terminal buses and external routes excluded. No nonlinear, AC/fringing/core-loss or hardware thermal/fault qualification.',
 'source_SHA256':{f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in ['stackup.json','sources/jlcpcb-default-1oz-stack.json','planar-studio/T1-config.json','planar-studio/T1-artwork.json','evidence/winding-model.json','kicad/PS-FLYBACK-5W.kicad_pcb','scripts/verify-default-stack.py']}}
(R/'evidence/audit/default-stack-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
