/* Rendered workflow: real plugin server and Web Workers, no calculation mocks.
 * Requires loopback sockets and Playwright Chromium (provided by CI). */
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
let browser, page, serverErrors = '';
server.stderr.on('data', d => { serverErrors = (serverErrors + d).slice(-16000); });
try {
  const url = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + serverErrors)), 15000);
    server.stdout.on('data', d => { out += d; const m = out.match(/http:\/\/\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${serverErrors}`)); });
  });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
  page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Observe real workers. Waiting for a new completed worker with the requested
  // config avoids accepting old Q tiles before the physical-edit debounce.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__litzBrowserWorkers = [];
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const entry = this.__entry = { url: new URL(String(url), location.href).pathname, completed: false, terminated: false };
        window.__litzBrowserWorkers.push(entry);
        this.addEventListener('message', ({ data }) => {
          if (!data || !['analysis', 'result', 'error'].some(key => Object.hasOwn(data, key))) return;
          entry.completed = true; entry.error = data.error || null;
          if (data.result) entry.summary = { candidates: data.result.candidates?.length,
            evaluated: data.result.evaluated, levels: data.result.levels?.length };
        });
        this.addEventListener('error', event => { entry.error = event.message; });
      }
      postMessage(message, ...rest) {
        this.__entry.task = message.task;
        this.__entry.cfg = message.cfg ? structuredClone(message.cfg) : null;
        return super.postMessage(message, ...rest);
      }
      terminate() { this.__entry.terminated = true; return super.terminate(); }
    };
  });
  const count = () => page.evaluate(() => window.__litzBrowserWorkers.length);
  const response = method => page.waitForResponse(r => r.url().endsWith('/api') && r.request().postDataJSON()?.method === method, { timeout: 260000 });
  const set = async (label, value) => {
    const input = page.getByLabel(label, { exact: true }); await input.fill(String(value)); await input.press('Tab');
  };
  const open = async locator => { if (!await locator.evaluate(node => node.open)) await locator.locator(':scope > summary').click(); };
  const group = key => open(page.locator(`details.group[data-key="${key}"]`));
  const tool = async title => {
    await open(page.locator('details.litz-tools'));
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const item = page.locator('details.litz-tool').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${escaped}$`) }) });
    await open(item); return item;
  };
  const modelAction = async (action, expected = {}) => {
    const since = await count(); await action();
    await page.waitForFunction(({ since, expected }) => {
      const worker = window.__litzBrowserWorkers.slice(since).filter(w => w.url.endsWith('/litz-worker.js')
        && Object.entries(expected).every(([key, value]) => w.cfg?.[key] === value)).at(-1);
      return worker && (worker.error || worker.completed && !/solving|Fix parameters|analysis failed/i.test(document.querySelector('#st-solve')?.textContent || '')
        && /Estimated Q/.test(document.querySelector('#side')?.textContent || ''));
    }, { since, expected }, { timeout: 120000 });
    const row = await page.evaluate(({ since, expected }) => window.__litzBrowserWorkers.slice(since)
      .filter(w => w.url.endsWith('/litz-worker.js') && Object.entries(expected).every(([key, value]) => w.cfg?.[key] === value)).at(-1), { since, expected });
    assert.equal(row.error, null, `Fresh strand solve failed: ${row.error}`);
    assert.equal(row.completed, true); return row;
  };
  const viewAction = async action => {
    const before = await count(); await action();
    // This observation window exceeds the physical-edit debounce.
    await page.waitForTimeout(350);
    assert.equal(await count(), before, 'Inspection/highlighting must not start workers.');
  };
  const studyAction = async (task, action) => {
    const since = await count(); await action();
    await page.waitForFunction(({ since, task }) => window.__litzBrowserWorkers.slice(since)
      .some(w => w.url.endsWith('/litz-tools-worker.js') && w.task === task && (w.completed || w.error)), { since, task }, { timeout: 180000 });
    const row = await page.evaluate(({ since, task }) => window.__litzBrowserWorkers.slice(since).find(w => w.task === task), { since, task });
    assert.equal(row.error, null, `${task} failed: ${row.error}`); return row;
  };
  const initialReady = () => page.waitForFunction(() => document.querySelector('#side .tile') && !/solving|Fix parameters/i.test(document.querySelector('#st-solve').textContent));

  await page.goto(url, { waitUntil: 'networkidle' }); await initialReady();
  await modelAction(() => page.getByLabel('Winding mode', { exact: true }).selectOption('pcb-litz'), { windingMode: 'pcb-litz' });
  const routingTile = page.locator('#side .tile').filter({ has: page.locator('.k', { hasText: /^Routing validation$/i }) });
  assert.equal(await routingTile.locator('.v').innerText(), 'Passed');
  await page.locator('#t-fit').click();
  await page.screenshot({ path: path.join(dist, 'pcb-litz.png') });
  await modelAction(() => page.getByLabel('Litz size constraint', { exact: true }).selectOption('finished'), { litzSizeMode: 'finished' });
  await modelAction(() => set('Maximum finished copper diameter', 180), { litzTargetOuter: 180 });
  await group('litz-terminals');
  await modelAction(() => page.getByLabel('Generate board outline', { exact: true }).check(), { litzOutline: true });
  await modelAction(() => page.getByLabel('Cut out the board bore', { exact: true }).check(), { litzBoreCutout: true });
  await modelAction(() => page.getByLabel('Litz model resolution', { exact: true }).selectOption('192'), { litzModelSegments: 192 });
  assert.match(await page.locator('#side').innerText(), /Complete copper diameter \/ bore[\s\S]*180/);

  await viewAction(() => page.getByLabel('Highlight Litz copper', { exact: true }).selectOption('strand:3'));
  await viewAction(() => page.getByLabel('Inspector strand or bundle', { exact: true }).selectOption('inner'));
  const inspector = page.locator('.litz-inspector');
  await viewAction(async () => {
    const range = page.getByLabel('Inspect transposition step', { exact: true });
    await range.focus(); await range.press('Home'); await range.press('ArrowRight');
  });
  assert.equal(await page.getByLabel('Inspect transposition step', { exact: true }).inputValue(), '0');
  assert.match(await inspector.innerText(), /Step 1 of 60/);
  assert.equal(await inspector.locator('svg g[data-layer]').count(), 4);
  assert.equal(await inspector.locator('svg [data-via-strand]').count(), 2, 'The selected inner-bundle step has two buried transitions.');
  assert.ok(await inspector.locator('svg polyline[data-step="0"][opacity="1"]').count() > 0);
  await inspector.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(dist, 'pcb-litz-inspector.png') });
  await viewAction(() => page.getByRole('button', { name: 'Show all steps', exact: true }).click());

  let comparison = await tool('Compare an untransposed reference');
  await studyAction('compare', () => comparison.getByRole('button', { name: 'Compare reference winding', exact: true }).click());
  comparison = await tool('Compare an untransposed reference');
  const comparisonOutput = comparison.locator('[data-task-result="compare"]');
  assert.match(await comparisonOutput.innerText(), /Parallel strands[\s\S]*Braided winding[\s\S]*Untransposed reference/);
  assert.ok(await comparisonOutput.locator('table').count() >= 3);
  await comparison.locator(':scope > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(dist, 'pcb-litz-comparison.png') });

  let convergence = await tool('Numerical convergence');
  await convergence.getByLabel('Convergence path resolutions', { exact: true }).fill('96,192,384');
  await convergence.getByLabel('Convergence field sample counts', { exact: true }).fill('128,256,512');
  const canceledSince = await count();
  await convergence.getByRole('button', { name: 'Compare resolutions', exact: true }).click();
  await page.waitForFunction(since => window.__litzBrowserWorkers.slice(since).some(w => w.task === 'convergence'), canceledSince);
  await page.getByRole('button', { name: 'Cancel Litz study', exact: true }).click();
  const canceled = await page.evaluate(since => window.__litzBrowserWorkers.slice(since).find(w => w.task === 'convergence'), canceledSince);
  assert.equal(canceled.terminated, true);
  assert.equal(canceled.completed, false, 'Expensive refinement was canceled before completion.');
  convergence = await tool('Numerical convergence');
  assert.match(await convergence.innerText(), /Study canceled/);
  await convergence.getByLabel('Convergence path resolutions', { exact: true }).fill('48,96');
  await convergence.getByLabel('Convergence field sample counts', { exact: true }).fill('32,64');
  const refined = await studyAction('convergence', () => convergence.getByRole('button', { name: 'Compare resolutions', exact: true }).click());
  assert.equal(refined.summary.levels, 4, 'Path and field convergence run as two independent two-level axes.');
  convergence = await tool('Numerical convergence');
  assert.equal(await convergence.locator('[data-task-result="convergence"] table').first().locator('tbody tr').count(), 4);
  assert.match(await convergence.innerText(), /Physical accuracy remains unvalidated|Refine the path and field sampling/);

  const search = await tool('Bounded design search');
  await search.getByLabel('Search turn counts', { exact: true }).fill('4');
  await search.getByLabel('Search strand widths (mm)', { exact: true }).fill('0.8');
  await search.getByLabel('Search turn spacings (mm)', { exact: true }).fill('5.5');
  await search.getByLabel('Search transposition angles (degrees)', { exact: true }).fill('30');
  const searched = await studyAction('search', () => search.getByRole('button', { name: 'Search feasible candidates', exact: true }).click());
  assert.ok(searched.summary.evaluated <= 12); assert.equal(searched.summary.candidates, 1);
  assert.equal(await page.getByLabel('Litz coil turns', { exact: true }).inputValue(), '5', 'Search must not apply a candidate silently.');
  await tool('Bounded design search');
  await modelAction(() => page.getByRole('button', { name: 'Apply candidate 1', exact: true }).click(), { turns: 4, litzOutline: true, litzSizeMode: 'finished' });

  let measurement = await tool('Measured impedance and model residuals');
  await measurement.getByLabel('Measurement reference plane', { exact: true }).selectOption('coil-terminals');
  await measurement.getByLabel('Measurement interpolation', { exact: true }).selectOption('linear');
  const measurementName = 'browser-rl-reference.csv';
  const csv = 'Frequency (MHz),R,X\n' + [6.6, 6.78, 7].map(f => `${f},2,${2 * Math.PI * f}`).join('\n');
  await viewAction(() => measurement.getByLabel('Import Litz impedance measurement', { exact: true }).setInputFiles({ name: measurementName, mimeType: 'text/csv', buffer: Buffer.from(csv) }));
  measurement = await tool('Measured impedance and model residuals');
  assert.match(await measurement.innerText(), /Reference plane: coil-terminals/);
  assert.match(await measurement.innerText(), /Residual: model − measured/);
  assert.match(await measurement.locator('tr').filter({ has: page.getByText('Measured R', { exact: true }) }).innerText(), /2(?:\.0+)?\s*Ω/);
  assert.match(await measurement.locator('tr').filter({ has: page.getByText('Measured L', { exact: true }) }).innerText(), /1(?:\.0+)?\s*µH/);
  await viewAction(() => page.getByLabel('Highlight Litz copper', { exact: true }).selectOption('strand:3'));
  await viewAction(async () => {
    const range = page.getByLabel('Inspect transposition step', { exact: true });
    await range.focus(); await range.press('Home');
    for (let i = 0; i < 4; i++) await range.press('ArrowRight');
  });
  await page.getByLabel('Design name', { exact: true }).fill('Experimental PCB Litz browser test');
  await group('designs');
  const savedResponse = response('designs.save');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const savedHttp = await savedResponse, savedCfg = savedHttp.request().postDataJSON().params.config;
  assert.equal((await savedHttp.json()).ok, true);
  assert.equal(savedCfg.litzSizeMode, 'finished'); assert.equal(savedCfg.litzTargetOuter, 180);
  assert.equal(savedCfg.litzBoreCutout, true); assert.equal(savedCfg.litzInspectStep, 3);
  assert.equal(savedCfg.measurement.name, measurementName);
  assert.equal(savedCfg.litzMeasurementOptions.interpolation, 'linear');
  assert.equal(savedCfg.litzStudySettings.convergence.levels, '48,96');
  assert.equal(savedCfg.litzStudySettings.search.turns, '4');
  await page.getByText('Saved “Experimental PCB Litz browser test”.', { exact: true }).waitFor();

  await page.reload({ waitUntil: 'networkidle' }); await initialReady();
  await group('designs'); await page.getByRole('button', { name: 'Open…', exact: true }).click();
  await modelAction(() => page.locator('.modal .export-card').filter({ hasText: 'Experimental PCB Litz browser test' }).click(), { windingMode: 'pcb-litz', turns: 4 });
  assert.equal(await page.getByLabel('Litz size constraint', { exact: true }).inputValue(), 'finished');
  assert.equal(await page.getByLabel('Maximum finished copper diameter', { exact: true }).inputValue(), '180');
  assert.equal(await page.getByLabel('Highlight Litz copper', { exact: true }).inputValue(), 'strand:3');
  assert.equal(await page.getByLabel('Inspect transposition step', { exact: true }).inputValue(), '3');
  assert.equal(await page.getByLabel('Litz model resolution', { exact: true }).inputValue(), '192');
  await group('litz-terminals');
  assert.equal(await page.getByLabel('Generate board outline', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Cut out the board bore', { exact: true }).isChecked(), true);
  measurement = await tool('Measured impedance and model residuals');
  assert.match(await measurement.innerText(), /Measured R[\s\S]*Residual: model − measured/);
  assert.equal(await measurement.getByLabel('Measurement reference plane', { exact: true }).inputValue(), 'coil-terminals');
  assert.equal(await measurement.getByLabel('Measurement interpolation', { exact: true }).inputValue(), 'linear');

  await page.locator('#btn-export').click();
  assert.equal(await page.locator('.export-card').filter({ hasText: 'KiCad footprint' }).isDisabled(), true);
  const exported = response('file.save');
  await page.locator('.export-card').filter({ hasText: 'KiCad board' }).click();
  const written = await (await exported).json(); assert.equal(written.ok, true);
  const pcb = sexpr(fs.readFileSync(written.result.path, 'utf8'));
  const vias = pcb.filter(n => n[0] === 'via' && n[1] === 'blind');
  assert.equal(vias.length, 384);
  assert.deepEqual(new Set(vias.map(v => v.find(n => n[0] === 'layers').slice(1).join('/'))), new Set(['F.Cu/In1.Cu', 'In1.Cu/In2.Cu', 'In2.Cu/B.Cu']));
  assert.equal(pcb.filter(n => n[0] === 'gr_line' && n.find(x => Array.isArray(x) && x[0] === 'layer')?.[1] === 'Edge.Cuts').length, 1440);

  let manufacturing = await tool('Native checks and fabrication package');
  assert.match(await manufacturing.innerText(), /Passed selected generic rules/);
  const manufactured = response('manufacturing.run');
  await manufacturing.getByRole('button', { name: 'Run KiCad checks and package', exact: true }).click();
  const nativeHttp = await manufactured, nativeResponse = await nativeHttp.json();
  assert.equal(nativeResponse.ok, true, JSON.stringify(nativeResponse.error));
  assert.match(nativeHttp.request().postDataJSON().params.filename, /^Experimental-PCB-Litz-browser-test\.kicad_pcb$/, 'Design names with spaces become safe filenames.');
  const native = nativeResponse.result;
  await page.waitForFunction(status => document.querySelector('[data-task-result="manufacturing"]')?.textContent.includes(`Native KiCad: ${status}`), native.status);
  manufacturing = await tool('Native checks and fabrication package');
  if (!native.available) {
    assert.equal(native.status, 'unavailable'); assert.equal(native.ok, false);
    assert.match(await manufacturing.innerText(), /CLI unavailable[\s\S]*not run/);
    assert.equal(native.checks.drc, undefined, 'Missing CLI must not imply a DRC pass.');
  } else {
    assert.ok(['passed', 'violations', 'failed', 'generated'].includes(native.status));
    if (native.ok) assert.equal(native.checks.drc.ok, true);
  }
  assert.ok(native.files.some(f => f.name === 'pcb-litz-review.zip'));
  const download = page.waitForEvent('download');
  await manufacturing.getByRole('button', { name: 'Download pcb-litz-review.zip', exact: true }).click();
  await (await download).saveAs(path.join(dist, 'pcb-litz-browser-review.zip'));
  assert.ok(fs.statSync(path.join(dist, 'pcb-litz-browser-review.zip')).size > 100);

  await set('Litz coil turns', 1.5);
  await page.waitForFunction(() => /Fix parameters/.test(document.querySelector('#st-solve').textContent));
  await modelAction(() => page.getByRole('button', { name: 'Load paper-inspired preset', exact: true }).click(), { turns: 5, litzSizeMode: 'nominal' });
  assert.equal(await page.getByLabel('Litz outer diameter', { exact: true }).inputValue(), '160');
  assert.equal(await page.getByLabel('Highlight Litz copper', { exact: true }).inputValue(), 'all');
  assert.deepEqual(errors, []);
  console.log('PCB Litz browser: fresh Worker waits, sizing, view-only inspection, comparison, cancel/refine, candidate apply, measurements, persistence, export and native-CLI fallback passed.');
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(dist, 'pcb-litz-failure.png') }).catch(() => {});
    console.error('Litz browser diagnostics:', await page.evaluate(() => ({ status: document.querySelector('#st-solve')?.textContent,
      workers: window.__litzBrowserWorkers?.map(({ url, task, completed, terminated, error }) => ({ url, task, completed, terminated, error })) })).catch(() => null));
  }
  throw error;
} finally {
  await browser?.close(); server.kill(); fs.rmSync(state, { recursive: true, force: true });
}
