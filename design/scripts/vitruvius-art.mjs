// Vitruvius, VM's mascot, for the web: takes the chosen pictures (PNG, as the AI image model made them) from a folder
// and writes design/vitruvius/. Run it again whenever a picture is chosen afresh:
//   node design/scripts/vitruvius-art.mjs <folder holding the PNG files>
// Each picture's plain background is made transparent by a flood from its edges (a pixel joins the background while
// its colour is within TOLERANCE of the background's, which is the median of the edge pixels), so the space inside his
// circle stays: every logo is a light medallion, which reads on light and dark pages alike. The pixels on the cut edge
// are de-matted (their share of the background colour taken out, so no pale halo shows on a dark page). The picture is
// then trimmed to what is left, squared, and written as WebP at 64 and 256 px (each under its weight: WEIGHT; the
// modules' and submodules' logos at 128 px too), with a 512 px copy of the mark (the app icons are rendered from it), a
// 64 px PNG of his head in the hard hat (the favicon, design/brand-vm-icon.svg) and the running frames as one strip
// (the loading figure, design/vm-loading.svg). Nothing is drawn, painted over or moved inside a picture: the program
// only takes the background away, cuts and scales (and, for the running strip, sets each whole figure in its frame).
// The WebP files do not keep the Content Credentials (C2PA) label the AI model put in its PNG files; index.json is the
// record that says each picture was made by AI, and the credits page says so.
// design/vitruvius/index.json lists every picture: its files and sizes, what it shows (the alt text, where one is
// needed) and that an AI model made it. The four logos for the future shell (Politics, History, Military and the
// Master Index) go to design/vitruvius/future/, which nothing on the site shows yet.
// The work is done in a headless Edge canvas (no image library is installed): tests/tools/pages.mjs launch().
// Nothing is fetched from the network.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from '../../tests/tools/pages.mjs';

const ROOT = new URL('../../', import.meta.url);
const OUT = 'design/vitruvius';
export const CREDIT = "Vitruvius, VM's mascot, was drawn by an AI image model (ChatGPT) from VM's own description; no person drew or retouched the pictures. He is a new character, not a copy of Leonardo's drawing.";
export const MADE_BY = 'An AI image model (ChatGPT) drew it from VM\'s own description in words. No person drew or retouched it.';
// The most a file may weigh, in bytes: the quality is lowered until it fits.
export const WEIGHT = { 64: 12000, 128: 20000, 256: 40000, 512: 70000 };
const TOLERANCE = 42; // RGB distance from the background colour that still counts as background
const BAND = 2;       // pixels on the cut edge that are de-matted

