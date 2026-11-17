/* Real browser/CSP gate. Requires npm install and npx playwright install chromium.
   Uses only local fixtures and a disposable plugin state directory. */
import { chromium, expect } from 'playwright/test';
import { spawn } from 'node:child_process';
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
  await set('Measured / external-solver peak Bgap (T)', 0.6);
  await page.getByRole('button', { name: 'Apply external field to motor' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Design tools', exact: true }).click();
  await page.getByRole('button', { name: 'Use hairpin filter' }).click();
  await calculate('Tune to response mask');
  await page.getByRole('button', { name: 'Apply tuning', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'dist', 'design-tools-browser.png') });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('All eight browser tool flows passed with no console errors.');
} finally {
  await browser?.close(); proc.kill(); fs.rmSync(stateDir, { recursive: true, force: true });
}
