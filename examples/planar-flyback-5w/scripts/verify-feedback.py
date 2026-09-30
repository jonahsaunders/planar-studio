"""Check the feedback budget, CAD/BOM agreement and optional board revision scope.

Run with KiCad Python after calculate.py and manufacturing-data.py. These checks
do not validate transient pin current, control behavior or physical hardware.
"""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import re

R = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline-board', type=Path)
parser.add_argument('--baseline-id')
args = parser.parse_args()
parts = json.loads((R/'parts.json').read_text())
circuit = {p['ref']: p for p in json.loads((R/'circuit.json').read_text())['parts']}
calc = json.loads((R/'evidence/electrical-sizing.json').read_text())
bom = {p['Reference']: p for p in csv.DictReader((R/'manufacturing/BOM-MASTER.csv').open(encoding='utf-8-sig'))}
expected = {'R3': (113000, '113k 0.1%', 'RT0603BRD07113KL', {'1': 'SW', '2': 'RFB'}),
            'R4': (10700, '10.7k 0.1%', 'RT0603BRD0710K7L', {'1': 'RREF', '2': 'PGND'}),
            'R5': (127000, '127k 0.1%', 'RT0603BRD07127KL', {'1': 'TC', '2': 'RREF'})}

def parse(path):
    root = []; stack = []; node = root
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', path.read_text(encoding='utf8')):
        if token == '(':
            item = []; node.append(item); stack.append(node); node = item
        elif token == ')':
            node = stack.pop()
        else:
            node.append(token)
    assert not stack
    return root[0]

def children(node, name):
    return [x for x in node if isinstance(x, list) and x[0] == name]

board_path = R/'kicad/PS-FLYBACK-5W.kicad_pcb'
tree = parse(board_path)
fps = {next(x[2].strip('"') for x in children(f, 'property') if x[1] == '"Reference"'): f
       for f in children(tree, 'footprint')}
schematic = parse(R/'kicad/PS-FLYBACK-5W.kicad_sch')
symbols = {next(x[2].strip('"') for x in children(f, 'property') if x[1] == '"Reference"'): f
           for f in children(schematic, 'symbol')}
for ref, (ohm, value, mpn, nets) in expected.items():
    assert parts[ref]['resistance_ohm'] == ohm
    assert parts[ref]['tolerance_fraction'] == .001 and parts[ref]['tcr_ppm_per_C'] <= 25
    assert circuit[ref]['value'] == value and circuit[ref]['mpn'] == mpn
    assert circuit[ref]['nets'] == nets
    assert bom[ref]['MPN'] == mpn and bom[ref]['LCSC'] == parts[ref]['lcsc']
    for obj in [fps[ref], symbols[ref]]:
        props = {x[1].strip('"'): x[2].strip('"') for x in children(obj, 'property')}
        assert props['Value'] == value and props['MPN'] == mpn and props['LCSC'] == parts[ref]['lcsc']
    pads = {next(iter(children(p, 'net')))[-1].strip('"').lstrip('/'): p[1].strip('"') for p in children(fps[ref], 'pad')}
    assert pads == {net: number for number, net in nets.items()}
assert parts['D4']['mpn'] == 'SMAJ12A-13-F'
assert circuit['R6']['value'] == '39R 0.75 W' and circuit['C6']['value'] == '470p / 100 V C0G'
assert math.isclose(calc['nominal_output_at_sample_diode_drop_0p3V'], 4.980373831775701)
assert math.isclose(calc['RFB_minimum_resistance_at_temperature_ohm'], 112604.7825)
assert math.isclose(calc['RFB_resistive_current_at_prototype_target_A'], 18/112604.7825)
assert calc['RFB_resistive_separation_from_absolute_max_fraction'] >= .20
assert calc['RFB_prototype_SW_minus_VIN_peak_target_V'] == 17.5
assert calc['RFB_preliminary_pin_below_VIN_allowance_V'] == .5
assert calc['RFB_hardware_qualified'] is False
assert [p['exceeds_80pct_fitted_rating'] for p in calc['snubber_capacitance_loss_sweep']] == [False, True, True]
stock = json.loads((R/'sources/jlcpcb-stock.json').read_text())
for row in stock['rows']:
    if row['references'][0] in expected:
        assert row['status'] == 'Stocked' and row['verified_jlcpcb_code'] == parts[row['references'][0]]['lcsc']
        assert row['available_order_quantity'] >= 10

record = {'feedback_values_ohm': {ref: p[0] for ref, p in expected.items()},
          'native_schematic_board_circuit_and_BOM_agree': True,
          'retained_clamp_and_snubber_R_C_values': True,
          'preliminary_resistive_budget_verified': True,
          'exact_stocked_resistor_codes_match': True,
          'scope': 'File consistency and preliminary calculations only; no hardware qualification.'}
if args.baseline_board:
    assert args.baseline_id, '--baseline-id is required with --baseline-board'
    # UUIDs and property ordering are non-geometric. Only the three selected
    # footprints may change electrical-value and procurement properties.
    # Ordered polygon point lists are kept intact.
    allowed = {'"Value"', '"MPN"', '"Manufacturer"', '"Datasheet"', '"LCSC"'}
    def normalize(node, feedback=False):
        if not isinstance(node, list):
            return node
        if node[0] == 'footprint':
            feedback = any(x[1] == '"Reference"' and x[2].strip('"') in expected for x in children(node, 'property'))
        result = []
        for item in node:
            if isinstance(item, list):
                if item[0] in ['uuid', 'tstamp']:
                    continue
                if feedback and item[0] == 'property' and item[1] in allowed:
                    item = [*item[:2], '"<revised>"', *item[3:]]
            result.append(normalize(item, feedback))
        if node[0] in ['kicad_pcb', 'footprint', 'pad', 'zone']:
            atoms = [x for x in result if not isinstance(x, list)]
            result = atoms + sorted((x for x in result if isinstance(x, list)), key=lambda x: json.dumps(x))
        return result
    assert normalize(parse(args.baseline_board)) == normalize(tree), 'Unintended PCB geometry/connectivity or unrelated property change'
    record.update(baseline_id=args.baseline_id,
                  baseline_sha256=hashlib.sha256(args.baseline_board.read_bytes()).hexdigest(),
                  all_PCB_geometry_connectivity_and_unrelated_properties_preserved=True)
record['source_SHA256'] = {p: hashlib.sha256((R/p).read_bytes()).hexdigest() for p in
                         ['parts.json', 'requirements.json', 'circuit.json', 'kicad/PS-FLYBACK-5W.kicad_pcb', 'kicad/PS-FLYBACK-5W.kicad_sch',
                          'evidence/electrical-sizing.json', 'manufacturing/BOM-MASTER.csv', 'sources/jlcpcb-stock.json']}
(R/'evidence/audit/feedback-checks.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf8')
print(json.dumps(record, indent=2))
