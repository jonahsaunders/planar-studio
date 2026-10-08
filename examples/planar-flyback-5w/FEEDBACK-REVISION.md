> Historical A1 audit. Electronic part rationale remains useful; A2 core, layout, calculations and release evidence are in README.md and VALIDATION.md. Do not use old core preparation or dimensions.

# Feedback-current margin revision — September 30, 2026

The original 106 kΩ / 10 kΩ / 118 kΩ network produced a 197.84 µA rating-based RFB screen, only 1.08% below the LT8302's 200 µA absolute maximum. It did not establish transient compliance. The initial 115k/10.8k/128k proposal improved that screen; the **stocked revision below** keeps at least 20% preliminary resistive separation while centering nominal output near 5 V. The user approved nearby stocked values. Hardware qualification remains open.

| Reference | Fitted starting value | Exact MPN | JLCPCB |
| --- | --- | --- | --- |
| R3 | 113 kΩ, 0.1%, 25 ppm/°C | Yageo RT0603BRD07113KL | C705718 |
| R4 | 10.7 kΩ, 0.1%, 25 ppm/°C | Yageo RT0603BRD0710K7L | C861078 |
| R5 | 127 kΩ, 0.1%, 25 ppm/°C | Yageo RT0603BRD07127KL | C705722 |

These are 0603 thin-film resistors rated 0.1 W at 70 °C, with a 75 V limiting voltage. Both power and voltage limits apply. [Yageo RT specification](https://yageogroup.com/content/datasheet/asset/file/PYU-RT_1-TO-0-01_ROHS_L).

For the 2:1 turns ratio and 0.3 V sampled diode-drop assumption, `VOUT = (113 / 10.7) / 2 − 0.3 = 4.9804 V`. Changing R3 alone against the old 10 kΩ reference gives 5.35 V, so all three values change together. R3/R5 is 0.889764, −0.9508% from the original 106/118 ratio; final temperature trim is required. R4 remains within 9.09–11.0 kΩ including 0.1% tolerance and 25 ppm/°C over 100 °C. [LT8302 datasheet, pages 2–3, 7 and 11–12](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf).

## Preliminary current budget

Require **max(SW−VIN) ≤17.5 V**, including initial overshoot and measurement uncertainty across operating conditions.

| Calculation | Result |
| --- | ---: |
| Historical screen: `(19.9 + 1 + 0.05) / (113000 × 0.999)` | 185.58 µA; 7.21% separation |
| R3 minimum: `113000 × 0.999 × 0.9975` | 112,604.78 Ω |
| Preliminary resistive bound: `(17.5 + 0.5) / R3min` | 159.85 µA; 20.07% separation |

The 50 mV normal-sensing specification applies at 75–125 µA and is not a transient bound. The 0.5 V allowance comes from the lower absolute pin boundary, **not guaranteed transient behavior**. Verify pin voltage/current independently, including capacitive injection, probe loading and temperature. The 100 °C resistor excursion excludes aging. Absolute maxima are not operating targets. The cycle model uses a fixed 5 V output and does not simulate controller regulation.

## Clamp and snubber

Retain **SMAJ12A and 39 Ω / 470 pF** for initial measurements. SMAJ12A's 19.9 V clamp specification is at 20.1 A and does not determine voltage at this converter's pulse current or include layout overshoot. [Diodes SMAJ specification](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf).

SMAJ11A remains a bench candidate only. Its 18.2 V rating gives about 170.52 µA in the historical screen. Its 12.2 V minimum breakdown plus D3 drop must avoid excessive conduction during ordinary transfer: the upper reflected-voltage estimate is already 11.7 V before winding drops. Measure repetitive energy and temperature before substitution.

R6 is now a stocked **Yageo SR1206FR-7T39RL, 0.75 W at 70 °C**, with a continuous-pulse specification. C6 is 470 pF ±5%, 100 V C0G. The existing worksheet's nominal-capacitance estimates remain approximately 0.485 W at 470 pF, 0.702 W at 680 pF and 1.032 W at 1 nF. Including +5% capacitance gives 0.509 W at the fitted value. These plateau-based CV²f estimates omit the measured ringing waveform: a conservative full 53.5 V swing at the worksheet's worst full-load frequency raises the estimate to about 0.695 W. This leaves little thermal headroom and makes waveform/temperature verification essential. 680 pF exceeds an 80%-of-rating design allowance; 1 nF exceeds the nominal rating. Neither is an approved fitted value. [SR specification](https://www.yageogroup.com/content/Resource%20Library/Datasheet/PYU-SR_20105_ROHS_L.pdf).

## Release gate

Follow the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md): record SW−VIN, RFB voltage/current, ringing, regulation and clamp/snubber temperatures at startup, full load, light-load bursts, overload and short-circuit recovery across input and temperature. Recompute the resistor budget after any trim. Resistor substitution and clean CAD checks do not close this gate.
