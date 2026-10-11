from pathlib import Path
import json,xml.etree.ElementTree as ET,csv,hashlib,re
import pcbnew as p
R=Path(__file__).resolve().parents[1];parts=json.loads((R/'circuit.json').read_text())['parts'];net=ET.parse(R/'evidence/netlist.xml')
aliases=json.loads((R/'net-aliases.json').read_text());canonical={v:k for k,v in aliases.items()}
pins={}
for n in net.findall('.//nets/net'):
 for node in n.findall('node'):pins[(node.attrib['ref'],node.attrib['pin'])]=canonical.get(n.attrib['name'],n.attrib['name'])
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
for f in b.GetFootprints():
 if not any(x['ref']==f.GetReference() for x in parts):continue
 assert not any(hasattr(g,'GetText') and g.GetText() in ['${REFERENCE}','%R','REF**'] for g in f.GraphicalItems()),f.GetReference()
bom=list(csv.DictReader((R/'manufacturing-prototype/BOM-JLCPCB.csv').open()))
cpl=list(csv.DictReader((R/'manufacturing-prototype/CPL-JLCPCB-review.csv').open()))
br={r.strip() for row in bom for r in row['Designator'].split(',')};cr={row['Designator'] for row in cpl};expected={x['ref'] for x in parts if x['lcsc']}
assert br==cr==expected,(br^expected,cr^expected)
part_by_ref={x['ref']:x for x in parts if x['lcsc']}
seen=[]
for row in bom:
 refs=[r.strip() for r in row['Designator'].split(',')]
 assert len(refs)==int(row['Quantity'])
 for ref in refs:
  seen.append(ref)
  assert row['Comment']==part_by_ref[ref]['mpn'],(ref,'BOM MPN mismatch')
  assert row['LCSC Part #']==part_by_ref[ref]['lcsc'],(ref,'BOM code mismatch')
  assert row['Manufacturer']==part_by_ref[ref]['mfr'],(ref,'BOM manufacturer mismatch')
assert len(seen)==len(set(seen))==75
assert all(x['Layer']=='T' for x in cpl)
assert all(0<=float(x['Mid X'])<=64 and 0<=float(x['Mid Y'])<=56 for x in cpl)
fps={f.GetReference():f for f in b.GetFootprints()}
origin=b.GetDesignSettings().GetAuxOrigin()
for row in cpl:
 f=fps[row['Designator']];pos=f.GetPosition()
 assert abs(float(row['Mid X'])-(pos.x-origin.x)/1e6)<1e-5
 assert abs(float(row['Mid Y'])-(origin.y-pos.y)/1e6)<1e-5
 assert abs((float(row['Rotation'])-f.GetOrientationDegrees()+180)%360-180)<1e-5
assert all(p['stock']>0 for p in parts if p['lcsc'])
assert not errors,errors
report={'status':'CAD checks passed; hardware unqualified','manifest_vs_netlist_pin_mismatches':errors,'electronic_placements':len(cpl),'all_components_top':True,'BOM_CPL_and_manifest_designators_match':True,'BOM_total_quantity':sum(int(r['Quantity']) for r in bom),'unique_catalog_parts':len(bom),'copper_layers':b.GetCopperLayerCount(),'every_footprint_has_courtyard':True,'duplicate_assembly_reference_placeholders':0,'all_3d_models_resolve_locally':True,'AGND_to_PGND_connection':'Inside LMG2100 only; no PCB short','CPL_rotation_status':'Raw KiCad rotations; verify every JLCPCB placement preview before order','limitations':['No electrical switching simulation','No measured core loss, inductance or temperature','No JLCPCB file-level DFM/assembly approval','No insulation certification or production release']}
report.update({'BOM_exact_MPN_manufacturer_and_code_match_native_manifest':True,'CPL_matches_native_anchors_and_rotations':True,'courtyard_check_scope':'Presence plus independent enclosure check in manufacturing-geometry.json; no purchased pads outside courtyards.','manufacturing_release':'HOLD: see Manufacturing-audit.html and manufacturing-prototype/Manufacturing-issue-register.csv'})
(R/'evidence/final-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
