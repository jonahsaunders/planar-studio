"""Build original nominal STEP models. Requires cadquery==2.6.1, not KiCad Python.

These are dimensioned visual/mechanical models, not supplier-certified CAD.
Stock KiCad package models are bundled separately by models_3d.py.
"""
import json
from pathlib import Path
import cadquery as cq

R=Path(__file__).resolve().parents[1]
OUT=R/'kicad/3dmodels/custom';OUT.mkdir(parents=True,exist_ok=True)
records={}
def box(x,y,z,dx,dy,dz):
    return cq.Workplane('XY').box(dx,dy,dz).translate((x,y,z))
def save(name,assembly,description,dimensions):
    path=OUT/(name+'.step')
    assembly.save(str(path),exportType='STEP')
    shape=cq.importers.importStep(str(path)).val()
    assert shape.isValid() and shape.Volume()>0
    b=shape.BoundingBox()
    records[name]={'file':path.relative_to(R).as_posix(),'description':description,'dimensions':dimensions,
                   'bounds_mm':{'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax]},
                   'valid_solid':True,'volume_mm3':shape.Volume()}

# Connector origin is pin 1, +X toward pin 2, +Y toward the board edge.
# KEFA drawing: 5.00 pitch, 10.0 height, 7.60 depth, 1.00 pin diameter,
# 3.60 pin projection; pin row 4.00 from the front face. Cosmetic features
# (wire apertures, screw recesses and shell taper) are simplified.
connector=cq.Assembly(name='KF301_5mm_2P_nominal')
body=cq.Workplane('YZ').polyline([(-3.6,0),(4,0),(4,6.6),(3.1,10),(-2.7,10),(-3.6,6.6)]).close().extrude(10).translate((-2.5,0,0))
for x in [0,5]:
    body=body.cut(box(x,2.8,3.3,3.1,3,3.8))
    body=body.cut(cq.Workplane('XY').center(x,0).circle(1.65).extrude(3).translate((0,0,7.5)))
    screw=cq.Workplane('XY').center(x,0).circle(1.5).extrude(.8).translate((0,0,8.2))
    screw=screw.cut(box(x,0,8.9,2.5,.45,.6)).cut(box(x,0,8.9,.45,2.5,.6))
    connector.add(screw,name=f'screw_{int(x/5)+1}',color=cq.Color(.65,.68,.7))
    pin=cq.Workplane('XY').center(x,0).circle(.5).extrude(4).translate((0,0,-3.6))
    connector.add(pin,name=f'pin_{int(x/5)+1}',color=cq.Color(.7,.72,.73))
    connector.add(box(x,2,3.3,2.5,.4,2.8),name=f'contact_{int(x/5)+1}',color=cq.Color(.65,.62,.4))
connector.add(body,name='housing',color=cq.Color(.04,.25,.72))
save('KF301_5mm_2P',connector,'Original simplified KEFA drawing-based connector; front wire-entry face is +Y.',
     {'pitch_mm':5,'body_width_mm':10,'body_depth_mm':7.6,'body_height_mm':10,'pin_diameter_mm':1,'pin_projection_mm':3.6})

# PowerDI5 typical outline, rotated to match KiCad's cathode-left footprint.
diode=cq.Assembly(name='PowerDI5_nominal')
metal=box(-.9105,0,.1905,3.549,3.05,.381).union(box(-2.97,0,.1905,.57,1.78,.381))
for y in [-.92,.92]:metal=metal.union(box(2.83,y,.1905,.85,.89,.381))
body=box(0,0,.5625,5.37,3.966,1.075).cut(metal)
diode.add(body,name='molded_body',color=cq.Color(.13,.14,.16))
diode.add(metal,name='terminals',color=cq.Color(.72,.74,.76))
save('PowerDI5',diode,'Original simplified typical PowerDI5 outline; cathode left, two anode leads right; no vendor marking.',
     {'body_length_mm':5.37,'body_width_mm':3.966,'height_mm':1.10,'lead_span_mm':6.51,'lead_pitch_mm':1.84})

# Z=0 is the PCB top; its midplane and the core mating plane are at -0.8.
# TDK B66457 nominal half: 31.75 x 20.35 x 6.35, window height 3.20.
# One upper center leg is shortened by 0.21; both outer legs seat at -0.8.
mag=cq.Assembly(name='PS_MAG_001_prepared_core_pair')
upper=box(0,0,3.975,31.75,20.35,3.15)
lower=box(0,0,-5.575,31.75,20.35,3.15)
for x,width in [(-14.2875,3.175),(0,6.35),(14.2875,3.175)]:
    gap=.21 if x==0 else 0
    upper=upper.union(box(x,0,(-.8+gap+2.4)/2,width,20.35,3.2-gap))
    lower=lower.union(box(x,0,-2.4,width,20.35,3.2))
mag.add(upper,name='upper_prepared_half',color=cq.Color(.22,.24,.27))
mag.add(lower,name='lower_ungapped_half',color=cq.Color(.18,.20,.23))
strap=box(0,0,-.8,32.11,12.7,13.06).cut(box(0,0,-.8,31.75,13,12.7))
mag.add(strap,name='provisional_glass_cloth_retention',color=cq.Color(.83,.75,.52))
for x in [-15.975,15.975]:
    for y in [-8.2,8.2]:
        mag.add(box(x,y,-.8,.2,2,.6),name=f'provisional_external_bond_{x}_{y}',color=cq.Color(.54,.38,.18))
save('EELP32_prepared_pair',mag,'Original nominal E+E geometry with 0.21 mm center-only gap; strap/bond envelopes are provisional.',
     {'core_width_mm':31.75,'core_depth_mm':20.35,'core_height_mm':12.7,'total_center_gap_mm':.21,
      'board_thickness_mm':1.6,'mating_plane_z_mm':-.8,'window_height_mm':6.4,'strap_thickness_mm':.18,'strap_width_mm':12.7})

# Illustrative hardware for the four mounting holes, not a procurement choice.
mount=cq.Assembly(name='M3_nylon_mount_provisional')
standoff=cq.Workplane('XY').circle(3).circle(1.55).extrude(8).translate((0,0,-9.6))
head=cq.Workplane('XY').circle(2.75).extrude(2.5)
head=head.cut(cq.Workplane('XY').polygon(6,2.5).extrude(1.5).translate((0,0,1)))
screw=head.union(cq.Workplane('XY').circle(1.45).extrude(6).translate((0,0,-6)))
mount.add(standoff,name='8mm_nonconductive_standoff',color=cq.Color(.83,.85,.88))
mount.add(screw,name='illustrative_M3_screw',color=cq.Color(.78,.8,.84))
save('M3_8mm_mount_envelope',mount,'Provisional unthreaded nylon hardware envelope; not included in the BOM/CPL.',
     {'standoff_height_mm':8,'standoff_diameter_mm':6,'head_diameter_mm':5.5,'shank_diameter_mm':2.9,'board_thickness_mm':1.6})
(OUT/'geometry.json').write_text(json.dumps({'generator':'CadQuery 2.6.1','models':records},indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps(records,indent=2))
