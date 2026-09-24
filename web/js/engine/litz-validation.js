/* Strand-aware PCB Litz checks. Nets cannot identify a short here: all sixteen
   parallel strands intentionally have the same electrical net. Geometry and
   ordered path identity are authoritative, including a via's physical span. */

const EPS = 1e-6;
const finitePoint = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const same = (a, b) => finitePoint(a) && finitePoint(b) && dist(a, b) <= EPS;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function segmentDistance(a, b, c, d) {
  const ab0 = cross(a, b, c), ab1 = cross(a, b, d), cd0 = cross(c, d, a), cd1 = cross(c, d, b);
  // Strict intersection plus endpoint distances also handles zero length vias,
  // parallel lines and collinear disjoint segments.
  if (ab0 * ab1 < 0 && cd0 * cd1 < 0) return 0;
  return Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
}

function layerNames(geometry) {
  return (geometry.layers || []).map(l => typeof l === 'string' ? l : l.name || l.layer);
}

function viaLayers(v, names) {
  const a = names.indexOf(v.from), b = names.indexOf(v.to);
  return a < 0 || b < 0 ? [] : names.slice(Math.min(a, b), Math.max(a, b) + 1);
}

function samePolyline(a, b) {
  return a?.length === b?.length && a.every((p, i) => same(p, b[i]));
}

function terminalMember(primitive, group) {
  return group.members?.find(m => m.strandId === primitive.strandId && m.layer === primitive.layer &&
    (same(primitive.a, m.point) || same(primitive.b, m.point)));
}

// Permit the declared terminal junction only. A bus crossing the same trace
// farther down its run remains a bypass even when it has the right group id.
function terminalContact(a, b, groups, clearance) {
  const bus = a.role === 'terminal-bus' ? a : b.role === 'terminal-bus' ? b : null;
  if (!bus) return false;
  const other = bus === a ? b : a;
  if (other.role === 'terminal-bus') return bus.terminalGroup && bus.terminalGroup === other.terminalGroup;
  const group = groups.find(g => g.id === bus.terminalGroup);
  if (!group) return false;
  const member = terminalMember(other, group);
  if (!member || pointDistance(member.point, bus.a, bus.b) > EPS) return false;
  const far = same(other.a, member.point) ? other.b : other.a;
  const run = dist(member.point, far), reach = other.radius + bus.radius + clearance;
  if (run <= reach + EPS) return true;
  const t = (reach + EPS) / run;
  const cut = member.point.map((v, i) => v + (far[i] - v) * t);
  return segmentDistance(cut, far, bus.a, bus.b) >= reach - EPS;
}

/** Validate an actual generated layout without treating common-net copper as
 * harmless. Error output is bounded; issueCounts includes suppressed repeats. */
