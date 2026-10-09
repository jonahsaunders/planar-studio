"""Independent RC snubber screen. No waveform, thermal or clamp qualification.

Run after calculate.py. Uses only the Python standard library and checks the
native schematic netlist as well as circuit.json before applying C*(delta V)^2*f.
"""
import csv
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

R = Path(__file__).resolve().parents[1]
parts = json.loads((R/'parts.json').read_text())
circuit = {p['ref']: p for p in json.loads((R/'circuit.json').read_text())['parts']}
expected = {'R6': {'1': 'VIN', '2': 'SNUB'},
            'C6': {'1': 'SNUB', '2': 'SW'},
            'D3': {'1': 'CLAMP', '2': 'SW'},
            'D4': {'1': 'CLAMP', '2': 'VIN'}}
netlist = ET.parse(R/'evidence/schematic-netlist.xml')
native = {ref: {} for ref in expected}
for net in netlist.findall('.//nets/net'):
    for node in net.findall('node'):
        if node.get('ref') in native:
            native[node.get('ref')][node.get('pin')] = net.get('name').lstrip('/')
assert native == expected
assert {ref: circuit[ref]['nets'] for ref in expected} == expected

c = parts['C6']['capacitance_F']
cmax = c*(1+parts['C6']['tolerance_fraction'])
resistance = parts['R6']['resistance_ohm']
rmin = resistance*(1-parts['R6']['tolerance_fraction'])
rating = parts['R6']['power_rating_W_at_70C']
calc = json.loads((R/'evidence/electrical-sizing.json').read_text())
model = json.loads((R/'evidence/winding-model.json').read_text())
lm = model['magnetizingInductance_H']
lmin = calc['Lm_low_acceptance_H']
peak = calc['RFB_prototype_SW_minus_VIN_peak_target_V']


def periodic_rc_loss(capacitance, ohms, swing, frequency, duty):
    """Exact steady-state loss for an ideal two-level source and series RC.

    Both edges dissipate energy: the fully settled limit is C*dV^2*f,
    not 0.5*C*dV^2*f. This does not represent ringing or DCM idle transitions.
    """
    tau = ohms*capacitance
    a = math.exp(-duty/frequency/tau)
    b = math.exp(-(1-duty)/frequency/tau)
    return capacitance*swing*swing*frequency*(1-a)*(1-b)/(1-a*b)


full = [r for r in csv.DictReader((R/'evidence/operating-points.csv').open())
        if float(r['Iout']) == 1]
cases = []
for row in full:
    vin = float(row['Vin'])
    freq = float(row['frequency_Hz'])*lm/lmin
    swing = float(row['switch_plateau_V'])  # SW on ~= 0; off ~= VIN + reflected V.
    loss = c*swing*swing*freq
    assert math.isclose(loss, float(row['snubber_CV2f_upper_W']), rel_tol=1e-12)
    exact = periodic_rc_loss(c, resistance, swing, freq, float(row['duty']))
    assert math.isclose(exact, loss, rel_tol=1e-6)
    cases.append({'input_V': vin, 'worksheet_frequency_Hz': freq,
                  'plateau_swing_V': swing, 'nominal_C_plateau_W': loss,
                  'maximum_C_plateau_W': cmax*swing*swing*freq,
                  'target_peak_swing_V': vin+peak,
                  'maximum_C_target_swing_W': cmax*(vin+peak)**2*freq})
worst = max(x['maximum_C_target_swing_W'] for x in cases)
assert math.isclose(worst, calc['snubber_loss_full_target_swing_CV2f_W'], rel_tol=1e-12)

# These are the SAME assumptions as cycle-model.py, not guaranteed clock limits.
frequency_cases = [{'frequency_Hz': f, 'maximum_C_target_swing_W': cmax*(36+peak)**2*f}
                   for f in [350000, 380000, 420000]]


