"""Reference-by-reference operating-stress screen, not switching/thermal qualification.
Uses the exact circuit manifest. All assumptions and unresolved limits are exported.
"""
from pathlib import Path
import json,csv,math,collections,re
import numpy as np
R=Path(__file__).resolve().parents[1];parts=json.loads((R/'circuit.json').read_text(encoding='utf8'))['parts'];by={p['ref']:p for p in parts}
vin=50.;vo=14.2;bias=12.65;v5=5.15;temp=85.;fs=400e3
derate=(155-temp)/(155-70)
# Reflected full-load FHA network. Find only inductive roots in the controller range.
freq=np.linspace(119e3,400e3,10001);w=2*np.pi*freq;rac=8/np.pi**2*4*2.4;corners=[]
for lr in [2.74e-6,3.4e-6,4.06e-6]:
 for cr in [190e-9,200e-9,210e-9]:
  for lm in [10.5e-6,13.12e-6,15.74e-6]:
   z=1/(1/rac+1/(1j*w*lm));zin=.35+1j*w*lr+1/(1j*w*cr)+z;gain=abs(z/zin)
   for vi in [46,48,50]:
    roots=[i for i in np.where(np.diff(np.sign(gain-48/vi)))[0] if zin[i].imag>0]
    assert roots,(vi,lr,cr,lm)
    i=roots[-1];current=np.sqrt(2)*vi/np.pi/abs(zin[i]);cap_peak=np.sqrt(2)*current/(w[i]*cr)
    corners.append(dict(VIN_V=vi,Lr_uH=lr*1e6,Cr_nF=cr*1e9,Lm_uH=lm*1e6,frequency_Hz=float(freq[i]),primary_RMS_A=float(current),Cr_AC_peak_V=float(cap_peak)))
worst=max(corners,key=lambda x:x['Cr_AC_peak_V'])
def oc_sim(r8,steps=400):
 # Ideal source with constant diode drop, exact series-C17 and shunt-C18 state.
 # Worst high OC corner: R8 -1%, R9 +1%, C18 -10% and -15% temperature.
 f=worst['frequency_Hz'];vp=worst['Cr_AC_peak_V'];dt=1/(f*steps);vc=23.;oc=0.;C17=11e-9;C18=7.65e-9;vd=.15
 maxoc=0.;sum_i2=0.;vcmin=1e9;vcmax=-1e9;count=0
 for j in range(steps*1000):
  source=23+vp*math.sin(2*math.pi*(j%steps)/steps);s=source-vc
  i=(s+vd)/(r8*.99) if s < -vd else (s-oc-vd)/(r8*.99) if s > oc+vd else 0.
  vc+=i*dt/C17;oc+=(max(i,0)-oc/(2210*1.01))*dt/C18
  if j>=steps*950:
   maxoc=max(maxoc,oc);sum_i2+=i*i;count+=1;vcmin=min(vcmin,vc);vcmax=max(vcmax,vc)
 return {'R8_ohm':r8,'OC_peak_V':maxoc,'R8_RMS_A':math.sqrt(sum_i2/count),'C17_min_V':vcmin,'C17_max_V':vcmax,'method':'1000 periods, 400 Euler steps/period; last 50 periods measured. Constant 0.15 V diode; sine source from worst full-load FHA cap-voltage corner. Not startup, fault, or a semiconductor switching simulation.'}
