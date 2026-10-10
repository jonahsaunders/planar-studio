"""A2 revision: wired functional schematic, on a compact A3 sheet."""
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
  w,h=box;graphics=f'(rectangle (start {g(-w)} {g(h)}) (end {g(w)} {g(-h)}) (stroke (width .254) (type default)) (fill (type background)))'+graphics
 s=f'(symbol {q(kind)} (pin_names (offset .508)) (in_bom yes) (on_board yes) (property "Reference" "U" (at 0 0 0) {fx()}) (property "Value" {q(kind)} (at 0 0 0) {fx()}) (symbol {q(kind+"_0_1")} {graphics}) (symbol {q(kind+"_1_1")} {"".join(ps)}))'
 defs[kind]=sx.loads(s)
 assert {one(p,'number')[1]:one(p,'name')[1] for p in walk(defs[kind],'pin')}==oldpins[kind]
custom('LMG2100R044RARR',[(7,-7,5,0,'power_in'),(14,-7,6.5,0,'power_in'),(12,-7,0,0,'input'),(13,-7,-3,0,'input'),(10,7,5,180,'passive'),(11,7,1,180,'passive',True),(5,7,1,180,'output'),(15,-2,-9,90,'power_in'),(6,2,-9,90,'power_in'),(17,2,-9,90,'passive',True)]+[(n,-3+i,0,90,'no_connect',True) for i,n in enumerate([1,2,3,4,8,9,16])],'',box=(6,7))
custom('UCC25600DR',[(1,-7,3,0,'passive'),(2,-7,0,0,'passive'),(3,-7,-3,0,'input'),(4,-7,-6,0,'passive'),(7,-7,6,0,'power_in'),(6,0,-9,90,'power_in'),(8,7,3,180,'output'),(5,7,-3,180,'output')],'',box=(6,7))
custom('UCC24624DR',[(1,-7,7.5,0,'output'),(4,-7,2.5,0,'input'),(6,-7,-2.5,0,'input'),(8,-7,-7.5,0,'output'),(7,0,10,270,'power_in'),(3,7,-3,180,'power_out'),(2,0,-10,90,'power_in'),(5,0,-10,90,'passive',True)],'',box=(6,8.5))
custom('LM5164DDAR',[(2,-7,6,0,'power_in'),(3,-7,2,0,'input'),(4,-7,-2,0,'passive'),(7,7,6,180,'passive'),(8,7,2,180,'output'),(5,7,-3,180,'input'),(6,7,-7,180,'open_collector'),(1,0,-9,90,'power_in'),(9,0,-9,90,'passive',True)],'',box=(6,8))
custom('TPS7A2450DBVR',[(1,-5,0,0,'power_in'),(3,-5,0,0,'input',True),(2,0,-4,90,'power_in'),(5,5,0,180,'power_out'),(4,2,0,180,'no_connect',True)],'',box=(4,2.5))
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
op=poly([(-4,2),(-2,2),(-3,0),(-4,2)])+poly([(-4,0),(-2,0)])+poly([(-3,0),(-3,-2)])+poly([(2,2),(2,-2)])+poly([(2,1),(4,2),(4,3)])+poly([(2,-1),(4,-2),(4,-3)])+poly([(0,1),(1,0),(.3,0)])+poly([(0,-1),(1,-2),(.3,-2)])
custom('EL357N',[(1,-5,3,0,'passive'),(2,-5,-3,0,'passive'),(4,5,3,180,'passive'),(3,5,-3,180,'passive')],op+poly([(-4,3),(-3,3),(-3,2)])+poly([(-4,-3),(-3,-3),(-3,-2)]),box=(4,4))
dd=poly([(-4,0),(-3,0),(-3,1),(-1,0),(-3,-1),(-3,0)])+poly([(-1,-1),(-1,1)])+poly([(-1,0),(1,0),(1,1),(3,0),(1,-1),(1,0)])+poly([(3,-1),(3,1)])+poly([(3,0),(4,0)])+poly([(0,0),(0,2)])
custom('BAT54SLT1G',[(1,-5,0,0,'passive'),(2,5,0,180,'passive'),(3,0,3,270,'passive')],dd)
custom('Power_Port',[(2,3,1,180,'passive'),(1,3,-1,180,'passive')],poly([(-1,-2),(2,-2),(2,2),(-1,2),(-1,-2)])+circle(0,1,.4)+circle(0,-1,.4)+poly([(0,1),(2,1)])+poly([(0,-1),(2,-1)]))
for k in ['CSD18543Q3A','TL431AIDBZR','Planar_4_2_2','Power_Port','BAT54SLT1G']:
 one(defs[k],'pin_names').append([sx.Symbol('hide'),sx.Symbol('yes')])
