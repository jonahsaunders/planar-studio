import { artwork, bounds, label, rect, track } from './artwork.js';
import { ALPHA_CU, RHO_CU20, analyse } from './coil.js';
import { familyAnalysis, familyLayout } from './motorfamilies.js';
import { exportDxf, exportKicadMod, exportKicadPcb } from './exporters.js';

export const PLANAR_CONSTRUCTIONS = [
  { value: 'pcb-grid', label: 'PCB coil grid' },
  { value: 'wire-tile', label: 'Wire-wound stator tile' },
  { value: 'moving-coil', label: 'Moving-coil carriage' },
  { value: 'double-sided', label: 'Double-sided magnet carriage' },
  { value: 'crossed', label: 'Crossed linear motors' },
  { value: 'sawyer', label: 'Sawyer planar stepper' },
];
export const planarConstruction = cfg => cfg.planarConstruction || 'pcb-grid';
export const planarBuildDefaults = () => ({
  planarConstruction: 'pcb-grid', wireRows: 2, wireCols: 2, wirePitch: 20,
  wireWidth: 12, wireDiameter: 0.5, wireInsulated: 0.56, wireTurns: 8,
  magnetCols: 3, magnetRows: 3, magnetFill: 0.85, planarMagnetT: 4,
  planarGap: 1, planarFaceHarmonic: 0.45, planarLowerGap: 1, planarLowerB: 0.45, planarOffsetX: 0, planarOffsetY: 0,
  crossedDrive: 'linear-pcb', crossedXCoils: 6, crossedYCoils: 6, crossedHeight: 12,
  planarForceX: 0, planarForceY: 0, planarPhaseR: 0, flexureX: 0, flexureY: 0,
  toothPitch: 2, toothFill: 0.5, toothDepth: 0.6, sawyerGap: 0.1, sawyerHead: 24, sawyerMicrosteps: 4,
});

const TAU = 2 * Math.PI;
const MECHANICAL = 'Open the construction package for the individual fabrication drawings or winding boards.';
const labelsFor = mode => PLANAR_CONSTRUCTIONS.find(option => option.value === mode)?.label;
const sum = values => values.reduce((total, value) => total + value, 0);
const extent = (w, h, x = 0, y = 0) => rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
const round = x => Number(x.toFixed(4));
const pairNames = ['X phase A', 'X phase B', 'Y phase A', 'Y phase B'];
const requireRange = (value, min, max, name) => {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(name + ' must be between ' + min + ' and ' + max + '.');
};
function count(value, min, max, name) {
  requireRange(value, min, max, name);
  if (!Number.isInteger(value)) throw new Error(name + ' must be a whole number.');
}
function drawing(name, w, h) {
  const art = artwork({ name, kind: 'motor-construction', placementError: MECHANICAL });
  art.outline.push({ layer: 'Profile', pts: extent(w, h) });
  return art;
}
const path = (art, layer, pts, width = 0.14) => art.tracks.push(track(layer, width, pts));
const mark = (art, x, y, text, size = 0.8) => art.labels.push(label(x, y, text, { size, layer: 'Labels' }));

function magnetPlate(cfg, name, inverted = false) {
  const w = cfg.polePitch * cfg.magnetCols, h = cfg.yPolePitch * cfg.magnetRows;
  const art = drawing(name, w + 4, h + 4);
  const firstX = (1 - cfg.magnetCols) * cfg.polePitch / 2;
  const firstY = (1 - cfg.magnetRows) * cfg.yPolePitch / 2;
  const magnets = [];
  for (let row = 0; row < cfg.magnetRows; row++) for (let col = 0; col < cfg.magnetCols; col++) {
    const x = firstX + col * cfg.polePitch, y = firstY + row * cfg.yPolePitch;
    const width = cfg.polePitch * cfg.magnetFill, height = cfg.yPolePitch * cfg.magnetFill;
    const north = ((row + col + Number(inverted)) % 2) === 0;
    path(art, 'Magnet_Pockets', extent(width, height, x, y));
    mark(art, x, y, north ? 'N' : 'S', Math.min(width, height) * 0.18);
    magnets.push({ x, y, width, height, thickness: cfg.planarMagnetT, face: north ? 'N' : 'S' });
  }
  return { art, width: w, height: h, firstX, firstY, magnets };
}

