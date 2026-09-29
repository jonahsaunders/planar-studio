"""Package the checked source and review documents. Standard Python only."""
import argparse,json,csv,html,re,shutil,zipfile,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=R.parents[1]/'dist/examples',help='Fresh output directory (default: repository dist/examples)')
OUT=parser.parse_args().output.resolve();P=OUT/'PS-FLYBACK-5W-A1'
if P==R or R in P.parents:
    parser.error('Output must be outside the example source directory')
P.mkdir(parents=True,exist_ok=False)
parts=json.loads((R/'circuit.json').read_text())['parts'];m=json.loads((R/'evidence/winding-model.json').read_text())
calc=json.loads((R/'evidence/electrical-sizing.json').read_text());cycles=json.loads((R/'evidence/cycle-model.json').read_text())['operating_points']
def copy(src,dst):dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for name in ['README.md','LICENSE','VALIDATION.md','requirements.json','parts.json','circuit.json','mechanical.json','.gitattributes','.gitignore']:copy(R/name,P/name)
for folder in ['scripts','manufacturing','kicad/3dmodels','3d']:
    for f in (R/folder).rglob('*'):
        if f.is_file() and '__pycache__' not in str(f):copy(f,P/f.relative_to(R))
for name in ['PS-FLYBACK-5W.kicad_pro','PS-FLYBACK-5W.kicad_sch','PS-FLYBACK-5W.kicad_pcb','Flyback.kicad_sym','sym-lib-table','fp-lib-table']:copy(R/'kicad'/name,P/'kicad'/name)
for p in parts:
    library,name=p['footprint'].split(':');rel=Path('kicad')/(library+'.pretty')/(name+'.kicad_mod')
    copy(R/rel,P/rel)
for f in (R/'kicad').glob('*.pretty/LICENSE.md'):copy(f,P/f.relative_to(R))
for f in (R/'planar-studio').iterdir():
    if f.is_file() and f.suffix!='.kicad_prl':copy(f,P/'planar-studio'/f.name)
evidence=['board-drc.json','erc.rpt','independent-checks.json','manufacturing-checks.json','schematic-netlist.xml','winding-model.json','electrical-sizing.json','operating-points.csv','cycle-model.json','boundary-cycle.csv','idealized-waveforms.csv','pad-positions.json','board.svg']
for name in evidence:copy(R/'evidence'/name,P/'evidence'/name)
copy(R/'evidence/schematic.svg',P/'evidence/schematic.svg')
copy(R/'evidence/board-back.svg',P/'evidence/board-back.svg')
copy(R/'evidence/layout-overview.svg',P/'evidence/layout-overview.svg')
copy(R/'sources/references.md',P/'sources/references.md')
for f in (R/'evidence/audit').rglob('*'):
    if f.is_file():copy(f,P/f.relative_to(R))
if (R/'KISTACK-AUDIT.md').exists():copy(R/'KISTACK-AUDIT.md',P/'KISTACK-AUDIT.md')
copy(R/'PCB-LAYOUT-AUDIT.md',P/'PCB-LAYOUT-AUDIT.md')
copy(R/'3D-MODELS.md',P/'3D-MODELS.md')

# Original explanatory drawing using the final winding centerlines and slot geometry.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><rect width="1200" height="850" fill="white"/><style>text{font-family:Arial,sans-serif;fill:#17334b} .small{font-size:16px}.label{font-size:19px}.title{font-size:28px;font-weight:700}</style>']
def text(x,y,s,cl='label'):svg.append(f'<text x="{x}" y="{y}" class="{cl}">{html.escape(s)}</text>')
text(45,48,'PS-MAG-001 A0  |  Planar core installation','title');text(45,80,'Supplier review drawing • dimensions in mm • 2026-09-29','small')
text(45,121,'Top view: PCB and windings')
svg.append('<rect x="70" y="155" width="200" height="416" rx="8" fill="#edf6f3" stroke="#497465" stroke-width="2"/>')
for h in json.loads((R/'mechanical.json').read_text())['holes']:
    x=170+4*(h['x_mm']-100);y=363+4*(h['y_mm']-85)
    svg.append(f'<circle cx="{x}" cy="{y}" r="12.8" fill="#ddd9cc"/><circle cx="{x}" cy="{y}" r="6.4" fill="white" stroke="#497465"/>')
art=json.loads((R/'planar-studio/T1-artwork.json').read_text())
for t in art['tracks']:
    color='#205bcb' if t['layer'] in ['F.Cu','B.Cu'] else '#d27619'
    pts=' '.join(f'{170+4*x:.3f},{363-4*y:.3f}' for x,y in t['pts'])
    svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{4*t["width"]}" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>')
