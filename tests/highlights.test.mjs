// Vitruvian Manager highlights: the Workspace "Today" panel (design/prp-highlights.js and its renderer in shell.js and
// shell.css, PRP-ANALYSIS.md item 3), with a test for each finding of the panel's two reviews.
//   node --test tests/highlights.test.mjs
// logic: tests run buildTodayHighlights() in Node against small inline fixtures through a stub fetch (no browser, no
// network): the shape of each group; the volatility movers taken from the page's own lists, narrowed to medium and high
// coverage and toned as worse/better; the briefings dated and a stale one left out; each quote with its own time and the
// window saying when the quotes were fetched; five lines at most; the timeout and the order groups arrive in; the session
// cache's lifetime; and that a failing or empty source never throws. source: tests check that the shell and its styles
// agree with the module (slots, tones, the focus ring). page: tests drive Microsoft Edge through the home at JDPI_URL
// (by default the local server, tests/tools/serve.mjs; they skip when nothing is served there), with every source of the
// panel served by the test: the panel keeps its height from loading to filled at 1440 and 390 px, focus rings show, the
// fill is not announced, the cache is honoured and refreshed, and a stalled source is given up on. PRP_PAGES=0 leaves
// the page: tests out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { buildTodayHighlights, cacheEntry, unavailableGroup, ROUTES, GROUP_IDS, MAX_LINES, FETCH_TIMEOUT_MS, CACHE_MAX_AGE_MS, BRIEFING_STALE_MS } from '../design/prp-highlights.js';

// The only addresses the shell accepts (shell.js SHELL_ROUTE); every group and item link must match it.
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;
const RISE = '▲', FALL = '▼', M = '−'; // ▲ ▼ − exactly as the module emits them
const NOW = new Date('2026-10-29T12:00:00Z');        // fixes "today" for the calendar and the briefings' two-day rule
const H = 3600e3, DAY = 24 * H;
const iso = ms => new Date(ms).toISOString();
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* --- a stub fetch: route a URL to a fixture by substring, and record every request --------------------------------
   A fixture value is the JSON to return (200); the sentinels 'throw' (network error), '404' (not found), 'badjson'
   (a 200 whose body is not JSON) and 'hang' (never answers) stand in for the failure modes the module must survive. */