elements=[];ends={};wiresegs=[];labels=[];powers=set();placed=set();serial=0
def prop(k,v,x,y,hide=False,left=False,angle=0):return f'(property {q(k)} {q(v)} (at {g(x)} {g(y)} {angle}) (effects (font (size 1.27 1.27))'+(' (justify left)' if left else '')+(' (hide yes)' if hide else '')+'))'
def text(t,x,y,size=1.27,bold=False):elements.append(f'(text {q(t)} (at {g(x)} {g(y)} 0) (effects (font (size {size} {size})'+(' (bold yes)' if bold else '')+f') (justify left)) (uuid {uid("txt"+t+str(x)+str(y))}))')
def box(x,y,w,h,title):
 elements.append('(polyline (pts '+''.join(f'(xy {g(a)} {g(b)})' for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)])+f') (stroke (width .254) (type default) (color 80 110 140 1)) (fill (type none)) (uuid {uid(title)}))');text(title,x+1.5,y+2,1.8,True)
def sym(ref,x,y,rot=0,txt=None,value=None):
 p=parts[ref];k=p['kind'];placed.add(ref);ps=walk(defs[k],'pin')
 if value:p['value']=value
 if txt is None:
  if k in ['R','C','L','F','D']:txt=(x+1.5,y-.6,x+1.5,y+.7,True) if rot==0 else (x,y-3,x,y-1.6,False)
  else:txt=(x,y-11,x,y-9.6,False)
 rx,ry,vx,vy,left=txt
 properties=prop('Reference',ref,rx,ry,left=left,angle=rot%180)+prop('Value',value or p['value'],vx,vy,left=left,angle=rot%180)
 for key,field in [('Footprint','footprint'),('Datasheet','source'),('MPN','mpn'),('Manufacturer','mfr'),('LCSC','lcsc'),('Design_note','note')]:properties+=prop(key,p[field],x,y,True)
 elements.append(f'(symbol (lib_id "PS:{k}") (at {g(x)} {g(y)} {rot}) (unit 1) (in_bom {"no" if ref=="T1" or ref.startswith("TP") else "yes"}) (on_board yes) (dnp no) (uuid {p["uuid"]}) {properties} '+''.join(f'(pin {q(one(t,"number")[1])} (uuid {uid(ref+str(one(t,"number")[1]))}))' for t in ps)+f'(instances (project "{NAME}" (path "/{data["root_uuid"]}" (reference "{ref}") (unit 1)))))')
 for t in ps:
  n=one(t,'number')[1];xx,yy,a=one(t,'at')[1:4];theta=math.radians(rot)
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

