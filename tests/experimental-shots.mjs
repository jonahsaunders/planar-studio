// Capture the experimental gallery with actual workspace controls and result panels.
import assert from 'node:assert/strict';
import { ANTENNA_FAMILIES } from '../web/js/engine/antenna.js';
import { PLANAR_CONSTRUCTIONS } from '../web/js/engine/planar-constructions.js';
import { captureSession, frame, publishShots } from './feature-capture.mjs';

await captureSession(async ctx => {
  const { page, set, select, workspace, shot } = ctx;
  const names = [];
  const capture = async name => {
    await frame(ctx);
    await shot(name);
    names.push(name);
  };
  const side = page.locator('#side');

  await workspace('PCB motor');
  await select('Motor family', 'planar');
  await set('Mover X', 6);
  await set('Mover Y', -5);
  await set('Y drive current', 0.8);
  for (const { value, label } of PLANAR_CONSTRUCTIONS) {
    await select('Planar construction', value);
    if (value === 'double-sided') {
      await set('Lower plate X offset', 8);
      await set('Lower plate Y offset', -4);
      await set('Lower plate air gap', 1.35);
    }
    if (value === 'sawyer') {
      await set('Measured X force per amp', 0.2);
      await set('Measured Y force per amp', 0.25);
      await set('Measured winding resistance', 2);
    }
    const preview = value === 'pcb-grid' ? 'planar motor preview' : label + ' assembly';
    assert.ok(await side.getByRole('img', { name: preview, exact: true }).isVisible(), label);
    await capture('planar-' + value);
  }
  await select('Planar construction', 'crossed');
  await set('Mover X', 0);
  await set('Mover Y', 0);
  await set('Travel stroke', 4);
  await select('Axis drive', 'voice-coil');
  await set('Mover X', 1);
  await set('Mover Y', -0.5);
  await set('X spring rate', 0.08);
  await set('Y spring rate', 0.1);
  assert.match(await side.textContent(), /spring rate/);
  await capture('planar-voice-coil');

  await workspace('Antenna');
  for (const [value, label] of Object.entries(ANTENNA_FAMILIES)) {
    await select('Antenna type', value);
    assert.equal(await page.getByLabel('Antenna type', { exact: true }).inputValue(), value);
    assert.ok(await side.getByText(label, { exact: true }).count(), label);
    const topLayers = value === 'aperture-stacked-patch' ? ['F.Cu', 'In1.Cu'] : [];
    const layer = name => page.locator('#layer-chips').getByRole('button', { name, exact: true });
    for (const name of topLayers) {
      await layer(name).click();
      assert.equal(await layer(name).getAttribute('aria-pressed'), 'false');
    }
    await capture('antenna-' + value);
    for (const name of topLayers) await layer(name).click();
  }
  await publishShots(ctx, names, { directory: 'docs/screenshots/experimental', manifest: 'capture.json' });
}, { width: 1600, height: 1000, deviceScaleFactor: 1 });
