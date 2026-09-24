/* Generic, editable screening rules; these are not a fabricator capability claim. */
import { copperStack, viaSpan } from './artwork.js';
import { validateLitz } from './litz-validation.js';
import { segmentDistance } from './boardcheck.js';

const PAIRS = ['F.Cu-In1.Cu', 'In1.Cu-In2.Cu', 'In2.Cu-B.Cu'];
export const FAB_PROFILES = {
  experimental: { minClearance: 0.15, minAnnulus: 0.1, minDrill: 0.2, minPlating: 20, maxAspectRatio: 3, allowedViaPairs: PAIRS, etchAllowance: 0 },
  conservative: { minClearance: 0.2, minAnnulus: 0.15, minDrill: 0.3, minPlating: 25, maxAspectRatio: 2, allowedViaPairs: PAIRS, etchAllowance: 0.05 },
};
const num = v => Number.isFinite(v) ? Number(v.toFixed(5)) : null;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function fabRules(cfg = {}) {
  const profile = cfg.litzFabProfile || 'experimental';
  if (![...Object.keys(FAB_PROFILES), 'custom'].includes(profile)) throw new Error('Unknown PCB Litz fabrication profile.');
  const base = FAB_PROFILES[profile === 'custom' ? 'experimental' : profile];
  const rules = { ...base, ...(cfg.litzFabRules || {}), allowedViaPairs: [...(cfg.litzFabRules?.allowedViaPairs || base.allowedViaPairs)] };
  for (const key of ['minClearance', 'minAnnulus', 'minDrill', 'minPlating', 'maxAspectRatio', 'etchAllowance']) {
    if (!Number.isFinite(rules[key]) || rules[key] < 0 || ['minDrill', 'minPlating', 'maxAspectRatio'].includes(key) && rules[key] === 0) throw new Error(`Invalid fabrication rule: ${key}.`);
  }
  if (!Array.isArray(rules.allowedViaPairs) || !rules.allowedViaPairs.length || rules.allowedViaPairs.some(p => typeof p !== 'string' || !/^(F|In\d+)\.Cu-(In\d+|B)\.Cu$/.test(p))) throw new Error('allowedViaPairs must list canonical front-to-back layer pairs, for example F.Cu-In1.Cu.');
  if (rules.copperThicknessMM != null && (!Number.isFinite(rules.copperThicknessMM) || rules.copperThicknessMM <= 0)) throw new Error('Invalid copperThicknessMM fabrication rule.');
  if (rules.dielectricThicknessMM != null && (!Array.isArray(rules.dielectricThicknessMM) || rules.dielectricThicknessMM.some(g => !Number.isFinite(g) || g <= 0))) throw new Error('Invalid dielectricThicknessMM fabrication rule.');
  return rules;
}