text('PS-GAN-60W',5,4,3.5,True);text('48 V nominal → isolated 12 V / 5 A target   |   A2 engineering prototype',42,4,1.8)
box(5,9,155,36,'01  PLANAR POWER PATH')
sym('J1',9,21,txt=(9,16,9,17.5,False),value='48 V INPUT');sym('F1',18,20,txt=(18,17,18,18.5,False))
# Fuse_Small is horizontal in its native symbol.
wire('VIN_RAW',('J1','2'),('F1','1'));wire('PGND',('J1','1'),(10,22),(10,23));power('PGND',10,23,True)
wire('VIN',('F1','2'),(21,20),(21,22),(38,22),(38,24),(40,24));label('VIN_RAW',13,20)
bank(['C1','C2','C3'],[12,19,26],30,24,35,'VIN','PGND');wire('VIN',(12,24),(38,24));power('VIN',22,24)
sym('D1',34,30,rot=270,txt=(35.5,29,35.5,30.5,True));wire('VIN',(34,24),('D1','1'));wire('PGND',('D1','2'),(34,35),(26,35))
sym('U1',47,29,txt=(47,19,47,20.5,False),value='LMG2100R044')
bank(['C5','C6'],[29,35],17,14,20,'V5','AGND',ground_x=35);wire('V5',(35,14),(40,14),('U1','14'));power('V5',40,14)
ground('AGND','U1','15',40);ground('PGND','U1','6',40)
for net,n,y in [('HI','12',29),('LI','13',32)]:wire(net,(38,y),('U1',n));label(net,38,y)
sym('C4',58,25,txt=(58,19.5,58,21,False));wire('HB',('U1','10'),('C4','1'));wire('SW',('U1','5'),(58,28),(62,28));wire('SW',('C4','2'),(58,28))
sym('L1',63,28,90);sym('T1',77,28,txt=(77,16.5,77,18,False),value='4 : 2 : 2  /  ELP22')
wire('PRI_A',('L1','2'),(67,28),(67,22),('T1','1'))
for ref in ['C7','C8']:parts[ref]['value']='100nF/100V'
bank(['C7','C8'],[62,70],38,35,41,'TANK_C','PGND');wire('TANK_C',('T1','2'),(70,35),(62,35));label('TANK_C',62,35)
for ref,x,y in [('Q1',94,21),('Q2',94,36)]:sym(ref,x,y,txt=(90,y-3,90,y-1.5,False),value='CSD18543Q3A');ground('SGND',ref,'1',y+5)
wire('SEC_A',('T1','3'),(87,22),(87,16),(94,16),('Q1','5'));label('SEC_A',87,16)
wire('SEC_B',('T1','5'),(87,34),(87,31),(94,31),('Q2','5'));label('SEC_B',87,31)
wire('VOUT',('T1','4'),(85,28),(85,12),(153,12),(153,27),(132,27));power('VOUT',139,12)
sym('U3',118,28.5,txt=(124,15.5,124,17,False),value='UCC24624')
for r,y,net1,net2,qref,pn in [('R10',21,'VG1','SR_G1','Q1','1'),('R11',36,'VG2','SR_G2','Q2','8')]:
 sym(r,105,y,270);wire(net2,(qref,'4'),(r,'2'));wire(net1,(r,'1'),('U3',pn))
for r,y,net,vs,pn in [('R12',26,'SEC_A','VS1','4'),('R13',31,'SEC_B','VS2','6')]:
 sym(r,105,y,90);wire(net,(100,y),(r,'1'));label(net,100,y);wire(vs,(r,'2'),('U3',pn))
sym('C12',130,21);wire('VOUT',('U3','7'),(118,18),(130,18),('C12','1'));power('VOUT',118,18);ground('SGND','C12','2',23)
sym('C11',129,40,90);wire('SR_REG',('U3','3'),(127,31.5),(127,40),('C11','1'));wire('SGND',('C11','2'),(132,40),(132,41));power('SGND',132,41,True);ground('SGND','U3','2',40)
bank(['C13','C14','C15','C16'],[132,139,146,153],33,27,38,'VOUT','SGND',ground_x=143)
sym('J2',153,20,180,txt=(150,15,150,16.5,False),value='12 V / 5 A');wire('VOUT',('J2','2'),(149,21),(149,12));wire('SGND',('J2','1'),(147,19),(147,22));power('SGND',147,22,True)
sym('TP1',25,20,txt=(23,17,23,18.5,False));wire('VIN',('TP1','1'),(25,22))
sym('TP2',14,35,txt=(17,35.5,17,37,False));sym('TP3',157,25,txt=(157,20.5,157,22,False));wire('VOUT',(153,25),('TP3','1'));sym('TP4',153,38,txt=(155,41,155,42.5,False))
sym('TP5',44,18,txt=(46,16.5,46,18,False));wire('V5',(40,18),('TP5','1'));sym('TP6',29,20,txt=(27,19,27,20.5,False))
text('Primary midpoint is internal copper.',77,39,1.0);text('Functional isolation only.',77,41,1.0)

