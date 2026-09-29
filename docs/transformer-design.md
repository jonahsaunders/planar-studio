# Transformer design workflow — 1.6 development

The Transformer workspace combines a winding layout, a sinusoidal circuit and
explicit engineering estimates. Old saved designs keep their previous family,
DC-loss and supplied-leakage behavior until their settings are changed.

## Project workflow additions

1. **Nominal and experimental conditions.** New designs start linked to the
   Requirements voltage, frequency and resistive output loads. Editing an
   operating value detaches that link and labels predictions **Experiment
   override**. Re-enable **Use nominal requirements** to restore nominal values.
   Imported designs without this setting keep their previous operating point.
   Optional S2/S3 requirements specify voltage, current and voltage tolerance;
   S3 requires S2. Enable matching windings or run the candidate search.
2. **Working areas.** Requirements, Candidates, Verify and Export use the full
   content area. Windings keeps the drawing, stack and analysis together.
   Comparison, studies, measurements and placement open within those working
   areas. Arrow keys and Home/End navigate the stage tabs; ordinary Tab moves
   through controls. Advanced geometry and material fields remain disclosed
   on demand. Narrow windows stack the navigation and working area.
3. **Saved evidence.** Envelope, tolerance and named-condition studies retain
   their numerical cases, curves, original inputs and revision identifier.
   Verify lists **Pass**, **Fail**, **Unknown** or **Outdated**. Changes to a
   tolerance invalidate tolerance reports; envelope range changes invalidate
   envelope reports. Physics, requirements and relevant physical board-stack
   changes invalidate affected evidence. Renaming nets, moving the placement,
   or adding unrelated reports does not. Open a report to inspect its chart or
   data table, download all cases, or restore the tested inputs. Save the design
   or export its JSON to persist reports (20 most recent), scenarios and tests.
4. **Repairs.** Findings link to related controls. **Calculate repair options**
   tests a bounded set of turn, width and footprint changes against the current
   requirements and selected cases. Each suggestion previews voltage, copper
   loss, area, passing cases and unknowns before application. Suggestions must
   reduce a violation without introducing a new violation class. Measured AL
   or leakage blocks geometry repair exploration until the estimated model is
   selected. Applying a repair creates a checkpoint.
5. **Robust candidate exploration.** Save up to 16 named operating conditions
   and select at most eight for search/verification. Each retains input, source
   impedance, independent output loads and temperatures. Search checks all
   enabled output targets plus flux, footprint, layer and known thermal and
   regulation limits at nominal and selected cases. Unknown losses/temperature
   remain Unknown, never Pass. Up to 24 candidates are refined at export
   resolution; the initial three remain available for comparison. Select a
   size/loss point or its card to inspect exact values. Worst-case margin is the
   minimum remaining output-voltage or flux allowance, not a reliability rating.
6. **Board-aware editing.** Routed terminal handles move radially in a safe
   direction, limited to 0–3 mm and snapped to the selected grid. Numeric controls
   provide the same operation without dragging. Routes that violate clearance
   or core openings are rejected. Changes update both copper and model paths.
   Placement adds clockwise rotation, snapped coordinates, a movable origin,
   winding-to-destination-net mapping, and immediate geometric findings. Separate
   windings cannot map to the same net. Replacement previews identify the count
   of previous generated items and overlay their copper in gray. Existing edits
   to generated items are replaced; unrelated board items are retained. The live
   snapshot and design are checked again before placing the reviewed transform.
7. **Physical prototypes.** Imports append instead of replacing the previous
   test of that type. Record specimen, fixture/reference plane and copper
   temperature; each test retains its design revision. Compare two to four tests
   of the same kind over their shared frequency interval (no extrapolation).
   Differing fixtures or temperatures are called out. Choose the exact open and
   short tests for a fit; geometry, prototype, fixture and temperature must match.
   Up to 24 tests and 12 alternative fits persist with the design. Review a saved
   fit, restore its baseline, or apply it to compatible geometry. Loaded transfer
   still means source-referenced voltage gain, not S21.

