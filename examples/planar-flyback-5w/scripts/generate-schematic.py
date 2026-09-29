"""Generate an editable native KiCad schematic and explicit circuit connectivity."""
import json, uuid, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; CAD=ROOT/'kicad'; CAD.mkdir(exist_ok=True)
NAME='PS-FLYBACK-5W'; NS=uuid.UUID('2de6335a-c764-42d6-868c-5643d180ba85')
catalog=json.loads((ROOT/'parts.json').read_text())
def uid(s): return str(uuid.uuid5(NS,s))
def q(s): return json.dumps(str(s))
def effects(size=1.27,hide=False): return f'(effects (font (size {size} {size}))'+(' (hide yes)' if hide else '')+')'
def prop(k,v,x,y,hidden=False,just='',angle=0):
  eff=effects(1.0,hidden)
  if just:eff=eff[:-1]+f' (justify {just}))'
  return f'(property {q(k)} {q(v)} (at {x} {y} {angle}) {eff})'
def line(points):return '(polyline (pts '+''.join(f'(xy {x} {y})' for x,y in points)+') (stroke (width 0.254) (type default)) (fill (type none)))'
def rect(a,b): return f'(rectangle (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width 0.254) (type default)) (fill (type background)))'
def circle(x,y,r=.5):return f'(circle (center {x} {y}) (radius {r}) (stroke (width 0.15) (type default)) (fill (type outline)))'
pinmap={}; definitions={}
def define(name,ref,graphics,pins,show_names=False):
  pinmap[name]=pins
  defs=[]
  for number,label,x,y,angle,etype in pins:
    defs.append(f'(pin {etype} line (at {x} {y} {angle}) (length 2.54) (name {q(label)} {effects(1.0)}) (number {q(number)} {effects(1.0)}))')
  definitions[name]=f'''(symbol "Flyback:{name}" (pin_names (offset 0.5){'' if show_names else ' (hide yes)'}) (in_bom yes) (on_board yes)
  {prop('Reference',ref,0,5.08)} {prop('Value',name,0,-5.08)}
  (symbol "{name}_0_1" {graphics}) (symbol "{name}_1_1" {''.join(defs)}))'''
vertical=[('1','1',0,5.08,270,'passive'),('2','2',0,-5.08,90,'passive')]
define('R','R',rect((-1.016,2.54),(1.016,-2.54)),vertical)
define('C','C',line([(-2.54,.8),(2.54,.8)])+line([(-2.54,-.8),(2.54,-.8)])+line([(0,2.54),(0,.8)])+line([(0,-2.54),(0,-.8)]),vertical)
define('D','D',line([(-1.27,2.0),(-1.27,-2.0)])+line([(-1.27,0),(1.27,2),(1.27,-2),(-1.27,0)])+line([(-2.54,0),(-1.27,0)])+line([(1.27,0),(2.54,0)]),[('1','K',-5.08,0,0,'passive'),('2','A',5.08,0,180,'passive')])
define('FUSE','F',rect((-.8,2.54),(.8,-2.54))+line([(0,2.54),(0,-2.54)]),vertical)
define('CP','C',line([(-2.54,.8),(2.54,.8)])+rect((-2.54,-.6),(2.54,-1.0))+line([(0,2.54),(0,.8)])+line([(0,-2.54),(0,-1)])+line([(-3.3,1.4),(-3.3,2.6)])+line([(-3.9,2),(-2.7,2)]),vertical)
define('TVS','D',line([(-2,2),(-1.27,2),(-1.27,-2),(-.5,-2)])+line([(-1.27,0),(1.27,2),(1.27,-2),(-1.27,0)])+line([(-2.54,0),(-1.27,0)])+line([(1.27,0),(2.54,0)]),pinmap['D'])
define('J','J',rect((-2.54,3.81),(2.54,-3.81)),[('1','+',-5.08,1.27,0,'passive'),('2','-',-5.08,-1.27,0,'passive')],True)
define('JIN','J',rect((-2.54,3.81),(2.54,-3.81)),[('1','+',5.08,1.27,180,'passive'),('2','-',5.08,-1.27,180,'passive')],True)
define('T','T',line([(-2,-7.62),(-2,7.62)])+line([(2,-7.62),(2,7.62)])+rect((-6.35,6.35),(-3.81,-6.35))+rect((3.81,6.35),(6.35,-6.35))+line([(-7.62,0),(-6.35,0)])+circle(-7,5.08)+circle(7,-5.08),[('1','P_DOT',-10.16,5.08,0,'passive'),('2','P_END',-10.16,-5.08,0,'passive'),('3','S_DOT',10.16,-5.08,180,'passive'),('4','S_END',10.16,5.08,180,'passive'),('5','P_MID',-10.16,0,0,'passive')])
define('LT8302','U',rect((-10.16,12.7),(10.16,-20.32)),[
 ('1','EN/UVLO',-12.7,0,0,'input'),('2','INTVCC',-12.7,-7.62,0,'power_out'),('3','VIN',-12.7,7.62,0,'power_in'),('4','GND',0,-22.86,90,'power_in'),('5','SW',12.7,7.62,180,'open_collector'),('6','RFB',12.7,0,180,'input'),('7','RREF',12.7,-7.62,180,'output'),('8','TC',12.7,-15.24,180,'output'),('9','EP_GND',5.08,-22.86,90,'power_in')],True)
