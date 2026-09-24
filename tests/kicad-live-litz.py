"""Opt-in live-host smoke test; never run by automated unit tests.

Open an empty four-layer scratch board named *litz-smoke*.kicad_pcb with the
exported 0.07/0.4/0.07/0.5/0.07/0.4/0.07 mm stack, then pass its exact absolute
path via --board-disposable. This changes unsaved editor state and never saves.
--manual-undo also verifies the two Ctrl+Z actions in the KiCad GUI.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from planar_studio import kicad_link as k

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--board-disposable', required=True, help='Exact absolute path of an empty, disposable *litz-smoke*.kicad_pcb board')
parser.add_argument('--manual-undo', action='store_true', help='Pause for two manual Ctrl+Z actions and verify their effects')
args = parser.parse_args()
target = Path(args.board_disposable)
if not target.is_absolute() or target.suffix != '.kicad_pcb' or 'litz-smoke' not in target.stem:
    parser.error('Disposable board must have an absolute .kicad_pcb path with litz-smoke in its filename.')
link = k.KiCadLink('Planar Studio disposable-board test')
board = link._board()
if not Path(board.name).is_absolute() or Path(board.name).resolve() != target.resolve():
    raise SystemExit('Refusing: the open board does not match the exact disposable path.')
def inventory():
    return list(board.get_tracks()) + list(board.get_vias()) + list(board.get_footprints())
def wait_inventory(expected):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if {k._kiid(item) for item in inventory()} == expected:
            return True
        time.sleep(0.2)
    return False
if inventory():
    raise SystemExit('Refusing: the disposable board already contains copper or footprints.')
script = """
import {buildLitz,litzPreset} from './web/js/engine/litz.js';
import {toKicad} from './web/js/engine/artwork.js';
const g=buildLitz(litzPreset());
console.log(JSON.stringify({name:'Litz live smoke',...toKicad(g.art)}));
"""
payload = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))
placement = k.Placement.from_payload(payload)
warnings = link.preflight(placement)
if warnings:
    raise SystemExit('Refusing: the physical stack could not be verified: ' + '; '.join(warnings))
owned = set()
try:
    first = link.place(placement)
    owned.update(first['ids'])
    if len(first['ids']) != first['created']:
        raise RuntimeError('Native placement did not return every created item ID.')
    placement.origin = (5, 0)
    second = link.place(placement, replace_ids=first['ids'])
    owned.update(second['ids'])
    actual = {k._kiid(item) for item in inventory()}
    if actual != set(second['ids']) or actual.intersection(first['ids']):
        raise RuntimeError('Replacement did not preserve exactly the new item set.')
    vias = list(board.get_vias())
    if len(vias) != len(payload['vias']):
        raise RuntimeError('Native via count differs from exported geometry.')
    expected = sorted((s.get('from', 'F.Cu'), s.get('to', 'B.Cu'), s.get('viaType', 'through')) for s in payload['vias'])
    observed = sorted((k._layer_name(v.padstack.drill.start_layer), k._layer_name(v.padstack.drill.end_layer),
                       'blind_buried' if v.type == k.ViaType.VT_BLIND_BURIED else 'through') for v in vias)
    if observed != expected:
        raise RuntimeError('Native via spans do not match the exported geometry.')
    from kipy.board_types import SolderMaskMode
    terminals = [v for v in vias if v.type != k.ViaType.VT_BLIND_BURIED]
    if len(terminals) != 2 or any(surface.solder_mask_mode != SolderMaskMode.SMM_UNMASKED
            for v in terminals for surface in (v.padstack.front_outer_layers, v.padstack.back_outer_layers)):
        raise RuntimeError('Native solder terminal mask openings were not preserved.')
    if args.manual_undo:
        input('In KiCad press Ctrl+Z once to undo replacement, then press Enter here: ')
        if not wait_inventory(set(first['ids'])):
            raise RuntimeError('Undo replacement did not restore exactly the first placement.')
        input('In KiCad press Ctrl+Z once to undo initial placement, then press Enter here: ')
        if not wait_inventory(set()):
            raise RuntimeError('Undo placement did not restore the empty board.')
    print('Live placement, replacement, and native via spans passed.' + (' Manual undo passed.' if args.manual_undo else ' GUI undo was not tested.'))
finally:
    # Remove only test-owned IDs that are still present, and never save/revert.
    remaining = [k._kiid(item) for item in inventory() if k._kiid(item) in owned]
    if remaining:
        link.remove_ids(remaining)
