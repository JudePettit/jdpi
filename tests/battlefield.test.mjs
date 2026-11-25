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

// Stage J1 (20 November 2026; Jude, 17 November: "let's use only free data if possible"): places are Wikidata Q-ids,
// never Gleditsch–Ward numbers; the wars of 1926–1945 come from Wikidata by VM's rule; borders are Cliopatria's.
const PLACES = JSON.parse(readFileSync(new URL('../battlefield/history/data/places.json', import.meta.url), 'utf8'));
const sortQ = l => [...l].sort((a, b) => +a.slice(1) - +b.slice(1));
const isQ = q => typeof q === 'string' && /^Q\d+$/.test(q);

test('Retrospective data: wars sit where they were fought, not in every state that sent forces', () => {
  // The finding: the United States had no war on its own territory in 2003 (Iraq, Afghanistan and al-Qaida were all abroad).
  assert.deepEqual(activeIn(2003).filter(w => locIn(w, 2003).includes('Q30')).map(w => w.name), []);
  assert.deepEqual(war('u420').loc, ['Q796']);
  assert.deepEqual(war('u13692').loc, ['Q889']);
  assert.deepEqual(war('u16099').loc, ['Q805']);
  for (const [id, q] of [['u252', 'Q145'], ['u252', 'Q142'], ['u350', 'Q30'], ['u368', 'Q30'], ['u250', 'Q15180'], ['u431', 'Q15180'], ['u323', 'Q43']]) assert.ok(!war(id).loc.includes(q), `${war(id).name} is not in ${q}`);
  // Wars fought on both sides keep both.
  for (const [id, qs] of [['u235', ['Q423', 'Q884']], ['u293', ['Q172640', 'Q180573']], ['u13243', ['Q159', 'Q212']], ['u324', ['Q794', 'Q796']], ['u409', ['Q115', 'Q986']]]) assert.deepEqual(sortQ(war(id).loc), sortQ(qs), war(id).name);
  // The Falklands: the islands, neither Argentina nor Britain.
  assert.deepEqual(war('u346').loc, ['Q9648']);
  // Al-Qaida's war with the United States reached US soil in 2001 only; Hezbollah's with Israel was fought in Lebanon.
  assert.deepEqual(sortQ(locIn(war('u418'), 2001)), ['Q30', 'Q889']);
  assert.ok(!locIn(war('u418'), 2010).includes('Q30'));
  assert.ok(locIn(war('u426'), 2006).includes('Q822'));
  // World War II moves year by year: Germany and Poland in 1939, North Africa and the Pacific later; never New Zealand
  // or South Africa.
  const ww2 = war('Q362');
  assert.deepEqual(sortQ(locIn(ww2, 1939)), ['Q36', 'Q183']);
  for (const q of ['Q79', 'Q1016', 'Q17', 'Q15180', 'Q928', 'Q252']) assert.ok(locIn(ww2, 1942).includes(q) || ww2.statesYears[1942].includes(q), `1942: ${q}`);
  for (const q of ['Q30', 'Q16', 'Q155', 'Q664', 'Q258']) assert.ok(!ww2.loc.includes(q), `World War II not fought in ${q}`);
  assert.equal(Object.keys(ww2.locYears).length, 7);
  // Colonial wars are fought in the colony, civil wars in their own country, not in the states that intervened.
  assert.deepEqual(war('Q46057').loc, ['Q193714']); // Mandatory Palestine (fixer, 20 November 2026)
  assert.deepEqual(war('Q10859').loc, ['Q29']);
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

// J1: the Correlates of War's terms bar commercial use, so none of its records, totals or numbers is kept. The wars of
// 1926–1945 are VM's list from Wikidata (CC0), at level 3, with no battle-death figure; a place is a Q-id.
test('Retrospective data: 1926–1945 is VM’s list from Wikidata; no Correlates of War record, total or number', () => {
  const raw = readFileSync(new URL('../battlefield/history/data/wars.json', import.meta.url), 'utf8');
  assert.equal(HISTORY.format, 'vm-battlefield-wars/2');
  assert.ok(!HISTORY.wars.some(w => w.src === 'cow'), 'no Correlates of War record');
  assert.doesNotMatch(raw, /"src":"cow"|Correlates of War Inter|"deaths"|"gw"|"dots"|CShapes/);
  for (const w of HISTORY.wars) {
    for (const q of [...w.loc, ...w.states, ...Object.values(w.locYears || {}).flat(), ...Object.values(w.statesYears || {}).flat()]) assert.ok(isQ(q), `${w.id}: ${q} is a Q-id`);
    if (w.src === 'ucdp') assert.match(w.id, /^u\d+$/);
    else { assert.equal(w.src, 'wikidata'); assert.equal(w.id, w.q); assert.match(w.id, /^Q\d+$/); assert.ok(w.years.every(([y, l]) => y >= 1926 && y <= 1945 && l === 3), w.id); assert.ok(w.wiki, `${w.id}: its article`); }
  }
  const pre = HISTORY.wars.filter(w => w.years[0][0] < 1946).map(w => w.id);
  for (const q of ['Q362', 'Q10859', 'Q223126', 'Q134949', 'Q94916', 'Q179975', 'Q279662']) assert.ok(pre.includes(q), `${q} is on the list`);
  // Parts of a whole on the list are listed once, as the whole; a gang war and the Cold War are not wars.
  for (const q of ['Q122100', 'Q189266', 'Q780845', 'Q611027', 'Q8683']) assert.ok(!pre.includes(q), `${q} is not listed on its own`);
  assert.match(HISTORY.levels[3], /Wikidata/);
  assert.match(HISTORY.sources.wikidata, /CC0/);
  assert.match(HISTORY.sources.borders, /Cliopatria v0\.2\.1/);
});

test('wars-1926.mjs: VM’s rule picks wars and long rebellions, leaves out coups, short risings and parts of a whole', async () => {
  const { selectWars, tooShort } = await import('../battlefield/scripts/wars-1926.mjs');
  const t = (time, precision = 11) => [{ mainsnak: { datavalue: { value: { time, precision } } } }];
  const ids = l => l.map(q => ({ mainsnak: { datavalue: { value: { id: q } } } }));
  const item = (n, cls, claims = {}) => ({ labels: { en: { value: n } }, sitelinks: { enwiki: { title: n } }, claims: { P31: ids(cls), P17: ids(['Q29']), ...claims } });
  const items = {
    Q1: item('A war', ['Q8465'], { P580: t('+1936-07-17T00:00:00Z'), P582: t('+1939-04-01T00:00:00Z') }),
    Q2: item('Its front', ['Q8465'], { P580: t('+1937-01-01T00:00:00Z'), P582: t('+1938-01-01T00:00:00Z'), P361: ids(['Q1']) }),
    Q3: item('A long rebellion', ['Q124734'], { P580: t('+1930-02-00T00:00:00Z', 10), P582: t('+1930-04-00T00:00:00Z', 10) }),
    Q4: item('A day’s rising', ['Q124734'], { P585: t('+1931-07-13T00:00:00Z') }),
    Q5: item('A coup attempt', ['Q8465', 'Q25906438'], { P585: t('+1932-08-10T00:00:00Z') }),
    Q6: item('A week’s revolt', ['Q6107280'], { P580: t('+1934-10-05T00:00:00Z'), P582: t('+1934-10-12T00:00:00Z') }),
    Q7: item('A war abroad', ['Q8465'], { P17: ids(['Q99999']), P580: t('+1940-01-01T00:00:00Z'), P582: t('+1941-01-01T00:00:00Z') }),
  };
  const { wars, left } = selectWars({ items, things: {}, isPlace: q => q === 'Q29', warTree: new Set(['Q1', 'Q2', 'Q5', 'Q7']) });
  assert.deepEqual(wars.map(w => w.q), ['Q3', 'Q1']);
  const why = q => left.find(l => l.q === q)?.why || '';
  assert.match(why('Q2'), /part of A war/);
  assert.match(why('Q4'), /one date only/);
  assert.match(why('Q5'), /class VM does not count/);
  assert.match(why('Q6'), /8 days/);
  assert.match(why('Q7'), /no state VM can place/);
  assert.equal(tooShort(items.Q3), null);
  // A war VM places by hand (history-fought.mjs) passes the last test.
  assert.deepEqual(selectWars({ items: { Q7: items.Q7 }, things: {}, isPlace: q => q === 'Q29', warTree: new Set(['Q7']), placed: new Set(['Q7']) }).wars.map(w => w.q), ['Q7']);
});

// Fixer (20 November 2026; review finding F3): a location that spans several states (Wikidata's Gran Chaco lies in
// Bolivia, Paraguay, Argentina and Brazil) is named, never spread to every state it spans, so National Analysis does
// not count Argentina as a place of the Chaco War. A location in exactly one state stands for that state. F13: each
// war keeps Wikidata's start and end at their own precision.
test('wars-1926.mjs: a location spanning several states is named, not spread to them; dates keep their precision', async () => {
  const { selectWars, dateAt } = await import('../battlefield/scripts/wars-1926.mjs');
  const t = (time, precision = 11) => [{ mainsnak: { datavalue: { value: { time, precision } } } }];
  const ids = l => l.map(q => ({ mainsnak: { datavalue: { value: { id: q } } } }));
  const items = { Q1: { labels: { en: { value: 'A war in a region' } }, sitelinks: { enwiki: { title: 'A war' } },
    claims: { P31: ids(['Q8465']), P17: ids(['Q750']), P276: ids(['Q900', 'Q901']), P710: ids(['Q750', 'Q733']), P580: t('+1932-09-09T00:00:00Z'), P582: t('+1935-06-00T00:00:00Z', 10) } } };
  const things = { Q900: { labels: { en: { value: 'A region' } }, claims: { P17: ids(['Q750', 'Q733', 'Q414', 'Q155']) } },
    Q901: { labels: { en: { value: 'A town' } }, claims: { P17: ids(['Q733']) } } };
  const { wars } = selectWars({ items, things, isPlace: q => ['Q750', 'Q733', 'Q414', 'Q155'].includes(q), warTree: new Set(['Q1']) });
  assert.deepEqual(wars[0].loc.sort(), ['Q733', 'Q750']);
  assert.deepEqual(wars[0].states.sort(), ['Q733', 'Q750']);
  assert.deepEqual(wars[0].where, ['A region']);
  assert.deepEqual([wars[0].start, wars[0].end], ['1932-09-09', '1935-06']);
  assert.equal(dateAt({ time: '+1940-00-00T00:00:00Z', precision: 9 }), '1940');
});

test('Retrospective data: 1926–1945 places come from Wikidata’s countries, participants and single-state locations; dates at Wikidata’s precision', () => {
  // The Chaco War: Wikidata gives Bolivia as its country and Bolivia and Paraguay as its participants; its location,
  // the Gran Chaco, also spans Argentina and Brazil, which took no part.
  const chaco = war('Q223126'), spain = war('Q10859');
  for (const q of ['Q414', 'Q155']) assert.ok(!chaco.states.includes(q) && !chaco.loc.includes(q), `Chaco War: ${q}`);
  assert.deepEqual(sortQ(chaco.states), ['Q733', 'Q750']);
  // The Spanish Civil War: the Iberian Peninsula does not make Portugal or Andorra a place of the war.
  for (const q of ['Q45', 'Q228']) assert.ok(!spain.states.includes(q), `Spanish Civil War: ${q}`);
  assert.deepEqual([chaco.start, chaco.end], ['1932-09-09', '1935-06-12']);
  assert.deepEqual([war('Q134949').start, war('Q134949').end], ['1939-11-30', '1940-03-13']);
  for (const w of HISTORY.wars.filter(x => x.src === 'wikidata')) {
    assert.match(w.start, /^\d{4}(-\d\d){0,2}$/, `${w.id} start`);
    if (w.end != null) assert.match(w.end, /^\d{4}(-\d\d){0,2}$/, `${w.id} end`);
  }
});

// Fixer (20 November 2026; review findings F2 and P2): a war place no Cliopatria row holds in a year is never drawn on
// Natural Earth's border of today: that is a guessed shape for the year, and it drew states that did not exist yet
// (Israel in 1936 and 1938, for the Arab revolt in Palestine). It is listed under the map. From 1946 a small state UCDP
// names as a party keeps Natural Earth's point (Tonga in Iraq in 2004).
test('Retrospective data: no place is drawn on a border of today; small states as points from 1946 only', () => {
  assert.equal(PLACES.format, 'vm-battlefield-places/2');
  assert.ok(!('fallback' in PLACES), 'no border-of-today fallback');
  for (const [y, o] of Object.entries(PLACES.points)) {
    assert.ok(+y >= HISTORY.ucdpFrom, `points in ${y}`);
    for (const id of Object.values(o)) assert.match(id, /^ne-[A-Z]{3}$/, `${y}: ${id}`);
  }
  assert.equal(PLACES.points[2004].Q678, 'ne-TON');
  // The Arab revolt in Palestine is placed in Mandatory Palestine, which no free border holds, so it is named.
  const revolt = war('Q46057');
  assert.deepEqual(revolt.loc, ['Q193714']);
  for (const y of [1936, 1937, 1938, 1939].filter(y => revolt.years.some(([yy]) => yy === y))) assert.ok(PLACES.unplaced[y].includes('Q193714'), `${y}`);
  // No war is placed in Israel before Israel existed.
  for (const w of HISTORY.wars) for (const [y] of w.years) if (y < 1948) assert.ok(!locIn(w, y).includes('Q801') && !statesIn(w, y).includes('Q801'), `${w.id} ${y}: Israel`);
  // Georgia in 1991 lay inside the Soviet Union's row: named, not drawn on today's border.
  assert.ok(PLACES.unplaced[1991].includes('Q230'));
  // A place founded after 1926 carries its year (Wikidata's inception), so the page calls it today's in an earlier year.
  assert.ok(PLACES.places.Q801.since >= 1948);
});

// Review X1 (21 November 2026): a state with no Cliopatria row of its own in a year is listed as one VM cannot place,
// never drawn on another state's row or on a part's. Occupied Yugoslavia was drawn as the Independent State of Croatia
// in 1941–43 (history-places.mjs AS) and as the Yugoslav Partisans' territory in 1944 (CANONICAL); Palestine as
// Cliopatria's "Gaza/Hamas" from 2014 (ROWS). Each of those rows now stands for no place but its own.
test('Retrospective data: a state with no row of its own is listed as unplaced, never drawn on another state’s row or a part’s', async () => {
  const { placeAt } = await import('../battlefield/scripts/history-places.mjs');
  await import('../design/prp-map.js');
  const M = globalThis.PRPMap;
  const fcs = PLACES.borders.map(f => M.decode(JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))));
  const rowQ = (id, y) => { const r = PLACES.rows[id]; return typeof r === 'string' ? r : (r || []).find(([f, t]) => f <= y && y <= t)?.[2] || null; };
  // The rows of year y drawn as place q (a row's place is kept for the years Cliopatria holds the row).
  const rowsFor = (q, y) => M.sliceAt(fcs[y < 2000 ? 0 : 1], y).map(f => f.id).filter(id => rowQ(id, y) === q);
  const ww2 = war('Q362');
  for (let y = 1941; y <= 1944; y++) {
    assert.equal(placeAt('Q83286', y), 'Q83286', `${y}: Yugoslavia is not drawn under another place`);
    assert.ok(locIn(ww2, y).includes('Q83286'), `${y}: World War II in Yugoslavia, as Wikidata gives it`);
    assert.ok(PLACES.unplaced[y].includes('Q83286'), `${y}: Yugoslavia listed as unplaced`);
  }
  // No row of 1941–1944 is Yugoslavia's: Croatia's rows are Croatia's, the Partisans' row is its own.
  const yugoslavRows = [1941, 1942, 1943, 1944].flatMap(y => rowsFor('Q83286', y).map(id => `${y} ${id}`));
  assert.deepEqual(yugoslavRows, []);
  assert.ok(rowsFor('Q153128', 1942).length, 'the Independent State of Croatia keeps its own rows');
  // Palestine: Cliopatria's "Gaza/Hamas" (2014–2024) is a part of it, so no row is Palestine's.
  for (let y = 1926; y <= PLACES.bordersTo; y++) assert.deepEqual(rowsFor('Q23792', y), [], `${y}: a row drawn as Palestine`);
});