define('FLAG','#FLG',line([(-1,0),(1,0),(0,1),(-1,0)]),[('1','pwr',0,-2.54,90,'power_out')])
parts=[]; elements=[]; endpoints={}
power_connected={'J1':{'1','2'},'F1':{'1','2'},'D1':{'1','2'},'C1':{'1','2'},'C2':{'1','2'},'T1':{'1','3','4'},'D2':{'1','2'},'C3':{'1','2'},'C4':{'1','2'},'J2':{'1','2'}}
def add(ref,value,kind,x,y,nets,fp='',rot=0,mpn='',code='',purpose=''):
  part=catalog.get(ref,{})
  value=part.get('value',value);fp=part.get('footprint',fp);mpn=part.get('mpn',mpn);code=part.get('lcsc',code);purpose=part.get('purpose',purpose)
  if ref=='T1':nets['5']='unconnected-(T1-P_MID-Pad5)'
  source_fp=fp
  if fp:fp='Flyback:'+fp.split(':')[1]
  u=uid(ref); bom=not ref.startswith('#')
  if kind in ['R','C','CP','FUSE'] and rot==0 or kind in ['D','TVS'] and rot in [90,270]:
    props=prop('Reference',ref,x+4.5,y-1.27,just='left',angle=rot%180)+prop('Value',value,x+4.5,y+1.27,just='left',angle=rot%180)
  elif kind=='LT8302':props=prop('Reference',ref,x,y-16.51)+prop('Value',value,x,y-19.05)
  elif kind=='T':props=prop('Reference',ref,x,y-11.43)+prop('Value',value,x,y-13.97)
  else:props=prop('Reference',ref,x,y-6.35,angle=rot%180)+prop('Value',value,x,y+6.35,angle=rot%180)
  props+=prop('Footprint',fp,x,y,True)+prop('Datasheet',part.get('source',''),x,y,True)+prop('MPN',mpn,x,y,True)+prop('LCSC',code,x,y,True)
  elements.append(f'(symbol (lib_id "Flyback:{kind}") (at {x} {y} {rot}) (unit 1) (in_bom {"yes" if bom else "no"}) (on_board {"yes" if bom else "no"}) (dnp no) (uuid {u}) {props} '+''.join(f'(pin "{p[0]}" (uuid {uid(ref+"pin"+p[0])}))' for p in pinmap[kind])+f'(instances (project "{NAME}" (path "/{uid(NAME)}" (reference {q(ref)}) (unit 1)))))')
  for number,label,px,py,a,t in pinmap[kind]:
    # KiCad symbol Y is upward; sheet Y is downward.
    theta=math.radians(rot); xx=x+px*math.cos(theta)-py*math.sin(theta); yy=y-px*math.sin(theta)-py*math.cos(theta)
    endpoints[(ref,number)]=(xx,yy)
    if ref=='T1' and number=='5':
      elements.append(f'(no_connect (at {xx} {yy}) (uuid {uid("internal-midpoint-nc")}))')
      continue
    if number in power_connected.get(ref,set()):continue
    angle=math.radians(a+rot); ex=xx-3.81*math.cos(angle); ey=yy+3.81*math.sin(angle)
    net=nets[number]; points=f'(xy {xx:.6f} {yy:.6f})(xy {ex:.6f} {ey:.6f})'
    elements.append(f'(wire (pts {points}) (stroke (width 0) (type default)) (uuid {uid(ref+number+"wire")}))')
    la=0 if math.cos(angle)>-.5 else 180
    elements.append(f'(label {q(net)} (at {ex:.6f} {ey:.6f} {la}) (effects (font (size 1.0 1.0)) (justify left bottom)) (uuid {uid(ref+number+"label")}))')
  if bom:parts.append(dict(ref=ref,value=value,kind=kind,nets=nets,footprint=fp,source_footprint=source_fp,mpn=mpn,lcsc=code,mfr=part.get('mfr',''),source=part.get('source',''),purpose=purpose,uuid=u))
