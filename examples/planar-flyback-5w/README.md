# PS-FLYBACK-5W A3 — compact factory-gapped flyback

18–36 V DC to isolated 5 V / 1 A engineering prototype, designed using Planar Studio. A3 reduces A2 from 50 × 104 mm to **44 × 94 mm**, a **20.46% area reduction**, while preserving the exact winding copper and local electronic routing. Hardware qualification and JLCPCB order acceptance remain outstanding.

## Order and assemble

Per board: two [TDK B66285G0050X187 factory-gapped halves](https://www.digikey.com/en/products/detail/tdk/B66285G0050X187/11488590) and two [B66286A2000X000 clips](https://www.digikey.com/en/products/detail/tdk/B66286A2000X000/3915552), plus one six-layer PCB and 24 electronic placements. See [JLCPCB handoff](manufacturing/START-HERE.md). Five boards need ten halves and ten clips before spares. Inventory is unreserved; recheck checkout. No grinding or bonding is specified.

Open the [KiCad project](kicad/PS-FLYBACK-5W.kicad_pro), [Planar Studio design](planar-studio/T1.planar.json), [illustrated report](report.html) or [assembly STEP](3d/PS-FLYBACK-5W.step). The board includes all 29 models and a four-solid T1 assembly derived from TDK core/clip CAD.

## What changed

Input and output electronics each move 5 mm toward the fixed transformer. Trace widths, layers, local bends, component rotations and via count are preserved. Five transformer-connection segments shorten. One ground-stitching via moves to clear H1. Each mounting hole now has a 10 mm copper exclusion with 1.8 mm clearance beyond its 6.4 mm contact area and complete outward mask extension on all six layers. The enlarged mounting clearance removes copper only at the board corners; at least 96.3% of every A2 ground-plane area is retained. The electronic schematic/BOM, 4:2 winding, six-layer stack and magnetic operating point are unchanged from A2.

The mounting pattern changes from 41 × 95 to **35 × 85 mm**. Existing A2 enclosures/mounting plates will need new holes. All M3 centers remain 4.5 mm from adjacent edges.

## Clip fit and remaining concerns

TDK specifies B66286A2000X000 for this core pair. A3 includes its official free-spring CAD and the core's actual recess geometry. The displayed installed clip opening is an estimate, not a spring-force simulation. Independent checks retain the larger 1.5 mm outward clip envelope: 0.25 mm minimum slot clearance with routing tolerances, and at least 0.798 mm to copper including 0.5 mm pair movement. The ferrite corner check retains 0.146 mm and minimum vertical clearance is 2.21 mm per face.

The first physical pair must confirm spring engagement, retention and installed dimensions. The core can float; vibration mounting is not qualified. The smaller ELP22 core retains A2's reduced fault-current margin relative to A1. Accept measured primary inductance only at 11.0–14.6 µH and perform bias, short-circuit recovery, switching-stress and thermal tests. Compacting the board does not establish those results. [Validation](VALIDATION.md) · [Core assembly](manufacturing/CORE-ASSEMBLY.md).

## Reproduce

Use Node.js, KiCad 10's Python/CLI, and a separate Python environment with `cadquery==2.6.1`, `pygerber==2.4.3` and Pillow. Run `npm test` from the repository. Run `scripts/rebuild.py --kicad-cli <kicad-cli> --cadquery-python <environment-python>` with KiCad Python. The rebuild refreshes CAD, manufacturing files, checks and renders. `check-manifest.py` verifies file hashes. A packaged example needs `PLANAR_STUDIO_ROOT` pointing to this repository, including the pinned A2 and first-A3 baseline commits.

Only the evidence listed in VALIDATION.md qualifies the current A3 files. Earlier audit reports and comparisons are historical. No purchase, supplier submission or physical testing has occurred.
