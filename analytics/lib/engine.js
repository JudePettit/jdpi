// Data Analytics: the transform engine. Plain functions over { columns: [{ name, type }], rows: [object] }, the same in
// the browser and in node (tests/data-analytics.test.mjs). Steps run in order; a step that cannot run (an unknown
// column, a bad value) is reported and skipped, and the rest still run.
import { toNum, compileExpr, dateParts, truthy, textBudget } from './expr.js';

export { toNum } from './expr.js';

const table = o => Object.freeze(Object.assign(Object.create(null), o)); // lookups without a prototype ("constructor" is just a name)
export const STEP_TYPES = table({
  filter: 'Filter',
  where: 'Filter by expression',
  select: 'Choose columns',
  derive: 'Derive a column',
  unnest: 'One row per list item',
  group: 'Group and aggregate',
  sort: 'Sort',
  limit: 'Limit',
});
export const CMPS = table({ eq: 'is', ne: 'is not', gt: 'after / more than', ge: 'from / at least', lt: 'before / less than', le: 'up to / at most', contains: 'contains', starts: 'starts with', in: 'is one of', empty: 'is empty', notempty: 'is not empty' });
export const CMP_SYMBOLS = table({ eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤', contains: 'contains', starts: 'starts with', in: 'is one of', empty: 'is empty', notempty: 'is not empty' });
export const AGGS = table({ count: 'Count', sum: 'Sum', mean: 'Mean', median: 'Median', min: 'Minimum', max: 'Maximum', distinct: 'Distinct values' });
export const NUMERIC_AGGS = new Set(['sum', 'mean', 'median']);
export const MAX_GROUPS = 200000;
// "One row per list item" multiplies rows (a list made with split(text, ''), unnested twice, would be millions): at most
// this many rows come out of it, so a shared link cannot fill the tab's memory.
export const MAX_UNNEST_ROWS = 500000;

export class StepError extends Error { constructor(message) { super(message); this.name = 'StepError'; } }

/* ---------- values and types ---------- */
const DATE_TEXT = /^-?\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;
export const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v));
export const isPlainObject = v => v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** The kind of one value: number, boolean, date (ISO-style text, at least year and month), string, array, object. */
export function kindOf(v) {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return null;
  if (typeof v === 'number' || typeof v === 'bigint') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return DATE_TEXT.test(v) ? 'date' : 'string';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  return 'object';
}
/** One type for a column from (a sample of) its values; mixed kinds fall back to string. */
export function inferType(values) {
  const seen = new Set();
  for (const v of values) { const k = kindOf(v); if (k && v !== '') seen.add(k); if (seen.size > 2) break; }
  if (!seen.size) return 'empty';
  if (seen.size === 1) return [...seen][0];
  if (seen.size === 2 && seen.has('date') && seen.has('string')) return 'string';
  return 'string';
}
function sampleValues(rows, name, max = 2000) {
  const out = [], step = Math.max(1, Math.floor(rows.length / max));
  for (let i = 0; i < rows.length && out.length < max; i += step) { const v = rows[i][name]; if (v != null && v !== '') out.push(v); }
  if (!out.length) for (let i = 0; i < rows.length && out.length < 50; i++) { const v = rows[i][name]; if (v != null && v !== '') out.push(v); }
  return out;
}
/** Columns of a table: the names in order, each with its type (declared catalogue types fill in empty columns). */
export function columnsOf(rows, names, declared = {}) {
  return names.map(name => {
    let type = inferType(sampleValues(rows, name));
    if (type === 'empty' && declared[name]) type = declared[name];
    return { name, type };
  });
}