const holding = (...things) => `Vitruvius, VM's mascot, holding ${things.join(' and ')}`;
// The pictures chosen on 25 November 2026 (the review's choices; the unusable ones, wave, historical-calendar and
// kardashev, are left out and their submodules keep their glyphs). for: the module (suite) or submodule id it stands for.
export const PICTURES = [
  { id: 'master', kind: 'sheet', file: 'master-2.png', alt: "Vitruvius, VM's mascot: a curly-haired man in an amber tunic, four arms and four legs spread inside a circle and a square" },
  { id: 'mark', kind: 'mark', file: 'mark-1.png', sizes: [64, 256, 512], alt: "Vitruvius in an amber hard hat, arms and legs spread inside a circle: Vitruvian Manager's mark" },
  // His head in the hard hat, cut from the mark (the whole figure does not read at 16 px): x, y, width and height as
  // shares of the picture.
  { id: 'mark-head', kind: 'mark', file: 'mark-1.png', crop: [0.39, 0.075, 0.22, 0.2], sizes: [64, 256], png: [64], alt: "Vitruvius's head in an amber hard hat: Vitruvian Manager's icon" },
  { id: 'runner-side', kind: 'sheet', file: 'runner-side-1.png', alt: 'Vitruvius running to the right' },
  { id: 'runner-wheel', kind: 'sheet', file: 'runner-wheel-1.png', alt: 'Vitruvius running inside a circle' },
  { id: 'runner-frames', kind: 'strip', file: 'runner-frames-1.png', frames: 8, height: 112, alt: 'Vitruvius running to the right, in eight frames' },
  // The modules' marks (registry "mark").
  { id: 'module-home', kind: 'module', for: 'home', file: 'module-home-2.png', alt: holding('an oil lantern', 'a large key') },
  { id: 'module-rt', kind: 'module', for: 'rt', file: 'module-rt-2.png', alt: holding('a brass spyglass', 'a globe on a stand') },
  { id: 'module-hb', kind: 'module', for: 'hb', file: 'module-hb-2.png', alt: holding('a handbell', 'a folded broadsheet') },
  { id: 'module-rs', kind: 'module', for: 'rs', file: 'module-rs-1.png', alt: holding('an hourglass', 'a parchment scroll') },
  { id: 'module-oi', kind: 'module', for: 'oi', file: 'module-oi-2.png', alt: holding('a dark lantern', 'a brass cipher disc') },
  { id: 'module-mm', kind: 'module', for: 'mm', file: 'module-mm-1.png', alt: holding('balance scales', 'an abacus') },
  { id: 'module-ns', kind: 'module', for: 'ns', file: 'module-ns-2.png', alt: holding('an astrolabe', 'a glass alembic') },
  { id: 'module-ds', kind: 'module', for: 'ds', file: 'module-ds-1.png', alt: holding('a slide rule', 'a punched card') },
  { id: 'module-kino', kind: 'module', for: 'kino', file: 'module-kino-1.png', alt: holding('a magic lantern projector', 'a film reel') },
  { id: 'module-bibliotheca', kind: 'module', for: 'bibliotheca', file: 'module-bibliotheca-1.png', alt: holding('an open book', 'a goose quill') },
  // The future shell's four, stored and shown nowhere yet.
  { id: 'future-politics', kind: 'future', for: 'politics', file: 'future-politics-2.png', alt: holding('a voting urn of pebbles', 'a decree with a wax seal') },
  { id: 'future-history', kind: 'future', for: 'history', file: 'future-history-1.png', alt: holding('an hourglass', 'a stone tablet with a chisel') },
  { id: 'future-military', kind: 'future', for: 'military', file: 'future-military-1.png', alt: holding('a crested bronze helmet', 'a round shield and a campaign map') },
  { id: 'future-master-index', kind: 'future', for: 'master-index', file: 'future-master-index-1.png', alt: holding('a card-index drawer', 'a magnifying glass') },
  // The submodules' pictures (registry "art").
  ...[
    ['atlas', 1, ['a rolled world map', 'a pair of dividers']],
    ['battlefield', 2, ['a pair of dividers', 'a spyglass']],
    ['battlefield-history', 1, ['a crested helmet', 'a campaign map']],
    ['briefing', 1, ['a sealed letter', 'a speaking trumpet']],
    ['calendar', 1, ['a sundial', 'a knotted tally cord']],
    ['daily-synopsis', 1, ['a handbell', 'a tied scroll']],
    ['dashboard', 1, ['an oil lantern', 'a framed tablet']],
    ['data-analytics', 1, ['a slide rule', 'knotted cords for counting']],
    ['digital-briefing', 1, ['a telegraph key', 'punched paper tape']],
    ['econ-briefing', 1, ['a hanging balance', 'a thick ledger']],
    ['encyclopedia', 1, ['a leather-bound book', 'a magnifying glass']],
    ['geoint', 1, ["a surveyor's theodolite", 'a map table, each on a tripod']],
    ['headlines', 2, ['a world map', "a herald's trumpet"]],
    ['highbrowse', 1, ['round spectacles', 'a stack of newspapers']],
    ['integration-hub', 1, ["a weaver's shuttle", 'a bound bundle of cords']],
    ['iot-connect', 1, ['a brass telegraph key', 'a coil of wire']],
    ['kino-geopolitical-events', 1, ['a film reel', 'a globe on a stand']],
    ['kino-great-thinkers', 1, ['a film reel', 'an oil lamp']],
    ['kino-political-events', 1, ['a magic lantern projector', "a speaker's scroll"]],
    ['kino-political-figures', 1, ['a film reel', 'a small classical bust']],
    ['kino-political-parties', 1, ['a film reel', 'a plain banner on a pole']],
    ['kino-wars', 1, ['a hand-cranked film camera on a tripod', 'a campaign map']],
    ['learning', 1, ['an abacus', 'a coin purse']],
    ['learning-politics', 1, ['a laurel wreath', 'a wax tablet and stylus']],
    ['markets', 1, ['a ticker machine under a glass dome', 'its paper tape']],
    ['monthly', 1, ["an almanac open at a month's grid", 'an hourglass']],
    ['neo-classic', 1, ['an open book', 'an oil reading lamp']],
    ['omni-map', 1, ['an open compass', 'a rolled sea chart']],
    ['osint', 1, ['a brass spyglass', 'a sheaf of newspaper cuttings']],
    ['osint-training', 1, ['a slate and chalk', 'a magnifying glass']],
    ['pestle', 1, ["a surveyor's measuring chain", 'a ledger']],
    ['progress', 1, ['a toothed gear', 'an Archimedes screw']],
    ['retrospective', 1, ['a globe on a stand', 'an hourglass']],
    ['science-briefing', 1, ['a brass microscope', 'a round flask']],
    ['sigint', 1, ['a signal lamp', 'a pair of semaphore flags']],
    ['traders', 1, ['a hanging balance', 'a notched tally stick']],
    ['volatility', 2, ['a barometer', 'a rooster weathervane']],
    ['war-focus', 1, ['a large magnifying glass', 'a campaign map']],
  ].map(([id, variant, things]) => ({ id: `submodule-${id}`, kind: 'submodule', for: id, file: `submodule-${id}-${variant}.png`, alt: holding(...things) })),
];
export const dirOf = p => (p.kind === 'future' ? `${OUT}/future` : OUT);

