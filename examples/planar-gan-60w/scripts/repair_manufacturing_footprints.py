"""Repair bundled A12 library footprints, using TI RAR0017B dimensions for U1.

Run with KiCad Python. Edits existing PS library items, never system libraries.
The dimensions below are in mm about the manufacturer's package center.
TI land/stencil drawing 4229681/B, March 2024, LMG2100R044 datasheet pp. 28-29.
Power copper, solder-mask openings and stencil apertures are independent.
"""
from pathlib import Path
import json, math
import pcbnew as p
R=Path(__file__).resolve().parents[1]; L=R/'kicad/PS.pretty'
name='QFN-17_L5.5-W4.5-P0.50-TL_LMG2100R044'

def poly(number, pts, layers, anchor=None):
    if anchor is None: anchor=(sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts))
    x,y=anchor
    points=' '.join(f'(xy {a-x:.6f} {b-y:.6f})' for a,b in pts)
    return f'(pad "{number}" smd custom (at {x:.6f} {y:.6f}) (size 0.005 0.005) (layers {layers}) (options (clearance outline) (anchor rect)) (primitives (gr_poly (pts {points}) (width 0) (fill yes))))'
def rect(number,x,y,w,h,layers,radius=None):
    ratio=.1 if radius is None else radius/min(w,h)
    return f'(pad "{number}" smd roundrect (at {x} {y}) (size {w} {h}) (layers {layers}) (roundrect_rratio {ratio}))'
def line(a,b,layer,w=.15):
    return f'(fp_line (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width {w}) (type default)) (layer "{layer}"))'
def rectangle(x0,y0,x1,y1,layer,w):
    q=[(x0,y0),(x1,y0),(x1,y1),(x0,y1),(x0,y0)]
    return ''.join(line(a,b,layer,w) for a,b in zip(q,q[1:]))
cu='"F.Cu"'; mask='"F.Mask"'; paste='"F.Paste"'; all_layers=cu+' '+mask+' '+paste
out=[f'(footprint "{name}" (version 20241229) (generator "pcbnew") (layer "F.Cu") (attr smd)',
     '(descr "TI RAR0017B, 4229681/B 03/2024. Centered origin. Independent copper, mask and 0.125 mm stencil pattern.")',
     '(property "Reference" "REF**" (at 0 -4) (layer "F.Fab") (effects (font (size 1 1) (thickness .15))))',
     f'(property "Value" "{name}" (at 0 4) (layer "F.Fab") (effects (font (size 1 1) (thickness .15))))',
     '(solder_mask_margin 0)', '(solder_paste_margin 0)',
     rectangle(-2.25,-2.75,2.25,2.75,'F.Fab',.1),
     line((-2.25,-2.15),(-1.65,-2.75),'F.Fab',.1),
     # Dot sits outside the land and is visible after assembly; no body outline
     # crosses the dense fine-pitch pads.
     '(fp_circle (center -2.85 -2.65) (end -2.7 -2.65) (stroke (width .15) (type default)) (fill solid) (layer "F.SilkS"))',
     rectangle(-2.8,-3.25,2.8,3.25,'F.CrtYd',.05)]
