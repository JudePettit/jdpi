// SIGINT Dashboard: small SVG charts drawn with PRP tokens (one axis, thin marks, hairline grid, crosshair tooltips).
// Colours are read from CSS tokens at draw time; views call these again on 'prp:themechange' and on resize.
import { esc } from './util.js';
import { skyXY } from './passes.js';

const NS = 'http://www.w3.org/2000/svg';
export const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const text = (parent, x, y, s, attrs = {}) => { const t = el('text', { x, y, ...attrs }, parent); t.textContent = s; return t; };

function niceTicks(min, max, count = 5) {
  const span = max - min || 1, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
/** Time ticks on local clock boundaries (whole hours, or midnights for day steps), safe across DST changes. */
function timeTicks(min, max, width) {
  const H = 3600e3, want = Math.max(2, Math.floor(width / 90));
  const hours = [1, 2, 3, 6, 12, 24, 48, 96].find(s => (max - min) / (s * H) <= want) || 96;
  const out = [], d = new Date(min);
  if (hours >= 24) {
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < min) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= max; d.setDate(d.getDate() + hours / 24)) out.push(d.getTime());
  } else {
    d.setMinutes(0, 0, 0);
    if (d.getTime() < min) d.setHours(d.getHours() + 1);
    while (d.getHours() % hours) d.setHours(d.getHours() + 1);
    for (; d.getTime() <= max; d.setHours(d.getHours() + hours)) out.push(d.getTime());
  }
  return { ticks: out, step: hours * H };
}
export const fmtDay = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
const pad2 = n => String(n).padStart(2, '0');
export const fmtClock = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const fmtDayClock = t => { const d = new Date(t); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) + ' ' + fmtClock(t); };

function frame(host, height) {
  host.classList.add('sg-chart');
  host.innerHTML = '';
  const width = Math.max(260, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 600));
  const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' }, host);
  const tip = document.createElement('div');
  tip.className = 'sg-tip'; tip.hidden = true; tip.setAttribute('role', 'status');
  host.appendChild(tip);
  return { svg, tip, width };
}
function placeTip(host, tip, x, y) {
  tip.hidden = false;
  const w = tip.offsetWidth, hw = host.clientWidth;
  tip.style.left = `${Math.max(0, Math.min(hw - w, x + 12 > hw - w ? x - w - 12 : x + 12))}px`;
  tip.style.top = `${Math.max(0, y - tip.offsetHeight - 8)}px`;
}

/**
 * Line chart. series: [{ label, token, points: [{ t, v }] }]. y: { log, min, max, ticks, format, unit }.
 * refs: [{ v, label }] reference lines (labelled at the right). tooltip(t, rows) → HTML (rows: [{ series, v }]).
 */
