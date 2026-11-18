import { expect } from 'playwright/test';
import { defaults, compute } from '../web/js/ws/motor.js';
import { captureSession, frame, publishShots } from './feature-capture.mjs';

// Generate sample input to exercise the same CSV import used for bench data.
function torqueCsv(config) {
  const { phaseCoefficients } = compute(config, {}).familyAnalysis;
  const torque = ([a, b], theta) => a * Math.cos(theta) + b * Math.sin(theta);
  const samples = ['angle_deg,torque_a_nm,torque_b_nm,detent_nm'];
  const period = 360 / config.stepperPolePairs;
  for (let i = 0; i < 72; i++) {
    const theta = i * 2 * Math.PI / 72;
    const phaseA = torque(phaseCoefficients[0], theta - 0.14);
    const phaseB = 0.82 * torque(phaseCoefficients[1], theta - 0.22);
    samples.push([i * period / 72, phaseA, phaseB, 0.00016 * Math.sin(4 * theta)].join(','));
  }
  return Buffer.from(samples.join('\n'));
}

await captureSession(async ctx => {
  const { page, set, select, workspace, shot } = ctx;
  const names = ['motor-radial-wave', 'stepper-loaded-move', 'stepper-microstep-calibration'];

  await workspace('PCB motor');
  await select('Rotary winding', 'radial-wave');
  await expect(page.locator('#side')).toContainText('Finished board diameter');
  await page.locator('#t-labels').click();
  await frame(ctx);
  await shot(names[0]);

  const stepper = { ...defaults(), motorFamily: 'stepper', layers: 4, turns: 6, microsteps: 8 };
  await page.locator('#t-labels').click();
  await select('Motor family', stepper.motorFamily);
  await select('Stepper copper layers', String(stepper.layers));
  await set('Turns per layer', stepper.turns);
  await select('Microsteps per full step', String(stepper.microsteps));
  await frame(ctx);

  const dialog = page.getByRole('dialog', { name: 'Design tools' });
  const open = () => page.getByRole('button', { name: 'Design tools', exact: true }).click();
  const tool = name => dialog.getByRole('button', { name, exact: true });
  const finish = async name => {
    await tool(name).click();
    await expect(dialog.locator('.tools-status')).toHaveText('Calculation complete.');
  };
  const frameResults = async () => {
    await dialog.locator('.tools-results').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.mouse.move(1, 1);
  };

  await open();
  await tool('Loaded move').click();
  await set('Maximum speed (°/s)', 540);
  await set('Acceleration (°/s²)', 2400);
  await set('Load torque (N·m)', 0.001);
  await set('H-bridge voltage drop (V)', 0.8);
  await finish('Simulate loaded move');
  await expect(dialog.getByText('No sustained full-step error', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Commanded and actual rotor angle' })).toBeVisible();
  await frameResults();
  await shot(names[1]);

  await tool('Close').click();
  await select('Microsteps per full step', '4');
  await open();
  await tool('Microstep calibration').click();
  await set('Static load torque (N·m, positive resists increasing angle)', 0.0004);
  await page.getByLabel('Import stepper torque CSV').setInputFiles({
    name: 'synthetic-stepper-torque.csv',
    mimeType: 'text/csv',
    buffer: torqueCsv(stepper),
  });
  await expect(dialog.locator('.tools-status')).toHaveText('Phase torque data loaded.');
  await finish('Calculate corrected currents');
  await expect(dialog.getByRole('heading', { name: 'Nominal microstep angle error' })).toBeVisible();
  await dialog.getByText('Corrected current table', { exact: true }).click();
  const table = dialog.getByRole('table', { name: 'Corrected microstep currents' });
  await expect(table.getByRole('row')).toHaveCount(17);
  await expect(table).not.toContainText('—');
  await frameResults();
  await shot(names[2]);

  await publishShots(ctx, names, { directory: 'docs/screenshots/experimental', manifest: 'motor-studies-capture.json' });
}, { width: 1440, height: 1240, deviceScaleFactor: 1 });
