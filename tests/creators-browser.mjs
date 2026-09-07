/* Real plugin page: new tabs, edits, saved designs, exports, invalid geometry.
   Optional paths let CI reuse a managed Playwright/browser installation. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLANAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planar-creators-'));
const proc = spawn('python3', ['ipc_entry.py', '--print-url'], { cwd: root, env: { ...process.env, PLANAR_STUDIO_HOME: stateDir } });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server URL timeout')), 12000);
    proc.stdout.on('data', d => { const m = String(d).match(/http\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    proc.on('error', reject);
  });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const solved = () => page.waitForFunction(() => !document.querySelector('#st-solve').textContent.includes('solving') && document.querySelector('#side .tile'));
  const set = async (label, value) => { const field = page.getByLabel(label, { exact: true }); await field.fill(String(value)); await field.press('Tab'); };
  await page.goto(url); await solved();
  assert.equal(await page.getByRole('tab').count(), 5);
  for (const name of ['Antenna', 'Transformer']) {
    await page.getByRole('tab', { name, exact: true }).click(); await solved();
    assert.match(await page.locator('#side').textContent(), name === 'Antenna' ? /Estimated resonance/ : /Coupling k/);
    await set(name === 'Antenna' ? 'Length tuning' : 'Primary turns', name === 'Antenna' ? 1.1 : 7); await solved();
    await page.locator('#btn-export').click();
    assert.equal(await page.locator('.export-card').count(), 6);
    await page.locator('.export-card').filter({ hasText: 'KiCad board' }).click();
    const filename = name === 'Antenna' ? 'ANT1' : 'T1';
    await page.waitForFunction(n => document.querySelector('#toasts').textContent.includes(`Wrote ${n}.kicad_pcb`), filename);
    const pcb = fs.readFileSync(path.join(stateDir, 'exports', `${filename}.kicad_pcb`), 'utf8');
    assert.match(pcb, /smd/); assert.ok(!pcb.includes('(via '));
    await page.getByText('Designs', { exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(n => document.querySelector('#toasts').textContent.includes(`Saved “${n}”`), filename);
    await page.locator('#btn-tools').click();
    assert.equal(await page.locator('[data-tool="board"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-tool="measurements"]').click();
    assert.match(await page.locator('.tools-content').textContent(), /main workspace/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'dist', `${name.toLowerCase()}-creator.png`) });
  }
  await set('Primary turns', 60);
  await page.waitForFunction(() => document.querySelector('#st-algo').textContent === 'geometry failed');
  assert.equal(await page.locator('#side .tile').count(), 0);
  await page.locator('#btn-export').click();
  assert.equal(await page.locator('.export-card').count(), 0);
  await set('Primary turns', 6); await solved();
  // Tab switches keep each creator's configuration and old workspaces running.
  for (const name of ['Inductor', 'PCB motor', 'Filter', 'Antenna']) {
    await page.getByRole('tab', { name, exact: true }).click(); await solved();
  }
  assert.equal(Number(await page.getByLabel('Length tuning', { exact: true }).inputValue()), 1.1);
  await page.setViewportSize({ width: 1100, height: 800 });
  assert.ok(await page.locator('#btn-place').evaluate(e => e.getBoundingClientRect().right <= innerWidth), 'Toolbar must fit at 1100px');
  assert.deepEqual(errors, []);
  console.log('Creator browser flows passed: five workspaces, edits, saves, exports, invalid state and tool guards.');
} finally { await browser?.close(); proc.kill(); fs.rmSync(stateDir, { recursive: true, force: true }); }
