/* ============================================================================
   PLANAR STUDIO — application shell.

   Holds the state, owns the canvas, and decides when to recompute.

   Recomputation is two-phase on purpose. Geometry is cheap and runs on every
   keystroke, so the drawing tracks the slider under your finger. The field
   solve is not cheap — a sixteen-layer winding is a few thousand filaments and
   a full partial-inductance sum over them — so it waits for a pause. The
   result is a tool that feels immediate while still doing the real arithmetic,
   which is the opposite of the usual trade where the numbers are fast because
   they are approximations.
   ========================================================================= */

import * as bridge from './bridge.js';
import { Panel, el, icon, ICONS, tile, specTable, noteList, num } from './ui/controls.js';
import { Viewport } from './ui/canvas.js';
import { LineChart, legendFor } from './ui/charts.js';
import { openDesignTools, withMeasurements } from './ui/design-tools.js';
import { applyBoardContext, designId } from './ws/common.js';
import { toKicad, boundsCopper } from './engine/artwork.js';
import { exportKicadMod, exportKicadPcb, exportSvg, exportDxf, exportJson, exportSpec, estimate } from './engine/exporters.js';

import * as wsInductor from './ws/inductor.js';
import * as wsMotor from './ws/motor.js';
import * as wsFilter from './ws/filter.js';
import * as wsAntenna from './ws/antenna.js';
import * as wsTransformer from './ws/transformer.js';

const WORKSPACES = { inductor: wsInductor, motor: wsMotor, filter: wsFilter, antenna: wsAntenna, transformer: wsTransformer };

/* ------------------------------------------------------------------ state */

const app = {
  ws: 'inductor',
  configs: {
    inductor: wsInductor.defaults(),
    motor: wsMotor.defaults(),
    filter: wsFilter.defaults(),
    antenna: wsAntenna.defaults(),
    transformer: wsTransformer.defaults(),
  },
  names: { inductor: 'L1', motor: 'M1', filter: 'FL1', antenna: 'ANT1', transformer: 'T1' },
  result: null,
  panel: null,
  view: null,
  charts: new Map(),
  boardApplied: false,
  dirty: false,
};

const $ = (id) => document.getElementById(id);
const current = () => WORKSPACES[app.ws];
const cfg = () => app.configs[app.ws];

/* ------------------------------------------------------------------ theme */

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem('planar.theme', mode); } catch { /* private mode */ }
  if (app.view) app.view.draw();
  app.charts.forEach((c) => c.draw());
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('planar.theme'); } catch { /* private mode */ }
  const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(saved || system);
}

/* ------------------------------------------------------------------ toast */

let toastSeq = 0;
function toast(message, kind = 'ok', opt = {}) {
  const host = $('toasts');
  const id = ++toastSeq;
  const paths = { ok: ICONS.ok, warn: ICONS.warn, error: ICONS.err, info: ICONS.info };
  const mark = icon(paths[kind] || ICONS.info, 15);
  mark.classList.add('ic');
  const node = el('div', { class: 'toast', dataset: { kind, id } },
    mark,
    el('div', {},
      el('div', { text: message }),
      opt.path ? el('div', { class: 'path', text: opt.path }) : null),
    el('span', { class: 'x', text: '✕', onClick: () => node.remove() }));
  host.append(node);
  if (!opt.sticky) setTimeout(() => node.remove(), opt.ms || 5200);
  return node;
}

/* ------------------------------------------------------- compute pipeline */

let quickTimer = 0;
let fullTimer = 0;
let lastSolveMs = 0;

function scheduleQuick() {
  if (quickTimer) return;
  quickTimer = requestAnimationFrame(() => {
    quickTimer = 0;
    runCompute(true);
  });
}

function scheduleFull(delay = 130) {
  clearTimeout(fullTimer);
  fullTimer = setTimeout(() => runCompute(false), delay);
}

function environment() {
  return {
    board: bridge.state.context,
    name: app.names[app.ws],
    net: netNameFor(),
  };
}

