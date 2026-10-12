# A2 — connected schematic and example mounting holes

The A1 schematic split the functional blocks apart with net labels. A2 presents
the same circuit as one continuous left-to-right signal flow: USB-C, ESD
feedthrough, MCP2221A, LDC1614 and four LC tanks. The USB pair, SDA/SCL, all eight
coil connections and the common power distribution are drawn as wires. Net
labels identify the visible conductors. Test points sit on their actual nets.

KiStack's schematic review workflow was used: reflow symbols without changing
pin identities, attach passives to the associated circuits, use power symbols,
color related signal groups, render the native schematic, review details and
compare netlists. Pin number/name/type preservation is asserted in the generator.
The final net groups are identical to A1; this is a drawing and mounting update,
not a change to the sensor circuit or its software register setup.

The four mounting footprints are byte-for-byte copies of
`MountingHole_3.2mm_M3_ExposedSubstrate_Edge.kicad_mod` from the GaN example,
which reuses the flyback example's geometry. The American Embedded attribution
and CC BY 4.0 notice are included beside the footprint. Left holes rotate 180°;
right holes rotate 0°, so the mask openings extend toward the board edges.

- 3.2 mm nonplated drill; 6.4 mm top/bottom exposed-substrate opening.
- 10 mm circular all-layer copper exclusion, plus the edge-extension keepout.
- Existing hole centers and 72 × 90 mm outline are unchanged.
- One bottom-right ground stitching via moved from (116, 140) to (113.8, 140) mm
  in native board coordinates to clear the expanded keepout. Zones were refilled.
- BOM and CPL still contain 20 purchased placements; mounting hardware is excluded.

Native ERC, DRC, unconnected-items and schematic-parity checks are clean. The
reports, native PDF, PCB plots, fabrication data and previews were regenerated
for this revision. See `evidence/A2-review.json` for the comparison and footprint
hash. Physical sensing, supplier acceptance and assembly performance remain
unverified; the example is an unbuilt prototype.
