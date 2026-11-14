/* Vitruvian Manager highlights: the data behind the Dashboard's "Today" panel (#/home/dashboard; the panel was the
   Workspace home page's until November 2026, PRP-ANALYSIS.md item 3, "Make the Workspace a workspace, not a
   catalogue"). The Dashboard's four counts and its cards never change; this builds the few lines that do — the
   countries whose geopolitical volatility moved most over the last week, the topics rising and falling in the
   briefings' headlines, the next votes and summits on the calendar, and a market snapshot — each line opening the one
   thing it names in the submodule it came from (a country, a topic, an event, a ticker), so the Dashboard points at
   what actually needs attention today.

   Pure and DOM-free, so the same code runs in the Node test and in the shell: it takes an injected fetch, reads only
   small public JSON (the summaries each store's own build writes beside it, in step with it: integration/scripts/
   heads.mjs, about 25 KB together) and the trade-desk public API, and returns plain data. The shell loads it lazily
   after the Dashboard is interactive, renders each group the moment it settles (onGroup), and keeps the result in the
   session for 45 minutes (cacheEntry); nothing here can block or break the shell.

   IN STEP (the second review of 12 November 2026, "Summary pages disagree with their underlying data"): every summary
   read here is written by the same build, and committed in the same commit, as the store it summarises, and names the
   store's own time (summaryOf; tests/heads.test.mjs fails on main when one is out of step). Until 13 November the panel
   read two files the Integration Hub derived once a day, so a briefing refreshed since 05:23 was shown with its time of
   the day before, and could be left out as stale while its store was fresh.

   HONESTY (PRP-ANALYSIS.md item 3, and the two reviews of this panel): every group is labelled by what its data
   genuinely is, and says what the page it links to says.
   - Volatility, headed "Geopolitical change · 7 days" (Jude's wording, 12 November 2026; the page's own panel keeps
     its name): the Geopolitical Volatility page's own "Biggest movers · 7 days" lists (volatility/data/index.head.json,
     worked out exactly as q/volatility.html does it: the mean of the last 7 scored days minus the mean of the 7 before),
     narrowed to the countries with medium or high coverage, each line saying its coverage and the lines left out
     counted in a note. A rise is more volatile, so it is toned 'worse' (the bad colour) and a fall 'better', as on the
     page. Each line opens that country's profile on the page.
   - Headline trends (Jude, 12 November 2026: "Briefing Activity in the Dashboard should be updated to show changes in
     headline trends"): each briefing's trends.json, worked out by design/prp-trends.js, the same file Highbrowse's
     Trends tab reads, so the two never disagree. Up to three rising and two falling topics across the four briefings,
     each with this week's share, its percentile, and the share of the four weeks before; each line opens its topic's
     row in Highbrowse's Trends tab. Until there is history enough (or when nothing rose or fell) it shows each
     briefing's stories this week and its biggest topic, exactly as the Trends tab's "This week" gives them (a week not
     held in full names the days it lacks), and says when trends start. Every line says which briefing; the window says
     the week and the newest data time, and a line whose briefing was made at another time says its own. A briefing
     late by the daily check's rule (lateMs: the rule of every freshness line in the shell) says "Late" on its lines; one
     not refreshed for two days is left out, with a note giving its time, since its week can no longer be vouched for;
     one whose file could not be read is named in the note. The counts are of stories VM collected: the lines say how
     often a topic came up, never how important or true it is.
   - Calendar: event-dated, today onward (calendar/data/upcoming.json); each line opens its event in the Realtime
     Calendar.
   - Markets: each quote carries its own time, and the window says when the quotes were fetched, never "live". Each line
     opens its ticker on the Market Briefing.
   National Analysis (PESTLE) is monthly and stores no prior-period value, so there is no honest day-to-day change to
   show from it and it is left out entirely.

   Shape: one group per id in GROUP_IDS, in that order.
     { id, title, source, window, href, link, items: [ { label, value?, detail?, href, tone? } ], note?, unavailable? }
   `window` names the true time window; `source` where the data comes from. `href` (on the group and every item) is a
   shell hash route into the submodule, e.g. '#/rt/volatility', or a deep link into one thing on its page,
   '#/rt/volatility?at=q%2Fvolatility.html%23country%3DIRL' (the shell opens an ?at= address only on the submodule's own
   page). `link` names where the group's own link goes ("View Geopolitical Volatility"), so the four cards' links are
   told apart. A group has at most MAX_LINES items. `note` is a quiet line under them (what was left out, and why);
   since it takes a line's room it comes only with fewer than MAX_LINES items. `tone` is the only styling hint and
   introduces no colour: 'up' | 'down' for a market's gain or loss (the --prp-up / --prp-down tokens) and 'worse' |
   'better' for a rise or fall in volatility (--prp-bad / --prp-good). A headline trend has no tone: a topic coming up
   more is neither good nor bad. A group whose source failed, timed out or held nothing is `unavailable: true`, with the
   same head, no items and a note; it goes to onGroup (so the shell can fill its slot) but is left out of the array
   buildTodayHighlights resolves.

   ESCAPING: every string here is plain text taken from data and MUST be escaped by the renderer with the shell's esc()
   before it is put into HTML. This module never escapes (that would double-escape) and never touches the DOM. Values
   fetched from a dataset or the API are treated strictly as data — read, formatted and compared, never executed: every
   address fetched is a fixed path, and every link is one of ROUTES, or one of them with an address built from a key
   that first passed a strict pattern (KEYS) and is then encoded. */
