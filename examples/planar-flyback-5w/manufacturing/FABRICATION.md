# PS-FLYBACK-5W A3 — fabrication and assembly review

**Engineering prototype / quotation package. Not a production release.**

Budgeting quantity: five boards with all electronic components sourced and assembled by JLCPCB. Factory-gapped ferrite cores may be procured separately from DigiKey. Core installation, retention and magnetic acceptance require a separate qualified process; they are outside the electronic PCBA sourcing requirement.

## Board fabrication

| Item | Proposed specification |
|---|---|
| Board | 44 × 94 mm; corners R2 mm; outline in Edge.Cuts |
| Material | FR-4, nominal 1.6 mm, six copper layers |
| Copper | 35 µm external / 30 µm internal in published 1 oz stack; confirm tolerances |
| Finish | ENIG; green solder mask; white legend |
| Smallest routed track / clearance | 0.25 mm smallest routed track; 0.20 mm minimum track/clearance rules; winding spacing 0.20 mm |
| Through vias | 0.30, 0.40 and 0.45 mm drills; identify in via schedule |
| Via-in-pad | Nonconductive epoxy filled and copper capped, including U1 thermal vias |
| Connector holes | 1.30 mm finished nominal; 1.00 mm maximum pins; supplier to confirm fit/tolerance |
| Mounting holes | Four 3.2 mm NPTH holes; 35 × 85 mm center spacing; 10 mm copper exclusion and 1.8 mm copper-to-mask margin on all six layers; do not fill/cap; see MOUNTING.md |
| Core slots | Three routed, unplated openings; R0.50 mm corners; ±0.20 mm per-wall routing allowance in the A3 fit model |
| Panelization | JLCPCB to prepare the assembly panel from the single-board files; return a panel drawing for review; see PANEL.md |
| Isolation | Functional low-voltage galvanic isolation only; no safety isolation voltage rating |

All electronic parts are on the front. Core halves occupy both faces. Complete reflow, connector soldering, cleaning and inspection before core installation. Avoid extra thermal processing after clipping the core. Respect each part's solder profile; Panasonic SVPF requires its applicable profile (peak 250 °C maximum), not an unrestricted 260 °C profile.

A3 allows 0.20 mm inward error on every internal-slot wall, including R0.50 corners, and does not depend on a precision-routing upgrade. The smallest actual slot width is 5.4 mm, above JLCPCB's 1.0 mm nonplated-slot minimum. Confirm the delivered internal-slot dimensions and stack at DFM review. See [JLCPCB capabilities](https://jlcpcb.com/capabilities/pcb-capabilities/) and [core fit evidence](../evidence/audit/core-fit-checks.json).

## Named JLCPCB stack

Use **JLC061611-1080A**, selected under six layers / 1.6 mm / 1 oz outer / 1 oz inner on the [JLCPCB stack page](https://jlcpcb.com/impedance), observed September 30, 2026. Published copper-plus-dielectric thickness is **1.618 mm**, excluding mask; 1.6 mm is the nominal ordering class. CAD and winding heights use the published sum. Confirm delivered thickness and copper tolerances with the factory.

| Layer | Function | Copper / dielectric to next layer |
| --- | --- | --- |
| F.Cu | Components; primary P1 | 0.035 / 0.069 mm, 1080 |
| In1.Cu | Secondary S1 | 0.030 / 0.400 mm core |
| In2.Cu | Secondary terminal escape | 0.030 / 0.490 mm, 7628 + 1080 + 7628 |
| In3.Cu | Quiet VIN feed | 0.030 / 0.400 mm core |
| In4.Cu | Secondary S2, parallel with S1 | 0.030 / 0.069 mm, 1080 |
| B.Cu | Primary P2, series with P1 | 0.035 mm |

The winding model uses 30 µm for all winding layers to conservatively screen DC resistance; it does not predict AC/fringing loss or guarantee manufactured minimum copper. Winding centers relative to F.Cu center are 0 / 0.1015 / 1.4815 / 1.583 mm. Full source data is in [stackup.json](../stackup.json). Factory acceptance and first-article measurements remain required. Keep ground planes out of the winding region.

## Files and coordinate convention

- Gerbers and drills share the bottom-left board datum: original KiCad coordinate (78, 132) mm. Export X is right, Y is up; the board envelope is X=0…44 and Y=0…94 mm.
- `BOM-JLCPCB.csv` and `CPL-JLCPCB.csv` contain the same 24 electronic references, including two through-hole connectors for the quoted manual process. T1 is integral board copper and a separately quoted mechanical operation, not an SMT placement.
- `CORE-BOM.csv` describes separate factory-gapped halves and clips. Factory-gapped cores may be procured from DigiKey; these items are outside the board-electronics sourcing requirement and need a separately agreed process.
- `via-fill.csv` lists 66 filled/capped interlayer holes (61 vias and five T1 holes); four connector holes remain open. Total plated drill count is 70, plus four NPTH mounting holes. It distinguishes vias and planar interlayer holes from connector holes. Fill/cap all listed vias and T1 interlayer holes. **Do not fill J1/J2 connector holes or H1–H4 mounting holes.** T1 pads 1–5 are electrical test/interlayer locations, not component leads.
- PGND and ISO GND each have one 1.2 mm probe land, exposed on the top mask only, filled/capped and without paste. Preserve those openings. J1/J2 ground pins use 0.30 mm thermal gaps and 0.50 mm spokes; validate solderability.
- CPL angles are KiCad angles. JLCPCB must reconcile its library zero rotations against the assembly drawing, especially U1, D1–D4 and C3; verify pin 1 and polarity in the assembly preview before approval.
- J1 pin 1 is positive at the left when viewed from the top. J2 pin 1 is positive at the right. Wire-entry sides face their nearest board end.
- All exported manufacturing data is A3 review data. A release requires agreement on stack, component sourcing, core installation, retention and tests.

## Required vendor response

1. Confirm sourcing and assembly of all 24 electronic placements per `BOM-JLCPCB.csv`; cores may be sourced separately from DigiKey.
2. Confirm a compatible reflow profile for F1, R8 and C3/C8, propose a compliant Standard assembly panel, and identify any sourcing exceptions in `JLCPCB-SOURCING.md`. Core clipping, installation and magnetic acceptance require a separate agreement before the complete converter can be tested.
3. Confirm the stack, slot tolerance, via filling, connector soldering and component substitutions (if any).
4. Return an assembly preview, sourcing exceptions, NRE/tooling charges, lead time and quotation. Do not substitute ungapped core halves, an ordinary catalog transformer, the LT8302-3, or a bidirectional TVS.

No quotation has been requested and no supplier has accepted this build.

## JLCPCB-managed panelization

Supply `GERBERS-REVIEW-ONLY.zip`, `BOM-JLCPCB.csv`, `CPL-JLCPCB.csv` and `via-fill.csv` from this directory. All four describe one 44 × 94 mm board in the same coordinate system. Request panelization by JLCPCB, including assembly rails, tooling, fiducials and a suitable separation process. JLCPCB must transform the placement and selective fill/cap coordinates consistently into its panel.

The earlier customer-designed panel is withdrawn and excluded from the current review package. Do not use its Gerbers or placement files from older downloads. Review JLCPCB's proposed panel, component orientation preview and finished-board quantity before authorizing fabrication. See [panelization requirements](PANEL.md).
