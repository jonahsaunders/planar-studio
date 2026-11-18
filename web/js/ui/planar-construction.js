import { PLANAR_CONSTRUCTIONS, planarConstruction } from '../engine/planar-constructions.js';
import { el, eng, num } from './controls.js';

export const planar = cfg => cfg.motorFamily === 'planar';
const is = (cfg, mode) => planar(cfg) && planarConstruction(cfg) === mode;
export const wireTile = cfg => is(cfg, 'wire-tile');
export const crossed = cfg => is(cfg, 'crossed');
const voice = cfg => crossed(cfg) && cfg.crossedDrive === 'voice-coil';
export const crossedPcb = cfg => crossed(cfg) && !voice(cfg);
const sawyer = cfg => is(cfg, 'sawyer');
const double = cfg => is(cfg, 'double-sided');
export const magnetBuild = cfg => wireTile(cfg) || is(cfg, 'moving-coil') || double(cfg);
export const gridBuild = cfg => is(cfg, 'pcb-grid') || is(cfg, 'moving-coil') || double(cfg);
export const pcbWinding = cfg => !planar(cfg) || gridBuild(cfg) || crossedPcb(cfg);
export const polePitchInput = cfg => !planar(cfg) || magnetBuild(cfg) || gridBuild(cfg) || crossedPcb(cfg);
export const measured = cfg => sawyer(cfg) || voice(cfg);
const range = (key, label, min, max, step, unit, when) => ({ key, type: 'range', label, min, max, step, unit, when });

export function planarConstructionRail(panel) {
  panel.group({ key: 'planar-construction', title: 'Planar construction', when: planar, fields: [
    { key: 'planarConstruction', type: 'select', label: 'Planar construction', options: PLANAR_CONSTRUCTIONS },
  ] });
  panel.group({ key: 'planar-wire', title: 'Wire winding', when: wireTile, fields: [
    range('wireCols', 'Wire tile columns', 2, 8, 1), range('wireRows', 'Wire tile rows', 2, 8, 1),
    range('wirePitch', 'Wire tile coil pitch', 5, 100, 0.5, 'mm'),
    range('wireWidth', 'Square wire coil width', 3, 60, 0.5, 'mm'),
    range('wireDiameter', 'Bare wire diameter', 0.1, 4, 0.01, 'mm'),
    range('wireInsulated', 'Insulated wire diameter', 0.1, 5, 0.01, 'mm'),
    range('wireTurns', 'Turns per wire coil', 1, 80, 1),
  ] });
  panel.group({ key: 'planar-magnets', title: 'Magnet plates', when: magnetBuild, fields: [
    range('magnetCols', 'Magnet columns', 2, 16, 1), range('magnetRows', 'Magnet rows', 2, 16, 1),
    range('magnetFill', 'Magnet width / pitch', 0.2, 0.98, 0.01),
    range('planarMagnetT', 'Magnet thickness per plate', 0.5, 50, 0.1, 'mm'),
    range('planarGap', 'Single / upper air gap', 0, 40, 0.05, 'mm'),
    range('planarLowerGap', 'Lower plate air gap', 0, 40, 0.05, 'mm', double),
    range('planarLowerB', 'Lower face harmonic', 0, 2, 0.01, 'T', double),
    range('planarOffsetX', 'Lower plate X offset', -100, 100, 0.1, 'mm', double),
    range('planarOffsetY', 'Lower plate Y offset', -100, 100, 0.1, 'mm', double),
  ] });
  panel.group({ key: 'planar-crossed', title: 'Crossed stage', when: crossed, fields: [
    { key: 'crossedDrive', type: 'select', label: 'Axis drive', options: [{ value: 'linear-pcb', label: 'Three-phase PCB tracks' },
      { value: 'voice-coil', label: 'Voice coils with flexure' }] },
    range('crossedXCoils', 'X axis coils', 3, 36, 3, null, crossedPcb), range('crossedYCoils', 'Y axis coils', 3, 36, 3, null, crossedPcb),
    range('crossedHeight', 'Axis height separation', 0, 80, 0.1, 'mm'),
    range('flexureX', 'X spring rate', 0, 10, 0.01, 'N/mm', voice), range('flexureY', 'Y spring rate', 0, 10, 0.01, 'N/mm', voice),
  ] });
  panel.group({ key: 'planar-steel', title: 'Toothed steel platen', when: sawyer, fields: [
    range('toothPitch', 'Tooth pitch', 0.5, 20, 0.05, 'mm'), range('toothFill', 'Tooth land fraction', 0.2, 0.8, 0.01),
    range('toothDepth', 'Groove depth', 0.05, 5, 0.05, 'mm'), range('sawyerGap', 'Working gap', 0.01, 3, 0.01, 'mm'),
    range('sawyerHead', 'Forcer width', 12, 100, 0.5, 'mm'), range('sawyerMicrosteps', 'Tooth microsteps per full step', 1, 64, 1),
  ] });
  panel.group({ key: 'planar-measured', title: 'Measured drive', when: measured, fields: [
    range('planarForceX', 'Measured X force per amp', 0, 200, 0.01, 'N/A'), range('planarForceY', 'Measured Y force per amp', 0, 200, 0.01, 'N/A'),
    range('planarPhaseR', 'Measured winding resistance', 0, 500, 0.01, 'Ω'),
    { key: 'driveMeasurementHint', type: 'note', text: 'Enter the force constant for each axis and one winding’s resistance. Zero marks a missing measurement.' },
  ] });
}

