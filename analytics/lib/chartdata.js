// Data Analytics: turns a result table and a chart choice into the exact rows a chart draws, plus the table view of
// those rows. Pure (no DOM, no Plot), so tests check what the charts show. Rules from PRP-STYLE §6: categorical colours
// in fixed order and never cycled (more series fold into "Other"; scatter and maps keep at most three colours), and
// every chart has a table view.
import { aggregate, keyOf, toNum, isEmpty, comparator, formatValue } from './engine.js';
import { dateParts } from './expr.js';
import { CHART_TYPES, CHART_FNS } from './spec.js';

export const LIMITS = { bars: 40, ordinalBars: 60, series: 8, scatterColours: 3, points: 10000, tableRows: 1000 };
export const OTHER = 'Other';
const NEEDS_XY = new Set(['scatter']);

/* ---------- dates as chart positions ---------- */
export function toDate(v) {
  const p = dateParts(v);
  if (!p) return null;
  const t = new Date(0);
  t.setUTCFullYear(p.y, (p.m ?? 1) - 1, p.d ?? 1);
  if (typeof v === 'string') { const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v); if (m) t.setUTCHours(+m[1], +m[2], +(m[3] || 0)); }
  return t;
}
const xValue = (v, xType) => (xType === 'date' ? toDate(v) : xType === 'number' ? toNum(v) : v);

/* ---------- which columns suit which chart ---------- */
const QUANT = new Set(['number', 'date']);
const valueOK = (col, fn) => !col || fn === 'count' || col.type === 'number' || ((fn === 'min' || fn === 'max') && col.type === 'date') || (col.type === 'string' && fn !== 'min' && fn !== 'max') || col.type === 'empty';

/** Check a chart choice against the table. Returns an error message or ''. */
export function chartProblem(table, c) {
  if (!c?.type) return '';
  if (!CHART_TYPES[c.type]) return `Unknown chart type “${c.type}”`;
  const col = n => table.columns.find(x => x.name === n);
  if (!c.x) return c.type === 'map' ? 'Choose the column with countries' : 'Choose a column for the horizontal axis';
  const x = col(c.x);
  if (!x) return `No column “${c.x}” in the result`;
  if (x.type === 'array' || x.type === 'object') return `“${x.name}” holds lists; add a “One row per list item” step first`;
  if ((c.type === 'line' || c.type === 'area' || c.type === 'hist' || c.type === 'scatter') && !QUANT.has(x.type)) return `A ${CHART_TYPES[c.type].toLowerCase()} chart needs numbers or dates across; “${x.name}” is text (try a bar chart)`;
  if (NEEDS_XY.has(c.type) && !c.y) return 'Choose a column for the vertical axis';
  if (c.y && c.type !== 'hist') {
    const y = col(c.y);
    if (!y) return `No column “${c.y}” in the result`;
    if (c.type === 'scatter' && !QUANT.has(y.type)) return `A scatter plot needs numbers or dates up the side; “${y.name}” is ${y.type}`;
    if (c.type !== 'scatter' && !valueOK(y, c.fn || 'sum')) return `${CHART_FNS[c.fn || 'sum']} needs a number column; “${y.name}” is ${y.type === 'date' ? 'a date' : y.type}`;
  }
  if (c.color) {
    const s = col(c.color);
    if (!s) return `No column “${c.color}” in the result`;
    if (s.type === 'array' || s.type === 'object') return `“${s.name}” holds lists; add a “One row per list item” step first`;
  }
  return '';
}

