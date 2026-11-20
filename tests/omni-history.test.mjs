// Digital Science · Omni-Map, stage S5b of PRP-SCHOLAR-USP-DESIGN.md (4.2): the data of the four layers of history and
// their pure rules, in Node. Each layer's catalogue entry reads (readLayer) and spans exactly its data's first and last
// years; each file is listed with its size and sha256 and stays under 1.5 MB compressed; every value carries its source
// line; no Correlates of War record, CShapes, Archigos field or PRIO death figure is held; states are joined by Q-id or
// ISO3 (never by a Gleditsch and Ward code alone); a date is never more precise than its source (a year is never 1
// January); coups are Wikidata's items; the battles cluster above 2,000 and malformed years are dropped; the
// breakthroughs keep their placing basis, VM's own text and "c."; and the module each layer opens, at its place and year.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as L from '../omni/lib/layers.js';
import { breakthroughRows } from '../omni/scripts/build-breakthroughs.mjs';
import { battleRow } from '../omni/scripts/build-battles.mjs';
import { precisionOf, retroKeys } from '../omni/scripts/build-political.mjs';
import { warOf } from '../omni/scripts/build-wars.mjs';
import '../design/prp-map.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const raw = p => readFileSync(join(ROOT, p));
const read = p => JSON.parse(raw(p).toString('utf8'));
const M = globalThis.PRPMap;
const CAT = read('omni/data/layers.json');
const SOURCES = read('integration/sources.json').sources;
const NEW = ['conflict-territory', 'elections', 'coups', 'political-change', 'breakthroughs'];
const entry = id => CAT.layers.find(l => l.id === id);
const MB15 = 1.5 * 1024 * 1024;

test('S5b: each layer of history reads, spans exactly its data, and lists its files with size, gzip and sha256', () => {
  for (const id of [...NEW, 'battles']) {
    const e = entry(id);
    assert.ok(e, `the catalogue holds ${id}`);
    const r = M.readLayer(e);
    assert.ok(r.ok, `${id} reads: ${(r.errors || []).join('; ')}`);
    const doc = read(e.data);
    const years = doc.rows ? doc.rows.map(x => x.sortYear) : Object.keys(doc.years).map(Number);
    assert.equal(e.time.from, Math.min(...years), `${id}: time.from is its first year`);
    assert.equal(e.time.to, Math.max(...years), `${id}: time.to is its last year`);
    assert.equal(doc.from, e.time.from); assert.equal(doc.to, e.time.to);
    if (id !== 'battles') {
      assert.ok(Array.isArray(e.files) && e.files.length, `${id} lists its files`);
      for (const f of e.files) {
        const b = raw(f.file);
        assert.equal(f.bytes, b.length, `${f.file}: bytes`);
        assert.equal(f.sha256, createHash('sha256').update(b).digest('hex'), `${f.file}: sha256`);
        assert.equal(f.gzip, gzipSync(b, { level: 9 }).length, `${f.file}: gzip`);
        assert.ok(f.gzip < MB15, `${f.file} is under 1.5 MB compressed`);
      }
      assert.ok(e.files.some(f => f.file === e.data), `${id} lists its data file`);
    }
    assert.ok(gzipSync(raw(e.data), { level: 9 }).length < MB15, `${e.data} is under 1.5 MB compressed`);
    // 4.3: what is VM's own (its method) is said to be, and the source is one VM lists.
    if (id !== 'battles') assert.match(e.method || '', /^VM’s own text\./, `${id}: its method is labelled VM’s own text`); // the battles keep S1's method
    assert.ok(SOURCES.some(s => s.id === e.source), `${id}: its source ${e.source} is in integration/sources.json`);
  }
});