import { movers, dayList } from './prp-trends.js';
import { SCHEDULES, rhythmFromCron, lateAfterHours } from './prp-freshness.js';

// Shell hash routes into each submodule (shell.js parses '#/<suite>/<submodule>'). Hard-coded, never from fetched data.
// The four briefings are in Highbrowse (hb) since November 2026; their old routes redirect there too.
export const ROUTES = {
  volatility: '#/rt/volatility',
  highbrowse: '#/hb/highbrowse',
  scienceBriefing: '#/hb/science-briefing',
  econBriefing: '#/hb/econ-briefing',
  digitalBriefing: '#/hb/digital-briefing',
  intelligenceBriefing: '#/hb/briefing',
  calendar: '#/rt/calendar',
  markets: '#/mm/markets',
};
// Each submodule's own page, as registry.json gives it: a deep link must name that page (shell.js deepLink).
const PAGES = {
  volatility: 'q/volatility.html',
  highbrowse: 'highbrowse/index.html',
  calendar: 'q/calendar.html?period=contemporary',
  markets: 'https://trade-desk.judep92.workers.dev/markets/',
};
// The only keys a link is ever built from; anything else gets the submodule's front page.
export const KEYS = {
  country: /^[A-Z]{3}$/,                                 // ISO 3166-1 alpha-3
  briefing: /^(political|scientific|economics|digital)$/,
  topic: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  event: /^\d{4}-\d{2}-\d{2}~[a-z0-9-]*~[a-z0-9-]*$/,    // integration/scripts/heads.mjs eventKey
  symbol: /^[A-Z0-9^=.-]{1,15}$/,
};
// A shell route that opens `page` (its own address, with the thing in its hash or query) in the submodule's frame.
const deep = (route, page) => `${route}?at=${encodeURIComponent(page)}`;
export const LINKS = {
  country: iso3 => (KEYS.country.test(String(iso3)) ? deep(ROUTES.volatility, `${PAGES.volatility}#country=${iso3}`) : ROUTES.volatility),
  topic: (b, id) => (KEYS.briefing.test(String(b)) && KEYS.topic.test(String(id)) ? deep(ROUTES.highbrowse, `${PAGES.highbrowse}#tab=trends&t=${b}.${id}`) : LINKS.trends()),
  trends: () => deep(ROUTES.highbrowse, `${PAGES.highbrowse}#tab=trends`),
  event: key => (KEYS.event.test(String(key)) ? deep(ROUTES.calendar, `${PAGES.calendar}&event=${key}`) : ROUTES.calendar),
  symbol: sym => (KEYS.symbol.test(String(sym)) ? deep(ROUTES.markets, `${PAGES.markets}#t=${encodeURIComponent(sym)}`) : ROUTES.markets),
};

// The groups, in the order the panel shows them (shell.js TODAY_SLOTS lists the same ids, for its loading cards).
export const GROUP_IDS = ['volatility', 'briefings', 'calendar', 'markets'];
// At most this many lines in a group; the shell reserves the room for exactly this many, so the panel never jumps.
export const MAX_LINES = 5;
// No source is waited on longer than this; a source that has not answered by then counts as failed.
export const FETCH_TIMEOUT_MS = 8000;
// How long a session's panel may be shown without asking again (cacheEntry), and when a briefing has stopped refreshing
// for so long that its week is left out (before then, from the daily data check's own limit, its lines say it is late:
// lateMs, the rule of every freshness line, design/prp-freshness.js).
export const CACHE_MAX_AGE_MS = 45 * 60 * 1000;
export const BRIEFING_STALE_MS = 2 * 24 * 60 * 60 * 1000;

