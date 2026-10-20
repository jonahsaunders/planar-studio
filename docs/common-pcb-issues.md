# Common PCB integration issues

Generated winding copper needs independent geometry and current-path checks after integration into a board. A clean KiCad DRC report cannot establish that a same-net or net-tie winding has the intended turns.

The [5 W flyback issue reference](../examples/planar-flyback-5w/COMMON-ISSUES.md) records two measured defects, their A9 corrections, reproducible checks and regression cases:

| Failure mode | Observed example | Check |
| --- | --- | --- |
| A wide external landing bypasses winding turns | A7's SW track overlapped front winding copper while its primary net tie passed DRC. | Actual copper outlines against the winding, with layer-specific terminal contacts. |
| Nominal spacing overstates the smallest copper gap | A7/A8's 0.20 mm setting gave approximately 0.191 mm at rectangular-spiral corners. | Minimum nonlocal segment distance, final polygon envelope and actual Gerber-region comparison. |

The same reference covers plated barrels on unintended layers, rerouting after terminal moves, continuity-test ambiguity, stale exports and assembly placement datums. These are integration pitfalls to check, not a claim that every tool family has every defect.

For the flyback, A9 uses a 0.25 mm spacing setting, measures approximately 0.240 mm between turns, retains 0.6 mm winding width, and includes independent winding checks in its rebuild. Its native PCB drawing layer and schematic point to the issue reference. **This corrects the example; the nominal-spacing interpretation and the need to verify other generated designs still apply.**

When recording another issue, include the affected version/design, actual geometry or failing behavior, why previous validation missed it, the corrective change, and a regression case that rejects the original failure. Keep hardware qualification separate from CAD geometry checks.
