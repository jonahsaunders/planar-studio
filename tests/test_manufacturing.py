"""CLI absence/failure is explicit; fabricated subprocess results test plumbing only."""
import base64
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

from planar_studio.manufacturing import run_manufacturing


class ManufacturingWorkflow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.params = {'boardText': '(kicad_pcb (version 20221018))', 'filename': 'test.kicad_pcb'}

    def test_cli_absence_is_not_pass_and_package_explains_it(self):
        with patch('planar_studio.manufacturing.shutil.which', return_value=None):
            result = run_manufacturing(self.temp.name, self.params)
        self.assertFalse(result['ok']); self.assertFalse(result['available'])
        self.assertEqual(result['status'], 'unavailable')
        self.assertEqual(result['checks'], {})
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(result['files'][0]['content']))) as z:
            self.assertIn('test.kicad_pcb', z.namelist())
            self.assertIn('not run', z.read('README.txt').decode())
        self.assertTrue(Path(result['stage']).is_relative_to(Path(self.temp.name)))

    def fake_run(self, args, **kw):
        self.assertIs(kw['shell'], False)
        self.assertTrue(Path(kw['cwd']).is_relative_to(Path(self.temp.name)))
        self.assertGreater(kw['timeout'], 0)
        self.assertTrue(Path(kw['env']['KICAD_CONFIG_HOME']).is_relative_to(Path(kw['cwd'])))
        if args[-1] == '--version': return SimpleNamespace(returncode=0, stdout='9.0.0', stderr='')
        out = Path(args[args.index('--output') + 1])
        if 'drc' in args:
            out.write_text(json.dumps({'violations': [], 'unconnected_items': [], 'schematic_parity': []}))
        elif 'gerbers' in args: (out / 'test-F_Cu.gbr').write_text('mock gerber')
        elif 'drill' in args: (out / 'test-PTH.drl').write_text('mock drill')
        return SimpleNamespace(returncode=0, stdout='mock successful command', stderr='')

    def test_fixed_arguments_success_and_output_inventory(self):
        with patch('planar_studio.manufacturing.shutil.which', return_value='/usr/bin/kicad-cli'), patch('planar_studio.manufacturing.subprocess.run', side_effect=self.fake_run):
            result = run_manufacturing(self.temp.name, self.params)
        self.assertTrue(result['ok']); self.assertEqual(result['status'], 'generated')
        self.assertEqual(set(result['checks']), {'drc', 'gerbers', 'drill'})
        self.assertIn('fabrication/test-PTH.drl', result['artifacts'])
        project = json.loads((Path(result['stage']) / 'test.kicad_pro').read_text())
        self.assertEqual(project['board']['design_settings'], {'rules': {'allow_blind_buried_vias': True}})

    def test_report_violations_block_exports_even_on_zero_exit_code(self):
        calls = []
        def run(args, **kw):
            calls.append(args)
            value = self.fake_run(args, **kw)
            if 'drc' in args:
                Path(args[args.index('--output') + 1]).write_text(json.dumps({'violations': [{'severity': 'error'}]}))
            return value
        with patch('planar_studio.manufacturing.shutil.which', return_value='/usr/bin/kicad-cli'), patch('planar_studio.manufacturing.subprocess.run', side_effect=run):
            result = run_manufacturing(self.temp.name, self.params)
        self.assertFalse(result['ok']); self.assertEqual(result['status'], 'violations')
        self.assertEqual(len(calls), 2)

    def test_missing_report_or_command_timeout_never_passes(self):
        for mode in ['missing', 'timeout']:
            def run(args, **kw):
                if args[-1] == '--version': return self.fake_run(args, **kw)
                if mode == 'timeout': raise subprocess.TimeoutExpired(args, 120)
                return SimpleNamespace(returncode=0, stdout='', stderr='')
            with self.subTest(mode=mode), patch('planar_studio.manufacturing.shutil.which', return_value='/usr/bin/kicad-cli'), patch('planar_studio.manufacturing.subprocess.run', side_effect=run):
                result = run_manufacturing(self.temp.name, self.params)
            self.assertFalse(result['ok'])
            self.assertFalse(result['checks']['drc']['ok'])

    def test_filename_paths_and_option_injection_rejected(self):
        for filename in ['../other.kicad_pcb', '/tmp/other.kicad_pcb', '--help.kicad_pcb', 'a;touch x.kicad_pcb', 'x\\other.kicad_pcb']:
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                run_manufacturing(self.temp.name, {**self.params, 'filename': filename})
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_output_symlink_cannot_escape_store(self):
        outside = Path(self.temp.name) / 'outside'; outside.mkdir()
        store = Path(self.temp.name) / 'store'; store.mkdir()
        (store / 'manufacturing').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'within the application store'):
            run_manufacturing(str(store), self.params)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__': unittest.main()
