// Data Analytics: draws a prepared chart (chartdata.js) with Observable Plot in PRP's tokens. Plot, d3 and the world map
// load only when a chart is first drawn, from jsDelivr, pinned and checked with Subresource Integrity.
export const LIBS = {
  d3: { src: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js', integrity: 'sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i' },
  plot: { src: 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/dist/plot.umd.min.js', integrity: 'sha384-JUpn2GgRr0gxU0xOBd8D8P634jhRCwobtG8G2MMEkX1RnGJ7/FJNnuukpfT+H2w1' },
  topojson: { src: 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js', integrity: 'sha384-Ukv1p/xTma6P4/2bY5KzWBw+ydSpXmhCMtyciIQVDJ1RmOxtCYNMF1uXT9T63H67' },
  world: { src: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json', integrity: 'sha384-yOCJ+8ShBm8UDqtAVtAvxTDDf4gXo5edxl/YG0FmVC5OTmqVLl7utuVGBDEeZWHf' },
};

function script({ src, integrity }) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.integrity = integrity; s.crossOrigin = 'anonymous'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { s.remove(); reject(new Error(`Could not load ${new URL(src).pathname.split('/')[2]} from jsDelivr`)); };
    document.head.appendChild(s);
  });
}
let plotReady = null, mapReady = null;
export function ensurePlot() {
  plotReady ||= (async () => {
    if (!window.d3) await script(LIBS.d3);
    if (!window.Plot) await script(LIBS.plot);
    return window.Plot;
  })().catch(e => { plotReady = null; throw e; });
  return plotReady;
}
export function ensureMap() {
  mapReady ||= (async () => {
    await ensurePlot();
    if (!window.topojson) await script(LIBS.topojson);
    const res = await fetch(LIBS.world.src, { integrity: LIBS.world.integrity, mode: 'cors' });
    if (!res.ok) throw new Error('Could not load the world map');
    const world = await res.json();
    const { COUNTRIES } = await import('./countries.js');
    return { features: window.topojson.feature(world, world.objects.countries).features, countries: COUNTRIES };
  })().catch(e => { mapReady = null; throw e; });
  return mapReady;
}

/* ---------- tokens ---------- */
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el), t = n => cs.getPropertyValue(n).trim();
  return {
    cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => t(`--prp-cat-${i}`)), seq: [100, 200, 300, 400, 500, 600, 700].map(i => t(`--prp-seq-${i}`)),
    text: t('--prp-text'), text2: t('--prp-text-2'), muted: t('--prp-muted'), faint: t('--prp-faint'), grid: t('--prp-grid'), axis: t('--prp-axis'),
    surface: t('--prp-surface'), line: t('--prp-line'), water: t('--prp-map-water'), land: t('--prp-map-land'), nodata: t('--prp-map-nodata'), border: t('--prp-map-border'),
    fontUi: t('--prp-font-ui'), fontMono: t('--prp-font-mono'), fontSerif: t('--prp-font-serif'),
  };
}
/** Colours for the series, in fixed order; "Other" is neutral. */
export function seriesColours(series, T) {
  let i = 0;
  return series.map(s => (s === 'Other' ? T.faint : T.cat[i++] || T.faint));
}

