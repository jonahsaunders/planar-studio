# KiStack audit — PS-FLYBACK-5W A1

**Result: file and mounting checks pass; hardware and manufacturing release remain on hold.**
Audited 2026-09-29 using American Embedded's
[KiStack](https://github.com/American-Embedded/kistack/tree/8494dbde095669df081950cbb6b24d08a21e25b0)
schematic, PCB, footprint, export and Gerber workflows. KiStack supplies review
instructions and helpers; this is an engineering review following those skills,
not an independent certification or a KiStack electrical simulator.

The baseline is repository commit `1ce60b1439dc9da05624a2dd59ab9c51a2def92e`
(A0). A1 adds four mounting holes, strengthens validation and improves schematic
readability. Circuit values, topology, winding geometry and board outline are
unchanged. No supplier was contacted and no purchasing was performed.

## Findings corrected

| Finding | Impact | A1 correction and evidence |
| --- | --- | --- |
| Intended fabrication limits did not all survive board generation | The saved A0 project had a 0 mm global minimum clearance and 0.5 mm minimum via diameter, rather than the intended 0.2 / 0.6 mm. Its 0.2 mm net-class clearance still applied; the earlier clean DRC did not verify every intended global limit. | Restore explicit limits after `SaveBoard`, assert the saved values, then rerun DRC. [Baseline rules](evidence/audit/A0-project-rules.json), [current rules](evidence/audit/mounting-checks.json). |
| Native schematic parity was absent from the export gate | Enabling it exposed missing MPN fields in PCB footprints. Electrical pin comparison alone did not catch missing part metadata. | Propagate MPN, Manufacturer, LCSC and Datasheet fields. Export now checks schematic parity and zone refill, stopping on violations. Final parity issues: zero. [DRC](evidence/board-drc.json). |
| Schematic blocks and overlapping power/ground markings obscured the power path | Earlier versions used labels to link the clamp to the converter and put ground/flag graphics too close to their net names. | Draw a continuous A4 circuit: VIN, SW and PGND wire directly between the input, T1, clamp and controller. Use separated signal-ground triangles, diamond power flags and one consistent VIN label. Preserve distinct raw/fused, internal-bias and isolated-output nets. Check actual wire geometry as well as the netlist. [Controller](evidence/audit/schematic-controller.png), [complete sheet](evidence/audit/schematic-overview.png), [unchanged-net comparison](evidence/audit/schematic-layout-checks.json). |
| No mounting interface was defined | The board could not be installed using a documented screw pattern. | Add H1–H4 using the requested American Embedded M3 footprint: 3.2 mm NPTH, 41 × 80 mm center spacing. Preserve 50 × 104 mm outline, 6.4 mm mask opening and 6.8 mm all-layer copper exclusion. [Mounting specification](manufacturing/MOUNTING.md). |
| Generic placement conversion would lose the connector centroid correction | J1/J2 footprint origins are pin 1, not the body center. | Correct the two centroids first, then use KiStack's unmodified `convert_position.py`. Keep mechanical holes and the core out of electronic placement data. [Corrected input](manufacturing/KiCad-positions-centroid.csv), [CPL](manufacturing/CPL-JLCPCB.csv). |

## Findings that remain open

These are release gates, not claims that the circuit has already failed a bench test.

| Priority | Finding | Required action |
| --- | --- | --- |
| High | Full-load bulk-only ripple sizing is **100.018 mV**, slightly above the 100 mV target. | Measure ripple across line/load and temperature, including burst operation. C4 may reduce ripple, but that is not established by the bulk-only model. Revise capacitance/ESR or the specification if needed. |
| High | The 58.5 V rating-based clamp estimate excludes dynamic switch overshoot and layout parasitics. | Measure SW with an appropriate probe and tune R6/C6/D3/D4 to the below-60 V prototype target. Inspect the primary input loop and long VIN feed to T1 during this test; clean DRC does not establish EMI performance. |
| High | Planar gap fringing, core loss, inductance under bias and thermal performance are unverified. | Characterize the prepared core assembly, including fault-current behavior; run the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md). Small-signal AL and DC winding resistance are insufficient for thermal release. |
| High | The proposed stack, ground center leg, adhesive/retention process and turnkey assembly have no supplier acceptance. | Obtain engineering and manufacturing approval before treating Gerbers as production data. Stock ungapped halves cannot replace the prepared pair. |
| Medium | The 3D interference review is incomplete. | Add verified body models for U1, C3, J1, J2 and T1, then check the complete enclosure/fastener/core assembly. Current top/bottom renders cover the PCB and available stock models only. Drawings and 2D courtyards remain relevant, but are not a complete assembled 3D check. |
| Medium | R1, R3 and R6 lack verified LCSC identifiers; catalog availability is not reserved. | Confirm sourcing or engineer substitutions. T1 is a separate custom core operation. No new component search or availability claim was made in this audit. |
| Medium | Output trim, temperature compensation, startup at 18 V, transients, overload and control behavior remain untested. | Verify these on hardware. The standalone cycle calculation is not a closed-loop LT8302 simulation. |

