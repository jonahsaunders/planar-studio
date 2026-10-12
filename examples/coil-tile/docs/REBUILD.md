# Editing and rebuilding

Normal use: install KiCad 9, open `kicad/CoilTile.kicad_pro`, and edit normally.
All electrical libraries are project-local. Keep the `.kicad_pro` with the PCB
because it contains the clearance/track/via rules. Six optional 3D models are
local; missing optional U3/J1 models do not affect native footprints or fabrication.

**Generators overwrite CAD files.** Preserve manual edits before running them.
The files supplied in this package already contain the complete routed design.
You do not need to run a generator just to order or edit the design.

## Recreate from generator sources

Tested toolchain: KiCad 9.0.9, its matching `pcbnew` Python bindings, Python 3.12,
and Node.js. Python must be the interpreter that can import `pcbnew` (commonly
`/usr/bin/python3` on Linux). Set `KICAD9_SYMBOL_DIR` and `KICAD9_FOOTPRINT_DIR`
to your installed stock KiCad 9 library folders. Clone Planar Studio at the
commit in `REFERENCES.md` and set `PLANAR_STUDIO_ROOT` to that checkout.

From the `coil-tile` directory, after setting those environment variables:

```sh
node scripts/generate-coil.mjs
python3 scripts/generate-schematic.py
kicad-cli sch export netlist --format kicadxml -o evidence/netlist.xml kicad/CoilTile.kicad_sch
python3 scripts/generate-board.py
python3 scripts/export-release.py
```

The generator intentionally saves/reloads before filling zones; filling a fresh
in-memory board crashed the extracted KiCad build during development. It routes
the board explicitly rather than calling an autorouter. Coordinates and route
choices are in `generate-board.py`; the canonical part/net design is `design.py`. The connected schematic drawing
is in `schematic-layout.py`; its reflow function asserts original pin identities.

For a board edited in KiCad, run only `scripts/export-release.py` with compatible
KiCad/Python on PATH. It refills zones, runs strict native ERC/DRC/parity gates,
exports the current schematic's BOM, verifies the BOM/CPL reference sets and
creates the fabrication ZIP. It refuses export when the native gates fail.
After changes, inspect the plots again and update the review evidence, costs,
revision, package manifest and top-level project archive. Old preview images
are not automatically refreshed by this minimal release script.

The portable coil design JSON can be imported through Planar Studio's JSON
import function. Its geometry is one F.Cu winding; the board generator adds
terminal extensions and the back-layer inner-terminal escape. Altering the coil
dimensions requires reviewing neighboring routes and plane boundaries too.
