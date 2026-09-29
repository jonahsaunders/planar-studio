# First-article verification — proposed acceptance plan

No hardware tests below have been performed. Results must be recorded per unit. Start with one inspected unit; do not apply unrestricted input power to an unverified assembly.

## Before power

1. Confirm all 21 electronic references, U1 variant, diode polarity, C3 polarity and connector labels against the assembly drawing. Confirm the prepared core report and physical seating.
2. Verify primary and secondary winding continuity and absence of primary-to-secondary continuity with a meter. T1 internal pin 5 connects the two primary sections; it is intentionally not an external circuit connection.
3. On the first-article magnetic coupon or appropriately isolated unpowered board, measure primary Lm with secondary open: provisional 10.16–13.74 µH. Record frequency, excitation voltage, bias and temperature. Measure leakage with the secondary shorted; the geometry model's 0.057 µH is an estimate, not an acceptance threshold. Use the measurement to retune the clamp/snubber.
4. Check winding ratio and dot polarity with a low-amplitude isolated AC source. Primary:secondary is 2:1; primary pin 1 and secondary pin 3 are corresponding dots. Record parallel-secondary current sharing if accessible.
5. Inspect for damaged solder mask, laminate/copper in slots, cracks and exposed copper touching the core. Verify connector wire entry faces outward. Record post-cure inductance and retention inspection.

## Controlled first power

Use an isolated bench DC supply, electronic load, DMM, current probe, and appropriately rated differential oscilloscope probes. Keep PGND and GND_ISO separate; ordinary earth-referenced probe grounds can defeat the isolation. Probe SW relative to PGND and output relative to GND_ISO.

The current layout provides top-exposed PGND and ISO GND probe lands at native KiCad coordinates (92.40, 62.65) and (108.20, 114.00) mm. Use T1 pad 1 for VIN, T1 pad 2 or U1 pin 5 for SW, C5 pad 1 for INTVCC, and C4 pad 1/J2 pin 1 for local/delivered output. Use a short probe return; the nearby PGND land is about 2.44 mm from U1 pin 5. These are two ground lands plus existing component pads, not six installed test points. See [probe map](../evidence/audit/probe-sites.json). Repeat output trim and switching-stress measurements after the routing revision.

Begin at 18 V with no external load and a 0.15 A input limit. Observe startup/output before increasing current limit. If limiting persists, shut down and investigate rather than increasing it blindly. For full-load testing, use up to 0.6 A input limit, with fuse F1 populated. Never apply mains directly.

| Test | Conditions | Provisional acceptance / record |
|---|---|---|
| DC regulation | 18, 24, 36 V; external load 0, 0.1, 0.5, 1 A | 4.75–5.25 V after settling; trim R3 only after recording initial values |
| Ripple | Same grid; short probe loop and 20 MHz bandwidth, then inspect full-bandwidth spikes | ≤100 mV peak-to-peak target; current bulk-only stress estimate is about 100 mV and is not a pass result |
| Switching stress | All inputs, startup, load steps, no-load and overload | SW peak below 60 V target, never reaching 65 V rating; measure diode reverse peak below 30 V target |
| Startup/shutdown | Ramp and abrupt input application at each input voltage; no/full load | Monotonic settling without sustained hiccup; record output overshoot, input inrush and fuse behavior |
| UVLO | Slowly ramp input up and down | Compare measured thresholds to nominal 16.44 / 14.57 V at U1 VIN; input terminal threshold includes D1 drop |
| Load steps | 0.1↔1 A and 0↔1 A | Record recovery time, overshoot and undershoot; review against application's tolerance before release |
| Temperature | 18 and 36 V, 1 A, 0/25/50 °C ambient after equilibrium | Target core/adhesive ≤85 °C, semiconductor estimated junction <110 °C; verify all component derating; record U1, D1/D2, R6/R7, C3 and winding hotspots |
| Efficiency | 18/24/36 V and 0.1/0.5/1 A | Record input/output power; 75% was a sizing assumption, not a guaranteed specification |
| Overload | Controlled load ramp; brief current-limited output short; verify restart | No sustained overheating or damage; repeat waveform and regulation checks afterward |
| Isolation integrity | Before/after electrical and thermal tests | No primary-to-secondary DC continuity; any dielectric qualification requires a separate insulation specification |
| Assembly reliability | Supplier-defined handling, vibration and thermal cycling appropriate to intended use | No core movement/cracking or significant Lm change; test severity must be agreed before production |

The transient, thermal and assembly reliability criteria need application-level review. EMI/EMC and safety certification have not been specified or performed. Final BOM values, core preparation and stack must be frozen only after first-article results and vendor DFM acceptance.
