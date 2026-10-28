// Data Analytics: expressions for derived columns and expression filters.
// An expression is parsed into a tree and evaluated row by row. It is never turned into JavaScript (no eval, no
// new Function), so an analysis shared by link carries data, not code.
//
//   numbers 12, 3.5, 1e6 · text 'quoted' or "quoted" · true, false, null
//   column names as written (letters, digits, _ . $), or `any name` / [any name] for the rest
//   + - * / % ^ · = == != <> < <= > >= · and or not (&& || !) · cond ? a : b · ( )
//   functions: see FUNCTIONS below (names are case-insensitive)

export class ExprError extends Error {
  constructor(message, pos = -1) { super(message); this.name = 'ExprError'; this.pos = pos; }
}
/** A limit on the text an expression may make: the step stops with this message instead of filling the tab's memory. */
export class ExprLimit extends ExprError {}

const MAX_LENGTH = 600, MAX_DEPTH = 40;
// Text functions can multiply lengths (replace, join, concat, + inside one another, or derived columns built on derived
// columns), so a short expression in a shared link could ask for gigabytes. A value may hold at most MAX_TEXT characters,
// and the expressions of one run of the steps may make at most MAX_RUN_TEXT characters of text in all (see engine.js).
export const MAX_TEXT = 10_000, MAX_RUN_TEXT = 50_000_000;
const fits = n => { if (n > MAX_TEXT) throw new ExprLimit(`The expression makes text longer than ${MAX_TEXT.toLocaleString('en-GB')} characters`); };

/* ---------- values ---------- */
const NUMERIC = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
/** A finite number from a number or a numeric string; null otherwise. */
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUMERIC.test(v)) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  if (typeof v === 'bigint') return Number(v);
  return null;
}
const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
export const truthy = v => !(v == null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || Number.isNaN(v));
const str = v => v == null ? '' : Array.isArray(v) ? v.map(str).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);

/* Dates are read from ISO-style text (2026, 2026-10, 2026-10-28, 2026-10-28T13:05:00Z) or a year number, as written,
   without time-zone shifts. Years may be negative (-0286 = 287 BC in ISO; here simply the number written). */
const DATE_RE = /^\s*([-+]?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?)?)?/;
export function dateParts(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
  if (typeof v === 'number') return Number.isFinite(v) ? { y: Math.trunc(v), m: null, d: null } : null;
  const m = DATE_RE.exec(String(v));
  if (!m) return null;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : null, d = m[3] ? Number(m[3]) : null;
  if ((mo != null && (mo < 1 || mo > 12)) || (d != null && (d < 1 || d > 31))) return null;
  return { y, m: mo, d };
}
const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
const ymd = p => `${p.y < 0 ? '-' : ''}${pad(p.y, 4)}-${pad(p.m ?? 1)}-${pad(p.d ?? 1)}`;
// Days since 1970-01-01 in the proleptic Gregorian calendar (setUTCFullYear keeps years 0–99 as written).
const dayNumber = p => { const t = new Date(0); t.setUTCFullYear(p.y, (p.m ?? 1) - 1, p.d ?? 1); return Math.floor(t.getTime() / 864e5); };

function equal(a, b) {
  if (a == null || b == null) return a == null && b == null;
  const x = toNum(a), y = toNum(b);
  if (x != null && y != null) return x === y;
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b) && (typeof a === typeof b || str(a).toLowerCase() === str(b).toLowerCase());
  return str(a).toLowerCase() === str(b).toLowerCase();
}
function compare(a, b) { // -1, 0, 1, or null when either side is missing
  if (a == null || b == null || a === '' || b === '') return null;
  const x = toNum(a), y = toNum(b);
  if (x != null && y != null) return x < y ? -1 : x > y ? 1 : 0;
  const s = str(a).toLowerCase(), t = str(b).toLowerCase();
  return s < t ? -1 : s > t ? 1 : 0;
}

/* ---------- functions ---------- */
const num1 = f => a => { const x = toNum(a); return x == null ? null : finite(f(x)); };
const finite = x => (typeof x === 'number' && !Number.isFinite(x) ? null : x);
const listOf = v => (Array.isArray(v) ? v : v == null ? [] : [v]);
const date1 = f => a => { const p = dateParts(a); return p ? f(p) : null; };
const strArg = f => (s, ...rest) => (s == null ? null : f(str(s), ...rest));

