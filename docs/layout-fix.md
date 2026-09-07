# Lumped-filter layout correction — 1.0.1 development build

## Corrected behavior

- Reserve each ladder element's full copper width, including coil leads and vias,
  and center its artwork and connection points together. Large parallel shunt
  capacitors now stay inside their own slots instead of overlapping later stages.
- Position coils using their full copper height so terminal escapes clear the
  signal spine. Route shunt returns around the left side, away from the other
  terminal. Route parallel series-arm capacitors from outside their bodies.
- Place the ground rail below all component copper, including series capacitors.
- Preserve the modeled interdigitated overlap while reserving physical end gaps
  for the rounded finger tips.
- Bring the second plate-capacitor electrode to the signal layer using an escape
  lead and a via outside both plates. A via inside a plate would short it.
- Show version 1.0.1 in the app and mark the package as a development build.

## Validation performed

45 automated checks passed in this environment:

- 20 physical-layout regression checks: all four lumped-filter bands, series-first
  and shunt-first, both capacitor styles; narrow-band orders 3 and 7; IDC end gaps;
  and the KiCad placement geometry/export path.
- 22 existing Design Tools numerical and behavioral checks.
- 3 existing board-snapshot contract tests (mock board, not live KiCad).

The new physical suite rejects the original build. The reproduced 90–110 MHz,
fifth-order Butterworth band-pass had 378 perpendicular capacitor-finger
centerline crossings; the corrected geometry has zero. The before/after image
is rendered from the actual exported artwork, not a screenshot of a live browser.
The server was checked for startup and delivery of the updated interface.

A live KiCad placement/DRC test and browser interaction test have not been run
here. No browser binary or live KiCad is available. The original 104-check
numerical and RPC suites are not inside the uploaded installable archive, so
those suites were not rerun. Run the complete repository tests after applying
the source patches.

## Scope and remaining limits

This is a copper-layout repair, not a full electromagnetic or connectivity
certification. The circuit response still uses the intended lumped network;
it does not extract routing parasitics, unintended coupling, or shorts from
copper. Net assignment and full board-rule validation are outside this fix.
Interdigitated and plate capacitor models retain their existing approximations.
Odd-layer coils can still have an enclosed terminal, as noted by the original
solver; use even inductor layer counts for the tested automatic routing path.
The regression cases use two layers. Recheck other layer counts and unusual
process settings in KiCad. A large synthesized capacitor can remain physically
large after the overlap is fixed.

Saved designs regenerate their geometry. Previously exported or already placed
copper is unchanged until you regenerate/export or replace it.

## Source checkout

Apply `planar-studio-layout-fix.patch` after the original Design Tools patch.
It adds `tests/lumped-layout.mjs` to `npm test`. You can also run it directly:

```sh
node tests/lumped-layout.mjs
```
