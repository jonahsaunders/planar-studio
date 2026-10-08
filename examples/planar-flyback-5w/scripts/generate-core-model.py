"""TDK EELP22 factory-gapped pair and matching clips. Requires CadQuery 2.6.1.

Ferrite dimensions and gaps: TDK drawing pp2-3. Nominal datum is PCB top Z=0.
Clip bow, material thickness and recess detail are illustrative: the public
drawing does not fully dimension them. A separate conservative envelope is
verified by verify-core-fit.py; neither model is supplier-certified CAD.
"""
import json
from pathlib import Path
import cadquery as cq

R=Path(__file__).resolve().parents[1]
mag=json.loads((R/'magnetics.json').read_text())
thickness=json.loads((R/'stackup.json').read_text())['published_copper_plus_dielectric_mm']
out=R/'kicad/3dmodels/custom';out.mkdir(exist_ok=True)
def box(x,y,z,dx,dy,dz):
    return cq.Workplane('XY').box(dx,dy,dz).translate((x,y,z))
def half():
    s=box(0,0,4.45,21.8,15.8,2.5)
    for x,w in [(-9.65,2.5),(0,5),(9.65,2.5)]:
        g=mag['individual_gap_mm'] if x==0 else 0
        s=s.union(box(x,0,(3.2+g)/2,w,15.8,3.2-g))
    # Recess details are not fully dimensioned; only the 2.8 mm strip width
    # is given (reference dimension). Keep this approximation out of fit proof.
    for x in [-10.75,10.75]:s=s.cut(box(x,0,4.6,.6,2.8,.65))
    return s
assembly=cq.Assembly(name='PS_MAG_002_A2')
upper=half();lower=upper.rotate((0,0,0),(1,0,0),180)
assembly.add(upper,name='B66285G0050X187_upper_0p05mm_gap',color=cq.Color(.22,.24,.27))
assembly.add(lower,name='B66285G0050X187_lower_0p05mm_gap',color=cq.Color(.18,.20,.23))
profile=[(10.6,4.8),(11.1,5.0),(11.5,4.1),(11.9,0),(11.5,-4.1),(11.1,-5.0),(10.6,-4.8),
         (10.6,-4.6),(11.0,-4.78),(11.3,-4.0),(11.7,0),(11.3,4.0),(11.0,4.78),(10.6,4.6)]
clip=cq.Workplane('XZ').polyline(profile).close().extrude(2.3,both=False).translate((0,1.15,0))
assembly.add(clip,name='B66286A2000X000_right_illustrative_bends',color=cq.Color(.72,.74,.77))
assembly.add(clip.rotate((0,0,0),(0,0,1),180),name='B66286A2000X000_left_illustrative_bends',color=cq.Color(.72,.74,.77))
assembly.loc=cq.Location(cq.Vector(0,0,-thickness/2))
file=out/'EELP22_factory_gapped_pair.step';assembly.save(str(file),exportType='STEP')
s=cq.importers.importStep(str(file)).val();assert s.isValid() and len(s.Solids())==4
b=s.BoundingBox()
g=out/'geometry.json';record=json.loads(g.read_text())
record['models']['EELP22_factory_gapped_pair']={
    'file':file.relative_to(R).as_posix(),'description':__doc__,
    'source':mag['source'],'valid_solid':True,'solids':4,'volume_mm3':s.Volume(),
    'bounds_mm':{'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax]},
    'dimensions':{'core_width_mm':21.8,'core_depth_mm':15.8,'core_height_mm':11.4,
                  'total_center_gap_mm':.10,'gap_per_half_mm':.05,'board_thickness_mm':thickness}}
g.write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print('Saved four-solid factory-gapped core and clip assembly:',file)