/** name: [min args, max args (Infinity), implementation, help] */
export const FUNCTIONS = Object.assign(Object.create(null), {
  abs: [1, 1, num1(Math.abs), 'abs(x): size without sign'],
  round: [1, 2, (a, d) => { const x = toNum(a), k = toNum(d) ?? 0; if (x == null) return null; const f = 10 ** Math.max(-10, Math.min(10, Math.trunc(k))); return Math.round(x * f) / f; }, 'round(x, digits): rounded, to 0 digits unless given'],
  floor: [1, 1, num1(Math.floor), 'floor(x): rounded down'],
  ceil: [1, 1, num1(Math.ceil), 'ceil(x): rounded up'],
  sqrt: [1, 1, num1(x => (x < 0 ? NaN : Math.sqrt(x))), 'sqrt(x): square root'],
  exp: [1, 1, num1(Math.exp), 'exp(x): e to the power x'],
  ln: [1, 1, num1(x => (x <= 0 ? NaN : Math.log(x))), 'ln(x): natural logarithm'],
  log: [1, 1, num1(x => (x <= 0 ? NaN : Math.log(x))), 'log(x): natural logarithm (same as ln)'],
  log10: [1, 1, num1(x => (x <= 0 ? NaN : Math.log10(x))), 'log10(x): base-10 logarithm'],
  pow: [2, 2, (a, b) => { const x = toNum(a), y = toNum(b); return x == null || y == null ? null : finite(x ** y); }, 'pow(x, y): x to the power y'],
  sign: [1, 1, num1(Math.sign), 'sign(x): −1, 0 or 1'],
  min: [1, Infinity, (...a) => { const v = a.flat().map(toNum).filter(x => x != null); return v.length ? Math.min(...v) : null; }, 'min(a, b, …): smallest number'],
  max: [1, Infinity, (...a) => { const v = a.flat().map(toNum).filter(x => x != null); return v.length ? Math.max(...v) : null; }, 'max(a, b, …): largest number'],
  number: [1, 1, a => toNum(a), 'number(x): text to a number (null if it is not one)'],
  text: [1, 1, a => (a == null ? null : str(a)), 'text(x): as text'],
  string: [1, 1, a => (a == null ? null : str(a)), 'string(x): as text (same as text)'],
  lower: [1, 1, strArg(s => s.toLowerCase()), 'lower(s): lower case'],
  upper: [1, 1, strArg(s => s.toUpperCase()), 'upper(s): upper case'],
  trim: [1, 1, strArg(s => s.trim()), 'trim(s): without surrounding spaces'],
  length: [1, 1, a => (a == null ? null : Array.isArray(a) ? a.length : str(a).length), 'length(x): characters in text, or items in a list'],
  len: [1, 1, a => (a == null ? null : Array.isArray(a) ? a.length : str(a).length), 'len(x): same as length'],
  concat: [1, Infinity, (...a) => { const parts = a.map(str); fits(parts.reduce((n, p) => n + p.length, 0)); return parts.join(''); }, 'concat(a, b, …): joined as text'],
  left: [2, 2, strArg((s, n) => s.slice(0, Math.max(0, toNum(n) ?? 0))), 'left(s, n): first n characters'],
  right: [2, 2, strArg((s, n) => { const k = Math.max(0, toNum(n) ?? 0); return k ? s.slice(-k) : ''; }), 'right(s, n): last n characters'],
  substr: [2, 3, strArg((s, i, n) => { const a = Math.max(1, toNum(i) ?? 1) - 1, k = n == null ? undefined : a + Math.max(0, toNum(n) ?? 0); return s.slice(a, k); }), 'substr(s, start, n): n characters from position start (1 = first)'],
  // An empty `find` changes nothing (it used to put `with` between every two characters, a way to square a length).
  replace: [3, 3, strArg((s, a, b) => { const find = str(a), by = str(b); if (!find) return s; const parts = s.split(find); fits(s.length + (parts.length - 1) * (by.length - find.length)); return parts.join(by); }), 'replace(s, find, with): every find replaced (plain text, not a pattern)'],
  contains: [2, 2, (a, b) => { if (a == null || b == null) return false; const t = str(b).toLowerCase(); return Array.isArray(a) ? a.some(x => str(x).toLowerCase() === t) : str(a).toLowerCase().includes(t); }, 'contains(x, t): text includes t, or a list has the item t (any case)'],
  startswith: [2, 2, (a, b) => a != null && b != null && str(a).toLowerCase().startsWith(str(b).toLowerCase()), 'startswith(s, t): text begins with t'],
  endswith: [2, 2, (a, b) => a != null && b != null && str(a).toLowerCase().endsWith(str(b).toLowerCase()), 'endswith(s, t): text ends with t'],
  split: [2, 2, strArg((s, sep) => s.split(str(sep)).map(x => x.trim()).filter(Boolean)), 'split(s, sep): text to a list'],
  join: [1, 2, (a, sep) => { if (a == null) return null; const items = listOf(a).map(str), s = sep == null ? ', ' : str(sep); fits(items.reduce((n, p) => n + p.length, 0) + Math.max(0, items.length - 1) * s.length); return items.join(s); }, 'join(list, sep): a list to text'],
  first: [1, 1, a => (Array.isArray(a) ? a[0] ?? null : a ?? null), 'first(list): first item'],
  last: [1, 1, a => (Array.isArray(a) ? a[a.length - 1] ?? null : a ?? null), 'last(list): last item'],
  at: [2, 2, (a, i) => { const k = toNum(i); if (!Array.isArray(a) || k == null) return null; return a[k > 0 ? k - 1 : a.length + k] ?? null; }, 'at(list, n): item n (1 = first, −1 = last)'],
  year: [1, 1, date1(p => p.y), 'year(date): the year'],
  month: [1, 1, date1(p => p.m), 'month(date): 1–12'],
  day: [1, 1, date1(p => p.d), 'day(date): day of the month'],
  quarter: [1, 1, date1(p => (p.m ? Math.ceil(p.m / 3) : null)), 'quarter(date): 1–4'],
  weekday: [1, 1, date1(p => (p.m && p.d ? ((((dayNumber(p) % 7) + 7) % 7 + 3) % 7) + 1 : null)), 'weekday(date): 1 = Monday … 7 = Sunday'],
  decade: [1, 1, date1(p => Math.floor(p.y / 10) * 10), 'decade(date): 1990 for any year of the 1990s'],
  century: [1, 1, date1(p => (p.y > 0 ? Math.floor((p.y - 1) / 100) + 1 : -Math.floor(-p.y / 100) - 1)), 'century(date): 21 for 2001–2100'],
  yearmonth: [1, 1, date1(p => (p.m ? `${p.y < 0 ? '-' : ''}${pad(p.y, 4)}-${pad(p.m)}` : null)), 'yearmonth(date): 2026-10'],
  date: [1, 1, date1(p => (p.m && p.d ? ymd(p) : null)), 'date(x): 2026-10-28 from a timestamp'],
  days: [2, 2, (a, b) => { const p = dateParts(a), q = dateParts(b); return p && q ? Math.round(dayNumber(q) - dayNumber(p)) : null; }, 'days(from, to): days between two dates'],
  if: [2, 3, null, 'if(test, then, else): then when test holds, else otherwise'],
  coalesce: [1, Infinity, (...a) => a.find(x => !isEmpty(x)) ?? null, 'coalesce(a, b, …): the first value that is not empty'],
  isempty: [1, 1, a => isEmpty(a), 'isempty(x): true when missing, blank or an empty list'],
  isnull: [1, 1, a => isEmpty(a), 'isnull(x): same as isempty'],
}); // no prototype: a name like "constructor" is never a function
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/* ---------- tokenizer ---------- */
const KEYWORDS = Object.assign(Object.create(null), { and: 'and', or: 'or', not: 'not', true: 'true', false: 'false', null: 'null' });
function tokenize(src) {
  const out = [];
  let i = 0;
  const push = (t, v, at) => out.push({ t, v, at });
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const at = i;
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
    if (num) { push('num', Number(num[0]), at); i += num[0].length; continue; }
    if (c === '"' || c === "'") {
      let s = '', j = i + 1;
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] === '\\' && j + 1 < src.length) { j++; s += { n: '\n', t: '\t' }[src[j]] ?? src[j]; } else s += src[j];
      }
      if (j >= src.length) throw new ExprError('Text is missing its closing quote', at);
      push('str', s, at); i = j + 1; continue;
    }
    if (c === '`' || c === '[') {
      const close = c === '`' ? '`' : ']', j = src.indexOf(close, i + 1);
      if (j < 0) throw new ExprError(`Column name is missing its closing ${close}`, at);
      const name = src.slice(i + 1, j);
      if (!name.trim()) throw new ExprError('Empty column name', at);
      push('col', name, at); i = j + 1; continue;
    }
    const id = /^[A-Za-z_$][\w$.]*/.exec(src.slice(i));
    if (id) {
      const w = id[0].replace(/\.+$/, '');
      const kw = KEYWORDS[w.toLowerCase()];
      if (kw) push('kw', kw, at); else push('id', w, at);
      i += w.length; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<>', '<=', '>=', '&&', '||', '**'].includes(two)) { push('op', { '&&': 'and', '||': 'or', '**': '^', '==': '=', '<>': '!=' }[two] || two, at); i += 2; continue; }
    if ('+-*/%^<>=!?:(),'.includes(c)) { push('op', c === '!' ? 'not' : c, at); i++; continue; }
    throw new ExprError(`Unexpected character “${c}”`, at);
  }
  push('end', null, src.length);
  return out;
}

