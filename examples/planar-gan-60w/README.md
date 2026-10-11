# PS-GAN-60W — A13

48 V nominal → isolated 12 V / 5 A **design target**, with an integrated GaN
half bridge and PCB transformer generated using Planar Studio. Native KiCad 10
schematic, PCB, local libraries, 3D models and reproducible scripts are included.

**Unbuilt engineering prototype. Full turnkey assembly and electrical release
are not confirmed.** Start with [the manufacturing review](Manufacturing-audit.html)
for the repaired CAD findings and remaining factory/qualification gates.

[Design review and copper-layer viewer](Review.html) · [Schematic PDF](Schematic.pdf) ·
[KiCad project](kicad/PS-GAN-60W.kicad_pro) · [Validation](VALIDATION.md)

![A13 top assembly](Board-preview.png)

## A13 placement and direct routing

- Turned and aligned the feedback/OVP resistor dividers so their connected pads
  face each other. R22/R23 and R27/R28 now have straight vertical connections.
- Repositioned the LED, shunt and compensation parts. All seven local feedback
  nets use top copper, with **11 signal vias removed**. Their combined explicit
  trace length falls from **80.9 to 49.9 mm** (38% shorter).
- Eight low-current resistors have one outward axial 0.20 mm neck per pad,
  equal lands/paste openings and at least 0.25 mm from land edge to via-hole edge.
  Branches stay off their lands. General ground stitching now avoids all R/C pads.
- Connected the GaN bypass capacitors directly, turned the GaN input-divider
  resistors to remove their U-shaped links, and shortened the bias ripple network.
- Removed obsolete waypoints from complete route chains. Across the board,
  native route segments fall from **797 to 501**, explicit trace
  length from **879.1 to 828.2 mm**, and routed vias from
  **211 to 197**. These are geometry measurements, not performance claims.
- Retained single-board manufacturing files, top-only electronics, winding
  artwork, mounting pattern, connector thermals and separate ground domains.

See the [routing and tombstoning review](ROUTING-ASSEMBLY-REVIEW.md),
[lower-left comparison](evidence/Feedback-routing-before-after.png) and
[native passive-entry audit](evidence/passive-routing-audit.json).

The [issue register](manufacturing-prototype/Manufacturing-issue-register.csv)
separates completed CAD corrections from factory process, service and hardware
qualification work. No electronic part identities or circuit values changed.

## Compact construction and bench access

The 64 × 56 mm chamfered board keeps all 75 purchased components on top
(73 SMT + two insertion headers). Four M3 mounts retain the other example's
exact exposed-substrate footprint on this design's **55 × 47 mm pattern**.
The hole spacing differs from the flyback example; the footprint geometry is reused.
Opposing 5.08 mm headers accept removable screw-terminal plugs. Pin 2 is positive
and pin 1 is return on both ports. Mark the cables to prevent a swap.

Six bare test pads provide VIN/PGND, VOUT/SGND and V5/AGND measurement pairs.
Connector bodies, plugs, wire bend radius and the lower ferrite half extend the
assembly envelope beyond the PCB. The header 3D meshes are simplified bodies;
physical mating/fixture clearance still needs review.

The 4:2:2 transformer places its repeatable windings inside the PCB, avoiding a
bobbin and hand-wound coil. Two secondary layers operate in parallel per half.
The tradeoff is an eight-layer heavy-copper construction with filled/capped
transitions, appreciable winding loss and coupling that needs measurement.
[Magnetic calculations](evidence/magnetics.json) report a **3.87 W nominal DC
winding-loss screen at 80 °C**, before AC copper/core loss. This is not a thermal
qualification or an efficiency prediction.

## Manufacturing files and five-board estimate

All 43 exact electronic catalog codes have snapshot stock for five fitted
boards before attrition. [Exact BOM and stock](sourcing/Manufacturing-parts-5boards.csv).
Stock is not reserved. Core halves and clips are specified from DigiKey;
removable plugs are separate accessories. JLC procurement/consignment and
installation of those mechanical items have not been accepted.

Allow **$400–650 total for five boards** ($80–130 each) as a planning estimate
for electronics assembly plus separate cores/clips/plugs. It excludes ferrite
fitting, functional testing, shipping, taxes and duties. The PCB/panel portion
is an engineering allowance; **there is no supplier quote**. Special-process
costs can exceed the allowance. [Itemized model](sourcing/Manufacturing-cost-5boards.csv).

- `manufacturing-prototype/` contains matched **single-board** exports and
  [construction/assembly notes](manufacturing-prototype/READ-BEFORE-ORDER.txt).
- JLCPCB must define and quote its assembly panel/rails for the 64 × 56 mm board.
  Review its final placement overlay and handling arrangement before release.
- Every 0.30 mm interconnect, including six T1 plated-pad transitions, is specified
  for resin fill, copper cap and planarization. Connector and mounting holes
  remain open. A single-board coordinate map identifies every drill treatment.
- Raw KiCad placement rotations require a supplier-model overlay. Review the
  U1 stencil example, mask registration, hidden-joint inspection and THT process.
- Depanelize after soldering/inspection and before fitting the core halves/clips.

No purchase, reservation, supplier message or fabrication upload was made.
A [supplier review draft](manufacturing-prototype/SUPPLIER-REVIEW-REQUEST.txt)
is included, not sent. The [82-reference ratings audit](COMPONENT-RATINGS.md)
retains electrical holds for magnetics, capacitors, input transients and startup/
fault protection. Clean CAD checks do not establish a working 60 W converter.

## Reproduction and provenance

`redraw_schematic.py` reconstructs the schematic from the manifest and bundled
symbols; `rebuild_board.py` generates the native routed board from the bundled
footprints and explicit placement/routing definitions. Use KiCad's Python for
pcbnew scripts. Run `audit_routing_and_silk.py` before `export_review.py`; the
export requires its matching PCB hash, then gates on clean ERC, DRC and parity.
The verified legend is exported directly without solder-mask clipping.
See [validation](VALIDATION.md) for the independent geometry/assembly audits.

`repair_manufacturing_footprints.py` reproduces the dimensioned library repairs.
The board generator and geometry audits require Shapely 2.x. Pass its installed
site-packages directory as the first argument when using KiCad Python.

`regenerate_magnetics.mjs` uses Node and a Planar Studio checkout passed as its
first argument. The original reference is repository commit
`71f6f4db9c1a7172bddca8c9c934d3a8ece2a481`. The importable
`planar-studio/T1.planar.json` is a four-section seed (P,S,S,P); the final
`T1-artwork.json` and `T1-windings.kicad_pcb` duplicate each secondary section
onto an adjacent layer. Importing the seed alone does not recreate the six
final winding layers. The winding review PCB is not the complete converter.

KiStack PCB, footprint, schematic, BOM and export guidance was
used. Official manufacturer and JLCPCB/LCSC sources were used directly with
the user's approval. [Source study](PER-DESIGN-STUDY.md),
[layout resources](DEEP-LAYOUT-REVIEW.md), [licenses](THIRD-PARTY-NOTICES.txt).
MIT PER, Rick Hartley, Robert Feranec and Phil's Lab are independent references;
no affiliation or endorsement is implied. Earlier review documents describe
historical revisions; this A13 guide and the current issue register take precedence.