function netNameFor() {
  const ctx = bridge.state.context;
  const wanted = ['filter', 'antenna'].includes(app.ws) ? 'RF' : 'COIL';
  if (ctx && ctx.nets && ctx.nets.length) {
    // Prefer a net the board already has, since the API cannot create one.
    const exact = ctx.nets.find((n) => n === wanted);
    if (exact) return exact;
  }
  return wanted;
}

function runCompute(quick) {
  const ws = current();
  const t0 = performance.now();
  let res;
  try {
    res = ws.compute(cfg(), environment(), { quick });
  } catch (err) {
    app.result = null;
    app.view.setArtwork(null, []);
    app.view.setHandles([]);
    app.charts.forEach(c => c.destroy());
    app.charts.clear();
    $('side').replaceChildren();
    $('st-solve').textContent = 'Fix parameters to continue';
    $('st-algo').textContent = 'geometry failed';
    toast(`Could not build the geometry: ${err.message}`, 'error');
    return false;
  }
  if (!quick) lastSolveMs = performance.now() - t0;
  app.result = res;

  app.view.setArtwork(res.art, ws.layerList(cfg(), res));
  renderLayerChips(ws.layerList(cfg(), res));
  refreshHandles();
  if (app.fitPending) { app.fitPending = false; app.view.fit(res.bounds); }

  renderStatus(res, quick);
  if (quick) {
    scheduleFull();
  } else {
    renderSide(res);
  }
  return true;
}

function refreshHandles() {
  const ws = current();
  if (!app.result) return;
  const hs = ws.handles(cfg(), app.result, api);
  app.view.setHandles(app.view.show.handles ? hs : []);
}

/* Public surface the workspaces use to write back into the config. */
const api = {
  set(key, value) {
    if (cfg()[key] === value) return;
    cfg()[key] = value;
    reconcile(key, value);
    app.dirty = true;
    app.panel.sync();
    scheduleQuick();
  },
  setMaxTurns() {
    const res = app.result;
    if (!res || !res.coil) return;
    const max = Math.floor(res.coil.spiral.maxTurns);
    api.set('turns', Math.max(1, max));
    toast(`Turns set to ${Math.max(1, max)}, the most this geometry holds.`, 'info');
  },
  toast,
};

/* -------------------------------------------------------------- rendering */

/* Some parameters only make sense together. Switching a filter from a lumped
   ladder to a hairpin without moving the frequency leaves you designing a
   metre-long resonator at 100 MHz; a workspace can say so by exporting
   `reconcile`, which runs before the panel is re-synced. */
function reconcile(key, value) {
  const ws = current();
  if (ws.reconcile) ws.reconcile(cfg(), key, value);
  if (key === 'family' && ['antenna', 'transformer'].includes(app.ws)) app.fitPending = true;
}

function renderRail() {
  app.panel = new Panel($('rail'), cfg(), (key, value) => {
    reconcile(key, value);
    app.dirty = true;
    app.panel.sync();
    scheduleQuick();
  });
  app.panel.clear();
  current().rail(app.panel, api);

  // Every workspace gets the same design library at the bottom.
  app.panel.group({
    key: 'designs',
    title: 'Designs',
    open: false,
    fields: [
      {
        type: 'row',
        buttons: [
          { label: 'Save', onClick: saveDesign },
          { label: 'Open…', onClick: openDesignPicker },
          { label: 'Import…', hint: 'Load a design JSON exported from here', onClick: importDesignJson },
        ],
      },
      { type: 'note', text: 'Saved designs live with the plugin, not with the board, so they follow you between projects.' },
    ],
  });
  app.panel.sync();
}

function renderLayerChips(layers) {
  const host = $('layer-chips');
  host.replaceChildren();
  for (const [name, colour] of layers) {
    const on = app.view.layerVisible.get(name) !== false;
    const chip = el('button', { class: 'chip', 'aria-pressed': String(on), title: `Toggle ${name}` },
      el('span', { class: 'sw' }), el('span', { text: name }));
    chip.querySelector('.sw').style.background = colour;
    chip.addEventListener('click', () => {
      app.view.toggleLayer(name);
      chip.setAttribute('aria-pressed', String(app.view.layerVisible.get(name) !== false));
    });
    host.append(chip);
  }
}

