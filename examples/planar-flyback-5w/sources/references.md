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
- [Diodes SMAJ13A](https://www.diodes.com/part/view/SMAJ13A): 13 V standoff, 14.4–15.9 V breakdown, 21.5 V specified clamp. Selected SMAJ13A-13-F is [LCSC C110519](https://www.lcsc.com/product-detail/C110519.html).
- [JLCPCB six-layer capability](https://jlcpcb.com/resources/6-layer-pcbs) and [via covering](https://jlcpcb.com/help/article/pcb-via-covering): general capability, not acceptance of the proposed custom stack or this order.
- [JLCPCB secondary mechanical operations](https://jlcpcb.com/help/article/introduction-smt-mechanical-assembly-components): process instructions required; no evidence yet that this ferrite assembly is accepted.
- [Henkel LOCTITE AA 330 TDS](https://datasheets.tdx.henkel.com/LOCTITE-AA-330-en_GL.pdf): ferrite compatibility, activator and cure. Proposed external bond geometry requires qualification.
- [3M 69 tape, 12.7 mm](https://www.3m.com/3M/en_US/p/d/v000076478/): proposed nonconductive retention strap, ID 7000031352.
- [KiCad library license](https://www.kicad.org/libraries/license/): footprint attribution and redistribution terms.

Every electronic part's source and exact MPN are also listed in `parts.json` and `manufacturing/BOM-MASTER.csv`. Some LCSC listings were cached with conflicting stock counts; no stock availability is claimed.
