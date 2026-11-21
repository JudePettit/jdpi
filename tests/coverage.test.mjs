// Coverage map (integration/scripts/coverage.mjs): the country resolvers, the extraction of countries from content and
// the gap rules, on small fixtures. No network, no browser, and none of VM's real data: the real run is
//   node integration/scripts/coverage.mjs --json <file> --md <file>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeResolvers, newPiece, add, covered, coverageClass, countryCoverage, kinoFilms, warFocusWar, warSideGaps, warFilmGaps, retroWar,
  sceneGap, retroMoment, warFocusMoment, scopeGap, calendarGap, thinIndexGap, scopeTextGaps, boxShare, isAfrica, TERRITORIES, kinoScene, rankGaps,
  recognisedShapes,
} from '../integration/scripts/coverage.mjs';

/* ------------------------------------------------------------------ fixtures */
const NATIONAL = [
  { iso3: 'FRA', iso2: 'FR', name: 'France', region: 'Europe & Central Asia', qid: 'Q142', gw: 220 },
  { iso3: 'DEU', iso2: 'DE', name: 'Germany', region: 'Europe & Central Asia', qid: 'Q183', gw: 255 },
  { iso3: 'RUS', iso2: 'RU', name: 'Russian Federation', region: 'Europe & Central Asia', qid: 'Q159', gw: 365 },
  { iso3: 'UKR', iso2: 'UA', name: 'Ukraine', region: 'Europe & Central Asia', qid: 'Q212', gw: 369 },
  { iso3: 'EGY', iso2: 'EG', name: 'Egypt, Arab Rep.', region: 'Middle East, North Africa, Afghanistan & Pakistan', qid: 'Q79', gw: 651 },
  { iso3: 'SEN', iso2: 'SN', name: 'Senegal', region: 'Sub-Saharan Africa ', qid: 'Q1041', gw: 433 },
  { iso3: 'SSD', iso2: 'SS', name: 'South Sudan', region: 'Sub-Saharan Africa ', qid: 'Q958', gw: 626 },
  { iso3: 'SDN', iso2: 'SD', name: 'Sudan', region: 'Sub-Saharan Africa ', qid: 'Q1049', gw: 625 },
  { iso3: 'VNM', iso2: 'VN', name: 'Viet Nam', region: 'East Asia & Pacific', qid: 'Q881', gw: 815 },
  { iso3: 'GRL', iso2: 'GL', name: 'Greenland', region: 'Europe & Central Asia', qid: 'Q223', gw: null },
];
const NAMES = [['FRA', 'FR', '250', 'France'], ['DEU', 'DE', '276', 'Germany', 'West Germany'], ['RUS', 'RU', '643', 'Russia', 'Soviet Union / Russia'],
  ['UKR', 'UA', '804', 'Ukraine'], ['EGY', 'EG', '818', 'Egypt'], ['SEN', 'SN', '686', 'Senegal'], ['SSD', 'SS', '728', 'South Sudan'], ['SDN', 'SD', '729', 'Sudan'],
  ['VNM', 'VN', '704', 'Vietnam', 'Viet Nam'], ['GRL', 'GL', '304', 'Greenland'], ['TWN', 'TW', '158', 'Taiwan']];
const HISTORICAL = { SUN: ['RUS', 'UKR'], YUG: ['SRB', 'HRV'] };
// Natural Earth-like TopoJSON with absolute coordinates (since 20 November 2026; CShapes before): France a square at
// 0–10°, Egypt at 20–30°, Russia at 40–60°, Morocco at 70–80° with Western Sahara's box at 70–75° by 0–8° drawn after it
// (Natural Earth draws Western Sahara's coast inside Morocco). Cliopatria-like borders: Ukraine of 1992 at 40–50°, which
// Russia's shape covers (the recognised-border correction), and a later Ukraine row that must not be the one read.
const square = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const COUNTRIES = {
  type: 'Topology',
  arcs: [square(0, 0, 10, 10), square(20, 0, 30, 10), square(40, 0, 60, 10), square(70, 0, 80, 20), square(70, 0, 75, 8)],
  objects: { countries: { type: 'GeometryCollection', geometries: [
    { type: 'Polygon', arcs: [[0]], properties: { iso3: 'FRA', q: 'Q142' } },
    { type: 'Polygon', arcs: [[1]], properties: { iso3: 'EGY', q: 'Q79' } },
    { type: 'Polygon', arcs: [[2]], properties: { iso3: 'RUS', q: 'Q159' } },
    { type: 'Polygon', arcs: [[3]], properties: { iso3: 'MAR', q: 'Q1028' } },
    { type: 'Polygon', arcs: [[4]], properties: { iso3: 'ESH', q: 'Q6250' } },
  ] } },
};
const CLIOPATRIA = {
  type: 'Topology',
  arcs: [square(40, 0, 50, 10), square(40, 0, 55, 10)],
  objects: { borders: { type: 'GeometryCollection', geometries: [
    { type: 'Polygon', arcs: [[0]], properties: { q: 'Q598570', k: 'POLITY', f: 1992, t: 2023, n: 'Ukraine' } },
    { type: 'Polygon', arcs: [[1]], properties: { q: 'Q598570', k: 'POLITY', f: 2024, t: 2024, n: 'Ukraine' } },
  ] } },
};
// The Retrospective Battlefield's places by Wikidata item (battlefield/history/data/places.json), and its old c= numbers.
const PLACES = { Q142: { n: 'France', iso3: 'FRA' }, Q79: { n: 'Egypt', iso3: 'EGY' }, Q183: { n: 'Germany', iso3: 'DEU' }, Q1041: { n: 'Senegal', iso3: 'SEN' },
  Q15180: { n: 'Soviet Union', iso3: 'SUN' }, Q838261: { n: 'Federal Republic of Yugoslavia', iso3: 'YUG' }, Q16957: { n: 'East Germany', iso3: 'DDR' },
  Q172640: { n: 'North Vietnam' }, Q8680: { n: 'British Empire' }, Q19951607: { n: 'French Colonial Africa' } };
