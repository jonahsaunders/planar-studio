from pathlib import Path
import json,uuid,math,copy
from sexp import *
from library import load_symbol
from design import PARTS,ROOT,BYREF
CAD=ROOT/'kicad';NAME='CoilTile';NS=uuid.UUID('58969443-e904-48fd-a960-61c2508d3225')
def uid(s):return str(uuid.uuid5(NS,s))
def q(s):return json.dumps(str(s))
def effects(size=1.27,just='',hide=False):return f'(effects (font (size {size} {size}))'+(f' (justify {just})' if just else '')+(' (hide yes)' if hide else '')+')'
def prop(k,v,x,y,hide=False,size=1.27,just=''):return f'(property {q(k)} {q(v)} (at {x} {y} 0) {effects(size,just,hide)})'
PROPERTY_POS={}
WIRE_COLOR='0 150 0 1'
def style(kind):
 global WIRE_COLOR
 WIRE_COLOR={'power':'175 55 35 1','usb':'35 105 180 1','i2c':'135 65 165 1','sensor':'0 130 90 1','signal':'0 150 0 1'}[kind]
defs={}; pins={};elements=[];points={};instances={};symbols=[]
def define(lib,name):
 if name in defs:return
 s=load_symbol(lib,name);s[1]=Q('CoilTile:'+name)
 if name=='LDC1614':
  # Datasheet table specifies push-pull INTB, unlike the generic library parent.
  for p in walk(s,'pin'):
   if get(p,'number')[1]=='5':p[1]='output'
 pins[name]={get(p,'number')[1]:p for p in walk(s,'pin')}
 defs[name]=s
for p in PARTS:define(p['lib'],p['symbol'])
for p in ['GND','+3V3','PWR_FLAG']:define('power',p)
def add(ref,x,y,rot=0):
 p=BYREF[ref]; name=p['symbol'];suid=uid(ref);instances[ref]=(x,y,rot)
 if ref[0] in 'RCL' and not ref.startswith('U'):
  props=prop('Reference',ref,x+3.3,y-1.25,just='left')+prop('Value',p['value'],x+3.3,y+1.25,just='left',size=1.1)
 elif ref.startswith('TP'):props=prop('Reference',ref,x,y-5)+prop('Value',p['value'],x,y-2.5,size=1.1,hide=True)
 elif ref.startswith('H'):props=prop('Reference',ref,x,y-4)+prop('Value',p['value'],x,y+4,size=1.1)
 else:
  ys=[float(get(pin,'at')[2]) for pin in pins[name].values()]; top=y-max(ys)
  props=prop('Reference',ref,x-8,top-7,just='right')+prop('Value',p['value'],x-8,top-4,just='right')
 if ref in PROPERTY_POS:
  xx,yy=PROPERTY_POS[ref];props=prop('Reference',ref,xx,yy)+prop('Value',p['value'],xx,yy+3.81)
 for k,v in [('Footprint',p['footprint']),('Datasheet',p['source']),('MPN',p['mpn']),('Manufacturer',p['mfr']),('LCSC',p['lcsc'])]:props+=prop(k,v,x,y,True)
 elements.append(f'(symbol (lib_id "CoilTile:{name}") (at {x} {y} {rot}) (unit 1) (in_bom {"yes" if p["bom"] else "no"}) (on_board yes) (dnp no) (uuid {suid}) {props} '+''.join(f'(pin {q(n)} (uuid {uid(ref+"-"+n)}))' for n in pins[name])+f'(instances (project "{NAME}" (path "/{uid(NAME)}" (reference {q(ref)}) (unit 1)))))')
 for n,pin in pins[name].items():
  a=get(pin,'at');px,py=map(float,a[1:3]);theta=math.radians(rot)
  points[ref,n]=(round(x+px*math.cos(theta)-py*math.sin(theta),6),round(y-px*math.sin(theta)-py*math.cos(theta),6))
  if p['nets'].get(n) is None:elements.append(f'(no_connect (at {points[ref,n][0]} {points[ref,n][1]}) (uuid {uid("NC"+ref+n)}))')
 p['uuid']=suid

def at(ref,n):return points[ref,str(n)]
def wire(*ps):
 for a,b in zip(ps,ps[1:]):
  if math.dist(a,b)<1e-8:continue
  assert abs(a[0]-b[0])<1e-5 or abs(a[1]-b[1])<1e-5,(a,b)
  elements.append(f'(wire (pts (xy {a[0]} {a[1]})(xy {b[0]} {b[1]})) (stroke (width 0.1524) (type solid) (color {WIRE_COLOR})) (uuid {uid("wire"+str(a)+str(b))}))')
