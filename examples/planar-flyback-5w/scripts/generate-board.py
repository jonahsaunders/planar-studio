"""Reproducible KiCad board; run with the Python shipped with KiCad 10.

Winding copper is integral to a net-tie footprint, not a purchased transformer.
Net-tie groups represent the intentional DC continuity of each winding.
"""
import json, math, os, shutil
from pathlib import Path
import pcbnew as pcb

ROOT=Path(__file__).resolve().parents[1]
CAD=ROOT/'kicad'; LIB=CAD/'Flyback.pretty'; LIB.mkdir(exist_ok=True)
stock_path=os.environ.get('KICAD10_FOOTPRINT_DIR') or os.environ.get('KICAD_FOOTPRINT_DIR')
STOCK=Path(stock_path) if stock_path else None
data=json.loads((ROOT/'circuit.json').read_text())
mechanical=json.loads((ROOT/'mechanical.json').read_text())
layout=json.loads((ROOT/'layout.json').read_text())
x0,y0,x1,y1=layout['board_bounds_mm']
art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text())
model=json.loads((ROOT/'evidence/winding-model.json').read_text())
NAME=data['project']
stack_spec=json.loads((ROOT/'stackup.json').read_text())
stack_thickness=stack_spec['published_copper_plus_dielectric_mm']
def mm(v):return pcb.FromMM(v)
def pt(x,y):return pcb.VECTOR2I(mm(x),mm(y))
def xy(p):return (pcb.ToMM(p.x),pcb.ToMM(p.y))
def num(v):return f'{v:.6f}'
def line(a,b,width=.15,layer='F.SilkS'):
    return f'(fp_line (start {num(a[0])} {num(a[1])}) (end {num(b[0])} {num(b[1])}) (stroke (width {width}) (type default)) (layer "{layer}"))'
def rect(x0,y0,x1,y1,layer='F.CrtYd',width=.05):
    return ''.join(line(a,b,width,layer) for a,b in zip([(x0,y0),(x1,y0),(x1,y1),(x0,y1)],[(x1,y0),(x1,y1),(x0,y1),(x0,y0)]))
def pad(n,x,y,w,h,drill=0,shape='rect',layers=None,paste=True):
    if layers is None:layers='"*.Cu" "*.Mask"' if drill else '"F.Cu" "F.Mask"'+(' "F.Paste"' if paste else '')
    return f'(pad "{n}" {"thru_hole" if drill else "smd"} {shape} (at {num(x)} {num(y)}) (size {w} {h})'+(f' (drill {drill})' if drill else '')+f' (layers {layers}))'
def footprint(name,body,attr='smd',refy=-4):
    return f'''(footprint "{name}" (version 20241229) (generator "pcbnew") (layer "F.Cu") (attr {attr})
    (property "Reference" "REF**" (at 0 {refy} 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness .15))))
    (property "Value" "{name}" (at 0 4 0) (layer "F.Fab") (effects (font (size 1 1) (thickness .15))))
    {body})'''

# Portable copies of the exact KiCad library footprints used by the schematic.
for p in data['parts']:
    library,name=p.get('source_footprint',p['footprint']).split(':')
    destination=LIB/(name+'.kicad_mod')
    if library not in ['Flyback','amemb-MountingHole'] and not destination.exists():
        if STOCK is None:
            raise FileNotFoundError(f'{destination} missing; restore the bundled footprint or set KICAD10_FOOTPRINT_DIR')
        shutil.copy2(STOCK/(library+'.pretty')/(name+'.kicad_mod'),destination)

# Bourns SF-1206F Rev J p2: 4.7 outside span, 2.2 gap, 1.65 width.
# Nominal 3.10 x 1.55 body; keep 0.25 mm courtyard clearance to lands.
body=rect(-1.55,-.775,1.55,.775,'F.Fab',.1)+rect(-2.60,-1.10,2.60,1.10)
body+=line((-.85,-.94),(.85,-.94),.12)+line((-.85,.94),(.85,.94),.12)
body+=pad(1,-1.725,0,1.25,1.65)+pad(2,1.725,0,1.25,1.65)
(LIB/'Fuse_Bourns_SF1206F.kicad_mod').write_text(footprint('Fuse_Bourns_SF1206F',body,refy=-1.8),encoding='utf8')

