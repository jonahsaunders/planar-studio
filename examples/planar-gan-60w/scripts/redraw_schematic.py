"""A6 schematic presentation: wired functional schematic, on a compact A3 sheet."""
from pathlib import Path
import json,uuid,copy,math
import sexpdata as sx
R=Path(__file__).resolve().parents[1];CAD=R/'kicad';NAME='PS-GAN-60W'
data=json.loads((R/'circuit.json').read_text(encoding='utf8'));parts={p['ref']:p for p in data['parts']}
NS=uuid.UUID('b9e64c39-1365-4f50-9c64-d79eb4288594')
def uid(s):return str(uuid.uuid5(NS,s))
def q(s):return json.dumps(str(s),ensure_ascii=False)
def ch(n,k):return [a for a in n if isinstance(a,list) and a and str(a[0])==k]
def one(n,k):return ch(n,k)[0]
def walk(n,k):
 return ([n] if n and str(n[0])==k else [])+sum((walk(x,k) for x in n if isinstance(x,list)),[]) if isinstance(n,list) else []
lib=sx.load(open(CAD/'PS.kicad_sym',encoding='utf8'))
defs={s[1]:copy.deepcopy(s) for s in ch(lib,'symbol')};oldpins={k:{one(p,'number')[1]:one(p,'name')[1] for p in walk(s,'pin')} for k,s in defs.items()}
defs={k:v for k,v in defs.items() if not k.startswith('PWR_')}
def fx(size=1.27,hide=False):return f'(effects (font (size {size} {size}))'+(' (hide yes)' if hide else '')+')'
def g(v):return round(v*2.54,6)
def poly(pts):return '(polyline (pts '+''.join(f'(xy {g(x)} {g(y)})' for x,y in pts)+') (stroke (width .254) (type default)) (fill (type none)))'
def circle(x,y,r,fill='none'):return f'(circle (center {g(x)} {g(y)}) (radius {g(r)}) (stroke (width .254) (type default)) (fill (type {fill})))'
def custom(kind,rows,graphics,box=None):
 ps=[]
 for n,x,y,a,typ,*extra in rows:
  hide=bool(extra and extra[0]);pname=oldpins[kind][str(n)]
  ps.append(f'(pin {typ} line (at {g(x)} {g(y)} {a}) (length {g(1)})'+(' (hide yes)' if hide else '')+f' (name {q(pname)} {fx(1.0)}) (number {q(n)} {fx(1.0)}))')
 if box:
  w,top=box[:2];bottom=box[2] if len(box)==3 else top;graphics=f'(rectangle (start {g(-w)} {g(top)}) (end {g(w)} {g(-bottom)}) (stroke (width .254) (type default)) (fill (type none)))'+graphics
 s=f'(symbol {q(kind)} (pin_names (offset .508)) (in_bom yes) (on_board yes) (property "Reference" "U" (at 0 0 0) {fx()}) (property "Value" {q(kind)} (at 0 0 0) {fx()}) (symbol {q(kind+"_0_1")} {graphics}) (symbol {q(kind+"_1_1")} {"".join(ps)}))'
 defs[kind]=sx.loads(s)
 assert {one(p,'number')[1]:one(p,'name')[1] for p in walk(defs[kind],'pin')}==oldpins[kind]
