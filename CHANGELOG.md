# Changelog

## 1.6.0 — Transformer project workflow and GUI audit (development)

- Move all four flyback mounting holes to 4.5 mm corner insets (41 × 95 mm
  pattern), increasing capacitor clearance while preserving electronic
  placement, routes and winding geometry. Refresh fabrication and 3D evidence.

- Review every flyback component against manufacturer package, polarity, rating
  and use-case evidence. Improve UVLO startup margin, select a lower-voltage
  clamp and current capacitor variants, and replace the input diode with a
  verified PowerDI123 part. Document conditional ratings and hardware gates.
- Add a damped 47 µF input reservoir, a second 180 µF output polymer capacitor,
  26 ground stitches and two capacitor return vias. Preserve the winding,
  outline and mounting geometry; keep schematic labels readable and all
  connections three-way. Publish a per-component audit, refreshed manufacturing
  files and 3D views; estimated ripple is 50.58 mV, not a measured result.

- Link new nominal input/frequency/load values to requirements, with explicit
  experimental overrides; preserve imported legacy operating points.
- Provide dedicated requirements, candidate, verification and export work areas
  around the winding canvas. Add keyboard stage navigation, visible focus,
  adaptive layout, clearer text and accessible chart data tables.
- Save revision-tagged verification reports and plots, named operating cases,
  and dependency-based Pass / Fail / Unknown / Outdated states.
- Add field-linked findings and bounded, recalculated repair previews.
- Search multiple outputs and selected load combinations; retain up to 24
  refined candidates with worst-case margin and size/loss exploration.
- Add constrained terminal offsets and handles, destination-net mapping,
  snapped/rotated placement, immediate conflict checks and replacement previews.
- Retain multiple tests per prototype and test type, matched calibration pairs,
  overlapping-frequency prototype comparisons and alternative calibration fits.
- Correct copper-temperature scaling in reused circuit solves, preserve exact
  zero external open-circuit current, and align catalog multi-output windings
  with rectangular core slots.
- Model explicitly prepared EELP32 center-leg gaps using the published AL/gap
  relation; retain ungapped behavior unless preparation is selected.
- Include a complete 5 W planar flyback example with KiCad source, integral
  six-layer windings, analytical calculations, BOM/CPL, Gerbers, core assembly
  notes, prototype test plan and clean ERC/DRC evidence. Mark supplier acceptance
  and physical performance as unverified; no supplier submission was made.
- Audit the flyback example with KiStack; add four American Embedded M3
  mounting holes, preserve explicit fabrication limits, check native schematic
  parity and part metadata, and publish rendered Gerber/mounting evidence.
- Redraw the flyback schematic on A4 with connected controller passives,
  complete clamp branches, compact symbols and readable fields; verify that
  every electrical pin, part record and PCB/manufacturing file is unchanged.
- Wire the clamp and controller directly to the power stage, separate signal
  ground symbols from net labels, and check drawn-wire continuity. Present the
  schematic and front/back PCB layout prominently in the example README.
- Extend engineering, project-state and whole-app interaction regression tests.
- Eliminate four-way schematic junctions and enforce both native ERC and
  symbol-aware geometry checks. Publish a measured PCB layout audit identifying
  primary input/clamp routing, output-feed, probe-access and assembly work.
- Bundle 3D models for all 29 flyback footprints, including the prepared core
  pair and provisional M3 hardware. Publish five assembly views, STEP/GLB
  exports, asset validation and nominal solid-interference evidence.
- Complete the KiStack PCB review and rework flyback placement/routing: shorten
  input, clamp and output paths, keep SW on the front, add separate outer-layer
  return copper, ground stitching, connector thermals and ground probe lands.
  Preserve the circuit and winding geometry; refresh manufacturing, 3D and
  before/after evidence, including full-layer Gerber framing and solid checks.

- Use American Embedded M3 Edge mounting footprints on the flyback example,
  oriented outward with the same drill pattern, checked six-layer extension
  clearances and refreshed manufacturing/3D views.

## 1.4.0 — Transformer design workflow (development)

- Compose magnetic model, taps, multiple outputs and winding stack independently.
- Add per-winding widths, series/parallel sections, solved branch currents, linked
  cross-section/connection/copper selection and physical KiCad copper heights.
- Add current-sheet leakage, measured leakage/capacitance overrides, AC foil
  copper loss, bounded N87 material loss fits and explicit thermal estimates.
- Add RLC loads, frequency/load responses, three saved candidate comparisons and
  a cancelable constrained search for sinusoidal starting designs.
- Add TDK EELP/EILP 32/6/20 N87 assemblies, mechanical clearance validation,
  complete core-leg board openings and read-only destination cutout checks.