def junction(x,y):elements.append(f'(junction (at {x} {y}) (diameter 0) (color 0 0 0 0) (uuid {uid("junction"+str((x,y)))}))')
def label(net,x,y,just='left'):
 elements.append(f'(label {q(net)} (at {x} {y} 0) {effects(1.27,just+" bottom")} (uuid {uid("label"+net+str((x,y)))}))')
def power(net,x,y):
 name='GND' if net=='GND' else '+3V3'; ref='#PWR'+str(len(elements));val=net
 # For VBUS use the canonical +5V-style arrow but net identity is VBUS.
 if net=='VBUS':
  if 'VBUS' not in defs:
   define('power','VBUS')
  name='VBUS'
 elements.append(f'(symbol (lib_id "CoilTile:{name}") (at {x} {y} 0) (unit 1) (in_bom no) (on_board yes) (dnp no) (uuid {uid(ref)}) {prop("Reference",ref,x,y,True)} {prop("Value",val,x,y+(4 if net=="GND" else -4),size=1.1)} (instances (project "{NAME}" (path "/{uid(NAME)}" (reference "{ref}") (unit 1)))))')
def flag(x,y):
 ref='#FLG'+str(len(elements));elements.append(f'(symbol (lib_id "CoilTile:PWR_FLAG") (at {x} {y} 0) (unit 1) (in_bom no) (on_board yes) (dnp no) (uuid {uid(ref)}) {prop("Reference",ref,x,y,True)} {prop("Value","PWR_FLAG",x,y,True)} (instances (project "{NAME}" (path "/{uid(NAME)}" (reference "{ref}") (unit 1)))))')
def stub(ref,n,net=None,length=5.08):
 n=str(n);net=net or BYREF[ref]['nets'][n];x,y=at(ref,n);ang=float(get(pins[BYREF[ref]['symbol']][n],'at')[3]);rot=instances[ref][2];a=math.radians(ang+rot)
 # Extend opposite the inward-facing pin direction.
 end=(round(x-length*math.cos(a),6),round(y+length*math.sin(a),6));wire((x,y),end)
 if net in ['GND','+3V3','VBUS']:
  if abs(end[0]-x)>1e-5:
   dest=(end[0],end[1]+(3.81 if net=='GND' else -3.81));wire(end,dest);end=dest
  power(net,*end)
 else:label(net,*end,'right' if end[0]<x else 'left')
def text(t,x,y,size=1.3,bold=False):elements.append(f'(text {q(t)} (at {x} {y} 0) (effects (font (size {size} {size})'+(' (bold yes)' if bold else '')+f') (justify left)) (uuid {uid("text"+t)}))')
def box(a,b,title):
 elements.append(f'(rectangle (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width .25) (type default) (color 70 100 125 1)) (fill (type none)) (uuid {uid(title)}))');text(title,a[0]+4,a[1]+6,1.8,True)
exec((ROOT/'scripts/schematic-layout.py').read_text())
# Persist embedded symbols and a project-local library for consistent edits.
rootuid=uid(NAME)
header=f'(kicad_sch (version 20250114) (generator "eeschema") (uuid {rootuid}) (paper "A3") (title_block (title "CoilTile - 2 x 2 inductive sensing prototype") (date "2026-10-12") (rev "A3") (company "USB HID / Planar Studio"))'
(CAD/(NAME+'.kicad_sch')).write_text(header+' (lib_symbols '+''.join(dump(d) for d in defs.values())+')\n'+'\n'.join(elements)+f' (sheet_instances (path "/" (page "1"))))')
local=[]
for name,d in defs.items():s=copy.deepcopy(d);s[1]=Q(name);local.append(dump(s))
(CAD/'CoilTile.kicad_sym').write_text('(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")\n'+'\n'.join(local)+')')
(CAD/'sym-lib-table').write_text('(sym_lib_table (lib (name "CoilTile")(type "KiCad")(uri "${KIPRJMOD}/CoilTile.kicad_sym")(options "")(descr "Project-local symbols")))')
(CAD/'fp-lib-table').write_text('(fp_lib_table (lib (name "CoilTile")(type "KiCad")(uri "${KIPRJMOD}/CoilTile.pretty")(options "")(descr "Project-local footprints")))')
(ROOT/'circuit.json').write_text(json.dumps({'project':NAME,'root_uuid':rootuid,'parts':PARTS},indent=2))
(ROOT/'evidence/symbol-pins.json').write_text(json.dumps({n:{k:{'name':str(get(p,'name')[1]),'type':p[1]} for k,p in ps.items()} for n,ps in pins.items()},indent=2))
print('Generated',len(PARTS),'physical items and',len(elements),'schematic elements')
