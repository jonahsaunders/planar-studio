"""Layer-span serialization and transaction failures, without a KiCad GUI."""
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from planar_studio import kicad_link as k
from planar_studio.app import Application
from planar_studio.server import Api, RpcError

STACK = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']


def placement(spans=None):
    spans = spans or [('F.Cu', 'In1.Cu'), ('In1.Cu', 'In2.Cu'), ('In2.Cu', 'B.Cu')]
    return k.Placement.from_payload({'name': 'Litz', 'designId': 'litz-1', 'boardLayers': STACK, 'origin': [10, 20],
        'vias': [{'x': i, 'y': 2, 'diameter': 0.6, 'drill': 0.3, 'from': a, 'to': b,
                  'viaType': 'blind_buried', 'strandId': f'strand-{i}'} for i, (a, b) in enumerate(spans)]})


class SpanValidation(unittest.TestCase):
    def test_legacy_numeric_indexes_remain_full_span(self):
        self.assertEqual(k._via_span({'from': 0, 'to': 1}), ('F.Cu', 'B.Cu', 'through'))

    def test_invalid_span_rejected_before_any_board_operation(self):
        bad = [
            {'from': 'In1.Cu', 'to': 'In2.Cu'},
            {'from': 'B.Cu', 'to': 'F.Cu', 'viaType': 'blind_buried'},
            {'from': 'In1.Cu', 'to': 'In1.Cu', 'viaType': 'blind_buried'},
            {'from': 'F.Cu', 'to': 'B.Cu', 'viaType': 'blind_buried'},
            {'from': 'Invalid.Cu', 'to': 'B.Cu', 'viaType': 'blind_buried'},
            {'from': 0, 'to': 1, 'viaType': 'blind_buried'},
        ]
        link = k.KiCadLink()
        link._board = lambda: self.fail('Invalid payload must fail before a board read')
        for spec in bad:
            with self.subTest(spec=spec), self.assertRaises(k.LinkError):
                link.preflight(k.Placement(vias=[spec]))

    def test_unknown_live_stack_blocks_before_api_serialization(self):
        link = k.KiCadLink(); link._board = lambda: object()
        with self.assertRaisesRegex(k.LinkError, 'Cannot verify the live board copper stack'):
            link.preflight(placement())

    def test_missing_binding_rejected_without_dynamic_attribute_fallback(self):
        with patch.object(k, 'ViaType', SimpleNamespace(VT_BLIND_BURIED=2)):
            with self.assertRaisesRegex(k.LinkError, 'Cannot safely place blind/buried'):
                k._configure_partial_via(SimpleNamespace(), placement().vias[0], STACK)

    def test_rpc_preflight_failure_keeps_previous_placement(self):
        app = Application.__new__(Application)
        app.api = Api()
        app.link = SimpleNamespace(preflight=lambda _: (_ for _ in ()).throw(k.LinkError('unsupported spans')))
        app.store = SimpleNamespace()  # Any attempt to read or forget prior state fails.
        app._register()
        with self.assertRaisesRegex(RpcError, 'unsupported spans'):
            app.api.call('board.place', {'replace': True, 'placement': {'vias': placement().vias}})

    def test_rpc_defers_replacement_to_transaction_and_records_only_success(self):
        app = Application.__new__(Application)
        app.api = Api()
        events = []
        def place(value, net_name=None, replace_ids=None):
            events.append(('place', replace_ids))
            return {'ids': ['new-via'], 'created': 1, 'replaced': 1}
        app.link = SimpleNamespace(preflight=lambda _: events.append(('preflight',)),
            board_context=lambda: {'name': 'board'}, place=place)
        app.store = SimpleNamespace(get_placement=lambda *_: {'ids': ['old-via']},
            record_placement=lambda *args, **_: events.append(('record', args[2])))
        app._register()
        result = app.api.call('board.place', {'replace': True, 'placement': {'vias': placement().vias}})
        self.assertEqual(events, [('preflight',), ('place', ['old-via']), ('record', ['new-via'])])
        self.assertEqual(result['replaced'], 1)