/* ---------- records to rows ---------- */
// Nested objects are spread into dotted columns (place.lat, place.lon) when every value in the column is an object and
// together they have at most `maxKeys` keys, to `maxDepth` levels; lists and larger objects stay as single values.
function planFor(objs, depth, maxKeys, maxDepth) {
  const plan = new Map();
  if (depth >= maxDepth) return plan;
  const byKey = new Map();
  for (const o of objs) for (const k of Object.keys(o)) { let a = byKey.get(k); if (!a) byKey.set(k, a = []); a.push(o[k]); }
  for (const [k, vals] of byKey) {
    const present = vals.filter(v => v != null);
    if (!present.length || !present.every(isPlainObject)) continue;
    const sub = new Set();
    for (const v of present) for (const s of Object.keys(v)) sub.add(s);
    if (!sub.size || sub.size > maxKeys) continue;
    plan.set(k, planFor(present, depth + 1, maxKeys, maxDepth));
  }
  return plan;
}
function flatten(rec, plan, prefix, out) {
  for (const k of Object.keys(rec)) {
    if (k === '__proto__') continue; // never a column: assigning it would change the row's prototype
    const v = rec[k], sub = plan.get(k);
    if (sub) { if (isPlainObject(v)) flatten(v, sub, prefix + k + '.', out); }
    else out[prefix + k] = v;
  }
  return out;
}
/** Records (any JSON array) to a table. Primitive records become a single "value" column. */
export function toTable(records, { declared = {}, maxKeys = 40, maxDepth = 2, sample = 500 } = {}) {
  const list = Array.isArray(records) ? records : [];
  const objs = [], step = Math.max(1, Math.floor(list.length / sample));
  for (let i = 0; i < list.length && objs.length < sample; i += step) if (isPlainObject(list[i])) objs.push(list[i]);
  const plan = planFor(objs, 0, maxKeys, maxDepth);
  const names = new Set(), rows = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const row = isPlainObject(r) ? flatten(r, plan, '', {}) : { value: r };
    for (const k in row) names.add(k);
    rows[i] = row;
  }
  return { columns: columnsOf(rows, [...names], declared), rows };
}

