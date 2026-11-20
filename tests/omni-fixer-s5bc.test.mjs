// The fixes made after the S5b/S5c review (V1–V13, D1–D8): each tested where a test can show it.
//   node --test tests/omni-fixer-s5bc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../design/prp-map.js';
import * as L from '../omni/lib/layers.js';
import * as N from '../omni/lib/layers-now.js';
import { cardLayer, cardOf } from '../design/vm-click.js';
import { UNITS, unitOf, BARRED } from '../omni/scripts/build-wb.mjs';
import { electionRows, coupRow, labelYear, ahead } from '../omni/scripts/build-political.mjs';
import { rowOf } from '../omni/scripts/build-calendar-layer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const M = globalThis.PRPMap;
const DOC = json('omni/data/layers.json');
const IEA = ['EG.USE.PCAP.KG.OE', 'EG.FEC.RNEW.ZS', 'EN.GHG.CO2.PC.CE.AR5'];

test('D1: the IEA’s three series are absent lines citing its own terms, with no layer and no data file', () => {
  for (const code of IEA) {
    assert.equal(BARRED[code]?.originator, true, code);
    const a = DOC.absent.find(x => x.wb === code);
    assert.ok(a, `${code} has an absent line`);
    assert.equal(a.termsUrl, 'https://www.iea.org/terms');
    assert.match(a.why, /International Energy Agency/);
    assert.ok(!DOC.layers.some(l => l.wb === code), `${code} has no layer`);
    assert.ok(!existsSync(join(ROOT, `omni/data/layers/wb/${code}.json`)), `${code} has no data file`);
  }
  const src = json('integration/sources.json');
  const wb = (Array.isArray(src) ? src : src.sources || []).find(s => s.id === 'world-bank-wdi');
  assert.ok(wb?.originators, 'world-bank-wdi records its originators');
});

test('V6: every World Bank layer has a real unit, never a placeholder, agreeing with its measure', () => {
  assert.equal(unitOf('SP.POP.TOTL', 'Population, total'), 'people');
  assert.equal(unitOf('X', 'GDP per capita, PPP (current international $)'), 'current international $');
  assert.equal(unitOf('X', 'Control of Corruption: Estimate'), null);
  for (const l of DOC.layers.filter(l => l.wb)) {
    const u = l.style?.unit;
    assert.ok(u && !/^unit$/i.test(u), `${l.id} has a unit`);
    assert.ok(UNITS[l.wb] || String(l.measure).includes(u), `${l.id}: its measure "${l.measure}" names its unit "${u}"`);
  }
});

test('V1, V2: an election far from its own name’s year is doubtful; one still to come is expected', () => {
  const rec = (q, label, date) => ({ type: 'election', q, label, facts: { date }, rel: { Country: [['Q214']] } });
  const { rows, doubtful } = electionRows([
    rec('Q1', '2026 Slovak referendum', '0202-07-04'),
    rec('Q2', '2027 Slovak parliamentary election', '2027-09'),
    rec('Q3', '2020 Slovak parliamentary election', '2020-02-29'),
  ], { today: '2026-11-20' });
  assert.deepEqual(doubtful.map(d => d.q), ['Q1']);
  assert.deepEqual(rows.map(r => [r.q, !!r.expected]), [['Q3', false], ['Q2', true]]);
  assert.equal(labelYear('October 2013 leadership election'), 2013);
  assert.equal(ahead('2026', '2026-11-20'), false);
  assert.equal(ahead('2026-12', '2026-11-20'), true);
  const file = json('omni/data/layers/elections/elections.json');
  assert.ok(file.asOf && Array.isArray(file.doubtful));
  assert.ok(file.rows.every(r => !r.expected || String(r.date.from) > file.asOf.slice(0, String(r.date.from).length) || String(r.date.from).length < 10));
  const e = DOC.layers.find(l => l.id === 'elections');
  assert.equal(e.statusBy?.[0]?.status, 'expected');
});

test('D6, V12: a coup is never labelled by its bare Q-id', () => {
  const r = coupRow({ id: 'Q9', claims: { P585: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+1999-10-12T00:00:00Z', precision: 11, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } } }], P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q843' } } } }] } }, q => q);
  assert.match(r.label, /no English name/); assert.equal(r.unnamed, true);
  const file = json('omni/data/layers/coups/coups.json');
  assert.ok(file.rows.every(x => !/^Q\d+$/.test(x.label)), 'no coup row is labelled by a bare Q-id');
});

