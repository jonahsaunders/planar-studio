# PS-FLYBACK-5W — planar flyback example

18–36 V DC input → isolated 5 V / 1 A output. Native KiCad 10 source, a routed six-layer PCB with integral planar windings, and an importable Planar Studio transformer design.

**A1 engineering prototype. No hardware has been built or tested. JLCPCB full-turnkey feasibility is unconfirmed. No request or files were submitted to JLCPCB, and no purchases were made.**

[KiStack audit](KISTACK-AUDIT.md) · [M3 mounting specification](manufacturing/MOUNTING.md) · [Validation and open issues](VALIDATION.md) · [Schematic](evidence/schematic.svg) · [Core assembly drawing](manufacturing/core-assembly.svg) · [Manufacturing notes](manufacturing/FABRICATION.md)

<p><img src="evidence/board.svg" alt="Routed front copper and silkscreen of the planar flyback board" width="270"></p>

A1 adds four American Embedded M3 mounting footprints (3.2 mm NPTH on a 41 × 80 mm pattern), preserves the board outline, fixes saved design-rule limits and part metadata, and includes a KiStack audit with rendered fabrication evidence. The [audit](KISTACK-AUDIT.md) distinguishes corrected findings from remaining prototype gates.

The schematic has been redrawn on one A4 sheet: a left-to-right power path, controller passives wired beside U1, complete clamp branches, readable component fields and separate primary/isolated returns. All 54 pin connections and 26 part records match the earlier A1 design; the PCB and manufacturing files are unchanged. [Redraw verification](evidence/audit/schematic-layout-checks.json).

[![Connected A4 schematic](evidence/audit/schematic-overview.png)](evidence/schematic.svg)

## Open the example

Clone this branch or use GitHub's **Code → Download ZIP** to get the repository. Open `examples/planar-flyback-5w/kicad/PS-FLYBACK-5W.kicad_pro` in KiCad 10. Symbols and all used footprints are included locally. The board is already placed and routed. Open `report.html` locally for the illustrated overview; GitHub displays its source.

Import `planar-studio/T1.planar.json` into Planar Studio to inspect the winding design. Use this development branch with prepared-core support (commit `9210fce` or later); the published 1.3.0 plugin does not contain that feature. See the repository's development-package build instructions.

`kicad/PS-FLYBACK-5W.kicad_pcb` is the complete converter. `planar-studio/T1-windings.kicad_pcb` is a winding geometry reference, not a fabrication-ready converter board. Manufacturing files remain **review only** pending the gates below.

## Included information

| Location | Contents |
| --- | --- |
| `kicad/` | Editable project, schematic, board, symbols and portable footprint library |
| `planar-studio/` | Importable T1 design, winding configuration, artwork and geometry exports |
| `manufacturing/` | Proposed stack, core installation drawing/process, electronic BOM/CPL, core materials schedule, via schedule, Gerbers/drills and prototype test plan |
| `evidence/` | KiCad ERC/DRC, independent pin/winding checks, electrical sizing, charge-balanced cycle calculations and waveform data |
| `sources/references.md`, `parts.json` | Source links and component identities; vendor PDFs are not redistributed |
| `scripts/` | Winding, schematic, layout, calculation, verification and packaging generators |
| `SHA256SUMS.json` | Integrity hashes for the published example files |

The LT8302 stage uses a 4:2-turn transformer, nominal 11.95 µH primary inductance and a prepared 0.21 mm center-leg gap. The two secondary layers operate in parallel. Two stock ungapped TDK core halves are **not substitutes** for the prepared core pair.

## Verification and limits

KiCad reports zero ERC messages, zero DRC violations and zero unconnected items. A separate checker matches all 54 logical schematic pins to 55 numbered physical pads, verifies the four winding polygons' intended terminal contacts and checks 19,229 centerline samples against final-board copper. Electronic BOM and placement references match; six copper Gerbers, 27 plated holes and four NPTH mounting holes are accounted for. Native schematic-parity checks also report zero issues.

