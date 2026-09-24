from pathlib import Path
from types import SimpleNamespace
import unittest

from native_board_identity import native_board_path


class NativeBoardIdentity(unittest.TestCase):
    def test_basename_uses_document_project_path(self):
        board = SimpleNamespace(name='pcb-litz-smoke.kicad_pcb',
            document=SimpleNamespace(project=SimpleNamespace(path='/tmp/owned-project')))
        self.assertEqual(native_board_path(board), Path('/tmp/owned-project/pcb-litz-smoke.kicad_pcb'))

    def test_absent_or_relative_project_is_not_resolved_against_cwd(self):
        for directory in ['', 'relative-project']:
            with self.subTest(directory=directory), self.assertRaises(ValueError):
                native_board_path(SimpleNamespace(name='pcb-litz-smoke.kicad_pcb',
                    document=SimpleNamespace(project=SimpleNamespace(path=directory))))

    def test_same_basename_in_another_project_does_not_match(self):
        board = SimpleNamespace(name='pcb-litz-smoke.kicad_pcb',
            document=SimpleNamespace(project=SimpleNamespace(path='/tmp/other-project')))
        self.assertNotEqual(native_board_path(board), Path('/tmp/owned-project/pcb-litz-smoke.kicad_pcb'))


if __name__ == '__main__':
    unittest.main()
