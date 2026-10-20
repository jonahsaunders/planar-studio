"""Check the default stack, with A10's separately bounded winding-spacing update."""
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
assert changed=={'layerPositions','dielectricEr','traceS','terminalOffsets','viaPad','dOuter'},('Unexpected winding change',changed)
assert cfg['traceS']==.30 and cfg['terminalOffsets']=={'P:0':.3,'P:2':.3}
assert cfg['viaPad']==.7 and cfg['dOuter']==13.9
assert cfg['dielectricEr']==stack['winding_model_dielectric_er']==4.4
before_circuit=old('circuit.json');after_circuit=read('circuit.json')
for data in [before_circuit,after_circuit]:
    for part in data['parts']:
        if part['ref'] in ['R6','R7']:
            for key in ['value','mpn','mfr','lcsc','source','purpose','footprint','source_footprint','power_rating_W_at_70C']:part.pop(key,None)
        if part['ref']=='R1':
            for key in ['mpn','mfr','lcsc','source','purpose']:part.pop(key,None)
assert before_circuit==after_circuit,'Unexpected circuit change beyond reviewed R1/R6/R7 updates'
# A10 containment independently bounds the turn spacing and terminal moves.
before_art=old('planar-studio/T1-artwork.json');after_art=read('planar-studio/T1-artwork.json')
before_art['meta'].pop('stack');after_art['meta'].pop('stack')
for key in before_art.keys()-{'tracks','pads','vias','ports','outline','labels'}:
    assert before_art[key]==after_art[key],('Unexpected artwork metadata change',key)
assert before_art['outline'][1:]==after_art['outline'][1:],'Core-slot artwork changed'
before=old('evidence/winding-model.json')
assert model['magnetizingInductance_H']==before['magnetizingInductance_H']
assert abs(model['analysis']['R1']/before['analysis']['R1']-1)<.025
assert abs(model['analysis']['R2']/before['analysis']['R2']-1)<.025
board=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'))
assert board.GetTitleBlock().GetRevision()=='A10-development'
assert abs(pcb.ToMM(board.GetDesignSettings().GetBoardThickness())-total)<1e-6
report={'revision':'A10-development','baseline_commit':baseline,
 'ordering':{'layers':6,'nominal_thickness_mm':1.6,'outer_copper_oz':1,'inner_copper_oz':1,'specify_stackup':False,'impedance_control':False},
 'unchanged_electrical_topology_and_core_slots':True, 'winding_spacing_and_terminals_updated_in_A10':True, 'R6_procurement_rating_and_footprint_updated':True, 'R7_preload_updated_in_A6':True, 'R1_procurement_updated_in_A7':True,
 'changed_winding_parameters':sorted(changed),'reference_stack_total_mm':total,'reference_winding_centers_mm':winding_z,
 'old':{k:before['analysis'][k] for k in ['R1','R2','leakage','capacitance']},
 'new':{k:model['analysis'][k] for k in ['R1','R2','leakage','capacitance']},
 'scope':'Published default reference, not an exact supplier stack commitment. 30 um conservative copper / 25 um assumed barrel plating; shared terminal buses and external routes excluded. No nonlinear, AC/fringing/core-loss or hardware thermal/fault qualification.',
 'source_SHA256':{f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in ['stackup.json','sources/jlcpcb-default-1oz-stack.json','planar-studio/T1-config.json','planar-studio/T1-artwork.json','evidence/winding-model.json','kicad/PS-FLYBACK-5W.kicad_pcb','scripts/verify-default-stack.py']}}
(R/'evidence/audit/default-stack-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