// MP-16 (Jude, 22 November 2026): the crosswalk keys Yugoslavia's earlier states by the later state's item (CANONICAL),
// so the place carried only that item's label, "Socialist Federal Republic of Yugoslavia", in every year from 1926.
// The place now also carries each earlier state's label to the year Wikidata ends it (NAMED_AS, `was`): the Kingdom of
// Serbs, Croats and Slovenes to 1929 and the Kingdom of Yugoslavia to 1945, the pair War Focus holds for its war
// (focus/scripts/wars.mjs nameAs), and the page names the place by the year shown.
test('Retrospective data: Yugoslavia carries its earlier states’ names to 1929 and to 1945, the last as War Focus has it', async () => {
  const { NAMED_AS } = await import('../battlefield/scripts/history-places.mjs');
  assert.deepEqual(NAMED_AS.Q83286, ['Q15102440', 'Q191077']);
  const dated = Object.keys(PLACES.places).filter(q => PLACES.places[q].was);
  assert.deepEqual(dated, sortQ(Object.keys(NAMED_AS)), 'a place carries earlier names only where the table gives them');
  for (const [q, earlier] of Object.entries(NAMED_AS)) {
    const p = PLACES.places[q];
    assert.equal(p.was.length, earlier.length, `${q}: one name for each earlier item`);
    for (const [i, w] of p.was.entries()) {
      const id = Array.isArray(earlier[i]) ? earlier[i][0] : earlier[i];
      assert.ok(!PLACES.places[id], `${id} is not a place of its own`);
      assert.ok(['n,to', 'n,from,to'].includes(Object.keys(w).join()), `${q}: ${Object.keys(w)}`);
      assert.ok(w.n && w.n !== p.n, `${q}: an earlier name is another name`);
      assert.ok(Number.isInteger(w.to) && w.to >= 1926 && w.to < 2025 && (!i || w.to > p.was[i - 1].to), `${q}: ${w.to} in order`);
      if ('from' in w) assert.ok(w.from > (i ? p.was[i - 1].to + 1 : 1926) && w.from <= w.to, `${q}: from ${w.from} leaves a gap`);
    }
  }
  assert.deepEqual(PLACES.places.Q83286, { n: 'Socialist Federal Republic of Yugoslavia', iso3: 'YUG',
    was: [{ n: 'Kingdom of Serbs, Croats and Slovenes', to: 1929 }, { n: 'Kingdom of Yugoslavia', to: 1945 }] });
  const focus = JSON.parse(readFileSync(new URL('../battlefield/focus/data/wars/ww2.json', import.meta.url), 'utf8')).names.Q83286;
  assert.deepEqual(PLACES.places.Q83286.was.at(-1), focus.then, 'one earlier name and one last year in both modules');
  const { nameIn } = await import('../battlefield/scripts/history-places.mjs');
  assert.deepEqual([1926, 1929, 1930, 1945, 1946, 1991].map(y => nameIn(PLACES.places.Q83286, y)), ['Kingdom of Serbs, Croats and Slovenes', 'Kingdom of Serbs, Croats and Slovenes',
    'Kingdom of Yugoslavia', 'Kingdom of Yugoslavia', 'Socialist Federal Republic of Yugoslavia', 'Socialist Federal Republic of Yugoslavia']);
  assert.equal(nameIn(PLACES.places.Q159, 1930), PLACES.places.Q159.n, 'a place with no earlier name keeps its own');
  // The page says so in its Method, and reads the same field.
  const method = readFileSync(new URL('../battlefield/history/index.html', import.meta.url), 'utf8');
  for (const w of [...PLACES.places.Q83286.was.map(w => `${w.n} to ${w.to}`), PLACES.places.Q83286.n]) assert.ok(method.includes(w.replace(/^Kingdom/, 'the Kingdom')) || method.includes(w), `the Method names ${w}`);
  const app = readFileSync(new URL('../battlefield/history/app.js', import.meta.url), 'utf8');
  assert.match(app, /^import \{ placeName \} from '\.\/names\.js';$/m, 'the page reads `was` by the same rule (names.js)');
});

