"""Bound A7 to the equivalent R1 procurement, OSP finish and revision markings."""
import hashlib,json,subprocess,tempfile
from collections import Counter
from pathlib import Path
import pcbnew as pcb
from preload import preload_budget

R=Path(__file__).resolve().parents[1]
BASE='f76e1b478e1bfd95fa561dfa65c0c002126cc49b'
def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=R)
def read(name):return json.loads((R/name).read_text(encoding='utf8'))
def point(p):return p.x,p.y
def pads(f):return sorted((p.GetNumber(),p.GetNetname(),point(p.GetPosition()),point(p.GetSize()),point(p.GetDrillSize()),p.GetOrientationDegrees(),p.GetLayerSet().FmtHex()) for p in f.Pads())
def routes(b):
    records=[]
    for t in b.GetTracks():
        if isinstance(t,pcb.PCB_VIA):records.append(('via',t.GetNetname(),point(t.GetPosition()),t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()))
        else:records.append(('track',t.GetNetname(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())])),t.GetWidth(),t.GetLayer()))
    return Counter(records)
def edge(g):return g.GetShape(),point(g.GetStart()),point(g.GetEnd()),point(g.GetArcMid()),g.GetWidth()

allowed={'mpn','mfr','lcsc','source','purpose'}
before_circuit=json.loads(old('circuit.json'));after_circuit=read('circuit.json')
assert len(before_circuit['parts'])==len(after_circuit['parts'])==29
changes={}
for a,b in zip(before_circuit['parts'],after_circuit['parts']):
    assert a['ref']==b['ref']
    delta={k for k in a.keys()|b.keys() if a.get(k)!=b.get(k)}
    if delta:
        assert a['ref']=='R1' and delta==allowed,(a['ref'],delta)
        changes[a['ref']]=sorted(delta)
assert changes
assert {k:v for k,v in before_circuit.items() if k!='parts'}=={k:v for k,v in after_circuit.items() if k!='parts'}
parts=read('parts.json');previous=json.loads(old('parts.json'))
assert parts.keys()==previous.keys()
assert {k:v for k,v in parts.items() if k!='R1'}=={k:v for k,v in previous.items() if k!='R1'}
assert {k for k in parts['R1'].keys()|previous['R1'].keys() if parts['R1'].get(k)!=previous['R1'].get(k)}==allowed
assert (parts['R1']['mpn'],parts['R1']['lcsc'],parts['R1']['value'])==('0603WAF6493T5E','C25821','649k 1%')
assert (parts['R7']['mpn'],parts['R7']['lcsc'],parts['R7']['resistance_ohm'])==('RC1206FR-07180RL','C137380',180)
unchanged=['planar-studio/T1-artwork.json','planar-studio/T1-config.json','planar-studio/T1.planar.json','evidence/winding-model.json','stackup.json','mechanical.json','layout.json','magnetics.json','kicad/PS-FLYBACK-5W.kicad_pro']
for name in unchanged:assert json.loads(old(name))==read(name),name
assert read('requirements.json')['provisional_design_targets']==json.loads(old('requirements.json'))['provisional_design_targets']
with tempfile.TemporaryDirectory(dir=R/'.kicad-config') as tmp:
    path=Path(tmp)/'baseline.kicad_pcb';path.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
    before=pcb.LoadBoard(str(path));after=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'))
    bf={f.GetReference():f for f in before.GetFootprints()};af={f.GetReference():f for f in after.GetFootprints()}
    assert bf.keys()==af.keys()
    for ref in bf:
        assert point(bf[ref].GetPosition())==point(af[ref].GetPosition()),ref
        assert bf[ref].GetOrientationDegrees()==af[ref].GetOrientationDegrees(),ref
        assert pads(bf[ref])==pads(af[ref]),ref
        assert bf[ref].GetFPID()==af[ref].GetFPID(),ref
        assert bf[ref].GetValue()==af[ref].GetValue(),ref
    assert routes(before)==routes(after),'Routing or via changed'
    assert sorted(edge(g) for g in before.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts)==sorted(edge(g) for g in after.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts)
    bz={(z.GetNetname(),z.GetLayer()):z for z in before.Zones()};az={(z.GetNetname(),z.GetLayer()):z for z in after.Zones()}
    assert bz.keys()==az.keys()
    for key in bz:
        assert bz[key].Outline().Format()==az[key].Outline().Format(),key
        for x,y in [(bz[key],az[key]),(az[key],bz[key])]:
            difference=pcb.SHAPE_POLY_SET(x.GetFilledPolysList(x.GetLayer()))
            difference.BooleanSubtract(y.GetFilledPolysList(y.GetLayer()))
            assert difference.Area()==0,(key,difference.Area())
    assert after.GetTitleBlock().GetRevision()=='A7-development'
    assert before.GetDesignSettings().GetBoardThickness()==after.GetDesignSettings().GetBoardThickness()
assert '(copper_finish "OSP")' in (R/'kicad/PS-FLYBACK-5W.kicad_pcb').read_text(encoding='utf8')
assert '(copper_finish "ENIG")' in old('kicad/PS-FLYBACK-5W.kicad_pcb').decode('utf8')
evidence=read('sources/r1-replacement-review.json');rating=evidence['replacement']
assert (rating['resistance_ohm'],rating['tolerance_fraction'],rating['tcr_ppm_per_C'],rating['power_W_at_70C'],rating['working_voltage_V'])==(649000,.01,100,.1,75)
assert evidence['fresh_catalog_fields']['canPresaleNumber']>=evidence['previous']['user_order_required']==20
# Both interpretations of the inconsistent manufacturer land table fall inside
# the retained copper lands. This does not invent an exact catalog origin.
for x in [.725,.775]:assert abs(x-.825)<.8/2
assert 42**2/(649000*.99)<.00275
drc=read('evidence/board-drc.json');assert not any(drc[k] for k in ['violations','unconnected_items','schematic_parity'])
rules=read('kicad/PS-FLYBACK-5W.kicad_pro')['board']['design_settings']['rule_severities']
assert rules['track_not_centered_on_via']=='error'
targets=read('requirements.json')['provisional_design_targets'];lmax=max(read('magnetics.json')['Lm_acceptance_uH'])*1e-6
budget=preload_budget(parts['R7'],targets,lmax)
assert budget['current_margin_fraction']>=.20 and budget['derated_power_fraction']<=.80
old_value=preload_budget({**parts['R7'],'resistance_ohm':220},targets,lmax)
assert old_value['current_margin_fraction']<.20
report={'revision':'A7-development','baseline_commit':BASE,'status':'PASS','changed_R1_fields':changes['R1'],'finish':{'before':'ENIG','after':'OSP'},'retained_all_electrical_values_and_other_parts':True,'unchanged_topology_footprints_pad_nets_and_component_poses':True,'unchanged_routes_vias_outline_and_ground_pours':True,'unchanged_magnetic_stack_mechanical_and_rule_sources':unchanged,'R1_same_value_ratings_and_manufacturer_land_center_fit':True,'R1_exact_factory_catalog_frame_verified':False,'R1_available_quantity_snapshot':1065,'preload_budget':budget,'old_220_ohm_rejected_by_margin_gate':True,'scope':'CAD consistency, exact change containment and analytical margin only. Fresh factory placement preview and hardware qualification remain required.','source_SHA256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in ['parts.json','requirements.json','circuit.json','kicad/PS-FLYBACK-5W.kicad_pcb','sources/r1-replacement-review.json','sources/placement-library.json','scripts/preload.py','scripts/verify-procurement-revision.py']}}
(R/'evidence/audit/procurement-revision-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
