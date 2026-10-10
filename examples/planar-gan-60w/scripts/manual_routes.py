"""Explicitly chosen paths. All internal SMD transitions require filled/capped vias."""
F=pcb.F_Cu; I1=pcb.In1_Cu; I2=pcb.In2_Cu; I3=pcb.In3_Cu; I4=pcb.In4_Cu; I5=pcb.In5_Cu; I6=pcb.In6_Cu; B=pcb.B_Cu
vseen=set()
def V(net,p):
 q=pos(*p) if isinstance(p[0],str) else (p[0]+60,p[1]+60)
 key=(net,round(q[0],4),round(q[1],4))
 if key not in vseen:via(net,*q);vseen.add(key)
def W(net,layer,refs,width=.25):
 path(net,refs,width,layer)
 if layer!=F:
  for p in refs:
   if isinstance(p[0],str) and p[0]!='T1' and not p[0].startswith('J'):V(net,p)
def Z(net,layer,points):
 z=pcb.ZONE(board);z.SetLayer(layer);z.SetNet(nets[net]);z.SetLocalClearance(mm(.25));z.SetThermalReliefGap(mm(.3));z.SetThermalReliefSpokeWidth(mm(.4));z.SetPadConnection(pcb.ZONE_CONNECTION_FULL);z.SetMinThickness(mm(.16));z.SetIslandRemovalMode(pcb.ISLAND_REMOVAL_MODE_ALWAYS);poly=z.Outline();poly.NewOutline()
 for x,y in points:poly.Append(mm(x+60),mm(y+60))
 board.Add(z)
# Local GaN loop and resonant tank.
W('VIN',F,[('U1',7),('C3',1),('C2',1)],.8)
W('PGND',F,[('U1',6),('C3',2)],1)
W('PGND',F,[('U1',17),('U1',6)],.6)
W('SW',F,[('U1',5),(41.8,16),(41.8,18.5),('L1',1)],.8)
W('PRI_A',F,[('L1',2),(36.2,19),(36.2,18.7),('T1',1)],.6)
W('TANK_C',F,[('T1',2),(36.2,12.7352),('C7',1)],.5)
W('TANK_C',F,[('C8',1),('C7',1)],.5)
W('PGND',F,[('C7',2),('C8',2)],.8)
W('VIN_RAW',I1,[('J1',2),(55,15.96),(55,12.2),(47.9,12.2),(47.9,4),(45.5,2),(45.5,.5),(36.8,.5),('F1',1)],1.0)
W('VIN',I3,[('F1',2),(34.55,6),('D1',1)],1)
W('VIN',I3,[('F1',2),(35.4,3.7),(37.4,6.175),('C1',1)],.8)
W('VIN',I3,[('C1',1),(40.8,6.175),(41.3,5.675),(41.3,1),(46.6,1),(47.4,3),(47.4,19.5),('C2',1)],.7)
# Bootstrap and VCC loops stay entirely on the component layer.
W('HB',F,[('U1',10),(46.9,10.8),(47.4,11.3),('C4',1)],.2)
W('HS_LOCAL',F,[('U1',11),(46.9,10.3),(47.4,9.8),('C4',2)],.2)
W('AGND',F,[('U1',15),(43.33,9.1),(42.925,8.695),('C6',2)],.2)
W('V5',F,[('U1',14),(43.82,9.1),(44.475,8.445),('C6',1)],.2)
W('V5',F,[('C6',1),(45.275,7.7),('C5',1)],.4)
W('AGND',F,[('C6',2),(42.125,7.7),('C5',2)],.4)
# Dividers terminate at the GaN inputs; the long runs carry low-impedance GD.
W('HI',F,[('U1',12),(44.82,9.7),(45.32,9.2),(46.5,9.2),(47.6,8.1),(48.6,8.1),('R5',1)],.2)
W('HI',F,[('R5',1),(49.175,7.95),(50.825,7.95),('R4',2)],.2)
W('LI',F,[('U1',13),(44.33,9.5),(45.65,8.33)],.16)
V('LI',(45.65,8.33));W('LI',I2,[(45.65,8.33),(44.7,8.9),(42,8.9),(41,10.7),(39.075,10.7),('R7',1)],.2)
W('LI',F,[('R7',1),(39.075,8.9),(40.725,8.9),('R6',2)],.2)
W('V5',I6,[(40.8,22),(40.8,25.8),(37.9,25.8),('U5',5)],.35)
V('V5',(40.8,22));W('V5',I5,[('C5',1),(45.275,3.8),(48.45,3.8),(48.45,10),(48,10.45),(48,23.8),(47,24.8),(41.8,24.8),(40.8,23.8),(40.8,22)],.35)
W('V5',F,[('U5',5),('C26',1)],.35)
W('TANK_C',I3,[('C8',1),(37.025,21.5),(34.4,21.5),(34.4,24),(32.5,27.375),('C17',1)],.3)
# Secondary power. Center-tap escapes on a copper layer without winding turns.
W('VOUT',I4,[('T1',4),(10.2,15.5),(10.2,26.225),('C14',1)],2.0)

