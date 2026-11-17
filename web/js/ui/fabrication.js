import { el } from './controls.js';
import { captureFabricationStack, fabricationDefaults, fabricationFields, validateFabrication } from '../engine/fabrication.js';
import { OZ_MM } from '../engine/coil.js';
import { api as bridge, state } from '../bridge.js';

export function fabricationEditor(current, apply) {
  const root = el('div', { class: 'tools-mask' });
  const status = el('p', { class: 'hint', role: 'status', text: 'Reading saved profiles…' });
  const picker = el('select', { 'aria-label': 'Saved fabrication profile' });
  const name = el('input', { type: 'text', class: 'textin', 'aria-label': 'Fabrication profile name', maxlength: 100 });
  const form = el('div', { class: 'tools-form' });
  const inputs = {};
  let profiles = [];
  let pending = false;
  let stack = null;
  for (const [key, label, min, max, step] of fabricationFields) {
    const input = el('input', { type: 'number', min, max, step, 'aria-label': label });
    inputs[key] = input;
    form.append(el('label', { class: 'tools-field' }, label, input));
  }
  const action = (text, fn) => el('button', { type: 'button', class: 'btn', text, onClick: fn });
  const stackStatus = el('p', { class: 'hint' });
  const capture = action('Capture KiCad copper stack', async () => {
    capture.disabled = true;
    try {
      const board = await bridge.context();
      const physical = captureFabricationStack(board);
      const thickness = board.thickness || physical.at(-1).centerHeightMm - physical[0].centerHeightMm
        + (physical[0].thicknessMm + physical.at(-1).thicknessMm) / 2;
      inputs.layers.value = physical.length;
      inputs.boardT.value = thickness;
      inputs.copperOz.value = physical[0].thicknessMm / OZ_MM;
      inputs.rfHeight.value = physical.at(-1).centerHeightMm - physical[0].centerHeightMm
        - (physical[0].thicknessMm + physical.at(-1).thicknessMm) / 2;
      if (board.epsR >= 1) inputs.epsR.value = board.epsR;
      stack = physical;
      syncStack();
    } catch (error) { stackStatus.textContent = error.message; }
    finally { capture.disabled = false; }
  });
  capture.disabled = !state.hasBoard;
  const clearStack = action('Use nominal stack instead', () => { stack = null; syncStack(); });
  function syncStack() {
    stackStatus.textContent = stack ? `Captured ${stack.length} copper layers · ${stack.map(layer => layer.name).join(', ')}` : 'Using the entered nominal stack.';
    clearStack.hidden = !stack;
  }
  for (const key of ['layers', 'boardT', 'copperOz']) inputs[key].addEventListener('input', () => {
    if (stack) { stack = null; syncStack(); }
  });
  function draft() {
    return validateFabrication({
      id: picker.value || globalThis.crypto.randomUUID(), name: name.value.trim(), stack,
      ...Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.valueAsNumber])),
    });
  }
  function load(profile) {
    name.value = profile?.name || '';
    for (const [key, input] of Object.entries(inputs)) input.value = profile?.[key] ?? fabricationDefaults[key];
    stack = profile?.stack || null;
    syncStack();
  }
  function options(id) {
    picker.replaceChildren(el('option', { value: '', text: 'New profile' }),
      ...profiles.map(p => el('option', { value: p.id, text: p.name })));
    picker.value = profiles.some(p => p.id === id) ? id : '';
  }
  const save = action('Save profile', async () => {
    if (pending) return;
    try {
      const profile = draft();
      pending = save.disabled = true;
      const next = [...profiles.filter(p => p.id !== profile.id), profile];
      await bridge.setPrefs({ fabricationProfiles: next });
      profiles = next;
      options(profile.id);
      status.textContent = `Saved ${profile.name}.`;
    } catch (error) { status.textContent = error.message; }
    finally { pending = save.disabled = false; }
  });
  const use = action('Apply to design', () => {
    try {
      const profile = draft();
      apply(profile);
      status.textContent = `Applied ${profile.name} to this design.`;
      detach.disabled = false;
    } catch (error) { status.textContent = error.message; }
  });
  const detach = action('Clear active profile', () => {
    apply(null);
    status.textContent = 'Cleared the active profile. Design dimensions are retained.';
    detach.disabled = true;
  });
  detach.disabled = !current;
  picker.addEventListener('change', () => load(profiles.find(p => p.id === picker.value)));
  save.disabled = true;
  load(current);
  options(current?.id);
  root.append(el('label', {}, 'Saved profiles', picker),
    el('label', { class: 'tools-field' }, 'Profile name', name),
    el('div', { class: 'winding-actions' }, capture, clearStack), stackStatus,
    form, el('div', { class: 'winding-actions' }, save, use, detach), status);
  bridge.getPrefs().then(prefs => {
    profiles = Array.isArray(prefs.fabricationProfiles) ? prefs.fabricationProfiles : [];
    options(current?.id);
    status.textContent = current ? `Active profile: ${current.name}` : '';
    save.disabled = false;
  }).catch(error => { status.textContent = error.message; });
  return root;
}
