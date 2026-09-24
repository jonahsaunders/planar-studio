/* Layer-separated views of the actual generated conductor, not a schematic
   braid. Sampling only affects this small SVG; exported paths remain exact. */
import { el, num } from './controls.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#df7955', '#56aa78', '#a481da', '#509dcb'];
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}
function sampled(points, max = 16) {
  if (points.length <= max) return points;
  return Array.from({ length: max }, (_, i) => points[Math.round(i * (points.length - 1) / (max - 1))]);
}
function findingPoint(finding, geometry) {
  if (Array.isArray(finding.at) && finding.at.length >= 2) return finding.at.slice(0, 2);
  const id = finding.strandId ?? finding.strandIds?.find(id => id != null);
  const strand = geometry.strands.find(s => s.id === id);
  const section = strand?.sections[finding.section ?? 0];
  return section?.pts?.[Math.floor(section.pts.length / 2)] || null;
}

/** Returns a mountable details node. The scrubber redraws locally because the
 * host deliberately does not replace its active range input during a drag. */
export function renderLitzInspector(cfg, res, api = {}) {
  const geometry = res.litz, art = geometry?.art || res.art;
  const host = el('details', { class: 'litz-inspector', open: true });
  host.append(el('summary', { text: 'Inspect strands and layer transitions' }));
  if (!geometry || !art) { host.append(el('p', { class: 'hint', text: 'Generate a Litz winding to inspect its layer paths.' })); return host; }
  const count = Math.max(1, geometry.stats?.steps || Math.round(cfg.turns * 360 / cfg.litzStepDeg));
  let step = Number.isInteger(cfg.litzInspectStep) ? Math.max(-1, Math.min(count - 1, cfg.litzInspectStep)) : -1;
  const range = el('input', { type: 'range', min: -1, max: count - 1, step: 1, value: step, 'aria-label': 'Inspect transposition step' });
  const caption = el('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const all = el('button', { type: 'button', class: 'btn small', text: 'Show all steps' });
  const select = el('select', { 'aria-label': 'Inspector strand or bundle' },
    ...[['all', 'All strands'], ['outer', 'Outer bundle'], ['inner', 'Inner bundle'], ...geometry.strands.map(s => [`strand:${s.id}`, `Strand ${s.id + 1}`])].map(([value, text]) => el('option', { value, text })));
  select.value = cfg.litzHighlight || 'all';
  let highlight = select.value;
  const svg = svgNode('svg', { viewBox: '0 0 400 340', width: '100%', role: 'img', 'aria-label': 'Exploded four-layer PCB Litz copper' });
  svg.append(svgNode('title', {}, 'Actual strand tracks separated into four copper planes'));
  const drawing = svgNode('g'); svg.append(drawing);
  host.append(el('p', { class: 'hint', text: 'Four separated copper planes; vertical connectors show the actual via spans. Select a strand, then scrub a step. Projection and path sampling are for inspection only.' }), select, range, caption, all, svg);

  const names = geometry.layers.map(l => typeof l === 'string' ? l : l.name);
  const points = art.tracks.flatMap(t => [t.pts[0], t.pts.at(-1)]).filter(Boolean);
  const [minX, maxX, minY, maxY] = points.reduce((box, p) => [Math.min(box[0], p[0]), Math.max(box[1], p[0]), Math.min(box[2], p[1]), Math.max(box[3], p[1])], [Infinity, -Infinity, Infinity, -Infinity]);
  const center = [(minX + maxX) / 2, (minY + maxY) / 2], scale = 275 / Math.max(1, maxX - minX, maxY - minY);
  const project = (point, layer) => [178 + (point[0] - center[0]) * scale + layer * 9, 44 + layer * 80 - (point[1] - center[1]) * scale * .23];
  const chosen = primitive => highlight === 'all' || (highlight.startsWith('strand:') ? primitive.strandId === Number(highlight.slice(7)) : primitive.bundle === highlight);
  const active = primitive => chosen(primitive) && (step < 0 || primitive.transpositionStep === step);

  function focus(finding) {
    const point = findingPoint(finding, geometry);
    const id = finding.strandId ?? finding.strandIds?.find(id => id != null);
    if (id != null) { highlight = `strand:${id}`; select.value = highlight; api.set?.('litzHighlight', highlight); }
    if (point) api.focusFinding?.(point, finding);
    draw();
  }
  function draw() {
    drawing.replaceChildren();
    caption.textContent = step < 0 ? `All ${count} transposition steps · ${highlight === 'all' ? 'all strands' : highlight.startsWith('strand:') ? `strand ${Number(highlight.slice(7)) + 1}` : `${highlight} bundle`}`
      : `Step ${step + 1} of ${count} · ${(step * cfg.litzStepDeg).toFixed(1)}° from the winding start`;
    range.value = String(step);
    for (let layer = names.length - 1; layer >= 0; layer--) {
      drawing.append(svgNode('text', { x: 8, y: 47 + layer * 80, fill: 'currentColor', 'font-size': 10 }, names[layer]));
      const group = svgNode('g', { 'data-layer': names[layer] });
      const allPaths = art.tracks.filter(t => t.layer === names[layer]);
      const detailed = allPaths.filter(t => active(t) && (step >= 0 || highlight !== 'all'));
      const detailedSet = new Set(detailed);
      const background = allPaths.filter(t => !detailedSet.has(t));
      const paths = [...sampled(background, Math.min(600, background.length)), ...sampled(detailed, Math.min(900, detailed.length))];
      for (const t of paths) {
        const hot = active(t), data = sampled(t.pts).map(point => project(point, layer).map(v => v.toFixed(2)).join(',')).join(' ');
        const path = svgNode('polyline', { points: data, fill: 'none', stroke: hot ? COLORS[layer] : '#888888',
          'stroke-width': hot ? 1.2 : .55, opacity: hot ? 1 : .14, 'data-strand': t.strandId ?? '',
          'data-step': t.transpositionStep ?? '', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        if (t.strandId != null) {
          path.append(svgNode('title', {}, `Strand ${t.strandId + 1}, ${t.layer}, step ${(t.transpositionStep ?? 0) + 1}`));
          path.addEventListener('click', () => { highlight = `strand:${t.strandId}`; select.value = highlight; draw(); api.set?.('litzHighlight', highlight); });
        }
        group.append(path);
      }
      drawing.append(group);
    }
    // With no selection the complete via forest obscures all four layers.
    // A chosen step or strand shows every relevant physical connector.
    const shownVias = art.vias.filter(via => active(via) && (step >= 0 || highlight !== 'all'));
    for (const via of sampled(shownVias, Math.min(1200, shownVias.length))) {
      const from = names.indexOf(via.from), to = names.indexOf(via.to);
      if (from < 0 || to < 0) continue;
      const a = project([via.x, via.y], from), b = project([via.x, via.y], to);
      const line = svgNode('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#efb84a', 'stroke-width': 1.1,
        'data-via-strand': via.strandId, 'data-from': via.from, 'data-to': via.to });
      line.append(svgNode('title', {}, `Strand ${via.strandId + 1}: ${via.from} to ${via.to}`));
      drawing.append(line, svgNode('circle', { cx: a[0], cy: a[1], r: 1.7, fill: '#efb84a' }), svgNode('circle', { cx: b[0], cy: b[1], r: 1.7, fill: '#efb84a' }));
    }
  }
  range.addEventListener('input', () => { step = Number(range.value); draw(); api.set?.('litzInspectStep', step); });
  all.addEventListener('click', () => { step = -1; draw(); api.set?.('litzInspectStep', -1); });
  select.addEventListener('change', () => { highlight = select.value; draw(); api.set?.('litzHighlight', highlight); });
  draw();

  const findings = [...(res.validation?.errors || []), ...(res.manufacturing?.errors || [])];
  if (findings.length) {
    const list = el('div', { class: 'litz-findings' });
    list.append(el('p', { class: 'hint', text: 'Select a routing finding to highlight its strand and focus the main canvas.' }));
    for (const finding of findings.slice(0, 16)) {
      const point = findingPoint(finding, geometry);
      const button = el('button', { type: 'button', class: 'btn small', text: `${finding.code || 'Finding'}${finding.layer ? ` · ${finding.layer}` : ''}${point ? ` · ${num(point[0], 1)}, ${num(point[1], 1)} mm` : ''}`, title: finding.message });
      button.addEventListener('click', () => focus(finding));
      list.append(el('div', {}, button, el('p', { class: 'hint', text: finding.message })));
    }
    host.append(list);
  }
  return host;
}
