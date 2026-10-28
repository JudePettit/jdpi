// Data Analytics: an analysis is a plain object (the dataset, its steps or an SQL query, and the chart) that lives in
// the page's URL hash, so it can be shared and reopened. The hash is readable and is read back the same:
//
//   #d=calendar-events                       dataset id from the catalogue
//   &filter=type:eq:election                 column : condition : value   (eq ne gt ge lt le contains starts in empty notempty)
//   &where=deaths%20%3E%20100                an expression filter (see expr.js)
//   &select=country,date                     columns to keep, in order
//   &derive=decade:decade(date)              new column : expression
//   &unnest=countries                        one row per item of a list column
//   &group=country:count,sum~deaths          group-by columns : aggregates  (function[~column[~new name]])
//   &sort=-count,country                     columns, "-" for descending
//   &limit=20
//   &sql=SELECT%20…                          an SQL query instead of the steps (DuckDB, run on request)
//   &chart=bar&x=country&y=count&fn=sum&color=type&bins=30
//   &tab=catalogue                           the page's other view
//
// Names and values are percent-encoded (including ! ' ( ) * ~), so ":", ",", "~" and a leading "-" are always structure.
import { STEP_TYPES, CMPS, CMP_SYMBOLS, AGGS, aggName } from './engine.js';

const table = o => Object.freeze(Object.assign(Object.create(null), o));
export const CHART_TYPES = table({ bar: 'Bar', line: 'Line', area: 'Area', scatter: 'Scatter', hist: 'Histogram', map: 'Map' });
export const CHART_FNS = table({ sum: 'Sum', mean: 'Mean', median: 'Median', min: 'Minimum', max: 'Maximum', count: 'Count of rows' });
export const TABS = ['work', 'catalogue'];
const STEP_KEYS = new Set(Object.keys(STEP_TYPES));
// An address can carry any number of steps; a page reads at most this many (each one reruns on every change).
export const MAX_STEPS = 60;

export const emptyChart = () => ({ type: '', x: '', y: '', fn: '', color: '', bins: 0 });
export const emptySpec = () => ({ d: '', steps: [], sql: null, chart: emptyChart(), tab: 'work' });

const enc = s => encodeURIComponent(String(s ?? '')).replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encExpr = s => encodeURIComponent(String(s ?? '')); // keeps ( ) * ! ' ~ readable inside expressions and SQL
const dec = s => decodeURIComponent(String(s ?? ''));
const list = (raw, sep = ',') => (raw ? raw.split(sep).map(dec) : []);

/* ---------- steps to and from the hash ---------- */
export function stepToParam(s) {
  switch (s.op) {
    case 'filter': return `filter=${enc(s.col)}:${enc(s.cmp || 'eq')}` + (s.cmp === 'empty' || s.cmp === 'notempty' ? '' : `:${enc(s.val ?? '')}`);
    case 'where': return `where=${encExpr(s.expr)}`;
    case 'select': return `select=${(s.cols || []).map(enc).join(',')}`;
    case 'derive': return `derive=${enc(s.as)}:${encExpr(s.expr)}`;
    case 'unnest': return `unnest=${enc(s.col)}`;
    case 'group': return `group=${(s.by || []).map(enc).join(',')}:` + (s.aggs || []).map(a => [a.fn, a.col || '', a.as || ''].map(enc).join('~').replace(/~+$/, '')).join(',');
    case 'sort': return `sort=${(s.by || []).map(b => (b.desc ? '-' : '') + enc(b.col).replace(/^-/, '%2D')).join(',')}`;
    case 'limit': return `limit=${Math.max(0, Math.floor(Number(s.n) || 0))}`;
    default: return '';
  }
}
export function paramToStep(key, raw) {
  switch (key) {
    case 'filter': { const [col, cmp, ...rest] = raw.split(':'); const c = dec(cmp || 'eq'); return { op: 'filter', col: dec(col), cmp: CMPS[c] ? c : 'eq', val: rest.map(dec).join(':') }; }
    case 'where': return { op: 'where', expr: dec(raw) };
    case 'select': return { op: 'select', cols: list(raw) };
    case 'derive': { const i = raw.indexOf(':'); return { op: 'derive', as: dec(i < 0 ? raw : raw.slice(0, i)), expr: i < 0 ? '' : dec(raw.slice(i + 1)) }; }
    case 'unnest': return { op: 'unnest', col: dec(raw) };
    case 'group': {
      const i = raw.indexOf(':'), keys = i < 0 ? raw : raw.slice(0, i), aggs = i < 0 ? '' : raw.slice(i + 1);
      return {
        op: 'group', by: list(keys),
        aggs: aggs ? aggs.split(',').map(a => { const [fn, col = '', as = ''] = a.split('~').map(dec); return { fn: AGGS[fn] ? fn : 'count', col, as }; }) : [{ fn: 'count', col: '', as: '' }],
      };
    }
    case 'sort': return { op: 'sort', by: raw.split(',').filter(Boolean).map(b => ({ col: dec(b.replace(/^-/, '')), desc: b.startsWith('-') })) };
    case 'limit': return { op: 'limit', n: Math.max(0, Math.floor(Number(dec(raw)) || 0)) };
    default: return null;
  }
}

