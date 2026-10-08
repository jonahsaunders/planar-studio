"""Package the checked source and review documents. Standard Python only."""
import argparse,json,csv,html,re,shutil,zipfile,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=R.parents[1]/'dist/examples',help='Fresh output directory (default: repository dist/examples)')
OUT=parser.parse_args().output.resolve();P=OUT/'PS-FLYBACK-5W-A3'
if P==R or R in P.parents:
    parser.error('Output must be outside the example source directory')
P.mkdir(parents=True,exist_ok=False)
parts=json.loads((R/'circuit.json').read_text())['parts'];m=json.loads((R/'evidence/winding-model.json').read_text())
calc=json.loads((R/'evidence/electrical-sizing.json').read_text());cycles=json.loads((R/'evidence/cycle-model.json').read_text())['operating_points']
def copy(src,dst):dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for name in ['README.md','LICENSE','VALIDATION.md','requirements.json','parts.json','circuit.json','mechanical.json','layout.json','magnetics.json','stackup.json','.gitattributes','.gitignore']:copy(R/name,P/name)
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
for f in (R/'sources').glob('*'):
    if f.is_file():copy(f,P/'sources'/f.name)
copy(R/'COMPONENT-AUDIT.md',P/'COMPONENT-AUDIT.md')
copy(R/'FEEDBACK-REVISION.md',P/'FEEDBACK-REVISION.md')
for f in (R/'evidence/audit').rglob('*'):
    if f.is_file():copy(f,P/f.relative_to(R))
if (R/'KISTACK-AUDIT.md').exists():copy(R/'KISTACK-AUDIT.md',P/'KISTACK-AUDIT.md')
copy(R/'PCB-LAYOUT-AUDIT.md',P/'PCB-LAYOUT-AUDIT.md')
copy(R/'3D-MODELS.md',P/'3D-MODELS.md')
copy(R/'JLCPCB-SOURCING.md',P/'JLCPCB-SOURCING.md')

# Original explanatory drawing using the final winding centerlines and slot geometry.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><rect width="1200" height="850" fill="white"/><style>text{font-family:Arial,sans-serif;fill:#17334b} .small{font-size:16px}.label{font-size:19px}.title{font-size:28px;font-weight:700}</style>']
def text(x,y,s,cl='label'):svg.append(f'<text x="{x}" y="{y}" class="{cl}">{html.escape(s)}</text>')
text(45,48,'PS-MAG-002 A2 / PCB A3  |  Planar core installation','title');text(45,80,'Factory-gapped assembly drawing • dimensions in mm • 2026-10-08','small')
text(45,121,'Top view: PCB and windings')
svg.append('<rect x="82" y="175" width="176" height="376" rx="8" fill="#edf6f3" stroke="#497465" stroke-width="2"/>')
for h in json.loads((R/'mechanical.json').read_text())['holes']:
    x=170+4*(h['x_mm']-100);y=363+4*(h['y_mm']-85)
    if json.loads((R/'mechanical.json').read_text()).get('variant')=='Edge':
        edge=82 if h['rotation_deg']==180 else 258
        svg.append(f'<rect x="{min(edge,x)}" y="{y-12.8}" width="{abs(edge-x)}" height="25.6" fill="#ddd9cc"/>')
    svg.append(f'<circle cx="{x}" cy="{y}" r="12.8" fill="#ddd9cc"/><circle cx="{x}" cy="{y}" r="6.4" fill="white" stroke="#497465"/>')
art=json.loads((R/'planar-studio/T1-artwork.json').read_text())
for t in art['tracks']:
    color='#205bcb' if t['layer'] in ['F.Cu','B.Cu'] else '#d27619'
    pts=' '.join(f'{170+4*x:.3f},{363-4*y:.3f}' for x,y in t['pts'])
    svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{4*t["width"]}" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>')
for loop in m['assembly']['openings']:
    xs=[170+4*x for x,y in loop];ys=[363-4*y for x,y in loop]
    svg.append(f'<rect x="{min(xs)}" y="{min(ys)}" width="{max(xs)-min(xs)}" height="{max(ys)-min(ys)}" rx="2" fill="white" stroke="#202d39"/>')
svg.append('<rect x="126.4" y="331.4" width="87.2" height="63.2" fill="none" stroke="#8d949d" stroke-width="2" stroke-dasharray="6 4"/>')
text(105,181,'INPUT','small');text(104,548,'OUTPUT','small');text(62,605,'Board: 44 × 94','small')
text(325,160,'Side view — gap exaggerated; not to scale')
svg.append('<path d="M400 205H810V292H770V245H655V280H565V245H440V292H400Z" fill="#596371"/><path d="M400 292H440V340H565V303H655V340H770V292H810V380H400Z" fill="#596371"/>')
for x,w in [(370,30),(440,125),(655,115),(810,30)]:
    svg.append(f'<rect x="{x}" y="285" width="{w}" height="16" fill="#cadfcf" stroke="#497465"/><path d="M{x} 287h{w} M{x} 299h{w}" stroke="#205bcb" stroke-width="2"/>')
