"""Create JLCPCB review schedules from the final board and exported positions."""
import csv,json,math
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1];M=R/'manufacturing'
parts=json.loads((R/'circuit.json').read_text())['parts'];byref={p['ref']:p for p in parts}
positions=list(csv.DictReader((M/'KiCad-positions.csv').open()))
expected={p['ref'] for p in parts if p['ref']!='T1'}
assert {p['Ref'] for p in positions}==expected
def write(name,rows):
    with (M/name).open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
bom=[];cpl=[];master=[]
for p in parts:
    ref=p['ref'];master.append({'Reference':ref,'Quantity':1,'Value':p['value'],'Manufacturer':p['mfr'],'MPN':p['mpn'],'LCSC':p['lcsc'],'Footprint':p['footprint'],'Source':p['source'],'Notes':p['purpose'],'Sourcing_status':'Custom assembly acceptance required' if ref=='T1' else 'Catalog identity verified; JLCPCB stock/lead time not confirmed' if p['lcsc'] else 'Global sourcing quote required; no verified LCSC code'})
    if ref=='T1':continue
    bom.append({'Comment':p['mpn'],'Designator':ref,'Footprint':p['footprint'].split(':')[1],'LCSC Part #':p['lcsc']})
for p in positions:
    x=float(p['PosX']);y=float(p['PosY']);angle=float(p['Rot'])%360
    # Connector footprint origin is pin 1; JLCPCB Mid X/Y must be body center.
    if p['Ref'] in ['J1','J2']:
        a=math.radians(angle);x+=2.5*math.cos(a)-.2*math.sin(a);y+=-2.5*math.sin(a)-.2*math.cos(a)
    cpl.append({'Designator':p['Ref'],'Mid X':f'{x:.6f}mm','Mid Y':f'{y:.6f}mm','Layer':'Top','Rotation':f'{angle:.6f}'})
write('BOM-JLCPCB.csv',bom);write('CPL-JLCPCB.csv',cpl);write('BOM-MASTER.csv',master)
cores=[
 {'Item':'T1 core set','Quantity_per_board':'1 set / 2 halves','MPN':'PS-MAG-001 A0 prepared from 2 x TDK B66457G0000X187','Process':'Qualified supplier grinds one center leg; nominal total center gap 0.21 mm; final Lm acceptance per drawing','Sourcing_status':'JLCPCB/subcontractor procurement and installation acceptance required'},
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
assert len(cpl)==21 and len(bom)==21 and len(vias)==23
job=json.loads((M/'gerbers/PS-FLYBACK-5W-job.gbrjob').read_text())
assert job['GeneralSpecs']['LayerNumber']==6
assert len([x for x in job['FilesAttributes'] if x['FileFunction'].startswith('Copper')])==6
for f in job['FilesAttributes']:assert (M/'gerbers'/f['Path']).is_file()
drill=(M/'gerbers/PS-FLYBACK-5W-PTH.drl').read_text()
assert sum(1 for l in drill.splitlines() if l.startswith('X'))==len(vias)+4
out={'BOM_electronic_references':21,'CPL_references':21,'BOM_CPL_match':True,'SMD_components':19,'THT_connectors':2,'core_sets_per_board':1,'filled_capped_holes':23,'open_connector_holes':4,'copper_Gerbers':6,'coordinate_origin':'Bottom-left board datum; X right/Y up','connector_CPL_origin':'Body centroid corrected from pin-1 footprint origin','release_status':'Supplier review only; no manufacturing approval'}
(R/'evidence/manufacturing-checks.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
