# JLCPCB electronics sourcing

**All 20 electronic MPNs / 24 placements had orderable stock in the dated snapshots: September 30, 2026, except the new R6 checked October 9.** The table uses JLCPCB's **Available Order Qty**, not headline inventory. Each quantity covers twice the five-board requirement as a planning allowance; JLCPCB's actual attrition and allocation rules still need confirmation. Inventory is not reserved. The limiting stocked device is U1, with 26 available.

The user authorized direct JLCPCB catalog and manufacturer-datasheet review. JLCPCB supplies and assembles the electronics, including J1/J2. DigiKey supplies two B66285G0050X187 factory-gapped halves and two B66286A2000X000 clips separately; install after PCBA and measure assembled inductance. A3 uses no grinding or adhesive. There has been no supplier upload, message, reservation or purchase.

| References | Exact MPN | JLCPCB code | Available | Per board | Checked |
| --- | --- | --- | ---: | ---: | --- |
| J1, J2 | KF301-5.0-2P | [C474881](https://jlcpcb.com/partdetail/C474881) | 74,380 | 2 | 2026-09-30 |
| F1 | SF-1206F100-2 | [C3164649](https://jlcpcb.com/partdetail/C3164649) | 628 | 1 | 2026-09-30 |
| D1, D3 | DFLS1100-7 | [C107674](https://jlcpcb.com/partdetail/C107674) | 30,803 | 2 | 2026-09-30 |
| C1, C2 | CL32B106KBJNNNE | [C138687](https://jlcpcb.com/partdetail/C138687) | 2,228 | 2 | 2026-09-30 |
| D2 | PDS835L-13 | [C444972](https://jlcpcb.com/partdetail/C444972) | 834 | 1 | 2026-09-30 |
| C3, C8 | 16SVPF180M | [C136277](https://jlcpcb.com/partdetail/C136277) | 925 | 2 | 2026-09-30 |
| C4 | CL32B226KOJNNNE | [C55530](https://jlcpcb.com/partdetail/C55530) | 62,973 | 1 | 2026-09-30 |
| U1 | LT8302IS8E#PBF | [C673679](https://jlcpcb.com/partdetail/C673679) | 26 | 1 | 2026-09-30 |
| C5 | GRM188R61C475KE11D | [C77045](https://jlcpcb.com/partdetail/C77045) | 15,637 | 1 | 2026-09-30 |
| R1 | RC0603FR-07649KL | [C245991](https://jlcpcb.com/partdetail/C245991) | 74 | 1 | 2026-09-30 |
| R2 | RC0603FR-0761K9L | [C137696](https://jlcpcb.com/partdetail/C137696) | 2,530 | 1 | 2026-09-30 |
| R3 | RT0603BRD07113KL | [C705718](https://jlcpcb.com/partdetail/C705718) | 3,987 | 1 | 2026-09-30 |
| R4 | RT0603BRD0710K7L | [C861078](https://jlcpcb.com/partdetail/C861078) | 957 | 1 | 2026-09-30 |
| R5 | RT0603BRD07127KL | [C705722](https://jlcpcb.com/partdetail/C705722) | 12,509 | 1 | 2026-09-30 |
| R6 | CRH2512F39R0E04Z | [C175263](https://jlcpcb.com/partdetail/Ever_OhmsTech-CRH2512F39R0E04Z/C175263) | 4,986 | 1 | 2026-10-09 |
| C6 | CC0805JRNPO0BN471 | [C513677](https://jlcpcb.com/partdetail/C513677) | 51,099 | 1 | 2026-09-30 |
| D4 | SMAJ12A-13-F | [C134947](https://jlcpcb.com/partdetail/C134947) | 9,495 | 1 | 2026-09-30 |
| R7 | RC1206FR-07220RL | [C137353](https://jlcpcb.com/partdetail/C137353) | 303,188 | 1 | 2026-09-30 |
| R8 | CRM2512-JW-2R2ELF | [C840598](https://jlcpcb.com/partdetail/C840598) | 3,763 | 1 | 2026-09-30 |
| C7 | EEHZC1J470P | [C454353](https://jlcpcb.com/partdetail/C454353) | 427 | 1 | 2026-09-30 |

## Engineering substitutions

R3/R4/R5 use **113 kΩ / 10.7 kΩ / 127 kΩ**, Yageo RT0603 thin-film parts with 0.1% tolerance and 25 ppm/°C TCR. Nominal output is 4.980 V; the 17.5 V SW−VIN target gives 20.07% preliminary resistive-current separation. The temperature-compensation ratio changes by −0.95% from the original 106k/118k network; temperature trim remains required. [Feedback analysis](FEEDBACK-REVISION.md).

U1 uses the pin-compatible industrial-temperature LT8302I. C5 is a Murata 4.7 µF / 16 V X5R; C6 retains 470 pF C0G with a 100 V rating. R6 is Ever Ohms CRH2512F39R0E04Z (C175263), 39 Ω ±1%, 2 W at 70 °C in 2512. Its datasheet gives no repetitive nanosecond pulse curve; average-power margin is not pulse qualification. R8 is a 2 W pulse-rated 2.2 Ω Bourns part with its recommended lands; full power requires the datasheet's 300 mm² copper condition. [Every component's rating, package and pin review](COMPONENT-AUDIT.md).

## Before manufacturing release

- **Factory acceptance:** agree the six-layer 1 oz copper stack, filled/capped vias, core-slot tolerances, panel and through-hole connector assembly.
- **Reflow:** use Standard assembly with a component-level profile accepted for F1, R8 and C3/C8. Economic's fixed 255 ±5 °C profile is unsuitable for the fuse/capacitor limits. Manufacturer recommendations must be reconciled before assembly.
- **Prototype qualification:** demonstrate the 17.5 V differential spike envelope, RFB pin limits, regulation, startup/fault recovery, magnetics and temperatures. R8's power rating is conditional on copper and temperature.

[Fabrication requirements](manufacturing/FABRICATION.md) · [Factory review request](manufacturing/JLCPCB-REVIEW-REQUEST.md) · [Prototype tests](manufacturing/PROTOTYPE-TEST-PLAN.md) · [Core preparation](manufacturing/CORE-ASSEMBLY.md).

A3 core and clip procurement is recorded in sources/digikey-core-stock.json, retrieved October 8 from indexed DigiKey US listings. Both parts are listed in stock at MOQ 1; recheck checkout. The application accepts measured Lm 11.0–14.6 µH. Clip bow is a first-article mechanical acceptance item.

The superseded inventory remains in sources/jlcpcb-stock-before-turnkey.json as historical evidence. Previous pricing is not a quote for this revision.
