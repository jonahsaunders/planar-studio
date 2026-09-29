"""Boundary-mode stress sizing; not a closed-loop controller model.

75% efficiency is an input assumption. These are deliberately enlarged current
stresses, not a charge-balanced waveform simulation or an efficiency prediction.
"""
import csv, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'evidence/winding-model.json').read_text())
lp=m['magnetizingInductance_H']; n=2; ae=128e-6
rows=[]
for vin in [18,24,36]:
  for output in [.1,.5,1.0]:
    # Full-load boundary-mode approximation; light load may use DCM/burst.
    v=vin-1.0; load=output+5/220; vf=.4; eta=.75
    duty=n*(5+vf)/(v+n*(5+vf))
    ipk=2*5*load/(eta*v*duty)
    freq=v*duty/(lp*ipk)
    prms=ipk*math.sqrt(duty/3); srms=n*ipk*math.sqrt((1-duty)/3)
    freq_lmin=freq/.85
    cin_rms=math.sqrt(prms**2-(ipk*duty/2)**2)
    # Conservative output-cap RMS bound: omit the average-current subtraction.
    cout_rms_bound=srms
    esr_step=n*ipk*.011
    # Charge depletion using C3+C8 at -20%: 288 uF. C4 is ignored.
    # The enlarged-current boundary worksheet may extrapolate past controller frequency;
    # retain this conservative stress estimate, separate from the DCM cycle model.
    out_charge_ripple=load*duty/(freq*288e-6)
    rows.append(dict(Vin=vin,Iout=output,mode='boundary estimate' if output==1 else 'boundary extrapolation; DCM/burst not represented',
      duty=duty,Ipk=ipk,Irms_primary=prms,Irms_secondary=srms,frequency_Hz=freq,
      ton_s=lp*ipk/v,toff_s=lp*ipk/(n*(5+vf)),Bpeak_T=lp*ipk/(4*ae),
      copper_DC_W=prms**2*m['analysis']['R1']+srms**2*m['analysis']['R2'],
      input_cap_total_rms_A=cin_rms,output_cap_rms_upper_A=cout_rms_bound,
      input_cap_effective_total_F=4e-6,
      input_cap_ripple_bound_V=ipk*duty/(freq*4e-6),
      output_ESR_step_V=esr_step,output_on_interval_droop_V=out_charge_ripple,
      output_ripple_sizing_V=esr_step+out_charge_ripple,
      switch_conduction_at_assumed_Ron_0p2ohm_W=prms**2*.2,
      output_diode_at_assumed_0p4V_W=load*.4,
      input_diode_at_assumed_1p0V_W=(5*load/(eta*v))*1.0,
      snubber_CV2f_upper_W=470e-12*(v+n*(5+vf))**2*freq_lmin,
      estimated_leakage_energy_per_second_W=.5*m['analysis']['leakage']*ipk**2*freq_lmin,
      diode_reverse_V=5+v/n,switch_plateau_V=v+n*(5+vf)))
