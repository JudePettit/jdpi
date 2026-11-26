// Build 2 of ChatGPT's page reviews (vm-workflows/chatgpt-taskmaster/CONFIRMED.md, 25 November 2026): the Retrospective
// Battlefield's data and wording. Each test fails on the files before the corrections and passes after.
//   battlefield-history-2: each UCDP conflict-year carries that year's type (UCDP/PRIO ACD v26.1, type_of_conflict).
//   battlefield-history-3: the internal conflicts fought outside the government's state are placed where Wikidata places the war.
//   battlefield-history-4: Actions in Inner Mongolia is placed in China, not Japan.
//   battlefield-history-5: the Method names the War Focus wars listed inside a larger listed war.
//   battlefield-history-6: World War II's named places come by year (no Pearl Harbor in 1939).
//   battlefield-history-7: a UCDP conflict's Active span gives its count of active years.
// Page tests run against JDPI_URL (default live); PRP_PAGES=0 leaves them out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HISTORY = JSON.parse(read('battlefield/history/data/wars.json'));
const PLACES = JSON.parse(read('battlefield/history/data/places.json'));
const war = id => HISTORY.wars.find(w => w.id === id);
const typeIn = (w, y) => w.years.find(([yy]) => yy === y)?.[2];
const METHOD = read('battlefield/history/index.html').match(/<p><b>Method\.<\/b>([\s\S]*?)<\/p>/)[1];

test('battlefield-history-2: each UCDP conflict-year has its own type, as UCDP/PRIO ACD v26.1 codes it', () => {
  assert.equal(HISTORY.format, 'vm-battlefield-wars/2', 'the format is kept: the third element adds to the tuples');
  assert.deepEqual(HISTORY.types, { 1: 'Colonial war', 2: 'Interstate war', 3: 'Civil conflict', 4: 'Internationalised civil conflict' });
  for (const w of HISTORY.wars.filter(x => x.src === 'ucdp')) for (const yy of w.years) assert.ok([1, 2, 3, 4].includes(yy[2]), `${w.id} ${yy[0]}: a type`);
  // Wikidata's wars of 1926–1945 keep their pairs: no source codes their type by year.
  for (const w of HISTORY.wars.filter(x => x.src === 'wikidata')) assert.ok(w.years.every(yy => yy.length === 2), w.id);
  // Cuba (242): type 3 in 1953 and 1956–58, type 4 only in 1961.
  assert.deepEqual(war('u242').years.map(([y, , t]) => [y, t]), [[1953, 3], [1956, 3], [1957, 3], [1958, 3], [1961, 4]]);
  // Nigeria: government (297): type 3 in 1966, 2009 and 2011, type 4 from 2012.
  for (const y of [1966, 2009, 2011]) assert.equal(typeIn(war('u297'), y), 3, `u297 ${y}`);
  for (let y = 2012; y <= 2025; y++) assert.equal(typeIn(war('u297'), y), 4, `u297 ${y}`);
  // Nigeria: Biafra (303): type 4 in 2023 only.
  assert.deepEqual(war('u303').years.filter(([, , t]) => t === 4).map(([y]) => y), [2023]);
  // `type` stays one name, the last year's, for the catalogue and the Lake (u303's last year, 2025, is type 3).
  assert.equal(war('u303').type, 'Civil conflict');
  assert.equal(war('u242').type, 'Internationalised civil conflict');
  for (const w of HISTORY.wars.filter(x => x.src === 'ucdp')) assert.equal(w.type, HISTORY.types[w.years.at(-1)[2]], w.id);
  // Across UCDP: 65 of 303 conflicts change type, and 396 of 2,816 conflict-years are not of the last year's type.
  const ucdp = HISTORY.wars.filter(x => x.src === 'ucdp');
  assert.equal(ucdp.length, 303);
  assert.equal(ucdp.filter(w => new Set(w.years.map(yy => yy[2])).size > 1).length, 65);
  assert.equal(ucdp.reduce((s, w) => s + w.years.length, 0), 2816);
  assert.equal(ucdp.reduce((s, w) => s + w.years.filter(yy => yy[2] !== w.years.at(-1)[2]).length, 0), 396);
  // The page shows the year's type in the table, the cards, a war's heading and the search, and the types by year in
  // the record.
  const app = read('battlefield/history/app.js');
  assert.match(app, /<td class="mono">\$\{esc\(typeText\(w, a, y\)\)\}<\/td>/, 'the table');
  assert.match(app, /<div class="meta">\$\{esc\(typeText\(w, a, b\)\)\}/, 'the cards');
  assert.match(app, /<p class="sub">\$\{esc\(typeText\(w, a, y\)\)\}/, 'a war’s heading');
  assert.match(app, /typesSentence\(w\)/, 'the record');
  assert.doesNotMatch(app, /esc\(w\.type\)/, 'no view shows the last year’s type for every year');
});