export function validateLitz(geometry, input = geometry?.config || {}) {
  const errors = [], warnings = [], issueCounts = {};
  const report = (code, message, detail = {}) => {
    issueCounts[code] = (issueCounts[code] || 0) + 1;
    if (errors.length < 100) errors.push({ code, message, ...detail });
  };
  if (!geometry || !Array.isArray(geometry.strands) || !geometry.art) {
    return { ok: false, errors: [{ code: 'geometry', message: 'PCB Litz geometry is missing.' }], warnings, minClearance: null, issueCounts: { geometry: 1 }, checkedPairs: 0 };
  }
  const cfg = { ...geometry.config, ...input }, art = geometry.art;
  const clearance = cfg.litzStrandGap ?? cfg.traceS ?? cfg.clearance ?? 0.2;
  if (!Number.isFinite(clearance) || clearance < 0) report('dimensions', 'Copper clearance must be finite and nonnegative.');
  const requiredClearance = Number.isFinite(clearance) && clearance >= 0 ? clearance : 0;
  for (const key of ['traceW', 'viaDrill', 'viaPad', 'boardT', 'dOuter']) {
    if (cfg[key] !== undefined && (!Number.isFinite(cfg[key]) || cfg[key] <= 0)) report('dimensions', `${key} must be finite and positive.`, { key });
  }
  if (cfg.turns !== undefined && (!Number.isFinite(cfg.turns) || cfg.turns <= 0)) report('dimensions', 'Turns must be finite and positive.');
  if (cfg.viaPad !== undefined && cfg.viaDrill !== undefined && cfg.viaPad <= cfg.viaDrill) report('annular-ring', 'Via diameter must exceed drill diameter.');
  for (const key of ['litzStrandGap', 'litzTurnSpacing', 'litzViaDrill', 'litzViaDiameter']) if (cfg[key] !== undefined && (!Number.isFinite(cfg[key]) || cfg[key] < 0 || key !== 'litzStrandGap' && cfg[key] === 0)) report('dimensions', `${key} has an invalid dimension.`, { key });
  if (cfg.litzViaDiameter !== undefined && cfg.litzViaDrill !== undefined && cfg.litzViaDiameter <= cfg.litzViaDrill) report('annular-ring', 'Litz via diameter must exceed drill diameter.');
  const names = layerNames(geometry), groups = geometry.terminalGroups || art.meta?.terminalGroups || [];
  const depths = new Map((geometry.layers || []).filter(l => typeof l === 'object').map(l => [l.name || l.layer, l.z]));
  if (names.length !== 4 || new Set(names).size !== 4 || names.some(n => !n || n === '*.Cu')) report('layers', 'The dual-bundle braid requires four explicit, distinct physical copper layers.');
  const primitives = [], strandLengths = [], sectionsByStrand = new Map(), usedVias = new Set();
  const ids = new Set();
  const addPrimitive = p => { p.index = primitives.length; primitives.push(p); };
  const tracks = art.tracks || [], vias = art.vias || [];
  for (const strand of geometry.strands) {
    if (ids.has(strand.id)) report('strand-identity', `Duplicate strand id ${strand.id}.`);
    ids.add(strand.id);
    const sections = strand.sections || [], actualTracks = tracks.filter(t => t.strandId === strand.id && t.role !== 'terminal-bus');
    sectionsByStrand.set(strand.id, sections);
    if (!sections.length) report('open-strand', `Strand ${strand.id} contains no conductor.`, { strandId: strand.id });
    if (actualTracks.length !== sections.length) report('artwork-mismatch', `Strand ${strand.id} artwork does not contain every path section.`, { strandId: strand.id });
    let station = 0;
    const expectedPath = [];
    const orderedViaStations = new Map();
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si], pts = section.pts;
      const t = actualTracks.find(t => (t.sectionIndex ?? t.sequence) === si) || actualTracks[si];
      if (!Array.isArray(pts) || pts.length < 2 || !pts.every(finitePoint) || !names.includes(section.layer)) {
        report('section', `Strand ${strand.id} section ${si} has invalid points or layer.`, { strandId: strand.id, section: si });
        continue;
      }
      if (!t || t.layer !== section.layer || !samePolyline(t.pts, pts)) report('artwork-mismatch', `Strand ${strand.id} section ${si} differs from exported copper.`, { strandId: strand.id, section: si });
      if (si) {
        const prev = sections[si - 1];
        if (!same(prev.pts?.at(-1), pts[0])) report('open-strand', `Strand ${strand.id} has a gap before section ${si}.`, { strandId: strand.id, section: si });
        if (prev.layer !== section.layer) {
          const matches = vias.filter(v => v.strandId === strand.id && same([v.x, v.y], pts[0]) &&
            viaLayers(v, names).includes(prev.layer) && viaLayers(v, names).includes(section.layer));
          if (matches.length !== 1) report('missing-via', `Strand ${strand.id} needs exactly one layer transition before section ${si}.`, { strandId: strand.id, section: si });
          for (const v of matches) {
            usedVias.add(v);
            const traversalFrom = v.fromIndex !== undefined ? names[v.fromIndex] : v.from;
            const traversalTo = v.toIndex !== undefined ? names[v.toIndex] : v.to;
            if (traversalFrom !== prev.layer || traversalTo !== section.layer) report('via-direction', `Strand ${strand.id} via direction disagrees with its ordered path.`, { strandId: strand.id, section: si });
            if (depths.has(traversalFrom) && (!Number.isFinite(v.zFrom) || Math.abs(v.zFrom - depths.get(traversalFrom)) > EPS || !Number.isFinite(v.zTo) || Math.abs(v.zTo - depths.get(traversalTo)) > EPS)) report('via-depth', 'Via depth disagrees with the physical copper-layer stack.', { strandId: strand.id });
            const dz = Number.isFinite(v.zTo - v.zFrom) ? Math.abs(v.zTo - v.zFrom) : (cfg.boardT || 0) * Math.abs(names.indexOf(v.from) - names.indexOf(v.to)) / 3;
            orderedViaStations.set(v, [station, station + dz]); station += dz;
          }
        }
      }
      const width = t?.width ?? section.width ?? cfg.traceW;
      if (!Number.isFinite(width) || width <= 0) report('dimensions', `Strand ${strand.id} has a nonpositive trace width.`);
      if (Number.isFinite(cfg.traceW) && Math.abs(width - cfg.traceW) > EPS) report('artwork-mismatch', `Strand ${strand.id} copper width differs from the electrical-model configuration.`, { strandId: strand.id, section: si });
      for (let pi = 1; pi < pts.length; pi++) {
        const next = station + dist(pts[pi - 1], pts[pi]);
        if (next - station > EPS) addPrimitive({ kind: 'track', strandId: strand.id, layer: section.layer, a: pts[pi - 1], b: pts[pi], radius: width / 2, s0: station, s1: next, section: si, role: t?.role, terminalGroup: t?.terminalGroup });
        station = next;
      }
      if (depths.has(section.layer)) for (const p of pts) {
        const p3 = [...p.slice(0, 2), depths.get(section.layer)], prev = expectedPath.at(-1);
        if (!prev || Math.hypot(...p3.map((v, j) => v - prev[j])) > EPS) expectedPath.push(p3);
      }
    }
    for (const v of vias.filter(v => v.strandId === strand.id)) {
      const span = viaLayers(v, names), interval = orderedViaStations.get(v) || [Infinity, Infinity];
      if (!usedVias.has(v)) report('unused-via', `Strand ${strand.id} has a via outside its ordered layer transitions.`, { strandId: strand.id, at: [v.x, v.y] });
      if (span.length !== 2) report('via-span', 'PCB Litz vias must connect an explicit adjacent copper-layer pair.', { strandId: strand.id, from: v.from, to: v.to });
      if (![v.x, v.y, v.drill, v.diameter].every(Number.isFinite) || v.drill <= 0 || v.diameter <= v.drill) report('annular-ring', 'Via copper must have a positive annular ring and valid coordinates.', { strandId: strand.id });
      for (const layer of span) addPrimitive({ kind: 'via', strandId: strand.id, layer, a: [v.x, v.y], b: [v.x, v.y], radius: v.diameter / 2, s0: interval[0], s1: interval[1], role: v.role });
    }
    const actualVias = vias.filter(v => v.strandId === strand.id);
    if (!Array.isArray(strand.vias) || strand.vias.length !== actualVias.length) report('artwork-mismatch', `Strand ${strand.id} via inventory differs from exported copper.`);
    else strand.vias.forEach((v, i) => {
      const actual = actualVias[i];
      if (['from', 'to'].some(key => actual[key] !== v[key]) || ['x', 'y', 'drill', 'diameter', 'zFrom', 'zTo'].some(key => actual[key] !== v[key] && (!Number.isFinite(actual[key]) || !Number.isFinite(v[key]) || Math.abs(actual[key] - v[key]) > EPS))) report('artwork-mismatch', `Strand ${strand.id} model via differs from exported copper.`, { strandId: strand.id, via: i });
    });
    if (Number.isFinite(strand.lengthMM) && Math.abs(station - strand.lengthMM) > Math.max(1e-4, station * 1e-6)) report('length', `Strand ${strand.id} reported length does not match its copper path.`, { strandId: strand.id, measured: station, reported: strand.lengthMM });
    if (strand.path3 && strand.path3.some(p => !finitePoint(p) || p.length !== 3)) report('path', `Strand ${strand.id} has an invalid 3D path.`);
    else if (strand.path3 && expectedPath.length && (strand.path3.length !== expectedPath.length || strand.path3.some((p, i) => !expectedPath[i] || Math.hypot(...p.map((v, j) => v - expectedPath[i][j])) > EPS))) report('path', `Strand ${strand.id} 3D path differs from its physical ordered conductor.`);
    strandLengths.push({ strandId: strand.id, lengthMM: station });
  }
  if (ids.size !== 16) report('strand-count', 'The dual-bundle braid requires exactly sixteen distinct strands.');
  for (const [bundle, count] of [['outer', 12], ['inner', 4]]) if (geometry.strands.filter(s => s.bundle === bundle).length !== count) report('bundle-membership', `Bundle ${bundle} must contain ${count} strands.`);
  const expectedSteps = cfg.turns !== undefined && cfg.litzStepDeg !== undefined ? cfg.turns * 360 / cfg.litzStepDeg : null;
  if (expectedSteps !== null && (!Number.isInteger(Math.round(expectedSteps * 1e6) / 1e6) || expectedSteps <= 0)) report('transposition-cycle', 'The requested turns must contain a whole number of transposition steps.');
  if (cfg.litzStepDeg !== undefined && (!geometry.transpositions?.outer || !geometry.transpositions?.inner)) report('transposition-cycle', 'Both bundles require a complete transposition schedule.');
  if (geometry.transpositions) for (const [bundle, schedule] of Object.entries(geometry.transpositions)) {
    const members = geometry.strands.filter(s => s.bundle === bundle).map(s => s.id), slots = schedule.slots, states = schedule.states || [];
    const steps = states.length - 1;
    if (!Number.isInteger(slots) || slots < 1 || slots > 16) { report('slot-occupancy', 'Invalid transposition slot count.'); continue; }
    if (members.length !== slots || new Set(members).size !== slots) report('bundle-membership', `Bundle ${bundle} must have one distinct strand per slot.`);
    if (slots !== (bundle === 'outer' ? 12 : bundle === 'inner' ? 4 : 0)) report('bundle-membership', 'The braid requires an outer twelve-strand bundle and inner four-strand bundle.');
    if (expectedSteps !== null && Math.abs(steps - expectedSteps) > EPS) report('turn-count', `Bundle ${bundle} does not contain the requested number of turns.`, { expectedSteps, actualSteps: steps });
    if (steps <= 0 || steps % slots !== 0 || schedule.completeCycles !== steps / slots) report('transposition-cycle', `Bundle ${bundle} must contain complete transposition cycles.`);
    const exposure = new Map(members.map(id => [id, new Array(slots).fill(0)]));
    states.forEach((state, step) => {
      if (!Array.isArray(state) || state.length !== slots || new Set(state).size !== slots || state.some(id => !exposure.has(id))) { report('slot-occupancy', `Bundle ${bundle}, step ${step} does not contain each strand exactly once.`); return; }
      if (step < steps) state.forEach((id, slot) => exposure.get(id)[slot]++);
    });
    for (const [id, counts] of exposure) if (counts.some(n => n !== steps / slots)) report('strand-exposure', `Strand ${id} does not visit every bundle position equally.`, { strandId: id, exposure: counts });
    if (states.length && JSON.stringify(states[0]) !== JSON.stringify(states.at(-1))) report('transposition-cycle', `Bundle ${bundle} does not return to its initial position.`);
    for (const strand of geometry.strands.filter(s => s.bundle === bundle)) {
      if (!Array.isArray(strand.positions) || strand.positions.length !== states.length) { report('slot-path', `Strand ${strand.id} is missing physical slot positions.`); continue; }
      strand.positions.forEach((p, i) => {
        if (p.step !== i || states[i]?.[p.slot] !== strand.id) report('slot-path', `Strand ${strand.id} physical slot does not match the transposition schedule.`, { strandId: strand.id, step: i });
        const section = i < steps ? strand.sections.find(s => s.transpositionStep === i) : strand.sections.filter(s => s.transpositionStep === steps - 1).at(-1);
        const endpoint = i < steps ? section?.pts?.[0] : section?.pts?.at(-1);
        if (!section || !same(p.point, endpoint) || p.layer !== section.layer || i < steps && section.slot !== p.slot) report('slot-path', `Strand ${strand.id} scheduled position does not match its copper.`, { strandId: strand.id, step: i });
      });
    }
  }
  let nextBusNode = 0;
  for (const t of tracks) {
    if (t.role !== 'terminal-bus') {
      if (!ids.has(t.strandId)) report('unowned-copper', 'A trace has no recognized strand identity.');
      continue;
    }
    if (!groups.some(g => g.id === t.terminalGroup)) report('terminal-group', 'A terminal bus has no matching declared endpoint group.');
    if (!Array.isArray(t.pts) || !t.pts.every(finitePoint) || !Number.isFinite(t.width) || t.width <= 0 || !names.includes(t.layer)) { report('terminal-bus', 'A terminal bus has invalid geometry.'); continue; }
    for (let i = 1; i < t.pts.length; i++) addPrimitive({ kind: 'bus', layer: t.layer, a: t.pts[i - 1], b: t.pts[i], radius: t.width / 2, role: t.role, terminalGroup: t.terminalGroup, busNode: nextBusNode++ });
  }
  for (const p of art.pads || []) {
    if (p.role !== 'terminal-bus' || !groups.some(g => g.id === p.terminalGroup)) { report('unowned-copper', 'A pad has no declared terminal ownership.'); continue; }
    if (p.shape !== 'circle' || Math.abs(p.w - p.h) > EPS || ![p.x, p.y, p.w, p.h].every(Number.isFinite) || p.w <= 0 || p.drill < 0 || p.drill >= p.w) { report('terminal-pad', 'PCB Litz terminal pads must be valid circular copper pads.'); continue; }
    const span = p.layer === '*.Cu' && p.drill > 0 ? names : names.includes(p.layer) ? [p.layer] : [];
    if (!span.length) report('terminal-pad', 'A terminal pad has no valid physical copper-layer span.');
    const busNode = nextBusNode++;
    for (const layer of span) addPrimitive({ kind: 'pad', layer, a: [p.x, p.y], b: [p.x, p.y], radius: p.w / 2, role: p.role, terminalGroup: p.terminalGroup, busNode });
  }
  if (art.arcs?.length) report('unowned-copper', 'Unexpected unsampled copper arcs cannot be validated as a PCB Litz strand.');
  for (const v of vias) if (!ids.has(v.strandId)) report('unowned-copper', 'A via has no recognized strand identity.');
  for (const g of groups) for (const m of g.members || []) {
    const s = sectionsByStrand.get(m.strandId), endpoint = g.id === 'start' ? s?.[0] : g.id === 'end' ? s?.at(-1) : null;
    if (!endpoint || endpoint.layer !== m.layer || !same(g.id === 'start' ? endpoint.pts?.[0] : endpoint.pts?.at(-1), m.point)) report('terminal-endpoint', `Terminal ${g.id} is not at strand ${m.strandId}'s physical endpoint.`);
    if (!primitives.some(p => p.role === 'terminal-bus' && p.terminalGroup === g.id && p.layer === m.layer && pointDistance(m.point, p.a, p.b) <= EPS)) report('terminal-open', `Strand ${m.strandId} does not reach terminal ${g.id}.`);
  }
  for (const id of ids) for (const end of ['start', 'end']) if (groups.filter(g => g.id === end).flatMap(g => g.members || []).filter(m => m.strandId === id).length !== 1) report('terminal-membership', `Strand ${id} must appear once in the ${end} terminal group.`);

  let checkedPairs = 0, minClearance = Infinity;
  const busParent = Array.from({ length: nextBusNode }, (_, i) => i);
  const root = i => busParent[i] === i ? i : (busParent[i] = root(busParent[i]));
  const valid = primitives.filter(p => finitePoint(p.a) && finitePoint(p.b) && Number.isFinite(p.radius) && p.radius > 0);
  const cellSize = valid.reduce((max, p) => Math.max(max, 2 * p.radius + requiredClearance), 1);
  const grid = new Map();
  for (const p of valid) {
    const pad = p.radius + requiredClearance;
    const x0 = Math.floor((Math.min(p.a[0], p.b[0]) - pad) / cellSize), x1 = Math.floor((Math.max(p.a[0], p.b[0]) + pad) / cellSize);
    const y0 = Math.floor((Math.min(p.a[1], p.b[1]) - pad) / cellSize), y1 = Math.floor((Math.max(p.a[1], p.b[1]) + pad) / cellSize);
    const seen = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${p.layer}:${x}:${y}`, bucket = grid.get(key) || [];
      for (const q of bucket) {
        if (seen.has(q.index)) continue;
        seen.add(q.index);
        // A sampled curve naturally has overlapping rounded joins. Only the
        // short contiguous path neighborhood is exempt; distant self contacts
        // are checked exactly like contacts with another strand.
        if (p.strandId !== undefined && p.strandId === q.strandId &&
          Math.max(p.s0 - q.s1, q.s0 - p.s1, 0) <= p.radius + q.radius + requiredClearance + EPS) continue;
        checkedPairs++;
        const gap = segmentDistance(p.a, p.b, q.a, q.b) - p.radius - q.radius;
        if (p.busNode !== undefined && q.busNode !== undefined && p.terminalGroup === q.terminalGroup && gap <= EPS) busParent[root(p.busNode)] = root(q.busNode);
        if (gap >= requiredClearance - EPS) { minClearance = Math.min(minClearance, gap); continue; }
        if (terminalContact(p, q, groups, requiredClearance)) continue;
        minClearance = Math.min(minClearance, gap);
        report(gap <= EPS ? 'copper-short' : 'clearance', gap <= EPS ? 'Copper bypasses a strand or bridges strands outside a declared terminal.' : 'Copper spacing is below the requested clearance.',
          { strandIds: [p.strandId ?? null, q.strandId ?? null], layer: p.layer, kinds: [p.kind, q.kind], section: p.section, otherSection: q.section, clearance: gap, required: requiredClearance, at: p.a });
      }
      bucket.push(p); grid.set(key, bucket);
    }
  }
  for (const g of groups) {
    const nodes = primitives.filter(p => p.terminalGroup === g.id && p.busNode !== undefined).map(p => root(p.busNode));
    if (!nodes.length || new Set(nodes).size !== 1) report('terminal-open', `Terminal ${g.id} copper does not form one continuous bus across its member layers.`);
  }
  return { ok: errors.length === 0, errors, warnings, minClearance: Number.isFinite(minClearance) ? minClearance : null, issueCounts, checkedPairs, strandLengths, primitiveCount: valid.length };
}
