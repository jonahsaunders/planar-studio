# A10 validation and remaining qualification

This is an unbuilt engineering prototype. Automated checks establish geometry, connectivity and analytical screens, not measured temperature, retention, EMI or efficiency.

| Check | Current evidence |
| --- | --- |
| ERC, DRC, connectivity and schematic parity | `evidence/erc.rpt`, `evidence/board-drc.json` |
| Every ignored DRC category temporarily enabled; zero violations | `evidence/audit/all-drc-checks.json` |
| Actual copper clearance to winding, independent of net ties | `evidence/audit/winding-clearance-checks.json` |
| Internal turn spacing, missing/extra copper and matching Gerber regions | `evidence/audit/winding-integrity-checks.json` |
| Physical six-layer connectivity and virtual winding cuts | `evidence/audit/copper-topology-checks.json` |
| A10 winding/terminal containment; old spacing rejected | `evidence/audit/a10-revision-checks.json`, `scripts/test-winding-integrity.py` |
| Connection-width, mask, hole and annular constraints; tangent-via and thin-land regressions | `evidence/audit/clearance-rule-checks.json`, `scripts/test-clearance-rules.py` |
| Whole-board copper/hole/mask distances and all copper/mask Gerber geometry | `evidence/audit/board-clearance-checks.json`, `evidence/audit/full-gerber-geometry-checks.json` |
| Wide lands, inadequate clearance and added via rejected | `scripts/test-winding-clearance.py` |
| Standard silkscreen dimensions and clearance | `evidence/audit/silkscreen-checks.json` |
| Snubber energy, frequency, ambient derating and pulse screen | `evidence/audit/snubber-checks.json`, `SNUBBER-REVIEW.md` |
| Native pad/net agreement, winding polygons and mounting copper exclusions | `evidence/independent-checks.json`, `evidence/audit/mounting-checks.json` |
| Retained default 1 oz stack and winding reference | `evidence/audit/default-stack-checks.json` |
| All-layer clip copper clearance including 0.5 mm float | `evidence/audit/clip-copper-checks.json` |
| Maximum ferrite dimensions against routed openings | `evidence/audit/core-fit-checks.json` |
| Local models and nominal solid intersections | `evidence/audit/3d-model-checks.json`, `evidence/audit/3d-solid-checks.json` |
| Manufacturer package/pin review and ground-stitch attachment | `evidence/audit/component-checks.json` |
| BOM/CPL, six copper layers, 66 filled/capped holes and mounting | `evidence/manufacturing-checks.json` |
| 24 placements: 50 exact catalog pad centers + 4 R1/R6 manufacturer lands + 2 R7 same-series reference centers; 15 rejected wrong rotations/origins | `evidence/audit/placement-checks.json` |
| Electrical sizing and 54 analytical cases | `evidence/electrical-sizing.json`, `evidence/cycle-model.json` |
| Board STEP/GLB and actual exported Gerber renders | `evidence/audit/3d-render-provenance.json`, `evidence/audit/render-provenance.json` |

A10 compares directly with A9 commit `3b78238`. The generator uses 0.30 mm nominal spacing, a 13.9 mm outer-size setting (previously 13.6), 0.30 mm outer-primary terminal offsets, and 0.70 mm T1 lands around unchanged 0.30 mm holes. The winding width stays 0.60 mm, with four series primary turns and two parallel secondary turns. Core/clip openings, circuit values, component placements, via centers/drills and stack are retained. T1 terminals and their eight attached approach segments move with the geometry. Both SW necks and the SEC_A neck remain 1 mm long / 0.6 mm wide.

The measured turn gap is approximately **0.28872 mm** on all four winding layers; its conservative lower bound is **0.28572 mm**. The build requires both to meet 0.260 mm, strictly above 0.250 mm. This is a saved-CAD acceptance threshold, not a guarantee of delivered etching tolerances. The A9 0.23978 mm fixture fails the new threshold.

Four secondary via lands grow from 0.90 to 1.00 mm on their unchanged 0.90 mm pitch, producing approximately 0.436 mm ideal overlap necks. The previous tangent contacts are rejected by native DRC with the new 0.20 mm connection-width rule. Connection-width findings are errors. T1 has 0.20 mm nominal annular rings; other vias retain a 0.15 mm minimum rule. Hole-to-copper clearance is 0.30 mm and mask-to-unrelated-copper clearance is 0.09 mm.

