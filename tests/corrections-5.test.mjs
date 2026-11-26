// Build 5 of the ChatGPT review corrections (vm-workflows/chatgpt-taskmaster/CONFIRMED.md, 25 November 2026): the
// Kardashev Tracker. Each test failed before its correction and passes after it. The data tests read
// kardashev/data/energy.json (built by kardashev/scripts/build.mjs from kardashev/scripts/polities.mjs); the page tests
// run against JDPI_URL, muted and closed whatever happens.
//   kardashev-1  the chart's grey band is the list's "Everyone else", and every power is drawn
//   kardashev-2  a combined entry shows the name in force at the step (Erlitou, Middle Kingdom, Zhou, Moscow, EU)
//   kardashev-3  a circle sits on the capital held at the step (Parthia, the Seleucids, Han, Song, Ottomans, Ming)
//   kardashev-4  on a phone the chart has room to be read
//   kardashev-5  (and front-pages-40) a name on the phone map stays inside the map, on zoom too
//   kardashev-6  the 2025 list is headed as the largest shares among the powers listed
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const DATA = JSON.parse(readFileSync(new URL('../kardashev/data/energy.json', import.meta.url), 'utf8'));
const entry = (year, id) => DATA.steps.find(s => s.year === year)?.polities.find(p => p.id === id);
const polity = id => DATA.polities.find(p => p.id === id);
const near = (a, b) => Math.abs(a - b) < 0.05;

// kardashev-2. Sources, read 25 November 2026 (English Wikipedia): Erlitou culture "approximately 1900 to 1500 BC";
// Shang dynasty c. 1600-1046 BC; Middle Kingdom of Egypt c. 2055-1650 BC, then the Second Intermediate Period until
// the New Kingdom, c. 1570-1069 BC by its own article (whose date is used; the Second Intermediate Period's article
// ends that period in 1550 BC); Zhou dynasty c. 1046-256 BC, the Warring States period c. 475-221 BC; Vijayanagara
// Empire 1336-1646, Bahmani Kingdom 1347-1527; Principality of Moscow to 1389, then the Grand Principality (or Grand
// Duchy) to 1547, the Tsardom of Russia 1547-1721; the European Economic Community 1958 to 1 November 1993.
test('kardashev-2: each step carries the name in force then, and the records keep their names (no page needed)', () => {
  assert.equal(entry(-2000, 'shang'), undefined, 'neither Erlitou nor Shang had begun in 2000 BC');
  assert.equal(polity('shang').from, -1900);
  const names = [[-1900, 'shang', 'Erlitou culture (China)'], [-1600, 'shang', 'Erlitou and Shang China'], [-1300, 'shang', 'Shang China'],
    [-2000, 'egypt-mk', 'Egypt (Middle Kingdom)'], [-1600, 'egypt-mk', 'Egypt (Second Intermediate Period)'], [-1400, 'egypt-mk', 'Egypt (New Kingdom)'],
    [-800, 'zhou', 'Zhou dynasty (China)'], [-400, 'zhou', 'Zhou and the Warring States (China)'],
    [1300, 'india-other', 'Other Indian states'], [1400, 'india-other', 'Other Indian states (Vijayanagara, Bahmani and others)'],
    [1600, 'india-other', 'Other Indian states (Vijayanagara and others)'], [1700, 'india-other', 'Other Indian states'],
    [1300, 'muscovy', 'Principality of Moscow'], [1500, 'muscovy', 'Grand Duchy of Moscow'], [1600, 'muscovy', 'Tsardom of Russia'],
    [2000, 'eec', 'European Union'], [2025, 'eec', 'European Union'], [1100, 'song', 'Song dynasty']];
  for (const [y, id, n] of names) assert.equal(entry(y, id)?.name, n, `${id} in ${y}`);
  for (const s of DATA.steps) for (const p of s.polities) assert.ok(p.name, `${p.id} in ${s.year} has a name`);
  // The records keep their names (the catalogue, the panel's heading and the shared-name rule read them).
  assert.equal(polity('eec').name, 'European Economic Community / European Union');
  assert.equal(polity('shang').name, 'Erlitou and Shang China');
});