function stubFetch(table, calls = []) {
  return async url => {
    const u = String(url);
    calls.push(u);
    for (const key of Object.keys(table)) {
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
// integration/data/volatility-movers.json: the page's Rising (the first six) and Easing (the last six) lists, in the page's
// order (change7 descending), with every coverage level the page lists.
const movers = (recs, extra = {}) => ({
  dataset: 'volatility-movers', generated: '2026-10-29T05:23:10Z', derivedFrom: ['volatility/data/index.json'], page: 'q/volatility.html', date: '2026-10-28', countries: 90, ...extra,
  records: recs.map(([iso3, name, score, avg7, change7, coverage]) => ({ iso3, name, score, avg7, change7, coverage, date: '2026-10-28' })),
});
const PAGE_LISTS = [
  ['AAA', 'Alpha', 60, 63.2, 9.5, 'low'], ['BBB', 'Bravo', 61, 56.7, 8.2, 'medium'], ['CCC', 'Charlie', 62.2, 59.9, 7.9, 'insufficient'],
  ['DDD', 'Delta', 55.6, 51.1, 5.2, 'high'], ['EEE', 'Echo', 65.3, 64.9, 4.6, null], ['FFF', 'Foxtrot', 40, 49, 1.4, 'medium'],
  ['GGG', 'Golf', 44.4, 44.3, -7.1, 'low'], ['HHH', 'Hotel', 57.6, 49.6, -7.2, 'high'], ['III', 'India', 42.8, 45.2, -7.5, 'medium'],
  ['JJJ', 'Juliett', 37.2, 50.1, -8.4, 'low'], ['KKK', 'Kilo', 57.1, 55.8, -8.7, 'high'], ['LLL', 'Lima', 54.2, 51.8, -9.9, 'low'],
];
const VOL_MOVERS = movers(PAGE_LISTS);
// integration/data/briefing-activity.json. NOW is 29 Oct 12:00 UTC: Digital was last generated 2 days 16 hours ago (out),
// the Intelligence Briefing yesterday evening (in, with its own day).
const BRIEFS = {
  dataset: 'briefing-activity', generated: '2026-10-29T05:23:10Z', derivedFrom: ['science/briefing/data/stories.json'],
  records: [
    { id: 'science-briefing', name: 'Scientific Briefing', items: 1036, days: 7, topic: 'Biology', facet: 'disciplines', generated: '2026-10-29T01:45:12Z' },
    { id: 'econ-briefing', name: 'Economics Briefing', items: 453, days: 7, topic: 'Monetary policy & central banks', facet: 'fields', generated: '2026-10-29T01:45:40Z' },
    { id: 'digital-briefing', name: 'Digital Briefing', items: 664, days: 7, topic: 'AI & machine learning', facet: 'fields', generated: '2026-10-26T19:45:00Z' },
    { id: 'briefing', name: 'Intelligence Briefing', items: 4920, days: 7, topic: 'Centre', facet: 'positions', generated: '2026-10-28T18:05:00Z' },
  ],
};
// Past events and non-want types are present on purpose; only future elections/referendums/summits should survive.
const CALENDAR = {
  dataset: 'upcoming-political-events', generated: '2026-10-29T09:34:03Z',
  records: [
    { date: '2026-04-29', type: 'court', country: 'United States', title: 'Past court ruling', status: 'declared' },
    { date: '2026-10-29', type: 'election', country: 'Narnia', title: 'Election today', status: 'declared' },
    { date: '2026-11-01', type: 'summit', country: 'Antigua', title: '2026 Commonwealth Heads of Government Meeting', status: 'declared' },
    { date: '2026-11-03', type: 'election', country: 'United States', title: 'US midterms', status: 'declared' },
    { date: '2026-11-05', type: 'protest', country: 'France', title: 'Planned protest', status: 'tentative' },
    { date: '2026-11-07', type: 'referendum', country: 'Switzerland', title: 'Swiss referendum', status: 'tentative' },
    { date: '2026-12-01', type: 'election', country: 'Ghana', title: 'Ghana election', status: 'declared' },
    { date: '2027-02-01', type: 'summit', country: 'Kenya', title: 'AU summit', status: 'declared' },
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
  'volatility-movers': VOL_MOVERS,
  'briefing-activity': BRIEFS,
  'upcoming-political-events': CALENDAR,
  'api/public/overview': OVERVIEW,
  'api/public/hype': HYPE,
};
const run = (table, opts = {}) => buildTodayHighlights({ fetch: stubFetch(table, opts.calls), base: '', marketsBase: '', now: NOW, ...opts });
const byId = (groups, id) => groups.find(g => g.id === id);

/* --- shape, routes and fetch-once -------------------------------------------------------------------------------- */
test('logic: all four groups build, with the documented shape and shell-route links, reading five small sources once', async () => {
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
  // Five sources, each read exactly once, none of them a store: the two derived files, the calendar window, the Worker.
  assert.equal(calls.length, 5, `five fetches, got ${calls.length}: ${JSON.stringify(calls)}`);
  assert.deepEqual(calls.slice().sort(), ['/api/public/hype', '/api/public/overview', 'integration/data/briefing-activity.json', 'integration/data/upcoming-political-events.json', 'integration/data/volatility-movers.json']);
  assert.ok(!calls.some(u => /stories\.json|briefing\/data\/latest|volatility\/data\//.test(u)), 'no briefing store and no Volatility day file is read');
});

test('logic: every address fetched is fixed, whatever the data says', async () => {
  const calls = [];
  const hostile = movers(PAGE_LISTS.map(([iso3, name, ...rest]) => [`../${iso3}`, `<img src=x>${name}`, ...rest]), { date: '../../etc/passwd', page: 'https://evil.example/' });
  await run({ ...ALL_GOOD, 'volatility-movers': hostile }, { calls });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(u => /^(integration\/data\/[a-z-]+\.json|\/api\/public\/(overview|hype))$/.test(u)), JSON.stringify(calls));
});

/* --- METRIC 1: volatility movers --------------------------------------------------------------------------------- */
test('logic: volatility shows the page\'s own movers with medium or high coverage, biggest change first', async () => {
  const g = byId(await run(ALL_GOOD), 'volatility');
  assert.equal(g.title, 'Biggest movers · 7 days', 'worded as the page\'s own panel');
  assert.equal(g.source, 'GDELT');
  assert.equal(g.href, ROUTES.volatility);
  assert.equal(g.link, 'Geopolitical Volatility');
  assert.equal(g.window, 'medium & high coverage, to 28 Oct', 'the coverage rule and the day, in the window');

  // Medium/high among the page's twelve: Bravo +8.2, Delta +5.2, Foxtrot +1.4, Hotel −7.2, India −7.5, Kilo −8.7.
  // By size of change: Kilo, Bravo, India, Hotel, Delta (Foxtrot is sixth).
  assert.deepEqual(g.items.map(i => i.label), ['Kilo', 'Bravo', 'India', 'Hotel', 'Delta']);
  assert.deepEqual(g.items.map(i => i.value), [`${FALL} ${M}8.7`, `${RISE} +8.2`, `${FALL} ${M}7.5`, `${FALL} ${M}7.2`, `${RISE} +5.2`], 'the page\'s one-decimal 7-day change, arrowed');
  assert.deepEqual(g.items.map(i => i.detail), ['7-day avg 55.8 · high coverage', '7-day avg 56.7 · medium coverage', '7-day avg 45.2 · medium coverage', '7-day avg 49.6 · high coverage', '7-day avg 51.1 · high coverage'], 'the 7-day average and the coverage, on every line');
  const listed = new Set(VOL_MOVERS.records.map(r => r.name));
  assert.ok(g.items.every(i => listed.has(i.label)), 'every country shown is in the page\'s lists');
  for (const lowly of ['Alpha', 'Charlie', 'Echo', 'Golf', 'Juliett', 'Lima']) assert.ok(!g.items.some(i => i.label === lowly), `${lowly} (low, insufficient or no coverage) is not shown`);
  assert.equal(g.note, undefined, 'five lines leave no room for a note');
  assert.ok(g.items.every(i => i.href === '#/rt/volatility'), 'every mover links into Volatility');
});

test('logic: volatility tones a rise as worse and a fall as better (the page colours a rise red), never up/down', async () => {
  const g = byId(await run(ALL_GOOD), 'volatility');
  assert.deepEqual(g.items.map(i => i.tone), ['better', 'worse', 'better', 'better', 'worse']);
  for (const it of g.items) assert.equal(it.tone, it.value.startsWith(RISE) ? 'worse' : 'better', `${it.label}: a rise is worse, a fall better`);
});

test('logic: volatility counts what the page lists but the panel leaves out, and says so when nothing qualifies', async () => {
  // Only Bravo (medium) and India (medium) qualify; ten others are low (5), insufficient (1) or have no coverage (4).
  const two = movers(PAGE_LISTS.map(r => (['BBB', 'III'].includes(r[0]) ? r : [...r.slice(0, 5), r[0] === 'CCC' ? 'insufficient' : ['DDD', 'EEE', 'FFF', 'HHH'].includes(r[0]) ? null : 'low'])));
  const g = byId(await run({ ...ALL_GOOD, 'volatility-movers': two }), 'volatility');
  assert.deepEqual(g.items.map(i => i.label), ['Bravo', 'India']);
  assert.equal(g.note, '10 more on the page have low, insufficient or no coverage.');

  const none = movers(PAGE_LISTS.map(r => [...r.slice(0, 5), 'low']));
  const empty = byId(await run({ ...ALL_GOOD, 'volatility-movers': none }), 'volatility');
  assert.deepEqual(empty.items, [], 'no line rather than a thinly covered one');
  assert.equal(empty.note, 'None of the page\'s 12 biggest movers has medium or high coverage.');
  assert.equal(empty.window, 'medium & high coverage, to 28 Oct', 'still dated');
  assert.ok(!empty.unavailable, 'the data was read: this is an answer, not a failure');
});

test('logic: volatility with no lists, or no file, is unavailable', async () => {
  for (const bad of [movers([]), { records: 'nope' }, '404', 'badjson']) {
    const seen = [];
    const groups = await run({ ...ALL_GOOD, 'volatility-movers': bad }, { onGroup: g => seen.push(g) });
    assert.equal(byId(groups, 'volatility'), undefined, 'left out of the resolved groups');
    const slot = seen.find(g => g.id === 'volatility');
    assert.deepEqual(slot, unavailableGroup('volatility'), 'onGroup still gets the slot, as unavailable');
    assert.equal(slot.title, 'Biggest movers · 7 days'); assert.deepEqual(slot.items, []); assert.equal(slot.note, 'Not available just now.');
  }
});

/* --- METRIC 2: briefing activity --------------------------------------------------------------------------------- */
test('logic: briefings come from the derived file, dated "last 7 days, to <day>", a stale one left out with a note', async () => {
  const g = byId(await run(ALL_GOOD), 'briefings');
  assert.equal(g.title, 'Briefing activity');
  assert.equal(g.source, 'Vitruvian Manager Briefings');
  assert.equal(g.window, 'last 7 days, to 29 Oct', 'dated to the newest store');
  assert.deepEqual(g.items.map(i => i.label), ['Scientific Briefing', 'Economics Briefing', 'Intelligence Briefing'], 'Digital (2 days 16 hours old) is left out');
  assert.deepEqual(g.items.map(i => i.value), ['1,036 stories', '453 stories', '4,920 stories'], 'counts with thousands separators');
  assert.deepEqual(g.items.map(i => i.detail), ['most in Biology', 'most in Monetary policy & central banks', 'most from Centre · to 28 Oct'], 'top topic; a store that ends on another day says so');
  assert.deepEqual(g.items.map(i => i.href), [ROUTES.scienceBriefing, ROUTES.econBriefing, ROUTES.intelligenceBriefing], 'each line links to its own briefing');
  assert.equal(g.note, 'Left out, not refreshed for two days: Digital Briefing.');
  assert.equal(g.href, ROUTES.intelligenceBriefing, 'the group links to the busiest briefing (Intelligence, 4,920)');
  assert.equal(g.link, 'Intelligence Briefing');
  assert.ok(g.items.every(i => i.tone === undefined), 'a count is not a rise or fall');
});

test('logic: briefings: the two-day rule is exact, and a briefing with no date is left out', async () => {
  const at = ms => ({ ...BRIEFS, records: [{ ...BRIEFS.records[0], generated: iso(+NOW - ms) }] });
  assert.equal(byId(await run({ ...ALL_GOOD, 'briefing-activity': at(BRIEFING_STALE_MS) }), 'briefings').items.length, 1, 'exactly two days old: still in');
  const over = byId(await run({ ...ALL_GOOD, 'briefing-activity': at(BRIEFING_STALE_MS + 1) }), 'briefings');
  assert.deepEqual(over.items, [], 'a millisecond more: out');
  assert.equal(over.note, 'Left out, not refreshed for two days: Scientific Briefing.');
  assert.equal(BRIEFING_STALE_MS, 2 * DAY);
  const undated = byId(await run({ ...ALL_GOOD, 'briefing-activity': { records: [{ ...BRIEFS.records[0], generated: null }] } }), 'briefings');
  assert.deepEqual(undated.items, []);
  // A store that keeps another number of days says so on its own line; the window keeps the newest store's.
  const mixed = byId(await run({ ...ALL_GOOD, 'briefing-activity': { records: [BRIEFS.records[0], { ...BRIEFS.records[1], days: 3, generated: '2026-10-29T01:00:00Z' }] } }), 'briefings');
  assert.equal(mixed.window, 'last 7 days, to 29 Oct');
  assert.equal(mixed.items[1].detail, 'most in Monetary policy & central banks · last 3 days');
});

test('logic: briefings never read a store, whatever is asked', async () => {
  const calls = [];
  await run(ALL_GOOD, { calls, includeIntelligence: true });
  assert.ok(!calls.some(u => /stories\.json|briefing\/data\/latest/.test(u)), JSON.stringify(calls));
});

/* --- METRIC 3: upcoming calendar --------------------------------------------------------------------------------- */
test('logic: calendar: the next five elections/referendums/summits, soonest first, past events dropped', async () => {
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
  assert.ok(g.items.every(i => i.href === '#/rt/calendar'));

  const later = byId(await run({ ...ALL_GOOD, 'upcoming-political-events': { records: CALENDAR.records.slice(-1) } }), 'calendar');
  assert.equal(later.items[0].value, '1 Feb 2027', 'another year\'s date keeps its year');
});

test('logic: calendar falls back to any upcoming event, honestly relabelled, when no vote or summit is in the window', async () => {
  const onlyOther = { records: [
    { date: '2026-11-02', type: 'protest', country: 'France', title: 'A protest', status: 'declared' },
    { date: '2026-11-04', type: 'vote', country: 'EU', title: 'A parliamentary vote', status: 'tentative' },
    { date: '2026-01-01', type: 'summit', country: 'Old', title: 'A past summit', status: 'declared' },
  ] };
  const g = byId(await run({ ...ALL_GOOD, 'upcoming-political-events': onlyOther }), 'calendar');
  assert.equal(g.window, 'any kind of event', 'the window no longer claims elections/referendums/summits');
  assert.deepEqual(g.items.map(i => i.label), ['A protest', 'A parliamentary vote']);
});

/* --- METRIC 4: market snapshot ----------------------------------------------------------------------------------- */
test('logic: markets: each quote with its own time, the window when they were fetched (never "live"), five lines', async () => {
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
  assert.ok(g.items.every(i => i.href === '#/mm/markets'));
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
  const slow = (table, ms) => { const f = stubFetch(table); return async u => { if (String(u).includes('volatility-movers')) await new Promise(r => setTimeout(r, ms)); return f(u); }; };
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
  assert.deepEqual(e, { v: 2, at: +NOW, until: +NOW + 45 * 60e3, groups });
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
  const empty = {
    'volatility-movers': { records: [] }, 'briefing-activity': { records: [] }, 'upcoming-political-events': { records: [] },
    'api/public/overview': {}, 'api/public/hype': {},
  };
  assert.deepEqual(await run(empty), [], 'empty data → no groups');
  assert.deepEqual(await buildTodayHighlights({ fetch: null, now: NOW, timeoutMs: 50 }).catch(e => e), [], 'no fetch at all → no groups');
});

test('logic: one working source still produces its group when the others fail', async () => {
  const onlyCalendar = {};
  for (const k of Object.keys(ALL_GOOD)) onlyCalendar[k] = 'throw';
  onlyCalendar['upcoming-political-events'] = CALENDAR;
  const groups = await run(onlyCalendar);
  assert.deepEqual(groups.map(g => g.id), ['calendar'], 'just the one group that had data');
});

/* --- escaping contract ------------------------------------------------------------------------------------------- */
test('logic: strings are returned as plain data, never pre-escaped (the renderer escapes with the shell esc())', async () => {
  const hostile = '<b>"A&B" vote</b>';
  const cal = { records: [{ date: '2026-11-03', type: 'election', country: 'X & Y', title: hostile, status: 'declared' }] };
  const g = byId(await run({ ...ALL_GOOD, 'upcoming-political-events': cal }), 'calendar');
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
  assert.match(shell, /fetch\(url, \{ signal: abortAfter\(TODAY_FETCH_MS\) \}\)/);
  assert.match(shell, /const TODAY_KEY = 'prp\.today\.v2';/, 'the cache key moved on with its shape');
  assert.match(shell, /aria-label="Today in your workspace" aria-live="off"/, 'the panel opts out of the view\'s live region');
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
// The page fixtures are dated from the real clock, since the shell uses it: fresh briefings, events from today on.
function pageFixtures() {
  const now = Date.now(), d = n => iso(now + n * DAY).slice(0, 10);
  return {
    'volatility-movers': VOL_MOVERS,
    'briefing-activity': { ...BRIEFS, records: BRIEFS.records.map((r, i) => ({ ...r, generated: iso(now - (i + 1) * H) })) },
    'upcoming-political-events': { records: [['election', 'Narnia', 'Narnian general election'], ['summit', 'Antigua', 'Commonwealth Heads of Government Meeting'], ['election', 'United States', 'United States House of Representatives elections'],
      ['referendum', 'Switzerland', 'Swiss referendum on something long enough to wrap'], ['election', 'Ghana', 'Ghanaian presidential election']].map(([type, country, title], i) => ({ date: d(i + 1), type, country, title, status: 'declared' })) },
    overview: { ...OVERVIEW, at: now - 60e3 },
    hype: HYPE,
  };
}
// Serve every source of the panel from the fixtures, each held until `gate` resolves (if given) and the hype feed after
// `hypeDelay` ms; `seen` collects the requests.
async function servePanel(context, { gate = null, hypeDelay = 0, seen = [] } = {}) {
  const fx = pageFixtures();
  await context.route(/\/integration\/data\/(volatility-movers|briefing-activity|upcoming-political-events)\.json/, async route => {
    seen.push(route.request().url()); if (gate) await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(fx[/(volatility-movers|briefing-activity|upcoming-political-events)/.exec(route.request().url())[1]]) });
  });
  await context.route(/\/api\/public\/(overview|hype)/, async route => {
    const kind = route.request().url().includes('overview') ? 'overview' : 'hype';
    seen.push(route.request().url()); if (gate) await gate;
    if (kind === 'hype' && hypeDelay) await new Promise(r => setTimeout(r, hypeDelay).unref()); // unref: never holds the run open
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx[kind]) }).catch(() => { /* the page gave up on it */ });
  });
  return seen;
}
const panelBox = page => page.evaluate(() => ({ panel: document.querySelector('#today').getBoundingClientRect().height, kpis: document.querySelector('.today-kpis').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('#today .today-card')].map(c => c.getBoundingClientRect().height) }));
const filled = page => page.waitForFunction(() => document.querySelectorAll('#today .today-card').length === 4 && !document.querySelector('#today .today-card[data-state="loading"], #today[aria-busy]'), null, { timeout: 15000 });

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
      await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
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

test('page: rows and links show their focus ring; the four links have their own names; tones use their tokens', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await servePanel(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await filled(page);
    const names = await page.$$eval('#today .today-head .more', a => a.map(x => x.getAttribute('aria-label')));
    assert.deepEqual(names, ['View Geopolitical Volatility', 'View Intelligence Briefing', 'View Realtime Calendar', 'View Market Briefing']);
    // Keyboard through the panel from the heading above it: every link shows a 2px ring drawn inside the card.
    await page.evaluate(() => { const h = document.querySelector('#view h1'); h.tabIndex = -1; h.focus(); });
    const links = await page.$$eval('#today a', a => a.length);
    for (let i = 0; i < links; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement, cs = getComputedStyle(el), r = el.getBoundingClientRect(), c = el.closest('.today-card').getBoundingClientRect();
        const off = parseFloat(cs.outlineOffset), w = parseFloat(cs.outlineWidth);
        // The ring's outer edge, which the card's overflow: hidden would cut off if it lay outside the card's border box.
        return { cls: el.className, visible: el.matches(':focus-visible'), style: cs.outlineStyle, w, inside: r.left - off - w >= c.left - 0.5 && r.right + off + w <= c.right + 0.5 && r.top - off - w >= c.top - 0.5 && r.bottom + off + w <= c.bottom + 0.5 };
      });
      assert.ok(ring.visible && ring.style === 'solid' && ring.w === 2, `link ${i} (${ring.cls}) shows its ring`);
      assert.ok(ring.inside, `link ${i} (${ring.cls}): the whole ring is inside the card`);
    }
    // Tones: a rise in volatility in the bad colour, a fall in the good; a market gain and loss in up/down.
    const tones = await page.evaluate(() => {
      const probe = v => { const s = document.createElement('span'); s.style.color = `var(${v})`; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const val = sel => getComputedStyle(document.querySelector(sel)).color;
      return { worse: [val('#today [data-group="volatility"] .today-val.worse'), probe('--prp-bad')], better: [val('#today [data-group="volatility"] .today-val.better'), probe('--prp-good')],
        up: [val('#today [data-group="markets"] .today-val.up'), probe('--prp-up')], down: [val('#today [data-group="markets"] .today-val.down'), probe('--prp-down')] };
    });
    for (const [k, [got, want]] of Object.entries(tones)) assert.equal(got, want, `${k} is coloured with its token`);
    assert.match(await page.textContent('#today [data-group="markets"] .today-win'), /^quotes fetched \d+ \w{3} \d\d:\d\d UTC · trade-desk$/, 'never "live"');
    await context.close();
  } finally { await browser.close(); }
});

