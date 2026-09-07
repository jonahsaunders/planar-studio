/* ============================================================================
   FILTER WORKSPACE

   Six families under one set of controls. What they share is the pipeline:
   a prototype becomes a network, the network becomes copper, and the copper is
   simulated back. The last step is the one that matters — the plotted response
   is computed from the geometry that would be placed, not from the ideal
   components the synthesis asked for, so a 91 nH spiral that came out at 85 nH
   moves the curve rather than being quietly rounded away.

   Both curves are shown. The prototype is what you asked for; the built
   response is what the board does. When they separate, that is the design
   telling you something.
   ========================================================================= */

import {
  RESPONSES, BANDS, EMI_TOPOLOGIES,
  ladder, respond, steppedImpedance, edgeCoupled, hairpin, interdigitalFilter,
  emiFilter, prototype, reviewDesign,
} from '../engine/filter.js';
import { microstrip, microstripWidth } from '../engine/microstrip.js';
import { defaultContext, layoutFilter } from '../engine/filtergeom.js';
import { bounds } from '../engine/artwork.js';
import { eng, num } from '../ui/controls.js';
import { chooseLayers, colourFor, fmtHz } from './common.js';

export const id = 'filter';
export const title = 'Filter';

export const FAMILIES = {
  lumped: {
    name: 'Lumped LC',
    note: 'Spiral inductors and planar capacitors in a ladder. Works from DC to a few hundred MHz, where a distributed filter would be metres long.',
    bands: ['lowpass', 'highpass', 'bandpass', 'bandstop'],
  },
  stepped: {
    name: 'Stepped impedance',
    note: 'Alternating wide and narrow line sections. The simplest microstrip low-pass there is, and the most forgiving of etch tolerance.',
    bands: ['lowpass'],
  },
  edgeCoupled: {
    name: 'Edge-coupled',
    note: 'Parallel half-wave resonators. The default microstrip band-pass — long, but easy to build and easy to tune.',
    bands: ['bandpass'],
  },
  hairpin: {
    name: 'Hairpin',
    note: 'The same synthesis with each resonator folded into a U. Roughly a third of the length of edge-coupled.',
    bands: ['bandpass'],
  },
  interdigital: {
    name: 'Interdigital',
    note: 'Quarter-wave resonators grounded at alternating ends. Compact, and no spurious passband at 2·f₀ — at the cost of a via under every resonator.',
    bands: ['bandpass'],
  },
  emi: {
    name: 'EMI / power',
    note: 'Pi, T and common-mode networks solved backwards from an attenuation target against real source and load impedances.',
    bands: ['lowpass'],
  },
};

export function defaults() {
  return {
    family: 'lumped',
    band: 'lowpass',
    response: 'chebyshev',
    order: 5,
    ripple: 0.1,
    z0: 50,
    fc: 100e6,
    f1: 2.30e9,
    f2: 2.50e9,
    seriesFirst: true,

    // Substrate
    subH: 1.6, subEr: 4.4, subT: 0.035, tanD: 0.02,
    minGap: 0.15, minTrace: 0.15,

    // Distributed
    zHigh: 100, zLow: 25, zRes: 60,

    // Lumped realisation
    capStyle: 'interdigital',
    fingerW: 0.2, fingerG: 0.2, capOverlap: 3,
    coilShape: 'racetrack', coilLayers: 2, coilDiameter: 10,

    // EMI
    emiTopology: 'pi', zSource: 50, zLoad: 50, fTarget: 30e6, attnDb: 40,
    lcm: 10e-6, coupling: 0.95, yCap: 2.2e-9,

    // Process
    traceW: 0.3, clearance: 0.2,
    viaDrill: 0.3, viaPad: 0.6, padSize: 1.4, padDrill: 0.7,
    feedLength: 3,
    boardT: 1.6, copperOz: 1,

    // Simulation
    qL: 60, qC: 300, points: 601, spanDecades: 1.6,
    tolerance: 0.004,
  };
}

/* --------------------------------------------------------------------------
   Rail
   ----------------------------------------------------------------------- */

const isBandpass = (c) => ['bandpass', 'bandstop'].includes(c.band) || ['edgeCoupled', 'hairpin', 'interdigital'].includes(c.family);
const isDistributed = (c) => ['stepped', 'edgeCoupled', 'hairpin', 'interdigital'].includes(c.family);

