/* Capture real application states for the documentation gallery.
   Uses disposable settings; never connects to or edits a user's KiCad board. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
const defaultViewport = { width: 1600, height: 1000, deviceScaleFactor: 1.5 };

export async function captureSession(run, viewport = defaultViewport) {
  const scratch = path.join(root, 'dist');
  await mkdir(scratch, { recursive: true });
  const state = await mkdtemp(path.join(scratch, 'feature-capture-'));
  const env = { ...process.env, PLANAR_STUDIO_HOME: state };
  delete env.KICAD_API_SOCKET;
  delete env.KICAD_API_TOKEN;
  const server = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['ipc_entry.py', '--print-url'], { cwd: root, env, windowsHide: true });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      let stdout = '', stderr = '';
      const timer = setTimeout(() => reject(new Error(`Server URL timeout: ${stderr}`)), 20000);
      const fail = error => { clearTimeout(timer); reject(error); };
      server.stdout.on('data', data => {
        stdout += data;
        const match = stdout.match(/http:\/\/[^\s]+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.stderr.on('data', data => { stderr += data; });
      server.once('error', fail);
      server.once('exit', code => fail(new Error(`Server exited (${code}): ${stderr}`)));
    });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
    const { width, height, deviceScaleFactor } = viewport;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      // Chrome requests an optional favicon; the application has no favicon route.
      if (new URL(m.location().url || url).pathname === '/favicon.ico') return;
      errors.push(`${m.text()} (${m.location().url})`);
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const settle = async () => {
      // The application refines a quick solve after a 130 ms debounce.
      await page.waitForTimeout(250);
      await page.waitForFunction(() => {
        const status = document.querySelector('#st-solve')?.textContent || '';
        if (/Fix parameters/.test(status)) throw new Error(document.querySelector('#toasts')?.textContent || status);
        return status.trim() && !/solving|synthesising/i.test(status) && document.querySelector('#side .tile');
      }, null, { timeout: 45000 });
      await page.waitForFunction(() => document.querySelectorAll('#toasts .toast').length === 0, null, { timeout: 15000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(errors.length, 0, errors.join('\n'));
    };
    const shot = async (name, target = page) => {
      await settle();
      await target.screenshot({ path: path.join(state, `${name}.png`) });
      console.log(`Captured ${name}`);
    };
    const set = async (label, value) => {
      const field = page.getByLabel(label, { exact: true });
      await field.fill(String(value));
      await field.press('Tab');
      await settle();
    };
    const select = async (label, value) => {
      await page.getByLabel(label, { exact: true }).selectOption(value);
      await settle();
    };
    const range = async (label, value) => {
      const field = page.locator('.field').filter({ has: page.locator('.lab .name', { hasText: new RegExp(`^${label}$`) }) });
      await field.locator('input[type=range]').evaluate((input, v) => {
        input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await settle();
    };
    const workspace = async name => {
      await page.getByRole('tab', { name, exact: true }).click();
      await settle();
    };
    const fit = async () => { await page.locator('#t-fit').click(); await settle(); };
    await settle();
    if (await page.getAttribute('html', 'data-theme') !== 'dark') await page.locator('#btn-theme').click();
    await run({ page, state, settle, shot, set, select, range, workspace, fit, errors, viewport });
  } finally {
    await browser?.close();
    if (server.pid && server.exitCode === null) {
      server.kill();
      await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
    }
    // Only delete the disposable directory created above, within this repo's dist/.
    assert.equal(path.dirname(path.resolve(state)), path.resolve(scratch));
    assert.ok(path.basename(state).startsWith('feature-capture-'));
    await rm(state, { recursive: true, force: true });
  }
}

export async function frame({ page, fit }) {
  await fit();
  await page.locator('#rail').evaluate(el => { el.scrollTop = 0; });
  await page.locator('#side').evaluate(el => { el.scrollTop = 0; });
  await page.mouse.move(1, 1);
}

export async function publishShots({ state, viewport }, names, { directory = 'docs', manifest }) {
  const dest = path.join(root, directory);
  const files = names.map(name => name + '.png');
  const captures = {};
  for (const filename of files) {
    const bytes = await readFile(path.join(state, filename));
    assert.equal(bytes.readUInt32BE(16), viewport.width * viewport.deviceScaleFactor, filename);
    assert.equal(bytes.readUInt32BE(20), viewport.height * viewport.deviceScaleFactor, filename);
    captures[filename] = createHash('sha256').update(bytes).digest('hex');
  }
  const provenance = {
    capturedAt: new Date().toISOString(),
    applicationVersion: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
    applicationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    viewport,
    scope: 'Real browser application, isolated settings, no live KiCad connection; numerical results are model predictions.',
    captures,
  };
  await mkdir(dest, { recursive: true });
  for (const filename of files) await rename(path.join(state, filename), path.join(dest, filename));
  await writeFile(path.join(dest, manifest), JSON.stringify(provenance, null, 2) + '\n');
  console.log(`Published ${files.length} verified application captures.`);
}
