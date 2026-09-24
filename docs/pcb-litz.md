# Experimental PCB Litz winding

The `experimental/pcb-litz` branch adds **Inductor → Winding mode → PCB Litz ·
experimental**. It generates a four-layer braid, checks individual strand
connectivity and clearance, preserves via spans in board output, and estimates
electrical behavior with a coupled-strand model. Existing designs open in the
standard spiral mode.

This is a paper-inspired engineering prototype. Its routing differs from the
published hardware, and its preliminary AC model can substantially understate
loss and overstate Q. It does not reproduce or validate the paper's high-power
WPT result.

## Use it

1. Open **Inductor**, select **PCB Litz · experimental**, and use **Load
   paper-inspired preset** for the supported starting layout.
2. Adjust whole turns, nominal outer diameter, strand width/gap, turn spacing,
   and transposition step. Use **Highlight Litz copper** to follow one strand
   across layers or inspect either bundle. The usual layer visibility controls
   still apply.
3. Enter the three dielectric gaps, copper weight, and via drill, pad diameter
   and plating thickness. Gap/copper edits update the total board thickness.
4. Set frequency and RMS winding current. Begin with **model resolution 96**;
   compare **192** and **384** when inspecting convergence. Full electrical
   solves run in a background worker and stale calculations are canceled when
   the design changes.
5. Read the routing findings and generated dimensions before exporting. Save or
   export Design JSON to retain the settings, highlight and resolution. Reloading
   the design regenerates its geometry and estimates.

The first switch to Litz loads the preset. Returning to Litz preserves edits;
the preset button explicitly resets its geometry and process settings.
Resolution is a subdivision target per strand; necessary section endpoints
and vias are always retained, so the actual segment count can be higher.

## Routing and supported dimensions

The cross-section has sixteen positions arranged across four copper layers and
four radial columns. Twelve strands circulate around the outer bundle and four
around the inner bundle. Each strand visits every position in its own bundle
equally over complete cycles. The strands join at the two terminal buses.

| Setting | Current scope |
| --- | --- |
| Topology | Circular, sixteen strands, outer bundle 12 + inner bundle 4 |
| Copper layers | Exactly F.Cu, In1.Cu, In2.Cu and B.Cu |
| Turns | Whole turns, subject to available winding area |
| Transposition step | 7.5°, 15° or 30°, subject to routing fit |
| Conservative preset | Five turns, 30° steps, 480 transposition vias |
| Preset trace/process | 0.8 mm trace, 0.2 mm strand gap, 5.5 mm turn spacing; 70 µm copper |
| Preset dielectric stack | 0.4 / 0.5 / 0.4 mm gaps; 1.58 mm total including copper |
| Preset vias | 0.3 mm drill, 0.6 mm pad, 25 µm plating |

The preset's **160 mm input is a nominal spiral diameter**. Radial via fanouts
extend beyond it and reduce the bore; terminals require additional board area.
Use the specification sheet's **Generated winding outer diameter / bore** and
the actual exported copper bounds when sizing a board. In code these values are
`geometry.stats.outerDiameterMM` and `innerDiameterMM`. The legacy `dInner`
configuration field does not set this braid's bore.

The paper used 10° transposition and 1,140 vias. Its 160 mm outer / 69 mm inner
dimensions are not exact dimensions of this generator. The supported preset
uses fewer, more widely spaced transitions to give this implementation a
checked starting layout. Denser step choices can fail the routing-fit checks.

Obstacle contours, motor arrays, arbitrary strand counts and arbitrary layer
counts are outside this mode's scope. Copper paths are exported without path
simplification so the checked clearance is preserved.

## Strand-aware validation

All strands eventually share the same electrical net. A short between two of
them midway through the winding can defeat the braid without changing that net,
so net-based board checks alone are insufficient.

The dedicated validator checks:

- Sixteen distinct strand identities, 12/4 bundle membership, complete
  transposition cycles, slot occupancy and equal exposure within each bundle.
- Ordered section continuity, exactly one appropriate via at a layer change,
  actual via depth/span, and agreement between the model paths and exported
  tracks/vias.
- Trace/trace, via/trace and via/via clearance on the copper layers physically
  occupied by each object, including unintended bridges on the same net.
- Intended terminal contacts, rejecting a bus that bypasses a strand farther
  along its winding.

Invalid geometry blocks native placement and copper exports. Design JSON and
the specification remain available to preserve or inspect the configuration.
The UI shows a bounded list of findings; the validation result retains issue
counts and the minimum checked gap.

Passing these checks establishes the implemented geometric invariants. It does
not certify etching tolerances, a manufacturer's via process, or a KiCad DRC
pass. Use the actual fabrication rules and inspect the final board in KiCad.

## Exports and native KiCad placement