test('S5b: every value has its source line; no Correlates of War, CShapes, Archigos or PRIO figure is held', () => {
  const ids = new Set(SOURCES.map(s => s.id));
  for (const id of ['elections', 'coups', 'breakthroughs', 'battles']) {
    for (const r of read(entry(id).data).rows) {
      assert.ok(r.src?.date?.line && ids.has(r.src.date.id), `${id} ${r.id}: its date has a source line and a listed source`);
      assert.ok(r.src.date.loc, `${id} ${r.id}: where in the source`);
    }
  }
  const terr = read(entry('conflict-territory').data);
  assert.deepEqual(Object.keys(terr.files).sort(), ['ucdp-acd', 'ucdp-brd']);
  for (const p of Object.values(terr.places)) assert.equal(p.src?.id, 'wikidata', `${p.q}: its inception's source`);
  for (const [y, Y] of Object.entries(terr.years)) for (const [id, c] of Object.entries(Y.c)) {
    assert.ok([1, 2].includes(c[0]), `${y} ${id}: an intensity of UCDP's`);
    assert.ok(terr.conflicts[id], `${y} ${id}: a conflict of the file`);
  }
  const terms = read(entry('political-change').data);
  for (const t of terms.terms) assert.match(t.st, /^Q\d+-/i, `${t.q}: its Wikidata statement`);
  // No barred source, in any file of the layers or the registry.
  const files = ['omni/data/layers.json', 'omni/data/layers/wars/registry.json', ...NEW.map(id => entry(id).data), 'omni/data/layers/retro-keys.json', 'omni/data/layers/battles.json'];
  for (const f of files) {
    const t = raw(f).toString('utf8');
    assert.doesNotMatch(t, /"src"\s*:\s*"cow"|"(cow|cowid|warnum|ccode|bdeadbes|bd_best_prio)"\s*:/i, `${f} holds no COW or PRIO field`);
    assert.doesNotMatch(t, /cshapes/i, `${f} names no CShapes data`);
    assert.doesNotMatch(t, /"(entry|exit|exitcode|entrycode|leadid)"\s*:/, `${f} holds no Archigos field`);
  }
  // No CShapes file or word anywhere under omni/.
  const walk = d => readdirSync(join(ROOT, d)).flatMap(n => (statSync(join(ROOT, d, n)).isDirectory() ? walk(`${d}/${n}`) : [`${d}/${n}`]));
  for (const f of walk('omni')) {
    assert.doesNotMatch(f, /cshapes/i);
    if (/\.(js|mjs|json|html|css|md)$/.test(f) && statSync(join(ROOT, f)).size < 8e6) assert.doesNotMatch(raw(f).toString('utf8'), /cshapes/i, `${f} does not name CShapes`);
  }
});

test('S5b: the war registry joins UCDP, War Focus and Wikidata by their own ids, with no Correlates of War number', () => {
  const reg = read('omni/data/layers/wars/registry.json');
  assert.equal(reg.format, 'vm-wars/1');
  for (const w of reg.wars) {
    assert.match(w.id, /^(wf|ucdp)-[\w-]+$/);
    assert.deepEqual(Object.keys(w).filter(k => !['id', 'name', 'q', 'wf', 'ucdp', 'from', 'to', 'src'].includes(k)), [], `${w.id}: no field beyond the registry's own`);
    if (w.q) assert.match(w.q, /^Q\d+$/);
    assert.ok(Array.isArray(w.ucdp));
  }
  const terr = read(entry('conflict-territory').data);
  // Vietnam, 1968: UCDP's conflict 293 is War Focus's Vietnam War; North Vietnam has no ISO3 of today and links by UCDP's code.
  assert.equal(terr.conflicts['293'].wars['1968'], 'wf-vietnam-war');
  assert.equal(warOf(reg, 293, 1968), 'wf-vietnam-war');
  assert.equal(terr.places.Q172640.iso3, null);
  for (const [q, p] of Object.entries(terr.places)) {
    assert.match(q, /^Q\d+$/, 'each state is keyed by its Q-id');
    assert.equal(p.q, q);
    if (p.iso3 != null) assert.match(p.iso3, /^[A-Z]{3}$/);
  }
});

