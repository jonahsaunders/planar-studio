# JLCPCB-managed panelization — A1 handoff

JLCPCB is to prepare the assembly panel from the **50 × 104 mm single-board design**. The package supplies one converter's geometry and placement data. No customer-designed panel is supplied or required by this handoff.

## Files to provide

- [Single-board Gerbers and drills](GERBERS-REVIEW-ONLY.zip)
- [Electronic BOM](BOM-JLCPCB.csv)
- [Single-board placement file](CPL-JLCPCB.csv)
- [Single-board selective fill/cap schedule](via-fill.csv)
- [Fabrication requirements](FABRICATION.md), [stack dimensions](../stackup.json) and [assembly drawing](assembly-top.svg)

All coordinates use the single board's lower-left datum: X is right and Y is up. The board envelope is X=0…50 and Y=0…104 mm. The BOM/CPL describe 24 electronic placements per converter, including the two through-hole connectors. JLCPCB must transform placements and the fill/cap schedule consistently when constructing its panel; do not apply the old panel's +10 mm offsets.

## Request from JLCPCB

1. Prepare rails, tooling holes, fiducials and panel dimensions suitable for Standard assembly. Supply the proposed panel drawing, boards per panel and finished-board quantity with the quotation. The requested quantity is five finished converters, not five panels.
2. Preserve the finished outline, all three internal core openings, four mounting holes, connector access, copper and stack dimensions. Propose tab locations and separation away from core openings and vulnerable components; assess MLCC stress during separation. Obtain approval for any design change.
3. Apply the selective fill/cap schedule to the 66 electrical interlayer holes per board. Keep connector, mounting, panel tooling and separation holes open.
4. Return the assembly orientation preview, including U1, diodes, polarized capacitors and connectors, for review before manufacture. Agree tooling, stencil, connector soldering and the component-temperature profile in FABRICATION.md.
5. Complete soldering, inspection and panel separation before the separately prepared ferrite cores are installed.

JLCPCB offers [Panel by JLCPCB](https://jlcpcb.com/help/article/how-do-i-order-a-panel); its [panelization guidance](https://jlcpcb.com/help/article/pcb-panelization) describes automatic tooling holes and fiducials on requested edge rails. The online service restricts complex outlines, so obtain factory confirmation of a suitable panel and separation method for this board. Its [Standard assembly limits](https://jlcpcb.com/capabilities/pcb-assembly-capabilities) list a 70 × 70 mm minimum and require rails and fiducials. The factory must resolve those handling requirements around the unchanged single-board design.

## Withdrawn customer panel

The earlier 70 × 124 mm customer panel is withdrawn. Its 3 mm mouse-bite tabs did not meet JLCPCB's published 5 mm minimum for that tab type; passing KiCad DRC did not establish factory acceptance. See [JLCPCB's panel specifications](https://jlcpcb.com/capabilities/pcb-capabilities/).

The obsolete panel exports, preset and generator have been removed from the active repository and review package; Git history retains the earlier proposal. Do not submit panel files from older downloads. This package remains an engineering feasibility/quotation handoff, with factory acceptance and physical qualification outstanding.
