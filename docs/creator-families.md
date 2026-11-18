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
| Patch array | 1–32 rows and columns (up to 1,024 elements), wavelength-based spacing, individual ports or a connected feed tree | Patch-element estimate, overall board dimensions and ideal normalized X/Y array-factor cuts |
| Printed quarter-wave monopole | Straight front radiator with adjustable back ground ending at the feed junction | Quarter-wave starting length and microstrip feed width |
| Full-wave printed loop | Single circular trace with an adjustable balanced feed gap | Length-based resonance reference from the open copper path |
| Corner-truncated CP patch | Square patch with adjustable cuts on opposite corners and a front microstrip feed | Untrimmed square resonance reference, cut dimensions and feed width |
| Two-arm Archimedean spiral | Isolated center-fed arms, adjustable turns, radii, direction and spacing | Target active-region radius and the checked physical trace layout |
| SIW slot array | Alternating front slots, back plate, plated side fences and short, and a tapered microstrip launch | TE₁₀ cutoff, guide wavelength, and starting slot spacing |
| CPW-fed elliptical monopole | Stepped front radiator and grounded coplanar launch with stitched rails | Quarter-wave radiator dimensions |
| Dual-band forked monopole | Two unequal branches at a shared feed | Independent quarter-wave length and frequency references |
| U-slot microstrip patch | Continuous front patch with a U-shaped opening | Unslotted cavity reference and physical slot dimensions |
| Annular-ring microstrip patch | Closed front ring above a back ground plane | Mean-circumference sizing reference |
| Aperture-coupled stacked patch | Two isolated patches, slotted inner ground, back feed, and ground access vias | Four-layer geometry and dielectric spacing targets |
| Crossed-dipole turnstile | Orthogonal printed dipoles and two separate balanced feeds | Half-wave starting dimensions |
| Four-arm planar sinuous antenna | Interleaved logarithmic trace cells and four independent feed terminals | Cell geometry and checked trace clearance |
| Cavity-backed slot antenna | Single aperture above a plated cavity with a tapered launch | Rectangular-cavity sizing reference and slot dimensions |
| Periodic microstrip leaky-wave antenna | Repeated open stubs on a continuous line with a termination port | Unloaded-line period reference for the −1 harmonic |
| Printed Franklin collinear array | End-fed collinear sections joined by alternating folded phasing sections | Half-wave section and fold lengths |

Four additional families—Vivaldi tapered slot, printed Yagi, printed
log-periodic and bow-tie—are described in the [directional antenna
guide](directional-antennas.md), including their feed and profile controls.

### Feed and net conventions

- Patches use `RF` (or the supplied signal net) and `GND`.
- Printed dipoles use separate `RF_P` and `RF_N` nets. Provide a differential
  feed or appropriate balun externally.
- A folded dipole is DC-connected around the fold. Both feed pads therefore
  share `RF`; they still represent a balanced RF port.
- The full-wave printed loop also has one DC-connected `RF` conductor. The
  Archimedean spiral has separate `RF_P` and `RF_N` arms. Use a balanced feed or
  an external balun for either layout, and add DC isolation where needed.
- The SIW launch and guide are electrically continuous with both ground plates.
  The layout uses one `GND` net. Provide a DC block for a source that cannot
  drive a DC short. Keep the front slots and intermediate layers clear of pours.
- The cavity-backed slot launch also shares `GND` at DC. The leaky-wave line’s
  input and load pads share `RF`. Connect the far end to an external termination.
- The stacked patch uses F.Cu for the parasitic patch, In1.Cu for the coupled
  patch, In2.Cu for the slotted ground and B.Cu for the RF feed. Both patches
  float at DC. Set the physical stack-up to the three spacings in the
  specification. Keep extra layers clear of the active structure.
- Use an external quadrature network and balanced feeds for the turnstile.
  For the sinuous layout, drive opposite arms as balanced pairs and provide
  any required phase combination externally.
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

The quarter-wave monopole and full-wave loop use the exposed-trace effective
permittivity `(1 + εr) / 2`. The monopole dimensions separate the radiator from the
microstrip feed. The loop sizing accounts for copper removed at the feed gap.
Neither estimate includes finite ground, feed loading or enclosure effects.
[Nordic monopole design note](https://infocenter.nordicsemi.com/pdf/nwp_008.pdf)

The corner-truncated square patch uses the square cavity starting dimension
with a fringing correction. The corner ratio sets the actual cut leg length.
Copper uses overlapping
rectangular steps, with the edge step controlling geometric resolution.
Changing diagonals mirrors the cuts. The number shown is the untrimmed
reference resonance. The tool does not solve mode separation or axial ratio.
[JPL corner-truncated patch study](https://tmo.jpl.nasa.gov/progress_report/42-116/116p.pdf)

The two-arm Archimedean spiral uses linear radial growth with azimuth and a
half-turn offset between arms.
The approximate active region has a circumference of one effective
wavelength. The generator verifies copper clearance along both exported arms.
The model omits the balun, matching network, backing cavity and axial ratio.
[Archimedean spiral study](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/tje2.12254)

The substrate-integrated waveguide (SIW) slot array uses a TE₁₀ equivalent
rectangular guide with the via-fence
correction `a_eff = a − d² / (0.95 p)`. The layout places the slots half a guide
wavelength apart and the last slot a quarter guide wavelength from the short.
The nominal slot length is a tunable half-wave starting point using the exposed-trace
permittivity assumption. The launch and slots need EM tuning for impedance
match, aperture illumination, and radiation pattern.
[Equivalent-width model](https://doi.org/10.1109/LMWC.2002.803188) ·
[Resonant slot array](https://onlinelibrary.wiley.com/doi/10.1155/2016/4031029)

The U-slot and stacked-patch layouts provide reference dimensions for coupled
resonators. The U-slot retains the unslotted patch frequency reference. The
stacked-board layout exports all four copper layers and the specification
reports the three dielectric spacings. Coupled-mode frequencies and matching
need separate EM analysis. [U-slot mode analysis](https://arxiv.org/abs/1906.00252) ·
[Stacked patch aperture coupling](https://idus.us.es/server/api/core/bitstreams/4d0d6b74-750e-4825-8dc5-29da4e74acad/content)

The sinuous layout follows the alternating logarithmic cell geometry using
constant-width traces. The leaky-wave period comes from the unloaded
microstrip phase constant and a −1 space harmonic. Loading changes the actual
phase constant and leakage. For the Franklin layout, each folded phasing
section starts with a half-wavelength centerline path between consecutive
radiating sections. [Sinuous cell geometry](https://uspto.report/patent/grant/4658262) ·
[Periodic microstrip modes](https://iris.uniroma1.it/handle/11573/359284) ·
[Printed Franklin model](https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/46764/JILANI_Syeda_PhD_Final_021018.pdf?isAllowed=y&sequence=1)

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

Rows and columns are independent: linear arrays such as 1×32 and rectangular
arrays such as 8×16 are supported. The controls and imported configurations use
the same 32-per-axis limit. Plot sampling increases with electrical aperture
to resolve narrower lobes. Overall board dimensions include the feed tree,
ground margin and outline offset; larger arrays may exceed your fabricator's
board size. Increase row spacing if a deeper feed tree leaves insufficient
clearance. Saved designs and all exports retain the full array.

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