# Bourns CRM2512 >=1 ohm recommended land pattern, CRM Rev 08/21 p2.
body=rect(-3.15,-1.55,3.15,1.55,'F.Fab',.1)+rect(-4.05,-2.1,4.05,2.1)
body+=line((-1.1,-1.75),(1.1,-1.75),.12)+line((-1.1,1.75),(1.1,1.75),.12)
body+=pad(1,-2.575,0,2.45,3.7)+pad(2,2.575,0,2.45,3.7)
(LIB/'R_Bourns_CRM2512.kicad_mod').write_text(footprint('R_Bourns_CRM2512',body,refy=-2.6),encoding='utf8')

# S8E land pattern, ADI drawing 05-08-1857 Rev C, LT8302 Rev G page 24.
body=rect(-1.95,-2.50,1.95,2.50,'F.Fab',.1)+rect(-3.5,-2.8,3.5,2.8)
body+=line((-1.8,-2.65),(1.8,-2.65))+line((-1.8,2.65),(1.8,2.65))
body+=line((-3.3,-2.45),(-2.8,-2.45),.22)
for i in range(4):
    body+=pad(i+1,-2.6015,-1.905+i*1.27,1.143,.76)
    body+=pad(8-i,2.6015,-1.905+i*1.27,1.143,.76)
body+=pad(9,0,0,2.26,2.99,paste=False)
# Four paste apertures, 52% coverage. All vias require filled/capped processing.
for x in [-.55,.55]:
    for y in [-.75,.75]:body+=pad('',x,y,.8,1.1,layers='"F.Paste"')
(LIB/'SOIC8_EP_LT_S8E.kicad_mod').write_text(footprint('SOIC8_EP_LT_S8E',body),encoding='utf8')

# KF301-5.0-2P uses a 5.00 mm pitch, not the similarly named 5.08 mm part.
body=rect(-2.5,-3.6,7.5,4,'F.Fab',.1)+rect(-3.42,-3.85,8.42,4.25)
body+=rect(-2.6,-3.7,7.6,4.1,'F.SilkS',.15)
body+=line((-.8,-3.2),(.8,-3.2),.25)+line((4.2,-3.2),(5.8,-3.2),.25)
body+=pad(1,0,0,2.4,2.4,1.3,'rect')+pad(2,5,0,2.4,2.4,1.3,'circle')
(LIB/'Terminal_KF301_2P_5.00.kicad_mod').write_text(footprint('Terminal_KF301_2P_5.00',body,'through_hole',-5),encoding='utf8')

# Panasonic C6 recommended lands: gap 2.1, outside span 9.1, width 1.6 mm.
body=rect(-3.3,-3.3,3.3,3.3,'F.Fab',.1)+rect(-4.8,-3.6,4.8,3.6)
body+=line((-3.3,-3.4),(3.3,-3.4))+line((-3.3,3.4),(3.3,3.4))
body+=line((-4,-2),(-3,-2),.2)+line((-3.5,-2.5),(-3.5,-1.5),.2)
body+=pad(1,-2.8,0,3.5,1.6)+pad(2,2.8,0,3.5,1.6)
(LIB/'CP_Panasonic_C6.kicad_mod').write_text(footprint('CP_Panasonic_C6',body),encoding='utf8')

body='(net_tie_pad_groups "1,2,5" "3,4")'
bylayer={}
layerids={'F.Cu':pcb.F_Cu,'In1.Cu':pcb.In1_Cu,'In4.Cu':pcb.In4_Cu,'B.Cu':pcb.B_Cu}
for t in art['tracks']:
    for a,b in zip(t['pts'],t['pts'][1:]):
        shape=pcb.PCB_SHAPE();shape.SetShape(pcb.SHAPE_T_SEGMENT);shape.SetStart(pt(a[0],-a[1]));shape.SetEnd(pt(b[0],-b[1]));shape.SetWidth(mm(t['width']));shape.SetLayer(layerids[t['layer']])
        poly=pcb.SHAPE_POLY_SET();shape.TransformShapeToPolygon(poly,shape.GetLayer(),0,mm(.001),pcb.ERROR_INSIDE)
        bylayer.setdefault(t['layer'],pcb.SHAPE_POLY_SET()).BooleanAdd(poly)