function checkEdges(art, required) {
  const loops = (art.outline || []).filter(o => o.layer === 'Edge.Cuts').map(o => o.pts);
  if (!loops.length) return { ok: false, code: 'outline-missing', message: 'Add a closed Edge.Cuts outline before generating fabrication outputs. Copper-only export or native placement may use an existing board outline.', minClearance: null };
  if (loops.some(p => !Array.isArray(p) || p.length < 4 || p.some(q => !Array.isArray(q) || q.length !== 2 || q.some(v => !Number.isFinite(v))) || Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) > 1e-6)) return { ok: false, code: 'outline', message: 'Add closed, finite Edge.Cuts loops before generating fabrication outputs.', minClearance: null };
  if (!Number.isFinite(required) || required < 0) return { ok: false, message: 'Copper-to-edge clearance must be finite and nonnegative.', minClearance: null };
  const cell = Math.max(2, required * 2), grid = new Map(), edges = [];
  const cells = (a, b, r, visit) => {
    for (let x = Math.floor((Math.min(a[0], b[0]) - r) / cell); x <= Math.floor((Math.max(a[0], b[0]) + r) / cell); x++)
      for (let y = Math.floor((Math.min(a[1], b[1]) - r) / cell); y <= Math.floor((Math.max(a[1], b[1]) + r) / cell); y++) visit(`${x}:${y}`);
  };
  for (const loop of loops) for (let i = 1; i < loop.length; i++) {
    const edge = { a: loop[i - 1], b: loop[i], id: edges.length }; edges.push(edge);
    cells(edge.a, edge.b, 0, key => { if (!grid.has(key)) grid.set(key, []); grid.get(key).push(edge); });
  }
  const inside = p => {
    let yes = false;
    for (const {a, b} of edges) if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    return yes;
  };
  let violations = 0, min = Infinity;
  const check = (a, b, radius) => {
    const seen = new Set();
    cells(a, b, radius + required, key => {
      for (const e of grid.get(key) || []) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        const gap = segmentDistance(a, b, e.a, e.b) - radius;
        min = Math.min(min, gap);
        if (gap < required - 1e-6) violations++;
      }
    });
  };
  for (const t of art.tracks) {
    if (t.pts.length && !inside(t.pts[0])) violations++;
    for (let i = 1; i < t.pts.length; i++) check(t.pts[i - 1], t.pts[i], t.width / 2);
  }
  for (const v of art.vias) { const p = [v.x, v.y]; if (!inside(p)) violations++; check(p, p, v.diameter / 2); }
  for (const v of art.pads) { const p = [v.x, v.y]; if (!inside(p)) violations++; check(p, p, v.shape === 'rect' ? Math.hypot(v.w, v.h) / 2 : Math.max(v.w, v.h) / 2); }
  return { ok: !violations, message: violations ? `Copper crosses the board outline, lies in a cutout, or violates the ${num(required)} mm copper-to-edge clearance.` : '', minClearance: num(min), violations };
}

