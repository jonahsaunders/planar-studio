# A5 placement correction — October 9, 2026

The September 30 placement corrections have been transferred to the compact A5 board using its current lower-left datum. The previous CPL copied KiCad rotations directly and corrected only the connector body centers. The supplied JLCPCB preview exposed a sideways U1, inward-facing connectors and an offset D2. The corrected CPL uses the placement frame of each exact catalog part. Replace the previous placement upload; confirm the fresh JLCPCB preview before fabrication.

Open the [placement and polarity drawing](placement-review.svg) alongside the [top assembly drawing](assembly-top.svg). Both use a top-side view, with the input connector at the top. The placement drawing shows actual PCB pads and transformed catalog pin centers; it is **not a screenshot or approval of a live JLCPCB order preview**.

## Corrected placements

Coordinates are millimeters from the board's bottom-left datum, X right and Y up. Angles are counterclockwise. Only these six CPL entries change; copper, circuit connections, footprints and component choices stay the same.

| Part | Corrected X | Corrected Y | Corrected angle | Reason |
| --- | --- | --- | --- | --- |
| U1 | 13.5000 | 68.0000 | 270° | Catalog pin 1 maps to the PCB's upper-left pin-1 mark; leads align left/right |
| J1 | 22.0000 | 87.0000 | 180° | Openings face the top board edge; origin is the pin-row midpoint |
| J2 | 22.0000 | 8.0000 | 0° | Openings face the bottom edge; origin is the pin-row midpoint |
| D1 | 10.0000 | 81.3375 | 90° | Catalog origin differs from the asymmetric PowerDI-123 footprint by 0.3375 mm |
| D2 | 23.0000 | 27.9000 | 90° | Catalog origin is 0.9000 mm from the nominal package/lead-span center |
| D3 | 22.0000 | 66.9625 | 270° | Same PowerDI-123 origin correction, rotated with the footprint |

D2's catalog physical pins 1 and 2 are both anodes, and pin 3 is the cathode. The KiCad footprint uses logical pad 1 for the cathode and duplicated pad 2 for the two anode leads. These numbering systems are mapped explicitly; matching their numbers directly would reverse the electrical interpretation.

The KF301 connector has two unpolarized, independent contacts. Turning its housing outward maps catalog contact 1 to PCB pad 2 and contact 2 to PCB pad 1. **The board labels define the terminal polarity.** This numbering difference does not exchange copper nets. If a supplier substitutes a numbered or keyed connector, repeat the housing and contact-number review.

## Polarity and pin-1 acceptance

| Part | Required appearance and connection in top view |
| --- | --- |
| U1 | Pin 1 and the package pin-1 mark at upper-left, beside the PCB pin-1 mark. Left row, top to bottom: 1 EN/UVLO, 2 INTVCC, 3 VIN, 4 GND. Right row: 8 TC, 7 RREF, 6 RFB, 5 SW. Exposed pad 9 is GND. |
| D1 | Cathode below, on VIN; anode above, on VIN_FUSED |
| D2 | Large cathode land below, on 5V_ISO; two anode leads above, on SEC_A |
| D3 | Cathode above, on CLAMP; anode below, on SW |
| D4 | Cathode above, on CLAMP; anode below, on VIN |
| C7 | Positive left, on VIN_DAMP; negative right, on PGND |
| C3, C8 | Positive right, on 5V_ISO; negative left, on GND_ISO |
| J1 | Wire entries outward/up. Left terminal positive VIN_RAW; right terminal negative PGND |
| J2 | Wire entries outward/down. Left terminal negative GND_ISO; right terminal positive 5V_ISO |

Ceramic capacitors, resistors and F1 are nonpolarized. The existing D4 and polarized-capacitor orientations already match the checked catalog geometry. Do not rotate them to match another component's marking. JLCPCB's preview orientation dot is not necessarily the device's pin-1 mark; use the actual pinout and polarity features.

## Evidence and regeneration

The A5 check covers 24 placements / 20 exact parts. Nineteen part identities retain saved public JLCEDA/EasyEDA geometry; new R6 uses the manufacturer land reference because its catalog geometry was unavailable. [Saved reference geometry](../sources/placement-library.json) records this distinction. [Placement checks](../evidence/audit/placement-checks.json) verify 54 catalog pad centers plus two R6 land centers against PCB pads/nets. Fifteen deliberately wrong rotations and origins are rejected. R6 is a centered nonpolar 2512 resistor; confirm its origin, rotation and actual body over both lands in the fresh JLCPCB preview. R6 and D4 positions have changed, so replace the previous CPL.

For D1/D3 the offset is the exact common translation between the two sets of land centers. For D2 the catalog 3D origin and physical lead-span center are approximately −0.9000 mm from the catalog placement origin; the native footprint origin is the package center. After correction, the catalog anode and cathode land-center differences from native lands are 0.070 and 0.012 mm respectively. For J1/J2, the prior ±0.2 mm body-center shift is removed so the actual pin row aligns with the drilled holes.

`scripts/manufacturing-data.py` applies the reviewed mapping before the unmodified generic CSV converter. `scripts/verify-placement.py` independently checks the resulting catalog pin positions against the actual PCB. `scripts/render-placement.py` produces the drawing. All three are included in `scripts/rebuild.py`. A changed MPN or footprint requires renewed placement review.

Sources: [JLCPCB rotation and orientation guidance](https://jlcpcb.com/help/article/pcb-assembly-faqs-part-2), [CPL format](https://jlcpcb.com/help/article/pick-place-file-for-pcb-assembly), [LT8302 pinout](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf), [DFLS1100](https://www.diodes.com/datasheet/download/DFLS1100.pdf), [PDS835L](https://www.diodes.com/datasheet/download/PDS835L.pdf), [KEFA KF301](https://www.cxkefa.com/kf301-50), and the exact-code catalog URLs in the saved geometry.

The corrected export has passed these local geometry and net checks. The fresh JLCPCB assembly preview, factory engineering acceptance and physical first-article inspection are still required. Review polarity and pin 1 before power is applied.
