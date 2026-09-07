# Changelog

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