test('S5b: a state is placed by Q-id or ISO3 on Cliopatria, else on Natural Earth from 1886, never by its Gleditsch and Ward code', () => {
  const countries = { features: [{ properties: { q: 'Q881', iso3: 'VNM', gw: '816' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] };
  const small = [{ q: 'Q347', iso3: 'LIE', at: [9.5, 47.1] }];
  assert.equal(L.placeState({ q: 'Q172640', iso3: null, gw: '816' }, 1968, { countries, small }).how, null, 'a code alone places nothing');
  assert.equal(L.placeState({ q: 'Q881' }, 1990, { countries, small }).how, 'natural-earth');
  assert.equal(L.placeState({ iso3: 'VNM' }, 1990, { countries, small }).how, 'natural-earth');
  assert.equal(L.placeState({ q: 'Q881' }, 1880, { countries, small }).reason, 'before-ne');
  assert.equal(L.placeState({ q: 'Q881', since: 1976 }, 1970, { countries, small }).reason, 'before-since');
  assert.deepEqual(L.placeState({ iso3: 'LIE' }, 1990, { countries, small }).at, [9.5, 47.1]);
  const ff = (q, y) => (q === 'Q172640' && y === 1968 ? { features: [{ id: 'x' }], reason: null } : { features: [], reason: 'not-this-year' });
  assert.equal(L.placeState({ q: 'Q172640' }, 1968, { featuresFor: ff, countries, small }).how, 'cliopatria');
  // The committed base and crosswalk: North Vietnam is Cliopatria's Democratic Republic of Vietnam in 1968.
  const qids = read('omni/data/borders/qids.json');
  assert.equal(qids.entries.Q172640[0].name, 'Democratic Republic of Vietnam');
});

test('S5b: dates are never more precise than Wikidata records them (a year is never 1 January)', () => {
  for (const id of ['elections', 'coups']) {
    for (const r of read(entry(id).data).rows) {
      assert.ok([9, 10, 11].includes(r.date.p) || r.date.p < 9, `${id} ${r.id}: a precision`);
      if (r.date.p === 9) assert.match(r.date.from, /^-?\d+$/, `${id} ${r.id}: a year alone`);
      if (r.date.p === 10) assert.match(r.date.from, /^-?\d+-\d\d$/, `${id} ${r.id}: a month alone`);
      if (r.date.p >= 9) assert.equal(precisionOf(r.date.from), r.date.p);
    }
  }
  assert.equal(precisionOf('1928'), 9); assert.equal(precisionOf('1963-04'), 10); assert.equal(precisionOf('1963-04-08'), 11);
});

test('S5b: coups are Wikidata items of coup d’état; political change counts heads of state and government', () => {
  const coups = read(entry('coups').data).rows;
  assert.ok(coups.length > 500);
  for (const r of coups) {
    assert.match(r.q, /^Q\d+$/); assert.equal(r.id, r.q);
    assert.ok(r.country.every(c => /^Q\d+$/.test(c)));
    assert.equal(typeof r.attempt, 'boolean');
    assert.equal(r.src.date.id, 'wikidata');
  }
  const terms = read(entry('political-change').data);
  const v = L.stateValues(terms, 1968);
  assert.ok(v.length > 10);
  for (const s of v) assert.ok([1, 2, 3].includes(s.v), `${s.q}: a class of 1, 2 or 3`);
  const doc = { format: 'vm-terms/1', terms: [{ role: 'hog' }, { role: 'hos' }], years: { 1968: { t: { Q1: [0], Q2: [1], Q3: [0, 1] } } } };
  assert.deepEqual(L.stateValues(doc, 1968).map(s => s.v), [1, 2, 3]);
  const terr = { format: 'vm-territory/1', from: 1968, to: 1969, years: { 1968: { t: { Q1: [7, 8] }, a: { Q30: [7] }, c: { 7: [2], 8: [1] } } } };
  assert.deepEqual(L.stateValues(terr, 1968), [{ q: 'Q1', v: 2, t: [7, 8], a: [] }, { q: 'Q30', v: 0, t: [], a: [7] }]);
  assert.deepEqual(L.conflictCounts(terr), [{ y: 1968, n: 2 }, { y: 1969, n: 0 }]);
});

test('S5b: the battles widened: clustered above 2,000 drawn, malformed years dropped, each with its war where known', () => {
  const rows = read('omni/data/layers/battles.json').rows;
  assert.ok(rows.length > 1500, `${rows.length} battles`);
  assert.equal(L.clusters(L.CLUSTER_AT), false); assert.equal(L.clusters(L.CLUSTER_AT + 1), true);
  for (const r of rows) {
    assert.ok(Number.isInteger(r.sortYear) && r.sortYear !== 0 && r.sortYear >= -3000, `${r.q}: a year`);
    assert.ok(Array.isArray(r.pt) && r.pt.length === 2);
    if (r.war) assert.match(r.war, /^(wf|ucdp)-/);
  }
  // A battle with no date, or no point, is not a row.
  const e = { id: 'Q1', labels: { en: { value: 'x' } }, claims: {} };
  assert.equal(battleRow(e, q => q), null);
  // 1400–1600 still holds the S1 pair.
  assert.deepEqual(rows.filter(r => r.sortYear >= 1400 && r.sortYear <= 1600).map(r => r.q).sort(), ['Q1754732', 'Q764793']);
});

test('S5b: breakthroughs keep their placing basis, VM’s own text and c.; the discipline filter rides on l=', () => {
  const doc = read(entry('breakthroughs').data);
  for (const r of doc.rows) {
    assert.ok(r.basis, `${r.id}: its placing basis`);
    assert.match(r.src.date.line, /VM’s own text/);
    assert.ok(Array.isArray(r.d) && r.d.length);
  }
  assert.ok(doc.rows.some(r => r.circa), 'some years are approximate');
  const rows = breakthroughRows({ events: [{ id: 'a', y: 1600, ca: true, d: ['astro'], t: 'T', place: { lat: 1, lon: 2 }, positionBasis: 'fallback' }, { id: 'b', y: 0, place: { lat: 1, lon: 2 } }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].circa, true); assert.equal(rows[0].vmPlaced, true);
  assert.match(entry('breakthroughs').method, /“c\.”/);
  // The filter: l=breakthroughs:d=astro.
  const cat = L.catalogue(CAT);
  let set = L.fromRecipe({ l: [{ id: 'breakthroughs', field: 'd', value: 'astro' }] }, cat).set;
  assert.deepEqual(L.toRecipe(set, cat).l, [{ id: 'breakthroughs', field: 'd', value: 'astro' }]);
  assert.equal(L.inPeriod(doc.rows, 1600, 1700, set.filters.breakthroughs).every(r => r.d.includes('astro')), true);
  set = L.setFilter(set, 'breakthroughs', null);
  assert.deepEqual(L.toRecipe(set, cat).l, [{ id: 'breakthroughs' }]);
  assert.equal(L.passes({ d: ['phys', 'astro'] }, { field: 'd', value: 'astro' }), true);
  assert.equal(L.passes({ d: ['phys'] }, { field: 'd', value: 'astro' }), false);
  assert.deepEqual(L.inPeriod([{ sortYear: 1599 }, { sortYear: 1600 }, { sortYear: 1700 }, { sortYear: 1701 }], 1600, 1700).map(r => r.sortYear), [1600, 1700]);
});

test('S5b: a click opens the module that holds the place and year', () => {
  assert.equal(L.moduleLink('battlefield-history', { year: 1968, iso3: null, gw: '816' }), 'battlefield/history/index.html#y=1968&c=816');
  assert.equal(L.moduleLink('battlefield-history', { year: 1968, iso3: 'USA', gw: '2' }), 'battlefield/history/index.html#y=1968&c=USA');
  assert.equal(L.moduleLink('war-focus', { war: 'wf-vietnam-war' }), 'battlefield/focus/index.html#war=vietnam-war');
  assert.equal(L.moduleLink('progress', { year: 1609, event: 'telescope' }), 'science/progress/index.html#y=1609&e=telescope');
  const keys = read('omni/data/layers/retro-keys.json').keys;
  const usa = L.retroKey(keys, 'USA');
  assert.match(usa, /^\d+$/);
  assert.equal(L.moduleLink('retrospective', { year: 1968, key: usa }), `https://hp-retrospective.pages.dev/#y=1968&c=${usa}`);
  assert.equal(L.retroKey(retroKeys({ countries: { 255: { iso3: 'DEU', name: 'Germany' }, 260: { iso3: 'DEU', name: 'West Germany / Germany' }, 265: { name: 'East Germany' } } }), 'DEU', 'West Germany / Germany'), '260');
  assert.deepEqual(Object.keys(retroKeys({ countries: { 265: { name: 'East Germany' } } })), [], 'no ISO3, no key: never joined by the key alone');
  // The address table holds only keys and names, by ISO3.
  for (const [iso, ks] of Object.entries(keys)) { assert.match(iso, /^[A-Z]{3}$/); for (const k of ks) assert.deepEqual(Object.keys(k).sort(), ['k', 'n']); }
  // The state colours: few classes, from a darker step than a ramp of values.
  assert.deepEqual([0, 1].map(k => L.stateTokenOf(k, 2)), [4, 10]);
  assert.deepEqual([0, 1, 2].map(k => L.stateTokenOf(k, 3)), [4, 7, 10]);
});
