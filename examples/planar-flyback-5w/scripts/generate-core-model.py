"""TDK-derived EELP22 pair and clips. Requires CadQuery 2.6.1.

Original ungapped-core and free-spring STEP files are preserved byte-for-byte.
Trim only the model's center post by the ordered factory gap. The displayed
clip pose opens its 8.8 mm CAD jaw to the core's 9.4 mm recess-floor spacing.
Uniform Z opening is a visualization surrogate, not an elastic/force simulation.
The independent PCB fit check uses a larger envelope, not this estimated pose.
"""
import hashlib,json
from pathlib import Path
import cadquery as cq
R=Path(__file__).resolve().parents[1]
mag=json.loads((R/'magnetics.json').read_text())
thickness=json.loads((R/'stackup.json').read_text())['published_copper_plus_dielectric_mm']
vendor=R/'kicad/3dmodels/vendor/TDK'
core_path=vendor/'B66285G_ungapped.stp';clip_path=vendor/'B66286A2000X000.stp'
core=cq.importers.importStep(str(core_path)).val()
core=core.rotate((0,0,0),(1,0,0),-90).rotate((0,0,0),(0,0,1),-90).translate((0,0,5.7))
gap=mag['individual_gap_mm']
cutter=cq.Workplane('XY').box(5.1,16.1,gap+.1).translate((0,0,(gap-.1)/2)).val()
upper=core.cut(cutter);lower=upper.rotate((0,0,0),(1,0,0),180)
raw=cq.importers.importStep(str(clip_path)).val()
opening=9.4/8.8
opened=raw.transformGeometry(cq.Matrix([[1,0,0,0],[0,1,0,0],[0,0,opening,0],[0,0,0,1]]))
right=opened.rotate((0,0,0),(0,0,1),180).translate((11.5,0,0))
left=right.rotate((0,0,0),(0,0,1),180)
solids=[upper,lower,right,left]
for i,a in enumerate(solids):
    assert a.isValid()
    for b in solids[i+1:]:assert a.intersect(b).Volume()<1e-5
assembly=cq.Assembly(name='PS_MAG_002_A4_TDK_derived')
for s,name,color in zip(solids,['core_upper_factory_0p05_gap','core_lower_factory_0p05_gap','clip_right_estimated_opened_pose','clip_left_estimated_opened_pose'],[(.22,.24,.27),(.18,.20,.23),(.72,.74,.77),(.72,.74,.77)]):
    assembly.add(s.translate((0,0,-thickness/2)),name=name,color=cq.Color(*color))
out=R/'kicad/3dmodels/custom/EELP22_factory_gapped_pair.step'
assembly.save(str(out))
s=cq.importers.importStep(str(out)).val();b=s.BoundingBox()
assert s.isValid() and len(s.Solids())==4
geo_path=out.parent/'geometry.json';geo=json.loads(geo_path.read_text())
geo['models']['EELP22_factory_gapped_pair']={'file':out.relative_to(R).as_posix(),'description':__doc__,
 'source':'TDK vendor STEP outlines; sources/tdk-mechanical-cad.json','valid_solid':True,'solids':4,'volume_mm3':s.Volume(),
 'bounds_mm':{'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax]},
 'dimensions':{'core_width_mm':21.8,'core_depth_mm':15.8,'core_height_mm':11.4,'total_center_gap_mm':.10,'gap_per_half_mm':.05,'board_thickness_mm':thickness},
 'nominal_displayed_clip_outer_x_mm':11.8,'raw_clip_span_mm':[raw.BoundingBox().xlen,raw.BoundingBox().ylen,raw.BoundingBox().zlen],
 'clip_free_inner_jaw_CAD_mm':8.8,'core_recess_floor_spacing_CAD_mm':9.4,'displayed_clip_z_opening_scale':opening,
 'source_SHA256':{p.relative_to(R).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in [core_path,clip_path]}}
geo_path.write_text(json.dumps(geo,indent=2)+'\n',encoding='utf8')
print('Built four valid TDK-derived solids; no nominal intersections. Clip opening pose is a visualization surrogate.')
