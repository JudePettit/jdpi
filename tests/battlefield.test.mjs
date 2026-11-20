// Realtime and Retrospective Battlefield: the history build's names and places, the Realtime data (the committed
// battlefield/data/realtime.json, which battlefield-refresh tests before committing), then the pages (against
// JDPI_URL, default live; PRP_PAGES=0 leaves them out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { actors, stateName, interstateName, parties, candidateFiles } from '../battlefield/scripts/ucdp.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const HISTORY = JSON.parse(readFileSync(new URL('../battlefield/history/data/wars.json', import.meta.url), 'utf8'));
const REALTIME = JSON.parse(readFileSync(new URL('../battlefield/data/realtime.json', import.meta.url), 'utf8'));
const war = id => HISTORY.wars.find(w => w.id === id);
const locIn = (w, y) => w.locYears?.[y] || w.loc;
const activeIn = y => HISTORY.wars.filter(w => w.years.some(([yy]) => yy === y));

test('UCDP candidate files: the latest of each year after the GED release, so a new year never drops the old one', () => {
  const page = y => y.map(f => `<a href="https://ucdp.uu.se/downloads/candidateged/${f}">${f}</a>`).join('\n');
  // Now: only 2026's monthly files, and the GED release's own year is ignored.
  assert.deepEqual(candidateFiles(page(['GEDEvent_v25_01_25_12.csv', 'GEDEvent_v26_01_26_08.csv', 'GEDEvent_v26_01_26_09.csv']), 2025), ['GEDEvent_v26_01_26_09.csv']);
  // Spring 2027, before a GED release covers 2026: 2026's last file and 2027's latest, oldest first.
  assert.deepEqual(candidateFiles(page(['GEDEvent_v27_01_27_02.csv', 'GEDEvent_v26_01_26_12.csv', 'GEDEvent_v27_01_27_01.csv', 'GEDEvent_v26_01_26_11.csv']), 2025),
    ['GEDEvent_v26_01_26_12.csv', 'GEDEvent_v27_01_27_02.csv']);
  // Once GED covers 2026 (GED_THROUGH = 2026), only 2027's.
  assert.deepEqual(candidateFiles(page(['GEDEvent_v26_01_26_12.csv', 'GEDEvent_v27_01_27_05.csv']), 2026), ['GEDEvent_v27_01_27_05.csv']);
  assert.deepEqual(candidateFiles('no files here', 2025), []);
});

