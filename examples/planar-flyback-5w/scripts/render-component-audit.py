"""Render independently reviewed component records and current CAD checks."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
a=json.loads((R/'evidence/audit/component-checks.json').read_text())
c=json.loads((R/'evidence/electrical-sizing.json').read_text())
f=a['filter_checks']
text=f'''# Component audit — PS-FLYBACK-5W A5

Reviewed {a['review_date']}. All {a['reviewed_footprints']} footprints have an explicit package/pin mapping review; {a['electronic_references']} are electronic placements. The independent check compares reviewed MPNs, footprints and nets to the actual board, checks package-specific lands and confirms ground-via attachment to filled copper.

The electronic BOM is fully stocked in the [dated sourcing snapshot](JLCPCB-SOURCING.md). This is an engineering prototype: ratings and calculations do not establish measured performance or factory process acceptance.

| Screening calculation | Result | Limitation |
| --- | ---: | --- |
| Nominal output at 0.3 V sampled diode drop | {c['nominal_output_at_sample_diode_drop_0p3V']:.3f} V | Requires output and temperature trim |
| RFB resistive current at 17.5 V SW−VIN | {c['RFB_resistive_current_at_prototype_target_A']*1e6:.2f} µA | Excludes capacitive current and pin excursions |
| Snubber loss including +5% capacitance | {c['snubber_loss_with_capacitance_tolerance_W']:.3f} W | 2 W R6 rating at 70 °C; measure pulses and temperature |
| R8 loss if all input ripple enters its branch | {f['R8_loss_if_all_input_ripple_in_branch_W']:.3f} W | 2 W rating needs 300 mm² copper; actual thermal capacity unverified |
| Bulk-only output ripple sizing | {c['full_load_ripple_sizing_max_V']*1000:.2f} mV | Boundary estimate; burst/control behavior not represented |

R8 uses Bourns' recommended 2.45 × 3.7 mm lands, centered 5.15 mm apart. The stocked feedback network preserves the original compensation ratio within 1%. All three feedback resistors must change together. [Feedback assumptions](FEEDBACK-REVISION.md).

## Per-component review

Allowable resistor voltage is the smaller of its limiting voltage and √(P·R), with thermal derating. Pulse ratings and average power are separate constraints. Generic 3D models are illustrative envelopes; footprints and datasheets govern assembly.

'''
def key(r):
    m=re.fullmatch(r'([A-Z]+)(\d+)',r['reference']);return m[1],int(m[2])
for r in sorted(a['components'],key=key):
    text+=f"### {r['reference']} — {r['expected_mpn'] or 'M3 mounting interface'}\n\n[Manufacturer/source]({r['source']}) · {r['expected_footprint']}\n\n**Rating:** {r['rating']}\n\n**Footprint and pin mapping:** {r['package_review']}\n\n**Use:** {r['use_case']}\n\n**Remaining validation:** {r['remaining_validation']}\n\n"
text+='''## Release conditions

The [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md) covers clamp/RFB waveforms, startup, full/light load, faults, temperature, magnetics and regulation. Require SW−VIN ≤17.5 V including uncertainty, SW <60 V and VIN <42 V. Controlled input ramp is the initial condition; abrupt hot-plug remains unqualified.

Factory-gapped DigiKey cores and spring clips are installed after soldering. Core fit, clip retention and illustrative mounting hardware need mechanical qualification; none establishes a safety-isolation rating. The six-layer stack, slots, panel and reflow profile need factory acceptance.

Run rebuild.py, audit-layout.py, audit-layout-complete.py, audit-components.py, render-component-audit.py and audit-3d-solids.py, then refresh previews and manifest. Historical revision comparisons do not validate a changed board.
'''
(R/'COMPONENT-AUDIT.md').write_text(text,encoding='utf8')
