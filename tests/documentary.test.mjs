// Documentary mode: how the reader says numbers, names and abbreviations (design/jdpi-documentary.js), how the narrator
// splits quoted text and reads map targets off a passage (design/jdpi-narrator.js), and the map focus helper
// (design/prp-focus.js): boxes across the date line, country boxes, place names and the zoom that fits them.
// The last test drives War Focus in a browser (JDPI_URL, default live; skipped where prp-focus.js is not deployed yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import '../design/jdpi-documentary.js';
import '../design/jdpi-narrator.js';
import '../design/prp-focus.js';

const { spoken, sentences, utterances } = globalThis.PRPSpeech;
const N = globalThis.PRPNarrator, F = globalThis.PRPFocus;
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const near = (a, b, eps = 1e-6) => assert.ok(a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps), `${JSON.stringify(a)} ≈ ${JSON.stringify(b)}`);

/* ---------- speech ---------- */
test('numbers: a full stop between digits is read as "point", the digits after it one by one', () => {
  assert.equal(spoken('The index fell to 3.5 today.'), 'The index fell to 3 point 5 today.');
  assert.equal(spoken('A Kardashev rating of 0.73.'), 'A Kardashev rating of 0 point 7 3.');
  assert.equal(spoken('Pi is 3.14159'), 'Pi is 3 point 1 4 1 5 9');
  assert.equal(spoken('1,234.56 tonnes'), '1,234 point 5 6 tonnes');
  assert.equal(spoken('a .5 chance'), 'a point 5 chance');
  assert.equal(spoken('It fell -3.5 points'), 'It fell -3 point 5 points');
  assert.equal(spoken('In 1945 the war ended.'), 'In 1945 the war ended.', 'whole numbers and real full stops are untouched');
});

test('percentages', () => {
  assert.equal(spoken('Inflation hit 12.5% in May.'), 'Inflation hit 12 point 5% in May.');
  assert.equal(spoken('a share of 1.5% of world energy'), 'a share of 1 point 5% of world energy');
  assert.deepEqual(utterances('Growth was 0.4%. Then it stalled.'), ['Growth was 0 point 4%.', 'Then it stalled.']);
});

test('money: the amount with "point", then the currency', () => {
  assert.equal(spoken('Petrol costs €2.11 a litre.'), 'Petrol costs 2 point 1 1 euros a litre.');
  assert.equal(spoken('£3.20'), '3 point 2 0 pounds');
  assert.equal(spoken('a $4.5bn deal'), 'a 4 point 5 billion dollars deal');
  assert.equal(spoken('US$1.2 trillion of debt'), '1 point 2 trillion US dollars of debt');
  assert.equal(spoken('€1,234.50'), '1,234 point 5 0 euros');
});

test('versions: each part a number', () => {
  assert.equal(spoken('PRP 2.0 is out'), 'PRP 2 point 0 is out');
  assert.equal(spoken('Version 2.11 and v1.2.3 shipped.'), 'Version 2 point 11 and version 1 point 2 point 3 shipped.');
  assert.equal(spoken('macOS 10.15.7'), 'macOS 10 point 15 point 7');
});

test('domains and dotted names: "dot" between letters', () => {
  assert.equal(spoken('Visit jdpi.pages.dev for more.'), 'Visit jdpi dot pages dot dev for more.');
  assert.equal(spoken('hp-retrospective.pages.dev and en.wikipedia.org'), 'hp-retrospective dot pages dot dev and en dot wikipedia dot org');
  assert.equal(spoken('built with Node.js'), 'built with Node dot js');
  assert.deepEqual(utterances('See jdpi.pages.dev. It is free.'), ['See jdpi dot pages dot dev.', 'It is free.']);
});

test('abbreviations are said naturally and never end a sentence', () => {
  assert.equal(spoken('e.g. the U.S. and the U.K., i.e. allies, etc.'), 'for example the U.S. and the U.K., that is allies, et cetera');
  assert.deepEqual(utterances('Dr. Smith met Mr. Jones and Mrs. Brown in St. Petersburg. They spoke.'), ['Doctor Smith met Mister Jones and Missus Brown in Saint Petersburg.', 'They spoke.']);
  assert.deepEqual(utterances('Chopin, Nocturne in E-flat, Op. 9 No. 2.'), ['Chopin, Nocturne in E-flat, opus 9 number 2.']);
  assert.deepEqual(utterances('Writing (c. 3200 BC) began in Sumer.'), ['Writing (circa 3200 BC) began in Sumer.']);
  assert.deepEqual(utterances('U.S. forces landed. The war ended.'), ['U.S. forces landed.', 'The war ended.']);
  assert.deepEqual(utterances('John F. Kennedy was shot in 1963. Oswald fired.'), ['John F. Kennedy was shot in 1963.', 'Oswald fired.']);
  assert.equal(spoken('Roe v. Wade (1973) et al. were cited by a Ph.D. student at 10 a.m. today'), 'Roe versus Wade (1973) et al were cited by a PhD student at 10 AM today');
  assert.deepEqual(utterances('Products, etc. The end.'), ['Products, et cetera.', 'The end.'], 'a capital after "etc." still starts a sentence');
});

