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
art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text())
model=json.loads((ROOT/'evidence/winding-model.json').read_text())
NAME=data['project']
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
body+=rect(-18.2,-21.4,18.2,21.4)+rect(-15.875,-10.175,15.875,10.175,'F.Fab',.1)
for x,y,txt in [(4,-21,'1 VIN'),(-5,-21,'2 SW'),(-3,21,'3 GND'),(4,12.8,'4 SEC')]:
    body+=f'(fp_text user "{txt}" (at {x} {y}) (layer "F.SilkS") (effects (font (size .8 .8) (thickness .12))))'
(LIB/'Planar_EELP32_4T_2T.kicad_mod').write_text(footprint('Planar_EELP32_4T_2T',body,'exclude_from_pos_files',0),encoding='utf8')
# A single polygon per winding layer gives KiCad a continuous net-tie
# conductor. Overlapping independent strokes are ambiguous to connectivity.

board=pcb.BOARD(); board.SetCopperLayerCount(6)
title=pcb.TITLE_BLOCK();title.SetTitle('18-36 V to isolated 5 V / 1 A planar flyback');title.SetRevision('A1-development');title.SetDate('2026-09-29');title.SetCompany('Planar Studio example');board.SetTitleBlock(title)
board.GetDesignSettings().SetBoardThickness(mm(1.6))
nets={}
for name in sorted({n for p in data['parts'] for n in p['nets'].values()}):
    n=pcb.NETINFO_ITEM(board,name if name.startswith('unconnected-') else '/'+name); board.Add(n); nets[name]=n
placement={
    'T1':(100,85,0),'U1':(100,56,270),
    'J1':(83.5,40,0),'F1':(95,40,0),'D1':(102,41.5,180),
    'C1':(96,48,270),'C2':(104,47,270),
    'C5':(100.635,50.5,90),'R1':(108,50,270),'R2':(105.7,54.5,0),
    'R3':(99.365,61.5,90),'R4':(102.5,62,270),'R5':(105,59,0),
    'R6':(109.5,58,270),'C6':(109.5,62.1,0),
    'D3':(93.3,60.9,270),'D4':(89,55.5,90),
    'D2':(101,110,0),'C3':(94,117,0),'C4':(102,116,270),
    'R7':(109,116,270),'J2':(103,129,180),
}
fps={};pads={}
placement.update({h['ref']:(h['x_mm'],h['y_mm'],0) for h in mechanical['holes']})
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
    board.Add(f);x,y,angle=placement[p['ref']];f.SetPosition(pt(x,y));f.SetOrientationDegrees(angle)
    f.Value().SetVisible(False)
    f.Reference().SetTextSize(pt(.9,.9));f.Reference().SetTextThickness(mm(.14));f.Reference().SetTextAngle(pcb.EDA_ANGLE(0,pcb.DEGREES_T))
    if p['ref']=='T1':f.Reference().SetVisible(False)
    refs={'J1':(78,39),'D1':(102,39),'D4':(85.8,55.5),'C6':(113,62.1),'R6':(107,58),'R2':(107.7,54.5)}
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
def edge(a,b):
    s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_SEGMENT);s.SetStart(pt(*a));s.SetEnd(pt(*b));s.SetWidth(mm(.05));s.SetLayer(pcb.Edge_Cuts);board.Add(s)
def rounded_rect(x0,y0,x1,y1,r):
    # Arcs with 0.5 mm tool radius preserve >=0.1 mm core corner clearance.
    for a,b in [((x0+r,y0),(x1-r,y0)),((x1,y0+r),(x1,y1-r)),((x1-r,y1),(x0+r,y1)),((x0,y1-r),(x0,y0+r))]:edge(a,b)
    for cx,cy,start in [(x0+r,y0+r,180),(x1-r,y0+r,270),(x1-r,y1-r,0),(x0+r,y1-r,90)]:
        points=[]
        for ang in [start,start+45,start+90]:points.append(pt(cx+r*math.cos(math.radians(ang)),cy+r*math.sin(math.radians(ang))))
        s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_ARC);s.SetArcGeometry(*points);s.SetWidth(mm(.05));s.SetLayer(pcb.Edge_Cuts);board.Add(s)
