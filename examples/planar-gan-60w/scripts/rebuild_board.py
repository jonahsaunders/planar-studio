"""Rebuild A2 from bundled footprints and explicit manual routes.
Requires KiCad 10 pcbnew. Overwrites the native PCB, project rules and layout metadata.
The native schematic and local libraries are the editable sources.
"""
import json, math
from pathlib import Path
import pcbnew as pcb
ROOT=Path(__file__).resolve().parents[1];CAD=ROOT/'kicad';LIB=CAD/'PS.pretty'
data=json.loads((ROOT/'circuit.json').read_text(encoding='utf8'))
art=json.loads((ROOT/'planar-studio/T1-artwork.json').read_text(encoding='utf8'))
def mm(x):return pcb.FromMM(x)
def pt(x,y):return pcb.VECTOR2I(mm(x),mm(y))
def xy(v):return pcb.ToMM(v.x),pcb.ToMM(v.y)
def line(a,b,layer='F.Fab',w=.1):return f'(fp_line (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width {w}) (type default)) (layer "{layer}"))'
def rect(a,b,layer='F.CrtYd',w=.05):
 x,y=a;X,Y=b;return ''.join(line(u,v,layer,w) for u,v in zip([(x,y),(X,y),(X,Y),(x,Y)],[(X,y),(X,Y),(x,Y),(x,y)]))
def pad(n,x,y,w,h,drill=0,layers=None):
 layers=layers or ('"*.Cu" "*.Mask"' if drill else '"F.Cu" "F.Mask" "F.Paste"')
 return f'(pad "{n}" {"thru_hole" if drill else "smd"} {"circle" if drill else "rect"} (at {x} {y}) (size {w} {h})'+(f' (drill {drill})' if drill else '')+f' (layers {layers}))'
def footprint(name,body,attr='smd'):
 return f'(footprint "{name}" (version 20241229) (generator "pcbnew") (layer "F.Cu") (attr {attr}) (property "Reference" "REF**" (at 0 -4 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness .15)))) (property "Value" "{name}" (at 0 4 0) (layer "F.Fab") (effects (font (size 1 1) (thickness .15)))) {body})'
board=pcb.BOARD();board.SetCopperLayerCount(8);board.GetDesignSettings().SetBoardThickness(mm(1.6))
title=pcb.TITLE_BLOCK();title.SetTitle('PS-GAN-60W / planar LLC');title.SetRevision('A2 REVIEW - NOT FOR FABRICATION');title.SetDate('2026-10-10');board.SetTitleBlock(title)
nets={}
for name in sorted({n for p in data['parts'] for n in p['nets'].values() if n}):
 n=pcb.NETINFO_ITEM(board,('' if name in ['VIN','PGND','AGND','VOUT','SGND','BIAS12','V5'] else '/')+name);board.Add(n);nets[name]=n
# Placement in millimetres relative to the circuit datum (60,60).
place={'C1': (38, 6.9, 90),
 'C10': (31.2, 36.4, 90),
 'C11': (3.5, 19, 0),
 'C12': (1.3, 11.5, 90),
 'C13': (3.0, 26.5, 90),
 'C14': (7.5, 26.5, 90),
 'C15': (5.5, 4, 0),
 'C16': (7.5, 31.5, 90),
 'C17': (31.8, 26.6, 90),
 'C18': (22.8, 31, 0),
 'C19': (43.3, 26, 0),
 'C2': (45.2, 21.6, 270),
 'C20': (39, 28.5, 0),
 'C21': (33.1, 41.7, 90),
 'C22': (33.1, 47, 90),
 'C23': (46, 37.5, 90),
 'C24': (42, 37.5, 90),
 'C25': (36, 23.8, 90),
 'C26': (35, 26.8, 0),
 'C27': (11, 40.4, 0),
 'C28': (14.5, 32, 90),
 'C29': (10.5, 48, 0),
 'C3': (45.2, 17.3, 180),
 'C4': (46.2, 7.7, 90),
 'C5': (39.1, 2.5, 90),
 'C6': (41.5, 7.7, 0),
 'C7': (38.5, 11.1, 0),
 'C8': (38.5, 13.9, 0),
 'C9': (22.8, 34.2, 90),
 'D1': (32.3, 3.5, 90),
 'D2': (32.8, 32.9, 0),
 'F1': (36, 3.0, 180),
 'J1': (50, 18.5, 90),
 'J2': (-2, 18.5, 270),
 'L1': (39.2, 19, 180),
 'L2': (42, 44.5, 0),
 'Q1': (4.3, 9.8, 0),
 'Q2': (4.3, 22.2, 180),
 'R1': (25.3, 40.4, 0),
 'R10': (7.5, 11.3, 180),
 'R11': (1, 22, 90),
 'R12': (8.0, 9.0, 90),
 'R13': (8.0, 22.2, 90),
 'R14': (46.5, 30, 90),
 'R15': (46.5, 33.8, 90),
 'R16': (42.5, 28.5, 0),
 'R17': (38, 37.5, 90),
 'R18': (40, 37.5, 90),
 'R19': (44, 37.5, 90),
 'R2': (22.8, 38.5, 90),
 'R20': (10.8, 32, 0),
 'R21': (10.8, 33.7, 0),
 'R22': (3, 37, 90),
 'R23': (5, 37, 90),
 'R24': (7.4, 40.4, 0),
 'R25': (6.3, 43, 90),
 'R26': (8.0, 43, 90),
 'R27': (3.6, 43.3, 90),
 'R28': (5, 46.4, 90),
 'R3': (24.4, 44.1, 90),
 'R4': (27.5, 31, 0),
 'R5': (27.5, 32.7, 0),
 'R6': (27.5, 43.5, 0),
 'R7': (27.5, 45.2, 0),
 'R8': (33.8, 29.8, 90),
 'R9': (30, 31.5, 90),
 'T1': (22, 15.5, 270),
 'TP1': (51, 29, 0),
 'TP2': (54, 29, 0),
 'TP3': (-3.5, 29, 0),
 'TP4': (-3.5, 32, 0),
 'TP5': (39, -1, 0),
 'TP6': (42, -1, 0),
 'U1': (44, 12, 0),
 'U2': (27, 37, 270),
 'U3': (3.9, 15.5, 270),
 'U4': (42, 32.5, 90),
 'U5': (39, 23.8, 0),
 'U6': (16.8, 37.0, 270),
 'U7': (10.5, 37.0, 90),
 'U8': (16.8, 44.6, 270),
 'U9': (10.5, 44.6, 90)}
