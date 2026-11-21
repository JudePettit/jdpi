// Digital Science · Omni-Map, stage S5a of PRP-SCHOLAR-USP-DESIGN.md (4.2): the layer engine, the recipe's layer keys,
// the catalogue's checks, and the data of the first layers (the countries base, population density by country and as
// a grid), in Node. The page's part (a switch by keyboard fetches its layer only then; the legend's words; l= kept;
// old addresses; the d3 adapter against the MapLibre page) is tests/omni-layers-page.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as L from '../omni/lib/layers.js';
import { readRecipe, writeRecipe } from '../design/vm-recipe.js';
import '../design/prp-map.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const raw = p => readFileSync(join(ROOT, p));
const read = p => JSON.parse(raw(p).toString('utf8'));
const M = globalThis.PRPMap;
const DOC = read('omni/data/layers.json');
const CAT = L.catalogue(DOC);
const SOURCES = read('integration/sources.json').sources;
const LIMIT_GZ = 1.5 * 1024 * 1024;
const sha = b => createHash('sha256').update(b).digest('hex');
// Sources VM may not build from (their terms bar commercial use or redistribution, or are unclear): never a row's source.
const BARRED = /\b(cow|correlates[- ]of[- ]war|cshapes|archigos|prio)\b/i;

/* ---------------------------------------------------------------- the catalogue */
test('catalogue: readLayer accepts every entry; each absent line passes readAbsent; ids are unique', () => {
  for (const e of DOC.layers) { const r = M.readLayer(e); assert.ok(r.ok, `${e.id}: ${r.errors.join('; ')}`); }
  for (const a of DOC.absent) { const r = M.readAbsent(a); assert.ok(r.ok, `${a.id}: ${r.errors.join('; ')}`); }
  const ids = [...DOC.layers.map(e => e.id), ...DOC.absent.map(a => a.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(DOC.layers.slice(0, 11).map(e => e.id), ['borders', 'battles', 'countries', 'density-country', 'density-grid', 'density-hyde',
    'conflict-territory', 'elections', 'coups', 'political-change', 'breakthroughs']); // S5b's layers of history follow S5a's
  // S5c's follow (their own checks are in tests/omni-now.test.mjs), then the stand-ins (tests/standins.test.mjs).
  assert.ok(DOC.layers.slice(11).every(e => /^(wb|standin)-/.test(e.id) || ['gvi', 'ucdp-events', 'calendar-events'].includes(e.id)));
  // F1 (S5a review): HYDE 3.2.1 is built, so nothing is left out for want of free data in S5a; S5c leaves out SIPRI's
  // military expenditure, whose terms bar commercial use; D1 (S5b/S5c review) the three series the IEA's terms keep
  // outside CC BY 4.0; X1 (second review) IHME's PM2.5 exposure and ITU's two series, whose originators' terms bar
  // commercial use.
  assert.deepEqual(DOC.absent.map(a => a.id).sort(), ['wb-eg-fec-rnew-zs', 'wb-eg-use-pcap-kg-oe', 'wb-en-atm-pm25-mc-m3', 'wb-en-ghg-co2-pc-ce-ar5',
    'wb-it-cel-sets-p2', 'wb-it-net-user-zs', 'wb-ms-mil-xpnd-gd-zs']);
});

test('catalogue: readLayer refuses a bad role, time.values that do not match from and to, and a bad statusBy', () => {
  const good = DOC.layers.find(e => e.id === 'density-grid');
  assert.ok(M.readLayer(good).ok);
  assert.match(M.readLayer({ ...good, role: 'decoration' }).errors.join(), /role/);
  assert.match(M.readLayer({ ...good, time: { ...good.time, from: 1970 } }).errors.join(), /first and last/);
  assert.match(M.readLayer({ ...good, time: { ...good.time, values: [1975, 1975, 2030] } }).errors.join(), /rising/);
  assert.match(M.readLayer({ ...good, statusBy: [{ from: 2025 }] }).errors.join(), /statusBy/);
  assert.equal(M.readAbsent({ id: 'x', title: 'X', why: 'w', url: 'http://a', read: '2026-11-18' }).ok, false, 'an absent line needs https');
  assert.equal(M.readAbsent({ id: 'x', title: 'X', url: 'https://a', read: '2026-11-18' }).ok, false, 'an absent line says why');
  const hyde = DOC.layers.find(e => e.id === 'density-hyde');
  assert.match(M.readLayer({ ...hyde, time: { ...hyde.time, until: 1960 } }).errors.join(), /until/, 'time.until is at or after time.to');
});

test('catalogue: time.from and time.to equal the first and last years of each layer\'s data', () => {
  const grid = CAT.byId.get('density-grid'), gi = read(grid.data);
  assert.deepEqual(grid.time.values, gi.years);
  assert.deepEqual([grid.time.from, grid.time.to], [gi.years[0], gi.years.at(-1)]);
  assert.deepEqual(gi.files.map(f => f.year), gi.years);
  const wb = CAT.byId.get('density-country'), series = read(wb.data);
  assert.deepEqual([wb.time.from, wb.time.to], [series.years[0], series.years.at(-1)]);
  assert.deepEqual([series.years[0], series.years.at(-1)], [1961, 2024]);
  // Every year has a value for at least one economy, so the first and last are years the data holds, not its frame.
  for (const i of [0, series.years.length - 1]) assert.ok(Object.values(series.values).some(v => v[i] != null), `${series.years[i]} has values`);
  assert.deepEqual(gi.years, [1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2030]);
  const hyde = CAT.byId.get('density-hyde'), hi = read(hyde.data);
  assert.deepEqual(hyde.time.values, hi.years); assert.deepEqual([hyde.time.from, hyde.time.to], [hi.years[0], hi.years.at(-1)]);
  assert.deepEqual([hi.years[0], hi.years.at(-1), hi.years.length], [-4000, 1970, 48]);
  assert.ok(!hi.years.includes(0), 'no year 0');
  assert.equal(hyde.time.until, 1974, 'its 1970 stands until GHSL begins');
});

test('data: every layer file is within 1.5 MB gzipped and listed with its sha256, bytes and gzipped size', () => {
  const listed = [];
  for (const e of DOC.layers) for (const f of e.files || []) listed.push(f);
  const gi = read('omni/data/layers/density/index.json'), hi = read('omni/data/layers/density-hyde/index.json');
  for (const f of gi.files) listed.push({ ...f, file: `omni/data/layers/density/${f.file}` });
  for (const f of hi.files) listed.push({ ...f, file: `omni/data/layers/density-hyde/${f.file}` });
  // S5c's files are listed by their own layers (tests/omni-now.test.mjs checks which), and the stand-ins' by theirs
  // (tests/standins.test.mjs); every one is measured below.
  const S5C = /^omni\/data\/layers\/(?:wb\/(?!EN\.POP\.DNST\.json)|gvi\/|ucdp-events\/|calendar\/|standin\/)/;
  assert.deepEqual(listed.map(f => f.file).filter(p => !S5C.test(p)).sort(), [
    'omni/data/base/countries.topo.json', 'omni/data/base/small-states.json', 'omni/data/layers/wb/EN.POP.DNST.json',
    ...gi.years.map(y => `omni/data/layers/density/${y}.json`), ...hi.years.map(y => `omni/data/layers/density-hyde/${y < 0 ? `m${-y}` : y}.json`),
    // S5b: the layers of history, and the Political Retrospective's address table, listed by each layer that opens it.
    'omni/data/layers/conflict-territory/conflicts.json', 'omni/data/layers/elections/elections.json', 'omni/data/layers/coups/coups.json',
    'omni/data/layers/political-change/terms.json', 'omni/data/layers/breakthroughs/events.json', ...Array(3).fill('omni/data/layers/retro-keys.json')].sort());
  for (const f of listed) {
    const b = raw(f.file), gz = gzipSync(b, { level: 9 }).length;
    assert.equal(sha(b), f.sha256, `${f.file}: sha256`);
    assert.equal(b.length, f.bytes, `${f.file}: bytes`);
    assert.ok(gz <= LIMIT_GZ, `${f.file}: ${gz} bytes gzipped`);
  }
  // Nothing in the grid's folder that its index does not list.
  assert.deepEqual(readdirSync(join(ROOT, 'omni/data/layers/density')).sort(), [...gi.files.map(f => f.file), 'index.json'].sort());
  assert.deepEqual(readdirSync(join(ROOT, 'omni/data/layers/density-hyde')).sort(), [...hi.files.map(f => f.file), 'index.json'].sort());
  for (const p of ['omni/data/layers/density/index.json', 'omni/data/layers/density-hyde/index.json', 'omni/data/layers.json']) assert.ok(gzipSync(raw(p)).length <= LIMIT_GZ);
});

test('data: every value has its source line; each grid file names its GHSL file and the zip it came from by sha256', () => {
  const ids = new Set(SOURCES.map(s => s.id));
  for (const e of DOC.layers) assert.ok(ids.has(e.source), `${e.id}: ${e.source} is in integration/sources.json`);
  for (const a of DOC.absent) assert.ok(ids.has(a.source), `${a.id}: ${a.source} is in integration/sources.json`);
  const gi = read('omni/data/layers/density/index.json');
  for (const f of gi.files) {
    const g = read(`omni/data/layers/density/${f.file}`);
    assert.equal(g.format, 'vm-grid/1'); assert.equal(g.source, 'ghsl-pop'); assert.equal(g.year, f.year);
    assert.equal(g.source_loc, f.from.file.replace(/\.zip$/, '.tif'));
    assert.match(f.from.url, /^https:\/\/jeodpp\.jrc\.ec\.europa\.eu\/ftp\/jrc-opendata\/GHSL\/GHS_POP_GLOBE_R2023A\//);
    assert.match(f.from.sha256, /^[0-9a-f]{64}$/);
    assert.equal(g.status, f.year >= 2025 ? 'projection' : 'modelled');
    // The cells: [step, people] pairs, rising, inside the grid, people > 0, summing to the file's total.
    const cells = L.gridCells(g.cells);
    assert.equal(cells.length, g.populated);
    assert.ok(cells.every((c, i) => c.index < g.cols * g.rows && c.people > 0 && (!i || c.index > cells[i - 1].index)));
    const sum = cells.reduce((a, c) => a + c.people, 0);
    assert.ok(Math.abs(sum - g.total) <= g.populated * 0.5 + 1, `${f.file}: cells sum to the total (${sum} against ${g.total})`);
  }
  // HYDE's files: each names its archive entry, and the archive by its sha256 and its address at DANS.
  const hi = read('omni/data/layers/density-hyde/index.json');
  for (const f of hi.files) {
    const g = read(`omni/data/layers/density-hyde/${f.file}`);
    assert.equal(g.format, 'vm-grid/1'); assert.equal(g.source, 'hyde-3.2.1'); assert.equal(g.year, f.year); assert.equal(g.status, 'modelled');
    assert.equal(g.source_loc, `baseline/asc/${f.label}_pop/popc_${f.label}.asc`); assert.equal(f.from.entry, g.source_loc);
    assert.equal(f.from.sha256, '5a847086cb199c75b739a7b099a8c48840e52fe5a4937882bd8fb26f86288714');
    assert.equal(f.from.url, 'https://archaeology.datastations.nl/api/access/datafile/5490328');
    const cells = L.gridCells(g.cells), sum = cells.reduce((a, c) => a + c.people, 0);
    assert.equal(cells.length, g.populated);
    assert.ok(Math.abs(sum - g.total) <= g.populated * 0.5 + 1, `${f.file}: cells sum to the total`);
  }
  assert.deepEqual(hi.breaks, gi.breaks, 'HYDE takes the GHSL grid\'s classes, so a colour means the same density');
  const s = read('omni/data/layers/wb/EN.POP.DNST.json');
  assert.equal(s.source, 'world-bank-wdi'); assert.equal(s.indicator, 'EN.POP.DNST');
  assert.match(s.licence, /^CC BY-?4\.0$/);
  for (const [iso, v] of Object.entries(s.values)) {
    assert.match(iso, /^[A-Z]{3}$/); assert.equal(v.length, s.years.length);
    assert.ok(v.every(x => x === null || (typeof x === 'number' && x >= 0)), iso);
  }
  const topo = read('omni/data/base/countries.topo.json'), small = read('omni/data/base/small-states.json');
  assert.equal(topo.vm.source, 'natural-earth'); assert.equal(small.source, 'natural-earth');
  for (const d of [topo.vm, small]) assert.match(d.file, /^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/v5\.1\.1\/geojson\//);
  const fc = M.decode(topo, 'countries');
  assert.equal(fc.features.length, 177);
  assert.ok(fc.features.every(f => /^ne-[A-Z0-9]{3}$/.test(f.id) && f.properties.n));
  // F5: each country keeps Natural Earth's Wikidata id, for S5b's joins by Q-id.
  assert.ok(fc.features.filter(f => /^Q\d+$/.test(f.properties.q || '')).length >= 170, 'Q-ids kept');
  assert.equal(fc.features.find(f => f.properties.iso3 === 'FRA').properties.q, 'Q142');
  // F3: the economies with a value that no shape or point holds are named, in the file and in the layer's entry.
  assert.deepEqual(Object.keys(s.unplaced), ['CHI', 'GIB']); assert.deepEqual(DOC.layers.find(e => e.id === 'density-country').unplaced, s.unplaced);
  assert.equal(small.points.length, 64);
  assert.ok(small.points.every(p => p.at.length === 2 && Math.abs(p.at[0]) <= 180 && Math.abs(p.at[1]) <= 90));
});

test('data: no row comes from a barred or unclear source (cow, CShapes, Archigos, PRIO), and none is named under omni/', () => {
  for (const e of [...DOC.layers, ...DOC.absent]) assert.doesNotMatch(e.source, BARRED, e.id);
  for (const f of ['omni/data/layers/wb/EN.POP.DNST.json', 'omni/data/layers/density/index.json', 'omni/data/base/small-states.json'])
    assert.doesNotMatch(JSON.stringify(read(f).source), BARRED, f);
  const walk = d => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? walk(`${d}/${x.name}`) : [`${d}/${x.name}`]));
  for (const f of walk('omni').filter(f => /\.(js|mjs|json|html|md)$/.test(f) && !/\/data\/layers\/density(-hyde)?\/m?\d+\.json$/.test(f)))
    assert.doesNotMatch(raw(f).toString('utf8'), /cshapes/i, f);
  // Each layer's source is one whose terms permit commercial use, redistribution and adaptation.
  for (const id of ['natural-earth-admin0', 'world-bank-wdi', 'ghsl-pop', 'hyde-3.2.1']) {
    const s = SOURCES.find(x => x.id === id);
    assert.ok(s, id); assert.match(s.licence, /^(Public domain|CC BY 4\.0|CC0 1\.0)$/, id); assert.match(s.termsUrl, /^https:\/\//, id);
  }
  const hyde = SOURCES.find(x => x.id === 'hyde');
  assert.equal(hyde.held, false, 'HYDE 3.3 (behind a bot check) is listed as not held');
  const h321 = SOURCES.find(x => x.id === 'hyde-3.2.1');
  assert.equal(h321.termsRead, '2026-11-20'); assert.match(h321.readme, /CC BY 3\.0/); assert.match(h321.databaseRight, /CC BY 3\.0[^.]*says nothing/);
  // F2: the World Bank's series that rests on FAO's land area says so, with FAO's own terms as read.
  const wb = SOURCES.find(x => x.id === 'world-bank-wdi');
  assert.match(wb.inputs, /fao\.org\/contact-us\/terms\/db-terms-of-use/); assert.match(wb.inputs, /read 20 November 2026/);
  assert.match(DOC.layers.find(e => e.id === 'density-country').method, /FAO’s terms for its statistical databases/);
});

/* ---------------------------------------------------------------- the clutter rule */
const pts = ids => ({ layers: [...DOC.layers, ...ids.map(id => ({ ...DOC.layers[1], id, title: `Layer ${id}` }))] });

test('clutter: one fill, one base, at most three point or line layers; a fourth replaces the oldest, with a note', () => {
  const cat = L.catalogue(pts(['p2', 'p3', 'p4']));
  let s = L.emptySet(), r;
  for (const id of ['battles', 'p2', 'p3']) { r = L.switchOn(s, id, cat); s = r.set; assert.deepEqual(r.dropped, []); }
  r = L.switchOn(s, 'p4', cat);
  assert.deepEqual(r.set.points, ['p2', 'p3', 'p4']);
  assert.deepEqual(r.dropped, [{ id: 'battles', why: 'points' }]);
  assert.match(r.note, /^Battles switched off: the map draws at most 3 point or line layers/);
  assert.match(r.note, /Show anyway/);
  // A second fill replaces the first.
  r = L.switchOn(L.switchOn(L.emptySet(), 'density-country', cat).set, 'density-grid', cat);
  assert.equal(r.set.fill, 'density-grid');
  assert.match(r.note, /Population density \(grid\) replaces Population density \(by country\): the map draws one fill at a time/);
  // The borders are always drawn and cannot be switched; an unknown id is named.
  assert.deepEqual(L.switchOn(L.emptySet(), 'borders', cat).set, L.emptySet());
  assert.match(L.switchOn(L.emptySet(), 'nope', cat).note, /VM holds no "nope" layer/);
});

test('clutter: the subject\'s layer is never dropped; Show anyway lifts the limit, and unticked the oldest give way', () => {
  const cat = L.catalogue(pts(['p2', 'p3', 'p4', 'p5']));
  let s = L.emptySet();
  for (const id of ['battles', 'p2', 'p3', 'p4']) s = L.switchOn(s, id, cat, { subject: 'battles' }).set;
  assert.deepEqual(s.points, ['battles', 'p3', 'p4'], 'p2 gave way, not the subject\'s battles');
  s = L.setAnyway(s, true, cat).set;
  for (const id of ['p2', 'p5']) s = L.switchOn(s, id, cat).set;
  assert.deepEqual(s.points, ['battles', 'p3', 'p4', 'p2', 'p5']);
  const r = L.setAnyway(s, false, cat, { subject: 'battles' });
  assert.deepEqual(r.set.points, ['battles', 'p2', 'p5']);
  assert.equal(r.dropped.length, 2);
  assert.deepEqual(L.layersOn({ ...r.set, base: 'countries', fill: 'density-grid' }), ['countries', 'density-grid', 'battles', 'p2', 'p5']);
  assert.deepEqual(L.switchOff(r.set, 'p2').points, ['battles', 'p5']);
});

test('clustering: above 2,000 visible points, points cluster', () => {
  assert.equal(L.CLUSTER_AT, 2000);
  assert.equal(L.clusters(2000), false);
  assert.equal(L.clusters(2001), true);
});

/* ---------------------------------------------------------------- the recipe */
test('recipe: each layer switched on is written in the recipe, and read back; a fill or base in l= is read into its own key', () => {
  let s = L.emptySet();
  for (const id of ['countries', 'density-country', 'battles']) s = L.switchOn(s, id, CAT).set;
  const keys = L.toRecipe(s, CAT);
  assert.deepEqual(keys, { fill: 'wb:EN.POP.DNST', base: 'countries', l: [{ id: 'battles' }], all: undefined });
  const text = writeRecipe({ vr: 1, at: 1990, ...keys });
  assert.equal(text, 'vr=1&at=1990&base=countries&fill=wb:EN.POP.DNST&l=battles');
  const back = L.fromRecipe(readRecipe(text), CAT);
  assert.deepEqual(back.set, s); assert.deepEqual(back.unknown, []);
  // The grid by its id; and given in l=, read into fill=.
  assert.equal(L.fromRecipe(readRecipe('vr=1&at=2000&fill=density-grid'), CAT).set.fill, 'density-grid');
  const inL = L.fromRecipe(readRecipe('vr=1&at=2000&l=density-grid,countries,battles'), CAT).set;
  assert.deepEqual([inL.fill, inL.base, inL.points], ['density-grid', 'countries', ['battles']]);
  // Show anyway: all=1, up to twelve point or line layers in l=.
  const cat = L.catalogue(pts(['p2', 'p3', 'p4']));
  const many = L.fromRecipe(readRecipe('vr=1&at=1500&l=battles,p2,p3,p4&all=1'), cat).set;
  assert.deepEqual([many.anyway, many.points], [true, ['battles', 'p2', 'p3', 'p4']]);
  assert.equal(writeRecipe({ vr: 1, at: 1500, ...L.toRecipe(many, cat) }), 'vr=1&at=1500&base=plain&fill=borders&l=battles,p2,p3,p4&all=1');
  assert.equal(readRecipe('vr=1&l=a,b,c,d').l, undefined, 'without all=1, four in l= is not a recipe\'s l= (as before S5a)');
});

test('recipe: addresses from before S5a open as before; an unknown id is named and not drawn', () => {
  const old = readRecipe('vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853');
  const r = L.fromRecipe(old, CAT);
  assert.deepEqual(r.set, { ...L.emptySet(), points: ['battles'] });
  assert.deepEqual(L.toRecipe(r.set, CAT), { fill: 'borders', base: 'plain', l: [{ id: 'battles' }], all: undefined });
  assert.deepEqual(L.fromRecipe(readRecipe('vr=1&at=1494'), CAT).set, L.emptySet());
  const u = L.fromRecipe(readRecipe('vr=1&at=1494&fill=wb:NO.SUCH.CODE&l=battles,shipwrecks'), CAT);
  assert.deepEqual(u.unknown, ['wb:NO.SUCH.CODE', 'shipwrecks']); // S5c built wb:NY.GDP.MKTP.CD (tests/omni-now.test.mjs)
  assert.deepEqual(u.set.points, ['battles']); assert.equal(u.set.fill, null);
  // A filter rides on its l= entry.
  const f = L.fromRecipe(readRecipe('vr=1&at=1500&l=battles:partOf=Q33143'), CAT).set;
  assert.deepEqual(f.filters, { battles: { field: 'partOf', value: 'Q33143' } });
  assert.equal(writeRecipe({ vr: 1, ...L.toRecipe(f, CAT) }), 'vr=1&base=plain&fill=borders&l=battles:partOf=Q33143');
});

/* ---------------------------------------------------------------- years, status, legend */
test('years: a layer whose years miss the frame says so; the grid shows the epoch at or before the frame', () => {
  const wb = CAT.byId.get('density-country'), grid = CAT.byId.get('density-grid'), base = CAT.byId.get('countries');
  assert.equal(M.heldText(wb, 1494), 'Population density (by country) holds 1961 to 2024; the map is at 1494');
  assert.equal(M.heldText(wb, 1961), null); assert.equal(M.heldText(wb, 2024), null);
  assert.equal(M.heldText(grid, 1974), 'Population density (grid) holds 1975 to 2030; the map is at 1974');
  assert.equal(M.heldText(base, 1494), 'Countries today holds 1886 to 2024; the map is at 1494');
  assert.equal(M.layerYear(grid, 1999), 1995); assert.equal(M.layerYear(grid, 2024), 2020); assert.equal(M.layerYear(grid, 1974), null);
  assert.equal(M.layerYear(wb, 1990), 1990);
  const hyde = CAT.byId.get('density-hyde');
  assert.equal(M.layerYear(hyde, 1494), 1400); assert.equal(M.layerYear(hyde, 50), -1000, 'HYDE’s “0 AD” is left out');
  assert.equal(M.layerYear(hyde, 1972), 1970); assert.equal(M.heldText(hyde, 1974), null, 'its 1970 stands to 1974');
  assert.equal(M.layerYear(hyde, 1975), null); assert.equal(M.layerYear(hyde, -4001), null);
  assert.equal(M.heldText(hyde, 1990), 'Population density before 1975 (HYDE) holds 4000 BC to 1970; the map is at 1990');
  assert.equal(M.statusAt(grid, 2020), 'modelled'); assert.equal(M.statusAt(grid, 2025), 'projection'); assert.equal(M.statusAt(grid, 2030), 'projection');
});

test('legend: names measure, precision, status, source and licence for each new layer', () => {
  const lg = (id, year) => { const g = M.legend(CAT.byId.get(id), { sources: SOURCES, year }); return [g.title, ...g.lines, g.credit].join(' | '); };
  const grid = lg('density-grid', 2003);
  for (const w of ['Source: GHSL', 'CC BY 4.0', 'Status: modelled', 'Measure: people per km² (0.25° cells)', 'at 2003 the map shows 2000', '0.25°']) assert.ok(grid.includes(w), `grid: ${w} in ${grid}`);
  assert.ok(lg('density-grid', 2026).includes('Status: projection'));
  const wb = lg('density-country', 1990);
  for (const w of ['Source: World Bank WDI', 'CC BY 4.0', 'Status: as the World Bank estimates it', 'Measure: people per km² of land area', 'today’s borders', 'Dates at the precision']) assert.ok(wb.includes(w), `wb: ${w} in ${wb}`);
  const base = lg('countries', 2000);
  for (const w of ['Source: Natural Earth v5.1.1', 'Public domain', 'Made with Natural Earth.', 'today’s borders']) assert.ok(base.includes(w), `countries: ${w} in ${base}`);
  for (const e of DOC.layers.filter(x => ['countries', 'density-country', 'density-grid', 'density-hyde'].includes(x.id))) assert.match(e.method, /^VM’s own text/, e.id);
  const hyde = lg('density-hyde', 1494);
  for (const w of ['Source: HYDE 3.2.1', 'CC0 1.0', 'Status: modelled', 'a modelled reconstruction', 'at 1494 the map shows 1400', '48 years from 4000 BC to 1970']) assert.ok(hyde.includes(w), `hyde: ${w} in ${hyde}`);
});

/* ---------------------------------------------------------------- the grid's cells */
test('grid: cells are placed and sized as the builder made them; classes and labels follow the breaks', () => {
  assert.deepEqual(L.cellOf(0), { row: 0, col: 0, west: -180, north: 90 });
  assert.deepEqual(L.cellOf(1441), { row: 1, col: 1, west: -179.75, north: 89.75 });
  assert.deepEqual(L.gridCells([5, 10, 2, 7]), [{ index: 5, people: 10 }, { index: 7, people: 7 }]);
  // The rows of a 0.25° band sum to the Earth's area on the sphere of radius 6,371.0088 km.
  let total = 0;
  for (let r = 0; r < 720; r++) total += L.cellArea(r) * 1440;
  assert.ok(Math.abs(total - 4 * Math.PI * 6371.0088 ** 2) < 1);
  assert.ok(L.cellArea(359) > L.cellArea(0) * 100, 'a cell at the equator is far larger than one at the pole');
  const b = CAT.byId.get('density-country').style.breaks;
  assert.deepEqual([L.classOf(5, b), L.classOf(10, b), L.classOf(499, b), L.classOf(500, b)], [0, 1, 5, 6]);
  assert.deepEqual(L.classLabels([10, 25, 50]), ['under 10', '10 to 25', '25 to 50', '50 and over']);
  // R3: the classes start at the ramp's second step and end at its last.
  assert.deepEqual(Array.from({ length: 7 }, (_, k) => L.tokenOf(k, 7)), [2, 3, 5, 6, 7, 9, 10]);
  assert.ok(Array.from({ length: 10 }, (_, k) => L.tokenOf(k, 10)).every(x => x >= 2 && x <= 10));
  assert.ok(Math.abs(L.mercatorLat(0, 1000) - 85.0511) < 0.2); assert.ok(Math.abs(L.mercatorLat(499.5, 1000)) < 1e-9);
});

/* ---------------------------------------------------------------- the d3 adapter, and what stays pure */
test('d3 adapter: slices exactly the rows the core slices; loads no code; the test page pins d3 7.9.0 with its SRI', async () => {
  await import('../design/prp-map-d3.js');
  const D = globalThis.PRPMapD3;
  const index = read('omni/data/borders/index.json');
  for (const year of [1494, 1900]) {
    const topo = read(`omni/data/borders/${M.fileFor(index, year).file}`);
    const ids = D.ids(D.slice(topo, year));
    assert.deepEqual(ids, M.sliceAt(M.decode(topo), year).filter(f => f.geometry).map(f => f.id).sort());
    assert.ok(ids.length > 10, `${year}: ${ids.length} rows`);
  }
  const src = raw('design/prp-map-d3.js').toString('utf8');
  assert.doesNotMatch(src, /\bimport\b|<script|createElement\(['"]script|fetch\(/, 'the adapter loads nothing');
  const core = raw('design/prp-map.js').toString('utf8');
  assert.doesNotMatch(core, /\bd3\b|document\.|window\.d3|maplibregl/, 'design/prp-map.js stays pure');
  const html = raw('omni/d3.html').toString('utf8');
  const tags = html.match(/<script\b[^>]*\bsrc="https?:[^"]+"[^>]*>/g);
  assert.deepEqual(tags, ['<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js" integrity="sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i" crossorigin="anonymous">']);
  assert.doesNotMatch(html, /<script>(?!<\/script>)|<style>|\son[a-z]+="/, 'no inline script or style');
  // The Omni-Map itself loads no d3.
  assert.doesNotMatch(raw('omni/index.html').toString('utf8'), /d3@|d3\.min/);
});

// Fixer, 20 November 2026 (review finding P1): d3 reads a ring wound counter-clockwise on the map as the whole globe
// less the shape, so rewind() winds every outer ring clockwise and every hole counter-clockwise; Cliopatria's rows
// in the omni files are wound both ways (at 1938, 25 of 90 polity rows the way d3 would fill inside out).
test('d3 adapter: rewind() winds outer rings clockwise and holes counter-clockwise, in place', async () => {
  await import('../design/prp-map-d3.js');
  const D = globalThis.PRPMapD3;
  const signed = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a; };
  const ccw = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], cwHole = [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]];
  const fc = { features: [{ geometry: { type: 'Polygon', coordinates: [ccw, cwHole] } }, { geometry: { type: 'MultiPolygon', coordinates: [[ccw.slice().reverse()], [ccw]] } }, { geometry: null }] };
  assert.equal(D.rewind(fc, null), fc);
  const [outer, hole] = fc.features[0].geometry.coordinates;
  assert.ok(signed(outer) < 0 && signed(hole) > 0);
  assert.ok(fc.features[1].geometry.coordinates.every(([r]) => signed(r) < 0));
  // Every polity row of 1938 in the omni file, rewound, has its outer rings clockwise.
  const topo = read('omni/data/borders/1900-1999.topo.json');
  const rows = D.rewind({ features: M.sliceAt(M.decode(topo), 1938).filter(f => f.properties.k === 'POLITY' && f.geometry) }, null).features;
  const polys = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
  assert.deepEqual(rows.filter(f => polys(f).some(p => signed(p[0]) > 0)).map(f => f.properties.n), []);
  assert.match(raw('design/prp-map-d3.js').toString('utf8'), /rewind\(fc, d3\);/, 'draw() rewinds');
});

test('engine: omni/lib/layers.js is pure (no DOM, no fetch) and names no layer of its own', () => {
  const src = raw('omni/lib/layers.js').toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /document|window|fetch\(|import\s/);
  assert.doesNotMatch(src, /'(battles|density-grid|density-country)'/, 'S5b and S5c add catalogue entries, not engine code');
  assert.ok(existsSync(join(ROOT, 'omni/lib/layer-view.js')));
});

/* ---------------------------------------------------------------- R1: the catalogue's head, however large it grows */
test('head: every writer of the catalogue writes its head (only `generated`), which stays a few bytes however many layers it holds', async () => {
  const { putLayer, writeCatalogue, headOf } = await import('../omni/scripts/layer-catalogue.mjs');
  const { updateLayer } = await import('../omni/scripts/build-borders.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'vm-head-')), file = join(dir, 'layers.json');
  try {
    copyFileSync(join(ROOT, 'omni/data/layers.json'), file);
    // S5b and S5c add layers: two hundred more, each with a long method, and the head stays the same size.
    for (let i = 0; i < 200; i++) putLayer(file, { ...DOC.layers.find(e => e.id === 'density-grid'), id: `grown-${i}`, method: 'x'.repeat(2000), built: `2026-12-01T00:00:${String(i % 60).padStart(2, '0')}Z` });
    const cat = JSON.parse(readFileSync(file, 'utf8')), head = readFileSync(headOf(file));
    assert.ok(readFileSync(file).length > 400000, 'the catalogue has grown');
    assert.ok(head.length < 200, `the head is ${head.length} bytes`);
    assert.deepEqual(JSON.parse(head), { format: 'vm-layers-head/1', of: 'omni/data/layers.json', generated: cat.generated });
    // build-borders.mjs's updateLayer (the borders and the battles) writes it too.
    updateLayer(file, 'battles', { built: '2027-01-01T00:00:00Z', time: {} });
    assert.equal(JSON.parse(readFileSync(headOf(file))).generated, '2027-01-01T00:00:00Z');
    writeCatalogue(file, { ...cat, generated: 'g' });
    assert.equal(JSON.parse(readFileSync(headOf(file))).generated, 'g');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // The head the site holds follows its catalogue, and no script writes the catalogue but through writeCatalogue.
  assert.equal(read('omni/data/layers.head.json').generated, DOC.generated);
  for (const f of readdirSync(join(ROOT, 'omni/scripts')).filter(f => f.endsWith('.mjs') && f !== 'layer-catalogue.mjs')) {
    const src = raw(`omni/scripts/${f}`).toString('utf8');
    assert.doesNotMatch(src, /writeFileSync\((LAYERS|file), JSON\.stringify\(cat\b/, `${f} writes the catalogue only through writeCatalogue`);
  }
});

/* ---------------------------------------------------------------- the HYDE builder's inflater */
test('HYDE builder: its inflater reads what zlib packs (Deflate at every level, stored blocks); Deflate64 is checked by CRC-32 at build', async () => {
  const { inflate, yearOf, countryTotals } = await import('../omni/scripts/build-density-hyde.mjs');
  const text = Buffer.from('ncols 4320 nrows 2160 0.0000000E+00 -9999.0 12.5 '.repeat(4000));
  const noise = Buffer.from(Array.from({ length: 100000 }, (_, i) => (i * 7919 + (i >> 3)) & 255));
  for (const b of [text, noise, Buffer.alloc(70000, 7)]) for (const level of [0, 1, 6, 9]) assert.ok(inflate(deflateRawSync(b, { level }), b.length).equals(b), `level ${level}`);
  assert.throws(() => inflate(deflateRawSync(text), text.length + 1), /bytes, not/);
  assert.deepEqual(['4000BC', '100AD', '1970AD', '0AD', 'x'].map(yearOf), [-4000, 100, 1970, null, null]);
  assert.deepEqual(countryTotals('region -4000 1970\n1 1 2\n2 3 4\nTotal 4 6\n'), { '-4000': 4, 1970: 6 });
  assert.throws(() => countryTotals('region -4000\n1 1\nTotal 5\n'), /do not add up/);
});
