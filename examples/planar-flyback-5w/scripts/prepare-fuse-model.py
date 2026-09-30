"""Normalize Bourns' supplied STEP datum, retaining its geometry.

Requires CadQuery 2.6.1. No scaling or invented package geometry is applied.
"""
import hashlib,json
from pathlib import Path
import cadquery as cq
from cadquery.occ_impl.exporters.assembly import exportStepMeta

R=Path(__file__).resolve().parents[1]
folder=R/'kicad/3dmodels/vendor/Bourns'
source=folder/'sf-1206f_series.stp'
out=folder/'SF-1206F_KiCad.step'
shape=cq.importers.importStep(str(source)).val()
# Bourns uses +Y as package up, with its body centered about the origin.
# KiCad uses +Z up and Z=0 on the seating plane.
shape=shape.rotate((0,0,0),(1,0,0),90).translate((0,0,.3))
assembly=cq.Assembly(name='Bourns_SF1206F')
assembly.add(shape,name='fuse_body',color=cq.Color(.82,.82,.77))
# Original AP203 file is uncolored. End metallization and the black top
# coating are cosmetic colors inferred from the manufacturer outline.
for i,face in enumerate(shape.Faces()):
    b=face.BoundingBox()
    if b.xmin>=1.05-1e-6 or b.xmax<=-1.05+1e-6:color=cq.Color(.70,.72,.74)
    elif b.zmin>=.575-1e-6:color=cq.Color(.07,.07,.07)
    else:continue
    assembly.objects['fuse_body'].addSubshape(face,name=f'face_{i}',color=color)
assert exportStepMeta(assembly,str(out))
shape=cq.importers.importStep(str(out)).val();b=shape.BoundingBox()
assert shape.isValid() and shape.Volume()>0
for actual,expected in zip([b.xmin,b.xmax,b.ymin,b.ymax,b.zmin,b.zmax],[-1.55,1.55,-.775,.775,0,.605]):
    assert abs(actual-expected)<1e-6,(actual,expected)
record={'source_url':'https://www.bourns.com/engineering/sf1206f/sf-1206f_series.stp',
        'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'normalized_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
        'transform':'Rotate +90 degrees about X, then translate Z +0.3 mm; scale 1.',
        'bounds_mm':{'min':[b.xmin,b.ymin,b.zmin],'max':[b.xmax,b.ymax,b.zmax]},
        'valid_solid':True,'volume_mm3':shape.Volume(),
        'notes':'Official SF-1206F series geometry, normalized and cosmetically colored from the drawing. Header names SF-0603F, but measured 3.10 x 1.55 mm envelope matches the SF-1206F drawing. 0.600 mm body plus 0.005 mm modeled surface detail. Series marking is not a verified 1 A production marking.'}
(folder/'provenance.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
print(json.dumps(record,indent=2))