const OLD_COUNTRIES = { 220: 'Q142', 365: 'Q15180' };
const R = makeResolvers({ national: NATIONAL, names: NAMES, historical: HISTORICAL, countries: COUNTRIES, small: [{ iso3: 'SGP', q: 'Q334', at: [103.82, 1.35] }],
  recognised: recognisedShapes([CLIOPATRIA]), places: PLACES, oldCountries: OLD_COUNTRIES, normaliseCountry: n => (n === 'Ivory Coast' ? "Côte d'Ivoire" : n) });

/* ------------------------------------------------------------------ resolvers */
test('the target list is National Analysis without its territories, plus Taiwan and the Holy See', () => {
  assert.ok(TERRITORIES.has('GRL'));
  assert.deepEqual([...R.target].sort(), ['DEU', 'EGY', 'FRA', 'RUS', 'SDN', 'SEN', 'SSD', 'TWN', 'UKR', 'VAT', 'VNM']);
  assert.equal(R.name('EGY'), 'Egypt', 'the common name, not the World Bank one');
  assert.equal(R.region('SEN'), 'Sub-Saharan Africa', 'trailing space trimmed');
  assert.equal(R.region('TWN'), 'East Asia & Pacific');
  assert.ok(isAfrica('EGY', R.region('EGY')) && isAfrica('SEN', R.region('SEN')) && !isAfrica('FRA', R.region('FRA')));
});

test('names resolve through the spellings table, with historical and supranational names', () => {
  assert.equal(R.nameIso('Viet Nam'), 'VNM');
  assert.equal(R.nameIso('Egypt, Arab Rep.'), 'EGY');
  assert.equal(R.nameIso('Soviet Union / Russia'), 'RUS', "the Retrospective's historical name: today's half");
  assert.equal(R.nameIso('Soviet Union'), 'SUN');
  assert.deepEqual(R.expand(R.nameIso('Soviet Union')), ['RUS', 'UKR'], 'a historical state counts as its successors');
  assert.equal(R.nameIso('International'), null, 'supranational: no country');
  assert.equal(R.nameIso('Atlantis'), undefined, 'unknown');
});

test('Gleditsch–Ward codes resolve by date for the Soviet Union and Yugoslavia', () => {
  assert.deepEqual(R.gwIso(365, '1941-06-22'), ['RUS', 'UKR']);
  assert.deepEqual(R.gwIso(365, '1995-01-01'), ['RUS']);
  assert.deepEqual(R.gwIso(345, '1999-03-24'), ['SRB', 'MNE', 'XKX']);
  assert.deepEqual(R.gwIso(345, '2010-01-01'), ['SRB']);
  assert.deepEqual(R.gwIso(345, '1941-04-06'), ['SRB', 'HRV']);
  assert.deepEqual(R.gwIso(815), ['VNM']);
  assert.deepEqual(R.gwIso(816), ['VNM'], "today's code for Vietnam, which National lacks");
  assert.deepEqual(R.gwIso(315), ['CZE', 'SVK'], 'Czechoslovakia');
  assert.equal(R.gwIso(99999), null);
});