test('battlefield-history-3: internal conflicts fought outside the government’s state are placed where Wikidata places the war', () => {
  // Israeli–Palestinian conflict (Q151622): P276 Palestine (Q23792); kept in Israel too.
  assert.deepEqual(war('u234').loc, ['Q801', 'Q23792']);
  // South African Border War (Q1993848): P17 and P276 Namibia (Q1030); South Africa is a party abroad.
  assert.deepEqual(war('u298').loc, ['Q1030']);
  assert.ok(war('u298').states.includes('Q258'));
  // Western Sahara War (Q1093550): P276 Western Sahara (Q6250), kept in Morocco and Mauritania too: Polisario raided
  // Morocco and Mauritania proper (English Wikipedia's "Western Sahara War": Nouakchott, the Zouerate iron mines), so
  // neither government's state loses its years (second readers, 26 November 2026).
  assert.deepEqual(war('u331').loc, ['Q6250', 'Q1028']);
  assert.deepEqual(war('u428').loc, ['Q6250', 'Q1025']);
  // Indonesian occupation of East Timor (Q2665403): P276 Timor-Leste (Q574); Indonesia is a party abroad.
  assert.deepEqual(war('u330').loc, ['Q574']);
  assert.ok(war('u330').states.includes('Q252'));
  assert.equal(PLACES.places.Q574.n, 'Timor-Leste');
  assert.equal(PLACES.places.Q6250.n, 'Western Sahara');
  // Cliopatria draws Namibia within South Africa to 1989 and Timor-Leste within Indonesia from 1976, and holds no row
  // for Western Sahara or Palestine, so each is named under the map, never drawn on a border of today.
  for (const [q, ys] of [['Q1030', [1966, 1983, 1989]], ['Q6250', [1975, 1979, 1989]], ['Q23792', [1950, 2025]], ['Q574', [1976, 1988, 1992, 1997, 1999]]]) for (const y of ys) assert.ok(PLACES.unplaced[y]?.includes(q), `${q} ${y}`);
  // The Method says how a conflict is placed from 1946, and keeps "on its territory" (the column is not relabelled).
  assert.match(METHOD, /UCDP’s location is the government side of a conflict, not where the fighting was/);
  assert.match(METHOD, /Israel: Palestine in Palestine and Israel, South Africa: Namibia in Namibia, Morocco’s and Mauritania’s wars over Western Sahara in Western Sahara and in the government’s state, which Polisario’s raids reached, and Indonesia: East Timor in Timor-Leste\. The map draws Namibia within South Africa to 1989 and Timor-Leste within Indonesia from 1976, so each is named under the map, and the shape that takes it in counts that conflict as fighting abroad\./);
  assert.match(METHOD, /Every other internal conflict is placed at UCDP’s location, the government’s state\./);
  assert.match(METHOD, /fought on its territory/);
});

