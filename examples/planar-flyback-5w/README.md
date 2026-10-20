# PS-FLYBACK-5W A10 — winding clearance repairs

An engineering prototype for 18–36 V input and isolated 5 V / 1 A output. [Review report](report.html) · [Validation](VALIDATION.md) · [Manufacturing handoff](manufacturing/START-HERE.md).

**A10 retains the winding-short repair and adds clearance margin.** A7's wide SW landing shorted part of the primary. A8 repaired that landing but retained turn gaps of about 0.191 mm against a 0.200 mm rule. A9 measured approximately 0.240 mm. A10 uses 0.30 mm nominal spacing and measures approximately **0.289 mm** between turns on all four winding layers. The winding stays 0.6 mm wide with 4:2 turns. T1 terminals and attached approaches are updated; both SW necks are retained, and the SEC_A landing retains its 1 mm neck to preserve core-edge clearance. [Repair history](WINDING-CLEARANCE-REVISION.md).

**[Common PCB issues and checks](COMMON-ISSUES.md)** records the causes, why DRC missed them, and how to prevent recurrence. The schematic and PCB drawing layer point to this reference. Independent checks cover external copper, internal turn spacing, physical current paths and matching Gerber winding regions. Regression tests reject the original spacing defect and added/missing copper. [Spacing evidence](evidence/audit/winding-integrity-checks.json) · [A9-to-A10 comparison](evidence/audit/a10-revision-checks.json).

Four secondary via lands increase from 0.90 to 1.00 mm to eliminate tangent contacts. T1 lands increase from 0.60 to 0.70 mm around unchanged 0.30 mm holes, providing 0.20 mm annular rings. The winding size setting increases from 13.6 to 13.9 mm to preserve core-slot clearance. A10 retains the circuit values, component placements, OSP finish, 649 kΩ R1 / C25821, 180 Ω R7, core pair and stack. Resistance, leakage and capacitance estimates are refreshed from the revised winding paths. The estimated magnetizing inductance remains 13.12 µH. Earlier procurement stock figures are historical snapshots. [R1 procurement](PROCUREMENT-REVISION.md) · [Preload derivation](PRELOAD-REVISION.md).

The retained 39 Ω / 2 W snubber screens at **0.638 W**. Its repetitive-pulse capability and measured clamp/thermal behavior remain unqualified. [Snubber review](SNUBBER-REVIEW.md).

## 3D assembly

[![Assembled A10 flyback board with components, planar transformer core and spring clips](evidence/audit/board-3d-assembled.png)](evidence/audit/board-3d-assembled.png)

KiCad render of the saved A10 board. [Underside view](evidence/audit/board-3d-underside.png) · [Side view](evidence/audit/board-3d-side.png) · [STEP model](3d/PS-FLYBACK-5W.step) · [GLB model](3d/PS-FLYBACK-5W.glb). Package/core geometry is nominal; mounting hardware and clip retention include provisional envelopes. See [3D model sources and scope](3D-MODELS.md).

## Layer stack

![Top-to-bottom cross-section showing six copper layers and five dielectric layers, with individual thicknesses](images/stackup.svg)

The cross-section uses the published reference in [stackup.json](stackup.json): **1.609 mm excluding solder mask**, ordered as **1.6 mm nominal**. Layer heights in the illustration are not to scale. This is a modeling reference; the delivered factory construction still needs confirmation.

### Individual copper layers

Each image shows one exported Gerber layer in the same top-view orientation and at the same scale. Read left to right, then down, from L1 to L6; click any image for the full resolution.

| L1 · F.Cu — top | L2 · In1.Cu | L3 · In2.Cu |
| --- | --- | --- |
| [![L1 F.Cu: top copper and primary winding](evidence/audit/gerber-F_Cu.png)](evidence/audit/gerber-F_Cu.png) | [![L2 In1.Cu: first secondary winding layer](evidence/audit/gerber-In1_Cu.png)](evidence/audit/gerber-In1_Cu.png) | [![L3 In2.Cu: inner routing and via pads](evidence/audit/gerber-In2_Cu.png)](evidence/audit/gerber-In2_Cu.png) |
| **L4 · In3.Cu** | **L5 · In4.Cu** | **L6 · B.Cu — bottom** |
| [![L4 In3.Cu: inner routing and via pads](evidence/audit/gerber-In3_Cu.png)](evidence/audit/gerber-In3_Cu.png) | [![L5 In4.Cu: second secondary winding layer](evidence/audit/gerber-In4_Cu.png)](evidence/audit/gerber-In4_Cu.png) | [![L6 B.Cu: bottom copper and primary winding](evidence/audit/gerber-B_Cu.png)](evidence/audit/gerber-B_Cu.png) |

