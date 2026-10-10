# A10 schematic / A8 hardware validation record

10 October 2026, KiCad 10.0.6. **Unbuilt. Electrical and manufacturing release
remain on hold.** [Component findings and open limits](COMPONENT-RATINGS.md).

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
| Drive references | Four checked GD/VG routes have 100% sampled adjacent-plane coverage outside signal-via antipads | [Filled-copper audit](evidence/return-path-audit.json) |
| Ground stitching | 60 stitches, each connected to at least two same-net filled planes; LI return reduced to 1.05 mm, earlier GD1/VG2 improvements retained | [Stitching](evidence/stitching-audit.json) |
| Sensitive-net references | 17 selected nets have 100% sampled adjacent same-domain ground coverage outside their own via clearances; raw coverage also reported | [Reference planes](evidence/reference-plane-audit.json) |
| Output distribution | C13-to-J2 centerline route 60.899 → 10.206 mm; C14-to-J2 56.399 → 14.706 mm | [Comparison](evidence/A10-layout-audit.json), [drawing](evidence/Output-route-comparison.png) |
| A7 comparison | No placement, part-identity or pin-net changes; winding geometry, outline and mounting/connector positions preserved | [Before/after](evidence/A10-layout-audit.json) |
| Transformer contact geometry | No unintended winding contacts in independent sampled-path screen | [Winding audit](evidence/winding-contact-audit.json) |
| Mechanical and assembly mapping | M3 exclusions on all eight copper layers, 75 top components, two 1.6 mm connector drills, three fiducials, six probe pads | [Mechanical audit](evidence/mechanical-assembly-audit.json) |
| Clean-copy rebuild | Schematic byte-identical; tracks, pads and zone outlines match; filled-copper differences below 0.01 mm² per zone; clean parity/DRC | [Rebuild](evidence/rebuild-audit.json), [DRC](evidence/rebuild-DRC.rpt) |
| Fabrication and visual review | 14 actual Gerber layers independently rasterized; eight native copper layers, top/bottom/perspective and schematic/assembly views inspected | [Gerbers](evidence/Gerber-review.png), [source hashes](evidence/gerber-render-audit.json), [layers](evidence/Layer-review.png) |

## What these checks do not establish

The 4 A primary thermal screen produces 3.69 W of winding DC loss at 80 °C,
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

The proposed eight-layer 2 oz stack and filled/capped via process need JLCPCB
file-level acceptance, as do placement rotations and mixed SMT/THT assembly.
Core/clip installation is a separate operation until agreed. No order has been
placed. Functional isolation only; no safety-isolation certification.

## Reproduction

Run `redraw_schematic.py` with sexpdata, then `rebuild_board.py` with KiCad 10
pcbnew. `export_review.py` stops on ERC or parity/DRC failures and creates the
native review, BOM/CPL, Gerbers and drill files. Run the included pin, geometry,
winding, mechanical, return, reference-plane, GaN, bias, ratings and final audits. The ratings
audit requires NumPy; the readability audit requires pypdfium2 and sexpdata;
independent Gerber rendering uses PyGerber 2.4.x and Pillow.

`audit_layout_changes.py` takes the previous A9 package directory as its
argument. It rejects any part-identity or pin-net change in this layout revision.
It splits overlapping centerlines and same-layer intersections before computing
route lengths, and includes the plated connector barrels as transitions. The
native project and source manifest remain the editable source; generated
manufacturing files should not be edited separately.
