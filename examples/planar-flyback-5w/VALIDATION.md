# A2 validation and remaining qualification

This is an unbuilt engineering prototype. The files pass the automated checks listed below; those results do not prove efficiency, loop behavior, physical clip dimensions or factory acceptance.

| Check | Current evidence |
| --- | --- |
| Planar Studio regression and factory-gapped-core rejection cases | `npm test`, including `tests/transformer-stock-core.mjs` |
| KiCad ERC, DRC, unconnected pads and schematic parity | `evidence/erc.rpt`, `evidence/board-drc.json` |
| Native pin agreement and winding continuity/geometry | `evidence/independent-checks.json` |
| Pinned A1 comparison: electronic BOM, pad nets, placements, mounting and exterior outline | `evidence/audit/a2-baseline-comparison.json` |
| Electronic BOM/CPL, six copper layers, 66 filled/capped holes and mounting | `evidence/manufacturing-checks.json` |
| Every footprint has a local visible model | `evidence/audit/3d-model-checks.json` |
| Exact nominal model/substrate and 406 component-pair checks | `evidence/audit/3d-solid-checks.json` |
| Maximum ferrite dimensions and actual routed cutouts | `evidence/audit/core-fit-checks.json` |
| Stress sizing, minimum timing/preload and power-stage cycles | `evidence/electrical-sizing.json`, `evidence/cycle-model.json` |
| Actual fabrication layer renders | `evidence/audit/gerber-copper-overview.png`, `gerber-technical-overview.png` |

Fit is checked three ways: board/copper rules, independent tolerance arithmetic using the saved outline, and exact solid interference. The maximum ferrite-corner screen leaves 0.146 mm with inward 0.20 mm routing per wall and ±0.05 mm centered insertion offset. The minimum vertical clearance is 2.21 mm per face at 1.78 mm board thickness. No nominal body/substrate collisions are permitted. Clip bow remains conditional on the documented 1.5 mm outward envelope because the manufacturer does not dimension it. Verify this with actual parts.

A2 retains the original electronic BOM, nets, placements, 50 × 104 mm outline and mounting pattern. The 4:2 winding is regenerated for ELP22; copper is 0.6 mm wide and T1 vias are 0.6/0.3 mm. The estimated 13.12 µH inductance is accepted only when measured at 11.0–14.6 µH. Maximum accepted L produces 0.253 T at the controller's 5.4 A maximum normal current limit. The declared 0.27 T screen is based on 90% of TDK's 0.300 T core-table value at 100°C; it replaces A1's more conservative 0.15 T screen because the smaller core has less fault margin. This change is explicit, not a claim of equal saturation margin. The 7.2 A typical restart screen is 0.337 T and has no guaranteed fault-current margin; bench bias/fault qualification is required before release.

The 75% efficiency is assumed. Core loss, gap fringing, AC winding loss, nonlinear saturation, controller/burst dynamics and thermal behavior are not validated by the linear models. Minimum on/off times and the 380 kHz ceiling are datasheet typical values. Measure ripple, switching and feedback-pin excursions, startup, load steps, short-circuit recovery and temperatures under `manufacturing/PROTOTYPE-TEST-PLAN.md`. Revise the circuit/core if these fail.

JLCPCB capability review supports the six-layer ENIG geometry, ordinary routed slots, and filled/capped vias. JLCPCB still must accept the named stack, panel, selective fill, connector process and compatible Standard-PCBA reflow profile. No quote, DFM approval, supplier submission or order has occurred.

Legacy A1 audit reports in the root and older audit JSON/images are historical. Only current evidence above, with matching source hashes, supports A2. No generic historical “all checks passed” report overrides these limits.
