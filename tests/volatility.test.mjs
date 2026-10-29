// Geopolitical Volatility. data: tests check the files in volatility/data as the refresh is about to commit them, and
// logic: tests check volatility/scripts on made-up input (ingest.mjs runs in a temporary copy with GDELT stubbed out).
// Neither needs the network, a browser or npm install; the refresh workflow runs them before it commits
// (PRP_PAGES=0 node --test tests/volatility.test.mjs). The site: test checks the deployed index and the page: test drives
// Microsoft Edge through the map, a country page and the comparison, both at JDPI_URL (by default the live site);
// PRP_PAGES=0 leaves them out. Name a new test with one of these four prefixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { pageTest, launch } from './tools/pages.mjs';
import {
  METHOD, COMPONENTS, KEYS, SLOTS, MIN_SLOTS, MIN_EVENTS, BASELINE_DAYS, FIPS, FIPS_TABLE, fipsMap, addDays, categorize,
  midrank, coverageOf, unzipFirst, slotUrl, parseSlot, fetchDay, mergeDay, thinDay, dayProblem, daysToIngest, scoreDay,
  buildIndex, pruneBefore,
} from '../volatility/scripts/gvi.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const DATA = new URL('../volatility/data/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, DATA), 'utf8'));
const dayFiles = () => readdirSync(new URL('days/', DATA)).filter(f => f.endsWith('.json')).sort();

// A line of a GDELT 2.0 event export (61 tab-separated columns), with the fields the build reads.
function gdeltLine({ id = 1, code = '190', g = -10, articles = 3, a1 = 'UKR', a2 = 'RUS', geo = 'UP', url = 'https://example.org/a' } = {}) {
  const c = Array(61).fill('');
  Object.assign(c, { 0: id, 6: `ACTOR ${a1}`, 7: a1, 16: `ACTOR ${a2}`, 17: a2, 26: code, 28: +code.slice(0, 2), 30: g, 33: articles, 52: 'Somewhere', 53: geo, 60: url });
  return c.join('\t');
}
// A zip archive of one file, as GDELT serves each slice (deflated, or stored when `stored`).
function zipOf(text, stored = false) {
  const raw = Buffer.from(text), data = stored ? raw : deflateRawSync(raw), name = Buffer.from('slice.export.CSV'), h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(stored ? 0 : 8, 8);
  h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
  return Buffer.concat([h, name, data]);
}

test('data: index.json matches the stored day files, and every stored day is complete', () => {
  const index = read('index.json'), files = dayFiles();
  assert.ok(files.length >= 1 && files.length <= BASELINE_DAYS + 6, `${files.length} day files`);
  assert.equal(index.method, METHOD);
  assert.equal(index.latest, files.at(-1).slice(0, 10), 'latest is the newest day file');
  assert.ok(files[0].slice(0, 10) >= pruneBefore(index.latest), `day files older than the baseline are pruned: ${files[0]}`);
  assert.equal(index.days, index.global.length);
  const dates = index.global.map(g => g[0]);
  assert.deepEqual(dates, [...new Set(dates)].sort(), 'one global row per day, in order');
  assert.ok(dates[0] >= addDays(index.latest, -364), `a year of rows at most: ${dates[0]}`);
  for (const [d, events, slots, mean] of index.global) {
    assert.ok(slots >= MIN_SLOTS && slots <= SLOTS && events >= MIN_EVENTS, `${d}: ${slots} slices, ${events} events`);
    assert.ok(mean === null || (mean >= 0 && mean <= 100), `${d}: mean ${mean}`);
  }
  const rows = new Map(index.global.map(g => [g[0], g])), perDay = new Map();
  for (const c of Object.values(index.countries)) for (const r of c.days) perDay.set(r[0], (perDay.get(r[0]) || 0) + 1);
  let last;
  for (const f of files) {
    const x = read(`days/${f}`), d = f.slice(0, 10);
    last = x;
    assert.equal(x.day, d, f);
    assert.equal(dayProblem(x), null, f); // at least 72 slices, 5000 located events and 120 countries
    const row = rows.get(d);
    assert.deepEqual(row?.slice(0, 3), [d, x.totalEvents, x.slots], `${d}: global row`);
    // An unscored day (the first week, while the baseline filled) has no mean: null, or 0 in rows written before 2026-10-29.
    assert.ok(Object.values(x.countries).some(c => c.score != null) ? row[3] === x.globalMean : !row[3], `${d}: global mean ${row[3]}`);
    assert.equal(perDay.get(d), Object.keys(x.countries).length, `${d}: a country row for each country with events, and no others`);
    for (const [iso, c] of Object.entries(x.countries)) {
      assert.deepEqual(index.countries[iso]?.days.find(r => r[0] === d), [d, c.score, c.components && KEYS.map(k => c.components[k]), c.events, c.tone, c.coverage[0]], `${d} ${iso}`);
    }
  }
  for (const [iso, c] of Object.entries(index.countries)) assert.deepEqual(c.latest, last.countries[iso] ?? null, `${iso}: latest record`);
});

