/* Vitruvian Manager highlights: the data behind the Workspace "Today" panel (PRP-ANALYSIS.md item 3, "Make the
   Workspace a workspace, not a catalogue"). The home page's four counts and 35 cards never change; this builds the few
   lines that do — the countries whose geopolitical volatility moved most over the last week, how busy each briefing has
   been, the next votes and summits on the calendar, and a market snapshot — each line linking back into the submodule it
   came from, so the home page points at what actually needs attention today.

   Pure and DOM-free, so the same code runs in the Node test and in the shell: it takes an injected fetch, reads only
   small public JSON (two files the Integration Hub derives for this panel, about 3 KB together, and the Realtime
   Calendar's window) and the trade-desk public API, and returns plain data. The shell loads it lazily after the home is
   interactive, renders each group the moment it settles (onGroup), and keeps the result in the session for 45 minutes
   (cacheEntry); nothing here can block or break the shell.

   HONESTY (PRP-ANALYSIS.md item 3, and the two reviews of this panel): every group is labelled by what its data
   genuinely is, and says what the page it links to says.
   - Volatility: the Geopolitical Volatility page's own "Biggest movers · 7 days" lists (integration/data/
     volatility-movers.json, worked out exactly as q/volatility.html does it: the mean of the last 7 scored days minus the
     mean of the 7 before), narrowed to the countries with medium or high coverage, each line saying its coverage and
     the lines left out counted in a note. Every country shown is in the page's lists, with the page's numbers. A rise
     is more volatile, so it is toned 'worse' (the bad colour) and a fall 'better', as on the page.
   - Briefings: each briefing's rolling 7-day store, as three facts (integration/data/briefing-activity.json, never the
     stores): its story count, its most-covered topic and when it was generated. The window is dated ("last 7 days, to
     29 Oct"), and a briefing not regenerated for two days is left out, with a note, since its "last 7 days" can no
     longer be vouched for.
   - Calendar: event-dated, today onward.
   - Markets: each quote carries its own time, and the window says when the quotes were fetched, never "live".
   National Analysis (PESTLE) is monthly and stores no prior-period value, so there is no honest day-to-day change to
   show from it and it is left out entirely.

   Shape: one group per id in GROUP_IDS, in that order.
     { id, title, source, window, href, link, items: [ { label, value?, detail?, href, tone? } ], note?, unavailable? }
   `window` names the true time window; `source` where the data comes from. `href` (on the group and every item) is a
   shell hash route into the submodule, e.g. '#/rt/volatility'; `link` names where the group's own link goes ("View
   Geopolitical Volatility"), so the four cards' links are told apart. A group has at most MAX_LINES items. `note` is a
   quiet line under them (what was left out, and why); since it takes a line's room it comes only with fewer than
   MAX_LINES items. `tone` is the only styling hint and introduces no colour: 'up' | 'down' for a market's gain or loss
   (the --prp-up / --prp-down tokens) and 'worse' | 'better' for a rise or fall in volatility (--prp-bad / --prp-good).
   A group whose source failed, timed out or held nothing is `unavailable: true`, with the same head, no items and a
   note; it goes to onGroup (so the shell can fill its slot) but is left out of the array buildTodayHighlights resolves.

   ESCAPING: every string here is plain text taken from data and MUST be escaped by the renderer with the shell's esc()
   before it is put into HTML. This module never escapes (that would double-escape) and never touches the DOM. Values
   fetched from a dataset or the API are treated strictly as data — read, formatted and compared, never executed and
   never used to build a URL: every address fetched is a fixed path, and every link is one of ROUTES. */

// Shell hash routes into each submodule (shell.js parses '#/<suite>/<submodule>'). Hard-coded, never from fetched data.
export const ROUTES = {
  volatility: '#/rt/volatility',
  scienceBriefing: '#/ns/science-briefing',
  econBriefing: '#/mm/econ-briefing',
  digitalBriefing: '#/ds/digital-briefing',
  intelligenceBriefing: '#/rt/briefing',
  calendar: '#/rt/calendar',
  markets: '#/mm/markets',
};

// The groups, in the order the panel shows them (shell.js TODAY_SLOTS lists the same ids, for its loading cards).
export const GROUP_IDS = ['volatility', 'briefings', 'calendar', 'markets'];
// At most this many lines in a group; the shell reserves the room for exactly this many, so the panel never jumps.
export const MAX_LINES = 5;
// No source is waited on longer than this; a source that has not answered by then counts as failed.
export const FETCH_TIMEOUT_MS = 8000;
// How long a session's panel may be shown without asking again (cacheEntry), and when a briefing has stopped refreshing.
export const CACHE_MAX_AGE_MS = 45 * 60 * 1000;
export const BRIEFING_STALE_MS = 2 * 24 * 60 * 60 * 1000;

