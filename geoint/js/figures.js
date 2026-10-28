// GEOINT & IMINT Dashboard: inline SVG figures for the guides (integration patterns and two explainers).
// Pure string builders. Colours come from CSS classes written against the PRP tokens (geoint.css), so the figures follow
// light and dark without redrawing. Each pipeline renders twice: a wide layout and a stacked one for phones (CSS picks).

import { esc } from './util.js';

let uid = 0;
const wrap = (text, max) => {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
};
const tspans = (lines, x, lh) => lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join('');
const marker = id => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="gf-head"/></marker></defs>`;

/**
 * A left-to-right process: steps [{ t: title, s: detail, key?: true }], optional inputs [{ to: index, t }]
 * feeding a step from below, and an optional loop { from, to, t } drawn back underneath.
 */
export function pipeline({ steps, inputs = [], loop = null, label }) {
  const id = `gfa${++uid}`;
  const n = steps.length, W = 960, pad = 14, gap = 30;
  const bw = (W - pad * 2 - gap * (n - 1)) / n, top = 18;
  // Character widths for wrapping: titles 15 px semibold, details 13.5 px (geoint.css .gf-t, .gf-s).
  const tMax = Math.max(8, Math.floor(bw / 9)), sMax = Math.max(10, Math.floor(bw / 7.3));
  const laid = steps.map(st => ({ ...st, tl: wrap(st.t, tMax), sl: wrap(st.s || '', sMax) }));
  const bh = Math.max(...laid.map(st => 48 + st.tl.length * 18 + st.sl.length * 17)) + 6;
  const hasIn = inputs.length > 0, inY = top + bh + 40;
  const loopY = (hasIn ? inY + 46 : top + bh + 30);
  const H = (loop ? loopY + 28 : hasIn ? inY + 40 : top + bh + 14);
  const x = i => pad + i * (bw + gap);
  // Where a step has both an input and an end of the loop, the input moves right and the loop left, so they never cross.
  const loopEnds = new Set(loop ? [loop.from, loop.to] : []), inputAt = new Set(inputs.map(p => p.to));
  const inX = i => x(i) + bw * (loopEnds.has(i) ? 0.68 : 0.5), loopX = i => x(i) + bw * (inputAt.has(i) ? 0.3 : 0.5);
  let svg = `<svg class="gf gf-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || steps.map(s => s.t).join(', then '))}">${marker(id)}`;
  laid.forEach((st, i) => {
    const X = x(i);
    svg += `<g class="gf-step${st.key ? ' key' : ''}"><rect class="gf-box" x="${X}" y="${top}" width="${bw}" height="${bh}" rx="8"/>`;
    svg += `<circle class="gf-num" cx="${X + 20}" cy="${top + 20}" r="11"/><text class="gf-num-t" x="${X + 20}" y="${top + 24.5}" text-anchor="middle">${i + 1}</text>`;
    svg += `<text class="gf-t" x="${X + 12}" y="${top + 56}">${tspans(st.tl, X + 12, 18)}</text>`;
    svg += `<text class="gf-s" x="${X + 12}" y="${top + 61 + st.tl.length * 18}">${tspans(st.sl, X + 12, 17)}</text></g>`;
    if (i < n - 1) svg += `<line class="gf-arrow" x1="${X + bw + 3}" y1="${top + bh / 2}" x2="${X + bw + gap - 3}" y2="${top + bh / 2}" marker-end="url(#${id})"/>`;
  });
  inputs.forEach(inp => {
    const cx = inX(inp.to), cw = Math.min(bw + gap - 10, 20 + inp.t.length * 7.2);
    svg += `<rect class="gf-in" x="${cx - cw / 2}" y="${inY}" width="${cw}" height="27" rx="13.5"/><text class="gf-in-t" x="${cx}" y="${inY + 18}" text-anchor="middle">${esc(inp.t)}</text>`;
    svg += `<line class="gf-arrow thin" x1="${cx}" y1="${inY - 3}" x2="${cx}" y2="${top + bh + 4}" marker-end="url(#${id})"/>`;
  });
  if (loop) {
    const a = loopX(loop.from), b = loopX(loop.to), y0 = top + bh;
    svg += `<path class="gf-loop" d="M${a} ${y0 + 3} V${loopY - 8} Q${a} ${loopY} ${a - 8} ${loopY} H${b + 8} Q${b} ${loopY} ${b} ${loopY - 8} V${y0 + 5}" marker-end="url(#${id})"/>`;
    svg += `<text class="gf-loop-t" x="${(a + b) / 2}" y="${loopY + 19}" text-anchor="middle">${esc(loop.t)}</text>`;
  }
  svg += '</svg>';
  return svg + stacked({ steps, inputs, loop, label }, id + 'n');
}

function stacked({ steps, inputs, loop, label }, id) {
  const W = 360, bx = loop ? 40 : 14, bw = W - bx - 14, gap = 26;
  let y = 10, svg = '';
  const tops = [];
  steps.forEach((st, i) => {
    const tl = wrap(st.t, 30), sl = wrap(st.s || '', 44), ins = inputs.filter(p => p.to === i).map(p => '+ ' + p.t);
    const h = 30 + tl.length * 17 + sl.length * 15 + ins.length * 16 + 8;
    tops.push([y, h]);
    svg += `<g class="gf-step${st.key ? ' key' : ''}"><rect class="gf-box" x="${bx}" y="${y}" width="${bw}" height="${h}" rx="8"/>`;
    svg += `<circle class="gf-num" cx="${bx + 18}" cy="${y + 18}" r="10"/><text class="gf-num-t" x="${bx + 18}" y="${y + 22}" text-anchor="middle">${i + 1}</text>`;
    svg += `<text class="gf-t" x="${bx + 36}" y="${y + 23}">${tspans(tl, bx + 36, 17)}</text>`;
    svg += `<text class="gf-s" x="${bx + 36}" y="${y + 27 + tl.length * 17}">${tspans(sl, bx + 36, 15)}</text>`;
    if (ins.length) svg += `<text class="gf-in-t" x="${bx + 36}" y="${y + 27 + tl.length * 17 + sl.length * 15}">${tspans(ins, bx + 36, 16)}</text>`;
    svg += '</g>';
    y += h;
    if (i < steps.length - 1) { svg += `<line class="gf-arrow" x1="${bx + bw / 2}" y1="${y + 3}" x2="${bx + bw / 2}" y2="${y + gap - 3}" marker-end="url(#${id})"/>`; y += gap; }
  });
  if (loop) {
    const [fy, fh] = tops[loop.from], [ty, th] = tops[loop.to];
    const a = fy + fh / 2, b = ty + th / 2;
    svg += `<path class="gf-loop" d="M${bx - 3} ${a} H${bx - 22} V${b} H${bx - 5}" marker-end="url(#${id})"/>`;
    svg += `<text class="gf-loop-t" transform="translate(${bx - 27} ${(a + b) / 2}) rotate(-90)" text-anchor="middle">${esc(loop.t)}</text>`;
  }
  return `<svg class="gf gf-narrow" viewBox="0 0 ${W} ${y + 10}" role="img" aria-label="${esc(label || steps.map(s => s.t).join(', then '))}">${marker(id)}${svg}</svg>`;
}

/* ---------------------------------------------------------------- the figures */
export const FIGURES = {
  'geoint-cycle': () => pipeline({
    label: 'The GEOINT workflow: question, collect, measure, corroborate, report, with a loop back to collect',
    steps: [
      { t: 'Question', s: 'What happened, where and when? What would prove it?' },
      { t: 'Collect', s: 'daily imagery, fires, hazards, OpenStreetMap, street level' },
      { t: 'Measure', s: 'distances, bearings, heights, sun and shadows' },
      { t: 'Corroborate', s: 'three or more independent matches; weigh other explanations', key: true },
      { t: 'Report', s: 'map figure, coordinates, dates, sources, confidence' },
    ],
    loop: { from: 3, to: 1, t: 'no match or new question: collect again' },
  }),
  'drone-pipeline': () => pipeline({
    label: 'Drone survey to map: plan and fly, photos with GNSS tags, WebODM, orthomosaic and elevation model, QGIS',
    steps: [
      { t: 'Plan and fly', s: 'grid flight, 70–80 % forward and 60–70 % side overlap, legal height' },
      { t: 'Photos', s: 'JPEG or RAW with GNSS position in EXIF' },
      { t: 'WebODM', s: 'structure from motion: match, align, densify', key: true },
      { t: 'Orthomosaic + DSM', s: 'GeoTIFF map, surface model, point cloud, 3D mesh' },
      { t: 'QGIS', s: 'measure, compare with satellite imagery, annotate' },
    ],
    inputs: [{ to: 1, t: 'RTK or PPK' }, { to: 2, t: 'Ground control points' }],
  }),
  'satellite-pipeline': () => pipeline({
    label: 'Satellite change detection: catalogue search, download, SNAP or QGIS processing, change detection, report',
    steps: [
      { t: 'Catalogue search', s: 'Copernicus Browser or STAC: place, dates, cloud cover' },
      { t: 'Download', s: 'two scenes, same season and sensor (Sentinel-2 L2A)' },
      { t: 'SNAP or QGIS', s: 'clip, resample, compute index (NDVI, NBR, NDWI)' },
      { t: 'Change detection', s: 'difference, threshold, check against true colour', key: true },
      { t: 'Report', s: 'before/after figure with scale, dates and licence credit' },
    ],
    inputs: [{ to: 2, t: 'Cloud mask' }, { to: 3, t: 'Street-level check' }],
  }),
  'photo-pipeline': () => pipeline({
    label: 'Field photo verification: photo, EXIF read with ExifTool, map, verify, with a loop back to the map when the check fails',
    steps: [
      { t: 'Field photo', s: 'the original file, not a screenshot or a re-share' },
      { t: 'EXIF', s: 'ExifTool: time, time zone, GPS, camera, lens, heading' },
      { t: 'Map', s: 'plot the position and view direction in QGIS or here' },
      { t: 'Verify', s: 'skyline, landmarks, shadows, street level: three matches', key: true },
    ],
    inputs: [{ to: 3, t: 'Sun position' }],
    loop: { from: 3, to: 2, t: 'mismatch: revise the position' },
  }),
  'fov-gsd': fovFigure,
  'rtk': rtkFigure,
};

function fovFigure() {
  const id = `gfa${++uid}`;
  // Pinhole geometry: rays from the sensor's edges cross at the lens and fan out to the footprint on the ground.
  return `<svg class="gf gf-plain" viewBox="0 0 640 330" role="img" aria-label="Camera geometry: sensor width, focal length, height above the ground, field of view and ground footprint">${marker(id)}
  <text class="gf-t" x="320" y="26" text-anchor="middle">Camera</text>
  <rect class="gf-box" x="276" y="36" width="88" height="60" rx="6"/>
  <line class="gf-dim" x1="296" y1="60" x2="344" y2="60"/><line class="gf-arrow thin" x1="348" y1="60" x2="376" y2="60"/><text class="gf-s" x="382" y="64">sensor, width w</text>
  <ellipse class="gf-lens" cx="320" cy="90" rx="12" ry="3.5"/><line class="gf-arrow thin" x1="334" y1="90" x2="376" y2="90"/><text class="gf-s" x="382" y="94">lens</text>
  <line class="gf-arrow thin" x1="262" y1="62" x2="262" y2="88" marker-end="url(#${id})" marker-start="url(#${id})"/><text class="gf-s" x="254" y="80" text-anchor="end">focal length f</text>
  <line class="gf-ray" x1="296" y1="60" x2="464" y2="270"/><line class="gf-ray" x1="344" y1="60" x2="176" y2="270"/>
  <path class="gf-arc" d="M292.5 124.4 A44 44 0 0 0 347.5 124.4"/><text class="gf-s" x="320" y="156" text-anchor="middle">field of view</text>
  <line class="gf-ground" x1="40" y1="270" x2="600" y2="270"/>
  <line class="gf-arrow thin" x1="560" y1="94" x2="560" y2="266" marker-end="url(#${id})" marker-start="url(#${id})"/><text class="gf-s" x="568" y="184">height H</text>
  <line class="gf-arrow thin" x1="180" y1="290" x2="460" y2="290" marker-end="url(#${id})" marker-start="url(#${id})"/><text class="gf-t" x="320" y="316" text-anchor="middle">ground footprint W = H × w ÷ f</text>
  <text class="gf-s" x="40" y="200">FOV = 2 × arctan(w ÷ 2f)</text><text class="gf-s" x="40" y="220">GSD = W ÷ image width in pixels</text>
