"""Build a separate one-board Standard-assembly panel with KiKit 1.8.1.

Run using KiCad Python with KiKit installed (or --kikit-path pointing to it).
The source converter board is never modified. Panel/factory acceptance remains open.
"""
import argparse,csv,hashlib,json,math,os,shutil,subprocess,sys,zipfile
from pathlib import Path
import pcbnew as pcb
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--kikit-path',type=Path)
p.add_argument('--kicad-cli',default='kicad-cli')
args=p.parse_args()
if args.kikit_path:sys.path.insert(0,str(args.kikit_path))
from kikit.ui import cli
from vendor.convert_position import convert_positions
out=R/'build/panel-A1';out.mkdir(parents=True,exist_ok=True)
os.environ.setdefault('KICAD_CONFIG_HOME',str(R/'.kicad-config'))
source=R/'kicad/PS-FLYBACK-5W.kicad_pcb';target=out/'PS-FLYBACK-5W-panel.kicad_pcb'
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
cli(['panelize','-p',str(R/'manufacturing/panelize.json'),'-d',str(out/'resolved.json'),str(source),str(target)],standalone_mode=False)
# Keep model and footprint references portable from the panel's separate directory.
target.write_text(target.read_text(encoding='utf8').replace('${KIPRJMOD}/3dmodels/','${KIPRJMOD}/../../kicad/3dmodels/'),encoding='utf8',newline='\n')
(out/'fp-lib-table').write_text((R/'kicad/fp-lib-table').read_text().replace('${KIPRJMOD}/','${KIPRJMOD}/../../kicad/'),encoding='utf8')
def run(*command):subprocess.run([str(c) for c in command],cwd=R,check=True)
run(args.kicad_cli,'pcb','drc','--exit-code-violations','--refill-zones','--format','json','-o',out/'drc.json',target)
drc=json.loads((out/'drc.json').read_text())
assert not drc['violations'] and not drc['unconnected_items']
b=pcb.LoadBoard(str(source));panel=pcb.LoadBoard(str(target))
def xy(v):return [pcb.ToMM(v.x),pcb.ToMM(v.y)]
fps={f.GetReference():f for f in b.GetFootprints()}
pfps={f.GetReference():f for f in panel.GetFootprints() if f.GetReference() in fps}
assert fps.keys()==pfps.keys()
delta=[v-u for u,v in zip(xy(fps['U1'].GetPosition()),xy(pfps['U1'].GetPosition()))]
for ref,f in fps.items():
    g=pfps[ref]
    assert f.GetValue()==g.GetValue() and f.GetOrientationDegrees()==g.GetOrientationDegrees()
    assert all(abs(v-u-d)<1e-6 for u,v,d in zip(xy(f.GetPosition()),xy(g.GetPosition()),delta))
    a=sorted((q.GetNumber(),q.GetNetname(),xy(q.GetSize()),xy(q.GetDrillSize())) for q in f.Pads())
    c=sorted((q.GetNumber(),q.GetNetname(),xy(q.GetSize()),xy(q.GetDrillSize())) for q in g.Pads())
    assert a==c,(ref,'Panel pad/net mismatch')