Searches and repairs are bounded explorations, not global optimization or proof
over continuous operating ranges. Terminal edits are radial, not a general
manual router. Actual KiCad DRC, large-signal validation and assembly inspection
remain separate. See the [GUI audit](transformer-gui-audit.md) for interface
changes, Apple guideline references and accessibility test limits.

## Guided workspace and reversible editing

Move freely through **Requirements → Candidates → Windings → Verify → Export**.
The pinned summary keeps target and predicted output, copper/core loss and the
limiting selected constraint visible. Raw stack parameters and physical model
controls live in the collapsed Windings groups.

**Undo / Redo** restores the complete configuration during the session (up to
50 edits; Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y outside text fields).
Applying a starting design, a candidate, a preset or a measurement calibration
creates an automatic checkpoint first. The latest five checkpoints persist
with the design. Preset selection previews the exact fields being replaced;
**Apply preset** commits them. Restore checkpoints from the navigation area.

Search locks preserve the selected core, turns, per-winding widths, layer
assignments/heights, connections or footprint. Unlocked searches explore a
bounded set of turns, widths, series/parallel connections and stacks; unlocking
Core includes the supported catalog cores. Rejection counts overlap when a
trial fails multiple constraints. The closest valid geometries show actual
values and missed limits. Suggested larger footprints or extra layers appear
only after another search finds a feasible candidate with that change. Results
are starting points, not globally optimal designs; search supports up to three
enabled output requirements and the selected named operating conditions.

Pin up to three candidates and use **Compare table and curves** for aligned
metrics and gain, phase, copper-loss and flux overlays. Each snapshot retains
its operating point. **Use current operating point for all candidates** copies
the current frequency, source, loads and temperatures for the comparison only.
Badges identify the smallest, lowest copper loss and highest flux margin among
the displayed candidates. Differences in area, loss, leakage and capacitance
make the tradeoffs explicit.

## Verification and fabrication variation

**Check operating envelope** evaluates every combination of entered minimum,
nominal and maximum input voltage, frequency, resistive S load and ambient
temperature (up to 81 points). Limits include target voltage tolerance, absolute
no-load/load regulation, peak flux and assembly temperature. Other output loads
stay fixed. Grid samples are not a continuous worst-case proof. Copper and
core-loss-data temperatures retain their selected values; ambient changes only
the assembly thermal estimate. Missing loss/thermal data remain unknown and
are never counted as a pass.

**Study fabrication tolerances** samples copper thickness, layer spacing and
core AL using independent uniform variations and a repeatable seed. Planar
copper centerlines and turns stay fixed. Reports include output percentiles,
pass/unknown counts and one-variable endpoint sensitivity. This is conditional
model yield, not a measured manufacturing yield. Air-core studies omit AL.
Both studies can be canceled and export every case with the input configuration.

## Measurement workflow

Record a fixture/reference plane and copper temperature before importing each
test. Open/short tests use primary R and X CSV columns versus frequency or a
one-port Touchstone file. Keep other outputs open. Loaded tests require CSV
`Frequency (Hz), Gain_dB`, where gain is Vout/source RMS voltage; scattering
S21 is deliberately not accepted as this voltage ratio. Loaded tests retain
their source and load settings. Overlays label measured and estimated curves
and report RMS error, with a warning when the current design differs.

For two series windings on ferrite, matching open and short tests can fit AL
and primary leakage at the operating frequency. Tests must share the unchanged
design, temperature and fixture, and bracket the fit frequency. Review fitted
parameters and before/after curves before applying the measured calibration.
Resistance, capacitance, core loss and large-signal behavior are not fitted.
The calibration retains source files, conditions, date, frequency and residual.

## Placement and coordinated handoff

**Review board placement** brings destination, origin, layers, nets, terminals
and required core openings into one review. Read a live snapshot or inspect a
saved board. Located findings zoom the board preview to their position. Direct
placement requires a live review with no findings/warnings; the board is read
again immediately before placement and a changed snapshot requires a refresh.
Saved-board checks are previews only. These geometric checks do not replace
live KiCad DRC; placement does not machine missing core openings.

