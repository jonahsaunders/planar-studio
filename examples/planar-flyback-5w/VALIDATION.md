# A5 validation and remaining qualification

This is an unbuilt engineering prototype. Automated checks establish geometry, connectivity and analytical screens, not measured temperature, retention, EMI or efficiency.

| Check | Current evidence |
| --- | --- |
| ERC, DRC, connectivity and schematic parity | `evidence/erc.rpt`, `evidence/board-drc.json` |
| R6 identity/lands, retained topology/winding/stack/mechanics, changes confined to local snubber region | `evidence/audit/snubber-revision-checks.json` |
| Standard silkscreen dimensions and clearance | `evidence/audit/silkscreen-checks.json` |
| Snubber energy, frequency, ambient derating and pulse screen | `evidence/audit/snubber-checks.json`, `SNUBBER-REVIEW.md` |
| Native pad/net agreement, winding polygons and mounting copper exclusions | `evidence/independent-checks.json`, `evidence/audit/mounting-checks.json` |
| Retained default 1 oz stack and winding reference | `evidence/audit/default-stack-checks.json` |
| All-layer clip copper clearance including 0.5 mm float | `evidence/audit/clip-copper-checks.json` |
| Maximum ferrite dimensions against routed openings | `evidence/audit/core-fit-checks.json` |
| Local models and nominal solid intersections | `evidence/audit/3d-model-checks.json`, `evidence/audit/3d-solid-checks.json` |
| Manufacturer package/pin review and ground-stitch attachment | `evidence/audit/component-checks.json` |
| BOM/CPL, six copper layers, 66 filled/capped holes and mounting | `evidence/manufacturing-checks.json` |
| 24 placements: 54 catalog pad centers + 2 R6 manufacturer lands; 15 rejected wrong rotations/origins | `evidence/audit/placement-checks.json` |
| Electrical sizing and 54 analytical cases | `evidence/electrical-sizing.json`, `evidence/cycle-model.json` |
| Board STEP/GLB and actual exported Gerber renders | `evidence/audit/3d-render-provenance.json`, `evidence/audit/render-provenance.json` |

A5 compares directly with merged A4 commit `d50da5e`. R6 changes to 39 Ω / 2 W / 2512 with manufacturer-recommended lands, R6 and D4 move, and three local ground stitches move. Nine old route segments are replaced by ten segments. Routing and filled-pour differences are confined to X=98.5–117 mm, Y=62–72.5 mm. All other component pads/poses, the complete winding, stack, outline and mounting geometry remain unchanged. This replaces the earlier silkscreen-only parity claim for the current revision.

The conservative 0.641 W screen is 32.1% of the 2 W nominal R6 rating. At 85 °C local ambient the derated rating is 1.647 W; an 80% allowance is 1.318 W. Repetitive-pulse capability is unspecified in the CRH datasheet and must be qualified along with measured loss, temperature and clamp behavior. See SNUBBER-REVIEW.md.

Three independent fit methods cover native PCB/copper rules, maximum dimensions against saved-board cutouts and nominal solid intersections. The ferrite-corner minimum is 0.146 mm after 0.20 mm inward routing error per wall and 0.05 mm centered insertion error. Minimum vertical room is 2.21 mm per face at 1.78 mm PCB thickness. The accepted clip envelope leaves 0.25 mm routing clearance. An expanded metal-shadow check includes 0.5 mm pair movement and retains at least 0.798 mm to copper without soldermask credit.

TDK core and free-clip STEP files improve the nominal model, but do not specify installed spring force or full tolerance behavior. The displayed opening maps an 8.8 mm free CAD jaw to 9.4 mm recess-floor spacing. This is a geometric visualization surrogate, not an elastic simulation. Confirm seating, maximum envelope and retention using real parts. No vibration/shock rating is established.

The magnetic design is unchanged from A2: estimated 13.12 µH, accepted measured 11.0–14.6 µH. Maximum accepted L gives 0.253 T at 5.4 A versus the declared 0.27 T screen. Typical 7.2 A restart gives 0.337 T; fault-current margin is less than A1 and must be checked by bias/fault tests. Core/fringing/AC losses, nonlinear saturation, switching overshoot, controller dynamics and thermal behavior are not validated by the linear models. Minimum timing and 380 kHz are typical datasheet values; 350/420 kHz sensitivity cases are chosen assumptions. The 75% efficiency remains an assumption.

JLCPCB's published capabilities support this six-layer geometry. The delivered standard construction, selective filled/capped vias, panel, Standard-PCBA reflow and connector process still need factory acceptance. See the prototype test plan before production. No supplier-accepted quotation, submission or order has been made.

The A4 stack selection is retained in A5. Native ERC/DRC and every current check above are rerun for A5. Historical A1–A4 comparisons and before-images retain their original hashes and are background only. In particular, `a3-layout-comparison.json` and `mounting-clearance-comparison.json` are historical; current mounting checks and the A5 containment comparison establish the retained geometry. No safety-isolation or hardware manufacturing approval is implied.