test('data: the latest day scores enough countries, within range', () => {
  const index = read('index.json');
  const scored = Object.values(index.countries).filter(c => c.latest?.score != null);
  assert.ok(scored.length >= 40, `${scored.length} countries scored on ${index.latest}`); // 72 to 110 a day since the baseline filled
  for (const { name, latest: c } of scored) {
    assert.ok(c.score >= 0 && c.score <= 100, `${name}: ${c.score}`);
    assert.deepEqual(Object.keys(c.components), KEYS, name);
    assert.ok(Object.values(c.components).every(p => p >= 0 && p <= 100) && c.coverage !== 'insufficient', name);
  }
  assert.deepEqual(index.components, COMPONENTS);
  assert.equal(index.components.reduce((s, c) => s + c.weight, 0).toFixed(2), '1.00');
});

test('data: the vendored FIPS table records its source and still maps every country the stored days have', () => {
  const t = FIPS_TABLE;
  assert.match(t.commit, /^[0-9a-f]{40}$/);
  assert.ok(t.source.startsWith(`https://raw.githubusercontent.com/vincentarelbundock/countrycode/${t.commit}/`), t.source);
  assert.match(t.sha256, /^[0-9a-f]{64}$/);
  assert.match(t.licence, /GPL-3/);
  assert.match(t.attribution, /Arel-Bundock/);
  assert.deepEqual(t.columns, ['fips', 'iso3c', 'country.name.en']);
  assert.ok(t.rows.length >= 200 && t.rows.every(r => r.length === 3 && /^[A-Z]{2}$/.test(r[0]) && /^[A-Z]{3}$/.test(r[1]) && r[2]), `${t.rows.length} rows`);
  assert.equal(new Set(t.rows.map(r => r[0])).size, t.rows.length, 'one row per FIPS code');
  assert.equal(new Set(t.rows.map(r => r[1])).size, t.rows.length, 'one row per ISO3 code');
  for (const [fips, iso3] of [['UP', 'UKR'], ['IS', 'ISR'], ['RS', 'RUS'], ['US', 'USA'], ['CH', 'CHN'], ['SU', 'SDN'], ['RI', 'SRB'], ['WE', 'PSE'], ['KV', 'XKX'], ['OD', 'SSD']]) assert.equal(FIPS.get(fips)?.iso3, iso3, fips);
  assert.ok(!FIPS.has('AY') && !FIPS.has('FS'), 'Antarctica and the French Southern Territories are left out');
  for (const f of dayFiles()) for (const [iso3, c] of Object.entries(read(`days/${f}`).countries)) assert.deepEqual(FIPS.get(c.fips), { iso3, name: c.name }, `${f}: ${c.fips}`);
});

test('logic: event categories, mid-rank percentiles and coverage', () => {
  assert.deepEqual(['1621', '163', '160', '120', '190', '204', '141', '042'].map(code => categorize(code, +code.slice(0, 2))),
    ['economic', 'economic', 'political', 'political', 'conflict', 'conflict', 'unrest', null]);
  assert.equal(midrank([1, 2, 2, 3], 2), 50);
  assert.equal(midrank([1, 2, 3, 4], 0), 0);
  assert.equal(midrank([1, 2, 3, 4], 5), 100);
  assert.deepEqual([[24, 50], [100, 4], [74, 12], [75, 12], [299, 40], [300, 40]].map(([n, s]) => coverageOf(n, s)),
    ['insufficient', 'insufficient', 'low', 'medium', 'medium', 'high']);
});