test('real sentence ends: ". " or the end of the text, and ! ? … as before; no pause anywhere else', () => {
  assert.deepEqual(utterances('It rose 3.5. Then it fell.'), ['It rose 3 point 5.', 'Then it fell.']);
  assert.deepEqual(utterances('Is it over? Yes! It ends here… Or not.'), ['Is it over?', 'Yes!', 'It ends here…', 'Or not.']);
  assert.deepEqual(utterances('He said "Stop." Then he left'), ['He said "Stop."', 'Then he left']);
  assert.deepEqual(utterances('The deadliest clash, 3.5 km from the front, killed 0.2 thousand'), ['The deadliest clash, 3 point 5 km from the front, killed 0 point 2 thousand']);
  const long = `${'A long clause about the war, '.repeat(9)}and the end.`;
  assert.ok(long.length > 220 && utterances(long).length > 1 && utterances(long).every(u => u.length <= 220), 'long sentences still split at commas');
  assert.deepEqual(sentences('It was 3.5 metres tall. U.S. troops came on No. 2 road. The end'), ['It was 3.5 metres tall.', 'U.S. troops came on No. 2 road.', 'The end']);
});

/* ---------- narrator ---------- */
test('narrator: quoted text splits into the same sentences as the reader speaks', () => {
  const samples = ['World War II, or the Second World War, killed 70–85 million people (about 3.5% of the 1940 population). The U.S. entered in 1941. It ended in 1945.',
    'Dr. Smith wrote e.g. this. Then St. Paul spoke at 3.5 p.m. Done!', 'jdpi.pages.dev is PRP. It is free… Isn’t it?'];
  for (const s of samples) assert.deepEqual(N.sentences(s), sentences(s));
  assert.equal(N.sentences(samples[0]).length, 3);
});

test('narrator: map targets from a passage\'s data attributes', () => {
  const t = N.targetsFromAttributes([['data-iso3', 'ukr RUS'], ['data-lonlat', '30.52, 50.45'], ['data-bbox', '22,44,41,53'], ['data-qid', 'Q178687'], ['data-qid', 'Q178687'], ['data-iso3', 'nonsense'], ['data-lonlat', '10,95']]);
  assert.deepEqual(t, { countries: ['UKR', 'RUS'], points: [[30.52, 50.45]], bbox: [22, 44, 41, 53], qids: ['Q178687'] });
  assert.equal(N.hasTargets(t), true);
  assert.equal(N.hasTargets(N.targetsFromAttributes([])), false);
  assert.equal(N.hasTargets({ reset: true }), true);
  assert.equal(N.hasTargets(null), false);
});

/* ---------- prp-focus: boxes ---------- */
test('focus: targets are normalised', () => {
  const t = F.normalize({ countries: ['ukr', 'UKR', 'gw:365', 'xx'], points: [[30, 50], { lon: 10, lat: 20 }, [0, 99]], bbox: [170, -20, -170, -10], qids: 'Q1 Q2 x', padding: '24' });
  assert.deepEqual(t.countries, ['UKR', 'gw:365']);
  assert.deepEqual(t.points, [[30, 50], [10, 20]]);
  assert.deepEqual(t.bbox, [170, -20, 190, -10], 'a box across the date line keeps east past 180');
  assert.deepEqual(t.qids, ['Q1', 'Q2']);
  assert.equal(t.padding, 24);
  assert.equal(F.isEmpty(F.normalize({ reset: true })), true);
});

