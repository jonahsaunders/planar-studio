# A5 layout review - current returns and assembly

A7 schematic / A5 hardware, reviewed 2026-10-10. This is an unbuilt 48 V to
isolated 12 V / 5 A engineering prototype. David Perreault and MIT have not
reviewed or endorsed it.

## Return paths follow the switching and control currents

The LLC controller's GD outputs previously ran around the board without an
adjacent AGND plane. They now take shorter paths beside the primary circuitry,
with In3.Cu AGND directly adjacent to their routing layers. Local In5.Cu AGND
provides a second adjacent reference at the upper VIN feed crossing. The old
long AGND trace around this area is removed. Ground copper remains continuous
around the signal routes rather than forcing every return through one narrow
trace. The primary switch-node plane void is preserved.

The filled-copper audit samples actual copper, rather than the unfilled zone
outline, every 0.05 mm or less. Both LLC GD routes and both rectifier VG routes
have adjacent return copper at every sampled point outside the 0.65 mm signal-via
antipad allowance. Including those antipads, coverage is 97.65%, 97.28%, 100%,
and 81.89%, respectively. The short VG2 route has two layer transitions, so its
required antipads account for a larger fraction of its length. These figures
are geometric screens; they do not establish current distribution or inductance.
See [return-path evidence](evidence/return-path-audit.json).

TI's [LMG2100R044 datasheet](https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf)
connects AGND to the low-side source internally. No external AGND-PGND short is
introduced. HS likewise retains its local C4 connection and internal connection
to SW. The GaN bootstrap, VCC bypass and bias-buck switch paths validated in A4
remain short and entirely on F.Cu. The adjacent PGND region for the resonant
capacitor returns is widened, with parallel return vias retained.

## Rectifier and bypass placement

U3 rotates to bring its gate pins toward Q1 and Q2. The output capacitors and
sense/gate resistors are aligned around this smaller group. VSS still follows
a dedicated Q2 source-sense trace, excluded from every SGND pour; the separate
PGND connection and source vias carry gate-return current. VD1/VD2 have dedicated
drain-sense routes, following [TI's UCC24624 guidance](https://www.ti.com/lit/ds/symlink/ucc24624.pdf).
Ground-plane connections supplement the explicit routes below.

| Explicit copper path | A4 | A5 | A4 -> A5 via transitions |
| --- | ---: | ---: | ---: |
| U3 VG1 through R10 to Q1 gate | 12.85 mm | 2.76 mm | 0 -> 0 |
| U3 VG2 through R11 to Q2 gate | 14.28 mm | 10.24 mm | 2 -> 2 |
| U3 REG to C11 | 4.12 mm | 2.55 mm | 0 -> 0 |
| U3 VDD to C12 | 7.33 mm | 2.15 mm | 2 -> 0 |
| U5 input to C25 | 5.04 mm | 2.62 mm | 2 -> 0 |
| U5 output to C26 | 5.37 mm | 0.51 mm | 0 -> 0 |
| GaN LI divider to input | 15.82 mm | 10.98 mm | 2 -> 2 |

Lengths are track centerlines, excluding vertical barrels, resistor package
lengths and poured copper. See the [native layout comparison](evidence/A7-layout-audit.json).
The remaining VG2 layer changes and the REG bypass ground-plane path deserve
attention when checking both rectifiers' gate/source waveforms on hardware.

C10 moves immediately beside U2 VCC/GND with two direct 1.93 mm F.Cu connections.
It changes to **Samsung CL21B105KBFNNNE, C28323, 1 uF 50 V 0805 X7R**. This follows
[TI UCC25600 Rev D sections 9-10](https://www.ti.com/lit/ds/symlink/ucc25600.pdf),
which recommend 50 V 0805 for bias retention. The former 25 V 0603 is superseded.
The footprint, schematic voltage field, BOM and placement file match this change.
The direct catalog snapshot lists positive stock and basic-part status.

## Manufacture and debug

All 75 purchased components remain on top: 73 SMT and two through-hole headers.
Nineteen placements change; the 64 x 56 mm chamfered outline, 55 x 47 mm M3
pattern, transformer artwork and opposing removable terminal headers remain
fixed. Six rail/return test pads and three fiducials remain accessible. J1 and
J2 keep pin 2 positive and pin 1 return. Component reference IDs are on the
assembly layer; duplicate library labels are removed and each part has one readable reference. The [top assembly PDF](manufacturing-prototype/Assembly-top.pdf) accompanies the BOM and CPL. Silkscreen identifies functional groups and polarity.

Routing uses 163 vias, down from 169. These and the six winding transitions
require the specified filled/capped process where they occupy component lands.
The four 1.6 mm connector holes stay open. The proposed eight-layer, all-layer
2 oz, nominal 1.6 mm stack needs factory acceptance; the routing rules retain
0.16 mm minimum track/global clearance and 0.20 mm ordinary net clearance.
The [manufacturing notes](manufacturing-prototype/READ-BEFORE-ORDER.txt) cover
rotations, mixed SMT/THT assembly, open connector holes and core fitting.

The electronics BOM has 42 exact stocked catalog candidates. JLCPCB has not
accepted these specific files, the exact dielectric stack, placement rotations,
through-hole operation or installation of the separate DigiKey core and clips.
This is a prepared turnkey electronics package, not a confirmed factory order.

## Checks and remaining measurements

ERC, PCB DRC, schematic parity, BOM/CPL mapping, winding-contact screening and
mechanical checks pass. Independent Gerber renders and all eight native copper
layers are reviewed. A separate-directory rebuild reproduces tracks, vias,
pads and zone outlines; KiCad fill corner tessellation differs by less than
0.01 mm2 per zone, with clean DRC and the same sampled return-plane coverage.
See [validation](VALIDATION.md) for evidence and release holds.

Planar windings provide reproducible turns, registration and connections in a
low-profile assembly. The retained winding model still estimates **2.85 W of
DC copper loss** at assumed RMS currents and 80 C resistance, before AC and
core loss. Wider variants previously failed winding/core clearance checks;
no clearance was relaxed to force them. This remains a material thermal limit.
The 60 W target requires assembled magnetics, startup, gate timing, protection,
regulation, efficiency and thermal measurements before production release.