pin1=[(-2.45,-2.45),(-2,-2.45),(-2,-2.95),(-1.75,-2.95),(-1.75,-2.2),(-2.45,-2.2)]
out += [poly(1,pin1,all_layers,(-2.1,-2.325)),poly(11,[(-x,y) for x,y in reversed(pin1)],all_layers,(2.1,-2.325))]
for num,y in [(2,-1.825),(3,-1.325),(4,-.825)]:out.append(rect(num,-2.1,y,.7,.25,all_layers))
for num,y in [(10,-1.825),(9,-1.325),(8,-.825)]:out.append(rect(num,2.1,y,.7,.25,all_layers))
for num,x in [(16,-1.175),(15,-.675),(14,-.175),(13,.325),(12,.825)]:out.append(rect(num,x,-2.6,.25,.7,all_layers))
# Solder-mask-defined power lands: copper surrounds each opening by >=0.05 mm.
for num,x in [(5,-2.1),(7,2.1)]:out.append(rect(num,x,1.35,.8,2.6,cu,radius=.025))
out.append(rect(6,0,1.3395,2,3.321,cu,radius=.025))
p17=[(-1.4,-1.9),(.95,-1.9),(.95,-.571),(-.95,-.571),(-.95,-.685),(-1.4,-.685)]
out.append(poly(17,p17,cu+' '+mask,(-.225,-1.235)))
# Side fingers. Pin 5 left and pin 7 mirrored. Mask backbone is 0.375 mm;
# paste backbone 0.250 mm, matching TI's approximately 75% opening coverage.
def fingers(inner):
    pts=[(inner,.1),(-2.125,.1)]
    for top in [.462,.962,1.462,1.962]:
        pts += [(-2.125,top),(-2.45,top),(-2.45,top+.25),(-2.125,top+.25)]
    return pts+[(-2.125,2.6),(inner,2.6)]
for layer,inner in [(mask,-1.75),(paste,-1.875)]:
    q=fingers(inner);out += [poly('',q,layer,(-2,.3)),poly('',[(-x,y) for x,y in reversed(q)],layer,(2,.3))]
p6=[(-.95,-.271),(.95,-.271),(.95,2.625),(.45,2.625),(.45,2.95),(.2,2.95),(.2,2.625),(-.05,2.625),(-.05,2.95),(-.3,2.95),(-.3,2.625),(-.55,2.625),(-.55,2.95),(-.8,2.95),(-.8,2.625),(-.95,2.625)]
out.append(poly('',p6,mask,(0,1.35)))
out.append(rect('',0,.502,1.71,1.15,paste))
bottom=[(-.855,1.277),(.855,1.277),(.855,2.427),(.45,2.427),(.45,2.95),(.2,2.95),(.2,2.427),(-.05,2.427),(-.05,2.95),(-.3,2.95),(-.3,2.427),(-.55,2.427),(-.55,2.95),(-.8,2.95),(-.8,2.427),(-.855,2.427)]
out.append(poly('',bottom,paste,(0,1.852)))
out.append(rect('',0,-1.235,1.71,1.21,paste))
for y in [-1.618,-.968]:out.append(rect('',-1.2,y,.3,.45,paste))
# Existing supplier mesh has an offset origin. Match the newly centered body.
out.append(f'(model "${{KIPRJMOD}}/3dmodels/{name}.wrl" (offset (xyz 0 0.625 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))')
(L/(name+'.kicad_mod')).write_text('\n'.join(out)+'\n)\n',encoding='utf8')

parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']
byname={x['footprint'].split(':')[-1]:x for x in parts if x['lcsc']}
report=[]
for fn,part in sorted(byname.items()):
    if fn==name:continue
    f=p.FootprintLoad(str(L),fn)
    if fn.startswith('CONN-'):continue # Manufacturer body includes edge overhang.
    if fn=='SOT-23-5_L2.9-W1.6-P0.95-LS2.8-BR':
        # TPS7A24 DBV0005A 4214839/K: 2.6 mm opposing center spacing,
        # 1.10 x 0.60 mm lands, 0.95 mm pitch, R0.05 corners.
        for q in f.Pads():
            x,y={1:(1.3,.95),2:(1.3,0),3:(1.3,-.95),4:(-1.3,-.95),5:(-1.3,.95)}[int(q.GetNumber())]
            q.SetPosition(p.VECTOR2I(p.FromMM(x),p.FromMM(y)))
            q.SetOrientationDegrees(0);q.SetSize(p.VECTOR2I(p.FromMM(1.1),p.FromMM(.6)))
            q.SetShape(p.PAD_SHAPE_ROUNDRECT);q.SetRoundRectRadiusRatio(.05/.6)
    # Preserve existing body extents and cover the complete copper pad envelope.
    boxes=[q.GetBoundingBox() for q in f.Pads() if q.IsOnLayer(p.F_Cu)]
    body=[g.GetBoundingBox() for g in f.GraphicalItems() if g.GetLayer()==p.F_CrtYd]
    boxes+=body
    x0=min(z.GetX() for z in boxes)/1e6; y0=min(z.GetY() for z in boxes)/1e6
    x1=max(z.GetRight() for z in boxes)/1e6; y1=max(z.GetBottom() for z in boxes)/1e6
    # Build from pad and F.Fab body outline, not previous courtyard each rerun.
    bodylines=[g.GetBoundingBox() for g in f.GraphicalItems() if g.GetLayer()==p.F_Fab and isinstance(g,p.PCB_SHAPE) and g.GetShape()==p.SHAPE_T_SEGMENT]
    boxes=[q.GetBoundingBox() for q in f.Pads() if q.IsOnLayer(p.F_Cu)]+bodylines
    x0=math.floor((min(z.GetX() for z in boxes)/1e6-.25)/.05)*.05
    y0=math.floor((min(z.GetY() for z in boxes)/1e6-.25)/.05)*.05
    x1=math.ceil((max(z.GetRight() for z in boxes)/1e6+.25)/.05)*.05
    y1=math.ceil((max(z.GetBottom() for z in boxes)/1e6+.25)/.05)*.05
    for g in list(f.GraphicalItems()):
        if g.GetLayer()==p.F_CrtYd:f.Remove(g)
        # Recreate our marker deterministically on repeat runs.
        elif g.GetLayer()==p.F_SilkS and fn[0] not in 'CRL':f.Remove(g)
    q=[(x0,y0),(x1,y0),(x1,y1),(x0,y1),(x0,y0)]
    for a,z in zip(q,q[1:]):
        s=p.PCB_SHAPE(f);s.SetShape(p.SHAPE_T_SEGMENT);s.SetLayer(p.F_CrtYd);s.SetWidth(p.FromMM(.05));s.SetStart(p.VECTOR2I(p.FromMM(a[0]),p.FromMM(a[1])));s.SetEnd(p.VECTOR2I(p.FromMM(z[0]),p.FromMM(z[1])));f.Add(s)
    if part['ref'][0] in 'UDQ':
        pin=next(q for q in f.Pads() if q.GetNumber()=='1');box=pin.GetBoundingBox()
        # Place outward from pin 1 on the body side's free corner. Markers are
        # later checked against the placed board's solder-mask openings.
        x=pin.GetPosition().x/1e6;y=pin.GetPosition().y/1e6
        if abs(x)>abs(y):x=(box.GetX()/1e6-.45) if x<0 else (box.GetRight()/1e6+.45)
        else:y=(box.GetY()/1e6-.45) if y<0 else (box.GetBottom()/1e6+.45)
        if fn=='SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL':x,y=-2.5,3.95
        if fn=='VSONP-8_L3.1-W3.1-P0.65-LS3.5-BL':x,y=-1.8,2.1
        s=p.PCB_SHAPE(f);s.SetShape(p.SHAPE_T_CIRCLE);s.SetLayer(p.F_SilkS);s.SetWidth(p.FromMM(.15));s.SetFillMode(p.FILL_T_FILLED_SHAPE);s.SetCenter(p.VECTOR2I(p.FromMM(x),p.FromMM(y)));s.SetEnd(p.VECTOR2I(p.FromMM(x+.12),p.FromMM(y)));f.Add(s)
    f.SetFPID(p.LIB_ID('',fn))
    p.FootprintSave(str(L.resolve()),f)
    report.append({'footprint':fn,'courtyard_mm':[x0,y0,x1,y1],'allowance_mm':.25})
(R/'evidence/footprint-repairs.json').write_text(json.dumps({'revision':'A12','source':'https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf','U1':'RAR0017B copper, mask and stencil reconstructed from dimensioned TI example; package-center origin','courtyards':report},indent=2)+'\n',encoding='utf8')
print('Repaired U1 and',len(report),'bundled footprint courtyards / polarity markers.')