- Preserve legacy family behavior; add engineering and UI regression coverage,
  offline RPC isolation and a portable PCM packager.

## Winding designer and obstacle-aware coils — development

- Add rotary/dual-rotor phase, polarity and series/parallel branch assignments,
  automatic schedules, compatible pole suggestions, and a phasor visualization.
- Route arbitrary schedules with independent link lanes; reject mismatched
  parallel EMFs. Include signed distribution cancellation in motor estimates.
- Add an Inductor board-area editor for mounting holes, connectors and forbidden
  polygons; generate and check continuous contour windings in a free pocket.
- Preserve constraints, assignments and exact checked copper in saved designs
  and exports. Add geometry, circuit, interaction and browser regression suites.


## Four motor families (development)

- Add two-phase PCB stepper geometry with isolated phase chains, full/microstep
  commands, an animated equilibrium preview and static holding-torque estimates.
- Add linear three-phase arrays with star routing, adjustable pole pitch, mover
  position and force-versus-position plots.
- Add dual-rotor gap, magnet and alignment controls with a schematic preview,
  combined-field estimates and updated rotary readouts.
- Add independently driven two-axis coil grids with signed per-coil currents,
  X/Y force estimates, peak-current reporting and position sweeps.
- Preserve original rotary designs, coil shapes and optional grouped terminals;
  save/load and export family-specific geometry and specifications.
- Check routing isolation, containment, model invariants, controls, animation,
  persistence and invalid-layout recovery. New non-rotary windings require two
  series copper layers; magnetic estimates are quasi-static approximations.
  Rendered-browser, live KiCad and physical validation remain outstanding.

## Motor coil and star routing update (development)

- Add selectable A/B/C/N, A/B/C-only and no-grouped-terminal breakout modes.
  Removing neutral breakout preserves the internal star; omitting all grouped
  terminals retains individual coil pads and removes the extra breakout tails.

- Add circular, racetrack/oval and polygon motor coils, including square and
  hexagonal profiles, with slot fitting and shape-specific turn limits.
- Replace disconnected bore buses with checked series/parallel star routing on
  two series copper layers; group phase inputs and neutral at an adjustable
  position, defaulting to the bottom, inside an expanded outer collar.
- Preserve winding tap names in KiCad, SVG and DXF output; use one physical net
  for the continuous star winding and unique individual coil terminal numbers.
- Align magnetic-field placements with the motor artwork and report routing
  restrictions, dropped turns and incompatible repeated-phase rotor schedules.
- Default new motors to 12 coils, eight pole pairs and two copper layers.
- Add physical interconnect graph, export, geometry and real-control DOM tests.
  Live KiCad and rendered browser validation remain outstanding.

## 1.3.0 (development)

- Add a layer setup assistant with board requirements, KiCad setup instructions
  and explicit board-context refresh; fix controls retaining stale configuration
  objects after adopting the board stack-up.
- Add a visual winding editor with per-section winding/layer/height controls,
  accessible assignment reorder buttons and section add/remove actions.
- Add linear loaded transformer analysis for every transformer family using the
  complete inductance matrix, RMS voltage source, source impedance and independent
  secondary impedances. Support exact open and short terminations; report loaded
  output, phase, regulation, power and DC winding loss.
- Compute ferrite loaded flux from common ampere-turns. Keep supplied core losses
  separate; loaded circuit efficiency excludes core and AC copper loss.
- Add edge-fed circular TM11 patches and microstrip-fed rectangular slots with
  starting dimensions, tuning controls, exports and topology-specific limits.
- Add numerical, geometry/export and whole-app DOM regressions for the new flows.
  Rendered browser and live KiCad validation remain outstanding.

## 1.2.0 (development)

- Add inset-fed patches, printed/folded dipoles, inverted-F variants, NFC loops with numerical target sizing and tuning C, and patch arrays with ideal array-factor plots.
- Add routed multilayer, center-tapped, multi-secondary and interleaved windings, with configurable copper layers/heights, isolated through-via routing, and a full air-core inductance/coupling matrix.
- Add rectangular/round ferrite-post openings, nominal material permeability presets, a linear magnetic-circuit model, supplied leakage, flux-limit checks and optional operating-point core-loss estimates.
- Preserve legacy creator behavior and all six exports. Keep sparse inner-layer IDs and emit complete even board layer tables.
- Add conditional family controls, canvas refitting, topology-specific model documentation, and geometry/model/export/DOM/browser regression coverage.
- Full-wave antenna matching, ferrite nonlinear/AC-loss simulation, rendered browser validation and live KiCad/physical validation remain outside the verified scope of this development build.

