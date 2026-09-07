# Motor winding designer and obstacle-aware windings

## Motor winding designer

In **PCB motor**, choose **Three-phase rotary** or **Dual-rotor axial flux**.
Open **Motor winding designer**:

- **Repeating phases** preserves the previous A/B/C sequence and positive polarity.
- **Automatic phase / polarity** assigns each coil to a nearby signed phase axis
  using its electrical slot angle. The existing Series/Parallel selector sets
  one series branch per phase or a separate parallel branch per coil.
- Editing a row switches to **Custom assignments**. Set phase, polarity (+/−),
  and a positive integer branch number. Coils sharing a phase and branch are
  in series in increasing coil order; branches of that phase are parallel.
- Suggested pole counts search 1–30 pole pairs for the current coil count and
  span, ranking balanced candidates by fundamental winding factor. Applying a
  suggestion changes the pole count and selects Automatic assignments.
- **Reset to automatic** recovers from stale custom schedules after changing
  coil count or phase count. The application does not silently discard edits.

Negative polarity mirrors that coil's copper, vias and terminals about its
local radial axis before positioning it in the stator. Pad Cn.1 remains the
branch input and Cn.2 the output. The generated silk labels identify coil,
phase, polarity and branch. Toggle canvas labels to inspect them.

Automatic/custom star routing uses a separate outer lane for each series link,
plus phase and neutral lanes. The collar can substantially increase the finished
board diameter. Routing supports exactly two series copper layers with exterior
terminals and whole turns. Grouped A/B/C/N terminals follow the existing
breakout controls. Disable automatic interconnection for manual wiring.
Unequal parallel branch EMFs are reported, and their automatic star connection
is omitted to avoid circulating-current connections. Individual coil terminals
remain available, with an error note.

### Electrical model

For coil i at mechanical slot angle θi, its signed fundamental contribution is
`polarity_i × exp(j × polePairs × θi)`. Contributions add within a series branch.
Parallel branch open-circuit phasors are weighted by their conductance, assuming
identical coil impedance and no inter-coil mutual inductance. Phase resistance
and inductance follow the actual series/parallel branch lengths.

The phase table reports normalized resultants and electrical angles. Faint rays
show signed coil contributions and bold rays show phase resultants. Coil 1 is
the common angular reference. Two phases use orthogonal 90° drive axes; other
phase counts use uniformly spaced drive axes.

The scalar motor model uses the stronger forward/reverse balanced-current
sequence. Distribution factor multiplies pitch factor, with no artificial
minimum: complete cancellation gives zero fundamental torque and back-EMF.
`Kt = (phaseCount / 2) × polePairs × lambda`; the original three-phase case is
`1.5 × polePairs × lambda`. Resistance/loss readouts use the mean phase resistance.
These scalar results assume imposed balanced sinusoidal currents and omit
current-regulator dynamics, torque ripple, parallel circulating current, bus
loss and inter-coil mutual inductance. Imbalance is reported. The magnetic-field
study uses the mirrored winding paths and branch current sharing.

Saved existing designs keep their geometry and assignments, but performance
readouts now account for cancellation. This intentionally changes estimates
for incompatible old slot/pole combinations. Geometry-specific flux extraction
from real magnets and motor dynamics remain outside this model.

## Design around obstacles

In **Inductor**, enable **Generate in remaining board area**. Set the rectangular
board-area width, height, clearance and requested whole contour turns.
Coordinates use millimetres relative to the design origin, with +Y up. The
existing placement-origin setting positions the resulting design in KiCad.

Use **Mark mounting hole**, **Mark connector** or **Mark forbidden region**,
then drag in the small board editor. A mounting hole is a circle; the other two
create rectangles. Drag an existing region to move it. **Add hole**, **Add
connector** and **Add polygon** also create regions using keyboard-accessible
buttons. The numeric cards edit name, position and dimensions. Polygon vertices
are one `x, y` pair per line, relative to the region's X/Y position. Remove a
region using its card. Regions and names are overlaid on the main winding canvas;
the main canvas also exposes movement handles.