export function lineChart(host, { series, height = 190, y = {}, x = {}, refs = [], tooltip, label, endLabel = true, gapMs = 15 * 60e3 }) {
  const { svg, tip, width } = frame(host, height);
  svg.setAttribute('aria-label', label || '');
  const all = series.flatMap(s => s.points).filter(p => Number.isFinite(p.v));
  if (!all.length) { text(svg, width / 2, height / 2, 'No data', { 'text-anchor': 'middle', fill: tok('--prp-muted'), 'font-size': 12 }); return; }
  const log = !!y.log;
  const tv = v => (log ? Math.log10(Math.max(v, 1e-12)) : v);
  let ymin = y.min ?? Math.min(...all.map(p => p.v)), ymax = y.max ?? Math.max(...all.map(p => p.v));
  if (y.padTo) { ymin = Math.min(ymin, y.padTo[0]); ymax = Math.max(ymax, y.padTo[1]); }
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const lo = tv(ymin), hi = tv(ymax);
  const tmin = x.min ?? Math.min(...all.map(p => p.t)), tmax = x.max ?? Math.max(...all.map(p => p.t));
  const m = { l: 46, r: endLabel || refs.length ? 58 : 14, t: 10, b: 24 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const sx = t => m.l + ((t - tmin) / (tmax - tmin || 1)) * W;
  const sy = v => m.t + H - ((tv(v) - lo) / (hi - lo || 1)) * H;
  const grid = tok('--prp-grid'), axis = tok('--prp-axis'), muted = tok('--prp-muted'), ink = tok('--prp-text'), surf = tok('--prp-surface');
  const fmtY = y.format || (v => String(v));
  const yt = y.ticks || (log ? Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => 10 ** (Math.ceil(lo) + i)) : niceTicks(ymin, ymax, Math.max(3, Math.floor(H / 34))));
  const g = el('g', { 'font-family': 'IBM Plex Mono, ui-monospace, monospace', 'font-size': 10.5 }, svg);
  for (const v of yt) {
    if (tv(v) < lo - 1e-9 || tv(v) > hi + 1e-9) continue;
    el('line', { x1: m.l, x2: m.l + W, y1: sy(v), y2: sy(v), stroke: grid, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
    text(g, m.l - 6, sy(v) + 3.5, fmtY(v), { 'text-anchor': 'end', fill: muted });
  }
  const { ticks } = timeTicks(tmin, tmax, W);
  el('line', { x1: m.l, x2: m.l + W, y1: m.t + H, y2: m.t + H, stroke: axis, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
  for (const t of ticks) {
    el('line', { x1: sx(t), x2: sx(t), y1: m.t + H, y2: m.t + H + 4, stroke: axis }, g);
    text(g, sx(t), m.t + H + 16, (x.format || (v => (new Date(v).getHours() || new Date(v).getMinutes() ? fmtClock(v) : fmtDay(v))))(t), { 'text-anchor': 'middle', fill: muted });
  }
  for (const r of refs) {
    if (tv(r.v) < lo || tv(r.v) > hi) continue;
    el('line', { x1: m.l, x2: m.l + W, y1: sy(r.v), y2: sy(r.v), stroke: axis, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, g);
    text(g, m.l + W + 6, sy(r.v) + 3.5, r.label, { fill: muted });
  }
  for (const s of series) {
    const pts = s.points.filter(p => Number.isFinite(p.v) && p.t >= tmin && p.t <= tmax);
    if (!pts.length) continue;
    let d = '';
    pts.forEach((p, i) => { d += (i && p.t - pts[i - 1].t <= gapMs ? 'L' : 'M') + sx(p.t).toFixed(1) + ',' + sy(p.v).toFixed(1); });
    el('path', { d, fill: 'none', stroke: tok(s.token), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    const last = pts[pts.length - 1];
    el('circle', { cx: sx(last.t), cy: sy(last.v), r: 4, fill: tok(s.token), stroke: surf, 'stroke-width': 2 }, svg);
    if (endLabel && series.length === 1) text(svg, sx(last.t) + 8, sy(last.v) + 4, fmtY(last.v), { fill: ink, 'font-size': 11.5, 'font-weight': 600, 'font-family': 'IBM Plex Sans, system-ui, sans-serif' });
  }
  // Crosshair + tooltip, by pointer or keyboard.
  const cross = el('line', { y1: m.t, y2: m.t + H, stroke: axis, 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dots = series.map(s => el('circle', { r: 4, fill: tok(s.token), stroke: surf, 'stroke-width': 2, visibility: 'hidden' }, svg));
  const times = [...new Set(all.map(p => p.t))].sort((a, b) => a - b);
  const nearest = (arr, t) => { let a = 0, b = arr.length - 1; while (b - a > 1) { const c = (a + b) >> 1; if (arr[c].t < t) a = c; else b = c; } return Math.abs(arr[a].t - t) <= Math.abs(arr[b].t - t) ? arr[a] : arr[b]; };
  let idx = times.length - 1;
  const show = t => {
    cross.setAttribute('x1', sx(t)); cross.setAttribute('x2', sx(t)); cross.setAttribute('visibility', 'visible');
    const rows = series.map((s, i) => {
      const p = s.points.length ? nearest(s.points, t) : null;
      const ok = p && Math.abs(p.t - t) <= gapMs && Number.isFinite(p.v);
      dots[i].setAttribute('visibility', ok ? 'visible' : 'hidden');
      if (ok) { dots[i].setAttribute('cx', sx(p.t)); dots[i].setAttribute('cy', sy(p.v)); }
      return { series: s, v: ok ? p.v : null, t: ok ? p.t : t };
    });
    tip.innerHTML = tooltip ? tooltip(t, rows) : `<b>${rows.map(r => esc(r.v == null ? '–' : fmtY(r.v))).join(' · ')}</b><span>${esc(fmtDayClock(t))}</span>`;
    placeTip(host, tip, sx(t), m.t + 20);
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); };
  const hit = el('rect', { x: m.l, y: m.t, width: W, height: H, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); const t = tmin + ((e.clientX - r.left - m.l) / W) * (tmax - tmin); idx = Math.max(0, times.findIndex(v => v >= t)); show(times[idx] ?? t); });
  hit.addEventListener('pointerleave', hide);
  host.tabIndex = 0;
  host.onkeydown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const stepN = e.shiftKey ? 10 : 1;
    idx = e.key === 'Home' ? 0 : e.key === 'End' ? times.length - 1 : Math.max(0, Math.min(times.length - 1, idx + (e.key === 'ArrowLeft' ? -stepN : stepN)));
    show(times[idx]);
  };
  host.onblur = hide;
}

/**
 * Column chart over time. bars: [{ t, v, token, kind, title }] (one per time slot). y: { min, max, ticks, format }.
 * now: draws a "now" rule. Bars are at most 24px wide with a 2px gap and a rounded top.
 */
export function barChart(host, { bars, height = 190, y = {}, x = {}, now, tooltip, label, slotMs }) {
  const { svg, tip, width } = frame(host, height);
  svg.setAttribute('aria-label', label || '');
  if (!bars.length) { text(svg, width / 2, height / 2, 'No data', { 'text-anchor': 'middle', fill: tok('--prp-muted'), 'font-size': 12 }); return; }
  const slot = slotMs || Math.min(...bars.slice(1).map((b, i) => b.t - bars[i].t).filter(v => v > 0)) || 3 * 3600e3;
  const tmin = bars[0].t, tmax = bars[bars.length - 1].t + slot;
  const m = { l: 34, r: 12, t: 10, b: 24 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const sx = t => m.l + ((t - tmin) / (tmax - tmin)) * W;
  const ymin = y.min ?? 0, ymax = y.max ?? Math.max(...bars.map(b => b.v));
  const sy = v => m.t + H - ((v - ymin) / (ymax - ymin || 1)) * H;
  const grid = tok('--prp-grid'), axis = tok('--prp-axis'), muted = tok('--prp-muted'), ink = tok('--prp-text-2');
  const g = el('g', { 'font-family': 'IBM Plex Mono, ui-monospace, monospace', 'font-size': 10.5 }, svg);
  for (const v of y.ticks || niceTicks(ymin, ymax, 4)) {
    el('line', { x1: m.l, x2: m.l + W, y1: sy(v), y2: sy(v), stroke: grid, 'shape-rendering': 'crispEdges' }, g);
    text(g, m.l - 6, sy(v) + 3.5, (y.format || String)(v), { 'text-anchor': 'end', fill: muted });
  }
  const { ticks, step } = timeTicks(tmin, tmax, W);
  for (const t of ticks) {
    el('line', { x1: sx(t), x2: sx(t), y1: m.t + H, y2: m.t + H + 4, stroke: axis }, g);
    text(g, sx(t), m.t + H + 16, (x.format || (step >= 864e5 ? fmtDay : fmtDayClock))(t), { 'text-anchor': 'middle', fill: muted });
  }
  const slotW = (slot / (tmax - tmin)) * W, bw = Math.max(2, Math.min(24, slotW - 2));
  const marks = [];
  bars.forEach((b, i) => {
    const x0 = sx(b.t) + (slotW - bw) / 2, y0 = sy(Math.max(ymin, b.v)), y1 = sy(ymin), h = Math.max(1, y1 - y0), r = Math.min(4, bw / 2, h);
    const d = `M${x0},${y1}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y1}Z`;
    const p = el('path', { d, fill: tok(b.token), 'fill-opacity': b.kind === 'predicted' ? 0.45 : 1, tabindex: -1, 'data-i': i }, svg);
    marks.push(p);
  });
  el('line', { x1: m.l, x2: m.l + W, y1: sy(ymin), y2: sy(ymin), stroke: axis, 'shape-rendering': 'crispEdges' }, svg);
  if (now && now >= tmin && now <= tmax) {
    el('line', { x1: sx(now), x2: sx(now), y1: m.t, y2: m.t + H, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': null }, svg);
    text(svg, sx(now) + 4, m.t + 10, 'now', { fill: ink, 'font-size': 10.5, 'font-family': 'IBM Plex Mono, ui-monospace, monospace' });
  }
  let idx = bars.length - 1;
  const show = i => {
    idx = i; const b = bars[i];
    marks.forEach((p, k) => p.setAttribute('stroke', k === i ? tok('--prp-text') : 'none'));
    tip.innerHTML = tooltip ? tooltip(b) : `<b>${esc(String(b.v))}</b><span>${esc(fmtDayClock(b.t))}</span>`;
    placeTip(host, tip, sx(b.t) + slotW / 2, sy(b.v));
  };
  const hide = () => { tip.hidden = true; marks.forEach(p => p.setAttribute('stroke', 'none')); };
  const hit = el('rect', { x: m.l, y: m.t, width: W, height: H, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); const t = tmin + ((e.clientX - r.left - m.l) / W) * (tmax - tmin); const i = bars.findIndex(b => t >= b.t && t < b.t + slot); if (i >= 0) show(i); });
  hit.addEventListener('pointerleave', hide);
  host.tabIndex = 0;
  host.onkeydown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    show(e.key === 'Home' ? 0 : e.key === 'End' ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, idx + (e.key === 'ArrowLeft' ? -1 : 1))));
  };
  host.onblur = hide;
}

/**
 * Polar sky plot: zenith in the centre, horizon at the edge, north up.
 * tracks: [{ token, points: [{ az, el }], label, start, end }]; dots: [{ az, el, token, label, hollow, title }].
 */
export function skyPlot(host, { tracks = [], dots = [], size, label, onDot }) {
  host.classList.add('sg-sky');
  host.innerHTML = '';
  const S = size || Math.max(220, Math.min(420, host.clientWidth || 320));
  const svg = el('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': label || 'Sky plot' }, host);
  const tip = document.createElement('div'); tip.className = 'sg-tip'; tip.hidden = true; tip.setAttribute('role', 'status'); host.appendChild(tip);
  const c = S / 2, R = S / 2 - 22;
  const grid = tok('--prp-grid'), axis = tok('--prp-axis'), muted = tok('--prp-muted'), surf = tok('--prp-surface'), ink = tok('--prp-text');
  const g = el('g', { 'font-family': 'IBM Plex Mono, ui-monospace, monospace', 'font-size': 10.5 }, svg);
  for (const e of [0, 30, 60]) {
    el('circle', { cx: c, cy: c, r: R * (90 - e) / 90, fill: 'none', stroke: e ? grid : axis, 'stroke-width': 1 }, g);
    if (e) text(g, c + 3, c - R * (90 - e) / 90 + 11, `${e}°`, { fill: muted });
  }
  for (let a = 0; a < 360; a += 45) { const p = skyXY(a, 0, R, c, c); el('line', { x1: c, y1: c, x2: p.x, y2: p.y, stroke: grid, 'stroke-width': 1 }, g); }
  for (const [a, s] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) { const p = skyXY(a, -12, R, c, c); text(g, p.x, p.y + 4, s, { 'text-anchor': 'middle', fill: ink, 'font-weight': 600 }); }
  for (const t of tracks) {
    if (t.points.length < 2) continue;
    const d = t.points.map((p, i) => { const q = skyXY(p.az, p.el, R, c, c); return (i ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join('');
    el('path', { d, fill: 'none', stroke: tok(t.token), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const a = skyXY(t.points[0].az, t.points[0].el, R, c, c), z = skyXY(t.points.at(-1).az, t.points.at(-1).el, R, c, c);
    el('circle', { cx: a.x, cy: a.y, r: 4, fill: surf, stroke: tok(t.token), 'stroke-width': 2 }, svg);
    el('circle', { cx: z.x, cy: z.y, r: 4, fill: tok(t.token), stroke: surf, 'stroke-width': 2 }, svg);
    if (t.start) text(svg, a.x + (a.x < c ? -7 : 7), a.y + 4, t.start, { 'text-anchor': a.x < c ? 'end' : 'start', fill: ink, 'font-size': 10.5, 'font-family': 'IBM Plex Mono, monospace' });
    if (t.end) text(svg, z.x + (z.x < c ? -7 : 7), z.y + 4, t.end, { 'text-anchor': z.x < c ? 'end' : 'start', fill: ink, 'font-size': 10.5, 'font-family': 'IBM Plex Mono, monospace' });
    if (t.peak) { const q = skyXY(t.peak.az, t.peak.el, R, c, c); el('circle', { cx: q.x, cy: q.y, r: 4, fill: tok(t.token), stroke: surf, 'stroke-width': 2 }, svg); }
  }
  for (const dt of dots) {
    if (!Number.isFinite(dt.az) || !Number.isFinite(dt.el) || dt.el < 0) continue;
    const q = skyXY(dt.az, dt.el, R, c, c);
    const grp = el('g', { tabindex: 0, role: 'img', 'aria-label': dt.title || dt.label || '' }, svg);
    el('circle', { cx: q.x, cy: q.y, r: 12, fill: 'transparent' }, grp);
    el('circle', { cx: q.x, cy: q.y, r: 5, fill: dt.hollow ? surf : tok(dt.token), stroke: dt.hollow ? tok(dt.token) : surf, 'stroke-width': 2 }, grp);
    if (dt.label) text(grp, q.x + 8, q.y - 6, dt.label, { fill: ink, 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace' });
    const on = () => { tip.innerHTML = dt.tip || `<b>${esc(dt.title || dt.label || '')}</b>`; placeTip(host, tip, q.x, q.y); };
    grp.addEventListener('pointerenter', on); grp.addEventListener('focus', on);
    grp.addEventListener('pointerleave', () => { tip.hidden = true; }); grp.addEventListener('blur', () => { tip.hidden = true; });
    if (onDot) grp.addEventListener('click', () => onDot(dt));
  }
}

/** Horizontal bars for per-satellite C/N0 (GNSS): rows [{ label, v, token, hollow, title }], domain 0–max. */
export function snrBars(host, { rows, max = 55, label }) {
  host.classList.add('sg-snr');
  if (!rows.length) { host.innerHTML = '<p class="prp-empty">No satellites reported yet.</p>'; return; }
  host.innerHTML = `<div class="snr-grid" role="list" aria-label="${esc(label || 'Signal strength by satellite')}">` + rows.map(r => {
    const pct = Math.max(0, Math.min(100, ((r.v ?? 0) / max) * 100));
    return `<div class="snr-row" role="listitem" title="${esc(r.title || '')}"><span class="snr-l">${esc(r.label)}</span>` +
      `<span class="snr-track"><i class="${r.hollow ? 'hollow' : ''}" style="width:${pct.toFixed(1)}%;--c:var(${r.token})"></i></span>` +
      `<span class="snr-v">${r.v == null ? '–' : r.v}</span></div>`;
  }).join('') + '</div>';
}
