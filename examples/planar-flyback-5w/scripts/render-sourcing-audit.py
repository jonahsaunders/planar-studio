"""Reconcile the dated catalog observations to the current electronics BOM."""
import csv,hashlib,html,json
from collections import Counter
from pathlib import Path
R=Path(__file__).resolve().parents[1]
snapshot=json.loads((R/'sources/jlcpcb-stock.json').read_text())
bom=list(csv.DictReader((R/'manufacturing/BOM-MASTER.csv').open(encoding='utf-8-sig')))
electronics={r['Reference']:r for r in bom if r['Reference']!='T1'}
rows=snapshot['rows'];covered=set()
for row in rows:
    for ref in row['references']:
        assert ref not in covered
        covered.add(ref)
        assert electronics[ref]['MPN']==row['mpn']
        assert electronics[ref]['LCSC']==(row['verified_jlcpcb_code'] or '')
assert covered==set(electronics) and len(rows)==20 and len(covered)==24
counts=Counter(row['status'] for row in rows)
assert counts=={'Stocked':13,'Low stock':2,'Pre-order':4,'No exact match':1}
record={**snapshot,'counts':dict(counts),'source_bom_sha256':hashlib.sha256((R/'manufacturing/BOM-MASTER.csv').read_bytes()).hexdigest(),
        'conclusion':'15 electronic MPNs stocked (two low); four pre-order; one without exact catalog match. Core sourcing is separate and is not counted as a JLCPCB availability failure.',
        'changes':'F1 replaced by Bourns SF-1206F100-2, footprint and 3D model updated, and eight previously missing exact-MPN catalog codes added. No purchases, supplier messages or supplier uploads.'}
(R/'evidence/audit/jlcpcb-sourcing.json').write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
intro='''# Board-assembly sourcing audit

**Scope:** JLCPCB sources and assembles the 24 electronic placements (20 unique MPNs), including both through-hole connectors. Raw ferrite cores may come separately from DigiKey. Integral PCB windings remain on the converter board. The custom core gap, retention, installation and magnetic acceptance still need a qualified process; an ungapped stock pair is not a substitute.

Catalog observations: **September 29, 2026, America/New_York / September 30 UTC**. These are live-page snapshots, not reserved inventory, quotations or delivery promises. The fuse row was checked when selecting its replacement; other rows retain the preceding all-part audit observations from the same date.

**15 MPNs were stocked (including two low-stock lines); four require pre-order; one has no exact catalog match.** That covers 19 stocked placements and five requiring procurement work. All 19 catalog matches are Extended parts. Eight exact-MPN catalog codes missing from the earlier BOM are now included; no other MPNs were substituted.

## Fuse replacement

F1 changes from unavailable Littelfuse 0466001.NR / C151134 to **Bourns SF-1206F100-2 / C3164649**. JLCPCB showed 2,931 headline stock, **2,928 available to order**, minimum one, and $0.2405 at the one-piece tier before assembly/shipping. [JLCPCB listing](https://jlcpcb.com/partdetail/BOURNS-SF_1206F1002/C3164649).

The replacement is 1 A, 63 V DC, fast acting, with 50 A interruption at 63 V DC. Its typical melting I²t is 0.034 A²s versus the old fuse's 0.0423 A²s, so repeat inrush/coordination validation. Approximately 0.40 A operating input current is a screening estimate, not a measured RMS or thermal result. Confirm the source fault current and startup behavior. [Manufacturer specification](https://www.bourns.com/docs/product-datasheets/sf-1206f.pdf).

The footprint now uses two 1.25 × 1.65 mm lands with a 2.20 mm gap and 4.70 mm outside span. Bourns' official series STEP geometry is bundled and oriented to KiCad's seating plane; the body is 3.10 × 1.55 × 0.60 mm. See [model provenance](3D-MODELS.md) and [change checks](evidence/audit/fuse-revision-checks.json).

## Remaining board-assembly work

- **R3:** no exact match for RT0603BRD07106KL (106 kΩ, 0.1%). Obtain an exact supplier source or qualify an alternative; no code is invented.
- **C5, C6, R6, R8:** exact parts are listed for pre-order, with lead times and minimum/attrition quantities unconfirmed. Preserve capacitor bias/dielectric behavior and resistor pulse capability if substituting.
- **U1 and R5:** only five and six available respectively; insufficient margin to assume a five-board assembly run with attrition.
- **Reflow:** Bourns recommends 245–250 °C peak for 5 seconds and ≥230 °C for 30 ±10 seconds. Economic's published fixed 255 ±5 °C is incompatible; Standard's 240 ±5 °C does not automatically establish a compliant fuse process either. Have JLCPCB accept a component-level profile covering F1 and the SVPF capacitors before ordering. The fuse's 260 °C resistance-to-solder-heat test is not a recommended production profile.
- **Fabrication and panel:** the winding stack needs acceptance. The 50 × 104 mm board is narrower than Standard's published 70 × 70 mm minimum board/panel, so arrange a compliant panel/process frame, rails and fiducials. Include J1/J2 through-hole assembly.

[JLCPCB assembly capabilities](https://jlcpcb.com/capabilities/pcb-assembly-capabilities) · [Panasonic SVPF mounting limits](https://industrial.panasonic.com/cdbs/www-data/pdf/AAB8000/AAB8000COL10.pdf) · [Global Sourcing](https://jlcpcb.com/help/article/how-to-use-jlcpcb-global-sourcing-parts-service) · [Pre-order conditions](https://jlcpcb.com/help/article/pre-ordering-parts-terms-conditions).

## Every electronic part

“Available” is the site's Available Order Qty, rather than headline inventory. “Not shown” does not mean zero. Displayed minimum is a purchasing minimum, not a confirmed PCBA allowance. The fuse is populated once; J1/J2, D1/D3, C1/C2 and C3/C8 share their respective MPNs.

| References | Exact MPN | JLCPCB code | Status | Available | Minimum |
| --- | --- | --- | --- | ---: | ---: |
'''
lines=[]
for row in rows:
    num=lambda n:'Not shown' if n is None else f'{n:,}'
    lines.append('| '+ ' | '.join([', '.join(row['references']),row['mpn'],f"[{row['verified_jlcpcb_code'] or 'Search'}]({row['source_url']})",row['status'],num(row['available_order_quantity']),num(row['displayed_minimum'])])+' |')
ending='''

## Separate core procurement and qualification

The raw TDK B66457G0000X187 halves may be purchased from DigiKey; this audit makes no new DigiKey inventory claim. Two raw halves still need the PS-MAG-001 prepared-pair process and magnetic checks. No JLCPCB code is applied to T1 as though a raw half were a complete transformer. Core adhesive, activator and retention remain in the separate core BOM, with their process and installation responsibility to be agreed. H1–H4 are fabricated holes; illustrative 3D screws/standoffs are not purchased BOM lines.

This unbuilt engineering prototype is not released for fabrication. No purchase, reservation, supplier message or supplier upload was made. [Structured observations](evidence/audit/jlcpcb-sourcing.json) · [Electronic BOM](manufacturing/BOM-JLCPCB.csv) · [Core process](manufacturing/CORE-ASSEMBLY.md).
'''
(R/'JLCPCB-SOURCING.md').write_text(intro+'\n'.join(lines)+ending,encoding='utf8')
print('Reconciled 20 MPNs / 24 placements; fuse replacement and exact catalog codes match the current BOM.')
