import { artwork, boundsCopper, rect } from './artwork.js';
import { exportKicadPcb } from './exporters.js';
import { fingerprint } from './transformer-project.js';

function modeledStack(result) {
  const { signal, reference, h, t, referenceT = t } = result.rfStack;
  return { signal, reference, dielectricMm: h, signalCopperMm: t, referenceCopperMm: referenceT,
    relativePermittivity: result.ctx.er, lossTangent: result.ctx.tanD };
}

function fixtureRevision(result) {
  const { art, design } = result;
  return fingerprint({
    stack: modeledStack(result), impedanceOhms: design.Z0,
    tracks: art.tracks.map(({ layer, width, pts }) => [layer, width, pts]),
    pads: art.pads.map(({ layer, x, y, w, h, drill, shape }) => [layer, x, y, w, h, drill, shape]),
    ports: art.ports.map(({ x, y, angle }) => [x, y, angle]),
  });
}

export function hairpinFixtures(result, name) {
  const { design, art } = result;
  if (design.kind !== 'hairpin') throw new Error('Choose the hairpin filter topology to export fixtures.');
  const stack = modeledStack(result);
  const revision = fixtureRevision(result);
  const manifest = { schema: 1, name, revision, stack, referenceImpedanceOhms: design.Z0,
    centerFrequencyHz: design.f0, coordinates: 'mm, X right, Y up. Use negative Y in the KiCad drawings.',
    fixtures: [] };
  const report = { schema: 1, revision, resonators: {}, pairs: {}, feeds: {} };
  const files = {};
  const groundInset = Math.max(3, 3 * stack.dielectricMm);
  function add(id, task, indices, feedIndex = null) {
    const fixture = artwork({ name: id, exactPaths: true, boardLayers: [stack.signal, stack.reference] });
    fixture.tracks = art.tracks.filter(t => indices.includes(t.index));
    if (feedIndex !== null) {
      fixture.tracks = [...fixture.tracks, art.tracks.filter(t => t.role === 'feed')[feedIndex]];
      fixture.pads = [art.pads[feedIndex]];
      fixture.ports = [art.ports[feedIndex]];
    } else fixture.tracks = fixture.tracks.map(track => ({ ...track, net: null }));
    const b = boundsCopper(fixture);
    const polygon = rect(b.x0 - groundInset, b.y0 - groundInset, b.x1 + groundInset, b.y1 + groundInset);
    const clearance = result.ctx.clearance;
    const antipads = fixture.pads.filter(p => p.drill > 0).map(p => ({
      x: p.x, y: p.y, radius: Math.max(p.w, p.h) / 2 + clearance,
    }));
    const plane = { layer: stack.reference, polygon, clearance };
    const edgeInset = groundInset + Math.max(0.6, clearance);
    const outline = rect(b.x0 - edgeInset, b.y0 - edgeInset, b.x1 + edgeInset, b.y1 + edgeInset);
    fixture.outline = [{ layer: 'Edge.Cuts', pts: outline }];
    const file = `${id}.kicad_pcb`;
    files[file] = exportKicadPcb(fixture, { referencePlane: plane, boardThickness: result.ctx.boardT });
    manifest.fixtures.push({
      id, task, file, resonators: indices.map(i => i + 1),
      outline,
      copper: { tracks: fixture.tracks, pads: fixture.pads },
      referencePlane: { ...plane, antipads },
      ports: fixture.ports.map(port => ({
        x: port.x, y: port.y, angleRadians: port.angle, signal: stack.signal, reference: stack.reference,
      })),
    });
  }
  design.resonators.forEach((_, i) => {
    const id = `resonator-${i + 1}`;
    add(id, 'Isolated resonant frequency', [i]);
    report.resonators[id] = { resonanceHz: null, unloadedQ: null };
  });
  design.resonators.slice(1).forEach((_, i) => {
    const id = `pair-${i + 1}-${i + 2}`;
    add(id, 'Coupling coefficient of adjacent resonators', [i, i + 1]);
    report.pairs[id] = { coupling: null };
  });
  for (const [i, id, index] of [[0, 'input-feed', 0], [1, 'output-feed', design.resonators.length - 1]]) {
    add(id, 'External Q at the tapped feed', [index], i);
    report.feeds[id] = { externalQ: null };
  }
  return { manifest, report, files: {
    ...files,
    'fixtures.json': JSON.stringify(manifest, null, 2),
    'extraction.template.json': JSON.stringify(report, null, 2),
    'README.txt': 'Use fixtures.json for the modeled signal-to-reference stack, copper, reference planes and ports. '
      + 'The KiCad files show the same fixture geometry. Refill their ground zones before viewing them. '
      + 'The isolated resonator and pair are eigenmode fixtures and have no driven ports. Use the tapped feed fixtures for external Q. '
      + 'Record the extracted values in extraction.template.json and open it from Planar Studio’s Filter tuning tab. '
      + 'Use a coupling magnitude from 0 to less than 1. Unloaded Q can be left blank to keep the estimated loss.\n',
  } };
}

export function extractedHairpin(result, report) {
  const d = result.design;
  if (report?.schema !== 1 || d.kind !== 'hairpin' || report.revision !== fixtureRevision(result)) {
    throw new Error('The extraction belongs to a different hairpin geometry or stack. Export new fixtures for this design.');
  }
  function valid(value, label, min, max = Infinity) {
    if (!Number.isFinite(value) || value <= min || value >= max) throw new Error(`Enter a valid extracted ${label}.`);
    return value;
  }
  const tanks = d.elements.filter(item => item.type === 'LC-parallel').map((tank, i) => {
    const values = report.resonators?.[`resonator-${i + 1}`];
    const w = 2 * Math.PI * valid(values?.resonanceHz, `frequency for resonator ${i + 1}`, 0, 1e15);
    const qu = values.unloadedQ == null ? tank.qu : valid(values.unloadedQ, `unloaded Q for resonator ${i + 1}`, 0);
    return { ...tank, L: 1 / (w * tank.b), C: tank.b / w, qu };
  });
  const qIn = valid(report.feeds?.['input-feed']?.externalQ, 'input external Q', 0);
  const qOut = valid(report.feeds?.['output-feed']?.externalQ, 'output external Q', 0);
  const elements = [{ kind: 'inverter', J: Math.sqrt(tanks[0].b / (d.Z0 * qIn)) }];
  for (const [i, tank] of tanks.entries()) {
    elements.push(tank);
    if (i === tanks.length - 1) break;
    const k = report.pairs?.[`pair-${i + 1}-${i + 2}`]?.coupling;
    const coupling = k === 0 ? 0 : valid(k, `coupling for pair ${i + 1}–${i + 2}`, 0, 1);
    elements.push({ kind: 'inverter', J: Math.max(1e-12, coupling * Math.sqrt(tank.b * tanks[i + 1].b)) });
  }
  elements.push({ kind: 'inverter', J: Math.sqrt(tanks.at(-1).b / (d.Z0 * qOut)) });
  return { ...d, elements };
}