/* ---------- parser (recursive descent) ---------- */
export function parseExpr(src) {
  src = String(src ?? '');
  if (!src.trim()) throw new ExprError('Write an expression');
  if (src.length > MAX_LENGTH) throw new ExprError(`Expressions are limited to ${MAX_LENGTH} characters`);
  const toks = tokenize(src);
  let k = 0, depth = 0;
  const columns = new Set();
  const peek = () => toks[k];
  const is = (t, v) => toks[k].t === t && (v === undefined || toks[k].v === v);
  const isOp = v => (toks[k].t === 'op' || toks[k].t === 'kw') && toks[k].v === v;
  const expect = (v, what) => { if (!isOp(v)) throw new ExprError(`Expected ${what || '“' + v + '”'}`, peek().at); k++; };
  const deeper = f => { if (++depth > MAX_DEPTH) throw new ExprError('Expression is nested too deeply', peek().at); const r = f(); depth--; return r; };

  const ternary = () => deeper(() => {
    const c = or();
    if (!isOp('?')) return c;
    k++;
    const a = ternary(); expect(':', '“:” after “?”');
    return { t: 'if', c, a, b: ternary() };
  });
  const or = () => { let l = and(); while (isOp('or')) { k++; l = { t: 'or', l, r: and() }; } return l; };
  const and = () => { let l = not(); while (isOp('and')) { k++; l = { t: 'and', l, r: not() }; } return l; };
  const not = () => (isOp('not') ? (k++, deeper(() => ({ t: 'not', e: not() }))) : cmp());
  const cmp = () => {
    const l = add();
    const t = peek();
    if (t.t === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(t.v)) { k++; return { t: 'cmp', op: t.v, l, r: add() }; }
    return l;
  };
  const add = () => { let l = mul(); while (isOp('+') || isOp('-')) { const op = peek().v; k++; l = { t: 'bin', op, l, r: mul() }; } return l; };
  const mul = () => { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = peek().v; k++; l = { t: 'bin', op, l, r: unary() }; } return l; };
  const unary = () => {
    if (isOp('-')) { k++; return deeper(() => ({ t: 'neg', e: unary() })); }
    if (isOp('+')) { k++; return deeper(unary); }
    return pow();
  };
  const pow = () => { const b = primary(); if (isOp('^')) { k++; return { t: 'bin', op: '^', l: b, r: deeper(unary) }; } return b; };
  const primary = () => {
    const t = peek();
    if (t.t === 'num') { k++; return { t: 'lit', v: t.v }; }
    if (t.t === 'str') { k++; return { t: 'lit', v: t.v }; }
    if (t.t === 'kw' && (t.v === 'true' || t.v === 'false' || t.v === 'null')) { k++; return { t: 'lit', v: t.v === 'null' ? null : t.v === 'true' }; }
    if (t.t === 'col') { k++; columns.add(t.v); return { t: 'col', name: t.v }; }
    if (t.t === 'id') {
      k++;
      if (isOp('(')) {
        const name = t.v.toLowerCase(), f = FUNCTIONS[name];
        if (!f) throw new ExprError(`Unknown function “${t.v}”`, t.at);
        k++;
        const args = [];
        if (!isOp(')')) { do { args.push(ternary()); } while (isOp(',') && ++k); }
        expect(')', '“)” to close ' + name + '(');
        if (args.length < f[0] || args.length > f[1]) throw new ExprError(`${name}() takes ${f[0] === f[1] ? f[0] : f[1] === Infinity ? 'at least ' + f[0] : f[0] + '–' + f[1]} argument${f[1] === 1 ? '' : 's'}`, t.at);
        return { t: 'call', name, args };
      }
      columns.add(t.v);
      return { t: 'col', name: t.v };
    }
    if (isOp('(')) { k++; const e = ternary(); expect(')', '“)”'); return e; }
    if (t.t === 'end') throw new ExprError('The expression ends too soon', t.at);
    throw new ExprError(`Unexpected “${src.slice(t.at, t.at + 12).trim()}”`, t.at);
  };

  const ast = ternary();
  if (!is('end')) throw new ExprError(`Unexpected “${src.slice(peek().at, peek().at + 12).trim()}”`, peek().at);
  return { ast, columns: [...columns] };
}