test('focus: boxes unite the short way round the globe', () => {
  assert.deepEqual(F.union([[27, 41, 180, 82], [-180, 64, -169, 72]]), [27, 41, 191, 82], 'Russia with Chukotka');
  assert.deepEqual(F.union([[170, -20, 175, -10], [-175, -15, -170, -12]]), [170, -20, 190, -10]);
  assert.deepEqual(F.union([[-10, 35, 5, 44], [20, 40, 30, 50]]), [-10, 35, 30, 50]);
  assert.deepEqual(F.union([[-180, -60, 0, 0], [0, 0, 180, 80]]), [-180, -60, 180, 80]);
  near(F.expand([30, 50, 30, 50], 6), [27, 47, 33, 53]);
  near(F.expand([-179, 0, -179, 0], 4), [179, -2, 183, 2]);
  assert.equal(F.contains([170, -20, 190, -10], [-175, -15]), true);
  assert.equal(F.contains([170, -20, 190, -10], [0, -15]), false);
  assert.deepEqual(F.clampWorld([19, 41, 191, 82]), [19, 41, 180, 82], 'keeps the larger side');
  assert.deepEqual(F.clampWorld([172, 18, 294, 72]), [-180, 18, -66, 72]);
});

test('focus: a country keeps its main parts, followed across the date line', () => {
  const square = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
  const france = { type: 'MultiPolygon', coordinates: [square(-5, 42, 8, 51), square(8.5, 41.4, 9.6, 43), square(-54.6, 2.1, -51.6, 5.8)] };
  near(F.geoBBox(france), [-5, 41.4, 9.6, 51], 1e-9);
  near(F.geoBBox(france, { main: false }), [-54.6, 2.1, 9.6, 51], 1e-9);
  const fiji = { type: 'Polygon', coordinates: [[[177, -18], [179.9, -18], [-179.5, -17], [-179.5, -16], [177, -16], [177, -18]]] };
  near(F.geoBBox(fiji), [177, -18, 180.5, -16], 1e-9);
  near(F.geoBBox({ type: 'MultiPoint', coordinates: [[10, 1], [20, 3]] }), [10, 1, 20, 3]);
  near(F.boxOf([[1, 2], [3, 4]]), [1, 2, 3, 4]);
});

test('focus: the country table knows ISO3, Gleditsch–Ward codes and sensible boxes', () => {
  for (const [iso, gw] of [['USA', 2], ['GBR', 200], ['RUS', 365], ['UKR', 369], ['CHN', 710], ['IND', 750]]) {
    assert.equal(F.gwOf(iso), gw, iso);
    assert.equal(F.iso3OfGw(gw), iso);
  }
  const inside = (iso, lon, lat) => assert.ok(F.contains(F.countryBox(iso), [lon, lat]), `${iso} holds ${lon},${lat}`);
  inside('UKR', 30.5, 50.45); inside('FRA', 2.35, 48.85); inside('JPN', 139.7, 35.7); inside('AUS', 149.1, -35.3); inside('BRA', -47.9, -15.8);
  inside('RUS', 37.6, 55.75); inside('RUS', -175, 66); inside('USA', -77, 38.9); inside('USA', -150, 61.2); inside('NZL', 174.8, -41.3);
  assert.ok(!F.contains(F.countryBox('FRA'), [-52.3, 4.9]), 'France without French Guiana');
  assert.deepEqual(F.countryBox('gw:369'), F.countryBox('UKR'));
  assert.equal(F.countryBox('XYZ'), null);
});

test('focus: resolve() puts a step\'s targets into one box, with the page\'s own shapes first', () => {
  const asked = [];
  const r = F.resolve({ countries: ['UKR', 'POL'], points: [[44.5, 48.7]] }, { country: id => { asked.push(id); return id === 'UKR' ? [22, 44, 41, 53] : null; }, minSpan: 4 });
  assert.deepEqual(asked, ['UKR', 'POL']);
  near(r.box, [14, 44, 44.5, 55]); // Poland from the table, Ukraine from the page, Stalingrad as a point
  const one = F.resolve({ points: [[30, 50]] }, { minSpan: 6 });
  near(one.box, [27, 47, 33, 53]);
  assert.equal(F.resolve({ qids: ['Q1'] }, { qid: () => null }).box, null, 'nothing the page can place: no box');
  near(F.resolve({ qids: ['Q1'] }, { qid: () => ({ type: 'Point', coordinates: [10, 10] }), minSpan: 2 }).box, [9, 9, 11, 11]);
});