export function rail(panel, app) {
  panel.group({
    key: 'topology',
    title: 'Topology',
    fields: [
      {
        key: 'family', type: 'select', label: 'Family', optionHint: true,
        options: Object.entries(FAMILIES).map(([value, f]) => ({ value, label: f.name, hint: f.note })),
      },
      {
        key: 'band', type: 'seg', label: 'Band',
        options: Object.entries(BANDS).map(([value, label]) => ({ value, label })),
        when: (c) => c.family === 'lumped',
      },
      {
        key: 'emiTopology', type: 'select', label: 'Network', optionHint: true,
        options: Object.entries(EMI_TOPOLOGIES).map(([value, t]) => ({ value, label: t.name, hint: t.note })),
        when: (c) => c.family === 'emi',
      },
      {
        key: 'response', type: 'select', label: 'Response', optionHint: true,
        options: Object.entries(RESPONSES).map(([value, r]) => ({ value, label: r.name, hint: r.note })),
        when: (c) => c.family !== 'emi' || c.emiTopology !== 'cm',
      },
      {
        key: 'order', type: 'range', label: 'Order', min: 1, max: 10, step: 1,
        when: (c) => c.family !== 'emi',
        hint: 'Each pole adds about 20 dB per decade of roll-off, and one more thing to build.',
      },
      {
        key: 'ripple', type: 'range', label: 'Passband ripple', unit: 'dB',
        min: 0.01, max: 3, step: 0.01, decimals: 2,
        when: (c) => c.response === 'chebyshev' && (c.family !== 'emi' || c.emiTopology !== 'cm'),
        hint: 'More ripple buys a steeper skirt. 0.1 dB gives 16 dB return loss; 0.5 dB gives 9.6 dB.',
      },
      {
        key: 'seriesFirst', type: 'seg', label: 'First element',
        options: [{ value: true, label: 'Series' }, { value: false, label: 'Shunt' }],
        when: (c) => c.family === 'lumped' || c.family === 'stepped',
        hint: 'Which arm g₁ lands in. Series-first usually gives fewer inductors on a low-pass.',
      },
    ],
  });

  panel.group({
    key: 'freq',
    title: 'Frequencies',
    fields: [
      {
        key: 'fc', type: 'range', label: 'Cut-off', unit: 'Hz', si: true,
        min: 1e5, max: 1e10, step: 1e5, format: fmtHz, hardMin: 1e3,
        when: (c) => !isBandpass(c) && c.family !== 'emi',
      },
      {
        key: 'f1', type: 'range', label: 'Lower edge', unit: 'Hz', si: true,
        min: 1e6, max: 2e10, step: 1e6, format: fmtHz, hardMin: 1e4,
        when: (c) => isBandpass(c) && c.family !== 'emi',
      },
      {
        key: 'f2', type: 'range', label: 'Upper edge', unit: 'Hz', si: true,
        min: 1e6, max: 2e10, step: 1e6, format: fmtHz, hardMin: 1e4,
        when: (c) => isBandpass(c) && c.family !== 'emi',
      },
      {
        key: 'fTarget', type: 'range', label: 'Attenuate at', unit: 'Hz', si: true,
        min: 1e4, max: 1e9, step: 1e4, format: fmtHz,
        when: (c) => c.family === 'emi' && c.emiTopology !== 'cm',
      },
      {
        key: 'attnDb', type: 'range', label: 'Attenuation wanted', unit: 'dB', min: 10, max: 100, step: 1,
        when: (c) => c.family === 'emi' && c.emiTopology !== 'cm',
        hint: 'The corner is solved from the simulated response, not from a per-decade rule of thumb.',
      },
      {
        key: 'z0', type: 'range', label: 'System impedance', unit: 'Ω', min: 10, max: 300, step: 1,
        when: (c) => c.family !== 'emi',
      },
      { key: 'zSource', type: 'range', label: 'Source impedance', unit: 'Ω', min: 0.1, max: 1000, step: 0.1, when: (c) => c.family === 'emi' && c.emiTopology !== 'cm' },
      { key: 'zLoad', type: 'range', label: 'Load impedance', unit: 'Ω', min: 0.1, max: 1000, step: 0.1, when: (c) => c.family === 'emi' && c.emiTopology !== 'cm' },
      { key: 'lcm', type: 'range', label: 'Winding inductance', unit: 'H', si: true, min: 1e-6, max: 1e-3, step: 1e-6, format: (v) => eng(v, '', 3), when: (c) => c.family === 'emi' && c.emiTopology === 'cm' },
      { key: 'coupling', type: 'range', label: 'Coupling k', min: 0.5, max: 0.995, step: 0.005, decimals: 3, when: (c) => c.family === 'emi' && c.emiTopology === 'cm' },
      { key: 'yCap', type: 'range', label: 'Y capacitance', unit: 'F', si: true, min: 0, max: 1e-7, step: 1e-10, format: (v) => eng(v, '', 3), when: (c) => c.family === 'emi' && c.emiTopology === 'cm' },
    ],
  });

  panel.group({
    key: 'substrate',
    title: 'Substrate',
    fields: [
      {
        key: 'subH', type: 'range', label: 'Height to ground', unit: 'mm',
        min: 0.05, max: 3.2, step: 0.01, hardMin: 0.02,
        hint: 'Dielectric between the signal layer and its reference plane. Read from the board stack-up when there is one.',
      },
      { key: 'subEr', type: 'range', label: 'Dielectric εr', min: 2.1, max: 10.5, step: 0.05 },
      { key: 'tanD', type: 'range', label: 'Loss tangent', min: 0.0002, max: 0.03, step: 0.0002, decimals: 4 },
      { key: 'subT', type: 'range', label: 'Copper thickness', unit: 'mm', min: 0.009, max: 0.14, step: 0.001, decimals: 3 },
      { key: 'minGap', type: 'range', label: 'Minimum gap', unit: 'mm', min: 0.05, max: 1, step: 0.01 },
      { key: 'minTrace', type: 'range', label: 'Minimum trace', unit: 'mm', min: 0.05, max: 1, step: 0.01 },
    ],
  });

  panel.group({
    key: 'realisation',
    title: 'Realisation',
    fields: [
      { key: 'zHigh', type: 'range', label: 'High impedance', unit: 'Ω', min: 60, max: 160, step: 1, when: (c) => c.family === 'stepped' },
      { key: 'zLow', type: 'range', label: 'Low impedance', unit: 'Ω', min: 8, max: 60, step: 1, when: (c) => c.family === 'stepped' },
      { key: 'zRes', type: 'range', label: 'Resonator impedance', unit: 'Ω', min: 25, max: 110, step: 1, when: (c) => c.family === 'interdigital' },
      {
        key: 'capStyle', type: 'seg', label: 'Capacitors',
        options: [
          { value: 'interdigital', label: 'Interdigital', hint: 'Coplanar fingers on one layer. Single-layer, easy to trim, limited to a few pF.' },
          { value: 'plate', label: 'Plate', hint: 'Overlapping copper on two layers. Far denser — nanofarads in millimetres — but the stack-up sets the value.' },
        ],
        optionHint: true,
        when: (c) => c.family === 'lumped' || (c.family === 'emi' && c.emiTopology !== 'cm'),
      },
      { key: 'fingerW', type: 'range', label: 'Finger width', unit: 'mm', min: 0.08, max: 1, step: 0.01, when: (c) => c.capStyle === 'interdigital' && c.family !== 'emi' || (c.family === 'emi' && c.emiTopology !== 'cm' && c.capStyle === 'interdigital') },
      { key: 'fingerG', type: 'range', label: 'Finger gap', unit: 'mm', min: 0.08, max: 1, step: 0.01, when: (c) => c.capStyle === 'interdigital' },
      { key: 'capOverlap', type: 'range', label: 'Finger overlap', unit: 'mm', min: 0.5, max: 20, step: 0.1, when: (c) => c.capStyle === 'interdigital' },
      {
        key: 'coilDiameter', type: 'range', label: 'Inductor budget', unit: 'mm', min: 2, max: 40, step: 0.5,
        when: (c) => c.family === 'lumped' || c.family === 'emi',
        hint: 'Largest spiral the layout may use. Turns are chosen whole and the diameter is trimmed to land the value.',
      },
      { key: 'coilLayers', type: 'range', label: 'Inductor layers', min: 1, max: 8, step: 1, when: (c) => c.family === 'lumped' || c.family === 'emi' },
      { key: 'traceW', type: 'range', label: 'Routing width', unit: 'mm', min: 0.1, max: 2, step: 0.01 },
      { key: 'clearance', type: 'range', label: 'Clearance', unit: 'mm', min: 0.08, max: 2, step: 0.01 },
      { key: 'feedLength', type: 'range', label: 'Feed length', unit: 'mm', min: 0, max: 20, step: 0.5 },
    ],
  });

  panel.group({
    key: 'sim',
    title: 'Simulation',
    open: false,
    fields: [
      {
        key: 'qL', type: 'range', label: 'Inductor Q', min: 5, max: 400, step: 1,
        hint: 'Applied to the built response. The spiral solver reports the real figure; this is the value used when it cannot.',
      },
      { key: 'qC', type: 'range', label: 'Capacitor Q', min: 20, max: 2000, step: 10 },
      { key: 'spanDecades', type: 'range', label: 'Sweep span', unit: 'dec', min: 0.4, max: 3.5, step: 0.1, decimals: 1 },
      { key: 'points', type: 'range', label: 'Sweep points', min: 101, max: 2001, step: 50 },
      { key: 'tolerance', type: 'range', label: 'Export tolerance', unit: 'mm', min: 0, max: 0.05, step: 0.001, decimals: 3 },
    ],
  });
}

