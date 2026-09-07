/* Star connection in an outer routing collar. Radial spokes use the first
   copper layer; circumferential links use the last. Through vias occur only
   at the destination ring, so a spoke can cross other rings without a short.
   Broken phase arcs form series chains rather than shorting all coil ends. */
import { artwork, track, via, pad, label, arcPts, TAU } from './artwork.js';

export function starBus(cfg, coil, inst, names, opt = {}) {
  const A = artwork({ name: 'star connection', kind: 'bus' });
  const breakout = cfg.terminalBreakout ?? 'phase-neutral';
  if (!['phase-neutral', 'phases', 'none'].includes(breakout)) throw new Error('Choose a supported terminal breakout.');
  const phasePads = breakout !== 'none', neutralPad = breakout === 'phase-neutral';
  const reject = text => {
    A.notes.push({ level: 'error', text: `${text} Star routing was omitted; the individual coil terminals remain available.` });
    return A;
  };
  if (cfg.layers !== 2 || cfg.connection !== 'series' || coil.enclosed) {
    return reject('Automatic star routing requires exactly two series copper layers with both terminals outside each coil.');
  }
  if (cfg.coilCount % cfg.phases) return reject('Use a coil count divisible by the phase count for a balanced star connection.');
  if (cfg.spanDeg >= 360 / cfg.coilCount) return reject('Leave clearance between adjacent coil slots by reducing the coil span.');
  if (cfg.turns < 1 || Math.abs(coil.spiral.turnsUsed - Math.round(coil.spiral.turnsUsed)) > 1e-6) return reject('Automatic star routing requires whole turns.');

  const front = names[0], back = names.at(-1), w = cfg.traceW;
  const net = opt.net || 'COIL';
  const seam = (cfg.terminalAngle ?? -90) * Math.PI / 180;
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const wrap = a => ((a - seam) % TAU + TAU) % TAU;
  const terminals = inst.map(it => coil.terminals.map(t => {
    const a = Math.atan2(t[1], t[0]) + it.angle;
    const r = Math.hypot(...t);
    return { point: polar(r, a), angle: seam + wrap(a), r };
  }));
  // Pad-sized lanes also leave clearance to the through vias on adjacent lanes.
  const lane = Math.max(cfg.padSize, cfg.viaPad, w) + cfg.traceS + 0.3;
  const r0 = Math.max(cfg.dOuter / 2, ...terminals.flat().map(t => t.r))
    + cfg.padSize / 2 + cfg.traceS + lane;
  const rN = r0 + cfg.phases * lane;

  // Each coil's start and end must stay on the same side of the routing seam.
  // Oversized pads or slots can otherwise produce a nearly full-circle short.
  for (const [a, b] of terminals) {
    if (a.angle >= b.angle || b.angle - a.angle >= Math.PI / cfg.coilCount) {
      return reject('The coil terminals do not fit inside their routing slot. Reduce pad size or increase the stator diameter.');
    }
  }
  const ordered = terminals.flat().sort((a, b) => a.angle - b.angle);
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i], b = ordered[(i + 1) % ordered.length];
    const gap = (b.angle - a.angle + TAU) % TAU;
    if (2 * Math.min(a.r, b.r) * Math.sin(gap / 2) < Math.max(cfg.padSize, w) + cfg.traceS - 1e-6) {
      return reject('The terminal pads or radial spokes lack clearance. Reduce pad size or increase the stator diameter.');
    }
  }

  const arc = (r, a, b, role, phase) => {
    if (b - a < 1e-8) return;
    A.tracks.push(track(back, w, arcPts(0, 0, r, a, b, 0.01), { role, net, phase }));
  };
  const spoke = (t, r, role, phase) => {
    const end = polar(r, t.angle);
    A.tracks.push(track(front, w, [t.point, end], { role, net, phase }));
    A.vias.push(via(...end, { drill: cfg.viaDrill, diameter: cfg.viaPad, net, role: 'bus-drop' }));
  };
  const terminal = (r, name, phase) => {
    const [x, y] = polar(r, seam);
    A.pads.push(pad(x, y, { w: cfg.padSize, drill: cfg.padDrill, number: name, net, role: name === 'N' ? 'neutral-terminal' : 'phase-terminal' }));
    A.ports.push({ x, y, name, net, angle: seam });
    const [lx, ly] = polar(r, seam + Math.max(0.055, (cfg.padSize / 2 + 1) / r));
    A.labels.push(label(lx, ly, name, { size: 0.8 }));
  };
  const neutralEnds = [];
  for (let phase = 0; phase < cfg.phases; phase++) {
    const group = inst.filter(it => it.phase === phase).map(it => ({ index: it.index, ends: terminals[it.index] }))
      .sort((a, b) => a.ends[0].angle - b.ends[0].angle);
    const r = r0 + phase * lane;
    if (phasePads) terminal(r, String.fromCharCode(65 + phase), phase);
    if (cfg.coilSeries) {
      const first = group[0].ends[0];
      if (phasePads) {
        spoke(first, r, 'phase-feed', phase);
        arc(r, seam, first.angle, 'phase-feed', phase);
      }
      for (let i = 0; i < group.length - 1; i++) {
        const from = group[i].ends[1], to = group[i + 1].ends[0];
        spoke(from, r, 'series-link', phase);
        spoke(to, r, 'series-link', phase);
        arc(r, from.angle, to.angle, 'series-link', phase);
      }
      neutralEnds.push({ t: group.at(-1).ends[1], phase });
    } else {
      for (const { ends: [a, b] } of group) {
        spoke(a, r, 'parallel-feed', phase);
        neutralEnds.push({ t: b, phase });
      }
      arc(r, phasePads ? seam : group[0].ends[0].angle, group.at(-1).ends[0].angle, 'parallel-feed', phase);
    }
  }
  if (neutralPad) terminal(rN, 'N');
  for (const { t, phase } of neutralEnds) spoke(t, rN, 'star-return', phase);
  const neutralAngles = neutralEnds.map(e => e.t.angle);
  arc(rN, neutralPad ? seam : Math.min(...neutralAngles), Math.max(...neutralAngles), 'star');
  A.meta.routed = true;
  A.meta.outerRadius = rN + cfg.padSize / 2;
  const terminalNote = neutralPad ? `${cfg.phases} phase terminals plus exposed neutral N`
    : phasePads ? `${cfg.phases} phase terminals; neutral N stays internal`
      : `no grouped terminal pads or breakout tails; phase inputs are ${Array.from({ length: cfg.phases }, (_, p) => `${String.fromCharCode(65 + p)} at C${p + 1}.1`).join(', ')}. Star and same-phase interconnections remain enabled`;
  A.notes.push({ level: 'info', text: `Star connection: ${terminalNote}, with coils in ${cfg.coilSeries ? 'series' : 'parallel'}. Spokes on ${front}, links on ${back}; routing adds an outer collar. The continuous winding uses one KiCad net (${net}); phase names identify winding taps, not isolated copper nets. Interconnect resistance and inductance are excluded from the motor estimates.` });
  return A;
}
