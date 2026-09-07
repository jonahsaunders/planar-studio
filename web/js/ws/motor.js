/* ============================================================================
   PCB MOTOR WORKSPACE — axial-flux stator.

   A stator is a ring of slot-fitted coils plus an optional star interconnect.
   The coil engine builds each shape; this workspace adds shape and routing
   controls and the approximate machine model: winding factor, flux linkage,
   torque and back-EMF constants, and the torque–speed line at a bus voltage.

   The airgap flux density is an input, not a magnetostatic solve. That is the
   honest boundary of this tool: everything downstream of B is computed, and B
   itself comes from your magnet grade and gap, or from an FEA run.
   ========================================================================= */

import { buildCoil, analyse, motorAnalysis, motorCurve, sweep } from '../engine/coil.js';
import { buildArtwork, outlineFor, instances } from '../engine/coilgeom.js';
import { bounds } from '../engine/artwork.js';
import { eng, num } from '../ui/controls.js';
import { chooseLayers, colourFor } from './common.js';
import { defaults as inductorDefaults } from './inductor.js';
import { familyDefaults, familyOf, familyLayout, familyAnalysis, dualRotorField, MOTOR_FAMILIES } from '../engine/motorfamilies.js';
import { familyRail, extraTiles, extraSpec, extraCharts, motorPreview } from '../ui/motor-families.js';
import { windingPreview } from '../ui/winding-design.js';
export function preview(cfg, res, app) {
  const winding = windingPreview(cfg, res);
  const motion = motorPreview(cfg, res, app);
  if (winding && motion) { winding.append(motion); return winding; }
  return winding || motion;
}

export const id = 'motor';
export const title = 'PCB motor';

export function defaults() {
  return {
    ...inductorDefaults(),
    ...familyDefaults(),
    shape: 'wedge',
    motorGeometry: true,
    arrayEnabled: true,
    dOuter: 60,
    dInner: 26,
    spanDeg: 26,
    turns: 9,
    layers: 2,
    traceW: 0.3,
    traceS: 0.2,
    coilCount: 12,
    phases: 3,
    polePairs: 8,
    bGap: 0.45,
    rpm: 3000,
    vdc: 24,
    current: 1.5,
    freq: 1e3,
    coilSeries: true,
    busEnabled: true,
    terminalAngle: -90,
    terminalBreakout: 'phase-neutral',
    windingMode: 'repeat', windingSchedule: null,
  };
}

/* --------------------------------------------------------------------------
   Rail
   ----------------------------------------------------------------------- */

export function rail(panel, app) { familyRail(panel, app); }
// HTML selects emit strings; keep the step count numeric in saved configs.
export function reconcile(cfg,key,value) {
  if(key==='microsteps')cfg.microsteps=Number(value);
}

/* --------------------------------------------------------------------------
   Compute
   ----------------------------------------------------------------------- */

export function compute(cfg, env, opt = {}) {
  const family=familyOf(cfg);
  if(!MOTOR_FAMILIES.some(f=>f.value===family))throw new Error('Choose a supported motor family.');
  const layers = chooseLayers(cfg, env.board);
  if(['stepper','linear','planar'].includes(family)) {
    const res=familyLayout(cfg,layers,{name:env.name,net:env.net});
    return opt.quick?res:familyAnalysis(res,opt);
  }
  const dual=family==='dual-rotor'?dualRotorField(cfg):null;
  if (!['wedge', 'circle', 'racetrack', 'polygon'].includes(cfg.shape)) throw new Error('Choose a supported motor coil shape.');
  if (!(cfg.dOuter > cfg.dInner && cfg.dInner > 0)) throw new Error('The bore must be positive and smaller than the outer diameter.');
  if (cfg.shape === 'polygon' && (!Number.isInteger(cfg.sides) || cfg.sides < 3 || cfg.sides > 12)) throw new Error('Choose three to twelve polygon sides.');
  if (![cfg.traceW, cfg.traceS, cfg.turns, cfg.spanDeg, cfg.viaDrill, cfg.padDrill].every(v => Number.isFinite(v) && v > 0)
    || !(cfg.viaPad > cfg.viaDrill && cfg.padSize > cfg.padDrill)) throw new Error('Use positive trace, turn and drill dimensions, with copper pads larger than their holes.');
  if (!Number.isInteger(cfg.coilCount) || cfg.coilCount < 3 || !Number.isInteger(cfg.phases) || cfg.phases < 1 || cfg.phases > 6) throw new Error('Use at least three coils and one to six whole phases.');
  const full = { ...cfg, bGap:dual?dual.combined:cfg.bGap, motorGeometry: true, arrayEnabled: true, layerNames: layers };
  const coil = buildCoil(full);
  if (coil.spiral.maxTurns < 1) throw new Error('No complete turn fits. Enlarge the coil slot or reduce track width and clearance.');
  const art = buildArtwork(full, coil, {
    name: env.name || 'M1',
    net: env.net || 'COIL',
    label: `${env.name || 'M1'}  ${cfg.coilCount}c ${cfg.phases}φ ${cfg.polePairs}pp`,
  });
  art.outline = outlineFor(full, coil, 2.5, art);

  const res = { coil, art, layers, bounds: bounds(art), instances: instances(full).length, family, dual, modelCfg:full };
  if (opt.quick) return res;

  const a = analyse(full, coil, { segmentCap: opt.segmentCap || 3000 });
  const m = motorAnalysis(full, coil, a);
  res.analysis = a;
  res.motor = m;
  res.curve = motorCurve(m, 64);
  res.sweep = sweep(full, a, Math.max(10, a.srf / 5000), a.srf * 3, 110);
  return res;
}

