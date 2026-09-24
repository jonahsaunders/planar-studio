/* End-to-end experimental workflow against the real plugin server and Worker. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sexpr } from '../web/js/engine/boardcheck.js';

const root = fileURLToPath(new URL('..', import.meta.url)), dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const state = fs.mkdtempSync(path.join(dist, '.litz-browser-'));
const server = spawn('python3', ['ipc_entry.py', '--print-url'], { cwd: root, env: { ...process.env, PLANAR_STUDIO_HOME: state } });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + err)), 15000);
    server.stdout.on('data', d => { out += d; const m = out.match(/http:\/\/\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.stderr.on('data', d => { err += d; });
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${err}`)); });
  });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  const errors = [], workers = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('worker', w => workers.push(w.url()));
  const settled = () => page.waitForFunction(() => document.querySelector('#side .tile') && !/solving|Fix parameters/.test(document.querySelector('#st-solve').textContent), null, { timeout: 30000 });
  const litzSolved = () => page.waitForFunction(() => /Estimated Q/.test(document.querySelector('#side').textContent) && !/solving/.test(document.querySelector('#st-solve').textContent), null, { timeout: 30000 });
  const set = async (label, value) => { const input = page.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.press('Tab'); };
  const response = method => page.waitForResponse(r => r.url().endsWith('/api') && r.request().postDataJSON()?.method === method);

  await page.goto(url, { waitUntil: 'networkidle' }); await settled();
  await page.getByLabel('Winding mode', { exact: true }).selectOption('pcb-litz'); await litzSolved();
  assert.match(await page.locator('#side').innerText(), /Routing validation[\s\S]*Passed/);
  assert.ok(workers.some(u => u.endsWith('/litz-worker.js')), 'The real UI solves strand currents in a Worker.');
  await set('Litz outer diameter', 180); await litzSolved();
  await page.getByLabel('Litz model resolution', { exact: true }).selectOption('192'); await litzSolved();
  await page.getByLabel('Highlight Litz copper', { exact: true }).selectOption('strand:3'); await litzSolved();
  await page.getByLabel('Design name', { exact: true }).fill('Experimental PCB Litz browser test');
  const saved = response('designs.save');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await (await saved).json()).ok, true);

  await page.reload({ waitUntil: 'networkidle' }); await settled();
  await page.getByRole('button', { name: 'Open…', exact: true }).click();
  await page.locator('.modal .export-card').filter({ hasText: 'Experimental PCB Litz browser test' }).click(); await litzSolved();
  assert.equal(await page.getByLabel('Winding mode', { exact: true }).inputValue(), 'pcb-litz');
  assert.equal(await page.getByLabel('Litz outer diameter', { exact: true }).inputValue(), '180');
  assert.equal(await page.getByLabel('Highlight Litz copper', { exact: true }).inputValue(), 'strand:3');
  assert.equal(await page.getByLabel('Litz model resolution', { exact: true }).inputValue(), '192');

  await page.locator('#btn-export').click();
  assert.equal(await page.locator('.export-card').filter({ hasText: 'KiCad footprint' }).isDisabled(), true);
  const exported = response('file.save');
  await page.locator('.export-card').filter({ hasText: 'KiCad board' }).click();
  const written = await (await exported).json(); assert.equal(written.ok, true);
  const pcb = sexpr(fs.readFileSync(written.result.path, 'utf8'));
  const vias = pcb.filter(n => n[0] === 'via' && n[1] === 'blind');
  assert.equal(vias.length, 480);
  assert.deepEqual(new Set(vias.map(v => v.find(n => n[0] === 'layers').slice(1).join('/'))), new Set(['F.Cu/In1.Cu', 'In1.Cu/In2.Cu', 'In2.Cu/B.Cu']));

  await set('Litz coil turns', 1.5);
  await page.waitForFunction(() => /Fix parameters/.test(document.querySelector('#st-solve').textContent));
  await page.getByRole('button', { name: 'Load paper-inspired preset', exact: true }).click(); await litzSolved();
  assert.equal(await page.getByLabel('Litz outer diameter', { exact: true }).inputValue(), '160');
  assert.equal(await page.getByLabel('Highlight Litz copper', { exact: true }).inputValue(), 'all');
  await page.locator('#t-fit').click();
  await page.screenshot({ path: path.join(dist, 'pcb-litz.png') });
  assert.deepEqual(errors, []);
  console.log('PCB Litz browser: Worker solve, controls, highlight, persistence, board export and invalid-parameter recovery passed.');
} finally {
  await browser?.close(); server.kill(); fs.rmSync(state, { recursive: true, force: true });
}