R='Resistor_SMD:R_0603_1608Metric'; C='Capacitor_SMD:C_1210_3225Metric'; D='Diode_SMD:D_SMA'
add('J1','18-36 V DC','JIN',30.48,35.56,{'1':'VIN_RAW','2':'PGND'},'Flyback:Terminal_2P_5.08',mpn='KF301-5.08-2P',purpose='Input connector; exact vendor footprint pending')
add('F1','1 A / >=63 V','FUSE',63.5,35.56,{'1':'VIN_RAW','2':'VIN_FUSED'},'Fuse:Fuse_1206_3216Metric',rot=90,purpose='Input fault protection; sourcing pending')
add('D1','SS110','D',93.98,35.56,{'1':'VIN','2':'VIN_FUSED'},D,rot=180,mpn='SS110',purpose='Input reverse-polarity protection')
add('C1','10u / 100 V','C',121.92,40.64,{'1':'VIN','2':'PGND'},'Capacitor_SMD:C_1812_4532Metric',mpn='C4532X7R2A106M230KB',purpose='Input reservoir; DC-bias curve must be checked')
add('C2','10u / 100 V','C',147.32,40.64,{'1':'VIN','2':'PGND'},'Capacitor_SMD:C_1812_4532Metric',mpn='C4532X7R2A106M230KB')
add('T1','PLANAR 4:2 / Lm 12uH','T',215.9,48.26,{'1':'VIN','2':'SW','3':'GND_ISO','4':'SEC_A','5':'PRI_MID'},'Flyback:Planar_EELP32_4T_2T',mpn='PS-MAG-001 prepared assembly',purpose='Four winding layers on a six-layer PCB; pad 5 is the internal primary series via; prepared N87 core pair')
add('D2','PDS835L-13','D',259.08,43.18,{'1':'+5V_ISO','2':'SEC_A'},'Diode_SMD:D_PowerDI-5',rot=180,mpn='PDS835L-13',code='C444972')
add('C3','180u / 16 V polymer','CP',287.02,48.26,{'1':'+5V_ISO','2':'GND_ISO'},'Flyback:CP_Panasonic_C6',mpn='16SVPF180M')
add('C4','22u / 16 V','C',314.96,48.26,{'1':'+5V_ISO','2':'GND_ISO'},C,mpn='GRM32ER71C226KE18L')
add('J2','5 V / 1 A isolated','J',355.6,45.72,{'1':'+5V_ISO','2':'GND_ISO'},'Flyback:Terminal_2P_5.08',mpn='KF301-5.08-2P')
add('U1','LT8302ES8E#PBF','LT8302',88.9,111.76,{'1':'UVLO','2':'INTVCC','3':'VIN','4':'PGND','5':'SW','6':'RFB','7':'RREF','8':'TC','9':'PGND'},'Flyback:SOIC8_EP_LT_S8E',mpn='LT8302ES8E#PBF',code='C117331')
add('C5','1u / 10 V','C',40.64,124.46,{'1':'INTVCC','2':'PGND'},'Capacitor_SMD:C_0603_1608Metric')
add('R1','681k 1%','R',139.7,101.6,{'1':'VIN','2':'UVLO'},R)
add('R2','61.9k 1%','R',139.7,132.08,{'1':'UVLO','2':'PGND'},R)
add('R3','106k 0.1%','R',187.96,101.6,{'1':'SW','2':'RFB'},R)
add('R4','10k 0.1%','R',187.96,132.08,{'1':'RREF','2':'PGND'},R)
add('R5','118k 1%','R',228.6,101.6,{'1':'TC','2':'RREF'},R,purpose='Initial temperature compensation; bench trim required')
add('R6','39R 0.5 W','R',276.86,101.6,{'1':'VIN','2':'SNUB'},'Resistor_SMD:R_1206_3216Metric')
add('C6','470p / 100 V C0G','C',276.86,132.08,{'1':'SNUB','2':'SW'},'Capacitor_SMD:C_0805_2012Metric')
add('D3','DFLS1100-7','D',320.04,132.08,{'1':'CLAMP','2':'SW'},'Diode_SMD:D_PowerDI-123',rot=270,mpn='DFLS1100-7')
add('D4','SMAJ15A','TVS',320.04,101.6,{'1':'CLAMP','2':'VIN'},D,rot=270,mpn='SMAJ15A',purpose='Avalanche clamp; waveform validation required')
add('R7','499R 0.25 W','R',355.6,101.6,{'1':'+5V_ISO','2':'GND_ISO'},'Resistor_SMD:R_1206_3216Metric',purpose='10 mA minimum load at 5 V')
add('#FLG01','PWR_FLAG','FLAG',35.56,172.72,{'1':'VIN'})
add('#FLG02','PWR_FLAG','FLAG',66.04,172.72,{'1':'PGND'})

