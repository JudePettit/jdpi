// Vitruvian Manager highlights: the Dashboard's "Today" panel (design/prp-highlights.js and its renderer in shell.js
// and shell.css, PRP-ANALYSIS.md item 3), with a test for each finding of the panel's reviews. The panel was the
// Workspace home page's (#/) until November 2026; it moved with the Workspace to the Dashboard (#/home/dashboard), the
// Home module's submodule, so the page tests open it there.
//   node --test tests/highlights.test.mjs
// logic: tests run buildTodayHighlights() in Node against small inline fixtures through a stub fetch (no browser, no
// network): the shape of each group; it reads the summaries each store's build writes beside it (never the Hub's daily
// copies under integration/data, and never a store); the volatility movers taken from the page's own lists, narrowed to
// medium and high coverage and toned as worse/better; the headline trends (rising and falling topics, or each
// briefing's stories while there is too little history), each briefing's own data time, a stale one left out and a
// fresh one never; each line opening its own thing (a country, a topic, an event, a ticker), and a key that fails its
// pattern making no link; each quote with its own time; five lines at most; the timeout and the order groups arrive in;
// the session cache's lifetime; and that a failing or empty source never throws. source: tests check that the shell
// and its styles agree with the module (slots, tones, the focus ring), and that every deep link names its submodule's
// own page, as the shell requires. page: tests drive Microsoft Edge through the Dashboard at JDPI_URL (by default the
// local server, tests/tools/serve.mjs; they skip when nothing is served there), with every source of the panel served
// by the test: the panel keeps its height from loading to filled at 1440 and 390 px, focus rings show, the fill is not
// announced, the cache is honoured and refreshed, a stalled source is given up on, the Home page loads none of it, and
// each kind of line opens its thing. PRP_PAGES=0 leaves the page: tests out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { buildTodayHighlights, cacheEntry, unavailableGroup, ROUTES, LINKS, KEYS, BRIEFINGS, GROUP_IDS, MAX_LINES, FETCH_TIMEOUT_MS, CACHE_MAX_AGE_MS, BRIEFING_STALE_MS, lateMs } from '../design/prp-highlights.js';
import { freshnessLine } from '../design/prp-freshness.js';

// The only addresses the shell accepts (shell.js SHELL_ROUTE); every group and item link must match it.
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;
const RISE = '▲', FALL = '▼', M = '−'; // ▲ ▼ − exactly as the module emits them
const NOW = new Date('2026-10-29T12:00:00Z');        // fixes "today" for the calendar and the briefings' two-day rule
const H = 3600e3, DAY = 24 * H;
const iso = ms => new Date(ms).toISOString();
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const at = (route, page) => `${route}?at=${encodeURIComponent(page)}`;

/* --- a stub fetch: route a URL to a fixture by substring, and record every request --------------------------------
   A fixture value is the JSON to return (200); the sentinels 'throw' (network error), '404' (not found), 'badjson'
   (a 200 whose body is not JSON) and 'hang' (never answers) stand in for the failure modes the module must survive.
   Keys are tried longest first, so 'science/briefing/data/trends' wins over 'briefing/data/trends'. */
