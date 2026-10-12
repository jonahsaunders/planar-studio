"""KiCad 9 board generator. Deliberate routes, no autorouter."""
from pathlib import Path
import pcbnew as pcb,json,math,shutil,os,xml.etree.ElementTree as ET
from sexp import parse,get,all,dump
ROOT=Path(__file__).resolve().parents[1];CAD=ROOT/'kicad';LIB=CAD/'CoilTile.pretty';DATA=json.loads((ROOT/'circuit.json').read_text());NAME='CoilTile'
STOCK=Path(os.environ['KICAD9_FOOTPRINT_DIR']);mm=pcb.FromMM

def pt(x,y):return pcb.VECTOR2I(mm(x),mm(y))
def xy(p):return (pcb.ToMM(p.x),pcb.ToMM(p.y))
def fp_line(a,b,w=.12,layer='F.SilkS'):return f'(fp_line (start {a[0]} {a[1]})(end {b[0]} {b[1]})(stroke(width {w})(type default))(layer "{layer}"))'
def rect(a,b,layer='F.CrtYd',w=.05):
 x,y=a;xx,yy=b;ps=[(x,y),(xx,y),(xx,yy),(x,yy),(x,y)];return ''.join(fp_line(a,b,w,layer) for a,b in zip(ps,ps[1:]))
# Copy exact stock footprints, keeping project portable.
for p in DATA['parts']:
 lib,name=p['stock_footprint'].split(':')
 if lib!='CoilTile':shutil.copy2(STOCK/(lib+'.pretty')/(name+'.kicad_mod'),LIB/(name+'.kicad_mod'))
for f in LIB.glob('*.kicad_mod'):
 if '(model' not in f.read_text():continue
 d=parse(f.read_text().replace('${KICAD9_3DMODEL_DIR}', '${KIPRJMOD}/3dmodels'))
 for model in list(all(d,'model')):
  if not Path(str(model[1]).replace('${KIPRJMOD}',str(CAD))).exists():d.remove(model)
 f.write_text(dump(d))
usbfile=LIB/'USB_C_Receptacle_HRO_TYPE-C-31-M-12.kicad_mod'
usb=parse(usbfile.read_text())
usb[:]=[e for e in usb if not (isinstance(e,list) and e[0]=='fp_line' and get(e,'layer')[1]=='F.SilkS' and max(float(get(e,'start')[2]),float(get(e,'end')[2]))>3.4)]
usbfile.write_text(dump(usb))
# Model the uninterrupted winding as one polygon, as in the Planar Studio example.
geom=json.loads((ROOT/'planar-studio/geometry.json').read_text());path=geom['path'];path=[(p[0],-p[1]) for p in path]
outer=(12.7,0);inner=(4.8,0);path=[outer]+path+[inner]
poly=pcb.SHAPE_POLY_SET()
for a,b in zip(path,path[1:]):
 s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_SEGMENT);s.SetStart(pt(*a));s.SetEnd(pt(*b));s.SetWidth(mm(.2));s.SetLayer(pcb.F_Cu)
 p=pcb.SHAPE_POLY_SET();s.TransformShapeToPolygon(p,pcb.F_Cu,0,mm(.001),pcb.ERROR_INSIDE);poly.BooleanAdd(p)
