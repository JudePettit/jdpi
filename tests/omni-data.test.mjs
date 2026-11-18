// The Omni-Map's data, stage S1 (PRP-SCHOLAR-USP-DESIGN.md 4.2, 5.1, 5.2, 7.3; the reader-pane contract, item 5):
//   omni/data/borders/        Cliopatria v0.2.1's rows, every year it holds (3400 BC to AD 2024; 1400–1600 until 18
//                             November 2026), as dated TopoJSON (omni/scripts/build-borders.mjs),
//                             with qids.json, the crosswalk from Q-ids to Cliopatria's names by year
//   omni/data/base/           Natural Earth 5.1.1's land, the plain base (omni/scripts/build-base.mjs)
//   omni/data/layers/battles.json  the battles VM holds for these years, read from Wikidata (omni/scripts/build-battles.mjs)
//   omni/data/layers.json     the layer catalogue (4.2's shape)
//   integration/sources.json  VM's sources, v1 (5.1), agreeing with integration/scripts/cite-only.mjs
//   lake/scripts/coords.mjs, refs.mjs  a point and a reference read from a Wikidata claim (5.1), for the lake builder
//   bibliotheca/data/periods/the-prince.json  the periods file (contract item 5), with no record yet (S4 writes them)
// Floors and shapes, not counts a refresh would change; these files have no scheduled refresh, so the two battles'
// recorded values are asserted as committed. No network. PRP_CPU_LIMIT_MS raises the CPU limit on a slower machine
// (default 40 ms, 80 on CI), as tests/integration-hub.test.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../design/prp-focus.js';
import '../design/prp-map.js';
import { readPeriods } from '../design/vm-click.js';
import { CITE_ONLY, namesSource } from '../integration/scripts/cite-only.mjs';

const M = globalThis.PRPMap;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const raw = p => readFileSync(join(ROOT, p));
const json = p => JSON.parse(raw(p).toString('utf8'));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const LIMIT_GZ = 1.5 * 1024 * 1024; // 7.3: each file at most 1.5 MB compressed

const INDEX = 'omni/data/borders/index.json';
const index = json(INDEX);
const fcs = new Map(index.files.map(f => [f.file, M.decode(json(`omni/data/borders/${f.file}`))]));
const fcAt = y => fcs.get(M.fileFor(index, y).file);
const qids = json('omni/data/borders/qids.json');
const sources = json('integration/sources.json');
const layers = json('omni/data/layers.json');
const battles = json('omni/data/layers/battles.json');