for loop in m['assembly']['openings']:
    xs=[170+4*x for x,y in loop];ys=[363-4*y for x,y in loop]
    svg.append(f'<rect x="{min(xs)}" y="{min(ys)}" width="{max(xs)-min(xs)}" height="{max(ys)-min(ys)}" rx="2" fill="white" stroke="#202d39"/>')
svg.append('<rect x="106.5" y="322.3" width="127" height="81.4" fill="none" stroke="#8d949d" stroke-width="2" stroke-dasharray="6 4"/>')
text(105,181,'INPUT','small');text(104,548,'OUTPUT','small');text(62,605,'Board: 50 × 104','small')
text(325,160,'Side view — gap exaggerated; not to scale')
svg.append('<path d="M400 205H810V292H770V245H655V280H565V245H440V292H400Z" fill="#596371"/><path d="M400 292H440V340H565V303H655V340H770V292H810V380H400Z" fill="#596371"/>')
for x,w in [(370,30),(440,125),(655,115),(810,30)]:
    svg.append(f'<rect x="{x}" y="285" width="{w}" height="16" fill="#cadfcf" stroke="#497465"/><path d="M{x} 287h{w} M{x} 299h{w}" stroke="#205bcb" stroke-width="2"/>')
svg.append('<path d="M610 290L875 265" stroke="#d27619" fill="none" stroke-width="2"/><path d="M813 292L875 350" stroke="#596371" fill="none"/>')
text(885,248,'0.21 nominal','small');text(885,270,'center-leg gap','small');text(885,340,'Outer legs seated','small');text(885,362,'No full-face shim','small')
text(401,415,'N87 E + E core pair • 12.70 nominal assembled height','small')
text(401,442,'PCB centered within 6.10 minimum winding window','small')
text(325,505,'Copper stack and electrical connections')
labels=['L1  Primary P1 • 2 turns','L2  Secondary S1 • 2 turns','L3  Secondary terminal route','L4  SW / snubber route','L5  Secondary S2 • 2 turns','L6  Primary P2 • 2 turns']
for i,label in enumerate(labels):
    y=530+i*30;color='#205bcb' if i in [0,5] else '#d27619' if i in [1,4] else '#b3bac3'
    svg.append(f'<rect x="330" y="{y}" width="240" height="8" rx="2" fill="{color}"/>');text(590,y+9,label,'small')
text(330,733,'Primary sections in series: 4 turns total. Secondary layers in parallel: 2 turns effective.','small')
text(45,785,'Refer to CORE-ASSEMBLY.md for the slot coordinates, gap/inductance acceptance and proposed bonding process.','small')
text(45,815,'Prepared cores and installation require vendor acceptance. Unmodified ungapped halves are not substitutes.','small')
svg.append('</svg>');(P/'manufacturing/core-assembly.svg').write_text(''.join(svg),encoding='utf8')

style='''<style>*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#172b40;font:16px/1.58 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1120px;margin:48px auto;padding:0 28px}h1{font-size:38px;line-height:1.15;letter-spacing:-1px}h2{font-size:23px;margin-top:32px}h3{font-size:18px}a{color:#125ac1}section,article{background:white;border:1px solid #dce3eb;border-radius:16px;padding:26px;margin:20px 0}.eyebrow{font-size:13px;letter-spacing:1.8px;font-weight:650;color:#54718b}.status{border-left:5px solid #d88614;background:#fff7e7;padding:14px 18px}.hero{display:grid;grid-template-columns:1fr 240px;gap:35px}.hero img{width:100%;max-height:500px;object-fit:contain;background:#15231e;border-radius:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.metric{background:#eef4fb;border-radius:10px;padding:16px}.metric strong{display:block;font-size:27px}table{border-collapse:collapse;width:100%;font-size:14px;margin:18px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce3eb;vertical-align:top}th{background:#edf2f7}code{font-size:.9em;background:#eef1f5;padding:2px 4px;border-radius:4px}img.wide{max-width:100%;height:auto}small{color:#546575}.links{display:flex;flex-wrap:wrap;gap:12px}.links a{display:inline-block;padding:9px 14px;border:1px solid #cad6e5;border-radius:9px;text-decoration:none}li{margin:7px 0}@media(max-width:750px){.hero{grid-template-columns:1fr}.hero img{max-height:400px}.metrics{grid-template-columns:1fr}main{padding:0 15px}table{font-size:12px}td,th{padding:6px}}@media print{body{background:white}main{margin:0;max-width:none}section,article{break-inside:avoid}a{color:inherit}.hero img{max-height:420px}}</style>'''
def inline(s):
    s=html.escape(s);s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',s);s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s);return re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
