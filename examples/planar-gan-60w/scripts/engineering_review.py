"""Transparent first-harmonic screening and catalog snapshot; not a hardware simulation."""
import json,math,csv,html,collections
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];parts=json.loads((ROOT/'circuit.json').read_text())['parts'];mag=json.loads((ROOT/'evidence/magnetics.json').read_text())
groups=collections.defaultdict(list)
for p in parts:
 if p['lcsc']:groups[p['lcsc']].append(p)
rows=[]
for code,ps in groups.items():
 p=ps[0];rows.append({'Designator':','.join(x['ref'] for x in ps),'Quantity':len(ps),'Value':p['value'],'Manufacturer':p['mfr'],'MPN':p['mpn'],'LCSC':code,'Footprint':p['footprint'],'Stock snapshot':p['stock'],'USD each (first tier)':p['unit_price_usd'],'Extended USD':round(p['unit_price_usd']*len(ps),4),'Catalog URL':'https://jlcpcb.com/partdetail/'+code,'Datasheet':p['source']})
with (ROOT/'sourcing/Electronics-BOM-review.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
core=[{'Description':'ELP22 N87 core half, 0.05 mm center gap','Quantity':2,'MPN':'B66285G0050X187','Supplier':'DigiKey','URL':'https://www.digikey.com/en/products/detail/tdk/B66285G0050X187/11488590'}, {'Description':'ELP22 spring clip','Quantity':2,'MPN':'B66286A2000X000','Supplier':'DigiKey','URL':'https://www.digikey.com/en/products/result?keywords=B66286A2000X000'}]
with (ROOT/'sourcing/Core-and-clips.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=core[0]);w.writeheader();w.writerows(core)
f=np.linspace(100e3,400e3,3001);w=2*np.pi*f;Rac=8/np.pi**2*2**2*(12/5);Lr=3.4e-6;Cr=200e-9;Lm=13.12e-6;Rs=.35
zm=1/(1/Rac+1/(1j*w*Lm));zin=Rs+1j*w*Lr+1/(1j*w*Cr)+zm;gain=abs(zm/zin)
points=[]
for vin in [46,48,50]:
 roots=np.where(np.diff(np.sign(gain-48/vin)))[0]
 for i in roots:
  points.append({'VIN_V':vin,'load_W':60,'frequency_kHz':round(f[i]/1000,2),'input_impedance_angle_deg':round(np.angle(zin[i],deg=True),2)})
corner=[]
for lr in [2.74e-6,3.4e-6,4.06e-6]:
 for cr in [190e-9,200e-9,210e-9]:
  for lm in [10.50e-6,13.12e-6,15.74e-6]:
   z=1/(1/Rac+1/(1j*w*lm));zi=Rs+1j*w*lr+1/(1j*w*cr)+z;g=abs(z/zi)
   at=np.where(np.diff(np.sign(g-48/46)))[0]
   stable=[i for i in at if np.imag(zi[i])>0 and f[i]>119e3]
   corner.append({'Lr_uH':lr*1e6,'Cr_nF':cr*1e9,'Lm_uH':lm*1e6,'46V_60W_inductive_solution_in_controller_range':bool(stable)})
results={'method':'First harmonic approximation, ideal center-tapped rectifier, constant lumped 0.35 ohm series loss. NOT a switching simulation.','n':2,'Rac_ohm':Rac,'Lr_uH':3.4,'Lr_basis':'3.3 uH purchased inductor + assumed 0.1 uH leakage; measure and tune','Cr_nF':200,'Lm_uH':13.12,'series_loss_ohm':Rs,'nominal_series_resonance_kHz':1/(2*np.pi*np.sqrt(Lr*Cr))/1000,'operating_points':points,'corners':corner,'corner_failures':sum(not x['46V_60W_inductive_solution_in_controller_range'] for x in corner),'f_min_kHz':1/(2*(6e-9/(2.5/1690)+150e-9))/1000,'f_max_nominal_kHz':1/(2*(6e-9/(2.5/1690+2.4/750)+150e-9))/1000,'feedback_setpoint_V':2.495*(1+38.3/10),'OVP_setpoint_V':2.495*(1+43.2/10),'SS_time_ms':100e-9*2.8/5e-6*1000,'magnetic_copper_DC_loss_W':mag['winding_DC_loss_W'],'electronics_only_catalog_total_USD':round(sum(r['Extended USD'] for r in rows),2),'price_excludes':'Core, clips, PCB, assembly, extended-part setup, attrition, shipping, taxes and minimum purchase quantities.'}
(ROOT/'evidence/engineering-calculations.json').write_text(json.dumps(results,indent=2))
W,H=950,450;left,top,cw,ch=70,40,800,340
def xp(x):return left+(x-100)/300*cw
def yp(y):return top+ch-(y-.6)/.8*ch
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial" font-size="14" fill="#24363c">']
for y in np.arange(.6,1.41,.1):svg.append(f'<path d="M{left} {yp(y):.2f}H{left+cw}" stroke="#dce5e8"/><text x="28" y="{yp(y)+5:.2f}">{y:.1f}</text>')
for x in range(100,401,50):svg.append(f'<text x="{xp(x)-13}" y="405">{x}</text>')
svg.append('<text x="395" y="438">Switching frequency (kHz)</text><text x="72" y="22">Calculated full-load LLC voltage gain • first-harmonic screening only</text>')
points_svg=' '.join(f'{xp(ff/1000):.2f},{yp(g):.2f}' for ff,g in zip(f,gain))
svg.append(f'<polyline points="{points_svg}" fill="none" stroke="#007c83" stroke-width="3"/>')
for v,color in [(46,'#d76b35'),(48,'#586b96'),(50,'#5a9165')]:svg.append(f'<path d="M70 {yp(48/v):.2f}H870" stroke="{color}" stroke-dasharray="6 5"/><text x="874" y="{yp(48/v)+4:.2f}" fill="{color}">{v} V</text>')
svg.append('</g></svg>');(ROOT/'evidence/LLC-gain.svg').write_text(''.join(svg))
print(json.dumps({k:results[k] for k in ['operating_points','corner_failures','electronics_only_catalog_total_USD','f_min_kHz','f_max_nominal_kHz']}))
