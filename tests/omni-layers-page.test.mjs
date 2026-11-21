// Digital Science · Omni-Map, stage S5a of PRP-SCHOLAR-USP-DESIGN.md (4.2), in Microsoft Edge: the layer list's
// switches by keyboard, each layer's data fetched only when it is switched on (and for the grid only the frame's file);
// the legend's measure, precision, status, source and licence; the recipe keeping each layer (fill=, base=, l=, all=);
// addresses from before S5a opening as before; the bundle carrying each drawn layer's rows with their source and its
// pins (ds=); and the d3 adapter (omni/d3.html) slicing the same borders as the MapLibre page at 1494 and 1900.
// npm run test:e2e -- tests/omni-layers-page.test.mjs serves the site locally and sets JDPI_URL; without it these skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { readZip } from '../design/vm-bundle.js';

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni-layers-page.test.mjs)' };
const LAYER_FILE = /\/omni\/data\/(layers\/(wb|density|density-hyde)\/|base\/(countries\.topo|small-states)\.json)/;

function watch(page) {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  page.on('request', r => { if (LAYER_FILE.test(r.url())) requests.push(new URL(r.url()).pathname); });
  return { errors, requests };
}
const ready = (page, frame = null) => page.waitForFunction(f => window.omniState?.ready && (f == null || window.omniState.frame === f), frame, { timeout: 60000 });
const st = page => page.evaluate(() => window.omniState);
// Waits until the page has drawn the frame with the layers given on (omniState.lv.on), and returns the state. The
// battles are drawn by omni/app.js itself, as before S5a, so lv.drawn never lists them.
async function settled(page, on) {
  await page.waitForFunction(ids => { const s = window.omniState; return s?.ready && s.lv && JSON.stringify(s.lv.on) === JSON.stringify(ids) && ids.filter(id => id !== 'battles').every(id => s.lv.drawn.includes(id) || s.lv.years[id] === null); }, on, { timeout: 60000 });
  return st(page);
}
const files = bytes => Object.fromEntries(readZip(new Uint8Array(bytes)).map(f => [f.name, Buffer.from(f.bytes).toString('utf8')]));
async function bundle(page) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#save')]);
  return files(readFileSync(await d.path()));
}
// rows.csv: RFC 4180, quoted fields allowed.
function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\r') { /* CRLF */ } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