limits={
  'worst_full_load_primary_peak_A':max(r['Ipk'] for r in rows if r['Iout']==1),
  'minimum_controller_peak_limit_A':3.6,
  'maximum_controller_peak_limit_A':5.4,
  'core_peak_flux_at_5p4A_and_Lplus15pct_T':lp*1.15*5.4/(4*ae),
  'input_diode_drop_sizing_assumption_V':1.0,
  'output_bulk_nominal_F':360e-6,'output_bulk_minimum_F':288e-6,
  'output_parallel_ESR_bound_ohm_at_100kHz':.011,
  'input_damping_reservoir_F':47e-6,'input_damping_resistor_ohm':2.2,
  'uvlo_rising_corner_V_at_connector':1.264*(1+649000*1.01/(61900*.99))+2.7e-6*649000*1.01+1.0,
  'RFB_current_at_rating_based_clamp_A':(19.9+1+.05)/(106000*.999),
  'RFB_absolute_max_injected_current_A':200e-6,
  'maximum_rectifier_reverse_V_with_5pct_output':5.25+36/n,
  'maximum_switch_plateau_V_with_5pct_output_and_0p6V_diode':36+n*(5.25+.6),
  'preload_ohm':220,
  'feedback_ohm':106000,'reference_ohm':10000,
  'nominal_output_at_sample_diode_drop_0p3V':106000/10000/n-.3,
  'uvlo_rising_nominal_V_after_input_diode':1.228*(1+649000/61900)+2.5e-6*649000,
  'uvlo_falling_nominal_V_after_input_diode':1.214*(1+649000/61900),
  'Lm_low_acceptance_H':lp*.85,'Lm_high_acceptance_H':lp*1.15,
  'Lm_min_on_time_requirement_H':160e-9*36/.70,
  'Lm_min_off_time_requirement_H':350e-9*n*(5.25+.6)/.70,
  'minimum_energy_packet_cap_rise_V_at_Ipk_1p04A':lp*1.15*1.04**2/(2*4.75*288e-6),
  'TVS_rating_based_switch_clamp_V_excluding_dynamic_overshoot':36+19.9+1,
  'switch_absolute_max_V':65,'switch_prototype_acceptance_peak_V':60,
  'preload_power_at_5p25V_W':5.25**2/(220*.99),
  'secondary_fault_average_rating_check_A':.6*5.4*n,
  'rectifier_average_current_rating_A':8,
  'minimum_load_required_A_at_low_output':lp*1.15*1.04**2*12700/(2*4.75),
  'minimum_preload_A_at_low_output':4.75/(220*1.01),
  'overcurrent_restart_typical_7p2A_flux_T':lp*1.15*7.2/(4*ae),
  'scope':'Boundary-mode stress sizing only. 75% efficiency is assumed, not measured. Does not prove loop stability, burst ripple, EMC, isolation rating or final output trim.'
}
assert limits['uvlo_rising_corner_V_at_connector']<18
assert limits['RFB_current_at_rating_based_clamp_A']<200e-6
assert limits['worst_full_load_primary_peak_A']<3.6
assert limits['core_peak_flux_at_5p4A_and_Lplus15pct_T']<.15
assert limits['maximum_rectifier_reverse_V_with_5pct_output']<35
assert limits['maximum_switch_plateau_V_with_5pct_output_and_0p6V_diode']<50
assert limits['Lm_low_acceptance_H']>max(limits['Lm_min_on_time_requirement_H'],limits['Lm_min_off_time_requirement_H'])
full=[r for r in rows if r['Iout']==1]
limits['full_load_ripple_sizing_max_V']=max(r['output_ripple_sizing_V'] for r in full)
limits['full_load_snubber_CV2f_upper_W']=max(r['snubber_CV2f_upper_W'] for r in full)
limits['full_load_output_cap_rms_upper_A']=max(r['output_cap_rms_upper_A'] for r in full)
limits['open_issues']=['TVS rating-based clamp is 56.9 V before dynamic overshoot; verify peak below 60 V and tune on hardware.', 'Core loss and AC/fringing winding loss are unknown; 75% efficiency is not a pass result.', 'Burst ripple, control stability, startup, load steps, temperature and EMC require hardware tests.', 'RFB current margin at the rating-based clamp is small: scope SW-VIN below 20.5 V; dynamic/temperature behavior is not qualified.', 'R8/C7 add damping but do not qualify hot-plug: use a controlled input ramp; input surge voltage must remain below 42 V.', 'UVLO corner uses specified threshold/current limits but typical 14 mV hysteresis; verify 18 V startup at temperature.', 'Minimum on/off timing used for L sizing is datasheet typical; current bounds use the specified limits. Verify timing on samples.']
assert limits['minimum_preload_A_at_low_output']>limits['minimum_load_required_A_at_low_output']
assert limits['full_load_output_cap_rms_upper_A']<3.3
assert limits['full_load_snubber_CV2f_upper_W']<.66
assert limits['full_load_ripple_sizing_max_V']<.1
with (ROOT/'evidence/operating-points.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,rows[0].keys());w.writeheader();w.writerows(rows)
(ROOT/'evidence/electrical-sizing.json').write_text(json.dumps(limits,indent=2))
print(json.dumps(limits,indent=2))
