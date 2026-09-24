# Experimental PCB Litz winding

The `experimental/pcb-litz` branch adds **Inductor → Winding mode → PCB Litz ·
experimental**. It generates a four-layer braid, checks individual strand
connectivity and clearance, sizes its complete copper envelope, preserves via
spans in board output, and estimates terminal electrical behavior. Existing
designs open in the standard spiral mode.

This is a paper-inspired engineering prototype. Its routing differs from the
published hardware. AC loss, Q and any calculated resonance are physically
unvalidated; no measurement fit or “Litz improvement” multiplier makes the
model reproduce the paper's high-power WPT result. Detailed equations,
analytic benchmarks and remaining approximations are in
[PCB Litz electrical models](pcb-litz-models.md).

## Use it

1. Open **Inductor**, select **PCB Litz · experimental**, and load the
   **paper-inspired preset** for the supported starting layout.
2. Select **Nominal spiral diameter** or **Finished copper envelope**, then
   adjust whole turns, trace width/gap, turn spacing and transposition step.
   Finished sizing enforces a maximum copper diameter and minimum clear bore,
   including fanouts and terminals. Fit suggestions propose supported turn/step
   changes; applying one runs the full checks.
3. Set the three dielectric gaps, copper weight, via drill/pad/plating and
   terminal pad, drill, lead, offset and bus width. Stack edits update total
   board thickness. **Highlight Litz copper** and the transposition inspector
   let you follow individual strands, bundles and steps across the layers.
4. Enable **Generate board outline** when preparing a standalone board. Set
   **Copper to board edge** and optionally **Cut out the board bore**. Select
   the generic fabrication profile or enter the intended fabricator's rules.
5. Set frequency and **terminal RMS current**. Begin with path resolution 96
   and 64 field samples per strand; refine path and field sampling separately.
   Select the rectangular AC approximation or experimental distributed
   capacitance when needed, and read their limitations before interpreting Q
   or resonance. Electrical solves run in a background worker; design changes
   cancel stale work.
6. Use **Litz comparison, search and manufacturing tools** for convergence,
   measured-data residuals, reference comparisons, bounded design search and
   native KiCad checks. Save or export Design JSON to retain editable settings.

The first switch to Litz loads the preset. Returning to Litz preserves edits;
the preset button explicitly resets its geometry and process settings.

| Default | Value |
| --- | --- |
| Size interpretation | Nominal spiral diameter |
| Path resolution | 96 per strand |
| Field samples | 64 per strand |
| AC approximation | Slab field approximation |
| Intrinsic distributed capacitance | Off; intrinsic self-resonance unknown |
| Distributed settings, when enabled | 2 circuit cells per strand; dielectric loss tangent 0.02 |
| Generated outline / bore cutout | Off / off |
| Edge clearance, when outline enabled | 1 mm |
| Fabrication profile | Experimental, generic editable rules |
| Terminal pad / drill | 1.6 / 0.8 mm |
| Terminal lead / offset | 2 / 2 mm |
| Terminal bus width | Automatic: strand trace width |

Path resolution is a subdivision target, not an absolute segment cap. Necessary
section endpoints and vias remain in the model, so actual segment counts can
be higher. Display-only strand/step changes update the preview without changing
the electrical geometry.

## Routing, dimensions and outlines

The cross section contains sixteen positions across four copper layers and
four radial columns. Twelve strands circulate around the outer bundle and four
around the inner bundle. Each strand visits every position in its own bundle
equally over complete cycles. All strands join at the two terminal buses.

| Setting | Current scope |
| --- | --- |
| Topology | Circular, sixteen strands: outer bundle 12 + inner bundle 4 |
| Copper stack | Four layers in physical top-to-bottom order; default F.Cu, In1.Cu, In2.Cu, B.Cu |
| Turns | Whole turns, subject to winding-area and routing-fit limits |
| Transposition step | 7.5°, 15° or 30°, subject to routing fit |
| Starting preset | Five turns, 30° steps, 480 transposition vias |
| Preset trace/process | 0.8 mm trace, 0.2 mm strand gap, 5.5 mm turn spacing; 70 µm copper |
| Preset dielectric stack | 0.4 / 0.5 / 0.4 mm gaps; 1.58 mm total including copper |
| Preset vias | 0.3 mm drill, 0.6 mm pad, 25 µm plating |
| Generated board shape | Circular outer Edge.Cuts loop, optionally with a circular bore cutout |

