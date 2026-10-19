# A8 — SW terminal clearance repair

![Actual A7 and A8 front copper at the SW landing](evidence/audit/sw-landing-before-after.png)

A7's wide SW approach to T1 pad 2 overlapped the front primary winding by approximately 0.075 mm. The other SW approach left only approximately 0.125 mm clearance. The primary is a net tie, so ordinary KiCad DRC permitted those nets to join. The old pad-center and winding-centerline checks did not inspect the incoming trace widths.

A8 narrows the final 1 mm of each approach to 0.6 mm, matching the primary winding width. The rest of each route retains its original width and centerline. The resulting nominal edge clearance to F.Cu winding is approximately 0.225 mm, above the board's 0.20 mm rule. Winding artwork, pads, vias, components, placements, stack and board/core-slot outlines are unchanged. No components or jumper wires are added.

The new `verify-winding-clearance.py` checks actual routed copper, vias, plated pads and filled zones against all four winding polygons. Intentional connections are permitted only within a 0.8 mm radius of the correct terminal for that layer and net. This check operates independently of net-tie DRC permissions. Its polygon conversion tolerance is 0.0005 mm; the clearance check conservatively accounts for conversion tolerance.

`verify-a8-revision.py` compares against A7 commit `8dca6ed98bcd7ba8268f86910679d13682896f17`, verifies the two local route changes and confirms that the original A7 fails the new clearance gate. It bounds integer-coordinate refill slivers to less than 0.00001 mm² within the local SW route envelope. `test-winding-clearance.py` exercises five passing/rejection cases, including a restored short, insufficient clearance without a short, an added via and an oversized pad.

The rebuild runs these gates before manufacturing export. Native ERC/DRC, all-category DRC, schematic parity, placement, manufacturing agreement and existing geometry checks are also rerun; see [current validation](VALIDATION.md). Use the A8 native PCB and freshly exported A8 Gerber ZIP together. Earlier A7 archives remain historical and must not be used for this corrected build.

This repairs the identified CAD fault. It does not establish measured efficiency, current capability, thermal margin, isolation performance or first-article acceptance. Inspect the SW landing and verify the assembled primary inductance and turns ratio during bring-up as described in the prototype test plan.
