/* ============================================================================
   INDUCTOR WORKSPACE

   The coil, its stack-up and its electrical model. Geometry recomputes on
   every keystroke; the field solve waits for a pause, because a 16-layer
   winding is a few thousand filaments and a full partial-inductance sum is not
   something to run on every pixel of slider travel.
   ========================================================================= */

import { buildCoil, analyse, sweep, ALGORITHMS } from '../engine/coil.js';
import { buildArtwork, outlineFor } from '../engine/coilgeom.js';
import { bounds } from '../engine/artwork.js';
import { eng, num } from '../ui/controls.js';
import {
  SHAPES, chooseLayers, colourFor, substrateFields, processFields, driveFields, fmtHz,
} from './common.js';

export const id = 'inductor';
export const title = 'Inductor';

export function defaults() {
  return {
    shape: 'circle',
    turns: 8,
    dOuter: 24,
    dInner: 8,
    traceW: 0.35,
    traceS: 0.25,
    layers: 2,
    connection: 'series',
    ppt: 128,
    sides: 6,
    fillet: 1.2,
    aspect: 0.62,
    cornerR: 4,
    spanDeg: 26,
    sfM: 5, sfN1: 0.6, sfN2: 1.2, sfN3: 1.2,
    customPoly: null,
    boardT: 1.6,
    epsR: 4.4,
    copperOz: 1,
    viaDrill: 0.3,
    viaPad: 0.6,
    padSize: 1.6,
    padDrill: 0.8,
    freq: 1e6,
    current: 1,
    tempC: 25,
    cExtra: 0,
    // Motor fields live here too so the two workspaces share one config.
    arrayEnabled: false, coilCount: 12, phases: 3, polePairs: 7,
    bGap: 0.45, rpm: 3000, vdc: 24, coilSeries: true, busEnabled: true,
    tolerance: 0.004,
  };
}

/* --------------------------------------------------------------------------
   Parameter rail
   ----------------------------------------------------------------------- */

export function rail(panel, app) {
  panel.group({
    key: 'shape',
    title: 'Winding',
    fields: [
      { key: 'shape', type: 'shapes', options: SHAPES, optionHint: true },
      {
        key: 'turns', type: 'range', label: 'Turns per layer',
        min: 1, max: 60, step: 0.5, decimals: 1, hardMin: 0.5,
      },
      { key: 'dOuter', type: 'range', label: 'Outer diameter', unit: 'mm', min: 2, max: 160, step: 0.1, hardMin: 0.5 },
      {
        key: 'dInner', type: 'range', label: 'Bore diameter', unit: 'mm', min: 0, max: 120, step: 0.1,
        when: (c) => c.shape === 'wedge',
        hint: 'The stator bore. Sets the inner arc of the sector coil.',
      },
      { key: 'spanDeg', type: 'range', label: 'Sector span', unit: '°', min: 4, max: 120, step: 0.5, when: (c) => c.shape === 'wedge' },
      { key: 'sides', type: 'range', label: 'Sides', min: 3, max: 16, step: 1, when: (c) => c.shape === 'polygon' },
      { key: 'fillet', type: 'range', label: 'Corner fillet', unit: 'mm', min: 0, max: 12, step: 0.05, when: (c) => c.shape === 'polygon' },
      { key: 'aspect', type: 'range', label: 'Aspect', min: 0.1, max: 1, step: 0.01, when: (c) => c.shape === 'racetrack' },
      { key: 'cornerR', type: 'range', label: 'Corner radius', unit: 'mm', min: 0, max: 30, step: 0.1, when: (c) => c.shape === 'racetrack' },
      { key: 'sfM', type: 'range', label: 'Symmetry m', min: 1, max: 20, step: 1, when: (c) => c.shape === 'super' },
      { key: 'sfN1', type: 'range', label: 'n₁', min: 0.1, max: 8, step: 0.05, when: (c) => c.shape === 'super' },
      { key: 'sfN2', type: 'range', label: 'n₂', min: 0.1, max: 12, step: 0.05, when: (c) => c.shape === 'super' },
      { key: 'sfN3', type: 'range', label: 'n₃', min: 0.1, max: 12, step: 0.05, when: (c) => c.shape === 'super' },
      {
        type: 'note',
        text: 'Drag the handles on the canvas to size the coil directly.',
      },
    ],
  });

  panel.group({
    key: 'stack',
    title: 'Stack-up',
    fields: [
      { key: 'layers', type: 'range', label: 'Copper layers', min: 1, max: 16, step: 1 },
      {
        key: 'connection', type: 'seg', label: 'Layer connection',
        options: [
          { value: 'series', label: 'Series', hint: 'Turns add. Alternate layers are mirrored so the current keeps circulating the same way.' },
          { value: 'parallel', label: 'Parallel', hint: 'Layers carry current together. Same inductance, lower resistance.' },
        ],
        optionHint: true,
      },
      ...substrateFields({ boardHint: 'Read from the open board when there is one.' }),
    ],
  });

  panel.group({ key: 'process', title: 'Process', open: false, fields: processFields() });

  panel.group({
    key: 'drive',
    title: 'Operating point',
    fields: driveFields(),
  });

  panel.group({
    key: 'quality',
    title: 'Detail',
    open: false,
    fields: [
      {
        key: 'ppt', type: 'range', label: 'Points per turn', min: 24, max: 512, step: 8,
        hint: 'Sampling density of the generated path. Higher is smoother and heavier.',
      },
      {
        key: 'tolerance', type: 'range', label: 'Export tolerance', unit: 'mm',
        min: 0, max: 0.05, step: 0.001, decimals: 3,
        hint: 'No copper edge moves further than this when the path is simplified for export.',
      },
    ],
  });
}