export function validateManufacturing(geometry, input = {}, checkedGeometry = null) {
  checkedGeometry = checkedGeometry?.validation || checkedGeometry;
  const cfg = { ...geometry?.config, ...input }, errors = [], warnings = [];
  const fail = (code, message, detail = {}) => errors.push({ code, message, ...detail });
  const warn = (code, message) => warnings.push({ code, message });
  let rules, layers;
  try { rules = fabRules(cfg); layers = copperStack(geometry.art); }
  catch (e) { return { ok: false, errors: [{ code: 'rules', message: e.message }], warnings, summary: {}, viaPairs: [] }; }
  const depth = new Map((geometry.layers || []).map(l => [l.name, l.z]));
  const counts = new Map();
  let minAnnulus = Infinity, minDrill = Infinity, maxAspectRatio = 0;
  for (const v of geometry.art.vias) {
    let span;
    try { span = viaSpan(v, layers); }
    catch (e) { fail('via-span', e.message); continue; }
    const pair = `${span.from}-${span.to}`;
    if (!counts.has(pair)) counts.set(pair, { pair, from: span.from, to: span.to, count: 0, maxAspectRatio: 0, minDrill: Infinity });
    const row = counts.get(pair); row.count++;
    if (!rules.allowedViaPairs.includes(pair) && !errors.some(e => e.code === 'via-pair' && e.pair === pair)) fail('via-pair', `The selected rules do not allow ${pair}.`, { pair });
    const annulus = (v.diameter - v.drill) / 2 - rules.etchAllowance;
    const length = Math.abs(depth.get(span.to) - depth.get(span.from));
    // Hole manufacturing spans the outside faces of both endpoint copper foils.
    const aspect = (length + geometry.art.meta.copperThicknessMM) / v.drill;
    minAnnulus = Math.min(minAnnulus, annulus); minDrill = Math.min(minDrill, v.drill);
    maxAspectRatio = Math.max(maxAspectRatio, aspect);
    row.maxAspectRatio = Math.max(row.maxAspectRatio, aspect); row.minDrill = Math.min(row.minDrill, v.drill);
  }
  for (const p of geometry.art.pads.filter(p => p.drill > 0)) {
    minAnnulus = Math.min(minAnnulus, (Math.min(p.w, p.h) - p.drill) / 2 - rules.etchAllowance);
    minDrill = Math.min(minDrill, p.drill);
    maxAspectRatio = Math.max(maxAspectRatio, geometry.art.meta.boardThicknessMM / p.drill);
  }
  if (!Number.isFinite(minDrill) || minDrill + 1e-8 < rules.minDrill) fail('drill', `Minimum drill ${num(minDrill)} mm is below the ${rules.minDrill} mm rule.`);
  if (!Number.isFinite(minAnnulus) || minAnnulus + 1e-8 < rules.minAnnulus) fail('annulus', `Worst-case annulus after etch allowance is ${num(minAnnulus)} mm; at least ${rules.minAnnulus} mm is required.`);
  if (!Number.isFinite(maxAspectRatio) || maxAspectRatio > rules.maxAspectRatio + 1e-8) fail('aspect-ratio', `Maximum drilled aspect ratio ${num(maxAspectRatio)} exceeds ${rules.maxAspectRatio}.`);
  if (!Number.isFinite(cfg.litzViaPlating) || cfg.litzViaPlating < rules.minPlating) fail('plating', `Specified via plating must be at least ${rules.minPlating} µm.`);
  if (rules.copperThicknessMM != null && Math.abs(rules.copperThicknessMM - geometry.art.meta.copperThicknessMM) > 1e-6) fail('copper-stack', 'Copper thickness differs from the selected fabrication rules.');
  if (rules.dielectricThicknessMM != null && (!Array.isArray(rules.dielectricThicknessMM) || rules.dielectricThicknessMM.length !== layers.length - 1 || rules.dielectricThicknessMM.some((g, i) => !Number.isFinite(g) || Math.abs(g - geometry.art.meta.dielectricThicknessMM?.[i]) > 1e-6))) fail('dielectric-stack', 'Dielectric thicknesses differ from the selected fabrication rules.');
  const required = rules.minClearance + 2 * rules.etchAllowance;
  const geometryCheck = checkedGeometry && cfg.litzStrandGap >= required ? checkedGeometry : validateLitz(geometry, { ...cfg, litzStrandGap: required });
  if (!geometryCheck.ok) fail('copper-geometry', `Copper geometry fails screening at ${num(required)} mm nominal clearance (${rules.minClearance} mm finished clearance plus two etch allowances).`, { count: geometryCheck.errors.length });
  const edgeCheck = checkEdges(geometry.art, (cfg.litzEdgeClearance ?? geometry.art.meta.edgeClearanceMM ?? 0) + rules.etchAllowance);
  if (!edgeCheck.ok) fail(edgeCheck.code || 'outline', edgeCheck.message);
  warn('generic-profile', 'Generic screening rules are editable assumptions. The fabricator must approve the stack, blind/buried via sequence, plating, and registration tolerances.');
  warn('native-drc', 'These checks do not replace native KiCad DRC or the fabricator’s CAM review.');
  const summary = { profile: cfg.litzFabProfile || 'experimental', ruleClearanceMM: rules.minClearance, nominalClearanceRequiredMM: required,
    checkedClearanceMM: num(geometryCheck.minClearance), minAnnulusMM: num(minAnnulus), minDrillMM: num(minDrill),
    maxAspectRatio: num(maxAspectRatio), platingUM: cfg.litzViaPlating, boardThicknessMM: geometry.art.meta.boardThicknessMM,
    copperThicknessMM: geometry.art.meta.copperThicknessMM, viaCount: geometry.art.vias.length, throughTerminalCount: geometry.art.pads.filter(p => p.drill > 0).length,
    minObservedEdgeClearanceMM: edgeCheck.minClearance };
  return { ok: errors.length === 0, copperOk: errors.every(e => e.code === 'outline-missing'), errors, warnings, summary, rules, viaPairs: [...counts.values()].map(r => ({ ...r, maxAspectRatio: num(r.maxAspectRatio), minDrill: num(r.minDrill) })), geometryCheck, edgeCheck };
}

