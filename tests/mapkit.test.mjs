// The map kit (design/prp-mapkit.js): which country a map shape is, a dot for every country a border file lacks, the
// no-data fill and the one sentence a country with no data gets (the rule in design/PRP-STYLE.md §6, from the plan's
// section 3). No network: the world-atlas shape ids are in tests/fixtures/world-atlas-110m-ids.json, and the capitals'
// Wikidata coordinates are in the kit beside each dot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeResolvers } from '../integration/scripts/coverage.mjs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const before = new Set(Object.keys(globalThis));
await import('../design/prp-mapkit.js');
const K = globalThis.PRPMapkit;

const national = JSON.parse(read('national/data/index.json')).countries;
// VM's 197 (the UN members, the Holy See, Palestine, Kosovo and Taiwan), as the coverage script builds them.
const TARGET = [...makeResolvers({ national }).target];
const atlas = JSON.parse(read('tests/fixtures/world-atlas-110m-ids.json'));
// The shapes as a page has them once TopoJSON is decoded: an id (ISO 3166 numeric) and a name.
const SHAPES = atlas.shapes.map(([id, name]) => (id ? { id, properties: { name } } : { properties: { name } }));
const CODES = K.codeTable(national);

// The countries each border file lacks, as the plan names them (PRP-ALL-COUNTRIES-PLAN.md, AC-1, AC-5 and AC-13).
const LACK_110M = 'AND ATG BHR BRB COM CPV DMA FSM GRD KIR KNA LCA LIE MCO MDV MHL MLT MUS NRU PLW SGP SMR STP SYC TON TUV VAT VCT WSM'.split(' ');
const LACK_CSHAPES = 'AND ATG DMA FSM GRD KIR KNA LCA LIE MCO MHL NRU PLW SMR STP SYC TON TUV VAT VCT VUT WSM'.split(' ');
const sorted = a => [...a].sort();

test('mapkit: loads as one global, in Node as in a page', () => {
  assert.equal(typeof K, 'object');
  assert.deepEqual(Object.keys(globalThis).filter(k => !before.has(k)), ['PRPMapkit']);
  assert.ok(Object.isFrozen(K.DOTS) && Object.isFrozen(K.REASONS));
});

