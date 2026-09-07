"""Exercise actual kipy serialization with a fake board, without a KiCad GUI."""
import unittest
from planar_studio import kicad_link as k

@unittest.skipUnless(k.HAVE_KIPY, 'Install requirements.txt to test IPC pad objects')
class SurfacePads(unittest.TestCase):
    def test_surface_pad_layers_nets_and_origin(self):
        from kipy.board_types import FootprintInstance, Net, PadType, BoardLayer
        class Board:
            def begin_commit(self): return 'commit'
            def push_commit(self, *args): pass
            def create_items(self, items): self.items = items; return items
        board = Board()
        link = k.KiCadLink()
        link._board = lambda: board
        primary = Net(); primary.name = 'T1_PRI'
        fallback = Net(); fallback.name = 'COIL'
        link.resolve_net = lambda name: {'T1_PRI': primary, 'COIL': fallback}.get(name)
        placement = k.Placement.from_payload({'name': 'T1', 'origin': [10, 20], 'pads': [
            {'x': 1, 'y': 2, 'w': 2, 'h': 3, 'shape': 'rect', 'number': '1', 'net': 'T1_PRI', 'layer': 'F.Cu'},
            {'x': 3, 'y': 4, 'w': 1, 'h': 1, 'shape': 'circle', 'number': '3', 'net': 'T1_SEC', 'layer': 'B.Cu'}]})
        self.assertEqual(placement.item_count(), 2)
        link.place(placement, net_name='COIL')
        self.assertEqual(len(board.items), 1)
        fp = board.items[0]
        self.assertIsInstance(fp, FootprintInstance)
        pads = fp.definition.pads
        self.assertEqual(pads[0].position.x, k.from_mm(11))
        self.assertEqual(pads[0].position.y, k.from_mm(22))
        self.assertEqual(pads[1].position.y, k.from_mm(24))
        self.assertEqual(pads[0].pad_type, PadType.PT_SMD)
        self.assertIn(BoardLayer.BL_B_Cu, pads[1].padstack.layers)
        self.assertNotIn(BoardLayer.BL_F_Cu, pads[1].padstack.layers)
        self.assertEqual(pads[0].net.name, 'T1_PRI')
        self.assertNotEqual(pads[1].net.name, 'COIL', 'Unknown secondary must never fall back to primary net')
        self.assertGreater(len(fp.proto.SerializeToString()), 0)
