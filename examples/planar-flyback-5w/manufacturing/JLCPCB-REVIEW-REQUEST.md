# Feasibility-request template — not sent

Reference only. This example was published to GitHub instead of being submitted to JLCPCB. No supplier has received this request or the design files, and no purchase or fabrication is authorized. The following is a reusable draft, not an active request.

Please review the attached PS-FLYBACK-5W A3 package for five fully assembled engineering prototypes. It is an 18–36 V DC input, isolated 5 V / 1 A flyback converter with the transformer windings built into a six-layer PCB.

Please source and assemble every board-mounted electronic component, including both through-hole connectors. The planar ferrite cores may be procured separately from DigiKey and are outside this electronic PCBA sourcing request. After PCBA/depanelization, install two B66285G0050X187 factory-gapped halves and two B66286A2000X000 clips. No machining or adhesive is specified. Verify the clip envelope and measured 11.0–14.6 uH primary inductance per CORE-ASSEMBLY.md.

F1 is now Bourns SF-1206F100-2 / C3164649. Please confirm a compatible component-temperature profile: Bourns recommends a 245–250 C peak for 5 seconds and at least 230 C for 30 +/-10 seconds. Include the Panasonic SVPF capacitor limits and Bourns CRM2512 recommendation in the same component-level profile review.

Please also confirm JLC061611-1080A (1.6 mm order class, published copper/dielectric sum 1.618 mm) or return exact dimensions for an alternative, Â±0.20 mm internal-slot routing allowance, filled/capped vias, through-hole connector assembly, and any component sourcing exceptions. The KiCad project, Gerbers/drills, electronic BOM/CPL, separate core BOM, via schedule and proposed test plan are included.

Please use the current corrected CPL-JLCPCB.csv and return a fresh orientation preview against PLACEMENT-REVIEW.md and placement-review.svg. Check U1 pin 1, diode/capacitor polarity, and outward-facing J1/J2 openings. The raw KiCad export does not contain the catalog-frame corrections.

Please return feasibility, sourcing exceptions, proposed assembly method, lead time, tooling/NRE and quotation. This is a design-for-manufacture review only; do not start fabrication or purchase materials. The A3 design still requires first-article electrical, thermal and magnetic validation.

Please prepare the assembly panel yourselves from the supplied 44 × 94 mm single-board Gerbers, BOM, CPL and selective fill/cap schedule. The earlier customer-designed panel is withdrawn. Add suitable rails, tooling and fiducials, and propose tab locations and separation that preserve the core openings, mounting features and component clearances. Transform the placement and via-fill coordinates consistently. Return the proposed panel drawing and assembly orientation preview for review; do not alter the board outline, copper, stack or internal slots without approval. See PANEL.md for the handoff requirements.

The requested quantity is five finished converter boards, not five panels; state the proposed panel count, boards per panel and any quantity adjustment in the quotation. All 20 electronic MPNs had orderable catalog stock on September 30; please confirm allocation and attrition for five assembled boards.