for layer,poly in bylayer.items():
    poly.Simplify()
    for k in range(poly.OutlineCount()):
        assert poly.HoleCount(k)==0,'Unexpected winding loop closure'
        chain=poly.COutline(k)
        pts=' '.join(f'(xy {num(pcb.ToMM(chain.CPoint(i).x))} {num(pcb.ToMM(chain.CPoint(i).y))})' for i in range(chain.PointCount()))
        body+=f'(fp_poly (pts {pts}) (stroke (width 0) (type default)) (fill solid) (layer "{layer}"))'
for i,p in enumerate(art['pads'],1):body+=pad(i,p['x'],-p['y'],p['w'],p['h'],p['drill'],'circle')
for v in art['vias']:body+=pad(5,v['x'],-v['y'],v['diameter'],v['diameter'],v['drill'],'circle',layers='"*.Cu"')
body+=rect(-13.6,-14.5,13.6,15.2)+rect(-10.9,-7.9,10.9,7.9,'F.Fab',.1)
for x,y,txt in [(3,-14.3,'1 VIN'),(-3,-14.3,'2 SW'),(-3,14.9,'3 GND'),(3,10.3,'4 SEC')]:
    body+=f'(fp_text user "{txt}" (at {x} {y}) (layer "F.SilkS") (effects (font (size .8 .8) (thickness .12))))'
(LIB/'Planar_EELP22_4T_2T.kicad_mod').write_text(footprint('Planar_EELP22_4T_2T',body,'exclude_from_pos_files',0),encoding='utf8')
# A single polygon per winding layer gives KiCad a continuous net-tie
# conductor. Overlapping independent strokes are ambiguous to connectivity.

board=pcb.BOARD(); board.SetCopperLayerCount(6)
title=pcb.TITLE_BLOCK();title.SetTitle('18-36 V to isolated 5 V / 1 A planar flyback');title.SetRevision('A3-development');title.SetDate('2026-10-08');title.SetCompany('Planar Studio example');board.SetTitleBlock(title)
board.GetDesignSettings().SetBoardThickness(mm(stack_thickness))
nets={}
for name in sorted({n for p in data['parts'] for n in p['nets'].values()}):
    n=pcb.NETINFO_ITEM(board,name if name.startswith('unconnected-') else '/'+name); board.Add(n); nets[name]=n
placement={
    'T1':(100,85,0),'U1':(91.5,59,0),
    'J1':(97.5,40,0),'F1':(90.5,40,180),'D1':(88,46,90),
    'C1':(85.5,60.635,180),'C2':(104,59,90),
    'C5':(86.5,58.2,180),'R1':(90.5,51,0),'R2':(93.5,51,0),
    'R3':(96.65,59.635,180),'R4':(96.65,57.8,0),'R5':(94.1015,54.5,90),
    'R6':(104,63.4,180),'C6':(100,63.4,180),
    'D3':(100,59.7,270),'D4':(109,60.9,270),
    'D2':(101,110,90),'C3':(101,118.5,180),'C4':(106.5,111.12,0),
    'C7':(110.5,49,0),'R8':(98,47,0),'C8':(91,118.5,180),
    'R7':(109,118.5,270),'J2':(102.5,129,180),
}
fps={};pads={}
placement.update({h['ref']:(h['x_mm'],h['y_mm'],h.get('rotation_deg',0)) for h in mechanical['holes']})
for p in data['parts']:
    library,name=p['footprint'].split(':')
    f=pcb.FootprintLoad(str(CAD/(library+'.pretty')),name); assert f,name
    f.SetReference(p['ref']);f.SetValue(p['value']);f.SetFPID(pcb.LIB_ID(library,name))
    for key,value in {'MPN':p['mpn'],'Manufacturer':p['mfr'],'LCSC':p['lcsc'],'Datasheet':p['source']}.items():
        f.SetField(key,value);f.GetField(key).SetVisible(False)
    f.SetPath(pcb.KIID_PATH('/'+data['root_uuid']+'/'+p['uuid']))
    for pd in f.Pads():
        key=pd.GetNumber()
        if key:pd.SetNet(nets[p['nets'][key]])
        if p['ref'] in ['J1','J2'] and key=='2':
            pd.SetLocalZoneConnection(pcb.ZONE_CONNECTION_THERMAL)
            pd.SetThermalGap(mm(.3));pd.SetLocalThermalSpokeWidthOverride(mm(.5))
    board.Add(f);x,y,angle=placement[p['ref']];f.SetPosition(pt(x,y));f.SetOrientationDegrees(angle)
    f.Value().SetVisible(False)
    f.Reference().SetTextSize(pt(.9,.9));f.Reference().SetTextThickness(mm(.14));f.Reference().SetTextAngle(pcb.EDA_ANGLE(0,pcb.DEGREES_T))
    if p['ref']=='T1':f.Reference().SetVisible(False)
    refs={'J1':(108.5,38.5),'F1':(90.5,37.8),'D1':(84.5,46),'U1':(91.5,54.8),
          'C1':(84.2,62.8),'C2':(104,55.8),'C5':(84.6,57.3),
          'R1':(90.5,49.5),'R2':(93.5,49.5),'R3':(96.65,61.1),
          'R4':(98.3,56.7),'R5':(96.2,54.5),'D3':(100,55.7),
          'D4':(112.3,60.9),'R6':(107,65.3),'C6':(100,65.2),
          'D2':(97.8,110),'C3':(97,122.6),'C4':(106.5,109),
          'C7':(111,54.5),'R8':(99,49.8),'C8':(90,122.8),
          'R7':(111.7,118.5),'J2':(94,129)}
    if p['ref'].startswith('H'):f.Reference().SetPosition(pt(x,y+(4.4 if y<85 else -4.4)))
    if p['ref'] in refs:f.Reference().SetPosition(pt(*refs[p['ref']]))
    fps[p['ref']]=f
    for pd in f.Pads():pads.setdefault((p['ref'],pd.GetNumber()),[]).append(pd)

