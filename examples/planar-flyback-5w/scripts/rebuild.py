"""Regenerate the example and check KiCad exports. Run with KiCad 10's Python."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

R = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--kicad-cli', default=os.environ.get('KICAD_CLI', 'kicad-cli'))
parser.add_argument('--node', default='node')
parser.add_argument('--cadquery-python', required=True, help='Python with cadquery==2.6.1, pygerber==2.4.3 and Pillow')
args = parser.parse_args()
os.environ.setdefault('KICAD_CONFIG_HOME', str(R / '.kicad-config'))
(R / '.kicad-config').mkdir(exist_ok=True)

def run(*command):
    subprocess.run([str(c) for c in command], cwd=R, check=True)

def py(name):
    run(sys.executable, R / 'scripts' / name)

run(args.cadquery_python, R / 'scripts/generate-core-model.py')
run(args.node, R / 'scripts/generate-winding.mjs')
py('generate-schematic.py')
py('generate-board.py')
sch = 'kicad/PS-FLYBACK-5W.kicad_sch'
pcb = 'kicad/PS-FLYBACK-5W.kicad_pcb'
run(args.kicad_cli, 'sch', 'erc', '--exit-code-violations', '-o', 'evidence/erc.rpt', sch)
run(args.kicad_cli, 'pcb', 'drc', '--exit-code-violations', '--refill-zones', '--schematic-parity', '--format', 'json', '-o', 'evidence/board-drc.json', pcb)
run(args.kicad_cli, 'sch', 'export', 'netlist', '--format', 'kicadxml', '-o', 'evidence/schematic-netlist.xml', sch)
# KiCad records an absolute source path; retain a portable reference in published evidence.
netlist = R / 'evidence/schematic-netlist.xml'
netlist.write_text(re.sub(r'<source>.*?</source>', f'<source>{sch}</source>', netlist.read_text(encoding='utf8')), encoding='utf8')
# Normalize published text before checks capture input hashes on Windows.
run(sys.executable, R / 'scripts/check-manifest.py', '--write')
py('verify-project.py')
py('verify-a3-layout.py')
py('verify-mounting-clearance.py')
py('verify-clip-copper.py')
py('verify-3d-models.py')
run(args.cadquery_python, R / 'scripts/audit-3d-solids.py', '--kicad-cli', args.kicad_cli)
run(args.cadquery_python, R / 'scripts/verify-core-fit.py', '--kicad-cli', args.kicad_cli)
py('calculate.py')
py('cycle-model.py')
run(args.kicad_cli, 'pcb', 'export', 'gerbers', '--layers',
    'F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,B.Cu,F.Mask,B.Mask,F.Paste,F.Silkscreen,B.Silkscreen,Edge.Cuts',
    '--use-drill-file-origin', '--subtract-soldermask', '--check-zones', '-o', 'manufacturing/gerbers/', pcb)
run(args.kicad_cli, 'pcb', 'export', 'drill', '--format', 'excellon', '--drill-origin', 'plot',
    '--excellon-separate-th', '--generate-map', '--map-format', 'svg', '--generate-report', '-o', 'manufacturing/gerbers/', pcb)
run(args.kicad_cli, 'pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'front',
    '--use-drill-file-origin', '-o', 'manufacturing/KiCad-positions.csv', pcb)
py('manufacturing-data.py')
# Calculations and CSV exports are inputs to the feedback provenance record.
# Normalize them before recording hashes so Windows publication stays exact.
run(sys.executable, R / 'scripts/check-manifest.py', '--write')
py('verify-placement.py')
py('render-placement.py')
py('verify-feedback.py')
py('render-sourcing-audit.py')
with tempfile.TemporaryDirectory(dir=R/'.kicad-config', prefix='flyback-svg-') as temp:
    run(args.kicad_cli, 'sch', 'export', 'svg', '-o', temp, sch)
    shutil.copy2(Path(temp) / 'PS-FLYBACK-5W.svg', R / 'evidence/schematic.svg')
for output, layers in [('evidence/board.svg', 'F.Cu,F.Silkscreen,Edge.Cuts'),
                       ('evidence/board-back.svg', 'B.Cu,B.Silkscreen,Edge.Cuts'),
                       ('manufacturing/assembly-top.svg', 'F.Fab,F.Silkscreen,Edge.Cuts')]:
    run(args.kicad_cli, 'pcb', 'export', 'svg', '--mode-single', '--fit-page-to-board',
        '--exclude-drawing-sheet', '--layers', layers, '-o', output, pcb)
py('render-layout.py')
run(sys.executable, R / 'scripts/check-manifest.py', '--write')
run(sys.executable, R / 'scripts/render-3d.py', '--kicad-cli', args.kicad_cli)
run(args.cadquery_python, R / 'scripts/audit-renders.py', '--skip-3d', '--kicad-cli', args.kicad_cli)
# Refresh derived HTML and review archive without leaving stale generated files.
with tempfile.TemporaryDirectory(dir=R.parent, prefix='flyback-package-') as temp:
    run(sys.executable, R / 'scripts/package-project.py', '--output', temp)
    package = Path(temp) / 'PS-FLYBACK-5W-A3'
    for file in [package / 'report.html', *list((package / 'manufacturing').glob('*.html')),
                 package / 'manufacturing/core-assembly.svg', package / 'manufacturing/GERBERS-REVIEW-ONLY.zip']:
        shutil.copy2(file, R / file.relative_to(package))
run(sys.executable, R / 'scripts/check-manifest.py', '--write')
print('Rebuild complete. Review changed files and previews before publishing. No hardware performance has been validated.')