poly.Simplify();assert poly.OutlineCount()==1 and poly.HoleCount(0)==0
ch=poly.COutline(0);pts=' '.join(f'(xy {pcb.ToMM(ch.CPoint(i).x):.6f} {pcb.ToMM(ch.CPoint(i).y):.6f})' for i in range(ch.PointCount()))
body=f'(net_tie_pad_groups "1,2")(fp_poly (pts {pts})(stroke(width 0)(type default))(fill solid)(layer "F.Cu"))'
body+='(pad "1" smd circle (at 12.7 0)(size .7 .7)(layers "F.Cu"))'
body+='(pad "2" thru_hole circle (at 4.8 0)(size .6 .6)(drill .3)(layers "*.Cu"))'
body+=rect((-12.3,-12.3),(13.1,12.3),'F.CrtYd')
body+='(fp_circle (center 0 0)(end 12.25 0)(stroke(width .12)(type default))(fill none)(layer "F.SilkS"))'
(LIB/'Planar_24mm_16T.kicad_mod').write_text(f'(footprint "Planar_24mm_16T" (version 20241229)(generator "pcbnew")(layer "F.Cu")(attr exclude_from_pos_files exclude_from_bom)(property "Reference" "REF**" (at 0 -13.5 0)(layer "F.SilkS")(effects(font(size 1 1)(thickness .15))))(property "Value" "PCB coil" (at 0 0 0)(layer "F.Fab")(effects(font(size 1 1)(thickness .15)))){body})')
board=pcb.BOARD();board.SetCopperLayerCount(4);board.GetDesignSettings().SetBoardThickness(mm(1.6));board.GetDesignSettings().SetAuxOrigin(pt(52,142))
t=pcb.TITLE_BLOCK();t.SetTitle('CoilTile / four-pixel inductive sensing');t.SetRevision('A2');t.SetDate('2026-10-12');board.SetTitleBlock(t)
# Take the actual KiCad-exported pin/net mapping, including NC identity.
xml=ET.parse(ROOT/'evidence/netlist.xml');pin_nets={};nets={}
for n in xml.findall('.//nets/net'):
 name=n.attrib['name'];net=pcb.NETINFO_ITEM(board,name);board.Add(net);nets[name]=net
 for node in n.findall('node'):pin_nets[node.attrib['ref'],node.attrib['pin']]=name
placement={
 'L1':(106,106,135),'L2':(106,70,225),'L3':(70,70,315),'L4':(70,106,45),
 'U3':(88,88,0),'C7':(94.5,92.5,270),'C8':(94.5,84.5,90),'C9':(89.5,81.5,0),'C10':(81.5,85.5,270),
 'C5':(88.25,94,270),'C6':(91.5,96,270),
 'U2':(88,128,0),'C3':(82.5,126.05,180),'C4':(95,129.5,0),'R3':(81.5,130,270),
 'R4':(83,121,90),'R5':(86,121,90),
 'J1':(108,138.35,0),'U4':(101.5,130.5,0),'U1':(113,124,0),'C1':(109.5,127,180),'C2':(117.5,123.05,0),
 'R1':(104.5,128,270),'R2':(112,130,270),
 'TP1':(97,123,0),'TP2':(100,123,0),'TP3':(75,128,0),'TP4':(75,132,0),
 'H1':(56,56,180),'H2':(120,56,0),'H3':(56,138,180),'H4':(120,138,0),
}
fps={};pads={}
for p in DATA['parts']:
 ref=p['ref'];name=p['footprint'].split(':')[1];f=pcb.FootprintLoad(str(LIB),name);assert f,name
 f.SetReference(ref);f.SetValue(p['value']);f.SetFPID(pcb.LIB_ID('CoilTile',name));f.SetPath(pcb.KIID_PATH('/'+DATA['root_uuid']+'/'+p['uuid']))
 for k,v in [('MPN',p['mpn']),('Manufacturer',p['mfr']),('LCSC',p['lcsc']),('Datasheet',p['source'])]:f.SetField(k,v);None
 if not p['bom']:f.SetAttributes(f.GetAttributes()|pcb.FP_EXCLUDE_FROM_BOM|pcb.FP_EXCLUDE_FROM_POS_FILES)
 for pd in f.Pads():
  num=pd.GetNumber()
  if num and (ref,num) in pin_nets:
   netname=pin_nets[ref,num];pd.SetNet(nets[netname]);expected=p['nets'][num]
   if expected:assert netname.lstrip('/')==expected,(ref,num,netname,expected)
 x,y,ang=placement[ref];f.SetPosition(pt(x,y));f.SetOrientationDegrees(ang);board.Add(f);fps[ref]=f
 for field in f.GetFields():
  if field.GetName()!='Reference':field.SetVisible(False)
 f.Reference().SetTextSize(pt(.8,.8));f.Reference().SetTextThickness(mm(.12));f.Reference().SetTextAngle(pcb.EDA_ANGLE(0,pcb.DEGREES_T));f.Value().SetVisible(False)
 # Keep references off component bodies and coil copper.
 if ref.startswith('L'):f.Reference().SetPosition(pt(x,y-13.8));f.Reference().SetVisible(False)
 elif ref=='J1':f.Reference().SetPosition(pt(115,136.5))
 elif ref.startswith('H'):f.Reference().SetVisible(False)
 elif ref.startswith('TP'):f.Reference().SetPosition(pt(x,y-1.5))
 else:f.Reference().SetPosition(pt(x,y-2 if ref[0] in 'CR' else y-4))
 for pd in f.Pads():
  if pd.GetNumber():pads.setdefault((ref,pd.GetNumber()),[]).append(pd)