fps={};pads={}
for p in data['parts']:
 name=p['footprint'].split(':')[1];f=pcb.FootprintLoad(str(LIB),name);assert f,name
 f.SetReference(p['ref']);f.SetValue(p['value']);f.SetFPID(pcb.LIB_ID('PS',name));f.SetPath(pcb.KIID_PATH('/'+data['root_uuid']+'/'+p['uuid']))
 for k,v in {'MPN':p['mpn'],'LCSC':p['lcsc'],'Manufacturer':p['mfr'],'Datasheet':p['source'],'Design_note':p['note']}.items():f.SetField(k,v);f.GetField(k).SetVisible(False)
 for pd in f.Pads():
  num=pd.GetNumber()
  if num:
   net=p['nets'][num]
   if net:pd.SetNet(nets[net])
   else:
    net='unconnected-('+p['ref']+'-'+('P_MID' if p['ref']=='T1' else 'PGOOD' if p['ref']=='U4' else 'NC')+'-Pad'+num+')'
    if net not in nets:n=pcb.NETINFO_ITEM(board,net);board.Add(n);nets[net]=n
    pd.SetNet(nets[net])
 board.Add(f);x,y,a=place[p['ref']];f.SetPosition(pt(x+60,y+60));f.SetOrientationDegrees(a);f.Value().SetVisible(False)
 # Silkscreen component references remain available on F.Fab; compact board uses an assembly drawing.
 f.Reference().SetLayer(pcb.F_Fab);f.Reference().SetTextSize(pt(.7,.8));f.Reference().SetTextThickness(mm(.1))
 fps[p['ref']]=f
 for pd in f.Pads():
  if pd.GetNumber():pads.setdefault((p['ref'],pd.GetNumber()),[]).append(pd)
def edge(a,b):
 s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_SEGMENT);s.SetLayer(pcb.Edge_Cuts);s.SetWidth(mm(.05));s.SetStart(pt(a[0]+60,a[1]+60));s.SetEnd(pt(b[0]+60,b[1]+60));board.Add(s)
pts=[(-5.5,-4),(55.5,-4),(57,-2.5),(57,50.5),(55.5,52),(-5.5,52),(-7,50.5),(-7,-2.5),(-5.5,-4)]
for a,b in zip(pts,pts[1:]):edge(a,b)
# Rotate Planar Studio mathematical XY into the placed T1 coordinate system.
for opening in art['outline'][1:]:
 pp=[(22+y,15.5-x) for x,y in opening['pts']]
 # CNC-routable 0.5 mm corner radii, inside the nominal slot envelope.
 x0=min(p[0] for p in pp);x1=max(p[0] for p in pp);y0=min(p[1] for p in pp);y1=max(p[1] for p in pp);r=.5
 for a,b in [((x0+r,y0),(x1-r,y0)),((x1,y0+r),(x1,y1-r)),((x1-r,y1),(x0+r,y1)),((x0,y1-r),(x0,y0+r))]:edge(a,b)
 for cx,cy,a0 in [(x1-r,y0+r,-90),(x1-r,y1-r,0),(x0+r,y1-r,90),(x0+r,y0+r,180)]:
  points=[pt(cx+r*math.cos(math.radians(a0+a))+60,cy+r*math.sin(math.radians(a0+a))+60) for a in [0,45,90]]
  s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_ARC);s.SetLayer(pcb.Edge_Cuts);s.SetWidth(mm(.05));s.SetArcGeometry(points[0],points[1],points[2]);board.Add(s)
