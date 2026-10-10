# JLCPCB electronics and separate ferrite sourcing

All **75 purchased PCB placements** have exact JLCPCB catalog identifiers,
covering **41 unique parts**. The catalog snapshots show positive stock.
Electronics total **$23.68** at the first listed price tiers. Two removable
plugs add **$0.39**; two DigiKey core halves and two clips add about **$6.88**:
approximately **$30.95 in parts**. PCB fabrication, assembly, setup, attrition,
minimum quantities, tax and shipping are excluded. Inventory is not reserved.

| Function | Part | Catalog code | Stock snapshot |
| --- | --- | --- | --- |
| J1 and J2 PCB header | KANGNEX WJ2EDGRC-5.08-02P-14-00A | C3697 | 89,246 |
| Two removable screw plugs | KANGNEX WJ2EDGK-5.08-02P-14-00A | C71370 | 92,238 |
| GaN half bridge | TI LMG2100R044RARR | C22453052 | See snapshot |
| LLC controller | TI UCC25600DR | C130223 | See snapshot |
| SR controller | TI UCC24624DR | C2862446 | See snapshot |
| Auxiliary inductor | Bourns SRP7050TA-680M | C2047750 | 39; recheck before order |

[PCB electronics BOM](sourcing/Electronics-BOM-review.csv) ·
[PCB catalog snapshot](sourcing/catalog-selected.json) ·
[Mating plugs](sourcing/Mating-plugs.csv) ·
[Accessory snapshot](sourcing/accessory-catalog.json) ·
[Core/clip list](sourcing/Core-and-clips.csv)

## Bench connections

Both ports use the [C3697 header](https://www.lcsc.com/product-detail/C3697.html)
and matching [C71370 removable plug](https://www.lcsc.com/product-detail/C71370.html).
The screw plugs let bench supply/load leads be fitted or changed without
soldering a dedicated harness. They are external accessories and must be
included separately in procurement; they have no PCB placement or CPL entry.
J1 is 48 V input; J2 is 12 V output. **Pin 2 is positive and pin 1 is return on
both ports.** Use the board's polarity labels. The identical connectors do not
prevent swapping input and output cables; label both mating plugs.

The [header drawing](https://datasheet.lcsc.com/datasheet/pdf/dce87f2b59e72b104c944c4b7a080558.pdf?productCode=C3697)
and [plug drawing](https://datasheet.lcsc.com/datasheet/pdf/6f9bbd0ffb3f425ddacaafb272a2e6de.pdf?productCode=C71370)
specify the 5.08 mm family, including a 10 A UL current rating. That supports
selection for the 5 A target but does not qualify temperature rise on this PCB.
The plug drawing specifies 24–12 AWG, 7–8 mm stripped length and 0.4 N·m torque.
Select wiring for the actual current, insulation and terminal specifications.

Six bare ENIG pads provide VIN/PGND, VOUT/SGND and V5/AGND measurements. They
have no paste or purchased placement. The headers overhang the 64 × 56 mm board;
allow additional space for plugs, wires and removal. Mating plugs are not shown
in the supplied 3D renders.

## Assembly and PCB process

JLCPCB's [assembly capabilities](https://jlcpcb.com/capabilities/pcb-assembly-capabilities)
include mixed SMT and through-hole assembly. Request 73 top SMT placements and
two top-inserted through-hole headers, and obtain acceptance of the actual files.
Each header has two 1.6 mm finished plated holes and 4 mm solder tails. Confirm
lead protrusion and the through-hole solder process for this 1.6 mm PCB.
**Keep the four connector holes open.** Via filling/capping applies to the
0.30 mm interconnect holes, not connector or 3.2 mm mechanical holes.

The proposed stack has eight copper layers, 2 oz on every layer, nominal 1.6 mm
FR4 and ENIG. Vias in SMT lands need epoxy filling, copper capping and
planarization. The exact construction, panel tooling and placement rotations
still need factory review. Three fiducials are provided; mounting holes are
not panel tooling holes. See the [manufacturing notes](manufacturing-prototype/READ-BEFORE-ORDER.txt).

The two TDK B66285G0050X187 core halves and two B66286A2000X000 clips are separate
DigiKey items. JLCPCB fitting of these externally supplied parts has **not**
been agreed. Catalog availability therefore does not yet establish a confirmed
fully assembled converter. Arrange core fitting after soldering or fit the
ferrite after receiving the electronics assembly. No order has been placed.

## A4 fabrication review

The revised native rules require at least 0.16 mm track width and global copper
clearance, with 0.20 mm ordinary net clearance. This follows the 2 oz minimum in
[JLCPCB's copper-weight guide](https://jlcpcb.com/help/article/jlcpcb-copper-weight).
The requested all-layer 2 oz construction still requires file-level acceptance.
The layout has 169 routed vias plus six winding transitions; filled/capped vias
remain required. Independent Gerber renders are supplied in
[the fabrication-output review](evidence/Gerber-review.png).