// Since 20 November 2026 the Retrospective Battlefield keys its places by Wikidata item (places.json); its old c=<number>
// addresses still open the same place (oldCountries), and the Political Retrospective is read under either shape.
test('the Retrospective Battlefield\'s places and the Retrospective\'s keys resolve without a Gleditsch–Ward code', () => {
  assert.deepEqual(R.placeIso('Q142'), ['FRA']);
  assert.deepEqual(R.expand(R.placeIso('Q15180')), ['RUS', 'UKR'], 'the Soviet Union as its successors');
  assert.deepEqual(R.placeIso('Q16957'), ['DEU'], 'East Germany is Germany today');
  assert.deepEqual(R.placeIso('Q172640'), ['VNM'], 'North Vietnam, a place with no code of its own: VM\'s table');
  assert.deepEqual(R.placeIso('Q838261'), ['SRB', 'MNE', 'XKX'], 'federal Yugoslavia, as code 345 stood for it from 1992 to 2006');
  assert.equal(R.placeIso('Q19951607'), null, 'French Colonial Africa is no one country today');
  assert.deepEqual(R.placeIso('Q8680'), ['GBR'], 'the British Empire is the United Kingdom, as the Master Index files it');
  assert.deepEqual(R.placeIso('Q183'), ['DEU']);
  assert.deepEqual(R.battlefieldIso(220), ['FRA'], 'an old address, c=220');
  assert.deepEqual(R.battlefieldIso('Q79'), ['EGY']);
  assert.equal(R.battlefieldIso(999), null);
  const T = makeResolvers({ national: NATIONAL, historical: HISTORICAL, retro: { countries: { Q15180: { iso3: 'RUS' }, Q142: { iso3: 'FRA' } }, oldKeys: { 365: 'Q15180', 220: 'Q142' } } });
  assert.deepEqual(T.retroIso('Q15180', '1950-07-01'), ['SUN'], 'the Soviet Union before its end');
  assert.deepEqual(T.retroIso('Q15180', '1995-07-01'), ['RUS'], 'the record\'s country after');
  assert.deepEqual(T.retroIso(365, '1950-07-01'), ['SUN'], 'an old number through OLD_KEYS');
  assert.deepEqual(T.retroIso(220), ['FRA']);
  assert.deepEqual(R.retroIso(365, '1950-07-01'), ['RUS', 'UKR'], 'without the Retrospective, an old number still opens its place');
});

test('points fall in a shape, near a coast, under the recognised border, or nowhere', () => {
  assert.deepEqual(R.pointIso(5, 5), { iso: 'FRA', how: 'in' });
  assert.deepEqual(R.pointIso(10.1, 5), { iso: 'FRA', how: 'near' });
  assert.equal(R.pointIso(15, 5), null, 'at sea');
  assert.deepEqual(R.pointIso(15, 5, { near: 5.5 }), { iso: 'FRA', how: 'near' }, 'a wider coast for capitals');
  assert.equal(R.pointIso(45, 5).iso, 'UKR', "inside Cliopatria's Ukraine of 1992, though Natural Earth draws Russia there");
  assert.equal(R.pointIso(52, 5).iso, 'RUS', "only Cliopatria's first Ukraine row is read");
  assert.equal(R.pointIso(55, 5).iso, 'RUS');
  assert.equal(R.pointIso(72, 5).iso, 'ESH', "Natural Earth's Morocco inside Western Sahara's box is Western Sahara");
  assert.equal(R.pointIso(72, 15).iso, 'MAR');
  assert.deepEqual(R.pointIso(103.9, 1.3), { iso: 'SGP', how: 'dot' }, "a small state Natural Earth's 1:110m file leaves out, by its point");
  assert.deepEqual(recognisedShapes([CLIOPATRIA]).map(r => [r.iso, r.over, r.feats.length]), [['UKR', 'RUS', 1]], 'no Syria row in the fixture: none');
  assert.deepEqual(R.pointIso(12.4534, 41.9029), { iso: 'VAT', how: 'dot' });
  assert.equal(R.pointIso(null, 5), null);
});

test('text names count once each, longest first, and a second "South Sudan" is not also Sudan', () => {
  assert.deepEqual(R.textIso('Egypt and Senegal; also France.').sort(), ['EGY', 'FRA', 'SEN']);
  assert.deepEqual(R.textIso('South Sudan voted. Later, South Sudan again.'), ['SSD']);
  assert.deepEqual(R.textIso('South Sudan and Sudan').sort(), ['SDN', 'SSD']);
  assert.deepEqual(R.textIso('francophone france'), [], 'whole names, written as given');
});

