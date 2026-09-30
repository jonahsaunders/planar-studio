# Component audit — PS-FLYBACK-5W A1

Reviewed 2026-09-30. All 29 footprints have an explicit package/pin mapping review; 24 are electronic placements. The independent check compares reviewed MPNs, footprints and nets to the actual board, checks package-specific lands and confirms ground-via attachment to filled copper.

The electronic BOM is fully stocked in the [dated sourcing snapshot](JLCPCB-SOURCING.md). This is an engineering prototype: ratings and calculations do not establish measured performance or factory process acceptance.

| Screening calculation | Result | Limitation |
| --- | ---: | --- |
| Nominal output at 0.3 V sampled diode drop | 4.980 V | Requires output and temperature trim |
| RFB resistive current at 17.5 V SW−VIN | 159.85 µA | Excludes capacitive current and pin excursions |
| Snubber loss including +5% capacitance | 0.509 W | 0.75 W R6 rating at 70 °C; measure pulses and temperature |
| R8 loss if all input ripple enters its branch | 0.922 W | 2 W rating needs 300 mm² copper; actual thermal capacity unverified |
| Bulk-only output ripple sizing | 50.58 mV | Boundary estimate; burst/control behavior not represented |

R8 uses Bourns' recommended 2.45 × 3.7 mm lands, centered 5.15 mm apart. The stocked feedback network preserves the original compensation ratio within 1%. All three feedback resistors must change together. [Feedback assumptions](FEEDBACK-REVISION.md).

## Per-component review

Allowable resistor voltage is the smaller of its limiting voltage and √(P·R), with thermal derating. Pulse ratings and average power are separate constraints. Generic 3D models are illustrative envelopes; footprints and datasheets govern assembly.

### C1 — CL32B106KBJNNNE

