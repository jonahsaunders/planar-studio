# Project-local 3D models

All **20 fitted components** have visible, project-local STEP models attached in
both the PCB and the footprint library. Paths use `${KIPRJMOD}/3dmodels/`; opening
`kicad/CoilTile.kicad_pro` in KiCad 9 does not require a global 3D-model install.

| References | Package model | Source |
|---|---|---|
| R1–R5 | 0603 resistor | KiCad Packages3D 9.0.9 |
| C3–C10 | 0603 capacitor | KiCad Packages3D 9.0.9 |
| C1–C2 | 0805 capacitor | KiCad Packages3D 9.0.9 |
| U1 | SOT-23-5 | KiCad Packages3D 9.0.9 |
| U4 | SOT-23-6 | KiCad Packages3D 9.0.9 |
| U2 | TSSOP-14, 4.4 × 5 mm, 0.65 mm pitch | KiCad Packages3D 9.0.9 |
| U3 | WQFN-16, 4 × 4 × 0.8 mm, 2.6 mm exposed pad | KiCad Library Tools, existing exact package definition |
| J1 | HRO TYPE-C-31-M-12 nominal housing and contacts | KiCad USB generator with project parameters |

L1–L4 are printed copper windings, TP1–TP4 are copper test pads, and H1–H4 are
unplated holes with exposed substrate. KiCad renders those 12 footprints from
the actual board geometry. They intentionally have no separate component bodies;
the assembly does not include coils, test-point hardware or metal screws.

## Sources and scope

- [KiCad Packages3D 9.0.9](https://gitlab.com/kicad/libraries/kicad-packages3D/-/tree/9.0.9).
  Original STEP attribution headers remain intact. Library license and exception
  are included in `licenses/KiCad-Libraries.md`.
- [KiCad Library Tools](https://gitlab.com/kicad/libraries/kicad-library-tools),
  commit `a903a695bf4e69905e9e56548f44dd46cdc1130e`.
  The sensor uses its `package/no_lead` generator and the existing
  `WQFN-16-1EP_4x4mm_P0.5mm_EP2.6x2.6mm` definition. Its dimensions match TI's
  RGH0016A package drawing in the [LDC1614 datasheet](https://www.ti.com/lit/ds/symlink/ldc1614.pdf).
- The USB model uses the existing `connector/USB/usb_connector.py` generator.
  External nominal dimensions are 8.94 × 7.35 × 3.16 mm, from HRO's
  TYPE-C-31-M-12 drawing dated 2020-11-09
  ([drawing mirror](https://github.com/Auglimmer/IoT_remote/blob/master/1.Hardware/datasheet/TYPE-C-31-M-12%E6%AF%8D%E5%BA%A7%E8%B4%B4%E7%89%87.PDF)).
  Locating pegs and shell stakes follow the existing footprint coordinates.
  Internal tongue, cavity and contact details are simplified for visualization;
  this is not manufacturer tooling CAD or enclosure-fit qualification.

Generated models retain the KiCad model license notice. The USB regeneration
wrapper is GPL-3.0-or-later; the corresponding license is included in `licenses/`.
Generic passive package models depict nominal bodies, not value-specific markings.

## Rebuild and verification

The checked-in STEP files are ready to use. Optional regeneration requires
CadQuery and the pinned KiCad Library Tools checkout, with its dependencies.
The parameter snapshots are under `kicad/3dmodels/sources/`.

```sh
# From the CoilTile directory, with the upstream checkout path configured:
export KICAD_LIBRARY_TOOLS_ROOT=/path/to/kicad-library-tools
python3 scripts/generate-usb-model.py

# Run the upstream package generator for the sensor model:
PYTHONPATH="$KICAD_LIBRARY_TOOLS_ROOT/src:$KICAD_LIBRARY_TOOLS_ROOT" \
python3 "$KICAD_LIBRARY_TOOLS_ROOT/src/generators/generate.py" \
  -m "$PWD/kicad/3dmodels" -g package/no_lead \
  -p WQFN-16-1EP_4x4mm_P0.5mm_EP2.6x2.6mm -j 1

# Use Python with KiCad's pcbnew bindings for attachment:
python3 scripts/attach-models.py
```

`attach-models.py` checks that every fitted part resolves locally and asserts that
all non-model PCB content remains identical. The board generator also rejects a
fitted footprint without a model, so regenerating the board preserves coverage.

`evidence/3d-model-coverage.json` records all 32 footprint representations.
`evidence/3d-model-geometry.json` records model checksums, valid solids and bounds.
The top and perspective previews were rendered with KiCad 9.0.9 and inspected for
model visibility, orientation and seating. ERC/DRC, connectivity and schematic
parity remain clean. This model-only update leaves the A3 fabrication files and
BOM unchanged; no hardware measurements or enclosure-fit tests were performed.

The earlier bare-board preview remains available as `evidence/bare-board-top.png`.
The current README uses `evidence/assembled-board-top.png`.