/* --------------------------------------------------------------------------
   Compute
   ----------------------------------------------------------------------- */

function substrateOf(cfg) {
  return {
    h: cfg.subH, er: cfg.subEr, t: cfg.subT, tanD: cfg.tanD,
    minGap: cfg.minGap, minTrace: cfg.minTrace,
  };
}

function synth(cfg) {
  const sub = substrateOf(cfg);
  const base = {
    response: cfg.response, order: cfg.order, ripple: cfg.ripple,
    z0: cfg.z0, seriesFirst: cfg.seriesFirst,
    fc: cfg.fc, f1: cfg.f1, f2: cfg.f2,
  };
  switch (cfg.family) {
    case 'stepped': return steppedImpedance({ ...base, zHigh: cfg.zHigh, zLow: cfg.zLow }, sub);
    case 'edgeCoupled': return edgeCoupled(base, sub);
    case 'hairpin': return hairpin(base, sub);
    case 'interdigital': return interdigitalFilter({ ...base, zRes: cfg.zRes }, sub);
    case 'emi': return emiFilter({
      topology: cfg.emiTopology, zSource: cfg.zSource, zLoad: cfg.zLoad,
      fTarget: cfg.fTarget, attnDb: cfg.attnDb, response: cfg.response, ripple: cfg.ripple,
      lcm: cfg.lcm, coupling: cfg.coupling, yCap: cfg.yCap,
    });
    default: return ladder({ ...base, band: cfg.band });
  }
}

