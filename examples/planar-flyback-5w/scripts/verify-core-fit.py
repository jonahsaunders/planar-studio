"""Independent A2 fit proof from the SAVED board's STEP cutouts. CadQuery 2.6.1.

TDK pp2-3 dimensions are transcribed here independently of the winding generator.
Checks nominal solids, maximum ferrite corners, inward routing error, rounded
corners, PCB thickness, and the explicitly conditional installed-clip envelope.
"""
import argparse, hashlib, itertools, json, math, os, subprocess, tempfile
from pathlib import Path
import cadquery as cq

R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--kicad-cli',default='kicad-cli');args=p.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
board=R/'kicad/PS-FLYBACK-5W.kicad_pcb'
checks=json.loads((R/'evidence/audit/3d-model-checks.json').read_text())
t1=next(x for x in checks['models'] if x['reference']=='T1')
assert t1['position_mm']==[100,85] and t1['rotation_deg']==0
model=R/t1['model'];nominal=cq.importers.importStep(str(model)).val().translate((100,-85,0))
with tempfile.TemporaryDirectory(dir=R/'.kicad-config',prefix='fit-') as tmp:
    path=Path(tmp)/'board.step'
    subprocess.run([args.kicad_cli,'pcb','export','step','--board-only','--user-origin','0x0mm','--output',str(path),str(board)],check=True)
    raw=cq.importers.importStep(str(path)).val()
    top=max(cq.Workplane(obj=raw).faces('>Z').vals(),key=lambda f:f.Area())
    top=top.translate((0,0,-raw.BoundingBox().zmax))
    substrate=cq.Solid.extrudeLinear(top.outerWire(),top.innerWires(),(0,0,-checks['board_thickness_mm']))
slots=[]
for wire in top.innerWires():
    b=wire.BoundingBox()
    if b.ylen>16 and b.xlen>5:
        slots.append([b.xmin-100,b.ymin+85,b.xmax-100,b.ymax+85])
slots.sort();assert len(slots)==3,slots
expected=[[-13.1,-8.55,-7.7,8.55],[-3.05,-8.55,3.05,8.55],[7.7,-8.55,13.1,8.55]]
for actual,want in zip(slots,expected):assert max(abs(a-b) for a,b in zip(actual,want))<.002,(actual,want)
assert nominal.isValid() and len(nominal.Solids())==4
for a,b in itertools.combinations(nominal.Solids(),2):assert a.intersect(b).Volume()<1e-6
assert nominal.intersect(substrate).Volume()<1e-6

def rounded_margin(x,y,b,r=.5):
    # Signed distance inside a rounded rectangle. Keep R0.5 AFTER shrinking
    # each wall by 0.2, conservatively larger than a parallel-offset R0.3.
    cx=(b[0]+b[2])/2;cy=(b[1]+b[3])/2
    qx=abs(x-cx)-(b[2]-b[0])/2+r;qy=abs(y-cy)-(b[3]-b[1])/2+r
    return r-math.hypot(max(qx,0),max(qy,0))-min(max(qx,qy),0)
reduced=[[a+.2,b+.2,c-.2,d-.2] for a,b,c,d in slots]
# Maximum post 5.1 x16.1; maximum outside 22.2, minimum inside span16.4.
# Rectangular sharp ferrite corners bound the manufacturer's rounded corners.
sections=[[-11.1,-8.05,-8.2,8.05],[-2.55,-8.05,2.55,8.05],[8.2,-8.05,11.1,8.05]]
corners=[]
for i,(core,slot) in enumerate(zip(sections,reduced)):
    for dx,dy in itertools.product([-.05,.05],repeat=2):
        for x,y in itertools.product([core[0],core[2]],[core[1],core[3]]):
            margin=rounded_margin(x+dx,y+dy,slot)
            assert margin>.14,(i,dx,dy,x,y,margin)
            corners.append(margin)
# Max 2.4 mm strip and an installed bow <=1.5 mm beyond maximum ferrite.
# The second dimension is a DESIGN ACCEPTANCE ENVELOPE, not a TDK tolerance.
clip_sections=[[-12.6,-1.2,-10.9,1.2],[10.9,-1.2,12.6,1.2]]
clip_margins=[]
for core,slot in zip(clip_sections,[reduced[0],reduced[2]]):
    for dx,dy in itertools.product([-.05,.05],repeat=2):
        for x,y in itertools.product([core[0],core[2]],[core[1],core[3]]):
            clip_margins.append(rounded_margin(x+dx,y+dy,slot))
assert min(clip_margins)>=.249
vertical_margin=(2*3.1-1.78)/2
assert vertical_margin>2.2
# Full maximum body (no recess credit) against all other installed components.
maximum=cq.Workplane('XY').box(22.2,16.1,11.6).translate((100,-85,-.89)).val()
for sign in [-1,1]:
    clip=cq.Workplane('XY').box(1.5,2.4,11.6).translate((100+sign*11.85,-85,-.89)).val()
    maximum=maximum.fuse(clip)
collisions=[]
for item in checks['models']:
    if item['reference']=='T1':continue
    s=cq.importers.importStep(str(R/item['model'])).val()
    x,y=item['position_mm'];s=s.rotate((0,0,0),(0,0,1),item['rotation_deg']).translate((x,-y,0))
    # 1 mm lateral wander bounds normal clearance-driven core motion relative
    # to component bodies; insertion fit above is checked at the centered pose.
    for dx,dy in itertools.product([-1,1],repeat=2):
        v=maximum.translate((dx,dy,0)).intersect(s).Volume()
        if v>1e-6:collisions.append([item['reference'],dx,dy,v])
assert not collisions,collisions
result={
    'revision':'A2-development','source':'TDK ELP22/6/16 October 2022 pp2-3; JLCPCB regular routing ±0.2 mm',
    'method':__doc__,'actual_saved_board_slots_local_mm':slots,'rounded_slot_radius_mm':.5,
    'routing_inward_error_per_wall_mm':.2,'centered_insertion_pose_allowance_mm':.05,
    'maximum_ferrite_corner_checks':len(corners),'minimum_corner_clearance_mm':min(corners),
    'maximum_board_thickness_mm':1.78,'minimum_vertical_clearance_per_face_mm':vertical_margin,
    'nominal_core_clip_solid_count':len(nominal.Solids()),'nominal_substrate_intersection_mm3':nominal.intersect(substrate).Volume(),
    'minimum_clip_envelope_slot_clearance_mm':min(clip_margins),
    'maximum_body_component_intersections':collisions,'component_pose_wander_checked_mm':1,
    'conditional_clip_limit':'Installed bow must stay <=1.5 mm beyond maximum core edge, strip <=2.4 mm wide. TDK does not specify installed bow/recess depth; verify the first physical pair. Clip STEP bends/recesses are illustrative.',
    'mechanical_scope':'Centered insertion guaranteed only within the stated dimensional model; no measured part, retention-force, vibration or thermal qualification. Core may float after clipping.',
    'source_SHA256':{str(f.relative_to(R)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in [board,model,R/'magnetics.json']}}
(R/'evidence/audit/core-fit-checks.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