// The four briefings' summaries (integration/scripts/heads.mjs), in the order their lines are listed, each with the
// refresh workflow that writes its store (its rhythm, and so when it is late, comes from that workflow's schedule).
export const BRIEFINGS = [
  { key: 'scientific', name: 'Scientific Briefing', short: 'Scientific', trends: 'science/briefing/data/trends.json', route: ROUTES.scienceBriefing, order: 1, workflow: 'briefings-refresh.yml' },
  { key: 'economics', name: 'Economics Briefing', short: 'Economics', trends: 'econ/briefing/data/trends.json', route: ROUTES.econBriefing, order: 2, workflow: 'briefings-refresh.yml' },
  { key: 'digital', name: 'Digital Briefing', short: 'Digital', trends: 'digital/briefing/data/trends.json', route: ROUTES.digitalBriefing, order: 3, workflow: 'briefings-refresh.yml' },
  { key: 'political', name: 'Political Briefing', short: 'Political', trends: 'briefing/data/trends.json', route: ROUTES.intelligenceBriefing, order: 0, workflow: 'briefing-refresh.yml' },
];
// When a briefing's store is late, as every freshness line counts it: twice its refresh's rhythm plus three hours.
export const lateMs = b => lateAfterHours(rhythmFromCron(SCHEDULES[b.workflow]).hours) * 3600e3;