**Transformer build package (.zip)** contains the matching KiCad PCB and
footprint, SVG, design JSON, and a printable HTML dossier with copper drawing,
stack/connections, terminals, core part list, predictions and data provenance.
All files derive from one solved configuration. Estimated,
manufacturer-derived and measured data remain explicitly identified.

## Choose the design independently

Use **Transformer type** as a starting preset. **Magnetic model** chooses air or
ferrite independently of **Winding connections** (one secondary, center tap,
multiple secondaries, or multiple secondaries with a tap on S). The stack editor
sets layer order, widths and series/parallel connections separately. Selecting
a starting preset resets the independent choices; restoring a candidate preserves
its complete configuration.

Turns inputs are per section. Two 3-turn series sections make six turns; two
parallel 3-turn sections make three turns. Each parallel branch has the same
terminal voltage, with individual current calculated from its resistance and
coupling. Unequal currents and circulating components are retained. S must use
an even number of series sections for a center tap. The circuit load spans the
complete S winding; the tap remains open.

Select a layer in the cross-section, connection diagram or winding editor to
highlight its copper and connected terminals. **Show all copper** clears the
selection. The diagram labels physical copper heights; its visual spacing is
schematic. Complete KiCad stackups supply actual copper centers. Explicit user
heights take precedence, with a clearly labeled uniform fallback when physical
data are incomplete. Imported board dielectric constant also updates the
capacitance estimate.

## Models and measured overrides

| Quantity | Method and boundary |
| --- | --- |
| Air-core inductance | Existing numerical partial-inductance solver; routed parallel branches reduce to winding ports |
| Ferrite magnetizing inductance | Common flux from AL and winding turns; catalog AL or custom reluctance model |
| Ferrite leakage | Current-sheet magnetic field energy through the selected heights and copper thickness; interleaving and spacing affect the result |
| Legacy leakage | Explicit supplied fraction, retained for existing designs |
| Measured leakage | Calibrates primary short-circuit inductance with S shorted, for two series windings |
| Copper loss | DC copper and series transition barrels, optionally symmetric foil skin loss plus average-field proximity loss (Dowell with copper-fill correction) |
| Parallel currents | Full branch impedance system with equal terminal voltage and port current conservation; shared terminal buses are ideal |
| Interwinding capacitance | Adjacent, unlike winding layers using copper overlap, dielectric spacing and permittivity; optional measured aggregate override |
| Core loss | Entered operating-point density, bounded N87 datasheet fit, or user Steinmetz coefficients |
| Temperature | Ambient plus total known loss times user-supplied assembly thermal resistance; zero resistance disables it |

Interwinding capacitance is a separate common-mode estimate. It does **not**
create a predicted differential resonance in the load solver. The model excludes
return wiring, shields, gap fringing, nonlinear permeability, DC bias, switching
waveforms, rectifiers and unequal loads on tapped halves. Current-sheet and foil
approximations are most useful for thin concentric stacks below resonance.

The circuit solves RMS phasors and includes the selected copper resistance.
Core loss is evaluated afterward; it does not alter magnetizing current or
voltage transfer. Circuit efficiency excludes core loss. A separate efficiency
including core loss appears only when that loss is known. Temperature is a
single operating-point estimate, not an iterative thermal solution. In imposed
current mode, secondary currents are antiphase to the primary; ferrite flux uses
the separately entered sinusoidal primary voltage.

## Responses and comparisons

Select **Voltage source with secondary loads** to see voltage transfer, phase,
copper loss, flux limit and output voltage versus resistive S load. Other output
loads remain fixed during the S-load sweep. Frequency sweeps update AC resistance
and series RLC reactance; source reactance and fixed R+jX loads stay constant.
Zero L or C omits that series component. Open and short remain explicit modes.
Sweeps reuse the generated winding geometry.

**Compare up to three designs** stores named, independent snapshots with size,
loss, leakage, capacitance, flux margin and output voltage. Snapshots include
source, loads, models and winding configuration and survive saved designs and
JSON exports. Restore applies the complete snapshot. Compare at matching source,
frequency and load for a useful tradeoff.

