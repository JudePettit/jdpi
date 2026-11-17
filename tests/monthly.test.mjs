// Month by Month (Realtime Geopolitics): the rule behind every monthly direction mark (monthly/scripts/rules.mjs), the
// series it reads (series.mjs), the committed data (monthly/data, which calendar-refresh, battlefield-refresh and
// warfocus-refresh test before committing) and the pages that draw marks. The data tests read the repository's files and
// pass with PRP_PAGES=0; the page tests run against JDPI_URL (default the live site) in Microsoft Edge, muted.
// The data tests assert only what holds whichever refresh ran last: two files that different refreshes write on their
// own schedules are never held equal (each refresh is tested alone on what it leaves, then the deploy gate tests all).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { pageTest } from './tools/pages.mjs';
import { parseYaml } from './tools/yaml.mjs';
import { RULE, WORDS, fightingMark, volatilityMark, volatilityDays, volatilityRise, markProblems, deathsDirection, eventsDirection, addMonths, sameReason, reportSpan } from '../monthly/scripts/rules.mjs';
import { seriesFromEvents, focusRows, rowsFromSeries, gwTable, mergeRows, countryRows, INDEPENDENCE } from '../monthly/scripts/series.mjs';
import { checkHeads } from '../integration/scripts/heads.mjs';

