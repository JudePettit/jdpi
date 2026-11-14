/* Freshness lines: how fresh each submodule's data is, worked out from the data itself and never written by hand
   (12 November 2026: whether a page is available is one thing, how fresh its data is another, and "Live" stood for
   both). One pure module, with no DOM, for the shell (the top bar, the sidebar, the Home page's boxes, the Dashboard's
   tiles and the module overviews), Highbrowse and the tests (tests/freshness-labels.test.mjs).

   Every submodule says in registry.json, under "data", what kind of line it has and where its time is read:
     "data": { "class": "updated", "workflow": "briefings-refresh.yml",
               "parts": [{ "read": "econ/briefing/data/stories.head.json", "store": "econ/briefing/data/stories.json" }] }
   - class     updated · data-to · reviewed · checked · combined · reference · course · available · on-demand · private ·
               rhythm (see LINE below)
   - workflow  the refresh whose schedule gives the rhythm (its cron is copied in SCHEDULES, and the test holds the copy
               to the workflow file); a part may name its own
   - expected  how often new data can arrive, when that is less often than the refresh looks for it (Realtime
               Battlefield: UCDP releases monthly, the refresh checks weekly), with "by", who releases it
   - checks    true when the line says "checked <rhythm>" (the refresh re-reads sources whose own data ends earlier)
   - note      the words of a line with no time (on demand, private, a course …)
   - parts     each time the line shows: "read" (a same-origin path, or another site's public file), "store" (the store
               status/health.json names; omitted for another site's), "time" (the field shown, default generated), "late"
               (the field lateness is counted from, default the shown one), "label", "name" (in a combined line),
               "heavy" (a file over 50 KB, or one of 20 KB or more that is not a summary, such as Kino's Wikidata cache:
               read only where this one line is shown in full)

   The time is always the data's own; the rhythm always the workflow's cron (rhythmFromCron). Late is the daily check's
   own rule (.github/scripts/freshness.mjs): older than twice the expected rhythm plus three hours, or named as a failing
   store in status/health.json while the store is no newer than that check. A failing workflow row in health.json never
   makes a line late: one workflow writes three briefings, and the others may be fresh. Times are UTC and say so. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR = 3600e3;
const pad = n => String(n).padStart(2, '0');
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const low = s => (s ? s[0].toLowerCase() + s.slice(1) : s);

/* ------------------------------------------------------------------------------------------- the schedules */
// Each refresh workflow's cron, copied from .github/workflows/<file> (tests/freshness-labels.test.mjs fails when a copy
// and its workflow disagree). The Political Atlas's monthly update is in its own repository
// (political-atlas/.github/workflows/monthly-update.yml), checked by the test where that folder is beside this one.
export const SCHEDULES = {
  'briefings-refresh.yml': '45 1-23/6 * * *',
  'briefing-refresh.yml': '5 6,18 * * *',
  'calendar-refresh.yml': '23 5 * * *',
  'volatility-refresh.yml': '25 1 * * *',
  'traders-refresh.yml': '41 3 * * 2',
  'battlefield-refresh.yml': '17 6 * * 1',
  'warfocus-refresh.yml': '53 2 2 * *',
  'progress-refresh.yml': '37 4 2 * *',
  'lake-refresh.yml': '31 3 3 * *',
  'national-refresh.yml': '47 3 5 * *',
  'kino-refresh.yml': '13 4 4 * *',
  'political-atlas/monthly-update.yml': '0 6 1 * *',
};

const WORDS = { 2: 'two', 3: 'three', 4: 'four', 6: 'six', 8: 'eight', 12: 'twelve' };
// The rhythms a line can name, and how many hours each allows between runs (a month counts as 31 days, as the daily
// check counts it).
export const RHYTHM_HOURS = { 'every six hours': 6, 'twice a day': 12, daily: 24, weekly: 7 * 24, monthly: 31 * 24 };