export function stackSvg(geometry, cfg = {}) {
  const names = copperStack(geometry.art), t = geometry.art.meta.copperThicknessMM, gaps = geometry.art.meta.dielectricThicknessMM;
  if (!Number.isFinite(t) || !Array.isArray(gaps)) throw new Error('Stack thickness metadata is unavailable.');
  const rows = names.flatMap((name, i) => [{ name, t, copper: true }, ...(i < names.length - 1 ? [{ name: `Dielectric ${i + 1}`, t: gaps[i], copper: false }] : [])]);
  let y = 65;
  const body = rows.map(row => { const h = row.copper ? 22 : 46; const out = `<rect x="25" y="${y}" width="220" height="${h}" fill="${row.copper ? '#b87333' : '#d8e8dc'}"/><text x="265" y="${y + h / 2 + 5}" font-size="14">${esc(row.name)} · ${num(row.t)} mm</text>`; y += h; return out; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="610" height="${y + 65}" viewBox="0 0 610 ${y + 65}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#172b38"><text x="25" y="30" font-size="20">PCB Litz layer stack · ${num(geometry.art.meta.boardThicknessMM)} mm</text><text x="25" y="50" font-size="12">Schematic drawing; dimensions control. Fabricator approval required.</text>${body}<text x="25" y="${y + 25}" font-size="12">Via spans: ${PAIRS.join(' · ')}</text></g></svg>`;
}

export function drillCSV(geometry) {
  const rows = ['kind,strand_id,x_mm,y_mm,from_layer,to_layer,finished_drill_mm,pad_diameter_mm'];
  for (const v of geometry.art.vias) rows.push(['blind_buried', v.strandId, num(v.x), num(-v.y), v.from, v.to, num(v.drill), num(v.diameter)].join(','));
  for (const p of geometry.art.pads.filter(p => p.drill > 0)) rows.push(['terminal', '', num(p.x), num(-p.y), 'F.Cu', 'B.Cu', num(p.drill), num(Math.min(p.w, p.h))].join(','));
  return rows.join('\n') + '\n';
}

export function manufacturingMarkdown(geometry, cfg = {}, checked = null) {
  const result = checked || validateManufacturing(geometry, cfg), s = result.summary;
  return `# PCB Litz manufacturing review\n\nStatus: **${result.ok ? 'Generic screening passed' : 'Screening requires changes'}**. Native KiCad DRC and fabricator approval remain separate.\n\n`
    + `Profile: ${s.profile || cfg.litzFabProfile || 'experimental'} (generic editable rules, no vendor qualification).\n\n`
    + `| Stack / drilling | Value |\n|---|---:|\n| Board thickness | ${s.boardThicknessMM} mm |\n| Copper per layer | ${s.copperThicknessMM} mm |\n| Via plating | ${s.platingUM} µm |\n| Blind/buried vias | ${s.viaCount} |\n| Through terminals | ${s.throughTerminalCount} |\n| Minimum drill | ${s.minDrillMM} mm |\n| Annulus after etch allowance | ${s.minAnnulusMM} mm |\n| Maximum aspect ratio | ${s.maxAspectRatio} |\n\n`
    + `| Via layer pair | Count | Max. aspect ratio |\n|---|---:|---:|\n${result.viaPairs.map(p => `| ${p.pair} | ${p.count} | ${p.maxAspectRatio} |`).join('\n')}\n\n`
    + [...result.errors, ...result.warnings].map(e => `- ${e.message}`).join('\n')
    + '\n\nDrill CSV uses KiCad coordinates (+Y down) and finished hole diameters; it is a review inventory, not an Excellon drill program. The exported KiCad board retains the modeled stack. Native placement does not alter the live board stack.\n';
}