// Review of 22 November 2026 (checked by the main session; built 25 November 2026): the table's "Fought in", a war's
// panel and a country's heading named places by states founded later (the People's Republic of China in 1926–1948,
// Saudi Arabia in 1926–1932), and "today’s Ethiopia" stood under the map in years Ethiopia existed, since Wikidata's
// inception (P571) is for some states a change of regime. NAMED_AS now names the earlier states, each from its own
// Wikidata item (a pair where an item has two ends: the Republic of China's P576 of 1949 for mainland China, not 1971
// for the United Nations); STATE_FROM says when Kuwait's state began; names.js is the one rule for every view.
const DATED = {
  Q115: [{ n: 'Ethiopian Empire', to: 1975 }],
  Q148: [{ n: 'Republic of China', to: 1949 }],
  Q796: [{ n: 'Kingdom of Iraq', to: 1958 }],
  Q822: [{ n: 'State of Greater Lebanon', to: 1926 }, { n: 'Lebanese Republic under French mandate', to: 1943 }],
  Q833: [{ n: 'Malayan Union', from: 1946, to: 1948 }, { n: 'Federation of Malaya', to: 1963 }],
  Q842: [{ n: 'Muscat and Oman', to: 1970 }],
  Q851: [{ n: 'Kingdom of Nejd and Hejaz', to: 1932 }],
  Q854: [{ n: 'Dominion of Ceylon', from: 1948, to: 1972 }],
  Q948: [{ n: 'French protectorate of Tunisia', to: 1956 }],
  Q34754: [{ n: 'British Somaliland', to: 1960 }],
  Q83286: [{ n: 'Kingdom of Serbs, Croats and Slovenes', to: 1929 }, { n: 'Kingdom of Yugoslavia', to: 1945 }],
  Q199841: [{ n: 'Federation of South Arabia', from: 1962, to: 1967 }],
  Q267584: [{ n: 'Kingdom of Yemen', to: 1962 }],
};
// The 28 places named a party to a war in a year before their `since` (the review's list), each decided: an earlier
// state's name (DATED), a state from an earlier year (STATE_FROM), or "today’s …", right for a colony or territory.
const TODAY_RIGHT = ['Q233', 'Q252', 'Q262', 'Q423', 'Q574', 'Q668', 'Q685', 'Q691', 'Q836', 'Q929', 'Q974', 'Q986', 'Q1000', 'Q1019', 'Q1041', 'Q1045', 'Q1049'];
// Every place the page names "today’s …" in a year a war touches it or it stands under the map (second review, 25
// November 2026): the land then was a colony, crown colony, condominium, overseas province, trust territory or a
// protectorate Wikidata gives no state of its own, and each is a state today (none has an end, P576, on Wikidata).
// TODAY_RIGHT; Malaysia and Sri Lanka before their earlier states began (1941–45; British Ceylon, Q918153, crown colony,
// in 1942); and places named only as a war's location: Kenya (Kenya Colony), Cyprus (British Cyprus, Q15240466, crown
// colony), Cambodia (French Protectorate of Cambodia, Q3173090, protectorate only), Laos (history-places.mjs PASSED_OVER),
// Angola, Guinea-Bissau (Portuguese Guinea, Q2002279) and Mozambique (Portuguese overseas provinces), Cameroon (French
// Cameroons) and Mauritania (French West Africa, Q210682). A state that is gone (South Yemen) is never "today’s".
const TODAY_ALL = [...TODAY_RIGHT, 'Q833', 'Q854', 'Q114', 'Q229', 'Q424', 'Q819', 'Q916', 'Q1007', 'Q1009', 'Q1025', 'Q1029'];
const REVIEWED = ['Q115', 'Q148', 'Q233', 'Q252', 'Q262', 'Q423', 'Q574', 'Q668', 'Q685', 'Q691', 'Q796', 'Q817', 'Q822', 'Q833', 'Q836', 'Q842', 'Q854', 'Q929', 'Q948', 'Q974', 'Q986', 'Q1000', 'Q1019', 'Q1041', 'Q1045', 'Q1049', 'Q34754', 'Q267584'];
test('Retrospective data: places are named by the state of the year: the tables’ exact shape, each earlier name and its last year', async () => {
  const { NAMED_AS, STATE_FROM, EARLIER_STATE, PASSED_OVER, isEarlierState, endOf, earlierNames } = await import('../battlefield/scripts/history-places.mjs');
  assert.deepEqual(NAMED_AS, {
    Q115: ['Q207521'], Q148: [['Q13426199', { P518: 'Q19188' }]], Q796: ['Q149805'], Q822: ['Q108865226', 'Q108865218'], Q833: ['Q976099', 'Q1479726'],
    Q842: ['Q157734'], Q851: ['Q1756546'], Q854: ['Q2670092'], Q948: ['Q2017684'], Q34754: ['Q662653'], Q83286: ['Q15102440', 'Q191077'],
    Q199841: ['Q834486'], Q267584: [['Q580188', { P31: 'Q3624078' }]],
  });
  assert.deepEqual(STATE_FROM, { Q817: 'Q3624078' });
  // The rule for an earlier state, as Wikidata's classes (P31): a historical country or a sovereign state, and not a
  // colony, crown colony, condominium, overseas province, League of Nations mandate or UN trust territory. A protectorate
  // Wikidata also calls a historical country is a state (Muscat and Oman, the French protectorate of Tunisia).
  assert.deepEqual(EARLIER_STATE, { is: ['Q3024240', 'Q3624078'], not: ['Q133156', 'Q1351282', 'Q734818', 'Q333542', 'Q426759', 'Q985073'] });
  const p31 = (...qs) => ({ claims: { P31: qs.map(id => ({ rank: 'normal', mainsnak: { datavalue: { value: { id } } } })) } });
  assert.equal(isEarlierState(p31('Q3024240', 'Q164142')), true, 'a protectorate that is a historical country (Tunisia, 1881–1956)');
  assert.equal(isEarlierState(p31('Q3024240', 'Q133156')), false, 'a colony, though a historical country (British rule in Myanmar)');
  assert.equal(isEarlierState(p31('Q164142')), false, 'a protectorate only (British Solomon Islands)');
  // Items that meet the rule and were left out, each with its reason; none is in NAMED_AS.
  assert.deepEqual(Object.keys(PASSED_OVER).sort(), ['Q1320058', 'Q1517772', 'Q704358']);
  for (const [id, [q, why]] of Object.entries(PASSED_OVER)) {
    assert.ok(PLACES.places[q] && why.length > 40, `${id}: its place and reason`);
    assert.ok(!Object.values(NAMED_AS).flat().flat().includes(id), `${id} is not named`);
  }
  // The build stops where a state that is gone (its own item has an end, P576) would be named in a war's year before its
  // inception with no earlier name, since "today’s South Yemen" names a state that is not there today.
  const { goneUnnamed } = await import('../battlefield/scripts/history-places.mjs');
  const yemenWar = [{ years: [[1964, 1], [1972, 1]], loc: ['Q199841'], states: [] }];
  const gone = { claims: { P576: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+1990-05-22T00:00:00Z' } } } }] } };
  assert.deepEqual(goneUnnamed({ Q199841: { n: 'South Yemen', since: 1967 } }, yemenWar, () => gone), [['Q199841', 1964]]);
  assert.deepEqual(goneUnnamed({ Q199841: PLACES.places.Q199841 }, yemenWar, () => gone), []);
  assert.deepEqual(goneUnnamed({ Q199841: { n: 'South Yemen', since: 1967 } }, yemenWar, () => ({ claims: {} })), [], 'a state of today may be "today’s"');
  // Every row of the table is a comment naming its item and property (VM's rule: no name or date without its source).
  const src = readFileSync(new URL('../battlefield/scripts/history-places.mjs', import.meta.url), 'utf8');
  for (const q of [...Object.keys(NAMED_AS), ...Object.keys(STATE_FROM)]) assert.match(src, new RegExp(`^\\s+${q}: .*// .*P(576|582|580)`, 'm'), `${q}: its row names its Wikidata statement`);
  // The build wrote each, and nothing else.
  for (const [q, was] of Object.entries(DATED)) assert.deepEqual(PLACES.places[q].was, was, `${q}: ${PLACES.places[q].n}`);
  assert.deepEqual(Object.keys(PLACES.places).filter(q => 'stateFrom' in PLACES.places[q]), ['Q817']);
  assert.equal(PLACES.places.Q817.stateFrom, 1961);
  assert.equal(PLACES.places.Q817.since, 1991, 'Kuwait keeps its inception (old addresses read it)');
  // The pair says which end is meant: the Republic of China has two, 1949 for mainland China and 1971 for the UN.
  const roc = { labels: { en: { value: 'Republic of China' } }, claims: { P576: [
    { rank: 'normal', mainsnak: { datavalue: { value: { time: '+1949-12-07T00:00:00Z' } } }, qualifiers: { P518: [{ datavalue: { value: { id: 'Q19188' } } }] } },
    { rank: 'normal', mainsnak: { datavalue: { value: { time: '+1971-00-00T00:00:00Z' } } }, qualifiers: { P518: [{ datavalue: { value: { id: 'Q1065' } } }] } }] } };
  assert.equal(endOf('Q13426199', roc), 1971, 'the latest end, which is not meant');
  assert.equal(endOf(['Q13426199', { P518: 'Q19188' }], roc), 1949);
  assert.deepEqual(earlierNames('Q148', { Q13426199: roc }), [{ n: 'Republic of China', to: 1949 }]);
  assert.throws(() => earlierNames('Q148', { Q13426199: { labels: roc.labels, claims: {} } }), /no end/);
  // Each of the 28 is decided once.
  assert.deepEqual(sortQ([...TODAY_RIGHT, ...Object.keys(NAMED_AS).filter(q => q !== 'Q83286'), ...Object.keys(STATE_FROM)].filter(q => REVIEWED.includes(q))), sortQ(REVIEWED));
  assert.equal(new Set([...TODAY_RIGHT, ...Object.keys(NAMED_AS), ...Object.keys(STATE_FROM)]).size, TODAY_RIGHT.length + Object.keys(NAMED_AS).length + Object.keys(STATE_FROM).length);
});

test('Retrospective data: a place’s name of the year: the Republic of China to 1949, Nejd and Hejaz to 1932, never “today’s” for a state that existed', async () => {
  const { placeName } = await import('../battlefield/history/names.js');
  const P = PLACES.places, name = (q, y) => placeName(P[q], y);
  assert.equal(name('Q148', 1930), 'Republic of China');
  for (let y = 1926; y <= 1949; y++) assert.equal(name('Q148', y), 'Republic of China', `${y}`);
  assert.equal(name('Q148', 1950), "People's Republic of China");
  assert.equal(name('Q851', 1927), 'Kingdom of Nejd and Hejaz', 'the Ikhwan Revolt’s first year');
  assert.equal(name('Q851', 1932), 'Kingdom of Nejd and Hejaz');
  assert.equal(name('Q851', 1933), 'Saudi Arabia');
  assert.equal(name('Q115', 1960), 'Ethiopian Empire');
  assert.equal(name('Q115', 1936), 'Ethiopian Empire', 'under the map in 1936, not “today’s Ethiopia”');
  assert.equal(name('Q115', 1976), 'Ethiopia');
  assert.equal(name('Q817', 1990), 'Kuwait');
  assert.equal(name('Q833', 1941), 'today’s Malaysia', 'before the Malayan Union, the land of today');
  assert.equal(name('Q833', 1945), 'today’s Malaysia');
  assert.equal(name('Q833', 1948), 'Malayan Union', 'the year of a change keeps the earlier state’s name');
  assert.equal(name('Q833', 1949), 'Federation of Malaya');
  assert.equal(name('Q833', 1950), 'Federation of Malaya');
  // Lebanon in 1926, the Great Syrian Revolt's year: the State of Greater Lebanon (to 1 September 1926), then the
  // mandate republic.
  assert.equal(name('Q822', 1926), 'State of Greater Lebanon');
  assert.equal(name('Q822', 1927), 'Lebanese Republic under French mandate');
  assert.equal(name('Q822', 1943), 'Lebanese Republic under French mandate');
  assert.equal(name('Q822', 1948), 'Lebanon');
  // A protectorate Wikidata calls a historical country, as Muscat and Oman is.
  assert.equal(name('Q948', 1942), 'French protectorate of Tunisia');
  assert.equal(name('Q948', 1956), 'French protectorate of Tunisia');
  assert.equal(name('Q948', 1957), 'Tunisia');
  assert.equal(name('Q842', 1957), 'Muscat and Oman');
  assert.equal(name('Q34754', 1940), 'British Somaliland');
  // South Yemen is gone (Wikidata ends it in 1990), so it is never "today’s": 1964–67 is the Federation of South Arabia.
  for (const y of [1964, 1965, 1966, 1967]) assert.equal(name('Q199841', y), 'Federation of South Arabia', `${y}`);
  assert.equal(name('Q199841', 1972), 'South Yemen');
  assert.equal(name('Q854', 1942), 'today’s Sri Lanka');
  assert.equal(name('Q854', 1971), 'Dominion of Ceylon');
  assert.equal(name('Q267584', 1948), 'Kingdom of Yemen');
  assert.equal(name('Q267584', 1963), 'Yemen Arab Republic', 'the Republic in its civil war, not the royalists’ Kingdom');
  assert.equal(name('Q1049', 1940), 'today’s Sudan', 'a condominium then: the land of today');
  assert.equal(name('Q83286', 1930), 'Kingdom of Yugoslavia');
  // Every year each of the 28 is in a war before its inception: "today’s …" only where TODAY_RIGHT keeps it, or in a
  // year before its earlier state began (Malaysia in 1941, Sri Lanka in 1942).
  for (const w of HISTORY.wars) for (const [y] of w.years) for (const q of new Set([...locIn(w, y), ...statesIn(w, y)])) {
    if (!REVIEWED.includes(q) || !(P[q].since > y)) continue;
    const n = name(q, y), before = P[q].was?.[0]?.from > y;
    if (TODAY_RIGHT.includes(q) || before) assert.equal(n, `today’s ${P[q].n}`, `${w.id} ${y} ${q}`);
    else assert.doesNotMatch(n, /today’s/, `${w.id} ${y} ${q}: ${n}`);
  }
  // Under the map, by the page's rule: the names of 1936 and 1990.
  const under = y => (PLACES.unplaced[y] || []).map(q => name(q, y));
  assert.ok(under(1936).includes('Ethiopian Empire') && !under(1936).some(n => /Ethiopia$/.test(n)), under(1936).join(', '));
  assert.ok(under(1990).includes('Kuwait') && !under(1990).includes('today’s Kuwait'), under(1990).join(', '));
  // Every place called "today’s …" in any year a war touches it, or under the map, is one reviewed (TODAY_ALL).
  const today = new Set();
  for (const w of HISTORY.wars) for (const [y] of w.years) for (const q of new Set([...locIn(w, y), ...statesIn(w, y), ...(PLACES.unplaced[y] || [])])) {
    if (/^today’s /.test(name(q, y) || '')) today.add(q);
  }
  assert.deepEqual(sortQ([...today]), sortQ(TODAY_ALL));
});

// AC-13 (Jude, 16 November 2026): a UCDP conflict's states were stored once for all its years, so Tonga stood in "Iraq:
// government" for all 35 of its active years. Each conflict keeps its state parties year by year, from UCDP's
// "Government of …" sides, each name read as a Q-id (omni/scripts/ucdp-places.mjs).
const statesIn = (w, y) => (w.statesYears ? w.statesYears[y] || [] : w.states);
test('Retrospective data: each UCDP conflict keeps its state parties year by year, as UCDP’s rows give them', () => {
  for (const w of HISTORY.wars.filter(x => x.src === 'ucdp')) {
    assert.ok(w.statesYears, `${w.id}: parties by year`);
    assert.deepEqual(Object.keys(w.statesYears).map(Number).sort((a, b) => a - b), w.years.map(([y]) => y), `${w.id}: one entry per active year`);
    assert.deepEqual(sortQ(new Set(Object.values(w.statesYears).flat())), sortQ(w.states), `${w.id}: its years make up its states`);
    for (const [y, qs] of Object.entries(w.statesYears)) assert.ok(qs.length && qs.every(isQ), `${w.id} ${y}`);
  }
  // UCDP/PRIO ACD v26.1's rows: Tonga is among side A's secondary parties of "Iraq: government" (u259) in 2004, 2007
  // and 2008, and of "Afghanistan: government" (u333) in 2011–14; Iraq fought alone in 1982; Sweden took part in
  // Afghanistan from 2006 to 2014, and in 1985 the parties were Afghanistan and the Soviet Union.
  const iraq = war('u259'), afghanistan = war('u333'), yearsWith = (w, q) => w.years.map(([y]) => y).filter(y => statesIn(w, y).includes(q));
  assert.deepEqual(yearsWith(iraq, 'Q678'), [2004, 2007, 2008]);
  assert.deepEqual(statesIn(iraq, 1982), ['Q796']);
  assert.ok(!statesIn(iraq, 2006).includes('Q678') && statesIn(iraq, 2006).includes('Q30'), 'u259 in 2006: the United States, not Tonga');
  assert.deepEqual(yearsWith(afghanistan, 'Q678'), [2011, 2012, 2013, 2014]);
  assert.deepEqual(yearsWith(afghanistan, 'Q34'), [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014]);
  assert.deepEqual(sortQ(statesIn(afghanistan, 1985)), ['Q889', 'Q15180']);
});

// Every war-year place is drawn on a Cliopatria row of that year (2025 on 2024's), or, from 1946, as a small state's
// point, or it is listed as one VM cannot place, which the page names under the map (fixer, 20 November 2026: no
// border of today for a past year).
test('Retrospective data: every war-year place is on a Cliopatria row, a small state’s point, or listed as unplaced', async () => {
  await import('../design/prp-map.js');
  const M = globalThis.PRPMap;
  assert.equal(PLACES.format, 'vm-battlefield-places/2');
  assert.deepEqual(PLACES.borders, ['omni/data/borders/1900-1999.topo.json', 'omni/data/borders/2000-2024.topo.json']);
  const rowQ = (id, y) => { const r = PLACES.rows[id]; return typeof r === 'string' ? r : (r || []).find(([f, t]) => f <= y && y <= t)?.[2] || null; };
  const fcs = PLACES.borders.map(f => M.decode(JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))));
  const onRows = new Map();
  const rowsIn = y => {
    const yb = Math.min(y, PLACES.bordersTo);
    if (!onRows.has(yb)) onRows.set(yb, new Set(M.sliceAt(fcs[yb < 2000 ? 0 : 1], yb).map(f => rowQ(f.id, yb)).filter(Boolean)));
    return onRows.get(yb);
  };
  const missing = [];
  for (const w of HISTORY.wars) for (const [y] of w.years) {
    const qs = new Set([...locIn(w, y), ...statesIn(w, y)]);
    if (!qs.size && !w.where?.length) missing.push(`${w.id} ${y} (no place)`);
    for (const q of qs) if (!rowsIn(y).has(q) && !PLACES.points[y]?.[q] && !PLACES.unplaced[y]?.includes(q)) missing.push(`${w.id} ${y} ${q}`);
    for (const q of qs) assert.ok(PLACES.places[q]?.n, `${q} has a name`);
  }
  assert.deepEqual(missing, []);
  // The First Indochina War on Cliopatria's French Indochina, 1946–53.
  for (let y = 1946; y <= 1953; y++) { assert.deepEqual(locIn(war('u216'), y), ['Q185682'], `u216 ${y}`); assert.ok(rowsIn(y).has('Q185682'), `${y}: a row`); }
  assert.equal(war('u216').name, 'Vietnam: Vietnam');
  // Tonga as its point.
  assert.equal(PLACES.points[2004].Q678, 'ne-TON');
  // Germany's and the Soviet Union's rows carry their Q-ids by year (VM's crosswalk, history-places.mjs).
  for (const y of [1938, 1975, 2010]) assert.ok(rowsIn(y).has('Q183'), `Germany ${y}`);
  assert.ok(rowsIn(1950).has('Q15180') && !rowsIn(1995).has('Q15180') && rowsIn(1995).has('Q159'));
  // What VM cannot place is named, and never also drawn that year.
  for (const [y, qs] of Object.entries(PLACES.unplaced)) for (const q of qs) {
    assert.ok(PLACES.places[q].n, q);
    assert.ok(!rowsIn(+y).has(q) && !PLACES.points[y]?.[q], `${y} ${q}`);
  }
});