/* ---------- number formats ---------- */
const NF = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtNumber = v => (v == null ? '' : Math.abs(v) >= 1e6 ? COMPACT.format(v) : NF.format(v));
// Years, decades and codes read without thousands separators (1990, not 1,990).
const YEARISH = /year|decade|century|^y$|_y$/i;
export const formatFor = name => (YEARISH.test(name || '') ? v => (v == null ? '' : Number.isInteger(+v) ? String(v) : NF.format(v).replace(/,/g, '')) : fmtNumber);
const fmtDate = (d, unit) => (d instanceof Date ? (unit === 'year' || /years/.test(unit || '') ? String(d.getUTCFullYear()) : unit === 'month' || unit === 'quarter' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10)) : String(d ?? ''));
const trunc = (s, n = 28) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const approxWidth = (s, px = 12) => String(s).length * px * 0.56;
// Room for the widest tick label on a value axis (Plot does not size margins to labels).
function valueMargin(values, fmt, isDate = false) {
  if (isDate) return 52;
  let lo = 0, hi = 0;
  for (const v of values) { if (v == null || !Number.isFinite(+v)) continue; if (+v < lo) lo = +v; if (+v > hi) hi = +v; }
  const step = 10 ** Math.floor(Math.log10(Math.max(Math.abs(lo), Math.abs(hi)) || 1));
  const widest = [Math.ceil(hi / step) * step, Math.floor(lo / step) * step, hi, lo, (hi - lo) / 7].map(v => fmt(v)).reduce((a, b) => (b.length > a.length ? b : a), '');
  return Math.max(36, Math.min(110, Math.round(approxWidth(widest, 11.5)) + 14));
}
const stackTotals = data => { const m = new Map(); for (const d of data) { const k = +d.x || String(d.x); m.set(k, (m.get(k) || 0) + Math.max(0, d.y)); } return [...m.values()]; };

/* ---------- the colour ramp for maps (also drawn into exports) ---------- */
export function mapThresholds(values, n = 7) {
  const v = values.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2 || v[0] === v[v.length - 1]) return { kind: 'single', thresholds: [] };
  const q = p => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const median = q(0.5), max = v[v.length - 1];
  const skewed = median > 0 && max / median > 12;
  let t;
  if (skewed) t = Array.from({ length: n - 1 }, (_, i) => +q((i + 1) / n).toPrecision(2));
  else { const step = (max - v[0]) / n; t = Array.from({ length: n - 1 }, (_, i) => +(v[0] + step * (i + 1)).toPrecision(3)); }
  t = [...new Set(t)].sort((a, b) => a - b);
  return { kind: skewed ? 'quantile' : 'equal', thresholds: t };
}
// Enough decimals to tell the steps apart (0.06, 0.12 … rather than 0.1, 0.1 …); large values compact (12K).
export function thresholdFormat(t) {
  if (Math.max(...t.map(Math.abs)) >= 1e4) return v => COMPACT.format(v);
  let d = Infinity;
  for (let i = 1; i < t.length; i++) d = Math.min(d, t[i] - t[i - 1]);
  const digits = Number.isFinite(d) && d > 0 ? Math.min(4, Math.max(0, Math.ceil(-Math.log10(d)))) : 1;
  const f = new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits });
  return v => f.format(v);
}
export function rampSVG(ramp, T, width = 320) {
  const n = ramp.colours.length, w = Math.max(18, Math.floor((width - 4) / n)), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = thresholdFormat(ramp.thresholds);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * n + 4}" height="46" viewBox="0 0 ${w * n + 4} 46" role="img" aria-label="${esc(ramp.label)}: colour steps at ${esc(ramp.thresholds.map(fmt).join(', '))}">`;
  s += `<text x="2" y="11" font-size="11.5" font-weight="600" fill="${T.text}" font-family="${esc(T.fontUi)}">${esc(ramp.label)}</text>`;
  ramp.colours.forEach((c, i) => { s += `<rect x="${2 + i * w}" y="17" width="${w - 1}" height="10" fill="${c}"/>`; });
  ramp.thresholds.forEach((v, i) => {
    s += `<line x1="${2 + (i + 1) * w - 0.5}" x2="${2 + (i + 1) * w - 0.5}" y1="17" y2="31" stroke="${T.muted}" stroke-width="1"/>`;
    s += `<text x="${2 + (i + 1) * w - 0.5}" y="42" font-size="10.5" text-anchor="middle" fill="${T.muted}" font-family="${esc(T.fontUi)}">${esc(fmt(v))}</text>`;
  });
  return s + '</svg>';
}

/* ---------- drawing ---------- */
/**
 * @returns { svg: SVGSVGElement, legend: [{ name, colour }], ramp: { label, thresholds, colours } | null, alt: string }
 */
