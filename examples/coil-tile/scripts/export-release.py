#!/usr/bin/env python3
"""Export a native-edited CoilTile with KiCad 9; refuses non-clean ERC/DRC."""
from pathlib import Path
import subprocess
import csv
import json
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CAD = ROOT / 'kicad'
PCB = CAD / 'CoilTile.kicad_pcb'
SCH = CAD / 'CoilTile.kicad_sch'
EVIDENCE = ROOT / 'evidence'
OUT = ROOT / 'manufacturing'


def run(*args):
    subprocess.run(['kicad-cli', *map(str,args)], check=True)


# Refill from the saved board before checking and exporting.
import pcbnew
board = pcbnew.LoadBoard(str(PCB))
board.BuildConnectivity()
pcbnew.ZONE_FILLER(board).Fill(board.Zones())
pcbnew.SaveBoard(str(PCB), board)
run('sch','erc','--exit-code-violations','-o',EVIDENCE/'erc.rpt',SCH)
run('pcb','drc','--schematic-parity','--exit-code-violations','--format','json','-o',EVIDENCE/'drc.json',PCB)
report = json.loads((EVIDENCE/'drc.json').read_text())
assert not any(report[k] for k in ['violations','unconnected_items','schematic_parity'])
run('sch','export','netlist','--format','kicadxml','-o',EVIDENCE/'netlist.xml',SCH)
run('sch','export','pdf','-o',ROOT/'docs/CoilTile-schematic.pdf',SCH)
run('sch','export','bom','--fields','Reference,Value,Footprint,${QUANTITY},MPN,Manufacturer,LCSC',
    '--labels','Designator,Comment,Footprint,Quantity,MPN,Manufacturer,LCSC Part #',
    '--group-by','Value,Footprint,MPN,LCSC','--ref-range-delimiter','','--exclude-dnp',
    '-o',OUT/'BOM-JLCPCB.csv',SCH)
run('pcb','export','pos','--format','csv','--units','mm','--side','both',
    '--exclude-dnp','--use-drill-file-origin','-o',EVIDENCE/'positions-raw.csv',PCB)
# KiStack convert_position.py column mapping; normalize equivalent negative angles.
rows=list(csv.DictReader((EVIDENCE/'positions-raw.csv').open()))
with (OUT/'CPL-JLCPCB.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['Designator','Mid X','Mid Y','Layer','Rotation'])
    for r in rows:
        w.writerow([r['Ref'],r['PosX'],r['PosY'],'T' if r['Side'].lower() in ('top','front') else 'B',f"{float(r['Rot'])%360:.6f}"])
bom=list(csv.DictReader((OUT/'BOM-JLCPCB.csv').open()))
brefs={r for row in bom for r in row['Designator'].split(',')}
assert brefs=={r['Ref'] for r in rows},'BOM/CPL reference mismatch'
assert all(row['LCSC Part #'] for row in bom),'Missing LCSC code'
g=OUT/'gerbers';g.mkdir(exist_ok=True)
run('pcb','export','gerbers','--layers','F.Cu,In1.Cu,In2.Cu,B.Cu,F.Mask,B.Mask,F.Paste,B.Paste,F.SilkS,B.SilkS,Edge.Cuts',
    '--subtract-soldermask','--use-drill-file-origin','-o',str(g)+'/',PCB)
run('pcb','export','drill','--format','excellon','--excellon-units','mm','--drill-origin','plot',
    '--excellon-separate-th','--generate-report','--report-path',EVIDENCE/'drill-report.txt','-o',str(g)+'/',PCB)
run('pcb','export','svg','--mode-single','--exclude-drawing-sheet','--layers','F.Fab,F.SilkS,Edge.Cuts',
    '--page-size-mode','2','-o',ROOT/'docs/assembly-top.svg',PCB)
with zipfile.ZipFile(OUT/'CoilTile-A3-fabrication.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(g.iterdir()):
        if f.is_file():z.write(f,f.name)
print(f'PASS: {len(brefs)} matched assembly references; clean native gates and fabrication export.')
