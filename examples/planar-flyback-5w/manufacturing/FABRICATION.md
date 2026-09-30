# PS-FLYBACK-5W A1 — fabrication and assembly review

**Engineering prototype / quotation package. Not a production release.**

Build quantity for quotation: five complete converters. JLCPCB must procure all components and the prepared ferrite assembly, assemble both ferrite halves, and deliver complete units. Customer installation or customer-supplied cores does not satisfy the requested turnkey scope.

## Board fabrication

| Item | Proposed specification |
|---|---|
| Board | 50 × 104 mm; corners R2 mm; outline in Edge.Cuts |
| Material | FR-4, nominal 1.6 mm, six copper layers |
| Copper | 35 µm finished nominal on all six layers; confirm tolerances |
| Finish | ENIG; green solder mask; white legend |
| Smallest routed track / clearance | 0.25 mm smallest routed track; 0.20 mm minimum track/clearance rules; winding spacing 0.20 mm |
| Through vias | 0.30, 0.40 and 0.45 mm drills; identify in via schedule |
| Via-in-pad | Nonconductive epoxy filled and copper capped, including U1 thermal vias |
| Connector holes | 1.30 mm finished nominal; 1.00 mm maximum pins; supplier to confirm fit/tolerance |
| Mounting holes | Four 3.2 mm NPTH holes; 41 × 95 mm center spacing; do not fill/cap; see MOUNTING.md |
| Core slots | Three routed, unplated openings; R0.50 mm corners; ±0.10 mm routing requested |
| Panelization | Supplier to propose rails/fiducials/tooling; no tabs inside core slots |
| Isolation | Functional low-voltage galvanic isolation only; no safety isolation voltage rating |

All electronic parts are on the front. Core halves occupy both faces. Complete reflow, connector soldering, cleaning and inspection before core installation. Avoid extra thermal processing after bonding the core. Respect each part's solder profile; Panasonic SVPF requires its applicable profile (peak 250 °C maximum), not an unrestricted 260 °C profile.

## Proposed stack, top to bottom

| Layer | Function | Copper / dielectric to next layer |
|---|---|---|
| L1 F.Cu | Components; primary section P1 (2 turns) | 0.035 / 0.100 mm |
| L2 In1.Cu | Secondary S1 (2 turns) | 0.035 / 0.400 mm |
| L3 In2.Cu | Secondary inner-terminal escape | 0.035 / 0.390 mm |
| L4 In3.Cu | Quiet VIN feed; SW and suppression stay on F.Cu | 0.035 / 0.400 mm |
| L5 In4.Cu | Secondary S2 (2 turns, parallel with S1) | 0.035 / 0.100 mm |
| L6 B.Cu | Primary P2 (series with P1); separated local ground pours | 0.035 mm |

Total copper plus dielectric is 1.600 mm; solder mask is additional. These dimensions are entered in the KiCad source. **This is a proposed stack, not an identified JLCPCB standard stack code.** JLCPCB must confirm the build or return a manufacturable alternative with exact copper and dielectric thicknesses. Rerun Planar Studio with actual heights before release. Do not pour planes through the winding area.

## Files and coordinate convention

- Gerbers and drills share the bottom-left board datum: original KiCad coordinate (75, 137) mm. Export X is right, Y is up; the board envelope is X=0…50 and Y=0…104 mm.
- `BOM-JLCPCB.csv` and `CPL-JLCPCB.csv` contain the same 24 electronic references, including two through-hole connectors for the quoted manual process. T1 is integral board copper and a separately quoted mechanical operation, not an SMT placement.
- `CORE-BOM.csv` describes separate prepared-core, bonding and retention operations. Raw cores may be procured from DigiKey; these items are outside the board-electronics sourcing requirement and need a separately agreed process.
- `via-fill.csv` lists 66 filled/capped interlayer holes (61 vias and five T1 holes); four connector holes remain open. Total plated drill count is 70, plus four NPTH mounting holes. It distinguishes vias and planar interlayer holes from connector holes. Fill/cap all listed vias and T1 interlayer holes. **Do not fill J1/J2 connector holes or H1–H4 mounting holes.** T1 pads 1–5 are electrical test/interlayer locations, not component leads.
- PGND and ISO GND each have one 1.2 mm probe land, exposed on the top mask only, filled/capped and without paste. Preserve those openings. J1/J2 ground pins use 0.30 mm thermal gaps and 0.50 mm spokes; validate solderability.
- CPL angles are KiCad angles. JLCPCB must reconcile its library zero rotations against the assembly drawing, especially U1, D1–D4 and C3; verify pin 1 and polarity in the assembly preview before approval.
- J1 pin 1 is positive at the left when viewed from the top. J2 pin 1 is positive at the right. Wire-entry sides face their nearest board end.
- All exported manufacturing data is A1 review data. A release requires agreement on stack, component sourcing, core preparation, retention and tests.

## Required vendor response

1. Confirm sourcing and assembly of all 24 electronic placements per `BOM-JLCPCB.csv`; cores may be sourced separately from DigiKey.
2. Confirm a compatible reflow profile for F1 and C3/C8, a compliant Standard assembly panel, and any sourcing exceptions in `JLCPCB-SOURCING.md`. Core grinding, installation and magnetic acceptance require a separate agreement before the complete converter can be tested.
3. Confirm the stack, slot tolerance, via filling, connector soldering and component substitutions (if any).
4. Return an assembly preview, sourcing exceptions, NRE/tooling charges, lead time and quotation. Do not substitute ungapped core halves, an ordinary catalog transformer, the LT8302-3, or a bidirectional TVS.

No quotation has been requested and no supplier has accepted this build.
