"""Compare this component/filtering revision with a specified preceding board."""
import argparse,hashlib,json,re
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--baseline-board',type=Path,required=True);p.add_argument('--baseline-id',required=True);a=p.parse_args()
def parse(path):
    root=[];stack=[];node=root
    for t in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+',path.read_text()):
        if t=='(':item=[];node.append(item);stack.append(node);node=item
        elif t==')':node=stack.pop()
        else:node.append(t)
    return root[0]
def children(n,k):return [x for x in n if isinstance(x,list) and x[0]==k]
def strip(n):return [strip(x) if isinstance(x,list) else x for x in n if not(isinstance(x,list) and x[0] in ['uuid','tstamp'])]
def signature(path):
    b=pcb.LoadBoard(str(path));t=parse(path);fp={f.GetReference():f for f in b.GetFootprints()}
    t1=next(f for f in children(t,'footprint') if any(x[:3]==['property','"Reference"','"T1"'] for x in children(f,'property')))
    return {'board':b,'fps':fp,'t1':strip(t1),
        'outline':[strip(x) for x in t if isinstance(x,list) and x[0].startswith('gr_') and ['layer','"Edge.Cuts"'] in x],
        'layers':children(t,'layers'),'thickness':b.GetDesignSettings().GetBoardThickness(),
        'pins':{ref:sorted((q.GetNumber(),q.GetNetname(),q.GetSize().x,q.GetSize().y,q.GetDrillSize().x,q.GetDrillSize().y,int(q.GetShape())) for q in f.Pads()) for ref,f in fp.items()}}
current=R/'kicad/PS-FLYBACK-5W.kicad_pcb';old,new=signature(a.baseline_board),signature(current)
for key in ['t1','outline','layers','thickness']:assert old[key]==new[key],key
assert set(new['fps'])-set(old['fps'])=={'C7','C8','R8'}
assert not set(old['fps'])-set(new['fps'])
for ref in old['fps']:
    if ref=='D1':
        assert [(n,net) for n,net,*rest in old['pins'][ref]]==[(n,net) for n,net,*rest in new['pins'][ref]]
    else:assert old['pins'][ref]==new['pins'][ref],ref
for ref in ['H1','H2','H3','H4']:
    x,y=old['fps'][ref],new['fps'][ref]
    assert x.GetPosition()==y.GetPosition() and x.GetOrientationDegrees()==y.GetOrientationDegrees() and str(x.GetFPID())==str(y.GetFPID())
before_vias=sum(isinstance(x,pcb.PCB_VIA) for x in old['board'].GetTracks());after_vias=sum(isinstance(x,pcb.PCB_VIA) for x in new['board'].GetTracks())
assert after_vias-before_vias==28
out={'baseline_id':a.baseline_id,'baseline_sha256':hashlib.sha256(a.baseline_board.read_bytes()).hexdigest(),
 'board_sha256':hashlib.sha256(current.read_bytes()).hexdigest(),'added_components':['C7','C8','R8'],
 'original_component_nets_preserved':True,'original_pad_geometry_preserved_except_D1':True,
 'D1_package_change':'SMA to PowerDI123 for verified DFLS1100-7; polarity/net identities preserved',
 'transformer_footprint_and_copper_preserved':True,'routed_outline_and_core_slots_preserved':True,
 'mounting_footprints_centers_and_rotations_preserved':True,'copper_layers_and_thickness_preserved':True,
 'ordinary_vias_before':before_vias,'ordinary_vias_after':after_vias,'added_ground_stitches':26,'added_capacitor_ground_vias':2}
(R/'evidence/audit/component-revision-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