/* ---------- series: fixed order, folded to "Other" past the limit ---------- */
// At most `colours` named series; past that, the `keep` largest keep their colour and the rest become "Other" (neutral).
export function foldSeries(rows, getS, weight, colours, keep = colours - 1) {
  const totals = new Map();
  for (const r of rows) { const s = getS(r); totals.set(s, (totals.get(s) || 0) + weight(r)); }
  let kept = [...totals.keys()];
  let other = false;
  if (kept.length > colours) {
    kept = [...totals.entries()].sort((a, b) => b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1)).slice(0, keep).map(e => e[0]);
    other = true;
  }
  const keepList = kept;
  // Colour follows the entity: series are ordered by name (not by size), so a series keeps its colour as filters change.
  const named = keepList.filter(s => s !== OTHER).sort(comparator('string'));
  const all = other || keepList.includes(OTHER) ? [...named, OTHER] : named;
  const set = new Set(named);
  return { series: all, map: s => (set.has(s) ? s : OTHER), other: other || keepList.includes(OTHER), total: totals.size, named: named.length };
}
const label = v => (isEmpty(v) ? '(empty)' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/* ---------- histogram bins ---------- */
const E10 = Math.sqrt(50), E5 = Math.sqrt(10), E2 = Math.sqrt(2);
export function niceStep(span, count) {
  const raw = span / Math.max(1, count), p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return p * (m >= E10 ? 10 : m >= E5 ? 5 : m >= E2 ? 2 : 1);
}
export function numberBins(values, count = 20) {
  const xs = values.filter(v => v != null);
  if (!xs.length) return [];
  let lo = xs[0], hi = xs[0];
  for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; }
  if (lo === hi) return [{ x0: lo - 0.5, x1: hi + 0.5 }];
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step, bins = [];
  for (let a = start; a <= hi; a += step) bins.push({ x0: +a.toPrecision(12), x1: +(a + step).toPrecision(12) });
  return bins;
}
// Calendar bins for dates: the finest of these that gives no more than about `count` bins.
const UNITS = [
  { id: 'day', days: 1, key: p => [p.y, p.m ?? 1, p.d ?? 1], next: k => [k[0], k[1], k[2] + 1] },
  { id: 'week', days: 7 },
  { id: 'month', days: 30.44, key: p => [p.y, p.m ?? 1, 1], next: k => [k[0], k[1] + 1, 1] },
  { id: 'quarter', days: 91.3, key: p => [p.y, Math.floor(((p.m ?? 1) - 1) / 3) * 3 + 1, 1], next: k => [k[0], k[1] + 3, 1] },
  { id: 'year', days: 365.25, key: p => [p.y, 1, 1], next: k => [k[0] + 1, 1, 1] },
  ...[5, 10, 25, 50, 100, 250, 500, 1000].map(n => ({ id: `${n} years`, days: 365.25 * n, key: p => [Math.floor(p.y / n) * n, 1, 1], next: k => [k[0] + n, 1, 1] })),
];
const utc = ([y, m, d]) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); return t; };
export function dateBins(values, count = 30) {
  const ps = values.map(dateParts).filter(Boolean);
  if (!ps.length) return { unit: 'year', bin: () => null, bins: [] };
  let lo = Infinity, hi = -Infinity;
  for (const p of ps) { const t = +utc([p.y, p.m ?? 1, p.d ?? 1]); if (t < lo) lo = t; if (t > hi) hi = t; }
  const span = (hi - lo) / 864e5;
  const unit = UNITS.find(u => span / u.days <= count) || UNITS[UNITS.length - 1];
  const keyFn = unit.id === 'week'
    ? p => { const t = utc([p.y, p.m ?? 1, p.d ?? 1]); const dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
    : unit.key;
  const nextFn = unit.id === 'week' ? k => [k[0], k[1], k[2] + 7] : unit.next;
  const bin = v => { const p = dateParts(v); if (!p) return null; const k = keyFn(p); return { x0: utc(k), x1: utc(nextFn(k)), key: k.join('-') }; };
  return { unit: unit.id, bin };
}

/* ---------- countries (for the map) ---------- */
export function countryMatcher(countries) {
  // countries: [[iso3, iso2, num, name, ...aliases]]
  const byKey = new Map();
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
  for (const c of countries) {
    const [iso3, iso2, num, name, ...aliases] = c;
    const rec = { iso3, iso2, num, name };
    byKey.set(iso3, rec); if (iso2) byKey.set(iso2, rec); if (num) byKey.set(num, rec);
    for (const n of [name, ...aliases]) byKey.set('n:' + norm(n), rec);
  }
  return v => {
    if (isEmpty(v)) return null;
    const s = String(v).trim();
    if (/^[A-Za-z]{3}$/.test(s) && byKey.has(s.toUpperCase())) return byKey.get(s.toUpperCase());
    if (/^[A-Za-z]{2}$/.test(s) && byKey.has(s.toUpperCase())) return byKey.get(s.toUpperCase());
    if (/^\d{1,3}$/.test(s) && byKey.has(s.padStart(3, '0'))) return byKey.get(s.padStart(3, '0'));
    return byKey.get('n:' + norm(s)) || null;
  };
}

/* ---------- the chart's rows ---------- */
/**
 * @param table   { columns, rows } after the steps
 * @param c       chart choice { type, x, y, fn, color, bins }
 * @param opts    { ordered: true when the steps end in a sort (keep that order for bars), country: matcher for maps }
 */
export function prepareChart(table, c, opts = {}) {
  const problem = chartProblem(table, c);
  if (problem) return { ok: false, error: problem };
  if (!table.rows.length) return { ok: false, error: 'No rows to chart: the steps leave nothing' };
  const col = n => table.columns.find(x => x.name === n);
  const X = col(c.x), Y = c.y ? col(c.y) : null, S = c.color ? col(c.color) : null;
  const fn = !Y || c.fn === 'count' ? 'count' : c.fn || 'sum';
  const valueLabel = fn === 'count' ? 'Rows' : fn === 'sum' ? Y.name : `${CHART_FNS[fn]} of ${Y.name}`;
  const notes = [];
  const out = { ok: true, type: c.type, x: X.name, y: Y?.name || '', fn, color: S?.name || '', valueLabel, notes };
  const getS = S ? r => label(r[S.name]) : () => '';

  if (c.type === 'scatter') {
    const lab = table.columns.find(k => k.type === 'string' && k.name !== S?.name);
    let pts = [];
    for (const r of table.rows) {
      const x = xValue(r[X.name], X.type), y = xValue(r[Y.name], Y.type);
      if (x == null || y == null) continue;
      pts.push({ x, y, s: getS(r), label: lab ? label(r[lab.name]) : '', raw: r });
    }
    const dropped = table.rows.length - pts.length;
    if (dropped) notes.push(`${dropped.toLocaleString('en-GB')} rows without both values are left out.`);
    if (pts.length > LIMITS.points) { notes.push(`Showing the first ${LIMITS.points.toLocaleString('en-GB')} of ${pts.length.toLocaleString('en-GB')} points; add a filter or a limit to choose.`); pts = pts.slice(0, LIMITS.points); }
    const f = S ? foldSeries(pts, p => p.s, () => 1, LIMITS.scatterColours, LIMITS.scatterColours) : null;
    if (f) { for (const p of pts) p.s = f.map(p.s); if (f.other) notes.push(`Colours for the ${LIMITS.scatterColours} most common values of ${S.name}; the other ${(f.total - LIMITS.scatterColours).toLocaleString('en-GB')} are grouped as “Other”.`); }
    Object.assign(out, { xType: X.type, yType: Y.type, data: pts, series: f ? f.series : [], labelName: lab?.name || '' });
    out.table = { columns: [lab && { name: lab.name, type: 'string' }, { name: X.name, type: X.type }, { name: Y.name, type: Y.type }, S && { name: S.name, type: 'string' }].filter(Boolean),
      rows: pts.slice(0, LIMITS.tableRows).map(p => ({ ...(lab ? { [lab.name]: p.label } : {}), [X.name]: p.raw[X.name], [Y.name]: p.raw[Y.name], ...(S ? { [S.name]: p.s } : {}) })) };
    if (pts.length > LIMITS.tableRows) out.tableNote = `First ${LIMITS.tableRows.toLocaleString('en-GB')} of ${pts.length.toLocaleString('en-GB')} points.`;
    return out;
  }

  if (c.type === 'hist') {
    const vals = [], rows = [];
    for (const r of table.rows) { const v = r[X.name]; if (isEmpty(v)) continue; vals.push(X.type === 'number' ? toNum(v) : v); rows.push(r); }
    const want = c.bins || (vals.length < 50 ? 10 : vals.length < 500 ? 20 : 30);
    let binOf, unit = '';
    if (X.type === 'number') {
      const bins = numberBins(vals, want);
      const step = bins.length > 1 ? bins[1].x0 - bins[0].x0 : 1, start = bins[0]?.x0 ?? 0;
      binOf = v => { const x = toNum(v); if (x == null) return null; const i = Math.min(bins.length - 1, Math.max(0, Math.floor((x - start) / step + 1e-9))); return { ...bins[i], key: String(i) }; };
    } else { const b = dateBins(vals, want); binOf = b.bin; unit = b.unit; }
    const f = S ? foldSeries(rows, getS, () => 1, LIMITS.series, LIMITS.series - 1) : null;
    const cells = new Map();
    for (const r of rows) {
      const b = binOf(r[X.name]);
      if (!b) continue;
      const s = f ? f.map(getS(r)) : '';
      const k = b.key + '\u001f' + s;
      const e = cells.get(k);
      if (e) e.y++; else cells.set(k, { x0: b.x0, x1: b.x1, s, y: 1 });
    }
    const data = [...cells.values()].sort((a, b) => +a.x0 - +b.x0 || (f ? f.series.indexOf(a.s) - f.series.indexOf(b.s) : 0));
    if (f?.other) notes.push(`The ${LIMITS.series - 1} most common values of ${S.name} have their own colour; the other ${(f.total - LIMITS.series + 1).toLocaleString('en-GB')} are grouped as “Other”.`);
    if (unit) notes.push(`Each bar is ${/^\d/.test(unit) ? unit : unit === 'week' ? 'a week (Monday to Sunday)' : 'a ' + unit}.`);
    Object.assign(out, { xType: X.type, data, series: f ? f.series : [], unit, valueLabel: 'Rows' });
    const fmtEdge = v => (v instanceof Date ? v.toISOString().slice(0, 10) : formatValue(v, 'number'));
    out.table = { columns: [{ name: 'from', type: X.type }, { name: 'to (not included)', type: X.type }, ...(S ? [{ name: S.name, type: 'string' }] : []), { name: 'rows', type: 'number' }],
      rows: data.map(d => ({ from: fmtEdge(d.x0), 'to (not included)': fmtEdge(d.x1), ...(S ? { [S.name]: d.s } : {}), rows: d.y })) };
    return out;
  }

  // bar, line, area, map: one value per category (and series), computed from the rows with the chosen function.
  let rows = table.rows;
  let keyX = r => r[X.name];
  let names = null;
  if (c.type === 'map') {
    const match = opts.country;
    if (!match) return { ok: false, error: 'Country names are still loading' };
    const unknown = new Map();
    names = new Map();
    rows = rows.filter(r => {
      const m = match(r[X.name]);
      if (!m) { const k = label(r[X.name]); unknown.set(k, (unknown.get(k) || 0) + 1); return false; }
      return true;
    });
    keyX = r => { const m = match(r[X.name]); names.set(m.iso3, m); return m.iso3; };
    if (!rows.length) return { ok: false, error: `None of the values in “${X.name}” are countries PRP recognises (ISO codes or English names)` };
    if (unknown.size) {
      const list = [...unknown.entries()].sort((a, b) => b[1] - a[1]);
      notes.push(`${list.length.toLocaleString('en-GB')} value${list.length === 1 ? ' is' : 's are'} not a country PRP recognises and ${list.length === 1 ? 'is' : 'are'} left out: ${list.slice(0, 8).map(e => e[0]).join(', ')}${list.length > 8 ? ', …' : ''}.`);
    }
  }
  const f = S && c.type !== 'map' ? foldSeries(rows, getS, () => 1, LIMITS.series, LIMITS.series - 1) : null;
  if (f?.other) notes.push(`The ${LIMITS.series - 1} most common values of ${S.name} have their own colour; the other ${(f.total - LIMITS.series + 1).toLocaleString('en-GB')} are grouped as “Other”.`);
  const cells = new Map(), order = [];
  for (const r of rows) {
    const xv = keyX(r), s = f ? f.map(getS(r)) : '';
    const k = keyOf(xv) + '\u001f' + s;
    let e = cells.get(k);
    if (!e) { cells.set(k, e = { xv, s, vals: [] }); order.push(e); }
    e.vals.push(Y ? r[Y.name] : r);
  }
  let data = order.map(e => ({ xv: e.xv, s: e.s, y: aggregate(fn, e.vals, Y?.type) })).filter(d => d.y != null);
  const ordinal = c.type === 'bar' && (X.type === 'number' || X.type === 'date');
  let xType = c.type === 'map' ? 'country' : c.type === 'bar' ? (ordinal ? 'ordinal' : 'category') : X.type;

  if (c.type === 'bar') {
    const totals = new Map(), firstAt = new Map();
    data.forEach((d, i) => { const k = keyOf(d.xv); totals.set(k, (totals.get(k) || 0) + Math.abs(d.y)); if (!firstAt.has(k)) firstAt.set(k, i); });
    let cats = [...firstAt.keys()];
    const xs = new Map(data.map(d => [keyOf(d.xv), d.xv]));
    if (ordinal) cats.sort((a, b) => comparator(X.type)(xs.get(a), xs.get(b)));
    else if (!opts.ordered) cats.sort((a, b) => totals.get(b) - totals.get(a));
    const cap = ordinal ? LIMITS.ordinalBars : LIMITS.bars;
    if (cats.length > cap) {
      notes.push(ordinal ? `Showing the first ${cap} of ${cats.length.toLocaleString('en-GB')} values of ${X.name}; a line chart or a histogram shows them all.`
        : `Showing ${opts.ordered ? 'the first' : 'the largest'} ${cap} of ${cats.length.toLocaleString('en-GB')} values of ${X.name}${opts.ordered ? ' in your sort order' : ''}.`);
      cats = cats.slice(0, cap);
    }
    const rank = new Map(cats.map((k, i) => [k, i]));
    data = data.filter(d => rank.has(keyOf(d.xv))).sort((a, b) => rank.get(keyOf(a.xv)) - rank.get(keyOf(b.xv)) || (f ? f.series.indexOf(a.s) - f.series.indexOf(b.s) : 0));
    out.categories = cats.map(k => label(xs.get(k)));
    for (const d of data) d.x = label(d.xv);
  } else if (c.type === 'map') {
    for (const d of data) { const m = names.get(d.xv); d.x = m.name; d.iso3 = m.iso3; d.num = m.num; }
    data.sort((a, b) => b.y - a.y);
  } else {
    for (const d of data) d.x = xValue(d.xv, X.type);
    data = data.filter(d => d.x != null).sort((a, b) => +a.x - +b.x);
    if (c.type === 'area' && f && (fn === 'count' || fn === 'sum')) {
      // A stack needs every series at every x: missing combinations are zero.
      const have = new Set(data.map(d => +d.x + '\u001f' + d.s)), xs = [...new Map(data.map(d => [+d.x, d])).values()];
      for (const x of xs) for (const s of f.series) if (!have.has(+x.x + '\u001f' + s)) data.push({ xv: x.xv, x: x.x, s, y: 0 });
      data.sort((a, b) => +a.x - +b.x || f.series.indexOf(a.s) - f.series.indexOf(b.s));
    }
  }
  Object.assign(out, { xType, data, series: f ? f.series : [] });
  const xCol = c.type === 'map' ? 'country' : X.name;
  out.table = {
    columns: [{ name: xCol, type: c.type === 'map' ? 'string' : X.type }, ...(c.type === 'map' ? [{ name: 'iso3', type: 'string' }] : []), ...(f ? [{ name: S.name, type: 'string' }] : []), { name: valueLabel, type: 'number' }],
    rows: data.slice(0, LIMITS.tableRows).map(d => ({ [xCol]: c.type === 'map' ? d.x : d.xv, ...(c.type === 'map' ? { iso3: d.iso3 } : {}), ...(f ? { [S.name]: d.s } : {}), [valueLabel]: d.y })),
  };
  if (data.length > LIMITS.tableRows) out.tableNote = `First ${LIMITS.tableRows.toLocaleString('en-GB')} of ${data.length.toLocaleString('en-GB')} rows.`;
  return out;
}

/* ---------- a sensible first chart for a table ---------- */
function distinctCount(table, name, cap = 5000) {
  const seen = new Set();
  for (let i = 0; i < table.rows.length && i < cap; i++) { const v = table.rows[i][name]; if (!isEmpty(v)) seen.add(keyOf(v)); }
  return seen.size;
}
export function suggestChart(table) {
  const n = table.rows.length;
  if (!n) return null;
  const cols = table.columns;
  const nums = cols.filter(c => c.type === 'number' && !/(^|[._])(id|num|code|lat|lon|lng|latitude|longitude)$/i.test(c.name));
  const texts = cols.filter(c => c.type === 'string' || c.type === 'boolean');
  const dates = cols.filter(c => c.type === 'date');
  const sample = Math.min(n, 5000);
  // A small, narrow table with one row per label and a number (a grouped result): bars or a line of that number.
  if (n <= 300 && nums.length && cols.length <= 6) {
    const labelLike = c => !/(^|[._])(id|qid|key|uuid|url|link|wiki|wikipedia|source|ref)$/i.test(c.name) &&
      table.rows.slice(0, 200).every(r => r[c.name] == null || (String(r[c.name]).length <= 60 && !/^https?:\/\//.test(String(r[c.name]))));
    const lab = texts.find(c => labelLike(c) && distinctCount(table, c.name) === sample);
    if (lab) return { type: 'bar', x: lab.name, y: (nums.find(c => /^count$/i.test(c.name)) || nums[0]).name, fn: '', color: '', bins: 0 };
    const yearish = cols.find(c => c.type === 'number' && /year|decade|century/i.test(c.name) && distinctCount(table, c.name) === sample);
    if (yearish) { const y = nums.find(c => c !== yearish); if (y) return { type: 'line', x: yearish.name, y: y.name, fn: '', color: '', bins: 0 }; }
  }
  if (dates.length) return { type: 'hist', x: dates[0].name, y: '', fn: '', color: '', bins: 0 };
  // A text column with a few repeated values (a type, a region); yes/no columns only when there is nothing better.
  const cat = texts.map(c => ({ c, k: distinctCount(table, c.name) })).filter(e => e.k >= 2 && e.k <= 60 && e.k < sample)
    .sort((a, b) => (a.c.type === 'boolean') - (b.c.type === 'boolean') || (a.k < 3) - (b.k < 3) || a.k - b.k)[0];
  if (cat) return { type: 'bar', x: cat.c.name, y: '', fn: '', color: '', bins: 0 };
  if (nums.length) return { type: 'hist', x: nums[0].name, y: '', fn: '', color: '', bins: 0 };
  return null;
}

/** Is a column mostly countries? (share of distinct sampled values the matcher recognises) */
export function countryShare(table, name, match, cap = 400) {
  const seen = new Set();
  for (const r of table.rows) { const v = r[name]; if (!isEmpty(v) && typeof v !== 'object') seen.add(String(v)); if (seen.size >= cap) break; }
  if (!seen.size) return 0;
  let hit = 0;
  for (const v of seen) if (match(v)) hit++;
  return hit / seen.size;
}
