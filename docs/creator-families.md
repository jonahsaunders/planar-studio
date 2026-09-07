# Antenna and transformer families — 1.2.0 development

Version 1.3 adds a [layer assistant, visual winding editor, loaded circuit
analysis and two antenna families](stack-load-antennas.md). The imposed-current
and open-secondary limits below describe the original drive mode; the new guide
explains voltage-source operation.

Choose **Antenna type** or **Transformer type** in the existing workspace.
Old 1.1 designs retain their original edge-fed patch or two-layer air-core
behavior. All families use the existing Save/Open, JSON import, six exports,
layer visibility, specification sheet and KiCad placement paths. Switching
families refits the canvas and shows the relevant controls.

## Antenna families

| Family | Controls and generated copper | Supported calculation |
|---|---|---|
| Edge-fed patch | Original rectangular patch, feed and back ground | Transmission-line starting dimensions, estimated resonance, feed-line impedance |
| Inset-fed patch | Three exact copper rectangles form a slotted patch; adjustable inset depth and side gaps | Original patch estimate plus input resistance from a supplied edge resistance |
| Printed dipole | Symmetric arms with two isolated balanced-feed terminals | First-order half-wave span |
| Folded dipole | Continuous folded conductor, fold spacing and balanced-feed gap | First-order half-wave span and conductor length |
| Inverted-F | Ground rectangle, shorting leg, horizontal radiator and adjustable RF tap | First-order quarter-wave path length |
| Meandered inverted-F | Folded radiator with selectable run count and pitch | First-order quarter-wave path length |
| NFC loop | Circular or square loop, turns, diameter, width/gap, two surface terminals | Numerical free-space inductance, DC resistance at 20 °C, ideal unloaded tuning capacitance |
| Patch array | 1–4 rows and columns, wavelength-based spacing, individual ports or a connected feed tree | Patch-element estimate and ideal normalized X/Y array-factor cuts |

### Feed and net conventions

- Patches use `RF` (or the supplied signal net) and `GND`.
- Printed dipoles use separate `RF_P` and `RF_N` nets. Provide a differential
  feed or appropriate balun externally.
- A folded dipole is DC-connected around the fold. Both feed pads therefore
  share `RF`; they still represent a balanced RF port.
- An inverted-F's short, radiator and RF tap are intentionally DC-connected to
  `GND`. Connect a radio through an external series matching/DC-block component
  to the tap. Assigning RF and GND to the same continuous copper would create a
  net conflict. The generator does not pretend a 50-ohm feed is automatically matched.
- Both NFC terminals share the loop's DC net. The inner terminal is enclosed:
  use an insulated jumper or separately designed breakout layer.
- Individual array ports use `RF_1`, `RF_2`, etc., and one back `GND` plane.
  The connected feed tree uses one signal net. Its line sections use the entered
  feed-line impedance; T-junction matching and path-length equalization remain
  to be designed. The ideal array-factor chart does **not** simulate this tree.

Direct KiCad placement requires the generated nets to exist. Board exports
include those nets. Terminals on one DC-connected winding/radiator cannot
represent several isolated schematic nets; integrate with suitable net ties
where needed and review connectivity in KiCad.

### Antenna models

Inset resistance is `Rin = Redge cos²(π d/L)`, where `Redge` is an input and `d`
is physical inset depth. Slot/feed loading and reactance are not modeled. This
estimate cannot establish return loss, bandwidth or a complete impedance match.

Printed dipole spans start from `λ0 / (2 sqrt(εeff)) × scale`; inverted-F path
length starts from half that. Here `εeff = (εr + 1)/2` is a simple initial
assumption for exposed printed conductors. It does not account for substrate
thickness, the finite ground or the enclosure. MIFA folds away from the ground,
leaving the feed and short outside the return runs. Impossible dimensions are
rejected instead of silently reducing turns or folding pitch.