function sweepRange(cfg, design) {
  /* A band-pass wants a narrow window and a low-pass wants a wide one.

     Sweeping a 2.4 GHz coupled-line filter over four decades puts the spurious
     passband at 2*f0, its harmonics, and the aliasing of a periodic response
     sampled on a log grid all on the same plot, and the passband you designed
     becomes one spike among many. Two thirds of a decade either side shows the
     skirts and the first spur and nothing else. */
  const dec = isBandpass(cfg) && cfg.family !== 'emi'
    ? Math.min(cfg.spanDecades, 0.7)
    : cfg.spanDecades;
  if (design.f0) return [design.f0 / Math.pow(10, dec), design.f0 * Math.pow(10, dec)];
  if (design.fbw && design.spec) {
    const f0 = Math.sqrt(cfg.f1 * cfg.f2);
    return [f0 / Math.pow(10, dec), f0 * Math.pow(10, dec)];
  }
  if (cfg.family === 'emi') {
    const centre = design.fc || cfg.fTarget;
    return [centre / Math.pow(10, dec), Math.max(cfg.fTarget * 4, centre * Math.pow(10, dec))];
  }
  if (['bandpass', 'bandstop'].includes(cfg.band)) {
    const f0 = Math.sqrt(cfg.f1 * cfg.f2);
    return [f0 / Math.pow(10, dec), f0 * Math.pow(10, dec)];
  }
  return [cfg.fc / Math.pow(10, dec), cfg.fc * Math.pow(10, dec)];
}

/* Substitute what the copper actually realises back into the network. */
function realisedNetwork(design, art) {
  const placed = (art.meta && art.meta.placed) || [];
  if (!placed.length) return null;
  const elements = design.elements.map((el, i) => {
    const p = placed[i];
    if (!p || !p.realised) return el;
    const out = { ...el };
    if (p.realised.L != null) out.L = p.realised.L;
    if (p.realised.C != null) out.C = p.realised.C;
    if (p.realised.Cpar != null) out.C = p.realised.Cpar;
    // The spiral's own Q, as measured by the field solver at its design
    // frequency, rather than the slider's assumption.
    if (p.realised.qL > 0) out.qL = p.realised.qL;
    return out;
  });
  return { ...design, elements };
}

export function compute(cfg, env, opt = {}) {
  const layers = chooseLayers({ layers: Math.max(2, cfg.coilLayers) }, env.board);
  const design = synth(cfg);
  const ctx = defaultContext({
    ...substrateOf(cfg),
    layers,
    signalLayer: layers[0],
    groundLayer: layers[layers.length - 1],
    net: env.net || 'RF',
    gndNet: 'GND',
    traceW: cfg.traceW,
    clearance: cfg.clearance,
    minTrace: cfg.minTrace,
    viaDrill: cfg.viaDrill, viaPad: cfg.viaPad,
    padSize: cfg.padSize, padDrill: cfg.padDrill,
    feedLength: cfg.feedLength,
    capStyle: cfg.capStyle,
    fingerW: cfg.fingerW, fingerG: cfg.fingerG, capOverlap: cfg.capOverlap,
    coilShape: cfg.coilShape, coilLayers: cfg.coilLayers, coilDiameter: cfg.coilDiameter,
    boardT: cfg.boardT, copperOz: cfg.copperOz,
    designF: design.f0 || cfg.fc,
  });

  const art = layoutFilter(design, ctx);
  const res = { design, art, ctx, layers, bounds: bounds(art) };
  if (opt.quick) return res;

  const [f0, f1] = sweepRange(cfg, design);
  const points = Math.round(cfg.points);
  /* The slider figures are only a fallback. A distributed resonator carries
     its own unloaded Q, computed from the line's loss; a realised spiral
     carries the Q the field solver measured for it. Both override these. */
  const common = { f0, f1, points, qL: cfg.qL, qC: cfg.qC };

  const built = realisedNetwork(design, art) || design;
  res.response = respond(built, { ...common, z0: design.Z0, zLoad: design.zLoad });
  res.ideal = respond(design, { ...common, z0: design.Z0, zLoad: design.zLoad, qL: 0, qC: 0 });

  // For a distributed filter, the useful comparison is the lumped prototype
  // the synthesis came from -- it is what the geometry is trying to be.
  if (isDistributed(cfg)) {
    const proto = ['bandpass'].includes(cfg.band) || isBandpass(cfg)
      ? ladder({ response: cfg.response, order: cfg.order, ripple: cfg.ripple, band: 'bandpass', z0: cfg.z0, f1: cfg.f1, f2: cfg.f2 })
      : ladder({ response: cfg.response, order: cfg.order, ripple: cfg.ripple, band: 'lowpass', z0: cfg.z0, fc: cfg.fc, seriesFirst: cfg.seriesFirst });
    res.prototype = respond(proto, { ...common, qL: 0, qC: 0 });
  }

  res.review = reviewDesign(design, substrateOf(cfg), { minTrace: cfg.minTrace });
  return res;
}