Calculations cover current and voltage stresses, minimum inductance, preload, capacitor derating and approximate ripple. A separate charge-balanced boundary/DCM calculation includes winding resistance and a nominal 380 kHz frequency ceiling. It is **not an LT8302 closed-loop SPICE model**, and the assumed 75% efficiency in the stress worksheet is not a measured result.

The proposed manufacturer must accept the stack, source the prepared core pair, qualify its bonding/retention process and install it. Several resistor lines need sourcing confirmation. Prototype tests must establish actual inductance under bias, core/fringing losses, regulation, ripple, switch spikes, startup, overload and temperatures. The bulk-only ripple estimate is about 100 mV, leaving little margin; the parallel ceramic's benefit is unmeasured. See [VALIDATION.md](VALIDATION.md) for evidence and open gates.

Functional low-voltage isolation only: this is not a mains supply or certified safety-isolation design. Core sourcing and installation are part of the proposed turnkey scope. The [unsent feasibility-request template](manufacturing/JLCPCB-REVIEW-REQUEST.md) preserves that scope as reference information.

## Rebuild and package

Existing generated files open without running any scripts. To reproduce the design, use Node.js and **KiCad 10's Python with `pcbnew`**, plus the matching `kicad-cli`. Version 10.0.6 was used for the recorded validation. No third-party Python packages are required. Commands below run from this example directory.

```sh
python scripts/check-manifest.py
python scripts/rebuild.py
python scripts/package-project.py
```

Here `python` must be the KiCad Python interpreter for `rebuild.py`. On Windows, for example:

```powershell
& 'C:\Program Files\KiCad\10.0\bin\python.exe' scripts/rebuild.py --kicad-cli 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe'
```

On other platforms, use a Python interpreter configured to import KiCad's `pcbnew`; pass `--kicad-cli /path/to/kicad-cli` if it is not on PATH. The board generator uses bundled footprints. Only if one is missing does it need `KICAD10_FOOTPRINT_DIR` or `KICAD_FOOTPRINT_DIR` pointing to installed stock footprints.

Rebuild overwrites generated CAD, exports, calculations, previews and evidence, then refreshes the integrity manifest. It stops on ERC/DRC violations or independent-check failures. Save manual CAD changes before rebuilding. Geometry and electrical checks are repeatable; UUIDs, timestamps and export ordering need not be byte-identical. Review the resulting drawings and changed files before sharing revised manufacturing data.

The packager writes a complete review folder and ZIP to repository `dist/examples/`; it sends nothing. It requires a fresh destination to avoid silently retaining stale files. Use `--output /path/to/fresh-directory` for another destination. After design changes, rerun the additional visual audit described in `KISTACK-AUDIT.md`; stored audit pictures and findings are snapshots. In an extracted standalone review package, set `PLANAR_STUDIO_ROOT` to a checkout of this branch before rebuilding, and pass `--output` explicitly when packaging.

Changes to stack, terminals, footprints or components require regeneration and renewed engineering checks before reusing manufacturing exports. A0 did not identify the named “I2CJack” workflow. A1 explicitly uses the subsequently requested American Embedded KiStack audit skills, pinned in `KISTACK-AUDIT.md`.

## Attribution

Custom example files and Planar Studio are MIT licensed; see [LICENSE](LICENSE). Standard KiCad footprints are by the KiCad library contributors and redistributed under CC BY-SA 4.0 with KiCad's design exception; see [footprint license](kicad/Flyback.pretty/LICENSE.md). Vendor names and part identifiers establish design provenance, not supplier endorsement or availability.

The additional American Embedded mounting footprint is CC BY 4.0; see [its attribution](kicad/amemb-MountingHole.pretty/LICENSE.md). The unmodified KiStack placement converter retains [its upstream license](scripts/vendor/KISTACK-LICENSE.txt).