function renderStatus(res, quick) {
  const ws = current();
  const st = ws.status(cfg(), res);
  $('st-algo').textContent = st.algo;
  const b = boundsCopper(res.art);
  $('st-size').textContent = `${num(b.w, 1)} × ${num(b.h, 1)} mm`;
  const est = estimate(res.art, cfg().tolerance);
  $('st-segments').textContent = `${est.segments.toLocaleString()} segments · ${est.vias} vias`;
  $('st-solve').textContent = quick ? 'solving…' : `${st.summary} · ${lastSolveMs.toFixed(0)} ms`;
}

function renderSide(res) {
  const ws = current();
  const host = $('side');
  app.charts.forEach((c) => c.destroy());
  app.charts.clear();
  host.replaceChildren();

  const tilesData = ws.tiles(cfg(), res);
  if (tilesData.length) {
    const grid = el('div', { class: 'tiles' });
    for (const t of tilesData) grid.append(tile(t.k, t.v, t.u, t));
    host.append(grid);
  }

  const notes = ws.notes(cfg(), res);
  if (notes.length) {
    host.append(el('div', { class: 'side-section' },
      el('h3', { text: 'Notes' }),
      noteList(notes)));
  }

  const chartSpecs = withMeasurements(ws.charts(cfg(), res), cfg(), app.ws);
  if (chartSpecs.length) {
    const sec = el('div', { class: 'side-section' }, el('h3', { text: 'Response' }));
    for (const c of chartSpecs) {
      const wrap = el('div', {});
      wrap.append(el('div', { class: 'hint', style: 'margin-bottom:4px', text: c.title }));
      const canvas = el('canvas', { class: 'chart', height: 132 });
      wrap.append(canvas);
      const legend = el('div', { class: 'chart-legend' });
      wrap.append(legend);
      if (c.note) wrap.append(el('div', { class: 'hint', style: 'margin-top:4px', text: c.note }));
      sec.append(wrap);
      // Charts are created after layout so the canvas has a measured width.
      requestAnimationFrame(() => {
        if (!canvas.isConnected) return;
        const chart = new LineChart(canvas, c.spec);
        app.charts.set(`${app.ws}:${c.id}`, chart);
        chart.draw();
        legendFor(c.spec.series, legend);
      });
    }
    host.append(sec);
  }

  for (const sec of ws.spec(cfg(), res)) {
    if (!sec || !sec.rows || !sec.rows.length) continue;
    host.append(el('div', { class: 'side-section' },
      el('h3', { text: sec.title }),
      sec.note ? el('div', { class: 'hint', text: sec.note }) : null,
      specTable(sec.rows)));
  }
}

/* ------------------------------------------------------------ workspace */

function switchWorkspace(next) {
  if (next === app.ws) return;
  app.ws = next;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.ws === next)));
  $('design-name').value = app.names[next];
  app.charts.forEach((c) => c.destroy());
  app.charts.clear();
  renderRail();
  app.fitPending = true;
  runCompute(true);
}

/* --------------------------------------------------------------- actions */

function currentArtwork() {
  return runCompute(false) ? app.result.art : null;
}

function showDesignTools(tab = 'optimize') {
  if (['antenna', 'transformer'].includes(app.ws)) tab = 'board';
  clearTimeout(fullTimer);
  if (quickTimer) { cancelAnimationFrame(quickTimer); quickTimer = 0; }
  if (!runCompute(false)) return;
  openDesignTools({
    config: cfg, kind: () => app.ws, name: () => app.names[app.ws], result: () => app.result,
    designId: () => designId(app.ws, app.names[app.ws]),
    dirty: () => { app.dirty = true; },
    apply(patch) {
      Object.assign(cfg(), patch); app.dirty = true;
      renderRail(); runCompute(false);
    },
    switch(kind, tool) { switchWorkspace(kind); showDesignTools(tool); },
  }, tab);
}

