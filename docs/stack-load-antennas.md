# Planar Studio 1.3: layer setup, loaded transformers and antennas

## Layer setup assistant

Open **Transformer**. The first group shows the required and available copper
layer counts. `P,P,S,S` occupies four copper layers; `P,S,S` occupies three but
requires a four-layer PCB because KiCad uses even copper layer counts. Selecting
sparse internal layers can require a larger PCB stack.

If the board has too few layers:

1. In KiCad PCB Editor, open **File → Board Setup…**.
2. Select **Board Stackup → Physical Stackup**.
3. Set **Copper layers** to the indicated even count (or greater) and click OK.
4. Return to Planar Studio and click **Refresh board settings**.

Refresh reads board context and adopts available thickness, dielectric and copper
weight values. It preserves winding assignments and custom heights, so check
those after a thickness change. No restart is required. The button does not
modify the KiCad board or add layers automatically. Outside the plugin, the
assistant reports the required stack and refresh is disabled.

Reference: [KiCad PCB Editor stack-up documentation](https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html).

## Interactive winding stack

Choose a routed transformer family, such as **Multilayer air-core**. Each row
represents a winding section on one copper layer, ordered front to back.

- Select `P`, `S`, `S2` or `S3` as supported by the selected family.
- Select a copper layer and enter its center height in mm from the front reference.
- Use **↑/↓** to swap winding assignments between adjacent physical layers.
- Use **Add winding layer** or **Remove** to change the number of sections.
- Use **Use automatic spacing** to clear custom heights.

Adding or removing a section resets explicit copper mapping and heights.
Changing a copper-layer selection resets heights; the help text states these
effects. Automatic spacing is uniform, not a reconstruction of an asymmetric
manufacturer stack. Enter actual heights when needed. Raw comma-separated
controls remain available in **Stack details and copper** and stay synchronized.

Assignments still require P and S, at most eight occupied layers and at most four
sections per winding. Multiple-secondaries mode also requires S2. Center-tapped
mode requires an even number of S sections; the midpoint is exposed as `S_CT`.
Invalid intermediate edits remain visible and editable with a geometry error.
The editor labels a suggested mapping when the requested mapping cannot resolve.

Turns are per section; sections of a winding connect in series through the
existing checked transition-via routing. Dotted + terminals mark the positive
winding reference. Copper layers remain in physical order when assignments move.

## Loaded transformer analysis

Under **Operating point**, select **Drive model → Voltage source with secondary
loads**. Enter frequency, source RMS voltage and source series impedance R + jX.
For each secondary, choose an impedance load, exact open circuit or exact short.
Positive X is inductive; negative X is capacitive, at the selected frequency.
These are impedance values, not component values that automatically rescale
with frequency. Load resistance must be nonnegative.

Results include primary terminal voltage/current, each secondary RMS output and
phase relative to the source, real load power, DC winding loss, source resistance
loss, circuit efficiency and voltage regulation. Regulation is
`(V_all_secondaries_open − V_loaded) / V_loaded`; it includes the entered source
impedance and simultaneous loads on other windings. It is unavailable for
open/short terminations or zero loaded voltage. Reactive loads can produce
negative regulation. Phase is measured from dotted + to −.

### Circuit equations and limits

The complete existing inductance matrix enters the linear RMS phasor relation
`V = (R_copper + jωL) I`, where every winding current enters its dotted terminal.
The source equation includes source R + jX. A terminated secondary satisfies
`V_secondary = −Z_load I_secondary`. Open windings have exactly zero current and
are eliminated from the solve; shorted windings have zero terminal impedance.
Complex Gaussian elimination uses magnitude pivoting.

Real delivered power is `|I|² R_load`; DC winding loss is `Σ |I_i|² R_i`.
Circuit efficiency is total real load power divided by real power entering the
primary terminals, excluding external source loss. It includes **DC winding
resistance only**. It excludes AC winding loss, core dissipation, parasitic
capacitance, resonance, nearby conducting planes and temperature rise. It is not
a device efficiency or power rating. No rectifiers, switching drives or nonlinear
loads are simulated. All transformer families support this mode.

Center-tapped loads connect across the **complete secondary**, with the tap open.
Independent half-winding loads and rectifier operation are not supported.

For ferrite, the existing linear reluctance model and supplied leakage fraction
remain in use. Common RMS flux is `AL × Σ(N_i I_i)` and peak B is
`sqrt(2) × |flux| / Ae`. The separate imposed-mode core-voltage input does not
affect loaded results. Core loss from a supplied operating-point density is
reported separately and does not feed back into the circuit or its efficiency.
The supplied density must correspond to the solved frequency, flux and temperature.

Existing saved designs default to **Imposed currents / open-circuit estimate**.
Switch explicitly to loaded mode; entered currents then become inactive.

## New antenna families

### Circular patch

An edge-fed circular front-copper disk sits above a continuous back ground.
Controls include radius tuning, feed impedance/length, substrate and margin.
The radius uses the TM11 cavity approximation with fringing:

`a_eff = a sqrt(1 + 2h/(π εr a) [ln(πa/(2h)) + 1.7726])`

`f_TM11 = 1.84118 c / (2π a_eff sqrt(εr))`

The generator inverts the effective-radius equation numerically for the target
frequency, applies the radius tuning factor, then evaluates estimated resonance.
It rejects electrically unsuitable thickness/feed dimensions. The feed line is
sized with the existing microstrip model; it does not match the patch impedance.
Circular geometry with one feed does **not** imply circular polarization.
Feed loading, finite-ground effects, S11, gain and bandwidth are not solved.

Formula reference: [Circular-patch starting-radius formulation, Applied Sciences
14(24), 11877](https://www.mdpi.com/2076-3417/14/24/11877).

### Microstrip-fed slot

A rectangular aperture is left empty in B.Cu. Four ground rectangles form its
rim; no ground copper fills the aperture. An F.Cu microstrip feed crosses the
slot and ends in an adjustable open stub. This is a copper opening, **not** a
through-board cutout. Only the outer PCB perimeter is emitted on Edge.Cuts.

Starting length is `λ0/(2 sqrt((εr+1)/2)) × slotScale`. This effective-medium
approximation supplies initial geometry, not a solved resonant frequency.
Tune length, slot width and stub length together with full-wave simulation or
measurement. Keep the aperture clear when adding pours; no enforced keepout is
created. Both new antennas use full F.Cu–B.Cu spacing and require intermediate
copper to remain clear in the modeled region.

Topology reference: [MathWorks microstrip-fed slot modeling example](https://www.mathworks.com/help/antenna/ug/design-analysis-and-prototyping-of-a-microstrip-fed-wide-slot-antenna.html).
Its wide-slot dimensions and measured performance are not claimed for this generator.

Both families support saved JSON, KiCad board/footprint, SVG, DXF and specification
exports through the existing pipeline. Direct placement uses the existing net
and SMD-copper conventions described in [the creator guide](creators.md).

## Validation

`npm test` includes independent reflected-impedance checks, multiport KVL and
power conservation, open/short/reactive limits, all transformer-family loaded
results, ferrite flux, layer requirements, slot aperture clearance, circular
resonance and complete existing family/export regressions. The whole-app
`npm run test:creators:dom` suite exercises controls, assignment edits, saved load
settings and a mocked two-layer → four-layer board refresh including failure
recovery. Python IPC tests validate serialized placement data.

All of these checks passed for this development build. The rendered browser
suite also covers the new selectors/editor/refresh paths, but Chromium cannot
launch in the implementation environment. Rendered browser checks, live KiCad
placement/DRC and physical RF/magnetic validation remain outstanding.
