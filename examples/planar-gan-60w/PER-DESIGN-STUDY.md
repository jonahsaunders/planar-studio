# What the MIT PER boards contributed to PS-GAN-60W

This is an independent Planar Studio example. David Perreault and MIT have not
reviewed, endorsed or measured this converter. The references informed physical
design decisions; their measured results do not describe PS-GAN-60W.

## Boards examined

I inspected the following photographs from the [MIT Power Electronics Research
Group gallery](https://per.mit.edu/project-gallery/) and followed its publication
links. Photographs remain on MIT's site rather than being redistributed here.

| Reference | Visible design choices | Application to this board |
| --- | --- | --- |
| [1 kW split-phase planar converter](https://per.mit.edu/wp-content/uploads/2023/10/380-V-12-V-dc-dc-converter-for-server-applications.jpg) | A central low-profile core, repeated nearby rectifier/capacitor groups, large power terminals, standoffs and accessible probe loops. | Keep the rectifiers close to winding exits; give power connections, mounting and measurements dedicated space. |
| [50 W USB VIRT converter](https://per.mit.edu/wp-content/uploads/2014/05/50_watt_usb.png) | A rectangular transformer-centered assembly with electronics arranged along the magnetic structure; both PCB faces are populated. | Use an elongated outline and group by current path. Our all-top requirement needs more area. |
| [75 W isolated converter](https://per.mit.edu/wp-content/uploads/2014/05/IMG_5328-scaled.jpg) | A narrow board, low-profile central magnetics, aligned power components, corner supports and concise functional markings. | Preserve an orderly perimeter, clear port labels and unobstructed mounting areas. |
| [75 MHz printed-transformer prototype](https://per.mit.edu/wp-content/uploads/2014/05/13.png) | A compact central circuit surrounded by substantial copper terminals, identified probe connections and corner mounts. | Add rail/return test pairs. Do not infer high-frequency performance from visual resemblance. |

These are visual observations. They do not establish undocumented stackups,
connector ratings, thermal resistance or internal routing.

## Electrical lessons from the papers

Ranjram and Perreault's [380–12 V, 1 kW planar-transformer paper](https://per.mit.edu/wp-content/uploads/2023/10/IEEE-Transactions-on-Power-Electronics-Vol.-37-No.-2-pp.-1666-1681-Feb.-2022.pdf),
especially Section IV and Figures 9–10, treats terminations as part of the
magnetic design. Rectifier placement, capacitor placement and return paths must
support the actual AC current loop. Symmetry and short connections limit losses
outside the core window. Their stack and fractional-turn architecture serve a
different voltage ratio and current level; copying them directly would not
validate this LLC design. Their discussion of test hardware also distinguishes
the laboratory board footprint from the transformer/rectifier volume used in
performance comparisons.

The [50 W universal-input charger study](https://per.mit.edu/wp-content/uploads/2023/10/A_Two-Stage_Universal_Input_Charger_With_Wide_Output_Voltage_Range.pdf)
illustrates a size-versus-loss tradeoff: the authors evaluate active buffering,
multiple operating modes and the VIRT stage together. Component volume and
whole-converter performance depend on operating conditions. A compact photograph
alone is therefore inadequate evidence for an efficiency or density claim.

Lu, Perreault, Otten and Afridi's [impedance-control-network study](https://per.mit.edu/wp-content/uploads/2015/09/Lu-Impedance-Control1.pdf)
explains why maintaining soft switching over voltage and load changes is a
separate design problem. Its multiple-inverter ICN architecture is not adopted
here. It reinforces the need to test light load, burst operation and switching
waveforms rather than assuming that a resonant tank always achieves ZVS.

## Concrete A1 decisions

- **80 × 58 mm, chamfered rectangle.** The central power/control assembly retains
  its compact placement. The additional width accommodates opposing horizontal
  power plugs and their approach space. Four corner mounts resist cable handling
  loads without using the ferrite clips as structural supports.
- **The actual flyback mounting footprint.** Four 3.2 mm NPTH M3 holes reuse its
  6.4 mm exposed-substrate openings, outward mask extensions, 10 mm copper
  exclusions and enlarged courtyards. The new pattern is **71 × 49 mm**, rather
  than the flyback's 35 × 85 mm. The hole geometry and clearances are identical;
  the boards are not mounting-pattern interchangeable.
- **Dedicated DC power ports.** AMASS XT30PW-M30.G.Y input and XT30PW-F20.G.Y
  output replace three unshrouded headers. Both are polarized, edge-facing
  two-contact ports. The output's two contacts now carry positive and return,
  eliminating the previous separate parallel-pin headers. Pin 2 is positive
  and pin 1 is return on both KiCad footprints. Opposite genders distinguish
  the intended input/output harnesses but are not a voltage-specific interlock.
- **Local output storage.** C15 moves from the lower capacitor bank to the upper
  rectifier region. Its center-to-Q1 distance decreases from 21.74 to 5.8 mm.
  This is a placement metric, not a measured loop-inductance or loss reduction.
  The other output capacitors stay near the lower rectifier/output distribution.
- **Return copper and testing.** Primary and secondary return pours expand into
  the connector margins, with the mounting rules enforced on every copper
  layer. Six bare ENIG pads expose VIN/PGND, VOUT/SGND and V5/AGND. No long
  switching-node probe stub is added. AGND joins PGND only inside the GaN IC.
- **Honest markings.** The board identifies input, output, returns and revision.
  It carries an engineering-prototype marking. No MIT branding, invented
  efficiency figure or asserted thermal rating is used.

## What planar integration demonstrates

T1 uses repeatable PCB winding geometry, parallel secondary copper and a stock
ELP22 core without a bobbin or manually wound coil. It remains integrated into
the same board as the GaN stage and rectifiers. A1 occupies 46.4 cm² versus
41.36 cm² for the 5 W flyback example: approximately 12% more board area for a
12× higher **power target**. This is a target comparison between different
topologies, not a measured power-density achievement. Including connectors,
core height, cooling and operating limits is necessary for a fair comparison.

The integration has costs: eight 2 oz copper layers, filled/capped vias, winding
termination losses, coupling/capacitance tradeoffs and a separate core-fitting
operation. The current estimate of 2.85 W is DC winding loss at assumed RMS
currents and temperature; AC copper loss and core loss are additional. Neither
the board's appearance nor a clean DRC proves 60 W continuous operation.

## Qualification still required

Confirm JLCPCB's exact stack and connector soldering process, assembled core fit,
inductance/leakage, capacitor derating, startup, control-loop stability, no-load
behavior, fault handling, ZVS/SR timing, efficiency and temperature. This release
publishes an editable, checked CAD prototype with that work explicitly open.
