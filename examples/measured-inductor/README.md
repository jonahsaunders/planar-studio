# Measured square-spiral inductor

This example reconstructs the TxB inductor fabricated and measured by Jacopo
Olivo, Sandro Carrara and Giovanni De Micheli. Their network analyzer measured
scattering parameters, which the authors converted to terminal impedance. The
fixture dimensions and calibration plane are unspecified. The editable
reconstruction uses the published dimensions and Planar Studio's standard
terminal routing. [Original paper, Tables I–II and Figure 3(b)](https://si2.epfl.ch/demichel/publications/archive/2011/ISMICT_2011_Jacopo_%28Antenna_Design%29.pdf)

![Measured and predicted resistance up to 4.9 MHz and reactance up to 49 MHz](comparison.png)

| Quantity | Published measurement | Planar Studio | Relative error |
| --- | ---: | ---: | ---: |
| Inductance | 1.53 µH | 1.336 µH | −12.7% |
| Resistance at 1 MHz | 0.56 Ω | 0.326 Ω | −41.7% |
| Reactance at 1 MHz | 9.76 Ω | 8.395 Ω | −14.0% |
| Self-resonance | 70.4 MHz | 123.68 MHz | +75.7% |

The largest discrepancy is self-resonance. This reconstruction substantially
underestimates terminal loss at 1 MHz and increasingly underestimates reactance
as frequency rises. No model parameters were fitted to the measurements.

## Reproduce the comparison

1. In the Inductor workspace, choose **Import…** and open [design.json](design.json).
2. In **Design tools → Measurements**, import [impedance.csv](impedance.csv)
   to overlay measured impedance magnitude on the model.
3. Run `node examples/measured-inductor/compare.mjs` from the repository root
   for the real and imaginary components at every sampled frequency.
   To redraw the figure, run `python examples/measured-inductor/plot.py` with
   Matplotlib installed.

The paper specifies eight turns, 38 mm across the outside, a 6.6 mm opening,
1 mm traces and gaps, 2 mm corner radius, and 35 µm copper on 1.2 mm FR-4
with relative permittivity 4.4 and air above. Planar Studio specifies a polygon
by its centerline corner diameter. The input of 52.326 mm is
`(38 − 1) / cos(45°)`; the generator steps inward at each corner. The opening
and terminal leads follow the generator. The assumed conductor temperature is
25 °C.

The 1 MHz values and the inductance and resonance measurements come from
Table II. The other CSV values are approximate readings of the solid
measurement traces in Figure 3(b). The resistance and reactance panels use
different frequency ranges. [reactance.csv](reactance.csv) extends the
reactance comparison beyond the published resistance range. One vertical
pixel represents about 0.005 Ω in the resistance panel and 4.3 Ω in the
reactance panel. Line width adds several pixels of uncertainty, especially for
low-frequency reactance. Use the tabulated values for quantitative comparisons
at 1 MHz.
