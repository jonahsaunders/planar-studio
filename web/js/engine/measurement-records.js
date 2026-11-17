import { clone, fingerprint, recordId } from './transformer-project.js';
import { parseMeasurement } from './measurements.js';

const recordKeys = ['measurement', 'measurementFit', 'measurementRecords', 'activeMeasurementId'];

export function measurementConfiguration(config) {
  const snapshot = { ...config };
  for (const key of [...recordKeys, 'tools', 'placementOrigin', 'placementRotation', 'placementGrid', 'placementNets']) {
    delete snapshot[key];
  }
  return clone(snapshot);
}

export const measurementSignature = config => fingerprint(measurementConfiguration(config));
export const hasStaleFit = (cfg, effective = cfg) => {
  const fit = cfg.measurementFit;
  return !!fit?.signature && (fit.recordId !== (cfg.activeMeasurementId ?? null) ||
    fit.signature !== measurementSignature(effective));
};

export function makeMeasurementRecord(kind, configuration, data, conditions, baseline = null) {
  if (!['inductor', 'filter'].includes(kind)) throw new Error('Measurement records support inductors and filters.');
  const config = configuration && measurementConfiguration(configuration);
  return { id: recordId(), kind, data, conditions: { ...conditions }, configuration: config,
    signature: config ? fingerprint(config) : null, baseline: baseline ? clone(baseline) : null };
}

export const COUPON_BOARD_SHA = '91519936c748e795dc0844d2524060a7ee0703b903bb9f9057e16fc1df8bcabf';
export const COUPONS = {
  boardThicknessMm: 1.6, relativePermittivity: 4.4, copperOunces: 1,
  coupons: {
    A: { role: 'development', center: [23, 22], turns: 6, traceW: 0.75, traceS: 0.70 },
    B: { role: 'held-out', center: [71, 22], turns: 9, traceW: 0.40, traceS: 0.45 },
  },
};

export function couponConfiguration(id, defaults) {
  if (!Object.hasOwn(COUPONS.coupons, id)) throw new Error('Choose coupon A or B.');
  const { traceW, traceS, turns } = COUPONS.coupons[id];
  return {
    ...defaults, shape: 'polygon', sides: 4, layers: 1,
    dOuter: (28 - traceW) / Math.cos(Math.PI / 4), fillet: 1,
    traceW, traceS, turns, padDrill: 0, padSize: 1.6, cExtra: 0,
    boardT: COUPONS.boardThicknessMm, epsR: COUPONS.relativePermittivity,
    copperOz: COUPONS.copperOunces, tolerance: 0.004,
  };
}

export function readCouponMeasurement(manifest, sweep, filename, defaults) {
  const fields = ['sampleId', 'measuredOn', 'instrument', 'calibration', 'referencePlane', 'stackup', 'impedanceFile'];
  if (manifest.boardSHA256 !== COUPON_BOARD_SHA || !Object.hasOwn(COUPONS.coupons, manifest.coupon)) {
    throw new Error('Coupon record does not match the published impedance board revision.');
  }
  for (const key of fields) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) throw new Error(`Enter ${key} in the coupon record.`);
  }
  if (filename !== manifest.impedanceFile.split(/[\\/]/).at(-1)) {
    throw new Error('Select the sweep file named in the coupon record.');
  }
  const data = parseMeasurement(sweep, filename);
  if (data.ports === 2 || data.rows.some(row => !Number.isFinite(row.zRe) || !Number.isFinite(row.zIm))) {
    throw new Error('Coupon records need complex impedance in a one-port sweep or an R/X CSV.');
  }
  return {
    data, configuration: couponConfiguration(manifest.coupon, defaults),
    conditions: { ...Object.fromEntries(fields.map(key => [key, manifest[key]])),
      prototype: manifest.sampleId, fixture: manifest.calibration, coupon: manifest.coupon,
      boardSHA256: manifest.boardSHA256, role: COUPONS.coupons[manifest.coupon].role },
  };
}
