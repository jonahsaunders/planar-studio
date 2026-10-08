# A4 mounting specification — geometry retained from A3

The board is **44 × 94 mm**, with four 3.2 mm NPTH M3 holes on a **35 × 85 mm** pattern. This changes A2's 41 × 95 mm mounting pattern. Existing mounting plates/enclosures require an update.

American Embedded's `MountingHole_3.2mm_M3_ExposedSubstrate_Edge` footprint is unchanged, pinned to commit `7be291853536e19f0d0d548c2ed3ca6811bdc540`. Left openings face outward at 180 degrees; right openings at 0 degrees. Each hole center is 4.5 mm from adjacent board edges, leaving 2.9 mm nominal substrate from drill to edge.

| Reference | X from left edge (mm) | Y from bottom edge (mm) | Drill |
| --- | --- | --- | --- |
| H1 | 4.5 | 89.5 | 3.2 mm NPTH |
| H2 | 39.5 | 89.5 | 3.2 mm NPTH |
| H3 | 4.5 | 4.5 | 3.2 mm NPTH |
| H4 | 39.5 | 4.5 | 3.2 mm NPTH |

Fabrication origin is KiCad (78,132) mm, X right and Y upward. The hole schedule and NPTH drill file use this origin. Core openings remain routed Edge.Cuts contours.

Use nonconductive standoffs with hardware-contact diameter at most 6.4 mm. Copper is excluded for a **5.0 mm radius (10.0 mm diameter)** from each hole center on all six layers. This leaves **1.8 mm nominal clearance** beyond the maximum 6.4 mm hardware-contact diameter, increased from 0.2 mm. The same 1.8 mm clearance applies along the entire outward exposed-substrate mask extension. The mask opening and drilled hole remain unchanged. This is a locally modified American Embedded footprint; the all-layer keepout and pad clearance are included in the saved PCB and footprint library. Do not plate, fill or cap the mounting holes. Fasteners/enclosure are not in the electronic BOM.

Keep at least 6 mm clear below the board for the core. The modeled 8 mm standoffs are illustrative, not procurement-qualified. Avoid applying mounting force to the ferrite. Torque, vibration, clip retention and wiring/tool access require first-article qualification. The copper keepout check uses actual filled zones, tracks, pads and winding polygons; see `evidence/audit/mounting-checks.json`.
