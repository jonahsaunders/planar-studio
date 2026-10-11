> Historical design study. A11 manufacturing repairs and current measurements are in [README.md](README.md), [VALIDATION.md](VALIDATION.md) and [Manufacturing-audit.html](Manufacturing-audit.html).

# A7 layout changes informed by video review

Historical A9 package review. See [the current A10 / A8 review](DEEP-LAYOUT-REVIEW.md) for the subsequent routing and reference-plane changes.

Reviewed 10 October 2026. Public YouTube caption transcripts were retrieved and
read for the sections below; these notes do not claim a frame-by-frame video
review. The advice was checked against the actual device documentation before
changing the KiCad layout. No creator endorses this design.

| Creator resource | Reviewed section | Application to this board |
| --- | --- | --- |
| [Phil's Lab #60 — Switching Regulator PCB Design](https://www.youtube.com/watch?v=AmfLhT5SntE&t=378s) | 6:18–8:43: prioritize switching loops, keep power paths local, separate sensitive feedback from magnetics | Relocated the LM5164 ripple-sampling parts and removed the sensitive route beneath L2. Retained the existing short top-layer GaN bootstrap, supply and commutation paths. |
| [Robert Feranec / Rick Hartley — PCB Layer Ordering, Pouring and Stackup](https://www.youtube.com/watch?v=52fxuRGifLU&t=958s) | 15:58–18:47: provide a nearby reference transition when a signal changes reference planes | Prioritized ground stitches at GD1/GD2/VG2 vias before filling general stitching rows. Three transitions gain closer returns. Ground domains remain separate. |
| [Phil's Lab #71 — Switching Regulator Component Selection & Sizing](https://www.youtube.com/watch?v=FqT_Ofd54fo&t=354s) | Current, inductance and component-rating sections, approximately 5:54–14:00 | Added a part-by-part stress audit, separate inductor RMS/peak checks, resistor temperature derating and explicit capacitor DC-bias/ripple review requirements. Buck equations were not reused for the LLC tank. |

[TI's power-supply layout seminar](https://www.ti.com/video/6285511636001)
and [LM5164 layout guidance](https://www.ti.com/lit/ds/symlink/lm5164.pdf)
support separating sensitive feedback from the switching cell. The LM5164's
Type-3 ripple network intentionally samples SW through R19; it cannot simply
be tied to a DC rail or have its switching signal removed.

## Implemented changes and tradeoffs

- R19 and C23 now sit on the control side of the bias cell. The RIPPLE route
  clears a conservative 7.6 mm square around L2 on every layer. Its former
  route passed underneath the inductor. R19-to-C23 is now entirely on top.
- The bias divider/ripple reference now picks up at C21, the output reservoir
  capacitor. The explicit C21-to-R17 path decreases from **51.52 to 19.51 mm**.
- The R19-to-C23 trace grows from 5.24 to 10.39 mm to place the sensing network
  away from the magnetic component. This is a deliberate noise-separation
  tradeoff, not a claim that every connection became shorter. The C23-to-C24
  route stays about 11.1 mm.
- Return-via spacing improves from **2.53 to 1.05 mm** at U2 GD1,
  **2.52 to 1.30 mm** at the GD1 receiver, and **1.88 to 1.30 mm** at U3 VG2.
  Other transitions retain their existing clearances; the audit lists them.
- There are **59 added ground stitches**: 27 PGND, 12 AGND, 20 SGND. Each
  connects at least two existing same-net filled planes. The board has
  **206 routed vias**: 147 circuit vias plus 59 stitches, and six winding
  transitions. More vias alone are not a performance metric.
- R20/R25 retain their aligned 0603 positions with higher-power parts.
  F1 shifts 0.2 mm and its pads now match the new fuse's 1.45 × 1.8 mm
  recommended lands. The board outline, mounting pattern, ports and planar
  artwork are unchanged; every purchased component remains on top.

Evidence: [before/after routes](evidence/A9-layout-audit.json),
[inductor exclusion](evidence/bias-layout-audit.json),
[return vias](evidence/stitching-audit.json),
[filled-reference coverage](evidence/return-path-audit.json),
[GaN switching-node check](evidence/GaN-layout-audit.json).
These checks measure geometry; they do not establish EMI, parasitic inductance
or converter efficiency. See the [component audit](COMPONENT-RATINGS.md).
