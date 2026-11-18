/* Star connection in an outer routing collar. Radial spokes use the first
   copper layer; circumferential links use the last. Through vias occur only
   at the destination ring, so a spoke can cross other rings without a short.
   Broken phase arcs form series chains rather than shorting all coil ends. */
import { artwork, track, via, pad, label, arcPts, TAU } from './artwork.js';
import { windingPhasors } from './winding-design.js';

// Split each physical arc at its electrical taps for resistance calculations.
function busCircuit() {
  const edges = [], lanes = new Map(), arcs = [];
  const tap = (radius, angle, id = null) => {
    if (!lanes.has(radius)) lanes.set(radius, []);
    const lane = lanes.get(radius);
    const previous = lane.find(p => Math.abs(p.angle - angle) < 1e-9);
    if (previous) return previous.id;
    const node = id ?? ['lane', radius, angle].join(':');
    lane.push({ angle, id: node });
    return node;
  };
  return {
    tap,
    spoke(t, radius) {
      const front = 'front:' + t.id;
      edges.push({ from: t.id, to: front, length: radius - t.r });
      edges.push({ from: front, to: tap(radius, t.angle) });
    },
    arc(radius, a, b) { arcs.push({ radius, a, b }); },
    finish(input, output, topology) {
      for (const { radius, a, b } of arcs) {
        const points = lanes.get(radius).filter(p => p.angle >= a - 1e-9 && p.angle <= b + 1e-9)
          .sort((left, right) => left.angle - right.angle);
        for (let i = 1; i < points.length; i++) {
          edges.push({ from: points[i - 1].id, to: points[i].id, length: radius * (points[i].angle - points[i - 1].angle) });
        }
      }
      return { edges, input, output, topology };
    },
  };
}

const supportedStack = (cfg, coil) =>
  [2, 4, 6].includes(cfg.layers) && cfg.connection === 'series' && !coil.enclosed && !coil.routingError && cfg.padDrill > 0;
const stackMessage = 'Automatic routing requires two, four, or six series copper layers with clear exterior through-hole terminals.';
const portName = name => 'port:' + name;
const phaseName = phase => String.fromCharCode(65 + phase);
export const phaseNet = (net, phase) => net + '_' + phaseName(phase);

/* One radial lane per series link makes arbitrary polarity and branch order
   routable without joining a winding's two ends on a shared phase arc. */