// The catalogue's copy (integration/data/retrospective-wars.json, from integration/scripts/build-catalog.mjs) names
// each UCDP conflict as wars.json does: a rename here (u216, AC-13) leaves it stale until the catalogue is rebuilt.
test('Retrospective data: the catalogue’s copy names every UCDP conflict as wars.json does', () => {
  const cat = JSON.parse(readFileSync(new URL('../integration/data/retrospective-wars.json', import.meta.url), 'utf8')).records;
  const ucdp = HISTORY.wars.filter(w => w.src === 'ucdp');
  assert.deepEqual(cat.map(r => r.id).filter(id => /^u/.test(id)).sort(), ucdp.map(w => w.id).sort());
  const stale = ucdp.filter(w => cat.find(r => r.id === w.id).name !== w.name).map(w => w.id);
  assert.deepEqual(stale, [], 'run node integration/scripts/build-catalog.mjs');
});

// Addresses written before J1 still open the same view: c=<Gleditsch–Ward number> through UCDP's own rows, and
// w=c<number> (a Correlates of War war) through the wars' Wikipedia titles, or the page says what it cannot show.
test('Retrospective data: the old addresses’ tables (c=365, w=c139) name places and wars on the new list', () => {
  assert.equal(PLACES.oldCountries[2], 'Q30');
  // 365: the Soviet Union in UCDP's rows to 1991, then Russia; the page opens the one of the year shown.
  assert.deepEqual(PLACES.oldCountries[365].map(r => r[2]), ['Q15180', 'Q159']);
  assert.equal(PLACES.oldCountries[645], 'Q796');
  for (const v of Object.values(PLACES.oldCountries)) for (const q of Array.isArray(v) ? v.map(r => r[2]) : [v]) assert.ok(PLACES.places[q], q);
  assert.equal(HISTORY.oldIds.c139, 'Q362');
  assert.equal(HISTORY.oldIds.c718, 'Q10859');
  assert.deepEqual(HISTORY.oldWithin.c145, ['Q362', 'Franco-Thai War']);
  for (const q of Object.values(HISTORY.oldIds)) assert.ok(war(q), q);
  for (const t of Object.values(HISTORY.oldGone)) assert.equal(typeof t, 'string');
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
  // The panel is redrawn a moment after the header's figures: wait until its count is the header's before reading it
  // (on a loaded machine the test once read 1939's count here).
  await page.waitForFunction(() => (document.querySelector('#panel .sub')?.textContent || '').startsWith(document.querySelector('#k-conflicts').textContent + ' armed'));
  const n2025 =+(await page.locator('#panel .sub').innerText()).match(/^(\d+) armed/)[1];
  const red = await page.locator('path.shape[fill="var(--c-war)"]').count();
  const caption = await page.locator('#caption').innerText();
  // A long list shows its first items and opens the rest in a pop-out.
  await page.evaluate(() => { location.hash = '#y=2025&c=Q30'; });
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
  assert.ok(red >= 5, `places at war: ${red}`);
  assert.match(caption, /Cliopatria’s borders end in 2024, so 2025 is drawn on 2024’s/);
  assert.deepEqual(errors, []);
});

