"""Verify a mechanical-only mounting move and measure capacitor/hardware clearance.

Run with KiCad Python against the preceding canonical board. Distances to
capacitor courtyards are conservative planar placement checks, not tool-access
or tolerance-stack qualification. Native DRC and nominal solid checks supplement
these measurements.
"""
import argparse,hashlib,json,math,re
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
    b=pcb.LoadBoard(str(path));tree=parse(path);fps={f.GetReference():f for f in b.GetFootprints()}
    electronics={next(x[2].strip('"') for x in children(f,'property') if x[1]=='"Reference"'):strip(f) for f in children(tree,'footprint')}
    for ref in ['H1','H2','H3','H4']:del electronics[ref]
    return {'board':b,'fps':fps,'electronics':electronics,
      # KiCad may reorder UUID-bearing objects on export. Compare the complete
      # geometry records as a sorted multiset after discarding UUIDs only.
      'copper':sorted([strip(x) for x in tree if isinstance(x,list) and x[0] in ['segment','arc','via','zone']],key=lambda x:json.dumps(x)),
      'outline':[strip(x) for x in tree if isinstance(x,list) and x[0].startswith('gr_') and ['layer','"Edge.Cuts"'] in x],
      'layers':children(tree,'layers'),'setup':strip(children(tree,'setup')[0])}
current=R/'kicad/PS-FLYBACK-5W.kicad_pcb';old,new=signature(a.baseline_board),signature(current)
for key in ['electronics','copper','outline','layers','setup']:assert old[key]==new[key],('Unexpected non-mounting edit',key)
mech=json.loads((R/'mechanical.json').read_text());radius=mech['maximum_hardware_contact_diameter_mm']/2
def xy(f):return [pcb.ToMM(f.GetPosition().x),pcb.ToMM(f.GetPosition().y)]
def clearance(hole,cap):
    curves=[g for g in cap.GraphicalItems() if g.GetLayer()==pcb.F_CrtYd]
    assert curves
    return min(pcb.ToMM(g.GetEffectiveShape().Distance(hole.GetPosition())) for g in curves)-radius
rows=[]
for h in mech['holes']:
    ref=h['ref'];f=new['fps'][ref];prev=old['fps'][ref];x,y=xy(f)
    assert str(f.GetFPID())==str(prev.GetFPID()) and f.GetOrientationDegrees()==prev.GetOrientationDegrees()
    assert min(x-75,125-x)==4.5 and min(y-33,137-y)==4.5
    assert [x,y]==[h['x_mm'],h['y_mm']]
    pads=list(f.Pads());assert len(pads)==1 and pads[0].GetAttribute()==pcb.PAD_ATTRIB_NPTH
    assert pcb.ToMM(pads[0].GetDrillSize().x)==3.2
    rows.append({'reference':ref,'before_mm':xy(prev),'after_mm':[x,y],
       'adjacent_edge_center_inset_mm':4.5,'drilled_hole_edge_to_adjacent_board_edge_mm':4.5-1.6,
       'maximum_hardware_contact_diameter_mm':2*radius,
       'capacitor_courtyard_clearance_mm':{c:{'before':clearance(prev,old['fps'][c]),'after':clearance(f,new['fps'][c])} for c in ['C3','C7','C8']}})
assert all(v['after']>0 for r in rows for v in r['capacitor_courtyard_clearance_mm'].values())
assert math.dist(xy(new['fps']['H1']),xy(new['fps']['H2']))==41
assert math.dist(xy(new['fps']['H1']),xy(new['fps']['H3']))==95
out={'baseline_id':a.baseline_id,'baseline_sha256':hashlib.sha256(a.baseline_board.read_bytes()).hexdigest(),
 'board_sha256':hashlib.sha256(current.read_bytes()).hexdigest(),'pattern_mm':[41,95],'holes':rows,
 'all_25_non_mounting_footprints_preserved':True,'tracks_vias_and_filled_pours_preserved':True,
 'winding_copper_preserved':True,'routed_outline_and_core_slots_preserved':True,'stack_and_setup_preserved':True,
 'clearance_method':'Minimum distance from hole center to capacitor F.CrtYd strokes minus maximum permitted 3.2 mm hardware-contact radius. The full courtyard includes solder lands; nominal planar check, not a screwdriver or tolerance model.'}
(R/'evidence/audit/mounting-revision-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
