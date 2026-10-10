Current revision: **A9 schematic / A7 hardware**. See the [new video-based changes](VIDEO-LAYOUT-REVIEW.md) and [component audit](COMPONENT-RATINGS.md). The A6 study below records the previous revision. Its 2.85 W winding-loss estimate is superseded by the 3.69 W A9 thermal screen.

# A6 layout review — GaN loops, placement and stitching

A8 schematic / A6 hardware, reviewed 2026-10-10. Unbuilt 48 V to isolated
12 V / 5 A prototype. KiStack's placement and fabrication-output review
workflow is used. No MIT affiliation or endorsement is implied.

## Published engineering guidance

[TI LMG2100R044 section 8.4](https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf)
is the device-specific authority: input return immediately beneath the power
loop, close top-side bootstrap/VCC bypassing, separate external AGND/PGND,
and no plane overlap with SW. The [LMG2100EVM layout figures](https://www.ti.com/document-viewer/lit/html/SNVU863/GUID-80BAA52A-EAE9-4A03-B329-1DFBC3C10537)
provide top and inner-layer references. Its performance does not transfer to
this isolated LLC design.

[EPC WP010](https://epc-co.com/epc/Portals/0/epc/documents/papers/optimizing%20pcb%20layout%20with%20egan%20fets.pdf)
explains outgoing/return geometry, layer spacing and common-source inductance.
U1 integrates the FETs and driver: HI/LI are logic inputs, not exposed gates.
The key external fast loops are input commutation, bootstrap and driver supply.
[Analog Devices AN-139](https://www.analog.com/en/resources/app-notes/an-139.html)
supports identifying the fully switched loop and protecting sensitive sensing.
[TI's via guidance](https://www.ti.com/document-viewer/lit/html/SSZT978/GUID-8C25D4C0-B783-4E3A-9E0C-8DE1DFBC7851)
supports parallel ground transitions. Its silicon-buck example is not a reason
to enlarge the GaN SW node; the LMG2100 capacitance guidance takes precedence.

[IPC's design-standard catalog](https://www.ipc.org/ipc-design-standards)
identifies IPC-2221/2222 for generic/rigid-board design and IPC-2152 for conductor
current capacity. These are production-review references, not evidence of
compliance with a class or company-private rules. Full standards conformance
is not claimed. The [MIT PER study](PER-DESIGN-STUDY.md) supplies architectural
and visual references: central magnetics, repeated local cells and bench access.

## GaN power stage

C3 moves 0.6 mm closer to U1 within existing courtyard/clearance rules. Its
VIN/return legs decrease from 3.369/3.511 to 2.780/2.913 mm, entirely on F.Cu.
The pad-center loop polygon shrinks from 8.5967 to 7.0817 mm² (17.6%). This
polygon closes directly between package pads; it does not model the internal
die path or extract inductance.

The old SW exclusion followed tracks but omitted portions of the custom GaN
and inductor lands. A6 subtracts their complete polygons. The 5 V feed moves
out from underneath SW. An independent polygon check finds no foreign plane
or internal-track overlap with the complete SW projection. In1 PGND is present
under every sampled point of the VIN-to-C3 trace. See [GaN evidence](evidence/GaN-layout-audit.json).

The 1.53 mm bootstrap legs and short local VCC bypass remain. AGND/PGND have
no external short. HS returns locally to C4 and connects internally to SW.
U3 retains its dedicated source sensing and separate gate return, following
[UCC24624 guidance](https://www.ti.com/lit/ds/symlink/ucc24624.pdf).

## Purposeful placement

Twenty-four placements change. U2 timing and filter parts follow the pin order
beside the IC, consistent with [UCC25600 sections 9–10](https://www.ti.com/lit/ds/symlink/ucc25600.pdf).
R9/D2/R8 form a sensing group above it. The two feedback cells share aligned
divider columns and repeated LED-resistor rows; reference and compensation
parts stay local. The output bank and bias-enable divider are also regrouped.

| Explicit track connection | A5 | A6 | Via transitions |
| --- | ---: | ---: | ---: |
| U2 DT to R1 | 5.95 mm | 1.48 mm | 2 → 0 |
| U2 RT to R2 | 4.09 mm | 1.70 mm | 2 → 0 |
| U2 SS to C9 | 4.59 mm | 2.14 mm | 2 → 0 |
| U2 OC to C18 | 9.99 mm | 1.82 mm | 2 → 0 |
| D2 to U2 OC | 13.65 mm | 7.25 mm | 2 → 2 |
| U7 REF to C28 | 11.72 mm | 1.72 mm | 2 → 0 |
| U7 REF to R22 | 7.97 mm | 4.18 mm | 2 → 0 |
| U9 REF to R27 | 7.72 mm | 3.34 mm | 2 → 0 |
| U4 EN to R14 | 9.21 mm | 5.62 mm | 2 → 2 |

Lengths exclude barrels, components and pours. [All measurements](evidence/A8-layout-audit.json)
also check retained power paths. Circuit identities, winding artwork, 64 × 56 mm
outline, 55 × 47 mm M3 pattern and removable headers stay fixed. All 75 purchased
placements remain on top. The C10 1 uF / 50 V / 0805 bypass is retained.

## Ground stitching and assembly

**54 new 0.6/0.3 mm stitches:** 25 PGND, 10 AGND and 19 SGND. Each selected
position had a full annulus on two or more existing same-net filled layers and
still connects to at least two after refilling. Candidate rows avoid foreign
copper, the magnetic assembly, isolation corridor, mounting exclusions,
fiducials and silkscreen labels. No stitch ring passes through a core opening.
No ground domains are joined. See [per-via evidence](evidence/stitching-audit.json).

There are 149 circuit vias plus 54 stitches, totaling 203 routed vias, and six
winding transitions. The filled/capped via-in-pad process remains required;
four connector lead holes stay open. BOM, CPL and the [assembly drawing](manufacturing-prototype/Assembly-top.pdf)
are regenerated. Four checked GD/VG routes retain adjacent filled reference
coverage outside their signal-via antipads. [That screen](evidence/return-path-audit.json)
does not establish current density, inductance or EMI.

## Validation boundary

ERC, DRC/parity, winding-contact, pin mapping, BOM/CPL, mechanical and clean-copy
rebuild checks pass. Native layers, 3D assembly and independently rasterized
Gerbers are inspected. [Validation](VALIDATION.md) records evidence and methods.

The eight-layer, all-layer 2 oz, nominal 1.6 mm stack still needs JLCPCB file-level
acceptance, including filled/capped vias, rotations, mixed SMT/THT assembly and
the separate DigiKey core/clip operation. The winding model estimates 2.85 W DC
copper loss before AC/core losses. Switching waveforms, ZVS, regulation,
startup/protection, efficiency and temperature require hardware measurements.
