"""Resolve KiCad's visible/automatic net names by exact connected-pin sets.
Requires kicad-cli. Run after redraw_schematic.py and before rebuild_board.py.
This refuses any electrical topology change.
"""
from pathlib import Path
import json, subprocess, sys, shutil, xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1]
K=sys.argv[1] if len(sys.argv)>1 else (shutil.which('kicad-cli') or 'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe')
sch=R/'kicad/PS-GAN-60W.kicad_sch';out=R/'evidence/netlist.xml'
subprocess.run([str(K),'sch','export','netlist','--format','kicadxml','--output',str(out),str(sch)],check=True)
out.write_text(out.read_text(encoding='utf8').replace(str(sch),'kicad/PS-GAN-60W.kicad_sch'),encoding='utf8')
parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']
expected={}
allowed=set()
for p in parts:
 for pin,net in p['nets'].items():
  if net:
   node=(p['ref'],pin);allowed.add(node);expected.setdefault(net,set()).add(node)
actual={}
for n in ET.parse(out).findall('.//nets/net'):
 nodes={(v.attrib['ref'],v.attrib['pin']) for v in n.findall('node')} & allowed
 if nodes:actual[n.attrib['name']]=nodes
aliases={}
for name,nodes in expected.items():
 matches=[key for key,value in actual.items() if value==nodes]
 assert len(matches)==1,(name,'connected-pin set changed',sorted(nodes),matches)
 aliases[name]=matches[0]
assert len(set(aliases.values()))==len(actual)==len(expected),'Unexpected split or merged net'
(R/'net-aliases.json').write_text(json.dumps(aliases,indent=2,sort_keys=True)+'\n',encoding='utf8')
print(f'{len(aliases)} nets match the circuit manifest by exact connected-pin sets.')