/* ------------------------------------------------------------------ extraction */
const WAR = {
  id: 'w1', name: 'Test war', qid: 'Q1', bf: 'c1', start: '1940-01-01', months: ['1940-05', '1940-06'],
  sides: { a: { states: [{ gw: 220, from: '1940-01-01', to: null }] }, b: { states: [{ gw: 255, from: '1940-01-01', to: null }] } },
  theatre: [], control: [],
  battles: [
    { q: 'Q10', n: 'Battle A', lat: 5, lon: 25, s: '1940-05-01', e: '1940-05-20' },
    { q: 'Q11', n: 'Battle B', lat: 6, lon: 26, s: '1940-06-01', e: '1940-06-10' },
    { q: 'Q12', n: 'Battle C', lat: 5, lon: 5, s: '1940-05-10', e: '1940-05-12' },
    { q: 'Q13', n: 'Sea battle', lat: 5, lon: 15, s: '1940-05-10', e: '1940-05-12' },
  ],
  cells: [[], []],
};

test('War Focus: belligerents from sides at their dates, places from battles', () => {
  const w = warFocusWar(WAR, R);
  assert.deepEqual([...w.belligerent.keys()].sort(), ['DEU', 'FRA']);
  assert.deepEqual(Object.fromEntries(w.point), { EGY: 2, FRA: 1 });
  assert.equal(w.unplaced, 1, 'the battle at sea');
  const m = warFocusMoment(w, '1940-05');
  assert.deepEqual(m.places.map(p => p.label), ['Battle A', 'Battle C', 'Sea battle'], 'only battles under way that month');
});

test('war-sides: battles in a country on neither side, and a war with no country at all', () => {
  const gaps = warSideGaps([warFocusWar(WAR, R), warFocusWar({ ...WAR, id: 'w2', name: 'Empty war', sides: { a: { states: [] }, b: { states: [] } } }, R)], R);
  const off = gaps.find(g => g.piece === 'war-focus:w1');
  assert.deepEqual(off.countries, ['EGY']);
  assert.match(off.evidence.EGY.battles, /Battle A; Battle B/);
  assert.ok(gaps.find(g => g.piece === 'war-focus:w2' && /no country/.test(g.title)));
  assert.equal(warSideGaps([warFocusWar(WAR, R)], R, { minBattles: 3 }).length, 0, 'a single stray battle is not enough');
});

test('Retrospective Battlefield: each year uses locYears where it exists, loc otherwise', () => {
  const w = retroWar({ id: 'c1', name: 'Test war', years: [[1940, 1], [1941, 1]], loc: ['Q142'], locYears: { 1941: ['Q79'] }, states: ['Q142', 'Q183'] }, R);
  assert.deepEqual([...w.fought.keys()].sort(), ['EGY', 'FRA']);
  assert.deepEqual([...w.part.keys()].sort(), ['DEU', 'FRA']);
  const y = retroWar({ id: 'Q2', name: 'Year by year', years: [[1940, 3], [1941, 3]], loc: ['Q142'], states: ['Q142', 'Q183', 'Q1041'], statesYears: { 1940: ['Q142'], 1941: ['Q142', 'Q183'] } }, R);
  assert.deepEqual(Object.fromEntries(y.part), { FRA: 2, DEU: 1 }, 'each year\'s parties where statesYears gives them');
  assert.deepEqual(retroWar({ id: 'Q3', name: 'Empire', years: [[1930, 3]], loc: ['Q19951607'], states: [] }, R).unknown, ['Q19951607']);
  assert.deepEqual([...retroMoment(w, '1941', R).fought], ['EGY']);
  assert.deepEqual([...retroMoment(w, '1940', R).fought], ['FRA']);
});

// Kino's own helpers are stubbed: scenes are given flat and a link's "at" is already read.
const KINO = { flatScenes: d => d.scenes, readAt: l => l.at };
const sceneOf = (id, extra) => ({ id, title: id, visual: { kind: 'map', groups: [] }, ...extra });
const FILMS = [
  { meta: { id: 'the-war', category: 'wars', title: 'The war' }, doc: { title: 'The war', subjects: [], scenes: [
    sceneOf('may', { focus: { countries: ['FRA'], bbox: [-5, -5, 35, 15], points: [[5, 5, 'Paris']] }, link: { module: 'war-focus', label: 'War Focus · May 1940', at: { war: 'w1', m: '1940-05' } }, narration: 'France fell; Egypt waited.' }),
    sceneOf('atlas', { link: { module: 'atlas', at: { country: 'deu' } } }),
  ] } },
  { meta: { id: 'a-leader', category: 'political-figures', title: 'A leader' }, doc: { title: 'A leader', subjects: [{ qid: 'Q99' }], scenes: [
    sceneOf('may', { focus: { countries: ['DEU'], bbox: [-5, -5, 35, 15] }, link: { module: 'war-focus', at: { war: 'w1', m: '1940-05' } } }),
  ] } },
  { meta: { id: 'about-it', category: 'political-events', title: 'About it' }, doc: { title: 'About it', subjects: [{ qid: 'Q1' }], scenes: [sceneOf('one', { focus: { countries: ['SUN'] } })] } },
];

