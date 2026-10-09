# First-article verification — proposed acceptance plan

No hardware tests below have been performed. Results must be recorded per unit. Start with one inspected unit; do not apply unrestricted input power to an unverified assembly.

## Before power

1. Confirm all 24 electronic references, U1 variant, diode polarity, C3/C7/C8 polarity and connector labels against the assembly drawing. Confirm the factory-gapped core report and physical seating.
2. Verify primary and secondary winding continuity and absence of primary-to-secondary continuity with a meter. T1 internal pin 5 connects the two primary sections; it is intentionally not an external circuit connection.
3. On the first-article magnetic coupon or appropriately isolated unpowered board, measure primary Lm with secondary open: provisional 11.0–14.6 µH. Record frequency, excitation voltage, bias and temperature. Measure leakage with the secondary shorted; the A5 default-stack model's 0.1018 µH is an estimate, not an acceptance threshold. Record the delivered stack dimensions and use the measurement to retune the clamp/snubber.
4. Check winding ratio and dot polarity with a low-amplitude isolated AC source. Primary:secondary is 2:1; primary pin 1 and secondary pin 3 are corresponding dots. Record parallel-secondary current sharing if accessible.
5. Inspect for damaged solder mask, laminate/copper in slots, cracks and exposed copper touching the core. Verify connector wire entry faces outward. Record post-installation inductance and retention inspection.

## Controlled first power

Use an isolated bench DC supply, electronic load, DMM, current probe, and appropriately rated differential oscilloscope probes. Keep PGND and GND_ISO separate; ordinary earth-referenced probe grounds can defeat the isolation. Probe SW relative to PGND and output relative to GND_ISO.

The current layout provides top-exposed PGND and ISO GND probe lands at native KiCad coordinates (92.40, 62.65) and (108.20, 114.00) mm. Use T1 pad 1 for VIN, T1 pad 2 or U1 pin 5 for SW, C5 pad 1 for INTVCC, and C4 pad 1/J2 pin 1 for local/delivered output. Use a short probe return; the nearby PGND land is about 2.44 mm from U1 pin 5. These are two ground lands plus existing component pads, not six installed test points. See [probe map](../evidence/audit/probe-sites.json). Repeat output trim and switching-stress measurements after the routing revision.

Begin with a controlled 0-to-18 V ramp of at least 10 ms, no external load and a 0.15 A input limit. Use the same minimum ramp duration at 24/36 V. R8/C7 damping is not hot-plug protection; confirm VIN remains below 42 V. Abrupt connection requires a separate pulse/source-impedance qualification before it is attempted. Observe startup/output before increasing current limit. If limiting persists, shut down and investigate rather than increasing it blindly. For full-load testing, use up to 0.6 A input limit, with fuse F1 populated. Never apply mains directly.

| Test | Conditions | Provisional acceptance / record |
|---|---|---|
| DC regulation | 18, 24, 36 V; external load 0, 0.1, 0.5, 1 A | 4.75–5.25 V after settling; record the 113k/10.7k/127k starting values (4.980 V nominal); coordinate any trim with the reference range, R3/R5 compensation and RFB current budget |
| Ripple | Same grid; short probe loop and 20 MHz bandwidth, then inspect full-bandwidth spikes | ≤100 mV peak-to-peak target; current bulk-only stress estimate is 51.08 mV and is not a pass result |
| Switching stress | All input and temperature corners; startup, full load, light-load bursts, load steps, overload and short-circuit recovery | SW peak below 60 V target, never reaching 65 V rating; differential SW−VIN peak ≤17.5 V including initial overshoot and measurement uncertainty; independently verify RFB voltage remains within VIN−0.5 V to VIN and current below 200 µA absolute limits, including fast capacitive effects; measure diode reverse peak below 30 V target |
| Startup/shutdown | Controlled ramp first at each input voltage; no/full load; qualify abrupt connection separately | Monotonic settling without sustained hiccup; record output overshoot, input inrush and fuse behavior |
| UVLO | Slowly ramp input up and down | Compare measured thresholds to nominal 15.73 / 13.94 V at U1 VIN; input terminal threshold includes D1 drop |
| Load steps | 0.1↔1 A and 0↔1 A | Record recovery time, overshoot and undershoot; review against application's tolerance before release |
| Temperature | 18 and 36 V, 1 A, 0/25/50 °C ambient after equilibrium | Target core ≤85 °C, semiconductor estimated junction <110 °C; verify all component derating; record U1, D1–D4, R6–R8, C3/C7/C8 and winding hotspots; keep C5 below 85 °C and verify its effective capacitance is at least 1 µF |
| Efficiency | 18/24/36 V and 0.1/0.5/1 A | Record input/output power; 75% was a sizing assumption, not a guaranteed specification |
| Overload | Controlled load ramp; brief current-limited output short; verify restart | No sustained overheating or damage; repeat waveform and regulation checks afterward |
| Isolation integrity | Before/after electrical and thermal tests | No primary-to-secondary DC continuity; any dielectric qualification requires a separate insulation specification |
| Assembly reliability | Supplier-defined handling, vibration and thermal cycling appropriate to intended use | No core movement/cracking or significant Lm change; test severity must be agreed before production |

