"""Real KiCad parser/DRC/Gerber/Excellon gate. --require-cli makes absence fail CI."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from planar_studio.manufacturing import run_manufacturing

parser = argparse.ArgumentParser()
parser.add_argument('--require-cli', action='store_true')
args = parser.parse_args()
if not shutil.which('kicad-cli'):
    print('NOT RUN: kicad-cli is absent; native DRC and fabrication output are unverified.')
    sys.exit(2 if args.require_cli else 0)
script = """
import {buildLitz,litzPreset} from './web/js/engine/litz.js';
import {exportKicadPcb} from './web/js/engine/exporters.js';
const g=buildLitz({...litzPreset(),litzOutline:true});
console.log(exportKicadPcb(g.art));
"""
board = subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True)
result = run_manufacturing(str(ROOT / '.test-state' / 'kicad-cli'), {'boardText': board, 'filename': 'pcb-litz.kicad_pcb'})
print(json.dumps({key: result[key] for key in ['available', 'ok', 'status', 'message', 'checks', 'stage', 'artifacts']}, indent=2))
sys.exit(0 if result['ok'] and result['status'] == 'generated' else 1)
