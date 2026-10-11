"""Compare selected sensitive nets against actual filled adjacent ground planes.
Geometry only: no field solution, impedance extraction or EMI prediction.
"""
from pathlib import Path
import pcbnew as p,json,math,sys
R=Path(__file__).resolve().parents[1]
CHECKS=[('VREF','SGND'),('OV_REF','SGND'),('COMP','SGND'),('FB_K','SGND'),
        ('OV_K','SGND'),('FB_LED','SGND'),('OV_LED','SGND'),('DT','AGND'),
        ('RT','AGND'),('SS','AGND'),('OC','AGND'),('FB_COL','AGND'),
        ('BIAS_FB','PGND'),('RIPPLE','PGND'),('HI','AGND'),('LI','AGND'),('VS1','SGND')]
LAYERS=[p.F_Cu,p.In1_Cu,p.In2_Cu,p.In3_Cu,p.In4_Cu,p.In5_Cu,p.In6_Cu,p.B_Cu]

def inspect(root):
    b=p.LoadBoard(str(root/'kicad/PS-GAN-60W.kicad_pcb'))
    aliases=json.loads((root/'net-aliases.json').read_text(encoding='utf8'))
    rows=[]
    for logical,ground in CHECKS:
        net=aliases[logical];total=covered=qualified=qcovered=0.;bad=[];ls=set()
        vias=[t.GetPosition() for t in b.GetTracks() if isinstance(t,p.PCB_VIA) and t.GetNetname()==net]
        for t in b.GetTracks():
            if isinstance(t,p.PCB_VIA) or t.GetNetname()!=net:continue
            layer=t.GetLayer();i=LAYERS.index(layer);ls.add(b.GetLayerName(layer))
            adj=LAYERS[max(0,i-1):i]+LAYERS[i+1:i+2]
            polys=[z.GetFilledPolysList(l) for z in b.Zones() for l in adj
                   if not z.GetIsRuleArea() and z.GetNetname()==ground and z.GetLayer()==l]
            start=t.GetStart();end=t.GetEnd();n=max(1,math.ceil(t.GetLength()/25000))
            for j in range(n):
                q=p.VECTOR2I(round(start.x+(end.x-start.x)*(j+.5)/n),round(start.y+(end.y-start.y)*(j+.5)/n))
                length=t.GetLength()/n;total+=length
                ok=any(poly.Contains(q) for poly in polys)
                if ok:covered+=length
                if any(math.hypot(q.x-v.x,q.y-v.y)<650000 for v in vias):continue
                qualified+=length
                if ok:qcovered+=length
                elif len(bad)<8:bad.append([round(q.x/1e6-60,4),round(q.y/1e6-60,4),b.GetLayerName(layer)])
        rows.append({'logical_net':logical,'native_net':net,'reference':ground,'signal_layers':sorted(ls),
                     'total_trace_length_mm':round(total/1e6,3),'raw_adjacent_coverage_percent':round(100*covered/total,3),
                     'length_outside_own_via_clearances_mm':round(qualified/1e6,3),
                     'coverage_outside_own_via_clearances_percent':round(100*qcovered/qualified,3),
                     'uncovered_sample_examples':bad})
    return rows

current=inspect(R)
report={'revision':'A12','sample_step_max_mm':.025,'own_net_via_exclusion_radius_mm':.65,
        'method':'Sample every explicit selected-net trace centerline against filled same-domain copper on either immediately adjacent layer. Report raw coverage and coverage excluding only the selected net\'s own via antipads. Never exclude foreign-net voids. Does not measure copper width, return-current distribution, inductance or crosstalk; not a universal all-net coverage claim.',
        'current':current}
if len(sys.argv)>1:report['previous_A9']=inspect(Path(sys.argv[1]))
(R/'evidence/reference-plane-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
for row in current:print(row['logical_net'],row['coverage_outside_own_via_clearances_percent'],row['uncovered_sample_examples'])
assert all(not row['uncovered_sample_examples'] for row in current),'Selected trace crosses foreign void or reference boundary'
