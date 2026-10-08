# Primary references

- [LT8302/LT8302-3 datasheet, Rev G](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf): controller pinout, current limits, primary-side sensing, snubber design and layout guidance. Selected LT8302ES8E#PBF; not the -3 variant.
- [TDK ELP32/6/20 core drawing, October 2022](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_32_6_20.pdf): EELP32 set dimensions and N87 gap coefficients on page 6. Stock B66457G0000X187 is ungapped; other AL/gaps available on request.
- [JLCPCB assembly sourcing](https://jlcpcb.com/pcb-assembly): sourcing service exists, but is not confirmation of this custom core assembly.
- [JLCPCB BOM requirements](https://jlcpcb.com/help/article/bill-of-materials-for-pcb-assembly).
- [JLCPCB BOM/CPL matching](https://jlcpcb.com/help/article/advice-for-bom-and-cpl-files-preparation).

Consulted 2026-09-29. Availability is not reserved; quoted manufacturing acceptance is still required.

- [TDK ferrite processing notes](https://www.tdk-electronics.tdk.com/download/531610/67fa2f237fae90fab6f31f4a10f42772/pdf-processing.pdf): bonding, mounting stress, fixture and winding-fill effects.
- [Panasonic 16SVPF180M](https://industrial.panasonic.com/ww/products/pt/os-con/models/16SVPF180M): output capacitor electrical and mechanical data.
- [Panasonic mounting specifications](https://industrial.panasonic.com/cdbs/www-data/pdf/AAB8000/AAB8000COL10.pdf): C6 lands 2.1 mm gap / 9.1 mm span / 1.6 mm width and SVPF reflow limits.
- [Samsung CL32B106KBJNNN](https://product.samsungsem.com/mlcc/CL32B106KBJNNN.do) and [manufacturer characteristic sheet hosted by RS](https://docs.rs-online.com/95c4/0900766b813d6930.pdf): typical DC-bias capacitance curve. The 4 µF combined design assumption is not a guaranteed production minimum.
- [Cixi Kefa KF301-5.0-2P](https://www.lcsc.com/product-detail/C474881.html): 5.00 mm connector pitch and drawing.
- [Diodes SMAJ family](https://www.diodes.com/datasheet/download/SMAJ5.0A.pdf): revised selection SMAJ12A-13-F, 12 V standoff, 13.3–14.7 V breakdown, 19.9 V specified clamp; new sourcing code deliberately unverified.
- [JLCPCB six-layer capability](https://jlcpcb.com/resources/6-layer-pcbs) and [via covering](https://jlcpcb.com/help/article/pcb-via-covering): general capability, not acceptance of the proposed custom stack or this order.
- [JLCPCB secondary mechanical operations](https://jlcpcb.com/help/article/introduction-smt-mechanical-assembly-components): process instructions required; no evidence yet that this ferrite assembly is accepted.
- [Henkel LOCTITE AA 330 TDS](https://datasheets.tdx.henkel.com/LOCTITE-AA-330-en_GL.pdf): ferrite compatibility, activator and cure. Proposed external bond geometry requires qualification.
- [3M 69 tape, 12.7 mm](https://www.3m.com/3M/en_US/p/d/v000076478/): proposed nonconductive retention strap, ID 7000031352.
- [KiCad library license](https://www.kicad.org/libraries/license/): footprint attribution and redistribution terms.

Every electronic part's source and exact MPN are also listed in `parts.json` and `manufacturing/BOM-MASTER.csv`. Some LCSC listings were cached with conflicting stock counts; no stock availability is claimed.

- [KiStack audit skills, pinned commit 8494dbd](https://github.com/American-Embedded/kistack/tree/8494dbde095669df081950cbb6b24d08a21e25b0): schematic, PCB, footprint, export and Gerber review; placement converter reused with its license.
- [American Embedded M3 Edge mounting footprint, pinned commit 7be2918](https://github.com/American-Embedded/American_Embedded_KiCad_Repository/blob/7be291853536e19f0d0d548c2ed3ca6811bdc540/packages/library/american-embedded-library/footprints/amemb-MountingHole.pretty/MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod): unmodified 3.2 mm NPTH footprint with an outward exposed-substrate extension and all-layer copper clearance; CC BY 4.0.

- [Complete per-component review](component-review.json): exact selected MPNs, manufacturer sources, package checks, rating use and unresolved gates for all 29 footprints.
- [David Perreault's ARPA-E presentation](https://arpa-e.energy.gov/sites/default/files/migrated/documents/files/PowerTech_Workshop_Perreault.pdf), PDF page 11, and [MIT PER group board gallery](https://per.mit.edu/project-gallery/): visual reference for compact switching cells/local bypass placement. Different topology/frequency; applied principles are our inference, not endorsement.
- [ADI AN88](https://www.analog.com/media/en/technical-documentation/application-notes/an88f.pdf): ceramic input capacitor hot-plug transients and damping rationale.
- [Panasonic hybrid capacitor specifications](https://mediap.industry.panasonic.eu/assets/imported/industrial.panasonic.com/cdbs/www-data/pdf/RDD0000/ABA0000COS47.pdf), page 31: EEHZC1J470P 47 µF, 63 V, 40 mΩ, 1.1 A, 8 × 10.2 mm.
- [Vishay CRCW-HP e3](https://www.vishay.com/docs/20043/crcwhpe3.pdf): CRCW25122R20FKEGHP continuous and pulse conditions. Hot-plug remains unqualified.

## A2 sources

- [TDK ELP22/6/16 core and clips, pp2–3](https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_22_6_16.pdf)
- [TDK E-core gap convention, pp4,6](https://www.tdk-electronics.tdk.com/download/540150/449506bb84194c3510018ae82f66b4cc/pdf-ecoresgeneralinformation.pdf)
- [JLCPCB routed-slot and board capability](https://jlcpcb.com/capabilities/pcb-capabilities/)
- DigiKey source URLs and indexed stock: digikey-core-stock.json. Retrieved 2026-10-08; no stock reservation.
