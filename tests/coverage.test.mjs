// Coverage map (integration/scripts/coverage.mjs): the country resolvers, the extraction of countries from content and
// the gap rules, on small fixtures. No network, no browser, and none of VM's real data: the real run is
//   node integration/scripts/coverage.mjs --json <file> --md <file>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeResolvers, newPiece, add, covered, coverageClass, countryCoverage, kinoFilms, warFocusWar, warSideGaps, warFilmGaps, retroWar,
  sceneGap, retroMoment, warFocusMoment, scopeGap, calendarGap, thinIndexGap, scopeTextGaps, boxShare, isAfrica, TERRITORIES, kinoScene, rankGaps,
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
// CShapes-like TopoJSON with absolute coordinates: France a square at 0–10°, Egypt at 20–30°, Russia at 40–60° (2019),
// and Ukraine's 1991 shape at 40–50°, which Russia's 2019 shape covers (the recognised-border correction).
const square = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const CSHAPES = {
  type: 'Topology',
  arcs: [square(0, 0, 10, 10), square(20, 0, 30, 10), square(40, 0, 60, 10), square(40, 0, 50, 10)],
  objects: { borders: { type: 'GeometryCollection', geometries: [
    { type: 'Polygon', arcs: [[0]], properties: { gw: 220, s: '1900-01-01', e: '2100-01-01' } },
    { type: 'Polygon', arcs: [[1]], properties: { gw: 651, s: '1900-01-01', e: '2100-01-01' } },
    { type: 'Polygon', arcs: [[2]], properties: { gw: 365, s: '2014-03-18', e: '2100-01-01' } },
    { type: 'Polygon', arcs: [[3]], properties: { gw: 369, s: '1991-12-26', e: '2014-03-18' } },
  ] } },
};
const R = makeResolvers({ national: NATIONAL, names: NAMES, historical: HISTORICAL, cshapes: CSHAPES, normaliseCountry: n => (n === 'Ivory Coast' ? "Côte d'Ivoire" : n) });

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

test('points fall in a shape, near a coast, under the recognised border, or nowhere', () => {
  assert.deepEqual(R.pointIso(5, 5), { iso: 'FRA', how: 'in' });
  assert.deepEqual(R.pointIso(10.1, 5), { iso: 'FRA', how: 'near' });
  assert.equal(R.pointIso(15, 5), null, 'at sea');
  assert.deepEqual(R.pointIso(15, 5, { near: 5.5 }), { iso: 'FRA', how: 'near' }, 'a wider coast for capitals');
  assert.equal(R.pointIso(45, 5).iso, 'UKR', "inside Ukraine's 1991 shape, though CShapes 2019 draws Russia there");
  assert.equal(R.pointIso(55, 5).iso, 'RUS');
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
  const w = retroWar({ id: 'c1', name: 'Test war', years: [[1940, 1], [1941, 1]], loc: [220], locYears: { 1941: [651] }, states: [220, 255] }, R);
  assert.deepEqual([...w.fought.keys()].sort(), ['EGY', 'FRA']);
  assert.deepEqual([...w.part.keys()].sort(), ['DEU', 'FRA']);
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
  const rb = new Map([['c1', retroWar({ id: 'c1', name: 'Test war', years: [[1940, 1]], loc: [220, 433], states: [220] }, R)]]);
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
  assert.deepEqual(R.gwGroup(365, '1950-07-01'), { key: 'gw365:RUS,UKR', gw: 365, name: 'the Soviet Union', successors: ['RUS', 'UKR'] });
  assert.equal(R.gwGroup(365, '1995-07-01'), null, 'Russia after 1991 is one country');
  assert.equal(R.gwGroup(220, '1950-07-01'), null);
  assert.equal(R.gwGroup(345, '1999-07-01').name, 'Serbia and Montenegro');
  // A Korean War: France fought in, the Soviet Union took part; the film draws France.
  const rbw = retroWar({ id: 'k1', name: 'Korea-like', years: [[1950, 1]], loc: [220], states: [220, 365] }, R);
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
  const war = { raw: { years: [[1990, 1]], loc: [365] } };
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