W('VOUT',I4,[('C14',1),('C13',1)],2.0)
W('VOUT',I4,[('C14',1),(5.25,29.175),(5.25,34.175),('C16',1)],2.0)
W('VOUT',I4,[(10.2,15.5),(10.2,6.6),(8.1,6.6),(6.95,7.05),(4.025,7.05),('C15',1)],1.8)
W('VOUT',I4,[('C15',1),(4.025,7),(-5.2,7),(-5.2,21.04),('J2',2)],2.0)
W('VOUT',I4,[(10.2,15.5),(10.2,19.25),(3.725,19.25),('C12',1)],.35)
W('VOUT',F,[('C12',1),(4.53,19.45),('U3',7)],.3)
W('SEC_A',I3,[('T1',3),(6.8,12.7352),(6.2,10.2),('Q1',9)],.8)
W('SEC_B',F,[('T1',5),(8.1,19),(7,21.8),(5.7,23.61),('Q2',9)],.8)
for q in ['Q1','Q2']:
 for pin in [5,6,7,8]:W('SEC_A' if q=='Q1' else 'SEC_B',F,[(q,9),(q,pin)],.4)
 for pin in [1,2,3]:W('SGND',F,[(q,1),(q,pin)],.35)
W('SEC_A',F,[('Q1',5),(6,8.3),(7,9.825),('R12',1)],.25)
W('SEC_B',F,[('Q2',5),(6.1,24.7),('R13',1)],.25)
W('SR_G1',F,[('Q1',4),(5.9,11.3),('R10',2)],.25)
W('VS1',I6,[('U3',4),(1.995,8.175),('R12',2)],.2)
W('VS2',I6,[('U3',6),(3.265,19.1),(6.8,19.1),(7.3,20.2),('R13',2)],.2)
W('SR_REG',F,[('U3',3),(3.27,12.55),(2.5,11.6),('C11',1)],.3)
# REG bypass uses its adjacent capped SGND via and uninterrupted In1 reference.
W('SGND',F,[('U3',2),('Q1',2)],.4)
# Controller, sensing, and bias circuits, with explicitly selected routing layers.
# Timing and protection passives form a compact pin-ordered bank beside U2.
W('DT',F,[('U2',1),('R1',1)],.2)
W('RT',F,[('U2',2),(23.85,36.37),(23.32,36.9),('R2',1)],.2)
W('RT',I2,[('R2',1),(23.6,37.575),(23.6,41.525),('R3',1)],.2)
W('OC',F,[('U2',3),(23.75,37.63),('C18',1)],.2)
W('OC',I3,[('U2',3),(25.3,36.73),(25.3,33.825),('R9',1)],.2)
W('OC',F,[('R9',1),(25.025,33.55),('D2',2)],.2)
W('SS',F,[('U2',4),(24.175,38.9),('C9',1)],.2)
W('SS',I5,[('C9',1),(23.6,41.125),(23.6,42.6),(22.87,43.33),('U8',4)],.2)
W('FB_COL',I6,[('U6',4),(20.6,36.38),(20.6,41.525),('R3',2)],.2)
W('CS_AC',I2,[('C17',2),(33,25.825),(33,28.175),('R8',1)],.2)
W('CS_RECT',F,[('R8',2),(31.5,32.6),('D2',3)],.2)
W('RON',F,[('U4',4),(45,28.5),('R16',2)],.2)
# Isolated feedback and independent overvoltage shut-down.
W('VOUT',I4,[('C16',1),(5.25,34.175),(5.25,32.6),('R20',1)],.4)
W('VOUT',I4,[('R20',1),(12.475,31.6),(5.2,31.6),(5.2,36.525),('R22',1)],.4)
W('VOUT',I4,[('R22',1),(5.2,36.525),(5.2,44.125),('R27',1)],.4)
W('VOUT',I4,[('R20',1),(12.475,40.2),('R25',1)],.4)
W('FB_LED',F,[('R20',2),(14.725,33.45),(13.075,33.45),('R21',1)],.2)
W('FB_LED',I1,[('R20',2),(15.1,32.975),(15.1,34.28),('U6',1)],.2)
W('FB_K',F,[('R21',2),(15.2,34.775),(15.2,36.72),('U6',2)],.2)
W('FB_K',F,[('U7',1),(12.2,36.51),(12.2,38.27),('U6',2)],.2)
W('FB_K',F,[('C28',1),(11.0,34.3),('U7',1)],.2)
W('FB_K',I1,[('U7',1),(11.45,40.1),(7.8,40.1),(6.375,41),('R24',1)],.2)
W('VREF',F,[('U7',2),(8.925,35.135),('C28',2)],.2)
W('VREF',F,[('C28',2),(8.35,34.875),('R22',2)],.2)
W('VREF',I2,[('U7',2),(8.9,36.41),(8.9,37.975),('R23',1)],.2)
W('VREF',I2,[('R23',1),(8.9,39.525),(10.4,39.525),('C27',2)],.2)
W('COMP',F,[('R24',2),('C27',1)],.2)
W('OV_LED',F,[('R25',2),(14.725,41.05),(13.075,41.05),('R26',1)],.2)
W('OV_LED',I1,[('R25',2),(15.1,40.575),(15.1,41.88),('U8',1)],.2)
W('OV_K',F,[('R26',2),(15.2,42.375),(15.2,44.32),('U8',2)],.2)
W('OV_K',F,[('U9',1),(12.2,44.11),(12.2,45.87),('U8',2)],.2)
W('OV_REF',F,[('U9',2),(9,42.475),('R27',2)],.2)
W('OV_REF',I2,[('U9',2),(8.9,44.01),(8.9,45.7),('R28',1)],.2)
W('OV_REF',F,[('R28',1),(8.45,47.125),('C29',1)],.2)
# Receiver dividers and continuous controller reference corridor.
W('GD1',I4,[('U2',8),(31.5,35.2),(33.7,35.2),(34.1,34.6),(36.5,34.6),(36.5,29.5),(37,28.6),(37,23.1),(38.5,21.6),(39.2,21.6),(40,20.8),(40,17.3),(40.9,16.6),(40.9,11),(41.4,10.3),(41.9,5.8),(46.2,5.8),('R4',1)],.25)
W('GD2',I2,[('U2',5),(31.5,39.4),(36.4,39.4),(37.6,38.2),(37.6,29.3),(38,28.2),(38,26),(39,25),(39,23.8),(38,22.8),(38,9.5),('R6',1)],.25)
# The control return is a continuous In3.Cu reference area, stitched to local bypass grounds.
W('V5',I5,[('C5',1),(45.275,2),(39,2),('TP5',1)],.3)
W('AGND',I4,[('C5',2),(42.125,2),('TP6',1)],.3)
# Both receiver-divider returns connect to the local AGND reference.
W('AGND',I6,[('R5',2),(50.8,11),(49,12.8),(46.7,9.8),(43.8,9.8),('C6',2)],.3)
# Gate traces stay above the nearby secondary-return reference plane.
W('VG1',F,[('U3',1),('R10',1)],.3)
W('VG2',I2,[('U3',8),(6.4,19.2),(2.325,19.2),('R11',1)],.3)
W('SR_G2',F,[('R11',2),(.675,21.7),('Q2',4)],.3)
# Separate VSS sense route. Its via is isolated from SGND pours below.
W('SGND',I3,[('U3',5),(1.2,19.2),(1.2,21.7),('Q2',1)],.2)
# Compact LM5164 cell: local input, bootstrap, switch, inductor and output storage.
W('VIN',I3,[('C2',1),(47,22),(49,24),(51.4,24),(51.4,26),(51.4,31.625),('C19',1)],.8)
W('VIN',F,[('C19',1),(47.1,31.625),(47.1,33.13),('U4',2)],.6)
W('PGND',F,[('C19',2),(46,34.575),('U4',1),(42,34.4),('U4',9)],.8)
W('VIN',I3,[('C19',1),('R14',1)],.25)
W('VIN',I3,[('C19',1),(51.4,31.625),('TP1',1)],.5)
W('BIAS_EN',I1,[('U4',3),(46,30.86),(46,28.525),('R14',2)],.2)
W('BIAS_EN',F,[('R14',2),('R15',1)],.2)
W('BIAS_BST',F,[('U4',7),(38,33.13),('C20',1)],.25)
W('BIAS_SW',F,[('U4',8),(39,35.6),(40.5,37.55),('L2',1)],.8)
W('BIAS_SW',F,[('U4',8),(38,34.4),('C20',2)],.25)
# Type-3 ripple sampler: attenuate at R19, then keep the sensitive node beside FB.
W('BIAS_SW',I6,[('U4',8),(38.9,33.8),(38.9,30.3),(38.675,29.6),('R19',1)],.2)
W('BIAS12',F,[('L2',2),(34,43.45),('C21',1)],.8)
W('BIAS12',F,[('C21',1),(35.4,44),(35.4,47.5),('C22',1)],.8)
W('PGND',I1,[('C21',2),(32,41.3),(32,44.4),('C22',2)],.8)
W('BIAS12',I5,[('C21',1),(35,44.5),(47.8,44.5),(48.0,40.2),(49.2,38.5),(49.2,29),(46.3,29),(42.2,26.8),('U5',1)],.5)
W('BIAS12',I5,[('C21',1),(32,43.175),(30.5,41.7),(30.5,36.05),('C10',1)],.5)
W('BIAS12',F,[('C10',1),('U2',7)],.4)
W('AGND',F,[('C10',2),('U2',6)],.4)
W('BIAS12',F,[('U5',1),(40.625,25.275),('C25',1)],.4)
W('AGND',F,[('U5',2),(41.1,23.8),('C25',2)],.3)
W('BIAS12',I2,[('U5',1),(41.3,24.75),(41.3,22.85),('U5',3)],.2)
# Quiet Kelvin pickup originates at the output capacitor, not the switching land.
W('BIAS12',I5,[('C21',1),(34.2,43.175),(34.2,39.2),(34.2,37.5),(33,35.7),(33,30.4),(34,29.4),(35.375,29.4),('C23',2)],.25)
W('BIAS12',F,[('C23',2),(35.375,29.6),('R17',1)],.25)
W('BIAS_FB',F,[('U4',5),(37.6,30.59),(37.6,32.325),('R17',2),('R18',1)],.2)
W('BIAS_FB',I2,[('R18',1),(36.1,34.575),(36.1,36.225),('C24',2)],.2)
W('RIPPLE',F,[('R19',2),(40.325,29.6),(37.5,29.6),(36.8,28.9),(36.8,27.7),(33.825,27.7),('C23',1)],.2)
W('RIPPLE',I2,[('C23',1),(33,29.625),(33,34),(34,35),(34,37.275),('C24',1)],.2)
# Parallel source-return vias spread secondary current.
for ref,pins,y in [('Q1',[1,2],11.3),('Q2',[2,3],21.35)]:
 for pin in pins:
  x=pos(ref,pin)[0]-60
  W('SGND',F,[(ref,pin),(x,y)],.3);V('SGND',(x,y))