test('borders: the index covers 3400 BC to AD 2024, every year Cliopatria v0.2.1 holds, with no gap', () => {
  assert.equal(index.format, 'vm-borders-index/1');
  assert.equal(index.source, 'cliopatria');
  assert.equal(index.version, 'v0.2.1', 'the version is the release tag (7.3)');
  assert.equal(index.from, -3400); assert.equal(index.to, 2024);
  assert.match(index.built, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const files = [...index.files].sort((a, b) => a.from - b.from);
  assert.ok(files.length >= 2);
  assert.equal(files[0].from, -3400); assert.equal(files.at(-1).to, 2024);
  for (let i = 1; i < files.length; i++) assert.equal(files[i].from, files[i - 1].to + 1, `no gap or overlap before ${files[i].file}`);
  assert.deepEqual(M.held(index), { from: -3400, to: 2024 });
  assert.equal(M.fileFor(index, -3401), null); assert.equal(M.fileFor(index, 2025), null);
  assert.equal(M.fileFor(index, 1494).file, '1400-1499.topo.json');
  assert.equal(M.fileFor(index, 1600).file, '1600-1699.topo.json');
  assert.equal(M.fileFor(index, 2024).file, '2000-2024.topo.json', 'the last year is held');
  assert.equal(M.fileFor(index, -3400).file, 'm3400-m301.topo.json', 'and the first');
});

test('borders: each file decodes, matches its index entry and stays within 1.5 MB compressed', () => {
  for (const f of index.files) {
    const p = `omni/data/borders/${f.file}`, bytes = raw(p), topo = JSON.parse(bytes.toString('utf8'));
    const y = n => (n < 0 ? `m${-n}` : String(n)); // a year below zero as m and its digits
    assert.equal(f.file, `${y(f.from)}-${y(f.to)}.topo.json`);
    assert.equal(sha256(bytes), f.sha256, `${f.file}: sha256 as the index records`);
    assert.equal(bytes.length, f.bytes, `${f.file}: bytes`);
    const gz = gzipSync(bytes, { level: 9 }).length;
    assert.ok(gz <= LIMIT_GZ, `${f.file}: ${gz} bytes gzipped (limit ${LIMIT_GZ})`);
    assert.ok(Math.abs(gz - f.gzip) <= 64, `${f.file}: gzip size as the index records`);
    assert.deepEqual(topo.vm, { format: 'vm-borders/1', source: 'cliopatria', version: 'v0.2.1', from: f.from, to: f.to });
    assert.ok(topo.transform, 'quantised');
    const fc = M.decode(topo);
    assert.equal(fc.features.length, f.rows, `${f.file}: rows`);
    // A floor: Cliopatria holds few rows before 800 BC (538 in the first file, for 3,100 years), and hundreds a
    // century after.
    assert.ok(fc.features.length >= (f.from < -300 ? 100 : 400), `${f.file}: rows (a floor)`);
    const ids = new Set();
    for (const x of fc.features) {
      const r = x.properties;
      assert.ok(M.validId(r.id), `${r.id}: cl- and ten hex`);
      assert.ok(!ids.has(r.id), `${r.id} is unique`); ids.add(r.id);
      assert.ok(Number.isInteger(r.f) && Number.isInteger(r.t) && r.f <= r.t, `${r.n}: from <= to`);
      assert.ok(r.f <= f.to && r.t >= f.from, `${r.n} ${r.f}..${r.t} overlaps ${f.file}`);
      assert.ok(r.k === 'POLITY' || r.k === 'RELATION', `${r.n}: type`);
      assert.ok(typeof r.n === 'string' && r.n.length, 'a name');
      assert.ok(r.q === null || /^Q[1-9]\d*$/.test(r.q), `${r.n}: q`);
      assert.ok(Number.isInteger(r.a) && r.a >= 0, `${r.n}: area`);
      assert.ok(Array.isArray(r.b) && r.b.length === 4 && r.b[0] <= r.b[2] && r.b[1] <= r.b[3], `${r.n}: box`);
      assert.ok(x.geometry && /Polygon$/.test(x.geometry.type), `${r.n}: a polygon`);
    }
  }
  const all = [...fcs.values()].flatMap(fc => fc.features);
  assert.ok(all.some(x => x.properties.k === 'RELATION'), 'the RELATION rows are kept (drawn as outlines)');
  assert.ok(fcAt(1494).features.some(x => x.properties.k === 'RELATION'), 'the flagship\'s file keeps them');
});

test('borders: an id is the first ten hex of sha256 of Name|FromYear|ToYear|Type, so a name in any script never changes it', () => {
  const fc = fcAt(1550);
  const dv = fc.features.find(x => x.properties.n === 'Đại Việt');
  assert.ok(dv, 'Đại Việt is in the 1500s slice, written as Cliopatria writes it');
  for (const x of [dv, ...fc.features.slice(0, 20)]) {
    const r = x.properties;
    assert.equal(r.id, `cl-${sha256(Buffer.from(`${r.n}|${r.f}|${r.t}|${r.k}`, 'utf8')).slice(0, 10)}`);
  }
});

test('qids: Q153529, the Duchy of Milan, resolves in 1494, and its decoded box agrees with the stored one (7.3)', () => {
  const fc = fcAt(1494);
  const r = M.featuresFor(fc, qids, 'Q153529', 1494);
  assert.equal(r.reason, null);
  assert.equal(r.features.length, 1);
  const milan = r.features[0];
  assert.equal(milan.properties.n, 'Duchy of Milan');
  assert.ok(milan.properties.f <= 1494 && 1494 <= milan.properties.t);
  const pts = (milan.geometry.type === 'Polygon' ? [milan.geometry.coordinates] : milan.geometry.coordinates).flat(2);
  const got = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  const topo = json(`omni/data/borders/${M.fileFor(index, 1494).file}`);
  const tol = Math.max(...topo.transform.scale) * 2 + 1e-5; // the quantisation step, and the stored box's rounding
  milan.properties.b.forEach((v, i) => assert.ok(Math.abs(v - got[i]) <= tol, `box ${i}: ${v} against ${got[i]}`));
  assert.ok(got[0] > 7 && got[2] < 12 && got[1] > 43 && got[3] < 47.5, 'in Lombardy');
});

test('qids: an entity VM cannot outline gets "VM cannot outline this", and a point where VM holds one', () => {
  const fc = fcAt(1494), held = { from: 1400, to: 1600 };
  const genoa = M.featuresFor(fc, qids, 'Q1449', 1494, held);
  assert.equal(genoa.reason, 'not-outlined', 'Genoa the city: Cliopatria outlines the Republic of Genoa, another item');
  assert.equal(M.reasonText(genoa.reason, { year: 1494, held, point: true }), 'VM cannot outline this');
  // Drawn as a point when VM holds one: a test point here, since the lake holds coordinates only from the 3 December build.
  const ext = M.extent({ focus: ['Q153529', 'Q1449'], year: 1494, fc, qids, held, pointOf: { Q1449: [8.93, 44.41] } });
  assert.deepEqual(ext.hits, ['Q153529']); assert.deepEqual(ext.points, ['Q1449']);
  assert.equal(ext.misses[0].text, 'VM cannot outline this');
  const none = M.extent({ focus: ['Q1449'], year: 1494, fc, qids, held });
  assert.equal(none.box, null); assert.equal(none.misses[0].text, 'VM cannot outline this, and holds no coordinates for it yet');
  assert.equal(M.featuresFor(fc, qids, 'Q80702', 1494, held).reason, 'not-this-year', 'the Spanish Empire: in the slice from 1516');
  assert.equal(M.featuresFor(fc, qids, 'Q153529', 1350, held).reason, 'outside-slice');
});

test('qids: Cliopatria\'s ids are used only where Wikidata agrees; France reaches its rows by name', () => {
  assert.equal(qids.format, 'vm-qids/1');
  assert.equal(qids.version, 'cliopatria@v0.2.1');
  assert.match(qids.wikidata.read, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, 'when Wikidata was read for the check');
  const names = new Set([...fcs.values()].flatMap(fc => fc.features.map(x => x.properties.n)));
  const entries = Object.entries(qids.entries);
  assert.ok(entries.length >= 100, 'a floor');
  for (const [q, rows] of entries) {
    assert.match(q, /^Q[1-9]\d*$/);
    for (const r of rows) {
      assert.ok(names.has(r.name), `${q}: "${r.name}" is a name in the slice`);
      assert.ok(Number.isInteger(r.from) && Number.isInteger(r.to) && r.from <= r.to, `${q}: years`);
      assert.ok(['cliopatria-wikidata', 'name'].includes(r.basis), `${q}: basis`);
    }
  }
  const rejected = qids.rejected.find(r => r.q === 'Q207162' && r.name === 'Kingdom of France');
  assert.ok(rejected, 'Q207162 (the Bourbon Restoration) is not the Kingdom of France of Cliopatria\'s rows of that name');
  assert.match(rejected.wikidataLabel, /Bourbon Restoration/);
  assert.match(rejected.why, /other years/, 'its alias is "Kingdom of France", but Wikidata dates it 1814–1830');
  assert.ok(!(qids.entries.Q207162 || []).some(r => r.name === 'Kingdom of France'), 'never for the name Kingdom of France');
  const france = qids.entries.Q70972;
  assert.ok(france?.length && france.every(r => r.name === 'Kingdom of France' && r.basis === 'name'));
  assert.equal(M.featuresFor(fcAt(1494), qids, 'Q70972', 1494).reason, null, 'France is drawn in 1494');
  for (const r of qids.rejected) assert.ok(/^Q[1-9]\d*$/.test(r.q) && r.name && 'wikidataLabel' in r, 'each rejection names both');
});

test('layers: the catalogue holds borders and battles in 4.2\'s shape, each layer\'s from its first value', () => {
  assert.equal(layers.format, 'vm-layers/1');
  const byId = Object.fromEntries(layers.layers.map(l => [l.id, l]));
  assert.deepEqual(Object.keys(byId).sort(), ['battles', 'borders'], 'S1 holds these two layers and no other');
  for (const l of layers.layers) {
    const r = M.readLayer(l);
    assert.ok(r.ok, `${l.id}: ${r.errors.join('; ')}`);
    assert.equal(l.module, 'omni-map');
    assert.ok(sources.sources.some(s => s.id === l.source), `${l.id}: its source ${l.source} is in sources.json`);
    assert.ok(existsSync(join(ROOT, l.data)), `${l.id}: ${l.data} exists`);
    assert.match(l.built, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  assert.equal(layers.generated, layers.layers.map(l => l.built).sort().at(-1), 'generated is the newest build');
  const b = byId.borders;
  assert.equal(b.geometry, 'polygon'); assert.equal(b.time.step, 'y'); assert.equal(b.status, 'reconstruction');
  assert.equal(b.time.from, index.from, 'borders: from equals the first year held');
  assert.equal(b.time.to, index.to);
  assert.equal(M.borderPrecisionAt(b, 1494), 'c'); assert.equal(M.borderPrecisionAt(b, 1550), 'y');
  const lg = M.legend(b, { sources: sources.sources, year: 1494 });
  const text = [...lg.lines, lg.credit].join('\n');
  for (const w of ['Cliopatria v0.2.1', 'CC BY 4.0', 'century precision', 'one version of each border']) assert.ok(text.includes(w), `the 1494 legend says "${w}"`);
  for (const w of ['5,000 km²', '50 years', 'written', 'which atlas', '3400 BC', 'no simplification', 'coarser than a survey', 'no year 0', 'composite polity', 'parentheses']) assert.ok(b.method.includes(w), `the method note says "${w}" (5.6)`);
  const t = byId.battles;
  assert.equal(t.geometry, 'point'); assert.equal(t.source, 'wikidata');
  assert.equal(t.data, 'omni/data/layers/battles.json');
  assert.equal(t.time.from, Math.min(...battles.rows.map(r => r.sortYear)), 'battles: from equals the earliest battle');
  assert.equal(t.time.to, Math.max(...battles.rows.map(r => r.sortYear)));
});

test('battles: Fornovo and Agnadello at their recorded dates, calendars and points, each value with its source', () => {
  assert.equal(battles.format, 'vm-layer/1'); assert.equal(battles.layer, 'battles');
  assert.ok(battles.rows.length >= 2);
  // The design's words, counted from the file (a hand rebuild after the lake's monthly refresh may add battles).
  assert.equal(M.heldMessage('battle', battles.rows.length), `VM holds ${battles.rows.length} battles for these years`);
  const ids = new Set(sources.sources.map(s => s.id));
  for (const r of battles.rows) {
    assert.match(r.q, /^Q[1-9]\d*$/); assert.equal(r.id, r.q);
    assert.ok(r.sortYear >= 1400 && r.sortYear <= 1600, `${r.label}: in the slice's years`);
    assert.ok(Array.isArray(r.pt) && Math.abs(r.pt[0]) <= 180 && Math.abs(r.pt[1]) <= 90, `${r.label}: a point`);
    for (const k of ['date', 'pt']) {
      assert.ok(ids.has(r.src?.[k]?.id), `${r.label}: the ${k} has a source in sources.json`);
      assert.match(r.src[k].loc, new RegExp(`^${r.q}#P\\d+$`), `${r.label}: where in Wikidata`);
      assert.ok(['referenced', 'wikipedia', 'none'].includes(r.src[k].support), `${r.label}: ${k} support`);
    }
  }
  const fornovo = battles.rows.find(r => r.q === 'Q764793'), agnadello = battles.rows.find(r => r.q === 'Q1754732');
  assert.equal(fornovo.label, 'Battle of Fornovo');
  assert.deepEqual(fornovo.date, { from: '1495-07-06', p: 11, cal: 'gregorian' }, 'Wikidata records Fornovo in the Gregorian calendar');
  assert.equal(fornovo.sortYear, 1495);
  assert.deepEqual(fornovo.pt, [10.1, 44.68333333]);
  assert.equal(fornovo.src.date.loc, 'Q764793#P585'); assert.equal(fornovo.src.date.support, 'wikipedia');
  assert.match(fornovo.src.date.via, /Wikipedia/);
  assert.equal(agnadello.label, 'Battle of Agnadello');
  assert.deepEqual(agnadello.date, { from: '1509-05-14', p: 11, cal: 'julian' });
  assert.equal(agnadello.src.date.support, 'none', 'Agnadello\'s date carries no reference in Wikidata');
  assert.equal(battles.from, 1495); assert.equal(battles.to, 1509);
});

test('sources.json v1: 5.1\'s fields; cite-only entries agree with cite-only.mjs both ways', () => {
  assert.equal(sources.format, 'vm-sources/1');
  const list = sources.sources, byId = Object.fromEntries(list.map(s => [s.id, s]));
  assert.equal(new Set(list.map(s => s.id)).size, list.length, 'ids unique');
  for (const s of list) {
    for (const k of ['id', 'citation', 'short', 'version', 'licence', 'url', 'accessed', 'terms', 'termsUrl', 'termsQuote', 'termsRead']) assert.ok(typeof s[k] === 'string' && s[k].trim(), `${s.id}: ${k}`);
    assert.ok(['host', 'cite-only'].includes(s.terms), `${s.id}: terms`);
    assert.match(s.accessed, /^\d{4}-\d\d-\d\d$/); assert.match(s.termsRead, /^\d{4}-\d\d-\d\d$/);
    assert.match(s.url, /^https:\/\//); assert.match(s.termsUrl, /^https?:\/\//);
  }
  for (const id of ['cliopatria', 'natural-earth', 'wikidata']) assert.equal(byId[id]?.terms, 'host', `${id} may be hosted`);
  assert.equal(byId.cliopatria.version, 'v0.2.1'); assert.equal(byId.cliopatria.licence, 'CC BY 4.0');
  assert.match(byId.cliopatria.termsQuote, /permits use, sharing, adaptation, distribution and reproduction in any medium or format/);
  assert.match(byId['natural-earth'].termsQuote, /are in the public domain/);
  assert.match(byId.wikidata.termsQuote, /public domain under Creative Commons Zero/);
  for (const [id, src] of Object.entries(CITE_ONLY)) {
    const s = byId[id];
    assert.equal(s?.terms, 'cite-only', `${id} is cite-only in sources.json too`);
    assert.equal(s.citation, src.citation); assert.equal(s.short, src.short); assert.equal(s.url, src.url);
    assert.equal(s.termsUrl, src.terms); assert.equal(s.termsQuote, src.words); assert.equal(s.termsRead, src.read);
  }
  for (const s of list.filter(x => x.terms === 'cite-only')) assert.ok(CITE_ONLY[s.id], `${s.id}: a cite-only source is listed in cite-only.mjs`);
});

test('no value from a cite-only source anywhere under omni/data', () => {
  const files = [];
  const walk = d => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(json|geojson)$/.test(p)) files.push(p); } };
  walk('omni/data');
  assert.ok(files.length >= 7);
  for (const [id, src] of Object.entries(CITE_ONLY)) for (const f of files) assert.ok(!namesSource(json(f), src), `${f} carries ${src.name} (${id}) values`);
});

test('base: Natural Earth 5.1.1\'s land as a FeatureCollection, its sha256 as its README records', () => {
  const p = 'omni/data/base/ne_110m_land.geojson', bytes = raw(p), g = JSON.parse(bytes.toString('utf8'));
  assert.equal(g.type, 'FeatureCollection');
  assert.ok(g.features.length >= 100 && g.features.every(f => /Polygon$/.test(f.geometry?.type)));
  const readme = raw('omni/data/base/README.md').toString('utf8');
  assert.ok(readme.includes(sha256(bytes)), 'the README records the file\'s sha256');
  for (const w of ['v5.1.1', 'public domain', 'Made with Natural Earth.', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_land.geojson']) assert.ok(readme.includes(w), `README: ${w}`);
  assert.ok(gzipSync(bytes, { level: 9 }).length < 100_000, 'small enough for the default view');
});

test('periods: The Prince\'s file has the contract\'s shape and no record yet, so the flagship click opens on Ludovico\'s life', () => {
  const p = json('bibliotheca/data/periods/the-prince.json');
  assert.deepEqual(Object.keys(p).sort(), ['book', 'built', 'checkedBy', 'paragraphs']);
  assert.equal(p.book, 'the-prince');
  const rec = readPeriods(p);
  assert.equal(rec.book, 'the-prince');
  assert.equal(rec('c03-p03'), null, 'no periods record for c03-p03 (S4 writes them, with a second reader)');
  for (const [pid, r] of Object.entries(p.paragraphs)) {
    assert.ok(r.periods.every(x => ['stated', 'inferred'].includes(x.basis)), `${pid}: basis`);
  }
});

test('lake: wikidataPoint and support read P625 and references by 5.1\'s rules; build.mjs stores the point', async () => {
  const { wikidataPoint } = await import('../lake/scripts/coords.mjs');
  const { support } = await import('../lake/scripts/refs.mjs');
  const coord = (lat, lon, precision, globe = 'http://www.wikidata.org/entity/Q2') => ({ mainsnak: { snaktype: 'value', property: 'P625', datavalue: { type: 'globecoordinate', value: { latitude: lat, longitude: lon, altitude: null, precision, globe } } }, rank: 'normal' });
  assert.deepEqual(wikidataPoint(coord(44.68333333, 10.1, 0.016666666666667)), { pt: [10.1, 44.68333333], p: 0.016666666666667 });
  assert.deepEqual(wikidataPoint(coord(45.45, 9.56667, null)), { pt: [9.56667, 45.45], p: null });
  assert.equal(wikidataPoint(coord(10, 20, 1, 'http://www.wikidata.org/entity/Q405')), null, 'a point on the Moon is no place on the map');
  assert.equal(wikidataPoint(coord(95, 10, 1)), null, 'out of range');
  assert.equal(wikidataPoint({ mainsnak: { snaktype: 'novalue', property: 'P625' } }), null);
  assert.equal(wikidataPoint({ mainsnak: { snaktype: 'somevalue', property: 'P625' } }), null);
  assert.equal(wikidataPoint(null), null);
  const item = id => ({ snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id } } });
  const str = v => ({ snaktype: 'value', datavalue: { type: 'string', value: v } });
  const claim = refs => ({ mainsnak: {}, references: refs.map(snaks => ({ snaks })) });
  assert.deepEqual(support(claim([{ P248: [item('Q123')], P304: [str('112–114')] }])), { support: 'referenced', ref: 'Q123', loc: 'p. 112–114' });
  assert.deepEqual(support(claim([{ P248: [item('Q123')], P958: [str('Book II')] }])), { support: 'referenced', ref: 'Q123', loc: 'Book II' });
  assert.deepEqual(support(claim([{ P248: [item('Q123')] }])), { support: 'referenced', ref: 'Q123' });
  assert.deepEqual(support(claim([{ P143: [item('Q8447')] }])), { support: 'wikipedia', via: 'Q8447' });
  assert.deepEqual(support(claim([{ P143: [item('Q8447')] }, { P248: [item('Q9')], P304: [str('7')] }])), { support: 'referenced', ref: 'Q9', loc: 'p. 7' }, 'a real reference wins');
  assert.deepEqual(support(claim([{ P887: [item('Q1')] }])), { support: 'none' }, 'a heuristic is no reference');
  assert.deepEqual(support(claim([{ P813: [str('+2020-01-01T00:00:00Z')] }])), { support: 'none' }, 'a retrieval date alone names no source');
  assert.deepEqual(support(claim([])), { support: 'none' });
  assert.deepEqual(support(null), { support: 'none' });
  const build = raw('lake/scripts/build.mjs').toString('utf8');
  assert.match(build, /import \{ wikidataPoint \} from '\.\/coords\.mjs'/);
  assert.match(build, /wikidataPoint\(bestClaim\(e\.claims\?\.P625\)\)/, 'record() reads the best P625 statement');
  assert.match(build, /\.\.\.\(point \? \{ pt: point\.pt/, 'and stores pt');
});

test('build-borders: its steps, on small fixtures (the archive check, the id, the crosswalk\'s name and date rules)', async () => {
  const B = await import('../omni/scripts/build-borders.mjs');
  const { zipStored } = await import('../design/vm-bundle.js');
  assert.equal(B.RELEASE.version, 'v0.2.1');
  assert.equal(B.RELEASE.sha256, index.archive.sha256, 'the index names the archive it was built from');
  const zip = Buffer.from(zipStored([{ name: 'a.geojson', text: '{"x":1}' }, { name: 'b.txt', text: 'b' }]));
  assert.equal(B.unzipEntry(zip, 'a.geojson').toString(), '{"x":1}');
  assert.throws(() => B.unzipEntry(zip, 'c.json'), /not in the archive/);
  const bad = Buffer.from(zip); bad[bad.indexOf('{"x"') + 5] ^= 1;
  assert.throws(() => B.unzipEntry(bad, 'a.geojson'), /CRC/);
  assert.equal(B.rowId({ Name: 'Duchy of Milan', FromYear: 1492, ToYear: 1496, Type: 'POLITY' }), `cl-${sha256('Duchy of Milan|1492|1496|POLITY').slice(0, 10)}`);
  assert.equal(B.norm('Đại Việt (Later Lê)'), 'đai viet'.normalize('NFD').replace(/\p{M}/gu, ''));
  assert.deepEqual(B.mergeSpans([[1407, 1421], [1402, 1406], [1453, 1462], [1463, 1481]]), [[1402, 1421], [1453, 1481]]);
  const row = (n, f, t, q, k = 'POLITY') => ({ properties: { id: 'cl-0000000000', n, f, t, k, q, w: n } });
  const time = y => ({ rank: 'normal', mainsnak: { datavalue: { value: { time: `+${y}-00-00T00:00:00Z`, precision: 9, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } } });
  const items = new Map([
    ['Q207162', { labels: { en: { value: 'Bourbon Restoration in France' } }, aliases: { en: [{ value: 'Kingdom of France' }] }, claims: { P571: [time(1815)], P576: [time(1830)] } }],
    ['Q153529', { labels: { en: { value: 'Duchy of Milan' } }, claims: { P571: [time(1395)], P576: [time(1797)] } }],
    ['Q9', { labels: { en: { value: 'Something else' } } }],
  ]);
  const rows = [row('Kingdom of France', 1492, 1496, 'Q207162'), row('Duchy of Milan', 1492, 1496, 'Q153529'), row('Duchy of Milan', 1497, 1501, 'Q153529'),
    row('Thing', 1450, 1460, 'Q9'), row('(Vassalage of Thing to Duchy of Milan)', 1450, 1460, 'Q9', 'RELATION'), row('Lost', 1450, 1460, 'Q11')];
  const places = [{ q: 'Q70972', label: 'Kingdom of France', from: 987, to: 1791 }, { q: 'Q5', label: 'Thing', from: null, to: null }];
  const { entries, rejected } = B.crosswalk(rows, items, places);
  assert.deepEqual(entries.Q153529, [{ name: 'Duchy of Milan', from: 1492, to: 1501, basis: 'cliopatria-wikidata' }]);
  assert.deepEqual(entries.Q70972, [{ name: 'Kingdom of France', from: 1492, to: 1496, basis: 'name' }]);
  assert.equal(entries.Q207162, undefined); assert.equal(entries.Q5, undefined, 'a lake place with no dates is not matched by name');
  assert.deepEqual(rejected.map(r => [r.q, r.why]), [['Q11', 'Wikidata has no such item'], ['Q207162', 'Wikidata dates the item to other years'], ['Q9', 'Wikidata gives the item another name']]);
  assert.ok(!rejected.some(r => r.name.startsWith('(Vassalage')), 'RELATION rows are not crosswalked');
  assert.deepEqual(B.itemYears(items.get('Q207162')), [1815, 1830]);
  assert.equal(B.itemYears(items.get('Q9')), null);
});

test('build-borders: a second run on unchanged inputs writes the same bytes; its `built` moves only with its content (review X7)', async () => {
  const B = await import('../omni/scripts/build-borders.mjs');
  assert.equal(typeof B.builtFor, 'function');
  // Two runs, at 10:00 and at 10:05, of the same content: the second keeps the first's stamp, byte for byte.
  const content = { format: 'vm-borders-index/1', version: 'v0.2.1', built: null, files: [{ file: '1400-1499.topo.json', sha256: 'ab'.repeat(32) }] };
  const first = { ...content, built: B.builtFor(null, content, '2026-11-17T10:00:00Z') };
  assert.equal(first.built, '2026-11-17T10:00:00Z', 'no file yet: the run\'s own time');
  const again = { ...content, built: B.builtFor(JSON.parse(JSON.stringify(first)), content, '2026-11-17T10:05:00Z') };
  assert.equal(JSON.stringify(again, null, 2), JSON.stringify(first, null, 2), 'the same bytes');
  // A change of content (a file's sha256, a Wikidata reading) takes the new time.
  const changed = { ...content, files: [{ file: '1400-1499.topo.json', sha256: 'cd'.repeat(32) }] };
  assert.equal(B.builtFor(first, changed, '2026-11-17T10:05:00Z'), '2026-11-17T10:05:00Z');
  assert.equal(B.builtFor({ ...first, built: 7 }, content, 'now'), 'now', 'a stamp that is not text is not kept');
  // The committed files, rebuilt from the same inputs, keep their stamps: their recorded hashes and the views' pins stay.
  for (const p of ['omni/data/borders/index.json', 'omni/data/borders/qids.json']) {
    const committed = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
    assert.equal(B.builtFor(committed, { ...committed, built: null }, '2027-01-01T00:00:00Z'), committed.built, p);
  }
  // The builder writes each file through it, and the layer's stamp is the later of the two.
  const src = readFileSync(join(ROOT, 'omni/scripts/build-borders.mjs'), 'utf8');
  assert.match(src, /index\.built = builtFor\(readJson\(join\(OUT, 'index\.json'\)\), index, now\)/);
  assert.match(src, /qids\.built = builtFor\(readJson\(join\(OUT, 'qids\.json'\)\), qids, now\)/);
  assert.doesNotMatch(src, /const built = stamp\(\)/);
});

test('build-battles: dates keep their calendar and precision; a value\'s source line follows 5.1', async () => {
  const T = await import('../omni/scripts/build-battles.mjs');
  const cal = q => `http://www.wikidata.org/entity/${q}`;
  const when = (time, precision, c, refs) => ({ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { time, precision, calendarmodel: cal(c) } } }, ...(refs ? { references: refs } : {}) });
  assert.deepEqual(T.valueDate(when('+1495-07-06T00:00:00Z', 11, 'Q1985727')), { from: '1495-07-06', p: 11, cal: 'gregorian' });
  assert.deepEqual(T.valueDate(when('+1509-05-14T00:00:00Z', 11, 'Q1985786')), { from: '1509-05-14', p: 11, cal: 'julian' });
  assert.deepEqual(T.valueDate(when('+1509-05-00T00:00:00Z', 10, 'Q1985786')), { from: '1509-05', p: 10, cal: 'julian' }, 'never finer than recorded');
  const imported = [{ snaks: { P143: [{ snaktype: 'value', datavalue: { value: { id: 'Q8447' } } }] } }];
  const s = T.valueSource('Q764793', 'P585', when('+1495-07-06T00:00:00Z', 11, 'Q1985727', imported), q => (q === 'Q8447' ? 'French Wikipedia' : q));
  assert.deepEqual(s, { id: 'wikidata', loc: 'Q764793#P585', support: 'wikipedia', via: 'French Wikipedia', viaQ: 'Q8447',
    line: 'Wikidata Q764793, point in time (P585): Wikipedia-sourced, unverified (imported from French Wikipedia)' });
  assert.equal(T.valueSource('Q1754732', 'P585', when('+1509-05-14T00:00:00Z', 11, 'Q1985786'), q => q).line, 'Wikidata Q1754732, point in time (P585): no reference');
  const e = { id: 'Q1', labels: { en: { value: 'Battle of Somewhere' } }, claims: { P585: [when('+1500-00-00T00:00:00Z', 9, 'Q1985727')] } };
  assert.equal(T.battleRow(e, q => q), null, 'no point: it cannot be drawn, so it is left out');
  // Every battle of the layer is a Master Index conflict of 1400–1600 (a subset: the lake's monthly refresh may add
  // conflicts, wars among them, which build-battles.mjs leaves out, before the layer is rebuilt by hand).
  const conflicts = new Set(T.lakeConflicts());
  for (const r of battles.rows) assert.ok(conflicts.has(r.q), `${r.label} (${r.q}) is a Master Index conflict of 1400–1600`);
});

// The decisions of 17 November 2026 (O2): build-battles.mjs stamped a new time on every run, so a rerun on the same
// Wikidata answers changed battles.json, the layer's `built`, Wikidata's version in VM's sources and the battles@ pin of
// every view saved since. The stamp now moves only with the rows. No network: the file is made by layerFile.
test('build-battles: a run whose rows are byte for byte the same keeps its stamp; changed rows take the run\'s time (O2)', async () => {
  const T = await import('../omni/scripts/build-battles.mjs');
  assert.equal(typeof T.layerFile, 'function', 'build-battles.mjs makes its file with layerFile(rows, prev, now)');
  const text = o => JSON.stringify(o, null, 2) + '\n';
  // The committed file, its rows read again at a later time: the same bytes, stamp, years and words.
  const committed = raw('omni/data/layers/battles.json').toString('utf8');
  const prev = JSON.parse(committed);
  const again = T.layerFile(JSON.parse(JSON.stringify(prev.rows)), prev, '2027-01-01T00:00:00Z');
  assert.equal(again.built, prev.built, 'unchanged rows keep the stamp');
  assert.equal(text(again), committed, 'and the file is written with the same bytes');
  // One value changed (a point moved by Wikidata): the run's own time, in the stamp and in the words.
  const moved = structuredClone(prev.rows); moved[0].pt = [moved[0].pt[0] + 0.01, moved[0].pt[1]];
  const next = T.layerFile(moved, prev, '2027-01-01T00:00:00Z');
  assert.equal(next.built, '2027-01-01T00:00:00Z');
  assert.match(next.about, /read from Wikidata on 2027-01-01 by/);
  // A row's keys in another order are not the same bytes: the stamp moves (byte for byte, never "about the same").
  const reordered = prev.rows.map(r => Object.fromEntries(Object.entries(r).reverse()));
  assert.equal(T.layerFile(reordered, prev, 'now').built, 'now');
  // No file yet, or a stamp that is not text: the run's own time.
  assert.equal(T.layerFile(prev.rows, null, '2027-01-01T00:00:00Z').built, '2027-01-01T00:00:00Z');
  assert.equal(T.layerFile(prev.rows, { ...prev, built: 7 }, 'now').built, 'now');
  // The years follow the rows.
  assert.deepEqual([again.from, again.to], [prev.from, prev.to]);
  // The builder writes through it, from the file as it stands, and passes the kept stamp on to the catalogue and sources.
  const src = raw('omni/scripts/build-battles.mjs').toString('utf8');
  assert.match(src, /const prev = readJson\(OUT\);\s+const file = layerFile\(rows, prev, stamp\(\)\)/);
  assert.match(src, /updateLayer\(LAYERS, 'battles', \{ built: file\.built,/);
  assert.doesNotMatch(src, /const built = stamp\(\)/);
});

const CPU_LIMIT_MS = Number(process.env.PRP_CPU_LIMIT_MS) || 40;
test('CPU: one frame\'s work (the slice at 1494 and the flagship\'s extent) stays under the limit', () => {
  const topo = json(`omni/data/borders/${M.fileFor(index, 1494).file}`);
  const fc = M.decode(topo); // once, as the page does when the file arrives
  const frame = () => { const drawn = M.sliceAt(fc, 1494); const ext = M.extent({ focus: ['Q70972', 'Q153529'], year: 1494, fc, qids, held: M.held(index) }); return [drawn, ext]; };
  const [drawn, ext] = frame();
  assert.ok(drawn.length >= 100, 'outlines at 1494');
  assert.deepEqual(ext.hits, ['Q70972', 'Q153529']); assert.ok(ext.box);
  const times = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); frame(); times.push(performance.now() - t); }
  assert.ok(Math.min(...times) < CPU_LIMIT_MS, `one frame: ${Math.min(...times).toFixed(1)} ms (limit ${CPU_LIMIT_MS} ms)`);
});

// Findings S9, E7 and E8 of the review of 17 November 2026.
test('the method a reader is sent to is published (S9); the change note says what quantising does (E8); the data keeps its bytes on any checkout (E7)', () => {
  const said = [raw('omni/index.html').toString('utf8'), ...layers.layers.map(l => l.method), sources.sources.map(s => s.changes || '').join(' ')].join('\n');
  assert.doesNotMatch(said, /PRP-SCHOLAR-USP-DESIGN|design rule/, 'no page or method note cites a file readers cannot reach');
  const readme = raw('omni/README.md').toString('utf8');
  assert.match(readme, /^## How a click sets the view$/m);
  for (const w of ['widened by 10%', 'the start of the book\'s era', 'The coarsest of', 'known only to its century', 'never a present-day state']) assert.ok(readme.includes(w), `omni/README.md: ${w}`);
  assert.match(raw('omni/index.html').toString('utf8'), /omni\/README\.md#how-a-click-sets-the-view/, 'the page links to the rules');
  assert.doesNotMatch(said + readme, /no points removed/, 'quantising merges points that then coincide');
  assert.match(sources.sources.find(s => s.id === 'cliopatria').changes, /points that then coincide are merged; no simplification/);
  assert.match(raw('.gitattributes').toString('utf8'), /^omni\/data\/\*\* -text$/m, 'core.autocrlf=true cannot change a hashed file');
});

// Found while fixing R1 (a click opens the map in every book): a book with no periods file must not be asked for one,
// or every click logs a 404. The index lists exactly the periods files there are.
test('periods: the index lists exactly the periods files there are, so the reader asks only for those', () => {
  const idx = json('bibliotheca/data/periods/index.json');
  assert.equal(idx.format, 'vm-periods-index/1');
  const files = readdirSync(join(ROOT, 'bibliotheca/data/periods')).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5)).sort();
  assert.deepEqual([...idx.books].sort(), files);
  assert.match(raw('bibliotheca/neo/app.js').toString('utf8'), /periods\/index\.json/, 'the reader reads the index first');
});
