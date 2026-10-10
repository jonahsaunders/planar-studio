# A4 layout review — first-principles changes

This revision improves the physical implementation of the 48 V to isolated
12 V / 5 A target. It remains an unbuilt engineering prototype. The schematic
is A6; the hardware is A4. David Perreault and MIT have not reviewed this board.

## Current loops before appearance

Fast current steps produce voltage error through interconnect inductance.
Accordingly, the GaN bootstrap and VCC bypass loops now run entirely on the
component layer, with the capacitors facing their pins. The two driver-input
dividers move from the controller area to the GaN receiver area, reducing the
length of the higher-impedance logic nodes. Longer routes carry the controller's
low-impedance GD outputs before the dividers.

| Explicit route | A3 length | A4 length | A3 → A4 via transitions |
| --- | ---: | ---: | ---: |
| U1 HB → C4 | 4.09 mm | 1.53 mm | 0 → 0 |
| U1 HS → C4 | 4.24 mm | 1.53 mm | 2 → 0 |
| U1 VCC → C6 | 5.45 mm | 2.59 mm | 2 → 0 |
| U1 AGND → C6 | 2.67 mm | 2.49 mm | 0 → 0 |
| LM5164 SW → L2 | 11.94 mm | 3.66 mm | 2 → 0 |
| LM5164 BST → C20 | 5.55 mm | 2.12 mm | 2 → 0 |
| High-side divider → HI | 41.48 mm | 5.75 mm | 2 → 0 |
| Low-side divider → LI | 54.81 mm | 15.82 mm | 2 → 2 |

These are native track-centerline measurements, excluding vertical barrel
distance and pours. They are **not** extracted inductance or measured switching
performance. Full data and the exact method are in the
[layout comparison](evidence/A6-layout-audit.json).

[TI's LMG2100R044 datasheet](https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf)
identifies HS as internally connected to SW. The unnecessary external HS–SW
connection is removed: C4 returns directly to HS through its own short route.
The native schematic therefore names that external connection HS_LOCAL. HS is
not floating electrically; its connection to SW is inside U1. AGND likewise
retains the manufacturer's internal connection to the low-side source; it is
not externally shorted to PGND.

Local PGND and VIN spreading copper supports the GaN supply loop. L2 copper
under the input loop provides a nearby return; plane copper is removed beneath
the high-slew-rate SW trace to limit unnecessary capacitive coupling. Extra
parallel vias connect the resonant-capacitor returns and output storage to their
return copper. Copper spreading and additional vias at U1 and U4 improve the
physical heat-flow paths; their thermal performance is not yet measured.

## Sense voltage without sharing the gate return

UCC24624 VSS now reaches Q2's source through a dedicated trace. Every SGND pour
excludes the VSS escape via; the separate PGND pin carries gate-drive return
current. This implements the distinction in
[TI's UCC24624 layout guidance](https://www.ti.com/lit/ds/symlink/ucc24624.pdf).
VD1 and VD2 retain dedicated drain-sense routes. The gate resistor for Q2 moves
beside its source/gate group; source returns use parallel escaped vias.

This is a geometric Kelvin connection, not proof of millivolt sensing accuracy.
Common-source inductance, drain ringing, gate timing and reverse current still
need differential measurements on both rectifiers. The all-top placement also
limits how closely U3's REG bypass can approach the package; it remains a
specific item for the first switching review.

## Compact bias supply and useful assembly markings

The LM5164 input capacitor, bootstrap capacitor, inductor and ripple/feedback
network form a tighter local group. The switch-to-inductor connection and
bootstrap connection no longer change layers. RON remains connected through
100 kΩ to PGND, preserving the A3 correction required by
[the LM5164 datasheet](https://www.ti.com/lit/ds/symlink/lm5164.pdf).

Functional silkscreen identifies the GaN, LLC control, bias, feedback and OVP
areas. Power polarity, six rail/return probe pads and opposing removable
terminals remain accessible. Dense component reference IDs are available in the
front assembly drawing. All 75 purchased components remain on top. The 64 ×
56 mm chamfered outline, 55 × 47 mm mounting pattern, winding geometry, connectors
and exact purchased part identities are unchanged from A3.

## Manufacturing details that matter

- The proposed eight-layer stack requests 2 oz copper on every layer. Native
  minimum track width and clearance constraints are 0.16 mm; ordinary net
  clearance is 0.20 mm. This meets the published 0.16 mm 2 oz minimum in
  [JLCPCB's copper-weight guidance](https://jlcpcb.com/help/article/jlcpcb-copper-weight).
  It does not establish acceptance of this exact stack or these files.
- There are 169 routed 0.30 mm vias and six winding interlayer holes. Filled,
  copper-capped, planarized interconnects are required because some occupy SMT
  lands. The four 1.6 mm connector contact holes must remain open. See the
  [fabrication notes](manufacturing-prototype/READ-BEFORE-ORDER.txt).
- Gerbers are rendered independently with PyGerber and reviewed alongside native
  copper exports, including winding transitions, plane voids, paste and masks.
  See the [Gerber review](evidence/Gerber-review.png). Factory DFM, rotations,
  through-hole soldering and DigiKey core fitting still need acceptance.

## Remaining design limit: magnetic loss

Planar construction gives repeatable turns and layer alignment, a low-profile
assembly and PCB-defined winding connections. It does not guarantee low loss.
The retained winding estimate is **2.85 W of DC copper loss alone** at the
assumed RMS currents and 80 °C resistance, before AC/proximity and core losses.
This is a significant part of a 60 W converter's loss budget.

Wider-trace variants were screened with Planar Studio's assembly checks; the
tested variants intersected a winding transition or core opening. No clearance
guard was relaxed to force a visually thicker winding. Reducing this loss
requires revisiting the termination geometry/core/stack together, then checking
magnetizing and leakage inductance against the resonant design. A thermal and
switching-qualified 60 W claim is deliberately not made.

The next engineering measurements are assembled winding resistance, turns and
polarity, magnetizing/leakage inductance, low-power startup and gate waveforms,
then protection, regulation, efficiency and temperature across the stated input
and load range. The [validation record](VALIDATION.md) separates completed CAD
checks from these unfinished hardware qualifications.