Switching to NFC sets 13.56 MHz when the previous frequency is outside its
range; switching back to RF sets 2.45 GHz if necessary. Switching to MIFA from
above 1 GHz sets 915 MHz to give the default five-run layout enough path length.
Other parameters are preserved; invalid combinations produce an actionable error.

NFC tuning uses `Ctotal = 1/((2πf)² L)` and subtracts the entered parallel
parasitic capacitance. If the result is nonpositive, external tuning C is shown
as unavailable. It does not synthesize the reader IC's loaded matching network.
**Size loop to target inductance** bisects diameter at fixed integer turns,
recomputing numerical L; it rejects targets outside the valid 5–200 mm range.

Array-factor cuts use the normalized complex sum
`|Σ exp(j 2π n spacing sinθ)| / N`, with spacing in free-space wavelengths,
uniform amplitude and zero phase progression. Values are floored at −60 dB
for plotting. These cuts exclude the patch element pattern, mutual coupling,
feed losses, phase errors and scan effects; they are not gain predictions.

Radiator clearance outlines on `Dwgs.User` are advisory drawing geometry,
not enforced KiCad keepout zones. They are included in SVG, DXF and board
exports. Direct placement does not create these drawing outlines; establish
all-layer keepouts in the destination board. The back/intermediate metal around
NFC loops and behind printed dipoles/IFAs requires special attention.

No antenna family claims full-wave S11, efficiency, bandwidth or realized gain.
The original patch assumptions in [creators.md](creators.md) still apply.

## Transformer families and routing

| Family | Default layer assignment | Purpose |
|---|---|---|
| Two-layer air-core | Original F.Cu primary / B.Cu secondary | Preserve 1.1 designs and surface terminals |
| Multilayer air-core | `P,P,S,S` | Series primary and secondary stacks |
| Center-tapped secondary | `P,S,S` | Equal secondary halves and an exposed midpoint terminal |
| Multiple secondaries | `P,S,S2` | Independent secondary outputs, with optional `S3` |
| Interleaved windings | `P,S,P,S` | Compare grouped and interleaved air-core layouts |
| Ferrite-core planar | `P,S,P,S` | Core-post opening and a separate magnetic-circuit model |

Edit **Winding assignment, front to back** to assign 2–8 occupied copper layers,
with at most four series layers per winding. Turns are **per occupied layer**;
readouts show total series turns and ratios. S2 and S3 have separate turn inputs.
Center taps require an even number of S layers; half the S layers precede the tap.
Every series section uses the same circulation direction, including mirrored
geometry when traversal reverses on alternate layers.

Each winding uses its own angular breakout sector. Distinct through vias sit in
a clear center annulus or outside the winding. Radial/arc leads connect the
winding ends to these vias; final terminals and center taps are numbered drilled
pads. The generator checks every via against every nonincident section,
including sections on its own net, so a through barrel cannot bypass turns or
connect another winding. The original two-layer family keeps its original
surface terminals and insulated-breakout requirement.

Nets are `<design>_PRI`, `<design>_SEC`, `<design>_SEC2`, `<design>_SEC3`.
A tapped secondary remains one DC-connected secondary net. Ports and the
specification identify polarity, tap location, layer, height and turn count.
All internal winding layers connect to accessible through-hole terminals;
there are no inaccessible SMD pads on inner copper.

Optional **Copper layer names** accepts canonical names in physical order,
for example `F.Cu,In2.Cu,In4.Cu,B.Cu` on a six-layer board. The engine rejects
missing, duplicated, reversed or nonexistent board layers. Optional **Copper
center heights** accepts one height per occupied layer, in mm from the front
reference plane. Without these heights it assumes uniform spacing, even when
KiCad supplies a layer list. Enter actual heights for asymmetric stacks.
Board exports preserve a complete even layer table and canonical IDs, including
unused intermediate layers. Reproduce the specified dielectric spacing in
KiCad's board stack-up; the export does not synthesize dielectric materials.

### Air-core model