// Review of 12 November 2026: the inclusion rules differ before UCDP's first year and after, and only the Method said
// so. The two thresholds stand under the timeline, with the years from the data.
test('Retrospective: the two datasets\' thresholds stand under the timeline, with their years', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1939');
  await page.waitForFunction(() => document.querySelector('#thresholds')?.textContent, null, { timeout: 20000 });
  const line = await page.locator('#thresholds').innerText();
  const below = await page.evaluate(() => document.querySelector('#thresholds').getBoundingClientRect().top >= document.querySelector('#timeline').getBoundingClientRect().bottom - 1);
  const html = await page.content();
  await browser.close();
  const { firstYear: a, ucdpFrom: u, lastYear: b } = HISTORY;
  assert.equal(line, `What is counted: ${a}–${u - 1}, the wars VM lists from Wikidata (no free source codes their size, so smaller conflicts are missing); ${u}–${b}, armed conflicts of 25+ battle deaths in a year (UCDP/PRIO), at war level from 1,000.`);
  assert.ok(below, 'right under the timeline');
  // J1: no Correlates of War, no CShapes, anywhere on the page.
  assert.doesNotMatch(html, /Correlates of War Inter|CShapes|correlatesofwar\.org/);
  assert.deepEqual(errors, []);
});

const fillsOf = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#map .shape')].map(p => [p.dataset.key, p.getAttribute('fill')])));
test('Retrospective: 2003 shades Iraq at war and its invaders as fighting abroad; 1942 shows the war in North Africa and the Pacific', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2003');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const y2003 = await fillsOf(page);
  await page.evaluate(() => { location.hash = '#y=2003&c=Q30'; });
  await page.waitForFunction(() => /^No conflict on its territory in 2003/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const us = await page.locator('#panel .sub').innerText();
  await page.evaluate(() => { location.hash = '#y=1982&w=u346'; });
  await page.waitForSelector('#panel h2');
  const falklands = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=1942'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1942');
  await page.waitForFunction(() => document.querySelector('#map .shape[data-key="Q79"]') && !document.querySelector('#unplaced').hidden);
  const y1942 = await fillsOf(page);
  const unplaced1942 = await page.locator('#unplaced').innerText();
  await browser.close();
  assert.equal(y2003.Q796, 'var(--c-war)');
  for (const q of ['Q30', 'Q145', 'Q408']) assert.equal(y2003[q], 'var(--c-abroad)', `2003: ${q}`);
  assert.match(us, /fighting in \d+ abroad/);
  assert.match(falklands, /over territory in (the )?Falkland Islands/);
  // 1942: World War II, a war on VM's list from Wikidata, in its own colour: Egypt, the Soviet Union, China and the
  // Dutch East Indies. Libya, the Philippines and Burma lay in empires Cliopatria draws as one: named, not drawn on a
  // border of today (fixer, 20 November 2026); Burma as today's Myanmar, a state from 1948.
  for (const q of ['Q79', 'Q15180', 'Q148', 'Q252']) assert.equal(y1942[q], 'var(--c-listed)', `1942: ${q}`);
  for (const q of ['Q1016', 'Q928', 'Q836']) assert.equal(y1942[q], undefined, `1942: ${q} is not drawn`);
  assert.match(unplaced1942, /^VM cannot place this on a free border for 1942: .*Libya.*Philippines.*today’s Myanmar/);
  assert.deepEqual(errors, []);
});