assert by['R8']['value']=='24.9kR' and all(by[r]['mpn']=='ERJPA3F1501V' for r in ['R20','R25'])
oc_before=oc_sim(15000);oc_after=oc_sim(24900)
convergence=abs(oc_after['OC_peak_V']-oc_sim(24900,800)['OC_peak_V']);assert convergence<.002
assert oc_after['OC_peak_V']<.9,(oc_before,oc_after)
# Conservative screens above the calculated full-load envelope, conditional on
# verifying those envelopes at startup, no load, load steps and faults.
ipr=4.;ipp=math.sqrt(2)*ipr;isr=5*math.pi/4;isp=5*math.pi/2
cap_ac=ipr/(2*math.pi*119e3*190e-9);tank_peak=25+math.sqrt(2)*cap_ac
input_i=60/(46*.85)+.05 # include a separate bias allowance, conservatively
rows=[]
def add(p,vlim,stress_v,ilim,stress_i,plim,stress_p,note,status='PASS_SCREEN',source=None):
 row={'Reference':p['ref'],'MPN':p['mpn'] or p['value'],'LCSC':p['lcsc'] or '',
 'Voltage_limit_V':vlim,'Voltage_stress_V':stress_v,'Current_limit_A':ilim,'Current_stress_A':stress_i,
 'Power_limit_W':plim,'Power_stress_W':stress_p,'Status':status,'Basis_and_open_checks':note,
 'Source':source or p.get('source') or ''}
 for rating,stress in [(vlim,stress_v),(ilim,stress_i),(plim,stress_p)]:
  if isinstance(rating,(int,float)) and isinstance(stress,(int,float)):assert stress<=rating,(p['ref'],rating,stress)
 rows.append(row)
def val(s):
 s=s.rstrip('R');return float(s[:-1])*1000 if s.endswith('k') else float(s)
