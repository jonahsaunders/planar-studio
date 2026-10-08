"""Charge-balanced boundary/DCM power-stage calculation, not LT8302 control.

Integrates the exponential winding currents and solves peak current for a
specified DC load at fixed 5 V. Ignores core/switching loss, leakage energy,
control dynamics and minimum-current/burst operation. A nominal 380 kHz
frequency ceiling introduces idle time for DCM. The separate
75%-efficiency worksheet supplies enlarged current stresses for component sizing.
"""
import math,json,csv
from pathlib import Path
R=Path(__file__).resolve().parents[1]
m=json.loads((R/'evidence/winding-model.json').read_text())
L=m['magnetizingInductance_H'];n=2;rp=m['analysis']['R1'];rs=m['analysis']['R2'];ron=.2;fmax=380000
def integrate(values,dt):return dt*(sum(values)-(values[0]+values[-1])/2)
def cycle(vin,peak):
    v=vin-.6;vr=n*5.4;r_on=rp+ron;r_off=n*n*rs
    ton=-L/r_on*math.log1p(-peak*r_on/v)
    toff=L/r_off*math.log1p(peak*r_off/vr)
    on=[v/r_on*(-math.expm1(-r_on*(ton*i/1000)/L)) for i in range(1001)]
    off=[(peak+vr/r_off)*math.exp(-r_off*(toff*i/1000)/L)-vr/r_off for i in range(1001)]
    T=max(ton+toff,1/fmax);qo=integrate([n*i for i in off],toff/1000)
    return ton,toff,on,off,qo/T
rows=[];waves=[]
for vin in [18,24,36]:
    target=1+5/220;lo=.001;hi=3.6
    for _ in range(60):
        mid=(lo+hi)/2
        if cycle(vin,mid)[4]>target:hi=mid
        else:lo=mid
    peak=(lo+hi)/2;ton,toff,on,off,current=cycle(vin,peak);T=max(ton+toff,1/380000)
    prms=math.sqrt(integrate([i*i for i in on],ton/1000)/T)
    srms=math.sqrt(integrate([(n*i)**2 for i in off],toff/1000)/T)
    iin=integrate(on,ton/1000)/T
    copper=prms**2*rp+srms**2*rs;fet=prms**2*ron;diodes=.6*iin+.4*current
    residual=vin*iin-5*current-copper-fet-diodes
    assert abs(residual)<1e-5,('energy mismatch',residual)
    assert abs(current-target)<1e-7
    rows.append(dict(Vin_V=vin,Iout_A=1,Ipreload_A=5/220,Ipk_A=peak,frequency_Hz=1/T,duty=ton/T,idle_s=T-ton-toff,
        primary_RMS_A=prms,secondary_RMS_A=srms,input_average_A=iin,copper_DC_W=copper,
        FET_conduction_W=fet,diode_loss_W=diodes,energy_balance_residual_W=residual))
    for phase,seq,duration,offset in [('on',on,ton,0),('off',off,toff,ton)]:
        for i in range(0,1001,5):
            im=seq[i]
            waves.append(dict(Vin_V=vin,time_us=(offset+duration*i/1000)*1e6,phase=phase,
                primary_A=im if phase=='on' else 0,secondary_A=n*im if phase=='off' else 0,
                SW_V=im*ron if phase=='on' else vin-.6+n*(5.4+n*im*rs)))
    if T>ton+toff:
        for t in [ton+toff,T]:waves.append(dict(Vin_V=vin,time_us=t*1e6,phase='idle (ringing omitted)',primary_A=0,secondary_A=0,SW_V=vin-.6))
for name,data in [('boundary-cycle.csv',rows),('idealized-waveforms.csv',waves)]:
    with (R/'evidence'/name).open('w',newline='') as f:
        w=csv.DictWriter(f,data[0].keys());w.writeheader();w.writerows(data)
# Full-load parameter sensitivity, not an assertion of controller timing bounds.
# 350/420 kHz are scenario assumptions around the nominal 380 kHz ceiling.
envelope=[]
mag=json.loads((R/'magnetics.json').read_text())
for L_uH in [mag['Lm_acceptance_uH'][0],m['magnetizingInductance_H']*1e6,mag['Lm_acceptance_uH'][1]]:
  L=L_uH*1e-6
  for temperature in [25,85]:
    scale=(1+.00393*(temperature-20))/(1+.00393*(60-20))
    rp=m['analysis']['R1']*scale;rs=m['analysis']['R2']*scale
    for fmax in [350000,380000,420000]:
      for vin in [18,24,36]:
        target=1+5/220;lo=.001;hi=3.6
        for _ in range(50):
          peak=(lo+hi)/2
          if cycle(vin,peak)[4]>target:hi=peak
          else:lo=peak
        peak=(lo+hi)/2;ton,toff,on,off,current=cycle(vin,peak)
        assert abs(current-target)<1e-7 and peak<3.6
        assert ton>160e-9 and toff>350e-9
        envelope.append({'Vin_V':vin,'Lm_uH':L_uH,'copper_temperature_C':temperature,
                         'frequency_ceiling_assumption_Hz':fmax,'Ipk_A':peak,'ton_s':ton,'toff_s':toff,
                         'Bpeak_T':L*peak/(mag['primary_turns']*mag['minimum_area_mm2']*1e-6)})
result={'scope':__doc__,'operating_points':rows,'full_load_sensitivity':envelope,
        'sensitivity_scope':'54 analytical scenarios. Frequency bounds are chosen assumptions, not guaranteed controller corners; fixed 5 V, diode/switch resistance assumptions and all original exclusions apply.',
        'sensitivity_max_Ipk_A':max(x['Ipk_A'] for x in envelope),'sensitivity_max_Bpeak_T':max(x['Bpeak_T'] for x in envelope)}
(R/'evidence/cycle-model.json').write_text(json.dumps(result,indent=2))
print(json.dumps(rows,indent=2))