// kardashev-3. Sources, read 25 November 2026: the Wikipedia infoboxes' capitals (Seleucid Empire: Seleucia 305-240 BC,
// Antioch 240-63 BC; Han dynasty: Chang'an 206 BC-9 AD, Luoyang 23-190, Xuchang 196-220; Song dynasty: Bianjing
// 960-1127, Lin'an 1138-1276; Ottoman Empire: Söğüt c. 1299-1331, Nicaea 1331-1335, Bursa 1335-1360s, Edirne 1360s-1453,
// Constantinople 1453-1922; Ming dynasty: Nanjing 1368, Beijing 1403); Hecatompylos (Qumis), "the capital of the
// Parthian Empire by 200 BCE", and Ctesiphon, founded in the late 120s BC, the capital from about 58 BC (Ctesiphon;
// Parthian Empire: perhaps not official until Gotarzes I, c. 90-80 BC); the Erlitou site (Erlitou culture); the
// positions from Wikidata's coordinates (P625).
test('kardashev-3: each step places a power at the capital it held then; the record keeps its own point (no page needed)', () => {
  const at = [[-200, 'parthia', 35.95, 54.1], [-100, 'parthia', 35.95, 54.1], [1, 'parthia', 33.09, 44.58], [-1800, 'shang', 34.69, 112.69],
    [-300, 'seleucid', 33.1, 44.5], [-200, 'seleucid', 36.2, 36.18],
    [-100, 'han', 34.31, 108.86], [100, 'han', 34.62, 112.45], [200, 'han', 34.02, 113.82], [1100, 'song', 34.8, 114.3], [1200, 'song', 30.27, 120.17],
    [1300, 'ottoman', 40.02, 30.18], [1400, 'ottoman', 41.68, 26.56], [1500, 'ottoman', 41.0, 28.98], [1400, 'ming', 32.06, 118.78], [1500, 'ming', 39.9, 116.4]];
  for (const [y, id, lat, lon] of at) {
    const e = entry(y, id);
    assert.ok(e && near(e.lat, lat) && near(e.lon, lon), `${id} in ${y}: ${e?.lat}, ${e?.lon} (expected ${lat}, ${lon})`);
  }
  // In 1400 the Ottoman circle no longer stands on the Byzantine capital.
  const o = entry(1400, 'ottoman'), b = entry(1400, 'byzantium');
  assert.ok(o.lat !== b.lat || o.lon !== b.lon);
  for (const s of DATA.steps) for (const p of s.polities) assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon), `${p.id} in ${s.year} has a position`);
  assert.deepEqual([polity('parthia').lat, polity('parthia').lon], [33.09, 44.58], "the record's own point is unchanged");
  assert.deepEqual([polity('seleucid').lat, polity('seleucid').lon], [33.1, 44.5]);
});