test('Kino: map, point, linked and named tiers per film, and the wars each film links to', () => {
  const wfWars = new Map([['w1', { qid: 'Q1', bf: 'c1' }]]);
  const { films, pieces } = kinoFilms(FILMS, R, { ...KINO, wfWars });
  const [war, leader, about] = pieces;
  assert.deepEqual([...war.tiers.map.keys()], ['FRA']);
  assert.deepEqual([...war.tiers.point.keys()], ['FRA']);
  assert.deepEqual([...war.tiers.linked.keys()], ['DEU'], 'the Atlas link');
  assert.deepEqual([...war.tiers.named.keys()].sort(), ['EGY', 'FRA']);
  assert.deepEqual(films[0].own, { wf: ['w1'], rb: ['c1'] }, 'a Wars film owns the war it links to (and its Retrospective Battlefield twin)');
  assert.deepEqual(films[1].own, { wf: [], rb: [] }, 'a biography that visits the war does not');
  assert.deepEqual(films[2].own.wf, ['w1'], 'a film whose subject is the war owns it without a link');
  assert.deepEqual([...about.tiers.map.keys()], ['RUS', 'UKR'], 'the Soviet Union drawn as its successors');
  assert.ok(leader.tiers.map.has('DEU'));
});

test('war-film and war-scene: the war countries a film never shows, and the scene that leaves one grey', () => {
  const wf = new Map([['w1', warFocusWar(WAR, R)]]);
  const rb = new Map([['c1', retroWar({ id: 'c1', name: 'Test war', years: [[1940, 1]], loc: ['Q142', 'Q1041'], states: ['Q142'] }, R)]]);
  const { films, pieces } = kinoFilms(FILMS, R, { ...KINO, wfWars: new Map([['w1', { qid: 'Q1', bf: 'c1' }]]) });
  const gaps = warFilmGaps(films, new Map(pieces.map(p => [p.id, p])), { wf, rb }, R);
  const film = gaps.find(g => g.piece === 'kino:wars/the-war');
  assert.equal(film.rule, 'war-film');
  assert.deepEqual(film.countries, ['DEU', 'EGY', 'SEN'], 'the other side, the battle country, and where the Retrospective Battlefield says it was fought');
  assert.deepEqual(film.named, ['EGY'], 'named in the narration but never drawn');
  assert.deepEqual(Object.keys(film.evidence.SEN), ['retrospective-battlefield:c1']);
  assert.deepEqual(film.scenes.map(s => [s.scene, s.missing]), [['may', ['EGY']]], 'Battle A is in view that month and Egypt is grey');
  assert.deepEqual(film.scenes[0].why.EGY, ['Battle A']);
  assert.equal(film.weight, 3 + 1, 'one per piece of evidence per country (one each here), plus one per country a scene leaves grey');
  const leader = gaps.find(g => g.piece === 'kino:political-figures/a-leader');
  assert.equal(leader.rule, 'war-scene', 'the biography is checked scene by scene only');
  assert.deepEqual(leader.countries, []);
  assert.deepEqual(leader.scenes[0].missing, ['EGY', 'FRA'], 'France fights in view too and the scene draws only Germany');
});

test('a scene with no view box has no scene rule; box shares count fought-over countries in view', () => {
  assert.equal(sceneGap({ id: 'x', map: new Set(), point: new Set(), bbox: null }, { places: [], fought: new Set(['FRA']) }, R), null);
  assert.equal(boxShare([0, 0, 10, 10], [5, 0, 20, 10]), 0.5);
  assert.equal(boxShare([0, 0, 10, 10], [20, 20, 30, 30]), 0);
  assert.equal(boxShare(null, [0, 0, 1, 1]), 0);
  const fake = { ...R, box: c => ({ FRA: [0, 0, 10, 10], EGY: [20, 0, 30, 10] })[c] };
  const g = sceneGap({ id: 'x', title: 'x', map: new Set(), point: new Set(), bbox: [8, 0, 40, 10] }, { places: [], fought: new Set(['FRA', 'EGY']) }, fake);
  assert.deepEqual(g.missing, ['EGY', 'FRA'], 'France has a fifth of its box in view, Egypt all of it');
  const h = sceneGap({ id: 'x', title: 'x', map: new Set(), point: new Set(), bbox: [9, 0, 40, 10] }, { places: [], fought: new Set(['FRA']) }, fake);
  assert.deepEqual(h.missing, [], 'a tenth is not enough');
});