/* ---- In the browser: cut, trim, scale, encode ------------------------------------------------------------------- */
const PAGE = String.raw`<!doctype html><meta charset="utf-8"><body><script>
const TOL = ${TOLERANCE}, BAND = ${BAND};
const dist = (d, i, bg) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
// The logos' circle: the outer edge of the dark ring, found along 720 rays from the middle (the outermost dark pixel on
// each), the rays that meet a tool reaching past it left out, and a circle fitted to the rest (least squares). Inside it
// nothing is ever background, so a pale tool that crosses the ring (a map, a broadsheet) cannot let the flood in.
function findRing(img) {
  const { width: W, height: H, data: d } = img, cx0 = W / 2, cy0 = H / 2, max = Math.min(W, H) / 2 - 1, pts = [];
  const dark = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return d[i + 3] > 0 && 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110; };
  for (let k = 0; k < 720; k++) {
    const a = k / 720 * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    for (let r = max; r > max * 0.5; r--) if (dark(cx0 + r * c, cy0 + r * s)) { pts.push([cx0 + r * c, cy0 + r * s, r]); break; }
  }
  if (pts.length < 360) return null;
  const med = pts.map(p => p[2]).sort((a, b) => a - b)[pts.length >> 1];
  const ok = pts.filter(p => Math.abs(p[2] - med) < 0.02 * W);
  // Kasa fit: x² + y² + Dx + Ey + F = 0.
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0; const n = ok.length;
  for (const [x, y] of ok) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [-sxz, -syz, -sz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D0 = det(A); if (!D0) return null;
  const col = j => A.map((row, i) => row.map((v, k) => (k === j ? B[i] : v)));
  const [D, E, F] = [0, 1, 2].map(j => det(col(j)) / D0), cx = -D / 2, cy = -E / 2, r = Math.sqrt(cx * cx + cy * cy - F);
  return Number.isFinite(r) && ok.length >= 300 ? { cx, cy, r, rays: ok.length } : null;
}
// Flood the background from the edges and de-matt the cut edge. Returns the background colour.
function keyOut(img, circle = null) {
  const { width: W, height: H, data: d } = img, edge = [];
  const inside = circle ? (p => { const x = p % W - circle.cx, y = ((p / W) | 0) - circle.cy; return x * x + y * y < (circle.r - 3) ** 2; }) : () => false;
  for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1);
  const med = k => { const v = edge.map(p => d[p * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const state = new Uint8Array(W * H); // 1 background, 2.. the cut edge's rings
  const q = new Int32Array(W * H); let head = 0, tail = 0;
  for (const p of edge) if (!state[p] && dist(d, p * 4, bg) < TOL) { state[p] = 1; q[tail++] = p; }
  while (head < tail) {
    const p = q[head++], x = p % W, y = (p / W) | 0;
    for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (n >= 0 && !state[n] && dist(d, n * 4, bg) < TOL && !inside(n)) { state[n] = 1; q[tail++] = n; }
    }
  }
  for (let p = 0; p < W * H; p++) if (state[p] === 1) d[p * 4 + 3] = 0;
  // The rings of the cut edge, one pixel at a time (8 neighbours).
  let ring = [];
  for (let p = 0; p < W * H; p++) if (state[p] === 1) ring.push(p);
  const band = [];
  for (let r = 0; r < BAND; r++) {
    const next = [];
    for (const p of ring) { const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (!state[n]) { state[n] = 2 + r; next.push(n); }
      } }
    band.push(...next); ring = next;
  }
  // De-matt: the colour the pixel would have without the background showing through, and its true opacity, from the
  // strongest solid colour near it.
  const out = new Uint8ClampedArray(d);
  for (const p of band) {
    const x = p % W, y = (p / W) | 0, i = p * 4;
    let best = -1, bd = -1, alt = -1, ad = -1;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (state[n] === 1) continue;
      const dd = dist(d, n * 4, bg);
      if (state[n] === 0 && dd > bd) { bd = dd; best = n; }
      if (dd > ad) { ad = dd; alt = n; }
    }
    const f = (best >= 0 ? best : alt) * 4;
    const u = [d[f] - bg[0], d[f + 1] - bg[1], d[f + 2] - bg[2]], v = [d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]];
    const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
    let a = uu > 0 ? (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / uu : 1;
    a = Math.max(0, Math.min(1, a));
    if (a < 0.04) { out[i + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) out[i + k] = bg[k] + v[k] / a;
    out[i + 3] = Math.round(a * 255);
  }
  d.set(out);
  return bg;
}
function bbox(img, x0 = 0, x1 = img.width) {
  const { width: W, height: H, data: d } = img; let l = W, t = H, r = -1, b = -1;
  for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] > 12) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  return { l, t, r, b };
}
async function load(src) { const im = new Image(); im.src = src; await im.decode(); return im; }
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function scaled(src, w, h) {
  let cur = src;
  while (cur.width > w * 2 || cur.height > h * 2) {
    const c = canvasOf(Math.max(w, Math.round(cur.width / 2)), Math.max(h, Math.round(cur.height / 2)));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height); cur = c;
  }
  const c = canvasOf(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
  return c;
}
const encode = (c, type, q) => c.toDataURL(type, q).split(',')[1];
function fit(c, limit) {
  for (let q = 0.9; q >= 0.3; q -= 0.04) { const b = encode(c, 'image/webp', q); if (b.length * 3 / 4 <= limit) return { b64: b, q: +q.toFixed(2) }; }
  return { b64: encode(c, 'image/webp', 0.3), q: 0.3 };
}
// One picture: cut and trimmed to a square, at each size.
window.square = async (src, crop, sizes, pngs, limits, ringed) => {
  const im = await load(src);
  const [cx, cy, cw, ch] = crop ? [crop[0] * im.width, crop[1] * im.height, crop[2] * im.width, crop[3] * im.height].map(Math.round) : [0, 0, im.width, im.height];
  const c = canvasOf(cw, ch), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, cx, cy, cw, ch, 0, 0, cw, ch);
  const img = x.getImageData(0, 0, cw, ch), ring = ringed ? findRing(img) : null;
  if (ringed && !ring) throw new Error('no circle found');
  const bg = keyOut(img, ring);
  if (ring) hardenRim(img, ring);
  x.putImageData(img, 0, 0);
  const { l, t, r, b } = bbox(img), side = Math.round(Math.max(r - l + 1, b - t + 1) * 1.02);
  const sq = canvasOf(side, side);
  sq.getContext('2d').drawImage(c, l, t, r - l + 1, b - t + 1, Math.round((side - (r - l + 1)) / 2), Math.round((side - (b - t + 1)) / 2), r - l + 1, b - t + 1);
  const out = {};
  for (const s of sizes) out[s] = fit(scaled(sq, s, s), limits[s]);
  const png = {};
  for (const s of pngs) png[s] = encode(scaled(sq, s, s), 'image/png');
  return { out, png, bg: '#' + bg.map(v => v.toString(16).padStart(2, '0')).join(''), trimmed: side, ring: ring && { r: Math.round(ring.r), rays: ring.rays } };
};
// The logos' cut edge, made hard (after the review of 25 November 2026: a soft pale rim of 1 to 2 px showed outside the
// circle on a dark page). Just outside the ring's outer edge a pale pixel is let go, smoothly over one pixel, so the
// medallion ends on its dark ring; a dark pixel there (a tool's outline reaching past the ring) is kept.
function hardenRim(img, ring) {
  const { width: W, height: H, data: d } = img;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x + 0.5 - ring.cx, y + 0.5 - ring.cy) - ring.r;
    if (r < -0.5 || r > 6) continue;
    const i = (y * W + x) * 4;
    if (!d[i + 3] || 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 120) continue;
    d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, 0.5 - r)));
  }
}
// The running frames, one figure to a frame (after the review of 25 November 2026: cut as equal cells, a hand reaching
// into the next cell left a sliver of it there, and the figures bobbed up and down). Each figure is the set of pieces
// of the drawing (pieces of touching pixels) whose middle lies in its share of the sheet, so nothing of a neighbour
// comes with it; every figure keeps the sheet's own scale, stands on one foot line (the bottom of the frame) and has
// his head at one place across the frame (the middle of his topmost part), so he runs on the spot and does not jitter.
window.strip = async (src, frames, height, limit) => {
  const im = await load(src), c = canvasOf(im.width, im.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const img = x.getImageData(0, 0, im.width, im.height), bg = keyOut(img);
  const { width: W, height: H, data: d } = img, cell = W / frames;
  // The pieces (8 neighbours, a pixel counts once it is more than faintly there).
  const label = new Int32Array(W * H).fill(-1), pieces = [];
  const q = new Int32Array(W * H);
  for (let p0 = 0; p0 < W * H; p0++) {
    if (label[p0] >= 0 || d[p0 * 4 + 3] <= 12) continue;
    const id = pieces.length; let head = 0, tail = 0, sx = 0, n = 0, l = W, r = -1;
    label[p0] = id; q[tail++] = p0;
    while (head < tail) {
      const p = q[head++], px = p % W, py = (p / W) | 0; sx += px; n++; if (px < l) l = px; if (px > r) r = px;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nn = ny * W + nx; if (label[nn] < 0 && d[nn * 4 + 3] > 12) { label[nn] = id; q[tail++] = nn; }
      }
    }
    // A speck of a few pixels belongs to no figure.
    pieces.push({ frame: n < 60 ? -1 : Math.min(frames - 1, Math.floor(sx / n / cell)), n, wide: r - l + 1 });
  }
  // A piece wider than one and a half shares would be two figures joined: the sheet cannot be cut this way.
  if (pieces.some(p => p.wide > 1.5 * cell)) throw new Error('two running figures touch on the sheet');
  // Each figure alone on a canvas the size of the sheet; its box, and the middle of its topmost part (his head).
  const figs = [];
  for (let f = 0; f < frames; f++) {
    const one = new ImageData(W, H), o = one.data; let l = W, t = H, r = -1, b = -1;
    for (let p = 0; p < W * H; p++) if (label[p] >= 0 && pieces[label[p]].frame === f) {
      o.set(d.subarray(p * 4, p * 4 + 4), p * 4);
      const px = p % W, py = (p / W) | 0; if (px < l) l = px; if (px > r) r = px; if (py < t) t = py; if (py > b) b = py;
    }
    let hx = 0, hn = 0; const headTo = t + Math.round((b - t) * 0.12);
    for (let y = t; y <= headTo; y++) for (let xx = l; xx <= r; xx++) if (o[(y * W + xx) * 4 + 3] > 128) { hx += xx; hn++; }
    const k = canvasOf(W, H); k.getContext('2d').putImageData(one, 0, 0);
    figs.push({ k, l, t, r, b, head: hn ? hx / hn : (l + r) / 2 });
  }
  // One frame's size in the sheet's pixels: room for the tallest figure and the furthest reach either side of the head.
  // Clear space round him (in the sheet's pixels, about a third of that in the strip): 4 above and below, 16 at the
  // sides, so no hand or foot comes near the frame's edge.
  const pad = 4, side = 16, fh = Math.max(...figs.map(g => g.b - g.t + 1)) + 2 * pad;
  const back = Math.max(...figs.map(g => g.head - g.l)), front = Math.max(...figs.map(g => g.r - g.head));
  const fwSrc = Math.ceil(back + front) + 2 * side, fw = Math.round(fwSrc * height / fh);
  const s = canvasOf(fw * frames, height), sx = s.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  for (let f = 0; f < frames; f++) {
    const g = figs[f], k = canvasOf(fwSrc, fh);
    // The head at one place; the feet on the bottom line, pad above the frame's foot.
    k.getContext('2d').drawImage(g.k, Math.round(g.head - back - side), g.b + 1 + pad - fh, fwSrc, fh, 0, 0, fwSrc, fh);
    sx.drawImage(scaled(k, fw, height), f * fw, 0);
  }
  return { ...fit(s, limit), frameWidth: fw, height, bg: '#' + bg.map(v => v.toString(16).padStart(2, '0')).join(''), pieces: pieces.filter(p => p.frame >= 0).length };
};
</script>`;