test('logic: a slice is unzipped and its located, sourced events kept by country', () => {
  assert.equal(slotUrl('2026-10-27', 0), 'https://data.gdeltproject.org/gdeltv2/20261027000000.export.CSV.zip');
  assert.equal(slotUrl('2026-10-27', 95), 'https://data.gdeltproject.org/gdeltv2/20261027234500.export.CSV.zip');
  const text = [
    gdeltLine({ id: 1 }), // Ukraine: conflict between actors of two countries
    gdeltLine({ id: 2, geo: 'GZ', code: '141', g: -6, a1: 'PSE', a2: '', url: 'https://www.news.example/b' }), // Gaza, counted with the West Bank
    gdeltLine({ id: 3, geo: 'RB', code: '1621', g: -2, a1: 'SRB', a2: 'SRB' }), // Belgrade, counted with Serbia
    gdeltLine({ id: 4, geo: 'OD', code: '042', g: 1.9 }), // South Sudan
    gdeltLine({ id: 5, geo: 'AY' }), // Antarctica: left out
    gdeltLine({ id: 6, geo: 'XX' }), // no such country
    gdeltLine({ id: 7, url: 'not a url' }), // no web source
    'too\tfew\tcolumns', '',
  ].join('\n');
  for (const stored of [false, true]) assert.equal(unzipFirst(zipOf(text, stored)), text);
  assert.throws(() => unzipFirst(Buffer.from('<html>Service unavailable</html>')), /not a zip/);
  const by = parseSlot(unzipFirst(zipOf(text)), {});
  assert.deepEqual(Object.keys(by), ['UP', 'WE', 'RI', 'OD']);
  assert.deepEqual(Object.values(by).map(([e]) => [e.id, e.cat, e.cross]), [[1, 'conflict', true], [2, 'unrest', false], [3, 'economic', false], [4, null, false]]);
  // Two more Ukrainian events: one from another source, and one with the first one's URL, which counts once.
  parseSlot([gdeltLine({ id: 8, url: 'https://other.example/c' }), gdeltLine({ id: 9 })].join('\n'), by);
  const m = mergeDay(by).UP;
  assert.deepEqual([m.n, m.src.size, m.k.conflict, m.k.spread, Math.round(m.w.conflict * 10) / 10, m.tone], [2, 2, 2, 2, 2.2, -20]);
  // A broken table keeps only the codes gvi.mjs sets itself.
  assert.deepEqual(Object.keys(parseSlot(text, {}, fipsMap([]))), ['WE', 'OD']);
});

test('logic: a day is fetched 8 slices at a time, and only until 72 of its 96 are out of reach', async () => {
  const text = gdeltLine();
  const run = async answer => {
    let calls = 0;
    const r = await fetchDay('2026-10-27', async (day, slot) => { calls++; return answer(slot); });
    return [r.ok, r.missing, r.failed, calls];
  };
  assert.deepEqual(await run(() => text), [96, 0, 0, 96]);
  assert.deepEqual(await run(s => (s < 25 ? null : text)), [7, 25, 0, 32], '25 slices not published: stops after the 4th batch');
  assert.deepEqual(await run(() => undefined), [0, 0, 32, 32], 'GDELT unreachable: 4 batches');
  assert.deepEqual(await run(s => (s < 12 ? null : s < 24 ? undefined : text)), [72, 12, 12, 96], '24 lost: still a day');
  assert.deepEqual(await run(s => (s >= 71 ? null : text)), [71, 25, 0, 96], 'the last 25 not yet published: short');
  const { byCountry } = await fetchDay('2026-10-27', async () => text);
  assert.equal(byCountry.UP.length, 96);
});

