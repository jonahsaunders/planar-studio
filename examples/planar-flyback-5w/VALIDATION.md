# A3 validation and remaining qualification

This is an unbuilt engineering prototype. Automated checks establish geometry, connectivity and analytical screens. They do not prove physical retention, EMI, efficiency or temperature.

| Check | Current evidence |
| --- | --- |
| KiCad ERC, DRC, connectivity and schematic parity | `evidence/erc.rpt`, `evidence/board-drc.json` |
| Native pin agreement, winding polygons and mounting copper keepouts | `evidence/independent-checks.json`, `evidence/audit/mounting-checks.json` |
| A2 comparison: identical circuit, winding and local routing; shortened leads and plane-area retention | `evidence/audit/a3-layout-comparison.json` |
| Enlarged mounting clearance: unchanged tracks, one ground via move and pour changes confined to mounting regions | `evidence/audit/mounting-clearance-comparison.json` |
| Clip envelope against every copper layer, including 0.5 mm pair movement | `evidence/audit/clip-copper-checks.json` |
| Maximum ferrite dimensions, rounded slots and routing tolerance | `evidence/audit/core-fit-checks.json` |
| Local model references and nominal solid intersections | `evidence/audit/3d-model-checks.json`, `evidence/audit/3d-solid-checks.json` |
| Manufacturer CAD provenance | `sources/tdk-mechanical-cad.json` |
| BOM/CPL, six copper layers, 66 filled/capped holes and mounting | `evidence/manufacturing-checks.json` |
| Exact catalog placement: 24 components, 56 pad centers/nets, 15 rejected wrong rotations/origins | `evidence/audit/placement-checks.json`, `manufacturing/PLACEMENT-REVIEW.md` |
| Electrical sizing and 54 analytical load cases | `evidence/electrical-sizing.json`, `evidence/cycle-model.json` |
| Actual fabrication-layer renders | `evidence/audit/render-provenance.json` and Gerber contact sheets |

A3 moves primary electronics +5 mm Y and secondary electronics -5 mm Y without rotating or rerouting local circuitry. Five T1 connection segments shorten. The exact T1 copper polygons, trace widths/layers and via count are preserved. A single ground-stitching via moves from A2 (84.5,40) to (86,47) mm to clear H1. Each hole has a 10 mm copper exclusion and 1.8 mm nominal copper clearance beyond the complete 6.4 mm hardware-contact/mask opening, including its edge extension. All six layers are checked with 0.01 mm geometry tolerance. Ground-plane copper retains at least 96.3% of A2 area. Comparison against the first A3 proves that only corner pour areas and that one stitching via change in this clearance update. The board shrinks from 50 × 104 to 44 × 94 mm. M3 mounting changes from 41 × 95 to 35 × 85 mm.

Three independent fit methods cover native PCB/copper rules, maximum dimensions against saved-board cutouts and nominal solid intersections. The ferrite-corner minimum is 0.146 mm after 0.20 mm inward routing error per wall and 0.05 mm centered insertion error. Minimum vertical room is 2.21 mm per face at 1.78 mm PCB thickness. The accepted clip envelope leaves 0.25 mm routing clearance. An expanded metal-shadow check includes 0.5 mm pair movement and retains at least 0.798 mm to copper without soldermask credit.

TDK core and free-clip STEP files improve the nominal model, but do not specify installed spring force or full tolerance behavior. The displayed opening maps an 8.8 mm free CAD jaw to 9.4 mm recess-floor spacing. This is a geometric visualization surrogate, not an elastic simulation. Confirm seating, maximum envelope and retention using real parts. No vibration/shock rating is established.

The magnetic design is unchanged from A2: estimated 13.12 µH, accepted measured 11.0–14.6 µH. Maximum accepted L gives 0.253 T at 5.4 A versus the declared 0.27 T screen. Typical 7.2 A restart gives 0.337 T; fault-current margin is less than A1 and must be checked by bias/fault tests. Core/fringing/AC losses, nonlinear saturation, switching overshoot, controller dynamics and thermal behavior are not validated by the linear models. Minimum timing and 380 kHz are typical datasheet values; 350/420 kHz sensitivity cases are chosen assumptions. The 75% efficiency remains an assumption.

JLCPCB's published capabilities support this six-layer geometry. The named stack, selective filled/capped vias, panel, Standard-PCBA reflow and connector process still need factory acceptance. See the prototype test plan before production. No quote, supplier submission or order has been made.

The Planar Studio engine is unchanged from tested A2. A3's final checks and their hashes are recorded with the release evidence. Older A1/A2 audit reports, before-images and baseline comparisons are historical, not current board proofs.