// Each group's head: what its card says and where it links even when its data could not be read.
const HEADS = {
  volatility: { title: 'Biggest movers · 7 days', source: 'GDELT', href: ROUTES.volatility, link: 'Geopolitical Volatility' },
  briefings: { title: 'Briefing activity', source: 'Vitruvian Manager Briefings', href: ROUTES.scienceBriefing, link: 'Scientific Briefing' },
  calendar: { title: 'Upcoming', source: 'Political calendar', href: ROUTES.calendar, link: 'Realtime Calendar' },
  markets: { title: 'Market snapshot', source: 'trade-desk', href: ROUTES.markets, link: 'Market Briefing' },
};
// The group a slot shows when its source failed, timed out or held nothing worth a line.
export function unavailableGroup(id) {
  return { id, ...HEADS[id], window: '', items: [], note: 'Not available just now.', unavailable: true };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RISE = '▲';  // ▲ a rise, as the Volatility page marks it
const FALL = '▼';  // ▼ a fall
const MINUS = '−'; // − a true minus sign (not a hyphen), for signed numbers

/* --- small pure formatters (all display formatting lives here) --------------------------------------------------- */
const pad2 = n => String(n).padStart(2, '0');
const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// A whole number with thousands separators: 1036 -> "1,036". A non-number gives "".
const fmtInt = n => (Number.isFinite(n) ? commas(Math.round(n).toString()) : '');
// A signed percentage with a true minus sign: 1.31 -> "+1.31%", -1.38 -> "−1.38%".
const fmtPct = n => (Number.isFinite(n) ? (n < 0 ? MINUS : '+') + Math.abs(n).toFixed(2) + '%' : '');
// A price with thousands separators and two decimals: 7720.39 -> "7,720.39".
function fmtPrice(n) {
  if (!Number.isFinite(n)) return '';
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? MINUS : '') + commas(whole) + '.' + frac;
}
// A 7-day change as the Volatility page shows it, one decimal with its arrow: 9.5 -> "▲ +9.5", -7.46 -> "▼ −7.5".
const fmtChange = n => (n > 0 ? `${RISE} +` : `${FALL} ${MINUS}`) + Math.abs(n).toFixed(1);
// 'YYYY-MM-DD' -> "7 Nov 2026", or "7 Nov" in the year `thisYear` (it leaves an event's name the room); an unexpected
// value is returned unchanged so a line never shows a broken date.
function fmtEventDate(s, thisYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}${m[1] === thisYear ? '' : ' ' + +m[1]}` : String(s || '');
}
// The UTC day of an instant (epoch ms, a Date or an ISO string) or of a plain 'YYYY-MM-DD', as 'YYYY-MM-DD'; '' if none.
function utcDay(v) {
  const d = new Date(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00Z' : v);
  return v == null || v === '' || Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10);
}
// The day a window runs to, short: "29 Oct" (the year is this one, or the one just ended).
function fmtDay(v) {
  const s = utcDay(v);
  return s ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}` : '';
}
// An instant (epoch ms) as a UTC wall clock: "28 Oct 20:32 UTC".
function fmtClock(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
const cap = s => { const t = String(s || ''); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
const toneOf = n => (n > 0 ? 'up' : n < 0 ? 'down' : undefined);
const text = v => (typeof v === 'string' ? v : '');

/* --- reading a source: once each, never throwing, never waiting past the timeout ----------------------------------
   Any failure (no fetch at all, a network error, a non-2xx status, a body that is not JSON, or no answer within the
   timeout) resolves to null, and the caller then just drops that group. The deadline is kept here, racing the read, so
   it holds whatever fetch is injected (one that ignores abort signals included); the shell's own fetch also carries
   AbortSignal.timeout, so the request itself is cancelled then too. */
async function readJson(fetchImpl, url, ms) {
  const read = (async () => {
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    return await res.json();
  })().catch(() => null);
  if (!(ms > 0)) return read;
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(resolve, ms, null); });
  try { return await Promise.race([read, late]); } finally { clearTimeout(timer); }
}

/* --- METRIC 1: the biggest 7-day volatility movers (RT · Geopolitical Volatility) ---------------------------------
   integration/data/volatility-movers.json (integration/scripts/build-catalog.mjs) holds the page's "Biggest movers ·
   7 days" lists as the page draws them on its latest day: the six biggest rises and the six biggest falls of the 7-day
   average, among every country with both weeks scored, in the page's order and with its one-decimal figures. The page
   lists them whatever their coverage; here only those with medium or high coverage on the latest day (as the page's
   country profile gives it) are shown, the biggest change first, and the rest are counted in the note. */