def markdown(s):
    out=[];paragraph=[];table=False;lst=False
    def flush():
        if paragraph:out.append('<p>'+inline(' '.join(paragraph))+'</p>');paragraph.clear()
    for line in s.splitlines()+['']:
        if line.startswith('|'):
            flush()
            if not table:out.append('<table>');table=True
            if re.fullmatch(r'[| :\-]+',line):continue
            out.append('<tr>'+''.join('<td>'+inline(c.strip())+'</td>' for c in line.strip('|').split('|'))+'</tr>');continue
        if table:out.append('</table>');table=False
        item=re.match(r'^(?:- |\d+\. )(.*)',line)
        if item:
            flush()
            if not lst:out.append('<ul>');lst=True
            out.append('<li>'+inline(item[1])+'</li>');continue
        if lst:out.append('</ul>');lst=False
        if line.startswith('#'):
            flush();n=min(len(line)-len(line.lstrip('#')),4);out.append(f'<h{n}>'+inline(line.lstrip('# ').strip())+f'</h{n}>')
        elif not line.strip():flush()
        else:paragraph.append(line)
    return ''.join(out)
for f in (P/'manufacturing').glob('*.md'):
    body=markdown(f.read_text(encoding='utf8'))
    (f.with_suffix('.html')).write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(f.stem)+'</title>'+style+'<main><a href="../report.html">← Project overview</a><article>'+body+'</article></main></html>',encoding='utf8')
