// Digital Briefing: view logic with no DOM (URL hash state, filtering, ordering, grouping by day, chart series, item
// badges), shared by the page (app.js) and the tests (tests/digital-briefing.test.mjs).

export const WINDOWS = { '24h': 24, '3d': 72, '7d': 168 };
export const WINDOW_LABELS = { '24h': '24 h', '3d': '3 days', '7d': '7 days' };
export const TYPE_LABELS = { paper: 'Papers', news: 'News', both: 'Both' };
export const ORDERS = { tier: 'Major sources first', newest: 'Newest first' };
export const KIND_ORDER = ['journal', 'preprint', 'lab', 'research', 'official', 'news'];
export const DEFAULTS = Object.freeze({ tab: 'stories', f: 'all', type: 'both', w: '3d', src: '', q: '', sort: 'tier' });
const HASH_ORDER = ['tab', 'f', 'type', 'w', 'src', 'q', 'sort'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A field id from a value or alias, given the data's fields ([{id, aliases}]); 'all' for all/empty, null if unknown. */
export function resolveField(v, fields) {
  const k = String(v ?? '').trim().toLowerCase();
  if (!k || k === 'all') return 'all';
  return fields.find(f => f.id === k || (f.aliases || []).includes(k))?.id || null;
}

/**
 * Page state from a URL hash such as "#f=security&w=7d&type=paper&src=arxiv&q=ransomware&sort=newest&tab=sources".
 * Unknown or invalid values fall back to the defaults; `fallback` (e.g. a remembered field) fills in what the hash
 * leaves out.
 */
export function parseHash(hash, fields, fallback = {}) {
  const p = new URLSearchParams(String(hash || '').replace(/^#\/?/, ''));
  const s = { ...DEFAULTS, ...fallback };
  const tab = p.get('tab') || p.get('view');
  if (tab) s.tab = tab === 'sources' ? 'sources' : 'stories';
  const f = p.get('f') ?? p.get('field');
  if (f !== null) s.f = resolveField(f, fields) || 'all';
  else if (s.f !== 'all' && !resolveField(s.f, fields)) s.f = 'all';
  const type = (p.get('type') || '').toLowerCase();
  if (type) s.type = /^(?:papers?|research|preprints?)$/.test(type) ? 'paper' : type === 'news' ? 'news' : 'both';
  const w = (p.get('w') || '').toLowerCase();
  if (w) s.w = WINDOWS[w] ? w : DEFAULTS.w;
  if (p.has('src')) s.src = (p.get('src') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (p.has('q')) s.q = (p.get('q') || '').slice(0, 120);
  const sort = (p.get('sort') || '').toLowerCase();
  if (sort) s.sort = ORDERS[sort] ? sort : DEFAULTS.sort;
  return s;
}

/** The hash for a state: only values that differ from the defaults, in a fixed order; '' when everything is default. */
export function toHash(state) {
  const p = new URLSearchParams();
  for (const k of HASH_ORDER) if (state[k] !== undefined && state[k] !== DEFAULTS[k] && state[k] !== '') p.set(k, state[k]);
  const s = p.toString();
  return s ? '#' + s : '';
}

// ---- Badges ----------------------------------------------------------------------------------------------------------
const PAPER_BADGE = { journal: 'Article', preprint: 'Preprint', lab: 'Lab', research: 'Research' };
const NEWS_BADGE = { journal: 'Comment', lab: 'Announcement', research: 'Research', official: 'Official', news: 'News' };
/** The label on an item: what kind of research or news it is ("Preprint", "Lab", "Advisory", "Advocacy", …). */
export function badgeOf(item, source = {}) {
  if (source.badge) return source.badge;
  return (item.type === 'paper' ? PAPER_BADGE[item.kind] : NEWS_BADGE[item.kind]) || (item.type === 'paper' ? 'Paper' : 'News');
}

// ---- Time ------------------------------------------------------------------------------------------------------------
/** Feeds that give a date without a time are stored at midnight UTC. */
export const isDateOnly = iso => /T00:00:00(?:\.000)?Z$/.test(String(iso || ''));
/** The time used for windows: date-only items count from midday UTC of their date. */
export const effectiveTime = item => (Date.parse(item.published) || 0) + (isDateOnly(item.published) ? 12 * 36e5 : 0);
const pad = n => String(n).padStart(2, '0');
/** The calendar day an item belongs to: its UTC date when the feed gave only a date, otherwise the viewer's local date. */
export function dayKey(iso) {
  const t = new Date(iso);
  if (Number.isNaN(+t)) return '0000-00-00';
  return isDateOnly(iso) ? iso.slice(0, 10) : `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
const localKey = ms => { const t = new Date(ms); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
/** "Today", "Yesterday" or '', plus the full date: e.g. ["Today", "Wednesday 28 October 2026"]. */
export function dayLabel(key, now = Date.now()) {
  const [y, m, d] = key.split('-').map(Number);
  const full = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rel = key === localKey(now) ? 'Today' : key === localKey(now - 864e5) ? 'Yesterday' : '';
  return [rel, full];
}
/** "14:05" in the viewer's time zone, or '' for date-only and undated items (whose stamp is when the feed changed). */
export const timeLabel = (iso, undated = false) => (undated || isDateOnly(iso) ? '' : new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

// ---- Filtering and ordering ------------------------------------------------------------------------------------------
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
/** Every word of the query appears in the title, summary, authors, section, DOI or outlet name. */
export function matchesQuery(item, q, outletName = '') {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${item.title} ${item.summary} ${item.authors || ''} ${item.section || ''} ${item.doi || ''} ${outletName}`);
  return words.every(w => hay.includes(w));
}

/**
 * Items passing the state's filters. `ctx.outletOf(sourceId)` gives {id, name} of a feed's outlet; `ctx.skip` lists
 * filters to ignore (['f'] for the field chip counts, ['w', 'f'] for the seven-day chart).
 */
export function filterItems(items, state, { now = Date.now(), outletOf = () => null, skip = [] } = {}) {
  const since = now - WINDOWS[state.w] * 36e5;
  return items.filter(i => {
    if (!skip.includes('f') && state.f !== 'all' && !i.fields.includes(state.f)) return false;
    if (!skip.includes('type') && state.type !== 'both' && i.type !== state.type) return false;
    if (!skip.includes('w') && effectiveTime(i) < since) return false;
    if (!skip.includes('src') && state.src && ![i.source, ...(i.also || [])].some(s => outletOf(s)?.id === state.src)) return false;
    if (!skip.includes('q') && state.q && !matchesQuery(i, state.q, outletOf(i.source)?.name)) return false;
    return true;
  });
}

/** Item counts for "all" and each field (an item can count under several). */
export function countByField(items, fields) {
  const c = { all: items.length };
  for (const f of fields) c[f.id] = 0;
  for (const i of items) for (const f of i.fields) if (f in c) c[f]++;
  return c;
}

/**
 * Items grouped by day, newest day first. Within a day, 'tier' puts the major sources first (flagship journals, then
 * other journals, the major labs and government agencies, then preprints, institutes, engineering blogs and advocacy,
 * then journalism; research before news; newest first), 'newest' is newest first.
 * @returns {{key: string, items: object[]}[]}
 */
export function arrange(items, order = 'tier') {
  const cmp = order === 'newest'
    ? (a, b) => effectiveTime(b) - effectiveTime(a)
    : (a, b) => a.tier - b.tier || (a.type === b.type ? 0 : a.type === 'paper' ? -1 : 1) || effectiveTime(b) - effectiveTime(a);
  const days = new Map();
  for (const i of items) { const k = dayKey(i.published); (days.get(k) || days.set(k, []).get(k)).push(i); }
  return [...days.keys()].sort().reverse().map(key => ({ key, items: days.get(key).sort((a, b) => cmp(a, b) || (a.id < b.id ? -1 : 1)) }));
}

/** Per-field counts for each of the last `n` local days, oldest first (for Figure 1). */
export function dailySeries(items, fieldIds, n = 7, now = Date.now()) {
  const days = Array.from({ length: n }, (_, k) => localKey(now - (n - 1 - k) * 864e5));
  const index = new Map(days.map((d, k) => [d, k]));
  const series = Object.fromEntries(fieldIds.map(id => [id, Array(n).fill(0)]));
  for (const i of items) {
    const k = index.get(dayKey(i.published));
    if (k === undefined) continue;
    for (const f of i.fields) if (series[f]) series[f][k]++;
  }
  return { days, series };
}

/** The outlets with most items, as [{id, name, count}] (an item counts for its own outlet only). */
export function topOutlets(items, outletOf, n = 8) {
  const c = new Map();
  for (const i of items) { const o = outletOf(i.source); if (!o) continue; const x = c.get(o.id) || { ...o, count: 0 }; x.count++; c.set(o.id, x); }
  return [...c.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

/**
 * The eight field colours for Figure 1: the categorical tokens --prp-cat-1…8 in their fixed order, each checked to be
 * a colour; a token that is missing or invalid falls back to `fallback` (the page passes --prp-muted), never to another
 * category's colour. `read(name)` returns a token's value and `isColour(v)` validates it (CSS.supports in the page).
 */
export function fieldColours(fieldIds, read, isColour, fallback) {
  return Object.fromEntries(fieldIds.map((id, k) => {
    const v = String(read(`--prp-cat-${k + 1}`) || '').trim();
    return [id, v && isColour(v) ? v : fallback];
  }));
}