function wireTile(cfg) {
  count(cfg.wireTurns, 1, 80, 'Turns per coil');
  requireRange(cfg.wireDiameter, 0.1, 4, 'Bare wire diameter');
  requireRange(cfg.wireInsulated, cfg.wireDiameter, 5, 'Insulated wire diameter');
  count(cfg.wireCols, 2, 8, 'Tile columns'); count(cfg.wireRows, 2, 8, 'Tile rows');
  requireRange(cfg.wireWidth, 3, 60, 'Square coil width');
  requireRange(cfg.wirePitch, cfg.wireWidth + cfg.wireInsulated, 100, 'Coil pitch');
  const radius = (cfg.wireWidth - cfg.wireInsulated) / 2;
  const max = Math.floor((radius - cfg.wireInsulated) / cfg.wireInsulated);
  if (max < 1 || cfg.wireTurns > max) throw new Error('The selected wire and turns leave no room for the coil center. Reduce turns or enlarge the coil.');
  const local = [[radius, -radius]];
  for (let i = 0; i < cfg.wireTurns; i++) {
    const r = radius - i * cfg.wireInsulated;
    local.push([r, r], [-r, r], [-r, -r], [r - cfg.wireInsulated, -r]);
  }
  const length = sum(local.slice(1).map(([x, y], i) => Math.hypot(x - local[i][0], y - local[i][1]))) + 2 * cfg.wireWidth;
  const resistance = RHO_CU20 * (1 + ALPHA_CU * (cfg.tempC - 20)) * length * 1e3 / (Math.PI * cfg.wireDiameter ** 2 / 4);
  const w = cfg.wireCols * cfg.wirePitch, h = cfg.wireRows * cfg.wirePitch;
  const art = drawing('Wire coil carrier', w, h);
  const placed = [], locations = [];
  for (let row = 0; row < cfg.wireRows; row++) for (let col = 0; col < cfg.wireCols; col++) {
    const x = (col - (cfg.wireCols - 1) / 2) * cfg.wirePitch, y = (row - (cfg.wireRows - 1) / 2) * cfg.wirePitch;
    const pts = local.map(([px, py]) => [px + x, py + y]);
    path(art, 'Wire_Centerlines', pts, cfg.wireInsulated);
    path(art, 'Coil_Envelopes', extent(cfg.wireWidth, cfg.wireWidth, x, y));
    const name = 'C' + (locations.length + 1);
    mark(art, x, y, name);
    locations.push({ name, x, y });
    placed.push({ x, y, loops: [[...pts, pts[0]]] });
  }
  return { art, placed, locations, length, resistance };
}