export function handles() { return []; }

/* --------------------------------------------------------------------------
   Reconciliation

   Frequency is not a free parameter across families. A lumped ladder is a
   sensible thing at 100 MHz and an absurd one at 2.4 GHz; a hairpin is the
   reverse. Rather than let the panel sit in a state that produces a metre of
   copper and a nonsense response, moving the family moves the frequency with
   it -- but only when the current value is outside the range that family can
   sensibly build, so a deliberate choice is never overwritten.
   ----------------------------------------------------------------------- */

const FAMILY_RANGE = {
  lumped:       { lo: 1e5, hi: 5e8, fc: 100e6, f1: 90e6, f2: 110e6 },
  stepped:      { lo: 3e8, hi: 2e10, fc: 2e9 },
  edgeCoupled:  { lo: 5e8, hi: 2e10, f1: 2.30e9, f2: 2.50e9 },
  hairpin:      { lo: 5e8, hi: 2e10, f1: 2.30e9, f2: 2.50e9 },
  interdigital: { lo: 5e8, hi: 2e10, f1: 2.30e9, f2: 2.60e9 },
  emi:          { lo: 1e4, hi: 1e9 },
};

export function reconcile(cfg, key) {
  if (key === 'family') {
    const allowed = FAMILIES[cfg.family].bands;
    if (!allowed.includes(cfg.band)) cfg.band = allowed[0];
    const r = FAMILY_RANGE[cfg.family];
    if (!r) return;
    if (r.fc && (cfg.fc < r.lo || cfg.fc > r.hi)) cfg.fc = r.fc;
    if (r.f1 && (cfg.f1 < r.lo || cfg.f1 > r.hi)) { cfg.f1 = r.f1; cfg.f2 = r.f2; }
    // A distributed band-pass with no meaningful band set is worse than a
    // default one, so seed it the first time the family is chosen.
    if (r.f1 && cfg.f2 <= cfg.f1) { cfg.f1 = r.f1; cfg.f2 = r.f2; }
    return;
  }
  if (key === 'band' && cfg.family === 'lumped') {
    const r = FAMILY_RANGE.lumped;
    if ((cfg.band === 'bandpass' || cfg.band === 'bandstop') && (cfg.f1 > r.hi || cfg.f2 > r.hi)) {
      cfg.f1 = r.f1; cfg.f2 = r.f2;
    }
    return;
  }
  if (key === 'f1' && cfg.f2 <= cfg.f1) cfg.f2 = cfg.f1 * 1.1;
  if (key === 'f2' && cfg.f2 <= cfg.f1) cfg.f1 = cfg.f2 / 1.1;
}

/* --------------------------------------------------------------------------
   Readouts
   ----------------------------------------------------------------------- */

export function tiles(cfg, res) {
  const m = res.response && res.response.metrics;
  if (!m) return [];
  const out = [];
  const bp = isBandpass(cfg);

  out.push({ k: 'Insertion loss', v: num(m.insertionLoss, 2), u: 'dB', tone: m.insertionLoss > 3 ? 'warn' : 'good' });
  out.push({ k: 'Return loss', v: num(m.worstReturnLoss, 1), u: 'dB', tone: m.worstReturnLoss < 10 ? 'warn' : 'good', sub: 'worst in band' });

  if (bp && m.centreF) {
    out.push({ k: 'Centre', v: eng(m.centreF, 'Hz', 4) });
    out.push({ k: '−3 dB width', v: m.bw3 ? eng(m.bw3, 'Hz', 3) : '—', sub: m.bw3 && m.centreF ? `${(100 * m.bw3 / m.centreF).toFixed(1)} % FBW` : '' });
  } else {
    const edge = m.f3 && m.f3.length ? m.f3[m.f3.length - 1] : null;
    out.push({ k: '−3 dB corner', v: edge ? eng(edge, 'Hz', 4) : '—' });
    out.push({ k: '−20 dB', v: m.f20 && m.f20.length ? eng(m.f20[m.f20.length - 1], 'Hz', 3) : '—' });
  }

  out.push({ k: 'Passband ripple', v: num(m.rippleDb, 3), u: 'dB', sub: `target ${num(m.designRipple, 2)} dB` });
  out.push({ k: 'Shape factor', v: m.shape ? num(m.shape, 2) : '—', sub: '20 dB ÷ 3 dB' });

  const b = res.bounds;
  out.push({ k: 'Footprint', v: `${num(b.w, 1)} × ${num(b.h, 1)}`, u: 'mm', wide: true });
  return out;
}