export function handles(cfg, res, app) {
  if(['stepper','linear','planar'].includes(res.family))return [];
  const ro = cfg.dOuter / 2, ri = cfg.dInner / 2;
  const half = cfg.spanDeg * Math.PI / 360;
  return [
    {
      id: 'dOuter', x: ro, y: 0, cursor: 'ew-resize', hint: `outer ⌀ ${cfg.dOuter.toFixed(1)} mm`,
      drag: (wx, wy) => app.set('dOuter', Number(Math.max(cfg.dInner + 2, Math.hypot(wx, wy) * 2).toFixed(1))),
    },
    {
      id: 'dInner', x: ri, y: 0, cursor: 'ew-resize', hint: `bore ⌀ ${cfg.dInner.toFixed(1)} mm`,
      drag: (wx, wy) => app.set('dInner', Number(Math.max(1, Math.min(cfg.dOuter - 2, Math.hypot(wx, wy) * 2)).toFixed(1))),
    },
    {
      id: 'span', x: ro * Math.cos(half), y: ro * Math.sin(half), cursor: 'grab', hint: `span ${cfg.spanDeg.toFixed(1)}°`,
      drag: (wx, wy) => {
        const deg = Math.abs(Math.atan2(wy, wx)) * 360 / Math.PI;
        app.set('spanDeg', Number(Math.max(2, Math.min(360 / cfg.coilCount, deg)).toFixed(2)));
      },
    },
  ];
}

/* --------------------------------------------------------------------------
   Readouts
   ----------------------------------------------------------------------- */

export function tiles(cfg, res) {
  const special=extraTiles(cfg,res);if(special)return special;
  const m = res.motor, a = res.analysis;
  if (!m || !a) return [];
  const effTone = m.eff > 0.85 ? 'good' : m.eff > 0.7 ? '' : 'warn';
  return [
    { k: 'Torque constant', v: num(m.Kt, 4), u: 'N·m/A', sub: `kw ${num(m.kw, 3)}` },
    { k: 'Kv', v: num(m.Kv, 1), u: 'rpm/V' },
    { k: 'Torque at I', v: `${num(m.torque * 1000, 1)} mN·m`, sub: `${cfg.current} A peak` },
    { k: 'Motor constant', v: num(m.km, 4), u: 'N·m/√W' },
    { k: 'Copper loss', v: eng(m.Pcu, 'W', 3), sub: `${num(a.rise, 0)} K rise` },
    { k: 'Efficiency', v: `${num(m.eff * 100, 1)} %`, tone: effTone, sub: `at ${cfg.rpm} rpm` },
    { k: 'Phase resistance', v: eng(m.Rphase, 'Ω', 3) },
    { k: 'Phase inductance', v: eng(m.Lphase, 'H', 3), sub: `τ ${eng(m.tauE, 's', 2)}` },
  ];
}

