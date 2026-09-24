/* Experimental four-layer PCB Litz geometry.
 *
 * The twelve perimeter positions and four centre positions of a 4 × 4
 * cross-section circulate independently.  A strand advances one position per
 * step. Adjacent-layer via fanouts are staggered at 1/3 and 2/3 of a step:
 * placing the three edge vias at the same XY would short the braid.
 *
 * This is a reproducible paper-inspired construction, not a reconstruction of
 * the paper's unpublished PCB files or its exact 1,140-via routing pattern.
 */
import { artwork, track } from './artwork.js';

const TAU = 2 * Math.PI;
const OZ_MM = 0.0348;
const COPPER = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
const COLORS = ['#C83434', '#7FC64D', '#CC7FCC', '#4CC3BD'];
const OUTER = [[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[3,3],[3,2],[3,1],[3,0],[2,0],[1,0]];
const INNER = [[1,1],[1,2],[2,2],[2,1]];

export function litzDefaults() {
  return { windingMode: 'spiral', litzStepDeg: 30, litzStrandGap: 0.2,
    litzTurnSpacing: 5.5, litzDielectricGaps: [0.4, 0.5, 0.4],
    litzViaDrill: 0.3, litzViaDiameter: 0.6, litzViaPlating: 25 };
}

export function litzPreset() {
  return { ...litzDefaults(), windingMode: 'pcb-litz', shape: 'circle',
    dOuter: 160, dInner: 69, turns: 5, traceW: 0.8, traceS: 5.5,
    copperOz: 0.07 / OZ_MM, boardT: 1.58, layers: 4, connection: 'parallel',
    freq: 6.78e6, viaDrill: 0.3, viaPad: 0.6, padSize: 1.6,
    obstacleEnabled: false, arrayEnabled: false, motorGeometry: false };
}

function requireNumber(value, label, lo, hi) {
  if (!Number.isFinite(value) || value < lo || value > hi) {
    throw new Error(`PCB Litz: ${label} must be between ${lo} and ${hi}.`);
  }
  return value;
}

function length(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j]));
  return total;
}