The Neumann/GMD solver evaluates the actual routed 3D paths, including the
current-carrying spans of transition barrels. Every winding pair is solved;
the symmetric inductance matrix must pass a positive-definite Cholesky check.
The specification lists the full L/M/k matrix, winding resistances, turns and
open-secondary induced voltages. These are imposed-primary-current estimates,
not loaded voltage-transfer or delivered-power calculations. Unused through-via
stubs and external return wiring are excluded from the inductance sum.

Copper resistance uses trace length, width, copper weight and entered
conductivity temperature. Barrel resistance assumes 25 µm plating. The same
entered secondary RMS current applies to every secondary in the DC-loss sum.
AC skin/proximity loss, interwinding capacitance, resonance, conducting planes,
shields and thermal behavior are not solved. Interleaving changes the actual
geometry and therefore the air-core coupling; improvement is not guaranteed
for every geometry.

### Ferrite model

Choose a rectangular or round post opening, post dimensions, assembly clearance,
and available core window height. The generator checks PCB fit and keeps the
post opening clear of winding transition vias. The central `Edge.Cuts` loop is
included in the KiCad board export. Direct placement and the footprint export
do not cut the destination board; add the opening manually and check the full
core/PCB mechanical assembly. A post shape is not a catalog-core assembly model.

Enter effective core area `Ae` (mm²), magnetic path `le` (mm), total gap (mm),
and relative permeability, or select nominal initial permeability for N87/3C95.
The linear magnetic-circuit model uses SI units internally:

- `AL = μ0 Ae / (le/μr + gap)`.
- Common-flux mutual terms: `Mij = AL Ni Nj`.
- Self terms: `Lii = AL Ni² / (1 − leakageFraction)`.
- Sinusoidal peak flux: `Bpk = sqrt(2) Vrms / (2π f Np Ae)`.
- Optional core loss: supplied operating-point loss density × `Ae le`.

The leakage fraction is supplied, not predicted from the winding geometry.
It defines the self terms and therefore coupling; interleaving is not credited
with an automatic ferrite improvement. The flux calculation uses a separately
entered sinusoidal primary RMS voltage; entered winding currents only set the
DC-loss/imposed-current estimates. A flux-limit warning compares Bpk to the
user's design limit. There is no nonlinear saturation simulation.

Material presets supply only nominal initial permeability at 25 °C: N87 = 2200,
3C95 = 3000. They do not supply temperature-dependent permeability, a B-H curve,
frequency-dependent complex permeability or a power rating. Core loss stays
unknown until a loss density is entered from the material curves at the actual
frequency, flux and temperature. The model excludes gap fringing, DC bias and
nonlinear/thermal feedback. Neither layer spacing nor this model establishes
an isolation-voltage rating.

Material references:

- [TDK SIFERRIT N87 datasheet](https://www.tdk-electronics.tdk.com/download/187238/990c299b916e9f3eb7e44ad563b7f0b9/pdf-n87.pdf)
- [Ferroxcube 3C95/3C97 material data](https://www.ferroxcube.com/en-global/news/download/37)
- [TI antenna selection guide AN058](https://www.ti.com/lit/an/swra161b/swra161b.pdf)

## Verification

`npm test` includes `tests/creator-families.mjs`: all families, both transformer
shapes, ideal LC/array-factor/magnetic-circuit references, convergence,
via isolation, sparse layers, core openings, invalid inputs and export round trips.
`npm run test:creators:dom` covers family selection, conditional fields,
target sizing, saving, material selection and recovery from invalid parameters.
`npm run test:creators:browser` covers the real rendered application when a
Playwright Chromium installation is available. `npm run build` produces the
1.2.0 development PCM archive.

Development validation does not replace live KiCad placement/DRC or physical
RF/magnetic prototypes. The geometry/model and DOM suites passed in the
implementation environment. Chromium could not launch there; rendered browser
checks and live KiCad remain a release gate for this development build.
