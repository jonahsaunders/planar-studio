# Antenna and Transformer creators

The original creators described here were introduced in 1.1.0.
See [the 1.2 family guide](creator-families.md) for additional antenna types,
multilayer/tapped/multi-secondary windings and the ferrite model. Select **Antenna** (shortcut 4) or
**Transformer** (shortcut 5). The parameter rail, design name, saved designs,
JSON import, exports and layer visibility work like the existing workspaces.
Invalid geometry clears the result; placement/export recomputes the current inputs.

## Rectangular patch antenna

The first antenna topology is an edge-fed rectangular microstrip patch in its
fundamental TM10 mode. Enter target frequency, substrate dielectric constant,
front-to-back copper spacing and copper weight. Feed impedance determines the
microstrip feed width. Length/width tuning scales adjust the actual generated
patch; the resonance readout follows the resulting length. The default is
2.45 GHz on 1.6 mm, er=4.4 substrate, giving approximately W=37.234 mm and
L=28.809 mm.

The patch is an exact rectangular surface copper pad on F.Cu; the finite ground
plane is another rectangular pad on B.Cu, with no connecting through via. Both
have solder-mask openings. The RF feed is an F.Cu track touching the patch edge.
The ground margin grows the ground beyond the patch/feed. An outline is exported
as a board suggestion. The IPC placement does not replace the open board outline.

Connect RF at the outer end of the feed, and ground on the back plane. Direct
placement requires existing **RF** and **GND** nets. Exporting a KiCad board
creates the named nets in that file. Do not connect the RF feed through the
back ground plane. A 50 ohm feed line does **not** imply a 50 ohm antenna input;
add/tune a matching network using an EM solver or VNA measurement.

Starting dimensions use the common transmission-line approximation:

- W = c/(2f) sqrt(2/(er+1))
- ee = (er+1)/2 + (er-1)/(2 sqrt(1+12h/W))
- dL = 0.412h (ee+0.3)(W/h+0.264)/((ee-0.258)(W/h+0.8))
- L = c/(2f sqrt(ee)) - 2dL
- Estimated resonance after tuning = c/(2(L+2dL)sqrt(ee))

Use consistent length units. Feed synthesis uses the app's existing finite-copper
microstrip model. Background for these patch equations and the need for EM
validation: [Merino-Fernandez et al., Scientific Reports (2025)](https://doi.org/10.1038/s41598-025-18939-2), antenna design section.
The effective-permittivity correction uses the reciprocal square root, with
1 < ee < er for ordinary substrates.

This creator does not predict S11, input resistance, gain, bandwidth, radiation
pattern or efficiency. Finite ground, edge-feed loading, enclosure, dielectric
loss, solder mask and fabrication variation change the realized response. On a
multilayer board, keep intermediate copper away from the patch and feed: the
model assumes the reference plane is B.Cu, separated by the full board thickness.

## Air-core planar transformer

Choose circular or square windings, primary and secondary turn counts, outside
diameter, track width and turn clearance. Each winding occupies one outer layer.
The generator rejects turn counts that will not fit, instead of silently changing
the turns ratio. Board thickness sets their separation. Copper weight and
operating temperature determine DC winding resistance.

| Pad | Winding | Location | Polarity |
|---|---|---|---|
| 1 | Primary | F.Cu, outer end | Dot |
| 2 | Primary | F.Cu, inner end | |
| 3 | Secondary | B.Cu, outer end | Dot |
| 4 | Secondary | B.Cu, inner end | |

Terminals are track-width SMD pads to avoid bridging adjacent turns. Inner
terminals are enclosed: use insulated jumpers or design extra breakout routing
and verify its clearance separately. Through vias at overlapping windings can
short the two windings and are deliberately not generated. There is no automatic
core window, ferrite model or reinforced-isolation design.

For a design named T1, direct placement requires existing **T1_PRI** and
**T1_SEC** nets. Renaming the design changes these generated net names; spaces and punctuation other than period, hyphen and underscore become underscores. A KiCad
board export includes both nets. Unknown explicit nets never fall back to a
shared default net in the placement backend.

The Neumann partial-inductance solver uses the actual exported winding paths
for Lp, Ls and M. It reports k=M/sqrt(Lp Ls), primary-referred leakage
Lp(1-k^2), and open-secondary sinusoidal induced voltage 2*pi*f*abs(M)*Ip.
This induced-voltage value assumes an imposed primary RMS current; it is not a
loaded transformer voltage-transfer simulation. DC loss is Ip^2 Rp + Is^2 Rs at
the two entered RMS currents. The turns ratio is Np/Ns, not a guaranteed voltage
ratio when coupling is imperfect.

The model excludes ferrite, ground-plane/shield eddy currents, external return
paths, interwinding capacitance, self-resonance and AC skin/proximity losses.
Use below self-resonance and verify the full circuit separately. Keep copper
planes clear of the windings. Neither dielectric spacing nor a computed current
establishes a voltage-isolation or power rating.

## Export and placement details

All six existing exports remain available. SVG preserves rectangular pads; DXF
contains their layer-specific outlines (track polylines retain the existing
centerline convention). KiCad board exports contain SMD pads in footprints;
footprint exports retain numbered surface terminals. IPC placement groups surface
pads in a footprint and creates winding/feed tracks normally. Surface pads stay
on F.Cu/B.Cu, and remove/replace/select also includes the new footprint object.
The export footprint's winding tracks are copper graphics, following the existing
exporter convention; review net connectivity and run KiCad DRC after placement.

The generic optimization, measurement fitting, field and tolerance tools still
support their original workspaces. New creators open Board checks by default;
unsupported studies explain their scope instead of running an inductor model.
Board checks approximate rectangular pads conservatively with enclosing circles,
so findings near a patch corner can be false positives; verify in KiCad DRC.

## Validation

- `npm test`: existing numerical/geometry/RPC tests plus creator calculations,
  validation, net isolation and export round trips.
- `npm run test:creators:dom`: full-app DOM/event integration with canvas/layout stubbed.
- `npm run test:creators:browser`: full-app browser interaction tests.
- `python3 -m unittest discover -s tests -p 'test_surface_pads.py'`: actual kicad-python
  pad/footprint serialization with a fake board (requires requirements.txt).
- `npm run build`: PCM archive including both new engines/workspaces and this guide.

Native KiCad placement, DRC and physical RF/magnetic measurements require a
separate host/prototype validation pass before publishing a stable release.
