# Development

[Back to Planar Studio](../README.md)

## Run without KiCad

From the repository root, run:

```sh
python ipc_entry.py --browser --verbose
```

Use `python3` if that is the Python 3 command on your system. Design, analysis and
file exports work without KiCad; actions on an open board require a KiCad
connection. The optional native-window backend is described in
[requirements.txt](../requirements.txt).

## Build an installer

```sh
python scripts/build_package.py
```

The cross-platform builder reads the version from `metadata.json`, checks the
release notes and writes `dist/planar-studio-<version>.zip`. It validates the
archive's Plugin and Content Manager layout before finishing. Install that ZIP
using the [README instructions](../README.md#install).

The shell builder, `./build.sh`, is also available where Python 3 and `zip` are
installed. Published installers are versioned; updating the README does not
publish a new release.

## Checks

Node.js and Python 3 are required. From the repository root:

```sh
npm ci
npm test
```

Useful focused checks:

```sh
npm run test:numerics       # reference calculations
npm run test:plugin         # Python RPC and persistence
npm run test:transformer    # transformer models and workflow
```

For browser checks:

```sh
npx playwright install chromium
npm run test:ui
```

See [package.json](../package.json) for the full set of checks. Numerical and
software tests do not establish hardware performance.

## Screenshots

```sh
npm run shots
npm run shots:motor
```

These commands require the Playwright Chromium installation above. The motor
capture uses a local application server and replaces the README's marked gallery
only after all five captures succeed. Set `PYTHON` to your Python executable if
needed. Generated copper previews and application screenshots are labeled
separately.

## KiCad integration

The plugin runs in its own Python process and communicates with KiCad through
the IPC API. It serves the interface on loopback, using a native window when
available and a browser otherwise.

It reads the open board's stack and uses its copper layers. Placement is a
single undoable operation; replacing a previously placed design updates the
generated items without replacing unrelated board content.

Create destination nets in the schematic before placing copper into a live
board. For footprint terminals, use **Library** to write a `.kicad_mod` into the
project-local `planar-studio.pretty` library. Direct board placement uses vias
where the IPC API cannot create standalone pads.

## Export formats

Placing into the open board is the normal path. The other formats exist for
what it does not cover:

- **`.kicad_mod`** — copper as footprint graphics with through-hole terminals.
  **Library** writes it into the project and registers it; **Export** saves it
  wherever you like.
- **`.kicad_pcb`** — real tracks, vias and nets with a full layer table. *File →
  Open*, or *File → Append Board*. Take this one if you want the design as a
  standalone board.
- **SVG** and **DXF R12** — documentation, mechanical CAD, and FEA meshing
  (FEMM, Ansys).
- **JSON** — every parameter and the computed results. Reload it, or diff two
  revisions.
- **Specification sheet** — a Markdown table of every quantity, with the models
  and their limits named.

The export tolerance is a real distance: no copper edge moves further than it
when a path is simplified. The status bar shows the segment count before you
commit, because a board editor gets unpleasant above about 20,000 track
segments and it is better to know first.

## Repository layout

```
plugin.json           IPC API manifest — identifier, runtime, toolbar action
ipc_entry.py          entry point KiCad launches
requirements.txt      kicad-python dependency; optional window setup notes
metadata.json         Plugin and Content Manager package description
build.sh              assembles the PCM archive

planar_studio/
  app.py              the RPC surface and the process lifecycle
  kicad_link.py       everything that touches kipy — the only file that does
  server.py           loopback HTTP server, token auth, static assets
  window.py           native window, with the browser as a first-class fallback
  library.py          .kicad_mod writer and fp-lib-table registration
  store.py            preferences, saved designs, placement registry

web/
  index.html          the shell
  css/app.css         the design language, light and dark
  js/
    app.js            state, recompute scheduling, actions
    bridge.js         the page's half of the plugin conversation
    engine/
      coil.js         geometry generators, stack-up, EM solver
      coilgeom.js     windings and stator rings into artwork
      filter.js       prototypes, transforms, topologies, S-parameters
      filtergeom.js   synthesised networks into copper
      microstrip.js   Hammerstad–Jensen, coupled lines, planar passives
      complex.js      complex arithmetic and ABCD matrices
      artwork.js      the one geometry format everything downstream reads
      exporters.js    .kicad_mod, .kicad_pcb, SVG, DXF, JSON, spec sheet
    ui/
      canvas.js       viewport, rendering, direct manipulation
      charts.js       response plots
      controls.js     declarative parameter panels
    ws/
      inductor.js     workspace parameters, readouts and charts
      motor.js
      filter.js
      antenna.js
      transformer.js

tests/
  verify.mjs          numerical validation against known answers
  smoke.mjs           headless pass through every workspace and family
```

The cross-platform package builder is `scripts/build_package.py`; release notes
are under `docs/releases/`. The flyback example has its own CAD generation and
validation scripts under `examples/planar-flyback-5w/scripts/`.

## Local server security

The plugin serves its page on loopback only, and every request carries a
per-session token — as a header for the page's own calls, as a cookie for
stylesheets and modules. Without it, any page open in another tab could POST
geometry into your board. The page's Content-Security-Policy forbids inline
script and every external origin, so nothing it loads comes from the network.