test('focus: place names in a passage, longest first and written as given', () => {
  const places = [['Sudan', 'SDN'], ['South Sudan', 'SSD'], ['Niger', 'NER'], ['Nigeria', 'NGA'], ['Turkey', 'TUR'], ['Guinea', 'GIN'], ['Papua New Guinea', 'PNG']]
    .map(([n, iso]) => ({ names: [n], targets: { countries: [iso] } }));
  assert.deepEqual(F.matchPlaces('Fighting spread from South Sudan into Nigeria.', places).countries, ['SSD', 'NGA']);
  assert.deepEqual(F.matchPlaces('Sudan and South Sudan', places).countries, ['SSD', 'SDN']);
  assert.deepEqual(F.matchPlaces('Papua New Guinea, then Guinea and Niger', places).countries, ['PNG', 'GIN', 'NER']);
  assert.equal(F.matchPlaces('a roast turkey', places), null);
  assert.equal(F.matchPlaces('Nigerian troops', places), null, 'whole words only');
});

test('focus: countries are found by their everyday names, whatever a page\'s own data calls them', () => {
  const P = F.countryPlaces([['IRN', 'Iran, Islamic Rep.'], ['RUS', 'Russian Federation']]);
  assert.deepEqual(F.matchPlaces('Iran, Islamic Rep. and the Russian Federation', P).countries, ['IRN', 'RUS']);
  assert.deepEqual(F.matchPlaces('Iran and Israel exchanged strikes.', P).countries, ['ISR', 'IRN']);
  assert.deepEqual(F.matchPlaces('Tensions rose in Ukraine and Russia, while South Sudan stayed calm.', P).countries, ['SSD', 'UKR', 'RUS']);
  assert.deepEqual(F.matchPlaces('Fighting in eastern Congo and the Gaza Strip; the U.S. and Britain responded.', P).countries.sort(), ['COD', 'GBR', 'PSE', 'USA']);
  assert.deepEqual(F.matchPlaces('Northern Ireland and Ireland', P).countries, ['GBR', 'IRL']);
  assert.equal(F.countryName('IRN'), 'Iran');
  assert.equal(F.countryName('TWN'), 'Taiwan', 'Taiwan is in the table although the World Bank does not list it');
});

test('focus: the zoom that fits a pixel extent', () => {
  const t = F.fitTransform([[100, 100], [200, 150]], [1000, 500], { padding: 50, maxScale: 20 });
  assert.equal(t.k, 8); // (500 - 100) / 50 is the tighter side
  near([t.x, t.y], [500 - 8 * 150, 250 - 8 * 125]);
  assert.equal(F.fitTransform([[0, 0], [1000, 500]], [1000, 500], { padding: 40 }).k, 1, 'never below the page\'s own view');
  assert.equal(F.fitTransform([[10, 10], [11, 11]], [1000, 500], { maxScale: 6 }).k, 6);
  const c = F.fitTransform([[0, 0], [100, 100]], [1000, 500], { padding: 0, maxScale: 3, clamp: true });
  near([c.x, c.y], [0, 0], 1e-9); // clamped: the map's own edge stays at the view's edge
  const project = ([lon, lat]) => [500 + lon * 2, 250 - lat * 2]; // a plain equirectangular projection
  assert.deepEqual(F.projectBox([10, 20, 30, 40], project), [[520, 170], [560, 210]]);
  assert.deepEqual(F.projectBox([170, 0, 190, 10], project), [[840, 230], [860, 250]], 'clamped to one side of the date line');
});

/* ---------- in a browser: War Focus answers 'prp:focus' ---------- */
test('War Focus zooms to the states and battles in focus, and back', async t => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1941-07`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('path.state.side-a', { timeout: 20000 });
    if (!(await page.evaluate(() => !!window.PRPFocus))) { t.skip('design/prp-focus.js is not deployed at ' + BASE); return; }
    await page.waitForTimeout(1500); // let the layout settle (a late resize refits the map, and keeps the focus)
    const scale = () => page.evaluate(() => +(/scale\(([\d.]+)\)/.exec(document.querySelector('#map > g').getAttribute('transform')) || [0, 1])[1]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { countries: ['gw:375'], points: [[30.5, 50.45]] } })));
    await page.waitForTimeout(2200);
    const zoomed = await scale(), outlined = await page.locator('path.state.prp-focus-hit').count();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { reset: true } })));
    await page.waitForTimeout(1200);
    assert.ok(zoomed > 2, `zoomed in: ${zoomed}`);
    assert.equal(outlined, 1, 'Finland outlined');
    assert.equal(await scale(), 1, 'back to the theatre');
    assert.equal(await page.locator('.prp-focus-hit').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