assert panel.GetCopperLayerCount()==6
assert len(list(b.GetTracks()))==len(list(panel.GetTracks()))
points=[xy(p) for s in panel.GetDrawings() if s.GetLayer()==pcb.Edge_Cuts for p in [s.GetStart(),s.GetEnd()]]
# Rounded rectangle extrema lie at its arc endpoints; exclude drawing stroke.
size=[max(p[k] for p in points)-min(p[k] for p in points) for k in [0,1]]
assert all(abs(a-e)<.02 for a,e in zip(size,[70,124])),size
extra=[f for f in panel.GetFootprints() if f.GetReference() not in fps]
fiducials=[f for f in extra if f.GetFPID().GetLibItemName()=='Fiducial']
tooling=[f for f in extra if any(abs(pcb.ToMM(q.GetDrillSize().x)-1.5)<1e-6 for q in f.Pads())]
assert len(fiducials)==6 and len(tooling)==3,(len(fiducials),len(tooling))
assert sum(f.GetLayer()==pcb.F_Cu for f in fiducials)==3
gerbers=out/'gerbers';gerbers.mkdir(exist_ok=True)
run(args.kicad_cli,'pcb','export','gerbers','--layers','F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,B.Cu,F.Mask,B.Mask,F.Paste,F.Silkscreen,B.Silkscreen,Edge.Cuts','--use-drill-file-origin','--subtract-soldermask','--check-zones','-o',str(gerbers)+os.sep,target)
run(args.kicad_cli,'pcb','export','drill','--format','excellon','--drill-origin','plot','--excellon-separate-th','--generate-map','--map-format','svg','-o',str(gerbers)+os.sep,target)
run(args.kicad_cli,'pcb','export','pos','--format','csv','--units','mm','--side','front','--use-drill-file-origin','-o',out/'KiCad-positions.csv',target)
rows=list(csv.DictReader((out/'KiCad-positions.csv').open()))
expected={r['Designator'] for r in csv.DictReader((R/'manufacturing/BOM-JLCPCB.csv').open(encoding='utf-8-sig'))}
rows=[r for r in rows if r['Ref'] in expected]
assert {r['Ref'] for r in rows}==expected and len(rows)==24
for r in rows:
    x,y=float(r['PosX']),float(r['PosY']);angle=float(r['Rot'])%360
    if r['Ref'] in ['J1','J2']:
        a=math.radians(angle);x+=2.5*math.cos(a)-.2*math.sin(a);y+=-2.5*math.sin(a)-.2*math.cos(a)
    r.update(PosX=f'{x:.6f}',PosY=f'{y:.6f}',Rot=f'{angle:.6f}')
with (out/'KiCad-positions-centroid.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
convert_positions(out/'KiCad-positions-centroid.csv',out/'CPL-JLCPCB.csv')
shutil.copy2(R/'manufacturing/BOM-JLCPCB.csv',out/'BOM-JLCPCB.csv')
# Translate the selective fill/cap schedule; panel tooling and mouse bites stay open.
old_origin=xy(b.GetDesignSettings().GetAuxOrigin());new_origin=xy(panel.GetDesignSettings().GetAuxOrigin())
schedule=list(csv.DictReader((R/'manufacturing/via-fill.csv').open(encoding='utf-8-sig')))
for r in schedule:
    r['X_mm']=f"{float(r['X_mm'])+old_origin[0]+delta[0]-new_origin[0]:.6f}"
    r['Y_mm']=f"{float(r['Y_mm'])-old_origin[1]-delta[1]+new_origin[1]:.6f}"
with (out/'via-fill.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,schedule[0].keys());w.writeheader();w.writerows(schedule)
run(args.kicad_cli,'pcb','export','svg','--mode-single','--fit-page-to-board','--exclude-drawing-sheet','--layers','F.Cu,F.Silkscreen,Edge.Cuts','-o',out/'panel-top.svg',target)
run(args.kicad_cli,'pcb','render','--output',out/'panel-top.png','--width','1200','--height','1600','--side','top','--background','opaque','--quality','high',target)
record={'source_board_sha256':source_hash,'panel_board_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'source_board_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==source_hash,'panel_size_mm':size,'board_count':1,'electronic_placements':24,'all_source_footprints_pad_nets_sizes_and_drills_preserved':True,'source_translation_mm':delta,'fiducials_per_face':3,'fiducials_total':6,'tooling_holes':3,'drc_violations':0,'unconnected_items':0,'scope':'Geometric/export checks only. Factory approval of panel, tab removal, tooling, paste, stack and process remains required.'}
assert record['source_board_unchanged']
(out/'panel-checks.json').write_text(json.dumps(record,indent=2)+'\n')
with zipfile.ZipFile(out/'PANEL-GERBERS-REVIEW-ONLY.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(gerbers.iterdir()):z.write(f,f.name)
print(json.dumps(record,indent=2))