rounded_rect(75,33,125,137,2)
for loop in model['assembly']['openings']:
    xs=[100+x for x,y in loop];ys=[85-y for x,y in loop]
    rounded_rect(min(xs),min(ys),max(xs),max(ys),.5)

def txt(s,x,y,size=1,layer=pcb.F_SilkS):
    t=pcb.PCB_TEXT(board);t.SetText(s);t.SetPosition(pt(x,y));t.SetTextSize(pt(size,size));t.SetTextThickness(mm(.15));t.SetLayer(layer);board.Add(t)
    if layer==pcb.B_SilkS:t.SetMirrored(True)
txt('PS-FLYBACK-5W  A1',103,35.5,1.2)
txt('18-36V DC',86,46.5);txt('INPUT +   -',86.5,34.8,.85)
txt('5V 1A',100.5,122);txt('OUT -    +',100.5,135,.85)
txt('PCB PLANAR 4:2',100,72,1.1);txt('0.21 mm GAPPED N87 CORE',100,73.5,.8)
txt('FUNCTIONAL ISOLATION',100,101.5,.8)
txt('A1 ENGINEERING PROTOTYPE',100,134,1,pcb.B_SilkS)

# Routes are hand-authored for controlled current loops. Short circuit ground
# connections use a primary local plane; the secondary remains isolated.
path('VIN_RAW',[pos('J1',1),(83.5,37),(92,37),pos('F1',1)],width=1)
path('VIN_FUSED',[pos('F1',2),(98,40),pos('D1',2)],width=1)
path('VIN',[pos('D1',1),(107,41.5),(107,44.95),pos('C2',1)],width=1)
path('VIN',[pos('C2',1),pos('C1',1)],width=1.3)
path('VIN',[pos('C1',1),(93,45.95),(93,52.05),(99.365,52.05),pos('U1',3)],width=.9)
path('VIN',[pos('C2',1),(107,44.95),(113,51),(113,64.1),(105,64.1),pos('T1',1)],width=1)
path('VIN',[pos('R1',1),(108,48.5),(109.5,47.5)],width=.3)
path('VIN',[pos('R6',1),(113,56.5375)],width=.6)
path('SNUB',[pos('R6',2),(108.55,60.4125),pos('C6',1)],width=.5)
path('SW',[pos('U1',5),(96.378023,60.4),pos('T1',2)],width=1)
path('SW',[pos('T1',2),(96.378023,64.3),(110.45,64.3),pos('C6',2)],pcb.In3_Cu,1)
via('SW',pos('C6',2))
path('SW',[pos('T1',2),(94.5,65.8),pos('D3',2)],width=.8)
path('CLAMP',[pos('D3',1),(93.3,58.5),(89,58.5),pos('D4',1)],width=.7)
path('VIN',[pos('D4',2),(89,52.05),(93,52.05)],width=.8)
path('SW',[pos('R3',1),(97,62.4125),(96.378023,62.4125)],width=.35)
path('RFB',[pos('R3',2),pos('U1',6)],width=.25)
path('RREF',[pos('U1',7),(100.635,60.6),(102.5,60.6),pos('R4',1)],width=.25)
path('RREF',[pos('R4',1),(103,60.6),(105.825,60.6),pos('R5',2)],width=.25)
path('TC',[pos('U1',8),(102.7,59),pos('R5',1)],width=.25)
path('UVLO',[pos('R1',2),(108,52),(103.3,52),pos('U1',1)],width=.25)
path('UVLO',[(103.3,52),pos('R2',1)],width=.25)
path('INTVCC',[pos('C5',1),pos('U1',2)],width=.4)

