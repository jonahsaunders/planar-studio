/* Printed antenna starting layouts. Dimensions are mm; frequencies are Hz.
 * Profiles use contiguous filled rectangular pads so canvas, IPC placement and
 * every exporter preserve the same copper. profileStep bounds the staircase
 * error along both axes. No antenna impedance/radiation solution is implied.
 */
import { artwork, pad, track, run, rect, bounds, label } from './artwork.js';
import { range } from './creator-validation.js';
import { microstripWidth } from './microstrip.js';
import { OZ_MM } from './coil.js';

export const DIRECTIONAL_FAMILIES = ['vivaldi', 'yagi', 'lpda', 'bowtie'];
export const directionalDefaults = () => ({
  bowtieAngle: 60, profileStep: 0.1,
  yagiDirectors: 4, yagiSpacing: 0.2, yagiReflectorSpacing: 0.2,
  yagiReflectorScale: 1.05, yagiDirectorScale: 0.93, yagiDirectorTaper: 0.01,
  lpdaElements: 8, lpdaTau: 0.86, lpdaSpacing: 0.25, lpdaArmWidth: 1.6,
  vivaldiLength: 60, vivaldiAperture: 45, vivaldiThroat: 0.8,
  vivaldiBackslot: 10, vivaldiStub: 5,
});
const info = text => ({ level: 'info', text });
const warn = text => ({ level: 'warn', text });
function plate(A, x0, y0, x1, y1, net, number, role, layer = 'F.Cu') {
  if (!(x1 > x0 && y1 > y0)) throw new Error('Antenna copper dimensions must be positive.');
  A.pads.push(pad((x0 + x1) / 2, (y0 + y1) / 2, {
    w: x1 - x0, h: y1 - y0, shape: 'rect', net, number, role, layer,
  }));
}
function port(A, x, y, net, name, layer = 'F.Cu') { A.ports.push({ x, y, net, name, layer }); }
function profileCount(c, length, edgeTravel) {
  range(c, 'profileStep', 0.01, 1);
  // Linear profiles: edgeTravel is total transverse travel. Exponential
  // profiles: it is length × maximum slope, bounding the last/widest step.
  const n = Math.max(2, Math.ceil(Math.max(length, edgeTravel) / (c.profileStep * 0.99)));
  if (n > 4096) throw new Error('Profile needs more than 4096 steps per side. Increase copper edge step or reduce antenna size.');
  return n;
}
function balancedDipole(A, length, width, gap) {
  if (length <= gap + 4 * width) throw new Error('Driven element is too short for its feed gap and width. Reduce frequency, gap or width.');
  for (const s of [-1, 1]) {
    const net = s < 0 ? 'RF_P' : 'RF_N', number = s < 0 ? '1' : '2';
    const endpoints = [s * gap / 2, s * length / 2].sort((a, b) => a - b);
    plate(A, endpoints[0], -width / 2, endpoints[1], width / 2, net, number, 'driven');
    port(A, s * (gap / 2 + width / 2), 0, net, s < 0 ? 'Balanced +' : 'Balanced −');
  }
}
export function buildDirectional(c, env = {}) {
  const A = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: c.family });
  const lambda0 = 299792458e3 / c.freq, ee = (c.epsR + 1) / 2, lambdaG = lambda0 / Math.sqrt(ee);
  const notes = [info('Starting geometry only: no solved resonance, S11, gain, beamwidth, efficiency or operating bandwidth. Validate the feed, substrate and enclosure with full-wave simulation or measurements.')];
  let a, model;
  if (c.family === 'vivaldi') {
    if (env.board?.layerCount < 2) throw new Error('Vivaldi requires front feed copper and a back slot plane.');
    range(c, 'vivaldiLength', 5, 500); range(c, 'vivaldiAperture', 3, 500);
    range(c, 'vivaldiThroat', 0.1, 10); range(c, 'vivaldiBackslot', 1, 100);
    range(c, 'vivaldiStub', 0.1, 100); range(c, 'feedZ', 20, 150);
    const L = c.vivaldiLength, aperture = c.vivaldiAperture, throat = c.vivaldiThroat;
    if (aperture <= 2 * throat) throw new Error('Vivaldi aperture must exceed twice the throat width.');
    const rate = Math.log(aperture / throat) / L;
    const count = profileCount(c, L, L * rate * aperture / 2);
    const halfW = aperture / 2 + c.margin, back = c.vivaldiBackslot;
    const feedW = microstripWidth(c.feedZ, c.boardT, c.epsR, { t: c.copperOz * OZ_MM, f: c.freq });
    if (feedW + 0.2 >= back) throw new Error('Vivaldi back slot is too short for the feed width. Increase back slot length.');
    const feedEnd = throat / 2 + c.vivaldiStub;
    if (feedEnd + feedW / 2 >= halfW) throw new Error('Vivaldi open stub exceeds the slot-plane width. Reduce stub or increase aperture.');
    // The slot plane is one DC-connected ground conductor, joined behind the
    // closed rectangular back slot. Its aperture opens toward +Y.
    plate(A, -halfW, -back - c.margin, halfW, -back, 'GND', '2', 'slot-back', 'B.Cu');
    for (const s of [-1, 1]) {
      const span = [s * throat / 2, s * halfW].sort((u, v) => u - v);
      plate(A, span[0], -back, span[1], 0, 'GND', '2', 'slot-throat', 'B.Cu');
      for (let i = 0; i < count; i++) {
        const y0 = L * i / count, y1 = L * (i + 1) / count;
        // Use the outer edge: copper never intrudes into the analytical slot.
        const inner = throat / 2 * Math.exp(rate * y1);
        const edge = [s * inner, s * halfW].sort((u, v) => u - v);
        // A tiny overlap prevents nanometre rounding gaps in KiCad exports.
        plate(A, edge[0], Math.max(0, y0 - Math.max(0.000004, c.profileStep * 0.0001)), edge[1], y1, 'GND', '2', 'vivaldi-flare', 'B.Cu');
      }
    }
    const feedX = -halfW + feedW / 2, feedY = -back / 2, net = env.net || 'RF';
    A.tracks.push(track('F.Cu', feedW, run(feedX, feedY, feedEnd, feedY), { net, role: 'feed' }));
    A.pads.push(pad(feedX, feedY, { w: feedW, number: '1', net, role: 'terminal' }));
    port(A, feedX, feedY, net, 'Microstrip RF feed (front)');
    port(A, feedX, feedY, 'GND', 'Ground reference (back)', 'B.Cu');
    a = { taperLength: L, aperture, throat, rate, feedW, profileSteps: count, profileStep: c.profileStep, apertureWavelengths: aperture / lambda0 };
    model = 'Exponential tapered-slot starting geometry';
    notes.push(info('The front microstrip crosses a closed rectangular back slot in B.Cu and ends in an adjustable open stub. Feed-line impedance does not establish an antenna match; tune the back slot and stub. No cavity or broadband transition matching is synthesized.'));
    notes.push(warn('Keep the tapered slot free of copper pours. Keep intermediate layers clear beneath both the slot and feed. The drawing guide does not create a KiCad keepout.'));
  } else {
    range(c, 'armScale', 0.5, 1.5); range(c, 'traceW', 0.1, 5);
    const length = lambdaG / 2 * c.armScale, w = c.traceW;
    if (c.family !== 'lpda') range(c, 'feedGap', 0.1, 10);
    if (c.family === 'bowtie') {
      range(c, 'bowtieAngle', 10, 120);
      if (length <= c.feedGap + 4 * w) throw new Error('Bow-tie is too short for its feed gap and tip width. Reduce frequency, gap or width.');
      const arm = (length - c.feedGap) / 2, slope = Math.tan(c.bowtieAngle * Math.PI / 360);
      const count = profileCount(c, arm, arm * slope);
      for (const s of [-1, 1]) {
        const net = s < 0 ? 'RF_P' : 'RF_N', number = s < 0 ? '1' : '2';
        for (let i = 0; i < count; i++) {
          const u = arm * i / count, v = arm * (i + 1) / count;
          const halfH = w / 2 + u * slope;
          const xs = [s * (c.feedGap / 2 + Math.max(0, u - Math.max(0.000004, c.profileStep * 0.0001))), s * (c.feedGap / 2 + v)].sort((x, y) => x - y);
          plate(A, xs[0], -halfH, xs[1], halfH, net, number, 'bowtie-arm');
        }
        port(A, s * (c.feedGap / 2 + arm / (2 * count)), 0, net, s < 0 ? 'Balanced +' : 'Balanced −');
      }
      a = { drivenLength: length, flareAngle: c.bowtieAngle, armLength: arm, profileSteps: count, profileStep: c.profileStep };
      model = 'Flared dipole half-wave starting dimensions';
    } else if (c.family === 'yagi') {
      range(c, 'yagiDirectors', 1, 20, true); range(c, 'yagiSpacing', 0.05, 0.5);
      range(c, 'yagiReflectorSpacing', 0.05, 0.5); range(c, 'yagiReflectorScale', 1.01, 1.3);
      range(c, 'yagiDirectorScale', 0.7, 0.99); range(c, 'yagiDirectorTaper', 0, 0.03);
      balancedDipole(A, length, w, c.feedGap);
      const spacing = lambdaG * c.yagiSpacing, reflectorSpacing = lambdaG * c.yagiReflectorSpacing;
      if (Math.min(spacing, reflectorSpacing) <= w + 0.2) throw new Error('Yagi elements overlap. Increase spacing or reduce trace width.');
      const reflectorLength = length * c.yagiReflectorScale;
      plate(A, -reflectorLength / 2, -reflectorSpacing - w / 2, reflectorLength / 2, -reflectorSpacing + w / 2, null, '', 'reflector');
      const directorLengths = [];
      for (let i = 0; i < c.yagiDirectors; i++) {
        const d = length * (c.yagiDirectorScale - i * c.yagiDirectorTaper), y = (i + 1) * spacing;
        if (d <= Math.max(4 * w, 0.4 * length)) throw new Error('Last Yagi director is too short. Reduce director taper or count.');
        plate(A, -d / 2, y - w / 2, d / 2, y + w / 2, null, '', 'director');
        directorLengths.push(d);
      }
      a = { drivenLength: length, reflectorLength, directorLengths, directorSpacing: spacing, elements: c.yagiDirectors + 2 };
      model = 'Printed Yagi half-wave starting dimensions';
      notes.push(info('The isolated reflector and directors have no assigned net. Feed the split driven element through a balanced source or external balun. Element lengths and spacing require joint tuning; no gain is inferred from director count.'));
    } else if (c.family === 'lpda') {
      if (env.board?.layerCount < 2) throw new Error('Printed log-periodic requires front and back copper.');
      range(c, 'lpdaElements', 3, 24, true); range(c, 'lpdaTau', 0.75, 0.98);
      range(c, 'lpdaSpacing', 0.1, 0.5); range(c, 'lpdaArmWidth', 0.1, 5); range(c, 'feedLength', 1, 200);
      const lengths = [], widths = [], positions = [];
      let y = 0;
      for (let i = 0; i < c.lpdaElements; i++) {
        const scale = c.lpdaTau ** i, span = length * scale, width = c.lpdaArmWidth * scale;
        if (width < 0.1 || span <= 4 * w) throw new Error('Smallest LPDA element is too small. Reduce count, increase tau, or reduce frequency/boom width; arm widths must be at least 0.1 mm.');
        if (i && y - positions[i - 1] <= (width + widths[i - 1]) / 2 + 0.2) throw new Error('LPDA elements overlap. Increase spacing or reduce arm width.');
        for (const s of [-1, 1]) {
          // Alternate dipole polarity without crossing or shorting the booms:
          // each consecutive arm changes copper layer and therefore feed net.
          const front = (i % 2 === 0) === (s > 0), net = front ? 'RF_P' : 'RF_N';
          const layer = front ? 'F.Cu' : 'B.Cu';
          const xs = [0, s * span / 2].sort((u, v) => u - v);
          plate(A, xs[0], y - width / 2, xs[1], y + width / 2, net, front ? '1' : '2', 'lpda-arm', layer);
        }
        lengths.push(span); widths.push(width); positions.push(y);
        if (i < c.lpdaElements - 1) y += c.lpdaSpacing * span;
      }
      const feedY = y + c.feedLength;
      for (const [layer, net, number] of [['F.Cu', 'RF_P', '1'], ['B.Cu', 'RF_N', '2']]) {
        plate(A, -w / 2, -widths[0] / 2, w / 2, feedY + w / 2, net, number, 'lpda-boom', layer);
        port(A, 0, feedY, net, `Balanced ${layer === 'F.Cu' ? '+' : '−'} (${layer === 'F.Cu' ? 'front' : 'back'})`, layer);
      }
      a = { elementLengths: lengths, elementWidths: widths, elementPositions: positions, elements: c.lpdaElements, longestLength: lengths[0], shortestLength: lengths.at(-1), lengthRatio: lengths[0] / lengths.at(-1), lengthFrequencyLow: c.freq / c.armScale, lengthFrequencyHigh: c.freq / (c.armScale * c.lpdaTau ** (c.lpdaElements - 1)) };
      model = 'Log-periodic scaled dipole starting dimensions';
      notes.push(info('Target frequency sizes the longest dipole. Lengths, widths and spacings shrink by tau toward the feed. The element-length frequency span is a half-wave scaling reference, not predicted usable bandwidth.'));
      notes.push(info('Overlapping front/back booms form a balanced parallel-strip feed. Alternate arms change layers to reverse polarity. Keep these RF_P/RF_N conductors isolated: no through via or ground plane. Supply a balanced feed or separately designed balun at the smallest-element end; boom impedance is not solved.'));
    } else throw new Error(`Unknown directional antenna: ${c.family}.`);
    notes.push(info('Half-wave dimensions use εeff = (εr + 1)/2 as a rough exposed-conductor approximation. This excludes finite substrate, coupling, feed and enclosure loading.'));
    notes.push(warn('Keep other copper clear around and behind the radiators on all layers. Clearance outlines are drawing guides, not enforced KiCad keepouts.'));
    if (c.family === 'bowtie') notes.push(info('Two isolated flared arms have balanced RF_P/RF_N terminals. Add a suitable external balun for a single-ended radio.'));
  }
  if (a.profileSteps) notes.push(info(`Filled copper uses ${a.profileSteps} contiguous rectangular steps per side, with boundary error bounded by ${c.profileStep} mm along each axis. Preview, placement and exports use this same stepped profile.`));
  const b = bounds(A), margin = c.margin;
  A.outline.push({ layer: 'Edge.Cuts', pts: rect(b.x0 - margin, b.y0 - margin, b.x1 + margin, b.y1 + margin) });
  A.outline.push({ layer: 'Dwgs.User', pts: rect(b.x0 - margin / 2, b.y0 - margin / 2, b.x1 + margin / 2, b.y1 + margin / 2) });
  if (['yagi', 'lpda', 'vivaldi'].includes(c.family)) A.labels.push(label(0, b.y1 + margin / 2, 'Aperture / forward +Y', { layer: 'Dwgs.User', size: Math.min(1, margin / 3) }));
  const capabilities = ['Generated copper geometry', 'Board dimensions', ...(c.family === 'vivaldi' ? ['Microstrip feed-line width'] : ['Approximate electrical-length scaling'])];
  A.meta.model = model; A.meta.capabilities = capabilities;
  return { art: A, bounds: bounds(A), layers: [...new Set([...A.pads, ...A.tracks].map(p => p.layer))], analysis: { ...a, ee, lambda0, boardWidth: b.w + 2 * margin, boardHeight: b.h + 2 * margin }, notes, model, capabilities };
}
