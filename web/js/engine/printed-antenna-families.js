import { rect, run, TAU, track, via } from './artwork.js';
import { range } from './creator-validation.js';
import { hasNonlocalContact } from './series-routing.js';
import { armSpacingClear, C0, exposedEr, feedWidth, info, plate, plateBands, port, terminal, warn } from './antenna-artwork.js';

const wavelength = c => C0 / (c.freq * Math.sqrt(exposedEr(c)));
const traceWidth = c => range(c, 'traceW', 0.1, 5);

function edgeLaunch(art, c, env, net) {
  const width = feedWidth(c, env);
  const W = range(c, 'groundWidth', 5, 200), L = range(c, 'groundLength', 5, 200);
  if (W <= width || L < c.feedLength + width / 2) throw new Error('Enlarge the back ground or shorten the feed.');
  art.tracks.push(track('F.Cu', width, run(0, -c.feedLength, 0, 0), { net, role: 'feed' }));
  terminal(art, [0, -c.feedLength], width, '1', net, 'RF feed');
  plate(art, [-W / 2, -L, W / 2, 0], 'GND', '2', 'ground', 'B.Cu');
  port(art, W / 4, -L / 2, 'GND', 'Back ground', 'B.Cu');
  return width;
}

export function ellipticalMonopole(art, c, env) {
  if (env.board?.layerCount < 2) throw new Error('The grounded coplanar launch needs front and back copper.');
  const width = traceWidth(c), gap = c.cpwGap, L = range(c, 'feedLength', 1, 200);
  const groundWidth = range(c, 'groundWidth', 5, 200);
  const height = wavelength(c) * c.ellipseScale / 4, semiWidth = height * c.ellipseAspect / 2;
  const inner = width / 2 + gap;
  if (semiWidth < width || groundWidth / 2 - inner < 1.5) {
    throw new Error('The ellipse or ground rails are too narrow for this launch. Enlarge the radiator or ground, or narrow the line and gap.');
  }
  const net = env.net || 'RF', bands = Math.ceil(height / c.cpwProfileStep);
  if (bands > 1024) throw new Error('The ellipse needs more than 1024 bands. Increase the copper edge step.');
  plateBands(art, Array.from({ length: bands }, (_, i) => {
    const t = 2 * (i + 0.5) / bands - 1;
    const x = semiWidth * Math.sqrt(1 - t * t);
    return { bottom: height * i / bands, top: height * (i + 1) / bands, spans: [[-x, x]] };
  }), net, '1', 'elliptical-radiator');
  art.tracks.push(track('F.Cu', width, run(0, -L, 0, 0), { net, role: 'feed' }));
  terminal(art, [0, -L], width, '1', net, 'CPW feed');
  const end = -Math.max(width / 2, gap, 0.6), bottom = -L - width / 2 - 0.6;
  if (end - bottom < 1.5) throw new Error('Lengthen the coplanar feed to fit the grounded launch.');
  plate(art, [-groundWidth / 2, bottom, groundWidth / 2, end], 'GND', '2', 'ground', 'B.Cu');
  for (const sign of [-1, 1]) {
    const left = sign < 0 ? -groundWidth / 2 : inner, right = sign < 0 ? -inner : groundWidth / 2;
    plate(art, [left, bottom, right, end], 'GND', '2', 'cpw-ground');
    const x = (left + right) / 2;
    for (const f of [0.22, 0.78]) art.vias.push(via(x, bottom + f * (end - bottom), {
      net: 'GND', role: 'ground-stitch', diameter: 0.65, drill: 0.3,
    }));
  }
  port(art, (inner + groundWidth / 2) / 2, bottom + 0.44 * (end - bottom), 'GND', 'Ground rail');
  return {
    model: 'Elliptical monopole with a grounded coplanar launch',
    analysis: { height, width: 2 * semiWidth, gap, bands },
    capabilities: ['Quarter-wave dimension reference', 'Grounded coplanar launch', 'Stepped elliptical copper'],
    notes: [warn('The center trace and coplanar gap are entered dimensions. The model does not solve their impedance or the radiator match. Keep copper clear under the ellipse.')],
  };
}

export function forkedMonopole(art, c, env) {
  const width = traceWidth(c), low = wavelength(c) * c.forkScale / 4;
  const high = low / c.forkRatio, spread = c.forkSpread;
  if (spread * 2 < width + 0.2 || high <= spread + 2 * width) {
    throw new Error('The shorter fork cannot fit the branch spacing and copper width. Reduce the spacing, frequency ratio, or trace width.');
  }
  const net = env.net || 'RF', feedW = edgeLaunch(art, c, env, net);
  for (const [sign, length] of [[-1, low], [1, high]]) {
    art.tracks.push(track('F.Cu', width, [[0, 0], [sign * spread, 0], [sign * spread, length - spread]], {
      net, role: sign < 0 ? 'long-branch' : 'short-branch',
    }));
  }
  return {
    model: 'Two quarter-wave branch references',
    analysis: { low, high, lowFrequency: c.freq / c.forkScale, highFrequency: c.freq * c.forkRatio / c.forkScale, feedW },
    capabilities: ['Independent branch length references', 'Shared feed and back ground'],
    notes: [warn('The branches share the RF feed and interact. Tune both together in the final enclosure. Branch-length references do not establish two matched bands.')],
  };
}