test('page: a layer switched on by keyboard is fetched only then; its legend names measure, precision, status, source and licence; l= keeps it', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  const plain = 'vr=1&t=1950..2000&at=1990&show=frame&step=y&base=plain&fill=borders';
  await page.goto(`${BASE}/omni/index.html#${plain}`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1990);
  let s = await settled(page, []);
  assert.deepEqual(requests, [], 'no layer file is fetched before a layer is switched on');
  assert.deepEqual(s.lv.fetched, []);
  assert.deepEqual(s.layers, ['borders']);
  // The list: a switch for each layer, the borders always on. Since HYDE 3.2.1 is built (S5a fixer, F1), no line is
  // left out for want of free data.
  // S5c's switches follow (tests/omni-now-page.test.mjs), every one off.
  const switches = await page.$$eval('#layers-body [role="switch"]', els => els.map(e => [e.id, e.checked, e.disabled]));
  assert.deepEqual(switches.slice(0, 11), [
    ['ly-borders', true, true], ['ly-battles', false, false], ['ly-countries', false, false], ['ly-density-country', false, false], ['ly-density-grid', false, false], ['ly-density-hyde', false, false],
    ['ly-conflict-territory', false, false], ['ly-elections', false, false], ['ly-coups', false, false], ['ly-political-change', false, false], ['ly-breakthroughs', false, false]]);
  for (const [id, on, off] of switches.slice(11)) { assert.match(id, /^ly-((?:wb|standin)-[a-z0-9-]+|gvi|ucdp-events|calendar-events)$/); assert.equal(on || off, false, id); } // then the stand-ins (tests/standins.test.mjs)
  // The lines left out: the World Bank's military expenditure, which is SIPRI's, under SIPRI's terms (S5c), and the
  // three series the World Bank takes from the IEA, under the IEA's own terms (D1 of the S5b/S5c review); and, since
  // the second review of 20 November 2026 (X1), IHME's PM2.5 exposure and ITU's two series, whose originators' own
  // terms bar commercial use whatever the World Bank's label reads.
  assert.deepEqual((await page.$$eval('#layers-body [data-absent="true"]', els => els.map(e => e.dataset.layer || e.id))).sort(),['wb-eg-fec-rnew-zs', 'wb-eg-use-pcap-kg-oe', 'wb-en-atm-pm25-mc-m3', 'wb-en-ghg-co2-pc-ce-ar5', 'wb-it-cel-sets-p2', 'wb-it-net-user-zs', 'wb-ms-mil-xpnd-gd-zs']);
  // R4: each line says the years the layer holds, on or off; outside them, in the design's words.
  assert.equal(await page.textContent('#ly-density-country-what'), 'Holds 1961 to 2024. Off: its data loads when you switch it on.');
  assert.equal(await page.textContent('#ly-countries-what'), 'Holds 1886 to 2024. Off: its data loads when you switch it on.');
  assert.equal(await page.textContent('#ly-density-hyde-what'), 'Population density before 1975 (HYDE) holds 4000 BC to 1970; the map is at 1990');

  // By keyboard: focus the switch and press Space.
  await page.focus('#ly-density-country');
  await page.keyboard.press('Space');
  s = await settled(page, ['density-country']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/base/countries.topo.json', '/omni/data/base/small-states.json', '/omni/data/layers/wb/EN.POP.DNST.json']);
  assert.deepEqual(s.lv.drawn, ['density-country']); assert.equal(s.lv.years['density-country'], 1990);
  assert.ok(s.layers.includes('density-country'));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ly-density-country', 'the focus stays on the switch');
  assert.equal(await page.isChecked('#ly-density-country'), true);
  assert.match(s.recipe, /&fill=wb:EN\.POP\.DNST(&|$)/);
  assert.match(decodeURIComponent(await page.evaluate(() => location.hash)), /fill=wb:EN\.POP\.DNST/);
  const lg = s.legend.find(l => l.layer === 'density-country')?.text || '';
  for (const w of ['Population density (by country)', 'Measure: people per km² of land area', 'Dates at the precision', 'Status: as the World Bank estimates it', 'Source: World Bank WDI', 'CC BY 4.0', 'today’s borders', 'under 10', '500 and over'])
    assert.ok(lg.includes(w), `the legend says "${w}": ${lg}`);
  // The fill draws on the map: MapLibre has its layer, and the borders are outlines over it.
  assert.ok(await page.evaluate(() => !!document.querySelector('#map') && window.omniState.map != null));
  assert.equal(await page.textContent('#ly-density-country-what'), 'Holds 1961 to 2024. On: the map shows 1990.');
  // R3: the classes start at the ramp's second step (the first is near the sea's colour); a key for no value.
  const sw = await page.$$eval('#legend-body [data-layer="density-country"] .om-ramp .om-swatch', els => els.map(e => e.className.replace('om-swatch ', '')));
  assert.equal(sw[0], 'om-seq-2', 'the lowest class is not the palest step'); assert.equal(sw.at(-2), 'om-seq-10'); assert.equal(sw.at(-1), 'om-nodata');
  assert.ok(lg.includes('No value for this year'));
  // F3: the economies with a value that no free shape holds are listed beside the map, and the aggregates named.
  assert.equal(await page.getAttribute('#legend-body [data-layer="density-country"] [data-unplaced]', 'data-unplaced'), 'CHI GIB');
  assert.match(lg, /VM cannot place these on a free border for 1990, so they are not drawn: Channel Islands \(CHI\), [\d,.]+; Gibraltar \(GIB\), [\d,.]+\./);
  assert.match(lg, /Not drawn: the World Bank’s 44 aggregates/);

  // The grid: switched on, it replaces the by-country fill, with a note; it fetches the index and the frame's file only.
  requests.length = 0;
  await page.focus('#ly-density-grid');
  await page.keyboard.press('Space');
  s = await settled(page, ['density-grid']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/layers/density/1990.json', '/omni/data/layers/density/index.json']);
  assert.match(await page.textContent('#ly-note'), /Population density \(grid\) replaces Population density \(by country\): the map draws one fill at a time/);
  assert.match(s.recipe, /&fill=density-grid(&|$)/);
  const gl = s.legend.find(l => l.layer === 'density-grid')?.text || '';
  for (const w of ['Source: GHSL', 'CC BY 4.0', 'Status: modelled', 'Measure: people per km² (0.25° cells)', 'Precision:', '0.25°']) assert.ok(gl.includes(w), `the grid's legend says "${w}": ${gl}`);

  // The address keeps the layers: reloaded, the same layers are on and drawn.
  await page.focus('#ly-countries');
  await page.keyboard.press('Space');
  s = await settled(page, ['countries', 'density-grid']);
  assert.match(s.recipe, /&base=countries&fill=density-grid/);
  // R2: with today's countries drawn, the Base block no longer says "never today's states".
  const baseText = s.legend.find(l => l.layer === 'base')?.text || '';
  assert.doesNotMatch(baseText, /never today/); assert.match(baseText, /today’s countries \(Natural Earth Admin 0\) drawn over it/);
  assert.equal(await page.textContent('#ly-countries-what'), 'Holds 1886 to 2024. On: today’s borders, whatever the year.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1990);
  s = await settled(page, ['countries', 'density-grid']);
  assert.deepEqual(await page.$$eval('#layers-body [role="switch"]:checked', els => els.map(e => e.id)), ['ly-borders', 'ly-countries', 'ly-density-grid']);

  // Show anyway: all=1 in the address, and back.
  await page.focus('#ly-anyway');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => /&all=1/.test(window.omniState.recipe));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !/&all=1/.test(window.omniState.recipe));

  // A frame before a layer's years: the list says so, in the design's words, and nothing is drawn for it.
  requests.length = 0;
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=wb:EN.POP.DNST`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1494);
  s = await settled(page, ['density-country']);
  assert.deepEqual(s.lv.drawn, []);
  assert.equal(await page.textContent('#ly-density-country-what'), 'Population density (by country) holds 1961 to 2024; the map is at 1494');
  assert.ok(s.legend.find(l => l.layer === 'density-country')?.text.includes('holds 1961 to 2024; the map is at 1494'));
  assert.deepEqual(errors, []);
});

test('page: addresses from before S5a open as before; an unknown layer is named and not drawn; the bundle carries each layer\'s rows, source and pin', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  // The flagship's own recipe (tests/omni.test.mjs): borders and battles, nothing else fetched or pinned.
  const old = 'vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853&from=neo:the-prince/3/c03-p03';
  await page.goto(`${BASE}/omni/index.html#${old}`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1494);
  let s = await settled(page, ['battles']);
  assert.deepEqual(s.layers, ['borders', 'battles']);
  assert.deepEqual(requests, []);
  assert.ok(s.recipe.startsWith('vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853'), s.recipe);
  const b0 = await bundle(page);
  assert.doesNotMatch(b0['recipe.txt'], /countries@|density/, 'a view of borders and battles pins what it pinned before');
  // (The battles VM holds fall in 1495–1509, so this frame's rows are its borders.)
  assert.deepEqual([...new Set(csv(b0['rows.csv']).map(r => r.layer))].sort(), ['borders']);
  assert.doesNotMatch(JSON.parse(b0['metadata.json']).datasets.map(d => d.id).join(), /countries|density/);

  // An id VM does not hold is named, never drawn.
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=wb:NO.SUCH.CODE&l=battles,shipwrecks`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1494);
  s = await settled(page, ['battles']);
  const body = await page.textContent('body');
  assert.match(body, /VM holds no "shipwrecks" layer, so it is not drawn/);
  assert.match(body, /VM holds no "wb:NO\.SUCH\.CODE" fill, so this view draws borders/);
  assert.deepEqual(s.layers, ['borders', 'battles']);

  // The bundle and "Download data" carry the drawn layer's rows, each with its source and place in it; ds= pins it.
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1980..2000&at=1990&show=frame&step=y&base=countries&fill=wb:EN.POP.DNST`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1990);
  s = await settled(page, ['countries', 'density-country']);
  const b = await bundle(page);
  const rows = csv(b['rows.csv']), wb = rows.filter(r => r.layer === 'density-country');
  assert.ok(wb.length > 150, `${wb.length} economies' rows`);
  for (const r of wb) {
    assert.equal(r.source_id, 'world-bank-wdi'); assert.equal(r.date, '1990'); assert.match(r.source_loc, /^EN\.POP\.DNST;economy=[A-Z]{3};date=1990$/);
    assert.ok(+r.value >= 0, r.Code);
  }
  const ireland = wb.find(r => r.Code === 'IRL');
  assert.ok(ireland, 'Ireland has a row');
  const series = JSON.parse(readFileSync(new URL('../omni/data/layers/wb/EN.POP.DNST.json', import.meta.url), 'utf8'));
  assert.equal(+ireland.value, series.values.IRL[series.years.indexOf(1990)], 'the value is the World Bank\'s, unchanged');
  // ds= pins each drawn layer's version, after the borders' four pins; the battles, not drawn here, are not pinned
  // (second review X8, 20 November 2026: a battles refresh must not mark this view as changed).
  assert.match(b['recipe.txt'], /&ds=cliopatria@[^&]*,natural-earth@[^,&]+,countries@\d{8}T\d{4}Z,density-country@\d{8}T\d{4}Z$/);
  assert.doesNotMatch(b['recipe.txt'], /battles@/);
  const list = JSON.parse(b['metadata.json']).datasets;
  const wbd = list.find(d => d.id === 'density-country'), nd = list.find(d => d.id === 'countries');
  assert.ok(wbd && /^[0-9a-f]{64}$/.test(wbd.sha256) && wbd.licence === 'CC BY 4.0', JSON.stringify(wbd));
  assert.ok(nd && nd.licence === 'Public domain', JSON.stringify(nd));
  assert.ok(JSON.parse(b['choices.json']).layersDrawn.includes('density-country'));
  assert.deepEqual(errors, []);
});

