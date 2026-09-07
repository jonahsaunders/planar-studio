"""Live-board snapshot contract without a running KiCad instance."""
import unittest
from planar_studio.kicad_link import KiCadLink, LinkError

class Board:
    name = "unsaved-board.kicad_pcb"
    def get_as_string(self):
        return '(kicad_pcb (version 20240108))'
    def save(self):
        raise AssertionError("A snapshot must never save the board")

class SnapshotTests(unittest.TestCase):
    def test_reads_live_state_without_saving(self):
        link = KiCadLink()
        link._board = lambda: Board()
        snapshot = link.board_snapshot()
        self.assertEqual(snapshot['text'], Board().get_as_string())
        self.assertEqual(snapshot['source'], 'live')
        self.assertEqual(snapshot['name'], Board.name)

    def test_unsupported_api_has_import_fallback_message(self):
        link = KiCadLink()
        link._board = lambda: object()
        with self.assertRaisesRegex(LinkError, 'Import a saved .kicad_pcb'):
            link.board_snapshot()

    def test_non_text_snapshot_rejected(self):
        class InvalidBoard(Board):
            def get_as_string(self):
                return None
        link = KiCadLink()
        link._board = lambda: InvalidBoard()
        with self.assertRaises(LinkError):
            link.board_snapshot()

if __name__ == '__main__':
    unittest.main()