# SMAJ54A is unidirectional: replace the former bidirectional TVS artwork.
# Pad numbers and nets stay fixed; pin 1 is the banded cathode, pin 2 the anode.
oldpins['D']={'1':'K','2':'A'}
tvs=poly([(-.5,0),(.5,.5),(.5,-.5),(-.5,0)])+poly([(-.75,.6),(-.5,.6),(-.5,-.6),(-.25,-.6)])
custom('D',[(1,-1.5,0,0,'passive'),(2,1.5,0,180,'passive')],tvs)
defs['D'].append([sx.Symbol('pin_numbers'),sx.Symbol('hide')])
custom('LMG2100R044RARR',[(7,-7,3,0,'power_in'),(14,-7,6.5,0,'power_in'),(12,-7,0,0,'input'),(13,-7,-3,0,'input'),(10,7,5,180,'passive'),(11,7,3,180,'passive'),(5,7,1,180,'output'),(15,-2,-8,90,'power_in'),(6,2,-8,90,'power_in'),(17,2,-8,90,'passive',True)]+[(n,-3+i,0,90,'no_connect',True) for i,n in enumerate([1,2,3,4,8,9,16])],'',box=(6,7))
custom('UCC25600DR',[(1,-4,-8,90,'passive'),(2,-10,-5,0,'passive'),(3,-10,2,0,'input'),(4,5,-8,90,'passive'),(7,0,8,270,'power_in'),(6,-7,-8,90,'power_in'),(8,10,3,180,'output'),(5,10,-3,180,'output')],'',box=(9,7))
custom('UCC24624DR',[(1,-7,7.5,0,'output'),(4,-7,12.5,0,'input'),(6,-7,-2.5,0,'input'),(8,-7,-7.5,0,'output'),(7,7,12,180,'power_in'),(3,7,-3,180,'power_out'),(2,0,-9.5,90,'power_in'),(5,0,-9.5,90,'passive',True)],'',box=(6,14,8.5))
custom('LM5164DDAR',[(2,-7,6,0,'power_in'),(3,-7,-2,0,'input'),(4,-7,2,0,'passive'),(7,7,6,180,'passive'),(8,7,2,180,'output'),(5,7,-3,180,'input'),(6,7,-7,180,'open_collector'),(1,0,-9,90,'power_in'),(9,0,-9,90,'passive',True)],'',box=(6,8))
custom('TPS7A2450DBVR',[(1,-5,0,0,'power_in'),(3,-5,0,0,'input',True),(2,0,-3.5,90,'power_in'),(5,5,0,180,'power_out'),(4,2,0,180,'no_connect',True)],'',box=(4,2.5))
# Conventional MOSFET drawing. Multi-pad drain/source pins stack electrically.
mos=poly([(0,3),(0,2),(1.5,2),(1.5,-2),(0,-2),(0,-3)])+poly([(4,0),(2.5,0),(2.5,2),(2.5,-2)])
mos+=poly([(0,-2),(-1.5,-2),(-1.5,2),(0,2)])+poly([(-2.3,-.5),(-.7,-.5),(-1.5,.7),(-2.3,-.5)])+poly([(-2.3,.7),(-.7,.7)])
mos+=poly([(1.5,-1),(2,-.5),(2,-1.5),(1.5,-1)])
custom('CSD18543Q3A',[(4,5,0,180,'input')]+[(n,0,-4,90,'passive',n!=1) for n in [1,2,3]]+[(n,0,4,270,'passive',n!=5) for n in [5,6,7,8,9]],mos)
# Recognizable two-primary / center-tapped secondary transformer.
tr=poly([(-.7,7),(-.7,-7)])+poly([(.7,7),(.7,-7)])
for x,side in [(-3,-1),(3,1)]:
 pts=[]
 for i in range(4):
  for j in range(13):
   t=j*math.pi/12;pts.append((x+side*math.sin(t),6-i*3-3*j/12))
 tr+=poly(pts)