test('page: population before 1975 (HYDE 3.2.1) at 1494 fetches one epoch, says which, and its rows carry HYDE as their source; the grid at 1978 says it shows 1975', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1494);
  await settled(page, []);
  await page.focus('#ly-density-hyde');
  await page.keyboard.press('Space');
  let s = await settled(page, ['density-hyde']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/layers/density-hyde/1400.json', '/omni/data/layers/density-hyde/index.json']);
  assert.equal(s.lv.years['density-hyde'], 1400);
  assert.match(s.recipe, /&fill=density-hyde(&|$)/);
  assert.equal(await page.textContent('#ly-density-hyde-what'), 'Holds 4000 BC to 1970. On: the map shows HYDE 3.2.1’s 1400, the last of its years before 1494.');
  const lg = s.legend.find(l => l.layer === 'density-hyde')?.text || '';
  for (const w of ['Source: HYDE 3.2.1', 'CC0 1.0', 'Status: modelled', 'a modelled reconstruction', 'Measure: people per km² (0.25° cells)', 'at 1494 the map shows 1400', 'Drawn: 1400', 'Blank: no one in the cell'])
    assert.ok(lg.includes(w), `the legend says "${w}": ${lg}`);
  const b = await bundle(page);
  const rows = csv(b['rows.csv']).filter(r => r.layer === 'density-hyde');
  assert.ok(rows.length > 100000, `${rows.length} cells`);
  assert.ok(rows.every(r => r.source_id === 'hyde-3.2.1' && r.date === '1400' && /^baseline\/asc\/1400AD_pop\/popc_1400AD\.asc;0\.25° row \d+ col \d+;people \d+$/.test(r.source_loc)), rows[0] && JSON.stringify(rows[0]));
  const ds = JSON.parse(b['metadata.json']).datasets.find(d => d.id === 'density-hyde');
  assert.ok(ds && ds.licence === 'CC0 1.0' && ds.sourceSha256 === '5a847086cb199c75b739a7b099a8c48840e52fe5a4937882bd8fb26f86288714', JSON.stringify(ds));
  assert.match(b['recipe.txt'], /density-hyde@\d{8}T\d{4}Z/);

  // R4: the GHSL grid at 1978 shows its 1975 epoch, and its line says so; at 1972 HYDE's 1970 stands (time.until).
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1970..1980&at=1978&show=frame&step=y&base=plain&fill=density-grid`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1978);
  s = await settled(page, ['density-grid']);
  assert.equal(s.lv.years['density-grid'], 1975);
  assert.equal(await page.textContent('#ly-density-grid-what'), 'Holds 1975 to 2030. On: the map shows GHSL GHS-POP’s 1975, the last of its years before 1978.');
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1970..1980&at=1972&show=frame&step=y&base=plain&fill=density-hyde`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1972);
  s = await settled(page, ['density-hyde']);
  assert.equal(s.lv.years['density-hyde'], 1970);
  assert.deepEqual(errors, []);
});

test('page: the d3 adapter slices the same borders as the MapLibre page at 1494 and at 1900', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors } = watch(page);
  for (const year of [1494, 1900]) {
    await page.goto(`${BASE}/omni/index.html#vr=1&t=${year}..${year}&at=${year}&show=frame&step=y&base=plain&fill=borders`, { waitUntil: 'domcontentloaded' });
    await ready(page, year);
    const ml = (await st(page)).features;
    await page.goto(`${BASE}/omni/d3.html#at=${year}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.omniD3State?.ready, null, { timeout: 60000 });
    const d3s = await page.evaluate(() => window.omniD3State);
    assert.equal(d3s.error, undefined, d3s.error);
    assert.equal(d3s.d3, '7.9.0', 'd3 7.9.0 loaded, its SRI accepted');
    assert.equal(d3s.year, year);
    assert.ok(d3s.features.length > 10);
    assert.deepEqual(d3s.features, ml, `${year}: the same rows`);
    assert.equal(d3s.paths, d3s.features.length, 'a path for each');
    assert.match(await page.textContent('#d3-meta'), new RegExp(`^${year}: ${ml.length} outlines`));
  }
  assert.deepEqual(errors, []);
});
