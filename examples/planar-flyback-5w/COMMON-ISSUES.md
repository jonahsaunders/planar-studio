# Planar Studio PCB issues and checks

Use this reference when integrating generated windings into a routed PCB. The two defects below were found in the 5 W flyback example and corrected by PCB revision A9. They demonstrate limits of the example's earlier validation and of ordinary net-tie DRC. They do not establish that every Planar Studio design has these defects, or that the application now verifies every possible winding geometry.

The generator's nominal dimensions, a clean DRC report and a continuity beep are not sufficient evidence that current follows the intended turns. Check the actual copper, its layer transitions and the final fabrication exports.

## Recorded defects

| Issue | Observed design | Why it escaped | Correction and prevention |
| --- | --- | --- | --- |
| External track shorts a winding turn | A7: the 1.2 mm SW landing at T1.2 overlapped F.Cu winding copper by about 0.075 mm. A second 0.8 mm approach left about 0.125 mm clearance. | Primary pads 1, 2 and 5 belong to one net-tie group. DRC allows their intentional DC connection; pad-center tests ignored the incoming track width. | A8 narrowed the final 1 mm of both SW approaches to 0.6 mm. A9 retains those necks at the relocated terminal. Check track/via/pad/pour outlines against each winding, with only local, layer-specific terminal contacts permitted. |
| Actual turn spacing is smaller than the generator setting | A7 and A8: a 0.20 mm spacing setting produced approximately 0.19105 mm at sloped rectangular-spiral corners on F.Cu, B.Cu, In1.Cu and In4.Cu. | The setting controls nominal pitch minus width, not minimum perpendicular distance everywhere. Each layer is one polygon, so ordinary object-to-object DRC did not test its internal gaps. | A9 requests 0.25 mm spacing. Measured gaps at the tightest nominal turn pairs are approximately 0.23978 mm; the conservative bound is 0.23678 mm. The independent check rejects the old artwork and compares final copper with its intended path. |

![Actual copper before and after the turn-spacing repair](evidence/audit/turn-spacing-before-after.png)

The first defect was a copper short. The second had a positive gap but violated the specified 0.20 mm design rule. The two conditions require different descriptions and should not be conflated.

## Checks that catch these failures

1. **Check the completed copper, including route widths.** `scripts/verify-winding-clearance.py` checks tracks, vias, plated pads and filled zones against all four winding polygons. T1's intended connections are F.Cu: pads 1/5; B.Cu: pads 2/5; In1.Cu and In4.Cu: pads 3/4. A pad belongs to a particular winding end; its net name does not permit contact anywhere along that winding. The checker allows contact only near the appropriate terminal and on the appropriate layer.
2. **Measure gaps within each winding.** `scripts/verify-winding-integrity.py` checks nonadjacent centerline segments, bounds the final copper to the intended stroke envelope, rejects missing/extra copper, and measures the saved polygon edges at the tightest nominal turn pair. With `--gerbers manufacturing/gerbers`, it also requires the four exported winding regions to equal the checked native polygons.
3. **Check the intended current path.** `scripts/export-copper-geometry.py` plus `scripts/audit-winding-topology.py` reconstruct physical connectivity across six layers and plated barrels. Virtual cuts through winding conductors must break the expected path. Each parallel secondary is tested separately so the other branch cannot hide a bypass. This catches the original A7 shortcut even though VIN and SW are intentionally DC-connected through the primary.
4. **Rerun native rules and export checks.** ERC, all-category DRC, schematic parity, board/core-edge clearance, terminal attachment, package mapping and manufacturing-data checks remain necessary. Independent winding checks complement them.

The integrity checker is scoped to this example's simple two-turn-per-layer paths. It excludes segments less than 2 mm apart along the path as adjacent conductor, and allows a 0.0015 mm stroke-envelope tolerance. The virtual-cut test skips terminal lands and cuts that cannot fully sever a short corner segment. These are explicit limits, not general proofs for arbitrary branched, tapped or tightly folded artwork. Review and extend the checks when using another winding topology.

## Related integration pitfalls

| Pitfall | Practical check |
| --- | --- |
| Increasing spacing moves terminals and attached routes | Recheck every affected approach and all layers. In A9, the 1.3 mm SEC_A route end would have left only 0.372 mm to the core opening after its terminal moved. Its final 1 mm now narrows to 0.6 mm, and the 0.50 mm board-edge rule passes. |
| A plated terminal touches a winding on an unintended layer | Evaluate the full pad diameter and barrel on every copper layer, including layers without a winding. Do not check only the layer where the external track is drawn. |
| Continuity testing appears to confirm a shortcut was removed | An intended winding already connects its terminals at DC. A continuity beep across two nearby points cannot distinguish the full winding from a bypass. Use visual copper inspection and appropriately isolated inductance/turns-ratio measurements. |
| Centerlines are correct but copper was widened, filled or bridged | Check both missing copper and extra copper against the intended path. A test that merely confirms every centerline point lies inside copper will also pass a solid copper sheet. |
| Correct native PCB, stale manufacturing ZIP | Regenerate Gerbers and drills after edits. Match native-board and export hashes, compare the exported winding regions, and use the BOM/CPL from that same package. |
| Correct PCB, incorrect assembly preview | Manufacturer placement datums and angles can differ from KiCad's. Check actual pad/pin locations and polarity in the fresh factory preview; see the placement review in this package. |

## A9 disposition and evidence

The 0.6 mm winding width, four primary turns, two secondary turns, series/parallel connections, core pair, stack, electrical values and component placements remain intact. The requested spacing is 0.25 mm, and both outer primary terminals have a 0.10 mm radial offset. T1 terminals, its internal series transition and the attached approach segments move with the generated geometry. The SEC_A landing gains a 0.6 mm neck; the SW necks remain. Other board routes, external vias and board/core openings are retained.

The estimated magnetizing inductance remains 13.12 µH. Resistance, leakage and capacitance estimates are regenerated from the revised paths; see the A9 revision comparison. Physical magnetic, fault, thermal and EMI performance still require prototype measurements.

- [Repair history](WINDING-CLEARANCE-REVISION.md)
- [Current validation and scope](VALIDATION.md)
- [Spacing and Gerber checks](evidence/audit/winding-integrity-checks.json)
- [External copper clearance](evidence/audit/winding-clearance-checks.json)
- [Physical connectivity and virtual cuts](evidence/audit/copper-topology-checks.json)
- [A8-to-A9 change containment](evidence/audit/a9-revision-checks.json)
- [Placement review](manufacturing/PLACEMENT-REVIEW.md)

The rebuild runs nine regression tests covering correct copper, the old 0.191 mm gap, added/missing winding copper, wide terminal lands, insufficient clearance and a via on the winding. Preserve these failing examples when changing the generator or checking code. Record future issues with the affected revision, measured geometry, reason the existing check missed it, repair and a regression case that fails the original defect.