The radius marked for a mounting hole should include any screw/washer area
that must remain clear; the configured clearance is added outside it. Connector
rectangles should enclose the relevant footprint/courtyard. These are geometric
exclusions through the whole stack, not imported physical material models.
The tool does not automatically create holes, connector footprints or KiCad
rule areas from these marks.

### Generation and validation

Boolean polygon offsets shrink the usable board and expand obstacles, producing
nested contours. A bounded deterministic search chooses one connected pocket
and a seam for joining contours. It uses up to twelve candidate center points,
four seam directions and 96 assembly attempts. Narrow passages or splits may
reduce the number of generated turns; the actual count is reported. The search
does not guarantee globally maximum copper utilization and does not combine
separate board islands. A user-entered winding center can select another pocket.

Each accepted result checks all trace segments, pad disks and via disks against
board edges and obstacles. Nonlocal approaches along a copper path are checked
for trace clearance. The geometry is one continuous path per layer, joined at
an inner via for the two-layer series option. The second layer follows the
opposite inward spiral in reverse, preserving additive electrical circulation
without mirroring the asymmetric obstacles.

Supported stacks are one layer, two layers in series, or up to sixteen parallel
layers with through-hole terminals. Series stacks above two layers are rejected.
One-layer and parallel designs expose an inner terminal that requires external
routing or an insulated breakout. Current sharing between parallel layers is
assumed equal. All obstacles apply to every copper layer.

An impossible layout fails without leaving stale copper available for placement
or export. Adjust constraints in the board editor, move the winding center, or
reduce turns. These checks complement final KiCad DRC; they do not implement
all fabrication/netclass rules. Copper simplification is disabled for obstacle
artwork across the placement and export paths so a simplified chord cannot
cut through a forbidden area. Board exports use the entered rectangular outline;
marked holes are not emitted as board cutouts.

Numerical inductance and DC resistance use the generated paths. Standard-shape
Mohan/Wheeler cross-checks are suppressed. AC loss, capacitance and temperature
remain approximate engineering estimates; nearby metal, ferrite, heat sinking
and material effects of obstacles are not solved. Diameter-based target-L
optimization, fixed-copper tolerance studies and the standard receiver editor
are disabled for obstacle designs. Field slices and measurement overlays remain
available. Designs retain their constraints and assignments through Save/Open
and JSON import/export.

## Validation

- `npm test`: existing numerical, layout, export, RPC and Python tests, plus
  motor winding and obstacle geometry regression suites.
- `npm run test:design-layout:dom`: whole-app events, automatic/custom assignment,
  region edits and pointer marking, invalid-state recovery, Save/Open and exports.
- `npm run test:design-layout:browser`: rendered browser/CSP checks and two
  screenshots under `dist/`. Requires Playwright Chromium. Set
  `PLAYWRIGHT_CHROMIUM` to use an existing compatible Chromium executable.

The motor tests independently check physical interconnect groups with winding
tracks removed to expose bypasses, 36 shape/pole/breakout combinations, complete
cancellation, global polarity reversal, parallel branch equivalents and rejected
unequal EMFs. Obstacle tests cover circles, rectangles, polygons and disconnected
pockets across three stack types, actual path continuity and circulation, copper
clearance, export simplification and configuration persistence.

The clipping implementation is vendored from `clipper-lib` 6.4.2 (upstream JS
version 6.4.2.2). Only an ESM wrapper was added. Copyright notices and the Boost
and JSBN licenses are included under `web/js/vendor/` and in the plugin archive.

Validation in the implementation environment: the full `npm test` suite and
both existing/new DOM interaction suites passed; the plugin archive built.
Two KiCad-dependent Python checks were skipped because kicad-python is absent.
Rendered browser verification remains outstanding: the standard Chromium
download timed out, and a separately supplied Chromium terminated during launch.
Live KiCad placement/DRC and physical hardware validation were not performed.
