/* Independent design choices. "auto" preserves 1.1–1.3 saved family behavior. */
export function transformerMode(c) {
  const magnetic = c.magneticModel && c.magneticModel !== 'auto' ? c.magneticModel : c.family === 'ferrite' ? 'ferrite' : 'air';
  const topology = c.windingTopology && c.windingTopology !== 'auto' ? c.windingTopology : c.family === 'multi-secondary' ? 'multiple' : c.family === 'center-tapped' ? 'tapped' : 'standard';
  return { magnetic, topology, surface: (!c.family || c.family === 'aircore') && magnetic === 'air' && topology === 'standard' && !c.routedWindings };
}
export function windingSettings(c, name) {
  const settings = c.windingOptions?.[name] || {};
  return { width: settings.width ?? c.traceW, connection: settings.connection || 'series' };
}
export function windingTurns(c, name, count) {
  const turns = name === 'P' ? c.primaryTurns : name === 'S' ? c.secondaryTurns : c[`secondary${name.slice(1)}Turns`];
  return turns * (windingSettings(c, name).connection === 'parallel' ? 1 : count);
}
export function transformerName(c) {
  const m = transformerMode(c);
  return `${m.magnetic === 'ferrite' ? 'Ferrite' : 'Air-core'} · ${m.topology === 'multiple-tapped' ? 'multiple secondaries + center tap' : m.topology === 'multiple' ? 'multiple secondaries' : m.topology === 'tapped' ? 'center-tapped' : 'two windings'}`;
}
export const designDefaults = () => ({
  magneticModel: 'auto', windingTopology: 'auto', routedWindings: false, windingOptions: {},
  leakageModel: 'supplied', measuredLeakage: 1e-6, lossModel: 'dc', capacitanceModel: 'estimate',
  dielectricEr: 4.2, measuredCapacitance: 20e-12, corePreset: 'custom', coreLossModel: 'density',
  steinmetzK: 1, steinmetzAlpha: 1.3, steinmetzBeta: 2.5, coreTemperature: 100,
  thermalResistance: 0, ambientTemperature: 25,
  sweepMin: 1000, sweepMax: 1000000, sweepPoints: 41, loadSweepMin: 1, loadSweepMax: 1000,
  candidates: [], requirements: { voltage: 12, outputVoltage: 6, outputCurrent: 0.1, frequency: 100000, diameter: 50, layers: 4, voltageTolerance: 10 },
});
