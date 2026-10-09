# A4 historical stack revision — 1 oz inner copper, no specified stack

Order six layers, **nominal 1.6 mm, 1 oz outer copper, 1 oz inner copper, Specify Stackup: No**, no impedance control, ENIG and Standard PCBA. This replaces A3's paid JLC061611-1080A selection. The reference below is not a requirement to purchase a named stack or exact prepreg construction.

The [JLCPCB public stack table](https://jlcpcb.com/impedance), with six layers / 1.6 mm / 1 oz outer / 1 oz inner selected on October 8, 2026, shows this **No requirement** construction:

| Layer | Copper (mm) | Dielectric to next copper (mm) |
| --- | --- | --- |
| F.Cu | 0.035 | 0.203 |
| In1.Cu | 0.030 | 0.250 |
| In2.Cu | 0.030 | 0.513 |
| In3.Cu | 0.030 | 0.250 |
| In4.Cu | 0.030 | 0.203 |
| B.Cu | 0.035 | — |

The published sum is **1.609 mm excluding mask**; the order remains **1.6 mm nominal**. The public default matches the JLC061611-7628 reference table, but that named option must not be selected. Capture the actual delivered standard construction and re-screen spacing/material differences; no fixed dielectric thickness, brand or impedance guarantee is requested.

## Calculated change from A3

Planar Studio uses the same winding geometry and conservative 30 µm winding-copper model at an assumed 60 °C. Winding layer centers change from 0 / 0.1015 / 1.4815 / 1.583 mm to **0 / 0.2355 / 1.3385 / 1.574 mm**. The capacitance approximation now uses effective Er=4.4 for the adjacent 7628 prepreg, instead of the previous uniform 4.2 assumption.

| Quantity | A3 named stack | A4 default reference |
| --- | --- | --- |
| Primary DC resistance | 0.324939 Ω | 0.324932 Ω |
| Secondary DC resistance | 0.080516 Ω | 0.080516 Ω |
| Nominal magnetizing inductance | 13.12 µH | 13.12 µH |
| Estimated primary leakage | 0.04151 µH | 0.10178 µH |
| Estimated interwinding capacitance | 67.46 pF | 24.63 pF |

The negligible primary resistance difference comes from the changed modeled via length. The increased leakage is approximately 0.78% of nominal inductance. It does not establish clamp performance or fault survival; measure leakage and switching overshoot on the prototype. These first-order models exclude nonlinear magnetics, gap fringing, core loss and thermal behavior. The engine assumes 25 µm via plating and excludes shared terminal buses and external routes; delivered plating and total losses still need qualification.

## Revision scope and checks

The circuit, electronic BOM, winding turns and two-dimensional copper, component placement, routing, board outline, mounting clearances and core cutouts are retained. Native stack metadata, Planar Studio layer positions, core model vertical position, generated fabrication evidence and A4 revision labels are updated together. This is a new engineering revision, not manufacturing approval.

`scripts/rebuild.py` runs native ERC/DRC with zone refill and schematic parity, winding/net checks, A2/A3 geometry comparisons, the new A4 order/stack consistency check, placement/polarity checks, nominal solids and tolerance-aware core/clip checks, sizing and the 54 analytical operating cases. `evidence/audit/default-stack-checks.json` records the stack comparison against A3 commit 81d4d69. `SHA256SUMS.json` covers the generated package.

The October 9 update corrects silkscreen dimensions and clearance; native DRC and the non-silkscreen parity check pass. The remaining audit items are: obtain the Standard-PCBA panel and component-compatible reflow agreement; verify actual clip retention and measured inductance; qualify saturation during high-current faults, clamp/input transients and temperatures. Selecting the default construction does not close those items. The factory-gapped halves still require no user grinding or bonding.

A5 retains this stack and magnetic geometry while upgrading R6 to 2 W / 2512. Current layout changes and validation are described in README.md and VALIDATION.md; the earlier silkscreen-only parity statement above applies only to A4.
