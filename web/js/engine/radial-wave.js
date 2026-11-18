import { artwork, arcPts, bounds, copperLength, label, pad, TAU, track, via } from './artwork.js';
import { ALPHA_CU, RHO_CU20, OZ_MM, ipcRise, viaResistance, toFilaments, discretisationCorrection, inductanceOf, motorCurve } from './coil.js';

export const isRadialWave = cfg => (cfg.motorFamily ?? 'rotary') === 'rotary' && cfg.rotaryWinding === 'radial-wave';
const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];

function wavePath(inner, outer, start, pitch, poles) {
  const path = [polar(outer, start)];
  for (let pole = 0; pole < poles; pole++) {
    const radius = pole % 2 ? outer : inner;
    const angle = start + pitch * pole;
    path.push(polar(radius, angle));
    if (pole + 1 < poles) path.push(...arcPts(0, 0, radius, angle, angle + pitch, 0.06).slice(1));
  }
  return path;
}

function checkThroughHoles(art, clearance) {
  const holes = [...art.pads, ...art.vias];
  const tolerance = 0.008;
  const radius = hole => (hole.diameter ?? hole.w) / 2;
  const fail = () => { throw new Error('Wave terminals or vias lack clearance. Increase the stator diameter or reduce pad and via sizes.'); };
  for (const [i, hole] of holes.entries()) {
    for (const other of holes.slice(0, i)) {
      if (Math.hypot(hole.x - other.x, hole.y - other.y) < radius(hole) + radius(other) + clearance + tolerance) fail();
    }
    // Same-phase routes have a deliberately shared endpoint at the through hole.
    for (const t of art.tracks) if (t.net !== hole.net) {
      const min = radius(hole) + t.width / 2 + clearance + tolerance;
      for (let j = 1; j < t.pts.length; j++) {
        const [x, y] = t.pts[j - 1], [endX, endY] = t.pts[j];
        const dx = endX - x, dy = endY - y;
        const along = ((hole.x - x) * dx + (hole.y - y) * dy) / (dx * dx + dy * dy);
        const fraction = Math.max(0, Math.min(1, along));
        if (Math.hypot(hole.x - x - fraction * dx, hole.y - y - fraction * dy) < min) fail();
      }
    }
  }
}

export function buildRadialWave(c, layers, env, opt) {
  const p = c.polePairs;
  if (!Number.isInteger(p) || p < 1 || p > 30) throw new Error('Use one to thirty pole pairs.');
  if (![c.dOuter, c.dInner, c.traceW, c.traceS, c.padSize, c.padDrill, c.viaPad, c.viaDrill, c.copperOz, c.boardT].every(v => Number.isFinite(v) && v > 0) ||
      !(c.padSize > c.padDrill && c.viaPad > c.viaDrill) || !Number.isFinite(c.terminalAngle)) {
    throw new Error('Use positive winding dimensions and drills smaller than their copper pads.');
  }
  // Chords of the polygonal end turns bow inward from the nominal radius.
  const edge = (Math.max(0.5, c.traceS) + 0.02) / Math.cos(0.03);
  const inner = c.dInner / (2 * Math.cos(0.03)) + edge + c.traceW / 2, outer = c.dOuter / 2 - c.traceW / 2;
  const pitch = Math.PI / p, shift = pitch / 9;
  if (outer - inner < c.traceW + c.traceS || 2 * inner * Math.sin(pitch / 2) < c.traceW + c.traceS + 0.02) {
    throw new Error('The wave legs lack room at the bore. Enlarge the winding annulus or reduce track width or pole count.');
  }
  const padRadius = c.padSize / 2, viaRadius = c.viaPad / 2;
  const radialGap = c.traceS + Math.max(padRadius, viaRadius, c.traceW / 2) + 0.2;
  const port = Math.max(outer + 2 * radialGap, (Math.max(c.padSize, padRadius + viaRadius, padRadius + c.traceW / 2)
    + c.traceS + 0.08) / (2 * Math.sin(shift / 2)));
  const jog = port - radialGap;
  const collarGap = Math.max(viaRadius + c.traceW / 2, 2 * viaRadius, padRadius + viaRadius) + c.traceS + 0.2;
  const art = artwork({ name: env.name || 'Radial wave stator', kind: 'stator', motorFamily: 'rotary',
    radialWave: true, exactPaths: true, boardLayers: layers, phases: 3, instances: 3, interconnected: true });
  const groups = [];
  for (let phase = 0; phase < 3; phase++) {
    const name = String.fromCharCode(65 + phase), net = (env.net || 'COIL') + '_' + name;
    const start = c.terminalAngle * Math.PI / 180 + pitch / 2 + phase * 2 * pitch / 3, end = start - pitch;
    const wave = wavePath(inner, outer, start, pitch, 2 * p);
    const collar = port + (phase + 1) * collarGap;
    const joint = polar(collar, end), source = polar(port, start + shift), sink = polar(port, end - shift);
    const front = layers[phase], back = layers[5 - phase];
    const paths = [
      track(front, c.traceW, [source, ...arcPts(0, 0, jog, start + shift, start, 0.04), wave[0]], { net, phase, role: 'wave-lead' }),
      track(front, c.traceW, wave, { net, phase, role: 'wave-winding' }),
      track(front, c.traceW, [wave.at(-1), joint], { net, phase, role: 'wave-return' }),
      track(back, c.traceW, [...arcPts(0, 0, collar, end, start, 0.04), wave[0]], { net, phase, role: 'wave-return' }),
      track(back, c.traceW, wave, { net, phase, role: 'wave-winding' }),
      track(back, c.traceW, [wave.at(-1), ...arcPts(0, 0, jog, end, end - shift, 0.04), sink], { net, phase, role: 'wave-lead' }),
    ];
    art.tracks.push(...paths);
    art.vias.push(via(...joint, { net, diameter: c.viaPad, drill: c.viaDrill, role: 'wave-transition' }));
    for (const [point, suffix, angle] of [[source, '+', start + shift], [sink, '-', end - shift]]) {
      const number = name + suffix;
      art.pads.push(pad(...point, { w: c.padSize, drill: c.padDrill, number, net, role: 'wave-terminal' }));
      art.ports.push({ x: point[0], y: point[1], net, name: number });
      art.labels.push(label(...polar(port + padRadius + 0.8, angle), number, { size: 0.65 }));
    }
    groups.push({ phase, paths, collar, layers: [front, back] });
  }
  checkThroughHoles(art, c.traceS);
  const radius = groups.at(-1).collar + viaRadius + 1.2;
  art.outline = [radius, c.dInner / 2].map(r => ({ layer: 'Edge.Cuts', pts: arcPts(0, 0, r, 0, TAU, 0.035) }));
  art.notes.push({ level: 'info', text: 'Each phase runs through two symmetric layers via one plated through hole. A+/A−, B+/B− and C+/C− are isolated for external connection.' });
  const modelCfg = { ...c, layers: 6, phases: 3, connection: 'series', motorTopology: 'independent' };
  const res = { family: 'rotary', art, layers, bounds: bounds(art), instances: 3, modelCfg,
    wave: { diameter: 2 * radius, inner, outer, polePairs: p, groups: groups.map(g => ({ layers: g.layers })) } };
  if (opt.quick) return res;
  if (![c.bGap, c.current, c.rpm].every(v => Number.isFinite(v) && v >= 0) || !(Number.isFinite(c.vdc) && c.vdc > 0) ||
      !(Number.isFinite(c.tempC) && 1 + ALPHA_CU * (c.tempC - 20) > 0)) {
    throw new Error('Use nonnegative field, current and speed, with a positive bus voltage and valid copper temperature.');
  }
  return analyseWave(res, groups);
}

