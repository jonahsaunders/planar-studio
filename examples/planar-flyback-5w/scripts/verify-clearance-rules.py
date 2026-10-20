"""Guard rules that a clean DRC cannot enforce when their limits are zero."""
import hashlib,json,math
from pathlib import Path
import pcbnew as pcb
ROOT=Path(__file__).resolve().parents[1]
LIMITS={'min_connection':.2,'min_via_annular_width':.15,'min_hole_clearance':.3,'solder_mask_to_copper_clearance':.09}
PAIRS=[('/SEC_A',[(100.55,102.138),(101.45,102.138)]),('/GND_ISO',[(97.269595,101.5),(98.169595,101.5)])]
def inspect(board,project):
    issues=[];settings=project['board']['design_settings'];rules=settings['rules']
    for name,minimum in LIMITS.items():
        if rules.get(name,0)<minimum:issues.append(f'{name} must be >= {minimum} mm')
    if settings['rule_severities']['connection_width']!='error':issues.append('Connection width must be a build-blocking error')
    t1=next(f for f in board.GetFootprints() if f.GetReference()=='T1');rings=[]
    for pad in t1.Pads():
        ring=min(pcb.ToMM(pad.GetSize().x-pad.GetDrillSize().x),pcb.ToMM(pad.GetSize().y-pad.GetDrillSize().y))/2
        rings.append({'pad':pad.GetNumber(),'annular_ring_mm':ring})
        if ring<.2-1e-7:issues.append(f'T1.{pad.GetNumber()} annular ring below 0.20 mm')
    vias=[v for v in board.GetTracks() if isinstance(v,pcb.PCB_VIA)];pairs=[]
    for net,positions in PAIRS:
        found=[]
        for point in positions:
            hits=[v for v in vias if v.GetNetname()==net and math.dist(pcb.ToMM(v.GetPosition()),point)<1e-6]
            assert len(hits)==1,(net,point)
            found.append(hits[0])
        radii=[pcb.ToMM(v.GetWidth(pcb.F_Cu))/2 for v in found];pitch=math.dist(*positions)
        assert abs(radii[0]-radii[1])<1e-8
        neck=2*math.sqrt(max(0,radii[0]**2-(pitch/2)**2))
        if neck<.2:issues.append(f'{net} paired via lands are tangent or have insufficient overlap')
        pairs.append({'net':net,'positions_mm':positions,'land_diameters_mm':[r*2 for r in radii],'pitch_mm':pitch,'analytic_overlap_neck_mm':neck})
    return {'status':'FAIL' if issues else 'PASS','violations':issues,'constraints_mm':{k:rules[k] for k in LIMITS},'T1_annular_rings':rings,'paired_vias':pairs}
if __name__=='__main__':
    f=ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb';p=f.with_suffix('.kicad_pro')
    r=inspect(pcb.LoadBoard(str(f)),json.loads(p.read_text()))
    r.update(board_sha256=hashlib.sha256(f.read_bytes()).hexdigest(),project_sha256=hashlib.sha256(p.read_bytes()).hexdigest(),scope='Enforces nonzero project constraints, T1 annular margin and explicit paired-via overlap; native DRC checks all other copper connections.')
    (ROOT/'evidence/audit/clearance-rule-checks.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf8')
    print(json.dumps(r,indent=2))
    assert not r['violations'],r['violations']