[Manufacturer/source](https://product.samsungsem.com/mlcc/CL32B106KBJNNN.do) · C_1210_3225Metric

**Rating:** 10 uF +/-10%, 50 V X7R, -55 to 125 C.

**Footprint and pin mapping:** Manufacturer 3.2 x 2.5 mm body matches 1210 (3225 metric), nonpolar lands; maximum height approximately 2.7 mm.

**Use:** Local VIN/U1 and transformer input bypass. 36 V DC is below 50 V. Combined effective capacitance assumed only 4 uF after bias and tolerance; typical manufacturer bias curve is approximately 2.8 uF each at 36 V.

**Remaining validation:** Confirm effective capacitance at voltage/temperature and ripple heating. A typical bias curve is not a guaranteed minimum. Keep actual VIN transients below the controller 42 V limit.

### C2 — CL32B106KBJNNNE

[Manufacturer/source](https://product.samsungsem.com/mlcc/CL32B106KBJNNN.do) · C_1210_3225Metric

**Rating:** 10 uF +/-10%, 50 V X7R, -55 to 125 C.

**Footprint and pin mapping:** Manufacturer 3.2 x 2.5 mm body matches 1210 (3225 metric), nonpolar lands; maximum height approximately 2.7 mm.

**Use:** Local VIN/U1 and transformer input bypass. 36 V DC is below 50 V. Combined effective capacitance assumed only 4 uF after bias and tolerance; typical manufacturer bias curve is approximately 2.8 uF each at 36 V.

**Remaining validation:** Confirm effective capacitance at voltage/temperature and ripple heating. A typical bias curve is not a guaranteed minimum. Keep actual VIN transients below the controller 42 V limit.

### C3 — 16SVPF180M

[Manufacturer/source](https://industrial.panasonic.com/ww/products/pt/os-con/models/16SVPF180M) · CP_Panasonic_C6

**Rating:** 180 uF +/-20%, 16 V polymer; 22 milliohm max ESR and 3.3 A ripple at 100 kHz; -55 to 105 C.

**Footprint and pin mapping:** Panasonic C6 case: 6.3 mm diameter x 5.9 mm. Custom lands 3.5 x 1.6 mm, centers +/-2.8 mm, 2.1 mm gap; match manufacturer recommended land drawing. Pad 1 is positive.

**Use:** Parallel output reservoirs: 360 uF nominal, 288 uF at -20%, 11 milliohm parallel ESR. 5.25 V maximum regulated target and 1.865 A total conservative capacitor RMS bound fit each part rating.

**Remaining validation:** Measure burst ripple, current sharing, startup/inrush and load-step response. ESR bound is specified at 100 kHz, not at every frequency or temperature.

### C4 — CL32B226KOJNNNE

[Manufacturer/source](https://product.samsungsem.com/mlcc/CL32B226KOJNNN.do) · C_1210_3225Metric

**Rating:** 22 uF +/-10%, 16 V X7R; -55 to 125 C.

**Footprint and pin mapping:** Current Samsung manufacturer listing; 3.2 x 2.5 mm 1210 body. Same nonpolar footprint as the previous part; replaces an inadequately supported old selection.

**Use:** Local rectifier/output high-frequency bypass. 5.25 V below 16 V; deliberately not credited in conservative output-capacity/ripple calculation.

**Remaining validation:** Confirm effective capacitance and temperature under ripple; verify procurement for this exact suffix.

### C5 — GRM188R61C475KE11D

[Manufacturer/source](https://www.murata.com/products/productdetail?partno=GRM188R61C475KE11%23) · C_0603_1608Metric

**Rating:** 4.7 uF +/-10%, 16 V DC, X5R (+/-15%, -55 to 85 C).

**Footprint and pin mapping:** Murata product dimensions: 1.6 x 0.8 x 0.8 mm nominal, +/-0.15 mm; retained 0603 lands; nonpolar. Generic model is an illustrative package envelope.

**Use:** 0603 bypass at about 3.1 V. Manufacturer typical DC-bias plot retains over 60% at 4 V; even 10% tolerance and 15% temperature allowance leave over 2 uF. Require >=1 uF effective on hardware; aging and actual bias/temperature behavior are not guaranteed by typical curves.

**Remaining validation:** Require >=1 uF effective at about 3.1 V across temperature and aging, verify INTVCC stability and temperature; typical DC-bias curves are not minimum guarantees.

### C6 — CC0805JRNPO0BN471

[Manufacturer/source](https://www.yageogroup.com/download/specsheet/CC0805JRNPO0BN471) · C_0805_2012Metric

**Rating:** 470 pF +/-5%, 100 V DC, C0G/NP0; -55 to 125 C.

**Footprint and pin mapping:** Yageo exact specification: 2.0 x 1.25 x 0.6 mm nominal; retained 0805 lands and generic model; nonpolar.

**Use:** Stocked 0805, 470 pF +/-5%, C0G, 100 V; above the 60 V absolute-to-ground prototype SW envelope. Retains the original damping capacitance; tune ringing on hardware.

**Remaining validation:** Measure snubber waveform, capacitor pulse current and resistor temperature after tuning; no automatic approval for increasing capacitance.

### C7 — EEHZC1J470P

[Manufacturer/source](https://industrial.panasonic.com/ww/products/pt/hybrid-aluminum/models/EEHZC1J470P) · CP_Elec_8x10.5

**Rating:** 47 uF +/-20%, 63 V hybrid; 40 milliohm max ESR; 1.1 A ripple at 100 kHz/125 C; -55 to 125 C.

**Footprint and pin mapping:** Manufacturer 8 mm diameter x 10.2 +/-0.3 mm body uses polarized 8 mm electrolytic lands. 10.5 mm stock model is the maximum-height envelope, not a different capacitor. Pad 1 positive; square/chamfer polarity marks verified.

**Use:** Input reservoir in VIN -> R8 -> C7 -> PGND shunt branch; 36 V and full converter capacitor-ripple bound approximately 0.63 A are below ratings.

**Remaining validation:** This is not a surge clamp. Validate cable/source impedance, hot-plug, ESR over temperature and ripple heating; begin with controlled input ramp.

### C8 — 16SVPF180M

[Manufacturer/source](https://industrial.panasonic.com/ww/products/pt/os-con/models/16SVPF180M) · CP_Panasonic_C6

**Rating:** 180 uF +/-20%, 16 V polymer; 22 milliohm max ESR and 3.3 A ripple at 100 kHz; -55 to 105 C.

**Footprint and pin mapping:** Panasonic C6 case: 6.3 mm diameter x 5.9 mm. Custom lands 3.5 x 1.6 mm, centers +/-2.8 mm, 2.1 mm gap; match manufacturer recommended land drawing. Pad 1 is positive.

**Use:** Parallel output reservoirs: 360 uF nominal, 288 uF at -20%, 11 milliohm parallel ESR. 5.25 V maximum regulated target and 1.865 A total conservative capacitor RMS bound fit each part rating.

**Remaining validation:** Measure burst ripple, current sharing, startup/inrush and load-step response. ESR bound is specified at 100 kHz, not at every frequency or temperature.

### D1 — DFLS1100-7

[Manufacturer/source](https://www.diodes.com/datasheet/download/DFLS1100.pdf) · D_PowerDI-123

**Rating:** 100 V reverse; 1 A average, 0.8 A after 20% capacitive-load derating; 50 A nonrepetitive 8.3 ms surge.

**Footprint and pin mapping:** PowerDI123 asymmetric lands: large pad 1 is cathode, small pad 2 anode. Replaces the insufficiently traceable SS110 selection and its SMA footprint.

**Use:** Series input reverse-polarity protection; approximately 0.40 A forward and at most 72 V conservative reverse with a charged 36 V reservoir and -36 V input.

**Remaining validation:** Measure temperature and inrush. Datasheet thermal resistance assumes its stated copper/test conditions, not this six-layer board.

### D2 — PDS835L-13

[Manufacturer/source](https://www.diodes.com/datasheet/download/PDS835L.pdf) · D_PowerDI-5

**Rating:** 35 V reverse, 8 A average under datasheet thermal conditions.

**Footprint and pin mapping:** Manufacturer PowerDI5 drawing: large cathode pad 1 and two physical anode pads numbered 2. Custom copper matches 4.86 x 3.36 mm cathode and 1.40 x 1.39 mm anode lands.

**Use:** Secondary rectifier. Worst ideal reverse is 23.25 V before overshoot; average full-load approximately 1.023 A including preload. Conservative 6.48 A fault-average screening value is below 8 A.

**Remaining validation:** Measure reverse spikes <30 V prototype target and junction temperature. 8 A catalog rating and transient surge numbers are not unconditional PCB thermal/fault qualification.

### D3 — DFLS1100-7

[Manufacturer/source](https://www.diodes.com/datasheet/download/DFLS1100.pdf) · D_PowerDI-123

**Rating:** 100 V reverse, 1 A average, 2 A RMS under stated conditions; 50 A nonrepetitive surge.

**Footprint and pin mapping:** PowerDI123 cathode pad 1 faces CLAMP; anode pad 2 faces SW. Asymmetric package/pad mapping checked against the exact Diodes drawing.

**Use:** Steers leakage current into the TVS only while SW exceeds VIN plus clamp voltage; primary full-load peak approximately 2.065 A is a brief pulse, not continuous average current.

**Remaining validation:** Measure clamp pulse width, average/RMS current and junction temperature with measured leakage inductance. Surge rating must not be used as repetitive-current permission.

### D4 — SMAJ12A-13-F

[Manufacturer/source](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf) · D_SMA

**Rating:** 12 V standoff, 13.3-14.7 V breakdown, 19.9 V clamp at 20.1 A / 10-1000 us; 400 W pulse rating.

**Footprint and pin mapping:** Unidirectional SMA / DO-214AC. Cathode pad 1 CLAMP, anode pad 2 VIN. The A suffix matters; bidirectional CA is not the reviewed substitution.

**Use:** Replaces 13 V TVS to reduce rating-based SW clamp from 58.5 to 56.9 V at VIN=36 V including 1 V D3. Ideal reflected plateau <=11.7 V remains below 12 V standoff.

**Remaining validation:** Retain SMAJ12A for initial prototype tuning. Its 19.9 V clamp rating at 20.1 A does not establish converter pulse voltage. Require measured SW-VIN peak <=17.5 V including overshoot/uncertainty, verify RFB pin voltage/current and temperature; SMAJ11A is only a bench candidate.

### F1 — SF-1206F100-2

[Manufacturer/source](https://www.bourns.com/docs/product-datasheets/sf-1206f.pdf) · Fuse_Bourns_SF1206F

**Rating:** 1 A, 63 V DC fast; 50 A interrupt at 63 V DC; typical cold resistance 0.132 ohm +/-25%; typical melting I2t 0.034 A2s at 10 times rated current; -20 to 105 C.

**Footprint and pin mapping:** Bourns Rev J p2: 3.10 x 1.55 x 0.60 mm nominal package. Two 1.25 x 1.65 mm rectangular lands, centers +/-1.725 mm: 4.70 mm outside span and 2.20 mm gap. Official series STEP normalized to seating plane; model height includes 0.005 mm surface detail.

**Use:** 36 V maximum input below 63 V DC rating. Approximately 0.40 A average load versus roughly 0.93 A at 70 C from manufacturer derating curve (graph estimate, before additional application margin). At 0.40 A, typical cold loss is 21 mW. Switching RMS and self-heating require measurement.

**Remaining validation:** New I2t is lower than old 0.0423 A2s value: repeat startup/inrush and time-current coordination; no hot-plug qualification. Fault current must not exceed 50 A. Reflow recommendation 245-250 C peak, 5 s; >=230 C for 30 +/-10 s. Obtain accepted profile; default Economic 255 +/-5 C is unsuitable and Standard 240 +/-5 C is not automatic approval. No guaranteed semiconductor protection.

### H1 — M3 mounting interface

[Manufacturer/source](https://github.com/American-Embedded/American_Embedded_KiCad_Repository/blob/7be291853536e19f0d0d548c2ed3ca6811bdc540/packages/library/american-embedded-library/footprints/amemb-MountingHole.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod) · MountingHole_3.2mm_M3_ExposedSubstrate_Edge

**Rating:** M3 clearance: 3.2 mm NPTH, 6.4 mm exposed-substrate diameter plus outward extension; 6.8 mm circular copper keepout.

**Footprint and pin mapping:** Exact American Embedded Edge footprint at commit 7be2918; H1/H3 rotated 180 degrees, H2/H4 0 degrees; 41 x 95 mm hole pattern; centers 4.5 mm from adjacent board edges. No electrical pad/net.

**Use:** Mechanical support, excluded from electronic BOM/CPL. Provisional nonconductive M3 hardware uses 8 mm standoffs for underside core clearance.

**Remaining validation:** Select actual screws/standoffs and qualify contact diameter, enclosure clearances and torque; 3D fasteners are illustrative envelopes.

### H2 — M3 mounting interface

[Manufacturer/source](https://github.com/American-Embedded/American_Embedded_KiCad_Repository/blob/7be291853536e19f0d0d548c2ed3ca6811bdc540/packages/library/american-embedded-library/footprints/amemb-MountingHole.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod) · MountingHole_3.2mm_M3_ExposedSubstrate_Edge

**Rating:** M3 clearance: 3.2 mm NPTH, 6.4 mm exposed-substrate diameter plus outward extension; 6.8 mm circular copper keepout.

**Footprint and pin mapping:** Exact American Embedded Edge footprint at commit 7be2918; H1/H3 rotated 180 degrees, H2/H4 0 degrees; 41 x 95 mm hole pattern; centers 4.5 mm from adjacent board edges. No electrical pad/net.

**Use:** Mechanical support, excluded from electronic BOM/CPL. Provisional nonconductive M3 hardware uses 8 mm standoffs for underside core clearance.

**Remaining validation:** Select actual screws/standoffs and qualify contact diameter, enclosure clearances and torque; 3D fasteners are illustrative envelopes.

### H3 — M3 mounting interface

[Manufacturer/source](https://github.com/American-Embedded/American_Embedded_KiCad_Repository/blob/7be291853536e19f0d0d548c2ed3ca6811bdc540/packages/library/american-embedded-library/footprints/amemb-MountingHole.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod) · MountingHole_3.2mm_M3_ExposedSubstrate_Edge

**Rating:** M3 clearance: 3.2 mm NPTH, 6.4 mm exposed-substrate diameter plus outward extension; 6.8 mm circular copper keepout.

**Footprint and pin mapping:** Exact American Embedded Edge footprint at commit 7be2918; H1/H3 rotated 180 degrees, H2/H4 0 degrees; 41 x 95 mm hole pattern; centers 4.5 mm from adjacent board edges. No electrical pad/net.

**Use:** Mechanical support, excluded from electronic BOM/CPL. Provisional nonconductive M3 hardware uses 8 mm standoffs for underside core clearance.

**Remaining validation:** Select actual screws/standoffs and qualify contact diameter, enclosure clearances and torque; 3D fasteners are illustrative envelopes.

### H4 — M3 mounting interface

[Manufacturer/source](https://github.com/American-Embedded/American_Embedded_KiCad_Repository/blob/7be291853536e19f0d0d548c2ed3ca6811bdc540/packages/library/american-embedded-library/footprints/amemb-MountingHole.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod) · MountingHole_3.2mm_M3_ExposedSubstrate_Edge

**Rating:** M3 clearance: 3.2 mm NPTH, 6.4 mm exposed-substrate diameter plus outward extension; 6.8 mm circular copper keepout.

**Footprint and pin mapping:** Exact American Embedded Edge footprint at commit 7be2918; H1/H3 rotated 180 degrees, H2/H4 0 degrees; 41 x 95 mm hole pattern; centers 4.5 mm from adjacent board edges. No electrical pad/net.

**Use:** Mechanical support, excluded from electronic BOM/CPL. Provisional nonconductive M3 hardware uses 8 mm standoffs for underside core clearance.

**Remaining validation:** Select actual screws/standoffs and qualify contact diameter, enclosure clearances and torque; 3D fasteners are illustrative envelopes.

### J1 — KF301-5.0-2P

[Manufacturer/source](https://www.cxkefa.com/kf301-50) · Terminal_KF301_2P_5.00

**Rating:** 300 V; use conservative 10 A rating (approval-dependent); -30 to 120 C; 22-14 AWG.

**Footprint and pin mapping:** Manufacturer drawing: 5.00 mm pitch, 1.00 mm round leads, recommended 1.30 mm holes. Actual 5.00 mm pitch / 1.30 mm drills / 2.40 mm lands. Pin 1 positive, pin 2 return; wire entries face outward.

**Use:** 36 V input at approximately 0.40 A or 5 V output at 1 A is within electrical ratings.

**Remaining validation:** Qualify wire range, solder fill, 0.4 Nm screw torque, tool access and manual assembly.

### J2 — KF301-5.0-2P

[Manufacturer/source](https://www.cxkefa.com/kf301-50) · Terminal_KF301_2P_5.00

**Rating:** 300 V; use conservative 10 A rating (approval-dependent); -30 to 120 C; 22-14 AWG.

**Footprint and pin mapping:** Manufacturer drawing: 5.00 mm pitch, 1.00 mm round leads, recommended 1.30 mm holes. Actual 5.00 mm pitch / 1.30 mm drills / 2.40 mm lands. Pin 1 positive, pin 2 return; wire entries face outward.

**Use:** 36 V input at approximately 0.40 A or 5 V output at 1 A is within electrical ratings.

**Remaining validation:** Qualify wire range, solder fill, 0.4 Nm screw torque, tool access and manual assembly.

### R1 — RC0603FR-07649KL

[Manufacturer/source](https://www.yageogroup.com/component-documentation/download/specsheet/RC0603FR-07649KL) · R_0603_1608Metric

**Rating:** 649 kohm +/-1%, 0.1 W at 70 C, 75 V limiting element voltage.

**Footprint and pin mapping:** 0603 / 1.6 x 0.8 mm resistor lands; no polarity.

**Use:** Upper UVLO divider. Reduced from 681 kohm: 17.55 V connector startup screening corner, including resistor/threshold/current limits and 1 V diode drop. At 42 V, less than 2.8 mW even assigning full voltage to R1.

**Remaining validation:** UVLO hysteresis is only typical in the datasheet: verify startup at 18 V, full load and 0-50 C; this calculation is not a guaranteed production corner.

### R2 — RC0603FR-0761K9L

[Manufacturer/source](https://www.yageogroup.com/component-documentation/download/specsheet/RC0603FR-0761K9L) · R_0603_1608Metric

**Rating:** 61.9 kohm +/-1%, 0.1 W at 70 C, 75 V limiting element voltage.

**Footprint and pin mapping:** 0603 / 1.6 x 0.8 mm resistor lands; no polarity.

**Use:** Lower UVLO divider. Under 3.7 V and 0.23 mW for VIN <=42 V. Nominal UVLO after D1 is 15.73 V rising / 13.94 V falling with R1.

**Remaining validation:** Verify startup threshold/hysteresis and resistor substitution tolerances with R1.

### R3 — RT0603BRD07113KL

[Manufacturer/source](https://yageogroup.com/content/datasheet/asset/file/PYU-RT_1-TO-0-01_ROHS_L) · R_0603_1608Metric

**Rating:** 113k 0.1%, 25 ppm/C, thin film; 0.1 W at 70 C; 75 V limiting voltage. Apply the smaller of 75 V and sqrt(P*R).

**Footprint and pin mapping:** Yageo RT0603 series: 1.6 x 0.8 x 0.45 mm nominal body; two interchangeable terminals on retained KiCad 0603 lands.

**Use:** Coordinated stocked 113k/10.7k/127k selection; 0.1%, 25 ppm/C. Nominal 4.980 V; >=20% preliminary resistive margin at 17.5 V differential peak. Temperature-compensation ratio changes by -0.95%; output and temperature trim remain required.

**Remaining validation:** Confirm 17.5 V SW-VIN peak including overshoot and measurement uncertainty, RFB pin voltage/current, output trim and temperature compensation.

### R4 — RT0603BRD0710K7L

[Manufacturer/source](https://yageogroup.com/content/datasheet/asset/file/PYU-RT_1-TO-0-01_ROHS_L) · R_0603_1608Metric

**Rating:** 10.7k 0.1%, 25 ppm/C, thin film; 0.1 W at 70 C; 75 V limiting voltage. Apply the smaller of 75 V and sqrt(P*R).

**Footprint and pin mapping:** Yageo RT0603 series: 1.6 x 0.8 x 0.45 mm nominal body; two interchangeable terminals on retained KiCad 0603 lands.

**Use:** Coordinated stocked 113k/10.7k/127k selection; 0.1%, 25 ppm/C. Nominal 4.980 V; >=20% preliminary resistive margin at 17.5 V differential peak. Temperature-compensation ratio changes by -0.95%; output and temperature trim remain required.

**Remaining validation:** Confirm 17.5 V SW-VIN peak including overshoot and measurement uncertainty, RFB pin voltage/current, output trim and temperature compensation.

### R5 — RT0603BRD07127KL

[Manufacturer/source](https://yageogroup.com/content/datasheet/asset/file/PYU-RT_1-TO-0-01_ROHS_L) · R_0603_1608Metric

**Rating:** 127k 0.1%, 25 ppm/C, thin film; 0.1 W at 70 C; 75 V limiting voltage. Apply the smaller of 75 V and sqrt(P*R).

**Footprint and pin mapping:** Yageo RT0603 series: 1.6 x 0.8 x 0.45 mm nominal body; two interchangeable terminals on retained KiCad 0603 lands.

**Use:** Coordinated stocked 113k/10.7k/127k selection; 0.1%, 25 ppm/C. Nominal 4.980 V; >=20% preliminary resistive margin at 17.5 V differential peak. Temperature-compensation ratio changes by -0.95%; output and temperature trim remain required.

**Remaining validation:** Confirm 17.5 V SW-VIN peak including overshoot and measurement uncertainty, RFB pin voltage/current, output trim and temperature compensation.

### R6 — SR1206FR-7T39RL

[Manufacturer/source](https://www.yageogroup.com/content/Resource%20Library/Datasheet/PYU-SR_20105_ROHS_L.pdf) · R_1206_3216Metric

**Rating:** 39 ohm +/-1%, 100 ppm/C; SR1206 7T = 0.75 W at 70 C, linear derating to zero at 155 C. Continuous-pulse curve applies in addition to average power.

**Footprint and pin mapping:** 3.1 x 1.6 x 0.55 mm body; retained 1206 land pattern and generic 3D envelope; interchangeable terminals.

**Use:** SR1206 7T three-times-power surge resistor: 0.75 W at 70 C, not ordinary 0.25 W RC1206. Continuous pulse curve and average heating both apply; verify body temperature and measured ringing.

**Remaining validation:** Verify measured repetitive pulse/average power and body temperature; 680 pF or 1 nF are not approved substitutions. Tune from 39 ohm/470 pF.

### R7 — RC1206FR-07220RL

[Manufacturer/source](https://www.yageogroup.com/component-documentation/download/specsheet/RC1206FR-07220RL) · R_1206_3216Metric

**Rating:** 220 ohm +/-1%, 0.25 W at 70 C, 200 V limiting element voltage.

**Footprint and pin mapping:** 1206 / 3.2 x 1.6 mm resistor lands; no polarity.

**Use:** Minimum-load resistor. Worst 0.12655 W at 5.25 V / -1% resistance; minimum 21.38 mA at 4.75 V exceeds estimated 19.87 mA minimum-energy load requirement.

**Remaining validation:** Verify no-load burst ripple and temperature; derate above 70 C. Minimum switching timing/hysteresis assumptions need hardware confirmation.

### R8 — CRM2512-JW-2R2ELF

[Manufacturer/source](https://www.bourns.com/docs/product-datasheets/crm.pdf) · R_Bourns_CRM2512

**Rating:** 2.2 ohm +/-5%, 200 ppm/C; 2 W at 70 C only with 300 mm2 total pad/trace area, derate above 70 C; single-pulse curve for >=1 ohm applies.

**Footprint and pin mapping:** Bourns CRM Rev 08/21 p2: nominal 6.3 x 3.1 x 0.6 mm. Recommended 2.45 x 3.7 mm lands, centers +/-2.575 mm, outside span 7.6 mm. New local footprint follows these lands; nonpolar.

**Use:** Pulse-rated CRM2512 with manufacturer-recommended lands. 2 W at 70 C requires 300 mm2 combined pad/trace area; do not assume full rating on this board. Shunt damping branch only. Controlled input ramp first; board temperature and hard-step pulse qualification remain open.

**Remaining validation:** Measure R8 temperature at maximum ripple and ambient; 2 W rating is conditional on test copper. Qualify pulse stress for abrupt input separately. Obtain a compatible assembly profile including the CRM recommendation and F1/C3/C8 limits.

### T1 — PS-MAG-001 A0

[Manufacturer/source](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_32_6_20.pdf) · Planar_EELP32_4T_2T

**Rating:** Prepared TDK N87 EELP32 pair, nominal 0.21 mm center-only gap; 4:2 turns; nominal primary 11.95 uH, acceptance 10.16-13.74 uH.

**Footprint and pin mapping:** Custom integral winding footprint, five 0.40 mm plated interlayer holes. Two primary layers series, two secondary layers parallel. Primary dot pad 1, secondary dot pad 3 (GND_ISO), pad 5 internal series connection.

**Use:** Flyback energy-storage transformer, not an ungapped signal transformer. Estimated flux 0.145 T at 5.4 A and L+15%; typical 7.2 A overcurrent-restart value gives 0.193 T.

**Remaining validation:** Custom magnetic assembly remains unqualified: measure L versus DC bias/temperature, leakage, core/fringing/AC losses, gap tolerance and retention. Functional low-voltage isolation only; no safety rating.

### U1 — LT8302IS8E#PBF

[Manufacturer/source](https://www.analog.com/en/products/lt8302.html) · SOIC8_EP_LT_S8E

**Rating:** LT8302 (not -3), I grade guaranteed -40 to 125 C junction range; VIN abs max 42 V, SW abs max 65 V; 3.6 A minimum / 5.4 A maximum peak-current limit. Industrial LT8302I specification is guaranteed from -40 to 125 C junction; absolute maximum junction temperature is not an operating target.

**Footprint and pin mapping:** ADI S8E exposed-pad SOIC8: 1.27 mm lead pitch; lands 1.143 x 0.760 mm, EP 2.26 x 2.99 mm; four paste windows and four filled/capped EP vias. Nine electrical pad numbers including EP.

**Use:** Industrial grade, same S8E package and pinout as LT8302E; guaranteed -40 to 125 C junction specification. Exact stocked normal LT8302, not LT8302-3.

**Remaining validation:** No mains use. Measure temperature (<110 C junction target), VIN<42 V, SW<60 V and RFB current<200 uA including transients. Validate startup, burst, stability, overload and output trim.

## Release conditions

The [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md) covers clamp/RFB waveforms, startup, full/light load, faults, temperature, magnetics and regulation. Require SW−VIN ≤17.5 V including uncertainty, SW <60 V and VIN <42 V. Controlled input ramp is the initial condition; abrupt hot-plug remains unqualified.

Raw DigiKey cores need center-leg preparation, retention and installation after soldering. Adhesive, strap and illustrative mounting hardware need process/mechanical qualification; none establishes a safety-isolation rating. The six-layer stack, slots, panel and reflow profile need factory acceptance.

Run rebuild.py, audit-layout.py, audit-layout-complete.py, audit-components.py, render-component-audit.py and audit-3d-solids.py, then refresh previews and manifest. Historical revision comparisons do not validate a changed board.