// A rectangular checkerboard uses the product of the two pole harmonics.
// The separable first spatial harmonic decays with distance from its face.
function finiteDrive(cfg, placed, plate, mode, materialDepth) {
  const kx = Math.PI / cfg.polePitch, ky = Math.PI / cfg.yPolePitch;
  const attenuation = Math.hypot(kx, ky), moving = mode === 'moving-coil';
  const double = mode === 'double-sided', layers = placed[0].loops.length;
  const faces = Array.from({ length: layers }, (_, i) => {
    const depth = layers === 1 ? materialDepth / 2 : materialDepth * i / (layers - 1);
    return [cfg.planarFaceHarmonic * Math.exp(-attenuation * (cfg.planarGap + depth)),
      double ? cfg.planarLowerB * Math.exp(-attenuation * (cfg.planarLowerGap + materialDepth - depth)) : 0];
  });
  const samples = placed.map(cell => cell.loops.map(loop => {
    const segments = [];
    for (let i = 1; i < loop.length; i++) {
      const [ax, ay] = loop[i - 1], [bx, by] = loop[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (Math.min(cfg.polePitch, cfg.yPolePitch) / 8)));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        segments.push([ax + (bx - ax) * t, ay + (by - ay) * t, (by - ay) * 1e-3 / n, (ax - bx) * 1e-3 / n]);
      }
    }
    return segments;
  }));
  const halfX = plate.width / 2, halfY = plate.height / 2;
  const fade = (remaining, pole) => {
    const t = Math.min(1, Math.max(0, remaining * 2 / pole));
    return t * t * (3 - 2 * t);
  };
  const field = (x, y) => {
    if (Math.abs(x) >= halfX || Math.abs(y) >= halfY) return 0;
    return Math.cos(kx * (x - plate.firstX)) * Math.cos(ky * (y - plate.firstY)) *
      fade(halfX - Math.abs(x), cfg.polePitch) * fade(halfY - Math.abs(y), cfg.yPolePitch);
  };
  return (x, y) => {
    const offsetX = moving ? x : -x, offsetY = moving ? y : -y, sign = moving ? 1 : -1;
    const generators = samples.map(cell => {
      let fx = 0, fy = 0;
      cell.forEach((segments, layer) => {
        const [upper, lower] = faces[layer];
        for (const [px, py, dx, dy] of segments) {
          const bx = px + offsetX, by = py + offsetY;
          const b = upper * field(bx, by) + (lower ? lower * field(bx - cfg.planarOffsetX, by - cfg.planarOffsetY) : 0);
          fx += b * dx; fy += b * dy;
        }
      });
      return [sign * fx, sign * fy];
    });
    const maxX = Math.max(1e-15, ...generators.map(g => Math.abs(g[0])));
    const maxY = Math.max(1e-15, ...generators.map(g => Math.abs(g[1])));
    return { generators, command: (ix, iy) => generators.map(([gx, gy]) => ix * gx / maxX + iy * gy / maxY) };
  };
}

