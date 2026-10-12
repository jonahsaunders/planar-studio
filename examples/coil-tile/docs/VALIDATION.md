# A2 validation record

This is a design release for prototype fabrication, not a production qualification.

| Check | Result / evidence |
|---|---|
| Native schematic ERC | 0 violations, `evidence/erc.rpt` |
| Native PCB DRC, all severities | 0 violations, `evidence/drc.json` |
| Connectivity | 0 unconnected items |
| Schematic vs board parity | 0 issues |
| Rule suppressions | None added; winding connections use explicit native net-tie footprints |
| Assembly set | 20 references on top, 12 BOM groups, exact BOM/CPL reference match |
| Symbols vs specification | Exported KiCad netlist drives pad assignment; generator asserts named pin nets |
| Fabrication plots | Four copper layers; top/bottom mask/paste/silk; outline; separate PTH/NPTH drills |
| Independent Gerber parse | Copper, mask, paste, top silk and outline rendered using PyGerber |
| Schematic review | SVG and native PDF rendered and inspected; wire-visibility issue corrected |
| Layout review | Front, inner and back copper plus soldermask/paste views inspected |
| Driver tests | 7 mocked tests: IDs, configuration, drive mode, coherent reads/error flags, timeout, baseline faults, channel map |
| Software smoke test | Explicit headless simulation and CSV output; no fabricated hardware measurements |

The KiCad CLI in the extracted build environment emitted a missing API-schema
resource diagnostic at startup. CAD parsing, rule checks and exporters ran
successfully and produced the reports above. That diagnostic is not an ERC/DRC
waiver. Native design files can be opened with a normal KiCad 9 installation.

## Not yet verified

Physical manufacturing, JLCPCB order acceptance, supplier component rotations,
soldering yield, USB enumeration/signal integrity, ESD performance, power draw,
thermal behavior, oscillation/drive amplitude, target sensitivity, range,
noise/drift, crosstalk, speed and mechanical enclosure fit have not been tested.
The graphical application requires a desktop Tk session; the GUI and native
USB transport have not been run against physical hardware. There is no RF/EMC
certification, quantitative metal classification or safety-critical function.

The supplied manufacturing notes call for a visual placement review. Supplier
rotations can differ from KiCad even though every reference and position matches.
Stock/price snapshots do not reserve parts or constitute a JLCPCB quote.

## Layout tradeoffs to measure

The LDC is multiplexed, not four simultaneous receivers. Neighboring resonators
remain physically coupled. The three adjacent sensor sectors have unequal lead
lengths, so empty-board frequencies may differ. Per-channel baseline calibration
is provided; it does not remove all crosstalk or temperature drift. The internal
reference oscillator is convenient and inexpensive but not a precision timebase.
