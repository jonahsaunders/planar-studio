# Board-assembly sourcing audit

**Scope:** JLCPCB sources and assembles the 24 electronic placements (20 unique MPNs), including both through-hole connectors. Raw ferrite cores may come separately from DigiKey. Integral PCB windings remain on the converter board. The custom core gap, retention, installation and magnetic acceptance still need a qualified process; an ungapped stock pair is not a substitute.

Catalog observations: **September 29, 2026, America/New_York / September 30 UTC**. These are live-page snapshots, not reserved inventory, quotations or delivery promises. Unchanged rows retain that audit date. R3/R4/R5 changed on September 30; their new MPNs have no verified JLCPCB sourcing observation.

**13 unchanged MPNs had stock (one low); four require pre-order; three revised feedback MPNs need sourcing verification.** This covers 17 placements with dated stock, four requiring pre-order and three unverified. The 17 remaining exact catalog matches are Extended parts. These are dated observations, not current inventory guarantees.

## Fuse replacement

F1 changes from unavailable Littelfuse 0466001.NR / C151134 to **Bourns SF-1206F100-2 / C3164649**. JLCPCB showed 2,931 headline stock, **2,928 available to order**, minimum one, and $0.2405 at the one-piece tier before assembly/shipping. [JLCPCB listing](https://jlcpcb.com/partdetail/BOURNS-SF_1206F1002/C3164649).

The replacement is 1 A, 63 V DC, fast acting, with 50 A interruption at 63 V DC. Its typical melting I²t is 0.034 A²s versus the old fuse's 0.0423 A²s, so repeat inrush/coordination validation. Approximately 0.40 A operating input current is a screening estimate, not a measured RMS or thermal result. Confirm the source fault current and startup behavior. [Manufacturer specification](https://www.bourns.com/docs/product-datasheets/sf-1206f.pdf).

The footprint now uses two 1.25 × 1.65 mm lands with a 2.20 mm gap and 4.70 mm outside span. Bourns' official series STEP geometry is bundled and oriented to KiCad's seating plane; the body is 3.10 × 1.55 × 0.60 mm. See [model provenance](3D-MODELS.md) and [change checks](evidence/audit/fuse-revision-checks.json).

## Coordinated feedback revision

R3/R4/R5 are now **115 kΩ / 10.8 kΩ / 128 kΩ**, using Vishay TNPW0603115KBEEA / TNPW060310K8BEEA / TNPW0603128KBEEA (0.1%, 25 ppm/°C). Values, resistance range, tolerance, TCR, package and order-code structure were checked against the [manufacturer series specification](https://www.vishay.com/docs/28758/tnpw_e3.pdf). Exact JLCPCB catalog matches, stock, prices and assembly eligibility remain unverified. Their previous codes and prices apply to the superseded values only and have been removed from the current BOM.

The 0603 footprint, placement, routing and generic model are retained. Conservative 0.1 W / 75 V design limits remain. Nominal output is 5.024 V; qualify the 17.5 V differential clamp target and final output/temperature trim. See [feedback calculations and prototype gates](FEEDBACK-REVISION.md).

## Remaining board-assembly work

- **C5, C6, R6, R8:** exact parts are listed for pre-order, with lead times and minimum/attrition quantities unconfirmed. Preserve capacitor bias/dielectric behavior and resistor pulse capability if substituting.
- **U1:** only five available in the dated observation; replenish for a five-board run with attrition.
- **R3/R4/R5:** verify exact new MPNs, catalog codes, stock and prices; old-value observations are historical only.
- **Reflow:** Bourns recommends 245–250 °C peak for 5 seconds and ≥230 °C for 30 ±10 seconds. Economic's published fixed 255 ±5 °C is incompatible; Standard's 240 ±5 °C does not automatically establish a compliant fuse process either. Have JLCPCB accept a component-level profile covering F1 and the SVPF capacitors before ordering. The fuse's 260 °C resistance-to-solder-heat test is not a recommended production profile.
- **Fabrication and panel:** the winding stack needs acceptance. The 50 × 104 mm board is narrower than Standard's published 70 × 70 mm minimum board/panel, so arrange a compliant panel/process frame, rails and fiducials. Include J1/J2 through-hole assembly.

[JLCPCB assembly capabilities](https://jlcpcb.com/capabilities/pcb-assembly-capabilities) · [Panasonic SVPF mounting limits](https://industrial.panasonic.com/cdbs/www-data/pdf/AAB8000/AAB8000COL10.pdf) · [Global Sourcing](https://jlcpcb.com/help/article/how-to-use-jlcpcb-global-sourcing-parts-service) · [Pre-order conditions](https://jlcpcb.com/help/article/pre-ordering-parts-terms-conditions).

## Every electronic part

“Available” is the site's Available Order Qty, rather than headline inventory. “Not shown” does not mean zero. Displayed minimum is a purchasing minimum, not a confirmed PCBA allowance. The fuse is populated once; J1/J2, D1/D3, C1/C2 and C3/C8 share their respective MPNs.

| References | Exact MPN | JLCPCB code | Status | Available | Minimum |
| --- | --- | --- | --- | ---: | ---: |
| J1, J2 | KF301-5.0-2P | [C474881](https://jlcpcb.com/partdetail/C474881) | Stocked | 75,211 | 1 |
| F1 | SF-1206F100-2 | [C3164649](https://jlcpcb.com/partdetail/BOURNS-SF_1206F1002/C3164649) | Stocked | 2,928 | 1 |
| D1, D3 | DFLS1100-7 | [C107674](https://jlcpcb.com/partdetail/C107674) | Stocked | 30,800 | 1 |
| C1, C2 | CL32B106KBJNNNE | [C138687](https://jlcpcb.com/partdetail/C138687) | Stocked | 2,369 | 1 |
| D2 | PDS835L-13 | [C444972](https://jlcpcb.com/partdetail/C444972) | Stocked | 834 | 1 |
| C3, C8 | 16SVPF180M | [C136277](https://jlcpcb.com/partdetail/C136277) | Stocked | 938 | 1 |
| C4 | CL32B226KOJNNNE | [C55530](https://jlcpcb.com/partdetail/C55530) | Stocked | 63,041 | 1 |
| U1 | LT8302ES8E#PBF | [C117331](https://jlcpcb.com/partdetail/C117331) | Low stock | 5 | 1 |
| C5 | CL10A475KO8NQNC | [C377756](https://jlcpcb.com/partdetail/C377756) | Pre-order | Not shown | 473 |
| R1 | RC0603FR-07649KL | [C245991](https://jlcpcb.com/partdetail/C245991) | Stocked | 94 | 1 |
| R2 | RC0603FR-0761K9L | [C137696](https://jlcpcb.com/partdetail/C137696) | Stocked | 2,560 | 1 |
| R3 | TNPW0603115KBEEA | [Unverified; manufacturer spec](https://www.vishay.com/docs/28758/tnpw_e3.pdf) | Unverified | Not shown | Not shown |
| R4 | TNPW060310K8BEEA | [Unverified; manufacturer spec](https://www.vishay.com/docs/28758/tnpw_e3.pdf) | Unverified | Not shown | Not shown |
| R5 | TNPW0603128KBEEA | [Unverified; manufacturer spec](https://www.vishay.com/docs/28758/tnpw_e3.pdf) | Unverified | Not shown | Not shown |
| R6 | ERJ-P08F39R0V | [C4059605](https://jlcpcb.com/partdetail/C4059605) | Pre-order | Not shown | 594 |
| C6 | CGA4C4C0G2W471J060AA | [C2172062](https://jlcpcb.com/partdetail/C2172062) | Pre-order | Not shown | 590 |
| D4 | SMAJ12A-13-F | [C134947](https://jlcpcb.com/partdetail/C134947) | Stocked | 9,677 | 1 |
| R7 | RC1206FR-07220RL | [C137353](https://jlcpcb.com/partdetail/C137353) | Stocked | 303,316 | 1 |
| R8 | CRCW25122R20FKEGHP | [C4168885](https://jlcpcb.com/partdetail/C4168885) | Pre-order | Not shown | 8 |
| C7 | EEHZC1J470P | [C454353](https://jlcpcb.com/partdetail/C454353) | Stocked | 427 | 1 |

## Separate core procurement and qualification

The raw TDK B66457G0000X187 halves may be purchased from DigiKey; this audit makes no new DigiKey inventory claim. Two raw halves still need the PS-MAG-001 prepared-pair process and magnetic checks. No JLCPCB code is applied to T1 as though a raw half were a complete transformer. Core adhesive, activator and retention remain in the separate core BOM, with their process and installation responsibility to be agreed. H1–H4 are fabricated holes; illustrative 3D screws/standoffs are not purchased BOM lines.

## Five-board planning budget

**Estimated USD 320–500 for five assembled electronic boards, approximately USD 65–100 each.** This is a planning allowance, not a design-accepted quotation. It assumes the stack can be accepted without custom-lamination engineering charges and allows for ordinary parts procurement. Excludes ferrite cores, grinding/installation, hardware, functional-test development, taxes/duties and redesign/re-spin costs.

| Item | Five-board allowance, USD |
| --- | ---: |
| Six-layer ENIG fabrication, 1 oz inner copper, filled/capped vias and panel/routing allowance | 80–120 |
| Electronic components, minimum purchases and attrition allowance | 110–150 |
| Standard assembly, setup, feeders, stencil, handling and inspection | 100–150 |
| Shipping allowance; destination/service not quoted | 25–60 |
| Arithmetic total before rounding/contingency | 315–480 |

The public JLCPCB calculator showed **$81.17** for five representative 70 × 114 mm blanks, six layers, 1.6 mm FR-4, ENIG, 1 oz inner/outer copper, epoxy filled/capped vias and precision outline routing. The larger rectangle is a budgeting allowance for rails, not a completed panel design. No Gerber, BOM or placement file was uploaded; no cart/order was submitted. The exact winding stack, internal slots and panel process were not priced or accepted by engineering. [Public calculator](https://cart.jlcpcb.com/quote).

The assembly allowance uses JLCPCB's published Standard fees: $25.56 single-side setup, $8.21 stencil, $1.53 per SMT part type (19 types), handling from $14.93, plus fixtures, joints, inspection and connector labor. The single-side component placement does not require two-sided SMT just because the ferrite occupies both sides. [Assembly fee schedule](https://jlcpcb.com/help/article/pcb-assembly-price).

Live catalog price checks on September 29, 2026: U1 $9.8505 each at quantities below ten; C3/C8 $0.9211 each at ten; C7 $0.6319 each; D2 $1.1290 each. The four listed pre-order minima total about **$36.95** (C5 $9.03, C6 $9.03, R6 $9.03, R8 $9.86), before sourcing adjustments and attrition. These minimum purchases are included in the parts allowance above, not an extra charge to add again. Requote R3/R4/R5 after the feedback revision; the earlier resistor prices and planning total do not establish procurement cost for the revised BOM. U1 replenishment remains open. All prices are unreserved snapshots and pre-order prices are estimates.

**Fabrication action:** obtain a named stack with 1 oz inner copper (JLCPCB defaults to 0.5 oz), confirm precision processing of the internal slots at ±0.10 mm, and supply a compliant panel with rails, fiducials and alignment holes. Standard slot sizing is published as ±0.20 mm, so the precision-outline option alone is not acceptance of the core fit. Recalculate winding behavior for the final stack and validate first-article fit and electrical performance. [Fabrication capabilities](https://jlcpcb.com/capabilities/pcb-capabilities).

This unbuilt engineering prototype is not released for fabrication. No purchase, reservation, supplier message or supplier upload was made. [Structured observations](evidence/audit/jlcpcb-sourcing.json) · [Electronic BOM](manufacturing/BOM-JLCPCB.csv) · [Core process](manufacturing/CORE-ASSEMBLY.md).
