# Engineering models

[Back to Planar Studio](../README.md)

Planar Studio combines numerical winding calculations with analytical models for
motors, transmission lines and filters. These estimates support design and
comparison; physical performance depends on the model assumptions and must be
verified for the intended application.

For ferrite assemblies, loaded windings, loss estimates and calibration, see the
[transformer design guide](transformer-design.md). Antenna assumptions are
documented in the [family guide](creator-families.md) and
[directional antenna guide](directional-antennas.md).

## Inductance solver

Inductance is a partial-inductance sum over the discretised 3-D filament path —
the Neumann double integral with a geometric-mean-distance kernel, self terms
from Grover's straight-bar expression, plus a discretisation correction that is
recalibrated for the segment length and cross-section on every solve.

Because the whole multi-layer path (including via barrels) is one filament
chain, inter-layer mutual inductance falls out of the same sum rather than
being bolted on as a coupling coefficient.

The [numerical checks](../tests/verify.mjs) compare the solver with
reference cases. The documented comparisons are:

| Case | Reference | Result |
|---|---|---|
| Single circular loop | `µ₀R(ln(8R/GMD) − 2)` | **0.04 %** |
| Two coaxial loops, 1 mm apart | Maxwell's elliptic-integral mutual | **0.29 %** |
| Square planar spirals | Mohan current-sheet expression | **3.1 – 7.3 %** |
| Circular planar spirals | Mohan current-sheet expression | **1.4 – 2.3 %** |
| 50 Ω on 1.6 mm FR-4 | Published width | **1.3 %** |
| Coupled Z0e/Z0o, w 1.5 s 0.3 | Published tables | **0.4 / 3.0 %** |
| Chebyshev g-values | Matthaei tables | **< 0.01 %** |
| Interdigital insertion loss | `4.343·Σg/(FBW·Q_u)` | **1.1 – 4.5 %** |

The Mohan expression carries roughly ±3–8 % of its own error, so those two rows
are agreement, not deviation. The tool shows the numerical and closed-form
values side by side wherever a closed form exists.

## Model reference

| Quantity | Model |
|---|---|
| Inductance | Partial inductance, Neumann + GMD kernel; Grover self terms |
| Closed-form cross-check | Mohan current-sheet and modified Wheeler, where the shape has coefficients |
| AC resistance | Dowell, with porosity correction `η = w/(w+s)` |
| Interlayer capacitance | Plate capacitance with the 1/3 energy factor for a series stack |
| Turn-to-turn capacitance | Coplanar strips on substrate, scaled by `(n−1)/n²` |
| Current rating | IPC-2221, `I = k·ΔT^0.44·A^0.725`, `k` = 0.048 external / 0.024 internal |
| Motor | Sinusoidal PMSM: `Kt = 1.5·p·λ`, `λ = N·kw·Φ`, `Φ = (2/π)·B·A_pole` |
| Microstrip | Hammerstad–Jensen with thickness correction; Getsinger dispersion |
| Coupled microstrip | Modal capacitance decomposition (Garg & Bahl) |
| Filter prototypes | Matthaei/Pozar g-values; standard LP/HP/BP/BS transforms |
| Filter response | ABCD cascade → S-parameters, with realised parasitics |
| Interdigital capacitor | Coplanar-strip conformal mapping, `(N−1)` gaps in parallel |

Airgap flux density is an input, not a magnetostatic solve — feed it from your
magnet grade and gap. IPC-2221 assumes still air and an isolated conductor; a
coil packed against its neighbours runs hotter than the single-trace figure, and
a stator has no still air around it at all.

## Geometry and circuit conventions

- **Series layers:** alternate spiral layers are mirrored about the X axis so
  their fields add. Reversing traversal alone would reverse circulation. The
  generators share transition points on the +X ray.
- **Inverse coil sizing:** fractional turns change terminal and via placement,
  which can make inductance nonmonotonic. The solver searches whole turns, then
  adjusts diameter.
- **Resonator loss:** unloaded Q is represented as a parallel conductance.
  Distributed-filter loss includes the substrate's dielectric limit.
- **Bandwidth:** crossings must bracket the intended passband. Higher-order
  passbands and multiple equal-ripple peaks are not interchangeable with the
  desired band edges.

## Filter families

Six families, synthesised from a prototype and laid out as copper:

| Family | What it is | Where it belongs |
|---|---|---|
| Lumped LC | Spiral inductors and planar capacitors in a ladder | DC to a few hundred MHz |
| Stepped impedance | Alternating wide and narrow line sections | Microstrip low-pass |
| Edge-coupled | Parallel half-wave resonators | The default microstrip band-pass |
| Hairpin | Coupled resonators folded into a U | Folded band-pass layouts |
| Interdigital | Quarter-wave resonators grounded at alternating ends | Compact band-pass layouts |
| EMI / power | Pi, T and common-mode networks | Conducted-noise filtering |

Butterworth, Chebyshev and Bessel prototypes; low-pass, high-pass, band-pass
and band-stop transforms; S-parameters, VSWR and group delay from an ABCD
cascade.

![A hairpin band-pass filter with its response](screenshot-filter.png)