# Inner secondary end escapes on an otherwise unoccupied routing layer.
sec=pos('T1',4)
path('SEC_A',[sec,(103.862,102.3),(103.862,107.3)],pcb.In2_Cu,1.3)
for x in [103.45,104.25]:via('SEC_A',(x,107.3),.9,.45)
path('SEC_A',[(103.45,107.3),(104.25,107.3),(103.862,107.3),pos('D2',2,0),pos('D2',2,1)],width=1.1)
path('+5V_ISO',[pos('D2',1),(97,110),(94,113.85),pos('C3',1)],width=1.5)
path('+5V_ISO',[pos('D2',1),(99.88,113),pos('C4',1)],width=1.3)
path('+5V_ISO',[pos('C4',1),(109,113),pos('R7',1)],width=1)
path('+5V_ISO',[pos('C3',1),(90,117),(90,132.5),(103,132.5),pos('J2',1)],width=1.5)
path('GND_ISO',[pos('T1',3),(96,106.8),(96,108.5)],width=1.3)
for x in [95.6,96.4]:via('GND_ISO',(x,108.5),.9,.45)
path('GND_ISO',[(95.6,108.5),(96.4,108.5)],width=1.3)

# Ground pads join planes on their own side of the transformer. Thermal vias
# in the exposed pad require filled/capped via-in-pad manufacture.
def ground_plane(net,x0,y0,x1,y1,layer):
    z=pcb.ZONE(board);z.SetLayer(layer);z.SetNet(nets[net]);z.SetLocalClearance(mm(.25));z.SetPadConnection(pcb.ZONE_CONNECTION_FULL);z.SetMinThickness(mm(.2))
    outline=z.Outline();outline.NewOutline()
    for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]:outline.Append(mm(x),mm(y))
    board.Add(z)
ground_plane('PGND',79,38,117,63.3,pcb.B_Cu)
ground_plane('GND_ISO',86,108,114,132,pcb.B_Cu)
for ref in ['J1','C1','C2','C5','R2','R4','U1']:
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
                v=(x-1.4,y) if ref in ['C1','C2'] else (x,y)
                path('PGND',[(x,y),v],width=.6);via('PGND',v,.6,.3)
for ref in ['C3','C4','R7','J2']:
    for (r,pn),ps in pads.items():
        if r!=ref:continue
        for pd in ps:
            if pd.GetNetname()!='/GND_ISO' or ref=='J2':continue
            x,y=xy(pd.GetPosition());v=(x+1.2,y+1.2)
            path('GND_ISO',[(x,y),v],width=1);via('GND_ISO',v,.9,.45)

board.GetDesignSettings().SetAuxOrigin(pt(75,137))
pcb.ZONE_FILLER(board).Fill(board.Zones())
out=CAD/(NAME+'.kicad_pcb');pcb.SaveBoard(str(out),board)
# Proposed build. Fabricator acceptance is required before release.
stack='(stackup (layer "F.Mask" (type "Top Solder Mask"))'
names=['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','B.Cu']
gaps=[.100,.400,.390,.400,.100]
for i,name in enumerate(names):
    stack+=f'(layer "{name}" (type "copper") (thickness 0.035))'
    if i<5:stack+=f'(layer "dielectric {i+1}" (type "{ "prepreg" if i%2==0 else "core" }") (thickness {gaps[i]}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))'
stack+='(layer "B.Mask" (type "Bottom Solder Mask")) (copper_finish "ENIG") (dielectric_constraints no))'
contents=out.read_text().replace('(setup','(setup\n'+stack,1).replace('(capping no)','(capping yes)',1).replace('(filling no)','(filling yes)',1)
out.write_text(contents)
# SaveBoard serializes a fresh BOARD's default project rules. Restore explicit
# fabrication limits after that save so subsequent DRC uses the intended rules.
project_file=CAD/(NAME+'.kicad_pro')
project=json.loads(project_file.read_text())
project['board']['design_settings']['rules'].update({
    'min_clearance':.2,'min_track_width':.2,'min_via_diameter':.6,
    'min_through_hole_diameter':.3,'min_copper_edge_clearance':.5,
    'min_hole_clearance':.25,'min_hole_to_hole':.25})
project_file.write_text(json.dumps(project,indent=2))
(ROOT/'evidence/pad-positions.json').write_text(json.dumps({f'{r}.{n}':[xy(p.GetPosition()) for p in ps] for (r,n),ps in pads.items()},indent=2))
print(f'{out}: {len(fps)} footprints, {len(list(board.GetTracks()))} routes/vias')
