/* PRP highlights: the data behind the Workspace "Today" panel (PRP-ANALYSIS.md item 3, "Make the Workspace a
   workspace, not a catalogue"). The home page's four counts and 35 cards never change; this builds a handful of lines
   that do — the countries whose geopolitical volatility moved most over the last week, how busy each briefing has been,
   the next votes and summits on the calendar, and a market snapshot — each line linking back into the submodule it came
   from so the home page points at what actually needs attention today.

   Pure and DOM-free, so the same function runs in the Node test and in the shell: it takes an injected fetch, reads only
   small public JSON (the compact derived files the Integration Hub already builds, in preference to the big raw stores)
   and the trade-desk public API, and returns plain data. The shell loads it lazily after the home is interactive,
   caches the result for the session, and renders it; a group whose data could not be read is simply absent, so nothing
   here can block or break the shell.

   HONESTY (PRP-ANALYSIS.md item 3): every group is labelled by the cadence its data genuinely supports. Volatility is a
   daily per-country GVI series, so a 7-day change is real. The briefings each keep a rolling 7-day window (keepDays: 7),
   so the whole store is the last 7 days and the precomputed counts are genuinely "last 7 days" without any date
   filtering. The calendar is event-dated. National Analysis (PESTLE) is monthly and stores no prior-period value, so
   there is no honest day-to-day change to show from it and it is left out entirely.

   Shape returned (an array of groups; a group is omitted when its source fails or holds nothing worth a line):
     { id, title, source, window, href, items: [ { label, value?, detail?, href, tone? } ] }
   `window` names the true time window. `href` (on the group and every item) is a shell hash route into the submodule,
   e.g. '#/rt/volatility'. `tone` is 'up' | 'down' for a rise / fall and maps, in the renderer, to the --prp-up /
   --prp-down design tokens; it is the only styling hint and introduces no new colour.

   ESCAPING: every string here is plain text taken from data and MUST be escaped by the renderer with the shell's esc()
   before it is put into HTML. This module never escapes (that would double-escape) and never touches the DOM. Values
   fetched from a dataset or the API are treated strictly as data — read, formatted and compared, never executed and
   never used to build a fetch URL (the one data-derived URL, the volatility baseline day file, is built only from a
   strictly validated YYYY-MM-DD date, so a hostile value cannot reach the filesystem path). */

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UP = '↑';    // ↑ a rise
const DOWN = '↓';  // ↓ a fall
const MINUS = '−'; // − a true minus sign (not a hyphen), for signed numbers

