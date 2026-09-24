# Experimental PCB Litz electrical models

These models are numerical prototypes. Passing the analytic and conservation
checks below does **not** validate a manufactured PCB coil, its MHz Q factor,
its first resonance, a wireless-power link, or the results of the referenced
WPTCE paper. The calculations have no fitted “Litz improvement” multiplier.

## Units, orientation and excitation

- Geometry artwork uses millimetres. Electrical extraction converts lengths to
  metres; resistivity is in ohm-metres, frequency in Hz, inductance in H and
  capacitance in F.
- Complex numbers are `[real, imaginary]`, with the `exp(+j omega t)` convention.
  Currents and magnetic fields are RMS phasors. A loss coefficient multiplied
  by squared RMS current gives watts, without another factor of one half.
- A network branch is oriented from node `a` to node `b`. The terminal solve
  injects 1 A at the input and withdraws it at the output, which is the voltage
  reference. The resulting input voltage is the complex terminal impedance.
- In the local rectangular model, current flows along the trace. The width
  coordinate is `x` and the thickness coordinate is `z`. `externalH.normal`
  means the magnetic field normal to the board; `externalH.transverse` is the
  field across the trace in the board plane. These fields are in A/m.

## Rectangular conductor extraction

`web/js/engine/litz-impedance.js` divides a straight conductor's cross section
into rectangular cells. Each cell represents a uniform longitudinal current
density, with its own resistance per unit length:

```
R_k = rho / area_k                  [ohm/m]
L_kl = mu0/(2 pi) * average(log(referenceRadius / distance))  [H/m]
```

The inductance kernel is averaged over the source and receiving cell areas.
Its self term uses the rectangular distance distribution, with one integration
performed analytically and the remaining smooth integral evaluated using
20-point Gaussian quadrature. Mutual terms integrate the long direction
analytically and the short direction with Gaussian quadrature. The matrix is
explicitly symmetric. A geometric-mean radius is not used as an adjustable
skin-effect parameter.

The complex system is solved with a constrained total current:

```
(R + j omega L) i + j omega A_external = voltage * 1
sum(i) = imposed current
A_external = mu0 * (H_normal * x - H_transverse * z)
```

The implementation solves three excitations using one LU factorization:
unit transport current, unit normal field with zero net current, and unit
transverse field with zero net current. Their complex current solutions can
be superposed. Consequently the model includes finite width and thickness,
current crowding at rectangular edges, skin diffusion, and reaction of induced
eddy currents to a locally uniform imposed external field. It is not a
thickness-only slab formula under a different name.

Copper power is evaluated directly as `sum(R_k * abs(i_k)^2)`. The three
excitation modes also form a Hermitian positive-semidefinite loss matrix,
`M_ab = sum(conj(i_a,k) R_k i_b,k)`. This allows arbitrary relative phases
between transport current and the two external fields. For the centred,
symmetric rectangle the distinct parity modes have negligible cross terms.

`rectangularProximityCoefficients()` returns a transport resistance multiplier
and normal/transverse field-loss coefficients. The latter are loss per unit
length per squared A/m: multiplying by a routed-field integral of
`H_i * H_j * length` produces a winding resistance-matrix contribution.

### Reference inductance and network integration

An infinitely straight conductor has no unique absolute inductance without a
return path. `referenceRadius` is therefore explicit. Its default is four
times the larger cross-section dimension and it must exceed the cross-section
diagonal. Moving this reference changes a common external inductance but does
not change current sharing, resistance or field-loss coefficients.

The extractor also returns `inductanceCorrectionPerMeter = L(f) - L(DC)`.
This difference is independent of the reference radius. It is **not** the raw
imaginary part of the local impedance and must not be added as a second full
inductance on top of a routed partial-inductance model.

When `litzAcModel: "rectangular"` is selected, the routed model consumes the
rectangular transport resistance and field-loss coefficients. The separate
`"slab"` mode retains the faster foil/slab approximation. Routed inductance
remains a frequency-independent
magnetoquasistatic partial-inductance approximation; it does not yet incorporate
the local AC-to-DC inductance correction or a globally coupled reaction-field
solve. Via barrels and pads are not resolved by the rectangular cross-section
extractor.

### Resolution and caching

The default resolution is a budget of 36 cells. Axis allocation responds to
the rectangle's aspect ratio and cell edges are graded toward its surfaces.
An integer `resolution` from 2 to 8 requests up to 4–64 cells; an explicit
`{nx, ny}` is also supported, with at most 64 cells in total. Explicit one-cell
axes are useful for analytical projection benchmarks, but suppress crowding
along that axis.