const GOOD_COVERAGE = new Set(['high', 'medium']);
async function buildVolatility(ctx) {
  const file = await ctx.get('integration/data/volatility-movers.json'); // ~1.5 KB, not the 590 KB index or a day file
  const recs = Array.isArray(file?.records) ? file.records.filter(r => r && typeof r.name === 'string' && Number.isFinite(r.change7) && Number.isFinite(r.avg7)) : [];
  if (!recs.length) return null;
  const date = utcDay(file.date) || utcDay(recs[0].date);
  const shown = recs.filter(r => GOOD_COVERAGE.has(r.coverage) && r.change7 !== 0)
    .sort((a, b) => Math.abs(b.change7) - Math.abs(a.change7)) // stable: an equal change keeps the page's order
    .slice(0, MAX_LINES);
  const items = shown.map(r => ({
    label: r.name,
    value: fmtChange(r.change7),
    detail: `7-day avg ${r.avg7.toFixed(1)} · ${r.coverage} coverage`,
    href: ROUTES.volatility,
    tone: r.change7 > 0 ? 'worse' : 'better', // more volatile is worse: the page colours a rise red and a fall green
  }));
  const group = { id: 'volatility', ...HEADS.volatility, window: `medium & high coverage${date ? `, to ${fmtDay(date)}` : ''}`, items };
  // What the page lists that is not shown here, and why, while there is room for a note: "10 more on the page have low
  // or insufficient coverage." (a country with no row on the latest day has "no" coverage that day).
  const left = recs.filter(r => !GOOD_COVERAGE.has(r.coverage));
  if (items.length < MAX_LINES && left.length) {
    const level = r => (r.coverage === 'low' || r.coverage === 'insufficient' ? r.coverage : 'no');
    const levels = ['low', 'insufficient', 'no'].filter(l => left.some(r => level(r) === l));
    const how = levels.length > 1 ? `${levels.slice(0, -1).join(', ')} or ${levels.at(-1)}` : levels[0];
    group.note = items.length
      ? `${left.length} more on the page ${left.length === 1 ? 'has' : 'have'} ${how} coverage.`
      : `None of the page's ${recs.length} biggest movers has medium or high coverage.`;
  }
  return group;
}

/* --- METRIC 2: briefing activity over the last 7 days -------------------------------------------------------------
   integration/data/briefing-activity.json: per briefing, its id and name, `items` (the stories its rolling store holds,
   which is the last `days` days, pruned at every refresh), `topic` (the label of its most-covered topic; for the
   Intelligence Briefing, which has positions rather than topics, its most-represented political position, `facet:
   'positions'`) and `generated` (when the store was last built). */
const BRIEFING_ROUTES = { 'science-briefing': ROUTES.scienceBriefing, 'econ-briefing': ROUTES.econBriefing, 'digital-briefing': ROUTES.digitalBriefing, briefing: ROUTES.intelligenceBriefing };
async function buildBriefings(ctx) {
  const file = await ctx.get('integration/data/briefing-activity.json'); // ~1 KB, not 2.5 MB of stores
  const recs = Array.isArray(file?.records) ? file.records.filter(r => r && BRIEFING_ROUTES[r.id] && Number.isFinite(r.items) && r.items > 0) : [];
  if (!recs.length) return null;
  const now = +ctx.now;
  // A store not regenerated for two days (or with no date at all) may hold older stories than "the last 7 days": out.
  const fresh = recs.filter(r => now - Date.parse(r.generated) <= BRIEFING_STALE_MS);
  const stale = recs.filter(r => !fresh.includes(r));
  const lines = fresh.slice(0, MAX_LINES);
  // The window runs to the newest store's day; a line whose own store ends on another day, or keeps another number of
  // days, says so in its detail.
  const newest = lines.reduce((a, r) => (Date.parse(r.generated) > Date.parse(a.generated) ? r : a), lines[0] || {});
  const day = utcDay(newest.generated), days = Number.isFinite(newest.days) ? newest.days : 7;
  const items = lines.map(r => {
    const bits = [];
    if (text(r.topic)) bits.push(`${r.facet === 'positions' ? 'most from' : 'most in'} ${r.topic}`);
    if (utcDay(r.generated) !== day) bits.push(`to ${fmtDay(r.generated)}`);
    if (Number.isFinite(r.days) && r.days !== days) bits.push(`last ${r.days} days`);
    const item = { label: text(r.name) || r.id, value: `${fmtInt(r.items)} stories`, href: BRIEFING_ROUTES[r.id] };
    if (bits.length) item.detail = bits.join(' · ');
    return item;
  });
  const busiest = lines.reduce((a, r) => (r.items > a.items ? r : a), lines[0] || null); // the group's own link goes there
  const group = {
    id: 'briefings', ...HEADS.briefings,
    window: lines.length ? `last ${days} days, to ${fmtDay(day)}` : '',
    href: busiest ? BRIEFING_ROUTES[busiest.id] : HEADS.briefings.href,
    link: busiest ? text(busiest.name) || HEADS.briefings.link : HEADS.briefings.link,
    items,
  };
  if (stale.length && items.length < MAX_LINES) group.note = `Left out, not refreshed for two days: ${stale.map(r => text(r.name) || r.id).join(', ')}.`;
  return group;
}

