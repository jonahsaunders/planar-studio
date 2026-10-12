# JLCPCB order handoff — CoilTile A3 prototype

Upload `CoilTile-A3-fabrication.zip` for PCB fabrication, `BOM-JLCPCB.csv` for
parts, and `CPL-JLCPCB.csv` for placement. Gerbers/drills/CPL share a plot origin
at the board's bottom-left bounding corner; placement units are millimeters,
X right and Y up. All components are top side. Do not mirror the CPL.

| Setting | Requested value |
|---|---|
| Quantity | Five prototypes for the planning estimate; choose in quote |
| Dimensions | 72 × 90 mm bounding rectangle, 2 mm chamfered corners |
| Material/thickness | FR-4, 1.6 mm nominal |
| Layer order | F.Cu → In1.Cu → In2.Cu → B.Cu |
| Copper | 1 oz outer, standard four-layer inner copper |
| Finish | Lead-free HASL is acceptable; ENIG optional at extra cost |
| Soldermask/silk | Green / white; coils remain masked |
| Assembly | Top only; all 20 BOM placements |
| Vias | Through only, minimum finished drill 0.20 mm, minimum pad 0.45 mm |
| Routing | Minimum rule 0.15 mm width/clearance; coils 0.20/0.20 mm |
| Special processes | No blind/buried vias, no filled/capped via-in-pad |
| USB connector | Populate J1 and solder all shell stakes, not just SMD contacts |
| Programming | None |

Use the standard four-layer stack compatible with this thickness/copper. No
controlled-impedance guarantee is specified. The full-speed USB traces are
short, with a ground reference beneath the digital region. This is not a
high-speed USB or certified RF board. Do not allow a supplier to add planes
under the four sensor disks or remove the custom copper winding polygons.

The QFN exposed pad uses divided paste apertures and external ground vias.
Inspect/reflow the exposed pad correctly; ask for applicable QFN/X-ray inspection.
L1–L4 are printed coils and must **not** be purchased or mounted. TP1–TP4 and
H1–H4 likewise do not appear in the assembly BOM. The only through-hole solder
features on an assembled part are J1's shell stakes; confirm the chosen service
includes those joints. Service eligibility and fee totals were not approved by
JLCPCB during this design task.

## Placement review before paying

The supplied rotations are KiCad convention normalized to 0–360°, converted
with KiStack's position workflow. Supplier catalog zero-angle definitions can
differ: **inspect JLCPCB's visual assembly preview**, especially U1–U4 and J1.
Pin 1 on U2 is top-left in the stock footprint's local orientation; use actual
pad numbers in KiCad/top assembly SVG as the authority, not a guessed body mark.
All IC packages and LCSC codes are explicit; do not accept same-name clone
substitutions for U4 or an alternative MCP2221 package. Match U3's 4×4 mm WQFN
and 2.6×2.6 mm exposed pad.

Read the tool-generated PTH and NPTH files separately. Mounting pads use 6.4 mm exposed-substrate mask openings with an outward
extension to the side edge and 10 mm all-layer copper exclusions, exactly as
in the other Planar Studio examples. Use nonconductive hardware with contact
diameter no greater than 6.4 mm.

Nonplated holes are the
four 3.2 mm mounting holes and the USB locating holes. Plated slots are J1's
shell stakes. Board holes are not vias that may be removed.

Allow approximately US$85–120 for five assembled boards before freight/tax,
subject to the actual cart. Twelve distinct BOM lines include extended parts;
setup/extended fees, handling/wastage and connector/QFN process costs matter.
The price estimate is not a guarantee or a completed quote. Recheck stock and
reserve parts as part of order checkout. No order or payment was made.