export function spec(cfg, res) {
  const special=extraSpec(cfg,res);if(special)return special;
  cfg=res.modelCfg||cfg;
  const m = res.motor, a = res.analysis;
  if (!m) return [];
  return [
    {
      title: res.dual ? 'Dual-rotor winding' : 'Winding',
      rows: [
        ...(res.dual ? [['Upper / lower field estimate', `${num(res.dual.top,3)} / ${num(res.dual.bottom,3)} T`], ['Combined field at copper midplane', `${num(res.dual.combined,3)} T`], ['Rotor face spacing', `${num(res.dual.discSpacing,2)} mm`], ['Total stack (excluding rotor back plates)', `${num(res.dual.stackHeight,2)} mm`]] : []),
        ['Coil shape', cfg.shape === 'polygon' ? `${cfg.sides}-sided polygon` : cfg.shape],
        ['Terminals', res.art.meta.starRouted ? `${res.art.ports.length} grouped terminals; star (wye), ${cfg.terminalAngle ?? -90}°` : 'Individual coil terminals (star not routed)'],
        ['Coils / phases / pole pairs', `${m.coilsTotal} / ${m.phases} / ${m.p}`],
        ['Coils per phase (mean)', `${num(m.coilsPerPhase, 2)}; ${cfg.windingMode === 'custom' ? 'explicit branches below' : cfg.coilSeries ? 'series' : 'parallel'}`],
        ['Turns per coil', `${a.turns.toFixed(2)} × ${a.nL} layers`],
        ['Series turns per phase', num(m.Nseries, 1)],
        ['Winding factor kw', num(m.kw, 4)],
        ['Distribution / pitch factors', `${num(m.winding?.kd ?? 1, 4)} / ${num(m.kp, 4)}`],
        ...(m.winding ? m.winding.phases.map(p => [`Phase ${String.fromCharCode(65+p.phase)} branches`, p.branches.map(b => b.coils.map(i => `C${i+1}${m.winding.schedule[i].polarity<0?'−':'+'}`).join(' → ')).join(' ∥ ')]) : []),
        ['Coil span', `${num(m.alpha, 2)}°`],
        ['Conductor length per coil', `${num(a.lenTotal * 1e3, 0)} mm`],
        ['Copper mass, whole stator', `${num(a.cuMass * 1e3 * m.coilsTotal, 1)} g`],
      ],
    },
    {
      title: 'Magnetics',
      note: 'Sinusoidal model: Kt = (phases/2)·p·λ with λ = N·kw·Φ. kw includes signed phase distribution; scalar results describe balanced imposed currents and omit torque ripple.',
      rows: [
        ['Airgap flux density (peak)', `${num(cfg.bGap, 3)} T`],
        ['Pole area', `${num(m.Apole * 1e6, 1)} mm²`],
        ['Flux per pole', eng(m.flux, 'Wb', 3)],
        ['Flux linkage per phase', eng(m.lambda, 'Wb·t', 3)],
        ['Kt (per peak amp)', `${num(m.Kt, 5)} N·m/A`],
        ['Ke (mechanical)', `${num(m.KeMech, 5)} V·s/rad`],
        ['Kv', `${num(m.Kv, 2)} rpm/V`],
      ],
    },
    {
      title: 'Operating point',
      rows: [
        ['Speed', `${cfg.rpm} rpm`],
        ['Electrical frequency', `${num(m.fElec, 1)} Hz`],
        ['Back-EMF (peak, line-neutral)', `${num(m.Vbemf, 2)} V`],
        ['Shaft power', eng(m.Pmech, 'W', 3)],
        ['Copper loss', eng(m.Pcu, 'W', 3)],
        ['Efficiency (copper only)', `${num(m.eff * 100, 2)} %`],
        ['Electrical time constant', eng(m.tauE, 's', 3)],
        ['SRF margin over f_elec', `${num(m.srfMargin, 0)}×`],
      ],
    },
    {
      title: `Torque–speed at ${cfg.vdc} V`,
      note: 'Straight-line model: no field weakening, no inverter drop, no iron or windage loss.',
      rows: [
        ['No-load speed', `${num(m.noLoad, 0)} rpm`],
        ['Stall torque', `${num(m.stall * 1000, 1)} mN·m`],
        ['Peak mechanical power', `${eng(m.stall * (2 * Math.PI * m.noLoad / 60) / 4, 'W', 3)}`],
      ],
    },
  ];
}