def pos(ref,n):return xy(pads[ref,str(n)][0].GetPosition())
def net(ref,n):return pads[ref,str(n)][0].GetNet()
def track(netobj,ps,layer=pcb.F_Cu,w=.2):
 for a,b in zip(ps,ps[1:]):
  if math.dist(a,b)<1e-7:continue
  t=pcb.PCB_TRACK(board);t.SetStart(pt(*a));t.SetEnd(pt(*b));t.SetWidth(mm(w));t.SetLayer(layer);t.SetNet(netobj);board.Add(t)
def route(ref,n,ps,layer=pcb.F_Cu,w=.2):track(net(ref,n),[pos(ref,n)]+ps,layer,w)
def join(a,b,ps=[],layer=pcb.F_Cu,w=.2):assert net(*a).GetNetCode()==net(*b).GetNetCode(),(a,b);track(net(*a),[pos(*a)]+ps+[pos(*b)],layer,w)
def via(ref,n,x,y,small=False):
 v=pcb.PCB_VIA(board);v.SetPosition(pt(x,y));v.SetWidth(mm(.45 if small else .6));v.SetDrill(mm(.2 if small else .3));v.SetViaType(pcb.VIATYPE_THROUGH);v.SetLayerPair(pcb.F_Cu,pcb.B_Cu);v.SetNet(net(ref,n));board.Add(v);return(x,y)
def gv(ref,n,x,y):route(ref,n,[(x,y)],w=.25);via(ref,n,x,y)
# Outline: 72 x 90 mm with 2 mm chamfered corners.
outline=[(54,52),(122,52),(124,54),(124,140),(122,142),(54,142),(52,140),(52,54),(54,52)]
for a,b in zip(outline,outline[1:]):
 s=pcb.PCB_SHAPE();s.SetShape(pcb.SHAPE_T_SEGMENT);s.SetStart(pt(*a));s.SetEnd(pt(*b));s.SetWidth(mm(.05));s.SetLayer(pcb.Edge_Cuts);board.Add(s)