The intended winding path is independently tested by physical connectivity and virtual cuts, with each parallel secondary tested separately. Full native copper and mask geometry is compared against all six copper Gerbers and both mask Gerbers within a 0.0003 mm approximation envelope. Winding Gerber regions additionally match native polygons exactly. The saved board is refilled after restoring project constraints; a temporary DRC refill is not accepted as a substitute for current saved copper.

Four new rule regressions complement five winding-integrity and five external-contact tests: fourteen cases total. They cover the A9 tangent via contacts, zero connection-width limits, T1 annular-ring regression, old 0.191/0.240 mm winding gaps, added/missing copper, wide lands, inadequate clearance and a via on the winding. The current board passes each positive control; the old defects are rejected.

Estimated magnetizing inductance remains 13.12 µH. Updated DC winding resistance is 0.32986 Ω primary / 0.08138 Ω secondary, about 1.75% / 1.46% above A9. Leakage estimate is 0.09172 µH and capacitance estimate is 22.13 pF. These are analytical estimates; physical losses and transient performance remain unqualified. A10 supersedes A7–A9 fabrication packages.

The preload screen includes 1% initial tolerance, 100 ppm/°C over 100 °C and a separate 1% aging reserve. Minimum current is 25.613 mA against 21.111 mA required (21.33% margin). Worst power is 0.158 W, or 76.65% of the 0.206 W derated rating at 85 °C local ambient. The reserve is not a lifetime qualification. Measure no-load regulation and temperature. [Preload derivation](PRELOAD-REVISION.md).

The conservative 0.638 W screen is 31.9% of the 2 W nominal R6 rating. At 85 °C local ambient the derated rating is 1.647 W; an 80% allowance is 1.318 W. Repetitive-pulse capability is unspecified in the CRH datasheet and must be qualified along with measured loss, temperature and clamp behavior. See SNUBBER-REVIEW.md.

Three independent fit methods cover native PCB/copper rules, maximum dimensions against saved-board cutouts and nominal solid intersections. The ferrite-corner minimum is 0.146 mm after 0.20 mm inward routing error per wall and 0.05 mm centered insertion error. Minimum vertical room is 2.21 mm per face at 1.78 mm PCB thickness. The accepted clip envelope leaves 0.25 mm routing clearance. An expanded metal-shadow check includes 0.5 mm pair movement and retains at least 0.672 mm to copper without soldermask credit.

TDK core and free-clip STEP files improve the nominal model, but do not specify installed spring force or full tolerance behavior. The displayed opening maps an 8.8 mm free CAD jaw to 9.4 mm recess-floor spacing. This is a geometric visualization surrogate, not an elastic simulation. Confirm seating, maximum envelope and retention using real parts. No vibration/shock rating is established.

The core, gap and turns are retained from A2, with winding spacing updated in A10: estimated 13.12 µH, accepted measured 11.0–14.6 µH. Maximum accepted L gives 0.253 T at 5.4 A versus the declared 0.27 T screen. Typical 7.2 A restart gives 0.337 T; fault-current margin is less than A1 and must be checked by bias/fault tests. Core/fringing/AC losses, nonlinear saturation, switching overshoot, controller dynamics and thermal behavior are not validated by the linear models. Minimum timing and 380 kHz are typical datasheet values; 350/420 kHz sensitivity cases are chosen assumptions. The 75% efficiency remains an assumption.

JLCPCB's published capabilities support this six-layer geometry. The delivered standard construction, selective filled/capped vias, panel, Standard-PCBA reflow and connector process still need factory acceptance. See the prototype test plan before production. Supplier acceptance and hardware qualification of A10 remain open.

The A4 stack selection is retained in A10. Native ERC/DRC and every current check above are rerun for A10. Historical A1–A9 comparisons and before-images remain background only, including `a9-revision-checks.json`, `complete-layout-checks.json`, `a8-revision-checks.json`, `procurement-revision-checks.json`, `snubber-revision-checks.json`, `a3-layout-comparison.json` and `mounting-clearance-comparison.json`. Current mounting and A10 containment checks establish the retained geometry. No safety-isolation or hardware manufacturing approval is implied.