const BASE = (process.env.JDPI_URL || process.env.PRP_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const launch = async () => (await import('playwright-core')).chromium.launch({ channel: process.env.PRP_BROWSER || 'msedge', args: ['--mute-audio'] });
// design/prp-mark.js (a classic script) in a sandbox, as a standalone page at `href` (or inside the shell) loads it.
const loadMark = ({ href = 'https://jdpi.pages.dev/q/monthly.html', embedded = false } = {}) => {
  const box = { document: { currentScript: { dataset: { shell: '../' } } }, location: { href }, URL, fetch: () => Promise.reject(new Error('no network')) };
  box.window = box; box.self = box; box.top = embedded ? {} : box;
  vm.runInNewContext(read('design/prp-mark.js'), box);
  return box.PRPMark;
};
// A plain copy of what the sandbox returns (its arrays and objects are of another realm).
const plain = x => JSON.parse(JSON.stringify(x));

// A month: deaths, events, and optionally its largest event, span deaths, dataset, estimate and provisional flags.
const row = (m, d, e, x = {}) => ({ m, d, e, sh: 'sh' in x ? x.sh : 0, top: x.top === undefined ? { date: `${m}-10`, n: Math.min(d, Math.max(1, Math.round(d / 10))), place: 'somewhere', end: null, whole: Math.min(d, Math.max(1, Math.round(d / 10))), headline: '', office: '' } : x.top, src: x.src || 'UCDP GED 26.1', est: !!x.est, prov: !!x.prov, ...(x.part ? { part: x.part } : {}) });
const four = (ds, es, x = {}) => ['2026-06', '2026-07', '2026-08', '2026-09'].map((m, k) => row(m, ds[k], es[k], typeof x === 'function' ? x(k) : x));

/* ------------------------------------------------------------------------------------------- the rule */
test('rule: the comparisons, against the median of the three months before', () => {
  assert.equal(deathsDirection(3170, [42, 200, 1252]), 'worse', 'Yemen: 3,170 against a median of 200, above all three');
  assert.equal(deathsDirection(288, [587, 491, 235]), 'same', 'a spike before (the Sahel): 288 is not below every month, so no fall is marked');
  assert.equal(deathsDirection(3170, [200, 1252, 3170]), 'same', 'a step that already happened is not marked again');
  assert.equal(deathsDirection(79, [188, 128, 80]), 'better');
  assert.equal(deathsDirection(40, [30, 30, 30]), 'same', 'one and a half times, but not 25 more');
  assert.equal(eventsDirection(225, [18, 33, 111]), 'up');
  assert.equal(eventsDirection(262, [412, 451, 317]), 'down');
  assert.equal(eventsDirection(30, [28, 30, 32]), 'level');
});

test('rule: thin data gives no mark, and says why', () => {
  const m = fightingMark(four([33, 48, 109, 16], [5, 5, 2, 1]), '2026-09');
  assert.equal(m.direction, 'none'); assert.equal(m.why.code, 'thin');
  assert.match(m.why.text, /1 in September 2026/);
  assert.match(m.what, /16 deaths recorded in September 2026/);
  const few = fightingMark(four([5, 4, 6, 3], [12, 12, 12, 12]), '2026-09');
  assert.equal(few.why.code, 'thin', 'under 25 deaths in the four months');
});

test('rule: an incomplete month is no month; a month not published is no mark', () => {
  const war = { id: 'x', ongoing: true, dataThrough: '2026-09-15', months: ['2026-06', '2026-07', '2026-08', '2026-09'], deaths: [100, 120, 110, 900], estimated: [false, false, false, false],
    cells: [[[0, 0, 100, 30]], [[0, 0, 120, 30]], [[0, 0, 110, 30]], [[0, 0, 900, 40]]], top: [[], [], [], []], shared: null };
  const rows = focusRows(war);
  assert.deepEqual(rows.map(r => r.m), ['2026-06', '2026-07', '2026-08'], 'September runs to the 15th only, so it is left out');
  const m = fightingMark(rows, '2026-09');
  assert.equal(m.direction, 'none'); assert.equal(m.why.code, 'unpublished');
  assert.equal(fightingMark(four([100, 120, 110, 300], [30, 30, 30, 30]).slice(1), '2026-09').why.code, 'missing', 'a baseline month not held');
  // An ended war whose end falls mid-month: its last month is kept for the strip, but it is no whole month (the Gaza
  // war: 435 deaths over 1-10 October 2025 against three whole months).
  const gaza = { id: 'g', ongoing: false, start: '2025-06-01', end: '2025-10-10', months: ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10'], deaths: [2000, 2100, 2061, 1900, 435], estimated: [false, false, false, false, false],
    cells: [[[0, 0, 0, 300]], [[0, 0, 0, 300]], [[0, 0, 0, 300]], [[0, 0, 0, 300]], [[0, 0, 0, 80]]], top: [[], [], [], [], []], shared: null };
  const g = focusRows(gaza);
  assert.deepEqual(g.at(-1).part, { from: '2025-10-01', to: '2025-10-10', why: 'War Focus counts this war only to 10 October 2025, its end, so October 2025 is not a whole month and cannot be compared with whole months.' });
  const gm = fightingMark(g, '2025-10');
  assert.equal(gm.direction, 'none'); assert.equal(gm.why.code, 'partial'); assert.match(gm.why.text, /only to 10 October 2025/);
  // A war's first month, when it starts after the 1st, is no month for the three after it either (Russia-Ukraine's
  // February 2022 holds five days).
  const ru = { id: 'r', ongoing: true, start: '2022-02-24', dataThrough: '2022-06-30', months: ['2022-02', '2022-03', '2022-04', '2022-05', '2022-06'], deaths: [3419, 15000, 15280, 8221, 9000], estimated: [false, false, false, false, false],
    cells: [[[0, 0, 0, 100]], [[0, 0, 0, 300]], [[0, 0, 0, 300]], [[0, 0, 0, 300]], [[0, 0, 0, 300]]], top: [[], [], [], [], []], shared: null };
  const rr = focusRows(ru);
  assert.equal(rr[0].part.from, '2022-02-24'); assert.ok(!rr[1].part);
  assert.equal(fightingMark(rr, '2022-05').why.code, 'partial', 'February 2022 is in the three months before May');
  assert.notEqual(fightingMark(rr, '2022-06').why?.code, 'partial', 'June 2022 compares March to May, all whole');
});

test('rule: one large event decides nothing', () => {
  // Ethiopia, September 2026: 564 against 344, 217, 309, but 272 of them in one event on 22 September.
  const rows = four([344, 217, 309, 564], [66, 55, 63, 108], k => (k === 3 ? { top: { date: '2026-09-22', n: 272, place: 'Kobo woreda', end: null, whole: 272 } } : {}));
  const m = fightingMark(rows, '2026-09');
  assert.equal(m.direction, 'none'); assert.equal(m.why.code, 'one-event');
  assert.match(m.why.text, /22 September 2026, Kobo woreda: 272 deaths/);
  assert.equal(m.figures.withoutTop.deaths, 292);
  // A fall that rests on one event in the months before is no mark either.
  const b = four([188, 235, 205, 128], [42, 29, 31, 26], k => (k === 2 ? { top: { date: '2026-08-02', n: 45, place: 'Kabkabiya', end: null, whole: 45 } } : {}));
  assert.equal(fightingMark(b, '2026-09').why.code, 'one-event');
  // One that holds without it stands, with a step if it holds more than half the month.
  const y = four([42, 200, 1252, 3170], [18, 33, 111, 225], k => (k === 3 ? { top: { date: '2026-09-01', n: 749, place: 'Taiz', end: null, whole: 749 } } : {}));
  assert.equal(fightingMark(y, '2026-09').direction, 'worse');
  // A month-long tally UCDP records as one event is called a report, with the days it covers, never "on 1 April".
  const tally = { date: '2026-04-01', n: 6234, place: 'Ukraine', end: null, whole: 6234, headline: "Russia's losses in the war 01.04.2026 - 30.04.2026", office: 'Poteru' };
  assert.deepEqual(reportSpan(tally), { from: '2026-04-01', to: '2026-04-30' });
  assert.equal(reportSpan({ ...tally, headline: 'Shelling in Kharkiv' }), null);
  // Every month led by a report holding most of its deaths (Russia-Ukraine, April to July 2026): the fewer test compares
  // like with like (each month without its own report), and does not take the largest report out of its month alone.
  const lead = k => ({ top: { date: ['2026-06', '2026-07', '2026-08', '2026-09'][k] + '-01', n: [6234, 6109, 3848, 3226][k], place: 'Ukraine', end: null, whole: 0, headline: 'Losses ' + k, office: '' } });
  const lf = fightingMark(four([7841, 7607, 5848, 4135], [400, 400, 400, 400], lead), '2026-09');
  assert.equal(lf.figures.likeForLike.deaths, 909); assert.deepEqual(lf.figures.likeForLike.baseline, [1607, 1498, 2000]);
  assert.equal(lf.direction, 'better', 'each month without its own largest report still falls');
  assert.ok(lf.steps.some(s => s.code === 'one-event'), 'the report holding most of the month still lowers the confidence');
  // Not every month led so: the largest report of the months before is also taken out of its month alone.
  const tops = [{ ...tally, date: '2026-06-01', n: 500, headline: 'Losses 01.06.2026 - 30.06.2026' }, 10, 10, 200];
  const one = fightingMark(four([1000, 1000, 1000, 640], [400, 400, 400, 400], k => ({ top: typeof tops[k] === 'object' ? tops[k] : { date: '2026-0' + (6 + k) + '-10', n: tops[k], place: 'x', end: null, whole: tops[k], headline: '', office: '' } })), '2026-09');
  assert.equal(one.figures.likeForLike.direction, 'better');
  assert.equal(one.why.code, 'one-event');
  assert.match(one.why.text, /^One report in the months before decides it \(a report covering 1 to 30 June 2026, Ukraine: 500 deaths, in June 2026\)/);
});

test('rule: a fall with every check passed is high confidence, and says where the change came', () => {
  const rows = four([188, 128, 80, 79], [41, 39, 29, 29], () => ({ top: { date: '2026-07-04', n: 10, place: 'x', end: null, whole: 10 } }));
  const m = fightingMark(rows, '2026-09');
  assert.equal(m.direction, 'better'); assert.equal(m.words, 'Fewer deaths recorded'); assert.equal(m.confidence, 'high'); assert.deepEqual(m.steps, []);
  assert.ok(m.notes.some(n => /Most of this change came in August 2026/.test(n)), 'August already held it');
  assert.match(m.what, /against June 188, July 128 and August 80: a median of 128 a month/);
});

test('rule: a "No large change" names the condition that failed; the proportions note only when proportions failed', () => {
  // The Sahel, September 2026: 288 against 587, 491 and 235 (-41%) passes the proportion test; August was lower.
  const sahel = fightingMark(four([587, 491, 235, 288], [60, 60, 60, 60]), '2026-09');
  assert.equal(sahel.direction, 'same');
  assert.equal(sahel.reason, "No large change by this rule because September's 288 deaths are not below every one of the three months: August had 235.");
  assert.ok(sahel.what.endsWith(sahel.reason), 'the reason is part of what the reader sees');
  assert.ok(!sahel.notes.some(n => /proportions/.test(n)), 'not the proportions note');
  const big = fightingMark(four([5000, 5100, 5044, 6232], [400, 400, 400, 400]), '2026-09');
  assert.match(big.reason, /under one and a half times the median of 5,044/);
  assert.ok(big.notes.some(n => /proportions/.test(n)), 'proportions are what failed');
  assert.match(sameReason(40, [30, 30, 30], '2026-09', ['2026-06', '2026-07', '2026-08']).text, /fewer than 25 more than the median/);
  assert.deepEqual(markProblems({ ...sahel, reason: undefined, evidence: [{ dataset: 'd', version: 'v', released: 'r', counts: 'c', page: { url: 'u' } }] }), ['a same without the condition that failed']);
});

test('rule: provisional figures lower the confidence a step', () => {
  const fall = () => ({ top: { date: '2026-07-04', n: 10, place: 'x', end: null, whole: 10 } });
  const final = fightingMark(four([188, 128, 80, 79], [41, 39, 29, 29], fall), '2026-09');
  const prov = fightingMark(four([188, 128, 80, 79], [41, 39, 29, 29], k => ({ ...fall(), prov: k >= 2 })), '2026-09');
  assert.equal(final.confidence, 'high'); assert.equal(prov.confidence, 'medium');
  assert.deepEqual(prov.steps.map(s => s.code), ['provisional']);
  assert.match(prov.steps[0].text, /August 2026 and September 2026 come from UCDP's candidate events/);
  assert.equal(prov.provisional, true);
});

test('rule: reports covering several months, a dataset seam and an estimate give no mark', () => {
  const gap = four([1000, 1000, 1000, 500], [100, 100, 100, 100], k => ({ sh: k < 3 ? 400 : 0 }));
  assert.equal(fightingMark(gap, '2026-09').why.code, 'period-gap');
  // The test is a share, as the design (F3) and "How this is worked out" say: more than a quarter of the three months'
  // deaths from events over a span, and a quarter or less of the month's. Yemen, June to September 2016 (War Focus):
  // 42 of June's 359 deaths over a span, none after: 4% of the three months, so September's fall is marked.
  const yem = fightingMark(four([359, 310, 381, 225], [40, 40, 40, 20], k => ({ sh: k === 0 ? 42 : 0 })), '2026-09');
  assert.equal(yem.direction, 'better');
  // The month holding some such deaths, but a quarter or less: still no mark, and the reason gives both shares, never
  // "no such report covers" a month that holds one.
  const some = fightingMark(four([1000, 1000, 1000, 500], [100, 100, 100, 100], k => ({ sh: k < 3 ? 400 : 100 })), '2026-09');
  assert.equal(some.why.code, 'period-gap');
  assert.equal(some.why.text, "More than a quarter of the deaths in the three months before come from events UCDP dates only to a span running across months (1,200 of 3,000), against 100 of September 2026's 500: a later UCDP release may add such deaths to September 2026.");
  assert.match(fightingMark(gap, '2026-09').why.text, /\(1,200 of 3,000\), against none of September 2026's 500:/);
  assert.match(read('q/monthly.html'), /when, for fewer, more than a quarter of the deaths in the three months before come from events UCDP dates only to a span running across months and a quarter or less of this month's do/, 'the page states the share');
  assert.ok(!/none yet covers this one|no such report yet covers/.test(read('q/monthly.html') + read('monthly/scripts/rules.mjs')), 'nor presence and absence');
  const seam = four([300, 300, 300, 900], [50, 50, 50, 90], k => ({ src: k === 0 ? 'UCDP GED 26.1' : 'UCDP Candidate Events 2026' }));
  assert.equal(fightingMark(seam, '2026-09').why.code, 'datasets');
  const est = four([300, 300, 300, 900], [50, 50, 50, 90], k => ({ est: k === 1 }));
  assert.equal(fightingMark(est, '2026-09').why.code, 'estimate');
  const ok = four([300, 300, 300, 900], [50, 50, 50, 90]);
  assert.equal(fightingMark(ok, '2026-09', { seam: 'A conflict counted in only one year.' }).why.code, 'seam');
  assert.equal(fightingMark(ok, '2026-09', { from: '2026-07', fromWhy: 'Independent in July 2026.' }).why.code, 'start');
});

test('rule: confidence is high less one step for each check; three steps are no mark', () => {
  const two = fightingMark(four([42, 200, 1252, 3170], [18, 33, 111, 225], k => ({ sh: k === 2 ? 624 : 0 })), '2026-09');
  assert.equal(two.confidence, 'medium'); assert.deepEqual(two.steps.map(s => s.code), ['span']);
  const three = fightingMark(four([10, 10, 10, 300], [20, 20, 20, 15], k => (k === 3 ? { sh: null, top: { date: '2026-09-01', n: 160, place: '', end: '2026-09-30', whole: 160, headline: 'A report for the month', office: 'X' } } : { sh: null })), '2026-09');
  assert.equal(three.direction, 'none'); assert.equal(three.why.code, 'uncertain');
  assert.deepEqual(three.steps.map(s => s.code), ['few-events', 'one-event', 'span-unknown']);
  const disagree = fightingMark(four([100, 100, 100, 400], [60, 60, 60, 30]), '2026-09');
  assert.ok(disagree.steps.some(s => s.code === 'disagree'), 'deaths up, events down');
  for (const m of [two, three, disagree]) assert.deepEqual(markProblems({ ...m, evidence: [{ dataset: 'd', version: 'v', released: '2026-10-26', counts: 'c', page: { url: 'u' } }] }), []);
});

test('rule: no volatility mark before April 2027, nor while the store gives no method per day', () => {
  const days = Array.from({ length: 120 }, (_, i) => [new Date(Date.UTC(2027, 3, 30) - i * 864e5).toISOString().slice(0, 10), 50, [], 500, 0, 'h']).reverse();
  assert.equal(volatilityMark(days, '2026-10').why.code, 'too-early');
  assert.equal(volatilityMark(days, '2027-04').why.code, 'method-unknown');
  const m = volatilityMark(days.map(d => (d[0].startsWith('2027-04') ? [d[0], 60, [], 900, 0, 'h'] : d)), '2027-04', { methodOf: () => 'gvi-x', fullBaseline: () => true });
  assert.equal(m.direction, 'worse'); assert.equal(m.words, 'More volatile'); assert.match(m.what, /News reports a day: 900 against 500/);
  const low = volatilityMark(days.map(d => [...d.slice(0, 5), 'l']), '2027-04', { methodOf: () => 'gvi-x', fullBaseline: () => true });
  assert.equal(low.why.code, 'coverage', 'little coverage: a rise in news alone can move a score');
});

// Jude's decision G (17 November 2026): Volatility records which method scored each day, so its marks can start. The
// store's global rows end [..., method, baseline days], each from the day's own file, null where it was not recorded.
test('rule: the volatility store says which method scored each day, and the mark reads it', () => {
  const days = Array.from({ length: 120 }, (_, i) => [new Date(Date.UTC(2027, 3, 30) - i * 864e5).toISOString().slice(0, 10), 50, [], 500, 0, 'h']).reverse();
  const store = (method, base = 90) => ({ global: days.map(d => [d[0], 20000, 96, 50, typeof method === 'function' ? method(d[0]) : method, base]) });
  const up = days.map(d => (d[0].startsWith('2027-04') ? [d[0], 60, [], 900, 0, 'h'] : d));
  assert.equal(volatilityMark(up, '2027-04', volatilityDays(store('gvi-1.2-q96'))).direction, 'worse', 'one method, full baselines: a mark');
  assert.equal(volatilityMark(up, '2027-04', volatilityDays(store(d => (d < '2027-02-01' ? 'gvi-1.2-q96' : 'gvi-1.3')))).why.code, 'methods');
  assert.equal(volatilityMark(up, '2027-04', volatilityDays(store(d => (d === '2027-03-03' ? null : 'gvi-1.2-q96')))).why.code, 'method-unknown', 'a day not recorded');
  assert.equal(volatilityMark(up, '2027-04', volatilityDays({ global: days.map(d => [d[0], 20000, 96, 50]) })).why.code, 'method-unknown', 'rows written before the method was recorded');
  assert.equal(volatilityMark(up, '2027-04', volatilityDays(store('gvi-1.2-q96', 89))).why.code, 'baseline');
  // The committed store: every row says its method or null, and the Volatility strand says no more than is true.
  const vol = json('volatility/data/index.json'), facts = volatilityDays(vol);
  for (const g of vol.global) assert.ok(facts.methodOf(g[0]) === null || /^gvi-/.test(facts.methodOf(g[0])), g[0]);
  const strand = marks.strands.find(s => s.id === 'volatility');
  if (vol.global.every(g => facts.methodOf(g[0]))) assert.doesNotMatch(strand.text, /must first say which method/, 'the store says it now');
  assert.match(strand.text, /April 2027/);
});

test('rule: the watch list\'s volatility rise needs the days and the coverage', () => {
  const day = k => new Date(Date.UTC(2026, 10, 14) - k * 864e5).toISOString().slice(0, 10);
  const days = Array.from({ length: 35 }, (_, k) => [day(34 - k), 34 - k < 7 ? 60 : 54, [], 100, 0, 'm']);
  const r = volatilityRise(days, '2026-11-14');
  assert.equal(r.change, 6); assert.equal(r.days, 7); assert.equal(r.beforeDays, 28);
  assert.equal(volatilityRise(days.map(d => [...d.slice(0, 5), 'l']), '2026-11-14'), null);
  assert.equal(volatilityRise(days.map(d => [d[0], 55, ...d.slice(2)]), '2026-11-14'), null);
});

test('series: an event over a span is shared over its days and counted in each month it touches', () => {
  const s = seriesFromEvents([{ d: '2026-01-20', de: '2026-02-10', best: 22, place: 'A' }, { d: '2026-02-05', best: 5, place: 'B' }], '2026-01', '2026-03');
  assert.deepEqual(s.deaths, [12, 15, 0]); assert.deepEqual(s.events, [1, 2, 0]); assert.deepEqual(s.shared, [12, 10, 0]);
  assert.deepEqual(s.top[1].slice(0, 5), ['2026-01-20', 10, 'A', '2026-02-10', 22]);
  const rows = rowsFromSeries(s, { src: 'x', prov: true });
  assert.deepEqual(rows.map(r => [r.m, r.d, r.e, r.sh]), [['2026-01', 12, 1, 12], ['2026-02', 15, 2, 10], ['2026-03', 0, 0, 0]]);
  assert.deepEqual(mergeRows([{ m: '2026-01', d: 1 }], [{ m: '2026-01', d: 2 }, { m: '2025-12', d: 3 }]).map(r => r.d), [3, 2], 'the newer release wins');
  // A country: GED's months, then the year's candidate months; with per-country figures in the file, a country absent
  // from it had no events (zeros), not missing months.
  const ged = { version: '26.1', countries: { 678: { from: '2025-11', deaths: [40, 40], events: [2, 2], shared: [0, 0], top: [null, null] } } };
  const rt = { year: 2026, months: ['2026-01', '2026-02'], countries: { 369: { series: { from: '2026-01', deaths: [5, 6], events: [1, 1], shared: [0, 0], top: [null, null] } } } };
  assert.deepEqual(countryRows(678, ged, rt).map(r => [r.m, r.d, r.src]), [['2025-11', 40, 'UCDP GED 26.1'], ['2025-12', 40, 'UCDP GED 26.1'], ['2026-01', 0, 'UCDP Candidate Events 2026'], ['2026-02', 0, 'UCDP Candidate Events 2026']]);
  assert.deepEqual(countryRows(369, null, { ...rt, countries: null }), [], 'a file without per-country figures gives none');
  const { iso } = gwTable(json('national/data/index.json'));
  const t = gwTable(json('national/data/index.json'));
  assert.equal(iso.get('YEM'), 678, 'Yemen, by UCDP\'s code'); assert.equal(iso.get('SSD'), 626); assert.equal(iso.has('PSE'), false);
  assert.equal(iso.get('VNM'), 816, 'Vietnam, by UCDP\'s code (National Analysis holds 815)'); assert.equal(t.gw.get(816), 'VNM'); assert.equal(t.gw.get(815), 'VNM');
  // Strips start where a code begins to mean the country alone: unification, or the split of the state it held.
  assert.equal(INDEPENDENCE[678][0], '1990-05'); assert.match(INDEPENDENCE[678][2], /North Yemen/);
  assert.equal(INDEPENDENCE[365][0], '1992-01'); assert.equal(INDEPENDENCE[345][0], '1992-05'); assert.equal(INDEPENDENCE[260][0], '1990-10');
  const yem = fightingMark(four([50, 50, 50, 90], [20, 20, 20, 20]).map((r, k) => ({ ...r, m: ['1990-04', '1990-05', '1990-06', '1990-07'][k] })), '1990-07', { from: INDEPENDENCE[678][0], fromWhy: INDEPENDENCE[678][2] });
  assert.equal(yem.why.code, 'start'); assert.match(yem.why.text, /united in May 1990/);
});

/* ------------------------------------------------------------------------------------------- the September examples */
test('September 2026, recomputed from War Focus\'s committed files', t => {
  // These are War Focus's figures through 30 September 2026. Its next monthly run reads UCDP's next candidate file,
  // which can revise September, so the figures below are checked only while War Focus holds that run's (each later run
  // has its marks recomputed by the data tests below).
  const through = json('battlefield/focus/data/index.json').gedThrough;
  if (through !== '2026-09-30') return t.skip(`War Focus now holds figures through ${through}`);
  const mk = id => fightingMark(focusRows(json(`battlefield/focus/data/wars/${id}.json`)), '2026-09');
  const y = mk('yemen');
  assert.equal(y.figures.deaths, 3170); assert.equal(y.direction, 'worse'); assert.equal(y.confidence, 'low', 'events over a span, and provisional');
  assert.deepEqual(y.steps.map(s => s.code), ['span', 'provisional']);
  const r = mk('russia-ukraine');
  assert.equal(r.direction, 'same'); assert.equal(r.words, 'No large change by this rule');
  assert.ok(r.steps.some(s => s.code === 'one-event'), 'one report holds most of September');
  assert.ok(r.notes.some(n => /proportions/.test(n)));
  assert.equal(mk('sudan-2023').why?.code, 'one-event');
});

/* ------------------------------------------------------------------------------------------- the committed data */
const marks = json('monthly/data/marks.json');
const units = marks.units;
test('data: every mark carries what changed, its period, its evidence and its confidence; every none its why', () => {
  assert.equal(marks.rule, RULE.id);
  assert.ok(units.length >= 15, `${units.length} units`);
  for (const u of units) {
    for (const m of [u.fighting, u.volatility].filter(Boolean)) assert.deepEqual(markProblems(m), [], `${u.id} ${m.strand}`);
    assert.ok(u.page?.url && u.page?.label, `${u.id} links to its page`);
    assert.ok(u.qid || u.wiki || u.kind === 'country', `${u.id} has a Master Index link`);
    assert.ok(['all organised violence', 'state-based fighting only'].includes(u.counts), `${u.id} says what it counts`);
  }
});

test('data: every mark is recomputed from its published months', () => {
  for (const u of units) {
    const m = u.fighting;
    if (!m.inputs) { assert.ok(['awaited', 'ended'].includes(m.why?.code), `${u.id}: only an awaited month or an ended war has no inputs`); continue; }
    const again = fightingMark(m.inputs.rows, m.month, { from: m.inputs.from, fromWhy: m.inputs.fromWhy, seam: m.inputs.seam, yearBefore: m.inputs.yearBefore });
    for (const k of ['direction', 'words', 'confidence', 'what']) assert.deepEqual(again[k], m[k], `${u.id}: ${k}`);
    assert.deepEqual(again.steps, m.steps, `${u.id}: steps`); assert.deepEqual(again.why, m.why, `${u.id}: why`);
    assert.ok(m.inputs.rows.length <= 4 && m.inputs.rows.every(r => r.m >= addMonths(m.month, -3) && r.m <= m.month), `${u.id}: the four months`);
  }
});

test('data: an ended War Focus war has its own reason, never "not yet published", and links to its own months', () => {
  const wf = new Map(json('battlefield/focus/data/index.json').wars.map(w => [w.id, w]));
  const ended = units.filter(u => u.kind === 'focus' && !wf.get(u.id.slice(6))?.ongoing);
  assert.ok(ended.length > 10, `${ended.length} ended wars`);
  for (const u of ended) {
    assert.equal(u.ongoing, false); assert.equal(u.primary, false, `${u.id} is not listed under All marks`);
    assert.equal(u.fighting.why?.code, 'ended', `${u.id}: ${u.fighting.why?.code}`);
    assert.ok(!/not yet published|candidate events/i.test(JSON.stringify([u.fighting.what, u.fighting.why, u.fighting.evidence])), `${u.id}: no word of UCDP's candidate events`);
    assert.ok(!u.page.url.includes(`m=${marks.month}`), `${u.id}: its link opens a month of the war`);
  }
  for (const u of units) assert.notEqual(u.fighting.why?.code === 'unpublished' && u.kind === 'focus' && !u.ongoing, true, `${u.id}`);
});

test('data: a war\'s partial first and last months are never marked; strips say which squares are provisional', () => {
  const dir = new URL('../monthly/data/strips/', import.meta.url);
  for (const w of json('battlefield/focus/data/index.json').wars) {
    const f = `focus-${w.id}.json`;
    if (!existsSync(new URL(f, dir))) continue;
    const s = json(`monthly/data/strips/${f}`), by = new Map(s.months.map(x => [x.m, x]));
    const partial = [];
    if (w.start && !w.start.endsWith('-01')) partial.push(w.start.slice(0, 7));
    if (!w.ongoing && w.end) { const [y, m] = w.end.split('-').map(Number); if (w.end !== new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)) partial.push(w.end.slice(0, 7)); }
    for (const pm of partial) for (let k = 0; k <= 3; k++) {
      const x = by.get(addMonths(pm, k));
      if (x) assert.equal(x.direction, 'none', `${w.id} ${x.m}: ${pm} is not a whole month`);
    }
    for (const x of s.months) {
      if (x.m.slice(0, 4) > '2025' && x.d != null) assert.equal(x.prov, true, `${w.id} ${x.m}: candidate events are provisional`);
      if (x.direction === 'same') assert.match(x.why || '', /^No large change by this rule because /, `${w.id} ${x.m}: the condition that failed`);
    }
  }
  const gaza = json('monthly/data/strips/focus-gaza-war.json').months.find(x => x.m === '2025-10');
  assert.equal(gaza.direction, 'none'); assert.match(gaza.why, /only to 10 October 2025/);
});

test('data: calendar events beside a mark name the country they were matched by; headlines from the war\'s own sources', () => {
  for (const u of units) {
    const isos = new Set((u.countries || []).map(c => c?.iso3));
    for (const c of u.fighting.context || []) {
      assert.ok(c.country?.iso3 && isos.has(c.country.iso3), `${u.id}: ${c.key} names ${c.country?.name}`);
      assert.ok(c.country.qid, `${u.id}: ${c.country.name} carries its Master Index link`);
    }
  }
  const ru = units.find(u => u.id === 'focus:russia-ukraine');
  assert.deepEqual(ru.countries.map(c => c.iso3).sort(), ['RUS', 'UKR'], 'a war with no theatre takes its countries from its sides');
  // A War Focus war's largest event is named only from its own Realtime Battlefield war's sources: checked against the
  // release the marks were built from (a later release, until the marks are rebuilt, may list other sources).
  const rt = json('battlefield/data/realtime.json');
  const PAIRS = { 'russia-ukraine': 'russia-ukraine', yemen: 'yemen', sudan: 'sudan-2023' };
  if (marks.sources.realtime.version === rt.version) for (const u of units.filter(x => x.kind === 'focus')) {
    const own = rt.wars.find(w => PAIRS[w.id] === u.id.slice(6));
    const heads = new Set((own?.monthly || []).flatMap(x => (x.sources || []).map(s => s.headline)));
    for (const r of u.fighting.inputs?.rows || []) if (r.top?.headline) assert.ok(heads.has(r.top.headline), `${u.id} ${r.m}: "${r.top.headline}" is from its own war`);
  }
  const w = json('monthly/data/watch.json');
  for (const it of [...w.votes, ...w.summits]) assert.notEqual(it.country.name, 'Soviet Union', it.title);
});

// What must hold between the marks and Realtime Battlefield's file, whichever refresh ran last: battlefield-refresh
// rebuilds the marks in the commit that takes in a release, and when that rebuild fails it is thrown away, so the marks
// can be on the release before (never further behind); and the marks name the release they use.
const releaseProblems = (mk, rt) => {
  const p = [], src = mk.sources?.realtime || {};
  if (src.latest !== mk.month) p.push(`the marks are for ${mk.month} but name a release to ${src.latest}`);
  if (![rt.latest, addMonths(rt.latest, -1)].includes(mk.month)) p.push(`marks for ${mk.month} (${src.version}); Realtime Battlefield holds ${rt.latest} (${rt.version}): more than one release behind`);
  if (src.version === rt.version && mk.month !== rt.latest) p.push(`release ${rt.version} is for ${rt.latest}, not ${mk.month}`);
  if (!mk.strands?.find(s => s.id === 'realtime')?.text.includes(`release ${src.version}`)) p.push('the bulletin does not name the release its marks use');
  return p;
};
test('data: the marks use Realtime Battlefield\'s release or the one before it, and say which; the summary is in step', () => {
  const rt = json('battlefield/data/realtime.json');
  assert.deepEqual(releaseProblems(marks, rt), []);
  // Realtime Battlefield's next release, before the marks are rebuilt (the case that once failed every deploy), passes;
  // a second one does not.
  const next = { ...rt, latest: addMonths(marks.month, 1), version: '26.01.26.10' };
  assert.deepEqual(releaseProblems(marks, next), []);
  assert.equal(releaseProblems(marks, { ...rt, latest: addMonths(marks.month, 2), version: '26.01.26.11' }).length, 1);
  // The page shows the release beside the marks.
  assert.match(read('q/monthly.html'), /<span>UCDP candidate events \$\{esc\(s\.realtime\.version\)\}, taken in /);
  assert.deepEqual(checkHeads(['monthly/data/marks.json']), []);
  const fresh = read('.github/scripts/freshness.mjs');
  assert.match(fresh, /file: 'monthly\/data\/marks\.json', name: 'Month by Month', workflow: 'calendar-refresh\.yml', every: 24/);
  assert.match(fresh, /file: 'monthly\/data\/marks\.head\.json'[^\n]*when: j => j\.released/);
});

test('workflows: each refresh whose files the marks read rebuilds them in its own commit, and never commits marks failing their tests', () => {
  const stepsOf = f => parseYaml(read(`.github/workflows/${f}`)).jobs.refresh.steps;
  for (const f of ['calendar-refresh.yml', 'battlefield-refresh.yml', 'warfocus-refresh.yml']) {
    const steps = stepsOf(f), at = steps.findIndex(s => s.uses === './.github/actions/commit-data'), before = steps.slice(0, at);
    assert.ok(at > 0 && String(steps[at].with.paths).split(/\s+/).includes('monthly/data'), `${f} commits monthly/data with its own files`);
    const build = before.findIndex(s => /node monthly\/scripts\/build\.mjs/.test(s.run || ''));
    assert.ok(build >= 0, `${f} rebuilds Month by Month before it commits`);
    assert.ok(before.slice(build).some(s => s.id === 'monthlytest' && /node --test tests\/monthly\.test\.mjs/.test(s.run) && s.env?.PRP_PAGES === '0'), `${f} tests the new marks`);
    const drop = before.findIndex(s => /git checkout -- monthly\/data/.test(s.run || ''));
    assert.ok(drop > build, `${f} throws away a rebuild that failed`);
    // Realtime Battlefield's and War Focus's files are read by the marks' tests: the marks kept are tested with them.
    if (f !== 'calendar-refresh.yml') assert.ok(before.slice(drop + 1).some(s => /node --test tests\/monthly\.test\.mjs/.test(s.run || '') && !s['continue-on-error']), `${f} tests the marks kept with its new files before committing`);
  }
  // battlefield-refresh rebuilds only when it took in a new release (most weeks it does not), and says so when it could not.
  const bf = stepsOf('battlefield-refresh.yml');
  assert.match(bf.find(s => s.id === 'monthly').if, /steps\.release\.outputs\.new == 'yes'/);
  assert.match(bf.find(s => s.id === 'release').run, /git diff --quiet -- battlefield\/data\/realtime\.json/);
  assert.ok(bf.some(s => /exit 1/.test(s.run || '') && /monthly/.test(s.if || '')), 'a red run when the marks were not rebuilt');
});

test('data: every bulletin line matches a mark; wars and countries apart, each war once', () => {
  const b = json(`monthly/data/bulletins/${marks.month}.json`);
  const by = new Map(units.map(u => [u.id, u]));
  for (const l of [...b.wars, ...b.countries]) {
    const u = by.get(l.unit);
    assert.ok(u, `${l.unit} is a unit`);
    if (b.issued === marks.generated || !b.provisional) { assert.equal(l.direction, b.marks[l.unit].direction); }
    assert.ok(['worse', 'better'].includes(l.direction) && l.what && Number.isFinite(l.change), `${l.unit}: a moved mark with its figures`);
  }
  assert.ok(b.wars.every(l => l.kind !== 'country') && b.countries.every(l => l.kind === 'country'));
  assert.equal(new Set(b.wars.map(l => l.unit)).size, b.wars.length);
  assert.ok(!b.wars.some(l => by.get(l.unit)?.primary === false), 'a war both groupings cover is listed by its primary unit only');
  // A final bulletin is a record of what VM said then, so today's marks can differ from it (UCDP revises its figures).
  // Each of today's marks on the Dashboard is a line of the issue, or the page lists it beside the issue as differing.
  const since = loadMark().sinceIssue(b, marks);
  for (const t of marks.bulletin.top) assert.ok(b.wars.some(l => l.unit === t.unit) || since.some(d => d.unit === t.unit), `${t.unit} on the Dashboard is a bulletin line, or shown as revised since it`);
  if (b.issued === marks.generated) assert.deepEqual(plain(since), [], 'an issue written with these marks differs from none');
  const kept = readdirSync(new URL('../monthly/data/bulletins/', import.meta.url)).filter(f => /^\d{4}-\d{2}\.json$/.test(f));
  assert.deepEqual(json('monthly/data/bulletins/index.json').months.map(x => x.month + '.json').sort(), kept.sort());
});

test('a revision after a final issue: the issue stands, and today\'s mark is listed beside it', () => {
  const b = json('monthly/data/bulletins/2026-09.json');
  assert.equal(b.provisional, false);
  // September 2026, Pakistan and Afghanistan (Realtime Battlefield): issued as "No large change" with 769 deaths against
  // 437, 631 and 549. Were UCDP to revise September to 900, the rule gives "More deaths recorded", while the issue,
  // never rewritten, lists Yemen only.
  const u = structuredClone(units.find(x => x.id === 'war:pakistan-afghanistan'));
  if (u.fighting.month !== '2026-09' || b.marks[u.id]?.deaths !== 769) return; // the committed marks have moved on
  const rows = u.fighting.inputs.rows.map(r => (r.m === '2026-09' ? { ...r, d: 900 } : r));
  u.fighting = { ...fightingMark(rows, '2026-09', u.fighting.inputs), evidence: u.fighting.evidence };
  assert.equal(u.fighting.direction, 'worse');
  const revised = { ...marks, month: '2026-09', units: marks.units.map(x => (x.id === u.id ? u : x)) };
  const top = [{ unit: u.id }, ...marks.bulletin.top];
  assert.ok(!b.wars.some(l => l.unit === u.id), 'not a line of the issue');
  const since = loadMark().sinceIssue(b, revised);
  assert.deepEqual(plain(since.map(d => [d.unit, d.issued.direction, d.issued.deaths, d.now.direction, d.now.deaths])), [[u.id, 'same', 769, 'worse', 900]]);
  for (const t of top) assert.ok(b.wars.some(l => l.unit === t.unit) || since.some(d => d.unit === t.unit), t.unit);
  // Deaths revised without a new direction are listed too (Yemen 3,170 to 3,200), and a mark the same as issued is not.
  const y = structuredClone(revised.units.find(x => x.id === 'focus:yemen'));
  y.fighting.figures.deaths = 3200;
  const both = loadMark().sinceIssue(b, { ...revised, units: revised.units.map(x => (x.id === y.id ? y : x)) });
  assert.deepEqual(plain(both.map(d => d.unit).sort()), [u.id, 'focus:yemen'].sort());
  assert.deepEqual(plain(loadMark().sinceIssue(b, { ...marks, month: '2026-10' })), [], 'marks on another month compare with nothing');
});

test('links in a mark: only addresses on the site and http(s) links; any other address is drawn as text', () => {
  for (const embedded of [false, true]) {
    const K = loadMark({ embedded });
    assert.equal(K.go({ url: 'javascript:alert(document.domain)' }), null, 'javascript:');
    assert.equal(K.go({ suite: 'rt', module: 'battlefield', url: ' JavaScript:alert(1)' }), null, 'in any case, with a space before');
    assert.equal(K.go({ url: 'data:text/html,<script>alert(1)</script>' }), null, 'data:');
    assert.equal(K.go({ url: 'vbscript:msgbox(1)' }), null);
    assert.ok(K.go({ suite: 'rt', module: 'battlefield', url: 'q/battlefield.html?view=live&war=yemen' }).href.startsWith('https://jdpi.pages.dev/'), 'a page on the site');
    assert.ok(K.go({ url: 'https://ucdp.uu.se/downloads/' }), 'an https link');
  }
  const K = loadMark();
  assert.equal(K.go({ url: 'q/battlefield.html?view=live' }).href, 'https://jdpi.pages.dev/q/battlefield.html?view=live');
  const m = { ...units.find(x => x.id === 'focus:yemen').fighting };
  m.evidence = [{ ...m.evidence[0], page: { url: 'javascript:alert(document.domain)', label: 'A page' } }];
  const html = K.full(m);
  assert.ok(!/javascript:/i.test(html), 'no javascript: address in the mark');
  assert.match(html, /\. A page<br>/, 'the label drawn as text');
});

test('the builder writes each file only when its content changed, the watch list too', () => {
  const src = read('monthly/scripts/build.mjs');
  assert.match(src, /writeIfChanged\('monthly\/data\/watch\.json', watch\)/);
  assert.ok(!/\bwrite\('monthly\/data\/watch\.json'/.test(src));
});

test('data: watch items are dated inside the window, each with its source; never a forecast', () => {
  const w = json('monthly/data/watch.json');
  assert.ok(w.from && w.to && w.to > w.from);
  for (const it of [...w.votes, ...w.summits]) {
    assert.ok(it.date >= w.from && it.date <= w.to, `${it.title} on ${it.date}`);
    assert.ok(it.source && it.key && it.country?.name, `${it.title} has its source, key and country`);
  }
  assert.ok(w.votes.every(x => ['election', 'referendum'].includes(x.type)) && w.summits.every(x => x.type === 'summit'));
  for (const v of w.volatility) assert.ok(v.change >= 4 && v.country?.iso3 && v.source === 'Geopolitical Volatility');
  assert.match(w.fixed, /Ceasefire and mandate end dates: VM's calendars do not hold them/);
});

test('data: the strips: consecutive months, a mark in every square, War Focus from its first recorded month', () => {
  const dir = new URL('../monthly/data/strips/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= units.filter(u => u.kind !== 'war').length);
  for (const f of files) {
    const s = json(`monthly/data/strips/${f}`);
    for (let i = 1; i < s.months.length; i++) assert.equal(s.months[i].m, addMonths(s.months[i - 1].m, 1), `${f}: consecutive`);
    for (const x of s.months) {
      assert.ok(['worse', 'better', 'same', 'none'].includes(x.direction), `${f} ${x.m}`);
      assert.ok(x.direction === 'none' ? x.why : x.confidence, `${f} ${x.m}: a why or a confidence`);
    }
  }
  const bosnia = json('monthly/data/strips/focus-bosnian-war.json');
  assert.equal(bosnia.months.length, 0, 'every month an estimate: no squares, and the strip says why');
  assert.match(bosnia.why, /estimates/);
});

// VM's own words in a mark: a headline UCDP records ("…", with its source "(…, as UCDP records it)") is the source's
// words, not VM's, so it is taken out before the words are checked (UCDP itself cites Crisis Group's reports).
const ownWords = t => String(t || '').replace(/“[^”]*”/g, '“”').replace(/\([^()]*, as UCDP records it\)/g, '');
test('words: the reader never sees better or worse, nor a forecast; CrisisWatch only in the one credit line', () => {
  const texts = [];
  for (const u of units) for (const m of [u.fighting, u.volatility].filter(Boolean)) texts.push(m.words, m.what, m.why?.text || '', ...m.steps.map(s => s.text), ...(m.notes || []));
  const all = texts.map(ownWords).join('\n');
  assert.ok(!/\b(better|worse)\b/i.test(all), 'no better or worse in what a mark says');
  assert.ok(!/\b(will (rise|fall|escalate|worsen)|likely to|expected to|predicts?|forecasts? that)\b/i.test(all), 'no forecast');
  for (const u of units) assert.ok(Object.values(WORDS).includes(u.fighting.words));
  const page = read('q/monthly.html');
  assert.equal((page.match(/CrisisWatch/g) || []).length, 1, 'the credit line, once (its address is in lower case)');
  assert.match(page, /The idea of a monthly direction mark follows conflict trackers such as Crisis Group's <a href="https:\/\/www\.crisisgroup\.org\/crisiswatch"[^>]*>CrisisWatch<\/a>\./);
  assert.ok(!/crisis ?watch/i.test(all), 'no mark names CrisisWatch in its own words');
  const w = json('monthly/data/watch.json');
  assert.ok(!/crisis ?watch/i.test([w.fixed, ...[...w.votes, ...w.summits, ...w.volatility].map(x => [x.group, x.kind, x.source].join(' '))].join(' ')), 'nor the watch list');
  assert.ok(!/crisis ?watch/i.test(read('design/prp-mark.js')), 'nor the renderer');
  // A source UCDP cites by Crisis Group's report name passes: it is UCDP's citation, shown as such.
  assert.equal(ownWords('“Crisis Watch: Haiti February 2026” (International Crisis Group, as UCDP records it)').trim(), '“”');
  // The renderer shows the words, never the values: the page tests read the text a reader sees.
});

/* ------------------------------------------------------------------------------------------- the pages */
const visible = page => page.evaluate(() => document.body.innerText);
async function noSideways(page) { return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }

test('page: Month by Month, its marks with their explanations, in light and dark and at phone width', pageTest, async () => {
  const browser = await launch();
  try {
    for (const [width, scheme] of [[1400, 'light'], [1400, 'dark'], [390, 'light']]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${BASE}/q/monthly.html#tab=marks`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#tab-marks section.prp-mark', { timeout: 20000 });
      const blocks = await page.$$eval('#tab-marks section.prp-mark', s => s.map(x => ({ dts: [...x.querySelectorAll('dt')].map(d => d.textContent), label: x.getAttribute('aria-label'), how: !!x.querySelector('.prp-mark-how a') })));
      assert.ok(blocks.length >= 15, `${width} ${scheme}: ${blocks.length} marks`);
      for (const b of blocks) {
        for (const d of ['What changed', 'Period', 'Evidence']) assert.ok(b.dts.includes(d), `${b.label}: ${d}`);
        assert.ok(b.dts.includes('Confidence') || b.dts.includes('Why no mark'), `${b.label}: confidence or why`);
        assert.ok(b.how && /^[A-Z][a-z]+ \d{4}: /.test(b.label), `${b.label}: its sentence and How this is worked out`);
      }
      // Every name carries its Master Index link: a Wikidata ID or its Wikipedia article.
      const names = await page.$$eval('#tab-marks .unit h4', hs => hs.map(h => !!h.querySelector('[data-qid], a[href*="wikipedia.org/wiki/"]')));
      assert.ok(names.length && names.every(Boolean), 'every war and country named with its Master Index link');
      // War Focus's ended wars are not listed with a current month (they once read "UCDP has not yet published").
      const all = await page.locator('#tab-marks').innerText();
      assert.ok(!/This war ended/.test(all), `${width} ${scheme}: no ended war under All marks`);
      assert.equal(await page.locator('#tab-marks .unit[id^="u-focus-"]').count(), units.filter(u => u.kind === 'focus' && u.primary).length);
      const text = await visible(page);
      assert.ok(!/\b(better|worse)\b/i.test(text), `${width} ${scheme}: no better or worse on the page`);
      assert.ok(await noSideways(page), `${width} ${scheme}: no sideways scroll`);
      for (const tab of ['changed', 'watch', 'how']) {
        await page.click(`#tab-btn-${tab}`); await page.waitForTimeout(200);
        assert.ok(await noSideways(page), `${width} ${tab}: no sideways scroll`);
      }
      const how = await page.locator('#tab-how').innerText();
      assert.match(how, /not an analyst's judgement, and nothing here is a forecast/);
      assert.equal((how.match(/CrisisWatch/g) || []).length, 1);
      await page.click('#tab-btn-watch');
      const watch = await page.locator('#tab-watch').innerText();
      assert.match(watch, /Votes due/i); assert.match(watch, /Summits and meetings due/i); assert.match(watch, /Volatility up this week/i); assert.match(watch, /not predictions/);
      assert.ok(!/\b(risks?|openings?)\b/i.test(watch.replace(/\bmark\b/g, '')), 'the list is headed by type, never risks or openings');
      await page.click('#tab-btn-changed');
      assert.match(await page.locator('#tab-changed').innerText(), /What changed in [A-Z][a-z]+ \d{4}/);
      assert.deepEqual(errors, [], `${width} ${scheme}: console errors`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('page: the latest month\'s final bulletin is shown as issued, with a revised mark beside it, chosen or not', pageTest, async t => {
  const b = json(`monthly/data/bulletins/${marks.month}.json`);
  if (b.provisional || !b.wars.length) return t.skip('the latest bulletin is provisional, or lists no war');
  const l = b.wars[0], fmtN = n => n.toLocaleString('en-GB');
  // Today's marks as they would be after UCDP revised the month: the war's deaths 30 higher.
  const revised = structuredClone(marks);
  const u = revised.units.find(x => x.id === l.unit);
  u.fighting.figures.deaths = l.deaths + 30;
  u.fighting.what = u.fighting.what.replace(fmtN(l.deaths), fmtN(l.deaths + 30));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/monthly/data/marks.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(revised) }));
    for (const at of ['#tab=changed', `#tab=changed&month=${marks.month}`]) {
      await page.goto(`${BASE}/q/monthly.html${at}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => /As issued on/.test(document.querySelector('#tab-changed')?.innerText || ''), null, { timeout: 20000 });
      const text = await page.locator('#tab-changed').innerText();
      assert.ok(text.includes(l.what), `${at}: the issue's own words (${fmtN(l.deaths)} deaths)`);
      assert.ok(!text.includes(u.fighting.what), `${at}: not today's revised words in the issue`);
      assert.match(text, /Today's marks against this issue/i);
      assert.ok(text.includes(`issued as ${l.words}, ${l.confidence} confidence (${fmtN(l.deaths)} deaths); today ${u.fighting.words}, ${u.fighting.confidence} confidence (${fmtN(l.deaths + 30)} deaths)`), `${at}: today's mark beside the issue`);
      assert.equal(await page.locator('#pick').inputValue(), marks.month, `${at}: the month chosen`);
    }
    // Without a revision, the issue says none differ.
    await page.unroute('**/monthly/data/marks.json');
    await page.goto(`${BASE}/q/monthly.html#tab=changed`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => /As issued on/.test(document.querySelector('#tab-changed')?.innerText || ''), null, { timeout: 20000 });
    assert.match(await page.locator('#tab-changed').innerText(), /None differ: today's marks for [A-Z][a-z]+ \d{4} are those of this issue\./);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Month by Month in the shell has no Documentary button (a Realtime page)', pageTest, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`${BASE}/#/rt/monthly`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => { const f = document.querySelector('#frames iframe.active'); try { return f && f.src.includes('monthly') && f.contentDocument?.querySelector('section.prp-mark'); } catch { return false; } }, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.doc-fab').isVisible().catch(() => false), false);
  } finally { await browser.close(); }
});

test('page: the marks where they appear: Realtime Battlefield, War Focus, National Analysis, the Calendar and the Dashboard', pageTest, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Realtime Battlefield: a compact mark on each war in the list, the whole mark in the war's briefing.
    await page.goto(`${BASE}/q/battlefield.html?view=live`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.warrow .prp-mark.sm', { timeout: 20000 });
    assert.ok(await page.locator('.warrow .prp-mark.sm').count() >= 5);
    // The compact mark names its figures and says whose calculation it is, in text a screen reader and a phone show.
    for (const t of await page.locator('.warrow .prp-mark.sm').allInnerTexts()) {
      assert.match(t, /VM's calculation/, t);
      if (!/No mark/.test(t)) assert.match(t, /[A-Z][a-z]+: [\d,]+ deaths against a median of [\d,]+, [A-Z][a-z]+–[A-Z][a-z]+ \d{4}/, t);
    }
    await page.goto(`${BASE}/q/battlefield.html?view=live&war=yemen`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.detail section.prp-mark dt', { timeout: 20000 });
    assert.match(await page.locator('.detail section.prp-mark').innerText(), /WHAT CHANGED|What changed/i);
    // War Focus: the mark in the panel on the month marked, and the year strip above Deaths by month.
    await page.goto(`${BASE}/battlefield/focus/index.html#war=yemen&m=${marks.month}&v=months`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#months-strip .prp-strip .prp-strip-sq', { timeout: 30000 });
    assert.ok(await page.locator('#months-strip .prp-strip-row .prp-strip-sq').count() >= 24);
    await page.click('#months-strip [data-strip-table]');
    assert.ok(await page.locator('#months-strip .prp-strip-table tbody tr').count() >= 12, 'the table view lists the same months');
    await page.waitForSelector('#panel section.prp-mark', { timeout: 20000 });
    // National Analysis: the profile's Month by Month box says something, never "Loading" for good.
    await page.goto(`${BASE}/q/national.html#country=YEM`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.querySelector('#monthly'); return b && !/Loading/.test(b.textContent); }, null, { timeout: 30000 });
    const natBox = await page.locator('#monthly').innerText();
    assert.ok(!/monthly\/data|\.json/.test(natBox), 'no file path in the reader\'s text');
    if (!units.some(u => u.id === 'country:YEM')) assert.ok(await page.locator('#monthly .mwar .prp-mark.sm').count() >= 1, 'without a country mark, the war marked in Yemen');
    // The Realtime Calendar links to the watch list.
    await page.goto(`${BASE}/q/calendar.html?period=contemporary`, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('#watch-a').getAttribute('href'), /monthly/);
    // The Dashboard's fifth card.
    await page.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#today .today-card[data-group="monthly"][data-state="ready"]', { timeout: 30000 });
    assert.equal(await page.locator('#today .today-card').count(), 5);
    assert.match(await page.locator('#today .today-card[data-group="monthly"]').innerText(), /What changed in [A-Z][a-z]+/);
    // The first four cards keep their one row on a desktop screen; the fifth sits across the row below.
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(300);
      const boxes = await page.$$eval('#today .today-card', cs => cs.map(c => { const r = c.getBoundingClientRect(); return { y: Math.round(r.top), x: Math.round(r.left), w: Math.round(r.width) }; }));
      assert.equal(new Set(boxes.slice(0, 4).map(b => b.y)).size, 1, `${width}: the four cards share one row (${JSON.stringify(boxes)})`);
      assert.ok(boxes[4].y > boxes[0].y && boxes[4].w > boxes[0].w * 3, `${width}: the fifth card across the row below`);
    }
    await page.setViewportSize({ width: 1400, height: 900 });
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${BASE}/q/battlefield.html?view=live&war=yemen`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.detail section.prp-mark', { timeout: 20000 });
    assert.ok(await noSideways(page), 'Realtime Battlefield at phone width');
  } finally { await browser.close(); }
});