table=''.join(f'<tr><td>{r["Vin_V"]:.0f} V</td><td>{r["Ipk_A"]:.2f} A</td><td>{r["frequency_Hz"]/1000:.0f} kHz</td><td>{r["copper_DC_W"]:.3f} W</td></tr>' for r in cycles)
report=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PS-FLYBACK-5W • A1 review package</title>{style}</head><body><main>
<div class="eyebrow">PLANAR STUDIO EXAMPLE · 29 SEPTEMBER 2026</div><h1>A flyback converter with<br>the windings in the PCB.</h1>
<p class="status"><strong>A1 engineering prototype.</strong> Editable design and manufacturing review files are complete. JLCPCB sourcing, stack and core installation are unconfirmed. No request or files have been sent to JLCPCB. Hardware performance has not been measured.</p>
<section class="hero"><div><h2>18–36 V in. Isolated 5 V, 1 A out.</h2><p>An LT8302 controller drives four primary turns distributed across the front and back copper. Two internal secondary windings operate in parallel. A prepared N87 core pair closes the magnetic circuit around the finished board.</p><div class="metrics"><div class="metric"><strong>6</strong>copper layers</div><div class="metric"><strong>11.95 µH</strong>nominal primary L</div><div class="metric"><strong>0.21 mm</strong>prepared center gap</div></div><p>50 × 104 mm board; 1.6 mm nominal thickness; top-side electronics. Both core halves are part of the requested turnkey assembly.</p><div class="links"><a href="kicad/PS-FLYBACK-5W.kicad_pro">KiCad project</a><a href="evidence/schematic.svg">Schematic</a><a href="manufacturing/assembly-top.svg">Assembly drawing</a></div></div><a href="evidence/audit/board-3d-assembled.png"><img src="evidence/audit/board-3d-assembled.png" alt="Complete 3D assembly with prepared core and provisional M3 hardware"></a></section><section><h2>Complete 3D assembly</h2><p>All 26 footprints have bundled local STEP models. All 14 distinct assets load as valid solids, with no nominal intersections in 325 component pairs or 26 substrate checks. The core pair includes its prepared center gap and provisional retention materials; the four M3 mounts are illustrative and excluded from procurement data.</p><a href="evidence/audit/board-3d-assembled.png"><img class="wide" src="evidence/audit/board-3d-assembled.png" alt="Oblique assembled-board 3D view"></a><p>Open the board in KiCad and choose View → 3D Viewer to rotate and zoom. Hardware, enclosure, tolerances and retention qualification remain open.</p><div class="links"><a href="3D-MODELS.md">Model sources and checks</a><a href="evidence/audit/board-3d-underside.png">Underside</a><a href="evidence/audit/board-3d-side.png">Side</a><a href="3d/PS-FLYBACK-5W.step">Assembly STEP</a><a href="3d/PS-FLYBACK-5W.glb">Assembly GLB</a></div></section>
<section><h2>Connected A4 schematic</h2><p>The input, controller and transformer share continuous wiring. Both clamp branches connect directly to VIN and SW beside T1. Signal-ground triangles and separated labels identify PGND and GND_ISO; INTVCC remains the separate internal bias supply. All branches are staggered three-way connections; symbol-aware geometry checks and native ERC enforce zero four-way junctions. All 54 pin connections and 26 part records match the preceding A1 design. The PCB routing and manufacturing data are unchanged; model references now cover every footprint.</p><a href="evidence/schematic.svg"><img src="evidence/schematic.svg" alt="Redrawn A4 flyback schematic with connected controller passives and clamp circuits" style="width:100%;height:auto"></a></section><section><h2>Front and back PCB layout</h2><p>Actual KiCad copper, silkscreen and outline, with display colors adjusted for readability. Both views use top-side coordinates. The front and back primary sections connect in series; secondary windings are on internal layers.</p><a href="evidence/layout-overview.svg"><img src="evidence/layout-overview.svg" alt="Front and back PCB copper with winding geometry and four mounting holes" style="width:100%;height:auto"></a><p><a href="evidence/board.svg">Front vector view</a> · <a href="evidence/board-back.svg">Back vector view</a> · <a href="evidence/audit/gerber-copper-overview.png">All six copper layers</a></p></section><section><h2>KiStack audit and M3 mounting</h2><p>A1 adds four American Embedded 3.2 mm NPTH mounting holes on a 41 × 80 mm pattern, without changing the board outline. All-layer copper clearance, drill coordinates and BOM/CPL exclusion are checked. The audit also corrected saved fabrication-rule limits, schematic/PCB metadata and label overlaps.</p><p><a href="KISTACK-AUDIT.md">Read the complete audit and remaining findings</a> · <a href="manufacturing/MOUNTING.html">Mounting specification</a> · <a href="evidence/audit/gerber-copper-overview.png">Actual copper Gerber review</a></p><p>Nominal 3D model coverage and solid checks are complete; actual hardware, enclosure, tolerances and retention still require qualification.</p></section><section><h2>Checks completed</h2><table><tr><th>Check</th><th>Result</th></tr><tr><td>KiCad electrical rules</td><td>0 messages</td></tr><tr><td>KiCad board rules</td><td>0 violations; 0 unconnected items; 0 schematic-parity issues</td></tr><tr><td>Schematic to board</td><td>54 logical pins / 55 physical numbered pads agree</td></tr><tr><td>Planar winding copper</td><td>4 polygons with intended terminal contacts; 19,229 centerline samples within final copper</td></tr><tr><td>Assembly data</td><td>21 BOM/CPL references match; 19 SMD parts and 2 connectors</td></tr><tr><td>Fabrication exports</td><td>6 copper Gerbers; 23 filled/capped interlayer holes plus 4 open connector holes and 4 NPTH M3 mounting holes</td></tr></table><p>These checks establish file consistency and checked geometry. They do not establish physical converter performance or manufacturing acceptance. <a href="evidence/independent-checks.json">Independent check record</a> · <a href="evidence/board-drc.json">DRC record</a> · <a href="evidence/erc.rpt">ERC record</a></p></section>
<section><h2>PCB layout audit: routing work remains</h2><p><strong>Revise the primary input and clamp paths before fabrication.</strong> C2-to-T1 is 34.87 mm, D4's VIN return-to-T1 is 57.54 mm, and the snubber has a 17.78 mm SW branch on In3.Cu. C3-to-J2 output delivery takes 33.20 mm. These measured paths warrant a tighter power-stage placement; clean DRC does not establish acceptable parasitics.</p><a href="evidence/audit/pcb-layout-audit.svg"><img src="evidence/audit/pcb-layout-audit.svg" alt="PCB layout audit with actual copper close-ups and measured clamp and output routes" style="width:100%;height:auto"></a><p>Preserve the short INTVCC and RFB connections. Add deliberate probe access, qualify the mechanical assembly, and confirm filled/capped-via and core assembly processing. The PCB routing is unchanged in this schematic revision.</p><div class="links"><a href="PCB-LAYOUT-AUDIT.md">Prioritized PCB findings</a><a href="evidence/audit/pcb-layout-metrics.json">Measured geometry</a></div></section>
<section><h2>Electrical margins and model limits</h2><p>The current-stress worksheet estimates {calc['worst_full_load_primary_peak_A']:.2f} A primary peak at full load, below the controller's 3.6 A minimum peak-current limit. Its 75% efficiency is an assumption. Worst-case steady switch plateau is 47.7 V; the selected 13 V TVS gives a rating-based clamp estimate of 58.5 V before dynamic overshoot. Prototype target: SW peak below 60 V.</p><p>The 220 Ω preload covers the calculated minimum-energy delivery at maximum L, minimum output voltage, 1.04 A minimum-current ceiling and 12.7 kHz. Input capacitors are sized assuming only 4 µF combined effective capacitance after DC-bias loss. The bulk-only ripple estimate is about 100 mV; the parallel ceramic helps, but the ripple target remains unverified.</p><table><tr><th>Full-load input</th><th>Cycle-model peak</th><th>Cycle-model frequency</th><th>Winding DC loss</th></tr>{table}</table><p><strong>Model scope:</strong> charge-balanced boundary/DCM power-stage calculations at a fixed 5 V output, with winding resistance, assumed switch resistance and a nominal 380 kHz ceiling. Core loss, switching loss, gap fringing, loop dynamics and burst behavior are excluded. This is not a closed-loop LT8302 SPICE simulation or measured efficiency.</p><div class="links"><a href="evidence/electrical-sizing.json">Stress sizing</a><a href="evidence/boundary-cycle.csv">Cycle results</a><a href="evidence/idealized-waveforms.csv">Idealized waveform data</a><a href="manufacturing/PROTOTYPE-TEST-PLAN.html">Prototype test plan</a></div></section>
<section><h2>The core is an assembly operation</h2><img class="wide" src="manufacturing/core-assembly.svg" alt="Planar PCB, prepared EELP32 core pair and six-layer winding connection drawing"><p>The supplier must source a prepared pair, install both halves and qualify bonding and retention. Two ungapped catalog halves are not substitutes. The proposed stack also needs fabricator acceptance before the magnetic model can be finalized.</p><div class="links"><a href="manufacturing/CORE-ASSEMBLY.html">Core process and acceptance</a><a href="manufacturing/FABRICATION.html">Fabrication specification</a><a href="manufacturing/CORE-BOM.csv">Core materials schedule</a></div></section>
<section><h2>Manufacturing reference information</h2><p>The package includes an unsent feasibility-request template for full turnkey procurement and assembly. It is retained for reference; no supplier contact or purchase is authorized by this example. Catalog identifiers establish part identity; they do not reserve inventory or confirm JLCPCB sourcing.</p><div class="links"><a href="manufacturing/JLCPCB-REVIEW-REQUEST.html">Unsent feasibility template</a><a href="manufacturing/BOM-MASTER.csv">Sourcing BOM</a><a href="manufacturing/BOM-JLCPCB.csv">JLCPCB BOM</a><a href="manufacturing/CPL-JLCPCB.csv">Placement file</a></div><p>Before production: vendor DFM acceptance, confirmed stack and sourcing, prepared-core qualification, and first-article regulation, ripple, switching-stress, startup, overload and thermal results. Functional low-voltage isolation only; no mains or safety-isolation certification.</p></section>
<p><small>Designed with <a href="https://github.com/jonahsaunders/planar-studio/pull/11">Planar Studio's transformer workflow</a>. Prepared-gap support: commit 9210fce. A1 audit: American Embedded KiStack, commit 8494dbd. Sources: <a href="sources/references.md">reference list</a>, component links in the sourcing BOM. Native KiCad files and reproducible generators are included.</small></p></main></body></html>'''
(P/'report.html').write_text(report,encoding='utf8')
# Fabrication exports remain explicitly marked for review; this script sends nothing.
with zipfile.ZipFile(P/'manufacturing/GERBERS-REVIEW-ONLY.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((P/'manufacturing/gerbers').iterdir()):
        if f.suffix not in ['.svg','.rpt']:z.write(f,f.name)
    z.writestr('REVIEW-ONLY.txt','A1 engineering prototype. Confirm FABRICATION.md and CORE-ASSEMBLY.md before release. Not an order authorization.\n')
manifest={str(f.relative_to(P)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(P.rglob('*')) if f.is_file() and f.name!='SHA256SUMS.json'}
(P/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2))
with zipfile.ZipFile(OUT/'PS-FLYBACK-5W-A1-review-package.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(P.rglob('*')):
        if f.is_file():z.write(f,str(Path(P.name)/f.relative_to(P)))
print(json.dumps({'project':str(P),'archive':str(OUT/'PS-FLYBACK-5W-A1-review-package.zip'),'files':len(manifest)},indent=2))
