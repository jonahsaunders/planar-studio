"""Bound A6 to R7 procurement/value and the centered secondary via connection."""
import hashlib,json,subprocess,tempfile
from collections import Counter
from pathlib import Path
import pcbnew as pcb
from preload import preload_budget

R=Path(__file__).resolve().parents[1]
BASE='43a22c94b6160a8baf41078342bdcc7df596c406'
def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=R)
def read(name):return json.loads((R/name).read_text())
def point(p):return p.x,p.y
def pads(f):return sorted((p.GetNumber(),p.GetNetname(),point(p.GetPosition()),point(p.GetSize()),point(p.GetDrillSize()),p.GetOrientationDegrees(),p.GetLayerSet().FmtHex()) for p in f.Pads())
def routes(b):
    records=[]
    for t in b.GetTracks():
        if isinstance(t,pcb.PCB_VIA):records.append(('via',t.GetNetname(),point(t.GetPosition()),t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()))
        else:records.append(('track',t.GetNetname(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())])),t.GetWidth(),t.GetLayer()))
    return Counter(records)
def segment(a,b):return ('track','/SEC_A',tuple(sorted(tuple(pcb.FromMM(v) for v in p) for p in [a,b])),pcb.FromMM(1.3),pcb.In2_Cu)
def edge(g):return g.GetShape(),point(g.GetStart()),point(g.GetEnd()),point(g.GetArcMid()),g.GetWidth()

before_circuit=json.loads(old('circuit.json'));after_circuit=read('circuit.json')
allowed={'value','mpn','lcsc','source','purpose'}
changes=[]
for a,b in zip(before_circuit['parts'],after_circuit['parts']):
    assert a['ref']==b['ref']
    delta={k for k in a.keys()|b.keys() if a.get(k)!=b.get(k)}
    if delta:
        assert a['ref']=='R7' and delta==allowed,(a['ref'],delta)
        changes=sorted(delta)
assert changes and len(before_circuit['parts'])==len(after_circuit['parts'])==29
assert {k:v for k,v in before_circuit.items() if k!='parts'}=={k:v for k,v in after_circuit.items() if k!='parts'}
parts=read('parts.json');previous=json.loads(old('parts.json'))
assert {k:v for k,v in parts.items() if k!='R7'}=={k:v for k,v in previous.items() if k!='R7'}
assert (parts['R7']['mpn'],parts['R7']['lcsc'],parts['R7']['resistance_ohm'])==('RC1206FR-07180RL','C137380',180)
unchanged=['planar-studio/T1-artwork.json','planar-studio/T1-config.json','planar-studio/T1.planar.json','evidence/winding-model.json','stackup.json','mechanical.json','layout.json','magnetics.json']
for name in unchanged:assert json.loads(old(name))==read(name),name
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
        if ref!='R7':assert bf[ref].GetValue()==af[ref].GetValue(),ref
    assert af['R7'].GetValue()=='180R 0.25 W'
    assert sorted(edge(g) for g in before.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts)==sorted(edge(g) for g in after.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts)
    removed=routes(before)-routes(after);added=routes(after)-routes(before)
    assert removed==Counter({segment((101,98.075),(101,102.138)):1}),removed
    assert added==Counter({segment((101,98.075),(100.55,102.138)):1,segment((100.55,102.138),(101.45,102.138)):1}),added
    bz={(z.GetNetname(),z.GetLayer()):z for z in before.Zones()};az={(z.GetNetname(),z.GetLayer()):z for z in after.Zones()}
    assert bz.keys()==az.keys()
    for key in bz:
        assert bz[key].Outline().Format()==az[key].Outline().Format(),key
        for x,y in [(bz[key],az[key]),(az[key],bz[key])]:
            difference=pcb.SHAPE_POLY_SET(x.GetFilledPolysList(x.GetLayer()))
            difference.BooleanSubtract(y.GetFilledPolysList(y.GetLayer()))
            assert difference.Area()==0,(key,difference.Area())
    assert after.GetTitleBlock().GetRevision()=='A6-development'
drc=read('evidence/board-drc.json');assert not any(drc[k] for k in ['violations','unconnected_items','schematic_parity'])
rules=read('kicad/PS-FLYBACK-5W.kicad_pro')['board']['design_settings']['rule_severities']
assert rules['track_not_centered_on_via']=='error'
targets=read('requirements.json')['provisional_design_targets'];lmax=max(read('magnetics.json')['Lm_acceptance_uH'])*1e-6
budget=preload_budget(parts['R7'],targets,lmax)
assert budget['current_margin_fraction']>=.20
assert budget['derated_power_fraction']<=.80
# A real regression: the old 220-ohm value must fail the strengthened current gate.
old_value=preload_budget({**parts['R7'],'resistance_ohm':220},targets,lmax)
assert old_value['current_margin_fraction']<.20
report={'revision':'A6-development','baseline_commit':BASE,'status':'PASS','changed_R7_fields':changes,'retained_all_other_parts':True,'unchanged_topology_footprints_pad_nets_and_component_poses':True,'unchanged_magnetic_stack_and_mechanical_sources':unchanged,'unchanged_outline_and_ground_pours':True,'secondary_route_segments_removed':1,'secondary_route_segments_added':2,'both_secondary_via_centers_connected_on_In2_Cu':True,'off_center_via_rule_severity':'error','preload_budget':budget,'old_220_ohm_rejected_by_margin_gate':True,'old_220_ohm_margin_with_same_reserves':old_value['current_margin_fraction'],'scope':'CAD consistency, exact change containment and analytical margin only. Factory placement and hardware behavior remain unqualified.','source_SHA256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in ['parts.json','requirements.json','circuit.json','kicad/PS-FLYBACK-5W.kicad_pcb','scripts/preload.py','scripts/verify-preload-revision.py']}}
(R/'evidence/audit/preload-revision-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
