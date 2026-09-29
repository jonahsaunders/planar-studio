# PCB layout audit — PS-FLYBACK-5W A1

**Recommendation: revise the primary input and clamp routing before fabrication.**
The saved PCB passes KiCad DRC and connectivity checks, but the long primary
power paths are a credible source of unwanted inductance and switch overshoot.
This is a layout review, not a measured failure or a parasitic simulation.

Reviewed 2026-09-29 using the pinned [KiStack PCB/layout workflows](KISTACK-AUDIT.md).
The routing, placement and manufacturing geometry are unchanged from commit `976a184e7dc62a84c94099042ebde564a1a12c8d`; the current board adds complete local 3D model references;
its SHA-256 is recorded in the [measurement file](evidence/audit/pcb-layout-metrics.json).
The schematic junctions are fixed and nominal 3D model coverage is complete;
it does **not** claim that the routing findings have been corrected.

[![Actual-board close-ups with measured clamp and output routes](evidence/audit/pcb-layout-audit.svg)](evidence/audit/pcb-layout-audit.svg)

## Prioritized findings

### 1. High — input bypassing and the primary power path need tighter placement

The shortest explicit copper route from **C2 pin 1 to T1 pin 1 is 34.87 mm**,
with a 1.00 mm minimum trace width. It follows the right perimeter of the
primary electronics. **C1 pin 1 to U1 VIN is 16.87 mm** with a 0.90 mm minimum
width, despite the components appearing relatively close in the overview.
The direct U1 SW-to-T1 connection is 7.89 mm. The capacitors, transformer
terminals, switch and ground return therefore do not form a compact local loop.

Re-place C1/C2 and the U1/T1 power cluster so the input capacitor closes the
primary switching loop locally. Provide a short VIN-to-PGND bypass connection
at U1, then route the upstream fuse/diode supply into that cluster. Retain an
unbroken primary return under the electronics without extending it into the
transformer isolation region. Judge the complete outgoing/return loop, not
trace width alone.

### 2. High — clamp and snubber connections are unnecessarily long

The D3 SW branch is 5.46 mm and D3-to-D4 connection is 6.85 mm, but **D4's VIN
return to T1 is 57.54 mm**. That return detours through the input distribution
network. The snubber has another **17.78 mm SW branch on In3.Cu**, plus a
21.26 mm R6-to-T1 VIN connection and a 3.03 mm R6-to-C6 connection. These are
individual trace lengths, not calculated loop inductances.

Group D3/D4 and R6/C6 around the primary terminals and SW node as part of the
same placement revision. Minimize both outgoing and return paths; avoid a long
buried SW branch simply to reach the snubber. Preserve access for probing and
tuning. The existing 58.5 V rating-based clamp estimate excludes these parasitics;
verify the below-60 V prototype target across line/load and startup on hardware.