// After the second readers (25 November 2026): the same two faults at more steps, corrected the same way. Sources, the
// English Wikipedia infoboxes read that day, with Wikidata's positions: Rashidun Caliphate 632-661, Umayyad Caliphate
// 661-750; the Emirate of Córdoba 756-929, the Caliphate 929-1031 (Umayyad state of Córdoba); Maratha Empire 1674-1818;
// Third Intermediate Period of Egypt c. 1077-664 BC (Tanis c. 1077-943, Bubastis c. 943-716, Napata c. 744-656), Late
// Period 664-332 BC (Sais); Zhengzhou Shang City, phases 1630-1400 BC, and Yin at Anyang, Yinxu I 1300-1250 BC;
// Itjtawy, founded by Amenemhat I (r. c. 1991-1962 BC); Second Intermediate Period: Thebes c. 1677-1600 BC; New
// Kingdom: Memphis c. 1213-1069 BC; Zhou dynasty: Fenghao 1046-771 BC; Neo-Assyrian Empire: Assur 911-879 BC, Nimrud
// 879-706, Nineveh 705-612; Western Roman Empire: Mediolanum 395-401; Asuka period: Fujiwara-kyō from 694; Heian-kyō
// from 794; Timurid Empire: Samarkand 1370-1405, Herat 1405-1447 and 1459-1507; Mughal Empire: Agra 1598-1648.
test('kardashev-2 and -3, after the second readers: names and capitals in force at more steps (no page needed)', () => {
  const names = [[700, 'rashidun-umayyad', 'Umayyad Caliphate'], [800, 'cordoba', 'Emirate of Córdoba'], [900, 'cordoba', 'Emirate of Córdoba'],
    [1000, 'cordoba', 'Caliphate of Córdoba'], [1800, 'maratha', 'Maratha Confederacy and Indian states'], [1850, 'maratha', 'Indian states'],
    [-1000, 'egypt-late', 'Egypt (Third Intermediate Period)'], [-700, 'egypt-late', 'Egypt (Third Intermediate Period)'], [-600, 'egypt-late', 'Egypt (Late Period)']];
  for (const [y, id, n] of names) assert.equal(entry(y, id)?.name, n, `${id} in ${y}`);
  const at = [[-1900, 'shang', 34.69, 112.69], [-1500, 'shang', 34.75, 113.68], [-1400, 'shang', 34.75, 113.68], [-1300, 'shang', 36.1, 114.3],
    [-2000, 'egypt-mk', 25.7, 32.6], [-1800, 'egypt-mk', 29.57, 31.23], [-1600, 'egypt-mk', 25.7, 32.6], [-1200, 'egypt-mk', 29.84, 31.25],
    [-900, 'zhou', 34.21, 108.72], [-400, 'zhou', 34.6, 112.4], [-1000, 'egypt-late', 30.98, 31.88], [-800, 'egypt-late', 30.57, 31.51],
    [-700, 'egypt-late', 18.53, 31.82], [-600, 'egypt-late', 30.96, 30.77], [-900, 'assyria', 35.46, 43.26], [-800, 'assyria', 36.1, 43.33],
    [-700, 'assyria', 36.4, 43.15], [400, 'rome-west', 45.47, 9.19], [600, 'japan-pre', 34.47, 135.82], [700, 'japan-pre', 34.5, 135.81],
    [800, 'japan-pre', 35.0, 135.77], [1400, 'timurid', 39.65, 66.96], [1500, 'timurid', 34.34, 62.2], [1600, 'mughal', 27.18, 78.02], [1700, 'mughal', 28.6, 77.2]];
  for (const [y, id, lat, lon] of at) {
    const e = entry(y, id);
    assert.ok(e && near(e.lat, lat) && near(e.lon, lon), `${id} in ${y}: ${e?.lat}, ${e?.lon} (expected ${lat}, ${lon})`);
  }
  for (const id of ['rashidun-umayyad', 'cordoba', 'maratha', 'egypt-late', 'shang', 'zhou', 'assyria', 'japan-pre', 'rome-west', 'timurid', 'mughal'])
    assert.ok(!('names' in polity(id)) && !('capitals' in polity(id)), `${id}: the record keeps only its own name and point`);
  assert.deepEqual([polity('shang').lat, polity('shang').lon], [36.1, 114.3]);
});

// The Sources name where the dated names and capitals come from.
test('kardashev-2 and -3: the Sources and the method name the sources of the names and capitals (no page needed)', () => {
  const html = readFileSync(new URL('../kardashev/index.html', import.meta.url), 'utf8');
  const sources = html.match(/<p><b>Sources\.<\/b>[^\n]*<\/p>/)?.[0] || '';
  assert.match(sources, /Names and capitals by date: the English Wikipedia article on each power \(its infobox\), read on 25 November 2026; the capitals’ positions: Wikidata\./);
  assert.match(html, /<p><b>Names and capitals<\/b> follow the date:[^\n]*Wikidata[^\n]*<\/p>/);
});

// kardashev-6: the list leaves out countries larger than the United Kingdom (Our World in Data, primary energy 2024:
// Iran, South Korea, Canada, Saudi Arabia, Brazil, Indonesia and Mexico), so it is headed as what it is.
test('kardashev-6: the list is headed "Largest shares among the powers listed" (no page needed)', () => {
  const html = readFileSync(new URL('../kardashev/index.html', import.meta.url), 'utf8');
  assert.match(html, /<h3>Largest shares among the powers listed<\/h3>/);
  assert.doesNotMatch(html, /Largest shares of world energy/);
});