/* --- small pure formatters (all display formatting lives here) --------------------------------------------------- */
const round1 = n => Math.round(n * 10) / 10;
const pad2 = n => String(n).padStart(2, '0');
const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// A whole number with thousands separators: 1036 -> "1,036". A non-number gives "".
const fmtInt = n => (Number.isFinite(n) ? commas(Math.round(n).toString()) : '');
// A 0–100 GVI score, dropping a trailing ".0": 77 stays "77", 75.9 stays "75.9".
const fmtScore = n => { const r = round1(n); return Number.isInteger(r) ? String(r) : r.toFixed(1); };
// A signed percentage with a true minus sign: 1.31 -> "+1.31%", -1.38 -> "−1.38%".
const fmtPct = n => (Number.isFinite(n) ? (n < 0 ? MINUS : '+') + Math.abs(n).toFixed(2) + '%' : '');
// A price with thousands separators and two decimals: 7720.39 -> "7,720.39".
function fmtPrice(n) {
  if (!Number.isFinite(n)) return '';
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? MINUS : '') + commas(whole) + '.' + frac;
}
// 'YYYY-MM-DD' -> "7 Nov 2026"; an unexpected value is returned unchanged so a line never shows a broken date.
function fmtEventDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${+m[1]}` : String(s || '');
}
// An epoch-millisecond instant as a UTC wall clock, for a market "as of": "29 Oct 2026, 20:18 UTC".
function fmtClock(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
// 'YYYY-MM-DD' minus N whole days, back to 'YYYY-MM-DD' (in UTC, so no time-zone drift); '' if the input is not a plain
// date. Validating here is also the guard that keeps a data-supplied date from ever reaching the day-file URL as-is.
function minusDays(dateStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
const isoDay = d => new Date(d).toISOString().slice(0, 10);
const cap = s => { const t = String(s || ''); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
const toneOf = n => (n > 0 ? 'up' : n < 0 ? 'down' : undefined);

/* --- reading a source: once each, and never throwing --------------------------------------------------------------
   Any failure (no fetch at all, a network error, a non-2xx status, or a body that is not JSON) resolves to null, and
   the caller then just drops that group. */
async function readJson(fetchImpl, url) {
  try {
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* --- METRIC 1: the biggest 7-day volatility movers (RT · Geopolitical Volatility) --------------------------------- */
async function buildVolatility(ctx) {
  const latest = await ctx.get('integration/data/volatility-latest.json'); // 55.8 KB day-0, not the ~550 KB raw store
  const records = Array.isArray(latest?.records) ? latest.records.filter(r => r && r.score != null) : [];
  if (!records.length) return null;
  const latestDate = typeof latest.records[0]?.date === 'string' ? latest.records[0].date : '';
  const to = latestDate ? `, to ${fmtEventDate(latestDate)}` : '';

  // Day-0 against the same series 7 days earlier: the small per-day file, keyed by iso3, not a multi-day shard.
  const baseDate = minusDays(latestDate, 7);
  const day = baseDate ? await ctx.get(`volatility/data/days/${baseDate}.json`) : null;
  const prior = day?.countries && typeof day.countries === 'object' ? day.countries : null;

  if (prior) {
    const movers = [];
    for (const r of records) {
      const b = prior[r.iso3];
      if (!b || b.score == null) continue; // only a country scored in BOTH snapshots can have a real change
      const delta = round1(r.score - b.score);
      if (delta === 0) continue;           // a country that did not move is not a mover
      movers.push({ name: r.name || r.iso3, score: r.score, delta });
    }
    // Biggest absolute change first (risers and fallers together); the current score breaks a tie.
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.score - a.score);
    const top = movers.slice(0, 5);
    if (top.length) {
      return {
        id: 'volatility', title: 'Biggest volatility movers', source: 'GDELT',
        window: `7-day change · daily${to}`, href: ROUTES.volatility,
        items: top.map(m => ({
          label: m.name,
          value: `${m.delta > 0 ? UP : DOWN} ${fmtScore(Math.abs(m.delta))}`,
          detail: `now ${fmtScore(m.score)}`,
          href: ROUTES.volatility,
          tone: toneOf(m.delta),
        })),
      };
    }
  }

  // Fallback, failing quietly: no baseline day file, so show the most volatile countries now, labelled as exactly that.
  const topNow = records.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  if (!topNow.length) return null;
  return {
    id: 'volatility', title: 'Most volatile now', source: 'GDELT',
    window: `daily${to}`, href: ROUTES.volatility,
    items: topNow.map(r => ({ label: r.name || r.iso3, value: `GVI ${fmtScore(r.score)}`, href: ROUTES.volatility })),
  };
}

/* --- METRIC 2: briefing activity over the last 7 days ------------------------------------------------------------- */
// The biggest entry of a precomputed { id: count } tally, mapped to its human label via the [{id,label}] definitions.
function topLabel(counts, defs) {
  if (!counts || typeof counts !== 'object') return null;
  let id = null, best = 0;
  for (const [k, v] of Object.entries(counts)) if (Number(v) > best) { best = Number(v); id = k; }
  if (id == null) return null;
  const def = Array.isArray(defs) ? defs.find(d => d && d.id === id) : null;
  return def?.label || id;
}
// The political position most covered this week, summing the per-source counts (never the item list) and naming it.
function topPosition(sources, positions) {
  const tally = {};
  for (const s of sources) if (s && s.position) tally[s.position] = (tally[s.position] || 0) + (Number(s.count) || 0);
  let key = null, best = 0;
  for (const [k, v] of Object.entries(tally)) if (v > best) { best = v; key = k; }
  if (key == null) return null;
  const p = Array.isArray(positions) ? positions.find(x => x && x.key === key) : null;
  return p?.label || key;
}
async function buildBriefings(ctx) {
  // Each topic store carries a precomputed `counts` (read the header; do not iterate the 1,000+ items). Each is a
  // rolling 7-day window (keepDays: 7), so counts.items is already the last-7-days total.
  const defs = [
    { file: 'science/briefing/data/stories.json', name: 'Scientific Briefing', href: ROUTES.scienceBriefing, key: 'disciplines' },
    { file: 'econ/briefing/data/stories.json',    name: 'Economics Briefing',  href: ROUTES.econBriefing,    key: 'fields' },
    { file: 'digital/briefing/data/stories.json', name: 'Digital Briefing',    href: ROUTES.digitalBriefing, key: 'fields' },
  ];
  // Fetch the three concurrently; each briefing stands or falls on its own, so one failure just drops that line.
  const lines = (await Promise.all(defs.map(async d => {
    const s = await ctx.get(d.file);
    const total = Number(s?.counts?.items);
    if (!Number.isFinite(total) || total <= 0) return null;
    const item = { label: d.name, value: `${fmtInt(total)} stories`, href: d.href };
    const topic = topLabel(s.counts[d.key], s[d.key]);
    if (topic) item.detail = `most in ${topic}`;
    return { count: total, item };
  }))).filter(Boolean);

  // The Intelligence Briefing is a 2 MB store with no topic tags, excluded by default to honour the performance mandate
  // (the analysis flags this page's weight). When asked for, use only the summed per-source counts — never its ~5,000
  // items — and its position balance.
  if (ctx.includeIntelligence) {
    const b = await ctx.get('briefing/data/latest.json');
    const sources = Array.isArray(b?.sources) ? b.sources : null;
    if (sources) {
      const total = sources.reduce((a, x) => a + (Number(x?.count) || 0), 0);
      if (total > 0) {
        const item = { label: 'Intelligence Briefing', value: `${fmtInt(total)} stories`, href: ROUTES.intelligenceBriefing };
        const pos = topPosition(sources, b.positions);
        if (pos) item.detail = `most from ${pos}`;
        lines.push({ count: total, item });
      }
    }
  }

  if (!lines.length) return null;
  const busiest = lines.reduce((a, b) => (b.count > a.count ? b : a)); // the whole-group link goes to the busiest one
  return {
    id: 'briefings', title: 'Briefing activity', source: 'Vitruvian Manager Briefings',
    window: 'last 7 days', href: busiest.item.href,
    items: lines.map(l => l.item),
  };
}

/* --- METRIC 3: the next elections, referendums and summits (RT · Realtime Calendar) ------------------------------- */
async function buildCalendar(ctx) {
  const data = await ctx.get('integration/data/upcoming-political-events.json'); // 146.6 KB derived, not a raw decade
  const records = Array.isArray(data?.records) ? data.records : [];
  if (!records.length) return null;
  const today = isoDay(ctx.now); // the file holds past events too, so cut to today onward
  const upcoming = records
    .filter(r => r && typeof r.date === 'string' && r.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!upcoming.length) return null;

  // Match Jude's "elections, referendums and summits"; if the window happens to hold none, show whatever is next.
  const WANT = new Set(['election', 'referendum', 'summit']);
  const scoped = upcoming.filter(r => WANT.has(r.type));
  const picks = (scoped.length ? scoped : upcoming).slice(0, 6);
  return {
    id: 'calendar', title: 'Upcoming', source: 'Political calendar',
    window: scoped.length ? 'elections, referendums & summits · soonest first' : 'events · soonest first',
    href: ROUTES.calendar,
    items: picks.map(r => ({
      label: r.title || `${cap(r.type)} · ${r.country || ''}`.trim(),
      value: fmtEventDate(r.date),
      detail: [cap(r.type), r.country, r.status === 'tentative' ? 'tentative' : null].filter(Boolean).join(' · '),
      href: ROUTES.calendar,
    })),
  };
}

/* --- METRIC 4: a market snapshot — a few indices and the top hype movers (MM · Market Briefing) ------------------- */
async function buildMarkets(ctx) {
  // Both endpoints are on the trade-desk Worker (CORS-open, ~20 KB each). Read each once, concurrently.
  const [overview, hype] = await Promise.all([
    ctx.getAbs(ctx.marketsBase + '/api/public/overview'),
    ctx.getAbs(ctx.marketsBase + '/api/public/hype'),
  ]);
  const items = [];
  let at = null; // the "as of" instant (epoch milliseconds), preferred from the quotes feed

  // A few headline instruments across equities, commodities and crypto, in a fixed order, whichever are present.
  if (Array.isArray(overview?.groups)) {
    if (Number.isFinite(overview.at)) at = overview.at;
    const all = overview.groups.flatMap(g => (Array.isArray(g?.items) ? g.items : []));
    for (const sym of ['^GSPC', '^FTSE', '^N225', 'GC=F', 'BTC-USD']) {
      const it = all.find(x => x && x.symbol === sym);
      if (!it || typeof it.changePct !== 'number') continue;
      items.push({ label: it.name || sym, value: fmtPct(it.changePct), detail: fmtPrice(it.price), href: ROUTES.markets, tone: toneOf(it.changePct) });
      if (items.length >= 4) break;
    }
  }

  // The most talked-about tickers (the feed is already ordered by composite hype score), deduped by company name so
  // that, say, GOOG and GOOGL do not both appear.
  if (Array.isArray(hype?.tickers)) {
    if (at == null && Number.isFinite(hype.at)) at = hype.at;
    const seen = new Set();
    let added = 0;
    for (const t of hype.tickers) {
      if (!t || typeof t.changePct !== 'number') continue;
      const name = t.name || t.symbol || '';
      const dedup = name.toLowerCase();
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      const why = Array.isArray(t.why) && t.why.length ? String(t.why[0]) : null;
      const score = Number.isFinite(t.score) ? `hype ${fmtInt(t.score)}` : null;
      items.push({
        label: t.symbol || name, value: fmtPct(t.changePct),
        detail: [score, why].filter(Boolean).join(' · '), href: ROUTES.markets, tone: toneOf(t.changePct),
      });
      if (++added >= 3) break;
    }
  }

  if (!items.length) return null;
  return {
    id: 'markets', title: 'Market snapshot', source: 'trade-desk',
    window: at != null ? `live quotes · as of ${fmtClock(at)}` : 'live quotes',
    href: ROUTES.markets, items,
  };
}

/* --- the public entry point ---------------------------------------------------------------------------------------
   buildTodayHighlights({ fetch, base, now, marketsBase, includeIntelligence }) -> Promise<Group[]>
     fetch               an injected fetch (default globalThis.fetch)
     base                URL prefix for same-origin data; '' (default) gives root-relative paths, exactly as the
                         shell's own fetch('registry.json') resolves them
     now                 a Date for the calendar "today" cut-off and the 7-day baseline maths (default new Date())
     marketsBase         the trade-desk Worker origin (default the live Worker)
     includeIntelligence include the 2 MB Intelligence Briefing store (default false, per the performance mandate)
   Resolves to the groups that have data; it never rejects, so the shell can await it without a guard. */
export async function buildTodayHighlights(options = {}) {
  const {
    fetch: fetchImpl = globalThis.fetch,
    base = '',
    now = new Date(),
    marketsBase = 'https://trade-desk.judep92.workers.dev',
    includeIntelligence = false,
  } = options;
  // Resolve a same-origin data path the way the shell's fetch('registry.json') does (root-relative by default).
  const dataUrl = path => (base ? String(base).replace(/\/+$/, '') + '/' + path : path);
  const ctx = {
    get: path => readJson(fetchImpl, dataUrl(path)),            // same-origin derived JSON
    getAbs: url => readJson(fetchImpl, url),                    // the cross-origin markets API
    now,
    marketsBase: String(marketsBase).replace(/\/+$/, ''),
    includeIntelligence,
  };
  // Build every group concurrently. Each builder is already failure-proof, but guard once more so that a bug in one can
  // never reject the whole set — a broken group drops out, the rest still show.
  const safe = fn => Promise.resolve().then(() => fn(ctx)).catch(() => null);
  const groups = await Promise.all([
    safe(buildVolatility),
    safe(buildBriefings),
    safe(buildCalendar),
    safe(buildMarkets),
  ]);
  return groups.filter(Boolean);
}

export default buildTodayHighlights;