test('V5: an election’s card opens the Omni-Map with the elections layer; a coup’s with the coups layer', () => {
  assert.deepEqual(cardLayer({ type: 'election', label: '2026 Bulgarian presidential election' }), { l: 'elections' });
  assert.deepEqual(cardLayer({ type: 'event', label: '1973 Chilean coup d’état' }), { l: 'coups' });
  assert.equal(cardLayer({ type: 'person', label: 'Ada Lovelace' }), null);
  const q = 'Q110159977', shard = json(`lake/data/e/${+q.slice(1) % 512}.json`);
  const rec = shard[q] || Object.values(shard).find(r => r.q === q);
  assert.ok(rec, `the lake holds ${q}`);
  const life = cardOf(rec, { today: '2026-11-20' }).offers.find(o => o.id === 'life');
  assert.match(life.at, /[#&]l=elections(&|$)/);
});

test('V8: UCDP cells keep each month’s counts, in words, the latest last', () => {
  const doc = { year: 2025, deg: 0.5, cols: 720, wars: [], cells: [[100, 3, 1, 2, 5, 4, 6, []], [100, 7, 1, 1, 1, 1, 1, []], [200, 1, 2, 1, 1, 1, 1, []]] };
  const { rows } = N.cellRows(doc);
  const a = rows.find(r => r.cell === 100);
  assert.deepEqual(Object.keys(a.byMonth).map(Number), [3, 7]);
  assert.equal(a.byMonth[3].best, 5);
  assert.equal(a.whenText, '2025, in 2 months from March to July');
  assert.equal(rows.at(-1).cell, 100, 'the latest month last');
  assert.equal(N.deathWords(1), '1 death');
  assert.equal(N.monthsText([2], 2026), 'February 2026');
});

test('V12: a layer of days within a year gives its days, not "2026 to 2026"', () => {
  assert.equal(M.spanWords({ time: { from: 2026, to: 2026, first: '2026-09-26', last: '2026-11-19' } }), '26 September to 19 November 2026');
  assert.equal(M.spanWords({ time: { from: 1961, to: 2024 } }), '1961 to 2024');
});

test('V3: ticking off "Show anyway" names every point layer switched off', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const cat = L.catalogue({ layers: ids.map(id => ({ id, title: id.toUpperCase(), role: 'point', geometry: 'point' })) });
  const set = { ...L.emptySet(), anyway: true, points: ids.slice() };
  const r = L.setAnyway(set, false, cat);
  assert.equal(r.dropped.length, 2);
  assert.match(r.note, /^A and B switched off/);
});

test('V9, D3: an event of unread class names its own source, never "VM’s calendars, source not yet read"', () => {
  const r = rowOf({ title: 'Summit', type: 'summit', date: '2026-03-01', source: 'https://example.org/x', country: 'France', iso3: 'FRA' }, { isoOf: () => null, today: '2026-11-20' });
  assert.equal(r.class, 'unread');
  assert.match(r.src.date.line, /^Its source: https:\/\/example\.org\/x; .*dated the 1st/);
  const r2 = rowOf({ title: 'Vote', type: 'election', date: '2026-03-14', source: '', country: 'France', iso3: 'FRA' }, { isoOf: () => null, today: '2026-11-20' });
  assert.doesNotMatch(r2.src.date.line, /dated the 1st/);
});

// V4: the battles file (layers/battles.json) is fetched only for a view that draws the battles.
import { pageTest, launch } from './tools/pages.mjs';
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni-fixer-s5bc.test.mjs)' };
test('page V4: a view whose recipe names no battles layer never fetches the battles; l=battles does', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const asked = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/omni\/data\/layers\/battles\.json/.test(r.url())) asked.push(r.url()); });
  const ready = () => page.waitForFunction(() => window.omniState?.ready, null, { timeout: 60000 });
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1950..2000&at=1990&show=frame&step=y&base=plain&fill=borders`);
  await ready();
  await page.waitForTimeout(1500);
  assert.deepEqual(asked, [], 'no battles fetched without l=battles');
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1490..1500&at=1495&show=frame&step=y&base=plain&fill=borders&l=battles`);
  await page.reload();
  await ready();
  await page.waitForTimeout(1500);
  assert.ok(asked.length >= 1, 'l=battles fetches the battles');
  assert.deepEqual(errors, []);
  await page.close();
});
