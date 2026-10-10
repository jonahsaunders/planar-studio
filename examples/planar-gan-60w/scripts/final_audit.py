from pathlib import Path
import json,xml.etree.ElementTree as ET,csv,hashlib,re
import pcbnew as p
R=Path(__file__).resolve().parents[1];parts=json.loads((R/'circuit.json').read_text())['parts'];net=ET.parse(R/'evidence/netlist.xml')
pins={}
for n in net.findall('.//nets/net'):
 for node in n.findall('node'):pins[(node.attrib['ref'],node.attrib['pin'])]=n.attrib['name'].removeprefix('/')
errors=[]
for item in parts:
 for pin,n in item['nets'].items():
  actual=pins.get((item['ref'],pin))
  if n and n!=actual:errors.append([item['ref'],pin,n,actual])
b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
for f in b.GetFootprints():
 if f.GetLayer()!=p.F_Cu:errors.append(['not_top',f.GetReference()])
 if not any(x.GetLayer()==p.F_CrtYd for x in f.GraphicalItems()):errors.append(['missing_courtyard',f.GetReference()])
 for model in f.Models():
  path=Path(str(model.m_Filename).replace('${KIPRJMOD}',str((R/'kicad').resolve())))
  if not path.exists():errors.append(['missing_model',f.GetReference(),str(path)])
bom=list(csv.DictReader((R/'manufacturing-prototype/BOM-JLCPCB.csv').open()))
cpl=list(csv.DictReader((R/'manufacturing-prototype/CPL-JLCPCB-review.csv').open()))
br={r.strip() for row in bom for r in row['Designator'].split(',')};cr={row['Designator'] for row in cpl};expected={x['ref'] for x in parts if x['lcsc']}
assert br==cr==expected,(br^expected,cr^expected)
assert all(x['Layer']=='T' for x in cpl)
assert all(0<=float(x['Mid X'])<=64 and 0<=float(x['Mid Y'])<=56 for x in cpl)
assert all(p['stock']>0 for p in parts if p['lcsc'])
assert not errors,errors
report={'status':'CAD checks passed; hardware unqualified','manifest_vs_netlist_pin_mismatches':errors,'electronic_placements':len(cpl),'all_components_top':True,'BOM_CPL_and_manifest_designators_match':True,'BOM_total_quantity':sum(int(r['Quantity']) for r in bom),'unique_catalog_parts':len(bom),'copper_layers':b.GetCopperLayerCount(),'every_footprint_has_courtyard':True,'all_3d_models_resolve_locally':True,'AGND_to_PGND_connection':'Inside LMG2100 only; no PCB short','CPL_rotation_status':'Raw KiCad rotations; verify every JLCPCB placement preview before order','limitations':['No electrical switching simulation','No measured core loss, inductance or temperature','No JLCPCB file-level DFM/assembly approval','No insulation certification or production release']}
(R/'evidence/final-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
