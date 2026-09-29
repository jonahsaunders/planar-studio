"""Nominal solid interference check. Requires CadQuery 2.6.1 and kicad-cli.

Run verify-3d-models.py first with KiCad Python. Does not validate tolerances,
enclosure fit, wiring/tool access, adhesive process or hardware procurement.
"""
import argparse,hashlib,itertools,json,os,subprocess,tempfile
from pathlib import Path
import cadquery as cq
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--kicad-cli',default='kicad-cli');a=p.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
checks=json.loads((R/'evidence/audit/3d-model-checks.json').read_text())
assets={};placed={};collisions=[];substrate_collisions=[]
for item in checks['models']:
    path=R/item['model']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
    if item['model'] not in assets:
        s=cq.importers.importStep(str(path)).val()
        assert s.isValid() and s.Volume()>0,(path,'Invalid or empty solid')
        assets[item['model']]=s
    x,y=item['position_mm']
    placed[item['reference']]=assets[item['model']].rotate((0,0,0),(0,0,1),item['rotation_deg']).translate((x,-y,0))
with tempfile.TemporaryDirectory(prefix='flyback-solids-') as temp:
    path=Path(temp)/'substrate.step'
    subprocess.run([a.kicad_cli,'pcb','export','step','--board-only','--user-origin','0x0mm',
                    '--output',str(path),str(R/'kicad/PS-FLYBACK-5W.kicad_pcb')],check=True,cwd=R)
    raw=cq.importers.importStep(str(path)).val()
    # KiCad exports dielectric thickness without the two external copper layers.
    # Use its exact routed outline/drills at full nominal board thickness.
    top=max(cq.Workplane(obj=raw).faces('>Z').vals(),key=lambda f:f.Area())
    top=top.translate((0,0,-raw.BoundingBox().zmax))
    substrate=cq.Solid.extrudeLinear(top.outerWire(),top.innerWires(),(0,0,-checks['board_thickness_mm']))
for ref,shape in placed.items():
    volume=shape.intersect(substrate).Volume()
    if volume>1e-6:substrate_collisions.append({'reference':ref,'volume_mm3':volume})
minimum=(float('inf'),None)
for (ref1,s1),(ref2,s2) in itertools.combinations(placed.items(),2):
    distance=s1.distance(s2)
    if distance<minimum[0]:minimum=(distance,[ref1,ref2])
    if distance<1e-6:
        volume=s1.intersect(s2).Volume()
        if volume>1e-6:collisions.append({'references':[ref1,ref2],'volume_mm3':volume})
record={'method':'OpenCascade STEP import validity, exact solid pair intersections, and nominal 1.6 mm substrate extruded from KiCad-exported routed outline and drilled holes; model top datum Z=0.',
        'scope':'Nominal geometry only. No enclosure, tolerance stack, solder, tool/wire access or process qualification. Provisional M3 hardware and retention envelopes are illustrative.',
        'valid_STEP_assets':len(assets),'placed_footprints':len(placed),'component_pairs_checked':len(placed)*(len(placed)-1)//2,
        'component_intersections':collisions,'substrate_intersections':substrate_collisions,
        'minimum_between_different_footprints_mm':minimum[0],'closest_footprints':minimum[1],
        'core_to_nominal_substrate_clearance_mm':placed['T1'].distance(substrate),
        'core_below_board_mm':-placed['T1'].BoundingBox().zmin-checks['board_thickness_mm'],
        'provisional_mount_plane_to_core_clearance_mm':placed['T1'].BoundingBox().zmin-placed['H1'].BoundingBox().zmin,
        'source_SHA256':{'kicad/PS-FLYBACK-5W.kicad_pcb':hashlib.sha256((R/'kicad/PS-FLYBACK-5W.kicad_pcb').read_bytes()).hexdigest(),
                         **{x['model']:x['sha256'] for x in checks['models']}}}
(R/'evidence/audit/3d-solid-checks.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print(json.dumps(record,indent=2))
assert not collisions and not substrate_collisions,'Resolve positive-volume interference before publishing'
