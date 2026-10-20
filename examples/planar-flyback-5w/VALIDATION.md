# A9 validation and remaining qualification

This is an unbuilt engineering prototype. Automated checks establish geometry, connectivity and analytical screens, not measured temperature, retention, EMI or efficiency.

| Check | Current evidence |
| --- | --- |
| ERC, DRC, connectivity and schematic parity | `evidence/erc.rpt`, `evidence/board-drc.json` |
| Every ignored DRC category temporarily enabled; zero violations | `evidence/audit/all-drc-checks.json` |
| Actual copper clearance to winding, independent of net ties | `evidence/audit/winding-clearance-checks.json` |
| Internal turn spacing, missing/extra copper and matching Gerber regions | `evidence/audit/winding-integrity-checks.json` |
| Physical six-layer connectivity and virtual winding cuts | `evidence/audit/copper-topology-checks.json` |
| A9 winding/terminal containment; old spacing rejected | `evidence/audit/a9-revision-checks.json`, `scripts/test-winding-integrity.py` |
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

A9 compares directly with A8 commit `58b8679`. Only `traceS` (0.20 to 0.25 mm) and the two outer primary terminal offsets (0 to 0.10 mm) change in the winding configuration. The 0.6 mm width, 4:2 turns, series/parallel connections, core and stack remain. T1 pads and internal transition move with the winding; attached leads follow them. Both 1 mm SW necks are retained; SEC_A gains a 1 mm / 0.6 mm neck to preserve the 0.50 mm core-edge rule. All other component pads/placements, external vias and board/cutout outlines are unchanged. Pour differences are confined to the affected approach neighborhoods.

Measured turn gaps are about 0.23978 mm on all four winding layers, versus the 0.200 mm rule. A conservative envelope bound is 0.23678 mm. The integrity check rejects A8's approximately 0.19105 mm gaps, extra copper and missing copper. The five external-contact tests and four integrity tests pass. The topology audit checks physical copper across six layers and separately cuts each parallel secondary branch. It has explicit terminal/corner exclusions; see [common issues and check limits](COMMON-ISSUES.md). Native winding polygons must exactly match the exported Gerber regions.

The estimated magnetizing inductance stays 13.12 µH. Updated estimates are primary DC resistance 0.32419 Ω, secondary DC resistance 0.08020 Ω and leakage 0.09555 µH. These are model outputs, not hardware measurements. A7 and A8 packages are superseded by A9.

The preload screen includes 1% initial tolerance, 100 ppm/°C over 100 °C and a separate 1% aging reserve. Minimum current is 25.613 mA against 21.111 mA required (21.33% margin). Worst power is 0.158 W, or 76.65% of the 0.206 W derated rating at 85 °C local ambient. The reserve is not a lifetime qualification. Measure no-load regulation and temperature. [Preload derivation](PRELOAD-REVISION.md).

The conservative 0.638 W screen is 31.9% of the 2 W nominal R6 rating. At 85 °C local ambient the derated rating is 1.647 W; an 80% allowance is 1.318 W. Repetitive-pulse capability is unspecified in the CRH datasheet and must be qualified along with measured loss, temperature and clamp behavior. See SNUBBER-REVIEW.md.

Three independent fit methods cover native PCB/copper rules, maximum dimensions against saved-board cutouts and nominal solid intersections. The ferrite-corner minimum is 0.146 mm after 0.20 mm inward routing error per wall and 0.05 mm centered insertion error. Minimum vertical room is 2.21 mm per face at 1.78 mm PCB thickness. The accepted clip envelope leaves 0.25 mm routing clearance. An expanded metal-shadow check includes 0.5 mm pair movement and retains at least 0.798 mm to copper without soldermask credit.

TDK core and free-clip STEP files improve the nominal model, but do not specify installed spring force or full tolerance behavior. The displayed opening maps an 8.8 mm free CAD jaw to 9.4 mm recess-floor spacing. This is a geometric visualization surrogate, not an elastic simulation. Confirm seating, maximum envelope and retention using real parts. No vibration/shock rating is established.

The core, gap and turns are retained from A2, with winding spacing updated in A9: estimated 13.12 µH, accepted measured 11.0–14.6 µH. Maximum accepted L gives 0.253 T at 5.4 A versus the declared 0.27 T screen. Typical 7.2 A restart gives 0.337 T; fault-current margin is less than A1 and must be checked by bias/fault tests. Core/fringing/AC losses, nonlinear saturation, switching overshoot, controller dynamics and thermal behavior are not validated by the linear models. Minimum timing and 380 kHz are typical datasheet values; 350/420 kHz sensitivity cases are chosen assumptions. The 75% efficiency remains an assumption.

JLCPCB's published capabilities support this six-layer geometry. The delivered standard construction, selective filled/capped vias, panel, Standard-PCBA reflow and connector process still need factory acceptance. See the prototype test plan before production. Supplier acceptance and hardware qualification of A9 remain open.

The A4 stack selection is retained in A9. Native ERC/DRC and every current check above are rerun for A9. Historical A1–A8 comparisons and before-images remain background only, including `a8-revision-checks.json`, `procurement-revision-checks.json`, `snubber-revision-checks.json`, `a3-layout-comparison.json` and `mounting-clearance-comparison.json`. Current mounting and A9 containment checks establish the retained geometry. No safety-isolation or hardware manufacturing approval is implied.
