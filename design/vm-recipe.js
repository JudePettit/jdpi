/* The view recipe, VR/1 (PRP-SCHOLAR-USP-DESIGN.md 3.1–3.3): one text that says what a view draws, never the data.
   The click writes one (design/vm-click.js), the Omni-Map draws it (omni/index.html#<recipe>), a saved bundle carries
   it with its pins (design/vm-bundle.js). Pure: no DOM, no fetch.

   &-separated keys, written in one fixed order so equal recipes give equal strings:
     vr     1, the version (a recipe without it, or with another, is not VR/1 and reads as null)
     t      the window, from..to                    1446..1514, -431..-404, 1756-05..1763-02
     at     the frame                               1494, -426, 1756-08-29
     since  the start of the period shown, where the reader moved it off its rest; absent, it rests (show=upto: the
            window's first year, so the period is t's from up to at; show=frame: the frame itself)   1495
     show   upto | frame
     step   d | m | y | 10y | c
     base   plain | terrain | satellite | night | countries (Natural Earth's countries of today, stage S5a)
     fill   one fill                                borders, wb:<code>, an:<n>, membership:<Q>
     l      up to three layers, layer[:field=value]  battles, battles:partOf=Q33143
     all    1: the reader's "Show anyway" (stage S5a), which lifts the Omni-Map's clutter rule; l may then hold up to 12
     an     a Data Analytics spec, encoded           d%3Dnational-key-series%26…
     focus  up to 20: ISO3, gw:N, Q-ids, bbox:w,s,e,n
     q      the clicked object                      Q236853
     rec    0 all, 1 VM's own estimates hidden, 2 facts only
     agg    own | parts
     film, pace, narr   1; seconds a step, 1–60; gen | off
     ds     data pins, id@version                   cliopatria@v0.2.1,lake@20261115T1109Z
     from   where the click came from, module:path   neo:the-prince/3/c03-p03
     pin    a bundle's hash, 12 hex digits (5.7)
   The order is the one 3.3's three worked examples are written in (the table of 3.2 lists `an` after `ds`, and `film`
   after `ds`, but examples 2 and 3 write them earlier, and each must read back to its own string); `pin` is last, so
   a bundle's recipe is its pinned recipe with &pin=<pin> appended. `since` is not in the design's table of 3.2: it was
   added (review X3, 17 November 2026) so that a period the reader chose with the slider's start handle is kept in the
   recipe and drawn again from it; a recipe without it reads and writes exactly as before.
   Atoms are percent-encoded by analytics/lib/spec.js's rule (encodeURIComponent and ! ' ( ) * ~); the structure
   characters .. , : / @ = stay bare. Years are signed historical years with no year 0 (vm-dates.js).
   A malformed key reads as absent and never throws. `host=neo|kino` is a frame-only key outside VR/1 (readHost,
   withHost), ignored by readRecipe and by every comparison. */

export const KEYS = ['vr', 't', 'at', 'since', 'show', 'step', 'base', 'fill', 'l', 'all', 'an', 'focus', 'q', 'rec', 'agg', 'film', 'pace', 'narr', 'ds', 'from', 'pin'];
export const SHOWS = ['upto', 'frame'];
export const STEPS = ['d', 'm', 'y', '10y', 'c'];
export const BASES = ['plain', 'terrain', 'satellite', 'night', 'countries'];
export const HOSTS = ['neo', 'kino'];
export const MAX_LAYERS = 3, MAX_FOCUS = 20, MAX_ANYWAY = 12;

const enc = s => encodeURIComponent(String(s ?? '')).replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const dec = s => decodeURIComponent(String(s ?? ''));
const QID = /^Q[1-9]\d*$/;
const ID = /^[a-z][a-z0-9-]{0,60}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const FILL = /^(?:[a-z][a-z0-9-]{0,40}|wb:[A-Za-z0-9._]{1,40}|an:[1-9]\d{0,2}|membership:Q[1-9]\d*)$/;
const FROM = /^[a-z][a-z0-9-]{0,40}:[^\s&#]{1,300}$/;

/* ---------- times: a signed year (a number) or 'YYYY-MM' / 'YYYY-MM-DD' (a string), never year 0 ---------- */
const YEAR = /^-?\d{1,6}$/, DATED = /^-?\d{4,6}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;
function readTime(s) {
  s = String(s ?? '');
  if (YEAR.test(s)) { const y = +s; return y === 0 ? null : y; }
  if (DATED.test(s)) return parseInt(s, 10) === 0 ? null : s;
  return null;
}
const timeOk = v => (typeof v === 'number' ? Number.isInteger(v) && v !== 0 && Math.abs(v) < 1e6 : typeof v === 'string' && readTime(v) === v);
// Sortable [year, month, day]: a year alone sorts as its first day, so 1756..1756-05 is a forward window.
const key = v => { const m = String(v).match(/^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$/); return [+m[1], +(m[2] || 0), +(m[3] || 0)]; };
const before = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return true; };