// Month by Month reads each war's and each country's `series` (since 15 November 2026; a file built before has none): an
// event dated only to a span shared over its days, never a death lost or added, and every month of the file.
test('Realtime data: the series Month by Month reads add up to the war’s deaths, and cover every month', () => {
  const src = readFileSync(new URL('../battlefield/scripts/build-realtime.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("import { seriesFromEvents } from '../../monthly/scripts/series.mjs';"), 'the builder writes them by the shared rule');
  assert.match(src, /series deaths/, 'and its guard refuses a series that does not add up');
  const sum = a => a.reduce((t, x) => t + x, 0);
  for (const w of REALTIME.wars.filter(x => x.series)) {
    assert.equal(w.series.from, REALTIME.months[0], w.id);
    assert.equal(w.series.deaths.length, REALTIME.months.length, w.id);
    assert.equal(sum(w.series.deaths), w.deaths, `${w.id}: the series add up`);
    assert.ok(w.series.events.every((n, i) => n >= (w.monthly[i]?.events || 0)), `${w.id}: an event counts in its first month and in each month its span touches`);
  }
  for (const [gw, c] of Object.entries(REALTIME.countries || {})) {
    assert.match(gw, /^[0-9]+$/); assert.equal(c.series.deaths.length, REALTIME.months.length, gw);
    assert.ok(Array.isArray(c.conflicts), `${gw} lists its conflicts`);
  }
});

test('UCDP names: each actor once, without "Government of", by the name that fits the date', () => {
  assert.deepEqual(actors('Government of Australia, Government of United Kingdom, Government of United States of America', '156, 28, 3'),
    ['Government of Australia', 'Government of United Kingdom', 'Government of United States of America']);
  assert.deepEqual(actors('Military faction (forces of Augusto Pinochet, Toribio Merino and Leigh Guzman)', '757'), ['Military faction (forces of Augusto Pinochet, Toribio Merino and Leigh Guzman)']);
  assert.deepEqual(actors('Military Junta for the Consolidation of Democracy, Peace and Justice', '549'), ['Military Junta for the Consolidation of Democracy, Peace and Justice']);
  assert.deepEqual(actors('CPP, Military faction (forces of Honasan, Abenina & Zumel)'), ['CPP', 'Military faction (forces of Honasan, Abenina & Zumel)']);
  assert.equal(stateName('Government of Russia (Soviet Union)', '1956-11-04'), 'Soviet Union');
  assert.equal(stateName('Government of Russia (Soviet Union)', '2022-02-24'), 'Russia');
  assert.equal(stateName('Government of Yemen (North Yemen)', '2024-01-12'), 'Yemen');
  const row = { year: '2003', side_a: 'Government of Australia, Government of United Kingdom, Government of United States of America', side_a_id: '156, 28, 3', gwno_a: '900,  200, 2', side_b: 'Government of Iraq', side_b_id: '116', gwno_b: '645' };
  assert.equal(interstateName([row]), 'Australia, United Kingdom, United States of America – Iraq');
  assert.deepEqual([...parties(row, '2003-03-20')], [[900, 'Australia'], [200, 'United Kingdom'], [2, 'United States of America'], [645, 'Iraq']]);
});

test('Retrospective data: wars sit where they were fought, not in every state that sent forces', () => {
  // The finding: the United States had no war on its own territory in 2003 (Iraq, Afghanistan and al-Qaida were all abroad).
  assert.deepEqual(activeIn(2003).filter(w => locIn(w, 2003).includes(2)).map(w => w.name), []);
  assert.deepEqual(war('u420').loc, [645]);
  assert.deepEqual(war('u13692').loc, [700]);
  assert.deepEqual(war('u16099').loc, [678]);
  for (const [id, gw] of [['u252', 200], ['u252', 220], ['u350', 2], ['u368', 2], ['u250', 365], ['u431', 365], ['u323', 640]]) assert.ok(!war(id).loc.includes(gw), `${war(id).name} is not on ${gw}`);
  // Wars fought on both sides keep both.
  for (const [id, gws] of [['u235', [731, 732]], ['u293', [816, 817]], ['u13243', [365, 369]], ['u324', [630, 645]], ['u409', [530, 531]]]) assert.deepEqual([...war(id).loc].sort((a, b) => a - b), gws, war(id).name);
  // The Falklands were fought on islands the map has no shape for: neither Argentina nor Britain, but named.
  assert.deepEqual(war('u346').loc, []);
  assert.deepEqual(war('u346').where, ['the Falkland Islands']);
  // Al-Qaida's war with the United States reached US soil in 2001 only; Hezbollah's with Israel was fought in Lebanon.
  assert.deepEqual(locIn(war('u418'), 2001), [2, 700]);
  assert.ok(!locIn(war('u418'), 2010).includes(2));
  assert.ok(locIn(war('u426'), 2006).includes(660));
  // World War II moves year by year: Poland in 1939, North Africa and the Pacific later; never New Zealand or South Africa.
  const ww2 = war('c139');
  assert.deepEqual([...locIn(ww2, 1939)].sort((a, b) => a - b), [255, 290]);
  for (const gw of [620, 651, 840, 775, 911, 365]) assert.ok(locIn(ww2, 1942).includes(gw), `1942: ${gw}`);
  for (const gw of [2, 20, 140, 560, 712, 920]) assert.ok(!ww2.loc.includes(gw), `World War II not fought in ${gw}`);
  assert.ok(Object.keys(ww2.locYears).length === 7);
  // Colonial wars are fought in the colony, civil wars in their own country, not in the states that intervened.
  assert.deepEqual(war('c454').loc, [665]);
  assert.deepEqual(war('c718').loc, [230]);
  // Every year a war was active has its places.
  for (const w of HISTORY.wars) if (w.locYears) for (const [y] of w.years) assert.ok(w.locYears[y], `${w.name} ${y}`);
});

test('Retrospective data: war names list each side once, without "Government of"; actor names stay whole', () => {
  for (const w of HISTORY.wars) assert.doesNotMatch(w.name, /Government of/, w.name);
  assert.equal(war('u420').name, 'Australia, United Kingdom, United States of America – Iraq');
  assert.equal(war('u228').name, 'Egypt, Iraq, Jordan, Lebanon, Syria – Israel');
  assert.equal(war('u16099').name, 'United Kingdom, United States of America – Yemen');
  assert.equal(war('u13243').name, 'Russia – Ukraine');
  assert.equal(war('u250').name, 'Hungary – Soviet Union');
  for (const w of HISTORY.wars) for (const s of [...w.sideA, ...w.sideB]) assert.equal((s.match(/\(/g) || []).length, (s.match(/\)/g) || []).length, `${w.name}: ${s}`);
});

// Review of 15 November 2026: Romania, Bulgaria, Italy and France stood undated on both sides of World War II. A state
// Correlates of War puts on both sides of a war is listed on each with its dates there; Vichy France is told apart.
test('Retrospective data: a state on both sides of a war is dated on each, and Vichy France is named', () => {
  const ww2 = war('c139'), on = (list, n) => list.filter(s => s === n || s.startsWith(n + ' ('));
  assert.deepEqual(on(ww2.sideA, 'Italy'), ['Italy (18 Oct 1943 – 7 May 1945)']);
  assert.deepEqual(on(ww2.sideB, 'Italy'), ['Italy (10 Jun 1940 – 2 Sep 1943)']);
  assert.deepEqual(on(ww2.sideA, 'Romania'), ['Romania (9 Sep 1944 – 7 May 1945)']);
  assert.deepEqual(on(ww2.sideB, 'Romania'), ['Romania (22 Jun 1941 – 23 Aug 1944)']);
  assert.deepEqual(on(ww2.sideA, 'Bulgaria'), ['Bulgaria (9 Sep 1944 – 7 May 1945)']);
  assert.deepEqual(on(ww2.sideB, 'Bulgaria'), ['Bulgaria (13 Dec 1941 – 8 Sep 1944)']);
  assert.deepEqual(on(ww2.sideA, 'France'), ['France (3 Sep 1939 – 22 Jun 1940; 23 Oct 1944 – 14 Aug 1945)']);
  assert.deepEqual(on(ww2.sideB, 'Vichy France'), ['Vichy France (7 Jul 1940 – 14 Jul 1941)']);
  assert.match(ww2.sideNote, /Vichy regime/);
  assert.match(ww2.sideNote, /Free France/);
  // COW's side-B dates end at the Syria–Lebanon armistice, but Vichy forces fought the Allies again in 1942: the note
  // says so rather than reading as if the fighting ended in July 1941 (second reader, 15 Nov 2026).
  assert.match(ww2.sideNote, /Madagascar/);
  assert.match(ww2.sideNote, /North Africa \(November 1942\)/);
  // No Correlates of War interstate war (whose states COW dates) names a state undated on both sides.
  for (const w of HISTORY.wars.filter(w => w.src === 'cow' && w.type === 'Interstate war')) {
    const bare = s => s.replace(/ \(.*\)$/, '');
    const both = w.sideA.filter(s => w.sideB.some(t => bare(t) === bare(s)));
    for (const s of both) assert.match(s, /\(\d/, `${w.name}: ${s} on both sides without dates`);
  }
});

// S0, 16 November 2026: the Correlates of War's terms ask for its citation (Sarkees and Wayman 2010, Resort to War) and
// bar redistribution without written permission. Every page file and page that shows a COW value cites it as the terms
// ask, with the link, and the terms read are recorded where a maintainer looks (battlefield/README.md).
test('Correlates of War: every page and page file showing its values cites it as its terms ask, with the link', async () => {
  const { CITE_ONLY, HOSTED } = await import('../integration/scripts/cite-only.mjs');
  const cow = CITE_ONLY.cow, read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const cites = s => s.includes(cow.citation) && s.includes(cow.url);
  for (const h of HOSTED.filter(x => x.file)) {
    const f = JSON.parse(read(h.file));
    assert.ok(Object.values(f.sources || {}).some(s => typeof s === 'string' && cites(s)), `${h.file}: sources cite ${cow.name} with the link`);
  }
  // The builders write the same, so a rebuild keeps it.
  for (const p of ['battlefield/scripts/build-history.mjs', 'battlefield/focus/scripts/build.mjs']) assert.ok(read(p).includes(cow.citation) && read(p).includes(cow.url), `${p} writes the citation`);
  // The pages' Sources paragraphs (HTML: the en dash and the ampersand as written there).
  const html = s => s.replace(/&amp;/g, '&');
  for (const p of ['battlefield/history/index.html', 'battlefield/focus/index.html']) {
    const src = html(read(p).split('\n').find(l => /<b>Sources\.<\/b>/.test(l)) || '');
    assert.ok(cites(src), `${p}: its Sources paragraph cites ${cow.name} with the link`);
  }
  // A War Focus war whose deaths are COW's total says so in its panel, with the citation and link (figures.mjs).
  const { COW_CITE } = await import('../battlefield/focus/figures.mjs');
  assert.deepEqual(COW_CITE, { text: cow.citation, url: cow.url });
  assert.match(read('battlefield/focus/app.js'), /COW_CITE/);
  // The Retrospective Battlefield's panel names COW for its battle deaths; its Sources paragraph says what the terms allow.
  assert.match(read('battlefield/history/index.html'), /written permission/);
  const readme = read('battlefield/README.md').replace(/\s*\n>?\s*/g, ' '); // the quotation's lines joined
  for (const s of [cow.terms, cow.url, 'Users agree not to distribute the dataset to any third party without written permission', '16 November 2026']) assert.ok(readme.includes(s), `README records: ${s}`);
});

// AC-13 (Jude, 16 November 2026: every map shows every country the sources allow; ledger AT-19 with AT-10). A UCDP
// conflict's states were stored once for all its years, so Tonga stood in "Iraq: government" for all 35 of its active
// years and Sweden fought in Afghanistan in 1985: 8,693 state-years across 79 conflicts and 146 states in UCDP/PRIO ACD
// v26.1 (PRP-ALL-COUNTRIES-PLAN.md, AC-13). Each conflict now keeps its state parties year by year, from UCDP's
// gwno_a, gwno_a_2nd, gwno_b and gwno_b_2nd.
const statesIn = (w, y) => (w.statesYears ? w.statesYears[y] || [] : w.states);
const byNum = (a, b) => a - b;
test('Retrospective data: each UCDP conflict keeps its state parties year by year, as UCDP’s rows give them', () => {
  for (const w of HISTORY.wars.filter(x => x.src === 'ucdp')) {
    assert.ok(w.statesYears, `${w.id}: parties by year`);
    assert.deepEqual(Object.keys(w.statesYears).map(Number).sort(byNum), w.years.map(([y]) => y), `${w.id}: one entry per active year`);
    assert.deepEqual([...new Set(Object.values(w.statesYears).flat())].sort(byNum), [...w.states].sort(byNum), `${w.id}: its years make up its states`);
    for (const [y, gws] of Object.entries(w.statesYears)) assert.ok(gws.length && gws.every(Number.isInteger), `${w.id} ${y}`);
    // In ascending order, so a rebuild from the same rows writes the same file (the second review of AC-13).
    for (const [y, gws] of Object.entries(w.statesYears)) assert.deepEqual(gws, [...gws].sort(byNum), `${w.id} ${y}: sorted`);
  }
  // UCDP/PRIO ACD v26.1's rows: Tonga (972) is among side A's secondary parties of "Iraq: government" (u259) in 2004,
  // 2007 and 2008, and of "Afghanistan: government" (u333) in 2011–14; Iraq fought alone in 1982; Sweden (380) took
  // part in Afghanistan from 2006 to 2014, and in 1985 the parties were Afghanistan and the Soviet Union.
  const iraq = war('u259'), afghanistan = war('u333'), yearsWith = (w, gw) => w.years.map(([y]) => y).filter(y => statesIn(w, y).includes(gw));
  assert.deepEqual(yearsWith(iraq, 972), [2004, 2007, 2008]);
  assert.deepEqual(statesIn(iraq, 1982), [645]);
  // (The plan's example year, 1980, is not one of u259's active years; 1982–87 are, with Iraq alone.)
  assert.ok(!iraq.years.some(([y]) => y === 1980));
  for (const y of [1982, 1983, 1984, 1987]) for (const gw of [972, 2]) assert.ok(!statesIn(iraq, y).includes(gw), `u259 in ${y}: not ${gw}`);
  assert.ok(!statesIn(iraq, 2006).includes(972) && statesIn(iraq, 2006).includes(2), 'u259 in 2006: the United States, not Tonga');
  assert.deepEqual(yearsWith(afghanistan, 972), [2011, 2012, 2013, 2014]);
  assert.deepEqual(yearsWith(afghanistan, 380), [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014]);
  assert.deepEqual([...statesIn(afghanistan, 1985)].sort(byNum), [365, 700]);
  // The Correlates of War's wars are written back as they were (the S0 hold): no parties by year are added to them.
  for (const w of HISTORY.wars.filter(x => x.src === 'cow')) assert.equal(w.statesYears, undefined, w.id);
});

// Where CShapes changed a shape in the middle of a war, the place follows that year's shape (the map draws the borders
// of 1 July): nine place codes had no shape in the year they were given for, so Vietnam stood at peace through the
// First Indochina War. A place is drawn as a shape, or as a dot from the dot's first day; a war-year with no place at
// all is named (`where`). Only a dot excuses a code with no shape: a war's `where` does not excuse its other years.
test('Retrospective data: every war-year place has a CShapes shape on 1 July of that year, or a name', async () => {
  const { HOSTED } = await import('../integration/scripts/cite-only.mjs');
  const held = HOSTED.find(h => h.file === 'battlefield/history/data/wars.json')?.kind === 'pending';
  const shapes = JSON.parse(readFileSync(new URL('../battlefield/history/data/borders.topo.json', import.meta.url), 'utf8')).objects.borders.geometries.map(g => g.properties);
  const dotFrom = new Map(Object.values(HISTORY.dots).filter(d => d.gw != null).map(d => [d.gw, d.from]));
  const drawn = (gw, y) => shapes.some(p => p.gw === gw && p.s <= `${y}-07-01` && `${y}-07-01` <= p.e)
    || (dotFrom.has(gw) && (dotFrom.get(gw) == null || dotFrom.get(gw) <= `${y}-07-01`));
  const missing = [];
  for (const w of HISTORY.wars) for (const [y] of w.years) {
    const gs = locIn(w, y);
    for (const gw of gs) if (!drawn(gw, y)) missing.push(`${w.id} ${y} ${gw}`);
    if (!gs.length && !w.where?.length) missing.push(`${w.id} ${y} (no place)`);
  }
  // While the S0 hold stands (integration/scripts/cite-only.mjs), the Correlates of War rows are written back exactly as
  // they are; these four wait for it (history-fought.mjs has their places for when it lifts).
  assert.deepEqual(missing.sort(), held ? ['c139 1945 255', 'c698 1926 (no place)', 'c708 1929 670', 'c708 1930 670'] : []);
  assert.ok(war('u350').loc.includes(55), 'Grenada 1983, drawn as a dot');
  const sorted = (w, y) => [...locIn(w, y)].sort(byNum);
  // The First Indochina War on French Indochina's Vietnam (815) to 1953, then on the Democratic Republic's shape.
  for (let y = 1946; y <= 1953; y++) assert.deepEqual(sorted(war('u216'), y), [815], `u216 ${y}`);
  assert.ok(locIn(war('u216'), 1954).includes(816));
  // When the hold lifts: World War II in 1945 on the occupied Germany's two shapes; the Ikhwan Revolt in Nejd, which
  // CShapes does not draw. While it stands, the rows as they were.
  assert.ok(locIn(war('c139'), 1944).includes(255));
  if (held) {
    assert.ok(locIn(war('c139'), 1945).includes(255) && war('c139').placeNames === undefined);
    assert.deepEqual(war('c708').loc, [670]);
    assert.equal(war('c708').where, undefined);
  } else {
    assert.deepEqual(sorted(war('c139'), 1945).filter(gw => gw >= 255 && gw <= 265), [260, 265]);
    assert.deepEqual(war('c708').loc, []);
    assert.deepEqual(war('c708').where, ['Nejd']);
  }
  // Georgia, Azerbaijan and South Sudan in their first year, and Taiwan in 1949: the state whose shape held them on
  // 1 July, named for the place; South Vietnam in 1975 on the Democratic Republic's shape, which held both on 1 July
  // (UCDP places 1975 in 816 and 817), under its own name.
  for (const [id, y, gw, name] of [['u380', 1991, 365, 'Georgia (then in the Soviet Union)'], ['u388', 1991, 365, 'Azerbaijan (then in the Soviet Union)'],
    ['u11345', 2011, 625, 'South Sudan (then in Sudan)'], ['u293', 1975, 816, null], ['u232', 1949, 710, null]]) {
    assert.deepEqual(sorted(war(id), y), [gw], `${id} ${y}`);
    assert.equal(war(id).placeNames?.[y]?.[gw] ?? null, name, `${id} ${y}: named`);
  }
  assert.deepEqual(sorted(war('u380'), 1992), [372]);
  // A borrowed shape is not one of the war's own places (`loc`, which National Analysis reads).
  for (const [id, gw] of [['u380', 365], ['u388', 365], ['u11345', 625]]) assert.ok(!war(id).loc.includes(gw), `${id}: not ${gw}`);
  assert.deepEqual([...war('u293').loc].sort(byNum), [816, 817]);
  assert.deepEqual(sorted(war('u232'), 1950), [710, 713]);
  // u216's name was "Vietnam (North Vietnam): Vietnam" (UCDP's location, named for a state that came in 1954).
  assert.equal(war('u216').name, 'Vietnam: Vietnam');
  assert.deepEqual(war('u216').where, ['Vietnam']);
});

// The catalogue's copy (integration/data/retrospective-wars.json, from integration/scripts/build-catalog.mjs) names
// each UCDP conflict as wars.json does: a rename here (u216, AC-13) leaves it stale until the catalogue is rebuilt.
test('Retrospective data: the catalogue’s copy names every UCDP conflict as wars.json does', () => {
  const cat = JSON.parse(readFileSync(new URL('../integration/data/retrospective-wars.json', import.meta.url), 'utf8')).records;
  const ucdp = HISTORY.wars.filter(w => w.src === 'ucdp');
  assert.deepEqual(cat.map(r => r.id).sort(), ucdp.map(w => w.id).sort());
  const stale = ucdp.filter(w => cat.find(r => r.id === w.id).name !== w.name).map(w => w.id);
  assert.deepEqual(stale, [], 'run node integration/scripts/build-catalog.mjs');
});

// The 22 of VM's countries CShapes 2.0 has no border for are drawn as the kit's dots (design/prp-mapkit.js), from
// their first day as a state, under the Gleditsch–Ward number UCDP files them under (none for the Holy See).
test('Retrospective data: the 22 states with no CShapes border are dots from their first day, under UCDP’s numbers', async () => {
  await import('../design/prp-mapkit.js');
  const kit = globalThis.PRPMapkit.dots('cshapes').map(d => d.iso3).sort();
  assert.equal(kit.length, 22);
  assert.deepEqual(Object.keys(HISTORY.dots).sort(), kit);
  const shapes = new Set(JSON.parse(readFileSync(new URL('../battlefield/history/data/borders.topo.json', import.meta.url), 'utf8')).objects.borders.geometries.map(g => g.properties.gw));
  const gws = Object.values(HISTORY.dots).map(d => d.gw).filter(gw => gw != null);
  assert.equal(gws.length, 21, 'every one but the Holy See has a number');
  assert.equal(HISTORY.dots.VAT.gw, null);
  assert.equal(new Set(gws).size, gws.length);
  for (const gw of gws) assert.ok(Number.isInteger(gw) && !shapes.has(gw), `${gw}: a number of its own, with no shape`);
  for (const [iso3, d] of Object.entries(HISTORY.dots)) assert.ok(d.from === null || /^\d{4}(-\d{2}-\d{2})?$/.test(d.from), `${iso3}: ${d.from}`);
  // The numbers UCDP gives them: Grenada (55) in 1983, Tonga (972) in Iraq and Afghanistan.
  assert.equal(HISTORY.dots.GRD.gw, 55);
  assert.equal(HISTORY.dots.TON.gw, 972);
  assert.ok(war('u350').states.includes(55) && war('u259').states.includes(972) && war('u333').states.includes(972));
  // First days: the Retrospective's leader lists (Grenada's first Prime Minister from independence; the four European
  // microstates were states before 1926), and Wikidata for the other twelve.
  assert.equal(HISTORY.dots.GRD.from, '1974-02-07');
  for (const iso3 of ['AND', 'LIE', 'MCO', 'SMR']) assert.equal(HISTORY.dots[iso3].from, null, iso3);
  assert.equal(HISTORY.dots.TUV.from, '1978-10-01');
  assert.equal(HISTORY.dots.VAT.from, '1929-02-11');
  assert.match(HISTORY.sources.dots, /Gleditsch/);
  assert.match(HISTORY.sources.dots, /Wikidata/);
});

// S0 (16 November 2026): UCDP aggregate events labelled. Russia–Ukraine, January 2026 read "about 13,394 deaths …
// Deadliest areas: Ukraine (12,952)" with nothing to say that 8,002 of them were UCDP's event for the whole of January
// and 4,909 one for January to June 2026, put whole in January, both placed only in the country. The four rows below are
// UCDP's own (candidate events v26.01.26.09, Russia – Ukraine, January 2026; the columns the note reads).
test('Realtime notes: deaths in events UCDP dates only to a month or longer, or places only in the country, are said', async () => {
  const { monthInsight } = await import('../battlefield/scripts/realtime-insight.mjs');
  const row = (date_start, date_end, date_prec, best, adm_1, headline) => ({ date_start: `${date_start} 00:00:00.000`, date_end: `${date_end} 00:00:00.000`, date_prec, best, deaths_civilians: '0',
    conflict_new_id: '13243', conflict_name: 'Russia - Ukraine', dyad_name: 'Government of Russia (Soviet Union) - Government of Ukraine', type_of_violence: '1', country: 'Ukraine', region: 'Europe', adm_1, where_description: '', source_headline: headline, source_office: '' });
  const list = [row('2026-01-01', '2026-01-31', '4', '8002', '', 'Russia\'s losses in the war 01.01.2026 - 31.01.2026'), row('2026-01-01', '2026-06-30', '5', '4909', '', 'Ukraine\'s losses in the war 01.01.2026 - 30.06.2026'),
    row('2026-01-10', '2026-01-10', '1', '14', 'Donetsk oblast', '10 January 2026'), row('2026-01-23', '2026-01-23', '1', '10', 'Dnipropetrovsk oblast', '23 January 2026')];
  const x = monthInsight({ conflicts: new Map([['13243', {}]]) }, list, '2026-01', null);
  assert.equal(x.deaths, 12935);
  assert.deepEqual([x.periodDeaths, x.periodBeyond, x.unplacedDeaths], [12911, 4909, 12911]);
  assert.match(x.text, /Deadliest areas: Ukraine \(12,911\); Donetsk, Ukraine \(14\); Dnipropetrovsk, Ukraine \(10\)\./);
  assert.match(x.text, /Of these deaths, 12,911 are in events UCDP dates only to a month or a longer period, not to a day, each counted here in the month it starts \(4,909 in a period running beyond January\)\./);
  assert.match(x.text, /12,911 have no area recorded below the country\./);
  // A month of clashes dated to the day says nothing of the kind.
  const plain = monthInsight({ conflicts: new Map([['13243', {}]]) }, list.slice(2), '2026-01', null);
  assert.deepEqual([plain.periodDeaths, plain.periodBeyond, plain.unplacedDeaths], [0, 0, 0]);
  assert.doesNotMatch(plain.text, /UCDP dates only|no area recorded/);
  // The builder writes its notes by this rule, and the page's bars say it in their tooltip.
  assert.match(readFileSync(new URL('../battlefield/scripts/build-realtime.mjs', import.meta.url), 'utf8'), /import \{ monthInsight, country \} from '\.\/realtime-insight\.mjs';/);
  assert.match(readFileSync(new URL('../q/battlefield.html', import.meta.url), 'utf8'), /x\.periodDeaths \?/);
  // The committed data, once built by this rule (a file built before has no periodDeaths: the next UCDP release's
  // build, battlefield-refresh, writes them): every month's figures add up and its note says them.
  if (!REALTIME.wars.some(w => w.monthly.some(m => 'periodDeaths' in m))) return;
  for (const w of REALTIME.wars) for (const m of w.monthly.filter(x => x.events)) {
    assert.ok(m.periodDeaths <= m.deaths && m.periodBeyond <= m.periodDeaths && m.unplacedDeaths <= m.deaths, `${w.id} ${m.month}`);
    if (m.periodDeaths) assert.match(m.text, /UCDP dates only to a month or a longer period/, `${w.id} ${m.month}`);
  }
});

test('Realtime data: the year so far month by month, with enough wars and conflict cells to map', () => {
  const r = REALTIME, sum = f => r.wars.reduce((s, w) => s + (f(w) || 0), 0);
  assert.equal(r.generated, new Date(Date.parse(r.generated)).toISOString());
  assert.match(r.version, /^\d{2}\.01\.\d{2}\.\d{2}$/);
  // A year-to-date file: every month from January to the one its release covers to ('26.01.26.09': September 2026).
  const [, , yy, mm] = r.version.split('.');
  assert.equal(r.latest, `20${yy}-${mm}`, `release ${r.version}`);
  assert.deepEqual(r.months, Array.from({ length: +mm }, (_, i) => `${r.year}-${String(i + 1).padStart(2, '0')}`));
  // The page plots and lists these; the live view asks for as much (10 wars, 100 markers). Each month of 2026 has had
  // 1,400–2,000 events, 9,000–40,000 deaths and 50–56 wars with events, so a month under 300 events, 1,000 deaths or
  // 10 wars is a short file, not a quiet month.
  assert.ok(r.wars.filter(w => w.status === 'active').length >= 10, `${r.wars.filter(w => w.status === 'active').length} active wars`);
  assert.ok(sum(w => w.points?.length) >= 100, 'conflict cells to plot');
  r.months.forEach((m, i) => {
    const events = sum(w => w.monthly[i]?.events), deaths = sum(w => w.monthly[i]?.deaths), wars = r.wars.filter(w => w.monthly[i]?.events).length;
    assert.ok(events >= 300 && deaths >= 1000 && wars >= 10, `${m}: ${events} events, ${deaths} deaths, ${wars} wars`);
  });
  assert.ok(sum(w => w.events) <= r.totals.events && sum(w => w.deaths) <= r.totals.deaths, 'wars within the totals');
  // Every war has a summary and an entry for every month, in order (the archive view looks each month up).
  assert.equal(new Set(r.wars.map(w => w.id)).size, r.wars.length, 'war ids are unique');
  for (const w of r.wars) {
    assert.ok(w.id && w.name && w.summary && /^\d{4}-\d{2}-\d{2}$/.test(w.lastActive), w.id);
    assert.deepEqual(w.monthly.map(m => m.month), r.months, w.id);
    assert.ok(w.points.every(p => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p[2] >= 0 && p[2] < r.months.length && p[4] > 0), `${w.id}: points`);
  }
});

/* ---- AC-14 (ledger AT-19 with AT-10; Jude's request of 16 November 2026 that every map show all countries where the
   sources allow; PRP-ALL-COUNTRIES-PLAN.md, AC-14 and section 3). Every event UCDP records is in a war or warzone: an
   "Other armed violence in <country>" group under 25 deaths is no longer dropped but kept under one quiet group. Every
   country UCDP's own country field names is in the "countries" table, with its ISO3 and its events, deaths and wars
   month by month; every circle names its country as UCDP files it. The relations are asserted, never the counts. */
const QUIET = 'other-recorded';
const sumOf = a => a.reduce((t, x) => t + x, 0);
const VM197 = async () => {
  const { makeResolvers } = await import('../integration/scripts/coverage.mjs');
  return [...makeResolvers({ national: JSON.parse(readFileSync(new URL('../national/data/index.json', import.meta.url), 'utf8')).countries }).target].sort();
};
test('Realtime data: every event UCDP records is in a war or warzone; a group under 25 deaths is kept in one quiet group', () => {
  const r = REALTIME;
  assert.equal(sumOf(r.wars.map(w => w.events)), r.totals.events, 'the wars’ events add up to the year’s');
  assert.equal(sumOf(r.wars.map(w => w.deaths)), r.totals.deaths, 'and their deaths');
  for (const w of r.wars.filter(x => x.id.startsWith('other-') && x.id !== QUIET)) assert.ok(w.deaths >= 25, `${w.id}: ${w.deaths} deaths belong in the quiet group`);
  const q = r.wars.find(w => w.id === QUIET);
  assert.ok(q, 'the quiet group is in the file');
  assert.equal(q.name, 'Other recorded armed violence (under 25 deaths in a country this year)');
  assert.deepEqual(q.keywords, [], 'no news search for a group of many countries');
  assert.ok(q.points.length && q.countries.length > 1, 'its circles, and the countries it holds');
  assert.doesNotMatch(readFileSync(new URL('../battlefield/scripts/build-realtime.mjs', import.meta.url), 'utf8'), /deaths < 25\) continue/, 'no group is dropped for its size');
});

test('the builder refuses a file whose events cannot all be filed under a country', () => {
  const src = readFileSync(new URL('../battlefield/scripts/build-realtime.mjs', import.meta.url), 'utf8');
  assert.match(src.match(/const COLUMNS = \[[^\]]+\]/)[0], /'country_id'/, 'country_id is a column the build requires');
  assert.match(src, /if \(!gw\) \{ uncoded\+\+; continue; \}/, 'an event with no readable code is counted, not passed over');
  assert.match(src, /\.\.\.\(uncoded \? \[`\$\{uncoded\} of \$\{events\.length\} events have no country code/, 'and the count stops the write');
  const r = JSON.parse(readFileSync(new URL('../battlefield/data/realtime.json', import.meta.url), 'utf8'));
  const all = Object.values(r.countries);
  assert.equal(all.reduce((s, c) => s + c.events, 0), r.totals.events, 'every event of the year is in a country');
  assert.equal(all.reduce((s, c) => s + c.deaths, 0), r.totals.deaths, 'and every death');
});

test('Realtime data: every country UCDP records is in the countries table, by its code and ISO3, and in some war', async () => {
  const r = REALTIME, n = r.months.length, wars = new Map(r.wars.map(w => [w.id, w])), vm = new Set(await VM197());
  assert.ok(r.countries && Object.keys(r.countries).length, 'the file has the countries table the present builder writes');
  const iso = new Set();
  for (const [gw, c] of Object.entries(r.countries)) {
    assert.match(c.iso3 || '', /^[A-Z]{3}$/, `${gw} ${c.name}: its ISO3`);
    assert.ok(vm.has(c.iso3), `${gw} ${c.iso3}: one of VM’s 197`);
    assert.ok(!iso.has(c.iso3), `${c.iso3} once`); iso.add(c.iso3);
    const ws = Object.entries(c.wars || {});
    assert.ok(ws.length, `${gw} ${c.name} appears in some war`);
    for (const [id, x] of ws) {
      assert.ok(wars.has(id), `${gw}: ${id} is a war in the file`);
      assert.ok(wars.get(id).countries.includes(c.name), `${id} names ${c.name}`);
      assert.equal(x.events.length, n, `${gw} ${id}`); assert.equal(x.deaths.length, n, `${gw} ${id}`);
    }
    assert.equal(sumOf(ws.flatMap(([, x]) => x.events)), c.events, `${gw}: its events`);
    assert.equal(sumOf(ws.flatMap(([, x]) => x.deaths)), c.deaths, `${gw}: its deaths`);
    if (c.wars[QUIET]) assert.ok(sumOf(c.wars[QUIET].deaths) < 25, `${c.name}: under 25 deaths in the quiet group`);
  }
  assert.equal(sumOf(Object.values(r.countries).map(c => c.events)), r.totals.events, 'the countries’ events add up to the year’s');
  assert.equal(sumOf(Object.values(r.countries).map(c => c.deaths)), r.totals.deaths, 'and their deaths');
  for (const w of r.wars) {
    assert.equal(sumOf(Object.values(r.countries).map(c => sumOf(c.wars[w.id]?.events || []))), w.events, `${w.id}: its events by country`);
    assert.deepEqual(r.months.map((m, i) => sumOf(Object.values(r.countries).map(c => c.wars[w.id]?.events[i] || 0))), w.monthly.map(x => x.events), `${w.id}: month by month, as the page counts`);
    // A circle names its country as UCDP files it (the sixth field, a code in the table).
    for (const p of w.points) assert.ok(Object.hasOwn(r.countries, String(p[5])), `${w.id}: point ${p.join(',')}`);
  }
});

test('page file: the country layer is Natural Earth 1:50m, pinned and checked, loaded after the circles, with the map kit', async () => {
  const html = readFileSync(new URL('../q/battlefield.html', import.meta.url), 'utf8');
  assert.ok(html.includes("'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'"), 'the 1:50m file');
  assert.ok(html.includes("'sha384-Aw4s9pX1PTPntIYkZ/qV9IYiF5Gv8eTl6Dd/TT56zfO1Wwd+owFwYUuuXNUMrWkc'"), 'checked by its hash');
  assert.ok(html.includes("'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js'"), 'topojson-client');
  assert.ok(html.includes("'sha384-Ukv1p/xTma6P4/2bY5KzWBw+ydSpXmhCMtyciIQVDJ1RmOxtCYNMF1uXT9T63H67'"), 'checked by its hash');
  for (const m of html.matchAll(/(https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)[^"'\s]+)/g)) assert.match(m[1], /@\d+\.\d+\.\d+\//, `pinned: ${m[1]}`);
  assert.match(html, /<script src="\.\.\/design\/prp-mapkit\.js"><\/script>/);
  assert.match(html, /PRPMapkit\.(dots|dotFeatures)\('50m'\)/, 'the kit’s dot for Tuvalu');
  assert.doesNotMatch(html, /<script[^>]+(world-atlas|topojson-client)/, 'neither blocks the first paint');
  // Review D5: the Method says how this page counts a month, so its figures and Month by Month's can be told apart.
  assert.match(html, /count each event in the month it starts; Month by Month shares out/);
  // The page's list of VM's 197 is the coverage script's.
  const listed = html.match(/const VM197 = '([A-Z ]+)'/)?.[1].split(' ').sort();
  assert.deepEqual(listed, await VM197());
});

async function open(path) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { browser, page, errors };
}

test('Realtime: live view lists extant wars and plots events; a war opens its briefing', pageTest, async () => {
  const { browser, page, errors } = await open('q/battlefield?view=live');
  await page.waitForSelector('.warrow', { timeout: 20000 });
  const wars = await page.locator('.warrow').count();
  const markers = await page.locator('.leaflet-overlay-pane path.leaflet-interactive').count(); // the circles, not the countries
  await page.locator('.warrow').first().click();
  await page.waitForSelector('.detail h2');
  const briefing = await page.locator('.detail').innerText();
  await browser.close();
  assert.ok(wars >= 10, `wars: ${wars}`);
  assert.ok(markers >= 100, `markers: ${markers}`);
  assert.match(briefing, /deaths/);
  assert.match(briefing, /background/i);
  assert.deepEqual(errors, []);
});

test('Realtime: archive view shows a month with an insight per war', pageTest, async () => {
  // The month in which the most wars recorded events, from the data the page itself loads (a new year's file replaces
  // the last year's months).
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const busiest = data.months.map((m, i) => [m, data.wars.filter(w => w.monthly[i].events).length]).sort((a, b) => b[1] - a[1])[0][0];
  const name = new Date(`${busiest}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const { browser, page, errors } = await open(`q/battlefield?view=archive&month=${busiest}`);
  await page.waitForSelector('.arow', { timeout: 20000 });
  const month = await page.locator('#month').getAttribute('data-value'); // the timeline's end handle (design/prp-period.js)
  const rows = await page.locator('.arow').count();
  const first = await page.locator('.arow p').first().innerText();
  await browser.close();
  assert.equal(month, busiest);
  assert.ok(rows >= 10, `rows: ${rows}`);
  assert.match(first, new RegExp(`^${name}: .* events, about .* deaths`));
  assert.deepEqual(errors, []);
});

test('Realtime: an archive period sums each war over its months; the start handle on the end gives one month again', pageTest, async () => {
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const [first, last] = [data.months[0], data.months.at(-1)], year = last.slice(0, 4);
  const name = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const deaths = w => w.monthly.reduce((s, x) => s + x.deaths, 0);
  const top = data.wars.filter(w => w.monthly.some(x => x.events)).sort((a, b) => deaths(b) - deaths(a))[0];
  const { browser, page, errors } = await open(`q/battlefield?view=archive&month=${last}&from=${first}`);
  await page.waitForSelector('.arow', { timeout: 20000 });
  const title = await page.locator('#archtitle').innerText();
  const side = await page.locator('#sidetitle').innerText();
  const row = await page.locator('.arow h4').first().innerText();
  const perMonth = await page.locator('.arow').first().locator('.permonth span').count();
  // The start handle pushed onto the end: one month, as before, and no from= in the address.
  await page.locator('#month-from').focus();
  await page.keyboard.press('End');
  const one = { title: await page.locator('#archtitle').innerText(), url: page.url(), months: await page.locator('.permonth').count() };
  await browser.close();
  assert.equal(title, `${name(first)}–${name(last)} ${year}`);
  assert.equal(side, `Wars in ${name(first)}–${name(last)} ${year}`);
  assert.ok(row.includes(top.name) && row.includes(`${deaths(top).toLocaleString('en-GB')} deaths`), `first row: ${row}; expected ${top.name}, ${deaths(top)}`);
  assert.equal(perMonth, data.months.length);
  assert.equal(one.title, `${name(last)} ${year}`);
  assert.match(one.url, new RegExp(`\\?view=archive&month=${last}$`));
  assert.equal(one.months, 0);
  assert.deepEqual(errors, []);
});

test('Retrospective: 1939 shows World War II; 2025 shows dozens of conflicts', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1939');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const y1939 = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=2025'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2025');
  const n2025 = +(await page.locator('#panel .sub').innerText()).match(/^(\d+) armed/)[1];
  const red = await page.locator('path.shape[fill="var(--c-war)"]').count();
  // A long list shows its first items and opens the rest in a pop-out.
  await page.evaluate(() => { location.hash = '#y=2025&c=2'; });
  await page.waitForSelector('#panel [data-more]');
  const shown = await page.locator('#panel .war').count();
  await page.locator('#panel [data-more]').last().click();
  await page.waitForSelector('#modal:not([hidden]) .war');
  const all = await page.locator('#modal .war').count();
  const heading = await page.locator('#modal-title').innerText();
  await browser.close();
  assert.ok(all > 6, `pop-out lists every US conflict: ${all}`);
  assert.ok(shown < all + 12, 'panel shows a shortened list');
  assert.match(heading, /all conflicts 1926–2025/);
  assert.match(y1939, /World War II/);
  assert.ok(n2025 >= 40, `2025 conflicts: ${n2025}`);
  assert.ok(red >= 5, `countries at war: ${red}`);
  assert.deepEqual(errors, []);
});

// Review of 12 November 2026: the inclusion rules differ before UCDP's first year and after, and only the Method said
// so. The two thresholds now stand under the timeline, with the years from the data.
test('Retrospective: the two datasets\' thresholds stand under the timeline, with their years', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1939');
  await page.waitForFunction(() => document.querySelector('#thresholds')?.textContent, null, { timeout: 20000 });
  const line = await page.locator('#thresholds').innerText();
  const below = await page.evaluate(() => document.querySelector('#thresholds').getBoundingClientRect().top >= document.querySelector('#timeline').getBoundingClientRect().bottom - 1);
  await browser.close();
  const { firstYear: a, ucdpFrom: u, lastYear: b } = HISTORY;
  assert.equal(line, `What is counted: ${a}–${u - 1}, wars of 1,000+ battle deaths (Correlates of War); ${u}–${b}, armed conflicts of 25+ battle deaths in a year (UCDP/PRIO). Smaller conflicts before ${u} are missing.`);
  assert.ok(below, 'right under the timeline');
  assert.deepEqual(errors, []);
});

test('Retrospective: 2003 shades Iraq at war and its invaders as fighting abroad; 1942 shows the war in North Africa and the Pacific', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2003');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const fills = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('path.shape')].map(p => [p.__data__.properties.gw, p.getAttribute('fill')])));
  const y2003 = await fills();
  await page.evaluate(() => { location.hash = '#y=2003&c=2'; });
  await page.waitForFunction(() => /^No conflict on its territory in 2003/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const us = await page.locator('#panel .sub').innerText();
  await page.evaluate(() => { location.hash = '#y=1982&w=u346'; });
  await page.waitForSelector('#panel h2');
  const falklands = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=1942'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1942');
  const y1942 = await fills();
  await browser.close();
  assert.equal(y2003[645], 'var(--c-war)');
  for (const gw of [2, 200, 900]) assert.equal(y2003[gw], 'var(--c-abroad)', `2003: ${gw}`);
  assert.match(us, /fighting in \d+ abroad/);
  assert.match(falklands, /over territory in the Falkland Islands/);
  for (const gw of [620, 651, 840, 775, 911]) assert.equal(y1942[gw], 'var(--c-war)', `1942: ${gw}`);
  for (const gw of [560, 920]) assert.equal(y1942[gw], 'var(--c-abroad)', `1942: ${gw}`);
  assert.deepEqual(errors, []);
});

test('Retrospective: a period of years shows every conflict active in it at its peak; the end handle pulled onto the start gives one year', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1942');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const atWar = () => page.locator('path.shape[fill="var(--c-war)"]').count();
  const red1942 = await atWar();
  await page.evaluate(() => { location.hash = '#y=1945&f=1939'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1939–1945');
  const period = {
    label: (await page.locator('#year-label').textContent()).trim(), // textContent: the CSS upper-cases it
    sub: await page.locator('#panel .sub').innerText(),
    red: await atWar(),
    card: (await page.locator('#panel .war[data-id] .lvl').first().textContent()).trim(), // textContent: the CSS upper-cases it
    handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()],
  };
  // A redraw (a country chosen) keeps the period in the address.
  await page.evaluate(() => { location.hash = '#y=1945&f=1939&c=2'; });
  await page.waitForFunction(() => /on its territory in 1939–1945/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const kept = page.url();
  // The end handle pulled back onto the start: one year again, the start at rest, and no f in the address.
  await page.locator('#year').fill('1939');
  await page.locator('#year').dispatchEvent('input');
  const one = { big: await page.locator('#year-big').innerText(), url: page.url(), handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()] };
  await browser.close();
  assert.equal(period.label, 'Period');
  assert.match(period.sub, /^\d+ armed conflicts, \d+ at war level at some point$/);
  assert.ok(period.red >= red1942, `countries at war 1939–1945: ${period.red}; 1942: ${red1942}`);
  assert.equal(period.card, 'War · 1939–45 · 7 yrs'); // World War II leads: at war level, active in all seven years
  assert.deepEqual(period.handles, ['1939', '1945']);
  assert.match(kept, /#y=1945&f=1939&c=2$/);
  assert.equal(one.big, '1939');
  assert.match(one.url, /#y=1939&c=2$/);
  assert.deepEqual(one.handles, ['1939', '1939']);
  assert.deepEqual(errors, []);
});

// AC-13: what pointing at a country says follows the year shown: that year's parties, and when it has no conflict, one
// sentence naming the record that year belongs to (design/prp-mapkit.js's sentence); the dots are drawn and found.
const tipOf = (page, gw) => page.evaluate(gw => {
  const el = [...document.querySelectorAll('#map .shape')].find(p => p.__data__?.properties?.gw === gw || p.__data__?.gw === gw);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return document.querySelector('#tooltip').textContent;
}, gw);
test('Retrospective: pointing at a country gives the year’s parties, or one sentence naming the record', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1985');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    const sweden1985 = await tipOf(page, 380);
    assert.ok(sweden1985 && !sweden1985.includes('Afghanistan: government'), `Sweden 1985: ${sweden1985}`);
    const go = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(t => document.querySelector('#year-big').textContent === t, h.includes('&f=') ? `${h.match(/f=(\d+)/)[1]}–${h.match(/y=(\d+)/)[1]}` : h.match(/y=(\d+)/)[1]); };
    await go('#y=2010');
    assert.match(await tipOf(page, 380), /Afghanistan: government/);
    await go('#y=1932');
    assert.equal(await tipOf(page, 94), 'Costa Rica: no war of 1,000 or more battle deaths recorded by the Correlates of War in 1932.');
    await go('#y=1990');
    assert.equal(await tipOf(page, 94), 'Costa Rica: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990.');
    // A period across 1946 names both records.
    await go('#y=1947&f=1944');
    assert.equal(await tipOf(page, 225), 'Switzerland: no war of 1,000 or more battle deaths recorded by the Correlates of War from 1944 to 1945, and no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO from 1946 to 1947.');
    // Its panel repeats it.
    await page.evaluate(() => { location.hash = '#y=1990&c=94'; });
    await page.waitForFunction(() => /^Costa Rica: no armed conflict/.test(document.querySelector('#panel .sub')?.textContent || ''));
    // Vietnam is at war through the First Indochina War, on French Indochina's shape.
    await go('#y=1950');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#map path.shape')].find(p => p.__data__.properties.gw === 815)?.getAttribute('fill')), 'var(--c-war)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Retrospective: the 22 states with no border are dots from their first day, filled by their year, and found by search', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1983');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    const dots = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#map circle.dot')].map(c => [c.dataset.iso3, c.getAttribute('fill')])));
    const y1983 = await dots();
    // Grenada in 1983: UCDP's level for "Grenada – United States of America" that year is 1 (25–999 battle deaths).
    assert.equal(y1983.GRD, 'var(--c-minor)');
    assert.equal(y1983.LIE, 'var(--c-peace)');
    assert.equal(y1983.TUV, 'var(--c-peace)'); // a state from 1 October 1978
    assert.equal(y1983.PLW, undefined, 'Palau: a state from 1 October 1994');
    assert.equal(Object.keys(y1983).length, 18, 'Saint Kitts and Nevis from 19 September 1983, the Marshall Islands, Micronesia and Palau later');
    assert.match(await tipOf(page, 55), /Grenada – United States of America/);
    await page.evaluate(() => { location.hash = '#y=2008'; });
    await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2008');
    const y2008 = await dots();
    assert.equal(y2008.TON, 'var(--c-abroad)', 'Tonga: a party in Iraq in 2008');
    assert.equal(Object.keys(y2008).length, 22);
    await page.evaluate(() => { location.hash = '#y=2006'; });
    await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2006');
    assert.equal((await dots()).TON, 'var(--c-peace)', 'Tonga: not a party in 2006');
    // Search finds a dot; chosen in a year before its first day, it opens in its first year drawn.
    await page.evaluate(() => { location.hash = '#y=1950'; });
    await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1950');
    await page.locator('#search').fill('Tuvalu');
    await page.waitForSelector('#search-results li');
    assert.match(await page.locator('#search-results li').first().innerText(), /Tuvalu/);
    await page.locator('#search').press('Enter');
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Tuvalu');
    const panel = await page.locator('#panel').innerText();
    assert.equal(await page.locator('#year-big').textContent(), '1979');
    assert.match(panel, /Not drawn as a shape: CShapes 2\.0 has no border for it\./);
    assert.match(panel, /Tuvalu: no armed conflict of 25 or more battle deaths recorded by UCDP\/PRIO in 1979\./);
    assert.match(page.url(), /&c=973$/, 'Tuvalu under its Gleditsch–Ward number');
    // Before its first day, the panel says so.
    await page.evaluate(() => { location.hash = '#y=1960&c=973'; });
    await page.waitForFunction(() => /Tuvalu: not an independent state in 1960\./.test(document.querySelector('#panel')?.textContent || ''));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Review of AC-13 (17 November 2026): a selected war's outline and "Fighting abroad" follow the year; Documentary focus
// marks a dot that PRPFocus has no number for; a war's panel names each place once; a state's list of all its
// conflicts counts a war on its territory as the year's list does; the Holy See is found by that name; and the key
// covers no dot, nor does the frame cut Tonga off on a phone.
test('Retrospective: outlines, "Fighting abroad" and focus follow the year and reach the dots; places are named once', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2004&w=u259');
  try {
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Iraq: government', null, { timeout: 20000 });
    const cls = iso3 => page.evaluate(i => document.querySelector(`#map circle.dot[data-iso3="${i}"]`)?.getAttribute('class') || '', iso3);
    const go = async (h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done); };
    assert.match(await cls('TON'), /\binvolved\b/, 'Tonga outlined in u259 in 2004');
    await go('#y=2006&w=u259', () => document.querySelector('#year-big').textContent === '2006');
    assert.doesNotMatch(await cls('TON'), /\binvolved\b/, 'Tonga not outlined in u259 in 2006');
    // The second review of AC-13: in a year when the selected war was not active only its places are outlined, not
    // the parties of its other years (the page fell back to every party of the whole war, Tonga among them).
    await go('#y=2003&w=u259', () => document.querySelector('#year-big').textContent === '2003');
    assert.doesNotMatch(await cls('TON'), /\binvolved\b/, 'Tonga not outlined in u259 in 2003, when the conflict was not active');
    assert.ok(await page.locator('#map .involved').count() >= 1, 'the war\'s own place is still outlined');
    // And a period's table names a place as it was called in the years of the fighting, not in the period's last
    // year: u210 was fought in 1946–48 in the Soviet Union, which a table of 1946–2025 called Russia.
    await go('#y=2025&f=1946&v=table', () => /1946/.test(document.querySelector('#table-title').textContent) && !!document.querySelector('#table-rows tr[data-id="u210"]'));
    const fought = await page.locator('#table-rows tr[data-id="u210"] td.wrap').textContent();
    assert.match(fought, /Soviet Union/);
    assert.doesNotMatch(fought, /Russia/);
    // A ringed dot is drawn larger than a plain one, so its fill still shows.
    await go('#y=2004&w=u259', () => document.querySelector('#year-big').textContent === '2004');
    const r = await page.evaluate(() => ['TON', 'LIE'].map(i => +document.querySelector(`#map circle.dot[data-iso3="${i}"]`).getAttribute('r')));
    assert.ok(r[0] > r[1], `ringed ${r[0]}, plain ${r[1]}`);
    // Tonga's panel: "Fighting abroad" in 2008, the sentence in 2006.
    await go('#y=2008&c=972', () => document.querySelector('#panel h2')?.textContent === 'Tonga' && document.querySelector('#year-big').textContent === '2008');
    assert.match(await page.locator('#panel').textContent(), /Fighting abroad in 2008[\s\S]*Iraq: government/);
    await go('#y=2006&c=972', () => document.querySelector('#year-big').textContent === '2006');
    assert.doesNotMatch(await page.locator('#panel').textContent(), /Fighting abroad/);
    assert.equal(await page.locator('#panel .sub').textContent(), 'Tonga: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 2006.');
    // Documentary focus on a dot, by ISO3: Grenada (PRPFocus has its number), Tonga and Tuvalu (it has none) and the Holy See.
    await go('#y=2008', () => !document.querySelector('#panel .dot-note'));
    for (const iso3 of ['GRD', 'TON', 'TUV', 'VAT']) {
      await page.evaluate(i => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { countries: [i] } })), iso3);
      await page.waitForFunction(i => document.querySelector(`#map circle.dot[data-iso3="${i}"]`)?.classList.contains('prp-focus-hit'), iso3, { timeout: 5000 });
    }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { reset: true } })));
    // A war's panel names each place once: Georgia, not also "Georgia (then in the Soviet Union)".
    await go('#y=1993&w=u380', () => document.querySelector('#panel h2')?.textContent === 'Georgia: government');
    const intro = await page.locator('#panel > p:not(.sub)').first().textContent();
    assert.match(intro, /over government in Georgia, active in 3 years/);
    assert.doesNotMatch(intro, /Soviet Union/);
    // The Soviet Union in 1991: Georgia's war is on its territory that year, and so in its list of all conflicts.
    await go('#y=1991&c=365', () => /on its territory in 1991/.test(document.querySelector('#panel .sub')?.textContent || ''));
    assert.ok(await page.locator('#panel .war[data-id="u380"]').count() >= 1);
    await page.locator('#panel [data-more]').last().click();
    await page.waitForSelector('#modal:not([hidden]) .war');
    assert.ok(await page.locator('#modal .war[data-id="u380"]').count() === 1, 'listed among all its conflicts');
    await page.locator('#modal-close').click();
    // The Holy See, by VM's name for it.
    await page.locator('#search').fill('Holy See');
    await page.waitForSelector('#search-results li');
    assert.match(await page.locator('#search-results li').first().innerText(), /Vatican/);
    await page.locator('#search').fill('');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Retrospective: the key and the frame hide no dot, at a tablet’s width and a phone’s', pageTest, async () => {
  const browser = await launch();
  try {
    for (const [width, height] of [[1024, 768], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${BASE}/battlefield/history/#y=1983`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#map circle.dot', { timeout: 20000 });
      const seen = await page.evaluate(() => {
        const svg = document.querySelector('#map').getBoundingClientRect(), legend = document.querySelector('.legend').getBoundingClientRect();
        const at = c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        const dots = [...document.querySelectorAll('#map circle.dot')];
        const grd = dots.find(c => c.dataset.iso3 === 'GRD');
        return {
          keyBelow: legend.top >= svg.bottom - 1,
          outside: dots.filter(c => { const [x, y] = at(c); return x < svg.left || x > svg.right || y < svg.top || y > svg.bottom; }).map(c => c.dataset.iso3),
          grenadaOnTop: document.elementFromPoint(...at(grd)) === grd, // at war in 1983: over its neighbours at peace
        };
      });
      await page.close();
      assert.deepEqual(seen, { keyBelow: true, outside: [], grenadaOnTop: true }, `${width} px`);
    }
  } finally { await browser.close(); }
});

