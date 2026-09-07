/* Capture the README screenshots from the live application, so the pictures in
   the documentation are always of the code that is actually here. */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = path.join(ROOT, 'docs');

const proc = spawn('python3', ['ipc_entry.py', '--print-url'], { cwd: ROOT });
const url = await new Promise((resolve) => {
  let buf = '';
  proc.stdout.on('data', (d) => { buf += d; const m = buf.match(/http\S+/); if (m) resolve(m[0]); });
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/* The theme follows the OS by default, so the shots have to ask for the one
   they want rather than assuming a toggle flips toward it. */
async function setTheme(want) {
  for (let i = 0; i < 2; i++) {
    if (await page.getAttribute('html', 'data-theme') === want) return;
    await page.click('#btn-theme');
    await page.waitForTimeout(400);
  }
}
await setTheme('dark');

const settle = async (ms = 2200) => {
  await page.waitForFunction(
    () => !/solving|synthesising/.test(document.getElementById('st-solve').textContent),
    null, { timeout: 30000 },
  ).catch(() => {});
  await page.waitForTimeout(ms);
};

async function shot(name) {
  await page.screenshot({ path: path.join(DOCS, `${name}.png`) });
  console.log(`docs/${name}.png`);
}

// Inductor: a multilayer circular spiral, which is the thing most people open
// the tool for.
await page.evaluate(() => document.querySelector('.shape[data-value="circle"]').click());
await page.evaluate(() => {
  const set = (label, v) => {
    const f = [...document.querySelectorAll('.field')].find((x) => {
      const n = x.querySelector('.lab .name');
      return n && n.textContent.trim() === label;
    });
    const s = f && f.querySelector('input[type=range]');
    if (s) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  set('Copper layers', 4);
  set('Turns per layer', 14);
  set('Outer diameter', 26);
});
await settle();
await page.click('#t-fit');
await page.waitForTimeout(500);
await shot('screenshot-inductor');

// Motor: the twelve-coil stator with the phase buses.
await page.click('.tab[data-ws="motor"]');
await settle(2600);
await page.click('#t-fit');
await page.waitForTimeout(600);
await shot('screenshot-motor');

// Filter: a hairpin band-pass, because it shows the coupled geometry and the
// as-built-against-prototype comparison at once.
await page.click('.tab[data-ws="filter"]');
await settle(2600);
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'hairpin'));
  sel.value = 'hairpin';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await settle(2600);
await page.click('#t-fit');
await page.waitForTimeout(600);
await shot('screenshot-filter');

// One light-theme frame on the lumped low-pass, which shows spiral inductors
// and interdigital capacitors together at a readable size.
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'lumped'));
  sel.value = 'lumped';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.seg button')].find((x) => x.dataset.value === 'lowpass');
  if (btn) btn.click();
});
await settle(2800);
await setTheme('light');
await page.click('#t-fit');
await page.waitForTimeout(700);
await shot('screenshot-filter-light');

await browser.close();
proc.kill();
