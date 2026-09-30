# A1 validation record

The files describe a proposed 18–36 V DC to isolated 5 V / 1 A converter. The
following checks concern the saved design and analytical models. **No hardware
has been built or tested, and full-turnkey manufacturing has not been accepted
by a supplier.** No request or files were submitted to JLCPCB.

A1 was reviewed using [KiStack](KISTACK-AUDIT.md). Four M3 mounting holes,
corrected fabrication-rule persistence, native schematic parity and metadata
checks supplement the original validation.

See the [complete component audit](COMPONENT-AUDIT.md) for all 29 footprints and the latest electrical/filtering corrections. The coordinated R3/R4/R5 revision gives a preliminary resistive bound of 157.1 µA at SW−VIN ≤17.5 V, including stated tolerance/temperature assumptions. Verify this full transient envelope and RFB pin voltage/current on hardware; see [feedback revision](FEEDBACK-REVISION.md). Input damping is not hot-plug protection.

## Checks and evidence

| Area | Recorded result | Evidence |
| --- | --- | --- |
| Schematic electrical rules | 0 messages, KiCad 10.0.6 | [ERC](evidence/erc.rpt) |
| Schematic branch geometry | 0 four-way junctions; 31 three-way connections, including symbol pins; native four-way ERC enabled as an error | [Independent checks](evidence/independent-checks.json) |
| PCB layout review | Revised primary/secondary placement, shorter power routes, continuous separate ground regions and deliberate probe access; hardware/process qualification remains open | [PCB audit](PCB-LAYOUT-AUDIT.md) |
| Board design rules | 0 violations, 0 unconnected items, 0 schematic-parity issues | [DRC](evidence/board-drc.json) |
| Schematic/board agreement | 60 logical pins, 61 numbered physical pads | [Independent checks](evidence/independent-checks.json) |
| Feedback revision, September 30 | R3/R4/R5 = 115k/10.8k/128k agree in schematic, board, circuit and BOM; current budget checked; obsolete sourcing codes cleared. Parsed comparison against 155e913 verifies unchanged PCB geometry, connectivity and unrelated properties. | [Feedback checks](evidence/audit/feedback-checks.json), [assumptions and bench gates](FEEDBACK-REVISION.md) |
| Drawn power-path continuity | VIN, SW, PGND, +5V_ISO and GND_ISO each connect through actual wires; no label-only clamp block | [Wire groups](evidence/independent-checks.json) |
| Earlier schematic-only redraw (historical) | A4 sheet; all 54 pin names/nets and 26 part records unchanged at that revision; see the current layout comparison for subsequent copper/placement changes | [Redraw comparison](evidence/audit/schematic-layout-checks.json), [render](evidence/audit/schematic-overview.png) |
| Planar winding geometry | Four polygons; correct terminal contacts; 19,229 centerline samples inside final board copper | [Independent checks](evidence/independent-checks.json) |
| Mounting footprint revision | Exact upstream M3 Edge footprints; extensions rotated outward; unchanged 3.2 mm drills; revised 41 × 95 mm pattern with 4.5 mm corner insets; all-layer extension clearance checked | [Mounting specification](manufacturing/MOUNTING.md), [historical mounting move](evidence/audit/mounting-revision-checks.json), [current fuse-only geometry comparison](evidence/audit/fuse-revision-checks.json) |
| Fuse replacement and sourcing | Bourns SF-1206F100-2 / C3164649, recommended lands and normalized official series STEP geometry; other placement, routes, windings and corner mounts preserved | [Fuse checks](evidence/audit/fuse-revision-checks.json), [dated sourcing audit](JLCPCB-SOURCING.md) |
| Assembly/export consistency | 24 electronic BOM/CPL references, six copper Gerbers, 66 filled/capped holes plus four open connector holes and four separate NPTH mounting holes | [Manufacturing checks](evidence/manufacturing-checks.json) |
| 3D assembly | All 29 footprints have local models; 16 valid STEP assets; no nominal intersections in 406 component pairs or 29 substrate checks | [Model coverage and limits](3D-MODELS.md), [solid checks](evidence/audit/3d-solid-checks.json) |
| Transformer sizing | 4:2 turns, nominal 11.95 µH, proposed 0.21 mm prepared center-leg gap | [Winding model](evidence/winding-model.json) |
| Electrical stresses | 2.06 A worst full-load primary peak under assumed 75% efficiency | [Sizing and limitations](evidence/electrical-sizing.json), [operating points](evidence/operating-points.csv) |
| Boundary/DCM stage | Charge-balanced analytical current cycles at 18, 24 and 36 V, fixed 5 V output | [Cycle model](evidence/cycle-model.json), [results](evidence/boundary-cycle.csv), [waveforms](evidence/idealized-waveforms.csv) |

The winding generator uses Planar Studio's geometry and small-signal magnetic
model. Its sinusoidal output-voltage calculation is **not flyback validation**.
The separate cycle calculation includes DC winding resistance, an assumed
switch resistance and a nominal 380 kHz ceiling. It excludes core loss,
switching loss, gap fringing, controller feedback, burst mode and transients.
The stress worksheet uses a 75% efficiency assumption; it is not an efficiency
prediction or a physically charge-balanced waveform.

The September 30 revision reran native ERC/DRC, schematic/board and winding
checks, manufacturing checks, component and layout audits, feedback checks,
schematic/Gerber renders and 3D exports. Negative calculation checks reject an
R3-only edit, the old network's inadequate 20% separation, an out-of-range R4,
and an unchanged R5. Earlier solid-intersection checks are retained as dated
evidence; the new parsed PCB comparison proves identical geometry and models.
They were not rerun as physical tolerances or hardware qualification.

## Open design and manufacturing gates

- Confirm the six-layer stack and core-slot tolerances. Recalculate winding
  parameters if the fabricator changes copper or dielectric dimensions.
- Validate the [revised PCB layout](PCB-LAYOUT-AUDIT.md) on hardware. The measured
  path reductions and continuous return copper do not establish switch stress,
  ripple, temperature or EMI. Repeat output trim after the layout change.
- Source and qualify a prepared EELP32 N87 pair. Stock B66457G0000X187 halves
  are ungapped; the specified prepared pair needs center-leg grinding.
- Qualify adhesive, retention, positioning and inductance acceptance. Raw cores
  may be sourced separately from DigiKey. The separate preparation/installation
  operation and its responsible supplier remain to be agreed.
- Confirm component availability and substitute suitability. Catalog part
  identifiers do not establish stock, price or assembler acceptance.
- Measure switch overshoot and tune the clamp/snubber. Require SW−VIN peak
  ≤17.5 V including initial overshoot and uncertainty, SW below 60 V and
  independent RFB voltage/current checks. The catalog clamp estimate is not
  a measured transient envelope. Verify temperatures and regulation across
  startup, full load, light-load bursts, overload and short-circuit recovery.
- Establish ripple and regulation. The bulk-only full-load ripple estimate is
  50.58 mV with C3/C8; C4 is not credited in that calculation. Burst and transient
  behavior remain unmeasured.
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