test('battlefield-history-4: Actions in Inner Mongolia is placed in China, and Japan is not made a party', async () => {
  const w = war('Q4211700');
  assert.deepEqual(w.loc, ['Q148']);
  assert.deepEqual(w.states, ['Q148']);
  for (const y of [1933, 1934, 1935, 1936]) assert.deepEqual(w.statesYears[y], ['Q148'], `${y}`);
  // The rule: a location whose country THEN would misread takes LOCATION_IN's state in place of its country (P17),
  // not passed through THEN or the state test.
  const { selectWars, LOCATION_IN, THEN } = await import('../battlefield/scripts/wars-1926.mjs');
  assert.deepEqual(LOCATION_IN, { Q1058919: 'Q148' });
  assert.equal(THEN.Q865, 'Q17', 'THEN still reads Taiwan as Japan’s for the wars of Taiwan itself');
  const t = time => [{ mainsnak: { datavalue: { value: { time, precision: 10 } } } }];
  const ids = l => l.map(q => ({ mainsnak: { datavalue: { value: { id: q } } } }));
  const items = { Q4211700: { labels: { en: { value: 'Actions in Inner Mongolia' } }, sitelinks: { enwiki: { title: 'Actions in Inner Mongolia (1933–1936)' } },
    claims: { P31: ids(['Q7883019']), P276: ids(['Q1058919']), P580: t('+1933-04-00T00:00:00Z'), P582: t('+1936-12-00T00:00:00Z') } } };
  const things = { Q1058919: { labels: { en: { value: 'Chahar' } }, claims: { P31: ids(['Q9319988']), P17: ids(['Q865']) } }, Q865: { claims: { P31: ids(['Q3624078']) } } };
  const { wars } = selectWars({ items, things, isPlace: q => ['Q148', 'Q17', 'Q865'].includes(q), warTree: new Set(['Q4211700']) });
  assert.deepEqual(wars[0].loc, ['Q148']);
  assert.deepEqual(wars[0].states, ['Q148']);
});

test('battlefield-history-5: the Method names the War Focus wars it lists on their own inside a larger listed war', () => {
  assert.match(METHOD, /is listed once, as the whole, except War Focus’s own wars, which are listed on their own even inside a larger war on the list: the Northern Expedition \(within the Chinese Civil War\), the Japanese invasion of Manchuria \(within the Second Sino-Japanese War\), the Second Sino-Japanese War and the Winter War \(within World War II\) and the Battles of Khalkhin Gol \(within the Soviet–Japanese border conflicts\)\./);
  // Each is on the list and is one of War Focus's wars; each whole is on the list too. Nothing is folded.
  const focus = new Set(JSON.parse(read('battlefield/focus/data/index.json')).wars.map(w => w.qid));
  for (const [part, whole] of [['Q1073476', 'Q179975'], ['Q1551794', 'Q170314'], ['Q170314', 'Q362'], ['Q134949', 'Q362'], ['Q188925', 'Q696389']]) {
    assert.ok(war(part) && war(whole), `${part} and ${whole} are listed`);
    assert.ok(focus.has(part), `${part} is a War Focus war`);
    assert.ok(METHOD.includes(war(part).name) && METHOD.includes(war(whole).name), `the Method names ${war(part).name} and ${war(whole).name}`);
  }
});

test('battlefield-history-6: World War II’s named places come by year, so 1939 names neither Pearl Harbor nor the Aleutians', () => {
  const ww2 = war('Q362');
  assert.deepEqual(ww2.where, ['Pearl Harbor (1941)', 'the Aleutian Islands (1942–43)'], 'the record keeps them with their years');
  assert.deepEqual(ww2.whereYears, { 1941: ['Pearl Harbor'], 1942: ['the Aleutian Islands'], 1943: ['the Aleutian Islands'] });
  const app = read('battlefield/history/app.js');
  assert.match(app, /const whereIn = \(w, a, b\) => \(w\.whereYears \? yearsIn\(w, a, b\)\.flatMap\(\(\[y\]\) => w\.whereYears\[y\] \|\| \[\]\) : w\.where \|\| \[\]\);/);
  assert.match(app, /const placesIn = \(w, a, b\) => \[\.\.\.new Set\(\[\.\.\.yearsIn\(w, a, b\)\.flatMap\(\(\[y\]\) => locIn\(w, y\)\.map\(q => nameOf\(q, y\)\)\), \.\.\.whereIn\(w, a, b\)\]\)\];/);
});