function magnetConstruction(cfg, names, env, options, mode) {
  count(cfg.magnetCols, 2, 16, 'Magnet columns'); count(cfg.magnetRows, 2, 16, 'Magnet rows');
  requireRange(cfg.polePitch, 5, 100, 'Magnet pitch X'); requireRange(cfg.yPolePitch, 5, 100, 'Magnet pitch Y');
  requireRange(cfg.magnetFill, 0.2, 0.98, 'Magnet pitch fill');
  requireRange(cfg.planarMagnetT, 0.5, 50, 'Magnet thickness');
  requireRange(cfg.planarGap, 0, 40, 'Upper or single air gap'); requireRange(cfg.planarFaceHarmonic, 0, 2, 'Face field');
  const wire = mode === 'wire-tile', double = mode === 'double-sided', moving = mode === 'moving-coil';
  if (double) {
    requireRange(cfg.planarLowerGap, 0, 40, 'Lower air gap'); requireRange(cfg.planarLowerB, 0, 2, 'Lower face field');
    requireRange(cfg.planarOffsetX, -100, 100, 'Lower plate X offset'); requireRange(cfg.planarOffsetY, -100, 100, 'Lower plate Y offset');
  }
  if (!wire && !moving && !double) throw new Error('Choose a supported magnet and winding arrangement.');
  const winding = wire ? wireTile(cfg) : familyLayout(cfg, names, env);
  // The first field maximum points toward +Z through the winding.
  // An upper south-facing pole and a lower north-facing pole reinforce it.
  const upper = magnetPlate(cfg, moving ? 'Fixed magnet bed' : double ? 'Upper magnet plate' : 'Magnet carriage', !moving);
  const lower = double ? magnetPlate(cfg, 'Lower magnet plate') : null;
  const magnetPart = moving ? 'magnet-bed' : double ? 'upper-magnet-plate' : 'magnet-carriage';
  const parts = { [wire ? 'wire-carrier' : 'coil-board']: winding.art, [magnetPart]: upper.art };
  if (lower) parts['lower-magnet-plate'] = lower.art;
  const windingBounds = bounds(winding.art);
  const details = {
    stator: moving ? 'Fixed magnet bed' : wire ? 'Wire tile' : 'Fixed coil PCB', mover: moving ? 'Coil PCB' : 'Magnet carriage',
    coilWidth: windingBounds.w, coilHeight: windingBounds.h, magnetWidth: upper.width, magnetHeight: upper.height,
    gap: cfg.planarGap, lowerGap: double ? cfg.planarLowerGap : null,
    faceSpan: double ? cfg.planarGap + cfg.boardT + cfg.planarLowerGap : null,
    magnets: upper.magnets, lowerMagnets: lower?.magnets ?? [], lowerOffset: double ? [cfg.planarOffsetX, cfg.planarOffsetY] : null,
    coilCenters: winding.locations ?? winding.placed.map(({ x, y }, i) => ({ name: 'C' + (i + 1), x, y })),
    wireLength: wire ? winding.length : null, wireTurns: wire ? cfg.wireTurns : null,
    boreClearance: wire ? cfg.wireWidth - 2 * cfg.wireTurns * cfg.wireInsulated : null,
  };
  const layout = { ...winding, art: winding.art, instances: winding.placed.length, parts, boardParts: wire ? {} : { 'coil-board': winding.art },
    details, limits: 'Finite checkerboard field using its first spatial harmonic, exponential gap decay and tapered edges. Enter the face harmonic amplitude from measurement or simulation. Winding return paths are approximated. Guides, yaw, vertical force and the magnetic circuit are outside this model.' };
  if (options.quick) return layout;
  const analysis = wire ? null : analyse(winding.coilCfg, winding.coil, { segmentCap: options.segmentCap || 1800 });
  if (analysis) analysis.drc.turnsOK = cfg.turns <= winding.coil.spiral.maxTurns + 1e-9;
  const resistance = wire ? winding.resistance : analysis.Rdc;
  return { ...layout, driveAt: finiteDrive(cfg, winding.placed, upper, mode, wire ? cfg.wireInsulated : cfg.boardT),
    channelNames: details.coilCenters.map(cell => cell.name), resistance: winding.placed.map(() => resistance), analysis };
}

function linearPhaseDrive(model, pitch, position) {
  const angle = Math.PI * position / pitch;
  const gains = model.phaseCoefficients.map(([a, b]) => a * Math.cos(angle) + b * Math.sin(angle));
  const mean = sum(gains) / gains.length;
  const max = Math.max(1e-15, ...gains.map(v => Math.abs(v - mean)));
  const weights = gains.map(g => (g - mean) / max);
  return { gain: sum(gains.map((g, i) => g * weights[i])), weights };
}

function linearMagnetTrack(cfg, coilCount, polePitch, axis) {
  const needed = (coilCount - 1) * 2 * polePitch / 3 + cfg.cellDiameter + cfg.travel;
  const poles = Math.ceil(needed / polePitch);
  const length = poles * polePitch, width = cfg.cellDiameter;
  const art = drawing(axis + ' axis magnet track', length + 4, width + 4);
  for (let i = 0; i < poles; i++) {
    const x = (i - (poles - 1) / 2) * polePitch;
    path(art, 'Magnet_Pockets', extent(polePitch * 0.85, width, x, 0));
    mark(art, x, 0, i % 2 === 0 ? 'N' : 'S');
  }
  return { length, width, poles, art };
}

