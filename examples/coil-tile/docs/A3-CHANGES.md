# A3 — clearer schematic and shorter service routing

Reviewed against A2 commit `f539333d109807755a2f7cc014862567ccf29275`.

The one-sheet schematic keeps every stage visibly connected. The bridge body
is approximately half its former height, with unused UART/GPIO pins grouped
along its bottom edge. The converter and four LC branches are more compact;
power runs are shorter. Numbered stage headings, separate service/sensor notes,
and consistent channel captions make the drawing easier to follow.

On the PCB, SDA now takes a direct route north of the bridge instead of wrapping
around its bottom and left. TP3/TP4 sit beside the bus, with SDA/SCL silkscreen
labels; all four service pads share the same row. The former 29.7 mm SCL test-pad
route on the 3.3 V layer is gone, reducing interruption of that plane. CC1 uses
a shorter route that clears the USB locating holes and ground/power vias.
The LDC1614's C5 bypass capacitor moved 1.5 mm toward its supply pin.

| Measurement | A2 | A3 |
|---|---:|---:|
| SDA total trace, including branches | 78.901 mm | 62.575 mm |
| SCL total trace, including branches | 82.326 mm | 53.138 mm |
| CC1 total trace, including branches | 21.716 mm | 11.145 mm |
| SCL trace on In2.Cu power layer | 29.700 mm | 0 mm |
| U3 VDD to C5 supply pad, center-to-center | 3.2875 mm | 1.7875 mm |
| Through vias | 62 | 62 |

Lengths exclude via barrels, pads and zone copper. They are geometric routing
measurements, not measured signal-integrity or noise improvements.

Native ERC, DRC, unrouted and schematic-parity checks all report zero issues,
without adding rule suppressions. Electrical net groups and symbol pin identities
match A2 exactly. The coil artwork, mounting footprint and coil/hole placements
are unchanged. BOM/CPL still match all 20 top-side assembly references.

The native PDF, board layers, independent Gerbers and bare-board preview were
regenerated and visually reviewed. `scripts/render-previews.py` now provides a
repeatable image refresh. `evidence/A3-review.json` records the comparisons.
The current fabrication package is `CoilTile-A3-fabrication.zip`; A2's package
remains available in Git history. Hardware and supplier acceptance remain untested.