test('mapkit: the fixture is the world-atlas 2.0.2 file the pages load', () => {
  assert.equal(atlas.source, 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json');
  for (const page of ['q/national.html', 'q/volatility.html', 'kino/lib/stage.js', 'analytics/lib/render.js']) assert.ok(read(page).includes(atlas.source), page);
  // Data Analytics pins the same file by its hash.
  assert.match(read('analytics/lib/render.js'), new RegExp(`integrity: '${atlas.sha384.replace(/[+/]/g, '\\$&')}'`));
  assert.equal(SHAPES.length, 177);
  assert.equal(SHAPES.filter(s => s.id).length, 174);
  assert.deepEqual(sorted(SHAPES.filter(s => !s.id).map(s => s.properties.name)), ['Kosovo', 'N. Cyprus', 'Somaliland']);
});

test('mapkit: every one of the 197 resolves to a 1:110m shape or a dot', () => {
  assert.equal(TARGET.length, 197);
  const shaped = new Set(SHAPES.map(s => K.countryOf(s, CODES)).filter(Boolean));
  const unplaced = TARGET.filter(iso => !shaped.has(iso) && !K.dot(iso, '110m'));
  assert.deepEqual(unplaced, [], `no shape and no dot: ${unplaced.join(' ')}`);
  // The dots at 1:110m are exactly the countries the file lacks: no country has both, none is missing.
  const lacking = TARGET.filter(iso => !shaped.has(iso));
  assert.deepEqual(sorted(lacking), sorted(LACK_110M));
  assert.deepEqual(sorted(K.dots('110m').map(d => d.iso3)), sorted(LACK_110M));
});

test('mapkit: shape to country, by ISO number and then by name', () => {
  const byName = n => SHAPES.find(s => s.properties.name === n);
  assert.equal(K.countryOf(byName('Kosovo'), CODES), 'XKX');
  assert.equal(K.countryOf(byName('N. Cyprus'), CODES), null);
  assert.equal(K.countryOf(byName('Somaliland'), CODES), null);
  assert.equal(K.unclaimed(byName('N. Cyprus')), 'Northern Cyprus');
  assert.equal(K.unclaimed(byName('Somaliland')), 'Somaliland');
  assert.equal(K.unclaimed(byName('Kosovo')), null);
  assert.equal(K.countryOf(byName('Taiwan'), CODES), 'TWN', 'Taiwan has a shape although the World Bank list has no row for it');
  assert.equal(K.countryOf(byName('France'), CODES), 'FRA');
  assert.equal(K.countryOf(byName('Somalia'), CODES), 'SOM');
  assert.equal(K.countryOf(byName('W. Sahara'), CODES), null, 'not a country of the page’s table');
  // A TopoJSON geometry, a GeoJSON feature, a number for an id, a plain object or a Map as the table: all the same.
  assert.equal(K.countryOf({ id: 250 }, CODES), 'FRA');
  assert.equal(K.countryOf({ type: 'Feature', id: '250', properties: {} }, Object.fromEntries(CODES)), 'FRA');
  assert.equal(K.countryOf({ id: '250' }, new Map([['250', 'FRA']])), 'FRA');
  assert.equal(K.countryOf(null, CODES), null);
  // The page's own table wins over the kit's names; rows can be arrays as in analytics/lib/countries.js.
  assert.equal(K.countryOf({ properties: { name: 'Kosovo' } }, new Map([['name:Kosovo', 'KOS']])), 'KOS');
  assert.equal(K.codeTable([['FRA', 'FR', '250', 'France']]).get('250'), 'FRA');
  assert.equal(K.codeTable([{ iso3: 'GRL', num: 304 }]).get('304'), 'GRL');
});

test('mapkit: one table of dots for every country a border file lacks', async () => {
  assert.deepEqual(K.dots('50m').map(d => d.iso3), ['TUV']);
  assert.deepEqual(sorted(K.dots('cshapes').map(d => d.iso3)), sorted(LACK_CSHAPES));
  assert.deepEqual(sorted(K.dots().map(d => d.iso3)), sorted(new Set([...LACK_110M, ...LACK_CSHAPES])));
  assert.equal(K.dots().length, 30);
  for (const d of K.dots()) {
    assert.ok(TARGET.includes(d.iso3), `${d.iso3} is one of the 197`);
    assert.ok(d.name && d.lonlat.length === 2 && d.lonlat.every(Number.isFinite), d.iso3);
    assert.ok(['atlas', 'wikidata'].includes(d.from), d.iso3);
  }
  assert.deepEqual(K.dot('NRU'), [166.93, -0.52]);
  assert.equal(K.dot('NRU', 'cshapes') !== null, true);
  assert.equal(K.dot('SGP', 'cshapes'), null, 'CShapes draws Singapore');
  assert.equal(K.dot('FRA'), null);
  const fc = K.dotFeatures('110m', ['NRU', 'FRA']);
  // The dots' names are Documentary mode's names (design/prp-focus.js), Tuvalu and Vatican City included.
  await import('../design/prp-focus.js');
  for (const d of K.dots()) assert.equal(globalThis.PRPFocus.countryName(d.iso3), d.name, d.iso3);
  assert.deepEqual(fc, { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'NRU', properties: { iso3: 'NRU', name: 'Nauru', dot: [166.93, -0.52] }, geometry: { type: 'Point', coordinates: [166.93, -0.52] } }] });
  assert.equal(K.dotFeatures('cshapes').features.length, 22);
  // Documentary mode's point boxes for Tuvalu and Vatican City are these same dots.
  // (pointBox works in projected units, so the box's corner comes back within a rounding error of the dot.)
  for (const iso of ['TUV', 'VAT']) {
    const box = globalThis.PRPFocus.countryBox(iso), [lon, lat] = K.dot(iso);
    for (const [i, v] of [lon, lat, lon, lat].entries()) assert.ok(Math.abs(box[i] - v) < 1e-9, `${iso}: box ${box} against dot ${lon},${lat}`);
  }
});

test('mapkit: a dot is its own country, so a page can run shapes and dots through one countryOf', () => {
  for (const layer of ['110m', '50m', 'cshapes']) {
    for (const f of K.dotFeatures(layer).features) {
      assert.equal(K.countryOf(f, CODES), f.properties.iso3, `${layer} ${f.properties.iso3}`);
      assert.equal(K.countryOf(f), f.properties.iso3, `${layer} ${f.properties.iso3}, no table`);
    }
  }
  assert.equal(K.countryOf({ id: 'NRU' }, CODES), 'NRU');
  assert.equal(K.countryOf({ properties: { iso3: 'mlt', name: 'Malta' } }), 'MLT');
});

