"""Generate an editable native KiCad schematic and explicit circuit connectivity."""
import json, uuid, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; CAD=ROOT/'kicad'; CAD.mkdir(exist_ok=True)
NAME='PS-FLYBACK-5W'; NS=uuid.UUID('2de6335a-c764-42d6-868c-5643d180ba85')
catalog=json.loads((ROOT/'parts.json').read_text())
mechanical=json.loads((ROOT/'mechanical.json').read_text())
def uid(s): return str(uuid.uuid5(NS,s))
def q(s): return json.dumps(str(s))
def effects(size=1.27,hide=False): return f'(effects (font (size {size} {size}))'+(' (hide yes)' if hide else '')+')'
def prop(k,v,x,y,hidden=False,just='',angle=0):
  eff=effects(1.27,hidden)
  if just:eff=eff[:-1]+f' (justify {just}))'
  return f'(property {q(k)} {q(v)} (at {x} {y} {angle}) {eff})'
def line(points):return '(polyline (pts '+''.join(f'(xy {x} {y})' for x,y in points)+') (stroke (width 0.254) (type default)) (fill (type none)))'
def rect(a,b): return f'(rectangle (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width 0.254) (type default)) (fill (type background)))'
def circle(x,y,r=.5):return f'(circle (center {x} {y}) (radius {r}) (stroke (width 0.15) (type default)) (fill (type outline)))'
def arc(a,b,c):return f'(arc (start {a[0]} {a[1]}) (mid {b[0]} {b[1]}) (end {c[0]} {c[1]}) (stroke (width 0.254) (type default)) (fill (type none)))'
pinmap={}; definitions={}
def define(name,ref,graphics,pins,show_names=False):
  pinmap[name]=pins
  defs=[]
  for number,label,x,y,angle,etype in pins:
    defs.append(f'(pin {etype} line (at {x} {y} {angle}) (length 2.54) (name {q(label)} {effects(1.0)}) (number {q(number)} {effects(1.0)}))')
  definitions[name]=f'''(symbol "Flyback:{name}" {'' if show_names or name=='T' else '(pin_numbers hide)'} (pin_names (offset 0.5){'' if show_names else ' (hide yes)'}) (in_bom yes) (on_board yes)
  {prop('Reference',ref,0,5.08)} {prop('Value',name,0,-5.08)}
  (symbol "{name}_0_1" {graphics}) (symbol "{name}_1_1" {''.join(defs)}))'''
vertical=[('1','1',0,5.08,270,'passive'),('2','2',0,-5.08,90,'passive')]
# Compact US resistor and capacitor bodies, with the established pin identities
# and endpoints retained so redraws cannot silently change electrical meaning.
define('R','R',line([(0,2.54),(0,1.524),(1.016,1.143),(0,.762),(-1.016,.381),(0,0),(1.016,-.381),(0,-.762),(-1.016,-1.143),(0,-1.524),(0,-2.54)]),vertical)
define('C','C',line([(-1.524,.508),(1.524,.508)])+line([(-1.524,-.508),(1.524,-.508)])+line([(0,2.54),(0,.508)])+line([(0,-2.54),(0,-.508)]),vertical)
define('D','D',line([(-1.27,2.0),(-1.27,-2.0)])+line([(-1.27,0),(1.27,2),(1.27,-2),(-1.27,0)])+line([(-2.54,0),(-1.27,0)])+line([(1.27,0),(2.54,0)]),[('1','K',-5.08,0,0,'passive'),('2','A',5.08,0,180,'passive')])
define('FUSE','F',rect((-.8,2.54),(.8,-2.54))+line([(0,2.54),(0,-2.54)]),vertical)
define('CP','C',line([(-2.54,.8),(2.54,.8)])+rect((-2.54,-.6),(2.54,-1.0))+line([(0,2.54),(0,.8)])+line([(0,-2.54),(0,-1)])+line([(-3.3,1.4),(-3.3,2.6)])+line([(-3.9,2),(-2.7,2)]),vertical)
define('TVS','D',line([(-2,2),(-1.27,2),(-1.27,-2),(-.5,-2)])+line([(-1.27,0),(1.27,2),(1.27,-2),(-1.27,0)])+line([(-2.54,0),(-1.27,0)])+line([(1.27,0),(2.54,0)]),pinmap['D'])
define('J','J',rect((-2.54,3.81),(2.54,-3.81)),[('1','+',-5.08,1.27,0,'passive'),('2','-',-5.08,-1.27,0,'passive')],True)
define('JIN','J',rect((-2.54,3.81),(2.54,-3.81)),[('1','+',5.08,1.27,180,'passive'),('2','-',5.08,-1.27,180,'passive')],True)
coils=''.join(arc((side*7.62,y),(side*6.35,y-1.27),(side*7.62,y-2.54)) for side in [-1,1] for y in [5.08,2.54,0,-2.54])
define('T','T',line([(-1.27,-6.35),(-1.27,6.35)])+line([(1.27,-6.35),(1.27,6.35)])+coils+circle(-8.89,3.81)+circle(8.89,-3.81),[('1','P_DOT',-10.16,5.08,0,'passive'),('2','P_END',-10.16,-5.08,0,'passive'),('3','S_DOT',10.16,-5.08,180,'passive'),('4','S_END',10.16,5.08,180,'passive'),('5','P_MID',-10.16,0,0,'passive')])
define('LT8302','U',rect((-10.16,12.7),(10.16,-20.32)),[
 ('1','EN/UVLO',-12.7,2.54,0,'input'),('2','INTVCC',-12.7,-7.62,0,'power_out'),('3','VIN',-12.7,10.16,0,'power_in'),('4','GND',0,-22.86,90,'power_in'),('5','SW',12.7,10.16,180,'open_collector'),('6','RFB',12.7,2.54,180,'input'),('7','RREF',12.7,-7.62,180,'output'),('8','TC',12.7,-15.24,180,'output'),('9','EP_GND',5.08,-22.86,90,'power_in')],True)
