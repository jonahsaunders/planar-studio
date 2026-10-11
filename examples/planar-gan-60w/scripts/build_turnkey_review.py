"""Create an exact-file handoff for supplier engineering review, not an order."""
from pathlib import Path
import json,csv,hashlib,html
R=Path(__file__).resolve().parents[1];M=R/'manufacturing-prototype';E=R/'evidence'
d=json.loads((E/'turnkey-readiness.json').read_text(encoding='utf8'))
cost=json.loads((E/'manufacturing-cost-estimate.json').read_text(encoding='utf8'))
paths=['Gerbers-PROTOTYPE.zip','BOM-JLCPCB.csv','CPL-JLCPCB-review.csv','Assembly-pad-map.csv','Assembly-top.pdf','fabrication-stack.json','Drill-process-map.csv','Stencil-aperture-screen.csv','READ-BEFORE-ORDER.txt','Manufacturing-issue-register.csv']
for n in paths:
 f=M/n
 if f.suffix in ['.csv','.json','.txt']:f.write_bytes(f.read_bytes().replace(b'\r\n',b'\n'))
rows=[dict(File=n,SHA256=hashlib.sha256((M/n).read_bytes()).hexdigest()) for n in paths]
with (M/'Review-file-manifest.csv').open('w',newline='',encoding='utf8') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
esc=html.escape
files=''.join(f'<tr><td><a href="manufacturing-prototype/{x["File"]}">{x["File"]}</a></td><td class="hash">{x["SHA256"]}</td></tr>' for x in rows)
holds=''.join(f'<li>{esc(x)}</li>' for x in d['external_release_holds'])
checks=''.join(f'<tr><td>{esc(x["check"])}</td><td>PASS</td><td>{esc(x["requirement"])}</td></tr>' for x in d['cad_checks'])
sources=' · '.join(f'<a href="{u}">{esc(k.replace("_"," "))}</a>' for k,u in d['sources'].items())
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PS-GAN-60W A14 — turnkey readiness</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f4f6f2;color:#19382e;font:16px/1.55 system-ui}}main{{max-width:1140px;margin:auto;padding:38px 28px}}h1{{font-size:44px;line-height:1.1}}h2{{margin-top:36px}}.status{{border-left:5px solid #b77632;background:#fff0df;padding:20px}}.metric{{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:24px 0}}.metric div{{background:white;border:1px solid #d8dfd6;padding:18px}}strong.big{{font-size:31px;display:block}}a{{color:#176449}}img{{width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #ccd5ca}}.hash{{font:11px/1.4 monospace;overflow-wrap:anywhere}}li{{margin:10px 0}}@media(max-width:700px){{.metric{{grid-template-columns:1fr}}h1{{font-size:34px}}}}</style>
<main><small>PLANAR STUDIO · A14 · 11 OCTOBER 2026 · FIVE BOARDS</small>
<h1>Ready for supplier review.<br>Full turnkey remains open.</h1>
<div class="status"><b>The native CAD and data screens pass. This is an unbuilt engineering prototype.</b>
<p>JLCPCB has not accepted the complete manufacturing job or ferrite installation. The hardware has not established a 60 W operating rating. No order, reservation, supplier message or file upload was made.</p></div>
<p><a href="Review.html">Board and layer viewer</a> · <a href="Manufacturing-audit.html">Detailed manufacturing review</a> · <a href="VALIDATION.md">Validation record</a> · <a href="manufacturing-prototype/SUPPLIER-REVIEW-REQUEST.txt">Unsent supplier-review draft</a></p>
<div class="metric"><div><strong class="big">75</strong>top-side placements<br>73 SMT + 2 insertion headers</div><div><strong class="big">43 / 43</strong>exact electronic codes with public stock for five fitted boards</div><div><strong class="big">35% shorter</strong>lower rectifier gate routing<br>9.698 → 6.289 mm</div></div>
<h2>Changes made</h2><p>R11 now faces Q2 with a straight output connection. Its input route and dedicated VSS sense pickup are rerouted around the relocated via. The last 0.16 mm control trace is widened to 0.20 mm. The feedback placement, 64 × 56 mm outline, 55 × 47 mm M3 pattern, top-only assembly and transformer winding artwork are retained.</p>
<img src="evidence/Rectifier-routing-before-after.png" alt="Actual native rectifier copper before and after">
<p>All routes use horizontal, vertical or 45° segments, with no unanchored 90° elbows. All 50 stitching vias touch at least two same-net filled planes. Nineteen named pours retain the separate ground domains, switching-node projection exclusions and connector thermals. The 198 routed vias plus six T1 transitions make 204 holes specified for resin fill and copper cap; the four connector and four mount holes stay open.</p>
<h2>JLCPCB job definition</h2><p><b>Standard PCBA, five completed boards, top-side assembly, green solder mask, ENIG.</b> Submit the matched single-board Gerbers, BOM and CPL below. The candidate JLC081622-1080 stack is 1.655 mm nominal with 70 µm outer and 61 µm inner copper. Preserve that magnetic construction pending factory review.</p>
<p>JLC Standard publishes a 70 × 70 mm minimum handling size and requires edge rails and fiducials. JLC must provide the handling arrangement for this smaller board. No customer panel, tabs or mouse-bite files are supplied. Confirm final depanelized delivery and the overhanging-header fixture.</p>
<p>Proposed stencil thickness is 0.125 mm, following the GaN package example. Every supplied aperture passes the area-ratio screen; minimum 0.7405 versus a 0.66 transfer guideline. This does not approve paste volume, profile or yield. Have JLC review actual package models and hidden-joint inspection before release.</p>
<h2>Required closure before full turnkey release</h2><ol>{holds}</ol>
<h2>Five-board planning cost</h2><p><b>$400–650 total ($80–130 per board).</b> The refreshed calculated allowance is ${cost['calculated_low_USD']:.2f}–${cost['calculated_high_USD']:.2f}. It includes electronics assembly plus separate cores, clips and plugs; it excludes ferrite fitting, functional testing, shipping, tax, duties and unquoted special-process overruns. This is not a JLC quotation or an accepted price for finished converters.</p>
<p>The public catalog was refreshed at {esc(d['catalog_retrieved_utc'])}. F1 has 28 units and L2 has 39, against five fitted units each. Order-specific MOQ/attrition and warehouse allocation still need confirmation. The JLC BOM tool requires sign-in in this session.</p>
<h2>Verified CAD and data checks</h2><table><tr><th>Check</th><th>Result</th><th>Criterion / limit</th></tr>{checks}</table>
<p><a href="evidence/turnkey-readiness.json">Full measurements and explicit holds</a> · <a href="COMPONENT-RATINGS.md">Electrical rating screens and qualification work</a></p>
<h2>Exact files for review</h2><p>Use this set together. CPL rotations are raw KiCad angles; approve the supplier-model overlay using the numbered pad map. T1, test pads, mounting holes and fiducials are fabrication features, not additional purchased SMT placements.</p><table><tr><th>File</th><th>SHA-256</th></tr>{files}</table>
<p><a href="manufacturing-prototype/Review-file-manifest.csv">Download file manifest</a></p>
<h2>Process sequence to agree</h2><p>Fabricate and electrically test the bare board; print and inspect paste; place and reflow the top SMT components; inspect visible and hidden joints; insert and solder J1/J2; inspect and depanelize; dry-fit and install the specified core halves/clips; fit or supply the agreed mating plugs. Complete physical fit and engineering bring-up before defining supplier powered acceptance testing.</p>
<p>Fit two B66285G0050X187 core halves, two B66286A2000X000 clips and two WJ2EDGK-5.08-02P-14-00A mating plugs per board. Do not add a spacer, grind a core, or substitute parts without engineering review. Purchasing acceptance alone does not establish ferrite fitting or loose-accessory delivery.</p>
<h2>Official guidance checked</h2><p>{sources}</p></main></html>'''
(R/'TURNKEY-READINESS.html').write_text(page,encoding='utf8')
print('Turnkey review and exact-file manifest written.')
