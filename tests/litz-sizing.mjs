import assert from 'node:assert/strict';
import { artwork } from '../web/js/engine/artwork.js';
import { buildLitz, litzPreset, litzCopperEnvelope } from '../web/js/engine/litz.js';
import { checkLitzFit, resolveLitzSize, suggestLitzFit } from '../web/js/engine/litz-sizing.js';
import { validateLitz } from '../web/js/engine/litz-validation.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { sexpr } from '../web/js/engine/boardcheck.js';

const preset = litzPreset();
assert.equal(preset.litzSizeMode, 'nominal');
assert.equal(preset.litzOutline, false, 'older saved designs do not acquire a board edge');
const old = buildLitz(preset);
assert.equal(old.art.outline.length, 0);
assert.equal(old.art.vias.length, 480);
assert.ok(Math.abs(old.stats.outerDiameterMM - 167.113) < 1e-6);
assert.equal(validateLitz(old).ok, true);

const input = { ...preset, litzSizeMode: 'finished', litzTargetOuter: 170,
  litzMinBore: 40, litzOutline: true, litzBoreCutout: true };
const snapshot = structuredClone(input);
const resolved = resolveLitzSize(input);
const finished = buildLitz(input);
assert.deepEqual(input, snapshot, 'finished sizing must not mutate the saved input');
assert.equal(resolved.turns, input.turns);
assert.equal(resolved.litzStepDeg, input.litzStepDeg);
assert.equal(finished.config.dOuter, resolved.dOuter);
assert.ok(finished.stats.fullCopperDiameterMM <= 170);
assert.ok(finished.stats.fullCopperDiameterMM > 169.99);
assert.ok(finished.stats.fullCopperBoreMM >= 40);
assert.equal(validateLitz(finished).ok, true);

function originToLine(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs(a[0] * b[1] - a[1] * b[0]) / Math.hypot(dx, dy);
}
const outer = finished.art.outline.find(o => o.role === 'board-edge');
const hole = finished.art.outline.find(o => o.role === 'bore-cutout');
assert.deepEqual(outer.pts[0], outer.pts.at(-1));
assert.deepEqual(hole.pts[0], hole.pts.at(-1));
for (let i = 1; i < outer.pts.length; i++) {
  assert.ok(originToLine(outer.pts[i - 1], outer.pts[i]) - finished.stats.fullCopperDiameterMM / 2 >= input.litzEdgeClearance);
}
for (const p of hole.pts) assert.ok(finished.stats.fullCopperBoreMM / 2 - Math.hypot(...p) >= input.litzEdgeClearance);
assert.ok(finished.stats.boardOuterDiameterMM > finished.stats.fullCopperDiameterMM + 2 * input.litzEdgeClearance);
assert.ok(finished.stats.boardBoreDiameterMM < finished.stats.fullCopperBoreMM - 2 * input.litzEdgeClearance);
const pcb = sexpr(exportKicadPcb(finished.art));
assert.equal(pcb.filter(e => e[0] === 'gr_line' && e.find(n => Array.isArray(n) && n[0] === 'layer')?.[1] === 'Edge.Cuts').length, 1440);

// Large terminal geometry deliberately dominates the complete radial envelope.
const terminalConfig = { ...input, litzTargetOuter: 190, litzTerminalPad: 4,
  litzTerminalDrill: 2, litzBusWidth: 3, litzTerminalLead: 4,
  litzTerminalOffset: 8 };
const terminals = buildLitz(terminalConfig);
assert.equal(validateLitz(terminals).ok, true, 'wider buses must preserve endpoint-only strand connections');
assert.ok(terminals.stats.fullCopperDiameterMM > terminals.stats.outerDiameterMM + 5);
assert.ok(terminals.stats.fullCopperDiameterMM <= terminalConfig.litzTargetOuter);
for (const p of terminals.art.pads) {
  assert.equal(p.w, 4); assert.equal(p.drill, 2);
  assert.ok(p.x + p.w / 2 <= terminals.stats.fullCopperBounds.x1 + 1e-9);
}
assert.ok(terminals.art.tracks.filter(t => t.role === 'terminal-bus').every(t => t.width === 3));
for (const s of terminals.strands) {
  assert.equal(s.sections[0].terminalLead, true);
  assert.equal(s.sections.at(-1).terminalLead, true);
  assert.ok(Math.abs(Math.hypot(s.sections[0].pts[0][0] - s.sections[0].pts[1][0], s.sections[0].pts[0][1] - s.sections[0].pts[1][1]) - 4) < 1e-9);
}

// Complete-copper bounds must survive a downstream 0.001 mm XY conversion.
for (const geometry of [finished, terminals]) {
  const rounded = structuredClone(geometry.art), xy = p => p.map(n => Number(n.toFixed(3)));
  for (const t of rounded.tracks) t.pts = t.pts.map(xy);
  for (const p of [...rounded.vias, ...rounded.pads]) { p.x = Number(p.x.toFixed(3)); p.y = Number(p.y.toFixed(3)); }
  for (const o of rounded.outline) o.pts = o.pts.map(xy);
  const envelope = litzCopperEnvelope(rounded);
  assert.ok(envelope.diameterMM <= geometry.config.litzTargetOuter, 'serialized copper fits the requested diameter');
  const boundary = rounded.outline.find(o => o.role === 'board-edge');
  for (let i = 1; i < boundary.pts.length; i++) assert.ok(originToLine(boundary.pts[i - 1], boundary.pts[i]) - envelope.outerRadiusMM >= geometry.config.litzEdgeClearance);
}

// The bore comes from the closest point of a segment, not its endpoints.
const fixture = artwork();
fixture.tracks.push({ layer: 'F.Cu', width: 2, pts: [[3, -10], [3, 10]] });
const envelope = litzCopperEnvelope(fixture);
assert.equal(envelope.boreMM, 4);
assert.equal(envelope.bounds.x0, 2);
assert.equal(envelope.bounds.x1, 4);

const impossible = { ...input, litzTargetOuter: 150 };
assert.throws(() => buildLitz(impossible), /bore.*Reduce turns|need at least/i);
const before = structuredClone(impossible);
const suggestions = suggestLitzFit(impossible);
assert.deepEqual(impossible, before);
assert.ok(suggestions.checked <= 90);
assert.ok(suggestions.candidates.length > 0 && suggestions.candidates.length <= 6);
assert.equal(suggestions.requiresCopperValidation, true);
const selected = suggestions.candidates[0];
assert.equal(selected.turns, 4);
assert.equal(selected.litzStepDeg, 30);
assert.ok(selected.fullCopperDiameterMM <= 150);
assert.ok(selected.fullCopperBoreMM >= input.litzMinBore);
assert.equal(validateLitz(buildLitz(selected.config)).ok, true);
assert.ok(checkLitzFit(selected.config).ok);
for (const patch of [
  { litzTerminalPad: 1, litzTerminalDrill: 0.9 },
  { litzBusWidth: 3, litzTerminalLead: 1 },
  { litzTerminalPad: 4, litzTerminalOffset: 1 },
  { litzBoreCutout: true, litzOutline: false },
  { litzSizeMode: 'finished', litzMinBore: 171 },
  { litzSizeMode: 'unknown' },
]) assert.throws(() => buildLitz({ ...preset, ...patch }), /PCB Litz/);

console.log('PCB Litz finished sizing, bounded fit suggestions, configurable terminals, exact copper bounds, and clear closed board outlines passed.');