define('FLAG','#FLG',line([(-1,0),(1,0),(0,1),(-1,0)]),[('1','pwr',0,-2.54,90,'power_out')])
define('Ground','#PWR',''.join(line([(-half,-dy),(half,-dy)]) for dy,half in [(2.54,1.905),(3.175,1.27),(3.81,.635)]),[('1','',0,0,270,'passive')])
define('Supply','#PWR',line([(-1.27,1.27),(0,2.54),(1.27,1.27)]),[('1','',0,0,90,'passive')])
define('Mount','H',(circle(0,0,1.8)+circle(0,0,.8)).replace('(fill (type outline))','(fill (type none))'),[])
parts=[]; elements=[]; endpoints={}; endpoint_nets={}; power_references=iter(range(1,100))
def add(ref,value,kind,x,y,nets,fp='',rot=0,mpn='',code='',purpose=''):
  part=catalog.get(ref,{})
  value=part.get('value',value);fp=part.get('footprint',fp);mpn=part.get('mpn',mpn);code=part.get('lcsc',code);purpose=part.get('purpose',purpose)
  if ref=='T1':nets['5']='unconnected-(T1-P_MID-Pad5)'
  source_fp=fp
  if fp and kind!='Mount':fp='Flyback:'+fp.split(':')[1]
  u=uid(ref); onboard=not ref.startswith('#'); bom=onboard and kind!='Mount'
  if kind in ['R','C','CP','FUSE'] and rot in [0,180] or kind in ['D','TVS'] and rot in [90,270]:
    justification='right' if rot in [90,180] else 'left'
    props=prop('Reference',ref,x+4.5,y-1.27,just=justification,angle=rot%180)+prop('Value',value,x+4.5,y+1.27,just=justification,angle=rot%180)
  elif kind=='LT8302':props=prop('Reference',ref,x,y-19.05)+prop('Value',value,x,y-16.51)
  elif kind=='T':props=prop('Reference',ref,x,y-13.97)+prop('Value',value,x,y-11.43)
  elif kind=='Mount':props=prop('Reference',ref,x,y-4.445)+prop('Value',value,x,y,True)
  elif kind in ['FLAG','Ground','Supply']:props=prop('Reference',ref,x,y,True)+prop('Value',value,x,y,True)
  else:props=prop('Reference',ref,x,y-6.35,angle=rot%180)+prop('Value',value,x,y+6.35,angle=rot%180)
  if ref=='C5':props=prop('Reference',ref,x-3.81,y-1.27,just='right')+prop('Value',value,x-3.81,y+1.27,just='right')
  if ref in ['J1','J2']:props=prop('Reference',ref,x,y-6.35)+prop('Value',value,x,y,True)
  props+=prop('Footprint',fp,x,y,True)+prop('Datasheet',part.get('source',''),x,y,True)+prop('MPN',mpn,x,y,True)+prop('Manufacturer',part.get('mfr',''),x,y,True)+prop('LCSC',code,x,y,True)
  elements.append(f'(symbol (lib_id "Flyback:{kind}") (at {x} {y} {rot}) (unit 1) (in_bom {"yes" if bom else "no"}) (on_board {"yes" if onboard else "no"}) (dnp no) (uuid {u}) {props} '+''.join(f'(pin "{p[0]}" (uuid {uid(ref+"pin"+p[0])}))' for p in pinmap[kind])+f'(instances (project "{NAME}" (path "/{uid(NAME)}" (reference {q(ref)}) (unit 1)))))')
  for number,label,px,py,a,t in pinmap[kind]:
    # KiCad symbol Y is upward; sheet Y is downward.
    theta=math.radians(rot); xx=x+px*math.cos(theta)-py*math.sin(theta); yy=y-px*math.sin(theta)-py*math.cos(theta)
    endpoints[(ref,number)]=(xx,yy)
    endpoint_nets[(round(xx,6),round(yy,6))]=nets[number]
    if ref=='T1' and number=='5':
      elements.append(f'(no_connect (at {xx} {yy}) (uuid {uid("internal-midpoint-nc")}))')
      continue
    # Every external pin is explicitly wired below. Labels join functional blocks.
  if onboard:parts.append(dict(ref=ref,value=value,kind=kind,nets=nets,footprint=fp,source_footprint=source_fp,mpn=mpn,lcsc=code,mfr=part.get('mfr',''),source=part.get('source',''),purpose=purpose,uuid=u,exclude_from_bom=not bom))
