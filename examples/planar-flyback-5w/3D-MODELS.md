# A2 local 3D models

All 29 board footprints have visible, project-relative STEP models. T1 contains two factory-gapped ELP22 halves and two matching clips in `kicad/3dmodels/custom/EELP22_factory_gapped_pair.step`; each half has a 0.05 mm center recess. The assembled board is in `3d/PS-FLYBACK-5W.step` and `.glb`.

The ferrite geometry follows the [TDK drawing](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_22_6_16.pdf), reconstructed by `scripts/generate-core-model.py`. It is not manufacturer-certified CAD. TDK does not dimension installed clip bow, thickness or recess depth completely: those visual details are illustrative. The separate conservative 1.5 mm outward clip envelope is an acceptance requirement to check on actual parts, not a manufacturer specification.

The remaining models retain A1 provenance: Bourns manufacturer fuse CAD normalized to KiCad; generic KiCad package STEP assets; drawing-based simplified connector and diode; illustrative nonconductive M3 screws/standoffs. Mounting hardware is excluded from the electrical BOM.

`verify-3d-models.py` checks every reference, hash and pose. `audit-3d-solids.py` checks all 406 footprint pairs and substrate intersections. `verify-core-fit.py` independently reads actual PCB cutouts and tests maximum ferrite dimensions, routed corner radii, per-wall routing tolerance, board thickness and the conditional clip envelope. Maximum body checks also allow 1 mm lateral movement when screening other component bodies. Clips may let the core float; retention, handling and vibration require physical testing.

Fresh top, bottom, side and oblique views are under `evidence/audit/board-3d-*.png`. The `*-before.png` images are historical. Reproduce the model with a CadQuery 2.6.1 environment; the main rebuild runs all current checks and renders.