## Design from requirements

Enter nominal input voltage, each enabled output's voltage/current target,
frequency, maximum board width/height, available layers and voltage tolerance.
Output V/I defines a nominal resistive load. The bounded search explores turns,
widths, connections, grouped/interleaved stacks and footprint scales within the
selected locks; unlocking Core includes the supported catalog assemblies.
Every output is checked at nominal and selected named conditions, including
known flux, regulation and thermal limits. Up to 24 candidates are refined at
production solver resolution and shown in the size/loss plot; three can be
pinned for detailed comparison. Missing thermal or material data stays Unknown.

These are sinusoidal starting designs, not a global optimum or a switching-
converter design. Changing relevant settings cancels an active search and
prevents stale results being applied. An impossible request reports no feasible
candidate; any suggested requirement change is separately tested and requires
explicit application.

## Catalog assemblies and board cutouts

Two ungapped N87 sets are included from the [TDK ELP 32/6/20 drawing, October
2022, pages 6–7](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_32_6_20.pdf):

| Assembly | Parts | AL | Minimum PCB window |
| --- | --- | --- | --- |
| EELP 32/6/20, E+E | 2 × B66457G0000X187 | 5,700 nH/turn² | 6.10 mm |
| EILP 32/6/20, E+I | B66457G0000X187 + B66457K0000X187 | 6,300 nH/turn² | 3.05 mm |

Selection loads a fitting rectangular winding and manufacturer dimensions.
Maximum post and minimum window dimensions govern clearance checks. Copper,
pads and vias must clear the center and both outer legs. PCB thickness plus
assembly clearance must fit the window. Catalog magnetic data and dimensions
cannot be silently edited; choose Custom core first. These parts are ungapped
and have no clamp recess or integral mounting holes; assembly uses adhesive or
an external fixture. Availability is not checked.

Board export includes a surrounding outline and three closed core-leg openings.
Footprint export/direct placement does not cut the destination board. **Check
cutouts in KiCad** reads a board snapshot; **Check board file…** reads a saved
`.kicad_pcb`. Both compare closed openings at the current placement origin with
0.08 mm matching tolerance. This is a geometric check, not live KiCad DRC, a
manufacturing approval, or an isolation/creepage rating.

## Material data and validation

The [TDK N87 datasheet, June 2025](https://www.tdk-electronics.tdk.com/blob/528882/download/3/pdf-n87.pdf)
provides typical 100 °C points: 25 kHz/200 mT/57 kW/m³,
100 kHz/200 mT/375 kW/m³, 300 kHz/100 mT/390 kW/m³, and
500 kHz/50 mT/215 kW/m³. A log-space power-law fit supplies a labeled approximate
loss curve. It is bounded to 25–500 kHz, 50–200 mT and exactly 100 °C; it is not a
temperature-interpolated material database. Outside those bounds, loss and any
dependent total-loss/temperature result remain unknown. Use measured density or
appropriate user Steinmetz coefficients (Hz, T, W/m³) for other conditions.

Foil skin/proximity separation follows the general field formulation reproduced
in [Luong et al., 2023, equations 1–3](https://wvvw.easychair.org/publications/preprint/XXth/open).
The regression suite independently checks the equivalent conventional Dowell
stack expression, analytic parallel RL admittances, two-port reflected loading,
power conservation, low-frequency limits, measured overrides, interleaving
trends, physical stack heights and both catalog exports. DOM tests exercise
composed choices, parallel sections, plots, highlighting, candidate restore and
catalog persistence. These checks do not establish measured model accuracy.

Run `npm ci`, install `requirements.txt` in the chosen Python environment, then
`npm test` and `npm run test:transformer`. `PYTHON` can select that interpreter.
The RPC suite isolates itself from any running KiCad instance. Build a portable
development PCM package using `python scripts/build_package.py`; the original
`./build.sh` remains available. Live PCB placement, DRC and physical prototypes
must be checked separately.