def wire(points):
  for a,b in zip(points,points[1:]):
    if math.dist(a,b)<1e-6:continue
    elements.append(f'(wire (pts (xy {a[0]:.6f} {a[1]:.6f})(xy {b[0]:.6f} {b[1]:.6f})) (stroke (width 0) (type default)) (uuid {uid(str(a)+str(b))}))')
def at(ref,pin):return endpoints[(ref,str(pin))]
def junction(x,y):elements.append(f'(junction (at {x} {y}) (diameter 0) (color 0 0 0 0) (uuid {uid("junction"+str((x,y)))}))')
def netlabel(net,x,y):elements.append(f'(label {q(net)} (at {x} {y} 0) (effects (font (size 1 1)) (justify left bottom)) (uuid {uid("bus"+net)}))')
wire([at('J1',1),(40.64,34.29),(40.64,35.56),(50.8,35.56),at('F1',1)])
wire([at('F1',2),(73.66,35.56),at('D1',2)])
netlabel('VIN_RAW',50.8,35.56);netlabel('VIN_FUSED',73.66,35.56)
wire([at('D1',1),(121.92,35.56),(147.32,35.56),(160.02,35.56),(180.34,35.56),(180.34,43.18),at('T1',1)])
netlabel('VIN',160.02,35.56)
wire([at('J1',2),(40.64,36.83),(40.64,55.88),(121.92,55.88),(147.32,55.88)])
for ref,x in [('C1',121.92),('C2',147.32)]:wire([at(ref,2),(x,55.88)]);junction(x,35.56)
junction(121.92,55.88);netlabel('PGND',147.32,55.88)
wire([at('T1',4),(240.03,43.18),at('D2',2)])
netlabel('SEC_A',240.03,43.18)
wire([at('D2',1),(287.02,43.18),(314.96,43.18),(350.52,43.18),at('J2',1)])
wire([at('T1',3),(238.76,53.34),(238.76,60.96),(287.02,60.96),(314.96,60.96),(350.52,60.96),at('J2',2)])
for ref,x in [('C3',287.02),('C4',314.96)]:wire([at(ref,2),(x,60.96)]);junction(x,43.18);junction(x,60.96)
netlabel('+5V_ISO',314.96,43.18);netlabel('GND_ISO',314.96,60.96)
def text(s,x,y,size=2):elements.append(f'(text {q(s)} (at {x} {y} 0) (effects (font (size {size} {size})) (justify left)) (uuid {uid(s)}))')
text('PS-FLYBACK-5W  |  PCB PLANAR FLYBACK',20.32,15.24,3)
text('INPUT PROTECTION AND RESERVOIR',20.32,22.86,1.6)
text('PLANAR TRANSFORMER AND ISOLATED OUTPUT',190.5,22.86,1.6)
text('PRIMARY-SIDE REGULATION',20.32,78.74,1.6)
text('UVLO',129.54,78.74,1.6);text('FEEDBACK / TEMPERATURE TRIM',175.26,78.74,1.6)
text('LEAKAGE CLAMP AND DAMPING',264.16,78.74,1.6)
text('A0 DEVELOPMENT - NOT RELEASED FOR MANUFACTURE',20.32,195.58,2.5)
text('T1: F.Cu + B.Cu are two 2-turn primary sections in series; In1.Cu + In4.Cu are two 2-turn secondary sections in parallel.',20.32,208.28,1.5)
text('Six-layer PCB. In2.Cu carries the secondary inner-terminal return. T1 pin 5 is the internal primary series via, not an external lead.',20.32,246.38,1.5)
text('Primary dot = VIN; secondary dot = GND_ISO. PGND and GND_ISO must remain galvanically separate.',20.32,215.9,1.5)
text('Prepared EELP32 N87 set: nominal 0.21 mm center-leg gap. Target AL about 747 nH; verify Lm about 12 uH after assembly.',20.32,223.52,1.5)
text('JLCPCB must confirm procurement, gap preparation and core installation. Stock ungapped halves are NOT substitutes.',20.32,231.14,1.5)
text('Functional low-voltage isolation only. Output trim, ringing, thermal performance and startup need prototype validation.',20.32,238.76,1.5)
root=f'''(kicad_sch (version 20250114) (generator "eeschema") (uuid {uid(NAME)}) (paper "A3")
(title_block (title "18-36 V to isolated 5 V / 1 A planar flyback") (date "2026-09-29") (rev "A0-development") (company "Planar Studio example"))
(lib_symbols {''.join(definitions.values())}) {''.join(elements)} (embedded_fonts no))'''
(CAD/f'{NAME}.kicad_sch').write_text(root,encoding='utf8')
lib='(kicad_symbol_lib (version 20250114) (generator "kicad_symbol_editor") '+''.join(v.replace(f'"Flyback:{k}"',q(k),1) for k,v in definitions.items())+')'
(CAD/'Flyback.kicad_sym').write_text(lib,encoding='utf8')
(CAD/'sym-lib-table').write_text('(sym_lib_table (lib (name "Flyback") (type "KiCad") (uri "${KIPRJMOD}/Flyback.kicad_sym") (options "") (descr "Project symbols")))')
(CAD/'fp-lib-table').write_text('(fp_lib_table (lib (name "Flyback") (type "KiCad") (uri "${KIPRJMOD}/Flyback.pretty") (options "") (descr "Project footprints")))')
(CAD/f'{NAME}.kicad_pro').write_text(json.dumps({'meta':{'filename':f'{NAME}.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':.2,'min_track_width':.2,'min_via_diameter':.6,'min_through_hole_diameter':.3}}}},indent=2))
(ROOT/'circuit.json').write_text(json.dumps({'project':NAME,'root_uuid':uid(NAME),'parts':parts},indent=2))
print(f'Generated {len(parts)} components and native KiCad schematic.')
