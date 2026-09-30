# Feedback-current margin revision — September 30, 2026

The preceding example used R3/R4/R5 = 106 kΩ / 10 kΩ / 118 kΩ. Its rating-based RFB screening current was 197.84 µA, only 1.08% below the 200 µA absolute maximum. That calculation did not establish transient compliance. This revision increases resistance and defines a tighter measured clamp envelope. **The prototype is unbuilt; hardware qualification remains open.**

## Coordinated component changes

| Reference | Previous | Revised starting value | Selected manufacturer order code |
| --- | --- | --- | --- |
| R3, feedback | 106 kΩ | 115 kΩ, 0.1%, 25 ppm/°C | Vishay TNPW0603115KBEEA |
| R4, reference | 10 kΩ | 10.8 kΩ, 0.1%, 25 ppm/°C | Vishay TNPW060310K8BEEA |
| R5, temperature compensation | 118 kΩ | 128 kΩ, 0.1%, 25 ppm/°C; temperature trim required | Vishay TNPW0603128KBEEA |

These 0603 selections use the resistance range and B/E/EA order-code options in the [Vishay TNPW specification](https://www.vishay.com/docs/28758/tnpw_e3.pdf), pages 1–4. Existing lands and generic models fit the stated package. Conservative 0.1 W / 75 V design limits remain. Exact supplier listings, stock and assembly eligibility are unverified; previous resistor catalog codes are cleared. Historical observations remain explicitly superseded in the sourcing record.

For the existing 2:1 turns ratio and 0.3 V sampled diode-drop assumption:

`VOUT = (115 / 10.8) / 2 − 0.3 = 5.0241 V`.

Changing R3 alone would give 5.45 V. R3/R5 changes from 0.898305 to 0.898438 (0.0147%), preserving the nominal compensation slope. Final regulation and temperature trim remain necessary. R4 stays inside 9.09–11.0 kΩ, including the stated tolerance and 100°C drift assumptions. The [LT8302 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf), pages 2–3, 7 and 11–12, supplies the pin limits, reference range, output equation and compensation guidance.

## Preliminary current budget and acceptance target

Require **max(SW−VIN) ≤17.5 V**, including initial overshoot and measurement uncertainty across operating conditions.

| Calculation | Result |
| --- | ---: |
| Historical-style screening, `(19.9 + 1 + 0.05) / (115000 × 0.999)` | 182.36 µA; 8.82% separation |
| R3 minimum, `115000 × 0.999 × (1 − 25e−6 × 100)` | 114,597.79 Ω |
| Preliminary resistive bound, `(17.5 + 0.5) / R3min` | 157.07 µA; 21.46% separation |

The 50 mV sensing specification applies at 75–125 µA; the historical calculation is a comparison, not a transient bound. The revised 0.5 V allowance uses the lower absolute pin boundary, **not a guaranteed transient offset**. Verify RFB voltage and current independently, including capacitive injection and probe loading. The assumed 100°C resistor excursion excludes aging and must be checked against actual temperatures. Absolute maxima are not operating targets. The cycle/stress models retain their fixed 5 V target; they do not simulate the controller's actual regulation.

## Clamp and snubber tuning

Retain **SMAJ12A and 39 Ω / 470 pF** for initial measurements. The [Diodes SMAJ specification](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf), page 3, rates SMAJ12A at 19.9 V at 20.1 A; this does not determine its voltage at converter pulse currents or include layout overshoot.

If tuning cannot meet 17.5 V, evaluate **SMAJ11A** as a bench candidate, not an approved substitution. Its 18.2 V catalog clamp gives 167.56 µA in the historical-style calculation. Its 12.2 V minimum breakdown plus D3 drop must avoid excessive conduction during normal transfer: the upper reflected-voltage estimate is already 11.7 V before winding drops. Measure repetitive energy, ringing and temperature.

| C6 | Scaled snubber estimate | Comparison with R6's 0.66 W rating |
| --- | ---: | --- |
| 470 pF | 0.485 W | Initial value; thermal/pulse checks still required |
| 680 pF | 0.702 W | Exceeds nominal rating |
| 1 nF | 1.032 W | Exceeds nominal rating |

Increasing C6 requires renewed pulse-power sizing, temperature derating and potentially a larger resistor and revised layout. Keep the SW–D3–D4–VIN loop compact and RFB away from switching currents.

## Release gate

Follow the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md). Record the differential peak envelope, RFB pin excursions/current, ringing, regulation and clamp/snubber temperatures at startup, full load, light-load bursts, overload and short-circuit recovery across input and temperature. Recompute the resistor budget after any trim. Neither the resistor substitution nor passing CAD checks closes this gate.