/* --- METRIC 3: the next elections, referendums and summits (RT · Realtime Calendar) ------------------------------- */
async function buildCalendar(ctx) {
  const data = await ctx.get('integration/data/upcoming-political-events.json'); // the calendar's derived window, not a raw decade
  const records = Array.isArray(data?.records) ? data.records : [];
  if (!records.length) return null;
  const today = utcDay(ctx.now); // the file holds past events too, so cut to today onward
  const upcoming = records
    .filter(r => r && typeof r.date === 'string' && r.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!upcoming.length) return null;

  // Match Jude's "elections, referendums and summits"; if the window happens to hold none, show whatever is next.
  const WANT = new Set(['election', 'referendum', 'summit']);
  const scoped = upcoming.filter(r => WANT.has(r.type));
  const picks = (scoped.length ? scoped : upcoming).slice(0, MAX_LINES);
  // "2026 Commonwealth Heads of Government Meeting" on 1 Nov 2026: the date beside it already places it, so the name drops
  // the year, and the date drops it too when it is this year's (one next year says "1 Feb 2027").
  const name = r => { const t = text(r.title), y = r.date.slice(0, 4); return t.startsWith(y + ' ') ? t.slice(5) : t; };
  const thisYear = today.slice(0, 4);
  return {
    id: 'calendar', ...HEADS.calendar,
    window: scoped.length ? 'elections, referendums & summits' : 'any kind of event',
    items: picks.map(r => ({
      label: name(r) || `${cap(r.type)} · ${r.country || ''}`.trim(),
      value: fmtEventDate(r.date, thisYear),
      detail: [cap(r.type), r.country, r.status === 'tentative' ? 'tentative' : null].filter(Boolean).join(' · '),
      href: ROUTES.calendar,
    })),
  };
}

/* --- METRIC 4: a market snapshot — a few indices and the top hype movers (MM · Market Briefing) -------------------
   Each index line shows its price and its own quote time (`time`, epoch seconds), which can be the last session's
   close, hours before the fetch: "7,720.39 · 28 Oct 20:32 UTC". The window says when the Worker assembled the quotes
   (`at`, epoch ms). The hype tickers carry no time of their own and stand under that fetch time. */
const HEADLINES = ['^GSPC', '^FTSE', '^N225', 'GC=F', 'BTC-USD'];
async function buildMarkets(ctx) {
  // Both endpoints are on the trade-desk Worker (CORS-open, ~20 KB each). Read each once, concurrently.
  const [overview, hype] = await Promise.all([
    ctx.getAbs(ctx.marketsBase + '/api/public/overview'),
    ctx.getAbs(ctx.marketsBase + '/api/public/hype'),
  ]);
  let at = null; // when the quotes were fetched (epoch milliseconds), preferred from the quotes feed

  // A few headline instruments across equities, commodities and crypto, in a fixed order, whichever are present.
  const indices = [];
  if (Array.isArray(overview?.groups)) {
    if (Number.isFinite(overview.at)) at = overview.at;
    const all = overview.groups.flatMap(g => (Array.isArray(g?.items) ? g.items : []));
    for (const sym of HEADLINES) {
      const it = all.find(x => x && x.symbol === sym);
      if (!it || typeof it.changePct !== 'number') continue;
      const when = Number.isFinite(it.time) ? fmtClock(it.time * 1000) : '';
      indices.push({ label: text(it.name) || sym, value: fmtPct(it.changePct), detail: [fmtPrice(it.price), when].filter(Boolean).join(' · '), href: ROUTES.markets, tone: toneOf(it.changePct) });
    }
  }

  // The most talked-about tickers (the feed is already ordered by composite hype score), deduped by company name so
  // that, say, GOOG and GOOGL do not both appear.
  const talked = [];
  if (Array.isArray(hype?.tickers)) {
    if (at == null && Number.isFinite(hype.at)) at = hype.at;
    const seen = new Set();
    for (const t of hype.tickers) {
      if (!t || typeof t.changePct !== 'number') continue;
      const name = text(t.name) || text(t.symbol);
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const why = Array.isArray(t.why) && t.why.length ? String(t.why[0]) : null;
      const score = Number.isFinite(t.score) ? `hype ${fmtInt(t.score)}` : null;
      talked.push({ label: text(t.symbol) || name, value: fmtPct(t.changePct), detail: [score, why].filter(Boolean).join(' · '), href: ROUTES.markets, tone: toneOf(t.changePct) });
      if (talked.length >= MAX_LINES) break;
    }
  }

  // Five lines: three indices and two hype tickers, the other kind filling in when one feed has fewer or none.
  const nIdx = Math.min(indices.length, MAX_LINES - Math.min(talked.length, 2));
  const items = [...indices.slice(0, nIdx), ...talked.slice(0, MAX_LINES - nIdx)];
  if (!items.length) return null;
  return { id: 'markets', ...HEADS.markets, window: at != null ? `quotes fetched ${fmtClock(at)}` : 'quotes, fetch time not given', items };
}