R='Resistor_SMD:R_0603_1608Metric'; C='Capacitor_SMD:C_1210_3225Metric'; D='Diode_SMD:D_SMA'
add('J1','18-36 V DC','JIN',20.32,43.18,{'1':'VIN_RAW','2':'PGND'},'Flyback:Terminal_2P_5.08',mpn='KF301-5.08-2P',purpose='Input connector; exact vendor footprint pending')
add('F1','1 A / >=63 V','FUSE',43.18,41.91,{'1':'VIN_RAW','2':'VIN_FUSED'},'Fuse:Fuse_1206_3216Metric',rot=90,purpose='Input fault protection; sourcing pending')
add('D1','SS110','D',66.04,41.91,{'1':'VIN','2':'VIN_FUSED'},D,rot=180,mpn='SS110',purpose='Input reverse-polarity protection')
add('C1','10u / 100 V','C',81.28,46.99,{'1':'VIN','2':'PGND'},'Capacitor_SMD:C_1812_4532Metric',mpn='C4532X7R2A106M230KB',purpose='Input reservoir; DC-bias curve must be checked')
add('C2','10u / 100 V','C',109.22,46.99,{'1':'VIN','2':'PGND'},'Capacitor_SMD:C_1812_4532Metric',mpn='C4532X7R2A106M230KB')
add('T1','PLANAR 4:2 / Lm 12uH','T',144.78,46.99,{'1':'VIN','2':'SW','3':'GND_ISO','4':'SEC_A','5':'PRI_MID'},'Flyback:Planar_EELP32_4T_2T',mpn='PS-MAG-001 prepared assembly',purpose='Four winding layers on a six-layer PCB; pad 5 is the internal primary series via; prepared N87 core pair')
add('D2','PDS835L-13','D',172.72,41.91,{'1':'+5V_ISO','2':'SEC_A'},'Diode_SMD:D_PowerDI-5',rot=180,mpn='PDS835L-13',code='C444972')
add('C3','180u / 16 V polymer','CP',190.5,46.99,{'1':'+5V_ISO','2':'GND_ISO'},'Flyback:CP_Panasonic_C6',mpn='16SVPF180M')
add('C4','22u / 16 V','C',222.25,46.99,{'1':'+5V_ISO','2':'GND_ISO'},C,mpn='GRM32ER71C226KE18L')
add('J2','5 V / 1 A isolated','J',274.32,43.18,{'1':'+5V_ISO','2':'GND_ISO'},'Flyback:Terminal_2P_5.08',mpn='KF301-5.08-2P')
add('U1','LT8302ES8E#PBF','LT8302',88.9,116.84,{'1':'UVLO','2':'INTVCC','3':'VIN','4':'PGND','5':'SW','6':'RFB','7':'RREF','8':'TC','9':'PGND'},'Flyback:SOIC8_EP_LT_S8E',mpn='LT8302ES8E#PBF',code='C117331')
add('C5','1u / 10 V','C',68.58,134.62,{'1':'INTVCC','2':'PGND'},'Capacitor_SMD:C_0603_1608Metric')
add('R1','681k 1%','R',40.64,106.68,{'1':'VIN','2':'UVLO'},R)
add('R2','61.9k 1%','R',40.64,129.54,{'1':'UVLO','2':'PGND'},R)
add('R3','106k 0.1%','R',119.38,106.68,{'1':'SW','2':'RFB'},R)
add('R4','10k 0.1%','R',144.78,137.16,{'1':'RREF','2':'PGND'},R)
add('R5','118k 1%','R',119.38,132.08,{'1':'TC','2':'RREF'},R,rot=180,purpose='Initial temperature compensation; bench trim required')
add('R6','39R 0.5 W','R',247.65,109.22,{'1':'VIN','2':'SNUB'},'Resistor_SMD:R_1206_3216Metric')
add('C6','470p / 100 V C0G','C',247.65,129.54,{'1':'SNUB','2':'SW'},'Capacitor_SMD:C_0805_2012Metric')
add('D3','DFLS1100-7','D',198.12,129.54,{'1':'CLAMP','2':'SW'},'Diode_SMD:D_PowerDI-123',rot=270,mpn='DFLS1100-7')
add('D4','SMAJ15A','TVS',198.12,109.22,{'1':'CLAMP','2':'VIN'},D,rot=90,mpn='SMAJ15A',purpose='Avalanche clamp; waveform validation required')
add('R7','499R 0.25 W','R',247.65,46.99,{'1':'+5V_ISO','2':'GND_ISO'},'Resistor_SMD:R_1206_3216Metric',purpose='10 mA minimum load at 5 V')
add('#FLG01','PWR_FLAG','FLAG',120.65,39.37,{'1':'VIN'})
add('#FLG02','PWR_FLAG','FLAG',109.22,63.5,{'1':'PGND'})
for i,hole in enumerate(mechanical['holes']):
  add(hole['ref'],'M3 / 3.2 mm NPTH','Mount',124.46+12.7*i,182.88,{},mechanical['mounting_footprint'],purpose='Mechanical mounting hole; not an assembly component')