/* ---------- each key: read(raw) → value or undefined; write(value) → raw or undefined ---------- */
const one = (list) => ({ read: r => (list.includes(r) ? r : undefined), write: v => (list.includes(v) ? v : undefined) });
const CODEC = {
  vr: { read: r => (r === '1' ? 1 : undefined), write: () => '1' },
  t: {
    read: r => { const i = r.indexOf('..'); if (i < 0) return; const a = readTime(r.slice(0, i)), b = readTime(r.slice(i + 2)); return a != null && b != null && before(a, b) ? { from: a, to: b } : undefined; },
    write: v => (v && timeOk(v.from) && timeOk(v.to) && before(v.from, v.to) ? `${v.from}..${v.to}` : undefined),
  },
  at: { read: r => readTime(r) ?? undefined, write: v => (timeOk(v) ? String(v) : undefined) },
  since: { read: r => readTime(r) ?? undefined, write: v => (timeOk(v) ? String(v) : undefined) },
  show: one(SHOWS), step: one(STEPS), base: one(BASES),
  fill: { read: r => (FILL.test(r) ? r : undefined), write: v => (FILL.test(String(v ?? '')) ? String(v) : undefined) },
  l: {
    read: (r, max = MAX_LAYERS) => {
      const parts = r.split(',');
      if (!parts.length || parts.length > max) return;
      const out = [];
      for (const p of parts) {
        const m = /^([^:=]+)(?::([^:=]+)=(.+))?$/.exec(p);
        if (!m) return;
        const id = dec(m[1]);
        if (!ID.test(id)) return;
        if (m[2] === undefined) { out.push({ id }); continue; }
        const field = dec(m[2]), value = dec(m[3]);
        if (!FIELD.test(field) || !value) return;
        out.push({ id, field, value });
      }
      return out;
    },
    write: (v, max = MAX_LAYERS) => {
      if (!Array.isArray(v) || !v.length || v.length > max) return;
      const out = [];
      for (const x of v) {
        if (!x || !ID.test(String(x.id ?? ''))) return;
        if (x.field == null && x.value == null) { out.push(enc(x.id)); continue; }
        if (!FIELD.test(String(x.field ?? '')) || x.value == null || x.value === '') return;
        out.push(`${enc(x.id)}:${enc(x.field)}=${enc(x.value)}`);
      }
      return out.join(',');
    },
  },
  all: { read: r => (r === '1' ? 1 : undefined), write: v => (v === 1 || v === true ? '1' : undefined) },
  an: { read: r => { const s = dec(r); return s ? s : undefined; }, write: v => (typeof v === 'string' && v ? enc(v) : undefined) },
  focus: {
    read: r => {
      const tok = r.split(','), out = [];
      for (let i = 0; i < tok.length; i++) {
        const x = tok[i];
        if (x.startsWith('bbox:')) {
          const b = focusBox([x.slice(5), tok[i + 1], tok[i + 2], tok[i + 3]]);
          if (!b) return;
          out.push(b); i += 3; continue;
        }
        if (!focusOne(x)) return;
        out.push(x);
      }
      return out.length && out.length <= MAX_FOCUS ? out : undefined;
    },
    write: v => {
      if (!Array.isArray(v) || !v.length || v.length > MAX_FOCUS) return;
      for (const x of v) if (!(focusOne(x) || (typeof x === 'string' && x.startsWith('bbox:') && focusBox(x.slice(5).split(','))))) return;
      return v.join(',');
    },
  },
  q: { read: r => (QID.test(r) ? r : undefined), write: v => (QID.test(String(v ?? '')) ? v : undefined) },
  rec: { read: r => (/^[012]$/.test(r) ? +r : undefined), write: v => ([0, 1, 2].includes(v) ? String(v) : undefined) },
  agg: one(['own', 'parts']),
  film: { read: r => (r === '1' ? 1 : undefined), write: v => (v === 1 || v === true ? '1' : undefined) },
  pace: { read: r => (/^[1-9]\d?$/.test(r) && +r <= 60 ? +r : undefined), write: v => (Number.isInteger(v) && v >= 1 && v <= 60 ? String(v) : undefined) },
  narr: one(['gen', 'off']),
  ds: {
    read: r => {
      const out = [];
      for (const p of r.split(',')) {
        const i = p.indexOf('@'); if (i < 1) return;
        const id = dec(p.slice(0, i)), version = dec(p.slice(i + 1));
        if (!ID.test(id) || !VERSION.test(version)) return;
        out.push({ id, version });
      }
      return out.length ? out : undefined;
    },
    write: v => (Array.isArray(v) && v.length && v.every(x => x && ID.test(String(x.id ?? '')) && VERSION.test(String(x.version ?? '')))
      ? v.map(x => `${enc(x.id)}@${enc(x.version)}`).join(',') : undefined),
  },
  from: {
    read: r => { const i = r.indexOf(':'); if (i < 1) return; const s = `${dec(r.slice(0, i))}:${r.slice(i + 1).split('/').map(dec).join('/')}`; return FROM.test(s) ? s : undefined; },
    write: v => { if (!FROM.test(String(v ?? ''))) return; const i = v.indexOf(':'); return `${enc(v.slice(0, i))}:${v.slice(i + 1).split('/').map(enc).join('/')}`; },
  },
  pin: { read: r => (/^[0-9a-f]{12}$/.test(r) ? r : undefined), write: v => (/^[0-9a-f]{12}$/.test(String(v ?? '')) ? v : undefined) },
};
function focusOne(x) {
  return typeof x === 'string' && (/^[A-Z]{3}$/.test(x) || /^gw:\d{1,4}$/.test(x) || QID.test(x));
}
// bbox:w,s,e,n in degrees; written back exactly as read, so a recipe keeps its own numbers.
function focusBox(parts) {
  if (parts.length !== 4 || parts.some(p => p == null || !/^-?\d{1,3}(?:\.\d{1,8})?$/.test(p))) return null;
  const [w, s, e, n] = parts.map(Number);
  if (Math.abs(s) > 90 || Math.abs(n) > 90 || s > n || Math.abs(w) > 180 || e < -180 || e > 540) return null;
  return `bbox:${parts.join(',')}`;
}