## Clamp, snubber and feedback tuning

Start with SMAJ12A, 39 Ω and 470 pF. Record simultaneous differential SW−VIN and RFB−VIN waveforms using suitably low-capacitance probes and short connections; include bandwidth, deskew, probe loading and uncertainty. Infer resistive current from measured SW−RFB and actual R3, and separately assess parasitic capacitive injection and pin excursions. Passing the 17.5 V envelope alone does not qualify the RFB pin.

Tune from measured ringing and leakage. If SMAJ12A cannot meet the envelope, evaluate SMAJ11A as a candidate only; confirm that its lower threshold does not absorb normal transfer energy (upper reflected estimate 11.7 V before winding drops, versus 12.2 V minimum breakdown plus D3 drop). Check repetitive pulse power and temperature. Keep the SW–D3–D4–VIN loop compact and RFB away from switching-current paths.

The existing snubber estimate is 0.448 W at 470 pF. Scaling gives 0.648 W at 680 pF and 0.953 W at 1 nF; all three are below an 80% allowance on the new 2 W R6 at or below 70 °C, but this average-power screen does not approve either capacitance increase. The fitted 470 pF can approach 0.641 W when the full 53.5 V excursion is included. Any tuning change requires renewed pulse/thermal sizing and measured waveform acceptance. Record ringing, regulation and clamp/snubber temperatures at every tested corner, including no-load bursts and short-circuit recovery.

The [independent A5 snubber review](../SNUBBER-REVIEW.md) reproduces the energy, frequency, ambient-derating and pulse screens. The 0.641 W case uses an uncapped 454.11 kHz worksheet frequency; 380/420 kHz give 0.537/0.593 W with the same 53.5 V transition and +5% C. At 85 °C local ambient, R6 derates to 1.647 W, or 1.318 W with an 80% allowance. Measure R6 voltage and calculate mean(v²/R), verify probe loading, and record local ambient separately from body temperature. The CRH datasheet provides no repetitive nanosecond pulse curve: obtain applicable evidence or qualify the part. Confirm ringing shorter than 250 ns and redesign if thermal or repetitive-pulse acceptance cannot be established.

R4 must remain inside 9.09–11.0 kΩ including applicable tolerance/temperature. Recompute the feedback current budget and compensation ratio after any trim; repeat all relevant waveform, regulation and temperature checks. The 100°C resistor-temperature excursion is a calculation assumption to verify against actual resistor temperature, not a declaration of the product's ambient rating. No fabrication release until the measured envelope, pin limits, regulation and thermal gates pass. See [revision and sources](../FEEDBACK-REVISION.md).

The transient, thermal and assembly reliability criteria need application-level review. EMI/EMC and safety certification have not been specified or performed. Final BOM values, core installation and stack must be frozen only after first-article results and vendor DFM acceptance.

A3–A5 additional gates: verify the installed clip bow and engagement against CORE-ASSEMBLY.md; measure L versus bias/temperature and short-circuit restart because the smaller core has less fault margin. No adhesive cure is part of these revisions.