The basis for findings 1 and 2 is the manufacturer's local VIN-bypass and
minimal SW/RFB trace-area guidance, combined with the measured board geometry.
The numeric route lengths above are review observations, **not manufacturer
maximum-length limits**. See [LT8302 Rev G, pages 3 and 7](https://www.analog.com/media/en/technical-documentation/data-sheets/lt8302-8302-3.pdf).

### 3. Medium — output delivery takes a long detour

**C3 positive to J2 positive is 33.20 mm**, routed left and then along the bottom
of the board at 1.50 mm width. D2-to-C3 positive is 11.98 mm, while the ceramic
C4 positive connection is 5.61 mm. The return travels through the separate
back-layer output plane and capacitor return vias.

Shorten the capacitor-to-connector feed while keeping the connector accessible
at the board edge. Keep the D2/C3/C4 pulsed-current loop compact. Check regulation
and ripple at J2 as well as at the capacitors; this primary-side-regulated
converter does not remotely sense voltage at the output connector. The review
has not calculated the full copper/contact drop or proven a ripple failure.

### 4. Medium — probing and the complete mechanical review are unfinished

There are **no dedicated test-point footprints**. Add compact probe access for
VIN, SW, INTVCC, output and the two separate returns during the routing revision.
Place a short PGND probe contact near SW; avoid enlarging the SW copper solely
for a large test loop. Existing component pads permit limited probing, but the
board does not provide a deliberate repeatable measurement interface.

All 26 footprints now have loadable local models, including both prepared core
halves and provisional M3 hardware. Nominal solid checks find no component or
substrate intersections; see [3D model evidence](3D-MODELS.md). The prior missing
model finding is closed, including an additional broken D2 model reference.
Enclosure, wiring/tool access, actual fasteners, tolerances and core retention
process remain to be qualified. The M3 drill pattern and copper exclusions pass
the independent 2D checks.

### 5. Medium — via processing and assembly acceptance remain open

U1 has four 0.60 / 0.30 mm ground vias in its exposed pad. Across the board,
23 plated interlayer holes are specified filled/capped; four connector holes
remain open. These are intentional fabrication requirements, not ordinary
open-via substitutes. Confirm the fill/cap process, paste coverage, ground-plane
solderability at the connectors, and prepared-core installation before release.
No supplier has accepted this process, and no supplier was contacted.

## Features worth preserving

| Area checked | Observation and limit |
| --- | --- |
| Bias and feedback placement | C5-to-INTVCC is 2.12 mm; R3-to-RFB is 2.07 mm. Keep those short and away from the revised power paths. |
| U1 ground and heat spreading | Four exposed-pad ground vias reach a filled PGND region on B.Cu (930.118 mm²). This is useful copper, not a verified junction-temperature result. |
| Quiet reference return | R4 has a ground via into PGND. When moving the power loop, keep the reference return close to U1 ground and away from shared pulsed-current paths; this review does not resolve plane current density. |
| Secondary separation | GND_ISO has its own B.Cu region (663.626 mm²); it is not joined to PGND. In2.Cu carries the secondary inner-terminal escape. |
| Winding geometry | Four winding polygons and 19,229 centerline samples pass the existing final-copper checks. Primary sections are in series; secondary sections are in parallel. |
| Mounting | Four 3.2 mm NPTH M3 holes on a 41 × 80 mm pattern; all-layer copper radius is at least 3.400499 mm. |
| Manufacturing geometry | Zero DRC violations, unconnected items and schematic-parity issues under the saved rules. The 0.2 mm general clearance and proposed 0.1 mm outer interlayer dielectrics do not establish a safety-isolation rating. |
| Export review | All six copper layers, masks, paste, legends, routed outline and available 3D bodies were inspected. Stored render source hashes match the current board and Gerbers. |

## Evidence and reproduction

- [Measured paths, widths, return-plane areas and model coverage](evidence/audit/pcb-layout-metrics.json)
- [Full front/back overview](evidence/layout-overview.svg), [six copper layers](evidence/audit/gerber-copper-overview.png), [technical layers](evidence/audit/gerber-technical-overview.png)
- [Top 3D view](evidence/audit/board-3d-top.png), [bottom 3D view](evidence/audit/board-3d-bottom.png); [assembled and underside views](3D-MODELS.md) now include every footprint
- [DRC](evidence/board-drc.json), [mounting checks](evidence/audit/mounting-checks.json), [broader electrical/manufacturing audit](KISTACK-AUDIT.md)

Run `scripts/audit-layout.py` with KiCad 10's Python, then
`scripts/render-layout-audit.py`. The first script reads the final board without
altering it. It measures explicit trace centerlines, splitting at collinear
endpoints. Via transitions have zero vertical length in this report. Winding
polygons, component internals and plane/pad current spreading are excluded.
The two offset secondary escape vias join wide copper away from its centerline;
their net's per-layer trace totals are reported separately, without inventing a
centerline path. None of these measurements substitutes for field extraction.

After a routing change, regenerate ERC/DRC, winding/mounting checks, fabrication
exports and visual renders; repeat this review against the new board hash and
update the prose findings. Scripts refresh measurements, not engineering sign-off.
Follow the [prototype test plan](manufacturing/PROTOTYPE-TEST-PLAN.md) on the
resulting hardware. Hardware remains unbuilt and untested.
