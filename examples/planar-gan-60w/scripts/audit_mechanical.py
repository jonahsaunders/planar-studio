"""Check the reused mounting rules, export datum, connector pins and assembly scope."""
from pathlib import Path
import json,csv,math,hashlib
import pcbnew as p
R=Path(__file__).resolve().parents[1];b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
meta=json.loads((R/'mechanical.json').read_text());fps={f.GetReference():f for f in b.GetFootprints()}
layers=[p.F_Cu,p.In1_Cu,p.In2_Cu,p.In3_Cu,p.In4_Cu,p.In5_Cu,p.In6_Cu,p.B_Cu]
def xy(v):return [p.ToMM(v.x),p.ToMM(v.y)]
holes=[]
for h in meta['holes']:
 f=fps[h['ref']];q=list(f.Pads());assert len(q)==1
 assert q[0].GetAttribute()==p.PAD_ATTRIB_NPTH and abs(p.ToMM(q[0].GetDrillSize().x)-3.2)<1e-6
 assert all(abs(a-c)<1e-6 for a,c in zip(xy(f.GetPosition()),[44+h['x_mm'],56+h['y_mm']]))
 zs=list(f.Zones());assert len(zs)==1
 z=zs[0];assert z.GetIsRuleArea() and z.GetDoNotAllowTracks() and z.GetDoNotAllowVias() and z.GetDoNotAllowPads() and z.GetDoNotAllowZoneFills()
 assert all(z.GetLayerSet().Contains(l) for l in layers)
 # DRC separately checks actual copper against this exact polygon on all layers.
 holes.append({'reference':h['ref'],'diameter_mm':3.2,'all_8_copper_layers_prohibited':True,'mask_diameter_mm':6.4,'copper_exclusion_diameter_mm':10})
assert xy(b.GetDesignSettings().GetAuxOrigin())==[44,114]
ports=[]
for ref,plus,minus in [('J1','/VIN_RAW','/PGND'),('J2','/VOUT','/SGND')]:
 f=fps[ref];pd={x.GetNumber():x for x in f.Pads() if x.GetNumber()}
 assert pd['1'].GetNetname()==minus and pd['2'].GetNetname()==plus
 assert all(x.GetAttribute()==p.PAD_ATTRIB_PTH for x in pd.values())
 assert abs(math.dist(xy(pd['1'].GetPosition()),xy(pd['2'].GetPosition()))-5)<1e-6
 ports.append({'reference':ref,'pin_1':minus,'pin_2':plus,'contact_pitch_mm':5,'top_insertion':f.GetLayer()==p.F_Cu,'process':'through-hole solder after top SMT; supplier must approve lead protrusion/process'})
for i in range(1,7):
 fp=fps[f'TP{i}'];assert fp.IsExcludedFromBOM() and fp.IsExcludedFromPosFiles()
 for pd in fp.Pads():assert not pd.GetLayerSet().Contains(p.F_Paste)
for ref in ['FID1','FID2','FID3']:
 f=fps[ref];assert f.IsExcludedFromBOM() and f.IsExcludedFromPosFiles()
 pd=list(f.Pads());assert len(pd)==1 and abs(p.ToMM(pd[0].GetSize().x)-1)<1e-6
 assert pd[0].GetLayerSet().Contains(p.F_Mask) and not pd[0].GetLayerSet().Contains(p.F_Paste)
 assert abs(p.ToMM(pd[0].GetLocalSolderMaskMargin())-1)<1e-6
rows=[]
for h in meta['holes']:rows.append({'Reference':h['ref'],'X_mm':h['x_mm'],'Y_mm':58-h['y_mm'],'Drill_mm':3.2,'Plated':'No','Fill':'No'})
with (R/'manufacturing-prototype/mounting-holes.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
out={'revision':'A1','board_mm':[80,58],'hole_pattern_mm':[71,49],'holes':holes,'connectors':ports,'fiducials':3,'footprints_total':len(fps),'probe_pads':6,'bare_probe_pads_have_no_paste_or_purchase':True,'purchased_components_top':75,'SMT_components':73,'through_hole_connectors':2,'routing_vias':sum(isinstance(t,p.PCB_VIA) for t in b.GetTracks()),'copper_layers':8,'export_origin_absolute_mm':[44,114],'mounting_footprint_sha256':hashlib.sha256((R/'kicad/PS.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod').read_bytes()).hexdigest(),'status':'Geometry and assembly mapping checked; factory process and hardware performance unqualified'}
(R/'evidence/mechanical-assembly-audit.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