/** All dimensions and returned coordinates are millimetres. */
export function buildLitz(input, opt = {}) {
  const cfg = { ...litzDefaults(), ...input };
  const width = requireNumber(cfg.traceW, 'trace width (mm)', 0.1, 3);
  const gap = requireNumber(cfg.litzStrandGap, 'strand clearance (mm)', 0.1, 2);
  const turnGap = requireNumber(cfg.litzTurnSpacing, 'turn spacing (mm)', 0.2, 30);
  const dOuter = requireNumber(cfg.dOuter, 'outer diameter (mm)', 20, 1000);
  const turns = requireNumber(cfg.turns, 'turn count', 1, 30);
  if (!Number.isInteger(turns)) throw new Error('PCB Litz: use an integer turn count to finish every transposition cycle.');
  if (cfg.layers !== 4 || cfg.shape !== 'circle') throw new Error('PCB Litz currently supports a circular winding on exactly four copper layers.');
  if (![7.5, 15, 30].includes(cfg.litzStepDeg)) throw new Error('PCB Litz: step angle must be 7.5°, 15°, or 30°.');
  if (cfg.obstacleEnabled || cfg.arrayEnabled || cfg.motorGeometry) throw new Error('PCB Litz cannot be combined with obstacle, array, or motor routing.');
  const drill = requireNumber(cfg.litzViaDrill, 'via drill (mm)', 0.1, 1);
  const diameter = requireNumber(cfg.litzViaDiameter, 'via diameter (mm)', 0.25, 2);
  if (diameter - drill < 0.15 - 1e-9) throw new Error('PCB Litz: via diameter must exceed drill by at least 0.15 mm.');
  requireNumber(cfg.litzViaPlating, 'via plating (µm)', 10, 100);
  const tCu = requireNumber(cfg.copperOz, 'copper weight (oz)', 0.25, 6) * OZ_MM;
  const gaps = cfg.litzDielectricGaps;
  if (!Array.isArray(gaps) || gaps.length !== 3) throw new Error('PCB Litz requires three dielectric thicknesses.');
  gaps.forEach((g, i) => requireNumber(g, `dielectric ${i + 1} thickness (mm)`, 0.05, 3));
  const boardT = gaps.reduce((s, g) => s + g, 0) + 4 * tCu;
  if (!Number.isFinite(cfg.boardT) || Math.abs(cfg.boardT - boardT) > 0.005) throw new Error(`PCB Litz: board thickness must match the specified dielectric and copper stack (${boardT.toFixed(3)} mm).`);
  const names = opt.layerNames || cfg.layerNames || COPPER;
  if (!Array.isArray(names) || names.length !== 4 || new Set(names).size !== 4 || names.some(n => !/^(F|B|In\d+)\.Cu$/.test(n))) {
    throw new Error('PCB Litz requires four distinct copper layer names in stack order.');
  }
  const copperOrder = name => name === 'F.Cu' ? 0 : name === 'B.Cu' ? 32 : Number(name.match(/\d+/)?.[0]);
  if (names.some((name, i) => i && copperOrder(name) <= copperOrder(names[i - 1]))) throw new Error('PCB Litz copper layers must be in physical top-to-bottom stack order.');
  let z = -boardT / 2 + tCu / 2;
  const layers = names.map((name, index) => {
    if (index) z += gaps[index - 1] + tCu;
    return { name, index, z, t: tCu, color: COLORS[index] };
  });
  const stepAngle = cfg.litzStepDeg * Math.PI / 180;
  const steps = Math.round(turns * 360 / cfg.litzStepDeg);
  if (16 * turns * Math.PI * dOuter / 0.45 > 400000) throw new Error('PCB Litz: this design exceeds the experimental geometry size limit. Reduce diameter or turns.');
  // A small explicit routing allowance preserves clearance along slanted runs.
  const lanePitch = (width + gap) * 1.05;
  const ribbonWidth = 3 * lanePitch + width;
  const pitch = ribbonWidth + turnGap;
  const r0 = dOuter / 2 - width / 2 - 3 * lanePitch;
  const rMin = r0 - turns * pitch;
  // Keep a coordinate-quantization allowance at the tightest fanout junctions,
  // including downstream tools that round XY coordinates to three decimals.
  const fan = Math.max(width + gap, diameter + gap) * 1.27 + 0.003;
  const innerFan = (width + gap) * 0.7;
  if (diameter > width + 2 * gap) throw new Error('PCB Litz: via diameter is too large for the strand spacing. Reduce via diameter or increase strand clearance.');
  if (rMin < Math.max(3 * fan + 2, width * 3)) throw new Error('PCB Litz: the turns and conductor spacing do not fit inside this diameter. Reduce turns or increase outer diameter.');
  if (rMin * stepAngle < 12 * fan) throw new Error('PCB Litz: the transposition steps are too short at the inner turn for these trace/via dimensions. Increase step angle or outer diameter, or reduce turns.');
  if (turnGap < 4 * fan + gap + width * 0.25) throw new Error('PCB Litz: turn spacing is too small for the layer-transition fanouts. Increase turn spacing or reduce trace/via size.');

  const art = artwork({ name: opt.name || 'PCB Litz experimental', kind: 'pcb-litz',
    exactPaths: true, layerNames: names.slice(), boardThicknessMM: boardT,
    experimental: true, copperThicknessMM: tCu, dielectricThicknessMM: gaps.slice() });
  const net = opt.net || 'LITZ';
  const at = (step, phase, transverse) => {
    const angle = (step + phase) * stepAngle;
    const radius = r0 - pitch * angle / TAU + transverse;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  };
  const strands = [];
  const transpositions = {};
  for (const [bundle, ring, firstID] of [['outer', OUTER, 0], ['inner', INNER, 12]]) {
    const states = Array.from({ length: steps + 1 }, (_, step) => ring.map((_, slot) => firstID + (slot - step % ring.length + ring.length) % ring.length));
    transpositions[bundle] = { slots: ring.length, steps, completeCycles: steps / ring.length, states };
    for (let initial = 0; initial < ring.length; initial++) {
      const id = firstID + initial;
      const strand = { id, bundle, sections: [], vias: [], path3: [], positions: [] };
      const addSection = (layerIndex, pts, step, slot) => {
        const sequence = strand.sections.length;
        const section = { layer: names[layerIndex], layerIndex, pts, sequence, sectionIndex: sequence,
          strandId: id, transpositionStep: step, slot };
        strand.sections.push(section);
        art.tracks.push(track(section.layer, width, pts, { net, role: 'litz-strand', strandId: id,
          bundle, sectionIndex: sequence, sequence, transpositionStep: step, slot }));
        for (const p of pts) {
          const p3 = [p[0], p[1], layers[layerIndex].z];
          const previous = strand.path3[strand.path3.length - 1];
          if (!previous || Math.hypot(...p3.map((v, j) => v - previous[j])) > 1e-10) strand.path3.push(p3);
        }
      };
      const sample = (step, a, b, transverse) => {
        // <=0.45 mm chords keep curvature error below the clearance allowance.
        const radius = r0 - pitch * step * stepAngle / TAU + 3 * lanePitch + 3 * fan;
        const count = Math.max(3, Math.ceil(radius * stepAngle * (b - a) / 0.45));
        return Array.from({ length: count + 1 }, (_, i) => {
          const phase = a + (b - a) * i / count;
          return at(step, phase, transverse(phase));
        });
      };
      const start = at(0, 0, ring[initial][1] * lanePitch);
      addSection(ring[initial][0], [[start[0], start[1] - 2], start], -1, initial);
      for (let step = 0; step < steps; step++) {
        const slot = (initial + step) % ring.length;
        const [fromLayer, fromColumn] = ring[slot];
        const [toLayer, toColumn] = ring[(slot + 1) % ring.length];
        strand.positions.push({ step, slot, layer: names[fromLayer], column: fromColumn,
          point: at(step, 0, fromColumn * lanePitch) });
        if (fromLayer === toLayer) {
          addSection(fromLayer, sample(step, 0, 1, phase => (fromColumn + phase * (toColumn - fromColumn)) * lanePitch), step, slot);
        } else {
          const right = fromColumn > 1;
          const phase = bundle === 'inner' ? 0.5 : right ? 1 / 3 : 2 / 3;
          const offset = bundle === 'inner' ? innerFan : fan * (right ? 3 - fromLayer : fromLayer);
          const signed = right ? offset : -offset;
          const transverse = f => fromColumn * lanePitch + signed * (f <= phase ? f / phase : (1 - f) / (1 - phase));
          addSection(fromLayer, sample(step, 0, phase, transverse), step, slot);
          const [x, y] = at(step, phase, transverse(phase));
          const v = { x, y, drill, diameter, net, role: 'litz-transposition', strandId: id, bundle,
            from: names[Math.min(fromLayer, toLayer)], to: names[Math.max(fromLayer, toLayer)], fromIndex: fromLayer, toIndex: toLayer,
            zFrom: layers[fromLayer].z, zTo: layers[toLayer].z,
            traversalFrom: names[fromLayer], traversalTo: names[toLayer],
            viaType: 'blind_buried', afterSection: strand.sections.length - 1, transpositionStep: step };
          strand.vias.push(v); art.vias.push(v);
          addSection(toLayer, sample(step, phase, 1, transverse), step, slot);
        }
      }
      const finalSlot = (initial + steps) % ring.length;
      const end = at(steps, 0, ring[finalSlot][1] * lanePitch);
      addSection(ring[finalSlot][0], [end, [end[0], end[1] + 2]], steps, finalSlot);
      strand.positions.push({ step: steps, slot: finalSlot, layer: names[ring[finalSlot][0]],
        column: ring[finalSlot][1], point: at(steps, 0, ring[finalSlot][1] * lanePitch) });
      strand.traceLengthMM = strand.sections.reduce((s, section) => s + length(section.pts), 0);
      strand.viaLengthMM = strand.vias.reduce((s, v) => s + Math.abs(v.zTo - v.zFrom), 0);
      strand.lengthMM = strand.traceLengthMM + strand.viaLengthMM;
      strands.push(strand);
    }
  }
  const terminalGroups = ['start', 'end'].map((id, end) => {
    const members = strands.map(s => {
      const section = end ? s.sections[s.sections.length - 1] : s.sections[0];
      return { strandId: s.id, point: (end ? section.pts[section.pts.length - 1] : section.pts[0]).slice(), layer: section.layer };
    });
    const padRadius = end ? rMin - 2 : r0 + 3 * lanePitch + 2;
    const angle = end ? turns * TAU : 0;
    const padPoint = [padRadius * Math.cos(angle), padRadius * Math.sin(angle) + (end ? 2 : -2)];
    // Each bus is split at the actual strand contact points so contacts are
    // explicit graph vertices, not inferred from a broad copper polygon.
    for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
      const points = members.filter(m => m.layer === names[layerIndex]).map(m => m.point)
        .sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      if (end) points.unshift(padPoint); else points.push(padPoint);
      for (let i = 1; i < points.length; i++) art.tracks.push(track(names[layerIndex], width,
        [points[i - 1], points[i]], { net, role: 'terminal-bus', terminalGroup: id }));
    }
    art.pads.push({ x: padPoint[0], y: padPoint[1], w: 1.6, h: 1.6, shape: 'circle',
      drill: 0.8, number: String(end + 1), net, layer: '*.Cu', role: 'terminal-bus', terminalGroup: id });
    art.ports.push({ x: padPoint[0], y: padPoint[1], name: end ? '2' : '1', net, angle: 0 });
    return { id, members, padPoint, padLayers: names.slice() };
  });
  art.meta.terminalGroups = terminalGroups;
  art.labels.push({ x: art.ports[0].x + 1.5, y: 0, text: '1', layer: 'F.SilkS', size: 1 });
  art.labels.push({ x: art.ports[1].x - 2, y: 0, text: '2', layer: 'F.SilkS', size: 1 });
  art.notes.push({ level: 'warning', text: 'Experimental PCB Litz: requires adjacent-layer blind/buried vias and a fabricator-approved sequential-lamination stack.' });
  art.notes.push({ level: 'info', text: 'Paper-inspired 16-strand dual-bundle winding. This perimeter permutation and terminal fanout differ from the published 1,140-via example; no measured Q or WPT efficiency is implied.' });
  const lengths = strands.map(s => s.lengthMM);
  let copperRadius = 0, boreRadius = Infinity;
  for (const t of art.tracks.filter(t => t.role !== 'terminal-bus')) for (const p of t.pts) {
    const r = Math.hypot(...p);
    copperRadius = Math.max(copperRadius, r + t.width / 2);
    boreRadius = Math.min(boreRadius, r - t.width / 2);
  }
  for (const v of art.vias) {
    const r = Math.hypot(v.x, v.y);
    copperRadius = Math.max(copperRadius, r + v.diameter / 2);
    boreRadius = Math.min(boreRadius, r - v.diameter / 2);
  }
  const stats = { strandCount: 16, outerStrands: 12, innerStrands: 4,
    viaCount: art.vias.length, outerViaCount: strands.filter(s => s.bundle === 'outer').reduce((n, s) => n + s.vias.length, 0),
    innerViaCount: strands.filter(s => s.bundle === 'inner').reduce((n, s) => n + s.vias.length, 0),
    ribbonWidthMM: ribbonWidth, lanePitchMM: lanePitch, pitchMM: pitch,
    innerDiameterMM: 2 * boreRadius, outerDiameterMM: 2 * copperRadius,
    nominalInnerDiameterMM: 2 * (rMin - width / 2), nominalOuterDiameterMM: dOuter,
    completeCycles: steps / OUTER.length, stepDeg: cfg.litzStepDeg, steps,
    traceLengthMM: strands.reduce((n, s) => n + s.traceLengthMM, 0),
    minStrandLengthMM: Math.min(...lengths), maxStrandLengthMM: Math.max(...lengths) };
  art.notes.push({ level: 'info', text: `The ${dOuter.toFixed(1)} mm nominal spiral expands to ${stats.outerDiameterMM.toFixed(2)} mm winding diameter at the via fanouts, with a ${stats.innerDiameterMM.toFixed(2)} mm winding bore. Terminal pads require additional board area.` });
  return { art, strands, layers, stats, terminalGroups, transpositions,
    config: { ...cfg, boardT, layerNames: names.slice(), layerZMM: layers.map(l => l.z),
      copperThicknessMM: tCu, lanePitchMM: lanePitch, ribbonWidthMM: ribbonWidth, pitchMM: pitch } };
}