Geometry matrices and frequency responses are cached separately, with bounded
caches. If a surface cell is thicker than one skin depth, the result reports
`resolved: false` and a refinement warning. `resolved: true` only means this
mesh-size criterion was met; it is not an error bound, convergence certificate
or experimental validation.

### Analytic and numerical checks

Run `node tests/litz-impedance.mjs`.

| Check | Expected behavior / observed tolerance |
| --- | --- |
| DC rectangle | `R = rho * length / (width * thickness)`; every cell's current follows its area; constant external field causes no eddy loss |
| Rotation | Exchanging width and thickness preserves transport resistance and exchanges normal/transverse field losses |
| RMS power | Cell-resistor loss agrees with the Hermitian loss-matrix quadratic form for simultaneous complex current and field excitations |
| Current conservation | Pure field excitation sums to zero current; imposed transport current equals the sum of cell currents |
| Reference-radius change | Only common external reactance changes; resistance, field loss and `L(f)-L(DC)` remain invariant |
| Finite rectangular mesh | For 0.8 mm × 70 micrometres copper at 6.78 MHz, 36 versus 64 cells differ by about 0.9% in transport resistance, under 2% in normal-field loss and under 4% in transverse-field loss |
| Infinite-foil transport projection | With width/thickness 1000 and a 1 × 64 mesh, calculated skin factors agree within 0.4% with the analytic foil result for thickness/skin-depth 0.2, 1, 3 and 6 |
| Infinite-foil field projection | For a 1 mm × 10 micrometres foil at 50 MHz with a 2 × 32 mesh, the odd externally driven diffusion-mode loss agrees within 0.3% with the analytic result; refinement reduces error |

For `u = thickness / skinDepth`, the independent foil transport reference is:

```
Rac/Rdc = (u/2) * (sinh(u) + sin(u)) / (cosh(u) - cos(u))
```

The reference loss per length per squared RMS transverse field is:

```
2 * rho * width / skinDepth * (sinh(u) - sin(u)) / (cosh(u) + cos(u))
```

The projected foil tests check the Green kernel and diffusion solve in known
limits. They deliberately suppress width-direction edge crowding and cannot
establish the accuracy of an unconstrained two-dimensional rectangle. The
6.78 MHz mesh comparison concerns one straight cross section, not the entire
coil or a measured prototype.

## Terminal tracks and electrical graph

Where generated geometry supplies physical terminal buses, the electrical
graph includes their finite track resistance and partial inductance, their
coupling to winding paths, and the plated terminal-hole segments connecting
copper layers. Strand contacts are graph nodes on the shared buses. Interior
bus contacts must split the electrical branch even when the artwork uses one
continuous copper primitive.

The plating area is annular, not a solid cylinder:

```
area = pi * platingThickness * (finishedDrill + platingThickness)
Rbarrel = rho * connectedLayerSpan / area
```

The winding model also adds two radial annular-sheet estimates per via,
`2 * rho/(2*pi*foilThickness) * log(outerPadRadius/innerBarrelRadius)` when
the radius ratio exceeds one. This assumes full-annulus current spreading;
finite trace entry angles and MHz pad crowding remain unresolved. In the
rectangular mode, terminal bus transport skin factors use each bus's actual
width, while via-barrel skin remains a plating-thickness foil approximation.

If a caller supplies winding paths without physical buses, the fallback uses
ideal terminal contacts. Finite bus/barrel branches do not resolve current
spreading within pads, trace-to-pad transitions, plating imperfections or the
three-dimensional field around the terminal assembly.

## Distributed pair-capacitance prototype

The optional distributed mode divides each winding into a small number of
circuit sections and assigns internal potential nodes. Geometric estimates
create floating capacitances between positions on conductor paths. Broadside
overlap uses a parallel-plate expression; a two-wire approximation supplies a
coarse fringing estimate. Local potential interpolation assigns each end of a
pair to circuit nodes.

A pair is stamped as a rank-one nodal matrix `C_pair * w * transpose(w)`.
For a floating pair the interpolation weights sum to zero. Thus a uniform
potential shift stores no energy, and every positive pair capacitance produces
a positive-semidefinite contribution. A sum of pair capacitances must **not**
be presented as the terminal capacitance: each pair experiences a different
potential difference. Dielectric conductance, when enabled from a loss
tangent, follows the same nodal connection rather than an unrelated shunt.