@unittest.skipUnless(k.HAVE_KIPY, 'Install requirements.txt to test actual IPC serialization')
class SerializedVias(unittest.TestCase):
    def setUp(self):
        class Board:
            def __init__(self):
                self.events = []
                self.old = SimpleNamespace(id='old-via')
                self.live = [self.old]
            def get_enabled_layers(self): return [k._resolve_layer(n) for n in STACK]
            def get_tracks(self): return []
            def get_vias(self): return self.live[:]
            def get_footprints(self): return []
            def begin_commit(self):
                self.events.append('begin'); self.before = self.live[:]; return 'commit'
            def create_items(self, items):
                self.events.append('create'); self.created = items; self.live += items; return items
            def remove_items(self, items):
                self.events.append('remove'); self.live = [v for v in self.live if v not in items]
            def push_commit(self, *args): self.events.append('push')
            def drop_commit(self, *args): self.events.append('drop'); self.live = self.before[:]
        self.board = Board()
        self.link = k.KiCadLink()
        self.link._board = lambda: self.board

    def test_front_inner_back_spans_survive_protobuf_round_trip(self):
        from kipy.board_types import Via, ViaType
        result = self.link.place(placement())
        self.assertEqual(result['created'], 3)
        for i, (item, spec) in enumerate(zip(self.board.created, placement().vias)):
            proto = type(item.proto)(); proto.ParseFromString(item.proto.SerializeToString())
            v = Via(proto=proto)
            self.assertEqual(v.type, ViaType.VT_BLIND_BURIED)
            self.assertEqual(v.padstack.drill.start_layer, k._resolve_layer(spec['from']))
            self.assertEqual(v.padstack.drill.end_layer, k._resolve_layer(spec['to']))
            self.assertEqual(list(v.padstack.layers), [k._resolve_layer(spec['from']), k._resolve_layer(spec['to'])])
            self.assertEqual(v.diameter, k.from_mm(0.6))
            self.assertEqual(v.drill_diameter, k.from_mm(0.3))
            self.assertEqual((v.position.x, v.position.y), (k.from_mm(10 + i), k.from_mm(22)))
        self.assertEqual(self.board.events, ['begin', 'create', 'push'])

    def test_spans_include_intermediate_enabled_layers(self):
        self.link.place(placement([('F.Cu', 'In2.Cu')]))
        self.assertEqual(list(self.board.created[0].padstack.layers), [k._resolve_layer(n) for n in STACK[:3]])

    def test_mismatched_live_stack_and_unavailable_layer_block_without_commit(self):
        self.board.get_enabled_layers = lambda: [k._resolve_layer(n) for n in ['F.Cu', 'B.Cu']]
        with self.assertRaisesRegex(k.LinkError, 'stack differs'):
            self.link.place(placement(), replace_ids=['old-via'])
        p = placement(); p.board_layers = []
        with self.assertRaisesRegex(k.LinkError, 'not enabled'):
            self.link.place(p, replace_ids=['old-via'])
        self.assertEqual(self.board.events, [])
        self.assertEqual(self.board.live, [self.board.old])

    def test_unsupported_binding_and_bad_dimensions_block_before_commit(self):
        with patch.object(k, 'ViaType', None):
            with self.assertRaisesRegex(k.LinkError, 'Cannot safely place'):
                self.link.place(placement(), replace_ids=['old-via'])
        p = placement(); p.vias[0]['diameter'] = 0.2
        with self.assertRaisesRegex(k.LinkError, 'positive drill'):
            self.link.place(p)
        self.assertEqual(self.board.events, [])

    def test_replacement_is_created_then_removed_in_one_commit(self):
        result = self.link.place(placement(), replace_ids=['old-via'])
        self.assertEqual(self.board.events, ['begin', 'create', 'remove', 'push'])
        self.assertNotIn(self.board.old, self.board.live)
        self.assertEqual(result['replaced'], 1)

    def test_failed_create_or_remove_restores_previous_placement(self):
        for failure in ['create', 'remove', 'push']:
            with self.subTest(failure=failure):
                self.setUp()
                def fail(*args):
                    self.board.events.append(failure)
                    raise RuntimeError('simulated IPC failure')
                setattr(self.board, {'create': 'create_items', 'remove': 'remove_items', 'push': 'push_commit'}[failure], fail)
                with self.assertRaisesRegex(k.LinkError, 'simulated IPC failure'):
                    self.link.place(placement(), replace_ids=['old-via'])
                self.assertEqual(self.board.events[-1], 'drop')
                self.assertEqual(self.board.live, [self.board.old])

    def test_missing_transaction_does_not_create_any_items(self):
        self.board.begin_commit = lambda: None
        with self.assertRaisesRegex(k.LinkError, 'did not start a transaction'):
            self.link.place(placement(), replace_ids=['old-via'])
        self.assertEqual(self.board.events, [])
        self.assertEqual(self.board.live, [self.board.old])

    def test_missing_rollback_api_does_not_begin_or_create(self):
        self.board.drop_commit = None
        with self.assertRaisesRegex(k.LinkError, 'complete undo transaction'):
            self.link.place(placement(), replace_ids=['old-via'])
        self.assertEqual(self.board.events, [])
        self.assertEqual(self.board.live, [self.board.old])


if __name__ == '__main__':
    unittest.main()
