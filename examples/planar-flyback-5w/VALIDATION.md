# A1 validation record

The files describe a proposed 18–36 V DC to isolated 5 V / 1 A converter. The
following checks concern the saved design and analytical models. **No hardware
has been built or tested, and full-turnkey manufacturing has not been accepted
by a supplier.** No request or files were submitted to JLCPCB.

A1 was reviewed using [KiStack](KISTACK-AUDIT.md). Four M3 mounting holes,
corrected fabrication-rule persistence, native schematic parity and metadata
checks supplement the original validation.

## Checks and evidence

| Area | Recorded result | Evidence |
| --- | --- | --- |
| Schematic electrical rules | 0 messages, KiCad 10.0.6 | [ERC](evidence/erc.rpt) |
| Schematic branch geometry | 0 four-way junctions; 27 three-way connections, including symbol pins; native four-way ERC enabled as an error | [Independent checks](evidence/independent-checks.json) |
| PCB layout review | Open input/clamp routing, output-feed, probing and assembly findings; measured paths and actual-board close-ups | [PCB audit](PCB-LAYOUT-AUDIT.md) |
| Board design rules | 0 violations, 0 unconnected items, 0 schematic-parity issues | [DRC](evidence/board-drc.json) |
| Schematic/board agreement | 54 logical pins, 55 numbered physical pads | [Independent checks](evidence/independent-checks.json) |
| Drawn power-path continuity | VIN, SW, PGND, +5V_ISO and GND_ISO each connect through actual wires; no label-only clamp block | [Wire groups](evidence/independent-checks.json) |
| Schematic layout redraw | A4 sheet; all 54 pin names/nets and 26 part records unchanged; PCB and manufacturing bytes unchanged | [Redraw comparison](evidence/audit/schematic-layout-checks.json), [render](evidence/audit/schematic-overview.png) |
| Planar winding geometry | Four polygons; correct terminal contacts; 19,229 centerline samples inside final board copper | [Independent checks](evidence/independent-checks.json) |
| Assembly/export consistency | 21 electronic BOM/CPL references, six copper Gerbers, 23 filled/capped holes plus four open connector holes and four separate NPTH mounting holes | [Manufacturing checks](evidence/manufacturing-checks.json) |
| 3D assembly | All 26 footprints have local models; 14 valid STEP assets; no nominal intersections in 325 component pairs or 26 substrate checks | [Model coverage and limits](3D-MODELS.md), [solid checks](evidence/audit/3d-solid-checks.json) |
| Transformer sizing | 4:2 turns, nominal 11.95 µH, proposed 0.21 mm prepared center-leg gap | [Winding model](evidence/winding-model.json) |
| Electrical stresses | 2.05 A worst full-load primary peak under assumed 75% efficiency | [Sizing and limitations](evidence/electrical-sizing.json), [operating points](evidence/operating-points.csv) |
| Boundary/DCM stage | Charge-balanced analytical current cycles at 18, 24 and 36 V, fixed 5 V output | [Cycle model](evidence/cycle-model.json), [results](evidence/boundary-cycle.csv), [waveforms](evidence/idealized-waveforms.csv) |

The winding generator uses Planar Studio's geometry and small-signal magnetic
model. Its sinusoidal output-voltage calculation is **not flyback validation**.
The separate cycle calculation includes DC winding resistance, an assumed
switch resistance and a nominal 380 kHz ceiling. It excludes core loss,
switching loss, gap fringing, controller feedback, burst mode and transients.
The stress worksheet uses a 75% efficiency assumption; it is not an efficiency
prediction or a physically charge-balanced waveform.

## Open design and manufacturing gates

- Confirm the six-layer stack and core-slot tolerances. Recalculate winding
  parameters if the fabricator changes copper or dielectric dimensions.
- Revise the long primary input and clamp paths identified in the
  [PCB layout audit](PCB-LAYOUT-AUDIT.md); shorten the output feed and provide
  deliberate probe access. Clean DRC does not close these findings.
- Source and qualify a prepared EELP32 N87 pair. Stock B66457G0000X187 halves
  are ungapped; the specified prepared pair needs center-leg grinding.
- Qualify adhesive, retention, positioning and inductance acceptance. The
  proposed core installation is part of turnkey assembly, with no acceptance
  from JLCPCB or a subcontractor yet.
- Confirm component availability and substitute suitability. Catalog part
  identifiers do not establish stock, price or assembler acceptance.
- Measure switch overshoot and tune the clamp/snubber. The 58.5 V rating-based
  clamp estimate excludes dynamic overshoot; the prototype target is below 60 V.
- Establish ripple and regulation. The bulk-only full-load ripple estimate is
  about 100 mV, leaving little margin against the 100 mV target. The parallel
  ceramic's benefit has not been measured.
- Measure inductance under bias, core/fringing losses, startup, minimum load,
  overload, output trim, efficiency and temperature over the input/load range.
  Follow the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md).

Functional low-voltage galvanic isolation is the design intent. No mains,
reinforced-insulation, dielectric-withstand or safety certification is claimed.

## Reproducibility and provenance

See [README](README.md) for rebuild and packaging commands. `SHA256SUMS.json`
records the published bytes; `.gitattributes` preserves LF text across platforms.
KiCad source, standard footprints used by the board, generated data and source
references are bundled. Rebuilds can change KiCad UUIDs, timestamps, numeric
formatting and export order; byte-identical CAD output is not promised.

The netlist's `<source>` field is normalized to a relative path for publication.
This does not modify connectivity. ERC/DRC rule checks and polygon sampling do
not establish manufacturability or measured circuit behavior.

The earlier A0 workflow attribution was unresolved. A1 uses the specifically
requested American Embedded KiStack skills; see the audit for pinned versions
and coverage. Complete model coverage and nominal solid checks are recorded in
[3D-MODELS.md](3D-MODELS.md). Final tolerances, enclosure, actual mounting hardware
and core retention qualification remain open.