test('mapkit: ISO3 in any case, and tables keyed by number or by unpadded string', () => {
  assert.deepEqual(K.dot('nru'), [166.93, -0.52]);
  assert.deepEqual(K.dotFeatures('110m', ['nru']).features.map(f => f.id), ['NRU']);
  assert.equal(K.codeTable([{ iso3: 'fra', num: 250 }]).get('250'), 'FRA');
  // Kino's table is a Map with number keys (kino/lib/stage.js); others may key '4' rather than '004'.
  assert.equal(K.countryOf({ id: 250 }, new Map([[250, 'FRA']])), 'FRA');
  assert.equal(K.countryOf({ id: '004' }, new Map([[4, 'AFG']])), 'AFG');
  assert.equal(K.countryOf({ id: 4 }, { 4: 'AFG' }), 'AFG');
  assert.equal(K.countryOf({ id: 4 }, { '004': 'AFG' }), 'AFG');
  assert.equal(K.countryOf({ id: 4 }, k => (k === '004' ? 'afg' : undefined)), 'AFG');
  assert.equal(K.countryOf({ id: 999 }, new Map([[4, 'AFG']])), null);
});

test('mapkit: a shape the page itself gives a country is not unclaimed', () => {
  const somaliland = { properties: { name: 'Somaliland' } };
  assert.equal(K.unclaimed(somaliland), 'Somaliland');
  assert.equal(K.unclaimed(somaliland, CODES), 'Somaliland');
  const kino = new Map([['name:Somaliland', 'SOM']]);
  assert.equal(K.countryOf(somaliland, kino), 'SOM');
  assert.equal(K.unclaimed(somaliland, kino), null);
});

