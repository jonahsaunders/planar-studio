/* Geometry-based, floating pair-capacitance approximation for PCB Litz.
 * Copper-path potentials are interpolated along each winding. This is a
 * positive electrostatic energy approximation, NOT a Maxwell capacitance
 * extraction: broadside parallel plates and equivalent round-wire fringing
 * neglect shielding, via pads and the surrounding board/environment.
 */
import { EPS0, toFilaments } from './coil.js';

const length2 = pts => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

function traceSegments(cfg, geometry, sampleCount) {
  const layers = new Map(geometry.layers.map(l => [l.name, l.z]));
  const all = [];
  for (let strand = 0; strand < geometry.strands.length; strand++) {
    const s = geometry.strands[strand], lengths = s.sections.map(section => length2(section.pts));
    const viaLength = (s.vias || []).reduce((sum, via) => sum + Math.abs(via.zTo - via.zFrom), 0);
    const total = lengths.reduce((a, b) => a + b, 0) + viaLength;
    let before = 0;
    for (let sectionIndex = 0; sectionIndex < s.sections.length; sectionIndex++) {
      const section = s.sections[sectionIndex], z = layers.get(section.layer);
      const F = toFilaments([section.pts.map(p => [p[0], p[1], z])], Math.max(0.05, total / sampleCount), sampleCount);
      const numericalLength = F.ln.reduce((a, b) => a + b, 0);
      let local = 0;
      for (let i = 0; i < F.n; i++) {
        const l = F.ln[i], fraction = (before + (local + l / 2) / numericalLength * lengths[sectionIndex]) / total;
        all.push({ strand, fraction, l, x: F.mx[i], y: F.my[i], z: F.mz[i], ux: F.dx[i] / l, uy: F.dy[i] / l });
        local += l;
      }
      before += lengths[sectionIndex];
      for (const via of s.vias || []) if (via.afterSection === sectionIndex) before += Math.abs(via.zTo - via.zFrom);
    }
  }
  return all;
}

/** Coefficients are Farads, path fractions are measured from winding start.
 * A caller must stamp C*(Va(fa)-Vb(fb))²; never add these values to ground.
 */
export function prepareLitzCapacitance(cfg, geometry, options = {}) {
  const samples = Math.max(32, Math.min(512, Math.round(options.samples || cfg.litzCapacitanceSamples || 128)));
  const width = geometry.config?.traceW * 1e-3 || cfg.traceW * 1e-3;
  const thickness = (geometry.config?.copperThicknessMM || cfg.copperOz * 0.0348) * 1e-3;
  const epsR = Math.max(1, Number(cfg.epsR) || 4.4);
  const turnFraction = 0.5 / Math.max(1, Number(cfg.turns) || 1);
  const reach = Math.max(width * 8, (geometry.stats?.pitchMM || width * 3) * 1e-3 * 1.25);
  const segments = traceSegments(cfg, geometry, samples), couplings = [];
  const totals = { interstrand: 0, interturn: 0, interlayer: 0 };
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j];
      if (a.strand === b.strand && Math.abs(a.fraction - b.fraction) < turnFraction) continue;
      const dot = a.ux * b.ux + a.uy * b.uy;
      if (Math.abs(dot) < 0.92) continue;
      const dx = a.x - b.x, dy = a.y - b.y, dz = Math.abs(a.z - b.z);
      const along = dx * b.ux + dy * b.uy;
      if (Math.abs(along) > (a.l + b.l) / 2) continue;
      const lateral = Math.abs(-b.uy * dx + b.ux * dy);
      if (lateral > reach || dz > reach) continue;
      const halfA = a.l * Math.abs(dot) / 2;
      const overlap = Math.min(b.l / 2, along + halfA) - Math.max(-b.l / 2, along - halfA);
      if (!(overlap > 1e-12)) continue;
      const distance = Math.hypot(lateral, dz);
      // Equivalent-wire capacitance supplies a coarse fringing estimate. The
      // plate expression dominates overlapping broadside traces on two layers.
      const wire = Math.PI * EPS0 * (1 + epsR) / 2
        / Math.acosh(Math.max(1.05, distance / Math.max(width / 2, 1e-9)));
      const plate = dz > thickness && lateral < width
        ? EPS0 * epsR * (width - lateral) / (dz - thickness) : 0;
      const capacitance = Math.max(wire, plate) * overlap;
      const category = dz > thickness / 2 ? 'interlayer'
        : Math.abs(a.fraction - b.fraction) > turnFraction ? 'interturn' : 'interstrand';
      if (!(capacitance > 0 && Number.isFinite(capacitance))) continue;
      totals[category] += capacitance;
      couplings.push({ a: a.strand, b: b.strand, fa: a.fraction, fb: b.fraction, C: capacitance, category });
    }
  }
  return { couplings, totals, pairCount: couplings.length, sampleCount: samples, segmentCount: segments.length,
    method: 'Floating local parallel-plate / equivalent-wire pair capacitance with interpolated winding potentials',
    validated: false, limitations: [
      'Local pair estimates omit shielding, remote conductors, solder mask, via-pad capacitance and the board environment; this is not a Maxwell capacitance extraction.',
      'Winding potentials are interpolated between a small number of circuit nodes. Refine both circuit cells and capacitance sampling before interpreting a resonance.',
      'The sum of physical pair capacitances is not the terminal capacitance. Each pair is weighted by its actual circuit-node voltage difference.',
    ] };
}