test('a historical state is one entry in the gap rules: the Soviet Union taking part is not fifteen countries', () => {
  assert.deepEqual(R.placeGroup('Q15180'), { key: 'Q15180:RUS,UKR', q: 'Q15180', name: 'the Soviet Union', successors: ['RUS', 'UKR'] });
  assert.equal(R.placeGroup('Q142'), null);
  assert.equal(R.placeGroup('Q838261').name, 'Serbia and Montenegro');
  // War Focus still reads Gleditsch–Ward codes (until it moves to Cliopatria): its groups are unchanged.
  assert.deepEqual(R.gwGroup(365, '1950-07-01'), { key: 'gw365:RUS,UKR', gw: 365, name: 'the Soviet Union', successors: ['RUS', 'UKR'] });
  assert.equal(R.gwGroup(365, '1995-07-01'), null, 'Russia after 1991 is one country');
  // A Korean War: France fought in, the Soviet Union took part; the film draws France.
  const rbw = retroWar({ id: 'k1', name: 'Korea-like', years: [[1950, 1]], loc: ['Q142'], states: ['Q142', 'Q15180'] }, R);
  assert.deepEqual([...rbw.part.keys()].sort(), ['FRA', 'RUS', 'UKR'], 'coverage still counts every successor');
  assert.deepEqual([...rbw.partDirect.keys()], ['FRA']);
  const docs = [{ meta: { id: 'korea', category: 'wars', title: 'Korea' }, doc: { title: 'Korea', subjects: [], scenes: [
    sceneOf('one', { focus: { countries: ['FRA'] }, link: { module: 'battlefield-history', at: { w: 'k1', y: 1950 } } })] } }];
  const k = kinoFilms(docs, R, KINO);
  const [gap] = warFilmGaps(k.films, new Map(k.pieces.map(p => [p.id, p])), { wf: new Map(), rb: new Map([['k1', rbw]]) }, R);
  assert.deepEqual(gap.countries, [], 'no successor listed on its own');
  assert.deepEqual(gap.states.map(s => [s.name, s.successors, s.evidence]), [['the Soviet Union', ['RUS', 'UKR'], { 'retrospective-battlefield:k1': 'took part' }]]);
  assert.equal(gap.weight, 1, 'one state, one piece of evidence');
  // A film that draws any successor draws the state.
  const k2 = kinoFilms([{ ...docs[0], doc: { ...docs[0].doc, scenes: [sceneOf('one', { focus: { countries: ['FRA', 'UKR'] } })] } }], R, KINO);
  assert.equal(warFilmGaps(k2.films, new Map(k2.pieces.map(p => [p.id, p])), { wf: new Map(), rb: new Map([['k1', rbw]]) }, R).length, 0);
});

test('war-scene: a historical state fought over is kept whole, in view only if a fifth of all its successors is', () => {
  const fake = { ...R, box: c => ({ RUS: [40, 0, 60, 10], UKR: [30, 0, 40, 10], FRA: [0, 0, 10, 10] })[c] };
  const war = { raw: { years: [[1990, 1]], loc: ['Q15180'] } };
  const m = retroMoment(war, '1990', fake);
  assert.deepEqual([...m.fought], [], 'no country on its own');
  assert.deepEqual(m.states.map(s => s.name), ['the Soviet Union']);
  const scene = (bbox, map = []) => ({ id: 's', title: 's', map: new Set(map), point: new Set(), bbox });
  assert.deepEqual(sceneGap(scene([35, 0, 70, 10], ['RUS']), m, fake).states, [], 'the scene draws a successor, so it draws the state');
  const corner = sceneGap(scene([0, 0, 34, 10]), m, fake);
  assert.deepEqual([corner.missing, corner.states], [[], []], "Ukraine's corner alone is not the Soviet Union in view (an eighth of its box)");
  const whole = sceneGap(scene([28, 0, 70, 10]), m, fake);
  assert.deepEqual(whole.states.map(s => [s.name, s.why]), [['the Soviet Union', ['fought over that year']]]);
  assert.deepEqual(whole.missing, [], 'listed once, not as each successor');
});

