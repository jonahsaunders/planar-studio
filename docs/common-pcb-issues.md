# Common PCB integration issues

Generated winding copper needs independent geometry and current-path checks after integration into a board. A clean KiCad DRC report cannot establish that a same-net or net-tie winding has the intended turns.

The [5 W flyback issue reference](../examples/planar-flyback-5w/COMMON-ISSUES.md) records winding defects, tangent via lands and annular-margin issues, their A10 corrections, reproducible checks and regression cases:

| Failure mode | Observed example | Check |
| --- | --- | --- |
| A wide external landing bypasses winding turns | A7's SW track overlapped front winding copper while its primary net tie passed DRC. | Actual copper outlines against the winding, with layer-specific terminal contacts. |
| Nominal spacing overstates the smallest copper gap | A7/A8's 0.20 mm setting gave approximately 0.191 mm at rectangular-spiral corners. | Minimum nonlocal segment distance, final polygon envelope and actual Gerber-region comparison. |
| Via lands touch at a point | A9 had 0.90 mm lands on 0.90 mm pitch, with a zero connection-width limit. | Nonzero native connection-width rule, analytic overlap check and a regression using the actual old PCB. |
| Annular rings have insufficient process margin | A9 T1 used 0.15 mm rings while the global rule permitted 0.10 mm. | Explicit T1 requirement of 0.20 mm; recheck surrounding copper and core-edge clearance after enlargement. |

The same reference covers plated barrels on unintended layers, rerouting after terminal moves, continuity-test ambiguity, stale exports and assembly placement datums. These are integration pitfalls to check, not a claim that every tool family has every defect.

For the flyback, A10 uses a 0.30 mm spacing setting, measures approximately 0.289 mm between turns (0.260 mm CAD minimum), retains 0.6 mm winding width, and includes independent winding checks in its rebuild. T1 lands provide 0.20 mm annular rings, and four secondary via lands grow to 1.00 mm to eliminate tangent contacts. Nonzero connection-width and mask-clearance rules plus regressions guard these fixes. Its native PCB drawing layer and schematic point to the issue reference. **This corrects the example; the nominal-spacing interpretation and the need to verify other generated designs still apply.**

When recording another issue, include the affected version/design, actual geometry or failing behavior, why previous validation missed it, the corrective change, and a regression case that rejects the original failure. Keep hardware qualification separate from CAD geometry checks.