def wire(points):
  connected={endpoint_nets[(round(x,6),round(y,6))] for x,y in points if (round(x,6),round(y,6)) in endpoint_nets}
  assert len(connected)<=1,('wire joins different intended nets',connected)
  # Distinguish input power, switched power and isolated output in the editor.
  colour={'VIN':'140 90 0 1','SW':'170 50 30 1','+5V_ISO':'0 100 150 1'}.get(next(iter(connected),None))
  stroke='(stroke (width 0) (type default)'+(f' (color {colour})' if colour else '')+')'
  for a,b in zip(points,points[1:]):
    if math.dist(a,b)<1e-6:continue
    assert abs(a[0]-b[0])<1e-6 or abs(a[1]-b[1])<1e-6,('non-orthogonal wire',a,b)
    elements.append(f'(wire (pts (xy {a[0]:.6f} {a[1]:.6f})(xy {b[0]:.6f} {b[1]:.6f})) {stroke} (uuid {uid(str(a)+str(b))}))')
def at(ref,pin):return endpoints[(ref,str(pin))]
def junction(x,y):elements.append(f'(junction (at {x} {y}) (diameter 0) (color 0 0 0 0) (uuid {uid("junction"+str((x,y)))}))')
def netlabel(net,x,y):elements.append(f'(label {q(net)} (at {x} {y} 0) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid {uid("bus"+net+str((x,y)))}))')
def text(s,x,y,size=1.27,bold=False):elements.append(f'(text {q(s)} (at {x} {y} 0) (effects (font (size {size} {size}) {"(bold yes)" if bold else ""}) (justify left)) (uuid {uid(s)}))')
def drawing(points,colour='100 120 140 1',width=.254):
  elements.append('(polyline (pts '+''.join(f'(xy {x} {y})' for x,y in points)+f') (stroke (width {width}) (type default) (color {colour})) (fill (type none)) (uuid {uid("drawing"+str(points))}))')
