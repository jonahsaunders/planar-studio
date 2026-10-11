# A14 validation record

11 October 2026, KiCad 10.0.6. **Unbuilt. Electrical and manufacturing release
remain on hold.** [Component findings and open limits](COMPONENT-RATINGS.md).

A14 shortens the lower rectifier gate route and adds fabrication, stencil and
BOM/CPL release screens. The A13 feedback improvements are retained. Checks include passive pad
entries, actual copper pours, signal return references and unclipped silkscreen.
Only single-board manufacturing data are supplied. Factory process acceptance,
ferrite fitting and powered qualification remain open.

| Check | Result | Evidence |
| --- | --- | --- |
| Schematic ERC | 0 violations | [ERC](evidence/ERC.rpt) |
| PCB DRC and schematic parity | 0 violations, 0 unconnected pads, 0 parity issues | [DRC](evidence/DRC.rpt) |
| Schematic readability | 0 text-to-wire hits with 0.15 mm reserve | [Rendered-glyph audit](evidence/readability-audit.json) |
| Schematic connections | 269 orthogonal wires, 52 T junctions, zero four-way connections; 43 visible IC pins and nine supply stems checked | [Geometry](evidence/schematic-geometry.json) |
| Device pin mapping | 13 maps and seven critical branches checked | [Pin review](evidence/datasheet-pin-review.json) |
| BOM/CPL/manifest agreement | 75 placements, 43 catalog parts, all top; local models resolve | [Final audit](evidence/final-audit.json) |
| Component ratings coverage | All 82 references accounted for; static screens and conditional/hold results distinguished | [Ratings audit](evidence/component-ratings-audit.json) |
| Full-load analytical corners | 81 inductive FHA roots in the screened range; highest primary RMS 3.503 A | [Ratings calculations](evidence/component-ratings-audit.json) |
| OC sensing model | Revised peak 0.779 V below 0.9 V minimum trip; timestep halving changes peak by less than 2 mV | [Model and limitations](COMPONENT-RATINGS.md) |
| Bias network versus L2 | No RIPPLE/BIAS_FB trace polygon overlap with conservative L2 body projection | [Bias layout](evidence/bias-layout-audit.json) |
| GaN routing | Full SW custom-land projection clear of foreign filled planes and internal tracks; adjacent PGND below VIN route | [GaN geometry](evidence/GaN-layout-audit.json) |
| Drive references | Five checked GD/VG route segments have 100% sampled adjacent-plane coverage outside signal-via antipads | [Filled-copper audit](evidence/return-path-audit.json) |
| Ground stitching | 50 stitches, each connected to at least two final same-net filled planes | [Stitching](evidence/stitching-audit.json) |
| Sensitive-net references | 17 selected nets have 100% sampled adjacent same-domain ground coverage outside their own via clearances; raw coverage also reported | [Reference planes](evidence/reference-plane-audit.json) |
| Manufacturing geometry | No purchased pad outside its courtyard; no same-net land overlap; no undersized printed legend | [Geometry](evidence/manufacturing-geometry.json) |
| Pours and stencil | All filled pieces touch same-net copper; no checked hot-node overlap; power paste 75–76%; no connector thermal bypass | [Native polygon audit](evidence/pour-and-stencil-audit.json) |
| Routing and legend | 501 → 497 route segments; zero nonstandard angles or free 90° elbows; printed strokes clear mask by ≥0.22 mm | [Native measurements](evidence/routing-and-silk-audit.json) |
| A13 comparison | Part identities/pin nets, winding footprint and mounting/connector positions retained; selected component positions/orientations and routing changed | [Before/after](evidence/A14-layout-audit.json) |
| Turnkey CAD screen | 16 native/data checks pass; smallest paste aperture area ratio 0.7405 at 0.125 mm stencil; seven external holds remain | [Readiness](evidence/turnkey-readiness.json) |
| Passive assembly entries | Eight feedback/OVP resistors: equal lands/paste, single 0.20 mm axial entries, ≥0.25 mm land-to-via-hole gap; seven local signal nets use no vias | [Passive routing](evidence/passive-routing-audit.json) |
| Transformer contact geometry | No unintended winding contacts in independent sampled-path screen | [Winding audit](evidence/winding-contact-audit.json) |
| Mechanical and assembly mapping | M3 exclusions on all eight copper layers, 75 top components, four 1.6 mm connector contact drills, three fiducials, six probe pads | [Mechanical audit](evidence/mechanical-assembly-audit.json) |
| Clean-copy rebuild | Schematic byte-identical; tracks, pads and zone outlines match; physical copper unions identical after deterministic refill (0 mm² difference); clean parity/DRC | [Rebuild](evidence/rebuild-audit.json), [DRC](evidence/rebuild-DRC.rpt) |
| Fabrication and visual review | 14 actual Gerber layers independently rasterized; eight native copper layers, top/bottom/perspective and schematic/assembly views inspected | [Gerbers](evidence/Gerber-review.png), [source hashes](evidence/gerber-render-audit.json), [layers](evidence/Layer-review.png) |

## What these checks do not establish

The 4 A primary thermal screen produces 3.87 W of winding DC loss at 80 °C,
before core and AC copper losses. The earlier 3.25 A assumption was too low
for the largest full-load analytical corner. There is no thermal qualification.

The OC model evaluates the sensing network driven by an ideal sine waveform;
it is not a switching simulation. Capacitor-voltage sensing is frequency
dependent and cannot prove fast short-circuit protection. Input surge energy,
TVS/fuse coordination, switching-node ringing, start-up, no-load behavior,
rectifier timing, optocoupler ageing, stability and OVP dynamics remain open.

Exact effective capacitance and ripple heating have not been established for
every ceramic capacitor. A voltage-rating comparison is insufficient for those
parts. The audit explicitly leaves those results conditional.

The specified eight-layer 70 µm outer / 61 µm inner stack and filled/capped via process need JLCPCB
file-level acceptance, as do placement rotations and mixed SMT/THT assembly.
Core/clip installation is a separate operation until agreed. No order has been
placed. Functional isolation only; no safety-isolation certification.

## Reproduction

Run `audit_turnkey_readiness.py` after geometry, pour and export steps, with the Shapely directory argument.

Run `redraw_schematic.py` with sexpdata, then `rebuild_board.py` with KiCad 10
pcbnew plus Shapely 2.x (pass its site-packages directory as the first argument).
`audit_routing_and_silk.py` (KiCad Python, Shapely directory argument) must
pass on the current PCB before exporting. `audit_passive_routing.py` accepts
the same Shapely argument and an optional previous-package directory.
`export_review.py` stops on ERC or parity/DRC failures and creates the
native review, BOM/CPL, Gerbers and drill files. Run the included pin, geometry,
winding, mechanical, return, reference-plane, GaN, bias, ratings and final audits. The ratings
audit requires NumPy; the readability audit requires pypdfium2 and sexpdata;
independent Gerber rendering uses PyGerber 2.4.x and Pillow.

`audit_layout_changes.py` takes the previous A13 package directory as its
argument. It rejects any part-identity or pin-net change in this layout revision.
It splits overlapping centerlines and same-layer intersections before computing
route lengths, and includes the plated connector barrels as transitions. The
native project and source manifest remain the editable source; generated
manufacturing files should not be edited separately.