function stubFetch(table, calls = []) {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  return async url => {
    const u = String(url);
    calls.push(u);
    for (const key of keys) {
      if (!u.includes(key)) continue;
      const v = table[key];
      if (v === 'throw') throw new Error('network down: ' + u);
      if (v === 'hang') return new Promise(() => {});
      if (v === 'badjson') return new Response('<<not json', { status: 200 });
      if (v === '404') return new Response('nope', { status: 404 });
      return new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('unrouted: ' + u, { status: 404 });
  };
}

/* --- fixtures (shapes taken from the real files, trimmed to a handful of rows) ------------------------------------ */
// volatility/data/index.head.json: the page's Rising (the first six) and Easing (the last six) lists, in the page's
// order (change7 descending), with every coverage level the page lists.
const movers = (recs, extra = {}) => ({
  summaryOf: { 'volatility/data/index.json': { generated: '2026-10-29T01:40:00Z', sha1: 'x' } }, generated: '2026-10-29T01:40:00Z', latest: '2026-10-28',
  movers: { date: '2026-10-28', countries: 90, ...extra, records: recs.map(([iso3, name, score, avg7, change7, coverage]) => ({ iso3, name, score, avg7, change7, coverage, date: '2026-10-28' })) },
});
const PAGE_LISTS = [
  ['AAA', 'Alpha', 60, 63.2, 9.5, 'low'], ['BBB', 'Bravo', 61, 56.7, 8.2, 'medium'], ['CCC', 'Charlie', 62.2, 59.9, 7.9, 'insufficient'],
  ['DDD', 'Delta', 55.6, 51.1, 5.2, 'high'], ['EEE', 'Echo', 65.3, 64.9, 4.6, null], ['FFF', 'Foxtrot', 40, 49, 1.4, 'medium'],
  ['GGG', 'Golf', 44.4, 44.3, -7.1, 'low'], ['HHH', 'Hotel', 57.6, 49.6, -7.2, 'high'], ['III', 'India', 42.8, 45.2, -7.5, 'medium'],
  ['JJJ', 'Juliett', 37.2, 50.1, -8.4, 'low'], ['KKK', 'Kilo', 57.1, 55.8, -8.7, 'high'], ['LLL', 'Lima', 54.2, 51.8, -9.9, 'low'],
];
const VOL_HEAD = movers(PAGE_LISTS);
// Each briefing's trends.json (integration/scripts/heads.mjs, design/prp-trends.js). NOW is 29 Oct 12:00 UTC: Digital was
// last refreshed 2 days 16 hours ago (out), the Political Briefing yesterday evening (in, with its own time).
const topic = (id, label, extra = {}) => ({ id, label, short: label, n0: null, s0: null, base: [], b: null, e: null, ratio: null, trend: null, percentile: null, rank: null, history: [], ...extra });
const trendsFile = (key, generated, extra = {}) => ({
  summaryOf: {}, briefing: key, generated, week: { from: '2026-10-22', to: '2026-10-28' }, status: 'short', reason: 'Not enough history yet: 1 of the 4 earlier weeks.',
  have: 1, need: 4, startsAbout: '2026-12-03', percentilesAbout: '2026-12-31', baseline: [], weeks: [], topics: [], ...extra,
});
// Each file's own week ("This week" on Highbrowse's Trends tab: whole UTC days, 22 to 28 Oct) is what the card shows
// while there is too little history: its stories (not the store's rolling count, `stories`) and its biggest topic; the
// Economics Briefing's week lacks two days.
const wk0 = (stories, extra = {}) => [{ k: 0, from: '2026-10-22', to: '2026-10-28', stories, counts: true, why: null, ...extra }];
const SHORT = {
  'science/briefing/data/trends': trendsFile('scientific', '2026-10-29T01:45:12Z', { name: 'Scientific Briefing', stories: 1036, topic: 'Biology', facet: 'disciplines', startsAbout: '2026-12-10',
    weeks: wk0(980), topics: [topic('physics', 'Physics', { n0: 200, s0: 0.2 }), topic('biology', 'Biology', { n0: 300, s0: 0.3 })] }),
  'econ/briefing/data/trends': trendsFile('economics', '2026-10-29T01:45:40Z', { name: 'Economics Briefing', stories: 453, topic: 'Monetary policy & central banks', facet: 'fields', startsAbout: '2026-12-10',
    status: 'week', reason: 'This week cannot be compared yet: 25 and 26 Oct are not held in full in the store\'s history.', weeks: wk0(401, { counts: false, why: '2 of its days are not held in full', missing: ['2026-10-25', '2026-10-26'] }), topics: [topic('monetary', 'Monetary policy & central banks')] }),
  'digital/briefing/data/trends': trendsFile('digital', '2026-10-26T19:45:00Z', { name: 'Digital Briefing', stories: 664, topic: 'AI & machine learning', facet: 'fields', weeks: wk0(600), topics: [topic('ai', 'AI & machine learning', { n0: 90, s0: 0.15 })] }),
  'briefing/data/trends': trendsFile('political', '2026-10-28T18:05:00Z', { name: 'Political Briefing', stories: 4920, topic: 'Centre', facet: 'positions', startsAbout: '2026-12-01',
    weeks: wk0(4875), topics: [topic('us-politics', 'US politics', { n0: 1500, s0: 0.31 }), topic('china', 'China', { n0: 600, s0: 0.12 })] }),
};
// With history enough: Economics' Monetary policy rose (18.2% of its stories, 12.0% in the four weeks before: 1.52×) and
// Trade fell; the Political Briefing's China rose more (2×, the 82nd percentile) and Europe rose from nothing; Science
// still has too little history, so it adds nothing.
const OK = {
  ...SHORT,
  'econ/briefing/data/trends': { ...SHORT['econ/briefing/data/trends'], status: 'ok', reason: null, have: 4, startsAbout: null, baseline: [1, 2, 3, 4], topics: [
    topic('monetary', 'Monetary policy & central banks', { short: 'Monetary policy', n0: 91, s0: 0.182, b: 0.12, ratio: 0.182 / 0.12, trend: 'rising' }),
    topic('trade', 'Trade & globalisation', { short: 'Trade', n0: 15, s0: 0.03, b: 0.09, ratio: 0.03 / 0.09, trend: 'falling' }),
    topic('macro', 'Macro & growth', { n0: 80, s0: 0.16, b: 0.15, ratio: 0.16 / 0.15, trend: 'steady' }),
  ] },
  'briefing/data/trends': { ...SHORT['briefing/data/trends'], status: 'ok', reason: null, have: 4, startsAbout: null, baseline: [1, 2, 3, 4], topics: [
    topic('china', 'China', { n0: 600, s0: 0.12, b: 0.06, ratio: 2, trend: 'rising', percentile: 82, rank: { lower: 9, equal: 0, of: 11 } }),
    topic('europe', 'Europe', { n0: 25, s0: 0.005, b: 0, ratio: null, trend: 'rising' }),
    topic('us-politics', 'US politics', { n0: 1500, s0: 0.3, b: 0.31, ratio: 0.97, trend: 'steady' }),
  ] },
};
// calendar/data/upcoming.json: past events and non-want types are present on purpose; only future
// elections/referendums/summits should survive.
const ev = (date, type, country, title, status = 'declared') => ({ key: `${date}~${country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}~${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, date, country, title, type, status });
const CALENDAR = {
  summaryOf: {}, generated: '2026-10-29T06:20:03Z', from: '2026-10-22',
  events: [
    ev('2026-10-22', 'court', 'United States', 'Past court ruling'),
    ev('2026-10-29', 'election', 'Narnia', 'Election today'),
    ev('2026-11-01', 'summit', 'Antigua', '2026 Commonwealth Heads of Government Meeting'),
    ev('2026-11-03', 'election', 'United States', 'US midterms'),
    ev('2026-11-05', 'protest', 'France', 'Planned protest', 'tentative'),
    ev('2026-11-07', 'referendum', 'Switzerland', 'Swiss referendum', 'tentative'),
    ev('2026-12-01', 'election', 'Ghana', 'Ghana election'),
    ev('2027-02-01', 'summit', 'Kenya', 'AU summit'),
  ],
};
// The quotes feed, fetched at 11:58 UTC: the S&P 500's quote is the last session's close, the day before; Bitcoin's has
// no time at all.
const sec = s => Date.parse(s) / 1000;
const OVERVIEW = {
  at: Date.parse('2026-10-29T11:58:09Z'),
  groups: [
    { group: 'US', items: [
      { symbol: '^GSPC', name: 'S&P 500', price: 7720.39, changePct: -0.3046237, time: sec('2026-10-28T20:32:46Z') },
      { symbol: '^IXIC', name: 'NASDAQ Composite', price: 26000, changePct: -1.38, time: sec('2026-10-28T21:00:00Z') },
    ] },
    { group: 'Europe', items: [{ symbol: '^FTSE', name: 'FTSE 100', price: 10722.07, changePct: 0.257796, time: sec('2026-10-29T11:57:30Z') }] },
    { group: 'Commodities', items: [{ symbol: 'GC=F', name: 'Gold', price: 4037.9, changePct: -0.338138, time: sec('2026-10-29T11:55:02Z') }] },
    { group: 'Crypto', items: [{ symbol: 'BTC-USD', name: 'Bitcoin USD', price: 80271.82, changePct: -1.2185517 }] },
  ],
};
const HYPE = {
  at: 1, // deliberately tiny: the quotes feed's `at` should win the fetch time
  weights: { talk: 0.45, volume: 0.4, search: 0.15 },
  tickers: [
    { symbol: 'GOOG', name: 'Alphabet (Google)', score: 99, changePct: -12.293, why: ['656 Reddit mentions (95 a day earlier)'] },
    { symbol: 'GOOGL', name: 'Alphabet (Google)', score: 98, changePct: -12.641, why: ['326 Reddit mentions'] },
    { symbol: 'NOW', name: 'ServiceNow', score: 96, changePct: -27.0, why: ['revenue warning'] },
    { symbol: 'NVDA', name: 'NVIDIA', score: 90, changePct: 3.5, why: ['record highs'] },
  ],
};
// A table that routes every source to a good fixture.
const ALL_GOOD = {
  'volatility/data/index.head': VOL_HEAD,
  ...SHORT,
  'calendar/data/upcoming': CALENDAR,
  'api/public/overview': OVERVIEW,
  'api/public/hype': HYPE,
};
const SOURCES = ['/api/public/hype', '/api/public/overview', 'briefing/data/trends.json', 'calendar/data/upcoming.json', 'digital/briefing/data/trends.json',
  'econ/briefing/data/trends.json', 'science/briefing/data/trends.json', 'volatility/data/index.head.json'];
const run = (table, opts = {}) => buildTodayHighlights({ fetch: stubFetch(table, opts.calls), base: '', marketsBase: '', now: NOW, ...opts });
const byId = (groups, id) => groups.find(g => g.id === id);

/* --- shape, routes and fetch-once -------------------------------------------------------------------------------- */
test('logic: all four groups build, with the documented shape and shell-route links, reading eight small summaries once', async () => {
  const calls = [];
  const groups = await run(ALL_GOOD, { calls });
  assert.deepEqual(groups.map(g => g.id), GROUP_IDS, 'the four groups, in order');
  assert.deepEqual(GROUP_IDS, ['volatility', 'briefings', 'calendar', 'markets']);

  for (const g of groups) {
    for (const f of ['id', 'title', 'source', 'window', 'href', 'link']) {
      assert.equal(typeof g[f], 'string', `${g.id}.${f} is a string`);
      assert.ok(g[f].length, `${g.id}.${f} is not empty`);
    }
    assert.match(g.href, SHELL_ROUTE, `${g.id} group href is a shell route`);
    assert.ok(Array.isArray(g.items) && g.items.length && g.items.length <= MAX_LINES, `${g.id} has 1 to ${MAX_LINES} items`);
    assert.ok(!/\blive\b/i.test(g.window), `${g.id}: no window claims to be live`);
    for (const it of g.items) {
      assert.equal(typeof it.label, 'string'); assert.ok(it.label.length, `${g.id} item label not empty`);
      assert.match(it.href, SHELL_ROUTE, `${g.id} item href is a shell route`);
      if (it.value !== undefined) assert.equal(typeof it.value, 'string');
      if (it.detail !== undefined) assert.equal(typeof it.detail, 'string');
      if (it.tone !== undefined) assert.ok(['up', 'down', 'worse', 'better'].includes(it.tone), `${g.id} tone is up/down/worse/better`);
    }
  }
  // Eight sources, each read exactly once: the summaries written with each store, and the Worker's two feeds.
  assert.deepEqual(calls.slice().sort(), SOURCES);
});

test('logic: it reads the summaries in step with their stores: never the Hub\'s daily copies, never a store', async () => {
  const calls = [];
  await run(ALL_GOOD, { calls });
  assert.ok(!calls.some(u => /integration\/data\//.test(u)), `no integration/data copy: ${JSON.stringify(calls)}`);
  assert.ok(!calls.some(u => /stories\.json|briefing\/data\/latest|volatility\/data\/(index|days\/)[^.]*\.json$|calendar\/data\/\d{4}s/.test(u.replace('index.head.json', ''))), 'no store');
  assert.ok(!read('design/prp-highlights.js').match(/briefing-activity\.json|volatility-movers\.json|upcoming-political-events\.json/), 'the module names none of the copies');
});

test('logic: every address fetched is fixed, whatever the data says', async () => {
  const calls = [];
  const hostile = movers(PAGE_LISTS.map(([iso3, name, ...rest]) => [`../${iso3}`, `<img src=x>${name}`, ...rest]), { date: '../../etc/passwd', page: 'https://evil.example/' });
  await run({ ...ALL_GOOD, 'volatility/data/index.head': hostile }, { calls });
  assert.deepEqual(calls.slice().sort(), SOURCES);
});

/* --- METRIC 1: volatility movers --------------------------------------------------------------------------------- */
test('logic: volatility shows the page\'s own movers with medium or high coverage, biggest change first, each opening its country', async () => {
  const g = byId(await run(ALL_GOOD), 'volatility');
  assert.equal(g.title, 'Geopolitical change · 7 days', 'Jude\'s heading for the slot (the page\'s own panel keeps "Biggest movers")');
  assert.equal(g.source, 'GDELT');
  assert.equal(g.href, ROUTES.volatility);
  assert.equal(g.link, 'Geopolitical Volatility');
  assert.equal(g.window, 'medium & high coverage, to 28 Oct', 'the coverage rule and the day, in the window');

  // Medium/high among the page's twelve: Bravo +8.2, Delta +5.2, Foxtrot +1.4, Hotel −7.2, India −7.5, Kilo −8.7.
  // By size of change: Kilo, Bravo, India, Hotel, Delta (Foxtrot is sixth).
  assert.deepEqual(g.items.map(i => i.label), ['Kilo', 'Bravo', 'India', 'Hotel', 'Delta']);
  assert.deepEqual(g.items.map(i => i.value), [`${FALL} ${M}8.7`, `${RISE} +8.2`, `${FALL} ${M}7.5`, `${FALL} ${M}7.2`, `${RISE} +5.2`], 'the page\'s one-decimal 7-day change, arrowed');
  assert.deepEqual(g.items.map(i => i.detail), ['7-day avg 55.8 · high coverage', '7-day avg 56.7 · medium coverage', '7-day avg 45.2 · medium coverage', '7-day avg 49.6 · high coverage', '7-day avg 51.1 · high coverage'], 'the 7-day average and the coverage, on every line');
  const listed = new Set(VOL_HEAD.movers.records.map(r => r.name));
  assert.ok(g.items.every(i => listed.has(i.label)), 'every country shown is in the page\'s lists');
  for (const lowly of ['Alpha', 'Charlie', 'Echo', 'Golf', 'Juliett', 'Lima']) assert.ok(!g.items.some(i => i.label === lowly), `${lowly} (low, insufficient or no coverage) is not shown`);
  assert.equal(g.note, undefined, 'five lines leave no room for a note');
  assert.deepEqual(g.items.map(i => i.href), ['KKK', 'BBB', 'III', 'HHH', 'DDD'].map(c => at('#/rt/volatility', `q/volatility.html#country=${c}`)), 'each line opens its country');
  assert.equal(g.items[0].href, '#/rt/volatility?at=q%2Fvolatility.html%23country%3DKKK');
});

test('logic: volatility tones a rise as worse and a fall as better (the page colours a rise red), never up/down', async () => {
  const g = byId(await run(ALL_GOOD), 'volatility');
  assert.deepEqual(g.items.map(i => i.tone), ['better', 'worse', 'better', 'better', 'worse']);
  for (const it of g.items) assert.equal(it.tone, it.value.startsWith(RISE) ? 'worse' : 'better', `${it.label}: a rise is worse, a fall better`);
});

test('logic: volatility counts what the page lists but the panel leaves out, and says so when nothing qualifies', async () => {
  // Only Bravo (medium) and India (medium) qualify; ten others are low (5), insufficient (1) or have no coverage (4).
  const two = movers(PAGE_LISTS.map(r => (['BBB', 'III'].includes(r[0]) ? r : [...r.slice(0, 5), r[0] === 'CCC' ? 'insufficient' : ['DDD', 'EEE', 'FFF', 'HHH'].includes(r[0]) ? null : 'low'])));
  const g = byId(await run({ ...ALL_GOOD, 'volatility/data/index.head': two }), 'volatility');
  assert.deepEqual(g.items.map(i => i.label), ['Bravo', 'India']);
  assert.equal(g.note, '10 more on the page have low, insufficient or no coverage.');

  const none = movers(PAGE_LISTS.map(r => [...r.slice(0, 5), 'low']));
  const empty = byId(await run({ ...ALL_GOOD, 'volatility/data/index.head': none }), 'volatility');
  assert.deepEqual(empty.items, [], 'no line rather than a thinly covered one');
  assert.equal(empty.note, 'None of the page\'s 12 biggest movers has medium or high coverage.');
  assert.equal(empty.window, 'medium & high coverage, to 28 Oct', 'still dated');
  assert.ok(!empty.unavailable, 'the data was read: this is an answer, not a failure');
});

test('logic: volatility with no lists, or no file, is unavailable', async () => {
  for (const bad of [movers([]), { movers: { records: 'nope' } }, {}, '404', 'badjson']) {
    const seen = [];
    const groups = await run({ ...ALL_GOOD, 'volatility/data/index.head': bad }, { onGroup: g => seen.push(g) });
    assert.equal(byId(groups, 'volatility'), undefined, 'left out of the resolved groups');
    const slot = seen.find(g => g.id === 'volatility');
    assert.deepEqual(slot, unavailableGroup('volatility'), 'onGroup still gets the slot, as unavailable');
    assert.equal(slot.title, 'Geopolitical change · 7 days'); assert.deepEqual(slot.items, []); assert.equal(slot.note, 'Not available just now.');
  }
});

/* --- METRIC 2: headline trends ----------------------------------------------------------------------------------- */
test('logic: headline trends: up to three rising and two falling topics, each opening its row in Highbrowse\'s Trends tab', async () => {
  const g = byId(await run({ ...ALL_GOOD, ...OK }), 'briefings');
  assert.equal(g.title, 'Headline trends · 7 days');
  assert.equal(g.source, 'Vitruvian Manager Briefings');
  assert.equal(g.link, 'Highbrowse trends');
  assert.equal(g.href, at('#/hb/highbrowse', 'highbrowse/index.html#tab=trends'), 'the card\'s own link: the Trends tab, in Highbrowse\'s own frame');
  // Rising: Europe (up from nothing) first, then China (2×), then Monetary policy (1.52×); falling: Trade.
  assert.deepEqual(g.items.map(i => i.label), ['Europe · Political', 'China · Political', 'Monetary policy · Economics', 'Trade · Economics'], 'each topic with its briefing');
  assert.deepEqual(g.items.map(i => i.value), [`${RISE} 0.5%`, `${RISE} 12.0%`, `${RISE} 18.2%`, `${FALL} 3.0%`], 'this week\'s share, arrowed');
  assert.deepEqual(g.items.map(i => i.detail), ['0.0% in the 4 weeks before · data 28 Oct 18:05 UTC', '82nd percentile · 6.0% in the 4 weeks before · data 28 Oct 18:05 UTC', '12.0% in the 4 weeks before', '9.0% in the 4 weeks before'],
    'the percentile first (a narrow card never cuts it), the baseline share, and the briefing\'s own data time when it differs from the window\'s');
  assert.deepEqual(g.items.map(i => i.href), [['political', 'europe'], ['political', 'china'], ['economics', 'monetary'], ['economics', 'trade']].map(([b, t]) => at('#/hb/highbrowse', `highbrowse/index.html#tab=trends&t=${b}.${t}`)));
  assert.ok(g.items.every(i => i.tone === undefined), 'a topic coming up more is neither good nor bad');
  // The week compared, and the newest store's time (each line gives its own when it differs).
  assert.equal(g.window, '22 Oct–28 Oct · data 29 Oct 01:45 UTC');
  // A briefing made on another day compares another week, and says which.
  const other = byId(await run({ ...ALL_GOOD, ...OK, 'briefing/data/trends': { ...OK['briefing/data/trends'], week: { from: '2026-10-21', to: '2026-10-27' } } }), 'briefings');
  assert.equal(other.items[1].detail, '82nd percentile · 6.0% in the 4 weeks before · week to 27 Oct · data 28 Oct 18:05 UTC');
  assert.equal(g.note, 'Left out, not refreshed for two days: Digital Briefing (data 26 Oct 19:45 UTC).', 'a stale briefing is named, with its time');
});

test('logic: too little history: each briefing\'s stories and biggest topic this week, as the Trends tab gives them, and when trends start', async () => {
  const g = byId(await run(ALL_GOOD), 'briefings');
  assert.equal(g.title, 'Headline trends · 7 days');
  assert.deepEqual(g.items.map(i => i.label), ['Scientific Briefing', 'Economics Briefing', 'Political Briefing'], 'Digital (2 days 16 hours old) is left out');
  assert.deepEqual(g.items.map(i => i.value), ['980 stories', '401 stories', '4,875 stories'], 'this week\'s stories (whole UTC days, the Trends tab\'s "This week"), with thousands separators');
  assert.deepEqual(g.items.map(i => i.detail), ['most in Biology', 'this week incomplete: 25 and 26 Oct not held in full', 'data 28 Oct 18:05 UTC · most in US politics'],
    'the biggest topic this week; a week not held in full names its missing days; a briefing made at another time than the window\'s says its own');
  assert.deepEqual(g.items.map(i => i.href), [ROUTES.scienceBriefing, ROUTES.econBriefing, ROUTES.intelligenceBriefing], 'each line opens its briefing, the one thing it names');
  assert.equal(g.window, '22 Oct–28 Oct · data 29 Oct 01:45 UTC', 'the week, and the newest data time');
  assert.equal(g.note, 'Trends start when VM holds four earlier weeks in full: about 1 Dec–10 Dec. Left out, not refreshed for two days: Digital Briefing (data 26 Oct 19:45 UTC).');
  assert.ok(!g.items.some(i => /▲|▼/.test(i.value)), 'no trend is shown without history enough');
});

test('logic: history enough but nothing moved: the stories held, and says no topic rose or fell', async () => {
  const still = { ...OK, 'econ/briefing/data/trends': { ...OK['econ/briefing/data/trends'], topics: OK['econ/briefing/data/trends'].topics.map(x => ({ ...x, trend: 'steady' })) }, 'briefing/data/trends': { ...OK['briefing/data/trends'], topics: [] } };
  const g = byId(await run({ ...ALL_GOOD, ...still }), 'briefings');
  assert.deepEqual(g.items.map(i => i.label), ['Scientific Briefing', 'Economics Briefing', 'Political Briefing']);
  assert.match(g.note, /^No topic rose or fell beyond its usual range this week\./);
});

test('logic: the two-day rule is exact, a briefing fresh by its own store is never left out, and one with no date is', async () => {
  const one = ms => ({ ...ALL_GOOD, 'econ/briefing/data/trends': '404', 'digital/briefing/data/trends': '404', 'briefing/data/trends': '404', 'science/briefing/data/trends': { ...SHORT['science/briefing/data/trends'], generated: iso(+NOW - ms) } });
  const twoDays = byId(await run(one(BRIEFING_STALE_MS)), 'briefings');
  assert.equal(twoDays.items.length, 1, 'exactly two days old: still in');
  assert.match(twoDays.items[0].detail, /^Late: data 27 Oct 12:00 UTC/, '…and late');
  const over = byId(await run(one(BRIEFING_STALE_MS + 1)), 'briefings');
  assert.deepEqual(over.items, [], 'a millisecond more: out');
  assert.match(over.note, /^Left out, not refreshed for two days: Scientific Briefing \(data /);
  assert.equal(BRIEFING_STALE_MS, 2 * DAY);
  // The case of 12 November: a store refreshed an hour ago is in, whatever any daily copy said about it.
  const fresh = byId(await run({ ...ALL_GOOD, 'econ/briefing/data/trends': { ...SHORT['econ/briefing/data/trends'], generated: iso(+NOW - H) } }), 'briefings');
  assert.ok(fresh.items.some(i => i.label === 'Economics Briefing' && !/Late/.test(i.detail)));
  assert.match(fresh.window, /· data 29 Oct 11:00 UTC$/, 'the newest store\'s time, the Economics Briefing\'s');
  const undated = await run({ ...ALL_GOOD, 'science/briefing/data/trends': { ...SHORT['science/briefing/data/trends'], generated: null }, 'econ/briefing/data/trends': '404', 'digital/briefing/data/trends': '404', 'briefing/data/trends': '404' });
  assert.equal(byId(undated, 'briefings'), undefined, 'a file with no time is not read at all');
});

test('logic: late as the shell counts it (twice the rhythm plus three hours): the card marks the line, where the top bar and the sidebar say Late', async () => {
  const econAt = ms => ({ ...ALL_GOOD, 'econ/briefing/data/trends': { ...SHORT['econ/briefing/data/trends'], generated: iso(+NOW - ms) } });
  const econLine = async ms => byId(await run(econAt(ms)), 'briefings').items.find(i => i.label === 'Economics Briefing');
  assert.doesNotMatch((await econLine(15 * H)).detail, /Late/, '15 hours: on time (every six hours: 2 × 6 + 3)');
  assert.match((await econLine(20 * H)).detail, /^Late: data 28 Oct 16:00 UTC · /, '20 hours: late, with its time');
  const polAt = ms => ({ ...ALL_GOOD, 'briefing/data/trends': { ...SHORT['briefing/data/trends'], generated: iso(+NOW - ms) } });
  const pol = async ms => byId(await run(polAt(ms)), 'briefings').items.find(i => i.label === 'Political Briefing');
  assert.doesNotMatch((await pol(20 * H)).detail, /Late/, 'the Political Briefing, twice a day: 27 hours');
  assert.match((await pol(28 * H)).detail, /^Late: /);
  // The two rules agree: late (the line says so) always comes before left out, and at exactly the shell's limit.
  const registry = JSON.parse(read('registry.json')), entry = id => registry.suites.flatMap(s => s.modules).find(m => m.id === id);
  const ids = { scientific: 'science-briefing', economics: 'econ-briefing', digital: 'digital-briefing', political: 'briefing' };
  for (const b of BRIEFINGS) {
    assert.ok(lateMs(b) < BRIEFING_STALE_MS, `${b.key}: late before it is left out`);
    const m = entry(ids[b.key]), line = ms => freshnessLine(m, { [m.data.parts[0].read]: { generated: iso(+NOW - ms) } }, { now: +NOW });
    assert.equal(line(lateMs(b) + 60e3).late, true, `${b.key}: the shell says Late a minute past the limit`);
    assert.equal(line(lateMs(b) - 60e3).late, false, `${b.key}: and not a minute before`);
    assert.equal(m.data.workflow, b.workflow, `${b.key}: the same workflow, so the same rhythm`);
  }
});

test('logic: a briefing whose file cannot be read is named in the note, never silently left out', async () => {
  const one = byId(await run({ ...ALL_GOOD, 'econ/briefing/data/trends': '404' }), 'briefings');
  assert.deepEqual(one.items.map(i => i.label), ['Scientific Briefing', 'Political Briefing']);
  assert.match(one.note, /Economics Briefing could not be read just now\.$/);
  const two = byId(await run({ ...ALL_GOOD, ...OK, 'science/briefing/data/trends': 'badjson', 'digital/briefing/data/trends': '404' }), 'briefings');
  assert.equal(two.note, 'Scientific Briefing and Digital Briefing could not be read just now.', 'with trends too');
  assert.ok(two.items.length <= MAX_LINES - 1, 'a note takes a line\'s room');
  const full = { ...ALL_GOOD, ...OK, 'econ/briefing/data/trends': { ...OK['econ/briefing/data/trends'], topics: [...OK['econ/briefing/data/trends'].topics, topic('fin', 'Finance', { n0: 70, s0: 0.14, b: 0.05, ratio: 2.8, trend: 'rising' }), topic('lab', 'Labour', { n0: 5, s0: 0.01, b: 0.05, ratio: 0.2, trend: 'falling' })] } };
  assert.equal(byId(await run(full), 'briefings').items.length, MAX_LINES - 1, 'five movers and a note: four lines and the note');
  assert.equal(byId(await run({ ...full, 'digital/briefing/data/trends': { ...SHORT['digital/briefing/data/trends'], generated: iso(+NOW - H) } }), 'briefings').items.length, MAX_LINES, 'and five with no note');
});

test('logic: the card\'s numbers are the Trends tab\'s "This week", from the committed files', async () => {
  const files = Object.fromEntries(BRIEFINGS.map(b => [b.trends.replace(/\.json$/, ''), JSON.parse(read(b.trends))]));
  const now = new Date(Math.max(...Object.values(files).map(t => Date.parse(t.generated))) + H);
  const g = byId(await buildTodayHighlights({ fetch: stubFetch({ ...ALL_GOOD, ...files }), base: '', marketsBase: '', now }), 'briefings');
  if (g.items.some(i => /▲|▼/.test(i.value))) return; // trends to show: the lines are topics, tested above
  for (const it of g.items) {
    const t = Object.values(files).find(x => x.name === it.label), w0 = t.weeks.find(w => w.k === 0);
    assert.equal(it.value, `${w0.stories.toLocaleString('en-GB')} stories`, `${it.label}: "This week" on the Trends tab`);
    if (!w0.counts && w0.missing) assert.match(it.detail, /this week incomplete: .+ not held in full/, `${it.label}: its missing days`);
  }
  assert.match(g.window, /^\d{1,2} [A-Z][a-z]{2}–\d{1,2} [A-Z][a-z]{2} · data /, 'the tab\'s week');
});

/* --- METRIC 3: upcoming calendar --------------------------------------------------------------------------------- */
test('logic: calendar: the next five elections/referendums/summits, soonest first, each opening its event', async () => {
  const g = byId(await run(ALL_GOOD), 'calendar');
  assert.equal(g.title, 'Upcoming');
  assert.equal(g.source, 'Political calendar');
  assert.equal(g.href, ROUTES.calendar);
  assert.equal(g.link, 'Realtime Calendar');
  assert.equal(g.window, 'elections, referendums & summits');

  assert.deepEqual(g.items.map(i => i.label), ['Election today', 'Commonwealth Heads of Government Meeting', 'US midterms', 'Swiss referendum', 'Ghana election'],
    'five at most; the leading year of a name is dropped (its date is beside it)');
  assert.deepEqual(g.items.map(i => i.value), ['29 Oct', '1 Nov', '3 Nov', '7 Nov', '1 Dec'], 'this year\'s dates without the year, ascending');
  assert.equal(g.items[0].detail, 'Election · Narnia', 'an event dated today is still upcoming');
  assert.equal(g.items[3].detail, 'Referendum · Switzerland · tentative', 'a tentative date is flagged');
  assert.ok(!g.items.some(i => i.label === 'Past court ruling'), 'past events are gone');
  assert.ok(!g.items.some(i => i.label === 'Planned protest'), 'non-election/referendum/summit types are filtered out');
  assert.equal(g.items[2].href, at('#/rt/calendar', 'q/calendar.html?period=contemporary&event=2026-11-03~united-states~us-midterms'));

  const later = byId(await run({ ...ALL_GOOD, 'calendar/data/upcoming': { events: CALENDAR.events.slice(-1) } }), 'calendar');
  assert.equal(later.items[0].value, '1 Feb 2027', 'another year\'s date keeps its year');
});

test('logic: calendar falls back to any upcoming event, honestly relabelled, when no vote or summit is in the window', async () => {
  const onlyOther = { events: [ev('2026-11-02', 'protest', 'France', 'A protest'), ev('2026-11-04', 'vote', 'EU', 'A parliamentary vote', 'tentative'), ev('2026-01-01', 'summit', 'Old', 'A past summit')] };
  const g = byId(await run({ ...ALL_GOOD, 'calendar/data/upcoming': onlyOther }), 'calendar');
  assert.equal(g.window, 'any kind of event', 'the window no longer claims elections/referendums/summits');
  assert.deepEqual(g.items.map(i => i.label), ['A protest', 'A parliamentary vote']);
});

/* --- METRIC 4: market snapshot ----------------------------------------------------------------------------------- */
test('logic: markets: each quote with its own time, the window when they were fetched (never "live"), five lines, each opening its ticker', async () => {
  const g = byId(await run(ALL_GOOD), 'markets');
  assert.equal(g.title, 'Market snapshot');
  assert.equal(g.source, 'trade-desk');
  assert.equal(g.href, ROUTES.markets);
  assert.equal(g.window, 'quotes fetched 29 Oct 11:58 UTC', 'when the Worker assembled the quotes (ms epoch), not "live"');

  // Three indices (in the fixed order; NASDAQ is not headline), then two hype movers: five lines.
  assert.deepEqual(g.items.map(i => i.label), ['S&P 500', 'FTSE 100', 'Gold', 'GOOG', 'NOW']);
  assert.deepEqual(g.items.slice(0, 3).map(i => i.value), [`${M}0.30%`, '+0.26%', `${M}0.34%`], 'signed percentages, true minus');
  assert.deepEqual(g.items.slice(0, 3).map(i => i.tone), ['down', 'up', 'down'], 'a market keeps gains and losses');
  assert.equal(g.items[0].detail, '7,720.39 · 28 Oct 20:32 UTC', 'the S&P 500 says it is the last session\'s close, a day before the fetch');
  assert.equal(g.items[1].detail, '10,722.07 · 29 Oct 11:57 UTC', 'each quote its own time (epoch seconds)');
  assert.ok(!g.items.some(i => i.label === 'GOOGL'), 'GOOG/GOOGL dedupe by company name');
  assert.equal(g.items[3].value, `${M}12.29%`);
  assert.equal(g.items[3].detail, 'hype 99 · 656 Reddit mentions (95 a day earlier)', 'a hype ticker has no time of its own: it stands under the fetch time');
  const page = 'https://trade-desk.judep92.workers.dev/markets/';
  assert.deepEqual(g.items.map(i => i.href), ['%5EGSPC', '%5EFTSE', 'GC%3DF', 'GOOG', 'NOW'].map(s => at('#/mm/markets', `${page}#t=${s}`)), 'each line opens its ticker on the Market Briefing');
});

test('logic: markets shows whichever feed responds, up to five lines of it', async () => {
  const noHype = byId(await run({ ...ALL_GOOD, 'api/public/hype': 'throw' }), 'markets');
  assert.deepEqual(noHype.items.map(i => i.label), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD'], 'the indices fill the room');
  assert.equal(noHype.items[3].detail, '80,271.82', 'a quote with no time shows its price alone');
  assert.equal(noHype.items[3].tone, 'down');

  const noQuotes = byId(await run({ ...ALL_GOOD, 'api/public/overview': '404' }), 'markets');
  assert.deepEqual(noQuotes.items.map(i => i.label), ['GOOG', 'NOW', 'NVDA']);
  assert.equal(noQuotes.items[2].tone, 'up', 'a riser is toned up');
  assert.equal(noQuotes.window, 'quotes fetched 1 Jan 00:00 UTC', 'the hype feed\'s own fetch time when the quotes feed is down');
});

/* --- links: one thing each, from a key that passed its pattern ---------------------------------------------------- */
test('logic: a key that fails its pattern makes no deep link: the line opens the submodule\'s front page', async () => {
  assert.equal(LINKS.country('../IRL'), ROUTES.volatility);
  assert.equal(LINKS.country('irl'), ROUTES.volatility);
  assert.equal(LINKS.topic('economics', '../../x'), LINKS.trends());
  assert.equal(LINKS.topic('evil', 'monetary'), LINKS.trends());
  assert.equal(LINKS.event('2026-11-03~us~midterms&x=<script>'), ROUTES.calendar);
  assert.equal(LINKS.event('javascript:alert(1)'), ROUTES.calendar);
  assert.equal(LINKS.symbol('<img src=x>'), ROUTES.markets);
  assert.equal(LINKS.symbol('A'.repeat(16)), ROUTES.markets);
  // Through the module: hostile data still gives shell routes, and the hostile ones go to the front page.
  const hostileCal = { events: [{ ...ev('2026-11-03', 'election', 'X', 'Y'), key: '2026-11-03~x~y#/evil' }] };
  const hostileHype = { ...HYPE, tickers: [{ symbol: '"><script>', name: 'Bad', score: 1, changePct: 1 }] };
  const g = await run({ ...ALL_GOOD, 'calendar/data/upcoming': hostileCal, 'api/public/hype': hostileHype, 'api/public/overview': '404' });
  assert.equal(byId(g, 'calendar').items[0].href, ROUTES.calendar);
  assert.equal(byId(g, 'markets').items[0].href, ROUTES.markets);
  for (const k of Object.values(KEYS)) assert.ok(k instanceof RegExp && k.source.startsWith('^') && k.source.endsWith('$'), `${k} is anchored`);
});

test('source: every deep link names its submodule\'s own page, as the shell requires (shell.js deepLink), and matches its route', () => {
  const reg = JSON.parse(read('registry.json'));
  const mod = route => { const [, s, m] = /^#\/([a-z-]+)\/([\w-]+)/.exec(route); return reg.suites.find(x => x.id === s).modules.find(x => x.id === m); };
  const base = 'https://jdpi.pages.dev/';
  const strip = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  for (const href of [LINKS.country('IRL'), LINKS.topic('economics', 'monetary'), LINKS.trends(), LINKS.event('2026-11-03~united-states~us-midterms'), LINKS.symbol('^GSPC')]) {
    assert.match(href, SHELL_ROUTE, href);
    const m = mod(href), want = new URL(decodeURIComponent(href.split('?at=')[1]), base), own = new URL(m.url, base);
    assert.equal(want.origin, own.origin, `${href}: same origin as ${m.url}`);
    assert.equal(strip(want.pathname), strip(own.pathname), `${href}: the page of ${m.id}`);
  }
  assert.equal(new URL(decodeURIComponent(LINKS.symbol('^GSPC').split('?at=')[1])).hash, '#t=%5EGSPC', 'the Market Briefing reads #t= (decodeURIComponent there)');
  assert.deepEqual(BRIEFINGS.map(b => b.trends), ['science/briefing/data/trends.json', 'econ/briefing/data/trends.json', 'digital/briefing/data/trends.json', 'briefing/data/trends.json']);
});

/* --- the timeout, and groups arriving as they settle ------------------------------------------------------------- */
test('logic: a source that never answers is given up on at the timeout, and holds up no other group', async () => {
  const order = [];
  const t0 = Date.now();
  const groups = await run({ ...ALL_GOOD, 'api/public/hype': 'hang' }, { timeoutMs: 120, onGroup: g => order.push(g.id) });
  const took = Date.now() - t0;
  assert.ok(took >= 100 && took < 2000, `gave up after the timeout, ${took} ms`);
  assert.equal(order.at(-1), 'markets', 'the group waiting on the stalled feed comes last; the others did not wait for it');
  assert.deepEqual(byId(groups, 'markets').items.map(i => i.label), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD'], 'and shows what did answer');
  assert.equal(FETCH_TIMEOUT_MS, 8000, 'eight seconds by default');

  const allHang = {};
  for (const k of Object.keys(ALL_GOOD)) allHang[k] = 'hang';
  const seen = [];
  assert.deepEqual(await run(allHang, { timeoutMs: 60, onGroup: g => seen.push(g) }), [], 'nothing answered: no groups');
  assert.deepEqual(seen.map(g => g.id).sort(), [...GROUP_IDS].sort(), 'every slot is still reported, as unavailable');
  assert.ok(seen.every(g => g.unavailable));
});

test('logic: onGroup gets each group as soon as its own sources answer', async () => {
  const slow = (table, ms) => { const f = stubFetch(table); return async u => { if (String(u).includes('volatility/data/index.head')) await new Promise(r => setTimeout(r, ms)); return f(u); }; };
  const order = [];
  await buildTodayHighlights({ fetch: slow(ALL_GOOD, 60), marketsBase: '', now: NOW, onGroup: g => order.push(g.id) });
  assert.equal(order.at(-1), 'volatility', 'the slow file\'s group last');
  assert.deepEqual(order.slice(0, 3).sort(), ['briefings', 'calendar', 'markets'], 'the others at once, without waiting for it');
  // A throwing renderer is not the data's failure: the build still resolves every group.
  assert.equal((await run(ALL_GOOD, { onGroup: () => { throw new Error('renderer'); } })).length, 4);
});

/* --- the session cache's lifetime -------------------------------------------------------------------------------- */
test('logic: the cache entry records when it was written and is fresh for 45 minutes, or until the next UTC midnight', () => {
  const groups = [{ id: 'calendar' }];
  const e = cacheEntry(groups, NOW);
  assert.deepEqual(e, { v: 3, at: +NOW, until: +NOW + 45 * 60e3, groups });
  assert.equal(CACHE_MAX_AGE_MS, 45 * 60e3);
  // As the shell applies it (shell.js todayFresh): fresh from `at` until just before `until`.
  const fresh = (x, t) => t >= x.at && t < x.until;
  assert.ok(fresh(e, +NOW + 44 * 60e3 + 59e3), 'fresh at 44:59');
  assert.ok(!fresh(e, +NOW + 45 * 60e3), 'stale at 45:00');
  assert.ok(!fresh(e, +NOW - 1), 'an entry from the future (a clock set back) is stale');

  const late = cacheEntry(groups, new Date('2026-10-29T23:40:00Z'));
  assert.equal(late.until, Date.parse('2026-10-30T00:00:00Z'), 'written at 23:40 UTC: stale at midnight, 20 minutes on');
  assert.ok(!fresh(late, Date.parse('2026-10-30T00:00:00Z')), 'a new UTC day always asks again');
  assert.equal(cacheEntry(groups, new Date('2026-10-29T23:15:00Z')).until, Date.parse('2026-10-30T00:00:00Z'));
  assert.equal(cacheEntry(groups, Date.parse('2026-10-29T08:00:00Z')).until, Date.parse('2026-10-29T08:45:00Z'), 'a number is taken as an instant');
});

/* --- failing and empty sources ----------------------------------------------------------------------------------- */
test('logic: a source that fails or is empty yields no group, and the function never throws', async () => {
  for (const kind of ['throw', '404', 'badjson']) {
    const table = {};
    for (const k of Object.keys(ALL_GOOD)) table[k] = kind;
    assert.deepEqual(await run(table), [], `${kind} everywhere → no groups`);
  }
  // Present but empty bodies.
  const empty = { 'volatility/data/index.head': { movers: { records: [] } }, 'calendar/data/upcoming': { events: [] }, 'api/public/overview': {}, 'api/public/hype': {} };
  for (const k of Object.keys(SHORT)) empty[k] = {};
  assert.deepEqual(await run(empty), [], 'empty data → no groups');
  assert.deepEqual(await buildTodayHighlights({ fetch: null, now: NOW, timeoutMs: 50 }).catch(e => e), [], 'no fetch at all → no groups');
});

test('logic: one working source still produces its group when the others fail', async () => {
  const onlyCalendar = {};
  for (const k of Object.keys(ALL_GOOD)) onlyCalendar[k] = 'throw';
  onlyCalendar['calendar/data/upcoming'] = CALENDAR;
  const groups = await run(onlyCalendar);
  assert.deepEqual(groups.map(g => g.id), ['calendar'], 'just the one group that had data');
});

/* --- escaping contract ------------------------------------------------------------------------------------------- */
test('logic: strings are returned as plain data, never pre-escaped (the renderer escapes with the shell esc())', async () => {
  const hostile = '<b>"A&B" vote</b>';
  const cal = { events: [{ ...ev('2026-11-03', 'election', 'X & Y', 'x'), title: hostile }] };
  const g = byId(await run({ ...ALL_GOOD, 'calendar/data/upcoming': cal }), 'calendar');
  assert.equal(g.items[0].label, hostile, 'markup passes through verbatim for the renderer to escape');
  assert.equal(g.items[0].detail, 'Election · X & Y', 'the ampersand is not HTML-escaped here');
});

/* --- the shell and its styles agree with the module -------------------------------------------------------------- */
test('source: the shell\'s slots, line cap and timeout are the module\'s', () => {
  const shell = read('shell.js');
  const slots = /const TODAY_SLOTS = (\[[^\]]*\]);/.exec(shell);
  assert.ok(slots, 'shell.js declares TODAY_SLOTS');
  assert.deepEqual(JSON.parse(slots[1].replace(/'/g, '"')), GROUP_IDS, 'one slot per group, in the module\'s order');
  assert.equal(+/const TODAY_LINES = (\d+);/.exec(shell)[1], MAX_LINES);
  assert.equal(+/const TODAY_FETCH_MS = (\d+);/.exec(shell)[1], FETCH_TIMEOUT_MS);
  assert.match(shell, /AbortSignal\.timeout\(ms\)/, 'the shell\'s requests carry AbortSignal.timeout');
  assert.match(shell, /fetch\(url, \{ signal: abortAfter\(TODAY_FETCH_MS\), \.\.\.\(\/\^https\?:\/i\.test\(String\(url\)\) \? \{\} : \{ cache: 'no-cache' \}\) \}\)/, 'this site\'s summaries asked for afresh');
  assert.match(shell, /const TODAY_KEY = 'prp\.today\.v3';/, 'the cache key moved on with its shape');
  assert.match(shell, /e\.v === 3/);
  assert.match(shell, /aria-label="Today on your Dashboard" aria-live="off"/, 'the panel opts out of the view\'s live region');
  assert.match(shell, /aria-label="View \$\{esc\(g\.link \|\| g\.title\)\}"/, 'each card\'s link is named for where it goes');
});

test('source: tones map to the right tokens: worse/better as the Volatility page, up/down as gains and losses', () => {
  const css = read('shell.css'), shell = read('shell.js');
  const colour = cls => (new RegExp(`\\.today-val\\.${cls}\\s*\\{\\s*color:\\s*var\\((--prp-[a-z-]+)\\)`).exec(css) || [])[1];
  assert.equal(colour('worse'), '--prp-bad', 'a rise in volatility: the bad colour (q/volatility.html .up)');
  assert.equal(colour('better'), '--prp-good', 'a fall in volatility: the good colour (q/volatility.html .down)');
  assert.equal(colour('up'), '--prp-up', 'a market gain');
  assert.equal(colour('down'), '--prp-down', 'a market loss');
  assert.match(read('q/volatility.html'), /\.up,\.prp-table \.up\{color:var\(--prp-bad\)\}\.down,\.prp-table \.down\{color:var\(--prp-good\)\}/, 'the page colours a rise bad and a fall good');
  assert.match(shell, /const TONES = \{ up: 'up', down: 'down', worse: 'worse', better: 'better' \};/, 'the renderer passes all four tones through, and nothing else');
});

test('source: focus rings are inset inside the clipped card, and the source line is readable', () => {
  const css = read('shell.css');
  assert.match(css, /\.today-card :focus-visible \{ outline-offset: -2px; \}/);
  assert.match(css, /\.today-card \{[^}]*overflow: hidden/, '(the reason: the card clips)');
  assert.ok(!/\.today-src\s*\{[^}]*--prp-faint/.test(css), 'the source is not in the 4.2:1 hint colour');
});

/* --- page: the panel in Edge, its sources served by the test ----------------------------------------------------- */
const BASE = (process.env.JDPI_URL || 'http://localhost:8787').replace(/\/$/, '');
const served = () => fetch(BASE + '/shell.js').then(r => r.ok).catch(() => false);
// The page fixtures are dated from the real clock, since the shell uses it: fresh briefings with trends, the real
// upcoming events (so a line opens a real one), a real country among the movers and one the index does not hold.
function pageFixtures() {
  const now = Date.now(), real = JSON.parse(read('volatility/data/index.head.json')).movers.records[0].iso3;
  const vol = movers(PAGE_LISTS.map(r => (r[0] === 'KKK' ? [real, ...r.slice(1)] : r[0] === 'BBB' ? ['XXA', ...r.slice(1)] : r)));
  const trends = Object.fromEntries(Object.entries(OK).map(([k, v], i) => [k, { ...v, generated: iso(now - (i + 1) * H) }]));
  return {
    'volatility/data/index.head': vol,
    ...trends,
    'calendar/data/upcoming': JSON.parse(read('calendar/data/upcoming.json')),
    overview: { ...OVERVIEW, at: now - 60e3 },
    hype: HYPE,
    real,
  };
}
const SUMMARY = /\/(volatility\/data\/index\.head|(?:science\/|econ\/|digital\/)?briefing\/data\/trends|calendar\/data\/upcoming)\.json(\?|$)/;
// Serve every source of the panel from the fixtures, each held until `gate` resolves (if given) and the hype feed after
// `hypeDelay` ms; `seen` collects the requests. The Dashboard's health mark reads status/health.json, which the daily
// data check commits: these tests serve their own (`health`, by default none, so no mark), never the repository's, so a
// failing check can never turn the suite, and with it every deploy, red. The mark's own test below passes one.
async function servePanel(context, { gate = null, hypeDelay = 0, seen = [], health = 404, override = {} } = {}) {
  const fx = { ...pageFixtures(), ...override };
  await context.route('**/status/health.json', route => (health === 404 ? route.fulfill({ status: 404, body: 'not found' }) : route.fulfill({ json: health })));
  await context.route(SUMMARY, async route => {
    const key = SUMMARY.exec(new URL(route.request().url()).pathname + '?')[1];
    const fromShell = route.request().frame() === route.request().frame().page().mainFrame();
    if (fromShell) { seen.push(route.request().url()); if (gate) await gate; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(fx[key]) });
  });
  await context.route(/\/api\/public\/(overview|hype)/, async route => {
    const kind = route.request().url().includes('overview') ? 'overview' : 'hype';
    seen.push(route.request().url()); if (gate) await gate;
    if (kind === 'hype' && hypeDelay) await new Promise(r => setTimeout(r, hypeDelay).unref()); // unref: never holds the run open
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx[kind]) }).catch(() => { /* the page gave up on it */ });
  });
  return Object.assign(seen, { fx });
}
const panelBox = page => page.evaluate(() => ({ panel: document.querySelector('#today').getBoundingClientRect().height, kpis: document.querySelector('.today-kpis').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('#today .today-card')].map(c => c.getBoundingClientRect().height) }));
const filled = page => page.waitForFunction(() => document.querySelectorAll('#today .today-card').length === 4 && !document.querySelector('#today .today-card[data-state="loading"], #today[aria-busy]'), null, { timeout: 15000 });
const N_SOURCES = 8;

test('page: the panel is the same height loading and filled, at 1440 and 390 px; nothing below it moves', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    for (const [width, height, phone] of [[1440, 900, false], [390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
      let open; const gate = new Promise(r => { open = r; });
      await servePanel(context, { gate });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#today .today-card[data-state="loading"]');
      await page.evaluate(() => document.fonts.ready.then(() => true));
      assert.equal(await page.getAttribute('#today', 'aria-busy'), 'true', `${width}: busy while loading`);
      const before = await panelBox(page);
      open();
      await filled(page);
      const after = await panelBox(page);
      assert.equal(after.panel, before.panel, `${width}: panel ${before.panel} → ${after.panel}`);
      assert.equal(after.kpis, before.kpis, `${width}: the counts below stay put`);
      assert.deepEqual(after.cards, before.cards, `${width}: every card keeps its height`);
      assert.equal(await page.getAttribute('#today', 'aria-live'), 'off', 'the fill is not announced by the view\'s live region');
      assert.equal(await page.getAttribute('#today', 'aria-busy'), null, 'not busy once filled');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: no sideways scroll`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

// Tab through the panel's `links` links from where focus is now: each must be a link in a Today card, showing a 2px ring
// drawn inside it.
async function tabThroughPanel(page, links, label = '') {
  for (let i = 0; i < links; i++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement, card = el.closest('.today-card');
      if (!card) return { cls: el.className, text: el.textContent.trim().slice(0, 40), card: false };
      const cs = getComputedStyle(el), r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
      const off = parseFloat(cs.outlineOffset), w = parseFloat(cs.outlineWidth);
      // The ring's outer edge, which the card's overflow: hidden would cut off if it lay outside the card's border box.
      return { cls: el.className, card: true, visible: el.matches(':focus-visible'), style: cs.outlineStyle, w, inside: r.left - off - w >= c.left - 0.5 && r.right + off + w <= c.right + 0.5 && r.top - off - w >= c.top - 0.5 && r.bottom + off + w <= c.bottom + 0.5 };
    });
    assert.ok(ring.card, `${label}link ${i}: focus is in a Today card, not on "${ring.text}" (${ring.cls})`);
    assert.ok(ring.visible && ring.style === 'solid' && ring.w === 2, `${label}link ${i} (${ring.cls}) shows its ring`);
    assert.ok(ring.inside, `${label}link ${i} (${ring.cls}): the whole ring is inside the card`);
  }
}

test('page: headline trends: five lines, each with its percentile, nothing cut short, at 1440 and 390 px in light and dark', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  // Five movers with percentiles, one from a briefing made two hours before the window's (its own time, the longest
  // detail a line can have), and a briefing whose file could not be read (a note).
  const now = Date.now(), pct = (id, label, extra) => topic(id, label, { percentile: 100, rank: { lower: 11, equal: 0, of: 11 }, ...extra });
  const override = {
    'briefing/data/trends': { ...OK['briefing/data/trends'], generated: iso(now - 3 * H), topics: [
      pct('china', 'China', { n0: 600, s0: 0.038, b: 0.016, ratio: 2.4, trend: 'rising' }), pct('ai', 'AI & tech', { n0: 300, s0: 0.075, b: 0.033, ratio: 2.3, trend: 'rising' }),
      pct('immigration', 'Immigration', { n0: 200, s0: 0.049, b: 0.03, ratio: 1.6, trend: 'rising' }), pct('middle-east', 'Middle East', { n0: 90, s0: 0.02, b: 0.05, ratio: 0.4, trend: 'falling', percentile: 0, rank: { lower: 0, equal: 0, of: 11 } }),
      pct('us-politics', 'US politics', { n0: 1500, s0: 0.299, b: 0.372, ratio: 0.804, trend: 'falling', percentile: 0, rank: { lower: 0, equal: 0, of: 11 } })] },
    'econ/briefing/data/trends': { ...OK['econ/briefing/data/trends'], generated: iso(now - H), topics: [pct('monetary', 'Monetary policy', { n0: 91, s0: 0.182, b: 0.06, ratio: 3, trend: 'rising' })] },
    'science/briefing/data/trends': { ...SHORT['science/briefing/data/trends'], generated: iso(now - H) },
  };
  const browser = await launch();
  try {
    for (const [width, height, phone, theme] of [[1440, 900, false, 'light'], [390, 844, true, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: theme });
      await servePanel(context, { override: { ...override, 'digital/briefing/data/trends': '404' } }); // served as "404": not a trends file
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
      await filled(page);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const card = await page.evaluate(() => {
        const c = document.querySelector('#today .today-card[data-group="briefings"]');
        const cut = el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        return { details: [...c.querySelectorAll('.today-detail')].map(d => ({ text: d.textContent, cut: cut(d) })), labels: [...c.querySelectorAll('.today-label')].map(l => l.textContent), note: c.querySelector('.today-note')?.textContent || '' };
      });
      assert.equal(card.details.length, MAX_LINES - 1, `${width}: four lines and the note`);
      for (const d of card.details) {
        assert.equal(d.cut, false, `${width} ${theme}: "${d.text}" is shown whole`);
        assert.match(d.text, /^(100th|0th) percentile · /, 'the percentile first');
      }
      assert.deepEqual(card.labels, ['Monetary policy · Economics', 'China · Political', 'AI & tech · Political', 'Middle East · Political']);
      assert.match(card.details[1].text, /· data (\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d UTC$/, 'the Political Briefing, made two hours before the window\'s, says its own time');
      assert.equal(card.note, 'Digital Briefing could not be read just now.');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('page: rows and links show their focus ring; the four links have their own names; tones use their tokens', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await servePanel(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
    await filled(page);
    const names = await page.$$eval('#today .today-head .more', a => a.map(x => x.getAttribute('aria-label')));
    assert.deepEqual(names, ['View Geopolitical Volatility', 'View Highbrowse trends', 'View Realtime Calendar', 'View Market Briefing']);
    // Keyboard through the panel from the heading above it: every link shows a 2px ring drawn inside the card.
    await page.evaluate(() => { const h = document.querySelector('#view h1'); h.tabIndex = -1; h.focus(); });
    const links = await page.$$eval('#today a', a => a.length);
    await tabThroughPanel(page, links);
    // Tones: a rise in volatility in the bad colour, a fall in the good; a market gain and loss in up/down.
    const tones = await page.evaluate(() => {
      const probe = v => { const s = document.createElement('span'); s.style.color = `var(${v})`; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const val = sel => getComputedStyle(document.querySelector(sel)).color;
      return { worse: [val('#today [data-group="volatility"] .today-val.worse'), probe('--prp-bad')], better: [val('#today [data-group="volatility"] .today-val.better'), probe('--prp-good')],
        up: [val('#today [data-group="markets"] .today-val.up'), probe('--prp-up')], down: [val('#today [data-group="markets"] .today-val.down'), probe('--prp-down')] };
    });
    for (const [k, [got, want]] of Object.entries(tones)) assert.equal(got, want, `${k} is coloured with its token`);
    assert.match(await page.textContent('#today [data-group="markets"] .today-win'), /^quotes fetched \d+ \w{3} \d\d:\d\d UTC · trade-desk$/, 'never "live"');
    assert.match(await page.textContent('#today [data-group="briefings"] .today-win'), /^\d+ \w{3}–\d+ \w{3} · data \d+ \w{3} \d\d:\d\d UTC · Vitruvian Manager Briefings$/, 'the week compared and the data\'s time');
    await context.close();
  } finally { await browser.close(); }
});

test('page: each kind of line opens its own thing: a country, a topic, an event, a ticker; a gone country, a plain note', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const seen = await servePanel(context);
    // The money site is another site: the test answers for it, so nothing leaves this computer.
    await context.route('https://trade-desk.judep92.workers.dev/markets/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Market Briefing</title><p id="t"></p><script>document.getElementById("t").textContent = new URLSearchParams(location.hash.slice(1)).get("t")</script>' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const open = async (group, label) => {
      await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
      await filled(page);
      await page.locator(`#today [data-group="${group}"] .today-row`, { hasText: label }).first().click();
      return page.waitForFunction(() => !document.querySelector('#frames').hidden && document.querySelector('#frames iframe.active'), null, { timeout: 15000 });
    };
    const active = async () => (await page.$('#frames iframe.active')).contentFrame();

    // A country: its profile on the Volatility page.
    const real = seen.fx.real;
    await open('volatility', 'Kilo');
    assert.equal(await page.evaluate(() => location.hash), `#/rt/volatility?at=${encodeURIComponent(`q/volatility.html#country=${real}`)}`);
    let f = await active();
    await f.waitForSelector('#profile .stat', { timeout: 20000 });
    assert.equal(await f.getAttribute('#tabbtn-profile', 'aria-selected'), 'true');
    // A country the index does not hold: the map, and a plain note.
    await open('volatility', 'Bravo');
    f = await active();
    await f.waitForSelector('#gone:not([hidden])', { timeout: 20000 });
    assert.equal(await f.textContent('#gone'), 'No scores for XXA in the index, so the map is shown instead.');

    // A topic: its row in Highbrowse's Trends tab, in Highbrowse's own frame (no second copy of the briefings' stores).
    await open('briefings', 'China');
    f = await active();
    await f.waitForSelector('#tr-political-china.sel', { timeout: 20000 });
    assert.equal(await f.getAttribute('#tab-trends', 'aria-selected'), 'true');
    assert.equal(await page.$eval('#frames iframe.active', el => el.dataset.key), 'highbrowse/today', 'the frame Highbrowse already has');

    // An event: opened in the Realtime Calendar.
    const event = seen.fx['calendar/data/upcoming'].events.find(e => e.date >= new Date().toISOString().slice(0, 10) && ['election', 'referendum', 'summit'].includes(e.type));
    await open('calendar', event.title.replace(/^\d{4} /, ''));
    f = await active();
    await f.waitForSelector('#modal:not([hidden])', { timeout: 20000 });
    assert.equal(await f.textContent('#modal-title'), event.title);

    // A ticker: its page on the Market Briefing.
    await open('markets', 'S&P 500');
    assert.equal(await page.$eval('#frames iframe.active', el => el.dataset.url), 'https://trade-desk.judep92.workers.dev/markets/#t=%5EGSPC');
    f = await active();
    await f.waitForSelector('#t');
    assert.equal(await f.textContent('#t'), '^GSPC', 'the page reads the symbol from its address');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test('page: with the health mark showing (a failed or a stalled data check), the panel works as before, at 1440 and 390 px', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  // status/health.json as the daily check writes it when it fails, and one it last wrote four days ago.
  const RUN = 'https://github.com/JudePettit/jdpi/actions/runs/123';
  const failing = { generated: iso(Date.now() - 2 * H), ok: false, problems: 1, run: RUN, failing: [{ name: 'Scientific Briefing', what: 'science/briefing/data/stories.json', detail: '20 h old' }] };
  const stale = { generated: iso(Date.now() - 4 * DAY), ok: true, problems: 0, failing: [], run: RUN };
  const browser = await launch();
  try {
    for (const [kind, health] of [['failing', failing], ['stale', stale]]) {
      for (const [width, height, phone] of [[1440, 900, false], [390, 844, true]]) {
        const label = `${kind}, ${width}: `;
        const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
        await servePanel(context, { health });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
        await filled(page);
        await page.waitForSelector('#health:not([hidden])');
        await page.evaluate(() => document.fonts.ready.then(() => true));
        const mark = await page.$eval('#health', el => {
          const b = el.getBoundingClientRect(), span = el.querySelector('span'), w = span.getBoundingClientRect(), a = el.querySelector('a');
          return { cls: el.className, top: b.top, spanTop: w.top, left: b.left, spanLeft: w.left, right: b.right, inLine: !!a && span.contains(a) };
        });
        assert.equal(mark.cls, `prp-status ${kind === 'failing' ? 'bad' : 'warn'} dash-health`, label);
        // The dot stays beside its words (not on a line of its own), Details flows on after them, and it all fits.
        assert.ok(Math.abs(mark.spanTop - mark.top) <= 1 && mark.spanLeft > mark.left, `${label}the dot is beside its words (${JSON.stringify(mark)})`);
        assert.ok(mark.inLine, `${label}Details is in the line of words`);
        assert.ok(mark.right <= width, `${label}the mark fits`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}no sideways scroll`);
        // From the heading, the first Tab is the mark's Details link; every link of the panel follows, with its ring.
        await page.evaluate(() => { const h = document.querySelector('#view h1'); h.tabIndex = -1; h.focus(); });
        await page.keyboard.press('Tab');
        assert.deepEqual(await page.evaluate(() => [document.activeElement.textContent, !!document.activeElement.closest('#health')]), ['Details', true], label);
        await tabThroughPanel(page, await page.$eval('#today a', a => a.length), label);
        assert.deepEqual(errors, [], label);
        await context.close();
      }
    }
  } finally { await browser.close(); }
});

test('page: the session cache: a fresh entry fetches nothing; a stale one shows at once and is refreshed in place', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const seen = await servePanel(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
    await filled(page);
    const entry = await page.evaluate(() => JSON.parse(sessionStorage.getItem('prp.today.v3')));
    assert.equal(entry.v, 3);
    assert.ok(entry.at <= Date.now() && entry.until > Date.now() && entry.until - entry.at <= 45 * 60e3, 'written now, fresh for at most 45 minutes');
    assert.deepEqual(entry.groups.map(g => g.id), GROUP_IDS);
    assert.equal(seen.length, N_SOURCES, 'one request a source for the first fill');

    // Fresh: the reload shows the stored panel and asks for nothing.
    seen.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await filled(page);
    await page.waitForTimeout(1800); // past the idle callback's 1.5 s timeout
    assert.equal(seen.length, 0, 'a fresh entry fetches nothing');

    // Stale (past its `until`): shown at once, with no loading card, then refreshed slot by slot and stored afresh.
    seen.length = 0;
    await page.evaluate(() => {
      const e = JSON.parse(sessionStorage.getItem('prp.today.v3'));
      e.at -= 46 * 60e3; e.until = Date.now() - 1;
      e.groups.find(g => g.id === 'calendar').items[0].label = 'A stale line';
      sessionStorage.setItem('prp.today.v3', JSON.stringify(e));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#today .today-card');
    assert.equal(await page.locator('#today .today-card[data-state="loading"]').count(), 0, 'no loading cards: the stale panel shows at once');
    await page.waitForFunction(() => !document.querySelector('#today').textContent.includes('A stale line') && !document.querySelector('#today[aria-busy]'), null, { timeout: 15000 });
    assert.equal(seen.length, N_SOURCES, 'the stale entry was refreshed');
    const fresh = await page.evaluate(() => JSON.parse(sessionStorage.getItem('prp.today.v3')));
    assert.ok(fresh.at > entry.at && fresh.until > Date.now(), 'and stored again, fresh');
    // An entry of the old shape (v 2, before the lines had deep links) is never shown.
    await page.evaluate(() => { sessionStorage.removeItem('prp.today.v3'); });
    await page.evaluate(e => sessionStorage.setItem('prp.today.v2', JSON.stringify({ ...e, v: 2, until: Date.now() + 60e3 })), fresh);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await filled(page);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('prp.today.v2')), null, 'the old entry is cleared');
    await context.close();
  } finally { await browser.close(); }
});

test('page: a source that stalls is given up on after 8 s; the other groups show as soon as theirs answer', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await servePanel(context, { hypeDelay: 30000 });
    const page = await context.newPage();
    await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => ['volatility', 'briefings', 'calendar'].every(id => document.querySelector(`#today [data-group="${id}"]`)?.dataset.state === 'ready'), null, { timeout: 6000 });
    assert.equal(await page.getAttribute('#today [data-group="markets"]', 'data-state'), 'loading', 'the markets slot alone still waits');
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('#today [data-group="markets"]')?.dataset.state !== 'loading', null, { timeout: 12000 });
    assert.ok(Date.now() - t0 < 9500, 'given up on within the 8 s timeout');
    assert.deepEqual(await page.$$eval('#today [data-group="markets"] .today-label', l => l.map(x => x.textContent)), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD'], 'the quotes that did answer');
    await context.close();
  } finally { await browser.close(); }
});

test('page: the panel is the Dashboard\'s alone: the Home page asks for none of it, even with a stale entry, and its button opens the Dashboard, where the panel fills', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const seen = await servePanel(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // The Home page (#/), where the panel was until November 2026: no panel, and none of its sources asked for.
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view .mods .mod');
    await page.waitForTimeout(1800); // past the idle callback's 1.5 s timeout
    assert.equal(await page.locator('#today').count(), 0, 'no panel on the Home page');
    // Since 13 November 2026 the shell reads the small files its freshness lines name (registry "data", design/
    // prp-freshness.js) on every page, two of which the panel reads too; none of the panel's other sources is read.
    const lineFiles = new Set(JSON.parse(read('registry.json')).suites.flatMap(s => s.modules.flatMap(m => (m.data?.parts || []).map(p => p.read))));
    assert.deepEqual([...seen].filter(u => !lineFiles.has(new URL(u).pathname.slice(1))), [], 'none of its sources read');
    seen.length = 0;
    // Its button opens the Dashboard, where the panel fills from its sources.
    await page.click('#view .home-dash');
    await page.waitForFunction(() => location.hash === '#/home/dashboard');
    await filled(page);
    assert.equal(seen.length, N_SOURCES, 'one request a source for the fill');
    assert.deepEqual(await page.$$eval('#today .today-card', c => c.map(x => [x.dataset.group, x.dataset.state])), GROUP_IDS.map(id => [id, 'ready']));
    // A stale entry is refreshed on the Dashboard only: back on the Home page nothing is asked for; on the Dashboard
    // again, it is refreshed.
    await page.evaluate(() => { const e = JSON.parse(sessionStorage.getItem('prp.today.v3')); e.at -= 46 * 60e3; e.until = Date.now() - 1; sessionStorage.setItem('prp.today.v3', JSON.stringify(e)); });
    seen.length = 0;
    await page.click('#nav a.home-link');
    await page.waitForFunction(() => location.hash === '#/' && !!document.querySelector('#view .mods'));
    await page.waitForTimeout(1800);
    assert.deepEqual([...seen], [], 'the Home page refreshes nothing');
    await page.click('#nav a[data-route="home/dashboard"]');
    await page.waitForFunction(() => location.hash === '#/home/dashboard');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('prp.today.v3')).until > Date.now() && !document.querySelector('#today[aria-busy]'), null, { timeout: 15000 });
    assert.equal(seen.length, N_SOURCES, 'the Dashboard refreshed it');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});