test('page: the session cache: a fresh entry fetches nothing; a stale one shows at once and is refreshed in place', pageTest, async t => {
  if (!(await served())) { t.skip(`the shell is not served at ${BASE}`); return; }
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const seen = await servePanel(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await filled(page);
    const entry = await page.evaluate(() => JSON.parse(sessionStorage.getItem('prp.today.v2')));
    assert.equal(entry.v, 2);
    assert.ok(entry.at <= Date.now() && entry.until > Date.now() && entry.until - entry.at <= 45 * 60e3, 'written now, fresh for at most 45 minutes');
    assert.deepEqual(entry.groups.map(g => g.id), GROUP_IDS);
    assert.equal(seen.length, 5, 'five requests for the first fill');

    // Fresh: the reload shows the stored panel and asks for nothing.
    seen.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await filled(page);
    await page.waitForTimeout(1800); // past the idle callback's 1.5 s timeout
    assert.equal(seen.length, 0, 'a fresh entry fetches nothing');

    // Stale (past its `until`): shown at once, with no loading card, then refreshed slot by slot and stored afresh.
    seen.length = 0;
    await page.evaluate(() => {
      const e = JSON.parse(sessionStorage.getItem('prp.today.v2'));
      e.at -= 46 * 60e3; e.until = Date.now() - 1;
      e.groups.find(g => g.id === 'calendar').items[0].label = 'A stale line';
      sessionStorage.setItem('prp.today.v2', JSON.stringify(e));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#today .today-card');
    assert.equal(await page.locator('#today .today-card[data-state="loading"]').count(), 0, 'no loading cards: the stale panel shows at once');
    await page.waitForFunction(() => !document.querySelector('#today').textContent.includes('A stale line') && !document.querySelector('#today[aria-busy]'), null, { timeout: 15000 });
    assert.equal(seen.length, 5, 'the stale entry was refreshed');
    const fresh = await page.evaluate(() => JSON.parse(sessionStorage.getItem('prp.today.v2')));
    assert.ok(fresh.at > entry.at && fresh.until > Date.now(), 'and stored again, fresh');
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
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => ['volatility', 'briefings', 'calendar'].every(id => document.querySelector(`#today [data-group="${id}"]`)?.dataset.state === 'ready'), null, { timeout: 6000 });
    assert.equal(await page.getAttribute('#today [data-group="markets"]', 'data-state'), 'loading', 'the markets slot alone still waits');
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('#today [data-group="markets"]')?.dataset.state !== 'loading', null, { timeout: 12000 });
    assert.ok(Date.now() - t0 < 9500, 'given up on within the 8 s timeout');
    assert.deepEqual(await page.$$eval('#today [data-group="markets"] .today-label', l => l.map(x => x.textContent)), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD'], 'the quotes that did answer');
    await context.close();
  } finally { await browser.close(); }
});
