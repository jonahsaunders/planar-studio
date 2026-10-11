"""Publish the five-board manufacturing screen and explicitly unquoted budget.
No network access, supplier approval, order, or electronic design changes.
"""
from pathlib import Path
import json,csv,collections,html,hashlib
R=Path(__file__).resolve().parents[1];M=R/'manufacturing-prototype';E=R/'evidence';S=R/'sourcing'
parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts']
catalog=json.loads((S/'manufacturing-catalog-2026-10-10.json').read_text(encoding='utf8'))
g=json.loads((E/'manufacturing-geometry.json').read_text(encoding='utf8'))
bycode=collections.defaultdict(list)
for p in parts:
    if p['lcsc']:bycode[p['lcsc']].append(p)
def writecsv(path,rows):
    with path.open('w',encoding='utf8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def tier(c,q):return max((x for x in c['price_breaks'] if x['qty']<=q),key=lambda x:x['qty'])['price']
rows=[]
for code,ps in sorted(bycode.items()):
    c=catalog['parts'][code];q=5*len(ps);mpns={x['mpn'] for x in ps}
    assert len(mpns)==1 and c['model'] in mpns,(code,mpns,c['model'])
    rows.append({'LCSC':code,'MPN':c['model'],'Manufacturer':c['brand'],'References':','.join(x['ref'] for x in ps),'Package_in_catalog':c['package'],'KiCad_footprint':ps[0]['footprint'],'Qty_per_board':len(ps),'Qty_fitted_5_boards':q,'Stock_snapshot':c['stock'],'Stock_remaining_before_attrition':c['stock']-q,'Catalog_min_purchase':c['min_qty'],'Library_type':c['type'],'Unit_USD_at_fitted_qty':tier(c,q),'Fitted_parts_cost_USD':round(q*tier(c,q),4),'Factory_attrition_MOQ':'NOT QUOTED; public search minimum is not assembly attrition','Land_pattern_release':'HOLD: native package/pin mapping screened; supplier footprint, stencil and rotation review still required','Source':f'https://jlcpcb.com/partdetail/{code}'})
writecsv(S/'Manufacturing-parts-5boards.csv',rows)
assert len(rows)==43 and sum(r['Qty_fitted_5_boards'] for r in rows)==375
assert all(r['Stock_remaining_before_attrition']>=0 for r in rows)
core={'date':'2026-10-10','source_type':'DigiKey public page displayed through web tool; not reserved; may be cached','parts':[
 {'mpn':'B66285G0050X187','stock':530,'quantity_for_5_boards':10,'unit_USD_at_10':2.10,'url':'https://www.digikey.com/en/products/detail/tdk/B66285G0050X187/11488590'},
 {'mpn':'B66286A2000X000','stock':9596,'quantity_for_5_boards':10,'unit_USD_at_10':.355,'url':'https://www.digikey.com/en/products/detail/tdk/B66286A2000X000/3915552'}]}
(S/'manufacturing-core-prices.json').write_text(json.dumps(core,indent=2)+'\n',encoding='utf8')
stack=json.loads((M/'fabrication-stack.json').read_text(encoding='utf8'))
stack.update({'native_model_aligned':True,'supplier_acceptance':False,'copper_plus_dielectric_sum_mm':round(sum(stack['copper_mm'])+sum(stack['dielectric_mm']),6),'note':'Native and magnetic model use this observed JLC construction; final order acceptance remains open.'})
(E/'JLC-manufacturing-stack-review.json').write_text(json.dumps(stack,indent=2)+'\n',encoding='utf8')
electronics=sum(r['Fitted_parts_cost_USD'] for r in rows)
plug=catalog['parts']['C71370'];plug_total=10*tier(plug,10)
cost=[
 ('PCB fabrication and JLC factory panelization, ENIG, all-layer heavy copper, filled/capped vias',100,250,'ENGINEERING ALLOWANCE; no valid online PCB quote; final panel and stack may exceed it'),
 ('375 fitted electronic components',electronics,electronics,'Current catalog price breaks applied to five-board fitted quantities; no attrition'),
 ('Component attrition / minimum order / replenishment allowance',15,40,'ENGINEERING ALLOWANCE; not a JLC attrition rule'),
 ('Standard assembly setup, one side',25.56,25.56,'Published fee'),
 ('Assembly stencil, one side',8.21,8.21,'Published fee; special stencil engineering not quoted'),
 ('Feeder loading',42*1.53,43*1.53,'42 SMT codes; upper bound includes the through-hole header code'),
 ('SMT placement',204*5*.0016,.48*5,'204 unique KiCad SMT terminals; physical finger count/factory minimum may alter billing'),
 ('Through-hole soldering',3.58+20*.0164,3.58+20*.0164,'Published hand-solder labor plus 20 joints; actual wave/selective process may be different'),
 ('Rigid-board fixtures',16.42,16.42,'Published 1-29 board fixture tier'),
 ('X-ray of U1, U4, Q1, Q2',20*.82,20*1.64,'20 inspected parts; aggregated versus per-part-type billing sensitivity'),
 ('Packing / placement confirmation / applicable extra charges',2.95,18,'Lower bound: 5 x $0.50 plus $0.45; upper allowance includes factory adjustments'),
 ('10 core halves and 10 clips',24.55,24.55,'DigiKey ten-piece price breaks; installation not included'),
 ('10 mating plugs',plug_total,plug_total,'LCSC/JLC catalog component price; separate accessory procurement, not in PCBA BOM')]
costrows=[{'Item':name,'Low_USD':round(lo,2),'High_USD':round(hi,2),'Basis':basis} for name,lo,hi,basis in cost]
writecsv(S/'Manufacturing-cost-5boards.csv',costrows)
low=sum(x[1] for x in cost);high=sum(x[2] for x in cost)
budget={'quantity':5,'currency':'USD','status':'Planning estimate, NOT supplier quote or full-turnkey price','calculated_low_USD':round(low,2),'calculated_high_USD':round(high,2),'rounded_planning_range_USD':[400,650],'rounded_per_board_USD':[80,130],'electronic_fitted_parts_total_USD':round(electronics,2),'parts_source_timestamp':catalog['retrieved_utc'],'fee_source':'https://jlcpcb.com/help/article/pcb-assembly-price','fee_source_last_updated':'2026-09-09','exclusions':['Shipping from JLCPCB and separate suppliers','Tax, duties, customs/brokerage','Ferrite/clip fitting labor or consignment/global sourcing charges','Mating-plug fitting if requested','Functional test fixture, test engineering, powered testing','Design repairs, bench validation, failed prototypes/re-spins','Unquoted supplier special-process surcharges beyond allowances'],'rows':costrows}
(E/'manufacturing-cost-estimate.json').write_text(json.dumps(budget,indent=2)+'\n',encoding='utf8')
pour=json.loads((E/'pour-and-stencil-audit.json').read_text(encoding='utf8'))
mag=json.loads((E/'magnetics.json').read_text(encoding='utf8'))
assert not g['courtyard_does_not_enclose_copper_pads']
assert not g['silkscreen_below_1mm_height_or_0p15mm_stroke']
assert not pour['failures']
issues=[
 ('M01','CAD FIXED / FACTORY REVIEW','Stack and magnetic model','Native construction and winding resistance now use JLC081622-1080: 1.655 mm, 70 µm outer / 61 µm inner copper. The dielectric sum is 1.149 mm; the previous audit arithmetic was corrected.','Factory must accept the exact construction, minimum finished copper, material and thickness tolerance. Characterize the physical transformer.','fabrication-stack.json'),
 ('M02','CAD CLOSED','U5 / C26 assembly overlap','Separated the LDO output and bypass lands; corrected U5 to TI DBV0005A land dimensions and rerouted the supply. Purchased-component copper no longer overlaps.','Review the final factory placement overlay and solder joints.','manufacturing-geometry.json'),
 ('M03','CAD FIXED / PROCESS REVIEW','GaN land, mask and stencil','Rebuilt U1 from TI RAR0017B with a centered origin, zero-stroke custom copper and independent mask/paste. Power-pad paste coverage measures approximately 75–76%; mask openings remain inside their copper. Fine-pitch pad gaps exceed 0.20 mm.','Approve 2 oz mask registration and the manufacturer 0.125 mm stencil example, paste transfer, fill/cap planarity and X-ray criteria.','pour-and-stencil-audit.json'),
 ('M04','CAD CLOSED','Courtyards and placement','Rebuilt undersized courtyards to include solder lands/body envelopes plus an assembly allowance. Repositioned the controller, receiver dividers, bias and feedback parts. No purchased pad lies outside its courtyard; no courtyard overlaps.','Factory spacing/placement review still applies to the actual package models and process.','manufacturing-geometry.json'),
 ('M05','CAD FIXED / PLACEMENT REVIEW','Origins and orientation','U1 now uses the manufacturer package center. Added visible top-side orientation marks to polarized U/D/Q packages and regenerated all 75 placement coordinates and 208 numbered pad anchors.','Approve the supplier part-model overlay for every exact code; raw KiCad angles are not a universal JLC rotation correction.','Assembly-pad-map.csv'),
 ('M06','FACTORY REVIEW','Factory handling and insertion connectors','Single-board CAD, Gerbers and CPL only. Customer panel data have been removed. Connector pours retain 0.6 mm thermal spokes without direct trace bypasses.','JLCPCB defines and quotes any assembly rails, panelization and depanelization needed for the 64 × 56 mm outline. Approve the factory placement mapping, overhanging headers, lead protrusion and solder fixture.','READ-BEFORE-ORDER.txt'),
 ('M07','SERVICE OPEN','Ferrite and accessories','Exact core-half, clip and removable-plug purchases remain specified. They are separately sourced mechanical/accessory items, not SMT placements.','Obtain explicit JLC sourcing/consignment and post-solder fitting acceptance and a price. Otherwise delivery is electronics PCBA plus separate mechanical parts.','manufacturing-core-prices.json'),
 ('M08','CAD SPECIFIED / PROCESS REVIEW','Filled vias and hidden joints',f"A coordinate-level drill map marks {pour['filled_capped_drills']} small interconnects for resin fill/copper cap, including six transformer transitions. Four connector and four mounting holes stay open.",'Supplier must confirm the process for the listed 0.30 mm holes, not just objects named vias. Review hidden-joint X-ray and solder acceptance.','Drill-process-map.csv'),
 ('M09','CAD CLOSED','Legend and polarity','Actual printed strokes clear solder-mask openings by at least 0.22 mm; board text clears component courtyards. Connector polarity, test labels and pin-1 marks are repositioned. Text is at least 1.0 mm high with 0.15 mm strokes.','Inspect the final silkscreen CAM preview.','manufacturing-geometry.json'),
 ('M10','ORDER CHECK OPEN','Sourcing','43 exact electronic catalog codes cover all 75 placements. The 10 October snapshot supports five fitted boards before attrition; no electronic substitutions were made.','Refresh stock, order-specific MOQ/attrition and warehouse allocation before release. Snapshot stock is not reserved.','Manufacturing-parts-5boards.csv'),
 ('M11','ENGINEERING HOLD','Electrical qualification',f"The updated nominal 80 °C winding DC-loss screen is {mag['winding_DC_loss_W']:.3f} W before AC copper/core loss. Magnetics, effective capacitor capacitance/ripple, surge margin and frequency-dependent fault protection remain unqualified.",'Controlled bring-up, transformer characterization, surge/fault, regulation, ZVS/SR timing and thermal testing must close the electrical findings. No rated-power release is claimed.','component-ratings-audit.json'),
 ('M12','FIT TRIAL OPEN','Core and clip fit','The selected stack is included in the nominal fit model. The board outline, original mounting-footprint geometry and 55 × 47 mm mounting pattern are preserved. Core slots retain 0.5 mm internal corner radii.','Verify actual routed corners, core tolerances, gap orientation, clips and underside clearance using physical parts; nominal renders do not establish fit.','mechanical-assembly-audit.json')]
issue_rows=[dict(zip(['ID','Status','Area','Finding','Required_closure','Evidence'],x)) for x in issues]
writecsv(M/'Manufacturing-issue-register.csv',issue_rows)
report={'date':'2026-10-10','native_revision':'A12','build_quantity':5,'verdict':'CAD repairs completed; factory acceptance and electrical qualification remain open. Full turnkey not confirmed.','native_board_sha256':hashlib.sha256((R/'kicad/PS-GAN-60W.kicad_pcb').read_bytes()).hexdigest(),'native_schematic_sha256':hashlib.sha256((R/'kicad/PS-GAN-60W.kicad_sch').read_bytes()).hexdigest(),'issues':issue_rows,'budget':budget,'checked_electronics_codes':43,'fitted_placements_5boards':375,'board_or_schematic_modified':True,'scope':'Native CAD repairs, actual filled-copper and stencil geometry, exported fabrication files, sourcing and planning cost. Not factory CAM acceptance, powered testing or production release.'}
(E/'manufacturing-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
esc=html.escape
cards=''.join(f'<article><small>{esc(i[0]+" · "+i[1])}</small><h3>{esc(i[2])}</h3><p>{esc(i[3])}</p><p><b>Remaining:</b> {esc(i[4])}</p></article>' for i in issues)
costhtml=''.join(f'<tr><td>{esc(x[0])}</td><td>${x[1]:.2f}</td><td>${x[2]:.2f}</td><td>{esc(x[3])}</td></tr>' for x in cost)
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PS-GAN-60W A12 · Manufacturing repairs</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f3f5f2;color:#20362f;font:16px/1.6 system-ui}}main{{max-width:1160px;margin:auto;padding:40px 28px}}h1{{font-size:46px;line-height:1.12}}h2{{margin-top:38px}}a{{color:#12614e}}small{{font-weight:700;color:#52685c}}.note{{background:#fff0df;border-left:4px solid #b57633;padding:18px 24px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}article{{background:white;padding:22px;border:1px solid #ccd9d1;border-radius:12px}}img{{max-width:100%}}nav{{display:flex;gap:18px;flex-wrap:wrap}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{padding:10px;border-bottom:1px solid #ccc;text-align:left;vertical-align:top}}@media(max-width:740px){{.grid{{grid-template-columns:1fr}}h1{{font-size:34px}}}}</style>
<main><small>PLANAR STUDIO · A12 · 10 OCTOBER 2026</small><h1>Clean routing<br>and single-board manufacturing data</h1><p>A12 straightens the routes to horizontal, vertical and 45-degree segments, chamfers free elbows, and moves legend clear of solder openings and component bodies. Only single-board fabrication data are supplied. All electronics remain on top. The 64 × 56 mm board, chamfers and 55 × 47 mm M3 pattern are preserved.</p>
<div class="note"><b>Engineering prototype — full turnkey remains unconfirmed.</b><p>The CAD repairs do not replace JLCPCB acceptance or powered qualification. The remaining gates are identified separately below. No order, reservation or supplier message has been sent.</p></div>
<nav><a href="Review.html">Design review</a><a href="manufacturing-prototype/Manufacturing-issue-register.csv">Issue register</a><a href="evidence/routing-and-silk-audit.json">Routing and legend measurements</a><a href="manufacturing-prototype/SUPPLIER-REVIEW-REQUEST.txt">Supplier review draft</a></nav>
<h2>Verified geometry</h2><p>Zero ERC violations, zero DRC violations, zero unconnected items and zero schematic-parity errors. All 75 BOM placements agree with the native coordinates. There are {g['via_count']} routed vias plus six T1 transitions; the separate drill map specifies fill/cap treatment.</p><p>All {len(pour['zones'])} functional pours are named. Their filled pieces touch same-net copper; isolated islands are removed. All {len(pour['final_stitches'])} stitching vias touch at least two final ground fills. The drive and selected control/sense traces retain adjacent return copper outside their own required via antipads. Fast GaN and bias switching lands/routes have copper projection exclusions. AGND, PGND and SGND remain separate PCB domains.</p>
<img src="evidence/Manufacturing-findings.svg" alt="Actual repaired GaN copper, solder-mask and paste and separated LDO bypass lands">
<p><a href="evidence/pour-and-stencil-audit.json">Pour/stencil measurements</a> · <a href="evidence/reference-plane-audit.json">17 control/sense nets</a> · <a href="evidence/return-path-audit.json">Drive return paths</a> · <a href="evidence/Gerber-review.png">Actual exported Gerbers</a></p>
<h2>JLCPCB controls assembly handling</h2><p>The package contains only single-board Gerbers and matching single-board CPL. JLCPCB should define and quote any handling rails, panelization, tooling and coordinate translation required by its assembly process. No customer panel, tabs or mouse-bite data are supplied. Fit the ferrite after soldering and inspection.</p>
<h2>Issue-by-issue closure</h2><div class="grid">{cards}</div>
<h2>Five-board planning cost</h2><p><b>$400–650 total ($80–130 per board)</b> remains a planning allowance. The calculated range is ${low:.2f}–${high:.2f}. This includes electronics assembly and separate cores/clips/plugs, and excludes ferrite fitting, functional testing, shipping, tax and duties. It is not a supplier quote or a full-turnkey price; special-process and panel costs can exceed the allowance.</p><table><tr><th>Item</th><th>Low</th><th>High</th><th>Basis</th></tr>{costhtml}</table>
<h2>Primary sources</h2><p><a href="https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf">TI GaN land/mask/stencil drawings</a> · <a href="https://www.ti.com/lit/ds/symlink/tps7a24.pdf">TI LDO package drawing</a> · <a href="https://jlcpcb.com/capabilities/pcb-capabilities">JLC fabrication guidance</a> · <a href="https://jlcpcb.com/help/article/minimum-spacing-for-smd-components">JLC component spacing</a> · <a href="https://jlcpcb.com/capabilities/pcb-assembly-capabilities">JLC assembly capabilities</a> · <a href="https://jlcpcb.com/help/article/pcb-assembly-price">Assembly fees</a></p><p><a href="COMPONENT-RATINGS.md">Electrical limitations</a> · <a href="sourcing/Manufacturing-parts-5boards.csv">Exact parts and stock snapshot</a> · <a href="evidence/manufacturing-audit.json">Native source hashes</a></p></main></html>'''
(R/'Manufacturing-audit.html').write_text(page,encoding='utf8')
notes='''PS-GAN-60W A12 — ENGINEERING / FACTORY REVIEW ONLY
Do not order from this package until the remaining factory and engineering gates are closed.
Five assembled units; 75 top-side placements each (73 SMT + 2 insertion headers).
Use JLC Standard service. The single-board outline is 64 x 56 mm. Supply the matched single-board
Gerbers and CPL. JLCPCB is to define and quote any required handling rails or panel,
including tooling and final placement-coordinate mapping. No customer panel is supplied.

CONSTRUCTION
JLC081622-1080 candidate: 1.655 mm nominal copper+dielectric stack, 70 um outer and
61 um inner copper. See fabrication-stack.json for every dielectric thickness.
ENIG, green mask, top assembly. Obtain final construction and tolerance acceptance.
All 0.30 mm interconnect holes require resin fill, copper cap and planarization,
including the six T1 transitions represented as plated pads. See Drill-process-map.csv.
Keep 1.60 mm connector and 3.20 mm mounting holes open.
Any factory-added tooling is controlled by JLCPCB. Do not fill by object type alone.

ASSEMBLY
U1 uses TI RAR0017B separated copper/mask/paste, approximately 75–76% power-land
paste coverage and the 0.125 mm stencil example. Supplier must approve transfer,
mask registration, cap planarity, profile and hidden-joint X-ray criteria.
Review every exact part code, package-center coordinate, pin 1 and rotation against
the supplier model. KiCad angles are raw, not a universal JLC rotation correction.
Both headers: pin 2 positive, pin 1 return; removable plugs ship separately unless agreed.
Approve insertion lead protrusion, fixture and solder process; 0.6 mm thermal spokes.

MECHANICAL OPERATIONS
Solder and inspect electronics, depanelize, then fit two B66285G0050X187 core halves
and two B66286A2000X000 clips per board. Two C71370 mating plugs per board are
accessories. No core grinding or extra spacer is specified. Verify actual core/slot,
corner, clip and underside clearances before committing a build. Clips must not bridge
the isolation domains or contact circuit copper. Nonconductive standoffs are specified.
JLC procurement/consignment and core/clip installation have not been accepted.

ELECTRICAL RELEASE
Hardware is unbuilt and untested. 60 W is a target. Close transformer AC/core loss,
temperature, MLCC effective capacitance/ripple, input surge/TVS margin, startup,
short circuit, frequency-dependent current protection, regulation and SR timing.
Use engineering bring-up to establish a test procedure before supplier functional testing.
Bare-board continuity and AOI do not verify a working converter.

See Manufacturing-issue-register.csv and ../Manufacturing-audit.html for status.
'''
(M/'READ-BEFORE-ORDER.txt').write_text(notes,encoding='utf8')
(M/'SUPPLIER-REVIEW-REQUEST.txt').write_text('DRAFT FOR USER REVIEW — NOT SENT\n\nPlease review and quote five PS-GAN-60W A12 units against the attached exact files.\nConfirm each fabrication, stencil, placement, insertion-solder and mechanical operation\nbelow explicitly. Identify any unsupported operation and quote electronics-only and\nfinished assembly separately. Do not substitute parts or modify the magnetic stack\nwithout engineering review. Provide a CAM/placement preview and order-specific\nattrition/stock allocation before approval.\n\n'+notes,encoding='utf8')
print(json.dumps({'revision':'A12','issues':len(issues),'budget_USD':[round(low,2),round(high,2)],'verdict':report['verdict']},indent=2))