# Ground through-vias use capped/fill process. Fine-pitch transistor sources escape first.
for p in data['parts']:
 for pin,net in p['nets'].items():
  if net not in ['PGND','SGND','AGND'] or p['ref']=='T1' or p['ref'].startswith('J'):continue
  if p['ref']=='U1' and pin in ['15']:continue
  if p['ref']=='U3' and pin=='5':continue
  if p['ref'] in ['Q1','Q2']:continue
  V(net,(p['ref'],pin))
for ref,pin,point in [('Q1',2,(3.96,11.3)),('Q2',2,(4.64,21.35))]:W('SGND',F,[(ref,pin),point],.4);V('SGND',point)
Z('PGND',B,[(37.4,.6),(55,.6),(55,49.4),(18.5,49.4),(18.5,29.5),(37.4,29.5)])
Z('PGND',I6,[(41.5,.6),(55,.6),(55,49.4),(41.5,49.4)])
Z('AGND',I6,[(18.5,29.5),(35.5,29.5),(35.5,49.4),(18.5,49.4)])
Z('PGND',I1,[(38.9,10.8),(47.4,10.8),(47.4,23.5),(38.9,23.5)])
Z('SGND',B,[(-5,.6),(11.5,.6),(11.5,7.2),(7.1,7.2),(7.1,24),(17,29.5),(17,49.4),(-5,49.4)])
Z('SGND',I5,[(-5,.6),(11.5,.6),(11.5,7.2),(7.1,7.2),(7.1,24),(17,29.5),(17,49.4),(-5,49.4)])
# Bypass returns connect directly to the quiet reference pour, without long ground traces.
Z('AGND',I3,[(37.8,2.8),(51.8,2.8),(51.8,9.3),(42,9.3),(42,11),(41.3,11),(41.3,22),(43.5,22),(43.5,26),(38,31.5),(38,49.4),(18.5,49.4),(18.5,29.5),(34,29.5),(34,22),(38,19)])
# D1 ground lies above the core, linked without copper across a leg slot.
W('PGND',B,[('D1',2),(32.3,.75),(38,.75),(38,1.1)],.8)
# C26 ground returns through its capped via to the continuous In3 AGND plane.