async function placeIntoBoard() {
  if (!runCompute(false)) return;
  const res = app.result;
  if (!res) return;
  if (!bridge.state.hasBoard) {
    toast('No board is open in KiCad. Open a PCB and try again.', 'warn');
    return;
  }
  const existingNets = bridge.state.context?.nets || [];
  if (['antenna', 'transformer'].includes(app.ws)) {
    const required = [...new Set([...res.art.tracks, ...res.art.pads].map(p => p.net).filter(Boolean))];
    const missing = required.filter(n => !existingNets.includes(n));
    if (missing.length) {
      toast(`Create these nets in KiCad before placing: ${missing.join(', ')}. You can also export a KiCad board with the nets included.`, 'warn');
      return;
    }
  }
  const est = estimate(res.art, cfg().tolerance);
  if (est.segments > 25000) {
    const ok = window.confirm(
      `This places ${est.segments.toLocaleString()} track segments. Boards get slow to edit above about `
      + `20,000. Raise the export tolerance to thin it out, or continue?`);
    if (!ok) return;
  }

  const payload = toKicad(res.art, { tolerance: cfg().tolerance });
  const did = designId(app.ws, app.names[app.ws]);
  const known = (bridge.state.context && bridge.state.context.placements) || [];
  const replace = known.some((p) => p.designId === did);

  const btn = $('btn-place');
  btn.disabled = true;
  try {
    const out = await bridge.api.place({
      name: app.names[app.ws],
      designId: did,
      origin: cfg().placementOrigin || [0, 0],
      ...payload,
    }, {
      replace,
      select: true,
      net: netNameFor(),
      kind: app.ws,
      summary: current().status(cfg(), res).summary,
    });
    const bits = [`${out.created.toLocaleString()} items placed`];
    if (out.replaced) bits.push(`${out.replaced.toLocaleString()} replaced`);
    toast(`${bits.join(', ')}. One Ctrl+Z undoes all of it.`, 'ok');
    if (out.skipped && out.skipped.length) {
      toast(`Some items were skipped: ${out.skipped.slice(0, 3).join('; ')}`, 'warn');
    }
    bridge.reconnect();
  } catch (err) {
    if (err.kind === 'nolink') toast(`KiCad is not reachable: ${err.message}`, 'error');
    else toast(err.message, 'error', { sticky: err.kind === 'exception' });
  } finally {
    btn.disabled = false;
  }
}

async function writeLibrary() {
  if (!runCompute(false)) return;
  const res = app.result;
  if (!res) return;
  const name = app.names[app.ws];
  const text = exportKicadMod(res.art, {
    name,
    tolerance: cfg().tolerance,
    description: current().status(cfg(), res).summary,
    tags: `planar studio ${app.ws}`,
    reference: ({ filter: 'FL**', antenna: 'ANT**', transformer: 'T**', motor: 'M**' })[app.ws] || 'L**',
  });
  try {
    const out = await bridge.api.writeLibrary(name, text);
    toast(`${name}.kicad_mod written. ${out.message}`, 'ok', { path: out.path });
  } catch (err) {
    if (err.kind === 'standalone' || err.kind === 'offline' || err.kind === 'noproject') {
      const saved = await bridge.saveFile(`${name}.kicad_mod`, text);
      toast(saved.local ? 'Downloaded the footprint instead.' : 'Saved the footprint.', 'warn', { path: saved.path });
    } else {
      toast(err.message, 'error');
    }
  }
}

/* ----------------------------------------------------------- export modal */