def pos(ref,pin,index=0):return xy(pads[(ref,str(pin))][index].GetPosition())
def path(net,points,layer=pcb.F_Cu,width=.5):
    for a,b in zip(points,points[1:]):
        if math.dist(a,b)<1e-6:continue
        t=pcb.PCB_TRACK(board);t.SetStart(pt(*a));t.SetEnd(pt(*b));t.SetWidth(mm(width));t.SetLayer(layer);t.SetNet(nets[net]);board.Add(t)
def via(net,p,diameter=.8,drill=.4):
    v=pcb.PCB_VIA(board);v.SetPosition(pt(*p));v.SetWidth(mm(diameter));v.SetDrill(mm(drill));v.SetViaType(pcb.VIATYPE_THROUGH);v.SetLayerPair(pcb.F_Cu,pcb.B_Cu);v.SetNet(nets[net]);board.Add(v)
    return v
def edge(a,b):
    s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_SEGMENT);s.SetStart(pt(*a));s.SetEnd(pt(*b));s.SetWidth(mm(.05));s.SetLayer(pcb.Edge_Cuts);board.Add(s)
def rounded_rect(x0,y0,x1,y1,r):
    # Arcs with 0.5 mm tool radius preserve >=0.1 mm core corner clearance.
    for a,b in [((x0+r,y0),(x1-r,y0)),((x1,y0+r),(x1,y1-r)),((x1-r,y1),(x0+r,y1)),((x0,y1-r),(x0,y0+r))]:edge(a,b)
    for cx,cy,start in [(x0+r,y0+r,180),(x1-r,y0+r,270),(x1-r,y1-r,0),(x0+r,y1-r,90)]:
        points=[]
        for ang in [start,start+45,start+90]:points.append(pt(cx+r*math.cos(math.radians(ang)),cy+r*math.sin(math.radians(ang))))
        s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_ARC);s.SetArcGeometry(*points);s.SetWidth(mm(.05));s.SetLayer(pcb.Edge_Cuts);board.Add(s)
rounded_rect(x0,y0,x1,y1,2)
for loop in model['assembly']['openings']:
    xs=[100+x for x,y in loop];ys=[85-y for x,y in loop]
    rounded_rect(min(xs),min(ys),max(xs),max(ys),.5)

def txt(s,x,y,size=1,layer=pcb.F_SilkS):
    t=pcb.PCB_TEXT(board);t.SetText(s);t.SetPosition(pt(x,y));t.SetTextSize(pt(size,size));t.SetTextThickness(mm(.15));t.SetLayer(layer);board.Add(t)
    if layer==pcb.B_SilkS:t.SetMirrored(True)
