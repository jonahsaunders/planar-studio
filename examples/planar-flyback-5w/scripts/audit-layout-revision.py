"""Compare a previous canonical board with this layout revision. KiCad Python."""
import argparse,hashlib,json,re
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--baseline-board',type=Path,required=True)
p.add_argument('--baseline-id',required=True)
a=p.parse_args()
current=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
def parse(path):
    root=[];stack=[];node=root
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+',path.read_text()):
        if token=='(':
            item=[];node.append(item);stack.append(node);node=item
        elif token==')':node=stack.pop()
        else:node.append(token)
    return root[0]
def children(node,key):return [x for x in node if isinstance(x,list) and x[0]==key]
def strip_ids(node):
    return [strip_ids(x) if isinstance(x,list) else x for x in node
            if not (isinstance(x,list) and x[0] in ['uuid','tstamp'])]
def signature(path):
    b=pcb.LoadBoard(str(path));tree=parse(path)
    fp={f.GetReference():f for f in b.GetFootprints()}
    t1=next(f for f in children(tree,'footprint') if ['property','"Reference"','"T1"'] == next(x for x in children(f,'property') if x[1]=='"Reference"')[:3])
    copper=[strip_ids(x) for x in t1 if isinstance(x,list) and x[0].startswith('fp_') and
            any(l[1].endswith('.Cu"') for l in children(x,'layer'))]
    outline=[strip_ids(x) for x in tree if isinstance(x,list) and x[0].startswith('gr_') and ['layer','"Edge.Cuts"'] in x]
    pins=sorted((f.GetReference(),pd.GetNumber(),pd.GetNetname(),pd.GetSize().x,pd.GetSize().y,
                 pd.GetDrillSize().x,pd.GetDrillSize().y,int(pd.GetShape()))
                for f in fp.values() for pd in f.Pads() if pd.GetNumber())
    poses={k:[pcb.ToMM(f.GetPosition().x),pcb.ToMM(f.GetPosition().y),f.GetOrientationDegrees()] for k,f in fp.items()}
    return {'pins':pins,'copper':copper,'outline':outline,'poses':poses,
            'identity':{k:[f.GetValue(),f.GetFPID().GetLibItemName()] for k,f in fp.items()},
            'layers':children(tree,'layers'),'thickness':b.GetDesignSettings().GetBoardThickness()}
before,after=signature(a.baseline_board),signature(current)
for key in ['pins','copper','outline','identity','layers','thickness']:
    assert before[key]==after[key],('Unexpected change',key)
assert all(before['poses'][k]==after['poses'][k] for k in ['T1','H1','H2','H3','H4'])
record={'baseline_id':a.baseline_id,'baseline_sha256':hashlib.sha256(a.baseline_board.read_bytes()).hexdigest(),
        'board_sha256':hashlib.sha256(current.read_bytes()).hexdigest(),
        'physical_numbered_pad_net_size_drill_shape_records_preserved':len(after['pins']),
        'component_identities_preserved':len(after['identity']),
        'transformer_copper_and_pose_preserved':True,'routed_outline_and_core_slots_preserved':True,
        'mounting_hole_poses_preserved':True,'copper_layers_and_board_thickness_preserved':True,
        'changed_component_poses':{k:{'before':v,'after':after['poses'][k]} for k,v in before['poses'].items() if v!=after['poses'][k]}}
(R/'evidence/audit/layout-revision-checks.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:v for k,v in record.items() if k!='changed_component_poses'},indent=2))