function analyseWave(res, groups) {
  const c = res.modelCfg, { inner, outer, polePairs: p } = res.wave;
  const tCu = c.copperOz * OZ_MM, rho = RHO_CU20 * (1 + ALPHA_CU * (c.tempC - 20));
  const thickness = Math.max(0, c.boardT - tCu);
  const phase = groups.map(({ phase, paths }) => {
    const separation = thickness * (5 - 2 * phase) / 5;
    const length = copperLength({ tracks: paths });
    const barrel = viaResistance(c) * separation / c.boardT
      + viaResistance({ ...c, viaDrill: c.padDrill }) * (thickness - separation) / c.boardT;
    const resistance = rho * (length * 1e3 / (tCu * c.traceW) + barrel / RHO_CU20);
    const poly = paths.map((path, index) => path.pts.map(([x, y]) => [x, y, (index < 3 ? 1 : -1) * separation / 2]));
    poly.splice(3, 0, [poly[2].at(-1), poly[3][0]]);
    const step = Math.max(0.7, length / 1200);
    const w = c.traceW * 1e-3, t = tCu * 1e-3;
    const inductance = inductanceOf(toFilaments(poly, step, 1400), w, t, discretisationCorrection(step * 1e-3, w, t));
    return { length, resistance, inductance, layers: groups[phase].layers };
  });
  res.wave.phase = phase;
  const Rphase = phase.reduce((sum, g) => sum + g.resistance, 0) / 3;
  const Lphase = phase.reduce((sum, g) => sum + g.inductance, 0) / 3;
  // Each pole contributes one full radial leg on each of the two phase layers.
  const KeMech = 2 * p * c.bGap * (outer ** 2 - inner ** 2) * 1e-6;
  const Kt = 1.5 * KeMech, torque = Kt * c.current, Pcu = 1.5 * c.current ** 2 * Rphase;
  const omega = c.rpm * TAU / 60, Pmech = torque * omega;
  const m = { Kt, KeMech, torque, Pcu, Pmech, Rphase, Lphase, topology: 'independent', winding: { balanced: true },
    kw: 1, km: Kt / Math.sqrt(1.5 * Rphase), tauE: Lphase / Rphase,
    Kv: KeMech ? 60 / (TAU * KeMech) : Infinity, eff: Pmech + Pcu > 0 ? Pmech / (Pmech + Pcu) : 0,
    noLoad: KeMech ? c.vdc * 60 / (TAU * KeMech) : 0, stall: Kt * c.vdc / Rphase };
  res.analysis = { Rdc: Rphase, L: Lphase, rise: ipcRise(c.current / Math.sqrt(2), c.traceW, tCu, false), nL: 6 };
  res.motor = m;
  res.curve = motorCurve(m);
  return res;
}
