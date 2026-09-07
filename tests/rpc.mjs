/* Exercise the plugin's RPC surface with no KiCad on the other end.

   This is the half of the plugin that the browser smoke test cannot reach: the
   Python side, its token check, its persistence, and — the part most likely to
   be wrong in the field — what every board method does when KiCad is not
   there. A plugin that throws a traceback at the user because their PCB
   window is closed is worse than one that says so. */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'planar-store-'));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};

const proc = spawn('python3', ['ipc_entry.py', '--print-url'], {
  cwd: ROOT,
  env: { ...process.env, PLANAR_STUDIO_HOME: HOME },
});
const url = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('no URL')), 12000);
  proc.stdout.on('data', (d) => { buf += d; const m = buf.match(/http\S+/); if (m) { clearTimeout(t); resolve(m[0]); } });
});
const base = url.split('/?')[0];
const token = url.split('t=')[1];

const rpc = async (method, params = {}, tok = token) => {
  const res = await fetch(`${base}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Planar-Token': tok },
    body: JSON.stringify({ method, params }),
  });
  if (res.status !== 200) return { httpStatus: res.status };
  return res.json();
};

try {
  // --- auth ------------------------------------------------------------
  check('a bad token is refused', (await rpc('app.info', {}, 'not-the-token')).httpStatus === 403);
  check('an absent token is refused',
    (await fetch(`${base}/api`, { method: 'POST', body: '{}' })).status === 403);
  check('a static asset without a token is refused',
    (await fetch(`${base}/css/app.css`)).status === 403);
  check('the health probe needs no token', (await fetch(`${base}/healthz`)).status === 200);
  check('a path outside the web root is refused',
    (await fetch(`${base}/../../etc/passwd?t=${token}`)).status >= 400
    || !(await (await fetch(`${base}/../../etc/passwd?t=${token}`)).text()).includes('root:'));

  // --- info and status --------------------------------------------------
  const info = await rpc('app.info');
  check('app.info answers', info.ok && info.result.version === '1.0.0', info.result && info.result.version);
  check('every method the page calls is registered',
    ['board.context', 'board.place', 'board.unplace', 'board.select', 'library.write',
      'library.list', 'file.save', 'prefs.get', 'prefs.set', 'designs.list',
      'designs.save', 'designs.load', 'designs.delete', 'kicad.status', 'kicad.reconnect']
      .every((m) => info.result.methods.includes(m)),
    info.result.methods.length + ' methods');

  const st = await rpc('kicad.status');
  check('kicad.status reports a disconnected link cleanly',
    st.ok && st.result.connected === false && typeof st.result.error === 'string',
    st.result.error.slice(0, 60));

  // --- board methods with no board -------------------------------------
  for (const m of ['board.context', 'board.snapshot', 'board.place', 'board.unplace', 'board.select']) {
    const r = await rpc(m, { placement: { name: 'x', tracks: [] }, designId: 'x' });
    check(`${m} fails politely with no KiCad`,
      r.ok === false && ['nolink', 'empty'].includes(r.kind) && !/Traceback/.test(r.error || ''),
      `${r.kind}: ${(r.error || '').slice(0, 50)}`);
  }

  // --- unknown method ---------------------------------------------------
  const bad = await rpc('board.detonate');
  check('an unknown method is a clean error', bad.ok === false && bad.kind === 'badmethod');

  // --- persistence ------------------------------------------------------
  const cfgIn = { shape: 'racetrack', turns: 7.5, dOuter: 21.25, nested: { a: [1, 2, 3] } };
  check('designs.save accepts a design', (await rpc('designs.save', { id: 'inductor:l1', name: 'L1', kind: 'inductor', config: cfgIn })).ok);
  const list = await rpc('designs.list');
  check('designs.list returns it', list.ok && list.result.designs.some((d) => d.id === 'inductor:l1'));
  const loaded = await rpc('designs.load', { id: 'inductor:l1' });
  check('designs.load round-trips the config exactly',
    loaded.ok && JSON.stringify(loaded.result.config) === JSON.stringify(cfgIn));
  check('designs.load on a missing id is a clean error',
    (await rpc('designs.load', { id: 'nope' })).kind === 'notfound');
  check('prefs round-trip', (await rpc('prefs.set', { prefs: { theme: 'dark' } })).ok
    && (await rpc('prefs.get')).result.theme === 'dark');
  check('state is written to disk', fs.existsSync(path.join(HOME, 'state.json')));
  check('designs.delete removes it', (await rpc('designs.delete', { id: 'inductor:l1' })).result.deleted === true);

  // --- file output ------------------------------------------------------
  const saved = await rpc('file.save', { name: 'planar-test.txt', text: 'hello\nworld\n' });
  check('file.save writes somewhere real', saved.ok && fs.existsSync(saved.result.path), saved.result && saved.result.path);
  if (saved.ok) {
    check('  and the bytes are right', fs.readFileSync(saved.result.path, 'utf8') === 'hello\nworld\n');
    fs.rmSync(saved.result.path, { force: true });
  }
  check('file.save refuses an empty payload', (await rpc('file.save', { name: 'x.txt' })).kind === 'empty');
  check('file.save cannot escape its directory', await (async () => {
    const r = await rpc('file.save', { name: '../../escape.txt', text: 'x' });
    return r.ok && !r.result.path.includes('..') && path.basename(r.result.path) === 'escape.txt';
  })());

  // --- library ----------------------------------------------------------
  const lib = await rpc('library.write', { name: 'TESTCOIL', text: '(footprint "TESTCOIL")\n' });
  check('library.write explains itself with no project open',
    lib.ok === false && lib.kind === 'noproject', (lib.error || '').slice(0, 60));

  // --- malformed input --------------------------------------------------
  const malformed = await fetch(`${base}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Planar-Token': token },
    body: '{ not json',
  });
  check('malformed JSON is a 400, not a crash', malformed.status === 400);
} finally {
  proc.kill();
  fs.rmSync(HOME, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
