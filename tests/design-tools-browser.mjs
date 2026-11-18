/* Real browser/CSP gate. Requires npm install and npx playwright install chromium.
   Uses only local fixtures and a disposable plugin state directory. */
import { chromium, expect } from 'playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planar-browser-'));
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const proc = spawn(python, ['ipc_entry.py', '--print-url'], { cwd: root, env: { ...process.env, PLANAR_STUDIO_HOME: stateDir } });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not report its URL')), 12000);
    proc.stdout.on('data', (d) => { const m = String(d).match(/http\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    proc.on('error', reject);
  });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url);
  await expect(page.locator('#st-solve')).not.toContainText('solving', { timeout: 15000 });
  const exportButton = page.locator('#btn-export');
  await exportButton.click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await expect(exportDialog.getByRole('heading')).toBeFocused();
  await page.keyboard.press('3');
  await expect(page.locator('#app')).toHaveAttribute('data-workspace', 'inductor');
  await page.keyboard.press('Shift+Tab');
  await expect(exportDialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(exportDialog.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(exportButton).toBeFocused();

  const luma = hex => {
    const channels = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255);
    return channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  };
  for (const mode of ['dark', 'light']) {
    const root = page.locator('html');
    if (await root.getAttribute('data-theme') !== mode) await page.locator('#btn-theme').click();
    const contrast = await root.evaluate(node => {
      const style = getComputedStyle(node);
      return [['--text-mute', '--raised'], ['--accent-text', '--accent'], ['--bad', '--raised'],
        ['--warn', '--raised'], ['--good', '--raised']].map(pair => pair.map(key => style.getPropertyValue(key).trim()));
    });
    for (const colors of contrast) {
      const [min, max] = colors.map(luma).sort((a, b) => a - b);
      expect((max + 0.05) / (min + 0.05), `${mode} ${colors.join(' over ')}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await expect(exportButton).toHaveCSS('transition-duration', '0s');
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Design tools' })).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('.tools-tabs button')).toHaveCount(8);
  const set = async (label, value) => { await page.getByLabel(label, { exact: true }).fill(String(value)); await page.getByLabel(label, { exact: true }).press('Tab'); };
  const calculate = async (name) => {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.tools-status')).toHaveText('Calculation complete.', { timeout: 60000 });
  };
  await set('Target inductance (µH)', 1);
  await set('Minimum trace width (mm)', 0.3); await set('Maximum trace width (mm)', 0.3);
  await set('Minimum gap (mm)', 0.2); await set('Maximum gap (mm)', 0.2);
  await calculate('Find designs'); await expect(page.locator('.tools-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Apply design', exact: true }).first().click();
  await page.getByRole('button', { name: 'Coupled coils', exact: true }).click();
  await calculate('Calculate coupling'); await expect(page.getByText('Mutual inductance M', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tolerances', exact: true }).click(); await set('Samples', 4);
  await calculate('Run tolerance study'); await expect(page.getByRole('heading', { name: /estimated yield/ })).toBeVisible();
  await page.getByRole('button', { name: 'Magnetic field', exact: true }).click();
  await calculate('Calculate field slice'); await expect(page.locator('.tools-field-map')).toBeVisible();
  await page.getByRole('button', { name: 'Measurements', exact: true }).click();
  await page.getByLabel('Measurement file').setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from('Frequency (Hz),Z (ohm)\n1000,1\n1000000,8\n100000000,25') });
  await expect(page.getByRole('heading', { name: /fixture.csv/ })).toBeVisible();
  await expect(page.getByLabel('Saved measurement')).toBeFocused();
  await page.setViewportSize({ width: 740, height: 560 });
  const dialog = page.getByRole('dialog', { name: 'Design tools' });
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Measurements', exact: true })).toBeInViewport();
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  await dialog.screenshot({ path: path.join(root, 'dist', 'measurement-review-compact.png') });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });
  await page.getByRole('button', { name: 'Board checks', exact: true }).click();
  await page.getByLabel('Board file').setInputFiles({ name: 'fixture.kicad_pcb', mimeType: 'text/plain', buffer: Buffer.from('(kicad_pcb (gr_rect (start -20 -20) (end 20 20) (layer "Edge.Cuts") (stroke (width 0.1))))') });
  await expect(page.getByRole('heading', { name: /findings/ })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'PCB motor', exact: true }).click();
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await expect(page.getByText('Rotor poles', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continuous torque versus speed (rpm)' })).toBeVisible();
  await set('Requested speed (rpm)', 50000);
  await expect(dialog.getByRole('cell', { name: 'Bus voltage', exact: true })).toBeVisible();
  await expect(page.getByText('Outside estimated limits', { exact: true })).toBeVisible();
  await set('Measured / external-solver peak Bgap (T)', 0.6);
  await page.getByRole('button', { name: 'Apply external field to motor' }).click();
  await page.getByRole('button', { name: 'Motor sizing', exact: true }).click();
  await set('Target speed (rpm)', 1000);
  await set('Target torque (N·m)', 0.005);
  await set('Maximum finished diameter (mm)', 85);
  await calculate('Find motor designs');
  await page.getByRole('button', { name: 'Use this winding', exact: true }).first().click();
  await expect(page.locator('.tools-status')).toContainText('Applied');
  await page.getByRole('button', { name: 'Field map', exact: true }).click();
  const motorGrid = ['x_mm,y_mm,bz_t,gap_mm'];
  for (const gap of [1, 2]) for (const x of [-60, -20, 20, 60]) for (const y of [-60, -20, 20, 60]) {
    motorGrid.push([x, y, Math.cos(Math.atan2(y, x) * 8) / gap, gap].join(','));
  }
  await page.getByLabel('Import motor field map CSV').setInputFiles({
    name: 'rotor-grid.csv', mimeType: 'text/csv', buffer: Buffer.from(motorGrid.join('\n')),
  });
  await calculate('Analyze field map');
  await expect(dialog.getByRole('heading', { name: 'Torque sensitivity to air gap' })).toBeVisible();
  await page.getByLabel('Field-map air gap').selectOption('1');
  await expect(dialog.getByRole('heading', { name: 'Open-circuit winding back-EMF' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Motor family', { exact: true }).selectOption('planar');
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await calculate('Calculate motion map');
  const grid = dialog.getByRole('table', { name: 'Planar force reachability by X and Y position' });
  await expect(grid.getByRole('button')).toHaveCount(169);
  await grid.getByRole('button', { pressed: true }).press('ArrowUp');
  await expect(grid.getByRole('button', { pressed: true })).toBeFocused();
  await expect(dialog.getByText('Coil currents', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const construction = page.getByLabel('Planar construction', { exact: true });
  await construction.selectOption('moving-coil');
  await expect(page.getByRole('img', { name: 'Moving-coil carriage assembly' })).toBeVisible();
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await set('Target force X (N)', 0.005);
  await calculate('Calculate motion map');
  await expect(grid.getByRole('button')).toHaveCount(169);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await construction.selectOption('crossed');
  await expect(page.getByRole('img', { name: 'Crossed linear motors assembly' })).toBeVisible();
  await exportButton.click();
  await expect(exportDialog.getByRole('button', { name: /KiCad board/ })).toBeDisabled();
  await exportDialog.getByRole('button', { name: /Motor construction package/ }).click();
  await expect(page.locator('#toasts').getByText(/^Wrote .+-construction\.zip\./)).toBeVisible();
  const motorDir = path.join(stateDir, 'exports');
  const motorZip = path.join(motorDir, fs.readdirSync(motorDir).find(name => name.endsWith('-construction.zip')));
  const members = JSON.parse(execFileSync(python, ['-c',
    'import sys, json, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', motorZip]));
  expect(members).toEqual(expect.arrayContaining(['X-axis.kicad_pcb', 'Y-axis.kicad_pcb', 'stage-arrangement.dxf']));
  await construction.selectOption('pcb-grid');
  await expect(page.getByRole('img', { name: 'planar motor preview' })).toBeVisible();
  await page.getByRole('tab', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await page.getByRole('button', { name: 'Use hairpin filter' }).click();
  await calculate('Tune to response mask');
  await page.getByRole('button', { name: 'Apply tuning', exact: true }).click();
  await page.getByText('Full-wave simulation fixtures', { exact: true }).click();
  await page.getByRole('button', { name: 'Export hairpin fixtures' }).click();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Hairpin fixtures exported.' })).toBeVisible();
  const zip = path.join(stateDir, 'exports', 'hairpin-fixtures.zip');
  const read = entry => JSON.parse(execFileSync(python, ['-c',
    'import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))', zip, entry]));
  const report = read('extraction.template.json');
  const manifest = read('fixtures.json');
  for (const values of Object.values(report.resonators)) values.resonanceHz = manifest.centerFrequencyHz * 1.01;
  for (const values of Object.values(report.pairs)) values.coupling = 0.04;
  for (const values of Object.values(report.feeds)) values.externalQ = 15;
  await page.getByLabel('Hairpin extraction JSON').setInputFiles({ name: 'extraction.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(report)) });
  await expect(page.getByRole('heading', { name: 'Passband comparison' })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'dist', 'design-tools-browser.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  page.on('dialog', prompt => prompt.accept());
  const starters = [
    ['Square impedance coupon', 'inductor'], ['Two-layer air-core transformer', 'transformer'],
    ['Three-phase rotary stator', 'motor'], ['Three-resonator hairpin filter', 'filter'],
    ['13.56 MHz NFC loop', 'antenna'],
  ];
  for (const [name, kind] of [...starters.slice(1), starters[0]]) {
    await page.getByRole('button', { name: 'Starter projects', exact: true }).click();
    await expect(page.locator('.starter-projects button')).toHaveCount(5);
    await page.getByRole('dialog', { name: 'Starter projects' }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-workspace', kind);
    await expect(page.getByLabel('Design name')).toHaveValue(name);
    await expect(page.locator('[data-key="starter"] summary')).toHaveText(name);
    await expect(page.locator('#st-algo')).not.toHaveText('geometry failed');
  }
  await page.locator('[data-key="designs"] > summary').click();
  await page.getByRole('button', { name: 'Fabrication profiles…' }).click();
  await set('Fabrication profile name', 'Workshop two-layer');
  await set('Minimum track width (mm)', 0.8);
  await set('Etch width variation ± (mm)', 0.04);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByLabel('Saved fabrication profile').locator('option', { hasText: 'Workshop two-layer' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Apply to design', exact: true }).click();
  await expect(page.getByText('Applied Workshop two-layer to this design.')).toBeVisible();
  await page.getByRole('dialog', { name: 'Fabrication profiles' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByLabel('Track width', { exact: true })).toHaveValue('0.800');
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await expect(page.getByLabel('Minimum trace width (mm)')).toHaveValue('0.8');
  await page.getByRole('button', { name: 'Tolerances', exact: true }).click();
  await expect(page.getByLabel('Etch width ± (mm)')).toHaveValue('0.04');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('checkbox', { name: 'Generate in remaining board area' }).check();
  await page.getByLabel('Winding layout board file').setInputFiles({
    name: 'notched-board.kicad_pcb', mimeType: 'text/plain',
    buffer: Buffer.from('(kicad_pcb (gr_poly (pts (xy 100 50) (xy 180 50) (xy 180 98) (xy 168 98) (xy 168 105) (xy 100 105)) (layer "Edge.Cuts")) (gr_rect (start 160 55) (end 167 61) (layer "Edge.Cuts")))'),
  });
  await expect(page.getByText('1 cutouts · 0 drilled pads · 0 keepouts')).toBeVisible();
  await page.getByRole('button', { name: 'Use board constraints' }).click();
  await expect(page.getByText('Board constraints from notched-board.kicad_pcb')).toBeVisible();
  await expect(page.locator('#st-algo')).not.toHaveText('geometry failed');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Design tools, motor sizing, field maps, planar force maps, hairpin fixtures, starter projects and fabrication controls passed in the browser.');
} finally {
  await browser?.close(); proc.kill(); fs.rmSync(stateDir, { recursive: true, force: true });
}