/* ---------- evaluation: the tree becomes nested closures over a row ---------- */
function build(n, spend) {
  switch (n.t) {
    case 'lit': { const v = n.v; return () => v; }
    case 'col': { const name = n.name; return r => (Object.prototype.hasOwnProperty.call(r, name) ? r[name] ?? null : null); }
    case 'neg': { const e = build(n.e, spend); return r => { const x = toNum(e(r)); return x == null ? null : -x; }; }
    case 'not': { const e = build(n.e, spend); return r => !truthy(e(r)); }
    case 'and': { const l = build(n.l, spend), q = build(n.r, spend); return r => truthy(l(r)) && truthy(q(r)); }
    case 'or': { const l = build(n.l, spend), q = build(n.r, spend); return r => truthy(l(r)) || truthy(q(r)); }
    case 'if': { const c = build(n.c, spend), a = build(n.a, spend), b = build(n.b, spend); return r => (truthy(c(r)) ? a(r) : b(r)); }
    case 'cmp': {
      const l = build(n.l, spend), q = build(n.r, spend), op = n.op;
      if (op === '=') return r => equal(l(r), q(r));
      if (op === '!=') return r => !equal(l(r), q(r));
      return r => { const c = compare(l(r), q(r)); if (c == null) return false; return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0; };
    }
    case 'bin': {
      const l = build(n.l, spend), q = build(n.r, spend), op = n.op;
      if (op === '+') return r => {
        const a = l(r), b = q(r), x = toNum(a), y = toNum(b);
        if (x != null && y != null) return x + y;
        if (a == null && b == null) return null;
        if ((a == null || x != null) && (b == null || y != null)) return null; // a number plus a missing value
        const sa = str(a), sb = str(b);
        fits(sa.length + sb.length);
        return spend(sa + sb);
      };
      const f = { '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => (y === 0 ? null : x / y), '%': (x, y) => (y === 0 ? null : x % y), '^': (x, y) => x ** y }[op];
      return r => { const x = toNum(l(r)), y = toNum(q(r)); return x == null || y == null ? null : finite(f(x, y)); };
    }
    case 'call': {
      const args = n.args.map(x => build(x, spend));
      if (n.name === 'if') { const [c, a, b = () => null] = args; return r => (truthy(c(r)) ? a(r) : b(r)); }
      const f = FUNCTIONS[n.name][2];
      // A function that fails gives null, except at a size limit, which stops the step with its message.
      return r => { let v; try { v = f(...args.map(a => a(r))) ?? null; } catch (e) { if (e instanceof ExprLimit) throw e; return null; } return spend(v); };
    }
    default: throw new ExprError('Unknown expression');
  }
}

/** A budget of text characters shared by every expression of one run of the steps (engine.js makes one per run). */
export const textBudget = (max = MAX_RUN_TEXT) => ({ used: 0, max });
function spender(budget) {
  if (!budget) return v => v;
  const charge = n => { budget.used += n; if (budget.used > budget.max) throw new ExprLimit(`These steps make more than ${(budget.max / 1e6).toLocaleString('en-GB')} million characters of text: filter the rows first, or shorten the expressions`); };
  return v => {
    if (typeof v === 'string') charge(v.length);
    else if (Array.isArray(v)) { let n = 8 * v.length; for (const x of v) if (typeof x === 'string') n += x.length; charge(n); }
    return v;
  };
}

/**
 * Compile an expression to a function of a row. `known` (optional) is the list of column names that exist: unknown names
 * are reported (with a near match when there is one) rather than read as empty. `budget` (from textBudget) counts the
 * text the expression makes; past it, evaluation stops with an ExprLimit.
 */
export function compileExpr(src, known, { budget = null } = {}) {
  const { ast, columns } = parseExpr(src);
  if (known) {
    const have = new Set(known);
    for (const c of columns) {
      if (have.has(c)) continue;
      const near = known.find(k => k.toLowerCase() === c.toLowerCase());
      throw new ExprError(`No column “${c}”` + (near ? ` (did you mean ${near}?)` : ''));
    }
  }
  const f = build(ast, spender(budget));
  f.columns = columns;
  return f;
}
