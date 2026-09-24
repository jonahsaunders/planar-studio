import assert from 'node:assert/strict';
import { buildLitz, litzPreset } from '../web/js/engine/litz.js';
import { validateLitz } from '../web/js/engine/litz-validation.js';
import { fabRules, validateManufacturing, stackSvg, manufacturingMarkdown, drillCSV } from '../web/js/engine/litz-manufacturing.js';

const cfg = { ...litzPreset(), litzOutline: true }, g = buildLitz(cfg), validation = validateLitz(g, cfg);
const screened = validateManufacturing(g, cfg, { validation });
assert.equal(screened.ok, true, JSON.stringify(screened.errors));
assert.equal(screened.geometryCheck, validation, 'existing clearance verification can be reused');
assert.equal(screened.viaPairs.reduce((sum, row) => sum + row.count, 0), g.art.vias.length);
assert.equal(screened.summary.throughTerminalCount, 2);
assert.equal(screened.viaPairs[1].maxAspectRatio, 2.13333, 'drilled depth includes both endpoint copper foils');
assert.ok(screened.edgeCheck.minClearance >= cfg.litzEdgeClearance || screened.edgeCheck.minClearance >= 1);
assert.equal(fabRules({}).etchAllowance, 0);

const strict = validateManufacturing(g, { ...cfg, litzFabProfile: 'conservative' }, { validation });
assert.equal(strict.ok, false);
assert.ok(strict.errors.some(e => e.code === 'annulus'));
assert.ok(strict.errors.some(e => e.code === 'aspect-ratio'));
assert.notEqual(strict.geometryCheck, validation, 'higher etched clearance must trigger a new geometric check');
const denied = validateManufacturing(g, { ...cfg, litzFabRules: { allowedViaPairs: ['F.Cu-In1.Cu'] } }, validation);
assert.ok(denied.errors.some(e => e.code === 'via-pair'));
const thin = validateManufacturing(g, { ...cfg, litzFabRules: { minPlating: 30, minDrill: 0.4 } }, validation);
assert.ok(thin.errors.some(e => e.code === 'drill'));
assert.ok(thin.errors.some(e => e.code === 'plating'));
assert.throws(() => fabRules({ litzFabRules: { minAnnulus: -1 } }));
assert.throws(() => fabRules({ litzFabRules: { copperThicknessMM: NaN } }));
assert.throws(() => fabRules({ litzFabRules: { allowedViaPairs: ['B.Cu-F.Cu'] } }));
const mismatch = validateManufacturing(g, { ...cfg, litzFabRules: { dielectricThicknessMM: [0.1, 0.1, 0.1] } }, validation);
assert.ok(mismatch.errors.some(e => e.code === 'dielectric-stack'));

for (const mutate of [
  a => a.outline = [],
  a => a.outline[0].pts.pop(),
  a => a.outline[0].pts = [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]],
]) {
  const bad = structuredClone(g); mutate(bad.art);
  assert.ok(validateManufacturing(bad, cfg, validation).errors.some(e => e.code.startsWith('outline')));
}
const bore = buildLitz({ ...cfg, litzBoreCutout: true });
assert.equal(validateManufacturing(bore, bore.config).ok, true);
// A board cutout containing a terminal cannot be waived by the copper net.
const terminalHole = structuredClone(g), p = g.art.pads[0];
terminalHole.art.outline.push({ layer:'Edge.Cuts', pts: [[p.x-2,p.y-2],[p.x+2,p.y-2],[p.x+2,p.y+2],[p.x-2,p.y+2],[p.x-2,p.y-2]] });
assert.equal(validateManufacturing(terminalHole, cfg, validation).edgeCheck.ok, false);

const svg = stackSvg(g);
assert.ok(svg.startsWith('<svg'));
assert.ok(svg.includes('Dielectric 2 · 0.5 mm'));
assert.ok(svg.includes('Schematic drawing; dimensions control'));
const csv = drillCSV(g).trim().split('\n');
assert.equal(csv.length, g.art.vias.length + g.art.pads.filter(p => p.drill > 0).length + 1);
assert.equal(Number(csv[1].split(',')[3]), Number((-g.art.vias[0].y).toFixed(5)));
const report = manufacturingMarkdown(g, cfg, screened);
assert.ok(report.includes('Generic screening passed'));
assert.ok(report.includes('no vendor qualification'));
assert.ok(report.includes('not an Excellon drill program'));
console.log('Litz manufacturing rules, etch margins, stack/drill reports, board edges, and cutout checks passed.');
