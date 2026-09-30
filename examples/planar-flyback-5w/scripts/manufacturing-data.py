"""Create JLCPCB review schedules from the final board and exported positions."""
import csv,json,math
from pathlib import Path
import pcbnew as pcb
from vendor.convert_position import convert_positions
R=Path(__file__).resolve().parents[1];M=R/'manufacturing'
parts=json.loads((R/'circuit.json').read_text())['parts'];byref={p['ref']:p for p in parts}
snapshot=json.loads((R/'sources/jlcpcb-stock.json').read_text())
stock={ref:row for row in snapshot['rows'] for ref in row['references']}
def sourcing_status(p):
    if p['ref']=='T1':return 'Separate core procurement allowed; preparation and installation require qualification'
    row=stock.get(p['ref'])
    if row and row['mpn']==p['mpn']:
        return row['status']+'; public catalog snapshot '+snapshot['observed_local_date']+'; not reserved; recheck stock, lead time and assembly acceptance'
    return 'Catalog identity only; repeat sourcing review'
positions=list(csv.DictReader((M/'KiCad-positions.csv').open()))
expected={p['ref'] for p in parts if p['ref']!='T1' and not p.get('exclude_from_bom')}
assert {p['Ref'] for p in positions}==expected
def write(name,rows):
    with (M/name).open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
bom=[];cpl=[];master=[]
for p in parts:
    if p.get('exclude_from_bom'):continue
    ref=p['ref'];master.append({'Reference':ref,'Quantity':1,'Value':p['value'],'Manufacturer':p['mfr'],'MPN':p['mpn'],'LCSC':p['lcsc'],'Footprint':p['footprint'],'Source':p['source'],'Notes':p['purpose'],'Sourcing_status':sourcing_status(p)})
    if ref=='T1':continue
    bom.append({'Comment':p['mpn'],'Designator':ref,'Footprint':p['footprint'].split(':')[1],'LCSC Part #':p['lcsc']})
corrected=[]
for p in positions:
    x=float(p['PosX']);y=float(p['PosY']);angle=float(p['Rot'])%360
    # Connector footprint origin is pin 1; JLCPCB Mid X/Y must be body center.
    if p['Ref'] in ['J1','J2']:
        a=math.radians(angle);x+=2.5*math.cos(a)-.2*math.sin(a);y+=-2.5*math.sin(a)-.2*math.cos(a)
    corrected.append({**p,'PosX':f'{x:.6f}','PosY':f'{y:.6f}','Rot':f'{angle:.6f}'})
# Apply the project-specific connector centroid correction before KiStack's
# unmodified placement converter; its generic converter does not know this offset.
with (M/'KiCad-positions-centroid.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,corrected[0].keys());w.writeheader();w.writerows(corrected)
convert_positions(M/'KiCad-positions-centroid.csv',M/'CPL-JLCPCB.csv')
cpl=list(csv.DictReader((M/'CPL-JLCPCB.csv').open()))
write('BOM-JLCPCB.csv',bom);write('BOM-MASTER.csv',master)
cores=[
 {'Item':'T1 core set','Quantity_per_board':'1 set / 2 halves','MPN':'PS-MAG-001 A0 prepared from 2 x TDK B66457G0000X187','Process':'Qualified supplier grinds one center leg; nominal total center gap 0.21 mm; final Lm acceptance per drawing','Sourcing_status':'Separate raw-core procurement from DigiKey permitted; preparation and installation require qualification'},
 {'Item':'External core adhesive','Quantity_per_board':'Supplier-qualified dispense','MPN':'Henkel LOCTITE AA 330','Process':'External outer-leg joints only; qualify geometry and cure; no adhesive in mating faces or center gap','Sourcing_status':'Proposed; supplier process qualification and quote required'},
 {'Item':'Adhesive activator','Quantity_per_board':'Per adhesive TDS','MPN':'Henkel LOCTITE SF 7387','Process':'Per current AA330/SF7387 technical data','Sourcing_status':'Supplier procurement and process qualification required'},
 {'Item':'Nonconductive retention strap','Quantity_per_board':'Supplier-defined cut length','MPN':'3M 69 12.7 mm; 3M ID 7000031352','Process':'Around yokes parallel to 31.75 mm core span; no metal loop; confirm fit and retention','Sourcing_status':'Supplier procurement and process qualification required'}]
write('CORE-BOM.csv',cores)
b=pcb.LoadBoard(str(R/'kicad/PS-FLYBACK-5W.kicad_pcb'));vias=[]
def add(name,p,drill):vias.append({'ID':name,'X_mm':f'{pcb.ToMM(p.x)-75:.6f}','Y_mm':f'{137-pcb.ToMM(p.y):.6f}','Finished_drill_mm':f'{pcb.ToMM(drill):.3f}','Process':'Epoxy fill and copper cap; NOT a connector lead hole'})
for i,t in enumerate(b.GetTracks()):
    if isinstance(t,pcb.PCB_VIA):add('via-'+str(i+1),t.GetPosition(),t.GetDrill())
for f in b.GetFootprints():
    if f.GetReference()=='T1':
        for p in f.Pads():add('T1-pad-'+p.GetNumber(),p.GetPosition(),p.GetDrillSize().x)
write('via-fill.csv',vias)
assert len(cpl)==len(expected) and len(bom)==len(expected)
assert len(vias)==len([t for t in b.GetTracks() if isinstance(t,pcb.PCB_VIA)])+5
job=json.loads((M/'gerbers/PS-FLYBACK-5W-job.gbrjob').read_text())
assert job['GeneralSpecs']['LayerNumber']==6
assert len([x for x in job['FilesAttributes'] if x['FileFunction'].startswith('Copper')])==6
for f in job['FilesAttributes']:assert (M/'gerbers'/f['Path']).is_file()
drill=(M/'gerbers/PS-FLYBACK-5W-PTH.drl').read_text()
assert sum(1 for l in drill.splitlines() if l.startswith('X'))==len(vias)+4
npth=(M/'gerbers/PS-FLYBACK-5W-NPTH.drl').read_text()
assert sum(1 for l in npth.splitlines() if l.startswith('X'))==4
assert 'C3.200' in npth
mechanical=json.loads((R/'mechanical.json').read_text())
expected_holes={f"X{h['x_mm']-75:.1f}Y{137-h['y_mm']:.1f}" for h in mechanical['holes']}
assert {line for line in npth.splitlines() if line.startswith('X')}==expected_holes
write('mounting-holes.csv',[{'Reference':h['ref'],'X_mm':h['x_mm']-75,'Y_mm':137-h['y_mm'],'Drill_mm':3.2,'Plated':'No','Fill':'No'} for h in mechanical['holes']])
out={'BOM_electronic_references':len(bom),'CPL_references':len(cpl),'BOM_CPL_match':True,'SMD_components':sum(bool(f.GetAttributes() & pcb.FP_SMD) for f in b.GetFootprints() if f.GetReference() in expected),'THT_connectors':2,'core_sets_per_board':1,'filled_capped_holes':len(vias),'open_connector_holes':4,'copper_Gerbers':6,'coordinate_origin':'Bottom-left board datum; X right/Y up','connector_CPL_origin':'Body centroid corrected from pin-1 footprint origin','release_status':'Supplier review only; no manufacturing approval'}
out.update({'nonplated_M3_mounting_holes':4,'mounting_holes_match_drill_coordinates':True,'mounting_holes_excluded_from_BOM_CPL':True,'CPL_converter':'KiStack convert_position.py, upstream commit 8494dbd; connector centroids corrected first'})
(R/'evidence/manufacturing-checks.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