export function notes(cfg, res) {
  const out = [...(res.art?.notes || [])];
  if(res.familyAnalysis) {
    if(!res.analysis.drc.turnsOK)out.push({level:'warn',text:`Only ${res.analysis.turns} of ${cfg.turns} requested turns fit. Use Max turns or enlarge the coil.`});
    out.push({level:'info',text:res.familyAnalysis.limits});
    if(res.family==='stepper')out.push({level:'info',text:'Microstep spacing is a command resolution, not guaranteed position accuracy. This air-core model predicts no unpowered holding torque.'});
    if(res.family==='planar'&&res.familyAnalysis.peakCurrent>Math.max(Math.abs(cfg.current),Math.abs(cfg.currentY))+1e-8)out.push({level:'warn',text:'Combining X and Y commands increases some coil currents above either individual command. Size each driver for the reported peak coil current.'});
    return out;
  }
  if(res.dual) {
    out.push({level:'info',text:'Dual rotor: isolated-cylinder center fields are combined as spatial harmonics at the copper midplane. This is an estimate, not a solve of neighboring magnets, back iron, leakage, axial attraction or field variation through the PCB. The diagram is a side-view schematic.'});
    if(res.dual.combined<0.01)out.push({level:'warn',text:'The two rotor fields nearly cancel. Change relative alignment or rotor gaps.'});
    const radius=(cfg.dOuter+cfg.dInner)/4;
    if(cfg.magnetDiameter>2*radius*Math.sin(Math.PI/(2*cfg.polePairs))||cfg.magnetDiameter>(cfg.dOuter-cfg.dInner)/2)out.push({level:'warn',text:'The chosen magnets overlap adjacent poles or extend outside the winding annulus. Reduce magnet diameter.'});
  }
  const m = res.motor, a = res.analysis;
  if (!m || !a) return out;
  if (!a.drc.turnsOK) out.push({ level: 'warn', text: `Only ${a.turns.toFixed(0)} of ${cfg.turns} requested turns fit this coil shape. Use Max turns or enlarge the slot.` });
  if (cfg.shape !== 'wedge') out.push({ level: 'info', text: 'Inductance and resistance use the selected coil geometry. Torque and back-EMF retain the approximate annular-sector flux model; use field simulation to compare coil shapes.' });

  const slots = 360 / cfg.coilCount;
  if (cfg.spanDeg > slots) {
    out.push({ level: 'error', text: `A ${cfg.spanDeg}° coil cannot tile ${cfg.coilCount} times around 360°. Overlap starts above ${slots.toFixed(2)}°.` });
  }
  if (cfg.coilCount % cfg.phases !== 0) {
    out.push({ level: 'warn', text: `${cfg.coilCount} coils do not divide evenly into ${cfg.phases} phases, so the phases will be unbalanced.` });
  }
  // The classic axial-flux slot/pole rule: coils and pole pairs should not
  // share a factor that collapses the winding factor.
  const ratio = cfg.coilCount / (2 * cfg.polePairs);
  if (Math.abs(ratio - Math.round(ratio)) < 1e-6 && cfg.phases === 3) {
    out.push({
      level: 'warn',
      text: `${cfg.coilCount} coils against ${2 * cfg.polePairs} poles is an integer-slot combination. `
        + 'Fractional-slot ratios near 3/4 or 3/2 usually give a higher winding factor and less cogging.',
    });
  }
  if (m.kw < 0.7) {
    out.push({ level: 'warn', text: `Winding factor is ${m.kw.toFixed(2)}. Check both the coil span and the phase/polarity assignments.` });
  }
  if (m.winding && !m.winding.balanced) out.push({ level: 'warn', text: 'The phase EMF magnitudes or resistances are unbalanced. Scalar motor results assume imposed balanced sinusoidal phase currents; inspect the winding phasors.' });
  if (m.winding?.parallelMismatch) out.push({ level: 'error', text: 'Parallel branch EMFs differ. Automatic routing is omitted; scalar estimates exclude circulating-current loss. Use series wiring or compatible parallel branches.' });
  if ((m.winding?.kd ?? 1) < 0.95) out.push({ level: 'warn', text: `Phase assignment and polarity give distribution factor ${num(m.winding.kd, 3)}. This cancellation is included in torque and back-EMF estimates. Try Automatic assignments or a suggested pole count.` });
  if (a.rise > 60) {
    out.push({ level: 'error', text: `IPC-2221 puts the rise at ${a.rise.toFixed(0)} K at ${cfg.current} A. A stator has no still air around it, so the real figure is worse.` });
  }
  if (m.srfMargin < 20) {
    out.push({ level: 'warn', text: 'Self-resonance is close to the electrical frequency. The winding will not behave as a simple inductor at speed.' });
  }
  if (cfg.layers % 2 === 1 && cfg.connection === 'series') {
    out.push({ level: 'warn', text: 'An odd layer count leaves each coil ending in its own centre. Use an even count so both terminals come out at the rim.' });
  }
  out.push({
    level: 'info',
    text: 'Torque includes signed coil distribution and pitch factors, using the stronger forward/reverse sequence with balanced sinusoidal currents. Phase values assume identical coils and neglect inter-coil mutual inductance and parallel circulating currents. Efficiency excludes iron, windage and inverter losses.',
  });
  return out;
}