/** The values one cron field takes, from lo to hi: *, a, a-b, a-b/n, *\/n and lists of them. */
export function expand(field, lo, hi) {
  const out = new Set();
  for (const part of String(field).split(',')) {
    const [range, stepText] = part.split('/'), step = stepText ? Number(stepText) : 1;
    let [a, b] = range === '*' ? [lo, hi] : range.split('-').map(Number);
    if (b == null) b = stepText ? hi : a;
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(step) || step < 1 || a < lo || b > hi || a > b) throw new Error(`cron field "${field}"`);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

/** A workflow's rhythm in words and the most hours between two of its runs, from its cron (minute hour day month
 *  weekday). Monthly when it names days of the month; weekly when it names one weekday; otherwise by its hours a day. */
export function rhythmFromCron(cron) {
  const f = String(cron).trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron "${cron}"`);
  const [, hour, dom, mon, dow] = f;
  if (mon !== '*') throw new Error(`cron "${cron}": months are not used`);
  if (dom !== '*') {
    const days = expand(dom, 1, 31);
    if (days.length === 1 && dow === '*') return { phrase: 'monthly', hours: RHYTHM_HOURS.monthly };
    throw new Error(`cron "${cron}": only one day a month is named`);
  }
  if (dow !== '*') {
    const days = expand(dow, 0, 6);
    if (days.length === 1) return { phrase: 'weekly', hours: RHYTHM_HOURS.weekly };
    const gaps = days.map((d, i) => (days[(i + 1) % days.length] - d + 7) % 7 || 7);
    return { phrase: `${WORDS[days.length] || days.length} days a week`, hours: Math.max(...gaps) * 24 };
  }
  const hours = expand(hour, 0, 23);
  if (hours.length === 1) return { phrase: 'daily', hours: 24 };
  const gaps = hours.map((h, i) => (hours[(i + 1) % hours.length] - h + 24) % 24 || 24);
  const even = gaps.every(g => g === gaps[0]);
  if (even && hours.length === 2) return { phrase: 'twice a day', hours: 12 };
  if (even) return { phrase: `every ${WORDS[gaps[0]] || gaps[0]} hours`, hours: gaps[0] };
  return { phrase: `${WORDS[hours.length] || hours.length} times a day`, hours: Math.max(...gaps) };
}

/** The daily check's limit: twice the rhythm plus three hours (GitHub starts scheduled runs late when it is busy). */
export const lateAfterHours = hours => 2 * hours + 3;

/* ------------------------------------------------------------------------------------------------ times */
/** A store's time as the daily check reads it (.github/scripts/health.mjs stamp): a full time as it is, a bare date as
 *  the end of that day, a month as the end of that month. NaN when there is none. */
export function stamp(value) {
  if (typeof value !== 'string' || !value) return NaN;
  if (/^\d{4}-\d{2}$/.test(value)) { const [y, m] = value.split('-').map(Number); return Date.UTC(y, m, 1) - 1000; }
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59Z` : value);
}
const yearOf = ms => new Date(ms).getUTCFullYear();
/** "13 Nov", or "13 Nov 2025" in another year than now's. */
export function day(ms, now = Date.now()) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${yearOf(ms) === yearOf(now) ? '' : ' ' + d.getUTCFullYear()}`;
}
/** "13 Nov 20:37 UTC" (with the year in another year than now's). */
export function dayTime(ms, now = Date.now()) {
  const d = new Date(ms);
  return `${day(ms, now)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
/** A value the data gives as its own period: "Sep 2026" for a month, "12 Nov" for a recent day ("30 Jun 2026" for one
 *  more than a month before now, or in another year), a full time as its day. */
export function period(value, now = Date.now()) {
  if (/^\d{4}-\d{2}$/.test(String(value))) { const [y, m] = value.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = value.split('-').map(Number), recent = y === yearOf(now) && now - stamp(value) <= 31 * 24 * HOUR;
    return `${d} ${MONTHS[m - 1]}${recent ? '' : ' ' + y}`;
  }
  const t = stamp(value);
  return Number.isFinite(t) ? day(t, now) : null;
}

/* ------------------------------------------------------------------------------------------ the reading */
/** The fields a line needs from each file it reads (the shell keeps only these, in its session cache). */
export function wantedFields(registry) {
  const want = new Map();
  for (const s of registry?.suites || []) for (const m of s.modules) for (const p of m.data?.parts || []) {
    const set = want.get(p.read) || new Set(['generated']);
    for (const k of [p.time, p.late]) if (k) set.add(k);
    want.set(p.read, set);
  }
  return want;
}
/** Only those fields of a file (strings only: a hostile file can put nothing else in a line). */
export function pick(json, fields) {
  const out = {};
  for (const k of fields) if (typeof json?.[k] === 'string' && json[k].length <= 40) out[k] = json[k];
  return out;
}
/** The files these submodules' lines read. A heavy one, or one on another site (the Political Atlas's), only when
 *  asked for: where that line is shown in full, never for the sidebar on every page. */
export const lazyRead = p => !!p.heavy || /^https?:/i.test(p.read || '');
export function readsOf(modules, { heavy = false } = {}) {
  const out = new Set();
  for (const m of modules) for (const p of m?.data?.parts || []) if (heavy || !lazyRead(p)) out.add(p.read);
  return [...out];
}

/* ------------------------------------------------------------------------------------------- the lines */
const LABEL = { updated: 'Updated', 'data-to': 'Data to', reviewed: 'Reviewed', checked: 'Checked', reference: 'built' };
const FIXED = { available: 'Available', 'on-demand': 'On demand', private: 'Private', reference: 'Reference', course: 'Course' };
export const CLASSES = ['updated', 'data-to', 'reviewed', 'checked', 'combined', 'reference', 'course', 'available', 'on-demand', 'private', 'rhythm'];

const scheduleOf = workflow => (SCHEDULES[workflow] ? rhythmFromCron(SCHEDULES[workflow]) : null);

/** One part of a line: what it shows, when its data was made, and whether it is late. */
function partFacts(part, data, reads, health, now) {
  const workflow = part.workflow || data.workflow, checked = scheduleOf(workflow);
  const expected = data.expected ? { phrase: data.expected, hours: RHYTHM_HOURS[data.expected] } : checked;
  const j = reads?.[part.read];
  if (!j) return { part, known: false, checked, expected, workflow };
  const shownValue = j[part.time || 'generated'], lateValue = j[part.late || part.time || 'generated'];
  const shown = stamp(shownValue), lateAt = stamp(lateValue), made = stamp(j.generated);
  if (!Number.isFinite(shown)) return { part, known: false, checked, expected, workflow };
  let late = false, failing = false;
  if (expected && Number.isFinite(lateAt)) late = now - lateAt > lateAfterHours(expected.hours) * HOUR;
  // A failing store in the last daily check counts only while the store is no newer than that check.
  const checkedAt = Date.parse(health?.generated);
  if (part.store && health?.ok === false && Number.isFinite(checkedAt) && Array.isArray(health.failing)
    && health.failing.some(f => f?.what === part.store) && (Number.isFinite(made) ? made : lateAt) <= checkedAt) failing = late = true;
  return { part, known: true, shownValue, shown, lateAt, made: Number.isFinite(made) ? made : (Number.isFinite(lateAt) ? lateAt : shown), late, failing, checked, expected, workflow };
}
const whenOf = (f, now) => (f.checked && f.checked.hours <= 24 ? dayTime(f.shown, now) : day(f.shown, now));

/** The freshness line of one submodule (its registry entry), from the files read so far (reads: { path: picked
 *  fields }), the daily check's result and the time now. Returns { cls, text, short, late, made } (made: when its newest
 *  data was made, ms, or null). With nothing read yet it gives the rhythm alone, which is always true. */
export function freshnessLine(m, reads = {}, { health = null, now = Date.now() } = {}) {
  const data = m?.data || {}, cls = CLASSES.includes(data.class) ? data.class : 'rhythm';
  const facts = (data.parts || []).map(p => partFacts(p, data, reads, health, now));
  const known = facts.filter(f => f.known), all = facts.length && known.length === facts.length;
  const late = known.some(f => f.late), made = known.length ? Math.max(...known.map(f => f.made)) : null;
  const f0 = facts[0], rhythm = f0?.checked?.phrase || null;
  let text, short;
  switch (cls) {
    case 'updated': case 'checked': case 'reviewed': {
      const label = f0?.part.label || LABEL[cls], tail = cls === 'reviewed' ? `${rhythm} review` : rhythm;
      if (all) { text = `${label} ${whenOf(f0, now)} · ${tail}`; short = `${label} ${day(f0.shown, now)}`; }
      else { text = `${label} ${rhythm}`; short = label === 'Updated' ? cap(rhythm) : label; }
      break;
    }
    case 'data-to': {
      const exp = f0?.expected, says = data.expected && exp ? `${data.by ? data.by + ' ' : ''}${exp.phrase}, checked ${rhythm}` : data.checks ? `checked ${rhythm}` : rhythm;
      if (all) {
        text = [...known.map(f => `${f.part.label || LABEL[cls]} ${period(f.shownValue, now)}`), says].join(' · ');
        short = `${f0.part.label || LABEL[cls]} ${period(f0.shownValue, now)}`;
      } else { text = cap(says); short = cap(rhythm); }
      break;
    }
    case 'combined': {
      const what = cap(data.note || 'reads several stores');
      if (!facts.length) { text = what; short = what; break; }
      const lateOnes = known.filter(f => f.late);
      if (lateOnes.length) {
        text = `${what} · ${lateOnes.length === 1 ? `${lateOnes[0].part.name} late: updated ${whenOf(lateOnes[0], now)}`
          : `late: ${lateOnes.map(f => `${f.part.name} (updated ${whenOf(f, now)})`).join(', ')}`}`;
        short = `${lateOnes.map(f => f.part.name).join(', ')} late`;
      } else if (all) {
        const oldest = known.reduce((a, b) => (b.shown < a.shown ? b : a));
        text = `${what} · all updated since ${whenOf(oldest, now)}`;
        short = `Since ${day(oldest.shown, now)}`;
      } else { text = what; short = what; }
      break;
    }
    case 'reference': {
      text = all ? `Reference · built ${day(f0.made, now)} · no schedule` : 'Reference · no schedule';
      short = 'Reference';
      break;
    }
    case 'rhythm': text = cap(data.note || 'no schedule'); short = text; break;
    default: text = `${FIXED[cls]} · ${data.note || 'no schedule'}`; short = FIXED[cls];
  }
  if (late && cls !== 'combined') { text = `Late: ${low(text)}`; short = `Late: ${low(short)}`; }
  return { cls, text, short, late, made: Number.isFinite(made) ? made : null };
}

/** A module's line for the back of its box on the Home page, and how many of its lines are late. The line is a
 *  submodule's own (never one that sums up others, such as Highbrowse's): its freshest dated line that is on time; when
 *  every dated line is late, the newest of them, Late and all; with no dated line, its first undated one. In a module of
 *  several submodules the line always names its submodule. */
export function suiteLine(suite, lineOf) {
  const lines = suite.modules.map(m => ({ m, l: lineOf(m) })).filter(x => x.l);
  const own = lines.filter(x => x.l.cls !== 'combined');
  const dated = own.filter(x => x.l.made != null && x.l.cls !== 'reference').sort((a, b) => b.l.made - a.l.made);
  const pickOne = dated.find(x => !x.l.late) || dated[0] || own.find(x => !x.l.late) || own[0] || null;
  const late = lines.filter(x => x.l.late).length;
  return { text: pickOne ? (suite.modules.length > 1 ? `${pickOne.m.name}: ${low(pickOne.l.text)}` : pickOne.l.text) : '', late };
}

/* ------------------------------------------------------------- the catalogue's copies and their stores */
// The Integration Hub's catalogue (integration/catalog.json) and the copies under integration/data are remade only by
// the daily calendar refresh (integration/scripts/build-catalog.mjs), so after any other refresh a dataset's date and
// rows there can be older than its store. Data Analytics and the Integration Hub say so: every date and count they take
// from the catalogue is labelled as the catalogue's, with its time, and a dataset whose store is newer than the
// catalogue says when the store's data is of, read from the store's own summary (its "head", the file the store's
// registry line reads). Rebuilding the catalogue in every refresh would rewrite a hundred files and make refreshes
// collide; this keeps the step small.
export const CATALOGUE_WORKFLOW = 'calendar-refresh.yml';
/** The catalogue's rhythm in words, from its workflow's schedule ("daily"). */
export const catalogueRhythm = () => rhythmFromCron(SCHEDULES[CATALOGUE_WORKFLOW]).phrase;
/** { store path: the small file its registry line reads for its time } for every store a line names: its summary, or
 *  the store itself where it is small enough to be read (never a heavy file, never another site's). */
export function headsOf(registry) {
  const out = {};
  for (const s of registry?.suites || []) for (const m of s.modules) for (const p of m.data?.parts || []) {
    if (p.store && p.read && !p.heavy && !/^https?:/i.test(p.read)) out[p.store] = p.read;
  }
  return out;
}
/** The stores a catalogue dataset is made from: its derivedFrom, or (when it has none) its own files; exact paths only. */
export function datasetStores(ds) {
  const list = Array.isArray(ds?.derivedFrom) && ds.derivedFrom.length ? ds.derivedFrom : [ds?.url, ...(Array.isArray(ds?.urls) ? ds.urls : [])];
  return [...new Set(list.filter(p => typeof p === 'string' && p && !p.includes('*') && !/^https?:/i.test(p)))];
}
/** What a page may say of a dataset's catalogue facts: { made (the catalogue's time, ms), label ("in the catalogue of
 *  13 Nov 06:20 UTC"), rhythm, newest (ms: the newest of its stores' own times when newer than the catalogue, else
 *  null), newer ([{ store, time }]: each of its stores that is newer than the catalogue) }. storeTimes: { store path:
 *  ms } read from the stores' heads. */
export function copyFacts(ds, catalogue, storeTimes = {}, now = Date.now()) {
  const made = stamp(catalogue?.generated);
  const newer = datasetStores(ds).map(p => ({ store: p, time: storeTimes[p] })).filter(x => Number.isFinite(x.time) && Number.isFinite(made) && x.time > made);
  return { made: Number.isFinite(made) ? made : null, label: Number.isFinite(made) ? `in the catalogue of ${dayTime(made, now)}` : 'in the catalogue', rhythm: catalogueRhythm(), newest: newer.length ? Math.max(...newer.map(x => x.time)) : null, newer };
}
/** The submodule a store is named after, for a dataset of submodule `own`: `own` itself when its registry line names
 *  the store; otherwise the submodule whose line names the fewest stores (Highbrowse's line reads all four briefings'
 *  stores, each briefing's only its own), the first in the registry's order among equals; null when no line names it. */
export function storeOwner(registry, store, own) {
  let best = null;
  for (const s of registry?.suites || []) for (const m of s.modules) {
    const stores = (m.data?.parts || []).map(p => p.store).filter(Boolean);
    if (!stores.includes(store)) continue;
    if (m.id === own) return own;
    if (!best || stores.length < best.n) best = { id: m.id, n: stores.length };
  }
  return best ? best.id : null;
}
/** What a page says of a dataset whose stores are newer than the catalogue: each submodule that has a newer store, the
 *  dataset's own first, with that store's own time ("National Analysis has newer data, of 13 Nov 23:53 UTC, and
 *  Geopolitical Volatility of 14 Nov 02:16 UTC"); '' when none is newer. A dataset can be built from another
 *  submodule's store beside its own (national-countries takes its scores from the volatility index, refreshed every
 *  night some hours before the catalogue is remade): the newer data is then that submodule's, and is named as its.
 *  nameOf: a submodule's id to its name. */
export function newerWords(ds, facts, registry, nameOf, now = Date.now()) {
  const own = ds?.submodule, by = new Map();
  for (const { store, time } of facts?.newer || []) {
    const who = storeOwner(registry, store, own) || own;
    if (!(by.get(who) >= time)) by.set(who, time);
  }
  const list = [...by].sort((a, b) => (b[0] === own) - (a[0] === own) || a[1] - b[1]);
  return list.map(([who, t], k) => `${nameOf(who) || 'Its source'}${k ? ' of' : ' has newer data, of'} ${dayTime(t, now)}`).join(', and ');
}

/* ------------------------------------------------------------------------- the registry's other facts */
/** The one count of modules, worded the same everywhere: Home is a module, and the count says so. */
export function countWords(registry) {
  const modules = registry?.suites?.length || 0, submodules = (registry?.suites || []).reduce((n, s) => n + s.modules.length, 0);
  const home = (registry?.suites || []).some(s => s.id === 'home');
  return { modules, submodules, home, text: `${modules} modules${home ? ', Home included' : ''} · ${submodules} submodules` };
}

/** Where a module's submodules are hosted, in a sentence or two for its overview's "About this module" (the registry's
 *  "host"; the overview tables no longer have a Host column). */
export function hostingAbout(suite) {
  const own = [], away = new Map();
  for (const m of suite.modules) {
    if (m.shell || m.host === 'Vitruvian Manager' || !m.url || !/^https?:/.test(m.url)) { own.push(m); continue; }
    let host = '';
    try { host = new URL(m.url).hostname; } catch { /* a bad address: name it by its host alone */ }
    const key = `${host}|${m.host}`;
    (away.get(key) || away.set(key, { host, kind: m.host, list: [] }).get(key)).list.push(m);
  }
  const names = list => list.map(m => m.name).reduce((a, n, i, all) => (i === 0 ? n : `${a}${i === all.length - 1 ? ' and ' : ', '}${n}`), '');
  const out = [];
  if (own.length) {
    const drawn = own.filter(m => m.shell), pages = own.filter(m => !m.shell);
    const site = 'this site, jdpi.pages.dev, deployed from GitHub to Cloudflare Pages only once the whole test suite has passed';
    if (pages.length && !away.size && !drawn.length) out.push(`Every submodule here is a page of ${site}.`);
    else if (pages.length) out.push(`${names(pages)} ${pages.length === 1 ? 'is a page' : 'are pages'} of ${site}.`);
    if (drawn.length) out.push(`${names(drawn)} ${drawn.length === 1 ? 'is' : 'are'} drawn by Vitruvian Manager's own shell${pages.length ? '' : `, on ${site}`}.`);
  }
  for (const { host, kind, list } of away.values()) {
    const priv = list.filter(m => m.opensInNewTab);
    out.push(`${names(list)} ${list.length === 1 ? 'is' : 'are'} on ${host || 'another site'} (${kind})${priv.length ? `; ${names(priv)} ${priv.length === 1 ? 'is' : 'are'} private and open${priv.length === 1 ? 's' : ''} in ${priv.length === 1 ? 'its' : 'their'} own tab, behind ${priv.length === 1 ? 'its' : 'their'} own sign-in` : ''}.`);
  }
  return out.join(' ');
}
