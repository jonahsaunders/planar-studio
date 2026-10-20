# A10 clearance and via-land revision

A10 addresses the follow-up A9 clearance audit. The input board is commit `3b78238ea610fda599e0ad74c3479fc5de1ed315` (PCB SHA-256 `2221610ae6b8befe986ba66ce190908d62deeb62cf8a2df79d7cffe30bcdacfb`).

| Feature | A9 | A10 |
| --- | --- | --- |
| Nominal winding spacing | 0.25 mm | 0.30 mm |
| Actual minimum turn gap | 0.23978 mm | 0.28872 mm; conservative lower bound 0.28572 mm |
| Enforced winding CAD minimum | 0.20 mm | 0.26 mm |
| Generator outer-size setting | 13.6 mm | 13.9 mm, to preserve clearance around the larger T1.4 land |
| Outer primary terminal offset | 0.10 mm | 0.30 mm, to clear the opposite winding layer |
| T1 land / hole | 0.60 / 0.30 mm | 0.70 / 0.30 mm; annular ring 0.20 mm |
| Four paired secondary via lands / holes | 0.90 / 0.45 mm on 0.90 mm pitch | 1.00 / 0.45 mm on unchanged pitch; overlap neck about 0.436 mm |
| Minimum connection-width rule | 0.00 mm | 0.20 mm; violations are errors |
| Mask-to-unrelated-copper / hole-to-copper rules | 0 / 0.25 mm | 0.09 / 0.30 mm |
| Minimum ordinary via annular ring | 0.10 mm | 0.15 mm; T1 independently requires 0.20 mm |

The tangent land pairs are GND_ISO at (97.269595,101.5)/(98.169595,101.5) and SEC_A at (100.55,102.138)/(101.45,102.138), in native millimetres. The old contacts were same-net and were not the sole DC paths; they were a copper-quality issue, not another winding bypass. Native DRC now rejects all eight old narrow contacts. All four lands are enlarged in the reproducible board generator.

The winding setting changed by 0.05 mm, but measured clearance changes by about 0.049 mm. The tool's pitch setting must never substitute for an actual copper measurement. The larger winding envelope and terminal offsets preserve the 0.50 mm core-edge rule without changing the core slots. Both SW approaches and SEC_A retain their final 1 mm / 0.6 mm necks. No component positions, circuit values, board outline, core openings, via centers or drill sizes change.

Model estimates: Lm stays 13.12 µH. Primary/secondary DC resistance becomes 0.3298586/0.0813769 Ω (about +1.75%/+1.46% versus A9). Leakage is 0.0917200 µH and interwinding capacitance 22.1252 pF. Electrical worksheets and model outputs are regenerated. These estimates do not establish nonlinear fault, thermal, EMI or snubber-pulse performance.

The A9-to-A10 containment check bounds all eight changed approach segments, the four via-land increases, T1 pad changes and local pour changes. Project guard checks require the new limits. A9 spacing, tangent contacts and thin T1 lands are retained as failing regression cases. Native DRC operates on the saved fills, and all six copper plus both mask exports must match the native geometry. The four winding Gerber regions additionally match exactly.

The completed rebuild passes ERC, all-category DRC, fourteen regression cases and 1,032 virtual winding cuts. Independent nominal CAD measurements give:

| Clearance | A10 minimum |
| --- | --- |
| Ordinary different-net copper, excluding separately checked winding graphics | 0.2505 mm |
| Copper to board/core-cutout edge | 0.6056 mm |
| Copper to expanded clip projection, including 0.5 mm float | 0.6729 mm |
| Hole to unrelated copper | 0.4005 mm |
| Hole to hole | 0.4500 mm |
| Mask web between different nets | 0.5100 mm |
| Mask opening to unrelated copper | 0.2504 mm |

See `evidence/audit/board-clearance-checks.json` and `clip-copper-checks.json` for locations and scope. The optional copper-erosion screen finds one small PGND feature that separates only at a 0.24 mm probe; no feature separates at the configured 0.20 mm connection-width threshold. This is an informational screen, not another failed rule.

Use only matching A10 PCB, schematic, Gerbers, drill, via-fill, BOM and CPL files. A10 is an engineering prototype package; supplier process acceptance and hardware qualification remain open. See [validation](VALIDATION.md) and [common issues](COMMON-ISSUES.md).