def pos(ref,pin):return xy(pads[(ref,str(pin))][0].GetPosition())
def track(net,points,width=.25,layer=pcb.F_Cu):
 for a,b in zip(points,points[1:]):
  if math.dist(a,b)<1e-6:continue
  t=pcb.PCB_TRACK(board);t.SetStart(pt(*a));t.SetEnd(pt(*b));t.SetWidth(mm(width));t.SetLayer(layer);t.SetNet(nets[net]);board.Add(t)
def via(net,x,y):
 v=pcb.PCB_VIA(board);v.SetPosition(pt(x,y));v.SetWidth(mm(.6));v.SetDrill(mm(.3));v.SetViaType(pcb.VIATYPE_THROUGH);v.SetLayerPair(pcb.F_Cu,pcb.B_Cu);v.SetNet(nets[net]);board.Add(v)
def path(net,refs,width=.25,layer=pcb.F_Cu):track(net,[pos(*p) if isinstance(p[0],str) else (p[0]+60,p[1]+60) for p in refs],width,layer)
# Deliberately manual routes begin with local signal and decoupling connections.
# No automatic routing, net renaming, clearance exemptions or hidden unrouted nets.
exec((ROOT/'scripts/manual_routes.py').read_text(encoding='utf8'))
exec((ROOT/'scripts/mechanical_features.py').read_text(encoding='utf8'))
# Keep placement preview editable; routing status is measured by KiCad DRC.
def legend(s,x,y,size=1,layer=pcb.F_SilkS):
 t=pcb.PCB_TEXT(board);t.SetText(s);t.SetPosition(pt(x+60,y+60));t.SetTextSize(pt(size,size));t.SetTextThickness(mm(.15));t.SetLayer(layer);t.SetMirrored(layer==pcb.B_SilkS);board.Add(t)
legend('PLANAR STUDIO',20,-1.6,1.2)
legend('PS-GAN-60W  /  A2',24,50.6,.85)
legend('48V IN',51,8.2,.9);legend('12V OUT',-2,8.2,.9)
legend('+',47.8,15.96,1);legend('-',47.8,21.04,1)
legend('-',-.1,14.3,.8);legend('+',-.1,23,.8)
legend('VIN  GND',52.5,31.3,.8)
legend('12V',-3.5,27,.8);legend('GND',-3.5,34,.8)
legend('5V  AGND',40.5,-2.9,.8)
legend('ISOLATED',-2.6,38,.8)
legend('PRIMARY',52.5,38,.8)
legend('ENGINEERING PROTOTYPE',24,50.6,.85,pcb.B_SilkS)
# Assembly reference IDs on the front fabrication layer remain uncluttered.
board.GetDesignSettings().SetAuxOrigin(pt(53,112))
out=CAD/'PS-GAN-60W.kicad_pcb';pcb.SaveBoard(str(out),board)
# Record requested copper weights and preliminary dielectric positions in native CAD.
stack='(stackup (layer "F.SilkS" (type "Top Silk Screen")) (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01)) '
ls=['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','In5.Cu','In6.Cu','B.Cu'];ds=[.13,.13,.17,.18,.17,.13,.13]
for i,l in enumerate(ls):
 stack+=f'(layer "{l}" (type "copper") (thickness 0.07)) '
 if i<7:stack+=f'(layer "dielectric {i+1}" (type "prepreg") (thickness {ds[i]}) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) '
stack+='(layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01)) (layer "B.SilkS" (type "Bottom Silk Screen")) (copper_finish "ENIG") (dielectric_constraints no))'
txt=out.read_text(encoding='utf8').replace('(setup\n','(setup\n'+stack+'\n',1).replace('(capping no)','(capping yes)',1).replace('(filling no)','(filling yes)',1)
out.write_text(txt,encoding='utf8')
# Explicit rules; functional isolation is not a certified mains-insulation design.
project={'meta':{'filename':'PS-GAN-60W.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':.15,'min_track_width':.16,'min_via_diameter':.6,'min_through_hole_diameter':.3,'min_hole_to_hole':.25,'min_copper_edge_clearance':.25},'defaults':{'board_outline_line_width':.05}}},'net_settings':{'classes':[{'name':'Default','clearance':.2,'track_width':.25,'via_diameter':.6,'via_drill':.3}],'meta':{'version':3}},'pcbnew':{'page_layout_descr_file':''},'schematic':{'page_layout_descr_file':'${KIPRJMOD}/schematic-frame.kicad_wks'},'text_variables':{'DESIGN_STATUS':'ENGINEERING REVIEW ONLY'}}
project['erc']={'rule_severities':{'four_way_junction':'error'}}
(CAD/'PS-GAN-60W.kicad_pro').write_text(json.dumps(project,indent=2))
layout={r:{'position':place[r],'pads':{p.GetNumber():[round(pcb.ToMM(p.GetPosition().x)-60,4),round(pcb.ToMM(p.GetPosition().y)-60,4)] for p in f.Pads()}} for r,f in fps.items()}
(ROOT/'evidence/layout.json').write_text(json.dumps(layout,indent=2))
print('Native board saved:',out,'footprints',len(fps))
