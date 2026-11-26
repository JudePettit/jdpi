// Invention Timeline: the page's own text and its map labels (ChatGPT review corrections, build 11: progress-1, -2, -3).
// The text tests read the page's files; the label test drives a phone-width browser and runs when JDPI_URL is set
// (e.g. JDPI_URL=http://localhost:8787), and never with PRP_PAGES=0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageTest, launch } from './tools/pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(ROOT, 'science/progress/index.html'), 'utf8');
const app = readFileSync(join(ROOT, 'science/progress/app.js'), 'utf8');
const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const para = b => text(html.match(new RegExp(`<p><b>${b}\\.</b>([\\s\\S]*?)</p>`))?.[1] || '');

// progress-1: the Selection paragraph says the dates, titles and notes are VM's own, so the Sources paragraph must not
// claim every fact on the page for Wikidata; it names what Wikidata gives.
test('progress-1: Sources names what comes from Wikidata, not "every fact"', () => {
  const sources = para('Sources');
  assert.doesNotMatch(sources, /every fact/i);
  assert.match(sources, /^ The people, life dates, nationalities, fields, institutions, places and coordinates on this page come from Wikidata, which is public domain \(CC0\)/);
  assert.match(para('Selection'), /their dates, titles and one-line notes are Vitruvian Manager’s own/);
  // Nor may Figure 1's caption or the status line credit "Facts" to Wikidata outright.
  const fig = text(html.match(/<figcaption>([\s\S]*?)<\/figcaption>/)[1]);
  assert.doesNotMatch(fig, /Facts:? (<b>)?Wikidata/);
  assert.doesNotMatch(app, /Facts:? (<b>)?Wikidata/);
  assert.match(fig, /People and places: Wikidata \(CC0\); outline: Natural Earth\./);
  assert.match(app, /<span>People and places <b>Wikidata \(CC0\)<\/b><\/span>/);
});

// progress-2: 335 of the 570 breakthroughs are placed by a fallback rule (main institution, work location, education,
// birthplace or a hand-set place), and 39 more by an institution the discoverers shared, which may be undated, so
// neither the introduction nor Figure 1 may say only "where they happened", and Figure 1 names every fallback.
test('progress-2: the introduction, Figure 1 and the narration name the fallbacks', () => {
  const dek = text(html.match(/<p class="prp-dek">([\s\S]*?)<\/p>/)[1]);
  assert.match(dek, /placed where they happened, or as near as the sources allow\./);
  const fig = text(html.match(/<figcaption>([\s\S]*?)<\/figcaption>/)[1]);
  assert.match(fig, /Each sits where Wikidata places its discovery, the discoverer’s institution at the time, or a fallback the card names \(an institution the discoverers shared, main institution, where they worked or studied, birthplace or a place set by hand\)\./);
  assert.doesNotMatch(fig, /or the discoverer’s institution at the time \(the card says which\)/);
  // Documentary mode's opening line says the same.
  assert.match(app, /each placed where it happened, or as near as the sources allow\./);
  assert.doesNotMatch(app, /each placed where it happened\.`/);
});

// progress-3: on a phone, a label near the map's right edge was cut off (the review found 37 such labels, by 16-137 px
// at 390 px). Every label must now lie inside the map: at all 30 of the slider's stops from 3000 BC to 550 BC, for a
// selection in East Asia, after the map's tab has been hidden while the year changed (a hidden label measures 0 px),
// and on a first load straight at 2500 BC, once the web font has replaced the narrower fallback it was measured in.
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('progress-3: map labels stay inside the map on a phone', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const data = JSON.parse(readFileSync(join(ROOT, 'science/progress/data/events.json'), 'utf8'));
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Each label's box against the map's box (the halo is left out: the box is the glyphs').
  const cut = () => page.evaluate(() => {
    const m = document.querySelector('#map').getBoundingClientRect();
    return [...document.querySelectorAll('#map .labels text')].map(n => ({ t: n.textContent, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.width && (r.left < m.left - 0.5 || r.right > m.right + 0.5))
      .map(({ t, r }) => `${t} (${Math.round(Math.max(m.left - r.left, r.right - m.right))} px)`);
  });
  const count = () => page.locator('#map .labels text').count();
  // A new address, once the page's hashchange handler has run and the map has been drawn.
  const go = hash => page.evaluate(h => new Promise(done => {
    const drawn = () => requestAnimationFrame(() => requestAnimationFrame(done));
    if (location.hash === h) return drawn();
    window.addEventListener('hashchange', drawn, { once: true });
    location.hash = h;
  }), hash);
  await page.goto(`${BASE}/science/progress/index.html#y=-3000`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#map .labels text', { timeout: 20000 });

  // The slider's stops from 3000 BC to 550 BC: centuries to 1100 BC, then half-centuries.
  const stops = [];
  for (let y = -3000; y <= -1100; y += 100) stops.push(y);
  for (let y = -1000; y <= -550; y += 50) stops.push(y);
  const bad = [];
  let labels = 0;
  for (const y of stops) {
    await go(`#y=${y}`);
    labels += await count();
    for (const c of await cut()) bad.push(`${y}: ${c}`);
  }
  assert.ok(labels >= 40, `${labels} labels drawn at the early stops`);
  assert.deepEqual(bad, [], 'labels cut at the map’s edge');

  // A selected breakthrough in East Asia or Australia, with the longest title there.
  const east = data.events.filter(e => e.y >= -500 && e.place.lon > 100).sort((a, b) => b.t.length - a.t.length)[0];
  assert.ok(east, 'a breakthrough in East Asia or Australia');
  await go(`#y=${east.y}&e=${east.id}`);
  assert.equal(await page.locator('#map .labels text.sel').count(), 1);
  assert.deepEqual(await cut(), [], `the label of ${east.id}`);

  // The year changed while the List tab hid the map: the labels are placed again when the map comes back.
  await page.locator('#tab-list').click();
  await go('#y=-3000&v=list');
  await page.locator('#tab-map').click();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.ok(await count() > 0, 'labels at 3000 BC');
  assert.deepEqual(await cut(), [], 'labels after the map’s tab was hidden');
  assert.deepEqual(errors, []);
  await page.close();

  // A first load straight at 2500 BC, with no change of address after it: the labels are first measured before the web
  // font has arrived, and must be placed again once it has. The font files are held back for 3 s, as on a slow phone
  // connection, so that the first measure is always taken in the fallback font.
  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  fresh.on('pageerror', e => errors.push(e.message));
  await fresh.route('https://fonts.gstatic.com/**', async r => { await new Promise(s => setTimeout(s, 3000)); await r.continue(); });
  await fresh.goto(`${BASE}/science/progress/index.html#y=-2500`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await fresh.waitForSelector('#map .labels text', { timeout: 20000 });
  await fresh.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const cutFresh = await fresh.evaluate(() => {
    const m = document.querySelector('#map').getBoundingClientRect();
    return [...document.querySelectorAll('#map .labels text')].map(n => ({ t: n.textContent, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.width && (r.left < m.left - 0.5 || r.right > m.right + 0.5))
      .map(({ t, r }) => `${t} (${Math.round(Math.max(m.left - r.left, r.right - m.right))} px)`);
  });
  assert.deepEqual(cutFresh, [], 'labels on a first load at 2500 BC, once the web font has loaded');
  assert.deepEqual(errors, []);
  await fresh.close();
});
