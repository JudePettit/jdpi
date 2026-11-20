// Digital Science · Omni-Map, stage S5c of PRP-SCHOLAR-USP-DESIGN.md (4.2): the layers of now. Layer 6, the World
// Bank's indicators, one layer each, each built only when its own metadata reads CC BY-4.0 (SIPRI's military spending
// left out, with its terms); layer 7, the calendars' events at their countries by ISO3, each with its date's precision
// and its source's class (no Archigos, no event only in the Political Atlas); layer 8, UCDP's events in 0.5° cells by
// month and type of violence, 1989 to 2025, with 2026 candidate by country, and its war filter through the registry;
// layer 9, the Volatility score by day, its days kept. Also VM's card (design/vm-click.js cardOf), prp:focus's
// countries, the clutter rule at four layers, and no barred source anywhere under omni/. The pages are tested in
// tests/omni-now-page.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import '../design/prp-map.js';
import * as L from '../omni/lib/layers.js';
import * as N from '../omni/lib/layers-now.js';
import { readRecipe, writeRecipe } from '../design/vm-recipe.js';
import { cardOf } from '../design/vm-click.js';
import { breaksOf, sourceOf, idOf, NATIONAL, BARRED } from '../omni/scripts/build-wb.mjs';
import { yearDoc, BREAKS } from '../omni/scripts/build-gvi.mjs';
import { keepDays } from '../volatility/scripts/ingest.mjs';
import { cellYears, candidateYear, csvRows, unzipFirst, cellOf, cellCentre, SHA256 } from '../omni/scripts/build-ucdp-events.mjs';
import { classOf, leftOut, rowOf } from '../omni/scripts/build-calendar-layer.mjs';
import { isoResolver, neCountries, ALIASES } from '../omni/scripts/country-names.mjs';
import { warOf } from '../omni/scripts/build-wars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = p => readFileSync(join(ROOT, p));
const read = p => JSON.parse(raw(p).toString('utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const LIMIT_GZ = 1.5 * 1024 * 1024;
const DOC = read('omni/data/layers.json'), CAT = L.catalogue(DOC), SOURCES = read('integration/sources.json').sources;
const byId = id => DOC.layers.find(e => e.id === id);
const M = globalThis.PRPMap;
const measured = f => { const b = raw(f.file); assert.equal(sha(b), f.sha256, `${f.file}: sha256`); assert.equal(b.length, f.bytes, `${f.file}: bytes`); assert.equal(gzipSync(b, { level: 9 }).length, f.gzip, `${f.file}: gzip`); assert.ok(f.gzip <= LIMIT_GZ, `${f.file}: within 1.5 MB gzipped`); };

/* ---------------------------------------------------------------- layer 6: the World Bank's indicators */
test('layer 6: one layer for each of National Analysis\'s series, each under CC BY-4.0 by its own metadata, wb:<code> in the recipe', () => {
  const wb = DOC.layers.filter(e => e.group === 'wb');
  const built = new Set(wb.map(e => e.wb)), absent = DOC.absent.filter(a => a.group === 'wb').map(a => a.wb);
  for (const code of NATIONAL) assert.ok(built.has(code) !== absent.includes(code), `${code} is either built or left out, with its reason`);
  assert.ok(wb.length >= 30, `${wb.length} indicators`);
  for (const e of wb) {
    assert.ok(M.readLayer(e).ok, `${e.id}: ${M.readLayer(e).errors.join('; ')}`);
    assert.equal(e.id, idOf(e.wb)); assert.equal(L.roleOf(e), 'fill'); assert.equal(e.on, 'countries');
    assert.equal(e.source, sourceOf(e.wb) === 3 ? 'world-bank-wgi' : 'world-bank-wdi');
    assert.equal(CAT.byFill.get(`wb:${e.wb}`), e.id, 'fill=wb:<code> opens it');
    const s = read(e.data);
    assert.equal(s.licence, 'CC BY-4.0', `${e.wb}: its own metadata's licence`);
    assert.equal(s.indicator, e.wb);
    assert.deepEqual([e.time.from, e.time.to], [s.years[0], s.years.at(-1)]);
    assert.ok(e.style.breaks.length >= 2 && e.style.breaks.every((b, i, a) => i === 0 || b > a[i - 1]), `${e.wb}: rising breaks`);
    for (const f of e.files) measured(f);
    assert.match(e.method, /^VM’s own text[.,]/); assert.ok(!/\.\.\s| {2}/.test(e.method), `${e.wb}: no double stop or space`);
  }
  const r = L.fromRecipe(readRecipe('vr=1&at=2010&fill=wb:NY.GDP.MKTP.CD&base=countries'), CAT);
  assert.equal(r.set.fill, 'wb-ny-gdp-mktp-cd'); assert.deepEqual(r.unknown, []);
  assert.equal(writeRecipe({ vr: 1, ...L.toRecipe(r.set, CAT) }), 'vr=1&base=countries&fill=wb:NY.GDP.MKTP.CD');
  assert.deepEqual(breaksOf({ values: { A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] } }).length > 0, true);
});

test('layer 6: SIPRI\'s military expenditure is left out, its terms read and quoted; the World Bank\'s two API sources are in sources.json', () => {
  const a = DOC.absent.find(x => x.wb === 'MS.MIL.XPND.GD.ZS');
  assert.ok(a && M.readAbsent(a).ok);
  assert.equal(a.termsUrl, 'https://www.sipri.org/about/terms-and-conditions'); assert.match(a.why, /SIPRI/); assert.match(a.seen, /commercial purposes must be authorized/);
  assert.ok(BARRED['MS.MIL.XPND.GD.ZS']);
  assert.ok(!existsSync(join(ROOT, 'omni/data/layers/wb/MS.MIL.XPND.GD.ZS.json')), 'no file of it');
  for (const id of ['world-bank-wdi', 'world-bank-wgi', 'ucdp-ged', 'ucdp-candidate', 'gdelt', 'vm-volatility', 'vm-calendar']) {
    const s = SOURCES.find(x => x.id === id);
    assert.ok(s, `${id} is in sources.json`);
    for (const k of ['citation', 'short', 'version', 'licence', 'url', 'accessed', 'terms', 'termsUrl', 'termsQuote', 'termsRead']) assert.ok(typeof s[k] === 'string' && s[k].trim(), `${id}: ${k}`);
  }
});

/* ---------------------------------------------------------------- layer 9: the Volatility score by day */
test('layer 9: the Volatility score by country and day, one file a year, the days kept by ingest.mjs and never dropped', () => {
  const e = byId('gvi'), ix = read(e.data);
  assert.ok(M.readLayer(e).ok); assert.equal(e.split, 'year'); assert.equal(e.on, 'countries'); assert.equal(e.time.step, 'd'); assert.equal(e.source, 'vm-volatility');
  assert.equal(e.status, 'VM’s own score'); assert.deepEqual(e.style.breaks, BREAKS);
  for (const f of e.files) measured(f);
  assert.equal(e.time.first, ix.first); assert.equal(e.time.last, ix.last);
  for (const f of ix.files) {
    const d = read(`omni/data/layers/gvi/${f.file}`);
    assert.equal(d.days.length, f.days); assert.deepEqual([d.days[0], d.days.at(-1)], [f.first, f.last]);
    assert.ok(d.days.every((x, i, a) => /^\d{4}-\d\d-\d\d$/.test(x) && (i === 0 || x > a[i - 1])), 'days rising');
    for (const [iso, v] of Object.entries(d.values)) { assert.match(iso, /^[A-Z]{3}$/); assert.equal(v.length, d.days.length); assert.equal(d.cov[iso].length, d.days.length); }
  }
  // The kept days: a day once kept stays, though the index has dropped it; the index's rows overwrite a day it holds.
  const prev = { countries: { FRA: { name: 'France', days: [['2026-01-01', 40, 'h', 'v1'], ['2026-01-02', 30, 'h', 'v1']] } } };
  const index = { global: [['2026-01-02', 0, 0, 0, 'v2'], ['2026-01-03', 0, 0, 0, 'v2']], countries: { FRA: { name: 'France', days: [['2026-01-02', 50, 0, 0, 0, 'm'], ['2026-01-03', 55, 0, 0, 0, 'h'], ['2025-12-31', 1, 0, 0, 0, 'h']] } } };
  const k = keepDays(prev, index, 2026);
  assert.equal(k.format, 'vm-gvi-kept/1');
  assert.deepEqual(k.countries.FRA.days, [['2026-01-01', 40, 'h', 'v1'], ['2026-01-02', 50, 'm', 'v2'], ['2026-01-03', 55, 'h', 'v2']], 'the old day kept, the index’s rows overwrite, another year’s day left to its own file');
  const doc = yearDoc({ countries: { FRA: { name: 'France', days: [['2026-01-01', 41, 'h', 'v1'], ['2026-01-02', null, 'i', 'v1']] }, XX: { name: 'x', days: [['2026-01-01', 1, 'h', 'v1']] } } });
  assert.deepEqual(doc.days, ['2026-01-01', '2026-01-02']); assert.deepEqual(doc.values.FRA, [41, null]); assert.equal(doc.cov.FRA, 'hi'); assert.ok(!doc.values.XX, 'a key that is not ISO3 is left out');
  const s = N.gviSeries({ year: 2026, days: doc.days, values: doc.values, cov: doc.cov, names: doc.names, methods: doc.methods, built: 'b' });
  assert.deepEqual(s.years, [2026]); assert.deepEqual(s.values.FRA, [null], 'the last day held, blank where it was not scored'); assert.equal(s.day, '2026-01-02');
  for (const y of readdirSync(join(ROOT, 'volatility/data/kept'))) assert.match(y, /^\d{4}\.json$/);
});

/* ---------------------------------------------------------------- layer 8: UCDP's events in cells */
test('layer 8: UCDP GED 26.1 in 0.5° month cells, 1989 to 2025, and 2026 candidate by country, one file a year', () => {
  const e = byId('ucdp-events'), ix = read(e.data);
  assert.ok(M.readLayer(e).ok); assert.equal(L.roleOf(e), 'point'); assert.equal(e.split, 'year'); assert.equal(e.source, 'ucdp-ged');
  // D5 (S5b/S5c review): time.last is the last month held, the candidate months among them; recordedLast GED's own.
  assert.deepEqual([e.time.from, e.time.first, e.time.recordedLast, e.time.last], [1989, '1989-01', '2025-12', `${ix.files.at(-1).year}-${String(ix.files.at(-1).months[1]).padStart(2, '0')}`]);
  assert.equal(M.statusAt(e, 2026), 'candidate'); assert.equal(M.statusAt(e, 2025), 'recorded');
  for (const f of e.files) measured(f);
  assert.deepEqual(ix.files.map(f => f.year), Array.from({ length: e.time.to - 1988 }, (_, i) => 1989 + i));
  const reg = read('omni/data/layers/wars/registry.json'), ids = new Set(reg.wars.map(w => w.id));
  for (const f of ix.files) {
    const d = read(`omni/data/layers/ucdp-events/${f.file}`);
    assert.equal(d.status, f.year <= 2025 ? 'recorded' : 'candidate'); assert.equal(d.source, f.year <= 2025 ? 'ucdp-ged' : 'ucdp-candidate');
    for (const w of d.wars) assert.ok(ids.has(w), `${w} is in the registry`);
    for (const r of d.cells) { assert.ok(Number.isInteger(r[0]) && r[0] >= 0 && r[0] < 720 * 360); assert.ok([1, 2, 3].includes(r[2])); assert.ok(r[3] >= 1); }
    for (const r of d.country) assert.match(String(r[0]), /^(?:[A-Z]{3}|Q\d+)$/, 'a country by ISO3, or a state not of today by Q-id, never by a Gleditsch and Ward code');
    // Cells name no actor, side or person: nothing in a file but numbers, ids and the file's own words.
    assert.ok(!/side_a|side_b|dyad|"Government of/.test(raw(`omni/data/layers/ucdp-events/${f.file}`).toString('utf8')), `${f.file} names no actor`);
  }
  const d = read('omni/data/layers/ucdp-events/2024.json'), { rows, listed } = N.cellRows(d);
  assert.ok(rows.length > 2000, 'clusters on the map'); assert.ok(L.clusters(rows.length));
  assert.ok(listed > 0, 'events known only to the country are counted, not drawn');
  const ukr = reg.wars.find(w => /ukraine/i.test(w.id) && w.from <= 2024 && (w.to ?? 9999) >= 2024);
  if (ukr) assert.ok(L.inPeriod(rows, 2024, 2024, { field: 'w', value: ukr.id }).length > 10, `the war filter l=ucdp-events:w=${ukr.id}`);
  assert.ok(L.inPeriod(rows, 2024, 2024, { field: 't', value: '3' }).every(r => r.t === '3'), 'the type filter');
});

test('layer 8: the builder\'s steps: the zip and its sha256, the CSV, cells, precision 4 to 7, the registry, the candidate year', () => {
  assert.equal(SHA256, '8c941d84954e555ee2e54f40fa04d9203bf1e2f962203d0a9930966c4947c667');
  assert.deepEqual([...csvRows('a,b\n"x, y",2\r\n"q""t",3')], [['a', 'b'], ['x, y', '2'], ['q"t', '3']]);
  for (const [lon, lat] of [[-179.9, 89.9], [0.1, 0.1], [179.9, -89.9], [30.5, 50.45]]) { const c = cellOf(lon, lat), [x, y] = cellCentre(c); assert.ok(Math.abs(x - lon) <= 0.25 && Math.abs(y - lat) <= 0.25); assert.equal(N.cellOf(lon, lat), c); }
  const registry = { wars: [{ id: 'wf-test', ucdp: [7], from: 2000, to: 2010 }] };
  const resolveName = n => (n === 'Ukraine' ? { q: 'Q212', iso3: 'UKR' } : n === 'Russia (Soviet Union)' ? { q: 'Q15180', iso3: null } : null);
  const ev = (o) => ({ year: 2005, month: 3, type: 1, prec: 1, lon: 30.5, lat: 50.45, country: 'Ukraine', conflict: 7, best: 2, low: 1, high: 4, ...o });
  const { years, unread } = cellYears([ev(), ev({ prec: 4 }), ev({ prec: 6 }), ev({ type: 2, conflict: 9 }), ev({ prec: 5, country: 'Russia (Soviet Union)' }), ev({ prec: 7, country: 'Atlantis' })], { resolveName, registry });
  const y = years[2005];
  assert.deepEqual(y.wars, ['wf-test']);
  assert.deepEqual(y.cells.map(r => r.slice(1)), [[3, 1, 1, 2, 1, 4, [0]], [3, 2, 1, 2, 1, 4, []]], 'precision 1 to 3 in its cell; a non-state event has no war');
  assert.deepEqual(y.country.map(r => r[0]).sort(), ['Q15180', 'UKR'], 'precision 4 and 5 by country, a state not of today by its Q-id');
  assert.equal(y.listed.length, 2, 'precision 6 and 7 listed'); assert.deepEqual(unread, ['Atlantis']);
  assert.equal(warOf(registry, 7, 2005), 'wf-test');
  // X7 (second review): a candidate country is joined by its name through VM's crosswalk, never by its GW-derived iso3.
  const c = candidateYear({ year: 2026, months: ['2026-01', '2026-02'], countries: { 369: { name: 'Ukraine', iso3: 'UKR', series: { from: '2026-01', events: [3, 0], deaths: [10, 0] } }, 999: { name: '', iso3: '', series: { events: [1] } } } }, { resolveName });
  assert.deepEqual(c.months, [1, 2]); assert.deepEqual(c.country, [['UKR', 1, 0, 3, 10, null, null, []]]);
  assert.deepEqual(c.unjoined, [{ name: '', events: 1, deaths: 0 }], 'a country the crosswalk cannot read is counted, not drawn');
  assert.throws(() => unzipFirst(Buffer.from('not a zip')), /not a zip/);
});

/* ---------------------------------------------------------------- layer 7: the calendars' events */
test('layer 7: the calendars\' events at their countries by ISO3, each with its precision and source class; none from Archigos or only in the Atlas', () => {
  const e = byId('calendar-events'), ix = read(e.data);
  assert.ok(M.readLayer(e).ok); assert.equal(e.split, 'year'); assert.equal(e.at, 'country'); assert.equal(e.source, 'vm-calendar');
  for (const f of e.files) measured(f);
  assert.ok(e.leftOut.archigos > 0 && e.leftOut.atlas > 0, 'the events left out are counted');
  const iso = isoResolver(neCountries(ROOT));
  for (const f of ix.files) {
    const d = read(`omni/data/layers/calendar/${f.file}`);
    assert.equal(d.rows.length, f.rows);
    for (const r of d.rows) {
      assert.ok(!['archigos', 'atlas'].includes(r.class), `${r.id}: ${r.class}`);
      assert.ok(!(r.class === 'unread' && ['leader', 'coup'].includes(r.type)), `${r.id}: a new leader or coup of unread class may be Archigos's`);
      assert.ok(r.sortYear >= f.from && r.sortYear <= f.to);
      assert.ok([10, 11].includes(r.date.p)); assert.equal(r.date.from.length, r.date.p === 10 ? 7 : 10);
      if (r.place) assert.equal(r.place.iso3, iso(r.country) || r.place.iso3);
      assert.ok(!/political-atlas\.pages\.dev/.test(r.src.date.loc));
    }
  }
  // The rules.
  assert.equal(classOf({ class: 'wikidata' }), 'wikidata'); assert.equal(classOf({ source: 'https://ucdp.uu.se/conflict/1' }), 'ucdp');
  assert.equal(classOf({ source: 'https://political-atlas.pages.dev/#CHL' }), 'atlas'); assert.equal(classOf({ source: 'https://en.wikipedia.org/wiki/X' }), 'unread');
  assert.equal(leftOut({ class: 'archigos' }), 'archigos'); assert.equal(leftOut({ type: 'leader', source: 'https://en.wikipedia.org/wiki/X' }), 'archigos');
  assert.equal(leftOut({ type: 'election', source: 'https://en.wikipedia.org/wiki/X' }), null); assert.equal(leftOut({ source: 'https://political-atlas.pages.dev/#X' }), 'atlas');
  const r = rowOf({ date: '2027-05-01', country: 'Chile', title: 'General election (date to be confirmed)', type: 'election', status: 'tentative', source: 'https://en.wikipedia.org/wiki/X', precision: 'month', class: 'wikipedia-list' }, { isoOf: iso, today: '2026-11-20' });
  assert.deepEqual([r.date, r.place, r.expected, r.class], [{ from: '2027-05', p: 10 }, { iso3: 'CHL' }, true, 'wikipedia-list']);
  assert.equal(N.calendarRows({ rows: [r] })[0].hollow, true, 'an expected event is drawn hollow');
  for (const [n, code] of Object.entries(ALIASES)) assert.equal(iso(n), code, `${n}: ${code} is Natural Earth's own`);
  assert.equal(iso('Soviet Union / Russia'), null, 'a name of two states is not placed'); assert.equal(iso('European Union'), null);
  // build-events.mjs keeps the class, the month precision and the ISO3 (calendar-refresh.yml rebuilds the data).
  const src = raw('calendar/scripts/build-events.mjs').toString('utf8');
  assert.match(src, /class: classOf\(\{ via, type: e\.type \}\)/); assert.match(src, /precision === 'month' \? \{ precision \}/); assert.match(src, /iso3 \? \{ iso3 \}/);
});

/* ---------------------------------------------------------------- the engine */
test('engine: a split layer\'s file by year or decade; the clutter rule holds at four point layers; fills replace each other', () => {
  assert.equal(N.splitFile({ files: [{ year: 2025, file: 'a' }, { year: 2026, file: 'b' }] }, 2026).file, 'b');
  assert.equal(N.splitFile({ files: [{ from: 2020, to: 2029, file: '2020s.json' }] }, 2024).file, '2020s.json');
  assert.equal(N.splitFile({ files: [{ year: 2025 }] }, 1990), null);
  let s = L.emptySet();
  for (const id of ['ucdp-events', 'calendar-events', 'battles']) s = L.switchOn(s, id, CAT).set;
  const r = L.switchOn(s, 'elections', CAT);
  assert.deepEqual(r.set.points, ['calendar-events', 'battles', 'elections']); assert.deepEqual(r.dropped, [{ id: 'ucdp-events', why: 'points' }]);
  assert.match(r.note, /at most 3 point or line layers/);
  const any = L.switchOn({ ...s, anyway: true }, 'elections', CAT);
  assert.equal(any.set.points.length, 4, 'Show anyway keeps all four');
  const f = L.switchOn(L.switchOn(L.emptySet(), 'gvi', CAT).set, 'wb-sp-pop-totl', CAT);
  assert.equal(f.set.fill, 'wb-sp-pop-totl'); assert.match(f.note, /replaces Volatility score/);
  const w = L.fromRecipe(readRecipe('vr=1&at=2024&l=ucdp-events:w=wf-test'), CAT).set;
  assert.deepEqual(w.filters, { 'ucdp-events': { field: 'w', value: 'wf-test' } });
  assert.equal(L.moduleLink('calendar', { event: '2026-05-07~united-kingdom~x' }), 'q/calendar.html?event=2026-05-07~united-kingdom~x');
});

/* ---------------------------------------------------------------- the card */
test('card: a tagged name\'s card offers the Omni-Map at its own years, the Master Index entry and Wikipedia, the page\'s own link last', () => {
  const rec = { q: 'Q879932', label: 'Carlos Mendieta', desc: 'Cuban politician (1873-1960)', type: 'person', wiki: 'Carlos Mendieta', facts: { born: '1873-11-04', died: '1960-09-27' } };
  const c = cardOf(rec, { href: 'https://en.wikipedia.org/wiki/Carlos_Mendieta', today: '2026-11-20' });
  assert.equal(c.title, 'Carlos Mendieta'); assert.equal(c.q, 'Q879932'); assert.equal(c.years, '1873–1960');
  assert.deepEqual(c.offers.map(o => o.id), ['life', 'entry', 'wiki']);
  assert.match(c.offers[0].name, /^Open on the Omni-Map/); assert.match(c.offers[0].at, /^omni\/index\.html#vr=1&.*q=Q879932/);
  assert.equal(c.offers[1].at, 'encyclopedia/index.html#Q879932');
  const bare = cardOf(null, { q: 'Q42', label: 'Douglas Adams', href: 'https://fr.wikipedia.org/wiki/Douglas_Adams' });
  assert.deepEqual(bare.offers.map(o => o.id), ['entry', 'link']); assert.match(bare.thin.text, /holds no record/);
  assert.deepEqual(cardOf(null, { q: 'not a qid' }).offers, []);
  const js = raw('design/jdpi-entities.js').toString('utf8');
  for (const w of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey', "e.button === 0", 'cardOf', "role', 'dialog'", 'Escape', '.jdpi-no-card']) assert.ok(js.includes(w), `jdpi-entities.js: ${w}`);
});

/* ---------------------------------------------------------------- no barred source */
test('no barred source under omni/: no COW, no CShapes, no Archigos field, no PRIO deaths, no OWID density, no SIPRI values', () => {
  const files = [];
  const walk = d => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else files.push(p); } };
  walk('omni');
  for (const f of files) {
    assert.ok(!/cshapes/i.test(f), `${f}: no CShapes file`);
    if (!/\.(json|geojson)$/.test(f)) continue;
    const t = raw(f).toString('utf8');
    assert.ok(!/"src"\s*:\s*"cow"/.test(t), `${f}: no COW row`);
    assert.ok(!/cshapes/i.test(t) || f === 'omni/data/layers.json', `${f}: no CShapes`);
    if (/layers\/(wb|gvi|ucdp-events|calendar)\//.test(f)) {
      assert.ok(!/archigos|"leadid"|"obsid"/i.test(t), `${f}: no Archigos field`);
      assert.ok(!/bdeadbes|bdeadlow|bdeadhig/i.test(t), `${f}: no PRIO battle deaths`);
      assert.ok(!/owid|ourworldindata/i.test(t), `${f}: no OWID`);
      assert.ok(!/MS\.MIL\.XPND/.test(t), `${f}: no SIPRI series`);
    }
  }
});