res_v={'R1':2.5,'R2':2.5,'R3':2.5,'R4':bias*2.21/3.21,'R5':bias/3.21,'R6':bias*2.21/3.21,'R7':bias/3.21,'R9':1.1,'R14':vin,'R15':2.1,'R16':2.0,'R17':bias,'R18':1.3,'R19':vin,'R21':1.5,'R22':vo-2.4,'R23':2.7,'R24':vo,'R26':1.5,'R27':vo-2.4,'R28':2.7}
cap_v={'C1':50,'C2':50,'C3':50,'C4':5.25,'C5':v5,'C6':v5,'C7':tank_peak,'C8':tank_peak,'C9':5.5,'C10':bias,'C11':11.9,'C12':vo,'C13':vo,'C14':vo,'C15':vo,'C16':vo,'C17':70,'C18':2.2,'C19':50,'C20':5.5,'C21':bias,'C22':bias,'C23':15,'C24':bias,'C25':bias,'C26':v5,'C27':vo,'C28':vo,'C29':2.7}
for p in parts:
 ref=p['ref'];kind=p['kind'];mpn=p['mpn'] or ''
 if kind=='R':
  rv=val(p['value']);rated=.25 if ref in ['R20','R25'] else .1;limit=rated*derate;vl=200 if rated==.25 else 75
  source=p['source'] if ref in ['R20','R25'] else 'https://yageogroup.com/download/specsheet/'+mpn
  if ref in ['R12','R13']:
   add(p,'N/A (jumper)',.01,1,.01,'N/A',.01**2*.05,'Drain-sense current screened at 10 mA, not rectifier load current. 1 A conservative jumper allowance; VD negative injection still needs measurement.',source=source);continue
  note=f'{rated:g} W at 70 C, linearly derated to {limit:.4f} W at 85 C; resistance -1% used for dissipation.';st='PASS_SCREEN'
  if ref in ['R10','R11']:
   power=14.5e-9*11.9*fs;vol=11.9;cur=None;note+=' Entire Qg*Vg*f energy assigned to each external resistor (conservative average); short gate pulses need pulse-load verification.';st='CONDITIONAL_PULSE'
  elif ref in ['R20','R25']:
   # Conservative normal upper rail; minimum forward drop 0.8 V and 2.4 V cathode.
   vol=vo;power=vol**2/(rv*.99);cur=vol/(rv*.99);note+=' Full 14.2 V across resistor: no minimum LED or saturated-shunt voltage assumed. Use conservative 0.25 W catalog rating despite newer 0.33 W series data; verify assembly heat spreading.'
  elif ref=='R8':
   vol=math.sqrt(2)*cap_ac+1.1;cur=cap_ac/(rv*.99);power=cur*cur*rv*.99;note+=' 4 Arms / 119 kHz / Cr 190 nF sinusoidal tank screen; ignores additional fault/harmonic energy.';st='CONDITIONAL_WAVEFORM'
  else:
   vol=res_v[ref];cur=vol/(rv*.99);power=vol*cur
   if ref in ['R4','R5','R6','R7']:power*=.5;note+=' 50% drive duty.'
   if ref=='R16':note+=' RON pin 2 V conservative allowance; does not see VIN.'
  add(p,vl,vol,None,cur,limit,power,note,st,source)
 elif kind=='C':
  rated=float(re.match(r'([0-9.]+)',p['Voltage']).group(1));sv=cap_v[ref];irms=None
  note='Voltage is differential across terminals; X7R/C0G rated to 125 C. DC voltage rating is not a ripple-current rating.'
  if ref in ['C7','C8']:
   irms=ipr*.525;note+=f' Worst 105 nF / 95 nF sharing: {irms:.2f} Arms per capacitor; 4 Arms total tank current. Verify ESR, AC loss and <=20 C self-heating.'
  elif ref in ['C13','C14','C15','C16']:
   irms=math.sqrt(2*isr**2-25);note+=f' Output-bank ripple {irms:.3f} Arms in ideal full-wave model; conservative single-cap share shown. Actual sharing/ESR/heating and effective capacitance at 14.2 V unresolved.'
  elif ref in ['C1','C2','C3']:irms=ipr/math.sqrt(2);note+=' Conservative single-cap commutation branch RMS; actual bank sharing, lead impedance and input transient need measurement.'
  elif ref=='C17':irms=oc_after['R8_RMS_A'];note+=' 70 V engineering startup screen, not a calculated fault bound. Settled DC is about VIN/2; does NOT continuously see full tank AC. 100 V adds margin.'
  elif ref=='C20':note+=' Exactly 2.2 nF retained for LM5164 bootstrap requirements.'
  elif ref=='C23':note+=' Steady ripple across sampler capacitor is small; verify power-up differential and injected FB ripple.'
  else:note+=' Verify effective capacitance with DC bias, tolerance and temperature at this operating point.'
  if ref=='C11':note+=' UCC24624 requires nominal 2.2 uF REG bypass; selected nominal matches.'
  if ref=='C26':note+=' TPS7A24 requires adequate effective output capacitance; 2.2 uF nominal follows recommended value, exact DC-bias curve not yet qualified.'
  source=('https://www.murata.com/en-us/products/productdetail?partno='+mpn[:-1]+'%23') if 'GRM' in mpn else 'https://product.samsungsem.com/mlcc/CL21B105KBFNNN.do' if ref=='C10' else 'https://yageogroup.com/download/specsheet/'+mpn
  add(p,rated,sv,None,irms,None,None,note,'CONDITIONAL_CAPACITANCE_OR_RIPPLE',source)
 elif ref=='F1':
  add(p,65,50,3*.85/1.25,input_i,None,input_i**2*.042*1.3,'85% temperature factor at 85 C from Bourns curve, plus 125% sizing factor. 60 A interrupt at 65 V. Available source fault current, inrush I2t and TVS coordination unresolved. Do not substitute 32 V variant.','CONDITIONAL_FAULT')
 elif ref in ['J1','J2']:
  add(p,300,50 if ref=='J1' else vo,10,input_i if ref=='J1' else 5,None,None,'Use lower 10 A UL rating; -40..105 C. Mating C71370 plug, wire gauge, screw torque and contact heating must also qualify.',source=p['source'])
 elif ref=='L1':
  add(p,None,None,5,ipr,None,ipr**2*.038*(1+.00393*(85-25)),f'3.3 uH +/-20%; 8 A at 20% L drop versus {ipp:.3f} A sine peak. 5 A Irms implies 40 C typical rise in maker fixture; 125 C winding limit. AC core loss is not included.','CONDITIONAL_MAGNETICS','https://www.bourns.com/docs/Product-Datasheets/SRP5030T.pdf')
 elif ref=='L2':
  add(p,None,None,1.2,.65,None,.65**2*.445*(1+.00393*60),'68 uH +/-20%; 2 A saturation rating vs LM5164 max 1.75 A current limit (delay overshoot still unbounded). 0.65 A conservative operational peak/RMS screen for bias load <=50 mA; fault average heating needs test.','CONDITIONAL_FAULT','https://www.bourns.com/docs/Product-Datasheets/SRP7050TA.pdf')
 elif ref in ['Q1','Q2']:
  add(p,60,2*vo,12,isr,None,isr**2*.0099*1.8,f'VGS +/-20 V vs <=11.9 V REG. Sine peak {isp:.3f} A. Rds(max,25C)*1.8 temperature allowance used only for conduction screen; board-current rating is fixture dependent. VDS ringing, reverse current, dead-time loss and temperature unqualified.','CONDITIONAL_SWITCHING','https://www.ti.com/lit/ds/symlink/csd18543q3a.pdf')
 elif ref=='U1':
  add(p,90,50,35,ipp,None,ipr**2*.006*1.8+5.15*.0225,'VIN recommended <=90 V (93 V absolute continuous); switch ringing not bounded. VCC 4.75..5.25 V vs 5.15 V screen. Conduction plus bias loss only; ZVS/switching loss missing. VCC, HB-HS, HS undershoot and 50 V/ns limit require scope measurements.','CONDITIONAL_SWITCHING','https://www.ti.com/lit/ds/symlink/lmg2100r044.pdf')
 elif ref=='U2':
  add(p,18,bias,None,.0075,None,bias*.0075,'Recommended VCC 11.5..18 V; static low-end rail screen 11.54 V including 0.15 V allowance is tight. Startup droop/UVLO and GD amplitude must be measured. OC minimum trip 0.9 V; revised network screened separately.','CONDITIONAL_BIAS','https://www.ti.com/lit/ds/symlink/ucc25600.pdf')
 elif ref=='U3':
  add(p,26,vo,.041,2*14.5e-9*fs,None,vo*(.0015+2*14.5e-9*fs),'VD input 200 V operating vs 28.4 V off-state before ringing; REG min current limit 41 mA. Power upper screen includes all gate energy, not just IC heat. TJ<=125 C. VD negative injection and timing require measurement.','CONDITIONAL_SWITCHING','https://www.ti.com/lit/ds/symlink/ucc24624.pdf')
 elif ref=='U4':
  add(p,100,50,1,.05,None,None,'BIAS12 11.54..12.65 V review envelope. VIN/SW <=100 V; bias load allowance 50 mA. Current-limit upper threshold 1.75 A. Efficiency, startup and Type-3 FB ripple not simulated.','CONDITIONAL_SWITCHING','https://www.ti.com/lit/ds/symlink/lm5164.pdf')
 elif ref=='U5':
  power=(bias-4.85)*.025+bias*15e-6
  add(p,18,bias,.2,.025,(125-50)/167.8,power,f'25 mA bias budget includes 22.5 mA conservative GaN supply allowance; 5 V tolerance and line/load response must stay within 4.75..5.25 V. Fixture thetaJA gives {50+167.8*power:.1f} C at 50 C ambient, not actual-board temperature. TJ limit 125 C.','CONDITIONAL_THERMAL','https://www.ti.com/lit/ds/symlink/tps7a24.pdf')
 elif ref in ['U6','U8']:
  add(p,80,5.5,.05,.010,.07,.010*1.5,'LED <=10 mA vs 50 mA; <=15 mW vs 70 mW input. Collector <=3.6 mA and <=5.5 V. CTR class A, ageing, low-current OVP behavior and temperature remain loop-validation requirements. Isolation rating of optocoupler does not certify PCB.','CONDITIONAL_CTR','https://www.everlight.com/wp-content/uploads/2026/01/2026-2027_Catalogue_IR.pdf')
 elif ref in ['U7','U9']:
  add(p,36,vo,.1,.010,None,vo**2/(4*1485),'Worst resistively supplied shunt power screen. Ref input <=2.7 V; TL431A initial 1%, reference current and thermal drift included in 14.2 V output screen. I grade ambient -40..85 C; loop stability and fault overshoot unresolved.','CONDITIONAL_LOOP','https://www.ti.com/lit/ds/symlink/tl431.pdf')
 elif ref=='D1':
  add(p,54,50,None,None,None,None,'54 V standoff; clamp 87.1 V at 4.6 A for specified pulse. Only 2.9 V below GaN recommended VIN limit before trace overshoot. 400 W is pulse rating, not continuous power; surge source profile absent. TVS/fuse coordination NOT verified.','HOLD_SURGE','https://www.diodes.com/assets/Datasheets/ds19002.pdf')
 elif ref=='D2':
  add(p,30,3,.2,.003,None,.003*.8,'Clamped sense node, not connected directly to tank voltage: steady diode reverse stress <=OC+Vf, screened at 3 V. R8 limits current. Startup and latch-fault waveform verification required.','CONDITIONAL_WAVEFORM','https://www.onsemi.com/pdf/datasheet/bat54slt1-d.pdf')
 elif ref=='T1':
  mag=json.loads((R/'evidence/magnetics.json').read_text(encoding='utf8'))
  loss=ipr**2*mag['P_Rdc_80C_ohm']+2*isr**2*mag['S_half_Rdc_80C_ohm'] if 'P_Rdc_80C_ohm' in mag else None
  add(p,None,None,None,ipr,None,loss,'4:2:2 PCB winding; 0.191 T flux screen (28.4 V primary, 119 kHz, Ae 78.3 mm2) vs N87 0.390 T at 100 C test point. Saturation headroom does not bound core loss. FHA predicts up to 3.503 Arms primary; prior 3.25 A winding-loss assumption underestimates this. 4 A thermal screen, gap/AL/leakage, AC copper/core loss and hotspot tests required. Functional isolation only.','HOLD_MAGNETICS','https://www.tdk-electronics.tdk.com/download/528882/18bc7459c2ccebbfdc3a7d5cb4cdbda9/pdf-n87.pdf')
 elif ref.startswith('TP'):
  add(p,None,{'TP1':50,'TP2':0,'TP3':vo,'TP4':0,'TP5':v5,'TP6':0}[ref],None,None,None,None,'Bare PCB test feature; no purchased component current rating. Use for probing only; do not use as load connection.','PCB_FEATURE')
 else:raise AssertionError(('unreviewed',ref,kind))
