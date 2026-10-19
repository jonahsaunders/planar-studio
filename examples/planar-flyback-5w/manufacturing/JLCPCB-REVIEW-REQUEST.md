# Feasibility-request template — not sent

Reference only. The following is a reusable draft; it has not been sent by this workflow and does not itself authorize purchase or fabrication.

Please review the attached PS-FLYBACK-5W A8 package for five fully assembled engineering prototypes. It is an 18–36 V DC input, isolated 5 V / 1 A flyback converter with the transformer windings built into a six-layer PCB.

Please source and assemble every board-mounted electronic component, including both through-hole connectors. The planar ferrite cores may be procured separately from DigiKey and are outside this electronic PCBA sourcing request. After PCBA/depanelization, install two B66285G0050X187 factory-gapped halves and two B66286A2000X000 clips. No machining or adhesive is specified. Verify the clip envelope and measured 11.0–14.6 uH primary inductance per CORE-ASSEMBLY.md.

F1 is now Bourns SF-1206F100-2 / C3164649. Please confirm a compatible component-temperature profile: Bourns recommends a 245–250 C peak for 5 seconds and at least 230 C for 30 +/-10 seconds. Include the Panasonic SVPF capacitor limits and Bourns CRM2512 recommendation in the same component-level profile review.

Please use your ordinary six-layer 1.6 mm construction with 1 oz inner and 1 oz outer copper, OSP finish, Specify Stackup: No, and no impedance control. No named-stack upgrade is requested. The reference model uses the October 8 No requirement table (1.609 mm copper/dielectric sum); please provide the actual standard construction for our winding review rather than imposing these exact internal dimensions. Confirm the ±0.20 mm internal-slot routing allowance, filled/capped vias, through-hole connector assembly, and any component sourcing exceptions. The KiCad project, Gerbers/drills, electronic BOM/CPL, separate core BOM, via schedule and proposed test plan are included.

Please use the current corrected CPL-JLCPCB.csv and return a fresh orientation preview against PLACEMENT-REVIEW.md and placement-review.svg. Check U1 pin 1, diode/capacitor polarity, and outward-facing J1/J2 openings. The raw KiCad export does not contain the catalog-frame corrections.

Please return feasibility, sourcing exceptions, proposed assembly method, lead time, tooling/NRE and quotation. This is a design-for-manufacture review only; do not start fabrication or purchase materials. The A8 design still requires first-article electrical, thermal and magnetic validation.

Please prepare the assembly panel yourselves from the supplied 44 × 94 mm single-board Gerbers, BOM, CPL and selective fill/cap schedule. The earlier customer-designed panel is withdrawn. Add suitable rails, tooling and fiducials, and propose tab locations and separation that preserve the core openings, mounting features and component clearances. Transform the placement and via-fill coordinates consistently. Return the proposed panel drawing and assembly orientation preview for review; do not alter the board outline, copper or internal slots without approval. See PANEL.md for the handoff requirements.

The requested quantity is five finished converter boards, not five panels; state the proposed panel count, boards per panel and any quantity adjustment in the quotation. All 20 electronic MPNs had orderable catalog stock on their individual snapshot dates: September 30, except R6 on October 9 and R1/R7 on October 16. A8 retains R1 as UNI-ROYAL 0603WAF6493T5E / C25821 at the same 649 kΩ ±1% value and 0603 package. Please confirm allocation and attrition, and the replacement's centered placement in the fresh preview.
