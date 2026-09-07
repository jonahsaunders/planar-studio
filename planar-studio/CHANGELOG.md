# Changelog

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
