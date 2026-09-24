"""Run native placement/replacement/GUI undo on a newly owned Linux KiCad GUI.

Run under: xvfb-run -a dbus-run-session -- python tests/kicad-live-ci.py --ci-owned
Requires pcbnew, kicad-cli, xdotool, Node, and requirements.txt. No installed
user configuration is read or modified. The only board is generated here.

Configuration sources verified against KiCad's official 9.0 source mirror:
qa/data/config/9.0/kicad_common.json, common/paths.cpp, common/api/api_server.cpp.
"""
import argparse
import builtins
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import time

from native_board_identity import native_board_path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ci-owned', action='store_true', required=True, help='Authorize launching and controlling this test’s own disposable GUI')
args = parser.parse_args()
if sys.platform != 'linux' or not os.environ.get('DISPLAY'):
    raise SystemExit('This launcher requires Linux and a dedicated X display such as xvfb-run.')
for command in ['pcbnew', 'kicad-cli', 'xdotool', 'node']:
    if not shutil.which(command):
        raise SystemExit(f'Required executable is unavailable: {command}')
from kipy import KiCad

output = ROOT / '.test-state' / 'kicad-live'
output.mkdir(parents=True, exist_ok=True)
run_dir = Path(tempfile.mkdtemp(prefix='run-', dir=str(output))).resolve()
board = run_dir / 'pcb-litz-smoke.kicad_pcb'
script = """
import {buildLitz,litzPreset} from './web/js/engine/litz.js';
import {exportKicadPcb} from './web/js/engine/exporters.js';
const g=buildLitz({...litzPreset(),litzOutline:true});
for(const key of ['tracks','arcs','vias','pads','labels']) g.art[key]=[];
console.log(exportKicadPcb(g.art));
"""
board.write_text(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True), encoding='utf-8')
board.with_suffix('.kicad_pro').write_text(json.dumps({'meta': {'version': 1, 'filename': board.with_suffix('.kicad_pro').name},
    'board': {'design_settings': {'rules': {'allow_blind_buried_vias': True}}}}), encoding='utf-8')
version = subprocess.check_output(['kicad-cli', '--version'], text=True).strip()
match = re.search(r'(\d+)\.(\d+)', version)
if not match:
    raise SystemExit('Cannot determine the installed KiCad settings version.')
settings = run_dir / 'config' / f'{match[1]}.{match[2]}'
settings.mkdir(parents=True)
(settings / 'kicad_common.json').write_text(json.dumps({'meta': {'version': 3}, 'api': {'enable_server': True},
    'do_not_show_again': {'data_collection_prompt': True, 'update_check_prompt': True},
    'system': {'autosave_interval': 0}, 'auto_backup': {'enabled': False}}), encoding='utf-8')
(settings / 'pcbnew.json').write_text(json.dumps({'meta': {'version': 5}, 'system': {'first_run_shown': True}, 'graphics': {'canvas_type': 1}}), encoding='utf-8')
(settings / 'fp-lib-table').write_text('(fp_lib_table (version 7))\n', encoding='utf-8')
(settings / 'sym-lib-table').write_text('(sym_lib_table (version 7))\n', encoding='utf-8')

def xdo(*parts, check=True):
    return subprocess.run(['xdotool', *map(str, parts)], check=check, capture_output=True, text=True, timeout=10)

