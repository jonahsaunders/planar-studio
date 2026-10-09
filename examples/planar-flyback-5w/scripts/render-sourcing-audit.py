"""Reconcile exact-MPN public inventory to the current electronics BOM."""
import csv, hashlib, json
from collections import Counter
from pathlib import Path
R=Path(__file__).resolve().parents[1]
snapshot=json.loads((R/'sources/jlcpcb-stock.json').read_text())
bom=list(csv.DictReader((R/'manufacturing/BOM-MASTER.csv').open(encoding='utf-8-sig')))
electronics={r['Reference']:r for r in bom if r['Reference']!='T1'}
rows=snapshot['rows'];covered=set()
quantity=json.loads((R/'requirements.json').read_text())['provisional_design_targets']['quantity_for_sourcing_review']
for row in rows:
    for ref in row['references']:
        assert ref not in covered
        covered.add(ref)
        assert electronics[ref]['MPN']==row['mpn']
        assert electronics[ref]['LCSC']==row['verified_jlcpcb_code']
    assert row['status']=='Stocked'
    assert row['available_order_quantity']>=2*quantity*row['quantity_per_board'], 'Provisional extra parts; supplier attrition still requires acceptance'
assert covered==set(electronics) and len(rows)==20 and len(covered)==24
record={**snapshot,'counts':dict(Counter(row['status'] for row in rows)),
        'source_bom_sha256':hashlib.sha256((R/'manufacturing/BOM-MASTER.csv').read_bytes()).hexdigest(),
        'review_quantity_boards':quantity,'inventory_covers_twice_board_quantities':True,
        'supplier_attrition_allocation_confirmed':False,
        'conclusion':'All 20 exact electronic MPNs had orderable stock on their individual snapshot dates: 2026-09-30, except R6 on 2026-10-09. Inventory is not reserved. Factory acceptance and hardware qualification remain open.'}
(R/'evidence/audit/jlcpcb-sourcing.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf8')
text='''# JLCPCB electronics sourcing

**All 20 electronic MPNs / 24 placements had orderable stock in the dated snapshots: September 30, 2026, except the new R6 checked October 9.** The table uses JLCPCB's **Available Order Qty**, not headline inventory. Each quantity covers twice the five-board requirement as a planning allowance; JLCPCB's actual attrition and allocation rules still need confirmation. Inventory is not reserved. The limiting stocked device is U1, with 26 available.

The user authorized direct JLCPCB catalog and manufacturer-datasheet review. JLCPCB supplies and assembles the electronics, including J1/J2. DigiKey supplies two B66285G0050X187 factory-gapped halves and two B66286A2000X000 clips separately; install after PCBA and measure assembled inductance. A3 uses no grinding or adhesive. There has been no supplier upload, message, reservation or purchase.

| References | Exact MPN | JLCPCB code | Available | Per board | Checked |
| --- | --- | --- | ---: | ---: | --- |
'''
for row in rows:
    text+=f"| {', '.join(row['references'])} | {row['mpn']} | [{row['verified_jlcpcb_code']}]({row['source_url']}) | {row['available_order_quantity']:,} | {row['quantity_per_board']} | {row.get('observed_local_date',snapshot['observed_local_date'])} |\n"
text+='''
## Engineering substitutions

R3/R4/R5 use **113 kΩ / 10.7 kΩ / 127 kΩ**, Yageo RT0603 thin-film parts with 0.1% tolerance and 25 ppm/°C TCR. Nominal output is 4.980 V; the 17.5 V SW−VIN target gives 20.07% preliminary resistive-current separation. The temperature-compensation ratio changes by −0.95% from the original 106k/118k network; temperature trim remains required. [Feedback analysis](FEEDBACK-REVISION.md).

U1 uses the pin-compatible industrial-temperature LT8302I. C5 is a Murata 4.7 µF / 16 V X5R; C6 retains 470 pF C0G with a 100 V rating. R6 is Ever Ohms CRH2512F39R0E04Z (C175263), 39 Ω ±1%, 2 W at 70 °C in 2512. Its datasheet gives no repetitive nanosecond pulse curve; average-power margin is not pulse qualification. R8 is a 2 W pulse-rated 2.2 Ω Bourns part with its recommended lands; full power requires the datasheet's 300 mm² copper condition. [Every component's rating, package and pin review](COMPONENT-AUDIT.md).

## Before manufacturing release

- **Factory acceptance:** agree the six-layer 1 oz copper stack, filled/capped vias, core-slot tolerances, panel and through-hole connector assembly.
- **Reflow:** use Standard assembly with a component-level profile accepted for F1, R8 and C3/C8. Economic's fixed 255 ±5 °C profile is unsuitable for the fuse/capacitor limits. Manufacturer recommendations must be reconciled before assembly.
- **Prototype qualification:** demonstrate the 17.5 V differential spike envelope, RFB pin limits, regulation, startup/fault recovery, magnetics and temperatures. R8's power rating is conditional on copper and temperature.

[Fabrication requirements](manufacturing/FABRICATION.md) · [Factory review request](manufacturing/JLCPCB-REVIEW-REQUEST.md) · [Prototype tests](manufacturing/PROTOTYPE-TEST-PLAN.md) · [Core preparation](manufacturing/CORE-ASSEMBLY.md).

A3 core and clip procurement is recorded in sources/digikey-core-stock.json, retrieved October 8 from indexed DigiKey US listings. Both parts are listed in stock at MOQ 1; recheck checkout. The application accepts measured Lm 11.0–14.6 µH. Clip bow is a first-article mechanical acceptance item.

The superseded inventory remains in sources/jlcpcb-stock-before-turnkey.json as historical evidence. Previous pricing is not a quote for this revision.
'''
(R/'JLCPCB-SOURCING.md').write_text(text,encoding='utf8')
print('Verified stock identities and quantities for all 20 MPNs / 24 electronic placements.')
