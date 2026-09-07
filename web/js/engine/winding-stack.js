import { layerNames, OZ_MM } from './coil.js';
export const tokens = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean);
export function windingSetup(c, board) {
  const plan = c.family === 'aircore' || !c.family ? ['P', 'S'] : tokens(c.stackPlan);
  const inner = tokens(c.family === 'aircore' || !c.family ? '' : c.copperLayers).filter(n => /^In\d+\.Cu$/.test(n)).map(n => Number(n.match(/\d+/)[0]) + 2);
  const count = Math.max(2, plan.length, ...inner), required = count + count % 2;
  const available = board?.copperLayers?.length || board?.layerCount || null;
  return { plan, required, available, insufficient: available != null && available < required };
}
export function resolveStack(c, board, count) {
  const explicit = tokens(c.copperLayers);
  const boardNames = board?.copperLayers?.length ? board.copperLayers.map(l => l.name) : board?.layerCount ? layerNames(board.layerCount) : null;
  if (boardNames && boardNames.length < count) throw new Error(`This winding assignment needs ${count} copper layers; the board has ${boardNames.length}.`);
  const defaultCount = count + count % 2;
  const available = boardNames || layerNames(defaultCount);
  const layers = explicit.length ? explicit : [...available.slice(0, count - 1), available.at(-1)];
  const ordinal = name => name === 'F.Cu' ? 0 : name === 'B.Cu' ? 31 : /^In([1-9]|[12][0-9]|30)\.Cu$/.test(name) ? Number(name.match(/\d+/)[0]) : -1;
  if (layers.length !== count || new Set(layers).size !== count || layers.some((n, i) => ordinal(n) < 0 || (i > 0 && ordinal(n) <= ordinal(layers[i - 1])))) throw new Error('Copper layers must be unique canonical names in front-to-back order, one per winding assignment.');
  if (boardNames && layers.some(n => !boardNames.includes(n))) throw new Error('Selected copper layer does not exist on the open board.');
  const needed = Math.max(defaultCount, ...layers.filter(n => n.startsWith('In')).map(n => Number(n.match(/\d+/)[0]) + 2));
  const fullLayers = boardNames || layerNames(needed + needed % 2);
  let z;
  if (tokens(c.layerPositions).length) {
    z = tokens(c.layerPositions).map(Number);
    if (z.length !== count || z.some((v, i) => !Number.isFinite(v) || v < 0 || v > c.boardT || (i > 0 && v - z[i - 1] < c.copperOz * OZ_MM + 0.01))) throw new Error('Enter increasing copper center heights in mm within board thickness, one per assigned layer, with dielectric clearance.');
  } else {
    z = layers.map(n => fullLayers.indexOf(n) / (fullLayers.length - 1) * c.boardT);
    if (z.some((v, i) => !Number.isFinite(v) || v < 0 || (i > 0 && v - z[i - 1] < c.copperOz * OZ_MM + 0.01))) throw new Error('Layer separation is too small for the selected copper thickness.');
  }
  return { layers, z, fullLayers, assumedZ: !tokens(c.layerPositions).length };
}