tr+=poly([(-6,6),(-3,6)])+poly([(-6,-6),(-3,-6)])+poly([(3,6),(6,6)])+poly([(3,0),(6,0)])+poly([(3,-6),(6,-6)])+circle(-4.3,5,.25,'outline')+circle(4.3,5,.25,'outline')
custom('Planar_4_2_2',[(1,-7,6,0,'passive'),(2,-7,-6,0,'passive'),(3,7,6,180,'passive'),(4,7,0,180,'passive'),(5,7,-6,180,'passive'),(6,0,0,0,'no_connect',True)],tr)
# TL431: cathode up, anode down, reference left.
tl=poly([(0,2),(2,-1),(-2,-1),(0,2)])+poly([(-2,2),(2,2)])+poly([(-3,0),(-1,0)])+poly([(0,-1),(0,-2)])
custom('TL431AIDBZR',[(1,0,3,270,'passive'),(2,-4,0,0,'input'),(3,0,-3,90,'passive')],tl)
op=poly([(-4,2),(-2,2),(-3,0),(-4,2)])+poly([(-4,0),(-2,0)])+poly([(-3,0),(-3,-2)])+poly([(2,2),(2,-2)])+poly([(2,1),(4,2),(4,3)])+poly([(2,-1),(4,-2),(4,-3)])+poly([(3.0,-1.4),(3.8,-1.9),(2.9,-1.9),(3.0,-1.4)])+poly([(0,1),(1,0),(.3,0)])+poly([(0,-1),(1,-2),(.3,-2)])
custom('EL357N',[(1,-5,3,0,'passive'),(2,-5,-3,0,'passive'),(4,5,3,180,'passive'),(3,5,-3,180,'passive')],op+poly([(-4,3),(-3,3),(-3,2)])+poly([(-4,-3),(-3,-3),(-3,-2)]),box=(4,4))
dd=poly([(-4,0),(-3,0),(-3,1),(-1,0),(-3,-1),(-3,0)])+poly([(-1,-1),(-1,1)])+poly([(-1,0),(1,0),(1,1),(3,0),(1,-1),(1,0)])+poly([(3,-1),(3,1)])+poly([(3,0),(4,0)])+poly([(0,0),(0,2)])
custom('BAT54SLT1G',[(1,-5,0,0,'passive'),(2,5,0,180,'passive'),(3,0,3,270,'passive')],dd)
custom('Power_Port',[(2,3,1,180,'passive'),(1,3,-1,180,'passive')],poly([(-1,-2),(2,-2),(2,2),(-1,2),(-1,-2)])+circle(0,1,.4)+circle(0,-1,.4)+poly([(0,1),(2,1)])+poly([(0,-1),(2,-1)]))
for k in ['D','CSD18543Q3A','TL431AIDBZR','Planar_4_2_2','Power_Port','BAT54SLT1G','EL357N']:
 one(defs[k],'pin_names').append([sx.Symbol('hide'),sx.Symbol('yes')])
elements=[];ends={};wiresegs=[];labels=[];powers=set();placed=set();serial=0
def prop(k,v,x,y,hide=False,left=False,angle=0):return f'(property {q(k)} {q(v)} (at {g(x)} {g(y)} {angle}) (effects (font (size 1.27 1.27))'+(' (justify left)' if left else '')+(' (hide yes)' if hide else '')+'))'
def text(t,x,y,size=1.27,bold=False):elements.append(f'(text {q(t)} (at {g(x)} {g(y)} 0) (effects (font (size {size} {size})'+(' (bold yes)' if bold else '')+f') (justify left)) (uuid {uid("txt"+t+str(x)+str(y))}))')
def box(x,y,w,h,title):
 elements.append('(polyline (pts '+''.join(f'(xy {g(a)} {g(b)})' for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)])+f') (stroke (width .254) (type default) (color 80 110 140 1)) (fill (type none)) (uuid {uid(title)}))');text(title,x+1.5,y+2,1.8,True)
def sym(ref,x,y,rot=0,txt=None,value=None,mirror=None):
 p=parts[ref];k=p['kind'];placed.add(ref);ps=walk(defs[k],'pin')
 if value:p['value']=value
 if k=='C' and '/' in p['value']:
  p['value'],p['Voltage']=p['value'].split('/',1)
 if txt is None:
  if k=='C' and rot%180:txt=(x,y-4.5,x,y-3,False)
  elif k in ['R','C','L','F','D']:txt=(x+1.5,y-.6,x+1.5,y+.7,True) if rot==0 else (x,y-3,x,y-1.6,False)
  else:txt=(x,y-11,x,y-9.6,False)
 rx,ry,vx,vy,left=txt
 properties=prop('Reference',ref,rx,ry,left=left,angle=rot%180)+prop('Value',value or p['value'],vx,vy,hide=ref.startswith('TP'),left=left,angle=rot%180)
 if k=='C':properties+=prop('Voltage',p.get('Voltage',''),vx,vy+1.3,left=left,angle=rot%180)
 for key,field in [('Footprint','footprint'),('Datasheet','source'),('MPN','mpn'),('Manufacturer','mfr'),('LCSC','lcsc'),('Design_note','note')]:properties+=prop(key,p[field],x,y,True)
 elements.append(f'(symbol (lib_id "PS:{k}") (at {g(x)} {g(y)} {rot}) {("(mirror "+mirror+")") if mirror else ""} (unit 1) (in_bom {"no" if ref=="T1" or ref.startswith("TP") else "yes"}) (on_board yes) (dnp no) (uuid {p["uuid"]}) {properties} '+''.join(f'(pin {q(one(t,"number")[1])} (uuid {uid(ref+str(one(t,"number")[1]))}))' for t in ps)+f'(instances (project "{NAME}" (path "/{data["root_uuid"]}" (reference "{ref}") (unit 1)))))')
 for t in ps:
  n=one(t,'number')[1];xx,yy,a=one(t,'at')[1:4];theta=math.radians(rot)
  if mirror=='y':xx=-xx
  if mirror=='x':yy=-yy
  pt=(round(x+(xx*math.cos(theta)-yy*math.sin(theta))/2.54,6),round(y-(xx*math.sin(theta)+yy*math.cos(theta))/2.54,6));ends[(ref,n)]=pt
  if p['nets'][n] is None and str(t[1])!='no_connect':elements.append(f'(no_connect (at {g(pt[0])} {g(pt[1])}) (uuid {uid(ref+n+"nc")}))')