# Analog escapes and local tank capacitors.
join(('U3',9),('C7',1),[(91,88.75),(92,89.75),(94.5,89.75)])
join(('U3',10),('C7',2),[(91.2,88.25),(92,89.05),(96,89.05),(96,94.5),(94.5,94.5)])
join(('U3',11),('C8',1),[(90.8,87.75),(91.7,86.85),(94.5,86.85)])
join(('U3',12),('C8',2),[(90.6,87.25),(91.3,86.55),(91.3,82),(94.5,82)])
join(('U3',13),('C9',1),[(88.75,84),(88.7,83.95),(88.7,81.5)])
route('U3',14,[(88.25,84.4),(87.5,83.65),(87.5,83.2)]);via('U3',14,87.5,83.2)
track(net('U3',14),[(87.5,83.2),(87.5,82.6),(90.275,82.6),(90.275,80.3)],pcb.B_Cu)
join(('U3',15),('C10',1),[(87.75,84.7),(86.5,83.45),(83.5,83.45),(82.2,84.7)])
join(('U3',16),('C10',2),[(87.25,84.9),(86.5,84.15),(84.5,84.15),(83,85.65),(83,87.5),(81.5,87.5)])
# Each coil's inner return goes on the back; no ground planes under the sensing disks.
# Explicit paired corridors avoid the neighboring coils.
leadpaths={
 'L1':{1:[(95.8,96.2),(94.5,94.9),(93.2,94.9),(93.2,91.7)],2:[(96.5,96.5),(96.5,94.8),(94.5,94.8)]},
 'L2':{1:[(98,79.96),(98,85.1),(96.7,86.4),(95.5,86.4)],2:[(96,80),(96.7,80.7),(96.7,85.2875),(94.5,85.2875)]},
 'L3':{1:[(79.9,79.9),(82,82),(85,82),(86.3,80.7),(88.7,80.7)],2:[(80.5,80.5),(85.5,80.5),(87,82),(90.3,82)]},
 'L4':{1:[(79.9,96.1),(80.7,95.3),(80.7,84.7125)],2:[(80.5,95.5),(82.6,93.4),(82.6,86.2875),(81.5,86.2875)]},
}
for i in range(4):
 l='L'+str(i+1);c='C'+str(i+7)
 join((l,1),(c,1),leadpaths[l][1])
 end=pos(c,2);v=(90.275,80.3) if c=='C9' else (end[0]+1.4,end[1]+.5);track(net(l,2),[pos(l,2)]+leadpaths[l][2]+[v],pcb.B_Cu) # terminate through front cap using via
 via(c,2,*v);track(net(c,2),[v,end],pcb.F_Cu)
# Local analog power/ground. Ground vias are outside the QFN paste pad.
for n in [3,4]:route('U3',n,[(85,88+(.25 if n==3 else .75))]);
track(net('U3',3),[(85,88.25),(85,88.75)]);via('U3',3,85,88.5)
route('U3',6,[(87.75,90.5),(86.8,91.45)]);via('U3',6,86.8,91.45);gv('U3',8,89.5,90.7)
route('U3',17,[(88.75,88),(88.75,90),(89.5,90.7)],w=.2)
join(('U3',7),('C5',1),[(88.25,91.3)],w=.25)
for ref in ['C5','C6']:
 x,y=pos(ref,2);gv(ref,2,x,y+.8)
# I2C stays in the central gap between the four sensing disks.
join(('U3',1),('R5',2),[(84.7,87.25),(83.5,88.45),(83.5,116),(86,118.5)])
route('U3',2,[(84.9,87.75),(84,88.65),(84,115)]);via('U3',2,84,115,small=True)
track(net('U3',2),[(84,115),(82,117),(82,119.3)],pcb.B_Cu)
join(('U2',1),('C3',1),[],w=.3)
join(('U2',4),('R3',2),[(83.5,128),(82.7,128.8),(82.7,131),(81.5,131)])
route('U2',11,[(92,128)],w=.25);via('U2',11,92,128)
route('U2',5,[(83.8,128.65),(83.8,129.8)]);via('U2',5,83.8,129.8)
for r,n,v in [('C3',2,(80.7,126.05)),('C4',2,(96.8,129.5)),('U2',14,(90,124.5))]:gv(r,n,*v)
# Signal via escapes avoid the closely pitched neighboring TSSOP pads.
for n,v in [(9,(93,129.3)),(10,(91.7,128.65))]:route('U2',n,[v]);via('U2',n,*v,small=(n==10))
for ref,v in [('R4',(82,119.3)),('R5',(87,119.3))]:route(ref,2,[v]);via(ref,2,*v)
track(net('U2',9),[(93,129.3),(94.5,130.8),(94.5,132.5),(79,132.5),(79,119.3),(82,119.3)],pcb.B_Cu)
track(net('U2',10),[(91.7,128.65),(91,127.95),(91,119.3),(87,119.3)],pcb.B_Cu)
# Local power vias connect to the dedicated inner 3.3 V plane.
for r,n,v in [('C3',1,(83.275,124.95)),('C4',1,(94.225,128.5)),('R3',1,(80.6,129.175)),('R4',1,(83,122.8)),('R5',1,(86,122.8)),('C5',1,(88.25,92.4)),('C6',1,(91.5,94.3)),('C2',1,(116.55,122)),('TP1',1,(97,122))]:
 route(r,n,[v],w=.25);via(r,n,*v)