test('Retrospective: a period of years shows every conflict active in it at its peak; the end handle pulled onto the start gives one year', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1942');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const atWar = () => page.locator('path.shape[fill="var(--c-war)"], path.shape[fill="var(--c-listed)"]').count();
  const red1942 = await atWar();
  await page.evaluate(() => { location.hash = '#y=1945&f=1939'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '1939–1945');
  const period = {
    label: (await page.locator('#year-label').textContent()).trim(), // textContent: the CSS upper-cases it
    sub: await page.locator('#panel .sub').innerText(),
    red: await atWar(),
    card: (await page.locator('#panel .war[data-id] .lvl').first().textContent()).trim(),
    handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()],
  };
  // A redraw (a country chosen) keeps the period in the address.
  await page.evaluate(() => { location.hash = '#y=1945&f=1939&c=Q30'; });
  await page.waitForFunction(() => /on its territory in 1939–1945/.test(document.querySelector('#panel .sub')?.textContent || ''));
  const kept = page.url();
  // The end handle pulled back onto the start: one year again, the start at rest, and no f in the address.
  await page.locator('#year').fill('1939');
  await page.locator('#year').dispatchEvent('input');
  const one = { big: await page.locator('#year-big').innerText(), url: page.url(), handles: [await page.locator('#from').inputValue(), await page.locator('#year').inputValue()] };
  await browser.close();
  assert.equal(period.label, 'Period');
  assert.match(period.sub, /^\d+ wars on VM’s list from Wikidata; no free source codes their size$/);
  assert.ok(period.red >= red1942, `places at war 1939–1945: ${period.red}; 1942: ${red1942}`);
  assert.equal(period.card, 'Listed war · 1939–45 · 7 yrs'); // World War II leads: on VM's list, active in all seven years
  assert.deepEqual(period.handles, ['1939', '1945']);
  assert.match(kept, /#y=1945&f=1939&c=Q30$/);
  assert.equal(one.big, '1939');
  assert.match(one.url, /#y=1939&c=Q30$/);
  assert.deepEqual(one.handles, ['1939', '1939']);
  assert.deepEqual(errors, []);
});

// A reader's review (22 Nov 2026) caught that in the years before 1946 every conflict was counted "at war level",
// although the page says no source codes a listed war's size.
test('Retrospective: a listed war is never counted "at war level"', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1930&v=table');
  try {
    const text = sel => page.locator(sel).first().textContent().then(t => t.trim());
    const go = async (hash, big) => {
      await page.evaluate(h => { location.hash = h; }, hash);
      await page.waitForFunction(b => document.querySelector('#year-big').textContent === b, big);
    };
    await page.waitForSelector('#table-rows tr[data-id]', { timeout: 20000 });
    // 1930: only wars on VM's list from Wikidata, so the counter says "Listed wars" and counts them all.
    assert.equal(await text('#k-wars-label'), 'Listed wars');
    assert.equal(await text('#k-wars'), await text('#k-conflicts'));
    assert.match(await text('#panel .sub'), /^\d+ wars? on VM’s list from Wikidata; no free source codes their size$/);
    // 1950: UCDP/PRIO's record, whose war level is a measured size.
    await go('#y=1950&v=table', '1950');
    assert.equal(await text('#k-wars-label'), 'At war level');
    assert.match(await text('#panel .sub'), /^\d+ armed conflicts, \d+ at war level$/);
    assert.notEqual(await text('#k-wars'), await text('#k-conflicts'), 'not every conflict of 1950 reached war level');
    // A period across 1946 holds both kinds, counted apart.
    await go('#y=1950&f=1940&v=table', '1940–1950');
    assert.equal(await text('#k-wars-label'), 'Wars');
    const mixed = /^(\d+) armed conflicts: (\d+) at war level at some point, (\d+) listed wars? of no coded size$/.exec(await text('#panel .sub'));
    assert.ok(mixed, 'the summary counts the two kinds apart');
    // The counts themselves, against the table's own level column: a listed war is in neither "at war level" figure.
    const [n, war, listed] = mixed.slice(1).map(Number), rows = l => page.locator(`#table-rows tr[data-id] .lvl.l${l}`).count();
    assert.deepEqual([war, listed, n], [await rows(2), await rows(3), await page.locator('#table-rows tr[data-id]').count()]);
    assert.ok(war > 0 && listed > 0 && n > war + listed, `1940–1950 holds wars, listed wars and minor conflicts: ${n}, ${war}, ${listed}`);
    assert.equal(await text('#k-wars'), String(war + listed));
    assert.equal(await text('#k-conflicts'), String(n));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// AC-13: what pointing at a country says follows the year shown: that year's parties, and when it has no conflict, one
// sentence naming the record that year belongs to (design/prp-mapkit.js's sentence).
const tipOf = (page, key) => page.evaluate(key => {
  const el = document.querySelector(`#map .shape[data-key="${key}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return document.querySelector('#tooltip').textContent;
}, key);
test('Retrospective: pointing at a country gives the year’s parties, or one sentence naming the record', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1985');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    const sweden1985 = await tipOf(page, 'Q34');
    assert.ok(sweden1985 && !sweden1985.includes('Afghanistan: government'), `Sweden 1985: ${sweden1985}`);
    const go = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(t => document.querySelector('#year-big').textContent === t, h.includes('&f=') ? `${h.match(/f=(\d+)/)[1]}–${h.match(/y=(\d+)/)[1]}` : h.match(/y=(\d+)/)[1]); await page.waitForTimeout(300); };
    await go('#y=2010');
    assert.match(await tipOf(page, 'Q34'), /Afghanistan: government/);
    await go('#y=1932');
    assert.equal(await tipOf(page, 'Q800'), 'Costa Rica: no war recorded by VM’s list of wars from Wikidata in 1932.');
    await go('#y=1990');
    assert.equal(await tipOf(page, 'Q800'), 'Costa Rica: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990.');
    // A period across 1946 names both records.
    await go('#y=1947&f=1944');
    assert.equal(await tipOf(page, 'Q39'), 'Switzerland: no war recorded by VM’s list of wars from Wikidata from 1944 to 1945, and no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO from 1946 to 1947.');
    // Its panel repeats it, and names the border it is drawn on.
    await page.evaluate(() => { location.hash = '#y=1990&c=Q800'; });
    await page.waitForFunction(() => /^Costa Rica: no armed conflict/.test(document.querySelector('#panel .sub')?.textContent || ''));
    assert.match(await page.locator('#panel .border-note').innerText(), /^Border: Cliopatria’s “.+” for 1990\.$/);
    // Vietnam is at war through the First Indochina War, on Cliopatria's French Indochina.
    await go('#y=1950');
    assert.equal(await page.evaluate(() => document.querySelector('#map path.shape[data-key="Q185682"]')?.getAttribute('fill')), 'var(--c-war)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// J1, then the fixer (20 November 2026; review findings F2, P2, P7 and F13): a war place with no Cliopatria row in a
// year is named under the map, never drawn on Natural Earth's border of today; from 1946 a small state is its point;
// the caption says borders are by the year; a Wikidata war gives its dates at their precision; old addresses
// (c=<number>, w=c<number>) open the same view or say what they cannot show.
test('Retrospective: places off Cliopatria’s rows are named, never drawn on today’s border; old addresses still open', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2008');
  try {
    await page.waitForSelector('#panel .war', { timeout: 20000 });
    const go = async (h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done, null, { timeout: 10000 }); };
    // Tonga, a party in Iraq in 2008, as Natural Earth's point.
    await page.waitForSelector('#map circle.dot[data-key="Q678"]');
    assert.equal(await page.locator('#map circle.dot[data-key="Q678"]').getAttribute('fill'), 'var(--c-abroad)');
    await go('#y=2008&c=Q678', () => document.querySelector('#panel h2')?.textContent === 'Tonga');
    assert.match(await page.locator('#panel').innerText(), /Drawn as a point \(Natural Earth\)/);
    // Georgia in 1991, inside the Soviet Union's row: named, not drawn.
    await go('#y=1991&c=Q230', () => document.querySelector('#panel h2')?.textContent === 'Georgia');
    assert.equal(await page.locator('#map path.shape[data-key="Q230"]').count(), 0);
    assert.equal(await page.locator('#panel .border-note').innerText(), 'VM cannot place Georgia on a free border for 1991, so it is not drawn.');
    assert.match(await page.locator('#unplaced').innerText(), /^VM cannot place this on a free border for 1991: .*Georgia/);
    // 1967: South Vietnam and South Yemen, which no free border holds that year, named under the map, and Angola, then
    // a Portuguese colony, as today's Angola. South Yemen began 1967 as the Federation of South Arabia (Wikidata ends it
    // on 30 November 1967), so the year keeps that name (second review, 25 November 2026).
    await go('#y=1967', () => !document.querySelector('#unplaced').hidden);
    assert.match(await page.locator('#unplaced').innerText(), /^VM cannot place this on a free border for 1967: Federation of South Arabia, South Vietnam,.*today’s Angola/);
    await go('#y=2000', () => document.querySelector('#unplaced').hidden);
    // 1938: the Arab revolt in Palestine is in Mandatory Palestine, named; nothing is drawn as Israel, which came in
    // 1948. The caption says the borders are one a year.
    await go('#y=1938', () => /1938/.test(document.querySelector('#unplaced').textContent));
    assert.equal(await page.locator('#map [data-key="Q801"], #map [data-key="Q23792"]').count(), 0);
    assert.match(await page.locator('#unplaced').innerText(), /Mandatory Palestine/);
    assert.match(await page.locator('#caption').innerText(), /One border a year, in Cliopatria’s sample years: the map cannot show a border that changed within a year\./);
    assert.equal(await page.locator('.legend').innerText().then(t => /today’s border/.test(t)), false);
    // 1941: the land of today's Malaysia, named as such.
    await go('#y=1941', () => /1941/.test(document.querySelector('#unplaced').textContent));
    assert.match(await page.locator('#unplaced').innerText(), /today’s Malaysia/);
    // The Chaco War's dates, to the day as Wikidata gives them.
    await go('#y=1933&w=Q223126', () => document.querySelector('#panel h2')?.textContent === 'Chaco War');
    assert.match(await page.locator('#panel').innerText(), /from 9 September 1932 to 12 June 1935/);
    // Old addresses: UCDP's number for the Soviet Union (365) in 1985, and for Russia in 2000; a Correlates of War war.
    await page.goto(`${BASE}/battlefield/history/#y=1985&c=365`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Soviet Union', null, { timeout: 20000 });
    await page.goto(`${BASE}/battlefield/history/#y=2000&c=365`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Russia', null, { timeout: 20000 });
    await page.goto(`${BASE}/battlefield/history/#y=1939&w=c139`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'World War II', null, { timeout: 20000 });
    assert.match(await page.locator('#panel').innerText(), /Wikidata lists World War II as a world war/);
    await page.goto(`${BASE}/battlefield/history/#y=1940&w=c145`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /part of World War II, shown here/.test(document.querySelector('#panel .old-address')?.textContent || ''), null, { timeout: 20000 });
    await page.goto(`${BASE}/battlefield/history/#y=1929&w=c118`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Sino-Soviet conflict \(1929\).*does not hold it/.test(document.querySelector('#panel .old-address')?.textContent || ''), null, { timeout: 20000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// MP-16 (Jude, 22 November 2026): Yugoslavia was named "Socialist Federal Republic of Yugoslavia" in every year,
// 1927, 1930 and 1941 among them. To 1929 it is the Kingdom of Serbs, Croats and Slovenes and to 1945 the Kingdom of
// Yugoslavia, each Wikidata's label for the state of those years: in the pointer's sentence, the panel's heading,
// its border line, the line under the map, a war's places and the search; after 1945 it keeps the later state's name.
test('Retrospective: Yugoslavia has its name of the year: two kingdoms to 1929 and 1945, the Socialist Federal Republic after', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1930');
  try {
    await page.waitForSelector('#map path.shape[data-key="Q83286"]', { timeout: 20000 });
    const go = async (h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done, null, { timeout: 10000 }); };
    assert.equal(await tipOf(page, 'Q83286'), 'Kingdom of Yugoslavia: no war recorded by VM’s list of wars from Wikidata in 1930.');
    await go('#y=1930&c=Q83286', () => document.querySelector('#panel h2')?.textContent === 'Kingdom of Yugoslavia');
    assert.match(await page.locator('#panel .sub').innerText(), /^Kingdom of Yugoslavia: no war recorded/);
    // 1927 and 1929: the Kingdom of Serbs, Croats and Slovenes, which took the name Yugoslavia in October 1929.
    await go('#y=1927&c=Q83286', () => document.querySelector('#year-big').textContent === '1927' && document.querySelector('#panel h2')?.textContent !== 'Kingdom of Yugoslavia');
    assert.equal(await page.locator('#panel h2').innerText(), 'Kingdom of Serbs, Croats and Slovenes');
    assert.equal(await tipOf(page, 'Q83286'), 'Kingdom of Serbs, Croats and Slovenes: no war recorded by VM’s list of wars from Wikidata in 1927.');
    await go('#y=1929&c=Q83286', () => document.querySelector('#year-big').textContent === '1929');
    assert.equal(await page.locator('#panel h2').innerText(), 'Kingdom of Serbs, Croats and Slovenes');
    // 1941: occupied, on no row of its own, so it is named under the map and in its panel, as the Kingdom.
    await go('#y=1941&c=Q83286', () => /1941/.test(document.querySelector('#unplaced').textContent) && document.querySelector('#panel .border-note'));
    assert.equal(await page.locator('#panel h2').innerText(), 'Kingdom of Yugoslavia');
    assert.equal(await page.locator('#panel .border-note').innerText(), 'VM cannot place Kingdom of Yugoslavia on a free border for 1941, so it is not drawn.');
    const under = await page.locator('#unplaced').innerText();
    assert.match(under, /Kingdom of Yugoslavia/);
    assert.doesNotMatch(under, /Socialist Federal Republic|today’s Kingdom/);
    // World War II's own panel lists its places by the names of the year the war began.
    await go('#y=1941&w=Q362', () => document.querySelector('#panel h2')?.textContent === 'World War II');
    const ww2 = await page.locator('#panel').innerText();
    assert.match(ww2, /Kingdom of Yugoslavia/);
    assert.doesNotMatch(ww2, /Socialist Federal Republic of Yugoslavia/);
    // 1945 is the Kingdom's last year; from 1946 the place has the later state's name.
    await go('#y=1945&c=Q83286', () => document.querySelector('#year-big').textContent === '1945' && document.querySelector('#panel h2'));
    assert.equal(await page.locator('#panel h2').innerText(), 'Kingdom of Yugoslavia');
    await go('#y=1946&c=Q83286', () => document.querySelector('#year-big').textContent === '1946' && document.querySelector('#panel h2')?.textContent !== 'Kingdom of Yugoslavia');
    assert.equal(await page.locator('#panel h2').innerText(), 'Socialist Federal Republic of Yugoslavia');
    await go('#y=1991&c=Q83286', () => document.querySelector('#year-big').textContent === '1991' && document.querySelector('#panel .war'));
    assert.equal(await page.locator('#panel h2').innerText(), 'Socialist Federal Republic of Yugoslavia');
    assert.doesNotMatch(await page.locator('#panel').innerText(), /Kingdom of Yugoslavia/);
    // The search finds the place by either name, and each opens in a year of that name.
    const pick = async text => {
      await page.fill('#search', text);
      await page.waitForFunction(() => !document.querySelector('#search-results').hidden);
      const first = await page.locator('#search-results li').first().innerText();
      await page.locator('#search').press('Enter');
      return first;
    };
    await go('#y=2025', () => document.querySelector('#year-big').textContent === '2025');
    assert.match(await pick('kingdom of yugo'), /^Kingdom of Yugoslavia\s*Country · to 1945$/);
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Kingdom of Yugoslavia', null, { timeout: 10000 });
    // It opens in a year the Kingdom is drawn: 1945, not 1941 (the first war year, when it is on no row and not drawn).
    assert.equal(await page.locator('#year-big').innerText(), '1945');
    await page.waitForSelector('#map path.shape[data-key="Q83286"]', { timeout: 10000 });
    assert.match(await page.locator('#panel .border-note').innerText(), /^Border: Cliopatria’s “.+” for 1945\.$/, 'drawn on a border in the year the search opens, with no “cannot place” note');
    await go('#y=2025', () => document.querySelector('#year-big').textContent === '2025');
    assert.match(await pick('socialist federal'), /^Socialist Federal Republic of Yugoslavia\s*Country · YUG$/);
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Socialist Federal Republic of Yugoslavia', null, { timeout: 10000 });
    assert.ok(+(await page.locator('#year-big').innerText()) > 1945);
    await page.waitForSelector('#map path.shape[data-key="Q83286"]', { timeout: 10000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Review of 22 November 2026: the table's "Fought in", a war's panel and a country's heading named China by the People's
// Republic in 1930 and Saudi Arabia before 1932, and "today’s Ethiopia" stood under the map in 1936. Every view names a
// place by the year shown through one function (names.js placeName).
test('Retrospective: every view names a place by the state of the year: the Republic of China in 1930 and 1949, Nejd and Hejaz to 1932, Ethiopia and Kuwait never “today’s”', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1930&v=table');
  try {
    const go = async (h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done, null, { timeout: 10000 }); await page.waitForTimeout(200); };
    const fought = id => page.locator(`#table-rows tr[data-id="${id}"] td.wrap`).textContent();
    await page.waitForFunction(() => !!document.querySelector('#table-rows tr[data-id="Q717809"]'), null, { timeout: 20000 });
    // The table, 1930: the Central Plains War in the Republic of China; the Ikhwan Revolt in the Kingdom of Nejd and Hejaz.
    assert.equal(await fought('Q717809'), 'Republic of China');
    assert.equal(await fought('Q3938020'), 'Kingdom of Nejd and Hejaz');
    const all1930 = (await page.locator('#table-rows').textContent());
    assert.doesNotMatch(all1930, /People's Republic of China|Saudi Arabia/);
    // 1949 is the Republic of China's last year (Wikidata's end for mainland China); 1950 is the People's Republic's.
    await go('#y=1949&v=table', () => /1949/.test(document.querySelector('#table-title').textContent) && !!document.querySelector('#table-rows tr[data-id="u202"]'));
    assert.equal(await fought('u202'), 'Republic of China');
    await go('#y=1950&v=table', () => /1950/.test(document.querySelector('#table-title').textContent) && !!document.querySelector('#table-rows tr[data-id="u232"]'));
    assert.match(await fought('u232'), /^People's Republic of China, Taiwan$/);
    // A war's panel: the Central Plains War, fought in the Republic of China.
    await go('#y=1930&w=Q717809&v=map', () => document.querySelector('#panel h2')?.textContent === 'Central Plains War');
    const panel = await page.locator('#panel').innerText();
    assert.match(panel, /fought in Republic of China/);
    assert.doesNotMatch(panel, /People's Republic/);
    // A country's heading and the pointer's sentence.
    await go('#y=1930&c=Q148', () => document.querySelector('#panel h2')?.textContent === 'Republic of China');
    await page.waitForSelector('#map path.shape[data-key="Q148"]');
    assert.match(await tipOf(page, 'Q148'), /^Republic of China/);
    await go('#y=1932&c=Q851', () => document.querySelector('#year-big').textContent === '1932' && document.querySelector('#panel h2')?.textContent === 'Kingdom of Nejd and Hejaz');
    assert.match(await tipOf(page, 'Q851'), /^Kingdom of Nejd and Hejaz: no war recorded/);
    await go('#y=1933&c=Q851', () => document.querySelector('#year-big').textContent === '1933' && document.querySelector('#panel h2')?.textContent === 'Saudi Arabia');
    // Ethiopia in 1960 and, occupied, in 1936: the Ethiopian Empire, under the map and in its panel; never "today’s".
    await go('#y=1960&c=Q115', () => document.querySelector('#year-big').textContent === '1960' && document.querySelector('#panel h2')?.textContent === 'Ethiopian Empire');
    await go('#y=1936&c=Q115', () => /1936/.test(document.querySelector('#unplaced').textContent) && document.querySelector('#panel .border-note'));
    assert.match(await page.locator('#unplaced').innerText(), /Ethiopian Empire/);
    assert.equal(await page.locator('#panel .border-note').innerText(), 'VM cannot place Ethiopian Empire on a free border for 1936, so it is not drawn.');
    // Kuwait in 1990, a state since 1961 (Wikidata), though its item's inception is the liberation of 1991.
    await go('#y=1990&c=Q817', () => /1990/.test(document.querySelector('#unplaced').textContent) && document.querySelector('#panel .border-note'));
    assert.equal(await page.locator('#panel .border-note').innerText(), 'VM cannot place Kuwait on a free border for 1990, so it is not drawn.');
    assert.match(await page.locator('#unplaced').innerText(), /Kuwait/);
    // Nothing on the page says "today’s" of Ethiopia or Kuwait, in any of those years.
    for (const h of ['#y=1936', '#y=1960&v=table', '#y=1990', '#y=1990&w=u371']) {
      await go(h, () => !!document.querySelector('#panel h2'));
      assert.doesNotMatch(await page.locator('body').innerText(), /today’s (Ethiopia|Kuwait)/, h);
    }
    // A colony is still the land of today: Algeria in 1955, in the table and under the map.
    await go('#y=1955&v=table', () => /1955/.test(document.querySelector('#table-title').textContent) && !!document.querySelector('#table-rows tr[data-id="u246"]'));
    assert.equal(await fought('u246'), 'today’s Algeria');
    assert.match(await page.locator('#table-unplaced').innerText(), /today’s Algeria/);
    // A war's panel names each place by the first year it is in the war (second review, 25 November 2026): Serbia's war
    // in Croatia was in Yugoslavia in 1991 and in the Federal Republic of Yugoslavia in 1992, neither "today’s".
    await go('#y=1991&w=u385', () => document.querySelector('#panel h2')?.textContent === 'Serbia (Yugoslavia): Croatia');
    const u385 = await page.locator('#panel').innerText();
    assert.match(u385, /in Socialist Federal Republic of Yugoslavia, Federal Republic of Yugoslavia, active/);
    assert.doesNotMatch(u385, /today’s/);
    await go('#y=1990&w=u230', () => document.querySelector('#panel h2')?.textContent === 'Yemen (North Yemen): government');
    assert.match(await page.locator('#panel').innerText(), /in Kingdom of Yemen, Yemen, active/);
    // South Yemen, a state that is gone, is never "today’s": 1964 is the Federation of South Arabia.
    await go('#y=1964&w=u286', () => document.querySelector('#panel h2')?.textContent === 'South Yemen: Aden/South Yemen');
    assert.match(await page.locator('#panel').innerText(), /in Federation of South Arabia, active/);
    await go('#y=1964&c=Q199841', () => document.querySelector('#year-big').textContent === '1964' && document.querySelector('#panel h2')?.textContent === 'Federation of South Arabia');
    assert.doesNotMatch(await page.locator('body').innerText(), /today’s South Yemen/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Review X2 (21 November 2026): an old country number UCDP gave two states (places.json oldCountries, dated runs) in a
// year between its runs opened the last run: c=678 in 1988 opened today's Yemen, which places.json dates from 1990. In
// a gap the later state is opened from its inception (Wikidata's, `since`), the earlier one before it.
test('Retrospective: an old country number in a year between its two states opens the state of that year', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const h2 = async hash => {
      await page.goto(`${BASE}/battlefield/history/${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#panel h2') && document.querySelector('#panel .sub'), null, { timeout: 20000 });
      return page.locator('#panel h2').innerText();
    };
    const { places } = PLACES;
    assert.equal(await h2('#y=1988&c=678'), places.Q267584.n, '678 in 1988: North Yemen, before the united Yemen of 1990');
    assert.equal(await h2('#y=1991&c=678'), places.Q805.n, '678 in 1991: Yemen');
    assert.equal(await h2('#y=1982&c=552'), places.Q954.n, '552 in 1982: Zimbabwe, a state from 1980');
    assert.equal(await h2('#y=1992&c=365'), places.Q159.n, '365 in 1992: Russia');
    await page.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// Review X3 (21 November 2026): the line naming what VM cannot place on a free border stood only under the map. The
// table view carries the same line, and a war's panel names its own places VM cannot place in the years shown.
test('Retrospective: the table view and a war’s panel say what VM cannot place, as the map does, without sideways scroll at 360 px', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    for (const width of [1400, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${BASE}/battlefield/history/#y=1938&w=Q46057&v=table`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#panel h2') && document.querySelector('#table-rows tr[data-id="Q46057"]'), null, { timeout: 20000 });
      await page.waitForFunction(() => !document.querySelector('#table-unplaced')?.hidden, null, { timeout: 10000 });
      const table = await page.locator('#table-unplaced').innerText();
      const panel = await page.locator('#panel .unplaced-note').innerText();
      // The map's own line, for the same year, word for word.
      await page.locator('#tab-map').click();
      await page.waitForFunction(() => !document.querySelector('#unplaced').hidden);
      const map = await page.locator('#unplaced').innerText();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.match(table, /^VM cannot place this on a free border for 1938: .*Mandatory Palestine/, `${width}: table`);
      assert.equal(table, map, `${width}: one line for the table and the map`);
      assert.equal(panel, 'VM cannot place this on a free border for 1938: Mandatory Palestine.', `${width}: the war’s panel`);
      assert.doesNotMatch(table + panel, /'/, 'the typographic apostrophe only');
      assert.ok(scroll <= 1, `${width}: no sideways scroll (${scroll} px)`);
      assert.equal(await page.locator('#table-unplaced button, #panel .unplaced-note button').count(), 0, 'a line of text, no button');
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

// Review of AC-13 (17 November 2026): a selected war's outline and "Fighting abroad" follow the year; Documentary focus
// reaches a point; a war's panel names each place once; a state's list of all its conflicts counts a war on its
// territory as the year's list does.
test('Retrospective: outlines, "Fighting abroad" and focus follow the year and reach the points; places are named once', pageTest, async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=2004&w=u259');
  try {
    await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Iraq: government', null, { timeout: 20000 });
    const cls = q => page.evaluate(q => document.querySelector(`#map circle.dot[data-key="${q}"]`)?.getAttribute('class') || '', q);
    const go = async (h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done); await page.waitForTimeout(200); };
    assert.match(await cls('Q678'), /\binvolved\b/, 'Tonga outlined in u259 in 2004');
    // In a year when the selected war was not active only its places are outlined, not the parties of its other years.
    await go('#y=2003&w=u259', () => document.querySelector('#year-big').textContent === '2003');
    assert.doesNotMatch(await cls('Q678'), /\binvolved\b/, 'Tonga not outlined in u259 in 2003');
    assert.ok(await page.locator('#map .involved').count() >= 1, 'the war\'s own place is still outlined');
    // A period's table names a place as it was called in the years of the fighting: u210, in the Soviet Union.
    await go('#y=2025&f=1946&v=table', () => /1946/.test(document.querySelector('#table-title').textContent) && !!document.querySelector('#table-rows tr[data-id="u210"]'));
    const fought = await page.locator('#table-rows tr[data-id="u210"] td.wrap').textContent();
    assert.match(fought, /Soviet Union/);
    assert.doesNotMatch(fought, /Russia/);
    // A ringed point is drawn larger than a plain one, so its fill still shows.
    await go('#y=2004&w=u259&v=map', () => document.querySelector('#year-big').textContent === '2004' && !!document.querySelector('#map circle.dot[data-key="Q678"]'));
    const r = await page.evaluate(() => [...document.querySelectorAll('#map circle.dot')].map(c => [c.classList.contains('involved'), +c.getAttribute('r')]));
    const ringed = r.filter(([i]) => i).map(([, x]) => x), plain = r.filter(([i]) => !i).map(([, x]) => x);
    if (plain.length) assert.ok(Math.min(...ringed) > Math.max(...plain), JSON.stringify(r));
    // Tonga's panel: "Fighting abroad" in 2008.
    await go('#y=2008&c=Q678', () => document.querySelector('#panel h2')?.textContent === 'Tonga' && document.querySelector('#year-big').textContent === '2008');
    assert.match(await page.locator('#panel').textContent(), /Fighting abroad in 2008[\s\S]*Iraq: government/);
    // Documentary focus on a point, by ISO3 and by Q-id.
    for (const detail of [{ countries: ['TON'] }, { qids: ['Q678'] }]) {
      await page.evaluate(d => window.dispatchEvent(new CustomEvent('prp:focus', { detail: d })), detail);
      await page.waitForFunction(() => document.querySelector('#map circle.dot[data-key="Q678"]')?.classList.contains('prp-focus-hit'), null, { timeout: 5000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { reset: true } })));
    }
    // A war's panel names each place once.
    await go('#y=1993&w=u380', () => document.querySelector('#panel h2')?.textContent === 'Georgia: government');
    const intro = await page.locator('#panel > p:not(.sub)').first().textContent();
    assert.match(intro, /over government in Georgia, active in \d+ years/);
    assert.doesNotMatch(intro, /Soviet Union/);
    // Russia in 1993: Georgia's war is not on its territory; the Soviet Union's list of all conflicts holds the wars
    // on its territory as the year's list does.
    await go('#y=1991&c=Q15180', () => /on its territory in 1991/.test(document.querySelector('#panel .sub')?.textContent || '') || /^No conflict/.test(document.querySelector('#panel .sub')?.textContent || ''));
    await page.locator('#panel [data-more]').last().click();
    await page.waitForSelector('#modal:not([hidden]) .war');
    assert.ok(await page.locator('#modal .war').count() > 3, 'listed among all its conflicts');
    await page.locator('#modal-close').click();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Retrospective: the key and the frame hide no point, at a tablet’s width and a phone’s', pageTest, async () => {
  const browser = await launch();
  try {
    for (const [width, height] of [[1024, 768], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${BASE}/battlefield/history/#y=2008`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#map circle.dot', { timeout: 20000 });
      const seen = await page.evaluate(() => {
        const svg = document.querySelector('#map').getBoundingClientRect(), legend = document.querySelector('.legend').getBoundingClientRect();
        const at = c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        const dots = [...document.querySelectorAll('#map circle.dot')];
        return {
          keyBelow: legend.top >= svg.bottom - 1,
          outside: dots.filter(c => { const [x, y] = at(c); return x < svg.left || x > svg.right || y < svg.top || y > svg.bottom; }).map(c => c.dataset.key),
        };
      });
      await page.close();
      assert.deepEqual(seen, { keyBelow: true, outside: [] }, `${width} px`);
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