function crossedConstruction(cfg, names, env, options) {
  requireRange(cfg.crossedHeight, 0, 80, 'Axis separation');
  if (!['linear-pcb', 'voice-coil'].includes(cfg.crossedDrive)) throw new Error('Choose a crossed-stage drive.');
  const voice = cfg.crossedDrive === 'voice-coil';
  const parts = {}, boardParts = {};
  if (voice) validateMeasuredDrive(cfg);
  const magnetTracks = [];
  const axes = voice ? [] : [cfg.polePitch, cfg.yPolePitch].map((polePitch, i) => {
    const axis = i ? 'Y' : 'X';
    const axisCfg = { ...cfg, motorFamily: 'linear', polePitch, moverX: i ? cfg.moverY : cfg.moverX,
      linearCoils: i ? cfg.crossedYCoils : cfg.crossedXCoils, busEnabled: true, terminalBreakout: 'phases' };
    const result = familyLayout(axisCfg, names, { name: axis + ' axis', net: (env.net || 'COIL') + '_' + axis });
    parts[axis + '-axis'] = result.art; boardParts[axis + '-axis'] = result.art;
    const magnets = linearMagnetTrack(cfg, axisCfg.linearCoils, polePitch, axis);
    parts[axis + '-magnet-track'] = magnets.art;
    magnetTracks.push({ axis, length: magnets.length, width: magnets.width, poles: magnets.poles });
    return result;
  });
  if (voice) {
    requireRange(cfg.flexureX, 0, 1000, 'X spring rate'); requireRange(cfg.flexureY, 0, 1000, 'Y spring rate');
  }
  const sizes = voice ? Array.from({ length: 2 }, () => ({ w: cfg.travel + 24, h: 16 })) : axes.map((axis, i) => {
    const board = bounds(axis.art), magnets = magnetTracks[i];
    return { w: Math.max(board.w, magnets.length + 4), h: Math.max(board.h, magnets.width + 4) };
  });
  const [x, y] = sizes;
  const art = drawing('Crossed XY stage', Math.max(x.w, y.h + cfg.travel) + 6, Math.max(y.w, x.h) + 6);
  path(art, 'X_Axis', extent(x.w, x.h)); path(art, 'Y_Axis', extent(y.h, y.w));
  path(art, 'Travel', extent(cfg.travel, cfg.travel));
  mark(art, x.w / 2 - 4, 0, 'X'); mark(art, 0, y.w / 2 - 4, 'Y');
  parts['stage-arrangement'] = art;
  const limits = voice
    ? 'Static voice-coil model using entered force per amp and linear spring rate. The layout shows actuator envelopes and travel. Flexure stress, safe stroke and dynamics require mechanical design and verification.'
    : 'Each axis uses its own three-phase winding board and a synchronized, balanced drive. Full magnetic-track coverage is assumed. The Y assembly rides on the X assembly. The drawing gives projected envelopes and their separation.';
  const layout = { art, parts, boardParts, details: { size: [x.w, x.h, y.w, y.h], axisSeparation: cfg.crossedHeight, voice,
    magnetTracks },
  limits, instances: voice ? 2 : sum(axes.map(axis => axis.instances)) };
  if (options.quick) return layout;
  if (voice) return { ...layout, driveAt: (x, y) => ({ generators: [[cfg.planarForceX, 0], [0, cfg.planarForceY]],
    bias: [-cfg.flexureX * x, -cfg.flexureY * y], command: (ix, iy) => [ix, iy] }),
  channelNames: ['X voice coil', 'Y voice coil'], resistance: measuredResistance(cfg, 2), needsCalibration: !cfg.planarForceX || !cfg.planarForceY };
  const [mx, my] = axes.map(axis => familyAnalysis(axis, options).familyAnalysis);
  return { ...layout, driveAt: (x, y) => {
    const dx = linearPhaseDrive(mx, cfg.polePitch, x), dy = linearPhaseDrive(my, cfg.yPolePitch, y);
    return { generators: [[dx.gain, 0], [0, dy.gain]], command: (ix, iy) => [ix, iy],
      windings: ([ix, iy]) => [...dx.weights.map(w => ix * w), ...dy.weights.map(w => iy * w)] };
  }, channelNames: ['X A', 'X B', 'X C', 'Y A', 'Y B', 'Y C'],
  resistance: [mx.Rphase, mx.Rphase, mx.Rphase, my.Rphase, my.Rphase, my.Rphase] };
}