const mm = n => num(n, 2) + ' mm';
const dims = (w, h) => num(w, 2) + ' × ' + mm(h);
export function constructionTiles(res) {
  const b = res.construction, m = res.familyAnalysis;
  return [
    { k: 'Mover force X', v: m && (!b.needsCalibration || res.cfg.planarForceX) ? num(m.fx, 4) : '—', u: 'N' },
    { k: 'Mover force Y', v: m && (!b.needsCalibration || res.cfg.planarForceY) ? num(m.fy, 4) : '—', u: 'N' },
    { k: 'Peak winding current', v: m ? num(m.peakCurrent, 2) : '—', u: 'A' },
    { k: 'Winding loss', v: m?.Pcu == null ? '—' : eng(m.Pcu, 'W') },
  ];
}

export function constructionSpec(res) {
  const b = res.construction, d = b.details, m = res.familyAnalysis, rows = [['Construction', b.title]];
  if (d.mover) rows.push(['Stationary / moving', d.stator + ' / ' + d.mover],
    ['Winding footprint', dims(d.coilWidth, d.coilHeight)], ['Magnet pattern', dims(d.magnetWidth, d.magnetHeight)],
    ['Upper / single gap', mm(d.gap)], ['Magnets per plate', String(d.magnets.length)]);
  if (d.wireLength != null) rows.push(['Wire per coil with leads', mm(d.wireLength)], ['Turns per coil', String(d.wireTurns)],
    ['Approximate coil opening', mm(d.boreClearance)]);
  if (d.faceSpan != null) rows.push(['Lower gap', mm(d.lowerGap)], ['Face-to-face clearance', mm(d.faceSpan)],
    ['Lower plate X / Y offset', dims(...d.lowerOffset)]);
  if (d.size) rows.push(['X assembly', dims(d.size[0], d.size[1])], ['Y assembly', dims(d.size[2], d.size[3])],
    ['Axis separation', mm(d.axisSeparation)]);
  if (d.magnetTracks?.length) rows.push(...d.magnetTracks.map(t => [t.axis + ' magnet track', dims(t.length, t.width) + ' · ' + t.poles + ' poles']));
  if (d.platenSize) rows.push(['Platen', dims(d.platenSize, d.platenSize)], ['Forcer', dims(d.forcerSize, d.forcerSize)],
    ['Groove width / depth', dims(d.groove, d.depth)], ['Working gap', mm(d.workingGap)],
    ['Nominal full step', mm(d.fullStep)], ['Nominal microstep', eng(d.microstep / 1000, 'm')]);
  if (m) rows.push(['Peak winding current', eng(m.peakCurrent, 'A')], ['Calculated winding loss', m.Pcu == null ? 'Enter measured resistance' : eng(m.Pcu, 'W')]);
  return [{ title: 'Construction dimensions', rows }];
}