// A Kino link to the Retrospective Battlefield written before 20 November 2026 (w=c139, c=365) is read as the page reads
// it: the war it became (wars.json oldIds) and the place the number stood for (places.json oldCountries).
test('Kino: an old Retrospective Battlefield link is the war and the place it became', () => {
  const docs = [{ meta: { id: 'old', category: 'wars', title: 'Old' }, doc: { title: 'Old', subjects: [], scenes: [
    sceneOf('one', { focus: { countries: ['FRA'] }, link: { module: 'battlefield-history', at: { w: 'c139', y: 1941, c: 365 } } })] } }];
  const k = kinoFilms(docs, R, { ...KINO, rbOld: { c139: 'Q362' } });
  assert.deepEqual(k.films[0].wars.rb, ['Q362']);
  assert.deepEqual([...k.pieces[0].tiers.linked.keys()], ['RUS', 'UKR']);
  assert.deepEqual(k.films[0].links[0].at, { w: 'c139', y: 1941, c: 365 }, 'the link as written is kept for the dead-link rule');
});

// Review X4 (21 November 2026): a number UCDP gave two states over time is stored as dated runs (places.json
// oldCountries, [[first, last, Q], …]; 365 and 678 as the committed file holds them), and battlefieldIso read every
// entry as one Q-id and was given no year, so a link to #y=1988&c=365 counted no country. It reads the link's year
// through the page's own function (battlefield/history/old-countries.js), a year between two runs too.
test('Kino: an old Battlefield number UCDP gave two states counts the state of the link’s year', () => {
  const places = { ...PLACES, Q159: { n: 'Russia', iso3: 'RUS' }, Q267584: { n: 'Yemen Arab Republic', since: 1962 }, Q805: { n: 'Yemen', iso3: 'YEM', since: 1990 } };
  const oldCountries = { 220: 'Q142', 365: [[1946, 1991, 'Q15180'], [1993, 2025, 'Q159']], 552: [[1967, 1979, 'Q217169'], [1985, 2011, 'Q954']] };
  const T = makeResolvers({ national: NATIONAL, historical: HISTORICAL, places, oldCountries });
  assert.deepEqual(T.battlefieldIso(365, 1988), ['SUN'], '365 in 1988: the Soviet Union');
  assert.deepEqual(T.battlefieldIso(365, 1992), ['RUS'], '365 in 1992, between its runs: Russia');
  assert.deepEqual(T.battlefieldIso(365, 2000), ['RUS']);
  assert.deepEqual(T.battlefieldIso(552, 1975), ['ZWE'], 'Rhodesia, VM’s table');
  assert.deepEqual(T.battlefieldIso(220, 1950), ['FRA'], 'a plain entry, any year');
  assert.deepEqual(T.battlefieldIso('Q79'), ['EGY']);
  const docs = [{ meta: { id: 'old', category: 'wars', title: 'Old' }, doc: { title: 'Old', subjects: [], scenes: [
    sceneOf('one', { link: { module: 'battlefield-history', at: { y: 1988, c: 365 } } })] } }];
  assert.deepEqual([...kinoFilms(docs, T, KINO).pieces[0].tiers.linked.keys()], ['RUS', 'UKR'], 'the link counts the Soviet Union, as its successors');
  const later = [{ ...docs[0], doc: { ...docs[0].doc, scenes: [sceneOf('one', { link: { module: 'battlefield-history', at: { y: 2000, c: 365 } } })] } }];
  assert.deepEqual([...kinoFilms(later, T, KINO).pieces[0].tiers.linked.keys()], ['RUS'], 'in 2000, Russia');
});

test('Kino arrows count where they bend (via), and "New Guinea" is not Guinea', () => {
  const s = kinoScene({ id: 'a', visual: { kind: 'map', arrows: [{ from: [25, 5], via: [5, 5], to: [55, 5] }] } }, R);
  assert.deepEqual([...s.point].sort(), ['EGY', 'FRA', 'RUS'], 'the arrow is drawn across France');
  const T = makeResolvers({ national: NATIONAL, names: [...NAMES, ['GIN', 'GN', '324', 'Guinea'], ['PNG', 'PG', '598', 'Papua New Guinea'], ['MEX', 'MX', '484', 'Mexico'], ['GNB', 'GW', '624', 'Guinea-Bissau']], historical: HISTORICAL });
  assert.deepEqual(T.textIso('The New Guinea campaign'), []);
  assert.deepEqual(T.textIso('Papua New Guinea and Guinea'), ['PNG', 'GIN']);
  assert.deepEqual(T.textIso('In New Mexico; in the Gulf of Guinea'), []);
  assert.deepEqual(T.textIso('Portuguese Guinea, now Guinea-Bissau'), ['GNB']);
});

test('gaps: content weights are ranked first, plain counts after them', () => {
  const g = rankGaps([{ rule: 'dead-link', piece: 'a', weight: 140 }, { rule: 'war-film', piece: 'b', weight: 20 }, { rule: 'scope-text', piece: 'c', weight: 13 }, { rule: 'scope', piece: 'd', weight: 600 }]);
  assert.deepEqual(g.map(x => [x.piece, x.unit]), [['d', 'content'], ['b', 'content'], ['a', 'count'], ['c', 'count']]);
});