# USB pair: short F.Cu path, one back-layer crossover to join reversible pins.
join(('J1','A6'),('J1','B6'),[(107.75,132.6),(108.75,132.6)],w=.18)
for n in ['A7','B7']:
 x,y=pos('J1',n);route('J1',n,[(x,133.2)],w=.18);via('J1',n,x,133.2,small=True)
track(net('J1','A7'),[(108.25,133.2),(107.25,133.2),(105,133.2),(103.5,132.1)],pcb.B_Cu,.18);via('J1','A7',103.5,132.1)
track(net('J1','A7'),[(103.5,132.1),(102.6375,132.1),pos('U4',4)],pcb.F_Cu,.18)
join(('J1','A6'),('U4',6),[(107.75,132.6),(105.8,132.6),(104,131.2),(104,129.55)],w=.18)
join(('U4',1),('U4',6),[],w=.18);join(('U4',3),('U4',4),[],w=.18)
join(('U2',13),('U4',1),[(92.2,126.7),(93.2,125.7),(98,125.7),(99.2,126.9),(99.2,128.3875)],w=.18)
join(('U2',12),('U4',3),[(92.2,127.35),(93.35,126.2),(97.5,126.2),(98.4,127.1),(98.4,131.45)],w=.18)
# CC traces use In2.Cu locally; their vias sit behind the connector contact row.
for n,v in [('A5',(106.5,135.5)),('B5',(109.75,135.5))]:
 x,y=pos('J1',n);route('J1',n,[(x,134.85),v],w=.18);via('J1',n,*v)
for r,v in [('R1',(104.5,126.8)),('R2',(112,128.7))]:route(r,1,[v]);via(r,1,*v)
track(net('R1',1),[(106.5,135.5),(106.5,136.7),(101,136.7),(101,126.8),(104.5,126.8)],pcb.In2_Cu,.2)
track(net('R2',1),[(109.75,135.5),(109.75,130.95),(112,128.7)],pcb.In2_Cu,.2)
for r in ['R1','R2']:
 x,y=pos(r,2);gv(r,2,x+1,y)
# VBUS avoids the connector locating holes and shell stakes.
for n in ['A4','A9']:
 x,y=pos('J1',n);route('J1',n,[(x,134.85)],w=.3);via('J1',n,x,134.85)
track(net('J1','A4'),[(105.55,134.85),(110.45,134.85),(110.45,128),(111.4,127.05),(111.4,126.2)],pcb.B_Cu,.35)
via('C1',1,111.4,126.2);route('C1',1,[(111.4,126.2)],w=.35)
join(('C1',1),('U1',1),[(110.45,125.8),(110,125.35),(110,122.2),(111.8625,122.2)],w=.3)
join(('U1',1),('U1',3),[(110.8,123.05),(110.8,124.95)],w=.25)
join(('U1',5),('C2',1),[],w=.35)
route('U4',5,[(103.3,130.5)]);via('U4',5,103.3,130.5)
track(net('U4',5),[(103.3,130.5),(104.5,131.7),(109.8,131.7),(110.45,132.35)],pcb.B_Cu,.3)
for r,n,v in [('U1',2,(112.7,124)),('C1',2,(108.55,128.4)),('C2',2,(119.5,123.05)),('U4',2,(99.4,130.5))]:gv(r,n,*v)
for n in ['A1','A12']:
 x,y=pos('J1',n);gv('J1',n,x,y+.6)
