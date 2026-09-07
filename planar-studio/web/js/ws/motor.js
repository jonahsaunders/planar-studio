/* ============================================================================
   PCB MOTOR WORKSPACE — axial-flux stator.

   A stator is a ring of sector coils plus the interconnect that makes them a
   three-phase winding. The coil engine already builds the sector; what this
   workspace adds is the machine on top of it: winding factor, flux linkage,
   torque and back-EMF constants, and the torque–speed line at a bus voltage.

   The airgap flux density is an input, not a magnetostatic solve. That is the
   honest boundary of this tool: everything downstream of B is computed, and B
   itself comes from your magnet grade and gap, or from an FEA run.
   ========================================================================= */

import { buildCoil, analyse, motorAnalysis, motorCurve, sweep } from '../engine/coil.js';
import { buildArtwork, outlineFor, instances } from '../engine/coilgeom.js';
import { bounds } from '../engine/artwork.js';
import { eng, num } from '../ui/controls.js';
import { chooseLayers, colourFor, substrateFields, processFields } from './common.js';
import { defaults as inductorDefaults } from './inductor.js';

export const id = 'motor';
export const title = 'PCB motor';

export function defaults() {
  return {
    ...inductorDefaults(),
    shape: 'wedge',
    arrayEnabled: true,
    dOuter: 60,
    dInner: 26,
    spanDeg: 26,
    turns: 9,
    layers: 4,
    traceW: 0.3,
    traceS: 0.2,
    coilCount: 12,
    phases: 3,
    polePairs: 7,
    bGap: 0.45,
    rpm: 3000,
    vdc: 24,
    current: 1.5,
    freq: 1e3,
    coilSeries: true,
    busEnabled: true,
  };
}

/* --------------------------------------------------------------------------
   Rail
   ----------------------------------------------------------------------- */

export function rail(panel, app) {
  panel.group({
    key: 'stator',
    title: 'Stator ring',
    fields: [
      { key: 'dOuter', type: 'range', label: 'Outer diameter', unit: 'mm', min: 10, max: 300, step: 0.5, hardMin: 4 },
      { key: 'dInner', type: 'range', label: 'Bore diameter', unit: 'mm', min: 2, max: 260, step: 0.5 },
      {
        key: 'coilCount', type: 'range', label: 'Coils', min: 3, max: 48, step: 1,
        hint: 'Coils around the ring. Usually a multiple of the phase count.',
      },
      { key: 'phases', type: 'range', label: 'Phases', min: 1, max: 6, step: 1 },
      {
        key: 'polePairs', type: 'range', label: 'Pole pairs', min: 1, max: 30, step: 1,
        hint: 'Rotor magnet pole pairs. Sets the electrical frequency and the winding factor.',
      },
      {
        key: 'spanDeg', type: 'range', label: 'Coil span', unit: '°', min: 3, max: 120, step: 0.5,
        hint: 'Mechanical span of one coil. 360/coils fills the ring exactly, minus clearance.',
      },
      {
        type: 'row',
        buttons: [
          {
            label: 'Fill the ring',
            hint: 'Set the span so the coils just touch, with one clearance between them.',
            onClick: (p) => {
              const c = p.state;
              const gapDeg = (c.traceS * 2) / (Math.PI * c.dOuter / 360) * 1;
              app.set('spanDeg', Number(Math.max(2, 360 / c.coilCount - gapDeg).toFixed(2)));
            },
          },
          {
            label: 'Max turns',
            hint: 'Set the turn count to the most the sector will hold.',
            onClick: () => app.setMaxTurns(),
          },
        ],
      },
      {
        key: 'coilSeries', type: 'seg', label: 'Coils per phase',
        options: [{ value: true, label: 'Series' }, { value: false, label: 'Parallel' }],
      },
      { key: 'busEnabled', type: 'check', label: 'Draw the phase interconnect', hint: 'Concentric buses in the bore, one ring per phase plus a star point.' },
    ],
  });

  panel.group({
    key: 'winding',
    title: 'Winding',
    fields: [
      { key: 'turns', type: 'range', label: 'Turns per layer', min: 1, max: 60, step: 1 },
      { key: 'layers', type: 'range', label: 'Copper layers', min: 1, max: 16, step: 1 },
      {
        key: 'connection', type: 'seg', label: 'Layer connection',
        options: [{ value: 'series', label: 'Series' }, { value: 'parallel', label: 'Parallel' }],
      },
      { key: 'traceW', type: 'range', label: 'Track width', unit: 'mm', min: 0.075, max: 2, step: 0.005 },
      { key: 'traceS', type: 'range', label: 'Clearance', unit: 'mm', min: 0.075, max: 2, step: 0.005 },
      ...substrateFields(),
    ],
  });

  panel.group({
    key: 'machine',
    title: 'Machine',
    fields: [
      {
        key: 'bGap', type: 'range', label: 'Airgap flux density', unit: 'T', min: 0.05, max: 1.4, step: 0.01,
        hint: 'Peak, at the copper. An input, not a solve — take it from your magnet grade and gap.',
      },
      { key: 'current', type: 'range', label: 'Phase current (peak)', unit: 'A', min: 0.1, max: 120, step: 0.1 },
      { key: 'vdc', type: 'range', label: 'Bus voltage', unit: 'V', min: 3, max: 800, step: 1 },
      { key: 'rpm', type: 'range', label: 'Speed', unit: 'rpm', min: 100, max: 40000, step: 50 },
      { key: 'tempC', type: 'range', label: 'Winding temperature', unit: '°C', min: -40, max: 155, step: 1 },
    ],
  });

  panel.group({ key: 'process', title: 'Process', open: false, fields: processFields() });
}