box(5,47,75,35,'02  FREQUENCY CONTROL')
sym('U2',26,62,txt=(21,52,21,53.5,False),value='UCC25600')
sym('C10',10,52);wire('BIAS12',('U2','7'),(19,50),(10,50),('C10','1'));wire('BIAS12',(19,50),(36,50),(36,52));power('BIAS12',36,52);ground('AGND','C10','2',54);ground('AGND','U2','6',73)
sym('R1',10,60);wire('DT',('U2','1'),(10,59),('R1','1'));ground('AGND','R1','2',62)
sym('R2',17,73);sym('R3',12,70,90,txt=(12,72.5,12,74,False));wire('RT',('U2','2'),(17,62),(17,66),(9,66),(9,70),('R3','1'));wire('RT',(17,66),('R2','1'));ground('AGND','R2','2',76);wire('FB_COL',('R3','2'),(14,70));label('FB_COL',14,70)
sym('C9',21,76);wire('SS',('U2','4'),(20,68),(20,72),(21,72),('C9','1'));ground('AGND','C9','2',78);label('SS',20,72)
wire('OC',(15,65),('U2','3'));label('OC',15,65)
for r,sh,y,gd,logic,pn in [('R4','R5',57,'GD1','HI','8'),('R6','R7',67,'GD2','LI','5')]:
 sym(r,40,y,90);sym(sh,44,y+3);py=pin('U2',pn)[1];wire(gd,('U2',pn),(35,py),(35,y),(r,'1'));wire(logic,(r,'2'),(46,y));wire(logic,(44,y),(sh,'1'));ground('AGND',sh,'2',y+5);label(logic,46,y)
sym('C17',53,52,90);sym('R8',59,52,90);wire('TANK_C',(49,52),('C17','1'));label('TANK_C',49,52);wire('CS_AC',('C17','2'),('R8','1'))
sym('D2',63,61,txt=(62,56,62,57.5,False),value='BAT54S');wire('CS_RECT',('R8','2'),(63,52),('D2','3'));wire('AGND',('D2','1'),(56,61),(56,64));power('AGND',56,64,True)
sym('R9',72,66);sym('C18',77,66,txt=(77,71.5,77,73,False));wire('OC',('D2','2'),(77,61),('C18','1'));wire('OC',(72,61),('R9','1'));wire('AGND',('R9','2'),(72,70),(77,70),('C18','2'));power('AGND',72,70,True);label('OC',70,61)
text('R4/R5 and R6/R7: 12 V drive → ~3.7 V logic',34,78,1.0);text('AGND joins PGND inside U1 only.',34,80,1.0)

box(82,47,78,35,'03  LOCAL BIAS · 48 V → 12 V BUCK → 5 V LOGIC')
sym('U4',106,62,txt=(105,51,105,52.5,False),value='LM5164')
sym('C19',86,57);wire('VIN',(86,53),(97,53),(97,56),('U4','2'));wire('VIN',(86,53),('C19','1'));power('VIN',95,53);ground('PGND','C19','2',61)
sym('R14',91,60);sym('R15',91,71);wire('VIN',(91,53),('R14','1'));wire('BIAS_EN',('R14','2'),(91,65),('R15','1'));wire('BIAS_EN',(91,65),(95,65),(95,60),('U4','3'));ground('PGND','R15','2',74)
sym('R16',97,70,txt=(100,72,100,73.5,True));wire('VIN',(97,68),('R16','1'));power('VIN',97,68);wire('RON',('U4','4'),(99,71),('R16','2'));ground('PGND','U4','1',74)
sym('C20',117,57,txt=(114.5,57,114.5,58.5,False));wire('BIAS_BST',('U4','7'),('C20','1'));wire('BIAS_SW',('C20','2'),(117,60));sym('L2',122,60,90);wire('BIAS_SW',('U4','8'),('L2','1'));wire('BIAS12',('L2','2'),(142,60));power('BIAS12',136,60)
bank(['C21','C22'],[133,142],65,60,70,'BIAS12','PGND')
sym('R17',124,64);sym('R18',124,73);wire('BIAS12',(124,60),('R17','1'));wire('BIAS_FB',('R17','2'),(124,69),('R18','1'));wire('BIAS_FB',('U4','5'),(115,65),(115,69),(124,69));ground('PGND','R18','2',76);label('BIAS_FB',115,69)
sym('R19',120,53,90);sym('C23',135,53,90);sym('C24',127,57);wire('BIAS_SW',(113,53),('R19','1'));label('BIAS_SW',113,53);label('BIAS_SW',118,60);wire('RIPPLE',('R19','2'),('C23','1'));wire('RIPPLE',(127,53),('C24','1'));wire('BIAS12',('C23','2'),(140,53));power('BIAS12',140,53);wire('BIAS_FB',('C24','2'),(127,59));label('BIAS_FB',127,59)
sym('U5',151,73,txt=(151,67,151,68.5,False),value='TPS7A2450');sym('C25',146,77,txt=(142.5,76,142.5,77.5,False));sym('C26',158,77,txt=(154.5,76,154.5,77.5,False))
wire('BIAS12',(146,70),('U5','1'));wire('BIAS12',('U5','1'),('C25','1'));power('BIAS12',146,70)
wire('V5',('U5','5'),(158,73),('C26','1'));power('V5',158,73);wire('AGND',('U5','2'),(151,79),(158,79),('C26','2'));wire('AGND',(151,79),(146,79),('C25','2'));power('AGND',148,79,True)

