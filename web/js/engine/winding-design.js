/* Signed coil phasors and explicit series branches in parallel per phase.
   Angles are relative to coil 1; rotating the complete stator changes only
   the common electrical reference. Inter-coil mutual inductance is omitted. */
const TAU = 2 * Math.PI;
export const phaseAngle = (phase, phases) => phase * (phases === 2 ? Math.PI / 2 : TAU / phases);
export function windingSchedule(cfg) {
  const n = cfg.coilCount, phases = cfg.phases;
  if (!Number.isInteger(n) || n < 3 || n > 48 || !Number.isInteger(phases) || phases < 1 || phases > 6
    || !Number.isInteger(cfg.polePairs) || cfg.polePairs < 1 || cfg.polePairs > 30) throw new Error('Use 3–48 coils, 1–6 phases and 1–30 whole pole pairs.');
  if (cfg.windingMode === 'custom') {
    if (!Array.isArray(cfg.windingSchedule) || cfg.windingSchedule.length !== n) throw new Error('The winding schedule needs one assignment per coil. Use Automatic or reset the schedule after changing coil count.');
    return cfg.windingSchedule.map((s, i) => {
      if (!s || !Number.isInteger(s.phase) || s.phase < 0 || s.phase >= phases || ![1, -1].includes(s.polarity)
        || !Number.isInteger(s.branch) || s.branch < 1 || s.branch > 48) throw new Error(`Invalid phase, polarity or branch for coil ${i + 1}.`);
      return { phase: s.phase, polarity: s.polarity, branch: s.branch };
    });
  }
  if (cfg.windingMode && !['repeat', 'auto'].includes(cfg.windingMode)) throw new Error('Choose a supported winding assignment mode.');
  const counts = Array(phases).fill(0);
  return Array.from({ length: n }, (_, i) => {
    let phase = i % phases, polarity = 1;
    if (cfg.windingMode === 'auto') {
      let best = -Infinity;
      for (let p = 0; p < phases; p++) for (const sign of [1, -1]) {
        const score = sign * Math.cos(TAU * cfg.polePairs * i / n - phaseAngle(p, phases));
        if (score > best + 1e-9 || Math.abs(score - best) < 1e-9 && counts[p] < counts[phase]) { best = score; phase = p; polarity = sign; }
      }
    }
    counts[phase]++;
    return { phase, polarity, branch: cfg.coilSeries === false ? counts[phase] : 1 };
  });
}

export function windingPhasors(cfg) {
  const schedule = windingSchedule(cfg), phases = [];
  for (let phase = 0; phase < cfg.phases; phase++) {
    const byBranch = new Map();
    schedule.forEach((s, i) => {
      if (s.phase !== phase) return;
      if (!byBranch.has(s.branch)) byBranch.set(s.branch, []);
      byBranch.get(s.branch).push(i);
    });
    const branches = [...byBranch].sort((a, b) => a[0] - b[0]).map(([branch, coils]) => {
      let re = 0, im = 0;
      for (const i of coils) { const a = TAU * cfg.polePairs * i / cfg.coilCount; re += schedule[i].polarity * Math.cos(a); im += schedule[i].polarity * Math.sin(a); }
      return { branch, coils, re, im, kd: Math.hypot(re, im) / coils.length };
    });
    const conductance = branches.reduce((s, b) => s + 1 / b.coils.length, 0);
    const resistanceFactor = conductance ? 1 / conductance : 0;
    const re = branches.reduce((s, b) => s + b.re / b.coils.length, 0) * resistanceFactor;
    const im = branches.reduce((s, b) => s + b.im / b.coils.length, 0) * resistanceFactor;
    const effectiveTurns = branches.length * resistanceFactor;
    const mismatch = branches.some(b => Math.hypot(b.re - re, b.im - im) > 0.01 * Math.max(1, effectiveTurns));
    phases.push({ phase, branches, re, im, resistanceFactor, effectiveTurns,
      kd: effectiveTurns ? Math.hypot(re, im) / effectiveTurns : 0, angle: Math.atan2(im, re), mismatch });
  }
  const sequence = sign => {
    let re = 0, im = 0;
    for (const p of phases) { const a = sign * phaseAngle(p.phase, cfg.phases); re += p.re * Math.cos(a) - p.im * Math.sin(a); im += p.re * Math.sin(a) + p.im * Math.cos(a); }
    return Math.hypot(re, im);
  };
  const forward = sequence(1), reverse = sequence(-1), coherent = Math.max(forward, reverse);
  const turns = phases.reduce((s, p) => s + p.effectiveTurns, 0);
  const kd = coherent < 1e-10 ? 0 : coherent / Math.max(turns, 1e-12);
  const magnitudes = phases.map(p => Math.hypot(p.re, p.im));
  return { schedule, phases, kd, effectiveTurns: turns / cfg.phases,
    sequence: forward >= reverse ? 1 : -1,
    balanced: phases.every(p => p.branches.length) && Math.max(...magnitudes) - Math.min(...magnitudes) < 0.01 * Math.max(...magnitudes, 1e-12)
      && phases.every(p => Math.abs(p.resistanceFactor - phases[0].resistanceFactor) < 1e-9),
    parallelMismatch: phases.some(p => p.mismatch) };
}

export function compatibleWindings(cfg) {
  const result = [];
  for (let polePairs = 1; polePairs <= 30; polePairs++) {
    const c = { ...cfg, polePairs, windingMode: 'auto' }, w = windingPhasors(c);
    const kp = Math.abs(Math.sin(polePairs * cfg.spanDeg * Math.PI / 360));
    if (w.balanced && !w.parallelMismatch && w.kd > 0.7) result.push({ polePairs, kw: kp * w.kd, kd: w.kd });
  }
  return result.sort((a, b) => b.kw - a.kw || a.polePairs - b.polePairs).slice(0, 5);
}
