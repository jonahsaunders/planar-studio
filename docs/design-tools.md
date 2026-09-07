# Design tools

Open **Design tools** in the top bar. Each tool explains its model and units.
Studies run locally in a module Worker. Cancel, switch tools, or close the dialog
to terminate a calculation. Changing settings also cancels an in-flight study.
Nothing is written to the board until you use the main **Place** action.

Settings, measurement points, geometry tuning, fitted baseline curves, and the
placement origin are included in the normal **Save** and design JSON round trip.
Study results can be exported separately as JSON. Board snapshots are transient;
they are not included in saved designs. Exported board-study reports include the
preview geometry, so treat those as board design files when sharing them.

## Optimizer

In **Inductor → Design tools → Optimize**, enter a target inductance and maximum
copper width/height, operating frequency, trace-width and gap ranges, and a
comma-separated list of layer counts. The search uses three evenly spaced values
for each continuous process range (or one if both bounds are equal), sweeps whole
turn counts, then adjusts diameter using the existing inverse solver. The open
board's layer count limits the requested layer choices.

Every accepted candidate is re-evaluated at the main inductor solver's 3,600
segment cap. Copper bounds include terminals. Candidates must satisfy the target
tolerance, geometry's turn/clearance checks, positive Q, and specified SRF margin.
The results offer highest Q, smallest area, and lowest resistance, plus a list of
nondominated tradeoffs. Preview a candidate, then Apply design. Save afterward.

This is a bounded design-space search, not a proof of global optimality. It does
not vary shape, connection topology, copper weight, pad/via dimensions, or board
thickness; those are taken from the active design. Its geometry checks are the
existing winding checks, not a replacement for final KiCad DRC.

## Measurements

Import or drop a local file in **Measurements**:

- Touchstone **1.x S1P or S2P**, S-parameters in RI, MA, or DB; Hz, kHz, MHz,
  or GHz; arbitrary positive real reference impedance. Wrapped records and
  `!` comments are supported. Touchstone 2.x keywords, noise blocks, and other
  network parameter types are rejected explicitly.
- CSV/TSV/semicolon-separated data with a header. Frequency units can be included
  in the heading. Supported quantities include `Z (ohm)`, `R (ohm)` and
  `X (ohm)`, `S21 (dB)`, and `S11 (dB)`.

Example:

```csv
Frequency (MHz),R (ohm),X (ohm)
0.1,0.9,0.63
1,1.1,6.2
10,3.5,61.4
```

The importer sorts frequencies, rejects duplicates and malformed values, and
limits file size to 8 MB. Overlays interpolate in log frequency only within the
measured range. S1P impedance uses Z = Z0(1+S11)/(1-S11); an exact open circuit
has no finite impedance value. A two-port's S11-derived impedance assumes port 2
is terminated in the reference impedance. Measurements should be de-embedded to
the modeled terminals; the app does not remove fixtures or renormalize ports.

Overlays work for standalone inductors and all filter families. Bounded fitting
supports coil dielectric constant/added capacitance and distributed-filter
dielectric constant/loss tangent, with either parameter independently selectable.
There must be at least five overlapping points. A filter fit requires matching
Touchstone and design reference impedances. Coil fits minimize log-magnitude
impedance residuals; filter fits minimize S21 dB residuals. The original curve
is retained, and a fitted filter keeps its copper dimensions fixed. Changing a
synthesis target or resetting geometry tuning releases that frozen layout.
Fitted values can absorb fixture and model errors and are not unique material
measurements. The fit is a local bounded search, not an uncertainty estimate.

## Coupled coils

The active inductor is the transmitter. Set receiver diameter, turns, layer
count, trace width, gap, and board thickness independently. Receiver shape,
connection topology, material, and pad/via parameters initially follow the
transmitter. Its center-plane separation, X/Y offsets, and tilt are independent.
Drag the receiver center handle to adjust lateral position; release to solve.
**Open receiver as inductor** makes its winding available to the normal placement
and export paths.

The mutual inductance is a 3D Neumann sum with series layer connections. The
result includes signed M and k, both self-inductances, an X-offset sweep, and
open-circuit induced RMS voltage for a sinusoidal transmitter RMS current.
Equal sharing is assumed in parallel layers. The collision guard conservatively
requires the receiver board, including its tilt, to clear the transmitter board.
The model excludes ferrite, conducting shields/ground planes, external return
wiring, resonant compensation, loading, and power-transfer efficiency. Do not
interpret the open-circuit voltage as delivered power.

## Manufacturing tolerances

Available for standalone inductors and distributed filters. Specify independent
uniform ± bounds for total etched width (mm), dielectric thickness (%), copper
thickness (%), and dielectric constant (%), with 2–500 samples and a seed.
Width changes are paired with opposite gap changes to preserve centerlines.
Distributed filter geometry is synthesized once and then held fixed across the
study; altered materials are not allowed to resynthesize away the variation.

Coil yield uses inductance error and minimum Q at the operating frequency.
Filter yield uses editable S21 mask bands. The chart shows nominal and pointwise
5th–95th percentiles from valid samples. Invalid geometries count as yield
failures and are reported separately. Sensitivity ranks the response change
between each negative/positive tolerance endpoint while other parameters stay
nominal. Coil impact is inductance percent change; filter impact is RMS S21
change in dB across the sweep. Coil studies use a 1,400-segment cap to make batches
practical; check promising designs in the main solver.