export function scheduledBus(cfg, coil, inst, names, opt = {}) {
  const topology = cfg.motorTopology ?? 'wye';
  const A = artwork({ name: 'scheduled phase interconnection', kind: 'bus' });
  const reject = text => { A.notes.push({ level: 'error', text: `${text} Phase routing was omitted; individual coil terminals remain available.` }); return A; };
  if (!supportedStack(cfg, coil)) return reject(stackMessage);
  if (!['wye', 'delta', 'independent'].includes(topology)) return reject('Choose a supported phase connection.');
  if (topology !== 'wye' && cfg.phases !== 3) return reject('Delta and six-terminal layouts require three phases.');
  if (cfg.spanDeg >= 360 / cfg.coilCount || !Number.isInteger(coil.spiral.turnsUsed)) return reject('Leave space between slots and use whole turns for scheduled routing.');
  const winding = windingPhasors(cfg);
  if (winding.phases.some(p => !p.branches.length)) return reject('Every phase needs at least one coil.');
  if (winding.parallelMismatch) return reject('Parallel branches have unequal induced-voltage phasors. Put these coils in series or use compatible branches to avoid circulating current.');
  if (topology === 'delta' && !winding.deltaCompatible) return reject('Delta needs balanced phases with 120° phase separation and no fundamental voltage around the closed loop.');
  const breakout = cfg.terminalBreakout ?? 'phase-neutral';
  if (!['phase-neutral', 'phases', 'none'].includes(breakout)) throw new Error('Choose a supported terminal breakout.');
  const seam = (cfg.terminalAngle ?? -90) * Math.PI / 180, net = opt.net || 'COIL';
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const wrap = a => seam + ((a - seam) % TAU + TAU) % TAU;
  const ends = inst.map(it => coil.terminals.map(([x, y], i) => {
    const r = Math.hypot(x, y), angle = wrap(Math.atan2(y * it.polarity, x) + it.angle);
    return { r, angle, point: polar(r, angle), id: `C${it.index + 1}.${i + 1}` };
  }));
  const all = ends.flat().sort((a, b) => a.angle - b.angle);
  for (let i = 0; i < all.length; i++) {
    const a = all[i], b = all[(i + 1) % all.length];
    if (2 * Math.min(a.r, b.r) * Math.sin(((b.angle - a.angle + TAU) % TAU) / 2) < Math.max(cfg.padSize, cfg.viaPad, cfg.traceW) + cfg.traceS - 1e-6)
      return reject('Terminal pads or radial spokes lack clearance. Reduce pad size or increase stator diameter.');
  }
  const lane = Math.max(cfg.padSize, cfg.viaPad, cfg.traceW) + cfg.traceS + 0.3;
  const r0 = Math.max(cfg.dOuter / 2, ...all.map(t => t.r)) + cfg.padSize / 2 + cfg.traceS + lane;
  const circuit = busCircuit();
  const netFor = phase => topology === 'independent' ? phaseNet(net, phase) : net;
  let nextLane = topology === 'independent' ? 2 * cfg.phases : cfg.phases;
  const spoke = (t, r, phase) => {
    const point = polar(r, t.angle);
    A.tracks.push(track(names[0], cfg.traceW, [t.point, point], { net: netFor(phase), phase, role: 'scheduled-spoke' }));
    A.vias.push(via(...point, { drill: cfg.viaDrill, diameter: cfg.viaPad, net: netFor(phase), role: 'bus-drop' }));
    circuit.spoke(t, r);
  };
  const arc = (r, a, b, phase) => {
    if (b - a <= 1e-9) return;
    A.tracks.push(track(names.at(-1), cfg.traceW, arcPts(0, 0, r, a, b, 0.01), { net: netFor(phase), phase, role: 'scheduled-link' }));
    circuit.arc(r, a, b);
  };
  const terminal = (r, name, phase) => {
    const [x, y] = polar(r, seam);
    A.pads.push(pad(x, y, { w: cfg.padSize, drill: cfg.padDrill, number: name, net: netFor(phase) }));
    A.ports.push({ x, y, name, net: netFor(phase) });
    const [lx, ly] = polar(r, seam + Math.max(0.055, (cfg.padSize / 2 + 1.5) / r));
    A.labels.push(label(lx, ly, name, { size: 0.8 }));
    return circuit.tap(r, seam, portName(name));
  };
  const feeds = [], returns = [], descriptions = [];
  for (const p of winding.phases) {
    const first = [], last = [];
    for (const branch of p.branches) {
      const { coils } = branch;
      first.push(ends[coils[0]][0]); last.push(ends[coils.at(-1)][1]);
      descriptions.push(`${phaseName(p.phase)} branch ${branch.branch}: C${coils[0] + 1}.1`);
      for (let i = 1; i < coils.length; i++) {
        const a = ends[coils[i - 1]][1], b = ends[coils[i]][0], radius = r0 + nextLane++ * lane;
        spoke(a, radius, p.phase); spoke(b, radius, p.phase);
        arc(radius, Math.min(a.angle, b.angle), Math.max(a.angle, b.angle), p.phase);
      }
    }
    feeds.push(first); returns.push(last);
  }
  const join = (r, ends, name, phase) => {
    const port = name && terminal(r, name, phase);
    ends.forEach(t => spoke(t, r, phase));
    const angles = ends.map(t => t.angle);
    arc(r, port ? seam : Math.min(...angles), Math.max(...angles), phase);
    return port || ends[0].id;
  };
  let input, output, description;
  if (topology === 'delta') {
    input = feeds.map((feed, p) => join(r0 + p * lane, [...feed, ...returns[(p + 2) % 3]], phaseName(p), p));
    output = input.map((_, p) => input[(p + 1) % 3]);
    description = 'Delta connection: A–B, B–C and C–A; three line terminals.';
  } else if (topology === 'independent') {
    input = feeds.map((feed, p) => join(r0 + 2 * p * lane, feed, phaseName(p) + '+', p));
    output = returns.map((end, p) => join(r0 + (2 * p + 1) * lane, end, phaseName(p) + '-', p));
    description = 'Six-terminal connection: A+/A−, B+/B− and C+/C− are three electrically isolated windings.';
  } else {
    input = feeds.map((feed, p) => join(r0 + p * lane, feed, breakout === 'none' ? null : phaseName(p), p));
    const neutral = join(r0 + nextLane++ * lane, returns.flat(), breakout === 'phase-neutral' ? 'N' : null);
    output = input.map(() => neutral);
    description = `Scheduled star connection: ${breakout === 'phase-neutral' ? 'Neutral N exposed.' : 'Neutral stays internal.'}`;
  }
  A.meta.routed = true;
  A.meta.outerRadius = r0 + (nextLane - 1) * lane + cfg.padSize / 2;
  A.meta.circuit = circuit.finish(input, output, topology);
  A.notes.push({ level: 'info', text: `${description} Ascending coil order within each branch; branches of a phase are parallel. ${descriptions.join('; ')}. Link lanes increase board diameter.` });
  return A;
}

