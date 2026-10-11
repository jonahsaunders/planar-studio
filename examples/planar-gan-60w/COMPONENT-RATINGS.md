# Component ratings audit (A11)

A11 retains the part identities and circuit values while repairing footprints, placement and pours. The transformer DC-loss model now uses 70 µm outer and 61 µm inner copper from the specified 1.655 mm JLC construction. The electrical qualification findings below remain open.

**The audit is complete; the hardware is not qualified for full-power operation.**
Every one of the 82 schematic references is covered: 75 purchased placements,
the planar transformer and six PCB test pads. Mechanical holes, fiducials and
core fit are covered by the separate mechanical review. No unqualified part
is hidden behind an overall “all passed” label.

[Reference-by-reference table](sourcing/Component-ratings-audit.csv) ·
[Calculations, assumptions and source links](evidence/component-ratings-audit.json) ·
[Exact procurement BOM](sourcing/Electronics-BOM-review.csv)

## Review envelope

46–50 V input; 12 V / 5 A target; 14.2 V output review ceiling; 50 °C ambient
and 85 °C local passive-temperature assumptions. These temperatures and the
output ceiling are design screens, not tested operating ratings or guaranteed
OVP clamps. The tank screen uses 4 Arms and 119–400 kHz. Fault/startup currents
are not assumed to obey that envelope. Resistor power is derated above 70 °C.

## Corrections made in the native design

| Reference | Previous | Revised | Reason |
| --- | --- | --- | --- |
| F1 | 2 A / 63 V SF-1206F200-2 | **3 A / 65 V SF-1206F300M-2, C3177336** | At 60 W, 46 V, assumed 85% efficiency plus bias allowance, input current is 1.585 A. New fuse gives a 2.04 A continuous design allowance after an 85 °C temperature factor and 125% sizing factor. Interrupt and inrush coordination remain open. |
| C17 | 10 nF / 50 V | **10 nF / 100 V CC0603KRX7R0BB103, C107059** | Adds startup/transient headroom. C17 blocks DC and normally sees about VIN/2, not the entire tank AC voltage; steady operation alone did not prove the old part overvolted. |
| R20, R25 | 1.5 kΩ, 0603, 100 mW | **1.5 kΩ, high-power 0603 Panasonic ERJPA3F1501V, C543357** | Conservative 250 mW catalog rating gives 205.9 mW at 85 °C versus 135.8 mW with the full 14.2 V across the resistor: 34% margin. No minimum LED or saturated-shunt voltage is assumed; the old 100 mW part fails this screen. |
| R8 | 15 kΩ | **24.9 kΩ RC0603FR-0724K9L, C137761** | Reduce predicted false overcurrent shutdown at full load. Changing the protection threshold requires bench verification. |

[Bourns fuse data](https://wmsc.lcsc.com/wmsc/upload/file/pdf/v2/lcsc/2401291221_BOURNS-SF-1206F300M-2_C3177336.pdf),
[Bourns sizing guidance](https://www.bourns.com/docs/technical-documents/technical-library/singlfuse/SF0808_SinglFuse_FAQ.pdf),
[Yageo C17 specification](https://yageogroup.com/download/specsheet/CC0603KRX7R0BB103),
[Panasonic high-power resistor data](https://api.pim.na.industrial.panasonic.com/file_stream/main/fileversion/1088).
Only 28 pieces of the new fuse were in the checked catalog snapshot; this is
not reserved inventory. The similarly named 3 A **32 V** fuse is unsuitable.

## Calculated checks

81 full-load first-harmonic corners cover three input voltages, Lr ±20%,
Cr ±5% and the assumed Lm ±20%. Maximum calculated primary current is
**3.503 Arms**, above the old 3.25 A winding-loss assumption. At the 4 Arms
thermal screen, DC winding loss is **3.87 W at 80 °C**, before core and AC
copper losses. The unchanged copper geometry therefore remains a thermal
release hold, even though the 0.191 T flux screen (28.4 V primary at 119 kHz) is below N87's 0.39 T
100 °C material test point. Saturation margin does not imply low core loss.
[TDK material data](https://www.tdk-electronics.tdk.com/download/528882/18bc7459c2ccebbfdc3a7d5cb4cdbda9/pdf-n87.pdf)

The worst calculated full-load resonant-capacitor AC peak is 25.31 V. A
time-stepped diode/RC sensing model predicts OC peaks of **1.275 V before**
and **0.779 V after** the R8 change, compared with the controller's **0.9 V
minimum** trip threshold. The model includes resistor tolerances and reduced
C18 capacitance; halving the timestep changes the result by less than 2 mV.
It uses a sine source and constant diode drop, not a switched power-stage
model. [UCC25600 limits](https://www.ti.com/lit/ds/symlink/ucc25600.pdf)

L1 is screened at 4 Arms / 5.66 A peak against its 5 A RMS / 8 A saturation
figures. Q1/Q2 see 3.93 Arms / 7.85 A peak in the ideal rectified sine model,
and 28.4 V off-state at the review output ceiling before ringing. Gate drive
is screened against ±20 V limits. The 5 V LDO's 25 mA budget gives about
0.195 W dissipation and an 83 °C junction estimate at 50 °C ambient using the
datasheet fixture's thermal resistance; actual-board temperature is unknown.
[Bourns L1](https://www.bourns.com/docs/Product-Datasheets/SRP5030T.pdf),
[TI rectifiers](https://www.ti.com/lit/ds/symlink/csd18543q3a.pdf),
[TI LDO](https://www.ti.com/lit/ds/symlink/tps7a24.pdf).

## Release holds and conditional margins

1. **Current protection is frequency dependent.** It senses resonant-capacitor
   voltage, not instantaneous switch current. A high-frequency fault may reach
   magnetic saturation before OC trips. Establish startup/short-circuit stress
   bounds and suitable fast protection before applying rated power. The fuse
   is not semiconductor protection.
2. **Input transients are unbounded.** D1's 87.1 V specified clamp leaves only
   2.9 V below the GaN's 90 V recommended input limit, before wiring overshoot.
   No surge source impedance or energy has been specified. Check TVS temperature,
   pulse energy, fuse interrupt rating and clamp coordination together.
   [TVS data](https://www.diodes.com/assets/Datasheets/ds19002.pdf),
   [GaN limits](https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf).
3. **Capacitor voltage rating is not ripple qualification.** C7/C8 can each carry
   2.1 Arms in the screen; the output bank carries about 2.42 Arms ripple total.
   Verify actual sharing, ESR and self-heating. Exact effective capacitance at
   bias and temperature has not been established for every X7R part, including
   output storage and regulator bypasses. The audit marks these conditional.
4. **Bias and control margins need measurements.** U2's low-end bias screen is
   only about 11.54 V against 11.5 V recommended minimum. Verify startup droop,
   ripple, GaN VCC/boot voltage, drain ringing and negative sense-pin injection.
   Check optocoupler CTR/ageing, TL431 stability, OVP overshoot, no-load operation
   and rectifier timing. The 14.2 V screen is not a proven transient clamp.
5. **Thermal and manufacturing release remain open.** Measure transformer,
   inductor, semiconductor, resistor and capacitor temperatures. JLCPCB must
   accept the actual eight-layer heavy-copper stack, filled/capped vias, mixed
   assembly and placement rotations. DigiKey core installation is a separate
   operation until agreed. Functional isolation only; no safety-isolation claim.

The source-linked CSV gives voltage, current and power limits where applicable,
the modeled stresses, temperature assumptions, and the remaining checks for
each reference. Blank current/power ratings for capacitors are deliberate;
inventing a generic watt or amp rating would hide the missing ripple evidence.
