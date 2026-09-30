/* A vector cover built from the current geometry engine, not an app screenshot. */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exportSvg } from '../web/js/engine/exporters.js';
import { corePresetPatch } from '../web/js/engine/transformer-cores.js';
import * as inductor from '../web/js/ws/inductor.js';
import * as transformer from '../web/js/ws/transformer.js';
import * as motor from '../web/js/ws/motor.js';
import * as filter from '../web/js/ws/filter.js';
import * as antenna from '../web/js/ws/antenna.js';

const designs = [
  ['Inductors', 'Shape the winding', inductor, { layers: 1, turns: 12, dOuter: 26 }],
  ['Transformers', 'Build the stack', transformer, { ...corePresetPatch('eelp32'), primaryTurns: 4 }],
  ['PCB motors', 'Design for motion', motor, {}],
  ['Filters', 'Tune the response', filter, { family: 'hairpin' }],
  ['Antennas', 'Explore RF geometry', antenna, { family: 'patch-array' }],
];
const colors = { 'F.Cu': '#ffae75', 'B.Cu': '#68a7ed', 'In1.Cu': '#83cdac', 'In2.Cu': '#b995ef' };
const cards = designs.map(([title, subtitle, ws, patch], i) => {
  const result = ws.compute({ ...ws.defaults(), ...patch }, { board: null, name: title, net: 'PREVIEW' });
  const art = { ...result.art, labels: [] };
  const drawing = exportSvg(art, { name: title, background: 'none', margin: 1, colors });
  const viewBox = drawing.match(/viewBox="([^"]+)"/)[1];
  const body = drawing.slice(drawing.indexOf('>') + 1, drawing.lastIndexOf('</svg>'))
    .replace(/id="([^"]+)"/g, `id="preview-${i}-$1"`);
  const x = 34 + i * 218;
  return `<g transform="translate(${x} 145)">
  <rect width="204" height="246" rx="15" fill="url(#card)" stroke="#2c3b50"/>
  <path d="M18 0H186" stroke="${i % 2 ? '#73adee' : '#ffae75'}" stroke-width="2"/>
  <text x="16" y="29" class="index">0${i + 1}</text>
  <svg x="12" y="42" width="180" height="139" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${body}</svg>
  <text x="16" y="210" class="label">${title}</text>
  <text x="16" y="232" class="caption">${subtitle}</text>
  </g>`;
}).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="442" viewBox="0 0 1140 442" role="img" aria-labelledby="title desc">
<title id="title">Planar Studio — five workspaces for PCB geometry</title>
<desc id="desc">Current-engine previews of an inductor, ferrite transformer, rotary motor, hairpin filter and patch antenna array. These are geometry illustrations; the gallery contains real application screenshots.</desc>
<defs>
  <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0c1421"/><stop offset="1" stop-color="#15263d"/></linearGradient>
  <linearGradient id="card" x2="0" y2="1"><stop stop-color="#17263a"/><stop offset="1" stop-color="#101b2b"/></linearGradient>
  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#6f9fcc" stroke-opacity=".06"/></pattern>
</defs>
<style>text{font-family:Segoe UI,Arial,sans-serif}.index{font-size:12px;letter-spacing:2px;fill:#7d9cbf}.label{font-size:19px;font-weight:600;fill:#f0f5fc}.caption{font-size:12px;fill:#a5b8d0}</style>
<rect width="1140" height="442" rx="20" fill="url(#bg)"/>
<rect width="1140" height="442" rx="20" fill="url(#grid)"/>
<text x="34" y="39" fill="#ffae75" font-size="13" font-weight="600" letter-spacing="3">PLANAR STUDIO</text>
<text x="32" y="91" fill="#f2f6fc" font-size="39" font-weight="650">Five workspaces. One PCB.</text>
<text x="34" y="119" fill="#a8bed8" font-size="16">Magnetics, motion and RF — designed in KiCad.</text>
${cards}
<text x="34" y="420" class="caption">Generated PCB geometry · Current application screenshots below</text>
<text x="1106" y="420" class="caption" text-anchor="end">EDIT · ANALYZE · EXPORT</text>
</svg>\n`;
await writeFile(fileURLToPath(new URL('../docs/feature-overview.svg', import.meta.url)), svg);
console.log('Updated docs/feature-overview.svg from all five workspace engines.');
