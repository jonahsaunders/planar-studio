/* ============================================================================
   EXPORTERS — one artwork, six file formats.

   Placing straight into the open board is the normal path. These exist for
   the cases it does not cover: a footprint you want in a library and reuse
   next year, a board file for someone who does not have the plugin, DXF for a
   mechanical model or an FEA mesh, SVG for a document, JSON so the design can
   be rebuilt or diffed.

   KiCad's board Y axis points down; artwork's points up. `toKicad` in
   artwork.js is the only place that flips, and these writers negate at the
   point of emission for the same reason: one conversion, visible where it
   happens.
   ========================================================================= */

import { bounds, decimate, copperLength, copperArea, segmentCount } from './artwork.js';

const f3 = (v) => {
  const x = Math.abs(v) < 5e-7 ? 0 : v;
  return x.toFixed(6).replace(/\.?0+$/, '') || '0';
};

const TECH_LAYERS = [
  [32, 'B.Adhes', 'user', 'B.Adhesive'], [33, 'F.Adhes', 'user', 'F.Adhesive'],
  [34, 'B.Paste', 'user'], [35, 'F.Paste', 'user'],
  [36, 'B.SilkS', 'user', 'B.Silkscreen'], [37, 'F.SilkS', 'user', 'F.Silkscreen'],
  [38, 'B.Mask', 'user'], [39, 'F.Mask', 'user'],
  [40, 'Dwgs.User', 'user', 'User.Drawings'], [41, 'Cmts.User', 'user', 'User.Comments'],
  [42, 'Eco1.User', 'user', 'User.Eco1'], [43, 'Eco2.User', 'user', 'User.Eco2'],
  [44, 'Edge.Cuts', 'user'], [45, 'Margin', 'user'],
  [46, 'B.CrtYd', 'user', 'B.Courtyard'], [47, 'F.CrtYd', 'user', 'F.Courtyard'],
  [48, 'B.Fab', 'user'], [49, 'F.Fab', 'user'],
];

const KICAD_COLORS = ['#C83434', '#7FC64D', '#CC7FCC', '#4CC3BD', '#BC8455',
  '#70A2E8', '#42B8B8', '#C7C74C', '#DE8686', '#3EBF3E', '#B37DB3', '#5BB8CE',
  '#A87A54', '#6E7FD6', '#5FB89B', '#4D7FC4'];

function prepared(A, tol) {
  if (!(tol > 0)) return A;
  return { ...A, tracks: A.tracks.map((t) => ({ ...t, pts: decimate(t.pts, tol) })) };
}

/* Every copper layer the artwork actually touches, in stack order. */
export function usedLayers(A) {
  const order = ['F.Cu'].concat(Array.from({ length: 30 }, (_, i) => `In${i + 1}.Cu`)).concat(['B.Cu']);
  const seen = new Set(A.tracks.map((t) => t.layer).concat(A.pads.map((p) => p.layer)));
  return order.filter((n) => seen.has(n));
}

/* --------------------------------------------------------------------------
   KiCad footprint (.kicad_mod)
   ----------------------------------------------------------------------- */