def derated_power(ambient):
    # Ever Ohms CRH S-10-12-16-13 p6: P70 through 70 C, zero at 155 C.
    return rating*max(0., min(1., (155-ambient)/85))


thermal = [{'local_ambient_C': t, 'rated_W': derated_power(t),
            'eighty_percent_allowance_W': .8*derated_power(t),
            'worksheet_target_swing_exceeds_rating': worst > derated_power(t),
            'worksheet_target_swing_exceeds_eighty_percent': worst > .8*derated_power(t)}
           for t in [50, 70, 85, 100]]
swing = 36+peak
edge_energy = .5*cmax*swing*swing
peak_power = swing*swing/rmin
record = {
    'scope': 'Analytical screens only. No hardware results, guaranteed controller frequency bound, nonlinear clamp model or repetitive-pulse approval.',
    'native_netlist_and_circuit_topology_match': True,
    'topology': 'VIN--R6--C6--SW, in parallel with the primary; D3/D4 are a separate diode/TVS clamp.',
    'voltage_basis': 'At steady VIN, the RC source moves from about -VIN to +reflected voltage; delta V includes VIN. Using only 17.5 V would undercount turn-on loss. A 53.5 V transition is not 53.5 V DC across C6.',
    'R6_MPN': parts['R6']['mpn'], 'C6_MPN': parts['C6']['mpn'],
    'capacitance_max_F': cmax, 'resistance_min_initial_tolerance_ohm': rmin,
    'worksheet_full_load_cases': cases,
    'frequency_sensitivity_cases': frequency_cases,
    'frequency_scope': '380 kHz typical; 350/420 kHz chosen sensitivity assumptions. The uncapped worksheet reaches approximately 454 kHz and is intentionally conservative for this screen, not a predicted operating frequency.',
    'local_ambient_derating': thermal,
    'worksheet_target_swing_W': worst,
    'maximum_local_ambient_at_rating_C': 155-85*worst/rating,
    'eighty_percent_margin_at_or_below_70C': worst <= .8*rating,
    'ideal_edge': {'transition_V': swing, 'energy_J': edge_energy,
                   'initial_current_A': swing/rmin, 'initial_power_W': peak_power,
                   'RC_time_constant_s': rmin*cmax,
                   'equal_energy_rectangular_duration_s': edge_energy/peak_power},
    'pulse_scope': 'Initial R tolerance only; no trace inductance, finite edge rate, ringing or resistor TCR. The CRH datasheet provides short-time overload testing but no repetitive-pulse curve; no pulse pass is established for the roughly 10 ns equal-energy duration. Average power alone does not qualify this load.',
    'clamp_scope': 'SMAJ12A 19.9 V at 20.1 A is not the converter clamp voltage. Verify SW-VIN <=17.5 V, RFB limits, repetitive clamp energy and temperature on hardware; the RC screen does not close those gates.',
    'hardware_qualified': False,
    'recommended_action': 'Retain 39 ohm / 470 pF / SMAJ12A for controlled first-article tuning. Do not approve production or a capacitance increase from these calculations; redesign power handling if measured loss and local ambient cannot meet the derated allowance.',
    'sources': [
        'https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf',
        'https://jlcpcb.com/partdetail/Ever_OhmsTech-CRH2512F39R0E04Z/C175263',
        'https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf'],
}
inputs = ['parts.json', 'circuit.json', 'evidence/schematic-netlist.xml',
          'evidence/electrical-sizing.json', 'evidence/operating-points.csv',
          'evidence/winding-model.json', 'scripts/audit-snubber.py']
record['source_SHA256'] = {f: hashlib.sha256((R/f).read_bytes()).hexdigest() for f in inputs}
(R/'evidence/audit/snubber-checks.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps({'worst_screen_W': worst, 'frequency_sensitivity': frequency_cases,
                  'eighty_percent_margin': record['eighty_percent_margin_at_or_below_70C'],
                  'hardware_qualified': False}, indent=2))