export function spec(cfg, res) {
  const d = res.design;
  const m = res.response && res.response.metrics;
  const sections = [];

  if (d.g) {
    sections.push({
      title: 'Prototype',
      note: `${RESPONSES[cfg.response] ? RESPONSES[cfg.response].name : cfg.response}, order ${cfg.order}. Normalised g-values, g₀ = 1.`,
      rows: d.g.map((g, i) => [`g${i}`, num(g, 5)]),
    });
  }

  if (cfg.family === 'lumped' || cfg.family === 'emi') {
    const placed = (res.art.meta && res.art.meta.placed) || [];
    const rows = [];
    d.elements.forEach((el, i) => {
      const p = placed[i];
      const label = `${el.kind === 'series' ? 'Series' : 'Shunt'} ${el.role || el.type} ${i + 1}`;
      if (el.L != null) {
        const got = p && p.realised && p.realised.L;
        rows.push([`${label} — L`, got ? `${eng(got, 'H', 4)}  (target ${eng(el.L, 'H', 3)})` : eng(el.L, 'H', 4)]);
      }
      if (el.C != null) {
        const got = p && p.realised && (p.realised.C != null ? p.realised.C : p.realised.Cpar);
        rows.push([`${label} — C`, got ? `${eng(got, 'F', 4)}  (target ${eng(el.C, 'F', 3)})` : eng(el.C, 'F', 4)]);
      }
    });
    sections.push({ title: 'Components', note: 'Realised value first, synthesis target in brackets.', rows });
  }

  if (cfg.family === 'stepped') {
    sections.push({
      title: 'Line sections',
      rows: d.sections.map((s, i) => [
        `${i + 1}. ${s.role === 'L' ? 'high-Z' : 'low-Z'}`,
        `${num(s.w, 3)} mm × ${num(s.length, 2)} mm  (${num(s.Z, 0)} Ω, ${num(s.deg, 0)}°)`,
      ]),
    });
  }

  if (cfg.family === 'edgeCoupled' || cfg.family === 'hairpin') {
    sections.push({
      title: 'Coupled sections',
      note: 'J is the admittance inverter value the section has to realise.',
      rows: d.sections.map((s, i) => [
        `Section ${i + 1}`,
        `w ${num(s.w, 3)} · s ${num(s.s, 3)} · ℓ ${num(s.length, 2)} mm`,
      ]),
    });
    sections.push({
      title: 'Modal impedances',
      rows: d.sections.map((s, i) => [`Section ${i + 1}`, `Z0e ${num(s.Z0e, 1)} / Z0o ${num(s.Z0o, 1)} Ω`]),
    });
  }

  if (cfg.family === 'interdigital') {
    sections.push({
      title: 'Resonators',
      rows: [
        ['Line impedance', `${num(cfg.zRes, 0)} Ω`],
        ['Line width', `${num(d.wRes, 3)} mm`],
        ['Quarter wave', `${num(d.quarter, 2)} mm`],
        ['External Q (in / out)', `${num(d.Qe1, 1)} / ${num(d.Qen, 1)}`],
        ['Tap height', `${num(d.tap.length, 2)} mm`],
        ...d.gaps.map((g, i) => [`Gap ${i + 1}–${i + 2}`, `${num(g.s, 3)} mm  (k = ${num(g.k, 4)})`]),
      ],
    });
  }

  if (cfg.family === 'emi' && cfg.emiTopology === 'cm') {
    sections.push({
      title: 'Common-mode choke',
      note: d.note,
      rows: [
        ['Per-winding inductance', eng(d.Lwinding, 'H', 3)],
        ['Common-mode inductance', eng(d.Lcm, 'H', 3)],
        ['Differential-mode (leakage)', eng(d.Ldm, 'H', 3)],
        ['Coupling k', num(d.coupling, 3)],
        d.yCap ? ['Y capacitance', eng(d.yCap, 'F', 3)] : null,
        d.fc ? ['Corner with Y caps', eng(d.fc, 'Hz', 3)] : null,
      ].filter(Boolean),
    });
  } else if (cfg.family === 'emi') {
    sections.push({
      title: 'Attenuation target',
      rows: [
        ['Wanted', `${num(cfg.attnDb, 0)} dB at ${eng(cfg.fTarget, 'Hz', 3)}`],
        ['Achieved', `${num(d.achieved, 1)} dB`],
        ['Corner frequency', eng(d.fc, 'Hz', 4)],
        ['Reference impedance', `${num(d.Zref, 1)} Ω`],
      ],
    });
  }

  // Substrate facts, for whichever family is showing.
  const ms = microstrip(microstripWidth(cfg.z0, cfg.subH, cfg.subEr, { t: cfg.subT, f: res.design.f0 || cfg.fc }),
    cfg.subH, cfg.subEr, { t: cfg.subT, f: res.design.f0 || cfg.fc, tanD: cfg.tanD });
  sections.push({
    title: 'Substrate',
    rows: [
      ['Height to ground', `${num(cfg.subH, 3)} mm`],
      ['εr / tan δ', `${num(cfg.subEr, 2)} / ${num(cfg.tanD, 4)}`],
      [`${cfg.z0} Ω line width`, `${num(ms.w, 3)} mm`],
      ['Effective εr', num(ms.epsEff, 3)],
      ['Guided wavelength', isFinite(ms.lambda) ? `${num(ms.lambda, 2)} mm` : '—'],
      ['Line loss', `${num((ms.alpha || 0) * 8.686, 3)} dB/m`],
    ],
  });

  if (m) {
    sections.push({
      title: 'Measured from the response',
      rows: [
        ['Insertion loss', `${num(m.insertionLoss, 3)} dB`],
        ['Ripple in band', `${num(m.rippleDb, 3)} dB`],
        ['Worst return loss', `${num(m.worstReturnLoss, 2)} dB`],
        m.bwRipple ? ['Ripple bandwidth', eng(m.bwRipple, 'Hz', 4)] : null,
        m.bw3 ? ['−3 dB bandwidth', eng(m.bw3, 'Hz', 4)] : null,
        m.bw20 ? ['−20 dB bandwidth', eng(m.bw20, 'Hz', 4)] : null,
        m.shape ? ['Shape factor', num(m.shape, 3)] : null,
        ['Worst VSWR in band', num(worstVswr(res), 2)],
      ].filter(Boolean),
    });
  }

  return sections;
}