async function open(page, hash) {
  await page.goto(`${BASE}/kardashev/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#panel h2', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('circle.bubble').length > 0 && document.querySelectorAll('#chart path.band').length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
}

test('kardashev-1: the chart draws every power, and its grey band is exactly the list\'s "Everyone else"', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1100');
  const steps = (await (await fetch(`${BASE}/kardashev/data/energy.json`)).json()).steps;
  const chart = await page.evaluate(() => [...document.querySelectorAll('#chart path.band')].map(p => ({ key: p.__data__.key, at: p.__data__.map(d => d[1] - d[0]) })));
  const ids = new Set(steps.flatMap(s => s.polities.map(p => p.id)));
  assert.deepEqual(new Set(chart.filter(b => b.key !== 'other').map(b => b.key)), ids, 'a band for every power');
  const other = chart.find(b => b.key === 'other');
  for (const [i, s] of steps.entries()) assert.ok(Math.abs(other.at[i] - s.rest.share) < 1e-9, `${s.year}: grey ${other.at[i]} vs the list's ${s.rest.share}`);
  // 2000 BC was wholly grey while the list named its powers (now three, 40% between them).
  const coloured = chart.filter(b => b.key !== 'other').reduce((t, b) => t + b.at[0], 0);
  assert.ok(Math.abs(coloured - (1 - steps[0].rest.share)) < 1e-9 && coloured > 0.35, `2000 BC: powers ${coloured}`);
  assert.match(await page.locator('#caption').innerText(), /Every power's share over time, stacked by region, with everyone else in grey/);
  assert.doesNotMatch(await page.locator('#caption').innerText(), /sixteen/);
  await open(page, 'y=1400&f=100');
  assert.match(await page.locator('#caption').innerText(), /\(b\) Every power's share over time, stacked by region, with everyone else in grey; the period shaded\./);
  assert.deepEqual(errors, []);
});

test('kardashev-2: the list, table, map name and tooltip use the name in force at the step', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=2025');
  const list = await page.locator('#panel .rank[data-id="eec"]').innerText();
  assert.match(list, /^European Union\n/);
  assert.doesNotMatch(list, /Economic Community/);
  await open(page, 'y=-800');
  const zhou = await page.locator('text.blabel').evaluateAll(ls => ls.filter(l => l.__data__.id === 'zhou').map(l => l.textContent));
  assert.deepEqual(zhou, ['Zhou'], 'the Warring States had not begun in 800 BC');
  const box = await page.locator('#map').boundingBox();
  await page.locator('circle.bubble[data-id="zhou"]').dispatchEvent('mousemove', { clientX: box.x + 200, clientY: box.y + 100 });
  assert.match(await page.locator('#tooltip strong').innerText(), /^Zhou dynasty \(China\)$/);
  await open(page, 'y=1300&v=table');
  await page.waitForSelector('#table-rows tr[data-id="muscovy"]');
  assert.equal(await page.locator('#table-rows tr[data-id="muscovy"] .rowbtn').innerText(), 'Principality of Moscow');
  assert.equal(await page.locator('#table-rows tr[data-id="india-other"] .rowbtn').innerText(), 'Other Indian states');
  // The record keeps the entry's combined name.
  await open(page, 'y=1300&p=muscovy');
  assert.equal(await page.locator('#panel h2').innerText(), 'Grand Duchy of Moscow / Tsardom of Russia');
  assert.deepEqual(errors, []);
});

// After the second readers: over a period, a row that covers the whole period gave only the name at the power's largest
// share, so "Tsardom of Russia" stood for 1300-1600 and "Zhou and the Warring States" for 1000-300 BC again; such a row
// now gives each name in force within the period, in turn. And the Documentary says "the Erlitou culture".
test('kardashev-2: over a period, the rows, the table and the tooltip give each name in force within it; the narration says "the Erlitou culture"', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const rows = async (id, want) => {
    const texts = await page.locator(`#panel .rank[data-id="${id}"]`).allInnerTexts();
    assert.ok(texts.length >= 1, `a row for ${id}`);
    for (const x of texts) assert.ok(x.startsWith(want + '\n'), `${id}: ${JSON.stringify(x)}`);
  };
  await open(page, 'y=1600&f=1300');
  await rows('muscovy', 'Principality of Moscow → Grand Duchy of Moscow → Tsardom of Russia');
  await open(page, 'y=-300&f=-1000');
  await rows('zhou', 'Zhou dynasty (China) → Zhou and the Warring States (China)');
  const box = await page.locator('#map').boundingBox();
  await page.locator('circle.bubble[data-id="zhou"]').dispatchEvent('mousemove', { clientX: box.x + 200, clientY: box.y + 100 });
  assert.equal(await page.locator('#tooltip strong').innerText(), 'Zhou dynasty (China) → Zhou and the Warring States (China)');
  await open(page, 'y=-300&f=-1000&v=table');
  await page.waitForSelector('#table-rows tr[data-id="zhou"]');
  assert.equal(await page.locator('#table-rows tr[data-id="zhou"] .rowbtn').innerText(), 'Zhou dynasty (China) → Zhou and the Warring States (China)');
  // One step: one name, as before.
  await open(page, 'y=-300');
  await rows('zhou', 'Zhou and the Warring States (China)');
  assert.equal(await page.evaluate(() => plainPolity({ id: 'shang', name: 'Erlitou culture (China)' })), 'the Erlitou culture');
  assert.equal(await page.evaluate(() => plainPolity({ id: 'cordoba', name: 'Emirate of Córdoba' })), 'the Emirate of Córdoba');
  assert.equal(await page.evaluate(() => plainPolity({ id: 'rome', name: 'Roman Empire' })), 'the Roman Empire');
  assert.equal(await page.evaluate(() => plainPolity({ id: 'japan', name: 'Japan' })), 'Japan');
  assert.deepEqual(errors, []);
});

