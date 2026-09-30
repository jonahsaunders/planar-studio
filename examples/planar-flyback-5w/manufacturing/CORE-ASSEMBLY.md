# PS-MAG-001 A0 — prepared planar magnetic assembly

**Supplier review drawing and proposed process. Process qualification required before release.** See `core-assembly.svg` for geometry and layer relationships.

## Procurement specification

- One assembly per PCB: two TDK ELP32/6/20 N87 E halves based on B66457G0000X187. The resulting E+E set is EELP32. Both stock halves are ungapped; a pair of unmodified stock halves is unacceptable.
- A qualified ferrite supplier shall grind the center leg of one half to obtain a **0.21 mm nominal total center-leg gap**, with both outer-leg pairs seated. Proposed gap tolerance ±0.02 mm, subject to supplier capability and measured inductance acceptance. Do not place a shim across all three legs: it changes the magnetic circuit and the model.
- Nominal gap formula gives AL≈747 nH/turn²; 4-turn primary predicts Lm≈11.95 µH. Final assembled PCB acceptance is provisionally **10.16–13.74 µH**, measured at 10 kHz and 20 mV RMS across T1 pads 1–2 with the secondary unloaded. Fixture/calibration and semiconductor loading must be accounted for. Prefer an unpopulated-board magnetic coupon/first article for magnetic characterization.
- Obtain a material certificate, final prepared part number, gap/AL report and traceable lot. Grinding must precede PCB assembly; no ferrite machining near finished electronics.
- Supplier must validate the core's loss and inductance under pulsed DC bias. Small-signal AL alone does not establish flyback performance.

## Mechanical relationships

All dimensions in mm. Core center is KiCad (100,85), or manufacturing datum (25,52). Nominal completed core set is 31.75 × 20.35 × 12.70 mm; check supplier maximum dimensions. PCB thickness is nominal 1.60 mm. Minimum window height 6.10 mm leaves room for the board without clamping the winding copper between the yokes.

| Opening | Board coordinates X | Board coordinates Y | Corner radius |
|---|---|---|---|
| Center post | 96.50…103.50 | 74.375…95.625 | 0.50 |
| Left outer leg | 83.55…87.80 | 74.375…95.625 | 0.50 |
| Right outer leg | 112.20…116.45 | 74.375…95.625 | 0.50 |

These are unplated routed slots, not copper keepout rectangles. Use a first article with maximum-dimension cores to verify corner fit at the requested ±0.10 mm routing tolerance. Do not force a ferrite corner into a slot. The clearances are mechanical and do not confer reinforced or mains isolation.

## Proposed installation sequence

1. Finish soldering and cleaning. Inspect the slots, winding laminate, and filled/capped T1 holes. Verify isolation between the two winding networks before installing cores. Reject cracked or chipped cores at mating surfaces.
2. Place the lower E half in a nonmagnetic, compliant fixture. Insert the PCB over its three legs, then fit the upper prepared half. Keep winding solder mask intact; the ferrite must not scrape exposed copper. Center the board within the window without bending it.
3. Seat the outer-leg mating faces without contaminating them or the center gap. Check primary inductance and polarity. T1 pin 1 and pin 3 are corresponding dots: a positive pulse at pin 1 relative to pin 2 induces positive voltage at pin 3 relative to pin 4.
4. Proposed bonding material is **LOCTITE AA 330 with SF 7387 activator**, or a supplier-qualified ferrite adhesive approved during review. Henkel lists ferrite compatibility; this specific assembly is not qualified. Apply small external bonds at the two outer-leg joints; keep adhesive out of the center gap, winding area and outer mating faces. Supplier to define dispense volume and validate the external bond geometry.
5. Use a nonconductive retention strap around the yokes, parallel to the core's 31.75 mm span, to support the external bonds. Proposed material: 12.7 mm wide glass-cloth electrical tape, 3M 69 (7000031352) or approved equivalent. It must not lift the outer mating faces or abrade the board. Supplier to confirm tape sourcing and fit. No conductive closed-loop strap is permitted around the core.
6. Hold alignment in the compliant fixture through the adhesive's qualified fixture time, then allow full cure under its current datasheet conditions (typically 24–72 hours). Do not interpret initial handling strength as full cure. Do not apply pressure to the center leg or use the PCB as a spring clamp.
7. Recheck inductance after cure, inspect seating, and perform the prototype tests. Record adhesive and core lots, final gap/inductance, and any process deviations. Attach photos of top, bottom and both outer-leg joints to first-article documentation.

The adhesive/strap combination, bond geometry, retention force and environmental durability are **approval items for the assembly supplier**, not a validated production process. Raw core procurement from DigiKey is permitted separately from JLCPCB board assembly. Core preparation, retention, installation and magnetic acceptance remain a separate qualified operation; responsibility and process must be agreed before fabrication. An ordinary ungapped pair cannot be installed as a substitute for the prepared assembly.

## References

- [TDK ELP32 drawing and gap data](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_32_6_20.pdf)
- [TDK processing notes](https://www.tdk-electronics.tdk.com/download/531610/67fa2f237fae90fab6f31f4a10f42772/pdf-processing.pdf): mounting stress, bonding and fixture considerations.
- [Henkel AA 330 technical data](https://datasheets.tdx.henkel.com/LOCTITE-AA-330-en_GL.pdf): ferrite compatibility, activator and cure conditions. Follow current TDS/SDS.

- [3M 69 12.7 mm glass-cloth tape](https://www.3m.com/3M/en_US/p/d/v000076478/)
