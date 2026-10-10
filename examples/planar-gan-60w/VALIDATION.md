# A5 schematic / A3 hardware validation record

CAD review date: 2026-10-10. KiCad 10.0.6. Hardware has not been built.

| Check | Result | Evidence |
| --- | --- | --- |
| Connected four-way wire nodes | 0, with 53 explicit T junctions | [Geometry audit](evidence/schematic-geometry.json) |
| Rendered text-to-wire clearance | No glyph ink boxes cross wire segments, including a 0.15 mm reserve; text-to-text spacing also reviewed visually | [Readability audit](evidence/readability-audit.json) |
| A4 comparison | One intentional pin-net correction: R16.1 VIN → PGND; two VIN tracks removed, one PGND via added. All part identities/values, placements, pad geometry, outline and winding artwork retained | [Comparison](evidence/A5-change-audit.json) |
| Datasheet pin-function check | 13 device maps and 6 critical branches checked against intended connections | [Pin review](evidence/datasheet-pin-review.json) |
| Symbol pin attachment and supply stems | 42 visible boxed-IC pins reach their bodies; 9 positive supply symbols attach to a rail or feed wiring below | [Geometry audit](evidence/schematic-geometry.json) |
| Schematic ERC (four-way check enabled) | 0 violations | [ERC.rpt](evidence/ERC.rpt) |
| PCB DRC and schematic parity | 0 violations, 0 unconnected items, 0 parity issues | [DRC.rpt](evidence/DRC.rpt) |
| Circuit manifest versus schematic pin nets | 0 mismatches | [Final audit](evidence/final-audit.json) |
| BOM/CPL/designator agreement | 75 purchased components, 41 catalog codes, all top | [Final audit](evidence/final-audit.json) |
| Winding contact screen | No unintended contacts found by independent sampled geometry check | [Winding audit](evidence/winding-contact-audit.json) |
| M3 mechanical features | Exact reused footprint; all eight copper layers excluded | [Mechanical audit](evidence/mechanical-assembly-audit.json) |
| Port mapping | Pin 2 positive / pin 1 return for both J1 and J2 | [Mechanical audit](evidence/mechanical-assembly-audit.json) |
| Layer inspection | All eight copper views reviewed | [Layer review](evidence/Layer-review.png) |
| Assembly inspection | Top, perspective and underside renders reviewed; local model paths resolve | [Top](Board-preview.png), [underside](evidence/Board-bottom.png) |
| Portable board rebuild | Matching track/via, footprint and pad geometry/nets; 0 DRC, unconnected or parity issues in a separate copied directory | [Rebuild audit](evidence/rebuild-audit.json), [DRC](evidence/rebuild-DRC.rpt) |
| LLC gain screening | 27 selected full-load parameter corners have an inductive solution at 46 V | [Calculations](evidence/engineering-calculations.json) |

## Electrical correction and drawing review

The previous R16 connection was incorrect. [TI's LM5164 datasheet](https://www.ti.com/lit/ds/symlink/lm5164.pdf),
Rev D, pin-functions table and on-time-control section, specifies RON resistance
to GND. A3 hardware connects R16.1 to PGND, keeping R16.2 on RON. At the nominal
12.095 V bias output, the existing 100 kΩ resistor gives approximately 302 kHz
using TI's steady-state CCM equation. Earlier manufacturing files are superseded. The board generator builds connectivity
before filling zones and always removes isolated islands; this eliminates the
isolated-fill warnings found during a repeat rebuild.

D1's former bidirectional drawing was wrong for the selected SMAJ54A-13-F.
The [Diodes Incorporated datasheet](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf)
identifies the unidirectional part and cathode band. The schematic now uses a
unidirectional TVS, pin 1 K / pin 2 A, matching the existing footprint polarity.

The source-linked pin review checks U1–U9, Q1/Q2 and D1/D2, including hidden and
stacked pins. Particular checks include TL431 DBZ versus TL432 DBZ pin ordering,
LMG2100 bootstrap and ground pins, UCC24624 REG bypass, LM5164 timing/bypass and
TPS7A2450 fixed-output pins. J1/J2 retain pin 2 positive and pin 1 return.
All 82 schematic parts are also compared to the circuit manifest; PCB parity
checks compare the resulting native schematic connections with the board.

Native PDF and SVG review covers all five functional sections, including supply
labels, U3 VD1/VG1 separation, vertical C11, test pads/flags, J2 leads and R16.
The text-to-wire screen checks glyph ink boxes with a 0.15 mm reserve; symbol
artwork and text-to-text spacing are inspected visually. This does not prove
electrical operation: startup, loop compensation, current-limit calibration,
no-load behavior and thermal margins still require switching analysis and tests.

The winding footprint is a net tie. KiCad connectivity alone cannot establish
that there are no shorted turns; `audit_windings.py` therefore samples external
connections against the generated winding paths. This is a geometric screen,
not field simulation or electrical testing.

The four mechanical-hole footprints are byte-identical to the flyback example's
published Edge variant. Their positions change to a 55 × 47 mm pattern. The
KANGNEX header drawing was checked against its 5.08 mm pitch, 1.6 mm finished
drills, 1 mm square pins and 4 mm solder tails. The supplier CAD drill was
changed from 1.7 mm to the drawing's 1.6 mm. Pin 2 is positive on both ports;
pin 1 is return. C71370 plugs are external accessories, not PCB placements.
Renders show the unmated PCB headers.

The reported component placement improvement is geometric: Q1-to-C15 center
distance changes from 21.74 mm to 5.9 mm. No measured inductance, efficiency or
temperature improvement is claimed. A2 reduces the outline bounding area by 22.76%, from 80 × 58 to 64 × 56 mm.
Header overhang and plug/wiring clearances are additional. The GaN local power stage, transformer artwork, control values and nominal
stack remain the starting point, with the R16 connection corrected in A3.

## Release holds

1. JLCPCB file-level DFM, exact eight-layer 2 oz construction, filled/capped via
   process, panel tooling and connector lead/soldering acceptance.
2. Assembly rotation and polarity review in JLCPCB's placement preview; separate
   agreement for fitting the DigiKey ferrite halves and clips after soldering.
3. Core-fit tolerance, winding resistance, turns ratio/polarity, assembled
   magnetizing inductance and leakage measurements.
4. Switching and loop review; startup, no-load/burst operation, dead time,
   synchronous rectifier timing, current limit and OVP validation.
5. Thermal and efficiency measurements at increasing load, including magnetic
   AC/core loss, capacitor derating and connector temperature.

No switching simulation, hardware efficiency, thermal result, certified isolation
rating or approved production process is supplied. DRC/ERC are necessary CAD
checks; they are not electrical qualification.