W('VOUT',I4,[('J2',2),(-3.5,21.04),('TP3',1)],1)
# Copper spreading and parallel transitions for pulsed-current paths.
for point in [(43.2,11.2),(44,12.8),(44,14.5)]:V('PGND',point)
Z('PGND',F,[(42.8,10.6),(45.0,10.6),(45.0,18),(42.8,18)])
Z('VIN',F,[(45.6,12.5),(47.4,12.5),(47.4,23.4),(44.5,23.4),(44.5,19),(45.6,19)])
Z('AGND',I1,[(37.8,2.8),(51.8,2.8),(51.8,9.2),(37.8,9.2)])
# Adjacent reference on both sides of GD1 near the VIN feed crossing.
Z('AGND',I5,[(37.8,2.8),(51.8,2.8),(51.8,9.2),(37.8,9.2)])
Z('SGND',I1,[(-.5,5.5),(8,5.5),(8,25),(-.5,25)])
Z('SGND',F,[(2.7,11.6),(5.1,11.6),(5.1,21.3),(2.7,21.3)])
Z('PGND',F,[(41,30.8),(43.5,30.8),(43.5,33.5),(45.5,33.5),(47,35),(47,49),(44,49),(44,35.7),(41,34)])
Z('PGND',I1,[(36,29),(51.5,29),(51.5,49),(36,49)])
for point in [(41.4,32.0),(42.3,31.9),(42.8,33.0),(41.6,33.0)]:V('PGND',point)
for ref,pin,net in [('C2',2,'PGND'),('C3',2,'PGND'),('C7',2,'PGND'),('C8',2,'PGND'),('C14',1,'VOUT'),('C14',2,'SGND'),('C15',1,'VOUT'),('C15',2,'SGND')]:
 x,y=pos(ref,pin);x-=60;y-=60
 for dx,dy in ([(-.65,0),(.65,0)] if ref in ['C2','C14'] else [(0,-.65)] if ref=='C15' and pin==2 else [(0,-.65),(0,.65)]):
  V(net,(x+dx,y+dy));W(net,F,[(ref,pin),(x+dx,y+dy)],.4)
