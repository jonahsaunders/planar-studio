# Vivaldi, printed Yagi, log-periodic and bow-tie antennas

Choose a new family in **Antenna → Antenna type**. All four support live copper
preview, layer visibility, Save/Open and JSON import, specifications, SVG/DXF,
KiCad board/footprint export, and the existing KiCad placement path. The enlarged
1–32 row/column patch-array controls remain available.

These are manufacturable starting geometries, not validated RF designs. There
is no full-wave solution for impedance, S11, gain, efficiency, bandwidth or
radiation pattern. Baluns, connectors, enclosure loading and matching need
separate design and validation. No ideal patch-array plot is reused for these
families. In particular, director count does not imply a gain value and LPDA
length ratios do not establish usable bandwidth.

| Family | Main controls | Copper and feed |
|---|---|---|
| Vivaldi tapered slot | Taper length, aperture, throat, rectangular back-slot length, open stub, line impedance, copper edge step | Exponential opening in connected B.Cu ground; F.Cu microstrip crosses the slot and ends in an open stub |
| Printed Yagi | 1–20 directors, director/reflector spacings, relative lengths, director taper, driven gap and width | Split F.Cu driven dipole, one isolated reflector and individually isolated directors; balanced terminals |
| Printed log-periodic | 3–24 dipoles, tau, spacing ratio, longest arm width, boom width and feed extension | Alternating arms on F.Cu/B.Cu, joined to two isolated overlapping booms; balanced feed at the smallest-element end |
| Bow-tie dipole | Flare angle, electrical-length scale, tip width, feed gap and copper edge step | Two filled flared F.Cu arms with isolated balanced terminals |

## Sizing and tuning

Yagi, bow-tie and LPDA use a rough exposed-conductor approximation:

- `epsEffective = (epsR + 1)/2`.
- `lambdaEstimated = c / (f sqrt(epsEffective))`.
- Driven/longest full span: `lambdaEstimated/2 × electricalLengthScale`.

The board thickness and finite substrate are not solved by this approximation.
For LPDA, front/back spacing must be reproduced in the board stack, but no
parallel-strip impedance calculation is claimed.

Yagi spacing controls are fractions of `lambdaEstimated`. The reflector lies
behind the driven element; directors extend toward +Y. Director lengths are
`drivenLength × (firstDirectorRatio − index × shorteningPerElement)`.
Impossible short directors or overlapping elements produce an error. The
reflector and directors have no assigned net. Do not attach them to ground.
A balanced source or external balun connects to RF_P and RF_N at the driven gap.

Bow-tie flare angle is the full included angle of each arm. Tips have the
entered radiator trace width, and the feed gap is actual copper-edge separation.
The flared arms start from a half-wave span; their resonance still requires
simulation or measurement.

For LPDA, element `i` has full length `L0 × tau^i`, arm width `W0 × tau^i`,
and distance to the next element `spacingRatio × Li`. Spacing ratio here means
exactly distance divided by the preceding **full** dipole length; it is not a
separately defined textbook sigma. RF_P uses the front boom and RF_N the back
boom. Opposite arms of each dipole lie on opposite layers, and those layer
assignments reverse on successive dipoles. This provides polarity reversal
without shorting the booms. Do not join the booms with a through via. Use a
balanced feed or independently designed balun. Smallest arm widths below
0.1 mm, insufficient length and overlapping elements are rejected. Increase
tau or reduce count if the smallest elements become too small.

The LPDA readout called **Element-length frequency span** calculates the
half-wave frequencies corresponding to the longest and shortest spans under
the same approximate dielectric model. These endpoints are not a predicted
operating band, and the active-region end effects are not included.

Vivaldi dimensions are entered directly. Target frequency affects the feed-line
width calculation and aperture/wavelength readout; it does not automatically
resize or tune the aperture. Slot opening follows
`slotWidth(y) = throat × exp(log(aperture/throat) × y/taperLength)`.
The two slot sides connect through a ground bridge behind a closed rectangular
back slot. The front microstrip crosses its midpoint and continues into an
adjustable open stub. The line's impedance is estimated over intact ground,
not at the slot discontinuity. Tune the back slot and stub together; this
version does not synthesize a broadband matching network or circular cavity.

## Filled copper profiles and clearances

Vivaldi and bow-tie shapes use filled, finely stepped rectangular copper pads.
**Copper edge step** bounds the deviation from the analytical profile in each
axis. Smaller values produce smoother profiles and larger files. A tiny overlap
between adjacent strips avoids rounding gaps in exported copper. There is a
4096-step-per-side limit; excessive combinations fail explicitly and suggest
increasing the step or reducing size. The preview and every export use these
same physical profiles; they are not merely thin outline antennas.

The generated surface pads are copper features, not component lands. They have
solder-mask openings and no paste openings. Keep solder mask off the modeled
antenna copper. Yagi parasitic pads have empty pad numbers and no assigned net.

For Yagi and bow-tie, keep ground and unrelated copper clear behind the whole
radiator. For LPDA, keep unrelated copper and ground planes away from both
booms and all arms. For Vivaldi, keep the B.Cu slot empty and intermediate copper
clear of the slot and feed. The Dwgs.User rectangle is an advisory guide, not
an enforced keepout. Direct placement does not create the board outline or
keepout rules; add them in KiCad. Board exports include an Edge.Cuts outline.

All readouts state overall board dimensions including the outline margin.
KiCad direct placement requires the named RF nets to exist in the board. Board
exports include the assigned nets. Review final connectivity and DRC in KiCad.

## Validation

`tests/directional-antennas.mjs` checks independent scaling relationships,
profile error and continuity, net separation, feed/slot crossings, LPDA polarity,
parameter boundaries and export preservation. The general creator-family suite
checks all exports and saved-design round trips for all four families. Whole-app
DOM tests exercise family selection, controls, saving and export dialogs; the
browser suite includes the families for environments with working Chromium.
These tests do not establish RF performance or replace physical measurements.

Design background (the generator does not copy these example layouts):

- [MathWorks Vivaldi PCB and matching example](https://www.mathworks.com/help/antenna/ug/design-an-internally-matched-ultra-wideband-vivaldi-antenna.html)
- [MathWorks printed log-periodic geometry](https://www.mathworks.com/help/antenna/ref/lpda.html)
- [MathWorks Yagi-Uda geometry](https://www.mathworks.com/help/antenna/ref/yagiuda.html)
- [MathWorks planar bow-tie geometry](https://www.mathworks.com/help/antenna/ref/bowtietriangular.html)
