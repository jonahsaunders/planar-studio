/* Run with node tests/filter-browser.mjs after installing Playwright and Chromium.
   PLAYWRIGHT_CHROMIUM can point to an installed Chrome binary. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from 'playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'planar-filter-browser-'));
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const server = spawn(python, ['ipc_entry.py', '--print-url'], {
  cwd: root, env: { ...process.env, PLANAR_STUDIO_HOME: stateDir }, windowsHide: true,
});
const responses = ['butterworth', 'chebyshev', 'bessel', 'linearPhase'];
const bands = ['Low-pass', 'High-pass', 'Band-pass', 'Band-stop'];
const families = ['lumped', 'stepped', 'edgeCoupled', 'hairpin', 'interdigital', 'emi'];
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Filter server startup timed out. ' + stderr)), 15000);
    server.stderr.on('data', data => { stderr += data; });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Filter server exited (' + code + '). ' + stderr)); });
    server.stdout.on('data', data => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+\/\S*/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + new URL(response.url()).pathname); });
  await page.goto(url);
  await page.getByRole('tab', { name: 'Filter', exact: true }).click();

  const rail = page.locator('#rail');
  const side = page.locator('#side');
  const tiles = side.locator('.tiles');
  const status = page.locator('#st-solve');
  const legends = side.locator('.chart-legend');
  const select = label => rail.getByRole('combobox', { name: label, exact: true });
  const field = label => rail.getByRole('textbox', { name: label, exact: true });
  const settled = async () => {
    await expect(status).toHaveText(/ · \d+ ms$/, { timeout: 20000 });
    await expect(legends.first()).toHaveText(/S21.*S11/);
  };
  await settled();
  const change = async action => {
    const previous = await tiles.elementHandle();
    try {
      await action();
      await expect.poll(() => previous.evaluate(el => !el.isConnected), { timeout: 20000 }).toBe(true);
      await settled();
    } finally {
      await previous.dispose();
    }
  };
  const choose = async (label, value) => {
    const field = select(label);
    if (await field.inputValue() !== value) await change(() => field.selectOption(value));
  };
  const press = async (label, name) => {
    const button = rail.getByRole('group', { name: label, exact: true }).getByRole('button', { name, exact: true });
    if (await button.getAttribute('aria-pressed') !== 'true') await change(() => button.click());
  };
  const enter = async (label, value) => {
    const input = field(label);
    await change(async () => { await input.fill(value); await input.press('Tab'); });
  };
  let checks = 0, exports = 0;
  const exportFile = async title => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.method === 'file.save'),
      dialog.getByRole('button', { name: title }).click(),
    ]);
    const { ok, error, result } = await saved.json();
    assert.equal(ok, true, error);
    const name = path.basename(result.path);
    assert.equal(path.dirname(result.path), path.join(stateDir, 'exports'));
    const body = await fs.readFile(result.path, 'utf8');
    await expect(dialog).toBeHidden();
    return { name, body };
  };
  const checkBoard = async (label, distributed) => {
    const { name, body } = await exportFile(/^KiCad board/);
    assert.match(name, /\.kicad_pcb$/, label);
    assert.match(body, /^\(kicad_pcb\b/, label);
    assert.ok(body.includes('(layer "Edge.Cuts")'), label + ' board outline');
    assert.doesNotMatch(body, /\b(?:NaN|Infinity|undefined)\b/, label);
    if (distributed) assert.match(body, /\(zone \(net \d+\) \(net_name "GND"\)/, label + ' reference zone');
    exports++;
    return body;
  };
  const assertResponse = async (label, band, distributed, downloadBoard) => {
    await settled();
    const canvas = side.locator('canvas.chart');
    await expect(canvas, label).toHaveCount(3);
    assert.deepEqual(await canvas.evaluateAll(list => list.map(node => {
      const { width, height } = node;
      const pixels = node.getContext('2d').getImageData(0, 0, width, height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length && colors.size < 5; i += 4) {
        if (pixels[i + 3] > 0) colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
      }
      return width > 100 && height > 30 && colors.size === 5;
    })), [true, true, true], label + ' painted response charts');
    await expect(tiles, label).not.toContainText(/\b(?:NaN|Infinity|undefined)\b/);
    await expect(side.getByText('Transmission and reflection', { exact: true }), label).toBeVisible();
    await expect(side.getByText('Group delay', { exact: true }), label).toBeVisible();
    if (band === 'Band-stop') await expect(tiles.getByText('Notch frequency', { exact: true }), label).toBeVisible();
    if (downloadBoard) await checkBoard(label, distributed);
    assert.deepEqual(errors, [], label + ' browser errors');
    checks++;
  };

  for (const family of families) {
    await choose('Family', family);
    const distributed = ['stepped', 'edgeCoupled', 'hairpin', 'interdigital'].includes(family);
    for (const band of family === 'lumped' ? bands : ['']) {
      if (band) await press('Band', band);
      for (const network of family === 'emi' ? ['pi', 'tee', 'lc', 'cm'] : ['']) {
        if (network) await choose('Network', network);
        const cm = network === 'cm';
        await expect(select('Response'))[cm ? 'toBeHidden' : 'toBeVisible']();
        for (const arm of ['lumped', 'stepped'].includes(family) ? ['Series', 'Shunt'] : ['']) {
          if (arm) await press('First element', arm);
          const hasCaps = family === 'lumped' || (family === 'emi' && !cm);
          for (const capacitor of hasCaps ? ['Interdigital', 'Plate'] : ['']) {
            if (capacitor) await press('Capacitors', capacitor);
            for (const label of ['Finger width', 'Finger gap', 'Finger overlap']) {
              if (capacitor === 'Interdigital') await expect(field(label)).toBeVisible();
              else await expect(field(label)).toBeHidden();
            }
            for (const response of cm ? [''] : responses) {
              if (response) await choose('Response', response);
              const label = [family, band, network, arm, capacitor, response].filter(Boolean).join(' / ');
              await assertResponse(label, band, distributed, arm !== 'Shunt' && capacitor !== 'Plate');
            }
          }
        }
      }
    }
    console.log('Browser matrix passed for ' + family);
  }

  await choose('Network', 'pi');
  await choose('Response', 'chebyshev');
  await choose('Network', 'cm');
  await expect(field('Inductor layers')).toBeHidden();
  await expect(field('Feed length')).toBeHidden();
  await expect(tiles).not.toContainText('target 0.10 dB');
  await choose('Network', 'pi');
  await choose('Response', 'bessel');
  await choose('Network', 'cm');
  await expect(side).not.toContainText('The frequency controls scale the prototype.');

  await choose('Family', 'edgeCoupled');
  await page.mouse.move(4, 4);
  const view = page.locator('#view');
  const copperPreview = () => view.evaluate(canvas => canvas.toDataURL());
  const fitAutomatically = await copperPreview();
  await page.locator('#t-fit').click();
  await page.mouse.move(4, 4);
  assert.equal(await copperPreview(), fitAutomatically, 'Family switch should fit the new copper preview');

  await choose('RF stack source', 'manual');
  await choose('Signal copper layer', 'B.Cu');
  await choose('Reference plane layer', 'In1.Cu');
  const board = await checkBoard('Back copper with inner reference', true);
  assert.match(board, /\(zone .*\(layer "In1\.Cu"\)/);
  const { body } = await exportFile(/^Design JSON/);
  const design = JSON.parse(body);
  assert.equal(design.kind, 'filter');
  assert.equal(design.config.rfSignalLayer, 'B.Cu');
  assert.equal(design.config.rfReferenceLayer, 'In1.Cu');
  await choose('Family', 'lumped');
  await press('Band', 'Low-pass');
  await enter('Order', '4');
  await choose('Response', 'chebyshev');
  await press('First element', 'Shunt');
  await expect(side.getByRole('heading', { name: 'Terminations used in the response' })).toBeVisible();
  const terminations = side.getByRole('heading', { name: 'Terminations used in the response' }).locator('..');
  const loadRow = terminations.getByRole('row').filter({ hasText: 'Load' });
  assert.ok(parseFloat(await loadRow.getByRole('cell').last().textContent()) < 50);
  await page.setViewportSize({ width: 760, height: 600 });
  await checkBoard('Compact viewport', false);
  assert.deepEqual(errors, []);
  console.log(checks + ' filter configurations and ' + exports + ' KiCad exports passed in Chromium.');
} finally {
  if (browser) await browser.close();
  server.kill();
  await fs.rm(stateDir, { recursive: true, force: true });
}