txt('IN +    -',100,35,.85)
txt('18-36V DC',110,42,.8)
txt('5V 1A',113,127,.8);txt('OUT -    +',100,135,.85)
txt('PCB PLANAR 4:2',100,74,1.1);txt('2 x 0.05 mm GAPPED ELP22',100,75.5,.8)
txt('FUNCTIONAL ISOLATION',100,101.5,.8,pcb.B_SilkS)
txt('A3 ENGINEERING PROTOTYPE',100,134,1,pcb.B_SilkS)

# Placement follows the two pulsed-current loops. SW, clamp and damping stay
# on F.Cu beside the primary terminals; In3.Cu carries only the quiet VIN feed.
path('VIN_RAW',[pos('J1',1),pos('F1',1)],width=1.2)
path('VIN_FUSED',[pos('F1',2),(88,40.775),pos('D1',2)],width=1.2)
# R8/C7 are a shunt damping branch; there is no DC feed resistor.
path('VIN',[pos('D1',1),(88,48.5),(93.925,48.5),pos('R8',1)],width=1)
path('VIN_DAMP',[pos('R8',2),(104.8,47),pos('C7',1)],width=1)
via('VIN',pos('D1',1),.8,.4)
via('VIN',pos('C1',1),.8,.4)
via('VIN',pos('C2',1),.8,.4)
path('VIN',[pos('D1',1),(89.8,pos('D1',1)[1]+1.8),(89.8,52.7),(88.8,53.7),(88.8,58.81),pos('C1',1)],pcb.In3_Cu,1.3)
path('VIN',[pos('C1',1),(86.975,62),(89.275,64.3),(100.175,64.3),pos('C2',1)],pcb.In3_Cu,1.5)
path('VIN',[pos('C1',1),(86.975,59.635),pos('U1',3)],width=.9)
path('VIN',[pos('C2',1),(104,61.9375),pos('R6',1),(105.4625,63.966284),pos('T1',1)],width=1.2)
path('VIN',[pos('D4',2),(108.5,63.4),pos('R6',1)],width=1)
path('SNUB',[pos('R6',2),pos('C6',1)],width=.6)
path('SW',[pos('U1',5),(94.1015,63.530284),pos('T1',2)],width=1.2)
path('SW',[pos('T1',2),(96.378023,65.15),(98.128023,63.4),pos('C6',2)],width=.8)
path('SW',[pos('D3',2),(99.05,62.175),pos('C6',2)],width=.8)
path('CLAMP',[pos('D3',1),(100.15,59),(108.9,59),pos('D4',1)],width=.6)
path('SW',[pos('R3',1),(97.475,62.875),(98,63.4),(98.128023,63.4)],width=.35)
path('RFB',[pos('R3',2),pos('U1',6)],width=.25)
path('RREF',[pos('U1',7),(95.26,58.365),pos('R4',1)],width=.25)
path('RREF',[pos('R5',2),(96.65,53.675),(96.65,56.975),pos('R4',1)],width=.25)
path('TC',[pos('U1',8),pos('R5',1)],width=.25)
path('UVLO',[pos('R1',2),pos('R2',1)],width=.25)
path('UVLO',[pos('R1',2),(89.5,52.825),(89.5,56.4935),pos('U1',1)],width=.25)
via('VIN',pos('R1',1),.6,.3)
path('VIN',[pos('R1',1),(89.8,51)],pcb.In3_Cu,.3)
path('INTVCC',[pos('C5',1),(87.44,58.365),pos('U1',2)],width=.4)