// Each group's head: what its card says and where it links even when its data could not be read.
const HEADS = {
  volatility: { title: 'Geopolitical change · 7 days', source: 'GDELT', href: ROUTES.volatility, link: 'Geopolitical Volatility' },
  briefings: { title: 'Headline trends · 7 days', source: 'Vitruvian Manager Briefings', href: LINKS.trends(), link: 'Highbrowse trends' },
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
// A share (0..1) as a percentage with one decimal: 0.182 -> "18.2%".
const fmtShare = s => (Number.isFinite(s) ? (s * 100).toFixed(1) + '%' : '');
// An ordinal: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st…
const ordinal = n => { const t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); };
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
   volatility/data/index.head.json (written with the index, integration/scripts/heads.mjs) holds the page's "Biggest
   movers · 7 days" lists as the page draws them on its latest day: the six biggest rises and the six biggest falls of
   the 7-day average, among every country with both weeks scored, in the page's order and with its one-decimal figures.
   The page lists them whatever their coverage; here only those with medium or high coverage on the latest day (as the
   page's country profile gives it) are shown, the biggest change first, and the rest are counted in the note. */
const GOOD_COVERAGE = new Set(['high', 'medium']);
async function buildVolatility(ctx) {
  const head = await ctx.get('volatility/data/index.head.json'); // ~2 KB, not the 700 KB index or a day file
  const file = head?.movers;
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
    href: LINKS.country(r.iso3),
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

/* --- METRIC 2: headline trends over the last 7 days ---------------------------------------------------------------
   Each briefing's trends.json (written with its store, integration/scripts/heads.mjs, by design/prp-trends.js):
   `generated` (the store's own time), `status` ('ok' when there is history enough), `week` ({ from, to }), `topics`
   (each with this week's share s0, the four weeks' average b, `trend` and `percentile`), `startsAbout` (when trends can
   start), and the store's three facts: `stories` held, its top `topic` (the Political Briefing's most-represented
   political position, `facet: 'positions'`) and the `name`.
   Rising and falling topics come from movers() (design/prp-trends.js), as Highbrowse's Trends tab lists them. */
const briefingOk = t => t && typeof t.generated === 'string' && Number.isFinite(Date.parse(t.generated)) && Array.isArray(t.topics);
// Each briefing's own data time, as its lines say it: the newest store's time goes in the card's window, and a line from
// a briefing made at another minute says its own ("data 18:52 UTC", with the day when that differs too).
function ownTime(x, newest) {
  const ms = Date.parse(x.t.generated);
  if (fmtClock(ms) === fmtClock(newest)) return '';
  return utcDay(ms) === utcDay(newest) ? `data ${fmtClock(ms).slice(-9)}` : `data ${fmtClock(ms)}`;
}
const andList = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(''));
// The week a briefing's trends.json counts ("This week" on Highbrowse's Trends tab): its stories and, when it counts,
// its biggest topic this week; when some of its days are not held in full, which.
const weekOf = t => (Array.isArray(t.weeks) ? t.weeks.find(w => w && w.k === 0) : null) || null;
function topTopic(t) {
  let best = null;
  for (const x of t.topics) if (Number.isFinite(x?.n0) && x.n0 > 0 && (!best || x.n0 > best.n0)) best = x;
  return best ? text(best.label) || text(best.short) || best.id : '';
}
async function buildBriefings(ctx) {
  const files = await Promise.all(BRIEFINGS.map(b => ctx.get(b.trends)));
  const all = BRIEFINGS.map((b, k) => ({ b, t: files[k] }));
  const read = all.filter(x => briefingOk(x.t));
  if (!read.length) return null;
  const now = +ctx.now, age = x => now - Date.parse(x.t.generated);
  // A briefing whose summary could not be read is named, never silently dropped (the second review of 12 November:
  // "Dashboard also incorrectly excludes Economics").
  const unreadNote = read.length < all.length ? `${andList(all.filter(x => !read.includes(x)).map(x => x.b.name))} could not be read just now.` : '';
  // Late, as every freshness line counts it (the top bar, the sidebar, the tiles): its lines say so. A store not
  // refreshed for two days may no longer hold "the last 7 days": out, with its time in the note.
  const fresh = read.filter(x => age(x) <= BRIEFING_STALE_MS);
  const stale = read.filter(x => !fresh.includes(x));
  for (const x of fresh) x.late = age(x) > lateMs(x.b);
  const staleNote = stale.length ? `Left out, not refreshed for two days: ${stale.map(x => `${x.b.name} (data ${fmtClock(Date.parse(x.t.generated))})`).join(', ')}.` : '';
  const notes = [staleNote, unreadNote].filter(Boolean).join(' ');
  if (!fresh.length) return { id: 'briefings', ...HEADS.briefings, window: '', items: [], note: notes };
  const lateTime = x => `Late: data ${fmtClock(Date.parse(x.t.generated))}`;

  const ok = fresh.filter(x => x.t.status === 'ok');
  const { rising, falling } = movers(ok.map(x => ({ briefing: x.b.key, order: x.b.order, trends: x.t })), { rising: 3, falling: 2 });
  const byKey = Object.fromEntries(fresh.map(x => [x.b.key, x]));
  // The newest of these briefings' stores, and the week it counts (a briefing made on another day counts another week,
  // and its lines say which).
  const newestIn = list => list.reduce((a, x) => (Date.parse(x.t.generated) > Date.parse(a.t.generated) ? x : a));
  const trendLine = (x, up) => {
    // The percentile first, so a narrow card never cuts it; then the baseline; then what differs from the window.
    const own = byKey[x.briefing], bits = [];
    if (own.late) bits.push(lateTime(own));
    if (Number.isFinite(x.percentile)) bits.push(`${ordinal(x.percentile)} percentile`);
    bits.push(`${fmtShare(x.b)} in the 4 weeks before`);
    if (own.t.week?.to !== wk.to) bits.push(`week to ${fmtDay(own.t.week?.to)}`);
    if (!own.late) { const t = ownTime(own, newest); if (t) bits.push(t); }
    return { label: `${text(x.short) || text(x.label) || x.id} · ${own.b.short}`, value: `${up ? RISE : FALL} ${fmtShare(x.s0)}`, detail: bits.join(' · '), href: LINKS.topic(x.briefing, x.id) };
  };
  let wk = null, newest = null;
  if (rising.length || falling.length) {
    const lead = newestIn(ok);
    wk = lead.t.week; newest = Date.parse(lead.t.generated);
    // A note takes a line's room: with one to give, four lines at most.
    const room = notes ? MAX_LINES - 1 : MAX_LINES;
    const lines = [...rising.map(x => trendLine(x, true)), ...falling.map(x => trendLine(x, false))].slice(0, room);
    // The window: the week compared, and when the newest store compared was made (each line gives its briefing's own
    // time when it differs). Short, so the card's source still shows beside it.
    const group = { id: 'briefings', ...HEADS.briefings, window: `${fmtDay(wk.from)}–${fmtDay(wk.to)} · data ${fmtClock(newest)}`, items: lines };
    if (notes) group.note = notes;
    return group;
  }

  // No trend to show yet: each briefing's stories this week and its biggest topic, exactly as Highbrowse's Trends tab
  // gives them ("This week", whole UTC days), a week not held in full saying which days; and when trends start (or that
  // none moved).
  const lead = newestIn(fresh);
  wk = lead.t.week || null; newest = Date.parse(lead.t.generated);
  const items = fresh.slice(0, MAX_LINES).map(x => {
    const { b, t } = x, w0 = weekOf(t), bits = [];
    if (x.late) bits.push(lateTime(x)); else { const own = ownTime(x, newest); if (own) bits.push(own); }
    if (wk && t.week?.to !== wk.to) bits.push(`week to ${fmtDay(t.week?.to)}`);
    if (w0 && !w0.counts) bits.push(Array.isArray(w0.missing) && w0.missing.length ? `this week incomplete: ${dayList(w0.missing)} not held in full` : `this week: ${text(w0.why)}`);
    else if (w0) { const top = topTopic(t); if (top) bits.push(`most in ${top}`); }
    else if (text(t.topic)) bits.push(`${t.facet === 'positions' ? 'most from' : 'most in'} ${t.topic}`); // a file without its weeks
    return { label: b.name, value: `${fmtInt(w0 ? w0.stories : t.stories)} stories`, detail: bits.join(' · '), href: b.route };
  });
  const group = { id: 'briefings', ...HEADS.briefings, window: wk ? `${fmtDay(wk.from)}–${fmtDay(wk.to)} · data ${fmtClock(newest)}` : `data ${fmtClock(newest)}`, items };
  let note = '';
  if (ok.length) note = 'No topic rose or fell beyond its usual range this week.';
  else {
    const days = [...new Set(fresh.map(x => x.t.startsAbout).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort();
    if (days.length) note = `Trends start when VM holds four earlier weeks in full: about ${fmtDay(days[0])}${days.length > 1 ? `–${fmtDay(days.at(-1))}` : ''}.`;
  }
  if (notes) note = note ? `${note} ${notes}` : notes;
  if (note && items.length < MAX_LINES) group.note = note;
  return group;
}

/* --- METRIC 3: the next elections, referendums and summits (RT · Realtime Calendar) -------------------------------
   calendar/data/upcoming.json (written with the calendars, integration/scripts/heads.mjs): the events from a week
   before the build onward, each with the key q/calendar.html opens it by. */
async function buildCalendar(ctx) {
  const data = await ctx.get('calendar/data/upcoming.json'); // ~20 KB, not a 760 KB decade
  const records = Array.isArray(data?.events) ? data.events : [];
  if (!records.length) return null;
  const today = utcDay(ctx.now); // the file holds the last week's events too, so cut to today onward
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
      href: LINKS.event(r.key),
    })),
  };
}