## Review coverage

- **Schematic:** compared controller pin assignments, input protection, opposite
  winding-dot connections, rectifier/clamp polarities, decoupling, feedback and
  separated grounds with the existing netlist and
  [LT8302 Rev G reference](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf).
  Reviewed the complete rendered sheet plus input, output, controller, feedback
  and clamp close-ups. No electronic pin or value changes were introduced.
- **Connectivity:** zero ERC messages; zero DRC violations, unconnected items
  and schematic-parity issues. Independent comparison checks 54 logical pins
  and 55 numbered physical pads, including exact MPN/manufacturer/LCSC fields.
  The four pinless mounting symbols add four mechanical footprints.
- **Windings:** four intended terminal-contact sets and 19,229 centerline samples
  match final copper. Primary sections remain in series; secondary sections
  remain parallel. These checks do not measure inductance or dielectric strength.
- **Mounting:** checked actual copper on all six layers, including filled zones.
  Minimum hole-center-to-copper distance is 3.400499 mm (H1, B.Cu). Each 3.2 mm
  NPTH remains electrically unassigned, excluded from BOM/CPL, and clear of
  component courtyards. Drill coordinates independently match the four-hole
  schedule. Use the specified hardware contact diameter and underside clearance.
- **Fabrication:** rendered all six copper layers, both masks, front paste,
  both legends and Edge.Cuts with PyGerber 2.4.3 at 25 pixels/mm. Reviewed the
  [copper contact sheet](evidence/audit/gerber-copper-overview.png),
  [technical layers](evidence/audit/gerber-technical-overview.png) and detailed
  renders. No additional visible short or missing winding was found. The four
  circular M3 holes belong in the NPTH drill file; the three core slots belong
  in Edge.Cuts. There are 27 plated holes plus four NPTH mounting holes.
- **Assembly data:** 21 electronic BOM/CPL references agree (19 SMD, two THT).
  KiStack conversion uses T/B layer names and preserves corrected connector
  centroids. A named JLCPCB GUI BOM preset is not installed; the bundled
  deterministic BOM exporter is checked against schematic fields instead.
- **3D:** reviewed KiCad top and bottom renders with installed stock models;
  missing custom models are explicitly listed above. No complete-assembly
  interference pass is claimed.

## Provenance and reproduction

- KiStack commit: `8494dbde095669df081950cbb6b24d08a21e25b0`.
- American Embedded footprint library commit: `7be291853536e19f0d0d548c2ed3ca6811bdc540`.
- KiCad: 10.0.6; PyGerber: 2.4.3. The actual upstream footprint and placement
  converter are vendored with attribution and licenses.
- Run `scripts/rebuild.py` with KiCad Python for CAD, ERC/DRC, netlist,
  manufacturing exports and geometric checks. See [README](README.md).
- For the additional Gerber/3D review, create a local Python virtual environment,
  install `pygerber==2.4.3` and `Pillow`, then run `scripts/audit-renders.py`
  with `--kicad-cli` as needed. Use the installed KiCad model directory for
  `KICAD9_3DMODEL_DIR` if the copied stock footprints reference that variable.
- Reopen the schematic SVG and layer images after any design edit. Refresh the
  audit findings and manifest before sharing a new package; saved screenshots
  and prose do not automatically validate later edits.

Functional low-voltage galvanic isolation only. This audit does not establish
a safety-isolation rating, regulatory compliance or production readiness.
