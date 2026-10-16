# A6 preload and secondary routing revision — 2026-10-16

A6 replaces R7 with **180 Ω ±1%, Yageo RC1206FR-07180RL, 0.25 W at 70 °C, 1206, C137380**. The footprint, position and electrical topology stay the same. The In2.Cu secondary connection now reaches both via centers, and the off-center-via DRC rule is enabled as an error.

## Current margin

The [LT8302 Rev. G, page 17](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf) minimum-load estimate is `Imin = Lmax × Isw_min_max² × fmin_max / (2 × Vout_min)`. At 14.6 µH, 1.04 A, 12.7 kHz and 4.75 V, this gives **21.111 mA**.

R7's maximum resistance includes its 1% initial tolerance, 100 ppm/°C over a 100 °C component-temperature excursion, and a separate 1% aging reserve: `Rmax = 180 × 1.01 × 1.01 × 1.01 = 185.454 Ω`. This gives **25.613 mA**, or **21.33% margin**. The rebuild requires at least 20%.

| Calculation | A5: 220 Ω | A6: 180 Ω |
| --- | ---: | ---: |
| Nominal current at 5 V | 22.727 mA | 27.778 mA |
| Margin with initial +1% tolerance only | 1.26% | 23.77% |
| Margin with tolerance, temperature and aging reserves | −0.73% | 21.33% |
| Nominal dissipation at 5 V | 0.114 W | 0.139 W |

The old 220 Ω value fails the strengthened margin gate. The aging reserve is a design allowance, not a guarantee of drift over a particular service life. Verify no-load regulation and burst ripple across input, temperature and accepted inductance on hardware.

## Power and package

The [exact manufacturer specsheet](https://yageogroup.com/component-documentation/download/specsheet/RC1206FR-07180RL) specifies the same RC1206 package and 100 ppm/°C TCR. The [RC series datasheet, page 7](https://yageogroup.com/content/datasheet/asset/file/PYu-RC_Group_51_RoHS_L) derates power linearly from 70 °C to zero at 155 °C local ambient.

Using all resistance reserves in the opposite direction gives `Rmin = 180 × 0.99³ = 174.654 Ω`. At 5.25 V, worst-case power is **0.158 W**. At the chosen 85 °C local-ambient screen, the rating is **0.206 W**; dissipation is **76.65%** of that rating, below the required 80%. Nominal dissipation increases by **25.3 mW**. The build also updates the full-load and cycle models from the same R7 value, rather than retaining a hard-coded 220 Ω load.

The public [JLCPCB C137380 page](https://jlcpcb.com/partdetail/Yageo-RC1206FR07180RL/C137380) identified the replacement part and orderable inventory on October 16. Inventory is not reserved. Its footprint API was unavailable, so the symmetric placement reference is transferred from the previous resistor in the identical RC1206 family, with that provenance explicitly recorded. Verify the replacement part in the factory preview.

## Routing and verification

On In2.Cu, the 1.30 mm SEC_A trace now runs from (101.000, 98.075) to the via center at (100.550, 102.138) mm, followed by a link to the other via center at (101.450, 102.138) mm. The via sizes, locations and top-side connection remain unchanged.

`scripts/verify-preload-revision.py` compares against A5 commit `43a22c9`: exactly one secondary route segment removed and two added, only R7's value/procurement changed, and every footprint/pad/pose, winding, stack, outline, mounting feature and filled ground pour retained. It rejects the old preload under the new margin gate. Native ERC/DRC/parity, component/placement, feedback/snubber, mechanical/3D, manufacturing and analytical checks are rerun by `scripts/rebuild.py`.

[Current revision evidence](evidence/audit/preload-revision-checks.json) · [Electrical sizing](evidence/electrical-sizing.json) · [Validation and remaining qualification](VALIDATION.md)
