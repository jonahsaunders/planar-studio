"""Decode published Gerbers with PyGerber and compare to saved native geometry."""
import json,hashlib,math
from pathlib import Path
from shapely.geometry import Point,Polygon,LineString,box,GeometryCollection
from shapely.ops import unary_union,nearest_points
from shapely.affinity import translate,rotate,scale
from pygerber.gerberx3.api.v2 import GerberFile
R=Path(__file__).resolve().parents[1];W=R/'.kicad-config'
def num(x):return float(x.value)
def xy(v):return (num(v.x),num(v.y))
def native(ps):
    return unary_union([Polygon(p['shell'],p['holes']).buffer(0) for p in ps])
def aperture(a):
    name=type(a).__name__
    if name=='Circle2':g=Point(0,0).buffer(num(a.diameter)/2,quad_segs=256)
    elif name=='Rectangle2':
        xx,yy=num(a.x_size)/2,num(a.y_size)/2;g=rotate(box(-xx,-yy,xx,yy),float(a.rotation),origin=(0,0))
    elif name=='Obround2':
        xx,yy=num(a.x_size),num(a.y_size);rr=min(xx,yy)/2;half=abs(xx-yy)/2
        g=LineString([(-half,0),(half,0)] if xx>=yy else [(0,-half),(0,half)]).buffer(rr,quad_segs=256)
        if hasattr(a,'rotation'):g=rotate(g,float(a.rotation),origin=(0,0))
    elif name=='Macro2':g=commands(a.command_buffer.commands)
    else:raise AssertionError(('unknown aperture',name,a.__dict__))
    if getattr(a,'hole_diameter',None):g=g.difference(Point(0,0).buffer(num(a.hole_diameter)/2,quad_segs=256))
    return g
def draw(c):
    name=type(c).__name__
    assert c.transform.mirroring.value=='N' and float(c.transform.scaling)==1 and float(c.transform.rotation)==0,('transform',c)
    if name=='Flash2':return translate(aperture(c.aperture),*xy(c.flash_point))
    if name=='Line2':
        if type(c.aperture).__name__=='NoCircle2':
            return LineString([xy(c.start_point),xy(c.end_point)]).buffer(num(c.aperture.diameter)/2,cap_style='flat')
        a=aperture(c.aperture);start,end=xy(c.start_point),xy(c.end_point)
        if a.is_empty:return LineString([start,end])
        return unary_union([translate(a,*start),translate(a,*end)]).convex_hull
    if name=='Region2':
        pts=[]
        for seg in c.command_buffer.commands:
            assert type(seg).__name__=='Line2',type(seg).__name__
            start,end=xy(seg.start_point),xy(seg.end_point)
            if not pts:pts.append(start)
            assert math.dist(pts[-1],start)<1e-6,('multiple region contours',pts[-1],start)
            pts.append(end)
        return Polygon(pts).buffer(0)
    raise AssertionError(('unknown command',name,c.__dict__))
def commands(cs):
    g=GeometryCollection();positive=[]
    for c in cs:
        if c.transform.polarity.value=='D':positive.append(draw(c))
        else:
            assert c.transform.polarity.value=='C'
            g=unary_union([g,*positive]).difference(draw(c));positive=[]
    return unary_union([g,*positive])
x=json.loads((W/'clearance-extras.json').read_text())
d=json.loads((R/'.kicad-config/copper-audit-geometry.json').read_text())
assert d['board_sha256']==x['board_sha256']==hashlib.sha256((R/'kicad/PS-FLYBACK-5W.kicad_pcb').read_bytes()).hexdigest(),'Native geometry is stale'
out={'board_sha256':d['board_sha256'],'envelope_tolerance_mm':.0003,'layers':{}}
layers={'F.Cu':'gtl','B.Cu':'gbl','In1.Cu':'g1','In2.Cu':'g2','In3.Cu':'g3','In4.Cu':'g4','F.Mask':'gts','B.Mask':'gbs'}
gerber={}
for l,ext in layers.items():
    f=next((R/'manufacturing/gerbers').glob('*.'+ext));parsed=GerberFile.from_file(f).parse()
    g=translate(scale(commands(parsed._command_buffer.commands),xfact=1,yfact=-1,origin=(0,0)),78,132)
    gerber[l]=g
    source=unary_union([native(i['geometry'][l]) for i in d['items'] if l in i['geometry']]) if l.endswith('Cu') else unary_union([native(i['geometry']) for i in x['mask'] if i['layer']==l])
    extra=g.difference(source.buffer(.0003)).area;missing=source.difference(g.buffer(.0003)).area
    out['layers'][l]={'gerber_sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'commands':len(parsed._command_buffer.commands),'extra_outside_envelope_mm2':extra,'missing_outside_envelope_mm2':missing}
    print(l,out['layers'][l],flush=True)
    assert extra+missing<1e-7,(l,extra,missing)
out['scope']='All six copper layers and both solder-mask exports equal native geometry within a 0.0003 mm approximation envelope; unsupported Gerber primitives fail closed. Circle approximation 1024 vertices. Does not verify delivered manufacturing tolerances.'
out['status']='PASS'
(R/'evidence/audit/full-gerber-geometry-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print('PASS all six copper and both mask export geometry checks',flush=True)