export function turnstile(art, c, env) {
  if (env.board?.layerCount < 2) throw new Error('The two crossed dipoles need front and back copper.');
  const width = traceWidth(c), gap = range(c, 'feedGap', 0.1, 10);
  const half = wavelength(c) * c.turnstileScale / 4, start = (gap + width) / 2;
  if (half < start + width) throw new Error('Reduce the feed gap, trace width, or frequency so both dipoles can fit.');
  for (const [index, axis] of ['X', 'Y'].entries()) for (const sign of [-1, 1]) {
    const layer = index ? 'B.Cu' : 'F.Cu', side = sign < 0 ? 'N' : 'P';
    const p = v => index ? [0, sign * v] : [sign * v, 0];
    const net = `RF_${axis}_${side}`, number = String(2 * index + (sign < 0 ? 1 : 2));
    art.tracks.push(track(layer, width, [p(start), p(half - width / 2)], { net, role: 'dipole-arm' }));
    terminal(art, p(start), width, number, net, `${axis}${sign < 0 ? '−' : '+'}`, layer);
  }
  return {
    model: 'Orthogonal half-wave dipole starting dimensions',
    analysis: { span: 2 * half, gap, resonance: C0 / (4 * half * Math.sqrt(exposedEr(c))) },
    capabilities: ['Two isolated balanced ports', 'Orthogonal dipoles on different copper layers'],
    notes: [info('The X and Y dipoles expose independent balanced ports. Drive them with an external equal-amplitude quadrature network for turnstile operation.'), warn('The layout excludes a balun, phasing network and backing ground. The length model does not establish polarization or axial ratio.')],
  };
}

export function sinuous(art, c) {
  const width = c.sinuousWidth;
  const turns = c.sinuousCells, tau = c.sinuousTau, swing = c.sinuousSwing * Math.PI / 180;
  const outer = wavelength(c) * c.sinuousScale / TAU, inner = outer * tau ** turns;
  const samplesPerCell = 48, separation = width + c.sinuousGap + 0.002;
  const arms = Array.from({ length: 4 }, (_, arm) => Array.from({ length: turns * samplesPerCell + 1 }, (_, i) => {
    const cell = i / samplesPerCell, whole = Math.floor(cell);
    const r = inner * tau ** -cell;
    const theta = arm * Math.PI / 2 + (-1) ** whole * swing * Math.sin(Math.PI * (cell - whole));
    return [r * Math.cos(theta), r * Math.sin(theta)];
  }));
  if (!armSpacingClear(arms, separation) || arms.some(p => hasNonlocalContact(p, separation))) {
    throw new Error('The sinuous arms do not clear. Reduce the cell count, angular swing, trace width or required gap, or enlarge the antenna.');
  }
  for (const [i, points] of arms.entries()) {
    const net = `RF_${i + 1}`;
    art.tracks.push(track('F.Cu', width, points, { net, role: 'sinuous-arm' }));
    terminal(art, points[0], width, String(i + 1), net, net);
  }
  art.meta.exactPaths = true;
  return {
    model: 'Four rotated logarithmic sinuous trace arms',
    analysis: { inner, outer, turns, swing: c.sinuousSwing, gap: c.sinuousGap },
    capabilities: ['Logarithmic cell geometry', 'Four isolated feed terminals', 'Checked trace clearance'],
    notes: [info('Drive opposite arms as balanced pairs. The two pairs can be combined with external phasing.'), warn('These constant-width traces approximate the sinuous centerlines. The model excludes the feed network, self-complementary impedance, polarization and operating bandwidth.')],
  };
}

export function franklin(art, c, env) {
  const width = traceWidth(c), count = c.franklinSections;
  const halfWave = wavelength(c) * c.franklinScale / 2;
  const foldSpan = c.franklinGap + width, depth = (halfWave - foldSpan) / 2;
  if (depth < 2 * width || foldSpan >= halfWave / 2) throw new Error('The phasing fold does not fit. Reduce the fold gap, frequency or trace width.');
  const net = env.net || 'RF', feedW = edgeLaunch(art, c, env, net);
  const points = [[0, 0]];
  let y = 0;
  for (let i = 0; i < count; i++) {
    y += halfWave;
    points.push([0, y]);
    if (i + 1 === count) continue;
    const x = i % 2 ? -depth : depth;
    points.push([x, y], [x, y + foldSpan], [0, y + foldSpan]);
    y += foldSpan;
  }
  art.tracks.push(track('F.Cu', width, points, { net, role: 'franklin-radiator' }));
  const margin = c.margin / 2;
  art.outline.push({ layer: 'Dwgs.User', pts: rect(-depth - margin, 0, depth + margin, y + margin) });
  art.meta.exactPaths = true;
  return {
    model: 'Collinear half-wave sections with folded phasing sections',
    analysis: { count, halfWave, depth, foldSpan, span: y, feedW },
    capabilities: ['Collinear element and fold dimensions', 'End feed and back ground'],
    notes: [warn('Keep the radiator and phasing folds clear of other copper. Fold coupling, current phase and impedance tuning require EM analysis or measurement. The end feed may need an external matching network.')],
  };
}