export function starBus(cfg, coil, inst, names, opt = {}) {
  const A = artwork({ name: 'star connection', kind: 'bus' });
  const breakout = cfg.terminalBreakout ?? 'phase-neutral';
  if (!['phase-neutral', 'phases', 'none'].includes(breakout)) throw new Error('Choose a supported terminal breakout.');
  const phasePads = breakout !== 'none', neutralPad = breakout === 'phase-neutral';
  const reject = text => {
    A.notes.push({ level: 'error', text: `${text} Star routing was omitted; the individual coil terminals remain available.` });
    return A;
  };
  if (!supportedStack(cfg, coil)) return reject(stackMessage);
  if (cfg.motorGeometry && !cfg.coilSeries && windingPhasors(cfg).parallelMismatch) return reject('Parallel coils have unequal induced-voltage phasors. Use compatible poles or series wiring.');
  if (cfg.coilCount % cfg.phases) return reject('Use a coil count divisible by the phase count for a balanced star connection.');
  if (cfg.spanDeg >= 360 / cfg.coilCount) return reject('Leave clearance between adjacent coil slots by reducing the coil span.');
  if (cfg.turns < 1 || Math.abs(coil.spiral.turnsUsed - Math.round(coil.spiral.turnsUsed)) > 1e-6) return reject('Automatic star routing requires whole turns.');

  const front = names[0], back = names.at(-1), w = cfg.traceW;
  const net = opt.net || 'COIL';
  const seam = (cfg.terminalAngle ?? -90) * Math.PI / 180;
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const wrap = a => ((a - seam) % TAU + TAU) % TAU;
  const circuit = busCircuit();
  const terminals = inst.map(it => coil.terminals.map((t, i) => {
    const a = Math.atan2(t[1], t[0]) + it.angle;
    const r = Math.hypot(...t);
    return { point: polar(r, a), angle: seam + wrap(a), r, id: `C${it.index + 1}.${i + 1}` };
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
    circuit.arc(r, a, b);
  };
  const spoke = (t, r, role, phase) => {
    const end = polar(r, t.angle);
    A.tracks.push(track(front, w, [t.point, end], { role, net, phase }));
    A.vias.push(via(...end, { drill: cfg.viaDrill, diameter: cfg.viaPad, net, role: 'bus-drop' }));
    circuit.spoke(t, r);
  };
  const terminal = (r, name, phase) => {
    const [x, y] = polar(r, seam);
    A.pads.push(pad(x, y, { w: cfg.padSize, drill: cfg.padDrill, number: name, net, role: name === 'N' ? 'neutral-terminal' : 'phase-terminal' }));
    A.ports.push({ x, y, name, net, angle: seam });
    const [lx, ly] = polar(r, seam + Math.max(0.055, (cfg.padSize / 2 + 1) / r));
    A.labels.push(label(lx, ly, name, { size: 0.8 }));
    return circuit.tap(r, seam, portName(name));
  };
  const neutralEnds = [], inputs = [];
  for (let phase = 0; phase < cfg.phases; phase++) {
    const group = inst.filter(it => it.phase === phase).map(it => ({ index: it.index, ends: terminals[it.index] }))
      .sort((a, b) => a.ends[0].angle - b.ends[0].angle);
    const r = r0 + phase * lane;
    inputs.push(phasePads ? terminal(r, phaseName(phase), phase) : group[0].ends[0].id);
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
  const neutral = neutralPad ? terminal(rN, 'N') : neutralEnds[0].t.id;
  for (const { t, phase } of neutralEnds) spoke(t, rN, 'star-return', phase);
  const neutralAngles = neutralEnds.map(e => e.t.angle);
  arc(rN, neutralPad ? seam : Math.min(...neutralAngles), Math.max(...neutralAngles), 'star');
  A.meta.routed = true;
  A.meta.outerRadius = rN + cfg.padSize / 2;
  A.meta.circuit = circuit.finish(inputs, inputs.map(() => neutral), 'wye');
  const terminalNote = neutralPad ? `${cfg.phases} phase terminals plus exposed neutral N`
    : phasePads ? `${cfg.phases} phase terminals; neutral N stays internal`
      : `no grouped terminal pads or breakout tails; phase inputs are ${Array.from({ length: cfg.phases }, (_, p) => `${String.fromCharCode(65 + p)} at C${p + 1}.1`).join(', ')}. Star and same-phase interconnections remain enabled`;
  A.notes.push({ level: 'info', text: `Star connection: ${terminalNote}, with coils in ${cfg.coilSeries ? 'series' : 'parallel'}. Spokes on ${front}, links on ${back}; routing adds an outer collar. The continuous winding uses one KiCad net (${net}); phase names identify winding taps, not isolated copper nets.` });
  return A;
}