/* --- the session cache's lifetime ------------------------------------------------------------------------------------
   cacheEntry(groups, now) -> { v: 2, at, until, groups }: what the shell keeps in sessionStorage. `at` is when it was
   written; `until` is when it stops being fresh: 45 minutes on, or the next UTC midnight if that comes first, since
   "today", the calendar's cut-off and the briefings' two-day rule all turn over then. A stale entry is still shown at
   once while the shell asks again, and replaced group by group as the answers come. */
export function cacheEntry(groups, now = new Date()) {
  const t = new Date(now), at = +t;
  const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
  return { v: 2, at, until: Math.min(at + CACHE_MAX_AGE_MS, midnight), groups };
}

/* --- the public entry point ---------------------------------------------------------------------------------------
   buildTodayHighlights({ fetch, base, now, marketsBase, timeoutMs, onGroup }) -> Promise<Group[]>
     fetch        an injected fetch, called as fetch(url) (default globalThis.fetch)
     base         URL prefix for same-origin data; '' (default) gives root-relative paths, exactly as the shell's own
                  fetch('registry.json') resolves them
     now          a Date for the calendar's "today" and the briefings' two-day rule (default new Date())
     marketsBase  the trade-desk Worker origin (default the live Worker)
     timeoutMs    how long any one source is waited for (default FETCH_TIMEOUT_MS, 8 s); 0 waits for ever
     onGroup      called with each group as soon as it settles, in whatever order the sources answer, and with an
                  unavailable group (unavailableGroup) for one that failed, so the shell can fill every slot in turn
   Resolves to the groups that have data, in GROUP_IDS order; it never rejects, so the shell can await it unguarded. */
export async function buildTodayHighlights(options = {}) {
  const {
    fetch: fetchImpl = globalThis.fetch,
    base = '',
    now = new Date(),
    marketsBase = 'https://trade-desk.judep92.workers.dev',
    timeoutMs = FETCH_TIMEOUT_MS,
    onGroup = null,
  } = options;
  // Resolve a same-origin data path the way the shell's fetch('registry.json') does (root-relative by default).
  const dataUrl = path => (base ? String(base).replace(/\/+$/, '') + '/' + path : path);
  const ctx = {
    get: path => readJson(fetchImpl, dataUrl(path), timeoutMs), // same-origin derived JSON
    getAbs: url => readJson(fetchImpl, url, timeoutMs),         // the cross-origin markets API
    now,
    marketsBase: String(marketsBase).replace(/\/+$/, ''),
  };
  const BUILDERS = { volatility: buildVolatility, briefings: buildBriefings, calendar: buildCalendar, markets: buildMarkets };
  // Build every group concurrently and hand each over as it settles. Each builder is already failure-proof, but guard
  // once more so that a bug in one can never reject the whole set — a broken group becomes unavailable, the rest show.
  const groups = await Promise.all(GROUP_IDS.map(async id => {
    const g = await Promise.resolve().then(() => BUILDERS[id](ctx)).catch(() => null);
    const out = g || unavailableGroup(id);
    if (typeof onGroup === 'function') { try { onGroup(out); } catch { /* the renderer's failure is not the data's */ } }
    return out;
  }));
  return groups.filter(g => !g.unavailable);
}

export default buildTodayHighlights;