def pin(ref,n):return ends[(ref,str(n))]
def wire(net,*pts):
 pts=[pin(*p) if isinstance(p[0],str) else p for p in pts]
 for a,b in zip(pts,pts[1:]):
  if a==b:continue
  assert abs(a[0]-b[0])<1e-5 or abs(a[1]-b[1])<1e-5,(net,a,b)
  wiresegs.append((net,a,b))
def label(net,x,y,angle=0):
 labels.append((net,(x,y)));elements.append(f'(label {q(net)} (at {g(x)} {g(y)} {angle}) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid {uid("label"+net+str(x)+str(y))}))')
def power(net,x,y,ground=False):
 k='PWR_'+net
 if k not in defs:
  gr=poly([(0,0),(0,-1),(-1,-1),(1,-1)])+poly([(-.7,-1.4),(.7,-1.4)])+poly([(-.3,-1.8),(.3,-1.8)]) if ground else poly([(0,0),(0,2),(-.6,1.3),(0,2),(.6,1.3)])
  defs[k]=sx.loads(f'(symbol {q(k)} (power) (pin_names (offset 0)) (in_bom no) (on_board yes) (property "Reference" "#PWR" (at 0 0 0) {fx(hide=True)}) (property "Value" {q(net)} (at 0 0 0) {fx()}) (symbol {q(k+"_0_1")} {gr}) (symbol {q(k+"_1_1")} (pin power_in line (at 0 0 90) (length 0) (hide yes) (name {q(net)} {fx()}) (number "1" {fx()}))))')
  # GND's graphical local Y is negative so it always points down on the page.
 ref='#PWR'+str(len(powers)+1);powers.add((net,x,y));value_y=y+2.8 if ground else y-2.8
 elements.append(f'(symbol (lib_id "PS:{k}") (at {g(x)} {g(y)} 0) (unit 1) (in_bom no) (on_board yes) (dnp no) (uuid {uid(ref)}) {prop("Reference",ref,x,y,True)} {prop("Value",net,x,value_y)} (pin "1" (uuid {uid(ref+"pin")})) (instances (project "{NAME}" (path "/{data["root_uuid"]}" (reference {q(ref)}) (unit 1)))))')
def ground(net,ref,n,y=None):
 a=pin(ref,n);b=(a[0],y if y is not None else a[1]+1);wire(net,a,b);power(net,*b,True)
def flag(net,x,y,i):
 k='Flag';ref='#FLG'+str(i);elements.append(f'(symbol (lib_id "PS:{k}") (at {g(x)} {g(y)} 0) (unit 1) (in_bom no) (on_board yes) (dnp no) (uuid {uid(ref)}) {prop("Reference",ref,x,y,True)} {prop("Value","PWR_FLAG",x,y-1.8,True)} (pin "1" (uuid {uid(ref+"pin")})) (instances (project "{NAME}" (path "/{data["root_uuid"]}" (reference {q(ref)}) (unit 1)))))')
def bank(refs,xs,y,top,bottom,plus,minus,ground_x=None):
 for ref,x in zip(refs,xs):sym(ref,x,y);wire(plus,(x,top),(ref,'1'));wire(minus,(ref,'2'),(x,bottom))
 wire(plus,*[(x,top) for x in xs]);wire(minus,*[(x,bottom) for x in xs]);power(minus,xs[0] if ground_x is None else ground_x,bottom,True)

