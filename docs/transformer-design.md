# Transformer design workflow — 1.4 development

The Transformer workspace combines a winding layout, a sinusoidal circuit and
explicit engineering estimates. Old saved designs keep their previous family,
DC-loss and supplied-leakage behavior until their settings are changed.

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

Enter source RMS voltage, target output RMS voltage/current, frequency, maximum
board width/height, available layers and voltage tolerance. The search uses the
selected magnetic model/core, source impedance and fabrication settings. It
evaluates integer turns, grouped/interleaved two-to-eight-layer series stacks
and two footprint scales. Output V/I defines a resistive load. It checks geometry,
board footprint, available layers, loaded voltage and peak flux before offering
up to three candidates, refined at production solver resolution.

The search provides feasible single-output sinusoidal starting designs, not a
global optimum or a switching-converter design. It does not vary core catalog
selection, winding width or parallel topology automatically. Apply a result,
then edit those choices and compare. Changing settings cancels an active search
and prevents stale results being applied. An impossible request reports no
feasible candidate instead of relaxing its requirements.

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
