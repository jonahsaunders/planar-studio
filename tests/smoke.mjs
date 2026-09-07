/* Headless smoke test of the whole application.

   Loads the real page from the real plugin server, drives the controls the way
   a person would, and fails on any console error, unhandled rejection, or
   workspace that does not produce geometry. It is not a substitute for opening
   it in KiCad, but it catches every class of failure that is not about the
   board itself -- and it does so in a couple of seconds rather than a manual
   pass through three workspaces and six filter families. */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['ipc_entry.py', '--print-url'], { cwd: ROOT });
    let buf = '';
    const timer = setTimeout(() => reject(new Error('server did not print a URL')), 12000);
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/https?:\/\/\S+/);
      if (m) { clearTimeout(timer); resolve({ proc, url: m[0] }); }
    });
    proc.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(d));
    proc.on('error', reject);
  });
}

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};

async function main() {
  const { proc, url } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    record('page loads without console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    const summary = async () => (await page.textContent('#st-solve')) || '';
    const algo = async () => (await page.textContent('#st-algo')) || '';

    // ---- inductor -----------------------------------------------------
    await page.waitForFunction(() => !/solving/.test(document.getElementById('st-solve').textContent), null, { timeout: 15000 });
    record('inductor solves', /L\s/.test(await summary()), await summary());
    record('inductor names its algorithm', (await algo()).length > 2, await algo());

    const tileCount = await page.locator('.tile').count();
    record('inductor shows metric tiles', tileCount >= 6, `${tileCount} tiles`);

    const chartCount = await page.locator('canvas.chart').count();
    record('inductor draws charts', chartCount >= 2, `${chartCount} charts`);

    // Every winding family must generate.
    for (const shape of ['circle', 'polygon', 'racetrack', 'log', 'wedge', 'super', 'custom']) {
      await page.evaluate((s) => {
        const b = document.querySelector(`.shape[data-value="${s}"]`);
        if (b) b.click();
      }, shape);
      await page.waitForTimeout(420);
      const size = await page.textContent('#st-size');
      const algo = await page.textContent('#st-algo');
      const ok = !/NaN|Infinity|failed/.test(size) && /\d/.test(size) && algo.trim().length > 2;
      record(`winding "${shape}" generates`, ok, `${algo.trim()} · ${size.trim()}`);
    }

    // Layer sweep, the usual source of stack-up bugs.
    for (const layers of [1, 3, 4, 8]) {
      await setRange(page, 'Copper layers', layers);
      await page.waitForTimeout(500);
      const s = await summary();
      record(`inductor at ${layers} layers`, !/NaN|failed/.test(s), s.trim().slice(0, 60));
    }

    // ---- motor --------------------------------------------------------
    await page.click('.tab[data-ws="motor"]');
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !/solving/.test(document.getElementById('st-solve').textContent), null, { timeout: 20000 });
    record('motor solves', /Kt/.test(await summary()), (await summary()).trim().slice(0, 70));
    const coils = await page.textContent('#st-algo');
    record('motor arrays coils', /coils/.test(coils), coils.trim());

    // ---- filter -------------------------------------------------------
    await page.click('.tab[data-ws="filter"]');
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !/solving|synthesising/.test(document.getElementById('st-solve').textContent), null, { timeout: 30000 });
    record('filter synthesises', /IL/.test(await summary()), (await summary()).trim().slice(0, 70));

    for (const family of ['lumped', 'stepped', 'edgeCoupled', 'hairpin', 'interdigital', 'emi']) {
      await page.evaluate((f) => {
        const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === f));
        if (sel) { sel.value = f; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }, family);
      await page.waitForTimeout(1400);
      const size = await page.textContent('#st-size');
      const s = await summary();
      const ok = !/NaN|Infinity|failed/.test(size + s) && /\d/.test(size);
      record(`filter family "${family}"`, ok, `${size.trim()} · ${s.trim().slice(0, 46)}`);
    }

    // Band sweep on the lumped family.
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'lumped'));
      if (sel) { sel.value = 'lumped'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(1200);
    for (const band of ['lowpass', 'highpass', 'bandpass', 'bandstop']) {
      await page.evaluate((b) => {
        const btn = [...document.querySelectorAll('.seg button')].find((x) => x.dataset.value === b);
        if (btn) btn.click();
      }, band);
      await page.waitForTimeout(1500);
      const s = await summary();
      record(`filter band "${band}"`, !/NaN|failed/.test(s), s.trim().slice(0, 56));
    }

    // ---- exports ------------------------------------------------------
    await page.click('.tab[data-ws="inductor"]');
    await page.waitForTimeout(700);
    const exportsOk = await page.evaluate(async () => {
      const btn = document.getElementById('btn-export');
      btn.click();
      await new Promise((r) => setTimeout(r, 120));
      const cards = document.querySelectorAll('.export-card').length;
      document.querySelector('.scrim')?.remove();
      return cards;
    });
    record('export sheet offers every format', exportsOk >= 6, `${exportsOk} formats`);

    // ---- theme --------------------------------------------------------
    const before = await page.getAttribute('html', 'data-theme');
    await page.click('#btn-theme');
    await page.waitForTimeout(250);
    const after = await page.getAttribute('html', 'data-theme');
    record('theme toggles', after !== before && ['light', 'dark'].includes(after), `${before} -> ${after}`);
    await page.click('#btn-theme');

    // ---- link state ---------------------------------------------------
    const link = await page.textContent('#link-text');
    record('link state is reported', /offline|standalone|no board|board/.test(link), link.trim());

    await page.waitForTimeout(400);
    record('no console errors overall', errors.length === 0, errors.slice(0, 4).join(' | '));

    // Into dist/, which is git-ignored. The screenshots in docs/ belong to
    // shots.mjs; a test run must not dirty the working tree.
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'dist', 'smoke-last-frame.png') });
  } finally {
    await browser.close();
    proc.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

async function setRange(page, label, value) {
  await page.evaluate(({ label: l, value: v }) => {
    const field = [...document.querySelectorAll('.field')].find((f) => {
      const n = f.querySelector('.lab .name');
      return n && n.textContent.trim() === l;
    });
    if (!field) return;
    const slider = field.querySelector('input[type=range]');
    if (slider) {
      slider.value = v;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { label, value });
}

main().catch((e) => { console.error(e); process.exit(1); });