test('battlefield-history-7: the Method says a UCDP conflict’s Active span can have gaps', () => {
  assert.match(METHOD, /Its Active span runs from its first to its last year in UCDP’s record, with the number of years it was active, since the record can have gaps \(Nigeria: Biafra, 1967–70 and 2021–25, is “1967–ongoing · 9 yrs”\)\./);
  assert.deepEqual(war('u303').years.map(([y]) => y), [1967, 1968, 1969, 1970, 2021, 2022, 2023, 2024, 2025]);
});

test('second readers (26 November 2026): the build’s comments say what the code does, and no comment misdates the mandate', () => {
  const rule = read('battlefield/scripts/wars-1926.mjs');
  // War Focus's own wars skip the "part of another war" test (`keep`), so each is counted with its whole.
  assert.match(rule, /War Focus's own wars \(below, `keep`\) are listed even\n\/\/\s+inside a larger listed war/);
  assert.match(rule, /const whole = keep\.has\(r\.q\) \? null : within\(r\);/);
  // LOCATION_IN's state replaces the location's P17 read; it does not go through THEN.
  assert.match(rule, /used in place of the location's country \(P17\), as given here; it is not passed through THEN or the state\n\s+test\./);
  assert.doesNotMatch(rule, /read before THEN/);
  assert.match(rule, /const cs = LOCATION_IN\[l\] \? \[LOCATION_IN\[l\]\] :/);
  // South-West Africa's League of Nations mandate ran 1920–66 (UN General Assembly Resolution 2145 (XXI)), not to 1990.
  const tests = read('tests/battlefield.test.mjs');
  assert.doesNotMatch(tests, /mandate to 1990/);
  assert.match(tests, /a League of Nations mandate from 1920 that the UN General Assembly ended in 1966 \(Resolution 2145\)/);
});

// ---- The page (local server or live)
async function open(hash) {
  const browser = await launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/history/${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { browser, page, errors };
}
const go = async (page, h, done) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(done, null, { timeout: 15000 }); };
const cells = (page, id) => page.locator(`#table-rows tr[data-id="${id}"] td`).allInnerTexts();

test('page: the table gives each year’s type, the Active span’s count of years, and the year’s own places', pageTest, async () => {
  const { browser, page, errors } = await open('#y=1953&v=table');
  try {
    await page.waitForSelector('#table-rows tr[data-id="u242"]', { timeout: 30000 });
    // Cuba in 1953: a civil conflict (it was shown as internationalised, its 1961 type); 5 active years from 1953 to 1961.
    let c = await cells(page, 'u242');
    assert.equal(c[1], 'Civil conflict');
    assert.equal(c[3], '1953–1961 · 5 yrs');
    await go(page, '#y=1961&v=table', () => document.querySelector('#table-title')?.textContent.includes('1961') && document.querySelector('#table-rows tr[data-id="u242"]'));
    assert.equal((await cells(page, 'u242'))[1], 'Internationalised civil conflict');
    // A period gives every type the conflict had in it.
    await go(page, '#y=1961&f=1953&v=table', () => document.querySelector('#table-title')?.textContent.includes('1953–1961'));
    assert.equal((await cells(page, 'u242'))[1], 'Civil conflict / Internationalised civil conflict');
    // Nigeria: Biafra in 1968: 1967–ongoing, 9 active years (1967–70 and 2021–25).
    await go(page, '#y=1968&v=table', () => document.querySelector('#table-title')?.textContent.includes('1968') && document.querySelector('#table-rows tr[data-id="u303"]'));
    c = await cells(page, 'u303');
    assert.equal(c[1], 'Civil conflict');
    assert.equal(c[3], '1967–ongoing · 9 yrs');
    // 2023: Biafra was internationalised that year.
    await go(page, '#y=2023&v=table', () => document.querySelector('#table-title')?.textContent.includes('2023') && document.querySelector('#table-rows tr[data-id="u303"]'));
    assert.equal((await cells(page, 'u303'))[1], 'Internationalised civil conflict');
    // World War II in 1939: Germany and Poland only, without Pearl Harbor (1941) or the Aleutians (1942–43).
    await go(page, '#y=1939&v=table', () => document.querySelector('#table-title')?.textContent.includes('1939') && document.querySelector('#table-rows tr[data-id="Q362"]'));
    c = await cells(page, 'Q362');
    assert.equal(c[4], 'Germany, Poland');
    // Actions in Inner Mongolia, 1933: in the Republic of China, not Japan.
    await go(page, '#y=1933&v=table', () => document.querySelector('#table-title')?.textContent.includes('1933') && document.querySelector('#table-rows tr[data-id="Q4211700"]'));
    assert.equal((await cells(page, 'Q4211700'))[4], 'Republic of China');
    // 1983: South Africa: Namibia in Namibia ("today’s", since Namibia dates from 1990); 2025: Israel: Palestine in
    // Israel and Palestine; 1977: Mauritania's war in Western Sahara and Mauritania; 1998: Indonesia: East Timor in
    // Timor-Leste.
    await go(page, '#y=1983&v=table', () => document.querySelector('#table-title')?.textContent.includes('1983') && document.querySelector('#table-rows tr[data-id="u298"]'));
    assert.equal((await cells(page, 'u298'))[4], 'today’s Namibia');
    await go(page, '#y=2025&v=table', () => document.querySelector('#table-title')?.textContent.includes('2025') && document.querySelector('#table-rows tr[data-id="u234"]'));
    assert.equal((await cells(page, 'u234'))[4], 'Israel, Palestine');
    await go(page, '#y=1977&v=table', () => document.querySelector('#table-title')?.textContent.includes('1977') && document.querySelector('#table-rows tr[data-id="u428"]'));
    assert.equal((await cells(page, 'u428'))[4], 'Western Sahara, Mauritania');
    assert.equal((await cells(page, 'u331'))[4], 'Western Sahara, Morocco');
    await go(page, '#y=1998&v=table', () => document.querySelector('#table-title')?.textContent.includes('1998') && document.querySelector('#table-rows tr[data-id="u330"]'));
    assert.equal((await cells(page, 'u330'))[4], 'Timor-Leste');
    assert.match(await page.locator('#unplaced').innerText(), /^VM cannot place this on a free border for 1998: Timor-Leste/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: a conflict whose type changed says its types by year; its card and heading follow the year', pageTest, async () => {
  const { browser, page, errors } = await open('#y=1961&w=u242');
  try {
    await page.waitForFunction(() => /UCDP records this conflict/.test(document.querySelector('#panel')?.textContent || ''), null, { timeout: 30000 });
    const text = await page.locator('#panel').innerText();
    assert.match(text, /UCDP records this conflict over government in Cuba, active in 5 years between 1953 and 1961, 1 of them at war level \(1,000\+ battle deaths\)\. UCDP types it as a civil conflict in 1953 and 1956–58 and as an internationalised civil conflict in 1961\./);
    assert.equal(await page.locator('#panel .sub').first().innerText(), 'Internationalised civil conflict · 1953–1961 · 5 yrs');
    // In 1958 the heading gives 1958's type; a war of one type keeps the old sentence.
    await go(page, '#y=1958&w=u242', () => document.querySelector('#year-big')?.textContent === '1958' && /^Civil conflict/.test(document.querySelector('#panel .sub')?.textContent || ''));
    await go(page, '#y=1983&w=u298', () => /UCDP records this civil conflict over territory in today’s Namibia/.test(document.querySelector('#panel')?.textContent || ''));
    assert.doesNotMatch(await page.locator('#panel').innerText(), /UCDP types it/);
    // The year's cards: Cuba in 1958 is a civil conflict.
    await go(page, '#y=1958', () => document.querySelector('#year-big')?.textContent === '1958' && document.querySelector('#panel .war[data-id="u242"]'));
    assert.match(await page.locator('#panel .war[data-id="u242"] .meta').innerText(), /^Civil conflict · 1953–1961 · 5 yrs$/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