def ground(net,x,y):
  # Local power symbols retain the board's /PGND and /GND_ISO net identities.
  add(f'#PWR{next(power_references):03d}',net,'Ground',x,y,{'1':net})
  netlabel(net,x,y)
def supply(net,x,y):
  add(f'#PWR{next(power_references):03d}',net,'Supply',x,y,{'1':net})
  netlabel(net,x+3.81,y)
def box(x0,y0,x1,y1,title):
  drawing([(x0,y0),(x1,y0),(x1,y1),(x0,y1),(x0,y0)],width=.2)
  text(title,x0+3.81,y0+5.08,1.52,True)

# Power moves left to right. The two return rails remain visibly separated.
wire([at('J1',1),at('F1',1)])
wire([at('F1',2),at('D1',2)])
netlabel('VIN_RAW',30.48,41.91);netlabel('VIN_FUSED',50.8,41.91)
wire([at('D1',1),(81.28,41.91),(109.22,41.91),(120.65,41.91),at('T1',1)])
netlabel('VIN',120.65,41.91)
wire([at('J1',2),(30.48,44.45),(30.48,66.04),(81.28,66.04),(109.22,66.04)])
for ref,x in [('C1',81.28),('C2',109.22)]:
  wire([at(ref,2),(x,66.04)]);junction(x,41.91)
junction(81.28,66.04);ground('PGND',109.22,66.04)
wire([at('T1',2),(127,52.07),(127,60.96)]);netlabel('SW',127,60.96)
wire([at('T1',4),at('D2',2)]);netlabel('SEC_A',157.48,41.91)
wire([at('D2',1),(190.5,41.91),(222.25,41.91),(247.65,41.91),at('J2',1)])
wire([at('T1',3),(158.75,52.07),(158.75,66.04),(190.5,66.04),(222.25,66.04),(247.65,66.04),(269.24,66.04),at('J2',2)])
for ref,x in [('C3',190.5),('C4',222.25),('R7',247.65)]:
  wire([at(ref,2),(x,66.04)]);junction(x,41.91);junction(x,66.04)
netlabel('+5V_ISO',254,41.91);ground('GND_ISO',222.25,66.04)
text('18-36 V DC',15.24,74.93)
text('PRIMARY',93.98,74.93);text('ISOLATED 5 V / 1 A',218.44,74.93)

# Local controller parts are wired to their actual IC pins, not isolated label stubs.
wire([at('R1',1),(40.64,96.52),(60.96,96.52),(60.96,106.68),at('U1',3)])
supply('VIN',40.64,96.52)
wire([at('R1',2),(40.64,114.3),at('R2',1)])
wire([(40.64,114.3),at('U1',1)]);junction(40.64,114.3);netlabel('UVLO',45.72,114.3)
wire([at('U1',2),(68.58,124.46),at('C5',1)]);netlabel('INTVCC',68.58,124.46)
wire([at('U1',5),(109.22,106.68),(109.22,99.06),(119.38,99.06),at('R3',1)])
netlabel('SW',114.3,99.06)
wire([at('R3',2),(119.38,114.3),at('U1',6)]);netlabel('RFB',109.22,114.3)
wire([at('U1',7),(119.38,124.46),(144.78,124.46),at('R4',1)])
wire([(119.38,124.46),at('R5',2)]);junction(119.38,124.46);netlabel('RREF',128.27,124.46)
wire([at('U1',8),(109.22,132.08),(109.22,137.16),at('R5',1)]);netlabel('TC',106.68,132.08)
wire([at('R2',2),(40.64,152.4),(68.58,152.4),(88.9,152.4),(93.98,152.4),(144.78,152.4),at('R4',2)])
for ref,pin in [('C5',2),('U1',4),('U1',9)]:
  x,y=at(ref,pin);wire([(x,y),(x,152.4)]);junction(x,152.4)