**KiCad board (`.kicad_pcb`)** is the primary editable copper output. It retains
the complete four-layer stack, including copper and individual dielectric
thicknesses, real tracks/nets and explicit blind/buried via spans. SVG and DXF
remain available for inspection or external tooling. Design
JSON stores editable parameters; the Markdown specification records dimensions,
estimates, routing status and limitations.

The exported file contains the winding copper; add the required board outline
and fabrication rules in KiCad before producing manufacturing files.

**Footprint export and Library placement are unavailable for PCB Litz.** A
footprint cannot preserve this layout's blind/buried via connections as real
board vias. Substituting through-hole pads would short strands on other layers.

Native placement requires the matching four-layer board and compatible total
thickness. The backend checks the board stack and the installed KiCad bindings'
via type/span support before creating copper or deleting an earlier placement.
Unsupported bindings produce an error instead of substituting through vias.
The generated dielectric gaps still need to match the actual fabrication stack;
matching layer count and total thickness alone does not verify every gap.

Confirm support for the specified blind/buried via pairs, drill sizes, annular
rings and plating with the fabricator. **Live placement in KiCad has not yet
been tested for this experimental feature.** Python checks cover controlled API
fixtures and serialization through installed kicad-python 0.8 bindings, without
a live KiCad host. Standalone board export is available for inspection.

## Electrical model and interpretation

The model solves a complex sixteen-branch impedance network with common
terminal voltage. Self and mutual partial inductances come from the three-
dimensional strand paths, including connected via barrels. DC resistance uses
trace length/cross-section, copper temperature dependence and actual via spans
with the specified plating. AC resistance combines foil skin estimates with
local-field slab proximity estimates, allowing unequal, phase-shifted strand
currents.

Readouts include estimated L, Rdc, Rac, Q, copper loss, strand current magnitude
and phase, and frequency sweeps. Current percentages are magnitudes relative to
total winding current: their phasor sum is 100%, but the magnitude percentages
need not sum to 100%.

The **Current** setting is RMS winding-branch current. Loss is the model's
I²R copper loss; it is not a current rating or temperature-rise prediction.
Terminal buses are ideal equipotential connections, so their finite resistance,
inductance and spreading loss are omitted.

Important limits:

- The AC model is uncalibrated. Rectangular conductor edge crowding, field
  reaction, via-pad crowding and other MHz loss mechanisms are incomplete.
  Numerically converged results can still greatly underestimate loss and
  overestimate Q. A passivity correction, if needed by the inductance
  quadrature, is reported as a warning.
- Intrinsic distributed capacitance and dielectric loss are not solved.
  **Intrinsic self-resonance remains unknown.** Added capacitance is a supplied
  lumped shunt only; its finite lumped resonance is not a predicted SRF.
- No ferrite or shield/ground-plane eddy-current model, unused via-stub model,
  thermal model, high-power rating or complete WPT link is included. The mode
  does not predict AC-AC efficiency, rectifier/inverter behavior or delivered
  kilowatts.

The main Design Tools panel permits **Measurements** overlays and **Board
checks**. Parameter fitting and the conventional optimizer, coupled-coil,
tolerance, filter-tuning, magnetic-field and rotor studies are disabled for
Litz designs because their current engines assume conventional windings.

## Paper reference

Saurabh Kale and Bernhard Wicht, **“A Dual-Bundle PCB Litz Coil Achieving 1 kW,
6.78 MHz WPT with 97.8% AC-AC Efficiency,”** IEEE Wireless Power Technology
Conference and Expo (WPTCE), 2026.
[DOI: 10.1109/WPTCE66920.2026.11691238](https://doi.org/10.1109/WPTCE66920.2026.11691238).

The paper reports measured L = 3.44 µH, ESR = 0.425 Ω and Q = 344.5 at 6.78 MHz,
plus 97.8% peak AC-AC link efficiency at 1 kW. Those figures describe the
published physical coil and test system. They are reference measurements,
not outputs or acceptance thresholds for this experimental layout/model.

## Development and checks

From a checkout of `experimental/pcb-litz`:

```sh
npm ci
python3 ipc_entry.py --browser --verbose

npm run test:litz
npm run test:litz:dom
python3 -m unittest discover -s tests -p 'test_litz_vias.py'

npm test
./build.sh
```

The Litz suites cover routing and topology corruption, model conservation and
limiting cases, explicit via-span exports, placement preflight, main-workspace
integration, real control events and configuration round trips. These tests
check implementation contracts; measured AC-loss accuracy and live KiCad
operation remain separate validation work. The build includes this guide in
the installable PCM archive.

`npm run test:litz:browser` exercises the real server and rendered browser when
a Playwright Chromium installation is available. This browser check could not
run in the implementation environment because Chromium's socket creation was
blocked. DOM tests exercise the full app and actual worker module with canvas
and bridge transport stubs; they do not verify rendering or browser CSP.