# Unix socket path length is limited; keep the owned socket temp directory short.
with tempfile.TemporaryDirectory(prefix='plitz-') as socket_temp:
    env = os.environ.copy()
    env.update({'KICAD_CONFIG_HOME': str(run_dir / 'config'), 'KICAD_DOCUMENTS_HOME': str(run_dir / 'documents'),
        'KICAD_CACHE_HOME': str(run_dir / 'cache'), 'XDG_CONFIG_HOME': str(run_dir / 'xdg-config'),
        'XDG_CACHE_HOME': str(run_dir / 'xdg-cache'), 'TMPDIR': socket_temp, 'LIBGL_ALWAYS_SOFTWARE': '1',
        'KICAD_API_SOCKET': f'ipc://{socket_temp}/kicad/api.sock'})
    # A token from another host must never route this owned session elsewhere.
    env.pop('KICAD_API_TOKEN', None)
    log = (run_dir / 'pcbnew.log').open('w', encoding='utf-8')
    process = subprocess.Popen(['pcbnew', str(board)], env=env, stdout=log, stderr=subprocess.STDOUT)
    previous_env, previous_argv, previous_input = os.environ.copy(), sys.argv[:], builtins.input
    last_titles = None
    def capture_owned_windows(label, screenshot=False):
        ids = xdo('search', '--onlyvisible', '--pid', process.pid, check=False).stdout.split()
        titles = {window: xdo('getwindowname', window, check=False).stdout.strip() for window in ids}
        (run_dir / f'{label}-windows.json').write_text(json.dumps(titles, indent=2), encoding='utf-8')
        if screenshot:
            # KiCad's Ubuntu package installs system Pillow. The launcher is
            # restricted to its dedicated X display; no host desktop is read.
            shot = subprocess.run(['/usr/bin/python3', '-c',
                'from PIL import ImageGrab; import sys; ImageGrab.grab().save(sys.argv[1])',
                str(run_dir / f'{label}.png')], capture_output=True, text=True, timeout=10)
            if shot.returncode:
                (run_dir / f'{label}-screenshot-error.txt').write_text(shot.stderr, encoding='utf-8')
        return titles
    try:
        os.environ.clear(); os.environ.update(env)
        deadline = time.monotonic() + 60
        client = None
        last_error = None
        while time.monotonic() < deadline and process.poll() is None:
            try:
                client = KiCad(socket_path=env['KICAD_API_SOCKET'], timeout_ms=500)
                client.ping()
                live = client.get_board()
                if live:
                    identity = {'name': live.name, 'projectPath': live.document.project.path,
                        'resolved': str(native_board_path(live))}
                    print('Owned KiCad document:', json.dumps(identity), flush=True)
                    (run_dir / 'document.json').write_text(json.dumps(identity, indent=2), encoding='utf-8')
                    if native_board_path(live) != board:
                        raise RuntimeError(f'Native document does not match the owned board: {identity}')
                    break
            except Exception as exc:
                last_error = str(exc)
            titles = capture_owned_windows('startup')
            if titles != last_titles:
                print('Owned KiCad startup windows:', json.dumps(titles), flush=True)
                last_titles = titles
            time.sleep(0.5)
        else:
            raise RuntimeError(f'Owned KiCad GUI did not open its IPC board: {last_error}; see {run_dir}')
        ids = xdo('search', '--onlyvisible', '--pid', process.pid, check=False).stdout.split()
        titles = {window: xdo('getwindowname', window).stdout.strip() for window in ids}
        (run_dir / 'windows.json').write_text(json.dumps(titles, indent=2), encoding='utf-8')
        windows = [window for window, title in titles.items() if board.stem in title]
        if len(windows) != 1:
            raise RuntimeError(f'Cannot uniquely identify the owned PCB editor window: {titles}')
        window = windows[0]
        def undo(_prompt):
            # The PID and exact test board title were verified above. Focus
            # only this owned window, then send its normal GUI undo shortcut.
            if process.poll() is not None:
                raise RuntimeError('Owned KiCad process exited before GUI undo.')
            xdo('windowfocus', '--sync', window)
            xdo('key', '--clearmodifiers', 'Escape')
            xdo('key', '--clearmodifiers', 'ctrl+z')
            return ''
        builtins.input = undo
        sys.argv = [str(ROOT / 'tests' / 'kicad-live-litz.py'), '--board-disposable', str(board), '--manual-undo']
        runpy.run_path(sys.argv[0], run_name='__main__')
        (run_dir / 'result.json').write_text(json.dumps({'ok': True, 'version': version, 'placement': 'passed',
            'replacement': 'passed', 'guiUndo': 'passed', 'board': str(board)}, indent=2), encoding='utf-8')
        print(f'Owned GUI placement, replacement, via spans, and two undo steps passed. Evidence: {run_dir}')
    except BaseException as exc:
        try:
            capture_owned_windows('failure', screenshot=True)
        except Exception as diagnostic_error:
            print(f'Could not capture owned GUI diagnostics: {diagnostic_error}', flush=True)
        (run_dir / 'result.json').write_text(json.dumps({'ok': False, 'version': version, 'error': str(exc)}, indent=2), encoding='utf-8')
        raise
    finally:
        builtins.input, sys.argv = previous_input, previous_argv
        os.environ.clear(); os.environ.update(previous_env)
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait(timeout=5)
        log.close()