assert len(rows)==len(parts)==82
report={'revision':'A12','scope':'82 schematic references: 75 purchased placements, T1 and six test features; mechanical holes/fiducials are geometry-reviewed separately.',
 'review_envelope':{'input_V':[46,50],'output_target_V':12,'output_review_ceiling_V':vo,'load_A':[0,5],'ambient_assumption_C':50,'passive_local_temperature_screen_C':85,'primary_current_screen_RMS_A':ipr,'efficiency_assumption_for_fuse':.85,'additional_input_bias_allowance_A':.05,'frequency_screen_Hz':[119000,400000]},
 'qualification':'All numerical PASS_SCREEN results are conditional on these unverified stress envelopes. No prototype, surge, short-circuit, EMI, insulation or production qualification. An audit is complete; electrical release is NOT approved.',
 'FHA_full_load_corners':corners,'FHA_max_primary_RMS_A':max(c['primary_RMS_A'] for c in corners),'OC_before':oc_before,'OC_after':oc_after,'OC_min_trip_V':.9,'OC_step_halving_peak_difference_V':convergence,'current_protection_release_hold':'Cr-voltage sensing has a frequency-dependent current threshold; it is not cycle-by-cycle switch current sensing. At high switching frequency a fault can reach magnetic saturation before OC trips. Short-circuit/startup stress bounds and protection coordination remain unresolved; do not energize at rated power based on this audit.',
 'counts_by_status':dict(collections.Counter(x['Status'] for x in rows)),'parts':rows}
(R/'evidence/component-ratings-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
with (R/'sourcing/Component-ratings-audit.csv').open('w',newline='',encoding='utf-8-sig') as f:
 writer=csv.DictWriter(f,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
print(json.dumps({k:report[k] for k in ['FHA_max_primary_RMS_A','OC_before','OC_after','counts_by_status']},indent=2))