text('PS-GAN-60W',5,4,3.5,True);text('48 V nominal → isolated 12 V / 5 A target   |   A6 schematic · A4 hardware',42,4,1.8)
text('PGND: input return   /   SGND: isolated output return   /   AGND: controller return (joins PGND inside U1)',42,7,1.15)
box(5,9,155,36,'01  PLANAR POWER PATH')
sym('J1',9,25,txt=(9,19.5,9,21,False),value='48 V INPUT')
sym('F1',18,24,txt=(18,20,18,21.5,False))
wire('VIN_RAW',('J1','2'),('F1','1'));label('VIN_RAW',13,24)
wire('PGND',('J1','1'),(9,26),(9,28));power('PGND',9,28,True)
wire('VIN',('F1','2'),(24,24),(24,26));power('VIN',24,24)
bank(['C1','C2','C3'],[14,21,28],31,26,36,'VIN','PGND')
wire('VIN',(28,26),(40,26))
sym('D1',35,31,rot=270,txt=(32.5,28,32.5,29.5,False))
wire('VIN',(35,26),('D1','1'));wire('PGND',('D1','2'),(35,36),(28,36))
sym('U1',47,29,txt=(47,19,47,20.5,False),value='LMG2100R044')
bank(['C5','C6'],[29,35],17,14,20,'V5','AGND',ground_x=35)
wire('V5',(35,14),(40,14),('U1','14'));power('V5',40,14)
ground('AGND','U1','15',40);ground('PGND','U1','6',40)
for net,n,y in [('HI','12',29),('LI','13',32)]:wire(net,(38,y),('U1',n));label(net,38,y)
sym('C4',58,25,txt=(58,18,58,19.5,False));wire('HB',('U1','10'),('C4','1'));wire('SW',('U1','5'),(62,28));wire('HS_LOCAL',('C4','2'),('U1','11'))
sym('L1',63,28,90);sym('T1',77,28,txt=(77,16.5,77,18,False),value='4 : 2 : 2  /  ELP22')
wire('PRI_A',('L1','2'),(67,28),(67,22),('T1','1'))
bank(['C7','C8'],[62,70],38,35,41,'TANK_C','PGND');wire('TANK_C',('T1','2'),(70,35),(62,35));label('TANK_C',62,35)
for ref,x,y in [('Q1',94,21),('Q2',94,36)]:sym(ref,x,y,txt=(100,y-3.5,100,y-2,False),value='CSD18543Q3A');ground('SGND',ref,'1',y+5)
wire('SEC_A',('T1','3'),(87,22),(87,16),(94,16),('Q1','5'))
wire('SEC_B',('T1','5'),(87,34),(87,31),(94,31),('Q2','5'))
wire('VOUT',('T1','4'),(85,28),(85,13.5),(149,13.5),(149,27),(132,27));power('VOUT',139,13.5)
sym('U3',118,28.5,txt=(118,10.5,118,12,False),value='UCC24624')
for r,y,net1,net2,qref,pn in [('R10',21,'VG1','SR_G1','Q1','1'),('R11',36,'VG2','SR_G2','Q2','8')]:
 sym(r,108,y,270);wire(net2,(qref,'4'),(r,'2'));wire(net1,(r,'1'),('U3',pn))
for r,y,net,vs,pn in [('R12',16,'SEC_A','VS1','4'),('R13',31,'SEC_B','VS2','6')]:
 sym(r,108,y,90,txt=(108,y-5.5,108,y-4,False) if r=='R12' else None);wire(vs,(r,'2'),('U3',pn))
wire('SEC_A',(94,16),('R12','1'))
wire('SEC_B',(94,31),('R13','1'))
sym('C12',130,21);wire('VOUT',('U3','7'),(130,16.5),('C12','1'));wire('VOUT',(130,16.5),(130,13.5));ground('SGND','C12','2',23)
sym('C11',127,36);wire('SR_REG',('U3','3'),(127,31.5),('C11','1'));ground('SGND','C11','2',39);ground('SGND','U3','2',40)
bank(['C13','C14','C15','C16'],[132,139,146,153],33,27,38,'VOUT','SGND',ground_x=143)
sym('J2',155,20,txt=(155,15.5,155,17,False),value='12 V / 5 A',mirror='y')
wire('VOUT',('J2','2'),(149,19));wire('SGND',('J2','1'),(152,22));power('SGND',152,22,True)
sym('TP1',31,23,txt=(33,24,33,25.5,False));wire('VIN',('TP1','1'),(31,26))
sym('TP2',17,36,txt=(17,38.5,17,40,False))
sym('TP3',157,27,txt=(157,23,157,24.5,False));wire('VOUT',(153,27),('TP3','1'))
sym('TP4',157,38,txt=(157,40.5,157,42,False));wire('SGND',(153,38),('TP4','1'))
sym('TP5',44,18,txt=(46,16.5,46,18,False));wire('V5',(40,18),('TP5','1'))
sym('TP6',26,20,txt=(26,16.5,26,18,False));wire('AGND',(22,20),('TP6','1'),(29,20))
text('Primary midpoint is internal copper.',77,39,1.0);text('Functional isolation only.',77,41,1.0)

