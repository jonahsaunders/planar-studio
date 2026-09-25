/* ============================================================================
   BRIDGE — the page's half of the plugin conversation.

   Everything that leaves the browser goes through `call`. The session token
   arrives as a body attribute rather than in the URL, so it does not end up in
   a referrer or a bookmark, and it is sent as a header on every request.

   The connection is expected to come and go. KiCad can be closed, a board can
   be closed and reopened, the socket can drop. Rather than treat that as an
   error state to recover from, the UI subscribes to `onStatus` and re-renders;
   the design tool itself never stops working when the link is down.
   ========================================================================= */

const TOKEN = document.body.dataset.token || '';
const VERSION = document.body.dataset.version || 'dev';

/* When the token was never substituted, the page is being served by something
   other than the plugin. Say so once rather than failing on every call. */
export const STANDALONE = TOKEN === '__PLANAR_TOKEN__' || TOKEN === '';

export class RpcError extends Error {
  constructor(message, kind = 'error', detail = '') {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

let inflight = 0;
const listeners = { busy: [], status: [] };

const emit = (channel, value) => listeners[channel].forEach((fn) => { try { fn(value); } catch (e) { console.error(e); } });

export const onBusy = (fn) => { listeners.busy.push(fn); return () => { listeners.busy = listeners.busy.filter((f) => f !== fn); }; };
export const onStatus = (fn) => { listeners.status.push(fn); return () => { listeners.status = listeners.status.filter((f) => f !== fn); }; };

/**
 * Call a plugin method.
 * Resolves with the result, rejects with RpcError. Transport failures come
 * back as kind 'offline' so the caller can distinguish "KiCad said no" from
 * "the plugin is gone".
 */
export async function call(method, params = {}, opt = {}) {
  if (STANDALONE) throw new RpcError('Not running inside the plugin.', 'standalone');
  inflight += 1;
  if (inflight === 1) emit('busy', true);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opt.timeout || 30000);
    let res;
    try {
      res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Planar-Token': TOKEN },
        body: JSON.stringify({ method, params }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new RpcError(`HTTP ${res.status}`, 'transport');
    const data = await res.json();
    if (!data.ok) throw new RpcError(data.error || 'unknown error', data.kind || 'error', data.detail || '');
    return data.result;
  } catch (err) {
    if (err instanceof RpcError) throw err;
    throw new RpcError(err.name === 'AbortError' ? 'The plugin did not answer in time.' : String(err.message || err), 'offline');
  } finally {
    inflight -= 1;
    if (inflight === 0) emit('busy', false);
  }
}

/* --------------------------------------------------------------------------
   Live connection state
   ----------------------------------------------------------------------- */

export const state = {
  version: VERSION,
  standalone: STANDALONE,
  connected: false,
  hasBoard: false,
  boardName: '',
  kicadVersion: '',
  error: STANDALONE ? 'running outside KiCad' : '',
  context: null,        // board context, refreshed alongside status
  lastContextAt: 0,
};

let pollTimer = null;
let pollDelay = 1500;

async function poll() {
  if (STANDALONE) return;
  try {
    const st = await call('kicad.status', {}, { timeout: 8000 });
    const wasConnected = state.connected;
    const hadBoard = state.hasBoard;
    Object.assign(state, {
      connected: !!st.connected,
      hasBoard: !!st.hasBoard,
      boardName: st.boardName || '',
      kicadVersion: st.kicadVersion || '',
      error: st.error || '',
    });
    // Board context is heavier than a status ping, so refresh it only when
    // something changed or it has gone stale.
    const stale = Date.now() - state.lastContextAt > 20000;
    if (state.hasBoard && (!wasConnected || !hadBoard || stale || !state.context)) {
      try {
        state.context = await call('board.context', {}, { timeout: 12000 });
        state.lastContextAt = Date.now();
      } catch { /* context is a nicety, not a requirement */ }
    }
    if (!state.hasBoard) state.context = null;
    pollDelay = state.connected ? 2500 : 4000;
  } catch (err) {
    state.connected = false;
    state.hasBoard = false;
    state.context = null;
    state.error = err.message;
    pollDelay = Math.min(pollDelay * 1.5, 15000);
  }
  emit('status', state);
  pollTimer = setTimeout(poll, pollDelay);
}

export function startPolling() {
  if (STANDALONE) { emit('status', state); return; }
  if (pollTimer) clearTimeout(pollTimer);
  poll();
}

export async function reconnect() {
  pollDelay = 1200;
  try {
    await call('kicad.reconnect');
  } catch { /* the poll below reports the real state */ }
  if (pollTimer) clearTimeout(pollTimer);
  poll();
}

/* --------------------------------------------------------------------------
   Convenience wrappers
   ----------------------------------------------------------------------- */

export const api = {
  info: () => call('app.info'),
  quit: () => call('app.quit'),
  context: () => call('board.context'),
  place: (placement, opt = {}) => call('board.place', { placement, ...opt }, { timeout: 120000 }),
  unplace: (designId) => call('board.unplace', { designId }),
  selectPlacement: (designId) => call('board.select', { designId }),
  writeLibrary: (name, text) => call('library.write', { name, text }),
  listLibrary: () => call('library.list'),
  saveFile: (name, text) => call('file.save', { name, text }, { timeout: 60000 }),
  getPrefs: () => call('prefs.get'),
  setPrefs: (prefs) => call('prefs.set', { prefs }),
  listDesigns: () => call('designs.list'),
  saveDesign: (id, name, kind, config) => call('designs.save', { id, name, kind, config }),
  loadDesign: (id) => call('designs.load', { id }),
  deleteDesign: (id) => call('designs.delete', { id }),
};

/* --------------------------------------------------------------------------
   Saving a file when the plugin is not there (browser-only development).
   ----------------------------------------------------------------------- */

export function downloadLocally(name, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Save a generated file the best way available: next to the project when the
 * plugin is running, as a browser download otherwise.
 */
export async function saveFile(name, text, mime) {
  if (STANDALONE) {
    downloadLocally(name, text, mime);
    return { path: name, local: true };
  }
  try {
    const res = await api.saveFile(name, text);
    return { ...res, local: false };
  } catch (err) {
    downloadLocally(name, text, mime);
    return { path: name, local: true, fallback: err.message };
  }
}