/* ------------------------------------------------------------------ coverage and the other rules */
function pieces() {
  const atlas = newPiece('political-atlas', 'atlas', 'Political Atlas', 'reference'); add(atlas, 'row', ['FRA', 'DEU']);
  const cal = newPiece('historical-calendar', 'historical-calendar', 'Historical Calendar'); add(cal, 'tagged', ['FRA', 'EGY']);
  const brief = newPiece('briefing-political', 'briefing', 'Political Briefing'); add(brief, 'named', ['SEN', 'EGY']);
  const nat = newPiece('national-analysis', 'pestle', 'National Analysis', 'table'); add(nat, 'row', ['FRA', 'DEU', 'EGY', 'SEN', 'SDN']);
  const mi = newPiece('master-index', 'encyclopedia', 'Master Index'); add(mi, 'row', ['FRA', 'EGY', 'SEN', 'SDN']); add(mi, 'tagged', 'FRA', 40); add(mi, 'tagged', 'EGY', 3);
  return [atlas, cal, brief, nat, mi];
}

test('coverage classes: content, named only, tables only, none', () => {
  const ps = pieces(), byId = new Map(ps.map(p => [p.id, p])), cov = countryCoverage(ps);
  assert.deepEqual(cov.get('EGY'), { 'historical-calendar': ['tagged'], 'briefing-political': ['named'], 'national-analysis': ['row'], 'master-index': ['tagged', 'row'] });
  assert.equal(coverageClass(cov.get('DEU'), byId), 'content', 'an Atlas record is content');
  assert.equal(coverageClass(cov.get('SEN'), byId), 'text');
  assert.equal(coverageClass(cov.get('SDN'), byId), 'tables', "a table row and the country's own Master Index entry");
  assert.equal(coverageClass(cov.get('VNM'), byId), 'none');
  assert.deepEqual([...covered(ps[4])].sort(), ['EGY', 'FRA', 'SDN', 'SEN']);
});

test('scope: the countries a reference site lacks, ranked by the content that has them', () => {
  const ps = pieces();
  const g = scopeGap(ps[0], ps, R);
  assert.equal(g.countries[0], 'EGY', 'the calendar and the Master Index have Egypt');
  assert.deepEqual(g.evidence.EGY, ['historical-calendar', 'master-index']);
  assert.deepEqual(g.evidence.SEN, [], 'named in a briefing is not enough, and a table is not content');
  assert.equal(g.countries.length, R.target.size - 2);
  assert.equal(g.weight, 2);
});

test('calendar: countries with events and no Atlas record, upcoming ballots first', () => {
  const byCountry = new Map([['FRA', { events: 9, contemporary: 2, upcomingBallots: 1 }], ['EGY', { events: 5, contemporary: 1, upcomingBallots: 0 }],
    ['SEN', { events: 2, contemporary: 1, upcomingBallots: 1 }], ['GRL', { events: 3, contemporary: 0, upcomingBallots: 0 }]]);
  const g = calendarGap({ byCountry }, new Set(['FRA']), R);
  assert.deepEqual(g.countries, ['SEN', 'EGY'], 'France has a record; Greenland is a territory, not a target country');
  assert.equal(g.weight, 4);
});

test('thin-index: countries with few Master Index entries, the most-covered first', () => {
  const ps = pieces();
  const g = thinIndexGap(ps[4], ps, R, { max: 5 });
  assert.ok(!g.countries.includes('FRA'), 'forty entries');
  assert.equal(g.countries[0], 'EGY', 'three entries, and the calendar has it');
  assert.equal(g.evidence.EGY['master-index'], '3 tagged entries');
});

test('scope-text: lines that state the 78-country scope, with the words round the match', () => {
  const hits = scopeTextGaps([
    { path: 'a.md', text: 'Intro\nThe Atlas covers 78 countries now.\nNothing here.' },
    { path: 'b.json', text: `{"x":"${'y'.repeat(200)}","d":"Political Atlas (Europe, North America and the major powers)"}` },
    { path: 'c.md', text: 'It covers 197 countries.' },
    { path: 'd.md', text: 'Checks all 78 country records.\nA 78-country map.\nIn 1978 country music.' },
  ]);
  assert.deepEqual(hits.map(h => [h.path, h.line]), [['a.md', 2], ['b.json', 1], ['d.md', 1], ['d.md', 2]]);
  assert.ok(hits[1].text.startsWith('…') && hits[1].text.length < 200, 'a long line is cut to the match');
});
