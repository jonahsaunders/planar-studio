# Feature gallery

[Back to Planar Studio](../README.md)

Click a screenshot to open it at full resolution. The captures use browser mode
with isolated demo settings. KiCad is offline and the readouts are model estimates.

[Inductors](#inductors) · [Transformers](#transformers) · [PCB motors](#pcb-motors)
· [Planar constructions](#planar-construction-options) · [Filters](#filters)
· [Antenna types](#antenna-types) · [Design tools](#design-tools)

## Inductors

### Layers, geometry and frequency response

Two parallel copper layers, adjustable spiral geometry, and calculated
inductance, resistance, Q and self-resonance.

[![Parallel-layer inductor and response plots](screenshot-inductor.png)](screenshot-inductor.png)

### Route around board obstacles

An editable board region with a connector keepout and mounting hole. The
generated contour winding follows the remaining space.

[![Contour winding around connector and hole keepouts](screenshot-obstacles.png)](screenshot-obstacles.png)

[Winding and obstacle guide](winding-obstacles.md)

## Transformers

### Copper, winding stack and core assembly

A four-layer ferrite design with primary/secondary connections, physical layer
heights and a catalog-core cross-section.

[![Ferrite transformer and winding connections](screenshot-transformer.png)](screenshot-transformer.png)

### Search the size and loss tradeoff

The Candidates stage compares feasible starting designs against the chosen
requirements. Unknown thermal results remain separate from calculated limits.

[![Candidate search with board-area versus copper-loss chart](screenshot-transformer-search.png)](screenshot-transformer-search.png)

[Transformer design guide](transformer-design.md)

## PCB motors

### Three-phase rotary

Twelve stator coils, phase routing and signed winding phasors alongside motor
estimates.

[![Rotary motor workspace](screenshot-motor.png)](screenshot-motor.png)

### Two-phase stepper

Independent A/B phases with microstep controls and an equilibrium preview.

[![Two-phase stepper workspace](screenshot-motor-stepper.png)](screenshot-motor-stepper.png)

### Linear motor

A three-phase coil array with position, current and thrust estimates.

[![Linear motor workspace](screenshot-motor-linear.png)](screenshot-motor-linear.png)

### Dual-rotor axial flux

A stator between two magnet discs, with independent gap and alignment inputs.

[![Dual-rotor workspace](screenshot-motor-dual-rotor.png)](screenshot-motor-dual-rotor.png)

### Two-axis planar motor

An independently driven coil grid with X/Y force and driver-current readouts.

[![Two-axis planar motor workspace](screenshot-motor-planar.png)](screenshot-motor-planar.png)

### Planar construction options

The `experimental` captures cover all six construction settings, with a
separate view for the crossed-stage voice-coil drive. The Sawyer and voice-coil
views use example force-per-amp inputs.

| PCB coil grid | Wire-wound stator tile | Moving-coil carriage |
| --- | --- | --- |
| [![PCB coil grid with planar force preview](screenshots/experimental/planar-pcb-grid.png)](screenshots/experimental/planar-pcb-grid.png) | [![Square wire coil tile with magnet carriage preview](screenshots/experimental/planar-wire-tile.png)](screenshots/experimental/planar-wire-tile.png) | [![Moving coil board with fixed checkerboard magnet bed](screenshots/experimental/planar-moving-coil.png)](screenshots/experimental/planar-moving-coil.png) |

| Double-sided magnet carriage | Crossed linear motors | Voice-coil flexure |
| --- | --- | --- |
| [![Fixed coil board between two moving magnet plates](screenshots/experimental/planar-double-sided.png)](screenshots/experimental/planar-double-sided.png) | [![Crossed PCB linear stages with separate X and Y magnet tracks](screenshots/experimental/planar-crossed.png)](screenshots/experimental/planar-crossed.png) | [![Crossed voice-coil stage with flexure controls](screenshots/experimental/planar-voice-coil.png)](screenshots/experimental/planar-voice-coil.png) |

| Sawyer planar stepper |
| --- |
| [![Toothed steel platen and phased forcer preview](screenshots/experimental/planar-sawyer.png)](screenshots/experimental/planar-sawyer.png) |

[Planar construction and export guide](motor-families.md#construction-options)

[Motor family guide](motor-families.md) · [Coil shapes and terminals](motor-coils.md)

## Filters

### Microstrip hairpin

A five-pole hairpin layout using a low-loss substrate model, with calculated
transmission and reflection plotted beside the geometry.

[![Hairpin band-pass filter](screenshot-filter.png)](screenshot-filter.png)

### Lumped LC, light theme

Spiral inductors and interdigital capacitors with ideal and geometry-based
response estimates.

[![Lumped LC filter in the light theme](screenshot-filter-light.png)](screenshot-filter-light.png)

[Filter models and assumptions](engineering-models.md#filter-families)

## Antennas

### Patch array

Four individually fed patch elements, substrate controls and ideal array-factor
cuts. The plot does not predict the realized radiation pattern.

[![Patch array workspace](screenshot-antenna.png)](screenshot-antenna.png)

### Vivaldi tapered slot

A continuous copper taper with feed and mechanical dimensions.

[![Vivaldi antenna workspace](screenshot-antenna-vivaldi.png)](screenshot-antenna-vivaldi.png)

### NFC loop

Loop geometry, target-inductance sizing and tuning estimates at 13.56 MHz.

[![NFC loop workspace](screenshot-antenna-nfc.png)](screenshot-antenna-nfc.png)

### Antenna types

All 29 types from the **Antenna type** selector on `experimental`.

#### Patches and arrays

| Edge-fed patch | Inset-fed patch | Circular patch |
| --- | --- | --- |
| [![Edge-fed patch in the Antenna workspace](screenshots/experimental/antenna-patch.png)](screenshots/experimental/antenna-patch.png) | [![Inset-fed patch in the Antenna workspace](screenshots/experimental/antenna-inset-patch.png)](screenshots/experimental/antenna-inset-patch.png) | [![Circular patch in the Antenna workspace](screenshots/experimental/antenna-circular-patch.png)](screenshots/experimental/antenna-circular-patch.png) |

| Corner-truncated CP patch | U-slot patch | Annular-ring patch |
| --- | --- | --- |
| [![Corner-truncated CP patch in the Antenna workspace](screenshots/experimental/antenna-truncated-patch.png)](screenshots/experimental/antenna-truncated-patch.png) | [![U-slot patch in the Antenna workspace](screenshots/experimental/antenna-u-slot-patch.png)](screenshots/experimental/antenna-u-slot-patch.png) | [![Annular-ring patch in the Antenna workspace](screenshots/experimental/antenna-annular-ring-patch.png)](screenshots/experimental/antenna-annular-ring-patch.png) |

| Aperture-coupled stacked patch | Patch array |
| --- | --- |
| [![Slotted ground and back feed of the four-layer stacked patch](screenshots/experimental/antenna-aperture-stacked-patch.png)](screenshots/experimental/antenna-aperture-stacked-patch.png) | [![Patch array in the Antenna workspace](screenshots/experimental/antenna-patch-array.png)](screenshots/experimental/antenna-patch-array.png) |

#### Dipoles, monopoles and inverted-Fs

| Printed dipole | Folded dipole | Bow-tie dipole |
| --- | --- | --- |
| [![Printed dipole in the Antenna workspace](screenshots/experimental/antenna-dipole.png)](screenshots/experimental/antenna-dipole.png) | [![Folded dipole in the Antenna workspace](screenshots/experimental/antenna-folded-dipole.png)](screenshots/experimental/antenna-folded-dipole.png) | [![Bow-tie dipole in the Antenna workspace](screenshots/experimental/antenna-bowtie.png)](screenshots/experimental/antenna-bowtie.png) |

| Crossed-dipole turnstile | Printed quarter-wave monopole | CPW-fed elliptical monopole |
| --- | --- | --- |
| [![Crossed-dipole turnstile in the Antenna workspace](screenshots/experimental/antenna-turnstile.png)](screenshots/experimental/antenna-turnstile.png) | [![Printed quarter-wave monopole in the Antenna workspace](screenshots/experimental/antenna-monopole.png)](screenshots/experimental/antenna-monopole.png) | [![CPW-fed elliptical monopole in the Antenna workspace](screenshots/experimental/antenna-cpw-ellipse.png)](screenshots/experimental/antenna-cpw-ellipse.png) |

| Dual-band forked monopole | Inverted-F | Meandered inverted-F |
| --- | --- | --- |
| [![Dual-band forked monopole in the Antenna workspace](screenshots/experimental/antenna-forked-monopole.png)](screenshots/experimental/antenna-forked-monopole.png) | [![Inverted-F in the Antenna workspace](screenshots/experimental/antenna-ifa.png)](screenshots/experimental/antenna-ifa.png) | [![Meandered inverted-F in the Antenna workspace](screenshots/experimental/antenna-mifa.png)](screenshots/experimental/antenna-mifa.png) |

#### Loops and spirals

| NFC loop | Full-wave printed loop |
| --- | --- |
| [![NFC loop in the Antenna workspace](screenshots/experimental/antenna-nfc.png)](screenshots/experimental/antenna-nfc.png) | [![Full-wave printed loop in the Antenna workspace](screenshots/experimental/antenna-full-wave-loop.png)](screenshots/experimental/antenna-full-wave-loop.png) |

| Two-arm Archimedean spiral | Four-arm planar sinuous |
| --- | --- |
| [![Two-arm Archimedean spiral in the Antenna workspace](screenshots/experimental/antenna-archimedean-spiral.png)](screenshots/experimental/antenna-archimedean-spiral.png) | [![Four-arm planar sinuous in the Antenna workspace](screenshots/experimental/antenna-four-arm-sinuous.png)](screenshots/experimental/antenna-four-arm-sinuous.png) |

#### Slot, directional and guided-wave antennas

| Microstrip-fed slot | Cavity-backed slot | SIW slot array |
| --- | --- | --- |
| [![Microstrip-fed slot in the Antenna workspace](screenshots/experimental/antenna-slot.png)](screenshots/experimental/antenna-slot.png) | [![Cavity-backed slot in the Antenna workspace](screenshots/experimental/antenna-cavity-backed-slot.png)](screenshots/experimental/antenna-cavity-backed-slot.png) | [![SIW slot array in the Antenna workspace](screenshots/experimental/antenna-siw-slot-array.png)](screenshots/experimental/antenna-siw-slot-array.png) |

| Vivaldi tapered slot | Printed Yagi | Printed log-periodic |
| --- | --- | --- |
| [![Vivaldi tapered slot in the Antenna workspace](screenshots/experimental/antenna-vivaldi.png)](screenshots/experimental/antenna-vivaldi.png) | [![Printed Yagi in the Antenna workspace](screenshots/experimental/antenna-yagi.png)](screenshots/experimental/antenna-yagi.png) | [![Printed log-periodic in the Antenna workspace](screenshots/experimental/antenna-lpda.png)](screenshots/experimental/antenna-lpda.png) |

| Periodic microstrip leaky-wave antenna | Printed Franklin collinear array |
| --- | --- |
| [![Periodic microstrip leaky-wave antenna in the Antenna workspace](screenshots/experimental/antenna-microstrip-leaky-wave.png)](screenshots/experimental/antenna-microstrip-leaky-wave.png) | [![Printed Franklin collinear array in the Antenna workspace](screenshots/experimental/antenna-franklin-collinear.png)](screenshots/experimental/antenna-franklin-collinear.png) |

[Antenna families](creator-families.md) · [Directional antennas](directional-antennas.md)

## Design tools

### Inspect the magnetic field

A calculated free-space field slice above the inductor. The same panel provides
optimization, measurement overlays, coupled-coil studies, tolerances, filter
tuning, board checks and rotor tools.

[![Magnetic-field map and design-tool tabs](screenshot-tools.png)](screenshot-tools.png)

[Design tools guide](design-tools.md)

---

The README cover is a vector illustration generated by the geometry engines.
The workspace images are application captures.
[Original capture record](feature-capture.json) ·
[Experimental capture record](screenshots/experimental/capture.json) ·
[Reproduction commands](development.md#screenshots)