ground('PGND',88.9,152.4)
text('UVLO divider',19.05,147.32,1.0)
text('Temperature trim',123.19,147.32,1.0)

# Clamp and damping are drawn as complete parallel branches between VIN and SW.
wire([at('D4',2),(198.12,96.52),(222.25,96.52),(247.65,96.52),at('R6',1)])
supply('VIN',222.25,96.52);junction(222.25,96.52)
wire([at('D4',1),(198.12,119.38),at('D3',1)]);netlabel('CLAMP',198.12,119.38)
wire([at('R6',2),(247.65,119.38),at('C6',1)]);netlabel('SNUB',247.65,119.38)
wire([at('D3',2),(198.12,144.78),(222.25,144.78),(247.65,144.78),at('C6',2)])
netlabel('SW',222.25,144.78)
text('Tune after measuring switch overshoot.',179.07,156.21,1.27)

text('PLANAR FLYBACK  /  5 W',12.7,13.97,2.54,True)
text('18-36 V input  |  isolated 5 V / 1 A  |  A1 engineering prototype',12.7,19.05,1.27)
box(12.7,22.86,284.48,80.01,'01  POWER PATH')
box(12.7,83.82,168.91,163.83,'02  PRIMARY-SIDE REGULATION')
box(172.72,83.82,284.48,163.83,'03  CLAMP AND DAMPING')
text('BUILD NOTES  /  NOT RELEASED FOR MANUFACTURE',12.7,170.18,1.27,True)
for i,note in enumerate([
  '4:2 PCB winding; nominal Lm 12 uH. Prepared N87 core pair.',
  '0.21 mm center-leg gap; stock ungapped halves are not substitutes.',
  'Primary: F.Cu + B.Cu series. Secondary: In1.Cu + In4.Cu parallel.',
  'Pin 5: internal series via. Keep PGND and GND_ISO separate.',
  'Functional isolation only. Prototype and supplier checks remain open.',
]):text(note,12.7,176.53+i*4.445,1.0)
text('MOUNTING',120.65,171.45,1.27,True)
text('4 x M3 / 3.2 mm NPTH',120.65,190.5,1.0)
text('41 x 80 mm pattern',120.65,194.945,1.0)
root=f'''(kicad_sch (version 20250114) (generator "eeschema") (uuid {uid(NAME)}) (paper "A4")
(title_block (title "18-36 V to isolated 5 V / 1 A planar flyback") (date "2026-09-29") (rev "A1-development") (company "Planar Studio example"))
(lib_symbols {''.join(definitions.values())}) {''.join(elements)} (embedded_fonts no))'''
(CAD/f'{NAME}.kicad_sch').write_text(root,encoding='utf8')
lib='(kicad_symbol_lib (version 20250114) (generator "kicad_symbol_editor") '+''.join(v.replace(f'"Flyback:{k}"',q(k),1) for k,v in definitions.items())+')'
(CAD/'Flyback.kicad_sym').write_text(lib,encoding='utf8')
(CAD/'sym-lib-table').write_text('(sym_lib_table (lib (name "Flyback") (type "KiCad") (uri "${KIPRJMOD}/Flyback.kicad_sym") (options "") (descr "Project symbols")))')
(CAD/'fp-lib-table').write_text('(fp_lib_table (lib (name "Flyback") (type "KiCad") (uri "${KIPRJMOD}/Flyback.pretty") (options "") (descr "Project footprints")) (lib (name "amemb-MountingHole") (type "KiCad") (uri "${KIPRJMOD}/amemb-MountingHole.pretty") (options "") (descr "American Embedded M3 mounting footprint")))')
if not (CAD/f'{NAME}.kicad_pro').exists(): (CAD/f'{NAME}.kicad_pro').write_text(json.dumps({'meta':{'filename':f'{NAME}.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':.2,'min_track_width':.2,'min_via_diameter':.6,'min_through_hole_diameter':.3}}}},indent=2))
(ROOT/'circuit.json').write_text(json.dumps({'project':NAME,'root_uuid':uid(NAME),'parts':parts},indent=2))
print(f'Generated {len(parts)} components and native KiCad schematic.')
