# 5 W planar flyback converter

**18–36 V DC → isolated 5 V / 1 A.** An LT8302 regulates the output through a 4:2 planar transformer built into the six-layer PCB. The 50 × 104 mm board uses a prepared N87 core pair with a 0.21 mm center-leg gap.

![Assembled converter rendered from KiCad](evidence/audit/board-3d-assembled.png)

**A1 engineering prototype — unbuilt and untested.** The electronic BOM is fully stocked in the September 30, 2026 JLCPCB snapshot. Factory process acceptance and physical qualification remain open; this is not a production release.

[Complete review package](../PS-FLYBACK-5W-A1-review-package.zip) · [KiCad project](kicad/PS-FLYBACK-5W.kicad_pro) · [Planar Studio winding](planar-studio/T1.planar.json) · [Interactive report](report.html)

| Design | Specification |
| --- | --- |
| Input / output | 18–36 V DC / 5 V, 1 A target |
| Controller | LT8302IS8E#PBF, primary-side regulation |
| Transformer | Four primary turns; two parallel two-turn secondary windings; 11.95 µH nominal |
| PCB | Six layers, ENIG; JLC061611-1080A, 1.6 mm order class |
| Assembly | 22 SMT parts + two through-hole connectors, all on top |
| Magnetics | Two TDK B66457G0000X187 halves, separately sourced and prepared |

## Schematic

[![Converter schematic](evidence/audit/schematic-overview.png)](evidence/schematic.svg)

The stocked feedback network is **113 kΩ / 10.7 kΩ / 127 kΩ** (0.1%, 25 ppm/°C), giving 4.980 V nominal. Require measured **SW−VIN ≤17.5 V**, including overshoot and uncertainty; the preliminary resistive RFB bound is 159.85 µA. [Feedback calculations](FEEDBACK-REVISION.md).

## Manufacturing and verification

All **20 electronic MPNs / 24 placements** have exact JLCPCB codes and orderable inventory in the dated [sourcing audit](JLCPCB-SOURCING.md). DigiKey may supply the ferrite separately. Install the prepared cores after soldering and inspection.

**[Start here: JLCPCB upload files](manufacturing/START-HERE.md).** Supply the single-board Gerber ZIP, BOM and CPL; JLCPCB is to prepare the assembly panel. The earlier customer-panel files are withdrawn and excluded from the current package.

[Electronic BOM](manufacturing/BOM-JLCPCB.csv) · [Placement file](manufacturing/CPL-JLCPCB.csv) · [JLCPCB panelization requirements](manufacturing/PANEL.md) · [Fabrication requirements](manufacturing/FABRICATION.md) · [Component/pinout audit](COMPONENT-AUDIT.md) · [Core assembly](manufacturing/CORE-ASSEMBLY.md)

The project includes native ERC/DRC, schematic-to-board pin checks, winding continuity checks, component land-pattern/rating reviews and nominal 3D interference checks. Reproduce with [rebuild.py](scripts/rebuild.py) using KiCad 10 and Node; the bundled models keep the project portable.

Before release, obtain factory acceptance of the stack, core-slot tolerance, assembly panel and reflow profile. Then verify regulation, startup/fault recovery, RFB/clamp waveforms, resistor and semiconductor temperatures, and magnetic behavior using the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md). Functional low-voltage isolation only; no safety-isolation rating is claimed.

[Top](evidence/audit/board-3d-top.png) · [Underside](evidence/audit/board-3d-underside.png) · [STEP assembly](3d/PS-FLYBACK-5W.step) · [Model provenance](3D-MODELS.md)
