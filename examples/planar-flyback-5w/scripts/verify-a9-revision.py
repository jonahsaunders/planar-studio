"""Bound A9's winding and terminal repair against the audited A8 board."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import pcbnew as pcb

ROOT=Path(__file__).resolve().parents[1]
BASE='58b86796b28c1d9d602b02cedf423923a5b672eb'
def old(name):return subprocess.check_output(['git','show',f'{BASE}:examples/planar-flyback-5w/{name}'],cwd=ROOT)
def point(p):return p.x,p.y
def pads(f):return sorted((p.GetNumber(),p.GetNetname(),point(p.GetPosition()),point(p.GetSize()),point(p.GetDrillSize()),p.GetOrientationDegrees(),p.GetLayerSet().FmtHex()) for p in f.Pads())
def tracks(b):
    return Counter((t.GetNetname(),t.GetLayer(),t.GetWidth(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())]))) for t in b.GetTracks() if not isinstance(t,pcb.PCB_VIA))
def vias(b):return sorted((t.GetNetname(),point(t.GetPosition()),t.GetWidth(t.TopLayer()),t.GetDrillValue(),t.TopLayer(),t.BottomLayer()) for t in b.GetTracks() if isinstance(t,pcb.PCB_VIA))
def edges(b):return sorted((g.GetShape(),point(g.GetStart()),point(g.GetEnd()),point(g.GetArcMid()),g.GetWidth()) for g in b.GetDrawings() if g.GetLayer()==pcb.Edge_Cuts)

unchanged=['circuit.json','parts.json','requirements.json','layout.json','mechanical.json','magnetics.json','stackup.json','kicad/PS-FLYBACK-5W.kicad_pro']
for name in unchanged:assert json.loads(old(name))==json.loads((ROOT/name).read_text()),name
before_cfg=json.loads(old('planar-studio/T1-config.json'))
after_cfg=json.loads((ROOT/'planar-studio/T1-config.json').read_text())
changed={k for k in before_cfg.keys()|after_cfg.keys() if before_cfg.get(k)!=after_cfg.get(k)}
assert changed=={'traceS','terminalOffsets'},changed
assert before_cfg['traceS']==.2 and after_cfg['traceS']==.25
assert after_cfg['terminalOffsets']=={'P:0':.1,'P:2':.1}
before_art=json.loads(old('planar-studio/T1-artwork.json'))
after_art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text())
assert before_art['outline'][1:]==after_art['outline'][1:],'Core/clip cutouts changed'
assert [t['width'] for t in before_art['tracks']]==[t['width'] for t in after_art['tracks']]==[.6]*4
before_model=json.loads(old('evidence/winding-model.json'))
after_model=json.loads((ROOT/'evidence/winding-model.json').read_text())
assert before_model['magnetizingInductance_H']==after_model['magnetizingInductance_H']==13.12e-6
assert before_model['windings']==after_model['windings']
assert after_model['analysis']['turns']==[4,2]

with tempfile.TemporaryDirectory() as temp:
    path=Path(temp)/'A8.kicad_pcb';path.write_bytes(old('kicad/PS-FLYBACK-5W.kicad_pcb'))
    before=pcb.LoadBoard(str(path));after=pcb.LoadBoard(str(ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb'))
    bf={f.GetReference():f for f in before.GetFootprints()};af={f.GetReference():f for f in after.GetFootprints()}
    assert bf.keys()==af.keys()
    for ref in bf:
        a,b=bf[ref],af[ref]
        assert (point(a.GetPosition()),a.GetOrientationDegrees(),a.GetValue(),a.GetFPID())==(point(b.GetPosition()),b.GetOrientationDegrees(),b.GetValue(),b.GetFPID()),ref
        if ref!='T1':assert pads(a)==pads(b),ref
        else:assert [p[:2]+p[3:] for p in pads(a)]==[p[:2]+p[3:] for p in pads(b)],'T1 pad size/net/layer changed'
    assert vias(before)==vias(after),'External via changed'
    assert edges(before)==edges(after),'Board/core-slot outline changed'
    assert before.GetDesignSettings().GetBoardThickness()==after.GetDesignSettings().GetBoardThickness()
    assert after.GetTitleBlock().GetRevision()=='A9-development'
    oldtracks,newtracks=tracks(before),tracks(after)
    removed=list((oldtracks-newtracks).elements());added=list((newtracks-oldtracks).elements())
    assert len(removed)==7 and len(added)==8,(removed,added)
    assert Counter(t[0] for t in removed)=={'/SW':4,'/VIN':1,'/GND_ISO':1,'/SEC_A':1}
    assert Counter(t[0] for t in added)=={'/SW':4,'/VIN':1,'/GND_ISO':1,'/SEC_A':2}
    oldpads={p.GetNumber():point(p.GetPosition()) for p in bf['T1'].Pads()}
    newpads={p.GetNumber():point(p.GetPosition()) for p in af['T1'].Pads()}
    # Direct leads change only the terminal endpoint; remote endpoints stay fixed.
    for number,net in [('1','/VIN'),('3','/GND_ISO')]:
        a=next(t for t in removed if t[0]==net);b=next(t for t in added if t[0]==net)
        assert a[:3]==b[:3]
        assert oldpads[number] in a[3] and newpads[number] in b[3]
        assert set(a[3])-{oldpads[number]}==set(b[3])-{newpads[number]}
    # Both SW approaches retain a 1 mm / 0.6 mm neck; SEC_A gains one.
    for number,net,layer,count in [('2','/SW',pcb.F_Cu,2),('4','/SEC_A',pcb.In2_Cu,1)]:
        current=[t for t in added if t[0]==net]
        necks=[t for t in current if newpads[number] in t[3]]
        assert len(necks)==count
        remote=[]
        for neck in necks:
            assert neck[1:3]==(layer,pcb.FromMM(.6))
            assert abs(math.dist(*neck[3])-pcb.FromMM(1))<3
            join=next(p for p in neck[3] if p!=newpads[number])
            trunk=next(t for t in current if t!=neck and join in t[3])
            end=next(p for p in trunk[3] if p!=join)
            assert abs(math.dist(newpads[number],join)+math.dist(join,end)-math.dist(newpads[number],end))<3
            remote.append((end,trunk[2]))
        old_group=[t for t in removed if t[0]==net]
        if number=='4':
            t=old_group[0];oldremote=[(next(p for p in t[3] if p!=oldpads[number]),t[2])]
        else:
            oldremote=[]
            for neck in [t for t in old_group if oldpads[number] in t[3]]:
                join=next(p for p in neck[3] if p!=oldpads[number])
                trunk=next(t for t in old_group if t!=neck and join in t[3])
                oldremote.append((next(p for p in trunk[3] if p!=join),trunk[2]))
        assert sorted(remote)==sorted(oldremote)
    # Refill may react only in the neighborhood of changed copper routes.
    envelopes=pcb.SHAPE_POLY_SET()
    for board,changed_tracks in [(before,removed),(after,added)]:
        for t in board.GetTracks():
            if isinstance(t,pcb.PCB_VIA):continue
            record=(t.GetNetname(),t.GetLayer(),t.GetWidth(),tuple(sorted([point(t.GetStart()),point(t.GetEnd())])))
            if record in changed_tracks:
                # Include the zone's 0.25 mm clearance and 0.20 mm minimum
                # feature filtering around the edited track boundaries.
                part=pcb.SHAPE_POLY_SET();t.TransformShapeToPolygon(part,t.GetLayer(),pcb.FromMM(.6),pcb.FromMM(.0005),pcb.ERROR_OUTSIDE)
                envelopes.BooleanAdd(part)
    bz={(z.GetNetname(),z.GetLayer()):z for z in before.Zones()};az={(z.GetNetname(),z.GetLayer()):z for z in after.Zones()}
    assert bz.keys()==az.keys();pour_change=0
    for key in bz:
        assert bz[key].Outline().Format()==az[key].Outline().Format()
        for a,b in [(bz[key],az[key]),(az[key],bz[key])]:
            diff=pcb.SHAPE_POLY_SET(a.GetFilledPolysList(a.GetLayer()));diff.BooleanSubtract(b.GetFilledPolysList(b.GetLayer()))
            pour_change+=diff.Area()/1e12;diff.BooleanSubtract(envelopes)
            assert diff.Area()==0,('Pour changed outside terminal approaches',key)

record={'revision':'A9-development','baseline_commit':BASE,'status':'PASS','unchanged_inputs':unchanged,
        'changed_winding_parameters':sorted(changed),'unchanged_winding_width_turns_core_stack':True,
        'unchanged_component_placements_values_and_non_T1_pads':True,'unchanged_external_vias_and_board_cutouts':True,
        'terminal_positions_mm':{n:{'before':[v/1e6 for v in oldpads[n]],'after':[v/1e6 for v in newpads[n]]} for n in oldpads},
        'removed_tracks':removed,'added_tracks':added,'local_pour_difference_mm2':pour_change,
        'magnetic_estimates':{'Lm_uH':13.12,'before':{k:before_model['analysis'][k] for k in ['R1','R2','leakage','capacitance']},'after':{k:after_model['analysis'][k] for k in ['R1','R2','leakage','capacitance']}},
        'board_sha256':hashlib.sha256((ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb').read_bytes()).hexdigest(),
        'scope':'Bounds intentional winding, T1 terminal and attached approach changes. Analytical estimates refreshed; no hardware qualification.'}
(ROOT/'evidence/audit/a9-revision-checks.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print('A9 containment passed: winding spacing/terminals and their approaches only; circuit, component placements, external vias, core and stack retained.')