export function constructionPreview(res) {
  const b = res.construction, d = b.details, c = res.cfg;
  const section = el('div', { class: 'side-section' }, el('h3', { text: 'Assembly preview' }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', b.title + ' assembly');
  svg.style.width = '100%';
  const box = (x, y, w, h, stroke, fill = 'none', opacity = 1) => {
    const part = document.createElementNS(svg.namespaceURI, 'rect');
    const attr = { x, y, width: w, height: h, fill, stroke, opacity, 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' };
    for (const [name, val] of Object.entries(attr)) part.setAttribute(name, String(val));
    svg.append(part);
  };
  const blue = '#5199ca', red = '#cc6262', gold = '#d5a955';
  if (d.magnets) {
    const moving = b.mode === 'moving-coil', ox = moving ? 0 : c.moverX, oy = moving ? 0 : c.moverY;
    const cx = moving ? c.moverX : 0, cy = moving ? c.moverY : 0;
    const [lx, ly] = d.lowerOffset ?? [0, 0];
    const w = Math.max(d.coilWidth + 2 * Math.abs(cx), d.magnetWidth + 2 * Math.max(Math.abs(ox), Math.abs(ox + lx))) + 10;
    const h = Math.max(d.coilHeight + 2 * Math.abs(cy), d.magnetHeight + 2 * Math.max(Math.abs(oy), Math.abs(oy + ly))) + 10;
    svg.setAttribute('viewBox', [-w / 2, -h / 2, w, h].join(' '));
    box(ox - d.magnetWidth / 2, -oy - d.magnetHeight / 2, d.magnetWidth, d.magnetHeight, blue);
    for (const m of d.magnets) box(ox + m.x - m.width / 2, -oy - m.y - m.height / 2, m.width, m.height,
      m.face === 'N' ? red : blue, m.face === 'N' ? red : blue, 0.35);
    if (d.lowerOffset) box(ox + lx - d.magnetWidth / 2, -oy - ly - d.magnetHeight / 2, d.magnetWidth, d.magnetHeight, red);
    box(cx - d.coilWidth / 2, -cy - d.coilHeight / 2, d.coilWidth, d.coilHeight, gold);
    const diameter = b.mode === 'wire-tile' ? c.wireWidth : c.cellDiameter;
    for (const cell of d.coilCenters) box(cx + cell.x - diameter / 2, -cy - cell.y - diameter / 2, diameter, diameter, gold);
    section.append(svg, el('p', { class: 'hint', text: 'Gold outlines mark the coils. Red and blue mark the upper or single plate’s pole faces.' }));
  } else {
    const [xw, xh, yw, yh] = d.size ?? [d.platenSize, d.platenSize, d.forcerSize, d.forcerSize];
    const w = Math.max(xw, yh + 2 * Math.abs(c.moverX)) + 10, h = Math.max(xh, yw + 2 * Math.abs(c.moverY)) + 10;
    svg.setAttribute('viewBox', [-w / 2, -h / 2, w, h].join(' '));
    box(-xw / 2, -xh / 2, xw, xh, blue, blue, 0.2);
    if (d.size) {
      box(c.moverX - yh / 2, -yw / 2, yh, yw, blue, blue, 0.35);
      box(c.moverX - yh / 4, -c.moverY - xh / 4, yh / 2, xh / 2, gold, gold);
    } else {
      box(c.moverX - yw / 2, -c.moverY - yh / 2, yw, yh, gold, gold, 0.75);
    }
    section.append(svg, el('p', { class: 'hint', text: d.size ? 'The Y stage rides on the X stage.' : 'The four-pole forcer travels over the fixed steel platen.' }));
  }
  return section;
}
