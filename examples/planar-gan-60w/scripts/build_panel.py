"""Generate a one-up factory-review panel with KiKit; never overwrite source.
Run using KiCad Python, passing the KiKit site-packages directory.
"""
from pathlib import Path
import sys,subprocess,json,csv,shutil,zipfile
sys.path.append(sys.argv[1])
import pcbnew as p
from kikit.ui import cli
R=Path(__file__).resolve().parents[1];O=R/'build/panel-A11';O.mkdir(parents=True,exist_ok=True)
source=R/'kicad/PS-GAN-60W.kicad_pcb';dest=O/'PS-GAN-60W-panel.kicad_pcb'
cli(['panelize','-p',str(R/'scripts/panelize.json'),'-d',str(O/'resolved.json'),str(source),str(dest)],standalone_mode=False)
b=p.LoadBoard(str(dest));s=p.LoadBoard(str(source))
for f in b.GetFootprints():
    for m in f.Models():
        m.m_Filename=m.m_Filename.replace('${KIPRJMOD}/3dmodels/','${KIPRJMOD}/../../kicad/3dmodels/')
p.SaveBoard(str(dest),b)
dest.write_text(dest.read_text(encoding='utf8').replace('${KIPRJMOD}/3dmodels/','${KIPRJMOD}/../../kicad/3dmodels/'),encoding='utf8')
b=p.LoadBoard(str(dest))
for f in b.GetFootprints():
    for model in f.Models():
        assert Path(str(model.m_Filename).replace('${KIPRJMOD}',str(O))).resolve().is_file(),model.m_Filename
(O/'fp-lib-table').write_text('(fp_lib_table (version 7) (lib (name "PS") (type "KiCad") (uri "${KIPRJMOD}/../../kicad/PS.pretty") (options "") (descr "Project footprints")))\n',encoding='utf8')
fps={f.GetReference():f for f in b.GetFootprints()};original={f.GetReference():f for f in s.GetFootprints()}
delta=fps['H1'].GetPosition()-original['H1'].GetPosition()
for ref,f in original.items():
    assert fps[ref].GetPosition()-f.GetPosition()==delta
    assert fps[ref].GetOrientationDegrees()==f.GetOrientationDegrees()
    assert sorted((q.GetNumber(),q.GetNetname()) for q in fps[ref].Pads())==sorted((q.GetNumber(),q.GetNetname()) for q in f.Pads()),ref
box=b.GetBoardEdgesBoundingBox();size=[p.ToMM(box.GetWidth()),p.ToMM(box.GetHeight())]
assert abs(size[0]-92)<.2 and abs(size[1]-76)<.2,size
K='C:/Program Files/KiCad/10.0/bin/kicad-cli.exe'
def run(*args):
    r=subprocess.run([K,*map(str,args)],capture_output=True,text=True)
    if r.returncode:raise RuntimeError(r.stdout+'\n'+r.stderr)
    print(r.stdout.strip())
run('pcb','drc','--output',O/'DRC.rpt','--exit-code-violations',dest)
run('pcb','export','gerbers','--output',O/'gerbers','--layers','F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,In5.Cu,In6.Cu,B.Cu,F.Mask,B.Mask,F.Paste,F.SilkS,B.SilkS,Edge.Cuts','--use-drill-file-origin','--subtract-soldermask',dest)
run('pcb','export','drill','--output',O/'gerbers','--drill-origin','plot','--excellon-separate-th','--excellon-units','mm',dest)
with zipfile.ZipFile(O/'Gerbers-PANEL-REVIEW.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for f in sorted((O/'gerbers').iterdir()):
        if f.is_file():archive.write(f,f.name)
run('pcb','export','pos','--output',O/'positions-raw.csv','--format','csv','--units','mm','--side','front','--exclude-dnp','--use-drill-file-origin',dest)
# Reuse the exact, already reviewed set of fitted reference designators.
refs={x['Designator'] for x in csv.DictReader((R/'manufacturing-prototype/CPL-JLCPCB-review.csv').open())}
origin=b.GetDesignSettings().GetAuxOrigin();rows=[]
for ref in sorted(refs):
    f=fps[ref];v=f.GetPosition();rows.append({'Designator':ref,'Mid X':round((v.x-origin.x)/1e6,6),'Mid Y':round((origin.y-v.y)/1e6,6),'Layer':'T','Rotation':f.GetOrientationDegrees()})
with (O/'CPL-JLCPCB-panel-review.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
shutil.copy2(R/'manufacturing-prototype/BOM-JLCPCB.csv',O/'BOM-JLCPCB.csv')
drills=list(csv.DictReader((R/'manufacturing-prototype/Drill-process-map.csv').open()))
oldorigin=s.GetDesignSettings().GetAuxOrigin()
for row in drills:
    row['X_mm']=round(float(row['X_mm'])+(oldorigin.x+delta.x-origin.x)/1e6,6)
    row['Y_mm']=round(float(row['Y_mm'])+(origin.y-oldorigin.y-delta.y)/1e6,6)
with (O/'Drill-process-map-panel.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=drills[0]);w.writeheader();w.writerows(drills)
run('pcb','render','--output',O/'Panel-top.png','--width','1700','--height','1400','--side','top','--background','opaque','--zoom','.86',dest)
run('pcb','export','pdf','--output',O/'Panel-assembly.pdf','--layers','F.Fab,Edge.Cuts','--mode-single','--black-and-white',dest)
report={'revision':'A11','size_mm':[92,76],'board_instances':1,'assembly_quantity':5,'panels_for_5_boards':5,'fitted_placements_per_panel':len(rows),'all_original_positions_translated_only':True,'translation_mm':[p.ToMM(delta.x),p.ToMM(delta.y)],'source_origin_mm':[p.ToMM(s.GetDesignSettings().GetAuxOrigin().x),p.ToMM(s.GetDesignSettings().GetAuxOrigin().y)],'panel_origin_mm':[p.ToMM(origin.x),p.ToMM(origin.y)],'frame_width_mm':7,'connector_side_gap_mm':7,'top_bottom_gap_mm':3,'tabs':'2 top + 2 bottom, 5 mm wide; no connector-side tabs','mousebite_drill_mm':.5,'mousebite_pitch_mm':.75,'tooling_holes':3,'tooling_diameter_mm':2,'panel_fiducials':3,'frame_copper':'None; no floating perimeter ring','DRC_violations':0,'status':'Factory-review panel; routing, tab positions, overhang, pallet and process acceptance remain open. Do not mix panel CPL with single-board Gerbers.'}
(R/'evidence/panel-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
(O/'README.txt').write_text('A11 ONE-UP HANDLING PANEL — FACTORY REVIEW\n5 panels produce 5 boards. Use this directory’s panel Gerbers and panel CPL together.\nDo not combine with the single-board CPL. Exact BOM is unchanged.\nKeep connector and mounting holes open; fill/cap only 0.30 mm interconnects.\nKeep 0.50 mm mouse bites and 2.00 mm tooling holes open.\nDepanelize after soldering/inspection and before fitting the ferrite and clips.\nSupplier must approve tabs, fixture access, 7 mm connector-side clearance and core-fitting service.\nThis panel is not a manufacturing authorization or a qualified converter.\n',encoding='utf8')
print(json.dumps(report,indent=2))
