// Invention Timeline: the follow-ups to builds 4 and 11 of the corrections of 26 November 2026.
//  - progress-8: the card's Institutions list names the institution the event is placed at as it was named in the
//    event's year (the seed's pn, in e.place.n), as the card's place chip already does.
//  - Build 11's held sentence: the Sources paragraph says how people and a few places are named, true to the build.
//  - Omni's breakthroughs layer (omni/data/layers/breakthroughs/events.json) is in step with the timeline's events.
// The page test runs when JDPI_URL is set (e.g. JDPI_URL=http://localhost:8787), and never with PRP_PAGES=0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from '../science/scripts/progress-seed.mjs';
import { parseRef } from '../science/scripts/progress-lib.mjs';
import { breakthroughRows } from '../omni/scripts/build-breakthroughs.mjs';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const data = JSON.parse(read('science/progress/data/events.json'));
const html = read('science/progress/index.html');
const app = read('science/progress/app.js');
const ev = id => data.events.find(e => e.id === id);
const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const bare = s => (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// The events placed at an institution under its name of the time: the place chip reads e.place.n, and the lookup
// (data.institutions) holds one name per item, today's (Wikidata's label).
const renamed = data.events.filter(e => e.inst.includes(e.place.q) && data.institutions[e.place.q] && data.institutions[e.place.q].name !== e.place.n);

test('progress-8 (precondition): events placed at an institution under its name of the time, which the lookup names as today', () => {
  const ids = renamed.map(e => e.id);
  for (const id of ['boolean-algebra', 'stethoscope', 'weather-fronts', 'general-relativity', 'artemisinin', 'rotation-curves', 'stm']) assert.ok(ids.includes(id), id);
  assert.equal(data.institutions.Q1574185.name, 'University College Cork');
  assert.equal(ev('boolean-algebra').place.n, 'Queen\'s College Cork');
});

test('progress-8: the card’s Institutions list names the place’s institution as the place chip does', () => {
  // app.js is a page module (it needs the document), so the card's Institutions line is checked in its source here and
  // on the page below.
  const line = app.split('\n').find(l => /const inst = e\.inst\.map\(/.test(l));
  assert.ok(line, 'the card’s Institutions list');
  const body = app.slice(app.indexOf(line), app.indexOf('.join(\'\')', app.indexOf(line)));
  assert.match(body, /q === e\.place\.q && e\.place\.n && e\.place\.n !== instName\(q\) \? e\.place\.n : null/);
  // Under the name of the time, today's name stands where the lookup's description (today's, and false for the year)
  // stood.
  assert.match(body, /then \? `now \$\{instName\(q\)\}` : D\.institutions\[q\]\?\.desc/);
  assert.match(body, /esc\(then \|\| instName\(q\)\)/);
});

// Build 11's held sentence (its notes, "Held: waiting for build 4"), worded to what build 4's displayName and pn do.
test('Sources: how names are shown, true to the build', () => {
  const sources = text(html.match(/<p><b>Sources\.<\/b>([\s\S]*?)<\/p>/)[1]);
  assert.match(sources, /fetched through its API and refreshed monthly\. Where a person’s Wikidata label is misspelt or gives their name in another form, the name shown is the title of their English Wikipedia article or, in a few cases, the spelling in Vitruvian Manager’s own list of breakthroughs\. A few places and institutions carry the name they had at the time\. Articles: Wikipedia\./);
  // True to the data: where the name shown is not Wikidata's label, it is the person's English Wikipedia title (less any
  // "(…)"), or else the seed's own spelling; the title is the rule and the seed's spelling the exception.
  const cache = JSON.parse(read('science/scripts/progress-cache.json')).items;
  const seedNames = new Set(SEED.flatMap(s => s.p || []).map(p => bare(parseRef(p).name)));
  let title = 0, seed = 0;
  for (const [q, p] of Object.entries(data.people)) {
    const it = cache[q] || {}, label = it.l || it.w;
    if (p.name === label) continue;
    if (p.name === bare(it.w)) title++;
    else { assert.ok(seedNames.has(p.name), `${q} “${p.name}” is neither its label, its Wikipedia title nor the seed’s spelling`); seed++; }
  }
  assert.ok(title > 0 && seed < title / 4, `${title} as their Wikipedia title, ${seed} as the seed spells them`);
  // "A few places and institutions": some, not most.
  const places = data.events.filter(e => e.place.q && data.institutions[e.place.q] && data.institutions[e.place.q].name !== e.place.n);
  assert.ok(places.length > 0 && places.length < data.events.length / 10, `${places.length}`);
});

test('Omni: the breakthroughs layer is in step with the Invention Timeline’s events', () => {
  const layer = JSON.parse(read('omni/data/layers/breakthroughs/events.json'));
  assert.equal(layer.of, data.generated);
  assert.deepEqual(layer.rows, breakthroughRows(data));
  const row = id => layer.rows.find(r => r.id === id);
  assert.equal(row('telescope').label, 'Lipperhey seeks a patent for the telescope');
  assert.equal(row('tcp-ip').label, 'Cerf and Kahn design a protocol to join networks');
  assert.deepEqual([row('ice-age').sortYear, row('ice-age').placeName], [1837, 'Neuchâtel']);
  assert.equal(row('boolean-algebra').placeName, 'Queen\'s College Cork');
  assert.equal(row('stethoscope').placeName, 'Necker Hospital');
  assert.ok(!layer.rows.some(r => /People's Republic of China/.test(r.placeName || '') && r.sortYear < 1949));
  // The layer's catalogue entry counts what the file holds.
  const entry = JSON.parse(read('omni/data/layers.json')).layers.find(l => l.id === 'breakthroughs');
  assert.match(entry.method, new RegExp(`The ${layer.rows.length} breakthroughs`));
  assert.match(entry.method, new RegExp(`${layer.rows.filter(r => r.vmPlaced).length} are placed by hand`));
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: the card’s Institutions list names the place’s institution as it was in the year', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const institutions = async (y, id) => {
    await page.goto('about:blank');
    await page.goto(`${BASE}/science/progress/index.html#y=${y}&e=${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#panel .card', { timeout: 20000 });
    const list = page.locator('#panel .card h3:has-text("Institutions") + ul');
    return { card: await page.locator('#panel .card').innerText(), list: await list.innerText(),
      items: await list.locator('li').evaluateAll(lis => lis.map(li => [li.querySelector('span')?.textContent || '', li.querySelector('small')?.textContent || ''])) };
  };
  // The place's institution: its name of the time, with today's name below it ("now …"), and never today's description,
  // which is false for the year (UCC as a constituent university of the NUI, formed in 1908; the University of Bergen,
  // established in 1946, as the Geophysical Institute's parent in 1919).
  for (const [y, id, then, now, desc] of [[1854, 'boolean-algebra', 'Queen\'s College Cork', 'now University College Cork', /National University of Ireland/],
    [1919, 'weather-fronts', 'Geophysical Institute, Bergen', 'now University of Bergen, Geophysical Institute', /department at the University of Bergen \(UiB\)/],
    [1816, 'stethoscope', 'Necker Hospital', 'now Necker–Enfants Malades Hospital', /teaching hospital in Paris/],
    [1915, 'general-relativity', 'Frederick William University Berlin', 'now Humboldt-Universität zu Berlin', /public research university in Berlin/],
    [1972, 'artemisinin', 'Academy of Traditional Chinese Medicine', 'now China Academy of Chinese Medical Sciences', /education organization in Beijing/]]) {
    const { card, list, items } = await institutions(y, id);
    assert.ok(items.some(([n, s]) => n === then && s === now), `${id}: ${list}`);
    assert.ok(!items.some(([n]) => n === now.slice(4)), `${id}: today's name stated as the body of ${y}: ${list}`);
    assert.doesNotMatch(card, desc, id);
  }
  // An institution that is not the event's place keeps the lookup's name (Principia: University of Cambridge).
  const { list } = await institutions(1687, 'principia');
  assert.match(list, /University of Cambridge/);
  assert.deepEqual(errors, []);
});