/* --- METRIC 4: a market snapshot — a few indices and the top hype movers (MM · Market Briefing) -------------------
   Each index line shows its price and its own quote time (`time`, epoch seconds), which can be the last session's
   close, hours before the fetch: "7,720.39 · 28 Oct 20:32 UTC". The window says when the Worker assembled the quotes
   (`at`, epoch ms). The hype tickers carry no time of their own and stand under that fetch time. Each line opens its
   ticker on the Market Briefing (#t=<symbol>, which the money site's page reads). */
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
      indices.push({ label: text(it.name) || sym, value: fmtPct(it.changePct), detail: [fmtPrice(it.price), when].filter(Boolean).join(' · '), href: LINKS.symbol(sym), tone: toneOf(it.changePct) });
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
      talked.push({ label: text(t.symbol) || name, value: fmtPct(t.changePct), detail: [score, why].filter(Boolean).join(' · '), href: LINKS.symbol(t.symbol), tone: toneOf(t.changePct) });
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
   cacheEntry(groups, now) -> { v: 3, at, until, groups }: what the shell keeps in sessionStorage. `at` is when it was
   written; `until` is when it stops being fresh: 45 minutes on, or the next UTC midnight if that comes first, since
   "today", the calendar's cut-off and the briefings' two-day rule all turn over then. A stale entry is still shown at
   once while the shell asks again, and replaced group by group as the answers come. (v 3 since 13 November 2026: the
   lines carry deep links and the briefings' card shows headline trends; an entry of v 2 is not shown.) */
export function cacheEntry(groups, now = new Date()) {
  const t = new Date(now), at = +t;
  const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
  return { v: 3, at, until: Math.min(at + CACHE_MAX_AGE_MS, midnight), groups };
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
    get: path => readJson(fetchImpl, dataUrl(path), timeoutMs), // same-origin summaries
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