gv('TP2',1,100,124)
route('TP3',1,[(74,128)]);via('TP3',1,74,128);track(net('TP3',1),[(74,128),(79,128)],pcb.B_Cu)
route('TP4',1,[(74,132)]);via('TP4',1,74,132);track(net('TP4',1),[(74,132),(72,132),(72,122),(87,122),(87,119.3)],pcb.In2_Cu)
# Ground zones only central electronics corridor and bottom strip.
def zone(poly,layer):
 z=pcb.ZONE(board);z.SetLayer(layer);z.SetNet(nets['GND']);z.SetLocalClearance(mm(.2));z.SetThermalReliefGap(mm(.25));z.SetThermalReliefSpokeWidth(mm(.3));z.SetPadConnection(pcb.ZONE_CONNECTION_THERMAL)
 z.Outline().NewOutline()
 for x,y in poly:z.Outline().Append(int(mm(x)),int(mm(y)))
 board.Add(z)
ground=[(82.5,87),(92,87),(92,118.5),(123.5,118.5),(123.5,139.8),(121.8,141.5),(54.2,141.5),(52.5,139.8),(52.5,118.5),(82.5,118.5)]
zone(ground,pcb.In1_Cu)
# Separate local power plane, with the same no-copper sensor keepout boundary.
z=pcb.ZONE(board);z.SetLayer(pcb.In2_Cu);z.SetNet(nets['+3V3']);z.SetLocalClearance(mm(.2));z.SetPadConnection(pcb.ZONE_CONNECTION_FULL);z.Outline().NewOutline()
for x,y in ground:z.Outline().Append(int(mm(x)),int(mm(y)))
board.Add(z)
# Ground on the back of the USB/bridge region adds a short continuous return.
zone([(53,120),(123,120),(123,139),(121,141),(55,141),(53,139)],pcb.B_Cu)
for x,y in [(55,122),(62,121),(70,121),(79,136),(87,137),(96,139),(103,139),(113.8,140),(122,132),(122,121),(98,120)]:via('TP2',1,x,y)
# Useful restrained silkscreen.
def text(s,x,y,size=1,layer=pcb.F_SilkS):
 t=pcb.PCB_TEXT(board);t.SetText(s);t.SetPosition(pt(x,y));t.SetTextSize(pt(size,size));t.SetTextThickness(mm(.15 if size>=1 else .12));t.SetLayer(layer);board.Add(t)
text('COIL TILE',88,56,2);text('2 x 2  /  INDUCTIVE',88,59,1)
for s,x,y in [('02',70,70),('01',106,70),('03',70,106),('00',106,106)]:text(s,x,y,2)
text('USB / I2C',88,139,1);text('A2',59,133,1);text('3V3  GND',98.5,119.2,.8)
text('24 mm / 16 turns / 0.20 mm trace + gap',88,145,1,pcb.Dwgs_User)
pcb.SaveBoard(str(CAD/(NAME+'.kicad_pcb')),board)
board=pcb.LoadBoard(str(CAD/(NAME+'.kicad_pcb')))
board.BuildConnectivity()
pcb.ZONE_FILLER(board).Fill(board.Zones());pcb.SaveBoard(str(CAD/(NAME+'.kicad_pcb')),board)
# Explicit fabrication constraints, retained in the native project.
pro=json.loads((CAD/(NAME+'.kicad_pro')).read_text());pro.setdefault('board',{}).setdefault('design_settings',{}).setdefault('rules',{}).update({'min_clearance':.15,'min_track_width':.15,'min_via_diameter':.45,'min_through_hole_diameter':.2,'min_copper_edge_clearance':.3,'min_hole_clearance':.25})
pro['net_settings']={'classes':[{'name':'Default','clearance':.15,'track_width':.2,'via_diameter':.6,'via_drill':.3,'microvia_diameter':.3,'microvia_drill':.1,'diff_pair_width':.18,'diff_pair_gap':.2,'diff_pair_via_gap':.25}],'meta':{'version':3}}
(CAD/(NAME+'.kicad_pro')).write_text(json.dumps(pro,indent=2))
(ROOT/'evidence/placement.json').write_text(json.dumps(placement,indent=2));print('Board generated',len(fps),'footprints',len(board.GetTracks()),'tracks/vias')
