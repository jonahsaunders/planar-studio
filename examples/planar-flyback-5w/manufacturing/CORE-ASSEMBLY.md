# PS-MAG-002 A2 on PCB A4 — factory-gapped core installation

Use **two B66285G0050X187 N87 ELP22/6/16 halves and two B66286A2000X000 clips per board**. Both halves have a factory 0.05 ±0.01 mm center-leg recess, giving 0.10 ±0.02 mm combined. No grinding or bonding is required. [TDK drawing, pages 2–3](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_22_6_16.pdf).

TDK's 1520 nH listing describes one 0.05 mm gapped half paired with an ungapped half. A2, A3 and A4 use TWO gapped halves. Its estimated AL is 820 nH from the 0.10 mm total-gap entry; four turns give 13.12 µH. TDK's general E-core notes distinguish individual gap g and total gap s. This estimate is not a guaranteed assembled AL tolerance. [Gap convention](https://www.tdk-electronics.tdk.com/download/540150/449506bb84194c3510018ae82f66b4cc/pdf-ecoresgeneralinformation.pdf).

## Cutouts and fit

Native KiCad coordinates are X right/Y down. Core center is (100,85) mm; mating plane lies midway through the PCB. All three slots are unplated with R0.50 mm corners.

| Slot | X limits, mm | Y limits, mm |
| --- | --- | --- |
| Left outer leg and clip | 86.90–92.30 | 76.45–93.55 |
| Center post | 96.95–103.05 | 76.45–93.55 |
| Right outer leg and clip | 107.70–113.10 | 76.45–93.55 |

The independent check reads these holes from the saved board's STEP outline. Maximum ferrite dimensions, sharp corners, 0.20 mm inward error on every slot wall and 0.05 mm insertion misalignment leave 0.146 mm minimum corner clearance. Minimum core window is 6.2 mm; with a 1.78 mm board there is 2.21 mm vertical room per face when centered.

The correct TDK clip is specified for this EELP22 core pair. A4 includes the official free-clip and clamp-recess core STEP sources. The clip must open from its nominal 8.8 mm CAD jaw to approximately 9.4 mm between recess floors. The rendered installed position is a geometric surrogate; it does not determine spring force or allowable deflection.

The PCB preserves a 1.5 mm outward envelope beyond maximum ferrite width and a 2.4 mm maximum strip width. This leaves 0.25 mm slot clearance with the stated routing and centered-insertion tolerances. A separate full-metal projection check includes 0.5 mm lateral pair movement and retains at least 0.798 mm to copper on all six layers, without relying on soldermask. **Confirm spring engagement, the installed envelope and retention on the first physical pair.** The clips hold the halves together; the core can float in the PCB slots and is not qualified for vibration/shock.


## Assembly and acceptance

1. Finish electronic assembly, connector soldering, cleaning, inspection and depanelization. Check PCB A4 identity and all three cutouts; remove debris without enlarging the drawing dimensions.
2. Confirm both part markings and factory gaps. Inspect for chips/cracks. Insert one half from each side with outer legs seated; do not put glue or a full-face shim in the joints.
3. Fit one matching clip to each outer-leg recess using the manufacturer's intended engagement. Verify both hooks engage, the center legs remain separated, and metal stays clear of PCB copper. Avoid levering on brittle ferrite. Inspect centered fit and the installed clip envelope.
4. On a coupon or suitably isolated unpowered winding, measure primary Lm at 10 kHz and low signal, secondary open. Accept 11.0–14.6 µH. Record test voltage, frequency, temperature and series/parallel measurement convention. Reject or re-pair outside the window; do not machine or shim to force a pass. The number of spare halves needed for selection is unknown until measured.
5. Verify 2:1 ratio, dot polarity, primary continuity through internal pin 5, and no primary-secondary continuity. Measure leakage with the secondary shorted. A4's default-stack model estimate of 0.1018 µH is not a test limit.
6. Measure inductance versus bias/temperature, clip retention and full converter performance under the prototype plan. The normal 5.4 A calculation stays below the declared 0.27 T screening limit; 7.2 A restart excursions need separate verification and may require redesign if measured saturation or heating is excessive.

Keep at least 6 mm unobstructed below the PCB for the core; the illustrative 8 mm standoffs provide nominal room but are not procurement-qualified. No mains/safety isolation rating is established. [Fit evidence](../evidence/audit/core-fit-checks.json) · [Prototype tests](PROTOTYPE-TEST-PLAN.md).
