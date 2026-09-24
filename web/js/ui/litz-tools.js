/* UI only: the host owns worker execution, cancellation and applying designs. */
import { el, eng, num, specTable } from './controls.js';
import { parseMeasurement } from '../engine/measurements.js';

function field(parent, label, value = '', type = 'text') {
  const input = el('input', { type, value, 'aria-label': label });
  parent.append(el('label', { class: 'field' }, el('span', { class: 'name', text: label }), input));
  return input;
}
function choice(parent, label, values, selected) {
  const select = el('select', { 'aria-label': label }, ...values.map(([value, text]) => el('option', { value, text })));
  select.value = String(selected);
  parent.append(el('label', { class: 'field' }, label, select)); return select;
}
function list(input, label) {
  const values = input.value.split(/[,;\s]+/).filter(Boolean).map(Number);
  if (!values.length || values.length > 12 || values.some(v => !Number.isFinite(v) || v <= 0)) throw new Error(`${label}: enter one to twelve positive numbers.`);
  return [...new Set(values)];
}
function optionalNumber(input, label, scale = 1) {
  if (input.value.trim() === '') return undefined;
  const value = Number(input.value) * scale;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be nonnegative.`);
  return value;
}
function table(headers, rows) {
  return el('table', { class: 'spec' }, el('thead', {}, el('tr', {}, headers.map(text => el('th', { text })))),
    el('tbody', {}, rows.map(row => el('tr', {}, row.map(value => el('td', { text: String(value ?? '—') }))))));
}
function warnings(parent, items = []) {
  for (const item of items.slice(0, 12)) parent.append(el('p', { class: 'hint', text: typeof item === 'string' ? item : item.message || JSON.stringify(item) }));
}
function metrics(parent, value = {}) {
  parent.append(specTable([
    ['Estimated L', value.L < 0 ? 'Capacitive' : eng(value.L, 'H', 4)], ['Estimated Rdc', eng(value.Rdc, 'Ω', 4)],
    ['Estimated Rac', eng(value.Rac ?? value.R, 'Ω', 4)], ['Estimated Q', value.Q < 0 ? '—' : num(value.Q, 2)],
  ]));
}

function measurementResult(parent, result) {
  const m = result.atFrequency;
  parent.append(el('p', { class: 'hint', text: `Reference plane: ${result.scope?.referencePlane || 'unspecified'}. Complex impedance is interpolated within the measured range; there is no extrapolation.` }));
  if (m) parent.append(specTable([['Measured frequency', eng(m.f, 'Hz')], ['Measured R', eng(m.R, 'Ω', 4)], ['Measured L', eng(m.L, 'H', 4)], ['Measured Q', num(m.Q, 2)]]));
  else parent.append(el('p', { class: 'hint', text: 'The operating frequency has no usable complex measurement within the imported range.' }));
  const residualLabel = /measured minus model/i.test(result.scope?.residualConvention || '') ? 'Residual: measured − model' : 'Residual: model − measured';
  if (result.residuals) parent.append(table([residualLabel, 'Absolute', 'Relative'], ['R', 'L', 'Q'].map(key => [key,
    key === 'Q' ? num(result.residuals[key]?.absolute, 3) : eng(result.residuals[key]?.absolute, key === 'L' ? 'H' : 'Ω'),
    result.residuals[key]?.relative == null ? '—' : `${num(100 * result.residuals[key].relative, 2)}%`,
  ])));
  warnings(parent, result.warnings);
}

export function renderLitzTools(cfg, res, api = {}) {
  const host = el('details', { class: 'litz-tools', open: Object.keys(api.results || {}).length > 0 });
  host.append(el('summary', { text: 'Litz comparison, search and manufacturing tools' }));
  host.append(el('p', { class: 'hint', text: 'These local studies use the experimental model. Numerical refinement and a better score do not validate MHz loss, Q, or fabrication capability.' }));
  const results = api.results || {};

  function taskPanel(task, title, buttonText, options, controls) {
    const entry = results[task] || {}, details = el('details', { class: 'litz-tool', open: Boolean(entry.status) });
    details.append(el('summary', { text: title }));
    const form = el('div', { class: 'tools-form' }); details.append(form);
    const values = controls?.(form) || {};
    const saved = cfg.litzStudySettings?.[task] || {};
    const inputEntries = Object.entries(values).filter(([, value]) => value && typeof value.value === 'string');
    const saveSettings = () => api.onSettings?.(task, Object.fromEntries(inputEntries.map(([key, input]) => [key, input.value])));
    for (const [key, input] of inputEntries) {
      if (saved[key] != null) input.value = String(saved[key]);
      input.addEventListener('input', saveSettings); input.addEventListener('change', saveSettings);
    }
    const localStatus = el('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const button = el('button', { type: 'button', class: 'btn small', text: entry.status === 'running' ? 'Running…' : buttonText });
    button.disabled = !api.onTask || entry.status === 'running' || (['convergence', 'compare'].includes(task) && res.validation?.ok === false) || (task === 'manufacturing' && !res.manufacturing?.ok);
    button.addEventListener('click', () => {
      try { const opt = options(values); localStatus.textContent = ''; saveSettings(); api.onTask(task, opt); }
      catch (e) { localStatus.textContent = e.message; }
    });
    details.append(button, localStatus);
    if (entry.status === 'running') details.append(el('p', { class: 'hint', text: entry.progress?.message || 'Working in the background. Changing the design cancels stale results.' }),
      el('button', { type: 'button', class: 'btn small', text: task === 'manufacturing' ? 'Stop waiting for KiCad' : 'Cancel Litz study', onclick: () => api.onTask?.('cancel', {}) }));
    if (entry.status === 'canceled') details.append(el('p', { class: 'hint', text: 'Study canceled. No candidate was applied.' }));
    if (entry.status === 'error') details.append(el('p', { role: 'alert', class: 'hint', text: entry.error || 'The study could not complete.' }));
    const output = el('div', { class: 'litz-tool-results', 'data-task-result': task }); details.append(output); host.append(details);
    return { output, result: entry.result, details };
  }

  const convergence = taskPanel('convergence', 'Numerical convergence', 'Compare resolutions', v => {
    const levels = list(v.levels, 'Path resolutions'), lossSamples = list(v.samples, 'Field sample counts');
    if ([levels, lossSamples].some(values => values.length < 2 || values.length > 5 || values.some((value, i) => i > 0 && value <= values[i - 1]))) throw new Error('Enter two to five increasing path resolutions and two to five increasing field sample counts. Each axis is refined separately.');
    return { levels, lossSamples, tolerance: .02 };
  }, form => ({ levels: field(form, 'Convergence path resolutions', '48, 96, 192'), samples: field(form, 'Convergence field sample counts', '32, 64, 128') }));
  if (convergence.result) {
    const r = convergence.result;
    convergence.output.append(table(['Axis · path / field samples', 'L', 'Rac', 'Q'], (r.levels || []).map(v => [
      `${v.axis === 'source' ? 'Source' : v.axis === 'loss' ? 'Loss' : 'Resolution'} · ${v.segmentCap} / ${v.lossSamples}`, v.L < 0 ? 'Capacitive' : eng(v.L, 'H', 3), eng(v.Rac, 'Ω', 3), v.Q < 0 ? '—' : num(v.Q, 1),
    ])));
    convergence.output.append(table(['Refinement', 'ΔL', 'ΔRac', 'Largest phasor change'], (r.changes || []).map(v => [
      `${v.axis === 'loss' ? 'Loss' : 'Source'}: ${r.levels?.[v.from]?.[v.axis === 'loss' ? 'lossSamples' : 'segmentCap'] ?? v.from} → ${r.levels?.[v.to]?.[v.axis === 'loss' ? 'lossSamples' : 'segmentCap'] ?? v.to}`, `${num(v.relativeL * 100, 2)}%`, `${num(v.relativeRac * 100, 2)}%`, `${num(v.maxCurrentPhasorChange * 100, 2)}%`,
    ])));
    convergence.output.append(el('p', { class: 'hint', text: r.convergedNumerically ? 'The tested resolutions satisfy the numerical threshold. Physical accuracy remains unvalidated.' : 'The tested estimates have not converged at the selected threshold. Refine the path and field sampling separately.' }));
    warnings(convergence.output, r.limitations);
    if (r.axes) convergence.output.append(specTable(Object.entries(r.axes).map(([key, axis]) => [`${key === 'source' ? 'Source resolution' : 'Loss sampling'} stability`, axis.convergedNumerically ? 'Within tested threshold' : 'Needs refinement'])));
  }

  const comparison = taskPanel('compare', 'Compare an untransposed reference', 'Compare reference winding', () => ({ segmentCap: 48 }), form => {
    form.append(el('p', { class: 'hint', text: 'Compares against sixteen untransposed parallel strands. The result lists matched and unmatched constraints so differences in copper or envelope are visible.' }));
  });
  if (comparison.result) {
    const r = comparison.result;
    comparison.output.append(table(['Constraint', 'Braided', 'Reference', 'Match'], (r.constraints || []).map(v => [v.label || v.key, v.braid, v.reference, v.matched ? 'Yes' : 'No'])));
    comparison.output.append(el('p', { class: 'hint', text: 'Braided winding' })); metrics(comparison.output, r.braid?.metrics);
    comparison.output.append(el('p', { class: 'hint', text: 'Untransposed reference' })); metrics(comparison.output, r.reference?.metrics);
    warnings(comparison.output, r.warnings);
    warnings(comparison.output, (r.constraints || []).filter(v => v.note).map(v => v.note));
    if (r.ordinary) {
      comparison.output.append(el('p', { class: 'hint', text: 'Conventional four-layer parallel spiral' }));
      metrics(comparison.output, r.ordinary.metrics);
      comparison.output.append(table(['Constraint', 'Braided', 'Conventional', 'Match'], (r.ordinary.constraints || []).map(v => [v.label || v.key, v.braid, v.reference, v.matched ? 'Yes' : 'No'])));
      warnings(comparison.output, r.ordinary.warnings);
    }
  }

  const search = taskPanel('search', 'Bounded design search', 'Search feasible candidates', v => ({
    maxEvaluations: 12, maxModelEvaluations: v.target.value.trim() ? 2 : 0,
    turns: list(v.turns, 'Turns'), widths: list(v.widths, 'Widths'), pitches: list(v.pitches, 'Turn spacings'), stepAngles: list(v.steps, 'Step angles'),
    maxVias: optionalNumber(v.vias, 'Via budget'), maxDiameter: optionalNumber(v.diameter, 'Maximum diameter'), minBore: optionalNumber(v.bore, 'Minimum bore'),
    targetL: optionalNumber(v.target, 'Target L', 1e-6), errorPct: 10,
  }), form => {
    form.append(el('p', { class: 'hint', text: 'At most twelve geometry checks and two inductance solves. Candidates rank by DC resistance and via burden; Q is not an optimization objective. Apply a candidate to rerun the full checks.' }));
    if (!cfg.litzOutline) form.append(el('button', { type: 'button', class: 'btn small', text: 'Add an outline for fabrication checks', onclick: () => api.onApply?.({ litzOutline: true }) }));
    return { turns: field(form, 'Search turn counts', String(cfg.turns)), widths: field(form, 'Search strand widths (mm)', String(cfg.traceW)),
      pitches: field(form, 'Search turn spacings (mm)', `${cfg.litzTurnSpacing}, ${Number(cfg.litzTurnSpacing) + .5}`),
      steps: field(form, 'Search transposition angles (degrees)', '30'), vias: field(form, 'Search maximum vias', '1000'),
      diameter: field(form, 'Search maximum copper diameter (mm)', cfg.litzSizeMode === 'finished' ? cfg.litzTargetOuter : ''),
      bore: field(form, 'Search minimum bore (mm)', cfg.litzSizeMode === 'finished' ? cfg.litzMinBore : ''),
      target: field(form, 'Search target inductance (µH, optional)', ''),
    };
  });
  if (search.result) {
    const r = search.result;
    search.output.append(el('p', { class: 'hint', text: `${r.evaluated || 0} evaluated · ${r.pruned || 0} pruned · ${Array.isArray(r.rejected) ? r.rejected.length : r.rejected || 0} rejected${r.cancelled ? ' · canceled' : ''}. ${r.ranking || 'Ranked by supported geometry and DC metrics.'}` }));
    for (const [index, candidate] of (r.candidates || []).entries()) {
      const m = candidate.metrics || {}, card = el('div', { class: 'litz-candidate' });
      card.append(specTable([[`Candidate ${index + 1}`, `${candidate.config.turns} turns · ${candidate.config.traceW} mm trace · ${candidate.config.litzStepDeg}°`],
        ['Rdc / vias', `${eng(m.Rdc, 'Ω', 3)} / ${m.viaCount ?? '—'}`], ['Copper outer / bore', `${num(m.outerDiameterMM, 2)} / ${num(m.innerDiameterMM, 2)} mm`],
        ...(m.boardDiameterMM == null ? [] : [['Board diameter / edge clearance', `${num(m.boardDiameterMM, 2)} / ${num(m.edgeClearanceMM, 2)} mm`]]),
        ...(m.L == null ? [] : [['Estimated L', eng(m.L, 'H', 3)]]),
        ...(candidate.targetAssessed ? [['Estimated inductance target', `${candidate.targetMet ? 'Within' : 'Outside'} requested tolerance · ${num(100 * m.targetError, 2)}% error`]] : []),
      ]), el('button', { type: 'button', class: 'btn small', text: `Apply candidate ${index + 1}`, onclick: () => api.onApply?.(candidate.config) }));
      warnings(card, candidate.issues);
      search.output.append(card);
    }
    if (!r.candidates?.length) search.output.append(el('p', { class: 'hint', text: 'No candidate passed the selected geometry and fabrication rules. Adjust the dimensions, outline or screening assumptions; no design was applied.' }));
    warnings(search.output, r.limits ? [typeof r.limits === 'string' ? r.limits : JSON.stringify(r.limits)] : []);
    warnings(search.output, r.warnings);
    if (Array.isArray(r.rejected)) warnings(search.output, r.rejected.slice(0, 6).flatMap(v => v.issues || []));
  }

  const manufacturing = taskPanel('manufacturing', 'Native checks and fabrication package', 'Run KiCad checks and package', () => ({}), form => {
    form.append(el('p', { class: 'hint', text: 'Selected generic rules must pass before running the installed KiCad CLI. Native DRC must then pass before Gerber and drill generation. Missing software or failed checks are reported; a review ZIP can still preserve the available report.' }));
  });
  const fab = res.manufacturing;
  if (fab) {
    const s = fab.summary || {};
    manufacturing.output.append(specTable([['Screening', fab.ok ? 'Passed selected generic rules' : 'Changes required'],
      ['Minimum checked clearance', `${num(s.checkedClearanceMM, 3)} mm`], ['Finished annulus estimate', `${num(s.minAnnulusMM, 3)} mm`],
      ['Maximum drill aspect ratio', num(s.maxAspectRatio, 3)], ['Via plating', `${num(s.platingUM, 1)} µm`],
    ]));
    manufacturing.output.append(table(['Via pair', 'Count', 'Max aspect'], (fab.viaPairs || []).map(v => [v.pair, v.count, num(v.maxAspectRatio, 3)])));
    warnings(manufacturing.output, fab.errors); warnings(manufacturing.output, fab.warnings);
  }
  if (manufacturing.result) {
    const native = manufacturing.result;
    manufacturing.output.append(el('p', { role: 'status', text: `Native KiCad: ${native.status || 'unknown'}${native.available === false ? ' · CLI unavailable' : ''}` }),
      el('p', { class: 'hint', text: native.message || '' }));
    manufacturing.output.append(table(['Native operation', 'Status', 'Details'], Object.entries(native.checks || {}).map(([name, check]) => [
      name, check.status || (check.ok ? 'passed' : 'failed'), check.error || (check.counts ? Object.entries(check.counts).map(([key, count]) => `${key}: ${count}`).join(', ') : `Exit code ${check.exitCode ?? '—'}`),
    ])));
    for (const file of native.files || []) {
      const button = el('button', { type: 'button', class: 'btn small', text: `Download ${file.name}` });
      button.disabled = !api.onDownload;
      button.addEventListener('click', async () => {
        try { await api.onDownload(file); }
        catch (error) { manufacturing.output.append(el('p', { role: 'alert', class: 'hint', text: error.message })); }
      });
      manufacturing.output.append(button);
    }
  }

  const measurement = el('details', { class: 'litz-tool', open: results.measurements?.status === 'done' });
  measurement.append(el('summary', { text: 'Measured impedance and model residuals' }));
  const measureForm = el('div', { class: 'tools-form' });
  const previousOptions = cfg.litzMeasurementOptions || {}, savedMeasure = cfg.litzStudySettings?.measurements || {};
  const plane = choice(measureForm, 'Measurement reference plane', [['unspecified', 'Unspecified / fixture included'], ['coil-terminals', 'De-embedded coil terminals'], ['other', 'Different reference plane']], savedMeasure.referencePlane || previousOptions.referencePlane || cfg.measurement?.referencePlane || 'unspecified');
  const interpolation = choice(measureForm, 'Measurement interpolation', [['linear', 'Linear frequency'], ['log', 'Log frequency']], savedMeasure.interpolation || previousOptions.interpolation || 'log');
  const measureOptions = () => ({ frequency: cfg.freq, referencePlane: plane.value, modelReferencePlane: 'coil-terminals', interpolation: interpolation.value });
  const recalculate = () => {
    api.onSettings?.('measurements', { referencePlane: plane.value, interpolation: interpolation.value });
    if (cfg.measurement) api.onMeasure?.(cfg.measurement, measureOptions());
  };
  plane.addEventListener('change', recalculate); interpolation.addEventListener('change', recalculate);
  const upload = el('input', { type: 'file', accept: '.csv,.tsv,.s1p,.s2p', 'aria-label': 'Import Litz impedance measurement' });
  const measureStatus = el('p', { class: 'hint', role: 'status' });
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Measurement files must be smaller than 8 MB.');
      const data = parseMeasurement(await file.text(), file.name);
      if (!api.onMeasure) throw new Error('Measurement analysis is unavailable in this view.');
      api.onMeasure(data, measureOptions());
      measureStatus.textContent = `${file.name} imported.`;
    } catch (error) { measureStatus.textContent = error.message; }
  });
  measureForm.append(upload, measureStatus);
  if (cfg.measurement) measureForm.append(el('button', { type: 'button', class: 'btn small', text: 'Recalculate imported measurement', onclick: recalculate }));
  measurement.append(measureForm,
    el('p', { class: 'hint', text: 'R, L and Q require complex impedance. Magnitude-only data does not supply phase. Residuals are withheld unless the measurement and model reference planes agree.' }));
  const measured = results.measurements;
  if (measured?.status === 'error') measurement.append(el('p', { role: 'alert', class: 'hint', text: measured.error }));
  if (measured?.result) measurementResult(measurement, measured.result);
  host.append(measurement);
  return host;
}