// The hash part of whatever is given: a recipe, '#<recipe>' or a whole address.
const body = s => { s = String(s); const i = s.indexOf('#'); return i >= 0 ? s.slice(i + 1) : s; };

/** A VR/1 recipe as an object, keys as above (absent keys left out); null when it is not VR/1. Never throws. */
export function readRecipe(str) {
  if (typeof str !== 'string' || !str) return null;
  const raw = Object.create(null);
  for (const part of body(str).split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    if (!(k in CODEC) || k in raw) continue; // unknown keys (host among them) are ignored; the first of a key stands
    raw[k] = i < 0 ? '' : part.slice(i + 1);
  }
  if (raw.vr !== '1') return null;
  const out = {};
  for (const k of KEYS) {
    if (!(k in raw)) continue;
    let v;
    // l holds up to three layers, or up to MAX_ANYWAY where the recipe says all=1 (Show anyway).
    try { v = k === 'l' ? CODEC.l.read(raw.l, raw.all === '1' ? MAX_ANYWAY : MAX_LAYERS) : CODEC[k].read(raw[k]); } catch { v = undefined; }
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** The recipe's text, keys in KEYS order; parts that would not read back are left out. vr=1 is always written. */
export function writeRecipe(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const parts = ['vr=1'];
  for (const k of KEYS.slice(1)) {
    if (obj[k] === undefined || obj[k] === null) continue;
    let w;
    try { w = k === 'l' ? CODEC.l.write(obj.l, obj.all === 1 || obj.all === true ? MAX_ANYWAY : MAX_LAYERS) : CODEC[k].write(obj[k]); } catch { w = undefined; }
    if (w !== undefined) parts.push(`${k}=${w}`);
  }
  return parts.join('&');
}

/** Whether two recipes (strings or objects) draw the same view; host never counts. */
export function sameRecipe(a, b) {
  const w = x => (typeof x === 'string' ? (readRecipe(x) ? writeRecipe(readRecipe(x)) : null) : x && typeof x === 'object' ? writeRecipe(x) : null);
  const x = w(a), y = w(b);
  return x != null && x === y;
}

/** The frame-only host of an Omni-Map address: 'neo', 'kino' or null. */
export function readHost(hash) {
  const m = /(?:^|&)host=([^&]*)/.exec(body(String(hash ?? '')));
  return m && HOSTS.includes(m[1]) ? m[1] : null;
}
/** The recipe with its frame-only host appended (any host already there replaced): '<recipe>&host=neo'. */
export function withHost(recipe, host) {
  const r = body(String(recipe ?? '')).split('&').filter(p => p && !p.startsWith('host=')).join('&');
  return HOSTS.includes(host) ? `${r}&host=${host}` : r;
}