The primary connects the two-turn windings on **F.Cu and B.Cu in series** for four turns. The two-turn secondary windings on **In1.Cu and In4.Cu connect in parallel**. In2.Cu and In3.Cu carry routing and via pads, with no transformer winding. [Mask, paste, silkscreen and outline views](evidence/audit/gerber-technical-overview.png).

## Schematic

[![Complete A10 flyback schematic: input protection, LT8302 controller, 39-ohm 2 W snubber, planar transformer and isolated 5 V output](evidence/schematic.svg)](evidence/schematic.svg)

Current A10 schematic exported from KiCad. Open the image to zoom, or download the [native schematic](kicad/PS-FLYBACK-5W.kicad_sch).

## Retained construction

The board is 44 × 94 mm with a 35 × 85 mm mounting pattern and 10 mm copper exclusions around the M3 holes on all six layers. Order nominal 1.6 mm, 1 oz outer / 1 oz inner copper, Specify Stackup: No, OSP finish, and Standard PCBA. The model retains the published default 1.609 mm reference construction; the delivered stack still needs confirmation. [Stack background](STACK-REVISION.md).

The 4:2 planar transformer uses two factory-gapped TDK B66285G0050X187 N87 ELP22 halves and two B66286A2000X000 spring clips. No grinding or adhesive is specified. Install the core pair after PCBA and measure assembled inductance. All 29 footprints have local visible models. [Core installation](manufacturing/CORE-ASSEMBLY.md) · [3D sources](3D-MODELS.md).

## Checks and remaining work

Native ERC/DRC, schematic parity, package/net mapping, winding-spacing and terminal-change containment, mounting/clip clearance, solid fit and manufacturing export checks are recorded in VALIDATION.md. Standard silkscreen text is at least 1.0 mm high with 0.15 mm strokes and a 0.15 mm clearance rule.

The placement check covers 24 components, 50 saved exact-part catalog pad centers, four R1/R6 manufacturer land centers and two R7 same-series reference centers, with 15 rejected incorrect rotations/origins. Replacement R1/R6/R7 catalog geometry was unavailable; confirm these centered nonpolar placements in the fresh factory preview. [Placement review](manufacturing/PLACEMENT-REVIEW.md).

This remains an unbuilt prototype. Supplier acceptance of the stack, filled/capped vias, panel, Standard-PCBA reflow and connector process is open. Bench qualification must establish clamp and RFB waveforms, snubber pulse/thermal behavior, regulation, magnetics, startup/fault behavior and clip retention. The A10 repair has been checked in CAD; hardware qualification remains open.

## Rebuild

Run `scripts/rebuild.py --kicad-cli <KiCad-10-cli> --kicad-python <KiCad-Python-or-wrapper> --cadquery-python <Python-with-CadQuery-PyGerber-Pillow> --geometry-python <Python-with-Shapely-2.2-and-PyGerber-2.4.3>`. If Shapely is available in the CadQuery environment, omit `--geometry-python`. Node and Sharp rasterize the schematic; use `--node` and `--sharp-module` when they are not on the default paths. The default uses the saved A10 winding/core source; `--regenerate-magnetics` regenerates it from the repository engine and `winding-clearance.json`. The A10 comparison bounds winding, terminal, approach and four via-land changes. Nonzero connection-width, mask-clearance and annular-ring checks run alongside independent winding and complete copper/mask Gerber comparisons. The build refreshes native files, checks, manufacturing data, views and the A10 review ZIP.

The current A10 evidence is enumerated in VALIDATION.md. Earlier A1–A9 reports and images are historical context, not fresh proof for this board.
