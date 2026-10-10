# JLCPCB electronics and separate ferrite sourcing

All 75 purchased electronic placements have exact JLCPCB catalog identifiers,
covering 42 unique parts. The checked catalog snapshots show positive stock.
The electronics allowance is **$24.30** at the first listed price tiers; two core
halves and two clips add approximately **$6.88**, or **$31.18 in parts**.
PCB fabrication, assembly, setup, attrition, minimum quantities, tax and shipping
are excluded. These are snapshots, not a reserved or accepted order.

| Function | Selected part | JLCPCB code | Checked stock |
| --- | --- | --- | --- |
| Input power port | AMASS XT30PW-M30.G.Y | C431092 | 24,656 |
| Output power port | AMASS XT30PW-F20.G.Y | C2913282 | 19,333 |
| GaN half bridge | TI LMG2100R044RARR | C22453052 | See catalog snapshot |
| LLC controller | TI UCC25600DR | C130223 | See catalog snapshot |
| SR controller | TI UCC24624DR | C2862446 | See catalog snapshot |
| Auxiliary inductor | Bourns SRP7050TA-680M | C2047750 | 39; check availability before ordering |

[Complete priced BOM](sourcing/Electronics-BOM-review.csv) ·
[Catalog snapshot](sourcing/catalog-selected.json) ·
[Core/clip list](sourcing/Core-and-clips.csv)

## Connector and assembly process

JLCPCB's current [assembly capability page](https://jlcpcb.com/capabilities/pcb-assembly-capabilities)
supports mixed SMT and through-hole assembly in one PCBA order. This example has
73 top SMT parts and two top-inserted through-hole connectors. Request the
appropriate mixed-assembly service and obtain acceptance of the actual files.

The [AMASS M30 drawing](https://www.china-amass.net/uploads/32.XT30PW-M30-SPEC-2025V0.pdf)
specifies 80 V DC and a 20 A rating under its stated wire/temperature-rise
conditions. The [F20 catalog drawing](https://datasheet.lcsc.com/datasheet/pdf/8e4f5fbe132d96575dda54e56e670896.pdf?productCode=C2913282)
lists 15 A. These ratings support selecting the family for the 5 A target, but
do not establish the thermal rating of this PCB or a chosen mating harness.
Use a suitably rated mating XT30 cable assembly, follow the molded polarity
marks, and validate contact temperature. Mating cables are external test/system
equipment, not PCBA BOM components.

Both footprints have 5 mm contact pitch, 1.9 mm finished contact drills and
11 mm retention-hole pitch. The 3 mm input and 2 mm output solder tails need
review against the 1.6 mm board and solder process. **Keep all connector holes
open.** The fill/cap requirement applies to the 0.30 mm interconnect holes, not
the 1.0/1.9 mm connector holes or 3.2 mm mechanical holes.

Use JLCPCB-managed panel tooling as needed. Three on-board fiducials are supplied;
the four M3 mounting holes are not the panel's assembly tooling holes. Six probe
pads have no paste and no purchased placement.

## PCB and core

Request eight copper layers, 2 oz on every layer, nominal 1.6 mm FR4, ENIG and
epoxy-filled, copper-capped, planarized vias in SMT lands. The exact dielectric
construction still needs factory approval and magnetic recalculation if changed.
Read [manufacturing notes](manufacturing-prototype/READ-BEFORE-ORDER.txt) before
using the Gerbers, drill files, BOM and CPL.

The two TDK B66285G0050X187 core halves and two B66286A2000X000 clips are separate
DigiKey items. JLCPCB's fitting of these externally supplied mechanical parts
has **not** been agreed. Catalog availability therefore does not yet constitute
a confirmed fully assembled converter. Arrange that operation after soldering,
or fit the ferrite after receiving the electronics assembly.