async function main() {
  const src = process.argv[2];
  if (!src || !existsSync(src)) { console.error('Usage: node design/scripts/vitruvius-art.mjs <folder holding the chosen PNG files>'); process.exit(2); }
  const missing = PICTURES.filter(p => !existsSync(join(src, p.file)));
  if (missing.length) { console.error('Missing: ' + missing.map(p => p.file).join(', ')); process.exit(2); }
  for (const d of [OUT, `${OUT}/future`]) mkdirSync(new URL(d + '/', ROOT), { recursive: true });
  const browser = await launch({ args: ['--mute-audio'] });
  const index = { about: CREDIT, madeBy: MADE_BY, model: 'ChatGPT (OpenAI image model)', made: '2026-11-22', processed: 'design/scripts/vitruvius-art.mjs',
    provenance: "The AI model's own PNG files carried a Content Credentials (C2PA) label saying an AI made them; the WebP files here do not keep it, as they are new files cut from those. This file is the machine-readable record that every picture listed was made by AI.",
    pictures: [] };
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    for (const p of PICTURES) {
      const dataUrl = `data:image/png;base64,${readFileSync(join(src, p.file)).toString('base64')}`;
      const dir = dirOf(p), files = {}, bytes = {};
      const write = (name, b64) => { const buf = Buffer.from(b64, 'base64'); writeFileSync(new URL(`${dir}/${name}`, ROOT), buf); return buf.length; };
      if (p.kind === 'strip') {
        const r = await page.evaluate(([s, f, h, l]) => window.strip(s, f, h, l), [dataUrl, p.frames, p.height, 45000]);
        const name = `${p.id}-${p.height}.webp`;
        bytes.strip = write(name, r.b64); files.strip = `${dir}/${name}`;
        index.pictures.push({ id: p.id, kind: p.kind, alt: p.alt, files, bytes, frames: p.frames, frameWidth: r.frameWidth, height: r.height, background: r.bg, source: p.file, madeBy: MADE_BY });
        console.log(`${p.id}: ${p.frames} frames of ${r.frameWidth} x ${r.height}, ${bytes.strip} bytes (quality ${r.q}), ${r.pieces} pieces of drawing`);
        continue;
      }
      // The logos have a 128 px copy too, for places 40 to 64 px wide on sharp screens (the 256 px one weighs twice as
      // much again).
      const sizes = p.sizes || (['module', 'submodule'].includes(p.kind) ? [64, 128, 256] : [64, 256]), pngs = p.png || [];
      // The logos are drawn in a circle (the mark and every module's and submodule's picture); the sheets are not.
      const ringed = !p.crop && ['mark', 'module', 'submodule', 'future'].includes(p.kind);
      const r = await page.evaluate(([s, c, z, g, l, k]) => window.square(s, c, z, g, l, k), [dataUrl, p.crop || null, sizes, pngs, WEIGHT, ringed]);
      for (const s of sizes) { const name = `${p.id}-${s}.webp`; bytes[s] = write(name, r.out[s].b64); files[s] = `${dir}/${name}`; }
      for (const s of pngs) { const name = `${p.id}-${s}.png`; bytes[`${s}png`] = write(name, r.png[s]); files[`${s}png`] = `${dir}/${name}`; }
      index.pictures.push({ id: p.id, kind: p.kind, ...(p.for ? { for: p.for } : {}), alt: p.alt, files, bytes, background: r.bg, source: p.file, madeBy: MADE_BY });
      console.log(`${p.id}${r.ring ? ` (circle r ${r.ring.r}, ${r.ring.rays} rays)` : ''}: ${sizes.map(s => `${s} px ${bytes[s]} B (q ${r.out[s].q})`).join(', ')}${pngs.length ? `, png ${pngs.map(s => bytes[`${s}png`]).join(', ')} B` : ''}`);
    }
    await page.close();
  } finally { await browser.close(); }
  writeFileSync(new URL(`${OUT}/index.json`, ROOT), JSON.stringify(index, null, 1) + '\n');
  console.log(`${OUT}/index.json: ${index.pictures.length} pictures`);
}

// Run, not imported (the tests import PICTURES and WEIGHT).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
