# A7 — R1 availability and OSP finish

The user order showed 14 available of R1 **Yageo RC0603FR-07649KL / C245991**, with 20 required. A7 substitutes **UNI-ROYAL 0603WAF6493T5E / C25821** and aligns all fabrication specifications with the user's **OSP** selection.

## Replacement review

The replacement retains 649 kΩ ±1%, ±100 ppm/°C, 100 mW at 70 °C, 75 V, −55 to +155 °C and the nonpolar 0603 package. R1/R2 values, startup calculations, footprint, pad nets and placement are unchanged. Even assigning the full 42 V stress screen to R1 gives less than 2.75 mW at −1% resistance, well below its rating.

The [fresh JLCPCB page](https://jlcpcb.com/partdetail/26564-0603WAF6493T5E/C25821), retrieved October 16, 2026, reports 1,087 headline stock and **1,065 available** (`canPresaleNumber`), with `leastPatchNumber=20`. This exceeds the 20 required in the screenshot. Stock is unreserved; use C25821 when refreshing the order BOM. Other BOM stock dates are unchanged and are listed individually in JLCPCB-SOURCING.md.

The manufacturer PDF linked from that page is UNI-ROYAL Thick Film Chip Resistors V3, February 12, 2019: ordering code p.2, body dimensions p.4, ratings/lands/derating p.5, TCR p.6. The 0603 body is 1.60 × 0.80 × 0.45 mm nominal. Page 5's A=0.90 mm gap and B=0.65 mm land length imply centers at ±0.775 mm. Its printed D=2.10 mm differs from A+2B=2.20 mm; the alternative ±0.725 mm centers also fit the retained PCB pads (0.80 × 0.95 mm at ±0.825 mm).

The exact C25821 catalog API returned HTTP 403. Placement evidence therefore uses manufacturer land centers, not a claimed catalog frame. The centered, nonpolar CPL entry remains unchanged; confirm the replacement's body center and both lands in the fresh JLCPCB preview. Source hashes and factual dimensions are in [sources/r1-replacement-review.json](sources/r1-replacement-review.json).

## Finish and upload files

**OSP replaces ENIG** in the board generator, native PCB, exported Gerber job, fabrication notes, ordering guide and packaged report. Copper thickness, stack and routing are unchanged. Use the matching A7 Gerber ZIP, BOM and CPL; re-upload the Gerber ZIP and BOM to replace the earlier finish and R1 identity. Select **OSP** in the quote form as well. Keep 1 oz outer / 1 oz inner copper, nominal 1.6 mm, Specify Stackup: No, Standard PCBA and the existing selective epoxy fill/cap requirements.

OSP is a flat solderable finish. Keep bare boards sealed and assemble within the fabricator's storage guidance; exposed unsoldered test pads may need tinning for reliable probing. [JLCPCB finish guidance](https://jlcpcb.com/help/article/jlcpcb-surface-finish). Factory process acceptance and prototype qualification remain as documented.

## Verification

`scripts/verify-procurement-revision.py` compares directly with A6 commit `f76e1b478e1bfd95fa561dfa65c0c002126cc49b`: only R1 procurement fields change; every electrical value, pad/net, placement, route/via, filled pour, outline, winding, stack and mechanical source is retained. It checks OSP in the saved board, the replacement identity/rating evidence, manufacturer land-center fit, and the existing preload margin gate. The full rebuild also refreshes native ERC/DRC/parity, all DRC categories, component/placement, mechanical/3D, analytical and manufacturing checks.

[Current containment evidence](evidence/audit/procurement-revision-checks.json) · [Validation](VALIDATION.md) · [Upload guide](manufacturing/START-HERE.md).
