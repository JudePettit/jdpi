// PRP highlights: the data behind the Workspace "Today" panel (design/prp-highlights.js, PRP-ANALYSIS.md item 3).
// These are pure Node tests — no browser, no network. Each runs buildTodayHighlights() against small inline fixtures
// through a stub fetch, and checks that the groups have the right shape, that the volatility movers are ranked by the
// size of their 7-day change and signed the right way, that each window is labelled by the cadence its data really
// supports, that every link is a shell hash route, and that a failing or empty source drops its group without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayHighlights, ROUTES } from '../design/prp-highlights.js';

// The only addresses the shell accepts (shell.js SHELL_ROUTE); every group and item link must match it.
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/;
const UP = '↑', DOWN = '↓', M = '−'; // ↑ ↓ − exactly as the module emits them
const NOW = new Date('2026-10-29T12:00:00Z');       // fixes "today" for the calendar and the 7-day baseline maths

/* --- a stub fetch: route a URL to a fixture by substring, and record every request --------------------------------
   A fixture value is the JSON to return (200); the sentinels 'throw' (network error), '404' (not found) and 'badjson'
   (a 200 whose body is not JSON) stand in for the failure modes the module must survive. */
function stubFetch(table, calls = []) {
  return async url => {
    const u = String(url);
    calls.push(u);
    for (const key of Object.keys(table)) {
      if (!u.includes(key)) continue;
      const v = table[key];
      if (v === 'throw') throw new Error('network down: ' + u);
      if (v === 'badjson') return new Response('<<not json', { status: 200 });
      if (v === '404') return new Response('nope', { status: 404 });
      return new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('unrouted: ' + u, { status: 404 });
  };
}

/* --- fixtures (shapes taken from the real committed data, trimmed to a handful of rows) ----------------------------- */
// Day-0 per-country GVI. Golf has a null score (unscored); Hotel has no 7-day-prior row, so neither can be a mover.
const VOL_LATEST = {
  dataset: 'volatility-latest', generated: '2026-10-29T06:03:15Z', derivedFrom: ['volatility/data/index.json'],
  records: [
    { iso3: 'BBB', name: 'Bravo', date: '2026-10-28', score: 80, coverage: 'high' },
    { iso3: 'DDD', name: 'Delta', date: '2026-10-28', score: 60, coverage: 'high' },
    { iso3: 'AAA', name: 'Alpha', date: '2026-10-28', score: 50, coverage: 'high' },
    { iso3: 'III', name: 'India', date: '2026-10-28', score: 70.4, coverage: 'high' },
    { iso3: 'FFF', name: 'Foxtrot', date: '2026-10-28', score: 30, coverage: 'medium' },
    { iso3: 'CCC', name: 'Charlie', date: '2026-10-28', score: 40, coverage: 'medium' },
    { iso3: 'EEE', name: 'Echo', date: '2026-10-28', score: 90, coverage: 'high' },
    { iso3: 'GGG', name: 'Golf', date: '2026-10-28', score: null, coverage: 'insufficient' },
    { iso3: 'HHH', name: 'Hotel', date: '2026-10-28', score: 55, coverage: 'medium' },
  ],
};
// The baseline is day-0 (2026-10-28) minus 7 days = 2026-10-21. Deltas: BBB −15, DDD +12, AAA +5, III +4.3, FFF −3,
// CCC −2, EEE +1. Ranked by |Δ|: BBB, DDD, AAA, III, FFF (CCC and EEE fall outside the top five).
const VOL_DAY = {
  day: '2026-10-21', method: 'gdelt', globalMean: 20,
  countries: {
    BBB: { score: 95, name: 'Bravo' }, DDD: { score: 48, name: 'Delta' }, AAA: { score: 45, name: 'Alpha' },
    III: { score: 66.1, name: 'India' }, FFF: { score: 33, name: 'Foxtrot' }, CCC: { score: 42, name: 'Charlie' },
    EEE: { score: 89, name: 'Echo' }, GGG: { score: 50, name: 'Golf' },
  },
};
const SCIENCE = {
  generated: '2026-10-29T14:37:08Z', keepDays: 7,
  disciplines: [
    { id: 'physics', label: 'Physics' }, { id: 'chemistry', label: 'Chemistry' }, { id: 'biology', label: 'Biology' },
    { id: 'earth', label: 'Earth & Environment' }, { id: 'space', label: 'Astronomy & Space' },
  ],
  counts: { items: 1036, disciplines: { physics: 168, chemistry: 262, biology: 338, earth: 165, space: 135 } },
  items: [],
};
const ECON = {
  generated: '2026-10-29T14:37:35Z', keepDays: 7,
  fields: [
    { id: 'macro', label: 'Macro & growth' }, { id: 'monetary', label: 'Monetary policy & central banks' },
    { id: 'trade', label: 'Trade & globalisation' },
  ],
  counts: { items: 453, fields: { macro: 92, monetary: 132, trade: 43 } },
  items: [],
};
const DIGITAL = {
  generated: '2026-10-29T14:37:48Z', keepDays: 7,
  fields: [{ id: 'ai', label: 'AI & machine learning' }, { id: 'software', label: 'Software & computing' }],
  counts: { items: 664, fields: { ai: 258, software: 106 } },
  items: [],
};
const INTEL = {
  generated: '2026-10-29T18:49:14Z', keepDays: 7,
  positions: [
    { key: 'far_left', label: 'Far left' }, { key: 'left', label: 'Left' }, { key: 'centre', label: 'Centre' },
    { key: 'right', label: 'Right' }, { key: 'far_right', label: 'Far right' },
  ],
  sources: [
    { id: 'a', position: 'centre', count: 30 }, { id: 'b', position: 'left', count: 20 },
    { id: 'c', position: 'centre', count: 25 }, { id: 'd', position: 'far_right', count: 10 },
    { id: 'e', position: 'right', count: 15 },
  ],
  items: [],
};
// Past events and non-want types are present on purpose; only future elections/referendums/summits should survive.
const CALENDAR = {
  dataset: 'upcoming-political-events', generated: '2026-10-29T09:34:03Z',
  records: [
    { date: '2026-04-29', type: 'court', country: 'United States', title: 'Past court ruling', status: 'declared' },
    { date: '2026-10-29', type: 'election', country: 'Narnia', title: 'Election today', status: 'declared' },
    { date: '2026-11-01', type: 'summit', country: 'Antigua', title: 'Commonwealth summit', status: 'declared' },
    { date: '2026-11-03', type: 'election', country: 'United States', title: 'US midterms', status: 'declared' },
    { date: '2026-11-05', type: 'protest', country: 'France', title: 'Planned protest', status: 'tentative' },
    { date: '2026-11-07', type: 'referendum', country: 'Switzerland', title: 'Swiss referendum', status: 'tentative' },
    { date: '2026-12-01', type: 'election', country: 'Ghana', title: 'Ghana election', status: 'declared' },
    { date: '2027-02-01', type: 'summit', country: 'Kenya', title: 'AU summit', status: 'declared' },
  ],
};
const OVERVIEW = {
  at: 1793305089279, // 2026-10-29T20:18:09.279Z
  groups: [
    { group: 'US', items: [
      { symbol: '^GSPC', name: 'S&P 500', price: 7720.39, changePct: -0.3046237 },
      { symbol: '^IXIC', name: 'NASDAQ Composite', price: 26000, changePct: -1.38 },
    ] },
    { group: 'Europe', items: [{ symbol: '^FTSE', name: 'FTSE 100', price: 10722.07, changePct: 0.257796 }] },
    { group: 'Commodities', items: [{ symbol: 'GC=F', name: 'Gold', price: 4037.9, changePct: -0.338138 }] },
    { group: 'Crypto', items: [{ symbol: 'BTC-USD', name: 'Bitcoin USD', price: 80271.82, changePct: -1.2185517 }] },
  ],
};
const HYPE = {
  at: 1, // deliberately tiny: the quotes feed's `at` should win the "as of" time
  weights: { talk: 0.45, volume: 0.4, search: 0.15 },
  sources: ['ApeWisdom (Reddit mentions)', 'Yahoo Finance trending', 'Yahoo Finance volume and quotes'],
  tickers: [
    { symbol: 'GOOG', name: 'Alphabet (Google)', score: 99, changePct: -12.293, why: ['656 Reddit mentions (95 a day earlier)'] },
    { symbol: 'GOOGL', name: 'Alphabet (Google)', score: 98, changePct: -12.641, why: ['326 Reddit mentions'] },
    { symbol: 'NOW', name: 'ServiceNow', score: 96, changePct: -27.0, why: ['revenue warning'] },
    { symbol: 'NVDA', name: 'NVIDIA', score: 90, changePct: 3.5, why: ['record highs'] },
  ],
  missing: { volume: [], price: [] },
};
// A table that routes every source to a good fixture (Intelligence included, used only when asked for).
const ALL_GOOD = {
  'volatility-latest': VOL_LATEST,
  'volatility/data/days/2026-10-21.json': VOL_DAY,
  'science/briefing': SCIENCE,
  'econ/briefing': ECON,
  'digital/briefing': DIGITAL,
  'briefing/data/latest': INTEL,
  'upcoming-political-events': CALENDAR,
  'api/public/overview': OVERVIEW,
  'api/public/hype': HYPE,
};
const run = (table, opts = {}) => buildTodayHighlights({ fetch: stubFetch(table, opts.calls), base: '', marketsBase: '', now: NOW, ...opts });
const byId = (groups, id) => groups.find(g => g.id === id);

/* --- shape, routes and fetch-once -------------------------------------------------------------------------------- */
test('all four groups build, with the documented shape and shell-route links, fetching each source once', async () => {
  const calls = [];
  const groups = await run(ALL_GOOD, { calls });
  assert.deepEqual(groups.map(g => g.id), ['volatility', 'briefings', 'calendar', 'markets'], 'the four groups, in order');

  for (const g of groups) {
    for (const f of ['id', 'title', 'source', 'window', 'href']) {
      assert.equal(typeof g[f], 'string', `${g.id}.${f} is a string`);
      assert.ok(g[f].length, `${g.id}.${f} is not empty`);
    }
    assert.match(g.href, SHELL_ROUTE, `${g.id} group href is a shell route`);
    assert.ok(Array.isArray(g.items) && g.items.length, `${g.id} has items`);
    for (const it of g.items) {
      assert.equal(typeof it.label, 'string'); assert.ok(it.label.length, `${g.id} item label not empty`);
      assert.match(it.href, SHELL_ROUTE, `${g.id} item href is a shell route`);
      if (it.value !== undefined) assert.equal(typeof it.value, 'string');
      if (it.detail !== undefined) assert.equal(typeof it.detail, 'string');
      if (it.tone !== undefined) assert.ok(it.tone === 'up' || it.tone === 'down', `${g.id} tone is up/down`);
    }
  }
  // Each source is read exactly once (Intelligence is off by default, so eight distinct URLs).
  assert.equal(calls.length, 8, `eight fetches, got ${calls.length}: ${JSON.stringify(calls)}`);
  assert.equal(new Set(calls).size, 8, 'every fetch is to a distinct URL');
  assert.ok(!calls.some(u => u.includes('briefing/data/latest')), 'the 2 MB Intelligence store is not fetched by default');
});

/* --- METRIC 1: volatility movers --------------------------------------------------------------------------------- */
test('volatility: biggest absolute 7-day change first, risers and fallers signed and toned correctly', async () => {
  const g = byId(await run(ALL_GOOD), 'volatility');
  assert.equal(g.title, 'Biggest volatility movers');
  assert.equal(g.source, 'GDELT');
  assert.equal(g.href, ROUTES.volatility);
  assert.equal(g.href, '#/rt/volatility');
  // Honest window: a real daily series, so a 7-day change, dated to day-0.
  assert.match(g.window, /^7-day change .* daily, to 28 Oct 2026$/);

  assert.equal(g.items.length, 5, 'top five movers (unscored and no-baseline countries excluded)');
  assert.deepEqual(g.items.map(i => i.label), ['Bravo', 'Delta', 'Alpha', 'India', 'Foxtrot'], 'ranked by |Δ|');
  assert.deepEqual(g.items.map(i => i.value), [`${DOWN} 15`, `${UP} 12`, `${UP} 5`, `${UP} 4.3`, `${DOWN} 3`]);
  assert.deepEqual(g.items.map(i => i.tone), ['down', 'up', 'up', 'up', 'down']);
  assert.deepEqual(g.items.map(i => i.detail), ['now 80', 'now 60', 'now 50', 'now 70.4', 'now 30']);
  assert.ok(!g.items.some(i => i.label === 'Golf'), 'a null-score country is never a mover');
  assert.ok(!g.items.some(i => i.label === 'Hotel'), 'a country with no 7-day-prior score is never a mover');
  assert.ok(g.items.every(i => i.href === '#/rt/volatility'), 'every mover links into Volatility');
});

test('volatility: falls back to "most volatile now" when the baseline day file is missing', async () => {
  // Everything good except the baseline day file, which 404s.
  const g = byId(await run({ ...ALL_GOOD, 'volatility/data/days/2026-10-21.json': '404' }), 'volatility');
  assert.equal(g.title, 'Most volatile now');
  assert.ok(g.window.startsWith('daily'), 'labelled only daily, not a 7-day change');
  assert.ok(!g.window.includes('7-day'), 'no false 7-day claim when there is no baseline');
  assert.deepEqual(g.items.map(i => i.label), ['Echo', 'Bravo', 'India', 'Delta', 'Hotel'], 'highest current GVI first');
  assert.equal(g.items[0].value, 'GVI 90');
  assert.equal(g.items[2].value, 'GVI 70.4');
  assert.ok(g.items.every(i => i.tone === undefined), 'a static ranking is not toned up/down');
});

test('volatility: a non-date in the data can never reach the day-file URL (path guard)', async () => {
  const calls = [];
  const bad = { ...VOL_LATEST, records: [{ ...VOL_LATEST.records[0], date: '../../../etc/passwd' }, ...VOL_LATEST.records.slice(1)] };
  const g = byId(await run({ ...ALL_GOOD, 'volatility-latest': bad }, { calls }), 'volatility');
  assert.ok(!calls.some(u => u.includes('volatility/data/days')), 'no day file is requested for an invalid date');
  assert.equal(g.title, 'Most volatile now', 'it falls back quietly instead');
});

/* --- METRIC 2: briefing activity --------------------------------------------------------------------------------- */
test('briefings: per-briefing counts and the most-covered topic, labelled "last 7 days"', async () => {
  const g = byId(await run(ALL_GOOD), 'briefings');
  assert.equal(g.title, 'Briefing activity');
  assert.equal(g.source, 'Vitruvian Manager Briefings');
  assert.equal(g.window, 'last 7 days', 'keepDays:7 means the whole store is the last 7 days — no finer claim');
  assert.equal(g.href, ROUTES.scienceBriefing, 'the group links to the busiest briefing (Science, 1,036)');

  assert.deepEqual(g.items.map(i => i.label), ['Scientific Briefing', 'Economics Briefing', 'Digital Briefing']);
  assert.deepEqual(g.items.map(i => i.value), ['1,036 stories', '453 stories', '664 stories'], 'counts with thousands separators');
  assert.deepEqual(g.items.map(i => i.detail), ['most in Biology', 'most in Monetary policy & central banks', 'most in AI & machine learning'], 'top topic mapped id→label');
  assert.deepEqual(g.items.map(i => i.href), [ROUTES.scienceBriefing, ROUTES.econBriefing, ROUTES.digitalBriefing], 'each line links to its own briefing');
  assert.ok(g.items.every(i => i.tone === undefined), 'a count is not a rise or fall');
});

test('briefings: the 2 MB Intelligence store is excluded by default and included only on request', async () => {
  const off = byId(await run(ALL_GOOD), 'briefings');
  assert.ok(!off.items.some(i => i.label === 'Intelligence Briefing'), 'excluded by default');

  const on = byId(await run(ALL_GOOD, { includeIntelligence: true }), 'briefings');
  const intel = on.items.find(i => i.label === 'Intelligence Briefing');
  assert.ok(intel, 'included when asked for');
  assert.equal(intel.value, '100 stories', 'summed per-source counts, not iterated items');
  assert.equal(intel.detail, 'most from Centre', 'its position balance, by label');
  assert.equal(intel.href, ROUTES.intelligenceBriefing);
});

/* --- METRIC 3: upcoming calendar --------------------------------------------------------------------------------- */
test('calendar: the next elections/referendums/summits, soonest first, past events dropped', async () => {
  const g = byId(await run(ALL_GOOD), 'calendar');
  assert.equal(g.title, 'Upcoming');
  assert.equal(g.source, 'Political calendar');
  assert.equal(g.href, ROUTES.calendar);
  assert.match(g.window, /soonest first$/);
  assert.ok(g.window.includes('elections, referendums'), 'window names the kinds shown');

  assert.deepEqual(g.items.map(i => i.label),
    ['Election today', 'Commonwealth summit', 'US midterms', 'Swiss referendum', 'Ghana election', 'AU summit']);
  const dates = g.items.map(i => i.value);
  assert.equal(dates[0], '29 Oct 2026', 'an event dated today is still upcoming');
  assert.equal(dates[1], '1 Nov 2026');
  assert.deepEqual([...dates].sort(cmpEventDate), dates, 'dates are ascending');
  assert.equal(g.items[0].detail, 'Election · Narnia');
  assert.equal(g.items[3].detail, 'Referendum · Switzerland · tentative', 'a tentative date is flagged');
  assert.ok(!g.items.some(i => i.label === 'Past court ruling'), 'past events are gone');
  assert.ok(!g.items.some(i => i.label === 'Planned protest'), 'non-election/referendum/summit types are filtered out');
  assert.ok(g.items.every(i => i.href === '#/rt/calendar'));
});

test('calendar: falls back to any upcoming event, honestly relabelled, when no vote or summit is in the window', async () => {
  const onlyOther = { records: [
    { date: '2026-11-02', type: 'protest', country: 'France', title: 'A protest', status: 'declared' },
    { date: '2026-11-04', type: 'vote', country: 'EU', title: 'A parliamentary vote', status: 'tentative' },
    { date: '2026-01-01', type: 'summit', country: 'Old', title: 'A past summit', status: 'declared' },
  ] };
  const g = byId(await run({ ...ALL_GOOD, 'upcoming-political-events': onlyOther }), 'calendar');
  assert.equal(g.window, 'events · soonest first', 'the window no longer claims elections/referendums/summits');
  assert.deepEqual(g.items.map(i => i.label), ['A protest', 'A parliamentary vote']);
});

/* --- METRIC 4: market snapshot ----------------------------------------------------------------------------------- */
test('markets: headline indices then deduped hype movers, toned by direction, with an "as of" time', async () => {
  const g = byId(await run(ALL_GOOD), 'markets');
  assert.equal(g.title, 'Market snapshot');
  assert.equal(g.source, 'trade-desk');
  assert.equal(g.href, ROUTES.markets);
  assert.equal(g.window, 'live quotes · as of 29 Oct 2026, 20:18 UTC', 'as-of comes from the quotes feed (ms epoch)');

  // Four headline indices (in the fixed order; NASDAQ is not headline and is skipped), then three hype movers.
  assert.deepEqual(g.items.map(i => i.label), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD', 'GOOG', 'NOW', 'NVDA']);
  assert.deepEqual(g.items.slice(0, 4).map(i => i.value), [`${M}0.30%`, '+0.26%', `${M}0.34%`, `${M}1.22%`], 'signed percentages, true minus');
  assert.deepEqual(g.items.slice(0, 4).map(i => i.tone), ['down', 'up', 'down', 'down']);
  assert.equal(g.items[0].detail, '7,720.39', 'the price, with thousands separators');
  assert.ok(!g.items.some(i => i.label === 'GOOGL'), 'GOOG/GOOGL dedupe by company name');
  assert.equal(g.items[4].value, `${M}12.29%`);
  assert.equal(g.items[4].detail, 'hype 99 · 656 Reddit mentions (95 a day earlier)', 'score then the top plain-English reason');
  assert.equal(g.items[6].tone, 'up', 'a riser is toned up');
  assert.ok(g.items.every(i => i.href === '#/mm/markets'));
});

test('markets: shows whichever feed responds — only indices, or only hype', async () => {
  const noHype = byId(await run({ ...ALL_GOOD, 'api/public/hype': 'throw' }), 'markets');
  assert.deepEqual(noHype.items.map(i => i.label), ['S&P 500', 'FTSE 100', 'Gold', 'Bitcoin USD']);

  const noQuotes = byId(await run({ ...ALL_GOOD, 'api/public/overview': '404' }), 'markets');
  assert.deepEqual(noQuotes.items.map(i => i.label), ['GOOG', 'NOW', 'NVDA']);
});

/* --- failing and empty sources ----------------------------------------------------------------------------------- */
test('a source that fails or is empty yields no group, and the function never throws', async () => {
  // Every kind of failure at once.
  const throwing = {};
  for (const k of Object.keys(ALL_GOOD)) throwing[k] = 'throw';
  assert.deepEqual(await run(throwing), [], 'network errors everywhere → no groups');

  const notFound = {};
  for (const k of Object.keys(ALL_GOOD)) notFound[k] = '404';
  assert.deepEqual(await run(notFound), [], 'non-2xx everywhere → no groups');

  assert.deepEqual(await run({ 'volatility-latest': 'badjson', 'science/briefing': 'badjson', 'econ/briefing': 'badjson', 'digital/briefing': 'badjson', 'upcoming-political-events': 'badjson', 'api/public/overview': 'badjson', 'api/public/hype': 'badjson' }), [], 'bad JSON everywhere → no groups');

  // Present but empty bodies.
  const empty = {
    'volatility-latest': { records: [] },
    'science/briefing': { counts: { items: 0 } }, 'econ/briefing': { counts: { items: 0 } }, 'digital/briefing': { counts: { items: 0 } },
    'upcoming-political-events': { records: [] },
    'api/public/overview': {}, 'api/public/hype': {},
  };
  assert.deepEqual(await run(empty), [], 'empty data → no groups');
});

test('one working source still produces its group when the others fail', async () => {
  const onlyCalendar = {};
  for (const k of Object.keys(ALL_GOOD)) onlyCalendar[k] = 'throw';
  onlyCalendar['upcoming-political-events'] = CALENDAR;
  const groups = await run(onlyCalendar);
  assert.deepEqual(groups.map(g => g.id), ['calendar'], 'just the one group that had data');
});

/* --- escaping contract ------------------------------------------------------------------------------------------- */
test('strings are returned as plain data, never pre-escaped (the renderer escapes with the shell esc())', async () => {
  const hostile = '<b>"A&B" vote</b>';
  const cal = { records: [{ date: '2026-11-03', type: 'election', country: 'X & Y', title: hostile, status: 'declared' }] };
  const g = byId(await run({ ...ALL_GOOD, 'upcoming-political-events': cal }), 'calendar');
  assert.equal(g.items[0].label, hostile, 'markup passes through verbatim for the renderer to escape');
  assert.equal(g.items[0].detail, 'Election · X & Y', 'the ampersand is not HTML-escaped here');
});

// Compare two "D Mon YYYY" strings by their real date, to assert ascending order without trusting string order.
function cmpEventDate(a, b) {
  const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parse = s => { const [d, mon, y] = s.split(' '); return Date.UTC(+y, M3.indexOf(mon), +d); };
  return parse(a) - parse(b);
}