/* Worst standing-wave ratio across the passband -- the same information as the
   return loss, in the units the person holding a VNA is reading. */
function worstVswr(res) {
  const r = res.response;
  const m = r && r.metrics;
  if (!r || !m) return NaN;
  const lo = m.fRipple && m.fRipple.length ? m.fRipple[0] : r.freqs[0];
  const hi = m.fRipple && m.fRipple.length ? m.fRipple[m.fRipple.length - 1] : (m.cutoff || r.freqs[r.freqs.length - 1]);
  let worst = 1;
  for (let i = 0; i < r.freqs.length; i++) {
    if (r.freqs[i] < lo || r.freqs[i] > hi) continue;
    if (r.vswr[i] > worst) worst = r.vswr[i];
  }
  return worst;
}

export function notes(cfg, res) {
  const out = [];
  for (const n of res.art.notes || []) out.push(n);
  for (const n of res.review || []) out.push({ level: n.level, text: n.text });

  /* Name the component that missed, not just the symptom.

     "The bandwidth came out 88 % narrow" is true and useless on its own. What
     the reader needs is which element the copper could not realise, and by how
     much -- that is the one they have to change. */
  const placed = (res.art.meta && res.art.meta.placed) || [];
  const misses = [];
  res.design.elements.forEach((el, i) => {
    const p = placed[i];
    if (!p || !p.realised) return;
    const pairs = [['L', el.L, p.realised.L], ['C', el.C, p.realised.C != null ? p.realised.C : p.realised.Cpar]];
    for (const [sym, want, got] of pairs) {
      if (!(want > 0) || !(got > 0)) continue;
      const off = (got / want - 1) * 100;
      if (Math.abs(off) > 10) {
        misses.push(`${el.kind === 'series' ? 'series' : 'shunt'} ${sym}${i + 1} wanted `
          + `${eng(want, sym === 'L' ? 'H' : 'F', 3)} and the copper gives ${eng(got, sym === 'L' ? 'H' : 'F', 3)} `
          + `(${off > 0 ? '+' : ''}${off.toFixed(0)} %)`);
      }
    }
  });
  if (misses.length) {
    out.push({
      level: 'error',
      text: `The layout cannot realise ${misses.length === 1 ? 'one element' : `${misses.length} elements`}: `
        + `${misses.slice(0, 3).join('; ')}. `
        + (cfg.capStyle === 'interdigital'
          ? 'Plate capacitors are far denser than an interdigital comb, and a bigger inductor budget buys henries.'
          : 'Raise the inductor budget, or move the design to a higher impedance so the values get easier.'),
    });
  }

  const m = res.response && res.response.metrics;
  const im = res.ideal && res.ideal.metrics;
  if (m && im && m.bw3 && im.bw3) {
    const drift = (m.bw3 / im.bw3 - 1) * 100;
    if (Math.abs(drift) > 8) {
      out.push({
        level: 'warn',
        text: `The built bandwidth is ${drift.toFixed(0)} % away from the lossless network. `
          + (drift > 0
            ? 'Widening is normal for a first-order coupled-line synthesis — trim the coupling gaps to pull it in.'
            : misses.length
              ? 'That follows from the elements above that the copper could not realise.'
              : 'Narrowing at the design values is finite Q: real resonators round the band edges in. '
                + 'A lower-loss laminate or a larger inductor budget buys it back.'),
      });
    }
  }
  if (m && m.insertionLoss > 3) {
    out.push({
      level: 'warn',
      text: `${m.insertionLoss.toFixed(1)} dB of insertion loss. On FR-4 most of that is dielectric; a lower-loss `
        + 'laminate or a wider line is the fix, not more order.',
    });
  }
  if (cfg.family === 'lumped' && (cfg.band === 'bandpass' || cfg.band === 'bandstop')) {
    out.push({
      level: 'info',
      text: 'A lumped band-pass needs both an L and a C per branch. Above roughly 300 MHz the parasitics of the '
        + 'planar parts dominate and a distributed topology is the better answer.',
    });
  }
  if (isDistributed(cfg)) {
    const f0 = res.design.f0 || cfg.fc;
    if (f0 < 4e8) {
      out.push({
        level: 'warn',
        text: `At ${eng(f0, 'Hz', 3)} a quarter wave is ${(res.design.quarter || 0).toFixed(0) || 'hundreds of'} mm. `
          + 'A lumped LC filter will be far smaller below about 400 MHz.',
      });
    }
  }
  return out;
}