export function exportKicadMod(A, opt = {}) {
  const art = prepared(A, opt.tolerance);
  const name = opt.name || art.meta.name || 'planar';
  const b = bounds(art);
  const R = Math.max(Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.y0), Math.abs(b.y1)) + 1;
  const L = [];

  L.push(`(footprint "${name}"`);
  L.push(`  (version 20221018)`);
  L.push(`  (generator "planar-studio")`);
  L.push(`  (layer "F.Cu")`);
  L.push(`  (descr "${(opt.description || art.meta.kind || 'Planar Studio structure').replace(/"/g, "'")}")`);
  L.push(`  (tags "${(opt.tags || 'planar studio').replace(/"/g, '')}")`);
  L.push(`  (attr through_hole)`);
  L.push(`  (fp_text reference "${opt.reference || 'L**'}" (at 0 ${f3(-b.y1 - 1.6)} 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  L.push(`  (fp_text value "${name}" (at 0 ${f3(-b.y0 + 1.6)} 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);

  for (const t of art.tracks) {
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1], c = t.pts[i];
      if (Math.abs(a[0] - c[0]) < 1e-7 && Math.abs(a[1] - c[1]) < 1e-7) continue;
      L.push(`  (fp_line (start ${f3(a[0])} ${f3(-a[1])}) (end ${f3(c[0])} ${f3(-c[1])}) `
        + `(stroke (width ${f3(t.width)}) (type solid)) (layer "${t.layer}"))`);
    }
  }
  for (const a of art.arcs) {
    L.push(`  (fp_arc (start ${f3(a.start[0])} ${f3(-a.start[1])}) (mid ${f3(a.mid[0])} ${f3(-a.mid[1])}) `
      + `(end ${f3(a.end[0])} ${f3(-a.end[1])}) (stroke (width ${f3(a.width)}) (type solid)) (layer "${a.layer}"))`);
  }
  for (const v of art.vias) {
    L.push(`  (pad "" thru_hole circle (at ${f3(v.x)} ${f3(-v.y)}) (size ${f3(v.diameter)} ${f3(v.diameter)}) `
      + `(drill ${f3(v.drill)}) (layers "*.Cu"))`);
  }
  for (const p of art.pads) {
    const shape = p.shape === 'rect' ? 'rect' : 'circle';
    const type = p.drill > 0 ? 'thru_hole' : 'smd';
    const layers = p.drill > 0 ? '"*.Cu" "*.Mask"' : `"${p.layer}" "${p.layer.replace('.Cu', '.Mask')}"`;
    L.push(`  (pad "${p.number}" ${type} ${shape} (at ${f3(p.x)} ${f3(-p.y)}) (size ${f3(p.w)} ${f3(p.h)}) `
      + (p.drill > 0 ? `(drill ${f3(p.drill)}) ` : '') + `(layers ${layers}))`);
  }
  for (const t of art.labels) {
    L.push(`  (fp_text user "${String(t.text).replace(/"/g, "'")}" (at ${f3(t.x)} ${f3(-t.y)} 0) (layer "${t.layer}") `
      + `(effects (font (size ${f3(t.size)} ${f3(t.size)}) (thickness ${f3(t.size * 0.15)}))))`);
  }
  L.push(`  (fp_circle (center 0 0) (end ${f3(R)} 0) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))`);
  L.push(`)`);
  return L.join('\n') + '\n';
}

/* --------------------------------------------------------------------------
   KiCad board (.kicad_pcb)
   ----------------------------------------------------------------------- */

export function exportKicadPcb(A, opt = {}) {
  const art = prepared(A, opt.tolerance);
  const layers = usedLayers(art);
  const L = [];

  L.push(`(kicad_pcb (version 20221018) (generator "planar-studio")`);
  L.push(`  (general (thickness ${f3(opt.boardThickness || 1.6)}))`);
  L.push(`  (paper "A4")`);
  L.push(`  (layers`);
  layers.forEach((n, i) => {
    const num = n === 'F.Cu' ? 0 : n === 'B.Cu' ? 31 : i;
    L.push(`    (${num} "${n}" signal)`);
  });
  for (const t of TECH_LAYERS) L.push(`    (${t[0]} "${t[1]}" ${t[2]}${t[3] ? ` "${t[3]}"` : ''})`);
  L.push(`  )`);
  L.push(`  (setup (pad_to_mask_clearance 0) (grid_origin 0 0))`);

  // Nets: index 0 is the unconnected net and must exist.
  const netNames = ['""'];
  const netIndex = new Map();
  const allNets = new Set();
  [...art.tracks, ...art.arcs, ...art.vias, ...art.pads].forEach((o) => { if (o.net) allNets.add(o.net); });
  for (const n of Array.from(allNets).sort()) { netNames.push(`"${n}"`); netIndex.set(n, netNames.length - 1); }
  netNames.forEach((n, i) => L.push(`  (net ${i} ${n})`));
  const netOf = (o) => (o.net && netIndex.has(o.net) ? netIndex.get(o.net) : 0);

  for (const o of art.outline) {
    for (let i = 1; i < o.pts.length; i++) {
      const a = o.pts[i - 1], c = o.pts[i];
      L.push(`  (gr_line (start ${f3(a[0])} ${f3(-a[1])}) (end ${f3(c[0])} ${f3(-c[1])}) `
        + `(stroke (width 0.1) (type solid)) (layer "${o.layer || 'Edge.Cuts'}"))`);
    }
  }

  for (const t of art.tracks) {
    const net = netOf(t);
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1], c = t.pts[i];
      if (Math.abs(a[0] - c[0]) < 1e-7 && Math.abs(a[1] - c[1]) < 1e-7) continue;
      L.push(`  (segment (start ${f3(a[0])} ${f3(-a[1])}) (end ${f3(c[0])} ${f3(-c[1])}) `
        + `(width ${f3(t.width)}) (layer "${t.layer}") (net ${net}))`);
    }
  }
  for (const a of art.arcs) {
    L.push(`  (arc (start ${f3(a.start[0])} ${f3(-a.start[1])}) (mid ${f3(a.mid[0])} ${f3(-a.mid[1])}) `
      + `(end ${f3(a.end[0])} ${f3(-a.end[1])}) (width ${f3(a.width)}) (layer "${a.layer}") (net ${netOf(a)}))`);
  }
  for (const v of art.vias) {
    L.push(`  (via (at ${f3(v.x)} ${f3(-v.y)}) (size ${f3(v.diameter)}) (drill ${f3(v.drill)}) `
      + `(layers "F.Cu" "B.Cu") (net ${netOf(v)}))`);
  }
  for (const p of art.pads) {
    L.push(`  (via (at ${f3(p.x)} ${f3(-p.y)}) (size ${f3(Math.max(p.w, p.h))}) `
      + `(drill ${f3(p.drill || Math.min(p.w, p.h) * 0.5)}) (layers "F.Cu" "B.Cu") (net ${netOf(p)}))`);
  }
  for (const t of art.labels) {
    L.push(`  (gr_text "${String(t.text).replace(/"/g, "'")}" (at ${f3(t.x)} ${f3(-t.y)}) (layer "${t.layer}") `
      + `(effects (font (size ${f3(t.size)} ${f3(t.size)}) (thickness ${f3(t.size * 0.15)}))))`);
  }
  L.push(`)`);
  return L.join('\n') + '\n';
}

