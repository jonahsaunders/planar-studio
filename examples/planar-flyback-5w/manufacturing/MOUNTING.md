# A2 mounting specification

Four M3 mounting holes use American Embedded's unmodified
`MountingHole_3.2mm_M3_ExposedSubstrate_Edge` footprint, pinned to library commit
`7be291853536e19f0d0d548c2ed3ca6811bdc540`. See the [upstream source and license](../kicad/amemb-MountingHole.pretty/LICENSE.md).

The 50 Ã— 104 mm outline is unchanged. Hole centers form a **41 Ã— 95 mm**
rectangle. The exposed-substrate openings extend to the left edge at H1/H3
and the right edge at H2/H4. Left footprints rotate 180Â°; right footprints use
0Â°. All centers are 4.5 mm from their two adjacent board edges; the holes remain closed
circular drills, not slots or edge notches.

The upper row now sits toward the top corners, 12.5 mm above its previous
position, increasing access beside C7. The lower row moves 2.5 mm toward the
bottom corners. The connector wire-entry areas remain clear. Each drill has
2.9 mm of nominal substrate to its two adjacent edges. All four clear the core.
The electronic placement, copper routes and filled ground pours are unchanged.
See the [corner-mount comparison](../evidence/audit/mounting-revision-checks.json).

At H2, the clearance from the maximum permitted 6.4 mm hardware-contact
envelope to C7's complete footprint courtyard increases from **0.625 mm to
5.677 mm**. This conservative placement boundary includes its solder lands;
it is not a tool-access or tolerance-stack qualification.

| Reference | X from left edge (mm) | Y from bottom edge (mm) | Finished drill |
| --- | --- | --- | --- |
| H1 | 4.5 | 99.5 | 3.2 mm NPTH |
| H2 | 45.5 | 99.5 | 3.2 mm NPTH |
| H3 | 4.5 | 4.5 | 3.2 mm NPTH |
| H4 | 45.5 | 4.5 | 3.2 mm NPTH |

Coordinates match the Gerber/drill origin at KiCad (75, 137) mm. X increases
rightward, Y upward. The [hole schedule](mounting-holes.csv) and
`PS-FLYBACK-5W-NPTH.drl` carry these coordinates; the three core openings remain
routed contours in Edge.Cuts, not drill hits.

- Each face has a 6.4 mm circular exposed-substrate opening, extended 5 mm
  beyond its outward radius. In local coordinates it spans x=-3.2â€¦8.2 mm
  and y=-3.2â€¦3.2 mm; the outward portion is clipped by the board edge.
- Copper is excluded within a 3.4 mm radius on every copper layer: 1.8 mm
  clearance from the 3.2 mm hole's edge. The outward extension also has an
  all-layer keepout, 0.2 mm beyond the mask boundary (local x to 8.4 mm).
- The footprint courtyard spans 12.3 Ã— 7.3 mm, including its off-board extension. H1â€“H4 have no electrical net
  and are excluded from the electronic BOM and placement file.
- Do not plate, fill or copper-cap these four holes. They are separate from the
  66 interlayer holes requiring filling/capping and the four open connector holes.

Use nonconductive standoffs. Limit washer/head/standoff contact diameter to
**6.4 mm**; a 7 mm washer extends beyond this footprint's exposed area. Fasteners
and an enclosure are not selected or included in the electronic assembly BOM.
Provide underside clearance for the installed ferrite pair: its nominal
projection below the PCB is about 5.55 mm before retention materials. An 8 mm
standoff is a provisional starting point, subject to the final core, adhesive,
strap, chassis and fastener geometry. Avoid board bending or core loading when
tightening; a torque limit requires mechanical qualification.

The [mounting check record](../evidence/audit/mounting-checks.json) measures
clearance against actual tracks, pads, winding polygons and filled zones on all
six layers, including each rotated extension keepout. The minimum recorded center-to-copper distance is 4.045 mm at H1.
This verifies the intended geometric exclusion, not chassis insulation or
mechanical strength under an unspecified load.