test('kardashev-3: in 200 BC the Parthian and Seleucid circles stand on Hecatompylos and Antioch; in 1400 the Ottoman one on Edirne', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const where = (id, lon, lat) => page.evaluate(([id, lon, lat]) => {
    const c = document.querySelector(`circle.bubble[data-id="${id}"]`), [x, y] = projection([lon, lat]);
    return Math.hypot(+c.getAttribute('cx') - x, +c.getAttribute('cy') - y);
  }, [id, lon, lat]);
  await open(page, 'y=-200');
  assert.ok(await where('parthia', 54.103672, 35.953053) < 1, 'Parthia at Hecatompylos');
  assert.ok(await where('seleucid', 36.18166667, 36.20472222) < 1, 'the Seleucids at Antioch');
  await open(page, 'y=1400');
  assert.ok(await where('ottoman', 26.55555556, 41.67694444) < 1, 'the Ottomans at Edirne');
  assert.ok(await where('ming', 118.77888889, 32.06083333) < 1, 'the Ming at Nanjing');
  // Over a period a disc stands at the capital of its largest share's step (the Han: AD 1, at Chang'an).
  await open(page, 'y=200&f=-200');
  assert.ok(await where('han', 108.85833333, 34.30833333) < 1, "the Han at Chang'an, their largest share's step");
  assert.deepEqual(errors, []);
});

test('kardashev-4: on a phone the chart is about 120 px tall, not a sliver', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const errors = [];
  for (const width of [360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await open(page, 'y=-200');
    const h = await page.evaluate(() => document.querySelector('#chart').getBoundingClientRect().height);
    assert.ok(h >= 110, `${width} px: the chart is ${h} px tall`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('kardashev-5: on a phone no map name runs past the map\'s edges, and a name kept inside stays there on zoom', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const errors = [];
  const outside = page => page.evaluate(() => {
    const w = +document.querySelector('#map').getAttribute('viewBox').split(' ')[2];
    return [...document.querySelectorAll('text.blabel')].filter(l => l.getAttribute('visibility') !== 'hidden')
      .map(l => ({ n: l.textContent, b: l.getBBox() })).filter(({ b }) => b.x < 0 || b.x + b.width > w).map(({ n, b }) => `${n} ${Math.round(b.x)}-${Math.round(b.x + b.width)} of ${w}`);
  });
  for (const [width, hash] of [[390, 'y=2025'], [390, 'y=2000'], [360, 'y=-400'], [360, 'y=-300'], [390, 'y=-300']]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on('pageerror', e => errors.push(e.message));
    await open(page, hash);
    assert.deepEqual(await outside(page), [], `${width} px, ${hash}`);
    await page.evaluate(() => placeMarks()); // what a zoom runs on every frame
    assert.deepEqual(await outside(page), [], `${width} px, ${hash}, on zoom`);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('kardashev-6: in 2025 the list is headed as the largest shares among the powers listed', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=2025');
  assert.deepEqual(await page.locator('#panel h3').allTextContents(), ['Largest shares among the powers listed']);
  await open(page, 'y=2025&f=2000');
  assert.match(await page.locator('#panel h3').first().textContent(), /^Largest shares within the period among the powers listed, each at its largest$/);
  assert.deepEqual(errors, []);
});