function validateMeasuredDrive(cfg) {
  requireRange(cfg.planarForceX, 0, 200, 'X force per amp'); requireRange(cfg.planarForceY, 0, 200, 'Y force per amp');
  requireRange(cfg.planarPhaseR, 0, 500, 'Winding resistance');
}
const measuredResistance = (cfg, n) => cfg.planarPhaseR ? Array(n).fill(cfg.planarPhaseR) : null;

function sawyerConstruction(cfg, options) {
  requireRange(cfg.toothPitch, 0.5, 20, 'Tooth pitch'); requireRange(cfg.toothFill, 0.2, 0.8, 'Tooth land fraction');
  requireRange(cfg.toothDepth, 0.05, 5, 'Groove depth'); requireRange(cfg.sawyerGap, 0.01, 3, 'Working gap');
  requireRange(cfg.sawyerHead, 12, 100, 'Forcer width');
  count(cfg.sawyerMicrosteps, 1, 64, 'Microsteps per full step');
  validateMeasuredDrive(cfg);
  const commandedTeeth = Math.ceil((cfg.travel + cfg.sawyerHead) / cfg.toothPitch) + 2;
  const size = commandedTeeth * cfg.toothPitch;
  const groove = cfg.toothPitch * (1 - cfg.toothFill);
  const platen = drawing('Toothed steel platen', size, size);
  for (let i = 1; i < commandedTeeth; i++) {
    const offset = -size / 2 + cfg.toothPitch * i;
    path(platen, 'X_Grooves', extent(groove, size, offset, 0));
    path(platen, 'Y_Grooves', extent(size, groove, 0, offset));
  }
  const head = drawing('Sawyer forcer', cfg.sawyerHead, cfg.sawyerHead);
  const zone = cfg.sawyerHead / 2;
  pairNames.forEach((name, i) => {
    const horizontal = i >= 2, shift = (i % 2) * cfg.toothPitch / 4;
    const x = (i % 2 ? 1 : -1) * zone / 2, y = (i < 2 ? 1 : -1) * zone / 2;
    path(head, 'Pole_Envelopes', extent(zone * 0.84, zone * 0.84, x, y));
    const centre = horizontal ? y : x, halfLand = cfg.toothPitch * cfg.toothFill / 2;
    const start = Math.ceil((centre - zone * 0.42 + halfLand - shift) / cfg.toothPitch);
    const end = Math.floor((centre + zone * 0.42 - halfLand - shift) / cfg.toothPitch);
    if (start > end) throw new Error('Increase forcer width to fit the phased teeth within each pole region.');
    for (let tooth = start; tooth <= end; tooth++) {
      const pos = tooth * cfg.toothPitch + shift;
      path(head, 'Pole_Tooth_Lands', horizontal ? extent(zone * 0.6, 2 * halfLand, x, pos)
        : extent(2 * halfLand, zone * 0.6, pos, y));
    }
    mark(head, x, y, name);
  });
  const layout = { art: platen, parts: { 'toothed-platen': platen, 'forcer-layout': head }, boardParts: {},
    instances: 4, details: { platenSize: size, forcerSize: cfg.sawyerHead, groove, depth: cfg.toothDepth, workingGap: cfg.sawyerGap,
      fullStep: cfg.toothPitch / 4, microstep: cfg.toothPitch / (4 * cfg.sawyerMicrosteps) },
    limits: 'Tooth and pole reference geometry. Static force uses measured peak force per amp and ideal quadrature commutation. Steel, flux, preload, bearing stiffness, holding force and achievable positioning resolution require validation.' };
  if (options.quick) return layout;
  return { ...layout, channelNames: pairNames, resistance: measuredResistance(cfg, 4), needsCalibration: !cfg.planarForceX || !cfg.planarForceY,
    driveAt: (x, y) => {
      const sx = Math.sin(TAU * x / cfg.toothPitch), cx = Math.cos(TAU * x / cfg.toothPitch);
      const sy = Math.sin(TAU * y / cfg.toothPitch), cy = Math.cos(TAU * y / cfg.toothPitch);
      return { generators: [[cfg.planarForceX * sx, 0], [cfg.planarForceX * cx, 0], [0, cfg.planarForceY * sy], [0, cfg.planarForceY * cy]],
        command: (ix, iy) => [ix * sx, ix * cx, iy * sy, iy * cy] };
    } };
}