test('mapkit: install() puts the fill in a page, once, even before <body> exists', () => {
  // A small stand-in for a document whose <head> script runs before <body> is parsed.
  const made = [];
  const el = tag => {
    const e = { tag, id: '', children: [], textContent: '', appendChild(c) { this.children.push(c); made.push(c); return c; } };
    Object.defineProperty(e, 'innerHTML', { set(h) { const id = /id="([^"]+)"/.exec(h)?.[1] || ''; this.firstChild = { tag: 'svg', id, html: h }; } });
    return e;
  };
  const root = el('html');
  const doc = { head: null, body: null, documentElement: root, createElement: el, getElementById: id => made.find(c => c.id === id) || null };
  assert.equal(K.install(doc), K.NODATA);
  assert.deepEqual(root.children.map(c => c.id), ['prp-mapkit-style', 'prp-mapkit-defs']);
  assert.ok(root.children[1].html.includes('<pattern id="prp-nodata"'));
  K.install(doc);
  assert.equal(root.children.length, 2, 'a second call adds nothing');
});

// Great-circle distance in degrees of arc.
const arc = ([x1, y1], [x2, y2]) => {
  const r = Math.PI / 180, a = Math.sin((y2 - y1) * r / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin((x2 - x1) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) / r;
};
test('mapkit: every dot lies within about 0.5 degrees of its capital in Wikidata', () => {
  for (const d of K.dots()) {
    assert.match(d.capital.qid, /^Q\d+$/, d.iso3);
    assert.ok(arc(d.lonlat, d.capital.lonlat) <= 0.5, `${d.iso3}: ${arc(d.lonlat, d.capital.lonlat).toFixed(2)}° from ${d.capital.name}`);
  }
  // The dots follow the countries' own Wikidata items, as National Analysis holds them (VAT's is Q237, Vatican City,
  // the state of the Holy See).
  const qid = new Map(national.map(c => [c.iso3, c.qid]));
  for (const d of K.dots()) assert.equal(d.qid, qid.get(d.iso3) || (d.iso3 === 'VAT' ? 'Q237' : undefined), d.iso3);
});

// The Atlas's MARKERS table is where the dots come from; when its repository sits beside this one, the copy must match.
const ATLAS_APP = new URL('../../political-atlas/app.js', import.meta.url);
test('mapkit: the dots taken from the Political Atlas still match its MARKERS', { skip: !existsSync(ATLAS_APP) && 'the Political Atlas is not beside this repository' }, () => {
  const src = readFileSync(ATLAS_APP, 'utf8'), m = /const MARKERS = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(m, 'the Atlas’s app.js has a MARKERS table in the form this test reads (const MARKERS = { … };)');
  const block = m[1];
  const markers = Object.fromEntries([...block.matchAll(/([A-Z]{3}): \[(-?[\d.]+), (-?[\d.]+)\]/g)].map(m => [m[1], [+m[2], +m[3]]]));
  for (const d of K.dots()) {
    if (d.from === 'atlas') assert.deepEqual(d.lonlat, markers[d.iso3], d.iso3);
    else assert.equal(markers[d.iso3], undefined, `${d.iso3} is in MARKERS now: take its dot from there`);
  }
});

test('mapkit: the no-data fill is the hatch National Analysis and Volatility share', () => {
  assert.equal(K.NODATA.className, 'prp-nodata');
  assert.equal(K.NODATA.fill, 'url(#prp-nodata)');
  const p = K.patternMarkup();
  for (const part of ['id="prp-nodata"', 'patternUnits="userSpaceOnUse"', 'width="5"', 'height="5"', 'patternTransform="rotate(45)"', 'fill:var(--prp-map-nodata)', 'stroke-width="1.4"', 'stroke:var(--prp-map-border)']) assert.ok(p.includes(part), part);
  assert.ok(K.patternMarkup('nodata').includes('id="nodata"'));
  // Both pages draw it the same way today (each with its own copy).
  const nat = read('q/national.html'), vol = read('q/volatility.html');
  assert.ok(nat.includes('<pattern id="nodata" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--prp-map-nodata)"/><line y2="5" stroke-width="1.4" style="stroke:var(--prp-map-border)"/></pattern>'));
  assert.ok(K.patternMarkup('nodata').startsWith('<pattern id="nodata" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--prp-map-nodata)"/><line y2="5" stroke-width="1.4" style="stroke:var(--prp-map-border)"/></pattern>'));
  assert.match(vol, /attr\('width', 5\)\.attr\('height', 5\)\.attr\('patternTransform', 'rotate\(45\)'\)/);
  assert.match(vol, /attr\('y2', 5\)\.attr\('stroke-width', 1\.4\)\.style\('stroke', 'var\(--prp-map-border\)'\)/);
  // The legend swatch, as both pages draw it.
  const swatch = 'repeating-linear-gradient(135deg,var(--prp-map-border) 0 1px,var(--prp-map-nodata) 1px 4px)';
  assert.ok(nat.includes(swatch) && vol.includes(swatch) && K.css().includes(swatch));
  assert.ok(K.css().includes('.prp-nodata{fill:url(#prp-nodata)}'));
});

// Each page's sentence, as the plan's section 3 gives it (with the typographic apostrophe, VM's rule for prose).
const R = () => K.REASONS;
const SENTENCES = [
  ['Headline Tracker', () => ({ name: 'Nauru', reason: R().NOT_COVERED, what: 'front page found', source: 'VM', sought: 'a news feed from Nauru whose terms allow its headlines to be shown here' }),
    'Nauru: no front page found. VM has not found a news feed from Nauru whose terms allow its headlines to be shown here.'],
  ['Realtime Battlefield', () => ({ name: 'Portugal', reason: R().NOTHING_RECORDED, what: 'armed-conflict events', source: 'UCDP', when: 'January–September 2026' }),
    'Portugal: no armed-conflict events recorded by UCDP, January–September 2026.'],
  ['Retrospective Battlefield, from 1946', () => ({ name: 'Costa Rica', reason: R().NOTHING_RECORDED, what: 'armed conflict of 25 or more battle deaths', source: 'UCDP/PRIO', when: 'in 1990' }),
    'Costa Rica: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990.'],
  ['Retrospective Battlefield, before 1946', () => ({ name: 'Costa Rica', reason: R().NOTHING_RECORDED, what: 'war of 1,000 or more battle deaths', source: 'the Correlates of War', when: 'in 1932' }),
    'Costa Rica: no war of 1,000 or more battle deaths recorded by the Correlates of War in 1932.'],
  ['War Focus, a drawn state on neither side', () => ({ name: 'Switzerland', reason: R().NEITHER_SIDE }),
    'Switzerland: not on either side of this war.'],
  ['War Focus, a country in none of the wars', () => ({ name: 'Switzerland', reason: R().NEITHER_SIDE, wars: "War Focus's 39 major wars", also: 'Its armed conflicts since 1946, if any, are in the Retrospective Battlefield' }),
    'Switzerland: in none of War Focus’s 39 major wars. Its armed conflicts since 1946, if any, are in the Retrospective Battlefield.'],
  ['Political Retrospective', () => ({ name: 'Jamaica', reason: R().NOT_INDEPENDENT, when: 'in 1950' }),
    'Jamaica: not an independent state in 1950.'],
  ['Political Retrospective, where the sources disagree', () => ({ reason: R().NOTHING_RECORDED, what: 'leader', when: 'from 3 May 1950 to 9 June 1950', disagree: true }),
    'No leader is recorded from 3 May 1950 to 9 June 1950: the sources disagree.'],
  ['National Analysis', () => ({ name: 'Taiwan', reason: R().NOT_COVERED, what: 'figures', source: 'the World Bank' }),
    'Taiwan: no figures. The World Bank, this page’s source, does not publish data for Taiwan.'],
  ['Volatility', () => ({ name: 'Malta', reason: R().TOO_FEW, what: 'score', when: 'on 15 Nov', reports: 'news reports', source: 'GDELT', span: 'that day', count: 12, unit: 'event', needs: 'at least 25 events from 5 sources' }),
    'Malta: no score on 15 Nov. Too few news reports in GDELT that day (12 events); a score needs at least 25 events from 5 sources.'],
  ['Data Analytics', () => ({ name: 'Singapore', reason: R().NO_ROW }),
    'Singapore: no row for it in this table.'],
];
for (const [page, opts, want] of SENTENCES) test(`mapkit: the sentence for ${page}`, () => assert.equal(K.sentence(opts()), want));

test('mapkit: the reasons are a fixed set, and each produces its sentence', () => {
  assert.deepEqual(sorted(Object.values(K.REASONS)), sorted(['not-covered', 'nothing-recorded', 'too-few', 'no-row', 'neither-side', 'not-independent']));
  const used = new Set(SENTENCES.map(([, o]) => o().reason));
  assert.deepEqual(sorted(used), sorted(Object.values(K.REASONS)), 'every reason has a sentence above');
  for (const r of Object.values(K.REASONS)) assert.ok(K.REASON_TEXT[r], r);
  assert.throws(() => K.sentence({ name: 'Malta', reason: 'unknown' }), /reason/);
  assert.throws(() => K.sentence({ reason: K.REASONS.NO_ROW }), /name/);
  // The parts, for a tooltip that sets the first sentence apart; a full stop given in a slot is not doubled.
  const p = K.sentenceParts({ name: 'Taiwan', reason: K.REASONS.NOT_COVERED, what: 'figures.', source: 'the World Bank' });
  assert.deepEqual(p, { head: 'Taiwan: no figures.', why: 'The World Bank, this page’s source, does not publish data for Taiwan.', text: 'Taiwan: no figures. The World Bank, this page’s source, does not publish data for Taiwan.' });
  assert.equal(K.sentence({ name: 'Malta', reason: K.REASONS.TOO_FEW, what: 'score', source: 'GDELT', count: 1, unit: 'event', needs: 'at least 25 events' }), 'Malta: no score. Too few reports in GDELT (1 event); a score needs at least 25 events.');
  assert.equal(K.sentence({ name: "Côte d'Ivoire", reason: K.REASONS.NO_ROW, table: 'the table of 1990' }), 'Côte d’Ivoire: no row for it in the table of 1990.');
});

// Sentences the later builds quote (the plan's AC-3, AC-13 and AC-14), beyond section 3's.
test('mapkit: the sentences of AC-3, AC-13 and AC-14', () => {
  const S = K.sentence, R2 = K.REASONS;
  // AC-3: Northern Cyprus and Somaliland on National Analysis.
  assert.equal(S({ name: 'Northern Cyprus', reason: R2.NOT_COVERED, unclaimed: true, what: 'figures', source: 'the World Bank' }),
    'Northern Cyprus: this page has no figures for it. The World Bank, its source, publishes none for it on its own.');
  // AC-14: the Realtime Battlefield's country layer.
  assert.equal(S({ reason: R2.NOTHING_RECORDED, what: 'armed-conflict events', verb: '', source: 'UCDP', when: 'in Portugal, January–September 2026' }),
    'No armed-conflict events recorded by UCDP in Portugal, January–September 2026.');
  // AC-13: the Retrospective Battlefield, one year, and a period that spans 1946 and so names both records.
  assert.equal(S({ reason: R2.NOTHING_RECORDED, what: 'armed conflict of 25 or more battle deaths', verb: '', source: 'UCDP/PRIO', when: 1990 }),
    'No armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990.');
  assert.equal(S({ name: 'Costa Rica', reason: R2.NOTHING_RECORDED, what: 'war of 1,000 or more battle deaths', source: 'the Correlates of War', when: 'from 1940 to 1945',
    and: { what: 'armed conflict of 25 or more battle deaths', source: 'UCDP/PRIO', when: 'from 1946 to 1950' } }),
  'Costa Rica: no war of 1,000 or more battle deaths recorded by the Correlates of War from 1940 to 1945, and no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO from 1946 to 1950.');
  assert.equal(S({ reason: R2.NOTHING_RECORDED, what: 'leaders', verb: 'are', when: 'in 1950' }), 'No leaders are recorded in 1950.');
});

test('mapkit: the sentence keeps a slot’s abbreviation, reads a bare year, and counts in words', () => {
  const S = K.sentence, R2 = K.REASONS;
  // A stop that ends an abbreviation stays, and is not doubled; a plain one is still dropped.
  assert.equal(S({ name: 'Taiwan', reason: R2.NOT_COVERED, what: 'figures', source: 'the U.N.' }), 'Taiwan: no figures. The U.N., this page’s source, does not publish data for Taiwan.');
  assert.equal(S({ name: 'Taiwan', reason: R2.NOT_COVERED, what: 'figures', source: 'Freedom House Inc.' }), 'Taiwan: no figures. Freedom House Inc., this page’s source, does not publish data for Taiwan.');
  assert.equal(S({ name: 'Taiwan', reason: R2.NOT_COVERED, what: 'figures', source: 'the World Bank.' }), 'Taiwan: no figures. The World Bank, this page’s source, does not publish data for Taiwan.');
  assert.equal(S({ name: 'U.S.', reason: R2.NO_ROW }), 'U.S.: no row for it in this table.');
  assert.equal(S({ name: 'Malta', reason: R2.NO_ROW, table: 'the table of the U.N.' }), 'Malta: no row for it in the table of the U.N.');
  // 'when': a bare year, a capital preposition, a trailing ellipsis.
  for (const when of [1950, '1950', 'In 1950', 'in 1950.', 'in 1950…']) assert.equal(S({ name: 'Jamaica', reason: R2.NOT_INDEPENDENT, when }), 'Jamaica: not an independent state in 1950.', String(when));
  // A slot's own '?' or '!' ends its sentence with no stop added.
  assert.equal(S({ name: 'Malta', reason: R2.NO_ROW, also: 'See the Atlas?' }), 'Malta: no row for it in this table. See the Atlas?');
  // Quotes: an opening one becomes ‘, an apostrophe after a digit ’.
  assert.equal(S({ name: 'Malta', reason: R2.NO_ROW, also: "'Other' is not a country" }), 'Malta: no row for it in this table. ‘Other’ is not a country.');
  assert.equal(S({ name: 'Malta', reason: R2.NEITHER_SIDE, wars: "the 1990's wars" }), 'Malta: in none of the 1990’s wars.');
  // too-few: a count as a string, 0 and 1, and plurals.
  const few = o => S({ name: 'Malta', reason: R2.TOO_FEW, what: 'score', when: 'on 15 Nov', reports: 'news reports', source: 'GDELT', span: 'that day', needs: 'at least 25 events from 5 sources', ...o });
  assert.equal(few({ count: '12', unit: 'event' }), 'Malta: no score on 15 Nov. Too few news reports in GDELT that day (12 events); a score needs at least 25 events from 5 sources.');
  assert.equal(few({ count: 0, unit: 'event' }), 'Malta: no score on 15 Nov. Too few news reports in GDELT that day (0 events); a score needs at least 25 events from 5 sources.');
  assert.equal(few({ count: '1', unit: 'event' }), 'Malta: no score on 15 Nov. Too few news reports in GDELT that day (1 event); a score needs at least 25 events from 5 sources.');
  assert.ok(few({ count: 12, unit: 'events' }).includes('(12 events)'));
  assert.ok(few({ count: 12, unit: 'story' }).includes('(12 stories)'));
  assert.ok(few({ count: 12, unit: 'person', units: 'people' }).includes('(12 people)'));
  assert.throws(() => few({ count: 'twelve', unit: 'event' }), /count/);
});