The configuration selects this with `litzCapacitanceMode: "distributed"`;
`"off"` disables the intrinsic pair-capacitance network. The current bounded
prototype accepts 2–4 circuit cells per strand (`litzCapacitanceCells`) and
32–512 geometric samples (`litzCapacitanceSamples`). A nonnegative
`litzTanD` controls `G = omega * tanD * C`. An explicitly supplied external
`cExtra` remains a lumped capacitance across the input/output terminals and
is separate from the floating intrinsic pairs.

`web/js/engine/litz-network.js` solves branch currents and non-reference node
voltages together by modified nodal analysis. It includes the branch `R+jwL`
matrix and the nodal `G+jwC` matrix. Its real power should satisfy:

```
Re(Z_input) = copperLoss + dielectricLoss       [for 1 A RMS input]
Im(Z_input) = omega * (i* L i - v* C v)
```

The quadratic forms `i* L i` and `v* C v` are twice the cycle-average stored
magnetic and electric energies under the RMS convention. A calculated
resonance is a property of this approximate assembled network, not a measured
self-resonant frequency.

`averageMagneticEnergy` and `averageElectricEnergy` apply the one-half factor
and the configured terminal current squared. `Ploss` is copper loss,
`Pdielectric` is dielectric loss, and `Ptotal` is their sum. These losses use
the configured **terminal** RMS current; capacitor currents can cause winding
currents to differ substantially from it near a resonance.

The section inductance is currently obtained by distributing the whole-winding
partial-inductance matrix over sections, not by independently extracting every
section-to-section field interaction. This preserves the no-capacitance limit
and positive magnetic energy but omits differential current magnetic modes.
Spatial field reaction from displacement-current redistribution is likewise
not globally re-extracted. The capacitance approximation also omits shielding,
remote conductors, solder mask, via-pad capacitance and the surrounding board
environment. Refine both circuit-section count and geometric sampling before
interpreting resonances; use external extraction or measurement for a design
decision that depends on their absolute frequencies.

## Externally extracted impedance data

`validateExtractedImpedance(data, expectedPorts)` accepts this explicit schema:

```json
{
  "frequencyUnit": "Hz",
  "impedanceUnit": "ohm",
  "ports": ["inner:0", "outer:0"],
  "samples": [
    {
      "frequency": 1000000,
      "impedance": [
        [[0.20, 6.28], [0.01, 4.10]],
        [[0.01, 4.10], [0.25, 6.50]]
      ]
    }
  ]
}
```

The validator requires finite, strictly increasing nonnegative frequencies,
1–64 unique named ports, 1–2048 samples, square matrices matching port count,
finite complex values and explicit units. Supplying `expectedPorts` checks the
exact ordered mapping to the intended electrical ports. Port names alone do
not specify whether external terminals, winding terminals or internal sections
were extracted; callers must establish that correspondence.

Matrices must be complex symmetric within a numerical reciprocity tolerance.
The actual Hermitian part `(Z + conjugateTranspose(Z))/2` must be positive
semidefinite; this check includes small imaginary antisymmetries and does not
let a large inductive reactance hide negative real power. Singular lossless
modes are allowed. Data is copied rather than modified in place.

This is a validation API, not a file-picker/import workflow, solver adapter,
interpolation routine or automatic replacement of the routed model. It does
not extrapolate. Sampled passivity/reciprocity does not establish broadband
causality, passivity between supplied samples, port correctness, measurement
calibration or physical accuracy. The returned data explicitly retains
`physicallyValidated: false`.

## Primary references

- M. Kamon, M. J. Tsuk and J. White, “FASTHENRY: A Multipole-Accelerated 3-D
  Inductance Extraction Program,” IEEE Transactions on Microwave Theory and
  Techniques 42 (1994), 1750–1758,
  [DOI 10.1109/22.310584](https://doi.org/10.1109/22.310584).
  The authors' [earlier conference paper](https://www.rle.mit.edu/cpg/publications/pub53.pdf)
  describes the volume-filament extraction approach. This repository's bounded
  two-dimensional implementation is independent and is not FastHenry.
- H. A. Haus and J. R. Melcher, *Electromagnetic Fields and Energy*,
  [chapter 10: Magnetoquasistatic relaxation and diffusion](https://ocw.mit.edu/courses/res-6-001-electromagnetic-fields-and-energy-spring-2008/pages/chapter-10/),
  including section 10.7 on skin effect.