In nominal mode the preset's **160 mm input is a nominal spiral diameter**.
Radial via fanouts extend beyond it and reduce the bore; terminals also occupy
board area. Read the separately reported winding dimensions, complete copper
diameter/bore, and board dimensions. In finished mode the generator resolves
the nominal diameter and checks the emitted copper against the requested
envelope. Board-edge clearance is additional to that copper diameter. The
legacy `dInner` field does not independently set this braid's bore.

Generated outlines surround the actual complete copper, including terminals,
with the chosen edge allowance. A bore cutout is limited by the actual clear
copper bore. Copper/edge checks include the straight segments between outline
vertices. Turning outline generation off remains useful when placing copper
onto an existing board.

The paper used 10° transposition and 1,140 vias. Its 160 mm outer / 69 mm inner
dimensions are not exact dimensions of this generator. This preset uses fewer,
more widely spaced transitions. Denser step choices can fail the fit or copper
checks. Obstacle contours, motor arrays, arbitrary strand counts and arbitrary
layer counts are outside this mode's scope. Copper paths are exported without
simplification so checked clearances are preserved.

## Strand and fabrication checks

All strands share one electrical net. A bridge between them midway through a
winding can defeat the braid without changing that net, so ordinary net-based
checks alone cannot protect the topology. The dedicated validator checks:

- Sixteen strand identities, 12/4 bundle membership, complete transposition
  cycles, slot occupancy and equal exposure within each bundle.
- Ordered section continuity, exactly one appropriate via at a layer change,
  actual via depth/span, and agreement between model and exported copper.
- Trace/trace, via/trace and via/via clearance on physically occupied layers,
  including unintended connections on the same net.
- Intended terminal contacts, including rejection of a bus that bypasses a
  strand farther along its winding.

Fabrication screening adds minimum finished clearance, etch allowance,
annular ring, drill diameter, plating thickness, drilled aspect ratio, allowed
blind/buried via pairs and copper-to-edge checks. Optional rules can require
specific copper and dielectric thicknesses. The experimental and conservative
profiles are generic assumptions, not claims about a vendor's capabilities;
the tighter profile may reject the starting preset.

Geometry or fabrication failures block copper output and native placement.
A missing generated outline alone permits copper-only export or placement on
an existing board, but blocks standalone fabrication generation. Design JSON
and reports remain available for inspecting or correcting a configuration.
Passing screening does not replace native KiCad DRC or fabricator CAM review.

## Exports, native placement and manufacturing

**KiCad board (`.kicad_pcb`)** is the primary editable output. It preserves real
tracks/nets, blind/buried via spans, four-layer stack metadata and any generated
Edge.Cuts loops. Litz board output uses KiCad 9 format and explicitly opens both solder masks on the terminal vias. SVG and DXF support inspection/external tooling. Design JSON
stores editable parameters; the specification records dimensions, terminal
estimates, routing/fabrication findings and limitations.

**Footprint export and Library placement are unavailable for PCB Litz.** A
footprint cannot preserve these blind/buried connections as real board vias;
replacing them with through-hole pads would connect other layers.

Native placement requires a matching four-layer board and compatible total
thickness. Before changing copper, the backend checks stack compatibility and
whether installed KiCad bindings can represent the requested via type/span.
It fails rather than substituting through vias. Matching total thickness does
not establish every dielectric gap; native placement does not alter the live
board stack.

The manufacturing tool first applies generic screening, then invokes the
locally installed **KiCad CLI**. A valid native DRC report with no reported
violations is required before Gerber and Excellon generation. Missing software,
failed parsing, DRC violations or unsuccessful exports produce explicit failure
statuses. A review ZIP can preserve available board/report material even when
fabrication generation fails; downloading a ZIP does not imply DRC passed.
The stack drawing and layer-pair drill inventory are review aids. The CSV
inventory is not an Excellon drill program.

The fabricator must approve adjacent-layer blind/buried via pairs, sequential
lamination, drill sizes, registration and plating. Live IPC placement in a
running KiCad application remains untested in the implementation environment.
Controlled Python API fixtures and serialization checks are useful but do not
substitute for that live-host test.

