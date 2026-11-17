# Impedance test board

This two-layer KiCad board carries two single-layer square inductors generated
by Planar Studio. Copper is on the front only. The back is free of copper under
both coils. Each coil ends in two exposed probe pads. The board is ready for
design review and fabrication. Its impedance has yet to be measured.

| Coupon | Use | Turns | Trace width / gap | Predicted inductance | Predicted resonance |
| --- | --- | ---: | ---: | ---: | ---: |
| A | Model development | 6 | 0.75 / 0.70 mm | 0.883 µH | 103.59 MHz |
| B | Held-out evaluation | 9 | 0.40 / 0.45 mm | 2.338 µH | 61.14 MHz |

[KiCad board](inductor-coupons.kicad_pcb) · [Geometry inputs](coupons.json) ·
[Predictions frozen before measurement](predictions.json)

## Bench procedure

1. Fabricate from the checked-in KiCad board. Use the nominal 1.6 mm FR‑4 and
   35 µm outer copper as the starting specification. Record the actual finished
   thickness, copper, laminate and solder mask. The prediction assumes air
   over the copper. Clearing or omitting top mask over the windings makes
   the hardware closer to that assumption.
2. Measure each coil at its two probe pads. Calibrate a one-port analyzer
   directly at the probe tips with the standards specified by the instrument
   or fixture vendor. Repeat the calibration after changing probe spacing.
   The pad coordinates are in [predictions.json](predictions.json). Record
   the method, standards, reference plane, frequency range and sweep settings.
   Keep test leads and conductive objects away from both winding areas.
3. Sweep from below 1 MHz to above the first inductive-to-capacitive crossing.
   A starting range is 100 kHz to 200 MHz where the instrument and fixture
   support it. Take several closely spaced points near the crossing. Repeat
   after reseating the probes and keep measurements from different copies
   under separate sample IDs.
4. Save the raw sweep and calibration record. For comparison, save a
   calibrated one-port Touchstone 1.x file or a CSV with
   `Frequency (Hz),R (ohm),X (ohm)`. Copy [measurement.template.json](measurement.template.json)
   beside the sweep and fill in the fixture, sample and file details.
5. Compare A first. Keep B's data aside until the model change and comparison
   method are fixed. Then run the same comparison on B and report the signed
   resonance error and the measured and predicted complex impedance. If the
   sweep misses the crossing, the comparison reports no measured resonance.

```sh
node examples/inductor-coupons/compare.mjs A path/to/measurement.json > A-comparison.csv
node examples/inductor-coupons/compare.mjs B path/to/held-out-measurement.json > B-comparison.csv
```

The scripts compare at the measured frequencies and print a summary to
standard error, with board and measurement hashes. The board SHA-256 uses LF
line endings so it survives checkout on Windows. The same script can compare a
later model against the frozen board and predicted resonance.

`node examples/inductor-coupons/generate.mjs --check` verifies the generated
board against the checked-in file. Use `generate.mjs` to rebuild the board
from its inputs. The optional `--write-baseline` flag records a new baseline
for a new coupon revision.
