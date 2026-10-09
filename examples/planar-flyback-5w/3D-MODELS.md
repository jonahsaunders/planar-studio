# A5 local 3D models

All 29 footprints have visible project-relative STEP models. T1 contains two factory-gapped ELP22 halves and two clips. The complete assembly is exported as STEP and GLB.

A3 replaces the reconstructed ferrite/recess and approximate clip profile with [TDK core CAD](https://product.tdk.com/en/search/ferrite/ferrite/ferrite-core/info?part_no=B66285G0000X187) and [TDK clip CAD](https://product.tdk.com/en/search/ferrite/ferrite/ferrite-acc/info?part_no=B66286A2000X000). Original files, download URLs and hashes are retained. The purchased gap is modeled on each center post. The free clip has an 8.8 mm nominal CAD jaw and must open to the pair's 9.4 mm recess-floor spacing. The displayed installed opening scales the profile in Z; it is a geometric surrogate, not an elastic-force simulation. Do not interpret apparent contact as proven retention force.

The displayed clip projects 0.9 mm beyond the 10.9 mm nominal ferrite edge. Independent checks instead reserve 1.5 mm beyond the maximum core edge, allow routed-slot tolerance, and check a full metal projection including 0.5 mm pair movement against all six copper layers. Minimum computed metal-projection-to-copper clearance is 0.798 mm; no soldermask insulation is credited. First-article spring engagement, retention and installed envelope remain required.

The other models retain A1/A2 provenance: manufacturer Bourns fuse CAD, generic KiCad packages, simplified connector/diode geometry and illustrative M3 screws/standoffs. These mounting parts are not procurement-qualified.

Current evidence: `3d-model-checks.json`, `3d-solid-checks.json`, `core-fit-checks.json`, `clip-copper-checks.json` and `snubber-revision-checks.json` under `evidence/audit/`. Older before-images and audit comparisons are historical.

A5 assigns R6 the existing generic KiCad `R_2512_6332Metric.step` model at its new position. The CRH body is nominally 6.30 × 3.20 × 0.65 mm; the illustrative model does not replace the Ever Ohms datasheet or the manufacturer-derived footprint lands. R6 and D4 placements are refreshed in the native assembly, STEP, GLB and rendered views.