export function charts(cfg, res) {
  const special=extraCharts(cfg,res);if(special)return special;
  const dualChart=res.dual?[{id:'rotor-alignment',title:'Combined field versus rotor alignment',note:'Isolated magnet amplitudes combined as harmonics; excludes neighboring magnets and back iron.',spec:{x:{values:res.dual.curve.map(p=>p.x),label:'Mechanical offset (°)'},y:{label:'T'},series:[{name:'Combined field',values:res.dual.curve.map(p=>p.y)}]}}]:[];
  if (!res.curve || !res.curve.length) return dualChart;
  const rpm = res.curve.map((p) => p.rpm);
  return [
    ...dualChart,
    {
      id: 'torque',
      title: `Torque and power at ${cfg.vdc} V`,
      note: 'Two quantities, two charts — a second y-axis would let the crossing be placed anywhere.',
      spec: {
        x: { values: rpm, label: 'rpm', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)) },
        y: { label: 'mN·m', format: (v) => v.toFixed(0) },
        series: [{ name: 'Torque', values: res.curve.map((p) => p.torque * 1000), unit: 'mN·m' }],
        markers: [{ x: cfg.rpm, label: 'set' }],
      },
    },
    {
      id: 'power',
      title: 'Shaft power',
      spec: {
        x: { values: rpm, label: 'rpm', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)) },
        y: { label: 'W', format: (v) => v.toFixed(0) },
        series: [
          { name: 'Shaft', values: res.curve.map((p) => p.Pmech), unit: 'W' },
          { name: 'Copper loss', values: res.curve.map((p) => p.Pcu), unit: 'W' },
        ],
        markers: [{ x: cfg.rpm, label: 'set' }],
      },
    },
    {
      id: 'eff',
      title: 'Efficiency (copper only)',
      spec: {
        x: { values: rpm, label: 'rpm', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)) },
        y: { label: '%', min: 0, max: 100, format: (v) => v.toFixed(0) },
        series: [{ name: 'η', values: res.curve.map((p) => p.eff * 100), unit: '%' }],
        markers: [{ x: cfg.rpm, label: 'set' }],
      },
    },
  ];
}

export function status(cfg, res) {
  if(['stepper','linear','planar'].includes(res.family)) {
    const m=res.familyAnalysis;
    return {algo:`${MOTOR_FAMILIES.find(f=>f.value===res.family).label} · ${res.instances} coils`,summary:!m?'solving…':m.kind==='stepper'?`Step ${num(m.commandStep,3)}° · holding ${num(m.holding*1000,2)} mN·m`:m.kind==='linear'?`Force ${num(m.force,4)} N`:`Fx ${num(m.fx,4)} N · Fy ${num(m.fy,4)} N`};
  }
  const m = res.motor;
  return {
    algo: `${res.coil.spiral.algorithm.name} · ${res.instances} coils`,
    summary: m ? `Kt ${num(m.Kt, 4)} N·m/A · Kv ${num(m.Kv, 0)} rpm/V · η ${num(m.eff * 100, 0)}%` : 'solving…',
  };
}

export function layerList(cfg, res) {
  return res.layers.map((n, i) => [n, colourFor(n, i)]);
}