box(5,47,75,35,'02  FREQUENCY CONTROL')
sym('U2',49,63,txt=(55,51,55,52.5,False),value='UCC25600')
# One continuous bias rail supplies the controller and its decoupling.
sym('C10',36,53)
wire('BIAS12',('U2','7'),(49,51),(36,51),('C10','1'));power('BIAS12',49,51)
ground('AGND','C10','2',55);ground('AGND','U2','6',74)
# Current sensing flows left-to-right directly into OC, above the timing network.
sym('C17',12,55,90);sym('R8',17,55,90,txt=(17,50.5,17,52,False))
wire('TANK_C',(8,55),('C17','1'));label('TANK_C',8,55)
wire('CS_AC',('C17','2'),('R8','1'))
sym('D2',20,61,txt=(24,56,24,57.5,False),value='BAT54S')
wire('CS_RECT',('R8','2'),(20,55),('D2','3'))
wire('AGND',('D2','1'),(14,61),(14,64));power('AGND',14,64,True)
sym('R9',28,65);sym('C18',34,65)
wire('OC',('D2','2'),('U2','3'))
wire('OC',(28,61),('R9','1'));wire('OC',(34,61),('C18','1'))
wire('AGND',('R9','2'),(28,68),(34,68),('C18','2'));power('AGND',28,68,True)
# Frequency setting, feedback injection and soft start occupy separate branches.
sym('R2',32,77);sym('R3',22,73,270)
wire('RT',('U2','2'),(36,68),(36,73),(32,73),('R2','1'))
wire('RT',(32,73),('R3','1'));ground('AGND','R2','2',78)
wire('FB_COL',('R3','2'),(16,73));label('FB_COL',16,73)
sym('R1',45,76);wire('DT',('U2','1'),('R1','1'));ground('AGND','R1','2',78)
sym('C9',54,76);wire('SS',('U2','4'),('C9','1'));ground('AGND','C9','2',78)
wire('SS',(54,73),(58,73));label('SS',58,73)
for r,sh,y,gd,logic,pn in [('R4','R5',60,'GD1','HI','8'),('R6','R7',68,'GD2','LI','5')]:
 sym(r,65,y,90);sym(sh,71,y+3)
 py=pin('U2',pn)[1];wire(gd,('U2',pn),(61,py),(61,y),(r,'1'))
 wire(logic,(r,'2'),(76,y));wire(logic,(71,y),(sh,'1'))
 ground('AGND',sh,'2',y+4);label(logic,76,y)
text('12 V drive → ~3.7 V logic',62,79,1.0)

