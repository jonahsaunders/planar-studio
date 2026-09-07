/* Two isolated, concentric, air-core PCB windings on opposite outer layers.
   All electrical calculations use the same polylines emitted as artwork. */
import { buildCoil, toFilaments, inductanceOf, discretisationCorrection, mutualOf, OZ_MM, RHO_CU20, ALPHA_CU } from './coil.js';
import { artwork, track, pad, rect, bounds } from './artwork.js';

export function buildTransformer(c, env = {}, opt = {}) {
  for (const key of ['primaryTurns', 'secondaryTurns', 'dOuter', 'traceW', 'traceS', 'boardT', 'copperOz', 'freq', 'current', 'secondaryCurrent', 'ppt']) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`${key} must be positive and finite.`);
  }
  if (!Number.isFinite(c.tempC) || c.tempC < -40 || c.tempC > 125 || !['circle', 'polygon'].includes(c.shape) || !Number.isInteger(c.primaryTurns) || !Number.isInteger(c.secondaryTurns) || Math.max(c.primaryTurns, c.secondaryTurns) > 60 || c.ppt < 24 || c.ppt > 256 || c.dOuter > 200 || c.boardT < 0.1 || c.boardT > 10 || c.freq > 1e8) throw new Error('Transformer parameters are outside the supported design range.');
  if (env.board?.layerCount < 2) throw new Error('The transformer requires two separate copper layers.');
  const art = artwork({ name: env.name || 'T1', kind: 'transformer' });
  const names = ['F.Cu', 'B.Cu'];
  const coils = [c.primaryTurns, c.secondaryTurns].map((turns, i) => {
    const cfg = { ...c, turns, layers: 1, sides: 4, fillet: 1.2, connection: 'series', padSize: c.traceW, arrayEnabled: false };
    const coil = buildCoil(cfg);
    if (Math.abs(coil.spiral.turnsUsed - turns) > 0.001 || coil.innerR < c.traceW) throw new Error('Requested turns do not fit. Increase outer diameter or reduce turns, width or clearance.');
    // Pads are exactly track width: an inner terminal must not bridge turns.
    const pts = coil.layers[0].pts;
    const net = `${String(env.name || 'T1').replace(/[^a-zA-Z0-9_.-]/g, '_')}_${i === 0 ? 'PRI' : 'SEC'}`;
    art.tracks.push(track(names[i], c.traceW, pts, { net, role: i === 0 ? 'primary' : 'secondary' }));
    [pts[0], pts.at(-1)].forEach(([x, y], j) => {
      const number = String(i * 2 + j + 1);
      art.pads.push(pad(x, y, { w: c.traceW, number, net, layer: names[i], role: 'terminal' }));
      art.ports.push({ x, y, name: `${i ? 'S' : 'P'}${j + 1}${j === 0 ? ' (dot)' : ''}`, net });
    });
    return pts.map(([x, y]) => [x, y, i * c.boardT]);
  });
  const R = c.dOuter / 2 + 2;
  art.outline.push({ layer: 'Edge.Cuts', pts: rect(-R, -R, R, R) });
  const notes = [{ level: 'info', text: 'Air-core partial-inductance model: no ferrite core, shielding, interwinding capacitance, skin/proximity losses or external return paths. Use below self-resonance; this is not a power-transformer rating.' }, { level: 'warn', text: 'Inner terminals P2 and S2 are enclosed by their windings. Use insulated jumpers or a separately designed breakout layer. Do not add through vias across the opposite winding.' }, { level: 'info', text: 'Pads 1–2 are primary (front); 3–4 are secondary (back). Dotted terminals are 1 and 3. Winding nets remain separate; board dielectric thickness is not an isolation-voltage rating.' }];
  if (env.board?.layerCount > 2) notes.push({ level: 'warn', text: 'Keep intermediate copper planes clear of both windings. Eddy currents in planes or shields are not modeled.' });
  const result = { art, layers: names, bounds: bounds(art), notes };
  if (opt.quick) return result;
  const cap = opt.segmentCap || 1800, step = Math.max(0.12, Math.min(0.8, (c.traceW + c.traceS) * 0.6));
  const F = coils.map(p => toFilaments([p], step, cap));
  const w = c.traceW * 1e-3, t = c.copperOz * OZ_MM * 1e-3;
  const L = F.map(f => inductanceOf(f, w, t, discretisationCorrection(f.totalLen / f.n, w, t)));
  const M = mutualOf(F[0], F[1], 0), k = M / Math.sqrt(L[0] * L[1]);
  if (!L.every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(k) || Math.abs(k) >= 1) throw new Error('Coupling failed the physical |k| < 1 bound. Increase layer separation or solver resolution.');
  const rho = RHO_CU20 * (1 + ALPHA_CU * (c.tempC - 20));
  const resistance = F.map(f => rho * f.totalLen / (w * t));
  result.analysis = { L1: L[0], L2: L[1], M, k, ratio: c.primaryTurns / c.secondaryTurns, R1: resistance[0], R2: resistance[1], leakage: L[0] * (1 - k * k), induced: 2 * Math.PI * c.freq * Math.abs(M) * c.current, loss: c.current ** 2 * resistance[0] + c.secondaryCurrent ** 2 * resistance[1] };
  return result;
}