export function evaluatePlanarDrive(build, position, settings) {
  const drive = settings.drive || build.driveAt(...position);
  const currents = settings.currents || drive.command(settings.x, settings.y);
  const force = [0, 1].map(axis => (drive.bias?.[axis] ?? 0) + sum(drive.generators.map((g, i) => g[axis] * currents[i])));
  const windings = drive.windings ? drive.windings(currents) : currents;
  const copperLoss = build.resistance ? sum(windings.map((amps, i) => amps ** 2 * build.resistance[i])) : null;
  return { force, currents: windings, command: currents, copperLoss };
}

export function buildPlanarConstruction(input, names, env = {}, options = {}) {
  const cfg = { ...planarBuildDefaults(), ...input };
  const mode = planarConstruction(cfg), title = labelsFor(mode);
  if (!title || mode === 'pcb-grid') throw new Error('Choose a supported planar construction.');
  requireRange(cfg.travel, 1, 200, 'Travel');
  requireRange(cfg.moverX, -cfg.travel / 2, cfg.travel / 2, 'Mover X');
  requireRange(cfg.moverY, -cfg.travel / 2, cfg.travel / 2, 'Mover Y');
  requireRange(cfg.current, 0, 1000, 'X current command');
  requireRange(cfg.currentY, -1000, 1000, 'Y current command');
  requireRange(cfg.tempC, -40, 200, 'Winding temperature');
  const construction = mode === 'crossed' ? crossedConstruction(cfg, names, env, options) : mode === 'sawyer'
    ? sawyerConstruction(cfg, options) : magnetConstruction(cfg, names, env, options, mode);
  const layers = [...new Set([...construction.art.tracks.map(t => t.layer), ...construction.art.outline.map(o => o.layer)])];
  Object.assign(construction, { mode, title });
  const res = { family: 'planar', cfg, art: construction.art, layers, coil: construction.coil, instances: construction.instances,
    bounds: bounds(construction.art), construction, analysis: construction.analysis };
  if (options.quick) return res;
  const p = [cfg.moverX, cfg.moverY], command = evaluatePlanarDrive(construction, p, { x: cfg.current, y: cfg.currentY });
  const curve = options.skipCurve ? [] : Array.from({ length: 41 }, (_, i) => {
    const x = (i / 40 - 0.5) * cfg.travel;
    return { x, y: evaluatePlanarDrive(construction, [x, p[1]], { currents: command.command }).force[0],
      y2: evaluatePlanarDrive(construction, [p[0], x], { currents: command.command }).force[1] };
  });
  return { ...res, familyAnalysis: { kind: 'planar', fx: command.force[0], fy: command.force[1], currents: command.currents,
    peakCurrent: Math.max(...command.currents.map(Math.abs)), Pcu: command.copperLoss, curve, limits: construction.limits } };
}

export function constructionFiles(res) {
  const build = res.construction, files = {};
  for (const [id, art] of Object.entries(build.parts)) files[id + '.dxf'] = exportDxf(art, { tolerance: 0 });
  for (const [id, art] of Object.entries(build.boardParts)) {
    files[id + '.kicad_pcb'] = exportKicadPcb(art, { boardThickness: res.cfg.boardT, tolerance: res.cfg.tolerance });
    files[id + '.kicad_mod'] = exportKicadMod(art, { name: id, tolerance: res.cfg.tolerance });
  }
  files['construction.json'] = JSON.stringify({ schema: 1, construction: build.mode, details: build.details, settings: res.cfg, limits: build.limits }, (_key, value) =>
    typeof value === 'number' ? round(value) : value, 2);
  return files;
}