box(5,85,75,28,'04  ISOLATED VOLTAGE FEEDBACK · NOMINAL 12.05 V')
box(82,85,78,28,'05  INDEPENDENT OUTPUT OVERVOLTAGE · NOMINAL 13.27 V')
def feedback(off,ov=False):
 u='U8' if ov else 'U6';t='U9' if ov else 'U7';ra,rb,rc,rd=('R25','R26','R27','R28') if ov else ('R20','R21','R22','R23');led,k,ref=('OV_LED','OV_K','OV_REF') if ov else ('FB_LED','FB_K','VREF');out='SS' if ov else 'FB_COL'
 sym(u,54+off,96,txt=(59+off,89,59+off,90.5,False),value='EL357N');sym(t,45+off,105,txt=(48+off,104,48+off,105.5,True),value='TL431A')
 for r,x,y in [(ra,49,90),(rb,44,96),(rc,24,95),(rd,24,108)]:sym(r,x+off,y)
 wire('VOUT',(24+off,88),(49+off,88),(ra,'1'));wire('VOUT',(24+off,88),(rc,'1'));wire('VOUT',(49+off,88),(70+off,88),(70+off,90));power('VOUT',70+off,90)
 wire(led,(ra,'2'),(u,'1'));wire(led,(u,'1'),(44+off,93),(rb,'1'))
 wire(k,(rb,'2'),(44+off,99),(49+off,99),(u,'2'));wire(k,(45+off,99),(t,'1'))
 mid=104 if ov else 106
 wire(ref,(rc,'2'),(24+off,mid),(rd,'1'));wire(ref,(24+off,mid),(38+off,mid),(38+off,105),(t,'2'))
 ground('SGND',rd,'2',111);ground('SGND',t,'3',110)
 wire(out,(u,'4'),(67+off,93));label(out,67+off,93);ground('AGND',u,'3',102)
 if ov:
  sym('C29',33+off,107);wire(ref,(33+off,104),('C29','1'));wire('SGND',('C29','2'),(33+off,111),(24+off,111))
 else:
  sym('R24',33,100);sym('C27',33,103);sym('C28',39,102,txt=(40.5,100.5,40.5,102,True))
  wire(k,(44,99),(33,99),('R24','1'));wire('COMP',('R24','2'),('C27','1'));label('COMP',33,101.5,180);wire(ref,('C27','2'),(33,106));wire(k,(39,99),('C28','1'));wire(ref,('C28','2'),(39,105))
 text('SECONDARY',8+off,91,1.1,True);text('PRIMARY',63+off,99,1.1,True)
feedback(0);feedback(78,True)
text('UNBUILT · Functional isolation only · Verify magnetics, switching, no-load operation and thermal limits before release.',5,115,1.15)

