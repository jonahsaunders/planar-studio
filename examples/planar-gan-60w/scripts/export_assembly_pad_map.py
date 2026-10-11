"""Export native pad positions for supplier placement verification, not P&P input."""
from pathlib import Path
import pcbnew as p,json,csv,html
R=Path(__file__).resolve().parents[1];b=p.LoadBoard(str(R/'kicad/PS-GAN-60W.kicad_pcb'))
parts={x['ref']:x for x in json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts'] if x['lcsc']}
origin=b.GetDesignSettings().GetAuxOrigin();rows=[]
fps={f.GetReference():f for f in b.GetFootprints()}
for ref in sorted(parts):
    f=fps[ref]
    for q in f.Pads():
        if not q.GetNumber():continue
        pos=q.GetPosition()
        rows.append({'Designator':ref,'MPN':parts[ref]['mpn'],'LCSC':parts[ref]['lcsc'],'Pad':q.GetNumber(),'Net':q.GetNetname(),'Pad_X_mm':round((pos.x-origin.x)/1e6,6),'Pad_Y_mm':round((origin.y-pos.y)/1e6,6),'Footprint_anchor_X_mm':round((f.GetPosition().x-origin.x)/1e6,6),'Footprint_anchor_Y_mm':round((origin.y-f.GetPosition().y)/1e6,6),'Native_footprint_rotation_deg':f.GetOrientationDegrees(),'Process':'THT' if q.GetAttribute()==p.PAD_ATTRIB_PTH else 'SMT','Use':'Inspection reference only; not a placement file'})
with (R/'manufacturing-prototype/Assembly-pad-map.csv').open('w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
assert len({x['Designator'] for x in rows})==75
print(f'{len(rows)} pad anchors, all 75 components.')