## Electrical model and readouts

The network solves complex current phasors in mutually coupled winding paths,
finite terminal bus tracks and plated terminal barrels. Routed partial
inductance includes three-dimensional paths and via spans. DC resistance uses
trace length/cross section, copper temperature dependence, annular plating and
an approximate via-pad sheet-spreading contribution. Terminal bus branches
connect at each actual strand tap, so buses are not ideal equipotential nodes.

| Mode | What changes | Main limitation |
| --- | --- | --- |
| Slab AC approximation (default) | Foil transport skin loss and two locally driven slab proximity-loss terms | Omits rectangular edge crowding and local rectangular field reaction |
| Rectangular AC approximation | A bounded 2-D volume-filament solve for finite-width/thickness transport and applied-field loss; terminal buses use their actual widths | Local cross sections only; no global 3-D reaction-field or via-pad crowding solve |
| Distributed capacitance off (default) | Winding/bus RL network; explicit added capacitance can still shunt the terminals | Intrinsic self-resonance unknown |
| Experimental distributed capacitance | 2–4 circuit sections per strand, floating geometric pair capacitances, and dielectric loss tangent | Coarse unshielded pair estimates and approximate section inductance; calculated resonances remain unvalidated |

The rectangular solver returns an AC-to-DC internal-inductance correction, but
the routed network currently **does not apply that correction**. Routed mutual
coupling remains a frequency-independent magnetoquasistatic approximation.
The distributed model allocates whole-winding inductance over circuit sections;
it does not independently extract every local inductance or global reaction
field after displacement currents redistribute.

The **Current** setting is terminal RMS current. `Re(Z)` is the terminal
equivalent resistance; with distributed dielectric loss enabled it includes
both copper and dielectric dissipation for that terminal drive. The UI reports
copper loss, dielectric loss and total loss separately. Terminal-equivalent L
and Q derive from terminal reactance and can change sign above a model
resonance. They must not be interpreted as a constant physical inductance there.

Strand percentages are magnitudes relative to terminal current, not percentages
that must add to 100%. With capacitance enabled, winding currents can vary from
start to end and differ from input current, especially near resonance. The
start/end readouts make that distinction visible. Loss is not a current rating
or a temperature-rise prediction.

Intrinsic pair capacitances are floating circuit elements, not capacitances
independently connected to ground. Their sum is not the effective terminal
capacitance. An added `cExtra` is an explicit lumped terminal shunt. If a
distributed resonance search includes it, the readout identifies that fact.
“No resonance found” only describes the bounded model search range.

All modes remain uncalibrated. Numerical convergence does not establish AC-loss
accuracy; omitted fields, shielding, dielectric environment, pad/via crowding
and manufacturing variation can materially change Q and resonance. Inductance
passivity corrections and local skin-depth resolution warnings are reported.
No ferrite/shield eddy-current, unused via-stub, thermal, high-power rating or
complete WPT-link model is included. AC–AC efficiency, inverter/rectifier
behavior and delivered kilowatts are not predicted.

## Comparisons, measurements and bounded search

The dedicated Litz tools provide:

- **Numerical convergence:** two independent refinement axes report changes in
  L, terminal resistance and current phasors. Path resolution varies at fixed
  finest field sampling, then field sampling varies at fixed finest path
  resolution. Both axes must meet the threshold; passing applies only to those
  tested discretizations.
- **Reference comparisons:** compare sixteen untransposed strands and an
  ordinary four-layer parallel spiral. Reports explicitly list matched and
  unmatched turn, pitch, envelope, terminal and copper-volume constraints.
  Neither reference is a certified equal-volume optimum or ready-to-fabricate
  design.
- **Bounded design search:** up to twelve full geometry checks and two optional
  inductance solves, with budgets for vias, resistance, copper/board dimensions
  and bore. Candidates rank by supported DC/geometry metrics; Q optimization
  is disabled. Applying a candidate reruns the normal checks.
- **Measured impedance and model residuals:** import CSV/TSV or Touchstone
  data, interpolate complex impedance within its measured range, and compare
  terminal R, inductive L and Q where meaningful. There is no extrapolation.
  Magnitude-only data cannot establish phase, L or Q; residuals require matching
  model and measurement reference planes. Declare and remove fixture effects
  before treating residuals as coil-model error.