/* ---------- comparing and keys ---------- */
const lower = v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase();
export function keyOf(v) {
  if (v == null || v === '') return '\u0000';
  if (typeof v === 'object') return v instanceof Date ? v.toISOString() : JSON.stringify(v);
  return String(v);
}
const PREC = p => (p.d != null ? 3 : p.m != null ? 2 : 1);
/** Compare two dates at the precision of `b` (a year, a month or a day): -1, 0, 1, or null when either is unreadable. */
export function compareDates(a, b, prec) {
  const p = dateParts(a), q = dateParts(b);
  if (!p || !q) return null;
  const n = prec ?? PREC(q);
  const pa = [p.y, p.m ?? 1, p.d ?? 1].slice(0, n), qa = [q.y, q.m ?? 1, q.d ?? 1].slice(0, n);
  for (let i = 0; i < n; i++) if (pa[i] !== qa[i]) return pa[i] < qa[i] ? -1 : 1;
  return 0;
}
/** A comparator for sorting values of one type, missing values last. */
export function comparator(type) {
  if (type === 'number') return (a, b) => { const x = toNum(a), y = toNum(b); return x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y; };
  if (type === 'date') return (a, b) => {
    const x = dateParts(a), y = dateParts(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return (x.y - y.y) || ((x.m ?? 0) - (y.m ?? 0)) || ((x.d ?? 0) - (y.d ?? 0)) || (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  };
  if (type === 'boolean') return (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a === b ? 0 : a ? 1 : -1));
  return (a, b) => {
    if (isEmpty(a)) return isEmpty(b) ? 0 : 1;
    if (isEmpty(b)) return -1;
    const x = lower(a), y = lower(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
}

/* ---------- conditions ---------- */
const BOOL = table({ true: true, yes: true, y: true, 1: true, false: false, no: false, n: false, 0: false });
function predicate(type, cmp, val) {
  if (!CMPS[cmp]) throw new StepError(`Unknown condition “${cmp}”`);
  if (cmp === 'empty') return isEmpty;
  if (cmp === 'notempty') return v => !isEmpty(v);
  const raw = String(val ?? '').trim();
  if (!raw) throw new StepError('Give a value to compare with');
  const any = (v, f) => (Array.isArray(v) ? v.some(f) : f(v));

  if (cmp === 'in') {
    const items = raw.split('|').map(s => s.trim()).filter(Boolean);
    if (type === 'number') { const set = new Set(items.map(toNum).filter(x => x != null)); return v => any(v, x => set.has(toNum(x))); }
    if (type === 'date') return v => any(v, x => items.some(i => compareDates(x, i) === 0));
    const set = new Set(items.map(s => s.toLowerCase()));
    return v => any(v, x => set.has(lower(x)));
  }
  if (cmp === 'contains') { const t = raw.toLowerCase(); return v => any(v, x => lower(x).includes(t)); }
  if (cmp === 'starts') { const t = raw.toLowerCase(); return v => any(v, x => lower(x).startsWith(t)); }

  if (type === 'array') {
    const t = raw.toLowerCase();
    if (cmp === 'eq') return v => Array.isArray(v) ? v.some(x => lower(x) === t) : lower(v) === t;
    if (cmp === 'ne') return v => !(Array.isArray(v) ? v.some(x => lower(x) === t) : lower(v) === t);
    throw new StepError('Lists can be filtered with is, is not, contains, starts with, is one of and is empty');
  }
  if (type === 'number') {
    const n = toNum(raw);
    if (n == null) throw new StepError(`“${raw}” is not a number`);
    const f = { eq: x => x === n, ne: x => x !== n, gt: x => x > n, ge: x => x >= n, lt: x => x < n, le: x => x <= n }[cmp];
    return cmp === 'ne' ? v => { const x = toNum(v); return x == null || f(x); } : v => { const x = toNum(v); return x != null && f(x); };
  }
  if (type === 'date') {
    // On dates a value is a period: 2026 is the whole year, 2026-10 the month. "is" matches inside it, "after" past its end.
    const q = dateParts(raw);
    if (!q) throw new StepError(`“${raw}” is not a date (write 2026, 2026-10 or 2026-10-28)`);
    const test = { eq: c => c === 0, ne: c => c !== 0, gt: c => c > 0, ge: c => c >= 0, lt: c => c < 0, le: c => c <= 0 }[cmp];
    return v => { const c = compareDates(v, raw); return c == null ? cmp === 'ne' : test(c); };
  }
  if (type === 'boolean') {
    const b = BOOL[raw.toLowerCase()];
    if (b === undefined) throw new StepError('Write true or false');
    if (cmp === 'eq') return v => v != null && truthy(v) === b;
    if (cmp === 'ne') return v => v == null || truthy(v) !== b;
    throw new StepError('Yes/no columns can be filtered with is and is not');
  }
  const t = raw.toLowerCase();
  if (cmp === 'eq') return v => lower(v) === t;
  if (cmp === 'ne') return v => lower(v) !== t;
  const f = { gt: x => x > t, ge: x => x >= t, lt: x => x < t, le: x => x <= t }[cmp];
  return v => !isEmpty(v) && f(lower(v));
}

/* ---------- aggregates ---------- */
const nums = vals => { const out = []; for (const v of vals) { const x = toNum(v); if (x != null) out.push(x); } return out; };
export function median(xs) {
  if (!xs.length) return null;
  const s = Float64Array.from(xs).sort(), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function aggregate(fn, vals, type) {
  switch (fn) {
    case 'count': return vals.length;
    case 'distinct': return new Set(vals.filter(v => !isEmpty(v)).map(keyOf)).size;
    case 'sum': { const x = nums(vals); return x.length ? x.reduce((a, b) => a + b, 0) : null; }
    case 'mean': { const x = nums(vals); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }
    case 'median': return median(nums(vals));
    case 'min': case 'max': {
      const present = vals.filter(v => !isEmpty(v));
      if (!present.length) return null;
      if (type === 'number') { const x = nums(present); return x.length ? x.reduce(fn === 'min' ? (a, b) => Math.min(a, b) : (a, b) => Math.max(a, b)) : null; }
      const c = comparator(type);
      return present.reduce((a, b) => (fn === 'min' ? (c(b, a) < 0 ? b : a) : (c(b, a) > 0 ? b : a)));
    }
    default: throw new StepError(`Unknown aggregate “${fn}”`);
  }
}
export function aggName(a) { return a.as?.trim() || (a.fn === 'count' && !a.col ? 'count' : `${a.fn}_${a.col}`); }
const uniqueName = (name, taken) => { let n = name, i = 2; while (taken.has(n)) n = `${name}_${i++}`; taken.add(n); return n; };

/* ---------- steps ---------- */
function need(table, col) {
  const c = table.columns.find(x => x.name === col);
  if (!c) {
    const near = col && table.columns.find(x => x.name.toLowerCase() === String(col).toLowerCase());
    throw new StepError(col ? `No column “${col}”${near ? ` (did you mean ${near.name}?)` : ''}` : 'Choose a column');
  }
  return c;
}
const STEPS = table({
  filter(t, s) {
    const c = need(t, s.col), test = predicate(c.type, s.cmp || 'eq', s.val);
    return { columns: t.columns, rows: t.rows.filter(r => test(r[c.name] ?? null)) };
  },
  where(t, s, ctx) {
    const f = compileExpr(s.expr, t.columns.map(c => c.name), { budget: ctx?.text });
    return { columns: t.columns, rows: t.rows.filter(r => truthy(f(r))) };
  },
  select(t, s) {
    const cols = (s.cols || []).map(n => need(t, n));
    if (!cols.length) throw new StepError('Choose at least one column');
    return { columns: cols, rows: t.rows }; // rows keep their other fields; only the listed columns are visible from here on
  },
  derive(t, s, ctx) {
    const name = String(s.as ?? '').trim();
    if (!name) throw new StepError('Name the new column');
    if (name === '__proto__') throw new StepError('Choose another name');
    const f = compileExpr(s.expr, t.columns.map(c => c.name), { budget: ctx?.text });
    const rows = t.rows.map(r => ({ ...r, [name]: f(r) }));
    const type = inferType(sampleValues(rows, name));
    const columns = t.columns.some(c => c.name === name) ? t.columns.map(c => (c.name === name ? { name, type } : c)) : [...t.columns, { name, type }];
    return { columns, rows };
  },
  unnest(t, s) {
    const c = need(t, s.col);
    let n = 0;
    for (const r of t.rows) { const v = r[c.name]; n += Array.isArray(v) && v.length ? v.length : 1; }
    if (n > MAX_UNNEST_ROWS) throw new StepError(`This would make ${n.toLocaleString('en-GB')} rows, more than ${MAX_UNNEST_ROWS.toLocaleString('en-GB')}: filter the rows first`);
    const rows = [];
    for (const r of t.rows) {
      const v = r[c.name];
      if (Array.isArray(v) && v.length) for (const x of v) rows.push({ ...r, [c.name]: x });
      else rows.push(Array.isArray(v) ? { ...r, [c.name]: null } : r);
    }
    return { columns: t.columns.map(x => (x.name === c.name ? { name: c.name, type: inferType(sampleValues(rows, c.name)) } : x)), rows };
  },
  group(t, s) {
    const keys = (s.by || []).map(n => need(t, n));
    const aggs = (s.aggs?.length ? s.aggs : [{ fn: 'count' }]).map(a => {
      if (!AGGS[a.fn]) throw new StepError(`Unknown aggregate “${a.fn}”`);
      const col = a.fn === 'count' && !a.col ? null : need(t, a.col);
      if (col && NUMERIC_AGGS.has(a.fn) && !['number', 'string', 'empty'].includes(col.type)) throw new StepError(`${AGGS[a.fn]} needs a number column; “${col.name}” is ${col.type === 'date' ? 'a date' : col.type === 'array' ? 'a list' : col.type}`);
      return { fn: a.fn, col, as: a.as };
    });
    const groups = new Map();
    for (const r of t.rows) {
      const k = keys.length === 1 ? keyOf(r[keys[0].name]) : keys.map(c => keyOf(r[c.name])).join('\u001f');
      let g = groups.get(k);
      if (!g) {
        if (groups.size >= MAX_GROUPS) throw new StepError(`More than ${MAX_GROUPS.toLocaleString('en-GB')} groups: group by fewer or coarser columns`);
        groups.set(k, g = { first: r, rows: [] });
      }
      g.rows.push(r);
    }
    if (!keys.length && !groups.size) groups.set('', { first: {}, rows: [] });
    const taken = new Set([...keys.map(c => c.name), '__proto__']);
    const names = aggs.map(a => uniqueName(aggName({ fn: a.fn, col: a.col?.name, as: a.as }), taken));
    const rows = [];
    for (const g of groups.values()) {
      const row = {};
      for (const c of keys) row[c.name] = g.first[c.name] ?? null;
      aggs.forEach((a, i) => { row[names[i]] = aggregate(a.fn, a.col ? g.rows.map(r => r[a.col.name]) : g.rows, a.col?.type); });
      rows.push(row);
    }
    const aggType = a => (['count', 'distinct', 'sum', 'mean', 'median'].includes(a.fn) ? 'number' : a.col?.type || 'number');
    return { columns: [...keys.map(c => ({ name: c.name, type: c.type })), ...aggs.map((a, i) => ({ name: names[i], type: aggType(a) }))], rows };
  },
  sort(t, s) {
    const by = (s.by || []).filter(b => b && b.col).map(b => ({ c: need(t, b.col), desc: !!b.desc }));
    if (!by.length) throw new StepError('Choose a column to sort by');
    const cmps = by.map(b => ({ name: b.c.name, f: comparator(b.c.type), desc: b.desc }));
    const idx = t.rows.map((r, i) => i);
    idx.sort((i, j) => {
      const a = t.rows[i], b = t.rows[j];
      for (const { name, f, desc } of cmps) {
        const x = a[name], y = b[name];
        const ex = isEmpty(x), ey = isEmpty(y);
        if (ex || ey) { if (ex !== ey) return ex ? 1 : -1; continue; } // missing values last either way
        const c = f(x, y);
        if (c) return desc ? -c : c;
      }
      return i - j;
    });
    return { columns: t.columns, rows: idx.map(i => t.rows[i]) };
  },
  limit(t, s) {
    const n = toNum(s.n);
    if (n == null || n < 0) throw new StepError('Give the number of rows to keep');
    return { columns: t.columns, rows: t.rows.slice(0, Math.floor(n)) };
  },
});

export function applyStep(table, step, ctx = { text: textBudget() }) {
  const f = STEPS[step?.op];
  if (!f) throw new StepError(`Unknown step “${step?.op}”`);
  return f(table, step, ctx);
}

/**
 * Run steps in order. Returns the final table and, for each step, the columns it saw and any error. The expressions of
 * one run share one text budget (expr.js MAX_RUN_TEXT), so derived columns built on derived columns stay bounded.
 */
export function runPipeline(base, steps = []) {
  let table = base;
  const trace = [];
  const ctx = { text: textBudget() };
  for (const step of steps) {
    const input = table.columns, before = table.rows.length;
    try {
      table = applyStep(table, step, ctx);
      trace.push({ input, output: table.columns, before, rows: table.rows.length });
    } catch (e) {
      trace.push({ input, output: input, before, rows: before, error: e.message || String(e) });
    }
  }
  return { table, trace, errors: trace.flatMap((t, i) => (t.error ? [{ step: i, message: t.error }] : [])) };
}

/* ---------- describing columns ---------- */
/** A short profile of one column: how many values, distinct values (up to a cap), range or most common values. */
export function profile(table, name, { cap = 5000, top = 5 } = {}) {
  const c = table.columns.find(x => x.name === name);
  if (!c) return null;
  let present = 0;
  const counts = new Map();
  let min = null, max = null;
  const cmp = comparator(c.type);
  for (const r of table.rows) {
    const v = r[name];
    if (isEmpty(v)) continue;
    present++;
    if (c.type === 'number' || c.type === 'date') {
      if (min == null || cmp(v, min) < 0) min = v;
      if (max == null || cmp(v, max) > 0) max = v;
    }
    const items = Array.isArray(v) ? v : [v];
    for (const x of items) {
      if (counts.size >= cap && !counts.has(keyOf(x))) continue;
      const k = keyOf(x), e = counts.get(k);
      if (e) e.n++; else counts.set(k, { v: x, n: 1 });
    }
  }
  const common = c.type === 'number' ? [] : [...counts.values()].sort((a, b) => b.n - a.n).slice(0, top);
  return { name, type: c.type, present, missing: table.rows.length - present, distinct: counts.size, capped: counts.size >= cap, min, max, common };
}

/* ---------- output ---------- */
const csvText = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x != null && typeof x === 'object' ? JSON.stringify(x) : String(x ?? ''))).join('; ');
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
/** RFC 4180 CSV. Text that a spreadsheet would read as a formula (=, +, -, @ at the start) is prefixed with '. */
export function toCSV(table) {
  const names = table.columns.map(c => c.name);
  const cell = (v, isText) => {
    let s = csvText(v);
    if (isText && /^[=+\-@\t\r]/.test(s) && toNum(s) == null) s = "'" + s;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [names.map(n => cell(n, true)).join(',')];
  for (const r of table.rows) lines.push(names.map(n => cell(r[n], typeof r[n] === 'string' || Array.isArray(r[n]))).join(','));
  return lines.join('\r\n') + '\r\n';
}

const NO_GROUPING = /year|decade|century|^y$|_y$|(^|[._])id$|code|^num$|iso/i;
const NF = new Map();
const nf = opts => { const k = JSON.stringify(opts); if (!NF.has(k)) NF.set(k, new Intl.NumberFormat('en-GB', opts)); return NF.get(k); };
/** A value as text for a table cell or a tooltip. */
export function formatValue(v, type, name = '') {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '';
  if (typeof v === 'number') {
    const grouping = !(NO_GROUPING.test(name) && Number.isInteger(v));
    const a = Math.abs(v);
    return nf({ useGrouping: grouping, maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : a === 0 ? 0 : 4 }).format(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) { const s = v.slice(0, 12).map(x => (x != null && typeof x === 'object' ? JSON.stringify(x) : String(x ?? ''))).join(', '); return v.length > 12 ? s + ', …' : s; }
  if (v instanceof Date) return v.toISOString().replace('T00:00:00.000Z', '');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