export function charts(cfg, res) {
  const r = res.response;
  if (!r) return [];
  const f = r.freqs;
  const out = [];

  out.push({
    id: 's',
    title: 'Transmission and reflection',
    spec: {
      x: { values: f, label: 'f', log: true, format: fmtHz },
      y: { label: 'dB', min: -80, max: 5, format: (v) => v.toFixed(0) },
      series: [
        { name: 'S21', values: r.s21db, unit: 'dB', format: (v) => `${v.toFixed(2)} dB` },
        { name: 'S11', values: r.s11db, unit: 'dB', format: (v) => `${v.toFixed(2)} dB` },
      ],
      markers: markersFor(cfg, res),
      bands: bandFor(cfg, res),
    },
  });

  const reference = res.prototype || res.ideal;
  if (reference) {
    out.push({
      id: 'compare',
      title: res.prototype ? 'As built against the lumped prototype' : 'As built against the lossless network',
      note: 'The gap is the price of realising the network in copper.',
      spec: {
        x: { values: f, label: 'f', log: true, format: fmtHz },
        y: { label: 'S21 dB', min: -80, max: 5, format: (v) => v.toFixed(0) },
        series: [
          { name: 'Built', values: r.s21db, unit: 'dB', format: (v) => `${v.toFixed(2)} dB` },
          { name: res.prototype ? 'Prototype' : 'Lossless', values: reference.s21db, unit: 'dB', dash: [4, 3], format: (v) => `${v.toFixed(2)} dB` },
        ],
        markers: markersFor(cfg, res),
      },
    });
  }

  out.push({
    id: 'delay',
    title: 'Group delay',
    spec: {
      x: { values: f, label: 'f', log: true, format: fmtHz },
      y: { label: 'ns', format: (v) => v.toFixed(1) },
      series: [{ name: 'τg', values: r.groupDelay.map((v) => v * 1e9), unit: 'ns', format: (v) => `${v.toFixed(2)} ns` }],
      markers: markersFor(cfg, res),
      bands: bandFor(cfg, res),
    },
  });

  return out;
}

function markersFor(cfg, res) {
  const m = [];
  if (cfg.family === 'emi' && cfg.emiTopology !== 'cm') {
    m.push({ x: cfg.fTarget, label: `${cfg.attnDb} dB` });
    if (res.design.fc) m.push({ x: res.design.fc, label: 'fc' });
  } else if (isBandpass(cfg)) {
    const f0 = res.design.f0 || Math.sqrt(cfg.f1 * cfg.f2);
    m.push({ x: f0, label: 'f₀' });
  } else if (cfg.fc) {
    m.push({ x: cfg.fc, label: 'fc' });
  }
  return m;
}

function bandFor(cfg, res) {
  if (cfg.family === 'emi') return [];
  if (isBandpass(cfg)) return [{ from: Math.min(cfg.f1, cfg.f2), to: Math.max(cfg.f1, cfg.f2) }];
  if (cfg.band === 'lowpass') return [{ from: 0, to: cfg.fc }];
  return [];
}

export function status(cfg, res) {
  const m = res.response && res.response.metrics;
  const fam = FAMILIES[cfg.family];
  return {
    algo: `${fam ? fam.name : cfg.family}${cfg.family === 'emi' ? ` · ${cfg.emiTopology}` : ` · order ${cfg.order}`}`,
    summary: m
      ? `IL ${num(m.insertionLoss, 2)} dB · RL ${num(m.worstReturnLoss, 1)} dB${m.bw3 ? ` · BW ${eng(m.bw3, 'Hz', 3)}` : ''}`
      : 'synthesising…',
  };
}

export function layerList(cfg, res) {
  const used = new Set(res.art.tracks.map((t) => t.layer));
  return res.layers.filter((n) => used.has(n)).map((n, i) => [n, colourFor(n, i)]);
}