# No pour connection at VSS: the sense current reaches the source through its
# dedicated trace. The PGND pin separately carries the gate-drive return.
for z in board.Zones():
 if z.GetNetname()!=nets['SGND'].GetNetname():continue
 cut=pcb.SHAPE_POLY_SET();cut.NewOutline()
 for x,y in [(1.395,17.8),(2.595,17.8),(2.595,19),(1.395,19)]:cut.Append(mm(x+60),mm(y+60))
 z.Outline().BooleanSubtract(cut)
# Remove plane copper under the fast primary switching node.
for z in board.Zones():
 # Include the full custom GaN land and inductor land, not only track width.
 for fp in board.GetFootprints():
  for pd in fp.Pads():
   if pd.GetNetname()!=nets['SW'].GetNetname():continue
   shape=pcb.SHAPE_POLY_SET();pd.TransformShapeToPolygon(shape,F,mm(.25),mm(.01),pcb.ERROR_OUTSIDE)
   z.Outline().BooleanSubtract(shape)
 for t in board.GetTracks():
  if t.GetNetname()!=nets['SW'].GetNetname() or isinstance(t,pcb.PCB_VIA):continue
  shape=pcb.SHAPE_POLY_SET();t.TransformShapeToPolygon(shape,t.GetLayer(),mm(.25),mm(.01),pcb.ERROR_OUTSIDE)
  z.Outline().BooleanSubtract(shape)
board.BuildConnectivity()
pcb.ZONE_FILLER(board).Fill(board.Zones())
