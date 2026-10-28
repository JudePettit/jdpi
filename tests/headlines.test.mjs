// Country Headlines: top stories per outlet from Supabase (runs against JDPI_URL, default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('UK shows top stories grouped by outlet, linking to the original articles', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The page keeps polling (map tiles, clock), so wait for DOM ready rather than network idle.
  await page.goto(`${BASE}/q/headlines.html?view=current`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof loadTopStories === 'function');
  await page.evaluate(() => loadTopStories('GB', 'United Kingdom'));
  await page.waitForSelector('.outlet-group .article', { timeout: 15000 });
  const groups = await page.locator('.outlet-group').count();
  const stories = await page.locator('.outlet-group .article').count();
  const firstHref = await page.locator('.outlet-group a.headline').first().getAttribute('href');
  await browser.close();
  assert.ok(groups >= 3, `outlet groups: ${groups}`);
  assert.ok(stories >= 9, `stories: ${stories}`);
  assert.match(firstHref, /^https?:\/\//);
  assert.deepEqual(errors, []);
});

// ---- The map's boundaries (headlines/boundaries.json, built by headlines/scripts/build-boundaries.mjs) ----

const outlets = JSON.parse(readFileSync(new URL('../headlines/outlets.json', import.meta.url), 'utf8'));
const topo = JSON.parse(readFileSync(new URL('../headlines/boundaries.json', import.meta.url), 'utf8'));
const shapes = topo.objects.countries.geometries;

test('the boundary file has a shape or a marker for every collected country, and nothing else', () => {
  const codes = Object.keys(outlets);
  const usable = new Set(shapes.filter(g => g.type || g.properties.dot).map(g => g.properties.code));
  assert.deepEqual(codes.filter(c => !usable.has(c)), [], 'collected but not on the map (rebuild: node headlines/scripts/build-boundaries.mjs)');
  assert.deepEqual(shapes.map(g => g.properties.code).filter(c => !(c in outlets)), [], 'on the map but not collected');
  for (const c of ['SV', 'XK']) assert.ok(usable.has(c), `${c} can be chosen`);
  for (const c of ['VA', 'MC', 'SM', 'LI', 'AD', 'MT']) assert.ok(shapes.find(g => g.properties.code === c).properties.dot, `${c} has a marker`);
  for (const g of shapes) assert.ok(g.properties.name && /^[A-Z]{2}$/.test(g.properties.code), JSON.stringify(g.properties));
  const kb = readFileSync(new URL('../headlines/boundaries.json', import.meta.url)).length / 1024;
  assert.ok(kb < 300, `boundaries.json is ${kb.toFixed(0)} KB`);
});

