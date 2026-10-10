"""Independent datasheet pin-function checklist against the native schematic.

Pin functions were transcribed from manufacturer datasheets, not circuit.json.
Expected nets describe this design's intended application of those functions.
This is a static connection check, not functional or switching qualification.
Requires sexpdata; run after exporting the native XML netlist.
"""
from pathlib import Path
import json,xml.etree.ElementTree as ET
import sexpdata as sx
R=Path(__file__).resolve().parents[1]
def children(n,k):return [x for x in n if isinstance(x,list) and x and str(x[0])==k]
def first(n,k):return children(n,k)[0]
def walk(n,k):
 return ([n] if n and str(n[0])==k else [])+sum((walk(x,k) for x in n if isinstance(x,list)),[]) if isinstance(n,list) else []
sch=sx.loads((R/'kicad/PS-GAN-60W.kicad_sch').read_text(encoding='utf8'))
lib={s[1].removeprefix('PS:'):s for s in children(first(sch,'lib_symbols'),'symbol')}
instances={next(p[2] for p in children(s,'property') if p[1]=='Reference'):first(s,'lib_id')[1].removeprefix('PS:') for s in children(sch,'symbol')}
aliases={v:k for k,v in json.loads((R/'net-aliases.json').read_text()).items()}
xml=ET.parse(R/'evidence/netlist.xml');nets={}
for n in xml.findall('.//nets/net'):
 for p in n.findall('node'):nets[(p.attrib['ref'],p.attrib['pin'])]=aliases.get(n.attrib['name'],n.attrib['name'])
checks=[]
def check(ref,names,expected,source,section):
 actual={str(first(p,'number')[1]):str(first(p,'name')[1]) for p in walk(lib[instances[ref]],'pin')}
 assert actual=={str(i):n for i,n in names.items()},(ref,'pin functions',actual)
 for pin,net in expected.items():
  got=nets.get((ref,str(pin)))
  if net is None:assert got is None or got.startswith('unconnected-'),(ref,pin,got)
  else:assert got==net,(ref,pin,net,got)
 checks.append({'ref':ref,'source':source,'section':section,'functions':names,'expected_nets':expected,'result':'pass'})
ti='https://www.ti.com/lit/ds/symlink/'
check('U1',{**{i:'NC' for i in [1,2,3,4,8,9,16]},5:'SW',6:'PGND',7:'VIN',10:'HB',11:'HS',12:'HI',13:'LI',14:'VCC',15:'AGND',17:'PGND'},
 {**{i:None for i in [1,2,3,4,8,9,16]},5:'SW',6:'PGND',7:'VIN',10:'HB',11:'HS_LOCAL',12:'HI',13:'LI',14:'V5',15:'AGND',17:'PGND'},ti+'lmg2100r044.pdf','Pin configuration and functions; recommended supply 4.75 to 5.25 V')
check('U2',dict(enumerate(['DT','RT','OC','SS','GD2','GND','VCC','GD1'],1)),dict(enumerate(['DT','RT','OC','SS','GD2','AGND','BIAS12','GD1'],1)),ti+'ucc25600.pdf','Pin configuration and functions')
check('U3',dict(enumerate(['VG1','PGND','REG','VD1','VSS','VD2','VDD','VG2'],1)),dict(enumerate(['VG1','SGND','SR_REG','VS1','SGND','VS2','VOUT','VG2'],1)),ti+'ucc24624.pdf','Pin functions; REG bypass 2.2 uF to PGND')
check('U4',dict(enumerate(['GND','VIN','EN/UVLO','RON','FB','PGOOD','BST','SW','EP'],1)),dict(enumerate(['PGND','VIN','BIAS_EN','RON','BIAS_FB',None,'BIAS_BST','BIAS_SW','PGND'],1)),ti+'lm5164.pdf','Rev D, pin functions; on-time control and typical 12 V application')
check('U5',dict(enumerate(['IN','GND','EN','NC','OUT'],1)),dict(enumerate(['BIAS12','AGND','BIAS12',None,'V5'],1)),ti+'tps7a24.pdf','Fixed-output DBV pin functions')
for ref,gate,drain in [('Q1','SR_G1','SEC_A'),('Q2','SR_G2','SEC_B')]:
 check(ref,{**{i:'S' for i in [1,2,3]},4:'G',**{i:'D' for i in [5,6,7,8,9]}},{**{i:'SGND' for i in [1,2,3]},4:gate,**{i:drain for i in [5,6,7,8,9]}},ti+'csd18543q3a.pdf','Page 1 top view; footprint pad 9 represents exposed drain metal')
for ref,k,r in [('U7','FB_K','VREF'),('U9','OV_K','OV_REF')]:
 check(ref,{1:'CATHODE',2:'REF',3:'ANODE'},{1:k,2:r,3:'SGND'},ti+'tl431.pdf','TL431 DBZ pin mapping (not TL432 DBZ)')
for ref,a,k,c in [('U6','FB_LED','FB_K','FB_COL'),('U8','OV_LED','OV_K','SS')]:
 check(ref,{1:'AN',2:'CA',3:'EM',4:'COL'},{1:a,2:k,3:'AGND',4:c},'https://www.alldatasheet.com/html-pdf/1104261/EVERLIGHT/EL357N/565/1/EL357N.html','Everlight manufacturer datasheet Rev 6 page 1, hosted mirror; official product page https://en.everlight.com/photo_coupler_igbt_ssr/category-photo_transistor/4pin_sop_dc/')
check('D2',{1:'A',2:'C',3:'A/C'},{1:'AGND',2:'OC',3:'CS_RECT'},'https://www.onsemi.com/pdf/datasheet/bat54slt1-d.pdf','BAT54SLT1G Rev 18 page 1')
check('D1',{1:'K',2:'A'},{1:'VIN',2:'PGND'},'https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf','Unidirectional SMAJ54A; banded cathode matches footprint pad 1')
branches={'R16':{1:'PGND',2:'RON'},'C11':{1:'SR_REG',2:'SGND'},'C4':{1:'HB',2:'HS_LOCAL'},'C20':{1:'BIAS_BST',2:'BIAS_SW'},'J1':{1:'PGND',2:'VIN_RAW'},'J2':{1:'SGND',2:'VOUT'}}
for ref,pins in branches.items():
 for pin,net in pins.items():assert nets[(ref,str(pin))]==net,(ref,pin)
manifest={p['ref']:p for p in json.loads((R/'circuit.json').read_text())['parts']}
for ref,value in [('R16','100kR'),('C11','2.2uF'),('C4','100nF'),('C20','2.2nF')]:assert manifest[ref]['value']==value
report={'result':'pass','date':'2026-10-10','hardware_revision':'A4','schematic_revision':'A6','device_checks':checks,'critical_branches':branches,'bias_output_nominal_V':1.2*(1+453/49.9),'bias_frequency_nominal_kHz':1.2*(1+453/49.9)*2500/100,'limitations':'Static pin functions, device polarity and selected application connections checked. Does not establish startup, stability, protection thresholds, switching margins, insulation, efficiency or thermal performance.'}
(R/'evidence/datasheet-pin-review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(f'{len(checks)} device pin-function maps and {len(branches)} critical branches passed.')