/* --------------------------------------------------------------------------
   Compute
   ----------------------------------------------------------------------- */

export function compute(cfg, env, opt = {}) {
  const layers = chooseLayers(cfg, env.board);
  const full = { ...cfg, shape: 'wedge', arrayEnabled: true, layerNames: layers };
  const coil = buildCoil(full);
  const art = buildArtwork(full, coil, {
    name: env.name || 'M1',
    net: env.net || 'COIL',
    label: `${env.name || 'M1'}  ${cfg.coilCount}c ${cfg.phases}φ ${cfg.polePairs}pp`,
  });
  art.outline = outlineFor(full, coil, 2.5);

  const res = { coil, art, layers, bounds: bounds(art), instances: instances(full).length };
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
  const m = res.motor, a = res.analysis;
  if (!m) return [];
  return [
    {
      title: 'Winding',
      rows: [
        ['Coils / phases / pole pairs', `${m.coilsTotal} / ${m.phases} / ${m.p}`],
        ['Coils per phase', `${num(m.coilsPerPhase, 2)} in ${cfg.coilSeries ? 'series' : 'parallel'}`],
        ['Turns per coil', `${a.turns.toFixed(2)} × ${a.nL} layers`],
        ['Series turns per phase', num(m.Nseries, 1)],
        ['Winding factor kw', num(m.kw, 4)],
        ['Coil span', `${num(m.alpha, 2)}°`],
        ['Conductor length per coil', `${num(a.lenTotal * 1e3, 0)} mm`],
        ['Copper mass, whole stator', `${num(a.cuMass * 1e3 * m.coilsTotal, 1)} g`],
      ],
    },
    {
      title: 'Magnetics',
      note: 'Sinusoidal PMSM model: Kt = 1.5·p·λ with λ = N·kw·Φ and Φ = (2/π)·B·A_pole.',
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
  const out = [];
  const m = res.motor, a = res.analysis;
  if (!m || !a) return out;

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
    out.push({ level: 'warn', text: `Winding factor is ${m.kw.toFixed(2)}. The coil span and the pole pitch are badly matched — try a span near 180 electrical degrees.` });
  }
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
    text: 'Iron loss, windage and inverter losses are not in the efficiency figure — it is copper only, so treat it as an upper bound.',
  });
  return out;
}

export function charts(cfg, res) {
  if (!res.curve || !res.curve.length) return [];
  const rpm = res.curve.map((p) => p.rpm);
  return [
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
  const m = res.motor;
  return {
    algo: `Sector offset · ${res.instances} coils`,
    summary: m ? `Kt ${num(m.Kt, 4)} N·m/A · Kv ${num(m.Kv, 0)} rpm/V · η ${num(m.eff * 100, 0)}%` : 'solving…',
  };
}

export function layerList(cfg, res) {
  return res.layers.map((n, i) => [n, colourFor(n, i)]);
}