function exportOptions() {
  if (!runCompute(false)) return [];
  const res = app.result;
  const name = app.names[app.ws];
  const tol = cfg().tolerance;
  const est = estimate(res.art, tol);
  return [
    {
      title: 'KiCad footprint (.kicad_mod)',
      desc: 'Copper as footprint graphics and pads, preserving terminal layers. Drop the folder in as a .pretty library.',
      file: `${name}.kicad_mod`,
      make: () => exportKicadMod(res.art, { name, tolerance: tol, description: current().status(cfg(), res).summary }),
    },
    {
      title: 'KiCad board (.kicad_pcb)',
      desc: `Real tracks, vias and nets — ${est.segments.toLocaleString()} segments, about ${(est.approxBytes / 1024).toFixed(0)} kB. Open it, or File → Append Board.`,
      file: `${name}.kicad_pcb`,
      make: () => exportKicadPcb(res.art, { tolerance: tol, boardThickness: cfg().boardT }),
    },
    {
      title: 'SVG',
      desc: '1 unit = 1 mm, one group per copper layer, KiCad layer colours.',
      file: `${name}.svg`,
      mime: 'image/svg+xml',
      make: () => exportSvg(res.art, { name, tolerance: tol }),
    },
    {
      title: 'DXF R12',
      desc: 'Polylines by layer, for mechanical CAD and FEA meshing (FEMM, Ansys).',
      file: `${name}.dxf`,
      make: () => exportDxf(res.art, { tolerance: tol }),
    },
    {
      title: 'Design JSON',
      desc: 'Every parameter and the computed results. Reload it here, or diff two revisions.',
      file: `${name}.json`,
      mime: 'application/json',
      make: () => exportJson({
        kind: app.ws, name, config: cfg(),
        summary: current().status(cfg(), res).summary,
      }),
    },
    {
      title: 'Specification sheet',
      desc: 'Markdown table of every quantity, with the models and their limits named.',
      file: `${name}.md`,
      mime: 'text/markdown',
      make: () => exportSpec(current().spec(cfg(), res), {
        title: `${name} — ${current().title}`,
        subtitle: current().status(cfg(), res).summary,
        notes: current().notes(cfg(), res),
        references: REFERENCES,
      }),
    },
  ];
}

const REFERENCES = [
  'Mohan, Hershenson, Boyd & Lee. Simple accurate expressions for planar spiral inductances. IEEE JSSC 34(10), 1999.',
  'Grover. Inductance Calculations: Working Formulas and Tables. Dover, 1946.',
  'Dowell. Effects of eddy currents in transformer windings. Proc. IEE 113(8), 1966.',
  'IPC-2221B, Generic Standard on Printed Board Design, §6.2.',
  'Hammerstad & Jensen. Accurate models for microstrip computer-aided design. IEEE MTT-S, 1980.',
  'Matthaei, Young & Jones. Microwave Filters, Impedance-Matching Networks and Coupling Structures, 1980.',
  'Hong. Microstrip Filters for RF/Microwave Applications, 2nd ed., 2011.',
];

function openExport() {
  if (!app.result) return;
  const opts = exportOptions();
  if (!opts.length) return;
  const grid = el('div', { class: 'export-grid' });
  for (const o of opts) {
    const card = el('button', { class: 'export-card', type: 'button' },
      el('span', { class: 't', text: o.title }),
      el('span', { class: 'd', text: o.desc }));
    card.addEventListener('click', async () => {
      const saved = await bridge.saveFile(o.file, o.make(), o.mime);
      toast(saved.local ? `Downloaded ${o.file}.` : `Wrote ${o.file}.`, 'ok', { path: saved.path });
      close();
    });
    grid.append(card);
  }
  const { close } = modal('Export', grid, [{ label: 'Close', onClick: () => close() }]);
}

function modal(title, body, buttons) {
  const scrim = el('div', { class: 'scrim' });
  const footer = el('footer');
  const box = el('div', { class: 'modal' },
    el('header', {}, el('h2', { text: title })),
    el('div', { class: 'body' }, body),
    footer);
  const close = () => scrim.remove();
  for (const b of buttons || []) {
    footer.append(el('button', { class: `btn ${b.variant || ''}`, text: b.label, onClick: () => b.onClick(close) }));
  }
  scrim.append(box);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  document.body.append(scrim);
  return { close, box };
}

/* -------------------------------------------------------- design library */

async function saveDesign() {
  const id = designId(app.ws, app.names[app.ws]);
  try {
    await bridge.api.saveDesign(id, app.names[app.ws], app.ws, cfg());
    app.dirty = false;
    toast(`Saved “${app.names[app.ws]}”.`, 'ok');
  } catch (err) {
    if (err.kind === 'standalone') {
      try { localStorage.setItem(`planar.design.${id}`, JSON.stringify({ name: app.names[app.ws], kind: app.ws, config: cfg() })); } catch { /* ignore */ }
      toast('Saved in this browser only — the plugin is not running.', 'warn');
    } else toast(err.message, 'error');
  }
}

/* Read back a design JSON export. The exported file carries the whole config,
   so this is the round trip that makes the JSON export worth having -- and the
   way a design travels between two people who are not sharing a plugin store. */
function importDesignJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const kind = WORKSPACES[data.kind] ? data.kind : app.ws;
      if (!data.config || typeof data.config !== 'object') throw new Error('no config in that file');
      app.ws = kind;
      app.configs[kind] = { ...WORKSPACES[kind].defaults(), ...data.config };
      app.names[kind] = data.name || app.names[kind];
      $('design-name').value = app.names[kind];
      document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.ws === kind)));
      app.charts.clear();
      renderRail();
      app.fitPending = true;
      runCompute(true);
      toast(`Imported “${app.names[kind]}” into the ${WORKSPACES[kind].title} workspace.`, 'ok');
    } catch (err) {
      toast(`That file is not a Planar Studio design: ${err.message}`, 'error');
    }
  });
  input.click();
}

async function openDesignPicker() {
  let designs = [];
  try {
    designs = (await bridge.api.listDesigns()).designs || [];
  } catch {
    designs = [];
  }
  if (!designs.length) {
    toast('No saved designs yet.', 'info');
    return;
  }
  const list = el('div', { style: 'display:flex; flex-direction:column; gap:6px' });
  for (const d of designs) {
    const row = el('button', { class: 'export-card', type: 'button' },
      el('span', { class: 't', text: d.name }),
      el('span', { class: 'd', text: `${d.kind} · ${new Date(d.saved * 1000).toLocaleString()}` }));
    row.addEventListener('click', async () => {
      try {
        const entry = await bridge.api.loadDesign(d.id);
        app.ws = entry.kind && WORKSPACES[entry.kind] ? entry.kind : app.ws;
        app.configs[app.ws] = { ...WORKSPACES[app.ws].defaults(), ...entry.config };
        app.names[app.ws] = entry.name;
        $('design-name').value = entry.name;
        document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.ws === app.ws)));
        renderRail();
        app.fitPending = true;
        runCompute(true);
        toast(`Opened “${entry.name}”.`, 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
      close();
    });
    list.append(row);
  }
  const { close } = modal('Open a design', list, [{ label: 'Close', onClick: (c) => c() }]);
}

/* ------------------------------------------------------------ link state */

function renderLink(st) {
  const pill = $('link-pill');
  const text = $('link-text');
  if (st.standalone) {
    pill.dataset.state = 'down';
    text.textContent = 'standalone';
    pill.title = 'Running outside the plugin, so nothing can be placed. Exports fall back to downloads.';
  } else if (!st.connected) {
    pill.dataset.state = 'down';
    text.textContent = 'KiCad offline';
    pill.title = st.error || 'No connection to KiCad.';
  } else if (!st.hasBoard) {
    pill.dataset.state = 'noboard';
    text.textContent = 'no board open';
    pill.title = `Connected to KiCad ${st.kicadVersion}. Open a PCB to place anything.`;
  } else {
    pill.dataset.state = 'live';
    text.textContent = st.boardName || 'board open';
    pill.title = `KiCad ${st.kicadVersion}`;
  }
  $('btn-place').disabled = !st.hasBoard;
  $('st-board').textContent = st.hasBoard ? (st.boardName || 'board') : (st.connected ? 'no board' : 'offline');

  // First time a board appears, adopt its stack-up.
  if (st.hasBoard && st.context && !app.boardApplied) {
    app.boardApplied = true;
    adoptBoard(st.context);
  }
}

function adoptBoard(ctx) {
  const notes = [];
  for (const key of Object.keys(app.configs)) {
    const { applied, cfg: next } = applyBoardContext(app.configs[key], ctx);
    app.configs[key] = next;
    if (key === app.ws && applied.length) notes.push(...applied);
  }
  // The filter workspace measures to the reference plane, not through the board.
  if (ctx.thickness > 0.05) {
    const f = app.configs.filter;
    const layerCount = Math.max(2, ctx.layerCount || 2);
    f.subH = Number((ctx.thickness / (layerCount - 1)).toFixed(4));
    f.boardT = Number(ctx.thickness.toFixed(4));
  }
  if (ctx.epsR > 1.2) app.configs.filter.subEr = Number(ctx.epsR.toFixed(3));
  if (ctx.copperThicknessMm > 0.005) app.configs.filter.subT = Number(ctx.copperThicknessMm.toFixed(4));

  app.panel.sync();
  scheduleQuick();
  if (notes.length) {
    toast(`Adopted the board's stack-up: ${notes.join(', ')}.`, 'info', { ms: 7000 });
  }
  if (ctx.warnings && ctx.warnings.length) {
    toast(`Some board facts could not be read (${ctx.warnings.join('; ')}). The values in the panel are being used instead.`, 'warn', { ms: 8000 });
  }
}