The main Design Tools panel also permits **Measurements** overlays and **Board
checks**. Its conventional optimizer, parameter fitter, coupled-coil, tolerance,
filter-tuning, magnetic-field and rotor engines remain disabled for Litz.
The dedicated Litz studies above do not enable those conventional engines.

For external numerical extraction, a separate API validates explicit
frequency-indexed complex impedance matrices for dimensions, port order,
units, reciprocity and sampled Hermitian passivity. It is not a completed UI
import/solver-replacement workflow. See the [matrix schema](pcb-litz-models.md#externally-extracted-impedance-data).

## Paper reference

Saurabh Kale and Bernhard Wicht, **“A Dual-Bundle PCB Litz Coil Achieving 1 kW,
6.78 MHz WPT with 97.8% AC-AC Efficiency,”** IEEE Wireless Power Technology
Conference and Expo (WPTCE), 2026.
[DOI: 10.1109/WPTCE66920.2026.11691238](https://doi.org/10.1109/WPTCE66920.2026.11691238).

The paper reports measured L = 3.44 µH, ESR = 0.425 Ω and Q = 344.5 at 6.78 MHz,
plus 97.8% peak AC–AC link efficiency at 1 kW. Those values describe the
published physical coil and test system. They are reference measurements,
not outputs or acceptance thresholds for this generator or model.

## Development, CI gates and current verification limits

From the source checkout:

```sh
npm ci
python3 ipc_entry.py --browser --verbose

npm run test:litz
npm run test:litz:dom
python3 -m unittest discover -s tests -p 'test_litz*.py'

npm run test:litz:browser
python3 tests/kicad-cli-litz.py --require-cli

npm test
npm run build
```

The implementation suites cover topology corruption, electrical conservation,
rectangular diffusion benchmarks, distributed-network limits, sizing/outlines,
fabrication screening, comparison/search contracts, measurement interpolation,
via-span exports, placement preflight and UI configuration round trips. These
checks do not validate measured MHz performance.

[`.github/workflows/pcb-litz.yml`](../.github/workflows/pcb-litz.yml) is the
verification gate for pushes to `experimental/pcb-litz` and manual dispatch:

| Job | Required checks |
| --- | --- |
| Application | Install Node/Python dependencies; run `npm test`, Litz DOM tests, real Playwright Chromium browser tests, and the package build |
| KiCad CLI | Install KiCad 9; parse the generated preset board with an outline, run native DRC, then generate Gerber/Excellon output using `--require-cli` |
| KiCad GUI, in the same job | Launch a disposable board and isolated configuration under Xvfb; verify native placement, replacement, via spans and two GUI undo operations |

The native parser, DRC, Gerber and Excellon gate passed on **KiCad 9.0.9** in
[run 36069788484](https://github.com/jonahsaunders/planar-studio/actions/runs/36069788484), with zero DRC violations, unconnected items or schematic-parity issues. That run exposed separate browser-harness and GUI-startup failures; a successful manufacturing gate does not establish their success. Check the latest workflow run for every gate’s current status.

The local implementation environment could not run the rendered-browser suite because Chromium socket
creation was blocked, and native CLI fabrication verification was unavailable
without `kicad-cli`. DOM tests use canvas/bridge stubs and do not verify actual
rendering or browser CSP. Python fixture/serialization tests do not verify
native DRC or live IPC placement. The CLI script's `--require-cli` option makes
missing KiCad a failure in CI rather than a passing skip.

The GUI gate runs
`xvfb-run -a dbus-run-session -- .venv/bin/python tests/kicad-live-ci.py --ci-owned`.
It creates and controls its own board/configuration and
checks exact item identities before and after replacement/undo. Its result is
reported separately from native CLI success. The separate manual live-host test requires an
explicit disposable-board path and an optional interactive undo check; it is
not part of ordinary unit-test execution.

The workflow uploads application and KiCad review artifacts when available.
Their presence alone does not mean every gate passed; inspect job status and
native check results. Native placement, replacement and undo verification are
implemented and require a successful live GUI gate. Physical coil measurements
and fabricator approval remain separate work.