box(82,47,78,35,'03  LOCAL BIAS · 12 V + 5 V')
sym('U4',106,63,txt=(106,51,106,52.5,False),value='LM5164')
sym('C19',86,57,txt=(84,56.4,84,57.7,False));wire('VIN',(86,53),(97,53),(97,57),('U4','2'))
wire('VIN',(86,53),('C19','1'));power('VIN',95,53);ground('PGND','C19','2',61)
sym('R14',89,62);sym('R15',89,73)
wire('VIN',(89,53),('R14','1'));wire('BIAS_EN',('R14','2'),(89,67),('R15','1'))
wire('BIAS_EN',(89,67),(97,67),(97,65),('U4','3'));ground('PGND','R15','2',75)
sym('R16',97,61,90)
wire('PGND',('R16','1'),(95,61),(95,62.5));power('PGND',95,62.5,True)
wire('RON',('R16','2'),('U4','4'));ground('PGND','U4','1',75)
sym('C20',116,59,txt=(117.5,57,117.5,58.5,True))
wire('BIAS_BST',('U4','7'),(116,57),('C20','1'))
wire('BIAS_SW',('C20','2'),(116,61))
sym('L2',125,61,90)
wire('BIAS_SW',('U4','8'),('L2','1'))
wire('BIAS12',('L2','2'),(146,61),(146,67))
power('BIAS12',143,61)
bank(['C21','C22'],[134,141],66,61,71,'BIAS12','PGND',ground_x=137)
sym('R17',126,66);sym('R18',126,76)
wire('BIAS12',(126,61),('R17','1'))
wire('BIAS_FB',('R17','2'),(126,72),('R18','1'))
wire('BIAS_FB',('U4','5'),(118,66),(118,72),(126,72))
ground('PGND','R18','2',78)
# Ripple-injection network is wired across the inductor and into FB.
# Its one plain wire crossing has no junction dot and joins different nets.
sym('R19',125,52,90,txt=(125,48.5,125,50,False));sym('C23',139,52,90)
sym('C24',131,55)
wire('BIAS_SW',(121,61),(121,52),('R19','1'))
wire('RIPPLE',('R19','2'),('C23','1'));wire('RIPPLE',(131,52),('C24','1'))
wire('BIAS12',('C23','2'),(146,52),(146,61))
wire('BIAS_FB',('C24','2'),(131,70),(126,70))
# The 5 V regulator shares the continuous BIAS12 rail; no local label island.
sym('U5',152,67,txt=(152,60.5,152,62,False),value='TPS7A2450')
sym('C25',146,74,txt=(143,74,143,75.5,False));sym('C26',158,74,txt=(154.5,74,154.5,75.5,False))
wire('BIAS12',(146,67),('U5','1'));wire('BIAS12',(146,67),('C25','1'))
wire('V5',('U5','5'),(158,67),('C26','1'));power('V5',158,67)
wire('AGND',('U5','2'),(152,78),(158,78),('C26','2'))
wire('AGND',(152,78),(146,78),('C25','2'));power('AGND',150,78,True)

box(5,84,75,29,'04  ISOLATED FEEDBACK · 12.05 V')
box(82,84,78,29,'05  OUTPUT OV PROTECTION · 13.27 V')
def feedback(off,ov=False):
 u='U8' if ov else 'U6';t='U9' if ov else 'U7';ra,rb,rc,rd=('R25','R26','R27','R28') if ov else ('R20','R21','R22','R23');led,k,ref=('OV_LED','OV_K','OV_REF') if ov else ('FB_LED','FB_K','VREF');out='SS' if ov else 'FB_COL'
 sym(u,54+off,96,txt=(54+off,89,54+off,90.5,False),value='EL357N');sym(t,45+off,105,txt=(48+off,104,48+off,105.5,True),value='TL431A')
 sym(ra,49+off,90,txt=(46+off,89.4,46+off,90.7,False))
 for r,x,y in [(rb,44,96),(rc,24,95),(rd,24,108)]:sym(r,x+off,y)
 wire('VOUT',(24+off,88),(49+off,88),(ra,'1'));wire('VOUT',(24+off,88),(rc,'1'));wire('VOUT',(49+off,88),(70+off,88));power('VOUT',70+off,88)
 wire(led,(ra,'2'),(u,'1'));wire(led,(u,'1'),(44+off,93),(rb,'1'))
 wire(k,(rb,'2'),(44+off,99),(49+off,99),(u,'2'));wire(k,(45+off,99),(t,'1'))
 mid=104 if ov else 106
 wire(ref,(rc,'2'),(24+off,mid),(rd,'1'));wire(ref,(24+off,mid),(38+off,mid),(38+off,105),(t,'2'))
 ground('SGND',rd,'2',109.5);ground('SGND',t,'3',109)
 wire(out,(u,'4'),(67+off,93));label(out,67+off,93);ground('AGND',u,'3',102)
 if ov:
  sym('C29',33+off,107);wire(ref,(33+off,104),('C29','1'));wire('SGND',('C29','2'),(33+off,109.5),(24+off,109.5))
 else:
  sym('R24',33,100);sym('C27',33,103);sym('C28',39,102,txt=(40.5,100,40.5,101.3,True))
  wire(k,(44,99),(33,99),('R24','1'));wire('COMP',('R24','2'),('C27','1'));wire(ref,('C27','2'),(33,106));wire(k,(39,99),('C28','1'));wire(ref,('C28','2'),(39,105))
 pass  # Ground domains are described once in the common page legend.