Yield is a finite Monte Carlo estimate conditional on the input distributions
and model. Samples are independent; process correlations and statistical
confidence intervals are not modeled. Percentile curves are not simultaneous
worst-case bounds.

## Filter tuning

Stepped, edge-coupled, hairpin, and interdigital filters expose physical
length/gap handles in the main canvas. Edits are stored as scale factors relative
to synthesis and propagate into both artwork and simulation. Changing synthesis
inputs clears old tuning. **Reset geometry tuning** restores synthesis.

Automatic tuning searches global length and gap scales from 0.5 to 1.5, keeping
individual handle adjustments. It minimizes squared response-mask violations
while rejecting coupling gaps below the configured minimum. Mask checks include
band endpoints and the simulated frequency grid. An unmet mask is reported as
unmet, and can still be inspected and applied. Narrow features between frequency
samples are not certified; increase sweep resolution before final evaluation.

Stepped and edge-coupled sections use the existing transmission-line models.
Hairpin and interdigital workspaces use a narrowband coupled-resonator equivalent
whose tank frequencies follow physical resonator lengths and whose internal
inverters follow the modeled gap coupling. The external Q remains the synthesized
value. This changes the hairpin workspace response from its previous unfolded
edge-coupled approximation. Bend/tap discontinuities, nonadjacent coupling, and
out-of-band spurious behavior require full-wave verification. The original
prototype remains available for comparison.

## Magnetic field

Compute an XY slice at a chosen height above the upper copper plane. Select
signed Bz or field magnitude and inspect individual points with the pointer.
The map evaluates the free-space Biot–Savart sum; the visible winding overlay
is a geometric projection. In PCB motor mode, cached phase basis fields combine
with sinusoidal phase currents for an adjustable electrical angle or a slowed
animation. Parallel layer and parallel coil currents are divided equally.

The field uses the main winding current. Motor phase current is peak amplitude.
Rotor magnets, phase buses, external leads returning through the rest of the
board, magnetic materials, eddy currents, and finite-width current crowding are
excluded. Probe height must exceed half the trace width to avoid the filament
near-field singularity. It is a magnetic-field map, not a thermal or full-wave
field solve.

## Board checks

Read a live KiCad board via `board.snapshot` or import a `.kicad_pcb` file. The
live snapshot includes unsaved board state and never saves the board. If that
API is unavailable on the installed KiCad/kicad-python version, use a saved file.
Previously placed items belonging to the active design are excluded from a live
snapshot check because Place will replace them.

Enter origin coordinates in **KiCad coordinates (+Y down)** and a uniform
clearance. The preview checks other-net copper, keepouts, drills, board edges,
outline cutouts, and ground copper overlapping winding traces. Distributed
filters additionally check for a continuous filled polygon on the selected
reference layer beneath signal traces. **Use this placement origin** connects
the preview to the main Place action.

The parser handles straight/arc tracks, vias, footprint transforms, pads,
filled zones, common graphic primitives, and closed board outlines. Pads and
oval drills use conservative enclosing circles; copper arcs are approximated
with a 0.025 mm sagitta target. Unsupported shapes and unfilled zones produce
warnings. Checks use conservative margins and do not claim a KiCad DRC pass.
Custom pad shapes, per-netclass rules, complex multilayer padstacks, footprint
courtyards, and electrical effects of nearby metal are not fully modeled. Ground
coverage requires one continuous filled polygon for each trace segment; joined
polygons can produce conservative warnings. Importing a file checks that file,
not subsequent unsaved editor changes. At most 200 findings are displayed.

## Rotor

The PCB motor's pole-pair count determines the alternating N/S magnet count.
Set cylindrical magnet diameter/thickness, pitch radius, remanence Br, air gap,
and angular position. The preview overlays poles on the stator and warns about
magnet overlap or extension beyond the active annulus. Export study JSON for the
magnet centers, dimensions, polarity, and stator dimensions.

The field curve is the on-axis free-space field of one uniformly magnetized
cylinder:

Bz = Br/2 × [(g+t)/sqrt((g+t)²+r²) − g/sqrt(g²+r²)].

It is not the rotor air-gap fundamental. The tool does not automatically feed
this isolated-pole estimate into the PMSM model. Enter a measured or externally
solved peak Bgap and use **Apply external field to motor** to update performance.
There is no automated FEA solver integration, back-iron model, rotor structural
analysis, or magnet-temperature/demagnetization model in this version.

## Validation and development

```sh
npm install
npm test                 # existing numerics + new studies + RPC + snapshot contract
npm run test:dom         # actual DOM events + real workers; stubbed canvas
npx playwright install chromium
npm run test:ui          # existing browser workspace smoke test
npm run test:browser     # all eight Design Tools flows under actual browser CSP
./build.sh              # installable PCM archive in dist/
```

The DOM integration suite uses Happy DOM and a small node:worker_threads adapter
for the production worker entry point. It checks results, imports, cancellation,
applying candidates, geometry changes, and fit state. It is not a rendering test.
The browser suite uses disposable local fixtures and writes a screenshot to
dist/design-tools-browser.png. Runtime dependencies are unchanged; Happy DOM and
Playwright are development-only dependencies.

In the implementation environment, the original 104 numerical checks, 22 new
study checks, 27 RPC checks, 3 snapshot-contract checks, and 16 DOM/worker checks
passed. A graphical browser could not reach the local server, so rendered
browser verification and operation inside live KiCad remain outstanding.
