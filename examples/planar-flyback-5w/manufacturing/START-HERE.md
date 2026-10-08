# JLCPCB handoff — single board, factory panelization

Use the files in this directory for **JLCPCB-managed panelization** of the A4 flyback converter. This package supersedes the earlier customer-panel proposal. It is prepared for feasibility review and quotation; no supplier submission or order has been made.

Order six layers, nominal 1.6 mm, **1 oz outer / 1 oz inner**, **Specify Stackup: No**, no impedance control, ENIG and Standard PCBA. The reference cross-section in stackup.json is used for modeling; it is not a request for a paid named stack.

## Upload files

| Purpose | File |
| --- | --- |
| PCB geometry and drills | [GERBERS-REVIEW-ONLY.zip](GERBERS-REVIEW-ONLY.zip) — upload this inner ZIP without extracting it |
| Electronic components | [BOM-JLCPCB.csv](BOM-JLCPCB.csv) |
| Component placement | [CPL-JLCPCB.csv](CPL-JLCPCB.csv) |

The CPL includes exact catalog rotation and origin corrections for the current A4 board. Upload it again if an earlier file was used, and compare the fresh preview with PLACEMENT-REVIEW.md. The raw KiCad positions are reference data only.

The outer review-package ZIP contains the complete project and supporting documents. Extract it to reach these three upload files; it is not the Gerber upload itself. Each file describes one 44 × 94 mm board. Ask JLCPCB to prepare the assembly panel and convert coordinates as needed. The requested quantity is **five finished converter boards**, subject to the quoted panel arrangement.

## Include with the engineering review

- [Prepared review request](JLCPCB-REVIEW-REQUEST.md)
- [Fabrication and assembly requirements](FABRICATION.md)
- [Panelization requirements](PANEL.md)
- [Selective via fill/cap schedule](via-fill.csv)
- [Reference default-stack dimensions](../stackup.json)
- [Top assembly drawing](assembly-top.svg)
- [Placement corrections and pin/polarity acceptance](PLACEMENT-REVIEW.md)
- [Catalog pin centers over actual PCB pads](placement-review.svg)

Have JLCPCB return the panel drawing and assembly orientation preview for review. Record the actual standard construction (1 oz inner and outer; Specify Stackup: No), and confirm internal core-slot tolerances, selective via filling, connector assembly and component-compatible reflow profile. The online panel option does not by itself establish acceptance of these requirements.

The ferrite cores are separate from the electronic BOM: [core materials](CORE-BOM.csv) and [core installation/installation](CORE-ASSEMBLY.md). Factory-gapped cores may come from DigiKey; the factory gaps and clip installation after soldering and panel separation remain required.

Use this matching single-board set throughout. Do not use `PANEL-GERBERS-REVIEW-ONLY.zip` or placement files from an older `build/panel-A1` download. Factory process acceptance and [prototype testing](PROTOTYPE-TEST-PLAN.md) remain open.