feedback(0);feedback(78,True)
text('UNBUILT · Functional isolation only · Verify magnetics, switching, no-load operation and thermal limits before release.',5,115,1.15)

# Only cross-section signals and useful power-path nodes carry visible labels.
# KiCad names local internal nodes from their connected pins; net-aliases.json
# preserves the stable circuit-manifest names for routing and audit tools.
label('SW',55,28)
# Split all wires at contacts. Reject four-way connected crossings explicitly.
def on(p,a,b):return min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6 and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6 and abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-6
flag_nodes=[('VIN',22,24),('PGND',19,36),('AGND',22,20),('VOUT',143,13.5),('SGND',150,38),('BIAS12',145,61)]
contacts={(x,y) for n,x,y in flag_nodes}|{a for n,a,b in wiresegs}|{b for n,a,b in wiresegs}|set(ends.values())|{p for n,p in labels}|{(x,y) for n,x,y in powers}
segments=set()
for net,a,b in wiresegs:
 ps=sorted((p for p in contacts if on(p,a,b)),key=lambda p:(p[0]-a[0])**2+(p[1]-a[1])**2)
 for p1,p2 in zip(ps,ps[1:]):segments.add((net,*sorted([p1,p2])))
degrees={}
for n,a,b in sorted(segments):
 for p1,p2 in [(a,b),(b,a)]:degrees.setdefault((n,p1),set()).add((round(p2[0]-p1[0],6)>0)-(round(p2[0]-p1[0],6)<0) if p1[1]==p2[1] else 2*((p2[1]>p1[1])-(p2[1]<p1[1])))
 color=next((c for ns,c in [(['VIN','VIN_RAW'],'165 88 18'),(['SW','PRI_A','TANK_C'],'160 66 40'),(['VOUT','SEC_A','SEC_B'],'20 110 145'),(['HI','LI','GD1','GD2'],'112 75 150'),(['PGND','SGND','AGND'],'90 110 102'),(['BIAS12','V5'],'100 100 140')] if n in ns),'30 125 60')
 elements.append(f'(wire (pts (xy {g(a[0])} {g(a[1])}) (xy {g(b[0])} {g(b[1])})) (stroke (width .1524) (type default) (color {color} 1)) (uuid {uid("wire"+str((n,a,b)))}))')
four=[(n,p) for (n,p),v in degrees.items() if len(v)>3]
assert not four, four
for (n,p),v in degrees.items():
 if len(v)>=3:elements.append(f'(junction (at {g(p[0])} {g(p[1])}) (diameter .762) (color 0 0 0 0) (uuid {uid("junction"+str(p))}))')
for i,(n,x,y) in enumerate(flag_nodes):flag(n,x,y,i)
assert placed==set(parts),(set(parts)-placed,placed-set(parts))
for k,s in defs.items():
 s[1]='PS:'+k
root=f'(kicad_sch (version 20250114) (generator "eeschema") (uuid {data["root_uuid"]}) (paper "A3") (title_block (title "PS-GAN-60W: planar LLC converter") (date "2026-10-10") (rev "A6-schematic") (company "Planar Studio")) (lib_symbols {"".join(sx.dumps(s) for s in defs.values())}) {"".join(elements)} (embedded_fonts no))'
(CAD/(NAME+'.kicad_sch')).write_text(root,encoding='utf8')
for k,s in defs.items():s[1]=k
(CAD/'PS.kicad_sym').write_text('(kicad_symbol_lib (version 20250114) (generator "kicad_symbol_editor") '+''.join(sx.dumps(s) for s in defs.values())+')',encoding='utf8')
(R/'evidence/schematic-geometry.json').write_text(json.dumps({'revision':'A6','four_way_connections':four,'wire_segments':len(segments),'placed_parts':len(placed),'symbol_pin_identities_preserved':True},indent=2),encoding='utf8')
(R/'circuit.json').write_text(json.dumps(data,indent=2),encoding='utf8')
print('Schematic saved:',len(placed),'parts;',len(segments),'wire segments; four-way:',four)