# Secondary rectifier faces the winding; capacitors and connector follow below.
sec=pos('T1',4)
path('SEC_A',[sec,(101.075,103.0),(101,103.075),(101,107.138)],pcb.In2_Cu,1.3)
for x in [100.55,101.45]:via('SEC_A',(x,107.138),.9,.45)
path('SEC_A',[pos('D2',2,0),(100.55,107.138),(101,107.138),(101.45,107.138),pos('D2',2,1)],width=1.1)
path('+5V_ISO',[pos('D2',1),pos('C4',1)],width=1.5)
path('+5V_ISO',[pos('D2',1),(97.025,111.12),(93.8,114.345),pos('C8',1)],width=1.5)
path('+5V_ISO',[pos('C4',1),(105.025,117.275),pos('C3',1)],width=1.5)
path('+5V_ISO',[pos('C3',1),(107.5375,118.5),pos('R7',1)],width=1)
path('+5V_ISO',[pos('C3',1),(103.8,127.7),pos('J2',1)],width=2)
path('GND_ISO',[pos('T1',3),(98.169595,106.5)],width=1.5)
for x in [97.269595,98.169595]:via('GND_ISO',(x,106.5),.9,.45)
path('GND_ISO',[(97.269595,106.5),(98.169595,106.5)],width=1.3)

# Ground pads join planes on their own side of the transformer. Thermal vias
# in the exposed pad require filled/capped via-in-pad manufacture.
def ground_plane(net,x0,y0,x1,y1,layer):
    z=pcb.ZONE(board);z.SetLayer(layer);z.SetNet(nets[net]);z.SetLocalClearance(mm(.25));z.SetPadConnection(pcb.ZONE_CONNECTION_FULL);z.SetMinThickness(mm(.2))
    outline=z.Outline();outline.NewOutline()
    for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]:outline.Append(mm(x),mm(y))
    board.Add(z)
ground_plane('PGND',83.5,38,116,64.5,pcb.B_Cu)
ground_plane('PGND',83.5,38,116,64.5,pcb.F_Cu)
ground_plane('GND_ISO',86,106,114,132,pcb.B_Cu)
ground_plane('GND_ISO',86,106,114,132,pcb.F_Cu)
for ref in ['J1','C1','C2','C5','C7','R2','R4','U1']:
    for (r,pn),ps in pads.items():
        if r!=ref:continue
        for pd in ps:
            if pd.GetNetname()!='/PGND':continue
            x,y=xy(pd.GetPosition())
            if ref=='J1':continue
            if ref=='U1' and pn=='9':
                for dx in [-.8,.8]:
                    for dy in [-.55,.55]:via('PGND',(x+dx,y+dy),.6,.3)
            else:
                v=(x,y)
                path('PGND',[(x,y),v],width=.6);via('PGND',v,.6,.3)
for v in [(85,52),(100,50),(113,54),(112,63),(84.5,64)]:via('PGND',v,.6,.3)
# Additional local stitching: never cross the isolation corridor or winding area.
for v in [(85.5,40),(84.5,43),(84.5,55),(86.5,53.5),(85.5,63.4),(91,62.5),
          (99,52.5),(103,54),(114.5,42),(115,54),(114,58),(114,63)]:via('PGND',v,.6,.3)
for v in [(87,108),(90,108),(94,108),(111,108),(112.5,115),(87,115),
          (87,123),(95.5,122.8),(107,123),(112,128),(91,130),(107,130),(100,131.5),(99,115)]:via('GND_ISO',v,.6,.3)
for v in [(92,112),(111,112),(92,123),(111,123),(100,126)]:via('GND_ISO',v,.6,.3)
for ref in ['C3','C4','C8','R7','J2']:
    for (r,pn),ps in pads.items():
        if r!=ref:continue
        for pd in ps:
            if pd.GetNetname()!='/GND_ISO' or ref=='J2':continue
            x,y=xy(pd.GetPosition());v=(x,y)
            path('GND_ISO',[(x,y),v],width=1);via('GND_ISO',v,.9,.45)

# Filled/capped bare lands provide spring-probe contacts without adding parts
# to the electrical BOM. T1's exposed primary terminals already serve VIN/SW.
probe_sites=[]
for name,net,point in [('PGND','PGND',(92.4,62.65)),('ISO_GND','GND_ISO',(108.2,114))]:
    v=via(net,point,1.2,.3)
    v.SetFrontTentingMode(pcb.TENTING_MODE_NOT_TENTED)
    v.SetBackTentingMode(pcb.TENTING_MODE_TENTED)
    probe_sites.append({'name':name,'net':net,'position_mm':point,'land_diameter_mm':1.2,
                        'type':'Top-exposed filled/capped via land; no installed part'})
txt('PGND',90,63.2,.8);txt('ISO GND',111.5,115.3,.8)
for name,pin in [('VIN',1),('SW',2)]:
    probe_sites.append({'name':name,'net':name,'position_mm':pos('T1',pin),
                        'type':f'Existing exposed T1 pad {pin}; no added SW stub'})
