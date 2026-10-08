# PS-FLYBACK-5W A2 — factory-gapped DigiKey core

18–36 V DC to isolated 5 V / 1 A engineering prototype, designed using Planar Studio. A2 replaces the custom-ground ELP32 pair with two factory-gapped ELP22 halves and spring clips. **CAD and analytical checks are complete; hardware performance, the physical clip envelope and JLCPCB order acceptance are not yet qualified.**

## Buy and build

| Part | Quantity per board | Source |
| --- | ---: | --- |
| TDK B66285G0050X187, N87, factory 0.05 mm center-leg gap | 2 | [DigiKey 495-B66285G0050X187-ND](https://www.digikey.com/en/products/detail/tdk/B66285G0050X187/11488590) |
| TDK B66286A2000X000 spring clip | 2 | [DigiKey 495-B66286A2000X000-ND](https://www.digikey.com/en/products/detail/tdk/B66286A2000X000/3915552) |
| Six-layer PCB and 24 electronic placements | 1 | [JLCPCB handoff](manufacturing/START-HERE.md) |

Five boards need 10 halves and 10 clips before spares. The indexed US listings retrieved October 8 showed 530 halves and 9,596 clips, MOQ 1. Inventory and prices are unreserved; recheck checkout. Neither an ungapped half nor an I plate is a substitute. No grinding, adhesive, activator, tape or shim is specified in A2.

Open [the KiCad project](kicad/PS-FLYBACK-5W.kicad_pro) or [the editable Planar Studio design](planar-studio/T1.planar.json). The board includes a local four-solid core/clip STEP model, and [the complete assembly](3d/PS-FLYBACK-5W.step) is exported. [3D model scope](3D-MODELS.md).

## Revision and checks

The 50 × 104 mm outline, six-layer JLC061611-1080A stack, 4:2 winding ratio, controller, electronic BOM and component placements are preserved. Winding traces are now 0.6 mm wide; T1 vias are 0.6/0.3 mm pad/drill. The ferrite slots are resized and widened outward for the clips. Primary winding resistance at the model's 60°C is 0.325 ohm; secondary is 0.0805 ohm. The total center gap is 0.10 mm and estimated primary inductance 13.12 µH.

Measure assembled Lm and accept **11.0–14.6 µH**, secondary open. This is an application acceptance window, not a purchased AL tolerance. The smaller core has less fault-current margin than A1: the linear 5.4 A screen is 0.253 T at maximum accepted L; the typical 7.2 A restart excursion is 0.337 T and requires bias/fault testing. First-article thermal and switching tests remain essential.

Three complementary fit checks are provided: native board/copper rules; independent maximum-size ferrite corner checks against cutouts recovered from the saved PCB; and exact STEP intersections against the substrate and other components. The worst checked corner clearance is 0.146 mm, including ±0.2 mm per-wall routing and ±0.05 mm centered insertion offset. Minimum vertical clearance is 2.21 mm per face with a 1.78 mm PCB. Clip bow/recess details are not fully specified by TDK: the 1.5 mm outward envelope remains a physical first-article gate. [Validation](VALIDATION.md) · [Core installation](manufacturing/CORE-ASSEMBLY.md).

## Reproduce

Use Node.js, KiCad 10's Python and CLI, plus a separate Python environment with `cadquery==2.6.1`, `pygerber==2.4.3` and Pillow. Run `npm test` from the repository, then run `scripts/rebuild.py --kicad-cli <kicad-cli> --cadquery-python <environment-python>` with KiCad Python. The rebuild refreshes CAD, fabrication files, fit evidence, models and previews. `scripts/check-manifest.py` verifies the delivered file hashes. Generating from a packaged example requires `PLANAR_STUDIO_ROOT` pointing to this repository revision.

A1 historical audit reports are labeled as such and are not A2 release evidence. Current proof is listed in VALIDATION.md. No supplier upload, purchase or physical testing has been performed.