/* --------------------------------------------------------------------------
   Compute
   ----------------------------------------------------------------------- */

export function compute(cfg, env, opt = {}) {
  const layers = chooseLayers(cfg, env.board);
  const coil = buildCoil({ ...cfg, layerNames: layers });
  const art = buildArtwork({ ...cfg, layerNames: layers }, coil, {
    name: env.name || 'L1',
    net: env.net || 'COIL',
    label: `${env.name || 'L1'}  ${cfg.layers}L`,
  });
  art.outline = outlineFor(cfg, coil, 2);

  const result = {
    coil, art, layers,
    algorithm: coil.spiral.algorithm || ALGORITHMS[cfg.shape],
    bounds: bounds(art),
  };
  if (opt.quick) return result;

  const a = analyse(cfg, coil, { segmentCap: opt.segmentCap || 3600 });
  result.analysis = a;
  result.sweep = sweep(cfg, a, Math.max(1e3, a.srf / 3000), a.srf * 4, 140);
  return result;
}

/* --------------------------------------------------------------------------
   Canvas handles
   ----------------------------------------------------------------------- */

export function handles(cfg, res, app) {
  const out = [];
  const r = cfg.dOuter / 2;
  out.push({
    id: 'dOuter', x: r, y: 0, cursor: 'ew-resize',
    hint: `⌀ ${cfg.dOuter.toFixed(2)} mm`,
    drag: (wx, wy) => {
      const v = Math.max(1, Math.hypot(wx, wy) * 2);
      app.set('dOuter', Number(v.toFixed(2)));
    },
  });
  if (cfg.shape === 'wedge') {
    const ri = cfg.dInner / 2;
    out.push({
      id: 'dInner', x: ri, y: 0, cursor: 'ew-resize',
      hint: `bore ⌀ ${cfg.dInner.toFixed(2)} mm`,
      drag: (wx, wy) => {
        const v = Math.max(0.4, Math.min(cfg.dOuter - 0.4, Math.hypot(wx, wy) * 2));
        app.set('dInner', Number(v.toFixed(2)));
      },
    });
    const half = cfg.spanDeg * Math.PI / 360;
    out.push({
      id: 'span', x: r * Math.cos(half), y: r * Math.sin(half), cursor: 'grab',
      hint: `span ${cfg.spanDeg.toFixed(1)}°`,
      drag: (wx, wy) => {
        const deg = Math.abs(Math.atan2(wy, wx)) * 360 / Math.PI;
        app.set('spanDeg', Number(Math.max(2, Math.min(180, deg)).toFixed(1)));
      },
    });
  }
  if (cfg.shape === 'racetrack') {
    out.push({
      id: 'aspect', x: 0, y: cfg.dOuter / 2 * cfg.aspect, cursor: 'ns-resize',
      hint: `aspect ${cfg.aspect.toFixed(2)}`,
      drag: (wx, wy) => {
        const v = Math.max(0.1, Math.min(1, Math.abs(wy) / (cfg.dOuter / 2)));
        app.set('aspect', Number(v.toFixed(3)));
      },
    });
  }
  // Inner edge of the winding: dragging it changes the turn count, which is
  // the most direct way to say "fill this much of the annulus".
  if (res.coil && cfg.shape !== 'wedge') {
    const ri = res.coil.innerR;
    if (ri > 0.3) {
      out.push({
        id: 'turns', x: -ri, y: 0, cursor: 'ew-resize',
        hint: `${res.coil.spiral.turnsUsed.toFixed(1)} turns`,
        drag: (wx, wy) => {
          const pitch = cfg.traceW + cfg.traceS;
          const rIn = Math.hypot(wx, wy);
          const t = Math.max(1, (cfg.dOuter / 2 - rIn) / pitch);
          app.set('turns', Number(t.toFixed(1)));
        },
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------------------
   Readouts
   ----------------------------------------------------------------------- */

export function tiles(cfg, res) {
  const a = res.analysis;
  if (!a) return [];
  const drc = a.drc;
  const srfTone = a.srf < cfg.freq * 3 ? 'warn' : '';
  const riseTone = a.rise > 40 ? 'bad' : a.rise > 20 ? 'warn' : 'good';
  return [
    { k: 'Inductance', v: eng(a.L, 'H', 4), sub: a.Lcs ? `closed form ${eng(a.Lcs, 'H', 3)}` : `${a.turns.toFixed(2)} turns × ${a.nL}`, wide: false },
    { k: 'Q', v: num(a.Q, 1), sub: `at ${fmtHz(cfg.freq)}Hz` },
    { k: 'R dc', v: eng(a.Rdc, 'Ω', 3) },
    { k: 'R ac', v: eng(a.Rac, 'Ω', 3), sub: `Fr ${a.Fr.toFixed(2)}` },
    { k: 'Self-resonance', v: eng(a.srf, 'Hz', 3), tone: srfTone, sub: `C ${eng(a.Ctot, 'F', 3)}` },
    { k: 'ΔT at I', v: `${num(a.rise, 1)} K`, tone: riseTone, sub: `${a.Iop} A, ${eng(a.Ploss, 'W', 3)}` },
    ...(drc && !drc.clearanceOK ? [{ k: 'Clearance', v: `${num(drc.minClearance, 3)} mm`, tone: 'bad', sub: `below ${cfg.traceS} mm`, wide: true }] : []),
  ];
}

export function spec(cfg, res) {
  const a = res.analysis;
  const c = res.coil;
  if (!a) return [];
  return [
    {
      title: 'Geometry',
      rows: [
        ['Algorithm', res.algorithm ? res.algorithm.name : '—'],
        ['Turns used', `${a.turns.toFixed(3)} of ${c.spiral.maxTurns.toFixed(2)} possible`],
        ['Outer / inner (effective)', `${num(a.dOutEff, 2)} / ${num(a.dInEff, 2)} mm`],
        ['Track pitch', `${num(a.pitch, 3)} mm`],
        ['Conductor length', `${num(a.lenTotal * 1e3, 1)} mm total`],
        ['Copper volume', `${num(a.cuVol * 1e9, 1)} mm³`],
        ['Copper mass', `${num(a.cuMass * 1e3, 2)} g`],
        ['Copper thickness', `${num(a.tCu * 1e3, 1)} µm`],
        ['Area fill', `${num(a.fill * 100, 1)} %`],
      ],
    },
    {
      title: 'Inductance',
      note: res.algorithm ? res.algorithm.note : '',
      rows: [
        ['Numerical (partial inductance)', eng(a.L, 'H', 4)],
        a.Lcs ? ['Mohan current sheet', eng(a.Lcs, 'H', 4)] : null,
        a.Lwh ? ['Modified Wheeler', eng(a.Lwh, 'H', 4)] : null,
        a.Lsingle != null && a.nL > 1 ? ['Single layer', eng(a.Lsingle, 'H', 4)] : null,
        a.k != null ? ['Interlayer coupling k', num(a.k, 3)] : null,
      ].filter(Boolean),
    },
    {
      title: 'Loss and parasitics',
      rows: [
        ['DC resistance', eng(a.Rdc, 'Ω', 4)],
        ['AC resistance', eng(a.Rac, 'Ω', 4)],
        ['Dowell factor', num(a.Fr, 3)],
        ['Skin depth', `${num(a.delta * 1e3, 1)} µm`],
        ['Via resistance (total)', eng(a.viaR * (res.coil.vias.length || 0), 'Ω', 3)],
        ['Interlayer capacitance', eng(a.Cinter, 'F', 3)],
        ['Turn-to-turn capacitance', eng(a.Cturn, 'F', 3)],
        ['Total capacitance', eng(a.Ctot, 'F', 3)],
        ['Self-resonant frequency', eng(a.srf, 'Hz', 4)],
      ],
    },
    {
      title: 'Rating',
      note: 'IPC-2221 assumes still air and an isolated conductor. A coil packed against its own turns runs hotter.',
      rows: [
        ['Current at ΔT = 10 K', `${num(a.I10, 2)} A`],
        ['Current at ΔT = 20 K', `${num(a.I20, 2)} A`],
        ['Current at ΔT = 40 K', `${num(a.I40, 2)} A`],
        ['Rise at operating current', `${num(a.rise, 1)} K`],
        ['I²R loss', eng(a.Ploss, 'W', 3)],
      ],
    },
  ];
}

export function notes(cfg, res) {
  const out = [];
  const a = res.analysis;
  const c = res.coil;
  if (!a) return out;
  if (c.enclosed) {
    out.push({
      level: 'warn',
      text: 'An odd layer count leaves the far terminal enclosed by its own turns. It needs a jumper, '
        + 'or an even layer count, which brings the chain back to where it started.',
    });
  }
  if (!a.drc.turnsOK) {
    out.push({ level: 'warn', text: `The geometry only fits ${a.drc.maxTurns.toFixed(2)} turns; the extra turns were dropped.` });
  }
  if (!a.drc.clearanceOK) {
    out.push({
      level: 'error',
      text: `Minimum clearance is ${a.drc.minClearance.toFixed(3)} mm against a ${cfg.traceS} mm rule. `
        + 'A logarithmic spiral is tightest at its inner end.',
    });
  }
  if (a.srf < cfg.freq * 3) {
    out.push({
      level: 'warn',
      text: `Self-resonance is at ${eng(a.srf, 'Hz', 3)}, only ${(a.srf / cfg.freq).toFixed(1)}× the operating frequency. `
        + 'The effective inductance is already well above the low-frequency value.',
    });
  }
  if (a.rise > 40) {
    out.push({ level: 'error', text: `IPC-2221 puts the rise at ${a.rise.toFixed(0)} K for ${a.Iop} A. Widen the track or take current out.` });
  }
  if (cfg.layers > 1 && cfg.connection === 'parallel') {
    out.push({
      level: 'info',
      text: 'Parallel layers are stitched at both ends only. Current will not share evenly at high frequency '
        + 'unless you add stitching along the winding.',
    });
  }
  if (a.Lcs) {
    const delta = Math.abs(a.L - a.Lcs) / a.Lcs * 100;
    if (delta > 20) {
      out.push({
        level: 'info',
        text: `The numerical result differs from the Mohan closed form by ${delta.toFixed(0)} %. That expression `
          + 'is fitted to single-layer spirals with 0.1 < fill < 0.6; outside that it is the one to distrust.',
      });
    }
  }
  return out;
}

export function charts(cfg, res) {
  if (!res.sweep || !res.sweep.length) return [];
  const f = res.sweep.map((p) => p.f);
  return [
    {
      id: 'q',
      title: 'Q against frequency',
      note: 'Q is only defined below self-resonance; above it the reactance is capacitive and the line stops.',
      spec: {
        x: { values: f, label: 'f', log: true, format: (v) => `${fmtHz(v)}` },
        y: { label: 'Q', min: 0, format: (v) => v.toFixed(0) },
        // Past self-resonance Q goes negative and would drag the scale down by
        // a factor of ten, hiding the part anyone is looking at. Dropping those
        // points ends the line where the quantity stops meaning anything.
        series: [{ name: 'Q', values: res.sweep.map((p) => (p.Q > 0 ? p.Q : NaN)) }],
        markers: [
          { x: cfg.freq, label: 'f₀' },
          res.analysis ? { x: res.analysis.srf, label: 'SRF' } : null,
        ].filter(Boolean),
      },
    },
    {
      id: 'z',
      title: 'Impedance magnitude',
      spec: {
        x: { values: f, label: 'f', log: true, format: (v) => `${fmtHz(v)}` },
        y: { label: '|Z| Ω', format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)) },
        series: [{ name: '|Z|', values: res.sweep.map((p) => p.Z), unit: 'Ω' }],
        markers: [res.analysis ? { x: res.analysis.srf, label: 'SRF' } : null].filter(Boolean),
      },
    },
    {
      id: 'rac',
      title: 'AC resistance',
      spec: {
        x: { values: f, label: 'f', log: true, format: (v) => `${fmtHz(v)}` },
        y: { label: 'R Ω', format: (v) => eng(v, '', 2) },
        series: [{ name: 'R_ac', values: res.sweep.map((p) => p.R), unit: 'Ω' }],
        markers: [{ x: cfg.freq, label: 'f₀' }],
      },
    },
  ];
}

export function status(cfg, res) {
  const a = res.analysis;
  return {
    algo: res.algorithm ? res.algorithm.name : '—',
    summary: a ? `L ${eng(a.L, 'H', 3)} · Q ${num(a.Q, 1)} · Rdc ${eng(a.Rdc, 'Ω', 3)}` : 'solving…',
  };
}

export function layerList(cfg, res) {
  return res.layers.map((n, i) => [n, colourFor(n, i)]);
}