# Name every internal node once so schematic/PCB net names remain stable.
named={n for n,_ in labels}|{n for n,x,y in powers}
for net in sorted({n for p in parts.values() for n in p['nets'].values() if n} - named):
 segs=[(a,b) for n,a,b in wiresegs if n==net and abs(a[1]-b[1])<1e-5]
 if segs:
  a,b=max(segs,key=lambda ab:abs(ab[0][0]-ab[1][0]));x=min(a[0],b[0]);label(net,x,a[1])
 else:
  a=next(a for n,a,b in wiresegs if n==net);label(net,*a)
# Split all wires at contacts. Reject four-way connected crossings explicitly.
def on(p,a,b):return min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6 and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6 and abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-6
flag_nodes=[('VIN',21,21),('PGND',15,35),('AGND',33,20),('VOUT',143,12),('SGND',150,38),('BIAS12',137,60)]
contacts={(x,y) for n,x,y in flag_nodes}|{a for n,a,b in wiresegs}|{b for n,a,b in wiresegs}|set(ends.values())|{p for n,p in labels}|{(x,y) for n,x,y in powers}
segments=set()
for net,a,b in wiresegs:
 ps=sorted((p for p in contacts if on(p,a,b)),key=lambda p:(p[0]-a[0])**2+(p[1]-a[1])**2)
 for p1,p2 in zip(ps,ps[1:]):segments.add((net,*sorted([p1,p2])))
degrees={}
for n,a,b in sorted(segments):
 for p1,p2 in [(a,b),(b,a)]:degrees.setdefault((n,p1),set()).add((round(p2[0]-p1[0],6)>0)-(round(p2[0]-p1[0],6)<0) if p1[1]==p2[1] else 2*((p2[1]>p1[1])-(p2[1]<p1[1])))
 color=next((c for ns,c in [(['VIN','VIN_RAW'],'165 88 18'),(['SW','PRI_A','TANK_C'],'160 66 40'),(['VOUT','SEC_A','SEC_B'],'20 110 145'),(['HI','LI','GD1','GD2'],'112 75 150'),(['PGND','SGND','AGND'],'90 110 102'),(['BIAS12','V5'],'100 100 140')] if n in ns),'30 125 60')
 elements.append(f'(wire (pts (xy {g(a[0])} {g(a[1])}) (xy {g(b[0])} {g(b[1])})) (stroke (width 0) (type default) (color {color} 1)) (uuid {uid("wire"+str((n,a,b)))}))')
four=[(n,p) for (n,p),v in degrees.items() if len(v)>3]
assert not four, four
for (n,p),v in degrees.items():
 if len(v)>=3:elements.append(f'(junction (at {g(p[0])} {g(p[1])}) (diameter .762) (color 0 0 0 0) (uuid {uid("junction"+str(p))}))')
for i,(n,x,y) in enumerate([('VIN',21,21),('PGND',15,35),('AGND',33,20),('VOUT',143,12),('SGND',150,38),('BIAS12',137,60)]):flag(n,x,y,i)
assert placed==set(parts),(set(parts)-placed,placed-set(parts))
for k,s in defs.items():
 s[1]='PS:'+k
root=f'(kicad_sch (version 20250114) (generator "eeschema") (uuid {data["root_uuid"]}) (paper "A3") (title_block (title "PS-GAN-60W: planar LLC converter") (date "2026-10-10") (rev "A2-review") (company "Planar Studio")) (lib_symbols {"".join(sx.dumps(s) for s in defs.values())}) {"".join(elements)} (embedded_fonts no))'
(CAD/(NAME+'.kicad_sch')).write_text(root,encoding='utf8')
for k,s in defs.items():s[1]=k
(CAD/'PS.kicad_sym').write_text('(kicad_symbol_lib (version 20250114) (generator "kicad_symbol_editor") '+''.join(sx.dumps(s) for s in defs.values())+')',encoding='utf8')
(R/'evidence/schematic-geometry.json').write_text(json.dumps({'revision':'A2','four_way_connections':four,'wire_segments':len(segments),'placed_parts':len(placed),'symbol_pin_identities_preserved':True},indent=2),encoding='utf8')
(R/'circuit.json').write_text(json.dumps(data,indent=2),encoding='utf8')
print('Schematic saved:',len(placed),'parts;',len(segments),'wire segments; four-way:',four)
