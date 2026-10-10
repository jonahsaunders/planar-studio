"""Regenerate prototype review/fabrication files; abort on any ERC/DRC violation.
Usage: python scripts/export_review.py [full/path/to/kicad-cli]
This is an export gate, not authorization to order or a hardware qualification.
"""
from pathlib import Path
import subprocess,sys,csv,json,zipfile,shutil
R=Path(__file__).resolve().parents[1];K=Path(sys.argv[1]) if len(sys.argv)>1 else Path(shutil.which('kicad-cli') or 'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe')
SCH=R/'kicad/PS-GAN-60W.kicad_sch';PCB=SCH.with_suffix('.kicad_pcb');E=R/'evidence';M=R/'manufacturing-prototype';G=M/'gerbers'
for d in [E,M,G,E/'pcb-layers',E/'schematic-svg']:d.mkdir(parents=True,exist_ok=True)
def run(*a):
 r=subprocess.run([str(K),*[str(x) for x in a]],capture_output=True,text=True)
 print(r.stdout.strip())
 if r.returncode:raise RuntimeError(r.stderr+'\n'+r.stdout)
run('sch','erc','--output',E/'ERC.rpt','--exit-code-violations',SCH)
run('pcb','drc','--output',E/'DRC.rpt','--schematic-parity','--exit-code-violations',PCB)
run('sch','export','netlist','--format','kicadxml','--output',E/'netlist.xml',SCH)
# Keep the evidence portable; only normalize the source filename metadata.
n=E/'netlist.xml'
n.write_text(n.read_text(encoding='utf8').replace(str(SCH),'kicad/PS-GAN-60W.kicad_sch'),encoding='utf8')
run('sch','export','pdf','--output',R/'Schematic.pdf','--drawing-sheet',R/'kicad/schematic-frame.kicad_wks',SCH)
run('sch','export','svg','--output',E/'schematic-svg','--drawing-sheet',R/'kicad/schematic-frame.kicad_wks',SCH)
run('sch','export','bom','--fields','Value,Voltage,Reference,Footprint,LCSC,QUANTITY','--labels','Comment,Voltage,Designator,Footprint,LCSC Part #,Quantity','--group-by','LCSC','--ref-range-delimiter','','--output',M/'BOM-JLCPCB.csv',SCH)
run('pcb','export','gerbers','--output',G,'--layers','F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,In5.Cu,In6.Cu,B.Cu,F.Mask,B.Mask,F.Paste,F.SilkS,B.SilkS,Edge.Cuts','--use-drill-file-origin','--subtract-soldermask',PCB)
run('pcb','export','drill','--output',G,'--drill-origin','plot','--excellon-separate-th','--excellon-units','mm','--generate-report','--report-path',E/'Drill-report.txt',PCB)
run('pcb','export','pos','--output',E/'positions-raw.csv','--format','csv','--units','mm','--side','front','--exclude-dnp','--use-drill-file-origin',PCB)
from convert_position import convert_positions
convert_positions(E/'positions-raw.csv',M/'CPL-JLCPCB-review.csv')
run('pcb','export','svg','--output',E/'pcb-layers','--layers','F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,In5.Cu,In6.Cu,B.Cu,F.Fab','--common-layers','Edge.Cuts','--mode-multi','--fit-page-to-board','--exclude-drawing-sheet',PCB)
run('pcb','export','pdf','--output',R/'PCB-layers.pdf','--layers','F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,In5.Cu,In6.Cu,B.Cu,F.Fab','--common-layers','Edge.Cuts','--mode-multipage',PCB)
run('pcb','render','--output',R/'Board-preview.png','--width','1600','--height','1400','--side','top','--background','opaque','--zoom','0.88',PCB)
run('pcb','render','--output',R/'Board-perspective.png','--width','1500','--height','1100','--rotate','-40,0,25','--background','opaque','--zoom','0.9',PCB)
run('pcb','render','--output',R/'evidence/Board-bottom.png','--width','1500','--height','1100','--side','bottom','--background','opaque',PCB)
with zipfile.ZipFile(M/'Gerbers-PROTOTYPE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(G.iterdir()):
  if f.is_file():z.write(f,f.name)
print('Review exports complete. No fabrication order has been placed.')