svg.append('<path d="M610 290L875 265" stroke="#d27619" fill="none" stroke-width="2"/><path d="M813 292L875 350" stroke="#596371" fill="none"/>')
text(885,248,'0.10 total','small');text(885,270,'center-leg gap','small');text(885,340,'Outer legs seated','small');text(885,362,'No full-face shim','small')
text(401,415,'N87 E + E core pair • 11.40 nominal assembled height','small')
text(401,442,'PCB centered within 6.20 minimum winding window','small')
text(325,505,'Copper stack and electrical connections')
labels=['L1  Primary P1 • 2 turns','L2  Secondary S1 • 2 turns','L3  Secondary terminal route','L4  Quiet VIN feed','L5  Secondary S2 • 2 turns','L6  Primary P2 • 2 turns']
for i,label in enumerate(labels):
    y=530+i*30;color='#205bcb' if i in [0,5] else '#d27619' if i in [1,4] else '#b3bac3'
    svg.append(f'<rect x="330" y="{y}" width="240" height="8" rx="2" fill="{color}"/>');text(590,y+9,label,'small')
text(330,733,'Primary sections in series: 4 turns total. Secondary layers in parallel: 2 turns effective.','small')
text(45,785,'Refer to CORE-ASSEMBLY.md for the slot coordinates, gap/inductance acceptance and clip installation process.','small')
text(45,815,'Two factory 0.05 mm gapped halves + two clips. Verify physical clip envelope and measured Lm.','small')
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
report=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planar Flyback A3</title>{style}</head><body><main>
<div class="eyebrow">PLANAR STUDIO · COMPACT PCB REVISION A3 · 8 OCTOBER 2026</div><h1>Smaller board.<br>Verified clip clearance.</h1>
<p class="status">Engineering prototype. CAD and analytical checks pass; physical spring retention, magnetic bias/thermal performance and factory order acceptance still require first-article verification.</p>
<section class="hero"><div><h2>18–36 V in · isolated 5 V / 1 A out</h2><p>A3 uses two DigiKey-listed B66285G0050X187 N87 ELP22 halves, each factory-gapped 0.05 mm, and two B66286A2000X000 spring clips. No grinding or adhesive cure.</p><div class="metrics"><div class="metric"><strong>4:2</strong>turns</div><div class="metric"><strong>{m['magnetizingInductance_H']*1e6:.2f} µH</strong>estimated primary L</div><div class="metric"><strong>0.10 mm</strong>total center gap</div></div><p>The board is reduced from 50 × 104 to 44 × 94 mm (20.46% less area). The winding geometry, six-layer stack and complete electronic BOM are retained. Each electronics block moves 5 mm toward T1; local trace widths/layers/geometry are preserved and only T1 connection leads shorten. The mounting pattern changes from 41 × 95 to 35 × 85 mm. The smaller winding has 0.6 mm traces and 0.3 mm via drills.</p><div class="links"><a href="kicad/PS-FLYBACK-5W.kicad_pro">KiCad project</a><a href="planar-studio/T1.planar.json">Planar Studio design</a><a href="manufacturing/START-HERE.html">JLCPCB files</a></div></div><img src="evidence/audit/board-3d-assembled.png" alt="A3 PCB with ELP22 core and clips"></section>
<section><h2>Three complementary fit checks</h2><p>Native board/copper rules; independent tolerance checks against the actual routed outline; and STEP solid intersections against the PCB and neighboring components. All 29 footprints have local visible models.</p><p>Maximum ferrite dimensions leave 0.146 mm at the tightest rounded corner after allowing 0.20 mm inward routing per wall and 0.05 mm centered insertion offset. A 1.78 mm board leaves 2.21 mm window clearance per face.</p><p>T1 now uses TDK's core and free-clip STEP outlines. The factory center gap is added to the core model. The displayed clip opening is a geometric estimate of the installed spring pose, not a force simulation. The independent 1.5 mm outward envelope still leaves 0.25 mm routing clearance. A separate all-layer check, including 0.5 mm pair float, leaves at least 0.798 mm to copper. Verify actual spring engagement, retention and vibration on the first article.</p><img class="wide" src="evidence/audit/board-3d-assembled.png" alt="Assembled A3 board"><div class="links"><a href="3d/PS-FLYBACK-5W.step">Assembly STEP</a><a href="3d/PS-FLYBACK-5W.glb">Assembly GLB</a><a href="evidence/audit/core-fit-checks.json">Tolerance proof</a><a href="3D-MODELS.md">Model sources</a></div></section>
<section><h2>More clearance around mounting hardware</h2><p>All four M3 holes have a 10 mm copper exclusion on all six layers. Copper stays 1.8 mm beyond the specified 6.4 mm hardware-contact area and the complete outward mask extension, increased from 0.2 mm. The board size, hole positions, winding and routed tracks are unchanged by this update; one nearby ground via moves. Pour changes are confined to the mounting regions.</p><div class="links"><a href="manufacturing/MOUNTING.html">Mounting dimensions</a><a href="evidence/audit/mounting-checks.json">All-layer clearance check</a><a href="evidence/audit/mounting-clearance-comparison.json">Routing and pour comparison</a></div></section>
<section><h2>Electrical checks and limits</h2><p>Accept measured assembled primary L only from 11.0 to 14.6 µH. The catalog AL is an estimate for the two-gap combination, not a purchased AL tolerance. Full-load stress sizing gives {calc['worst_full_load_primary_peak_A']:.2f} A peak versus the 3.6 A minimum controller limit. At maximum accepted L, the 5.4 A flux screen is {calc['core_peak_flux_at_5p4A_and_Lmax_T']:.3f} T; typical 7.2 A restart excursions are {calc['overcurrent_restart_typical_7p2A_flux_T']:.3f} T and need bias/fault tests. The smaller core has less fault margin than A1.</p><table><tr><th>Input</th><th>Cycle peak</th><th>Frequency</th><th>Winding DC loss</th></tr>{table}</table><p>These are analytical power-stage calculations. The assumed 75% efficiency and the linear model do not validate core/fringing loss, nonlinear saturation, burst behavior or temperature. Measure switching/feedback-pin stress, startup, ripple and fault recovery before release.</p><div class="links"><a href="VALIDATION.md">Validation and remaining gates</a><a href="manufacturing/PROTOTYPE-TEST-PLAN.html">Bench plan</a><a href="evidence/schematic.svg">Schematic</a></div></section>
<section><h2>Order and assemble</h2><p>JLCPCB receives the six-layer single-board Gerber ZIP, electronic BOM and CPL. Use the named JLC061611-1080A stack, ENIG and selective filled/capped vias. Have JLCPCB prepare the panel and accept the component-compatible Standard-PCBA reflow profile. Five finished boards require ten core halves and ten clips before spares; procure these separately from DigiKey and install after depanelization.</p><p>The indexed US listings retrieved October 8 show both core and clip at MOQ 1. Inventory is unreserved. Factory DFM acceptance and actual clip/inductance checks remain required; no supplier submission or purchase has occurred.</p><img class="wide" src="manufacturing/core-assembly.svg" alt="Core installation and winding connections"><div class="links"><a href="manufacturing/CORE-BOM.csv">Core and clip BOM</a><a href="manufacturing/CORE-ASSEMBLY.html">Installation</a><a href="manufacturing/FABRICATION.html">Fabrication specification</a><a href="manufacturing/GERBERS-REVIEW-ONLY.zip">Gerbers</a></div></section>
<section><h2>Component placement and polarity</h2><p>The A3 CPL applies the exact catalog rotation and origin corrections for U1, J1/J2 and D1/D2/D3. All 24 placements and 56 catalog pad centers pass the saved geometry/net check; 15 deliberately wrong rotations or offsets are rejected. Compare a fresh JLCPCB preview with the pin and polarity guide before assembly approval.</p><div class="links"><a href="manufacturing/PLACEMENT-REVIEW.html">Placement and polarity guide</a><a href="manufacturing/placement-review.svg">PCB pads and catalog pins</a><a href="evidence/audit/placement-checks.json">Placement checks</a></div></section>
<section><h2>Actual fabrication layers</h2><img class="wide" src="evidence/audit/gerber-copper-overview.png" alt="Six exported copper layers"><p>Current machine-readable evidence is listed in VALIDATION.md. Historical A1 audit reports are retained as background and do not qualify A3.</p></section>
</main></body></html>'''
(P/'report.html').write_text(report,encoding='utf8')
# Fabrication exports remain explicitly marked for review; this script sends nothing.
with zipfile.ZipFile(P/'manufacturing/GERBERS-REVIEW-ONLY.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((P/'manufacturing/gerbers').iterdir()):
        if f.suffix not in ['.svg','.rpt']:z.write(f,f.name)
    z.writestr('REVIEW-ONLY.txt','A3 engineering prototype. Confirm FABRICATION.md and CORE-ASSEMBLY.md before release. Not an order authorization.\n')
manifest={str(f.relative_to(P)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(P.rglob('*')) if f.is_file() and f.name!='SHA256SUMS.json'}
(P/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2))
with zipfile.ZipFile(OUT/'PS-FLYBACK-5W-A3-review-package.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(P.rglob('*')):
        if f.is_file():z.write(f,str(Path(P.name)/f.relative_to(P)))
print(json.dumps({'project':str(P),'archive':str(OUT/'PS-FLYBACK-5W-A3-review-package.zip'),'files':len(manifest)},indent=2))