## 1.1.0 (development)

- Add Antenna workspace: rectangular edge-fed patch synthesis, substrate and feed controls, dimension tuning, ground plane, and estimated resonance.
- Add Transformer workspace: independent circular or square front/back air-core windings, primary/secondary turns, numerical L/M/k, resistance, leakage and induced-voltage estimates.
- Preserve SMD copper pad dimensions and layers in canvas, SVG, DXF, KiCad board/footprint exports and IPC placement. Transformer terminals no longer become through vias.
- Reject invalid creator geometry; prevent stale designs being placed or exported after invalid edits. Require separate existing nets for direct creator placement.
- Add numerical, export, IPC serialization and UI regression coverage; align runtime, package and PCM versions.
- Models are starting points: patch matching needs EM/VNA tuning; transformer inner terminals need insulated breakout and the model excludes ferrite cores and AC/parasitic losses.

## Unreleased — Design Tools

- Add constrained coil optimization, measurement import/overlays and fitting,
  coupled-coil exploration, manufacturing tolerance studies, direct and automatic
  filter tuning, magnetic-field slices, board-aware placement checks, and rotor design.
- Keep fixed copper dimensions during distributed-filter material studies and fitting.
  Hairpin/interdigital tuning uses an explicitly labeled narrowband resonator model.
- Add a read-only live-board snapshot RPC and configurable placement origin.
- Persist study settings and measurement baselines through existing design storage.
- Run studies in cancelable workers; dispose canvas observers when views are replaced.
- Flush the standalone server URL so automated clients can connect through a pipe.
- Add numerical, DOM/worker, snapshot, and reproducible browser integration tests.
- See docs/design-tools.md for supported cases, model limits, and validation status.


## 1.0.0

First release. The engine from [planar-coil-studio][pcs] moved inside KiCad as
an IPC API plugin, with a filter synthesis and layout stack added.

[pcs]: https://github.com/jonahsaunders/planar-coil-studio

### Added

- **KiCad integration.** IPC API plugin for KiCad 9.0+. Reads the open board's
  stack-up — layer count, thickness, dielectric constant, copper weight — and
  places real tracks, arcs and vias inside a single undoable commit. Re-placing
  a design replaces its previous copper rather than stacking on top, tracked
  through a placement registry keyed by design id.
- **Interactive interface.** Runs in its own process, so the UI is a real
  canvas rather than a wxPython dialog: drag handles on the geometry itself,
  live layer toggles in KiCad's copper colours, response plots, dark and light
  themes. Geometry recomputes per keystroke; the field solve debounces.
- **Filter workspace.** Butterworth / Chebyshev / Bessel prototypes; low-pass,
  high-pass, band-pass and band-stop transforms; six layout families (lumped
  LC, stepped impedance, edge-coupled, hairpin, interdigital, EMI pi/T/CM
  choke); Hammerstad–Jensen microstrip with coupled-line synthesis; ABCD
  cascade to S-parameters, VSWR and group delay.
- **Realised-value simulation.** The plotted response is computed from the
  geometry that would be placed — a spiral's realised inductance and its
  measured Q, a capacitor's parasitics — and drawn against the ideal prototype.
- **Motor interconnect.** Concentric phase buses in the stator bore, one ring
  per phase plus a star point, which a bare array of coils does not have.
- **Footprint library output.** Writes a `.kicad_mod` into a project-local
  `planar-studio.pretty` and registers it in the project's `fp-lib-table`.
- **Validation suites.** 104 numerical checks against closed forms, elliptic
  integrals and published tables; 26 checks on the plugin's RPC surface; 33
  headless UI checks across every workspace and filter family.

### Engineering notes

Four things that were wrong in an intermediate build and are worth recording,
because each is easy to get wrong the same way again:

- **Inverse inductance design cannot bisect on turn count.** L is not a smooth
  function of fractional turns — the lead breakout swings sides and the
  terminal may become enclosed — so L can jump 30 % between 1.70 and 1.75 turns
  and fall again. The solver searches whole turns, then trims the diameter.
- **A resonator's unloaded Q is a parallel conductance**, not a series
  resistance in each arm of the tank. The wrong model reported 14 dB of
  insertion loss where 3.6 dB was correct.
- **Bandwidth must be measured between the crossings that bracket the peak**,
  and the peak search anchored to the design band. An edge-coupled filter's
  spurious passband at 2·f₀ otherwise produces a bandwidth tens of times too
  wide, and equal-ripple maxima make "the peak frequency" meaningless.
- **A rejected POST must have its body drained** before the response. On a
  keep-alive connection an unread body corrupts every subsequent request.
