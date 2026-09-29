"""Check the saved board against the independently reviewed component records.

Run in KiCad Python after rebuild. Human datasheet conclusions are retained in
sources/component-review.json; this script checks their applicability to CAD,
records actual pad dimensions, and verifies added stitching against filled copper.
No hardware, source availability, transient or thermal qualification is implied.
"""
import csv,hashlib,json,math,re
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
source=R/'kicad/PS-FLYBACK-5W.kicad_pcb';b=pcb.LoadBoard(str(source))
spec=json.loads((R/'sources/component-review.json').read_text())
parts={p['ref']:p for p in json.loads((R/'circuit.json').read_text())['parts']}
fps={f.GetReference():f for f in b.GetFootprints()}
assert set(fps)==set(parts)=={p['reference'] for p in spec['components']}
def xy(p):return [round(pcb.ToMM(p.x),6),round(pcb.ToMM(p.y),6)]
def vec(p):return pcb.VECTOR2I(pcb.FromMM(p[0]),pcb.FromMM(p[1]))
rows=[]
for reviewed in spec['components']:
    ref=reviewed['reference'];p=parts[ref];f=fps[ref]
    assert p['mpn']==reviewed['expected_mpn'],(ref,'MPN changed; repeat manufacturer review')
    assert str(f.GetFPID().GetLibItemName())==reviewed['expected_footprint'],(ref,'Package changed')
    actual={pad.GetNumber():pad.GetNetname().lstrip('/') for pad in f.Pads() if pad.GetNumber()}
    assert actual==reviewed['expected_nets'],(ref,actual,reviewed['expected_nets'])
    assert p['nets']==reviewed['expected_nets']
    assert list(f.Models()) and all(m.m_Show for m in f.Models())
    rows.append({**reviewed,'selected_value':p['value'],'position_mm':xy(f.GetPosition()),
                 'rotation_degrees':f.GetOrientationDegrees(),'actual_numbered_pad_nets':actual,
                 'actual_pads':[{'number':q.GetNumber(),'net':q.GetNetname(),'center_mm':xy(q.GetPosition()),
                                 'size_mm':xy(q.GetSize()),'drill_mm':xy(q.GetDrillSize())} for q in f.Pads()],
                 'status':'Reviewed for engineering prototype; qualification gates remain'})
# Independently assert dimensions where pin mapping or polarity is package-specific.
for ref in ['J1','J2']:
    pads=sorted(fps[ref].Pads(),key=lambda p:p.GetNumber())
    assert abs(math.dist(xy(pads[0].GetPosition()),xy(pads[1].GetPosition()))-5)<1e-6
    assert all(xy(p.GetDrillSize())==[1.3,1.3] for p in pads)
for ref in ['C3','C8']:
    assert all(sorted(xy(p.GetSize()))==[1.6,3.5] for p in fps[ref].Pads())
assert sorted(sorted(xy(p.GetSize())) for p in fps['D2'].Pads())==[[1.39,1.4],[1.39,1.4],[3.36,4.86]]
ep=next(p for p in fps['U1'].Pads() if p.GetNumber()=='9')
assert sorted(xy(ep.GetSize()))==[2.26,2.99]
added={'PGND':[(84.5,40),(84.5,43),(84.5,55),(86.5,53.5),(85.5,63.4),(91,62.5),
                (99,52.5),(103,54),(114.5,42),(115,54),(114,58),(114,63)],
       'GND_ISO':[(87,108),(90,108),(94,108),(111,108),(112.5,115),(87,115),
                  (87,123),(95.5,122.8),(107,123),(112,128),(91,130),(107,130),(100,131.5),(99,115)]}
vias=[v for v in b.GetTracks() if isinstance(v,pcb.PCB_VIA)]
planes={(z.GetNetname(),z.GetLayer()):z.GetFilledPolysList(z.GetLayer()) for z in b.Zones() if not z.GetIsRuleArea()}
stitches=[]
for net,locations in added.items():
    for pos in locations:
        matches=[v for v in vias if math.dist(xy(v.GetPosition()),pos)<1e-6]
        assert len(matches)==1,(net,pos)
        via=matches[0];assert via.GetNetname()=='/'+net,(pos,'Stitch via assigned wrong net')
        assert pcb.ToMM(via.GetDrill())==.3 and pcb.ToMM(via.GetWidth(pcb.F_Cu))==.6
        # Sample its annulus on both pours, not the hole center: prove solid attachment.
        for layer in [pcb.F_Cu,pcb.B_Cu]:
            poly=planes[('/'+net,layer)]
            assert all(poly.Contains(vec((pos[0]+.24*math.cos(a*math.pi/4),pos[1]+.24*math.sin(a*math.pi/4)))) for a in range(8)),(net,pos,b.GetLayerName(layer),'Not a solid two-plane stitch')
        assert pos[1]<=64.5 if net=='PGND' else pos[1]>=106
        stitches.append({'net':net,'position_mm':pos,'diameter_mm':.6,'drill_mm':.3,'F_and_B_filled_plane_attachment_checked':True})
calc=json.loads((R/'evidence/electrical-sizing.json').read_text())
ops=list(csv.DictReader((R/'evidence/operating-points.csv').open()))
irms=max(float(v['input_cap_total_rms_A']) for v in ops if float(v['Iout'])==1)
filter_checks={'input_cap_rms_screening_bound_A':irms,'C7_ripple_rating_A_at_100kHz':1.1,
 'R8_loss_if_all_input_ripple_in_branch_W':irms**2*2.2*1.01,'R8_rating_W_at_70C':1.5,
 'C7_charge_current_A_at_36V_10ms_Cplus20pct':47e-6*1.2*36/.01,
 'R8_ramp_loss_W':(47e-6*1.2*36/.01)**2*2.2*1.01,
 'C7_max_empty_charge_energy_J':.5*47e-6*1.2*36**2,
 'ideal_hard_step_initial_R8_power_W':36**2/(2.2*.99),
 'output_bulk_minimum_F':calc['output_bulk_minimum_F'],'output_ripple_estimate_V':calc['full_load_ripple_sizing_max_V'],
 'limits':'Sinusoidal/distributed branch current, source/cable impedance, MLCC bias, frequency-dependent ESR and transients are not simulated. A hard step is not qualified.'}
assert irms<1.1 and filter_checks['R8_loss_if_all_input_ripple_in_branch_W']<1.5
record={'review_date':spec['review_date'],'board_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'source_SHA256':{name:hashlib.sha256((R/name).read_bytes()).hexdigest() for name in ['sources/component-review.json','circuit.json','kicad/PS-FLYBACK-5W.kicad_sch','evidence/electrical-sizing.json']},
        'reviewed_footprints':len(rows),'electronic_references':sum(not p['exclude_from_bom'] and p['ref']!='T1' for p in parts.values()),
        'ordinary_vias':len(vias),'new_ground_stitches':stitches,'filter_checks':filter_checks,'components':rows}
(R/'evidence/audit/component-checks.json').write_text(json.dumps(record,indent=2)+'\n')
fields=['reference','expected_mpn','expected_footprint','rating','package_review','use_case','remaining_validation','source','status']
with (R/'evidence/audit/component-audit.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
print(json.dumps({k:v for k,v in record.items() if k not in ['components','new_ground_stitches','source_SHA256']},indent=2))
