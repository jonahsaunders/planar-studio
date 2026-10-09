# A4 snubber review — 2026-10-09

**Retain 39 Ω / 470 pF / SMAJ12A for controlled first-article tuning. This is not a thermal, pulse or clamp qualification.** No electronic parts or copper were changed in this review.

The native schematic netlist confirms VIN–R6–C6–SW across the primary, with a separate D3/D4 diode/TVS clamp. ADI's LT8302 Rev. G, page 16, gives 39 Ω / 470 pF as a starting point and requires tuning from measured ringing; it is not a guaranteed optimum for this planar transformer.

## Independently checked energy and frequency

For two fully settled transitions per cycle, resistor loss is approximately `P = C × (ΔV)² × f`. Each edge dissipates `½ C × (ΔV)²`; applying that half-factor to the whole cycle would undercount loss. VIN is effectively constant over a switching cycle: SW–VIN goes from about −VIN during switch-on to positive reflected voltage during switch-off. Using only the 17.5 V positive peak would also undercount loss.

The existing full-load worksheet is reproduced independently by `scripts/audit-snubber.py`, including an exact periodic series-RC calculation for the ideal two-level waveform. At the high-input corner, its uncapped Lmin frequency is **454.11 kHz**. That is a conservative worksheet scenario, not a predicted or guaranteed LT8302 frequency.

| Screen | Estimated R6 loss |
| --- | ---: |
| Worksheet plateau, 470 pF nominal | 0.448 W |
| Worksheet plateau, capacitance +5% | 0.470 W |
| 53.5 V full transition, capacitance +5%, 380 kHz typical | 0.537 W |
| Same transition, 420 kHz sensitivity assumption | 0.593 W |
| Same transition, worksheet 454.11 kHz | 0.641 W |

The 53.5 V transition is 36 V plus the 17.5 V differential peak target. Treating that peak as the whole off-state plateau deliberately overestimates an isolated overshoot, but does not bound arbitrary repeated ringing, input surges or faults. The 350/420 kHz cases are sensitivity assumptions, not guaranteed clock limits. These calculations do not measure real dissipation.

## Power derating and repetitive pulses

Yageo SR V14 confirms **SR1206FR-7T39RL is 0.75 W at 70 °C**, with linear ambient derating to zero at 155 °C. At 85 °C local ambient its rating is only **0.618 W**, below the conservative 0.641 W screen. At or below 70 °C, an 80%-of-rating allowance is **0.600 W**: the conservative screen does **not** meet that allowance. Its mathematical full-rating crossing is about **82.3 °C local ambient**; that is not an allowable measured body temperature or a qualified product rating.

At 493.5 pF and R6's initial minimum resistance of 38.61 Ω, an ideal 53.5 V edge gives roughly **1.39 A initial current, 74.1 W initial power, 0.706 µJ per edge, and a 19.1 ns RC time constant**. Its equal-energy rectangular duration is about 9.53 ns. Yageo's applicable **D/F-tolerance continuous-pulse graph, Fig. 7-3**, starts at 1 µs. Do not extrapolate that graph into a nanosecond pulse approval, confuse it with the J/K/M curve, or treat the average wattage rating as a repetitive-pulse guarantee. Actual edge rate, parasitics, ringing, resistor temperature and pulse behavior must be assessed.

The TVS's 19.9 V specification at 20.1 A does not establish the actual converter clamp voltage. Demonstrate SW–VIN ≤17.5 V including uncertainty, SW <60 V target, and the independent RFB voltage/current limits. Measure clamp repetitive energy and temperatures as well.

## Acceptance before release

Use suitably low-capacitance, deskewed differential probing across R6 and compute average loss from `mean(v_R6(t)² / R6)` over representative active and burst periods. Verify that probe loading has not materially changed the ringing. Record local ambient and body temperature separately and apply the manufacturer's derated rating with an agreed margin. Obtain applicable repetitive-pulse evidence or select/qualify a more suitable resistor if necessary. Do not infer temperature from this electrical calculation.

Measure across input/load/temperature, startup, no-load bursts, overload and short-circuit recovery. Tune ringing to the controller's requirements (ADI calls for leakage-spike ringing shorter than 250 ns). Any increase to C6, change to D4 or failure to meet thermal/pulse limits requires renewed sizing and potentially a resistor/layout redesign. The existing 680 pF and 1 nF alternatives are not approved.

[Machine-readable calculation and source hashes](evidence/audit/snubber-checks.json) · [Prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md)

Sources checked October 9, 2026: [ADI LT8302 Rev. G, pp. 2, 16–17](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf), [Yageo SR V14, pp. 3, 6, 8](https://www.yageogroup.com/content/Resource%20Library/Datasheet/PYU-SR_20105_ROHS_L.pdf), [Diodes SMAJ](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf).
