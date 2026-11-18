import { captureSession, frame, publishShots } from './feature-capture.mjs';

export const motors = [
  ['rotary', 'screenshot-motor'],
  ['stepper', 'screenshot-motor-stepper'],
  ['linear', 'screenshot-motor-linear'],
  ['dual-rotor', 'screenshot-motor-dual-rotor'],
  ['planar', 'screenshot-motor-planar'],
];

export async function captureMotors(ctx) {
  const { page, select, workspace, shot, set } = ctx;
  await workspace('PCB motor');
  for (const [family, name] of motors) {
    await select('Motor family', family);
    if (family === 'stepper') await select('Microsteps per full step', '8');
    if (family === 'planar') { await set('Y drive current', 1.5); }
    await frame(ctx);
    await shot(name);
  }
}

export async function captureShowcase({ motorOnly = false } = {}) {
  await captureSession(async ctx => {
    const { page, settle, shot, range, set, select, workspace } = ctx;
    const names = [];
    const save = async name => { await frame(ctx); await shot(name); names.push(name); };
    if (!motorOnly) {
      await range('Copper layers', 2);
      await page.getByRole('button', { name: 'Parallel', exact: true }).click();
      await settle();
      await range('Turns per layer', 12);
      await range('Outer diameter', 26);
      await save('screenshot-inductor');

      await page.getByLabel('Generate in remaining board area', { exact: true }).check();
      await settle();
      await set('Requested contour turns', 5);
      await page.getByRole('button', { name: 'Add connector', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: 'Add hole', exact: true }).click();
      await settle();
      await set('Region 2 Radius (mm)', 2.5);
      await save('screenshot-obstacles');
      await page.getByLabel('Generate in remaining board area', { exact: true }).uncheck();
      await settle();

      await page.getByRole('button', { name: 'Design tools', exact: true }).click();
      await page.getByRole('button', { name: 'Magnetic field', exact: true }).click();
      await page.getByRole('button', { name: 'Calculate field slice', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.tools-status')?.textContent === 'Calculation complete.', null, { timeout: 60000 });
      await page.locator('.tools-field-map').waitFor({ state: 'visible' });
      await shot('screenshot-tools'); names.push('screenshot-tools');
      await page.getByRole('button', { name: 'Close', exact: true }).click();

      await workspace('Filter');
      const family = page.locator('select').filter({ has: page.locator('option[value="hairpin"]') });
      await family.selectOption('hairpin'); await settle();
      await range('Dielectric εr', 3.5);
      await range('Loss tangent', 0.004);
      await save('screenshot-filter');
      await family.selectOption('lumped'); await settle();
      await page.getByRole('button', { name: 'Low-pass', exact: true }).click();
      await settle();
      await page.locator('#btn-theme').click();
      await save('screenshot-filter-light');
      await page.locator('#btn-theme').click();

      await workspace('Antenna');
      await select('Antenna type', 'patch-array');
      await save('screenshot-antenna');
      await select('Antenna type', 'vivaldi');
      await save('screenshot-antenna-vivaldi');
      await select('Antenna type', 'nfc');
      await save('screenshot-antenna-nfc');

      await workspace('Transformer');
      await page.locator('#transformer-tab-windings').click();
      await page.getByLabel('Transformer type', { exact: true }).selectOption('ferrite');
      await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
      await settle();
      await page.locator('[data-key="core"] summary').click();
      await page.getByLabel('Catalog core assembly', { exact: true }).selectOption('eelp32');
      await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
      await settle();
      await range('Primary turns', 4);
      await page.locator('#transformer-tab-requirements').click();
      await set('Nominal input RMS voltage (V)', 24);
      await set('Target output RMS voltage', 12);
      await page.locator('#transformer-tab-windings').click();
      await page.locator('[data-key="layer-assistant"] summary').click();
      await save('screenshot-transformer');

      await page.locator('#transformer-tab-candidates').click();
      await page.getByRole('button', { name: 'Find feasible starting designs', exact: true }).click();
      await page.waitForFunction(() => {
        const text = document.querySelector('.transformer-search-results')?.textContent || '';
        return text.includes('Apply') && !document.querySelector('.transformer-search-results button:disabled');
      }, null, { timeout: 120000 });
      await settle();
      await page.locator('.transformer-pareto').scrollIntoViewIfNeeded();
      await shot('screenshot-transformer-search'); names.push('screenshot-transformer-search');
    }
    await captureMotors(ctx);
    names.push(...motors.map(([, name]) => name));
    await publishShots(ctx, names, { manifest: motorOnly ? 'motor-capture.json' : 'feature-capture.json' });
  });
}
