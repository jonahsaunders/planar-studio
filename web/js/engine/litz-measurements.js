/* Complex impedance measurements at an explicitly identified reference plane.
   Interpolate R and X first; derived L and Q are never interpolated directly. */
const finite = Number.isFinite;

function metrics(row) {
  const f = row?.f, re = row?.zRe ?? row?.Zr, im = row?.zIm ?? row?.Zi;
  const validFrequency = finite(f) && f > 0, complex = finite(re) && finite(im);
  const passive = complex && re >= 0, inductive = passive && im > 0;
  const issues = [];
  if (!validFrequency) issues.push('invalid-frequency');
  if (!complex) issues.push('complex-impedance-required');
  if (complex && re < 0) issues.push('negative-resistance');
  if (complex && im <= 0) issues.push('noninductive');
  if (complex && re === 0) issues.push('zero-resistance');
  return { f: finite(f) ? f : null, zRe: complex ? re : null, zIm: complex ? im : null,
    Z: complex && validFrequency ? Math.hypot(re, im) : null,
    R: validFrequency && passive ? re : null,
    L: validFrequency && inductive ? im / (2 * Math.PI * f) : null,
    Q: validFrequency && inductive && re > 0 ? im / re : null,
    validInductor: validFrequency && inductive && re > 0, issues };
}

function atFrequency(rows, f, interpolation) {
  if (!finite(f) || f <= 0 || !rows.length) return null;
  const points = rows.filter(r => finite(r.f) && r.f > 0).slice().sort((a, b) => a.f - b.f);
  if (!points.length || f < points[0].f || f > points.at(-1).f || points.some((p, i) => i && p.f === points[i - 1].f)) return null;
  const exact = points.find(p => p.f === f);
  if (exact) return metrics(exact);
  const hi = points.findIndex(p => p.f > f), a = metrics(points[hi - 1]), b = metrics(points[hi]);
  if (![a.zRe, a.zIm, b.zRe, b.zIm].every(finite)) return metrics({ f });
  const scale = interpolation === 'log' ? Math.log : x => x;
  const t = (scale(f) - scale(a.f)) / (scale(b.f) - scale(a.f));
  return metrics({ f, zRe: a.zRe + t * (b.zRe - a.zRe), zIm: a.zIm + t * (b.zIm - a.zIm) });
}

export function litzMeasurementMetrics(data, opt = {}) {
  if (!Array.isArray(data?.rows)) throw new Error('PCB Litz measurements require parsed measurement rows.');
  const interpolation = opt.interpolation || 'linear';
  if (!['linear', 'log'].includes(interpolation)) throw new Error('Choose linear or log frequency interpolation.');
  const referencePlane = opt.referencePlane || null, modelReferencePlane = opt.modelReferencePlane || null;
  const frequency = opt.frequency, points = data.rows.map(metrics);
  const measured = atFrequency(data.rows, frequency, interpolation), warnings = [];
  if (points.some(p => p.issues.length)) warnings.push('Some measurement points cannot provide a passive inductive R/L/Q value; unavailable metrics remain blank.');
  if (!referencePlane) warnings.push('Measurement reference plane is unspecified. Identify or de-embed the fixture before comparing with a coil-terminal model.');
  if (data.ports === 2) warnings.push('S2P-derived impedance is the input impedance with the other port terminated in the measurement reference impedance; it is not automatically the isolated coil impedance.');
  const modelAnalysis = opt.model?.analysis || opt.model;
  const rows = Array.isArray(opt.model) ? opt.model : opt.model?.sweep || opt.model?.rows || opt.model?.curve || (modelAnalysis ? [modelAnalysis] : []);
  const predicted = atFrequency(rows, frequency, interpolation);
  const matchedPlane = !!referencePlane && referencePlane === modelReferencePlane;
  if (opt.model && !matchedPlane) warnings.push('Residuals are unavailable until measured and modeled reference planes are explicitly matched.');
  if (finite(frequency) && !measured) warnings.push('The selected frequency is outside the valid measurement range or the sweep has duplicate frequencies; no extrapolation is performed.');
  let residuals = null;
  if (measured && predicted && matchedPlane) {
    residuals = Object.fromEntries(['R', 'L', 'Q'].map(key => {
      const a = measured[key], b = predicted[key];
      return [key, { absolute: finite(a) && finite(b) ? b - a : null, relative: finite(a) && finite(b) && a !== 0 ? (b - a) / a : null }];
    }));
  }
  return { points, atFrequency: measured, predicted, residuals, warnings,
    scope: { referencePlane, modelReferencePlane, matchedPlane, frequency: finite(frequency) ? frequency : null,
      interpolation, complexInterpolation: 'R and X before L and Q', extrapolated: false,
      residualConvention: 'Model minus measured; relative residual divided by measured value',
      modelStatus: 'Residuals compare data with an unvalidated model; they do not establish model validity.' } };
}
