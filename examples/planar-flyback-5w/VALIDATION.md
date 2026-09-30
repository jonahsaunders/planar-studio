# A1 validation record — September 30, 2026

**CAD and analytical checks pass. Manufacturing release remains open.** No hardware has been built or tested; JLCPCB has not accepted the process or received these files.

| Check | Current result | Evidence |
| --- | --- | --- |
| Native ERC / DRC | Zero violations, unconnected items or schematic-parity issues | [ERC](evidence/erc.rpt), [DRC](evidence/board-drc.json) |
| Pin mapping and winding copper | 60 logical pins / 61 pads; four winding polygons / 19,229 contained centerline samples | [Independent checks](evidence/independent-checks.json) |
| Component applicability | All 29 footprints match reviewed MPN, package and pin/net records; includes R8 recommended lands | [Component checks](evidence/audit/component-checks.json) |
| Electronic sourcing | All 20 MPNs / 24 placements stocked; inventory covers twice the five-board requirement as a provisional allowance | [Dated catalog audit](JLCPCB-SOURCING.md) |
| Feedback | 113k/10.7k/127k agree across schematic, board and BOM; 159.85 µA preliminary resistive bound at the 17.5 V envelope | [Checks](evidence/audit/feedback-checks.json), [assumptions](FEEDBACK-REVISION.md) |
| Stack | JLC061611-1080A, 35 µm outer / 30 µm inner; published sum 1.618 mm in the 1.6 mm order class | [Stack data](stackup.json), [winding calculation](evidence/winding-model.json) |
| Manufacturing exports | 24 electronic placements; six copper layers; 66 fill/cap holes; connector and mounting holes remain open | [Export checks](evidence/manufacturing-checks.json) |
| Assembly panel | JLCPCB to prepare and return a panel drawing from the single-board files; factory review outstanding. Earlier customer panel withdrawn | [Panelization requirements](manufacturing/PANEL.md), [upload guide](manufacturing/START-HERE.md) |
| 3D | 29 footprints / 16 valid STEP assets; no nominal intersections in 406 component pairs or 29 substrate checks | [Solid checks](evidence/audit/3d-solid-checks.json) |
| Visual inspection | Actual schematic, single-board copper/technical Gerber sheets and assembly renders inspected | [Schematic](evidence/audit/schematic-overview.png), [copper](evidence/audit/gerber-copper-overview.png), [technical layers](evidence/audit/gerber-technical-overview.png) |

The named-stack model uses 30 µm for all windings as a conservative DC-resistance screen. It uses actual published winding heights, a fixed 5 V output and an assumed switching-resistance/frequency model. It excludes core and AC/fringing losses, closed-loop controller behavior, burst dynamics and transients. The separate stress worksheet assumes 75% efficiency; it is not measured or predicted efficiency.

## Open release gates

1. **Factory process:** accept JLC061611-1080A tolerances, ±0.10 mm internal core-slot routing, filled/capped vias, panel/depanelization, connector assembly and a component-temperature profile compatible with F1, R8 and C3/C8. Standard's nominal setpoint alone is insufficient; Economic's fixed profile is unsuitable. Recheck stock and attrition allocation before ordering.
2. **Feedback and suppression:** demonstrate SW−VIN ≤17.5 V including overshoot and measurement uncertainty, SW <60 V, and independent RFB voltage/current compliance. The 159.85 µA resistive screen excludes capacitive current. Tune clamp/snubber from measured waveforms.
3. **Power and temperature:** R6's plateau estimate is 0.509 W including capacitor tolerance; the full target-voltage swing screen reaches 0.695 W against a 0.75 W rating at 70 °C. R8's ripple screen is 0.922 W, but its 2 W catalog rating requires 300 mm² copper and does not establish this board's thermal capacity. Measure both; change parts/layout if necessary. Validate all semiconductor, capacitor and magnetic temperatures.
4. **Core process and operation:** raw DigiKey halves require qualified center-leg grinding, retention and installation. Measure inductance under bias and temperature, startup, regulation, ripple, load steps, burst operation and fault recovery. Hot-plug is unqualified; begin with a controlled input ramp.

Follow the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md). Functional low-voltage isolation only; no mains, reinforced insulation or safety certification is claimed.

## Reproduction

Run scripts/rebuild.py using KiCad 10 Python and Node. Then refresh audit-renders.py, audit-layout.py, audit-layout-complete.py, audit-components.py, render-component-audit.py, render-schematic.mjs and audit-3d-solids.py. The render and solid tools require the documented Pillow/PyGerber, Sharp and CadQuery environments. Run scripts/package-project.py with a fresh output directory to package the single-board handoff; panelization is supplied by JLCPCB and has no local generation step. All package/model references remain local.

Earlier fuse, mounting and feedback-only revision comparisons are **historical**. The current revision also changes stocking selections, R8 lands and electrical stack dimensions; it does not claim unchanged geometry against those earlier commits. Current source hashes accompany the new checks. No supplier upload, contact, purchase or fabrication was performed.