for name,net,ref,pin in [('BIAS','INTVCC','C5',1),('OUT','+5V_ISO','C4',1)]:
    probe_sites.append({'name':name,'net':net,'position_mm':pos(ref,pin),
                        'type':f'Existing exposed {ref} pad {pin}; soldered component present'})
# A3 compacts the validated A2 blocks without changing any local routing.
def compact_point(p):
    x,y=p
    if y < layout['source_primary_max_y_mm']: return (x,y+layout['primary_translation_mm'][1])
    if y > layout['source_secondary_min_y_mm']: return (x,y+layout['secondary_translation_mm'][1])
    return (x,y)
def compact_vector(p):
    dy=layout['primary_translation_mm'][1] if p.y<mm(layout['source_primary_max_y_mm']) else layout['secondary_translation_mm'][1] if p.y>mm(layout['source_secondary_min_y_mm']) else 0
    return pcb.VECTOR2I(p.x,p.y+mm(dy))
for ref,f in fps.items():
    if ref=='T1' or ref.startswith('H'): continue
    old=f.GetPosition();new=compact_vector(old);f.Move(pcb.VECTOR2I(new.x-old.x,new.y-old.y))
for t in board.GetTracks():
    if isinstance(t,pcb.PCB_VIA): t.SetPosition(compact_vector(t.GetPosition()))
    else:
        t.SetStart(compact_vector(t.GetStart()));t.SetEnd(compact_vector(t.GetEnd()))
for z in board.Zones():
    z.Move(pt(0,layout['primary_translation_mm'][1] if z.GetNetname()=='/PGND' else layout['secondary_translation_mm'][1]))
for d in board.GetDrawings():
    if isinstance(d,pcb.PCB_TEXT):d.SetPosition(compact_vector(d.GetPosition()))
for site in probe_sites:site['position_mm']=compact_point(site['position_mm'])

(ROOT/'evidence/audit/probe-sites.json').write_text(json.dumps(probe_sites,indent=2)+'\n',encoding='utf8')

board.GetDesignSettings().SetAuxOrigin(pt(x0,y1))
pcb.ZONE_FILLER(board).Fill(board.Zones())
out=CAD/(NAME+'.kicad_pcb');pcb.SaveBoard(str(out),board)
# Proposed build. Fabricator acceptance is required before release.
stack='(stackup (layer "F.Mask" (type "Top Solder Mask"))'
names=['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','B.Cu']
gaps=stack_spec['dielectric_mm']
for i,name in enumerate(names):
    stack+=f'(layer "{name}" (type "copper") (thickness {stack_spec["copper_mm"][i]}))'
    if i<5:stack+=f'(layer "dielectric {i+1}" (type "{ "prepreg" if i%2==0 else "core" }") (thickness {gaps[i]}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))'
stack+='(layer "B.Mask" (type "Bottom Solder Mask")) (copper_finish "ENIG") (dielectric_constraints no))'
contents=out.read_text().replace('(setup','(setup\n'+stack,1).replace('(capping no)','(capping yes)',1).replace('(filling no)','(filling yes)',1)
out.write_text(contents)
# SaveBoard serializes a fresh BOARD's default project rules. Restore explicit
# fabrication limits after that save so subsequent DRC uses the intended rules.
project_file=CAD/(NAME+'.kicad_pro')
project=json.loads(project_file.read_text())
project.setdefault('erc',{}).setdefault('rule_severities',{})['four_way_junction']='error'
project['board']['design_settings']['rules'].update({
    'min_clearance':.2,'min_track_width':.2,'min_via_diameter':.6,
    'min_through_hole_diameter':.3,'min_copper_edge_clearance':.5,
    'min_hole_clearance':.25,'min_hole_to_hole':.25})
project_file.write_text(json.dumps(project,indent=2))
(ROOT/'evidence/pad-positions.json').write_text(json.dumps({f'{r}.{n}':[xy(p.GetPosition()) for p in ps] for (r,n),ps in pads.items()},indent=2))
print(f'{out}: {len(fps)} footprints, {len(list(board.GetTracks()))} routes/vias')
from models_3d import attach_models
attach_models(out)