test('logic: the content guard tells a broken build from a quiet day', () => {
  assert.equal(thinDay(14471, 191), null); // the thinnest complete days stored
  assert.equal(thinDay(10853, 185), null); // the same with only 72 of their 96 slices
  assert.match(thinDay(4999, 200), /^only 4999 located events in 200 countries/);
  assert.match(thinDay(30000, 119), /in 119 countries/);
  // With an empty FIPS table, a full day of slices locates 3 countries at most.
  const by = {};
  for (let s = 0; s < SLOTS; s++) parseSlot(Array.from({ length: 80 }, (_, i) => gdeltLine({ id: s * 80 + i, geo: FIPS_TABLE.rows[i][0], url: `https://s${i}.example/${s}` })).join('\n'), by, fipsMap([]));
  const merged = mergeDay(by), events = Object.values(merged).reduce((t, m) => t + m.n, 0);
  assert.ok(Object.keys(merged).length <= 3 && thinDay(events, Object.keys(merged).length), `${events} events in ${Object.keys(merged).length} countries`);
  assert.equal(dayProblem({ slots: 71, totalEvents: 30000, countries: {} }), 'only 71/96 GDELT slices');
  assert.equal(dayProblem(null), 'only 0/96 GDELT slices');
  assert.match(dayProblem({ slots: 96, totalEvents: 30000, countries: { PSE: {}, XKX: {} } }), /in 2 countries/);
});