/* ------------------------------------------------------------------ boot */

function wireChrome() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchWorkspace(t.dataset.ws));
  });

  $('design-name').addEventListener('input', (e) => {
    app.names[app.ws] = e.target.value || 'design';
  });

  $('btn-theme').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  $('btn-place').addEventListener('click', placeIntoBoard);
  $('btn-library').addEventListener('click', writeLibrary);
  $('btn-export').addEventListener('click', openExport);
  $('btn-tools').addEventListener('click', () => showDesignTools(app.ws === 'filter' ? 'tune' : app.ws === 'motor' ? 'rotor' : 'optimize'));
  $('link-pill').addEventListener('click', () => {
    bridge.reconnect();
    toast('Re-checking the KiCad connection…', 'info', { ms: 2500 });
  });

  $('t-fit').addEventListener('click', () => app.result && app.view.fit(app.result.bounds));
  $('t-zoomin').addEventListener('click', () => app.view.zoomBy(1.3));
  $('t-zoomout').addEventListener('click', () => app.view.zoomBy(1 / 1.3));

  const toggle = (btnId, key, after) => {
    const b = $(btnId);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      app.view.show[key] = on;
      if (after) after(on);
      app.view.draw();
    });
  };
  toggle('t-grid', 'grid');
  toggle('t-vias', 'vias');
  toggle('t-labels', 'labels');
  toggle('t-handles', 'handles', () => refreshHandles());

  $('t-rail').addEventListener('click', () => {
    const a = $('app');
    a.dataset.rail = a.dataset.rail === 'on' ? 'off' : 'on';
    $('t-rail').textContent = a.dataset.rail === 'on' ? '‹' : '›';
  });
  $('t-side').addEventListener('click', () => {
    const a = $('app');
    a.dataset.side = a.dataset.side === 'on' ? 'off' : 'on';
    $('t-side').textContent = a.dataset.side === 'on' ? '›' : '‹';
    app.charts.forEach((c) => c.draw());
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.tools-scrim')) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'f' || e.key === 'F') { if (app.result) app.view.fit(app.result.bounds); }
    if (e.key === 'g' || e.key === 'G') $('t-grid').click();
    if (e.key === 'h' || e.key === 'H') $('t-handles').click();
    if (e.key === 'l' || e.key === 'L') $('t-labels').click();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDesign(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); placeIntoBoard(); }
    if (e.key === '1') switchWorkspace('inductor');
    if (e.key === '2') switchWorkspace('motor');
    if (e.key === '3') switchWorkspace('filter');
    if (e.key === '4') switchWorkspace('antenna');
    if (e.key === '5') switchWorkspace('transformer');
  });

  window.addEventListener('beforeunload', (e) => {
    if (!app.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function boot() {
  initTheme();
  $('version').textContent = ` ${bridge.state.version}`;

  app.view = new Viewport($('view'), {
    onHover: (info) => {
      const r = $('readout');
      if (!info) { r.textContent = '—'; return; }
      const extra = info.handle ? `  ·  ${info.handle.hint}` : '';
      r.textContent = `${info.x.toFixed(3)}, ${info.y.toFixed(3)} mm${extra}`;
    },
    onHandleDrag: (handle, wx, wy) => { if (handle.drag) handle.drag(wx, wy); },
    onHandleDone: () => scheduleFull(30),
  });

  bridge.onBusy((busy) => { $('busy').hidden = !busy; });
  bridge.onStatus(renderLink);

  wireChrome();
  renderRail();
  app.fitPending = true;
  runCompute(true);

  bridge.startPolling();
  if (bridge.STANDALONE) {
    renderLink(bridge.state);
    toast('Running outside KiCad — design and export work, placing does not.', 'info', { ms: 6000 });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