## Filter synthesis and response

The filter workspace synthesizes a network, generates copper, then calculates
a response from that geometry. The geometry calculation includes estimated
inductance, Q and capacitor parasitics. It is plotted alongside the ideal
prototype so the effects of realizing the network in copper are visible.
Both curves are model predictions, not hardware measurements.

![A lumped LC low-pass in the light theme](screenshot-filter-light.png)

Initial layouts use textbook synthesis, so the geometry's calculated center
frequency and bandwidth can differ from the requested values. The Design Tools
panel can tune geometry against a response mask. Validate a final RF design with
an appropriate electromagnetic model and measurements.

### Hairpin model

Hairpins use alternating half-wave U resonators and independently tapped input
and output feeds. The centerline includes the semicircular bend:
`length = 2 × armLen + π × (armGap + traceWidth) / 2`.
The same dimensions drive synthesis, the response model and exported copper.
The resonator impedance control sets the width; gaps are solved within the
minimum-gap constraint. Unreachable gaps and taps produce warnings rather than
an assumed match to the requested bandwidth.

Tap distance `t` is measured along the centerline from the resonator midpoint.
With `L = length / 2`, the uniform-line approximation is
`Qe = π Z0 / (2 Zr sin²(π t / (2 L)))`. Feed placement converts this to a
distance from the open end, mirrors alternate resonators, and restricts the
feed to the straight arm. The response uses the Q of that actual placement,
including any restriction. Input and output tap handles can be dragged
independently, including for even-order and asymmetric prototypes.

The narrowband equivalent uses shunt tanks and admittance inverters. Tank
resonance comes from centerline length and effective permittivity. Adjacent
coupling is an **unvalidated first-order estimate**, not a full-wave extraction:

- Even/odd modal line parameters give normalized mutual capacitance `kc` and
  inductance `kl`.
- Integrate `kc cos(θa) cos(θb) ± kl sin(θa) sin(θb)` over the facing straight
  arms and normalize by `sqrt(lengthA × lengthB) / 2`. Here each phase is the
  distance from its open end times `π / length`. The magnetic term adds for
  opposite U orientations and subtracts for identical orientations.
- In the homogeneous, negligible-bend limit this gives `2 k_line / π` for
  alternating U's and cancellation for equal orientations. Absolute geometry
  is evaluated on every solve; the original gap is not a calibration reference.
- At very wide spacing the underlying modal fit can predict negative mutual
  parameters. These are clipped to zero and reported as outside the model's
  range, rather than predicting increasing coupling at large separation.

Open-end fringing, coupling between the two arms of one U, electrical bend
loading, feed/pad discontinuities and nonadjacent coupling are omitted. The
curve cannot establish passband accuracy or predict harmonics. For fabrication,
extract single-resonator frequency and external Q and paired-resonator coupling
from a full-wave model, then validate the assembled filter with measurements.
Older saved fixed geometry keeps its resonator orientation and dimensions when
loaded, but the corrected tap convention changes feed placement and the
response is recalculated; resynthesize to obtain the corrected alternating layout.

References: [NTU microwave filter notes, hairpin example and external-Q
derivation, pp. 9–12](https://www.ntuemc.tw/upload/file/2011062010032057680.pdf);
[Hong and Lancaster, “Cross-Coupled Microstrip Hairpin-Resonator Filters,”
IEEE T-MTT 46(1), 1998](https://home.eps.hw.ac.uk/~ceejh3/Journals/Cross-coupled%20microstrip%20hairpin-resonator%20filters.pdf).
The latter distinguishes same/opposite-orientation coupling and describes EM
extraction; it does not validate the approximate overlap model implemented here.

## References

- Mohan, Hershenson, Boyd & Lee. *Simple accurate expressions for planar spiral
  inductances.* IEEE J. Solid-State Circuits 34(10), 1999.
- Greenhouse. *Design of planar rectangular microelectronic inductors.* IEEE
  Trans. Parts, Hybrids and Packaging 10(2), 1974.
- Grover. *Inductance Calculations: Working Formulas and Tables.* Dover, 1946.
- Dowell. *Effects of eddy currents in transformer windings.* Proc. IEE 113(8),
  1966.
- IPC-2221B, *Generic Standard on Printed Board Design*, §6.2.
- Hammerstad & Jensen. *Accurate models for microstrip computer-aided design.*
  IEEE MTT-S, 1980.
- Getsinger. *Microstrip dispersion model.* IEEE Trans. MTT-21, 1973.
- Gupta, Garg, Bahl & Bhartia. *Microstrip Lines and Slotlines*, 2nd ed.
- Bahl. *Lumped Elements for RF and Microwave Circuits*, 2003.
- Matthaei, Young & Jones. *Microwave Filters, Impedance-Matching Networks and
  Coupling Structures*, 1980.
- Pozar. *Microwave Engineering*, 4th ed., ch. 8.
- Hong. *Microstrip Filters for RF/Microwave Applications*, 2nd ed., 2011.
- Gielis. *A generic geometric transformation that unifies a wide range of
  natural and abstract shapes.* American Journal of Botany 90(3), 2003.