export function renderChart(Plot, prep, { width = 720, T = readTokens(), geo = null, countryOf = null } = {}) {
  const series = prep.series || [];
  const colours = seriesColours(series, T);
  const colour = series.length ? { domain: series, range: colours, label: prep.color } : undefined;
  const fill = series.length ? 's' : T.cat[0];
  const style = { background: 'transparent', color: T.text2, fontFamily: T.fontUi, fontSize: '12px', overflow: 'visible' };
  const grid = axis => (axis === 'x' ? Plot.gridX({ stroke: T.grid, strokeOpacity: 1 }) : Plot.gridY({ stroke: T.grid, strokeOpacity: 1 }));
  const legend = series.map((name, i) => ({ name, colour: colours[i] }));
  const xIsDate = prep.xType === 'date';
  const yFmt = fmtNumber, xFmt = formatFor(prep.x);
  const order = series.length ? series : undefined;
  // Dates on the x axis take two lines of ticks (Jan / 2026): room below them for the axis label.
  const base = { width, style, color: colour, marginTop: 24, ...(xIsDate && prep.type !== 'bar' ? { marginBottom: 46 } : {}) };
  let plot, alt = '', ramp = null;

  if (prep.type === 'bar' && prep.xType === 'category') {
    const cats = prep.categories.map(String), n = cats.length;
    const room = Math.round(width * 0.4), maxChars = Math.max(12, Math.min(48, Math.floor(room / 6.7)));
    const marginLeft = Math.min(room, Math.max(52, Math.round(Math.max(...cats.map(c => approxWidth(trunc(c, maxChars))))) + 14));
    const labels = !series.length && n <= 30;
    const widest = labels ? Math.max(...prep.data.map(d => yFmt(d.y).length)) : 0;
    plot = Plot.plot({
      ...base, height: Math.max(120, n * (series.length ? 26 : 23) + 52), marginLeft, marginRight: labels ? Math.max(40, Math.round(widest * 6.6) + 12) : 16,
      x: { label: prep.valueLabel, nice: true, tickFormat: yFmt, labelArrow: 'none' },
      y: { domain: cats, label: null, tickFormat: c => trunc(c, maxChars), tickSize: 0 },
      marks: [
        grid('x'),
        Plot.barX(prep.data, { x: 'y', y: d => String(d.x), fill, sort: null, order, tip: { format: { y: true, x: yFmt, fill: !!series.length } } }),
        Plot.ruleX([0], { stroke: T.axis }),
        labels ? Plot.text(prep.data.filter(d => d.y >= 0), { x: 'y', y: d => String(d.x), text: d => yFmt(d.y), textAnchor: 'start', dx: 4, fill: T.text2, fontSize: 11 }) : null,
        labels ? Plot.text(prep.data.filter(d => d.y < 0), { x: 'y', y: d => String(d.x), text: d => yFmt(d.y), textAnchor: 'end', dx: -4, fill: T.text2, fontSize: 11 }) : null,
      ].filter(Boolean),
    });
    alt = `Bar chart of ${prep.valueLabel.toLowerCase()} by ${prep.x}: ` + prep.data.slice(0, 12).map(d => `${d.x}${d.s ? ' (' + d.s + ')' : ''} ${yFmt(d.y)}`).join(', ') + (prep.data.length > 12 ? ', …' : '');
  } else if (prep.type === 'bar') {
    const cats = prep.categories.map(String), every = Math.max(1, Math.ceil(cats.length / Math.max(4, Math.floor(width / 64))));
    plot = Plot.plot({
      ...base, height: Math.round(Math.min(420, Math.max(240, width * 0.48))), marginBottom: 36, marginLeft: valueMargin(series.length ? stackTotals(prep.data) : prep.data.map(d => d.y), yFmt),
      x: { type: 'band', domain: cats, label: prep.x, ticks: cats.filter((c, i) => i % every === 0), tickFormat: c => trunc(c, 12), padding: 0.15 },
      y: { label: prep.valueLabel, nice: true, tickFormat: yFmt },
      marks: [grid('y'), Plot.barY(prep.data, { x: d => String(d.x), y: 'y', fill, order, tip: { format: { x: true, y: yFmt, fill: !!series.length } } }), Plot.ruleY([0], { stroke: T.axis })],
    });
    alt = `Column chart of ${prep.valueLabel.toLowerCase()} by ${prep.x}, ${cats.length} values from ${cats[0]} to ${cats[cats.length - 1]}`;
  } else if (prep.type === 'line' || prep.type === 'area') {
    const zero = (prep.fn === 'count' || prep.fn === 'sum') && prep.data.every(d => d.y >= 0);
    const direct = prep.type === 'line' && series.length >= 2 && series.length <= 4;
    const marginRight = direct ? Math.min(150, Math.round(Math.max(...series.map(s => approxWidth(trunc(s, 20), 11)))) + 14) : 20;
    const marginLeft = valueMargin(prep.type === 'area' && series.length ? stackTotals(prep.data) : prep.data.map(d => d.y), yFmt);
    const xOpt = { type: xIsDate ? 'utc' : 'linear', label: prep.x, tickFormat: xIsDate ? undefined : xFmt };
    const opts = { x: 'x', y: 'y', z: series.length ? 's' : null };
    const tipText = d => `${prep.x}: ${xIsDate ? fmtDate(d.x) : xFmt(d.x)}\n${d.s ? prep.color + ': ' + d.s + '\n' : ''}${prep.valueLabel}: ${yFmt(d.y)}`;
    const marks = [grid('y'), zero ? Plot.ruleY([0], { stroke: T.axis }) : null];
    if (prep.type === 'line') {
      marks.push(Plot.lineY(prep.data, { ...opts, stroke: fill, strokeWidth: 1.75 }));
      if (prep.data.length <= 80) marks.push(Plot.dot(prep.data, { ...opts, fill, r: 2.4 }));
      if (direct) marks.push(Plot.text(prep.data, Plot.selectLast({ ...opts, text: d => trunc(d.s, 20), textAnchor: 'start', dx: 6, fill: T.text2, fontSize: 11 })));
      marks.push(Plot.tip(prep.data, Plot.pointer({ ...opts, title: tipText })));
    } else {
      marks.push(Plot.areaY(prep.data, { ...opts, fill, fillOpacity: 0.88, order }));
      marks.push(Plot.tip(prep.data, Plot.pointerX(Plot.stackY2({ ...opts, order, title: tipText }))));
    }
    plot = Plot.plot({ ...base, height: Math.round(Math.min(420, Math.max(240, width * 0.5))), marginLeft, marginRight, x: xOpt, y: { label: prep.valueLabel, nice: true, zero, tickFormat: yFmt }, marks: marks.filter(Boolean) });
    alt = `${prep.type === 'line' ? 'Line' : 'Stacked area'} chart of ${prep.valueLabel.toLowerCase()} over ${prep.x}${series.length ? ', by ' + prep.color + ' (' + series.join(', ') + ')' : ''}`;
  } else if (prep.type === 'scatter') {
    const yIsDate = prep.yType === 'date', yAxisFmt = formatFor(prep.y);
    const channels = prep.labelName ? { [prep.labelName]: 'label' } : {};
    plot = Plot.plot({
      ...base, height: Math.round(Math.min(460, Math.max(260, width * 0.55))), grid: false, marginLeft: valueMargin(prep.data.map(d => d.y), yAxisFmt, yIsDate),
      x: { type: xIsDate ? 'utc' : 'linear', label: prep.x, nice: true, tickFormat: xIsDate ? undefined : xFmt }, y: { type: yIsDate ? 'utc' : 'linear', label: prep.y, nice: true, tickFormat: yIsDate ? undefined : yAxisFmt },
      marks: [grid('x'), grid('y'), Plot.dot(prep.data, { x: 'x', y: 'y', fill, r: 3.2, fillOpacity: 0.78, stroke: T.surface, strokeWidth: 0.5, channels, tip: { format: { x: xIsDate ? d => fmtDate(d) : xFmt, y: yIsDate ? d => fmtDate(d) : yAxisFmt, fill: !!series.length } } })],
    });
    alt = `Scatter plot of ${prep.y} against ${prep.x}, ${prep.data.length} points`;
  } else if (prep.type === 'hist') {
    plot = Plot.plot({
      ...base, height: Math.round(Math.min(400, Math.max(230, width * 0.45))), marginLeft: valueMargin(stackTotals(prep.data.map(d => ({ x: +d.x0, y: d.y }))), yFmt),
      x: { type: xIsDate ? 'utc' : 'linear', label: prep.x, tickFormat: xIsDate ? undefined : xFmt }, y: { label: 'Rows', nice: true, tickFormat: yFmt },
      marks: [grid('y'), Plot.rectY(prep.data, { x1: 'x0', x2: 'x1', y: 'y', fill, insetLeft: 0.5, insetRight: 0.5, order }),
        Plot.ruleY([0], { stroke: T.axis }),
        Plot.tip(prep.data, Plot.pointerX(Plot.stackY2({ x1: 'x0', x2: 'x1', y: 'y', z: series.length ? 's' : null, order,
          title: d => `${xIsDate ? fmtDate(d.x0, prep.unit) : `${xFmt(d.x0)} to under ${xFmt(d.x1)}`}\n${d.s ? prep.color + ': ' + d.s + '\n' : ''}Rows: ${yFmt(d.y)}` })))],
    });
    alt = `Histogram of ${prep.x}: ${prep.data.reduce((a, d) => a + d.y, 0)} rows in ${new Set(prep.data.map(d => +d.x0)).size} bins`;
  } else if (prep.type === 'map') {
    if (!geo) throw new Error('The world map has not loaded');
    const byIso = new Map(prep.data.map(d => [d.iso3, d]));
    const iso = f => (f.id ? countryOf(f.id)?.iso3 : countryOf(f.properties?.name)?.iso3);
    const withData = geo.features.filter(f => byIso.has(iso(f)));
    const { thresholds } = mapThresholds(prep.data.map(d => d.y));
    const range = thresholds.length ? T.seq.slice(T.seq.length - thresholds.length - 1) : [T.seq[4]];
    ramp = { label: prep.valueLabel, thresholds, colours: range };
    const val = f => byIso.get(iso(f))?.y;
    plot = Plot.plot({
      ...base, marginTop: 2, marginBottom: 2, marginLeft: 2, marginRight: 2,
      projection: { type: 'equal-earth', domain: { type: 'Sphere' } },
      color: thresholds.length ? { type: 'threshold', domain: thresholds, range } : { type: 'ordinal', range },
      marks: [
        Plot.sphere({ fill: T.water, stroke: T.border, strokeWidth: 0.5 }),
        Plot.geo(geo.features, { fill: T.nodata, stroke: T.border, strokeWidth: 0.4 }),
        Plot.geo(withData, { fill: thresholds.length ? val : () => range[0], stroke: T.border, strokeWidth: 0.4 }),
        Plot.tip(withData, Plot.pointer(Plot.centroid({ title: f => `${byIso.get(iso(f)).x}\n${prep.valueLabel}: ${yFmt(val(f))}` }))),
      ],
    });
    alt = `World map of ${prep.valueLabel.toLowerCase()} by country: ` + prep.data.slice(0, 10).map(d => `${d.x} ${yFmt(d.y)}`).join(', ') + (prep.data.length > 10 ? ', …' : '');
  } else throw new Error(`Cannot draw “${prep.type}”`);

  plot.setAttribute('role', 'img');
  plot.setAttribute('aria-label', alt);
  return { svg: plot, legend: prep.type === 'map' ? [] : legend, ramp, alt };
}