/* ---------- the whole analysis ---------- */
export function toHash(spec) {
  const parts = [];
  if (spec.d) parts.push(`d=${enc(spec.d)}`);
  if (spec.sql != null && spec.sql !== '') parts.push(`sql=${encExpr(spec.sql)}`);
  else for (const s of spec.steps || []) { const p = stepToParam(s); if (p) parts.push(p); }
  const c = spec.chart || {};
  if (c.type) {
    parts.push(`chart=${enc(c.type)}`);
    for (const k of ['x', 'y', 'fn', 'color']) if (c[k]) parts.push(`${k}=${enc(c[k])}`);
    if (c.bins) parts.push(`bins=${Math.floor(c.bins)}`);
  }
  if (spec.tab && spec.tab !== 'work') parts.push(`tab=${enc(spec.tab)}`);
  return parts.length ? '#' + parts.join('&') : '';
}

const TOO_MANY = `Only the first ${MAX_STEPS} steps in the address were read`;
/** Read an analysis from a hash. Unreadable parts are skipped and listed in `problems`. */
export function parseHash(hash) {
  const spec = emptySpec(), problems = [];
  const s = String(hash ?? '').replace(/^#/, '');
  if (!s || s.startsWith('/')) return { spec, problems }; // "#/…" is the shell's own address form, not an analysis
  for (const part of s.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const key = (i < 0 ? part : part.slice(0, i)).toLowerCase(), raw = i < 0 ? '' : part.slice(i + 1);
    try {
      if (STEP_KEYS.has(key)) {
        if (spec.steps.length >= MAX_STEPS) { if (!problems.includes(TOO_MANY)) problems.push(TOO_MANY); continue; }
        const step = paramToStep(key, raw); if (step) spec.steps.push(step); continue;
      }
      switch (key) {
        case 'd': case 'dataset': spec.d = dec(raw); break;
        case 'sql': spec.sql = dec(raw); break;
        case 'chart': { const t = dec(raw); if (CHART_TYPES[t]) spec.chart.type = t; else if (t && t !== 'none') problems.push(`Unknown chart “${t}”`); break; }
        case 'x': case 'y': case 'color': spec.chart[key] = dec(raw); break;
        case 'fn': { const f = dec(raw); if (CHART_FNS[f]) spec.chart.fn = f; break; }
        case 'bins': { const n = Math.floor(Number(dec(raw))); if (n >= 2 && n <= 200) spec.chart.bins = n; break; }
        case 'tab': { const t = dec(raw); if (TABS.includes(t)) spec.tab = t; break; }
        default: break; // unknown keys are ignored, so later additions do not break older links
      }
    } catch { problems.push(`Could not read “${key}” in the address`); }
  }
  return { spec, problems };
}

/** A copy that can be compared or stored. */
export const cloneSpec = spec => JSON.parse(JSON.stringify(spec));
export const sameSpec = (a, b) => toHash(a) === toHash(b);

/* ---------- describing an analysis in words (captions, the AI prompt) ---------- */
// Values are quoted unless they are numbers or dates, which read better bare (year ≥ 1500, date is in 2026-10).
const q = s => (/^\s*-?\d+(\.\d+)?(-\d{2}){0,2}\s*$/.test(String(s)) ? String(s).trim() : `“${s}”`);
export function describeStep(s) {
  switch (s.op) {
    case 'filter': {
      const sym = CMP_SYMBOLS[s.cmp] || s.cmp;
      if (s.cmp === 'empty' || s.cmp === 'notempty') return `keep rows where ${s.col} ${sym}`;
      if (s.cmp === 'in') return `keep rows where ${s.col} is one of ${String(s.val ?? '').split('|').map(x => q(x.trim())).join(', ')}`;
      return `keep rows where ${s.col} ${sym} ${q(s.val ?? '')}`;
    }
    case 'where': return `keep rows where ${s.expr}`;
    case 'select': return `keep the columns ${(s.cols || []).join(', ')}`;
    case 'derive': return `add the column ${s.as} = ${s.expr}`;
    case 'unnest': return `one row per item of the list ${s.col}`;
    case 'group': {
      const aggs = (s.aggs?.length ? s.aggs : [{ fn: 'count' }]).map(a => (a.fn === 'count' && !a.col ? 'count of rows' : `${(AGGS[a.fn] || a.fn).toLowerCase()} of ${a.col}`) + (a.as && a.as !== aggName({ fn: a.fn, col: a.col }) ? ` as ${a.as}` : ''));
      return (s.by?.length ? `group by ${s.by.join(', ')}` : 'summarise all rows') + `: ${aggs.join(', ')}`;
    }
    case 'sort': return `sort by ${(s.by || []).map(b => b.col + (b.desc ? ' (descending)' : '')).join(', then ')}`;
    case 'limit': return `keep the first ${s.n} rows`;
    default: return s.op;
  }
}
export function describeChart(c) {
  if (!c?.type) return '';
  const what = !c.y || c.fn === 'count' ? 'count of rows' : `${c.fn && c.fn !== 'sum' ? (CHART_FNS[c.fn] || c.fn).toLowerCase() + ' of ' : ''}${c.y}`;
  const by = c.color ? `, coloured by ${c.color}` : '';
  switch (c.type) {
    case 'bar': return `bar chart of ${what} by ${c.x}${by}`;
    case 'line': return `line chart of ${what} over ${c.x}${c.color ? `, one line per ${c.color}` : ''}`;
    case 'area': return `stacked area chart of ${what} over ${c.x}${c.color ? `, one band per ${c.color}` : ''}`;
    case 'scatter': return `scatter plot of ${c.y} against ${c.x}${by}`;
    case 'hist': return `histogram of ${c.x}${c.bins ? ` in about ${c.bins} bins` : ''}${by}`;
    case 'map': return `world map of ${what} by country${/countr/i.test(c.x) ? '' : ` (${c.x})`}`;
    default: return c.type;
  }
}