test('logic: the days to ingest are those of the window without a complete stored file, oldest first', () => {
  const slots = { '2026-10-21': 96, '2026-10-23': 50, '2026-10-25': 72 };
  assert.deepEqual(daysToIngest('2026-10-27', 7, d => slots[d] >= MIN_SLOTS), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27']);
  assert.deepEqual(daysToIngest('2026-03-01', 3, () => false), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(daysToIngest('2026-10-27', 7, () => true), []);
});

test('logic: a day is scored against the stored days before it and shrunk toward its mean', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(gdeltLine({ id: i, url: `https://s${i % 12}.example/${i}` })); // Ukraine: 100 conflict events, 12 sources
  for (let i = 0; i < 30; i++) lines.push(gdeltLine({ id: 100 + i, geo: 'IS', code: '141', g: -5, a1: 'ISR', a2: 'ISR', url: `https://t${i % 5}.example/${i}` }));
  for (let i = 0; i < 3; i++) lines.push(gdeltLine({ id: 200 + i, geo: 'KV', code: '042', g: 2, url: `https://k.example/${i}` }));
  const merged = mergeDay(parseSlot(lines.join('\n'), {}));
  const quiet = { coverage: 'low', raw: Object.fromEntries(KEYS.map(k => [k, 0])) };
  const prior = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${20 + i}`, countries: { XXX: quiet, YYY: { ...quiet, coverage: 'insufficient', raw: { ...quiet.raw, conflict: 9 } } } }));
  // Six baseline days (five stored and this one) are too few: nothing is scored, and the day has no mean.
  const early = scoreDay('2026-10-27', merged, { ok: 96 }, prior.slice(0, 5));
  assert.equal(early.globalMean, null);
  assert.deepEqual(Object.values(early.countries).map(c => [c.score, c.reason, c.coverage]), [
    [null, 'Baseline has 6/7 days', 'medium'], [null, 'Baseline has 6/7 days', 'low'], [null, 'Too few events or sources', 'insufficient']]);
  // With seven stored days, Ukraine's conflict and spread rank 94.4 (8.5 of 9 in the pool), Israel's unrest the same.
  const x = scoreDay('2026-10-27', merged, { ok: 90, missing: 4, failed: 2 }, prior);
  assert.deepEqual([x.day, x.method, x.slots, x.missing, x.failed, x.totalEvents, x.baselineDays, x.globalMean], ['2026-10-27', METHOD, 90, 4, 2, 133, 8, 67.6]);
  assert.deepEqual(Object.keys(x.countries), ['UKR', 'ISR', 'XKX']);
  assert.deepEqual(x.countries.UKR.components, { conflict: 94.4, political: 50, unrest: 44.4, economic: 50, spread: 94.4 });
  // 71.1 and 56.1 before shrinking toward the event-weighted mean 67.6 by 100/175 and 30/105.
  assert.deepEqual(Object.values(x.countries).map(c => [c.fips, c.name, c.score, c.events, c.sources, c.evidence.length]), [
    ['UP', 'Ukraine', 69.6, 100, 12, 6], ['IS', 'Israel', 64.3, 30, 5, 6], ['KV', 'Kosovo', null, 3, 1, 0]]);
});

test('logic: the index takes each day from its file, keeps pruned days and leaves no row for a day that is gone', () => {
  const country = (score, events = 50) => ({ name: 'Ukraine', score, components: score == null ? null : { conflict: 1, political: 2, unrest: 3, economic: 4, spread: 5 }, events, tone: -1, coverage: 'medium' });
  const files = {
    '2026-10-10': { day: '2026-10-10', totalEvents: 20000, slots: 96, globalMean: 0, countries: { UKR: country(null) } }, // written before 2026-10-29
    '2026-10-12': { day: '2026-10-12', totalEvents: 21000, slots: 80, globalMean: 55.5, countries: { UKR: country(60), ISR: { ...country(40), name: 'Israel' } } },
  };
  const prev = {
    global: [['2025-10-01', 1, 96, 50], ['2026-10-05', 15000, 50, 40], ['2026-10-08', 19000, 96, 51], ['2026-10-10', 1, 96, 1], ['2026-10-11', 18000, 96, 52]],
    countries: { UKR: { name: 'Ukraine', days: [['2025-10-01', 1, null, 1, 0, 'l'], ['2026-10-05', null, null, 9, 0, 'm'], ['2026-10-08', 50, null, 9, 0, 'm'], ['2026-10-11', 70, null, 9, 0, 'm']], latest: null } },
  };
  const index = buildIndex(prev, Object.keys(files), d => files[d], 'now');
  // 2026-10-08 is older than the oldest file (pruned): kept. 2026-10-05 is older too, but short (50 slices, written by older
  // code): gone, with its country rows. 2026-10-11 has no file (skipped or deleted): gone. 2025-10-01 is over a year old.
  assert.deepEqual(index.global, [['2026-10-08', 19000, 96, 51], ['2026-10-10', 20000, 96, null], ['2026-10-12', 21000, 80, 55.5]]);
  assert.deepEqual([index.generated, index.method, index.latest, index.days], ['now', METHOD, '2026-10-12', 3]);
  assert.deepEqual(index.countries.UKR.days, [['2026-10-08', 50, null, 9, 0, 'm'], ['2026-10-10', null, null, 50, -1, 'm'], ['2026-10-12', 60, [1, 2, 3, 4, 5], 50, -1, 'm']]);
  assert.deepEqual([Object.keys(index.countries), index.countries.ISR.latest], [['UKR', 'ISR'], files['2026-10-12'].countries.ISR]);
  assert.throws(() => buildIndex(prev, [], d => files[d], 'now'), /No complete day is stored/);
});

// ingest.mjs itself, in a temporary copy of volatility/scripts with its own data folder. A stub stands in for the network
// (it makes up GDELT slices: 60 events in each, over 150 countries) and fixes the clock at GVI_NOW.
test('logic: ingest.mjs leaves out a short or thin day, fails only when that left nothing to write, and leaves index.json alone when nothing is new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvi-')), scripts = join(dir, 'volatility', 'scripts'), days = join(dir, 'volatility', 'data', 'days');
  const repoIndex = readFileSync(new URL('index.json', DATA));
  const codes = FIPS_TABLE.rows.map(r => r[0]).filter(f => FIPS.has(f) && !['WE', 'KV', 'OD'].includes(f)).slice(0, 150);
  try {
    mkdirSync(scripts, { recursive: true });
    const src = fileURLToPath(new URL('../volatility/scripts/', import.meta.url));
    for (const f of readdirSync(src)) copyFileSync(join(src, f), join(scripts, f));
    writeFileSync(join(dir, 'stub.mjs'), String.raw`
      import { deflateRawSync } from 'node:zlib';
      const NOW = Date.parse(process.env.GVI_NOW), RealDate = Date;
      globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
      const CODES = ${JSON.stringify(codes)};
      const missingFrom = Object.fromEntries((process.env.GVI_MISSING || '').split(',').filter(Boolean).map(s => s.split('@')));
      const requests = {};
      process.on('exit', () => console.error('requests ' + JSON.stringify(requests)));
      function zip(text) {
        const raw = Buffer.from(text), data = deflateRawSync(raw), h = Buffer.alloc(30);
        h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22);
        return Buffer.concat([h, data]);
      }
      globalThis.fetch = async url => {
        const m = /gdeltv2\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})00\.export\.CSV\.zip$/.exec(String(url));
        if (!m) throw new Error('no network in this test: ' + url);
        const day = m[1] + '-' + m[2] + '-' + m[3], slot = +m[4] * 4 + +m[5] / 15;
        requests[day] = (requests[day] || 0) + 1;
        if (day in missingFrom && slot >= +missingFrom[day]) return new Response('Not found', { status: 404 });
        const lines = [];
        const thin = (process.env.GVI_THIN || '').split(',').includes(day); // a day GDELT published near-empty files for
        for (let i = 0; i < (thin ? 1 : 60); i++) {
          const c = Array(61).fill(''), n = slot * 60 + i, code = ['190', '141', '120', '051', '1621', '173', '042', '0211'][n % 8];
          Object.assign(c, { 0: n, 7: n % 3 ? 'USA' : 'RUS', 17: 'RUS', 26: code, 28: +code.slice(0, 2), 30: (n % 21) - 10, 33: 1 + (n % 5), 53: CODES[n % CODES.length], 60: 'https://src' + ((slot + i) % 20) + '.example/' + day + '/' + n });
          lines.push(c.join('\t'));
        }
        return new Response(zip(lines.join('\n')));
      };`);
    const ingest = (now, args, env = {}) => {
      const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'stub.mjs')).href, join(scripts, 'ingest.mjs'), ...args],
        { encoding: 'utf8', timeout: 60000, env: { ...process.env, NODE_TEST_CONTEXT: undefined, GVI_NOW: now, ...env } });
      return { code: r.status, out: r.stdout, requests: JSON.parse(/^requests (.*)$/m.exec(r.stderr)?.[1] || '{}'), err: r.stderr };
    };
    const files = () => readdirSync(days).sort().join(' ');
    const index = () => readFileSync(join(dir, 'volatility', 'data', 'index.json'), 'utf8');

    // 1. A fresh store looks back at least 14 days whatever --days says, so one short day cannot keep it from filling its
    //    baseline. GDELT has published nothing for the 28th yet: 13 days written, the 28th left out after 4 batches
    //    (32 requests), and the run succeeds with a warning.
    let r = ingest('2026-10-29T01:30:00Z', ['--days', '8'], { GVI_MISSING: '2026-10-28@0' });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /::warning title=Volatility 2026-10-28::Only 0\/96 GDELT slices \(32 not published, 0 failed\), so the day is not written/);
    assert.equal(r.requests['2026-10-28'], 32);
    assert.equal(files(), Array.from({ length: 13 }, (_, i) => `2026-10-${15 + i}.json`).join(' '));
    assert.match(r.out, /2026-10-27: 96\/96 slices, 150 countries, 150 scored, baseline 13 days/);
    assert.equal(JSON.parse(index()).latest, '2026-10-27');

    // 2. Later, the 28th is published in part (66 slices) and still left out; nothing else changes, so index.json stays as it was.
    let before = index();
    r = ingest('2026-10-29T04:30:00Z', ['--days', '3'], { GVI_MISSING: '2026-10-28@66' });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /Only 66\/96 GDELT slices \(30 not published, 0 failed\)/);
    assert.match(r.out, /No day written; index\.json unchanged \(latest 2026-10-27\)/);
    assert.equal(index(), before);
    assert.ok(!existsSync(join(days, '2026-10-28.json')));

    // 3. Once it is complete, the 28th is written and the index rebuilt.
    r = ingest('2026-10-29T07:30:00Z', ['--days', '3']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /2026-10-28: 96\/96 slices, 150 countries, 150 scored, baseline 14 days/);
    assert.deepEqual([r.requests, JSON.parse(index()).latest], [{ '2026-10-28': 96 }, '2026-10-28']);

    // 4. A second run with no new day downloads nothing and leaves index.json byte for byte (its `generated` would differ).
    before = index();
    r = ingest('2026-10-29T13:30:00Z', ['--days', '3']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(r.requests, {});
    assert.equal(index(), before);
    // --reindex rewrites it all the same, with only `generated` changed.
    r = ingest('2026-10-29T13:30:00Z', ['--days', '3', '--reindex']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual({ ...JSON.parse(index()), generated: null }, { ...JSON.parse(before), generated: null });
    assert.equal(JSON.parse(index()).generated, '2026-10-29T13:30:00.000Z');

    // 5. A stored day that is short (edited here to 50 slices) is fetched again. While GDELT still has too few of its slices
    //    the file is removed and the index rebuilt without it; once GDELT has them, the day is written again.
    const shortDay = join(days, '2026-10-27.json');
    writeFileSync(shortDay, JSON.stringify({ ...JSON.parse(readFileSync(shortDay, 'utf8')), slots: 50 }));
    r = ingest('2026-10-29T14:30:00Z', ['--days', '3'], { GVI_MISSING: '2026-10-27@60' });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /::warning title=Volatility 2026-10-27::Only 60\/96 GDELT slices/);
    assert.ok(!existsSync(shortDay));
    assert.deepEqual(JSON.parse(index()).global.map(g => g[0]).slice(-2), ['2026-10-26', '2026-10-28'], 'no row for the removed day');
    r = ingest('2026-10-29T15:30:00Z', ['--days', '3']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual([r.requests, JSON.parse(index()).global.find(g => g[0] === '2026-10-27')?.[2]], [{ '2026-10-27': 96 }, 96]);

    // 6. An empty FIPS table: the next day has all its slices but locates no country. It is not written, and since nothing
    //    else was there to write, the run fails: a change in GDELT's format or the table shows on the first night.
    before = index();
    const table = JSON.parse(readFileSync(join(scripts, 'fips-iso3.json'), 'utf8'));
    writeFileSync(join(scripts, 'fips-iso3.json'), JSON.stringify({ ...table, rows: [] }));
    r = ingest('2026-10-30T01:30:00Z', ['--days', '3']);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /::warning title=Volatility 2026-10-29::96\/96 GDELT slices but only 0 located events in 0 countries/);
    assert.match(r.out, /::error title=Volatility::2026-10-29: too few located events or countries/);
    assert.ok(!existsSync(join(days, '2026-10-29.json')));
    assert.equal(index(), before);
    writeFileSync(join(scripts, 'fips-iso3.json'), JSON.stringify(table));
    // 6b. One day GDELT published near-empty files for (the 29th) is left out with a warning, and holds up nothing after
    //     it: the 30th is written and the run succeeds.
    r = ingest('2026-10-31T01:30:00Z', ['--days', '3'], { GVI_THIN: '2026-10-29' });
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /::warning title=Volatility 2026-10-29::96\/96 GDELT slices but only 96 located events in \d+ countries/);
    assert.match(r.out, /2026-10-30: 96\/96 slices, 150 countries, 150 scored/);
    assert.deepEqual([existsSync(join(days, '2026-10-29.json')), JSON.parse(index()).latest], [false, '2026-10-30']);

    // 7. A mistyped --days fails instead of ingesting nothing.
    r = ingest('2026-10-30T01:30:00Z', ['--days', 'seven']);
    assert.equal(r.code, 1);
    assert.match(r.out, /--days must be a positive integer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(readFileSync(new URL('index.json', DATA)).equals(repoIndex), 'the repository data is untouched');
});

test('site: the deployed index is recent and scores countries', pageTest, async () => {
  const d = await (await fetch(`${BASE}/volatility/data/index.json`)).json();
  const age = (Date.now() - Date.parse(d.latest + 'T00:00:00Z')) / 864e5;
  const scored = Object.values(d.countries).filter(c => c.latest?.score != null);
  assert.ok(age < 4, `latest day ${d.latest}`);
  assert.ok(scored.length >= 40, `scored: ${scored.length}`);
  assert.ok(scored.every(c => c.latest.score >= 0 && c.latest.score <= 100));
});

test('page: map, country page and comparison work', pageTest, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/volatility`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#rows tr', { timeout: 20000 });
    const rows = await page.locator('#rows tr').count();
    const options = await page.locator('#metric option').count();
    await page.goto(`${BASE}/q/volatility#country=UKR`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#profile .stat', { timeout: 20000 });
    const profile = await page.locator('#profile').innerText();
    await page.goto(`${BASE}/q/volatility#tab=compare&compare=UKR,ISR,USA`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#compare table', { timeout: 20000 });
    const cmpCols = await page.locator('#compare thead th').count();
    assert.ok(rows >= 40, `rows: ${rows}`);
    assert.ok(options >= 18, `metrics: ${options}`);
    assert.match(profile, /30-day volatility/i);
    assert.match(profile, /political stability/i);
    assert.match(profile, /components/i);
    assert.equal(cmpCols, 4);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
