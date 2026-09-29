"""Render the reviewed per-component evidence as a readable engineering report."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
a=json.loads((R/'evidence/audit/component-checks.json').read_text())
intro='''# Component and filtering audit — PS-FLYBACK-5W A1

Reviewed 2026-09-29. **Every placed footprint was reviewed: 24 electronic components, the custom transformer and four mounting holes.** Manufacturer part identity, package drawing, pin/polarity mapping, voltage/current/power ratings and intended circuit function were checked. Changes are incorporated in the native schematic and routed board.

**This remains an unbuilt engineering prototype.** The package/analytical review is complete; electrical suitability is conditional on the hardware and process tests identified below. The tightest outstanding electrical margin is RFB pin current during clamp spikes. Input hot-plug, magnetic losses, thermal performance and control behavior are not qualified. No supplier contact, purchase or fabrication release occurred.

[Per-component CSV](evidence/audit/component-audit.csv) · [Measured pads, pin nets and checks](evidence/audit/component-checks.json) · [Reviewed source records](sources/component-review.json) · [Current corner-mount revision](evidence/audit/mounting-revision-checks.json) · [Earlier component comparison](evidence/audit/component-revision-checks.json) · [Prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md)

## Corrections implemented

| Reference | Change and reason |
| --- | --- |
| R1 | 681 kΩ → 649 kΩ. Improves the 18 V startup screening corner to 17.55 V including the input diode. Typical-only hysteresis prevents a guaranteed production-corner claim. |
| D1 | SS110/SMA → DFLS1100-7/PowerDI123, with a verified exact manufacturer drawing and polarity. |
| D4 | SMAJ13A → SMAJ12A-13-F. Rating-based SW clamp estimate falls from 58.5 to 56.9 V. Dynamic/temperature behavior still needs measurement. |
| C4 | Current manufacturer-confirmed Samsung CL32B226KOJNNNE output ceramic, same 1210 package. |
| C5 | Manufacturer-recommended CL10A475KO8NQNC replacement for the NRND bias capacitor. |
| C6 | Current 470 pF C0G 450 V TDK CGA4C4C0G2W471J060AA replaces the NRND 100 V selection, same 0805 package. |
| C7 + R8 | Add a 47 µF / 63 V hybrid reservoir through a 2.2 Ω / 1.5 W pulse-rated damping resistor in a shunt input branch. |
| C8 | Add a second 180 µF / 16 V polymer output capacitor. C3/C8 now provide 360 µF nominal, 288 µF at −20%, and 11 mΩ parallel ESR at 100 kHz. |
| PCB | Add 26 ground stitches plus two new capacitor return vias; expand front PGND copper. Keep all additions outside the winding/isolation region. |

The subsequent mounting-only revision moves all four holes to **4.5 mm corner insets**, forming a **41 × 95 mm** pattern. The upper row moves 12.5 mm away from C7; the lower row moves 2.5 mm toward the bottom corners. Electronic placement, routes, filled copper, winding geometry and board/core-slot outline are unchanged by that move. Current capacitor/hardware clearance measurements are in the mounting comparison linked above.

## Why add this filtering?

The prior bulk-only output ripple calculation was about 100 mV, with essentially no margin to the 100 mV target. With C8, the updated conservative worksheet estimates **50.58 mV** at worst full load, without crediting C4. This uses the same analytical method, not a measured result; the worksheet also now allows a conservative 1 V input-diode drop. The separate charge-balanced cycle model retains its nominal 0.6 V assumption and excludes loop/burst behavior.

C1/C2 remain close to U1 and the transformer terminal for high-frequency bypass. Their combined effective capacitance is provisionally taken as only 4 µF at high DC bias. C7 adds a low-frequency reservoir. R8 deliberately introduces loss in that capacitor branch so another low-ESR capacitor does not simply create an undamped cable/ceramic resonance. See [ADI AN88 on ceramic input capacitors and hot-plug](https://www.analog.com/media/en/technical-documentation/application-notes/an88f.pdf). R8 carries no steady converter load current.

The input capacitor ripple screening bound is 0.625 A versus C7's 1.1 A rating. Assigning all that ripple to R8 gives 0.869 W versus its 1.5 W rating at 70 °C. A 10 ms / 36 V ramp with C7 at +20% gives about 0.203 A charging current and 0.092 W in R8. A hard step can instead start near **595 W** with **36.55 mJ** stored in C7. Those figures explain why the initial test plan requires a controlled ramp: source impedance, cable inductance, pulse repetition and temperature have not been qualified. C7 is not a surge clamp; VIN must remain below 42 V.

No additional secondary LC stage was added: its control-loop and damping consequences would need a separate design. No primary-to-secondary capacitor was added; there is no defined EMI requirement that justifies increasing isolation capacitance.

## Placement, stitching and Perreault reference

Reviewed David Perreault's [MIT Power Electronics Research Group board gallery](https://per.mit.edu/project-gallery/) and his [ARPA-E power electronics presentation](https://arpa-e.energy.gov/sites/default/files/migrated/documents/files/PowerTech_Workshop_Perreault.pdf), especially the photographed 110 MHz Φ2 boost hardware on PDF page 11. The applicable visual lesson is a compact switching cell, nearby bypassing and short interconnects. That is an engineering inference from different research hardware, not an endorsement, a copied topology or a universal via-spacing rule.

The revised board applies those principles to this flyback: SW/clamp/snubber stay on F.Cu, C1-to-U1 is 2.92 mm, C5-to-U1 1.69 mm, RFB feed 1.72 mm, and C4 is 4.03 mm from the rectifier cathode. C8 receives its own 1.5 mm-wide, 12.69 mm cathode route. The R8-to-C7 route is 6.67 mm at 1.0 mm width. These are explicit track-centerline lengths; they exclude pad/plane spreading and do not claim extracted inductance.

There are **12 new PGND and 14 new GND_ISO stitches**, each 0.60 mm diameter / 0.30 mm drill. Independent checks verify their exact nets and solid annular attachment to both filled ground planes; none bridges the winding/isolation region. Including two added capacitor vias, ordinary vias rise from 33 to **61**. With five transformer interlayer holes, **66 holes require fill/cap**, while four connector holes remain open and four M3 holes remain NPTH. The four U1 thermal vias remain.

All 72 routed segments are orthogonal or 45°. Eight sampled return corridors remain within continuous ground copper. Four pours each have one connected filled outline. The schematic retains continuous power wiring and **zero four-way connections**; long capacitor values and diode labels were rearranged to remove collisions. Copper, masks, paste, legends, schematic crops and all five 3D views were visually reviewed after generation.

[![Revised schematic](evidence/audit/schematic-overview.png)](evidence/schematic.svg)

[![Revised assembled board](evidence/audit/board-3d-top.png)](evidence/audit/board-3d-top.png)

## Every component

“Reviewed” below means that the selected part/package and stated analytical use are supported by the linked source. It does not close the explicit hardware/process validation requirement. Limiting resistor voltage and rated power are separate constraints; allowable continuous voltage is the smaller of the limiting voltage and √(P·R), with temperature derating.

'''
def key(r):
    m=re.fullmatch(r'([A-Z]+)(\d+)',r['reference']);return m[1],int(m[2])
sections=[]
for r in sorted(a['components'],key=key):
    title=r['expected_mpn'] or 'M3 Edge mounting interface'
    sections.append(f"### {r['reference']} — {title}\n\n[Manufacturer/source]({r['source']}) · `{r['expected_footprint']}`\n\n**Rating:** {r['rating']}\n\n**Footprint and pin mapping:** {r['package_review']}\n\n**Use and calculated stress:** {r['use_case']}\n\n**Remaining validation:** {r['remaining_validation']}\n")
footer='''
## Separate assembly materials

The electronic BOM intentionally excludes the integral T1 winding, its separately quoted core operation and provisional mounting hardware. The [core materials schedule](manufacturing/CORE-BOM.csv) is also part of this review:

- **Two TDK B66457G0000X187 N87 halves:** stock ungapped parts require a qualified center-leg grinding process to produce PS-MAG-001 A0. Verify dimensions, seating, measured inductance and biased/thermal behavior; a full-face shim is not an equivalent substitution.
- **LOCTITE AA 330 plus SF 7387 activator:** [Henkel's adhesive data](https://datasheets.tdx.henkel.com/LOCTITE-AA-330-en_GL.pdf) supports ferrite bonding as a candidate process. External bond geometry, activation/cure, stress and compatibility with the laminate/core remain unqualified. Neither adhesive nor 3D bond envelope is a safety-insulation claim.
- **3M 69, 12.7 mm strap:** [manufacturer product data](https://www.3m.com/3M/en_US/p/d/v000076478/) supports the proposed nonconductive glass-cloth retention material. Its actual wrap, clearance, aging and mechanical retention require qualification. It is not credited toward a safety-isolation rating.
- **M3 fasteners/standoffs:** the displayed nonconductive 8 mm hardware remains a geometry envelope, not a procured part. Qualify the final hardware before installation.

## Most important unresolved gates

1. **RFB/clamp margin:** the specified TVS clamp plus diode-drop estimate gives 197.84 µA versus the 200 µA absolute pin limit. This is too close to treat as qualification. Measure differential SW−VIN <20.5 V, SW <60 V, and verify clamp temperature at line/load/temperature extremes; retune before release if limits are exceeded.
2. **Input transients and startup:** controlled ramp first; VIN <42 V; confirm cold 18 V full-load start. Qualify abrupt connection separately, including fuse, diode and R8 pulse stress.
3. **Thermal and magnetic behavior:** measure core/fringing/AC losses, inductance under bias, semiconductor temperatures, R6/R8 dissipation and capacitor ripple temperatures. Nominal catalog ratings do not establish board thermal capacity.
4. **Output behavior:** confirm ripple, burst, load steps, overload recovery, final voltage trim and temperature compensation with 360 µF output bulk.
5. **Manufacturing:** confirm the exact parts, paste/solder process, via fill/cap, proposed stack, custom prepared core and retention. Empty sourcing codes are deliberate where a new exact code was not verified. Catalog existence does not establish available stock or turnkey acceptance.

## Evidence and reproduction

ERC reports zero messages. DRC reports zero violations, unconnected items or schematic-parity issues. Independent checks match 60 logical pins to 61 numbered pads and preserve the four winding polygons/19,229 samples. All 29 footprints have bundled models; 16 STEP assets are valid and 406 component-pair plus 29 substrate checks have no nominal positive-volume intersections.

Run `scripts/rebuild.py`, refresh Gerber renders, then `audit-layout.py`, `audit-layout-complete.py`, `audit-components.py` and `render-component-audit.py`. The last two use KiCad Python and the human-reviewed `sources/component-review.json`; a changed MPN/package/pin mapping fails the applicability check and requires new review. The component comparison against 9bc0614 is historical. Run `audit-mounting-revision.py --baseline-board PATH --baseline-id COMMIT` against the preceding 007bcb5 board for the current corner move. Renew CadQuery solid checks, schematic renders and the manifest before publication. Historical evidence is explicitly marked and is not proof of the current board.
'''
(R/'COMPONENT-AUDIT.md').write_text(intro+'\n'.join(sections)+footer,encoding='utf8')