</svg>`;
}

function rtkFigure() {
  const id = `gfa${++uid}`;
  const sat = (x, y) => `<g class="gf-sat"><rect x="${x - 7}" y="${y - 5}" width="14" height="10" rx="2"/><line x1="${x - 18}" y1="${y}" x2="${x + 18}" y2="${y}"/></g>`;
  const rays = [200, 330, 460].flatMap(x => [`<line class="gf-ray" x1="${x}" y1="38" x2="120" y2="192"/>`, `<line class="gf-ray" x1="${x}" y1="38" x2="500" y2="192"/>`]).join('');
  return `<svg class="gf gf-plain" viewBox="0 0 640 310" role="img" aria-label="RTK: a base station on a known point and a rover see the same satellites; the base sends corrections so the rover knows its position to a few centimetres">${marker(id)}
  ${sat(200, 28)}${sat(330, 28)}${sat(460, 28)}${rays}
  <path class="gf-device" d="M120 196 L98 274 M120 196 L142 274 M120 196 V274"/><circle class="gf-num" cx="120" cy="192" r="9"/>
  <path class="gf-device" d="M500 198 V274 M492 274 H508"/><circle class="gf-num" cx="500" cy="192" r="9"/>
  <path class="gf-loop" d="M132 202 Q 310 262 486 202" marker-end="url(#${id})"/>
  <text class="gf-s" x="310" y="250" text-anchor="middle">corrections (RTCM) by radio,</text>
  <text class="gf-s" x="310" y="266" text-anchor="middle">or by NTRIP over the internet</text>
  <line class="gf-ground" x1="40" y1="276" x2="600" y2="276"/>
  <text class="gf-t" x="120" y="300" text-anchor="middle">Base on a known point</text>
  <text class="gf-t" x="500" y="300" text-anchor="middle">Rover (pole or drone)</text>
</svg>`;
}
