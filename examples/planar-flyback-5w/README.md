# PS-FLYBACK-5W A5 — 2 W snubber revision

An engineering prototype for 18–36 V input and isolated 5 V / 1 A output. [Review report](report.html) · [Validation](VALIDATION.md) · [Manufacturing handoff](manufacturing/START-HERE.md).

A5 replaces R6 with **Ever Ohms CRH2512F39R0E04Z, 39 Ω ±1%, 2 W at 70 °C, 2512, JLCPCB C175263**. The October 9 catalog snapshot shows 4,986 available to order. The new footprint uses the manufacturer's 1.60 × 3.40 mm lands at 6.50 mm pitch. R6 moves 3.2 mm right, D4 moves 4.5 mm right, and three ground stitches move to clear the revised VIN/SNUB/CLAMP routes. The schematic, BOM, placement data, local model assignment, fabrication layers and previews are regenerated together.

The conservative snubber loss screen remains **0.641 W**, about **32% of the new 2 W rating**. At 85 °C local ambient the datasheet derates the resistor to 1.647 W. This improves average-power margin; the CRH datasheet does not provide a repetitive nanosecond pulse curve. C6 remains 470 pF C0G and D4 remains SMAJ12A. [Snubber analysis and bench acceptance](SNUBBER-REVIEW.md).

A comparison against merged A4 commit `d50da5e` verifies unchanged electrical topology, all other parts, winding copper, stack, board outline, mounting and core geometry. Only R6/D4 placement, the three ground stitches, local routing/pour and legends change. [Revision evidence](evidence/audit/snubber-revision-checks.json).

## 3D assembly

[![Assembled A5 flyback board with components, planar transformer core and spring clips](evidence/audit/board-3d-assembled.png)](evidence/audit/board-3d-assembled.png)

KiCad render of the saved A5 board. [Underside view](evidence/audit/board-3d-underside.png) · [Side view](evidence/audit/board-3d-side.png) · [STEP model](3d/PS-FLYBACK-5W.step) · [GLB model](3d/PS-FLYBACK-5W.glb). Package/core geometry is nominal; mounting hardware and clip retention include provisional envelopes. See [3D model sources and scope](3D-MODELS.md).

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

[![Complete A5 flyback schematic: input protection, LT8302 controller, 39-ohm 2 W snubber, planar transformer and isolated 5 V output](evidence/schematic.svg)](evidence/schematic.svg)

Current A5 schematic exported from KiCad. Open the image to zoom, or download the [native schematic](kicad/PS-FLYBACK-5W.kicad_sch).

## Retained construction

The board is 44 × 94 mm with a 35 × 85 mm mounting pattern and 10 mm copper exclusions around the M3 holes on all six layers. Order nominal 1.6 mm, 1 oz outer / 1 oz inner copper, Specify Stackup: No, and Standard PCBA. The model retains the published default 1.609 mm reference construction; the delivered stack still needs confirmation. [Stack background](STACK-REVISION.md).

The 4:2 planar transformer uses two factory-gapped TDK B66285G0050X187 N87 ELP22 halves and two B66286A2000X000 spring clips. No grinding or adhesive is specified. Install the core pair after PCBA and measure assembled inductance. All 29 footprints have local visible models. [Core installation](manufacturing/CORE-ASSEMBLY.md) · [3D sources](3D-MODELS.md).

## Checks and remaining work

Native ERC/DRC, schematic parity, package/net mapping, local-change containment, mounting/clip clearance, solid fit and manufacturing export checks are recorded in VALIDATION.md. Standard silkscreen text is at least 1.0 mm high with 0.15 mm strokes and a 0.15 mm clearance rule.

The placement check covers 24 components, 54 saved catalog pad centers and two R6 manufacturer land centers, with 15 rejected incorrect rotations/origins. The new R6 catalog geometry was unavailable; confirm its centered nonpolar placement in the fresh factory preview. [Placement review](manufacturing/PLACEMENT-REVIEW.md).

This remains an unbuilt prototype. Supplier acceptance of the stack, filled/capped vias, panel, Standard-PCBA reflow and connector process is open. Bench qualification must establish clamp and RFB waveforms, snubber pulse/thermal behavior, regulation, magnetics, startup/fault behavior and clip retention. No purchase or supplier submission has occurred.

## Rebuild

Run `scripts/rebuild.py --kicad-cli <KiCad-10-cli> --kicad-python <KiCad-Python-or-wrapper> --cadquery-python <Python-with-CadQuery-PyGerber-Pillow>`. The default retains the validated winding/core source; `--regenerate-magnetics` explicitly rebuilds those inputs and the revision comparison will reject unintended changes. The build refreshes native files, checks, manufacturing data, views and the A5 review ZIP.

The current A5 evidence is enumerated in VALIDATION.md. Earlier A1–A4 reports and images are historical context, not fresh proof for this board.