/* --------------------------------------------------------------------------
   SVG — 1 user unit = 1 mm
   ----------------------------------------------------------------------- */

export function exportSvg(A, opt = {}) {
  const art = prepared(A, opt.tolerance);
  const b = bounds(art);
  const m = opt.margin != null ? opt.margin : 2;
  const x0 = b.x0 - m, y0 = -b.y1 - m, w = b.w + 2 * m, h = b.h + 2 * m;
  const bg = opt.background || '#0D1117';
  const S = [];
  S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" `
    + `viewBox="${x0.toFixed(3)} ${y0.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}">`);
  S.push(`<title>${(opt.name || art.meta.name || 'planar-studio').replace(/[<&]/g, '')}</title>`);
  if (bg !== 'none') S.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${bg}"/>`);

  const layers = usedLayers(art);
  // Draw the back layers first so the front sits on top, as KiCad shows it.
  for (let i = layers.length - 1; i >= 0; i--) {
    const ln = layers[i];
    const colour = (opt.colors && opt.colors[ln]) || KICAD_COLORS[i % KICAD_COLORS.length];
    const group = art.tracks.filter((t) => t.layer === ln);
    if (!group.length) continue;
    S.push(`<g id="${ln.replace('.', '_')}" fill="none" stroke="${colour}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const t of group) {
      S.push(`<path stroke-width="${f3(t.width)}" d="${pathD(t.pts)}"/>`);
    }
    S.push(`</g>`);
  }
  if (art.vias.length) {
    S.push(`<g id="vias" fill="#D8D2C4">`);
    for (const v of art.vias) S.push(`<circle cx="${f3(v.x)}" cy="${f3(-v.y)}" r="${f3(v.diameter / 2)}"/>`);
    S.push(`</g>`);
  }
  if (art.pads.length) {
    S.push(`<g id="pads" fill="#E8B23A">`);
    for (const p of art.pads) S.push(`<circle cx="${f3(p.x)}" cy="${f3(-p.y)}" r="${f3(Math.max(p.w, p.h) / 2)}"/>`);
    S.push(`</g>`);
  }
  if (art.outline.length) {
    S.push(`<g id="outline" fill="none" stroke="#F0C674" stroke-width="0.15">`);
    for (const o of art.outline) S.push(`<path d="${pathD(o.pts)}"/>`);
    S.push(`</g>`);
  }
  S.push(`</svg>`);
  return S.join('\n');
}

function pathD(pts) {
  let d = '';
  for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + f3(pts[i][0]) + ' ' + f3(-pts[i][1]) + ' ';
  return d.trim();
}

/* --------------------------------------------------------------------------
   DXF R12 — POLYLINE / VERTEX / SEQEND, one DXF layer per copper layer
   ----------------------------------------------------------------------- */

export function exportDxf(A, opt = {}) {
  const art = prepared(A, opt.tolerance);
  const layers = usedLayers(art);
  const dxfName = (n) => n.replace(/\./g, '_');
  const g = [];
  const put = (code, val) => { g.push(String(code)); g.push(String(val)); };

  put(0, 'SECTION'); put(2, 'HEADER'); put(0, 'ENDSEC');
  put(0, 'SECTION'); put(2, 'TABLES');
  put(0, 'TABLE'); put(2, 'LAYER'); put(70, layers.length + 2);
  layers.forEach((n, i) => { put(0, 'LAYER'); put(2, dxfName(n)); put(70, 0); put(62, (i % 7) + 1); put(6, 'CONTINUOUS'); });
  put(0, 'LAYER'); put(2, 'VIAS'); put(70, 0); put(62, 8); put(6, 'CONTINUOUS');
  put(0, 'LAYER'); put(2, 'OUTLINE'); put(70, 0); put(62, 2); put(6, 'CONTINUOUS');
  put(0, 'ENDTAB'); put(0, 'ENDSEC');

  put(0, 'SECTION'); put(2, 'ENTITIES');
  for (const t of art.tracks) {
    if (t.pts.length < 2) continue;
    const ln = dxfName(t.layer);
    put(0, 'POLYLINE'); put(8, ln); put(66, 1); put(70, 0);
    for (const p of t.pts) { put(0, 'VERTEX'); put(8, ln); put(10, f3(p[0])); put(20, f3(p[1])); put(30, 0); }
    put(0, 'SEQEND'); put(8, ln);
  }
  for (const o of art.outline) {
    if (o.pts.length < 2) continue;
    put(0, 'POLYLINE'); put(8, 'OUTLINE'); put(66, 1); put(70, 1);
    for (const p of o.pts) { put(0, 'VERTEX'); put(8, 'OUTLINE'); put(10, f3(p[0])); put(20, f3(p[1])); put(30, 0); }
    put(0, 'SEQEND'); put(8, 'OUTLINE');
  }
  for (const v of art.vias) {
    put(0, 'CIRCLE'); put(8, 'VIAS'); put(10, f3(v.x)); put(20, f3(v.y)); put(30, 0); put(40, f3(v.diameter / 2));
  }
  for (const p of art.pads) {
    put(0, 'CIRCLE'); put(8, 'VIAS'); put(10, f3(p.x)); put(20, f3(p.y)); put(30, 0); put(40, f3(Math.max(p.w, p.h) / 2));
  }
  put(0, 'ENDSEC'); put(0, 'EOF');
  return g.join('\n') + '\n';
}

/* --------------------------------------------------------------------------
   JSON — the design, not the drawing, so it can be rebuilt or diffed
   ----------------------------------------------------------------------- */

export function exportJson(payload) {
  return JSON.stringify({
    tool: 'planar-studio',
    version: payload.version || '1.0.0',
    generated: new Date().toISOString(),
    ...payload,
  }, null, 2) + '\n';
}

/* --------------------------------------------------------------------------
   Specification sheet
   ----------------------------------------------------------------------- */

export function exportSpec(sections, opt = {}) {
  const out = [];
  out.push(`# ${opt.title || 'Planar Studio design'}`);
  out.push('');
  if (opt.subtitle) { out.push(opt.subtitle); out.push(''); }
  out.push(`Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} by Planar Studio.`);
  out.push('');
  for (const sec of sections) {
    if (!sec || !sec.rows || !sec.rows.length) continue;
    out.push(`## ${sec.title}`);
    out.push('');
    if (sec.note) { out.push(sec.note); out.push(''); }
    out.push('| Quantity | Value |');
    out.push('|---|---|');
    for (const [k, v] of sec.rows) out.push(`| ${k} | ${v} |`);
    out.push('');
  }
  if (opt.notes && opt.notes.length) {
    out.push('## Notes');
    out.push('');
    for (const n of opt.notes) out.push(`- ${typeof n === 'string' ? n : n.text}`);
    out.push('');
  }
  if (opt.references && opt.references.length) {
    out.push('## References');
    out.push('');
    for (const r of opt.references) out.push(`- ${r}`);
    out.push('');
  }
  return out.join('\n');
}

/* --------------------------------------------------------------------------
   Size estimate, shown before an export or a placement is committed
   ----------------------------------------------------------------------- */

export function estimate(A, tol) {
  const art = prepared(A, tol);
  const segs = segmentCount(art);
  const areas = copperArea(art);
  let area = 0;
  for (const v of areas.values()) area += v;
  return {
    segments: segs,
    vias: art.vias.length + art.pads.length,
    tracks: art.tracks.length,
    copperLengthMM: copperLength(art),
    copperAreaMM2: area,
    // A KiCad segment s-expression runs about 110 bytes once coordinates are
    // written out; close enough to warn before opening a 40 MB board.
    approxBytes: segs * 110 + art.vias.length * 90,
    bounds: bounds(art),
  };
}