// The year keeps a period's width at rest too, so on a phone opening a period narrows no figure into another line:
// before, "At war level" wrapped and dropped the timeline and the map 13px under the reader's finger.
test('Retrospective: on a phone, opening a period keeps the timeline where it was', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/history/#y=1945`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  await page.waitForSelector('.jdpi-returnbar', { timeout: 15000 }); // prp-bar.js adds it after load, moving the page down
  await page.evaluate(() => document.fonts.ready);
  const track = () => page.evaluate(() => { const r = document.querySelector('#timeline .prp-period-range').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  const rest = await track();
  await page.locator('#from').focus();
  await page.keyboard.press('ArrowLeft'); // a drag's first move
  const first = await track();
  for (let k = 1; k < 6; k++) await page.keyboard.press('ArrowLeft');
  const period = await track();
  assert.equal(await page.locator('#year-big').textContent(), '1939–1945');
  assert.deepEqual(first, rest, 'the first move');
  assert.deepEqual(period, rest, 'the period opened');
  assert.equal(rest.sideways, 0);
  assert.deepEqual(errors, []);
});

// Jude, 14 November 2026: "The sliders on the maps currently start off as overlayed on one another. They should start
// off one apart so both are visible when you first open the map." An address with no time opens one stop apart, on a
// two-stop period shown as any period is; an address that names one time keeps it, and one that names a period too.
const handles = (page, sel) => page.evaluate(sel => {
  const el = document.querySelector(sel), t = parseFloat(getComputedStyle(el).getPropertyValue('--prp-period-thumb')) || 16;
  const at = i => { const b = i.getBoundingClientRect(); return b.left + t / 2 + ((+i.value - +i.min) / Math.max(1, +i.max - +i.min)) * (b.width - t); };
  const f = el.querySelector('input.from'), to = el.querySelector('input.to');
  return { from: f.dataset.value, to: to.dataset.value, apart: at(to) - at(f) > 0, joined: el.querySelector('.prp-period-range').classList.contains('joined') };
}, sel);
test('Retrospective: opened with no year, the handles stand one year apart and the map shows the last two years', pageTest, async () => {
  const { firstYear, lastYear } = HISTORY, prev = lastYear - 1;
  const { browser, page, errors } = await open('battlefield/history/');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    assert.deepEqual(await handles(page, '#timeline'), { from: String(prev), to: String(lastYear), apart: true, joined: false });
    assert.equal(await page.locator('#year-big').textContent(), `${prev}–${lastYear}`);
    assert.equal((await page.locator('#year-label').textContent()).trim(), 'Period');
    assert.match(await page.locator('#panel .sub').innerText(), /^\d+ armed conflicts, \d+ at war level at some point$/);
    assert.equal(page.url(), `${BASE}/battlefield/history/`, 'opening writes nothing to the address');
    // The next thing written to the address (the table chosen) keeps the period.
    await page.locator('[role="tab"][data-view="table"]').click();
    assert.match(page.url(), new RegExp(`#y=${lastYear}&f=${prev}&v=table$`));
    // An address that names one year keeps it: the handles together, as before.
    await page.goto(`${BASE}/battlefield/history/#y=${lastYear}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(y => document.querySelector('#year-big')?.textContent === y, String(lastYear), { timeout: 20000 });
    assert.deepEqual(await handles(page, '#timeline'), { from: String(lastYear), to: String(lastYear), apart: false, joined: true });
    assert.ok(firstYear < prev);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
// Play from that opening runs through the years from the first, as play from the single last year did, not one step.
test('Retrospective: play from the opening travels through the years from the first, one year at a time', pageTest, async () => {
  const { firstYear, lastYear } = HISTORY;
  const { browser, page, errors } = await open('battlefield/history/');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    await page.locator('#play').click();
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Pause');
    // The end runs on past the first year, the start with it (one year, travelling).
    await page.waitForFunction(first => { const f = document.querySelector('#from'), t = document.querySelector('#year'); return +t.dataset.value > first && f.dataset.value === t.dataset.value; }, firstYear, { timeout: 8000 });
    await page.locator('#play').click();
    const at = await page.evaluate(() => [document.querySelector('#from').dataset.value, document.querySelector('#year').dataset.value].map(Number));
    assert.ok(at[0] === at[1] && at[1] > firstYear && at[1] < lastYear - 1, JSON.stringify(at));
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play through the years');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('Realtime: the archive opened with no month stands its handles one month apart, on the last two months', pageTest, async () => {
  const months = REALTIME.months, [a, b] = months.slice(-2), year = b.slice(0, 4);
  const name = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const { browser, page, errors } = await open('q/battlefield?view=archive');
  try {
    await page.waitForSelector('.arow', { timeout: 20000 });
    assert.deepEqual(await handles(page, '#monthctl'), { from: a, to: b, apart: true, joined: false });
    assert.equal(await page.locator('#archtitle').innerText(), `${name(a)}–${name(b)} ${year}`);
    assert.equal(await page.locator('#sidetitle').innerText(), `Wars in ${name(a)}–${name(b)} ${year}`);
    assert.ok(await page.locator('.permonth').count() > 0, 'each war month by month over the period');
    assert.match(page.url(), /\?view=archive$/);
    // The start moved onto the end gives one month, written to the address, which then opens that one month.
    await page.locator('#month-from').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('#archtitle').innerText(), `${name(b)} ${year}`);
    assert.match(page.url(), new RegExp(`\\?view=archive&month=${b}$`));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.arow', { timeout: 20000 });
    assert.deepEqual(await handles(page, '#monthctl'), { from: b, to: b, apart: false, joined: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* ---- its summary (integration/scripts/heads.mjs), written by the build with the store and committed with it; checked
   here too, so a refresh never commits one out of step. */
import { checkHeads as checkSummaries } from '../integration/scripts/heads.mjs';
test('realtime.head.json is in step with its store (integration/scripts/heads.mjs)', () => {
  assert.deepEqual(checkSummaries('battlefield/data/realtime.json'), [], 'run node integration/scripts/heads.mjs battlefield/data/realtime.json');
});

// Two kinds of date, each beside what it dates (13 November 2026; the second review: "statistics stop in September.
// Visually separate news freshness from conflict-data freshness"). Over the map: the conflict figures' months, UCDP's
// release, the store's rebuild and the refresh's schedule (its cron, design/prp-freshness.js), with no ticking clock.
// Under a war's "In the news": the front pages searched and the newest found, from the stories' own days. The news
// archive is faked, so its days are known.
test('Realtime: the conflict figures and the news each carry their own dates, beside what they date', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const F = await import('../design/prp-freshness.js');
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const war = REALTIME.wars.find(w => w.keywords.length && w.status === 'active') || REALTIME.wars.find(w => w.keywords.length);
  const rows = [3, 1].map((n, k) => ({ snapshot_date: day(n), country_code: 'GB', outlet: `Outlet ${k}`, outlet_domain: `o${k}.example`, title_original: `${war.keywords[0]} story ${k}`, title_en: `${war.keywords[0]} story ${k}`, url: `https://o${k}.example/${k}`, published_at: null }));
  for (const width of [1400, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/rest/v1/country_top_stories*', r => r.fulfill({ json: rows }));
    await page.goto(`${BASE}/q/battlefield.html?view=live&war=${war.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => /Checked for a new release/.test(document.getElementById('checked')?.textContent || ''), null, { timeout: 20000 });
    const meta = (await page.textContent('#figures-dated')).replace(/\s+/g, ' ');
    const month = new Date(REALTIME.latest + '-01T00:00:00Z').toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.ok(meta.includes(`Conflict figures: events to ${month}`), meta);
    assert.ok(meta.includes(`UCDP Candidate Events, release ${REALTIME.version}, rebuilt ${F.day(Date.parse(REALTIME.generated))}`), meta);
    assert.ok(meta.includes(`Checked for a new release ${F.rhythmFromCron(F.SCHEDULES['battlefield-refresh.yml']).phrase}`), meta);
    assert.doesNotMatch(meta, /Now|Refreshed monthly|\d\d:\d\d UTC/, 'no clock and no rhythm written by hand');
    assert.equal(await page.locator('#clock').count(), 0);
    assert.equal(await page.textContent('#tab-live'), 'Map · latest 3 months', 'no "Live" for figures that end in ' + month);
    // The news, under its own heading, with its own dates.
    await page.waitForSelector('#stories .story a', { timeout: 20000 });
    assert.equal(await page.textContent('.detail h3:has(+ #news-dated)'), 'In the news, last 30 days');
    assert.equal(await page.textContent('#news-dated'), `Front pages from ${F.period(day(30))} to ${F.period(day(1))} (UTC days) · Global Headline Tracker, collected daily`);
    assert.deepEqual(await page.$$eval('#stories .story small', s => s.map(x => x.textContent.split(' · ').at(-1)).sort()), [`front page of ${F.period(day(1))}`, `front page of ${F.period(day(3))}`].sort());
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, `${width}: no sideways scroll (${over})`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

// MP-03 (15 Nov 2026, Jude's "Use your judgement" on the sliders on a phone): at 390 px the hundred-year track puts one
// year about 3 px apart, so the opening is as many years apart as gives at least about 24 px between the handles, the
// latest year still at the right one; at desktop width the opening is still one year apart (the test above).
test('Retrospective on a phone (390 px): opened with no year, the handles stand at least 24 px apart, the latest year at the right', pageTest, async () => {
  const { lastYear } = HISTORY;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${BASE}/battlefield/history/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    const h = await page.evaluate(() => {
      const el = document.querySelector('#timeline'), t = parseFloat(getComputedStyle(el).getPropertyValue('--prp-period-thumb')) || 16;
      const at = i => { const b = i.getBoundingClientRect(); return b.left + t / 2 + ((+i.value - +i.min) / Math.max(1, +i.max - +i.min)) * (b.width - t); };
      const f = el.querySelector('input.from'), to = el.querySelector('input.to');
      return { from: +f.dataset.value, to: +to.dataset.value, px: at(to) - at(f) };
    });
    assert.equal(h.to, lastYear);
    assert.ok(h.px >= 23, `handles ${h.px.toFixed(1)} px apart`);
    assert.ok(lastYear - h.from > 1 && lastYear - h.from < 20, `opens ${lastYear - h.from} years apart`);
    assert.equal(await page.locator('#year-big').textContent(), `${h.from}–${lastYear}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ChatGPT's review (ledger RV-05): the freshness line says "checked weekly" (the refresh's rhythm) and the Method said
// "every six hours" (the open page's reload): the Method now names both, so the two do not read as a contradiction.
test('page file: the Method names the weekly check for UCDP data and the six-hour reload apart', () => {
  const html = readFileSync(new URL('../q/battlefield.html', import.meta.url), 'utf8');
  assert.match(html, /VM checks for a new UCDP release weekly, and an open page reloads its data every six hours\./);
  assert.doesNotMatch(html, /The page checks for new data every six hours/);
  // R2-4: no sentence in the Method runs into the next without a space.
  const method = html.match(/<p><b>Method\.<\/b>([\s\S]*?)<\/p>/)[1];
  assert.doesNotMatch(method, /[a-z)”’]\.[A-Z]/, 'a space after each full stop in the Method');
  assert.match(readFileSync(new URL('../.github/workflows/battlefield-refresh.yml', import.meta.url), 'utf8'), /cron: '\d+ \d+ \* \* \d'/, 'the refresh runs once a week');
});

/* ---- AC-14 on the page: the country layer (Natural Earth 1:50m, the kit's dot for Tuvalu) under the circles. Each
   country is pointed at by a mouseover on its own shape, so a circle over it cannot get in the way; the figures and the
   period come from the data the page loads. */
const monthLong = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
const periodOf = (a, b) => (a === b ? `${monthLong(b)} ${b.slice(0, 4)}` : `${monthLong(a)}–${monthLong(b)} ${b.slice(0, 4)}`);
const pointAt = isos => {
  const out = {};
  for (const iso of isos) {
    const el = document.querySelector(`.rt-c-${iso}`);
    if (!el) { out[iso] = null; continue; }
    const b = el.getBoundingClientRect(), o = { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
    el.dispatchEvent(new MouseEvent('mouseover', o));
    out[iso] = [...document.querySelectorAll('.leaflet-tooltip.rt-country-tip')].at(-1)?.textContent ?? ''; // the last one fades out for 0.2 s
    el.dispatchEvent(new MouseEvent('mouseout', o));
  }
  return out;
};
test('Realtime: every one of the 197 is on the map under the circles, and pointing at one gives its figures or one sentence', pageTest, async t => {
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const vm = await VM197(), [first, last] = [data.months[0], data.months.at(-1)], period = periodOf(first, last);
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/battlefield.html?view=archive&month=${last}&from=${first}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('path.rt-country', { timeout: 30000 });
  const tips = await page.evaluate(pointAt, vm);
  assert.deepEqual(vm.filter(i => !tips[i]), [], 'every one of the 197 is drawn and says something');
  const byIso = new Map(Object.values(data.countries).map(c => [c.iso3, c]));
  for (const iso of vm) {
    const c = byIso.get(iso);
    if (c) assert.ok(tips[iso].includes(`: ${c.events.toLocaleString('en-GB')} armed-conflict event${c.events === 1 ? '' : 's'} recorded by UCDP, ${period}, with ${c.deaths.toLocaleString('en-GB')} death`), `${iso}: ${tips[iso]}`);
    else assert.match(tips[iso], /^[^:]+: no armed-conflict (events recorded by UCDP|figures), /, `${iso}: ${tips[iso]}`);
  }
  assert.equal(tips.PRT, `Portugal: no armed-conflict events recorded by UCDP, ${period}.`);
  const swe = byIso.get('SWE');
  if (swe) assert.match(tips.SWE, new RegExp(`^Sweden: ${swe.events} armed-conflict events? recorded by UCDP`));
  // A country with events names its wars and warzones, from the data.
  const ukr = byIso.get('UKR');
  if (ukr) for (const id of Object.keys(ukr.wars)) assert.ok(tips.UKR.includes(data.wars.find(w => w.id === id).name), `Ukraine names ${id}`);
  // Tuvalu, which 1:50m does not draw, is the kit's dot; the layer is under the circles; a shape that is not one of the
  // 197 (Greenland) is drawn and takes no pointer.
  assert.equal(await page.locator('path.rt-dot.rt-c-TUV').count(), 1);
  assert.equal(await page.locator('#countries-credit').isVisible(), true, 'the shapes are credited once drawn');
  // The dot is a few pixels across; pointing or tapping 8 px off its centre (a finger) still finds Tuvalu.
  await page.evaluate(() => { const el = document.querySelector('.rt-c-TUV'); countryLayer.eachLayer(l => { if (l.getElement?.() === el) map.setView(l.getLatLng(), map.getZoom(), { animate: false }); }); });
  // R2-3: a tooltip that pointAt opened is still fading (0.2 s) and could stand in for the real hover, and the page can
  // still shift as its last parts load (the map moved some 36 px down after the box was read): move away, wait until no
  // country tooltip is left and the dot has stood still for 0.3 s, and only then read where it is, point and tap.
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip.rt-country-tip'), null, { timeout: 5000 });
  let tuv = null;
  for (let i = 0; i < 40; i++) {
    const b = await page.locator('path.rt-dot.rt-c-TUV').boundingBox();
    if (tuv && b && b.x === tuv.x && b.y === tuv.y) break;
    tuv = b;
    await page.waitForTimeout(300);
  }
  assert.ok(tuv && tuv.width < 16, `the dot itself is small (${tuv?.width} px)`);
  const off = { x: tuv.x + tuv.width / 2 + 8, y: tuv.y + tuv.height / 2 };
  await page.mouse.move(off.x, off.y, { steps: 4 });
  await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tooltip.rt-country-tip')].some(t => /^Tuvalu: /.test(t.textContent) && +getComputedStyle(t).opacity > 0.5), null, { timeout: 5000 });
  await page.mouse.click(off.x, off.y);
  await page.waitForFunction(() => /^Tuvalu: /.test(document.getElementById('country-said')?.textContent || ''), null, { timeout: 5000 });
  assert.equal(await page.locator('#country-said').textContent(), tips.TUV, 'a tap beside the dot says Tuvalu’s sentence');
  await page.mouse.move(5, 5);
  const z =await page.evaluate(() => ['.leaflet-rtcountries-pane', '.leaflet-overlay-pane'].map(s => +getComputedStyle(document.querySelector(s)).zIndex));
  assert.ok(z[0] < z[1], `countries ${z[0]} under circles ${z[1]}`);
  assert.ok(await page.locator('path.rt-land').count() > 0, 'the shapes outside the 197 are drawn');
  assert.equal(await page.locator('path.rt-land.leaflet-interactive').count(), 0, 'and say nothing');
  // A tap (a click) says it again under the map, whole; it follows the period shown. The Live view's is its three months.
  await page.evaluate(() => { const el = document.querySelector('.rt-c-PRT'), b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 })); });
  assert.equal(await page.locator('#country-said').textContent(), tips.PRT);
  await page.locator('#tab-live').click();
  const livePeriod = periodOf(data.months.at(-3) || last, last), live = await page.evaluate(pointAt, ['PRT']);
  assert.equal(live.PRT, `Portugal: no armed-conflict events recorded by UCDP, ${livePeriod}.`);
  assert.equal(await page.locator('#country-said').textContent(), live.PRT);
  assert.deepEqual(errors, []);
});

test('Realtime: a circle keeps its pointer and its click over a country and names UCDP’s country; dark at 390 px; no country file, no harm', pageTest, async t => {
  const data = await (await fetch(`${BASE}/battlefield/data/realtime.json`)).json();
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/battlefield.html?view=live`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('path.rt-country', { timeout: 30000 });
  await page.locator('#map').scrollIntoViewIfNeeded();
  // A circle that is itself what the pointer finds at its centre, over a country shape.
  const at = await page.evaluate(() => {
    for (const el of document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')) {
      const b = el.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (b.width < 6 || x < 5 || y < 5 || x > innerWidth - 5 || y > innerHeight - 5 || document.elementFromPoint(x, y) !== el) continue;
      el.style.pointerEvents = 'none'; const under = document.elementFromPoint(x, y); el.style.pointerEvents = '';
      if (under?.classList.contains('rt-country')) return { x, y };
    }
    return null;
  });
  assert.ok(at, 'a circle over a country');
  await page.mouse.move(at.x, at.y);
  const tip = await page.locator('.leaflet-tooltip:not(.rt-country-tip)').first().textContent({ timeout: 5000 });
  assert.ok(data.wars.some(w => tip.startsWith(w.name)), `the circle’s own tooltip: ${tip}`);
  assert.ok(Object.values(data.countries).some(c => tip.includes(`${c.name} · `)), `it names UCDP’s country: ${tip}`);
  assert.equal(await page.locator('.leaflet-tooltip.rt-country-tip').count(), 0, 'not the country’s');
  // R2-5: a tap on a country across the map opens its tooltip inside the map, whole (checked here, before a circle's
  // tap moves the map).
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip'), null, { timeout: 5000 });
  // The page can still shift as its last parts load: wait until the map has stood still for 0.3 s.
  for (let i = 0, was = ''; i < 40; i++) {
    const now = JSON.stringify(await page.locator('#map').boundingBox());
    if (now === was) break;
    was = now;
    await page.waitForTimeout(300);
  }
  // A spot is looked for just before its tap, and a tap that opens nothing is made again on a spot found afresh: on a
  // slow machine the page's last parts can still move the map between the two (a refresh run of 18 November 2026
  // waited five seconds for a tooltip that a tap on the sea could not open).
  const spotAt = fx => page.evaluate(fx => {
    const m = document.getElementById('map').getBoundingClientRect();
    for (let y = m.top + 40; y < Math.min(m.bottom, innerHeight) - 40; y += 8) {
      const x = m.left + m.width * fx, el = document.elementFromPoint(x, y);
      if (el?.matches?.('path.rt-country:not(.rt-dot)')) return { x, y };
    }
    return null;
  }, fx);
  let tapped = 0;
  for (const fx of [0.15, 0.3, 0.5, 0.7, 0.85]) {
    let r = null, s = null;
    for (let go = 0; go < 3 && !r; go++) {
      s = await spotAt(fx);
      if (!s) break;
      await page.mouse.click(s.x, s.y);
      r = await page.waitForFunction(() => {
        const t = [...document.querySelectorAll('.leaflet-tooltip.rt-country-tip')].find(x => +getComputedStyle(x).opacity > 0.5);
        if (!t) return null;
        const m = document.getElementById('map').getBoundingClientRect(), b = t.getBoundingClientRect();
        return { left: b.left, right: b.right, mapLeft: m.left, mapRight: m.right };
      }, null, { timeout: 4000 }).then(h => h.jsonValue(), () => null);
      if (!r) { await page.mouse.move(2, 2); await page.waitForTimeout(400); }
    }
    if (!s) continue;
    assert.ok(r, `a tap on a country at x ${Math.round(s.x)} opens its tooltip`);
    assert.ok(r.left >= r.mapLeft - 1 && r.right <= r.mapRight + 1, `a tap at x ${Math.round(s.x)}: the tooltip ${Math.round(r.left)}–${Math.round(r.right)} is inside the map ${Math.round(r.mapLeft)}–${Math.round(r.mapRight)}`);
    tapped++;
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => !document.querySelector('.leaflet-tooltip.rt-country-tip'), null, { timeout: 5000 });
  }
  assert.ok(tapped >= 2, `countries to tap across the map (${tapped})`);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.waitForSelector('.detail h2', { timeout: 5000 });
  // The countries follow the theme.
  const [fill, land] = await page.evaluate(() => [document.querySelector('path.rt-country:not(.rt-dot):not(.prp-nodata)').getAttribute('fill'), getComputedStyle(document.documentElement).getPropertyValue('--prp-map-land').trim()]);
  assert.equal(fill, land);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'no sideways scroll at 390 px');
  assert.deepEqual(errors, []);
  // Without the 1:50m file (the CDN down), the circles and the list are as before and nothing fails.
  const bare = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const bareErrors = [];
  bare.on('pageerror', e => bareErrors.push(e.message));
  await bare.route('**/countries-50m.json', r => r.abort());
  await bare.goto(`${BASE}/q/battlefield.html?view=live`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await bare.waitForSelector('.warrow', { timeout: 20000 });
  await bare.waitForTimeout(2000);
  assert.ok(await bare.locator('.leaflet-overlay-pane path.leaflet-interactive').count() >= 100, 'the circles');
  assert.equal(await bare.locator('path.rt-country').count(), 0);
  assert.equal(await bare.locator('#legend .rt-hint').count(), 0, 'no hint about countries that are not there');
  assert.equal(await bare.locator('#countries-credit').isVisible(), false, 'and no credit for shapes that are not drawn');
  assert.doesNotMatch(await bare.locator('.prp-sources').innerText(), /Natural Earth|Tuvalu/);
  assert.deepEqual(bareErrors, []);
});

// MP-12 (Jude, 17 November 2026): the three movement buttons, on the Retrospective Battlefield and on the Realtime
// archive of months (its third button reads "Single Month": "Single Year" would be plainly false on a slider of months).
import { movementCheck } from './tools/movement.mjs';
test('Retrospective: the movement buttons: Move Together moves both handles with the span kept, Single Year shows one year, the address keeps it', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { s0 } = await movementCheck(page, {
    url: '/battlefield/history/#y=1945&f=1939', from: '#from', to: '#year', single: 'Single Year',
    ready: p => p.waitForFunction(() => document.querySelector('#year')?.dataset.value && /\d/.test(document.querySelector('#year-big')?.textContent || ''), null, { timeout: 30000 }),
    readout: p => p.locator('#year-big').innerText(),
    together: (text, s) => text === `${s.from}–${s.to}`, one: (text, s) => text === s.to,
  });
  assert.deepEqual([s0.from, s0.to], ['1939', '1945'], 'an address with no move= opens its period as before');
  assert.deepEqual(errors, []);
});
test('Realtime archive: the movement buttons (Single Month) move both months together, show one month, and the address keeps it', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The archive opens on its last two months; its caption says whether the circles sum a period or show one month.
  // It starts again each January (build-realtime.mjs), so early in a year it holds too few months for every move:
  // `short` leaves those out (second review X1, 20 November 2026; the test below serves three months to prove it).
  const { s0, n } = await movementCheck(page, {
    url: '/q/battlefield.html?view=archive', from: '#month-from', to: '#month', single: 'Single Month', short: true,
    ready: p => p.waitForFunction(() => document.querySelector('#month')?.dataset.value && /Armed-conflict events/.test(document.querySelector('#mapcap')?.textContent || ''), null, { timeout: 30000 }),
    readout: p => p.locator('#mapcap').innerText(),
    together: text => /over the period summed/.test(text), one: text => /one circle per place and month/.test(text),
  });
  if (n >= 2) assert.equal(s0.j - s0.i, 1, 'the archive opens on its last two months, as before');
  assert.deepEqual(errors, []);
});

// The archive in the first months of a year: with three months the pair has no room to go three stops back, and the
// buttons, the address and the caption are still checked (second review X1: the check above would have failed every
// January to April, and stopped every deploy). The months served are the archive's own first three, or all it has when
// it holds fewer (a second review, X1 again: a fixed three could not be served from an archive of one or two months).
test('realtime archive early in a year (three months served at most): the movement buttons work without the room for the longer moves', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let served = 0;
  await page.route('**/battlefield/data/realtime.json*', async route => {
    const r = await route.fetch(), d = await r.json();
    const keep = new Set(d.months.slice(0, 3));
    const trim = x => (Array.isArray(x) ? x.filter(y => !(y && typeof y === 'object' && typeof y.month === 'string' && !keep.has(y.month))).map(trim) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, trim(v)])) : x);
    const out = trim(d); out.months = d.months.slice(0, 3); if (typeof out.latest === 'string') out.latest = out.months.at(-1);
    served = out.months.length;
    await route.fulfill({ response: r, json: out });
  });
  const { s0, n } = await movementCheck(page, {
    url: '/q/battlefield.html?view=archive', from: '#month-from', to: '#month', single: 'Single Month', short: true,
    ready: p => p.waitForFunction(() => document.querySelector('#month')?.dataset.value && /Armed-conflict events/.test(document.querySelector('#mapcap')?.textContent || ''), null, { timeout: 30000 }),
    readout: p => p.locator('#mapcap').innerText(),
    together: text => /over the period summed/.test(text), one: text => /one circle per place and month/.test(text),
  });
  assert.ok(served >= 1 && served <= 3 && n === served, `the months served are the months on the track: ${served} and ${n}`);
  if (n >= 2) assert.deepEqual([s0.i, s0.j], [n - 2, n - 1], 'it opens on its last two months');
  assert.deepEqual(errors, []);
});