async function openTracker(query, { width = 1280 } = {}) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfinished', async r => { try { requests.push({ url: r.url(), bytes: (await r.sizes()).responseBodySize }); } catch {} });
  await page.goto(`${BASE}/q/headlines.html${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('status-boundaries')?.dataset.state === 'ready', null, { timeout: 30000 });
  return { browser, page, errors, requests };
}
const shown = page => page.evaluate(() => ({ name: document.getElementById('countryname').textContent, pick: document.getElementById('countryPick').value,
  inList: [...document.querySelectorAll('#countryList [aria-current="true"]')].map(b => b.textContent), onMap: document.querySelectorAll('#map path.country.selected').length,
  country: new URLSearchParams(location.search).get('country') }));

test('the map loads its small boundary file from the repo, with markers for the smallest countries', async () => {
  const { browser, page, errors, requests } = await openTracker('?view=current');
  try {
    assert.equal(await page.textContent('#status-boundaries'), `Boundaries · ${Object.keys(outlets).length} covered countries`);
    const boundaries = () => requests.find(r => r.url.endsWith('/headlines/boundaries.json'));
    for (let i = 0; i < 30 && !boundaries(); i++) await page.waitForTimeout(100); // sizes arrive just after the response
    assert.ok(!requests.some(r => /geo-countries|countries\.geojson/.test(r.url)), 'no request for the 14.6 MB world GeoJSON');
    const file = boundaries();
    assert.ok(file && file.bytes < 300 * 1024, `boundaries.json: ${file?.bytes} bytes`);
    assert.equal(await page.locator('#map path.country-dot').count(), shapes.filter(g => g.properties.dot).length);
    // Markers stay above the shapes: with Italy selected (and so brought to the front), San Marino's and Vatican City's
    // markers are still drawn over it.
    await page.evaluate(() => geoLayer.eachLayer(l => { if (l.feature.properties.code === 'IT') l.fire('click'); }));
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Italy');
    const after = await page.evaluate(() => { const paths = [...document.querySelectorAll('#map path.country')], italy = paths.findIndex(p => p.classList.contains('selected'));
      return paths.slice(italy + 1).map(p => p.classList.contains('country-dot')); });
    assert.equal(after.length, shapes.filter(g => g.properties.dot).length, 'only the markers come after the selected shape');
    assert.ok(after.every(Boolean));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a country can be chosen with the keyboard, and the picker, list, map and address agree', async () => {
  const { browser, page, errors } = await openTracker('?view=current');
  try {
    await page.waitForFunction(() => !document.getElementById('countryPick').disabled);
    assert.equal(await page.locator('#countryPick option:not([disabled])').count(), Object.keys(outlets).length);
    assert.equal(await page.locator('label[for="countryPick"]').count(), 1, 'the picker is labelled');
    // Tab to the picker and type a name.
    await page.focus('.research-watchlist-button');
    for (let i = 0; i < 8 && await page.evaluate(() => document.activeElement.id !== 'countryPick'); i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'countryPick');
    await page.keyboard.type('malta');
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Malta', null, { timeout: 15000 });
    assert.deepEqual(await shown(page), { name: 'Malta', pick: 'MT', inList: ['Malta'], onMap: 2, country: 'Malta' }); // its shape and its marker
    // A click on the map moves the picker and the list with it.
    await page.evaluate(() => geoLayer.eachLayer(l => { if (l.feature.properties.code === 'FR') l.fire('click'); }));
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'France');
    assert.deepEqual(await shown(page), { name: 'France', pick: 'FR', inList: ['France'], onMap: 1, country: 'France' });
    // The A–Z list chooses too.
    await page.click('details.country-az summary');
    await page.click('#countryList .az-item[data-code="SM"]');
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'San Marino');
    assert.equal((await shown(page)).pick, 'SM');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('?country= selects the country once the boundaries are ready, by name, older name or code', async () => {
  for (const [query, name, code] of [['El%20Salvador', 'El Salvador', 'SV'], ['Kosovo', 'Kosovo', 'XK'], ['Republic%20of%20Serbia', 'Serbia', 'RS'],
    ['United%20States%20of%20America', 'United States', 'US'], ['Soviet%20Union%20%2F%20Russia', 'Russia', 'RU'], ['Vatican', 'Vatican City', 'VA']]) {
    const { browser, page, errors } = await openTracker(`?view=current&country=${query}`);
    try {
      await page.waitForFunction(n => document.getElementById('countryname').textContent === n, name, { timeout: 15000 });
      const s = await shown(page);
      assert.equal(s.pick, code, query);
      assert.ok(s.onMap >= 1, `${query}: highlighted on the map`);
      assert.equal(s.country, name, `${query}: the address keeps the name shown`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  const { browser, page } = await openTracker('?view=current&country=Narnia');
  try {
    await page.waitForFunction(() => document.getElementById('newsstate').textContent === 'Country not covered', null, { timeout: 15000 });
    assert.match(await page.textContent('#articles'), /Narnia is not one of the countries/);
  } finally { await browser.close(); }
});

test('the country list works at phone width without a horizontal scroll', async () => {
  const { browser, page, errors } = await openTracker('?view=current', { width: 390 });
  try {
    await page.click('details.country-az summary');
    const item = page.locator('#countryList .az-item[data-code="LI"]');
    const box = await item.boundingBox();
    assert.ok(box.height >= 36, `list items are ${box.height}px tall`);
    await item.click();
    await page.waitForFunction(() => document.getElementById('countryname').textContent === 'Liechtenstein');
    // On one column the headlines are below the list, so the choice scrolls them into view.
    await page.waitForFunction(() => { const r = document.getElementById('countryname').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 5000 });
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
