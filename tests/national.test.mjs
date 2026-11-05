// National Analysis: map, country profile (overview + PESTLE), and side-by-side comparison.
// The data test reads the committed national/data (which national-refresh tests before committing); the page test
// runs against JDPI_URL (default live), and PRP_PAGES=0 leaves it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
// The World Bank has moved SM.POP.REFG.OR (refugees by country of origin) to its "WDI Database Archives", which the
// indicator API does not serve, so it has no values until national/scripts/indicators.mjs drops or replaces it.
const ARCHIVED = new Set(['SM.POP.REFG.OR']);

test('data: the brief Geopolitical Volatility reads is the index\'s, field for field, and stays small', async () => {
  const { brief } = await import('../national/scripts/brief.mjs');
  const committed = read('national/data/brief.json');
  assert.deepEqual(committed, brief(read('national/data/index.json')), 'rebuild it with: node national/scripts/brief.mjs');
  const ukr = committed.countries.find(c => c.iso3 === 'UKR');
  assert.ok(ukr.num && ukr.region && ukr.qid && typeof ukr.pv === 'number' && ukr.wars.some(w => w.deaths > 0), JSON.stringify(ukr));
  assert.ok(readFileSync(new URL('../national/data/brief.json', import.meta.url)).length < 80 * 1024, 'brief.json stays under 80 KB');
  assert.doesNotMatch(readFileSync(new URL('../q/volatility.html', import.meta.url), 'utf8'), /national\/data\/index\.json'/, 'Volatility reads the brief, not the index');
});

test('data: countries, their codes and leaders, every indicator, and a series file for each country', () => {
  const n = read('national/data/index.json'), has = f => n.countries.filter(f).length;
  // October 2026: 217 World Bank economies; 215 with an ISO numeric code (Kosovo and the Channel Islands have none)
  // and a Wikidata item; 182 with a Gleditsch–Ward code (from the Retrospective, or else the countrycode list); 76 with
  // leadership data from the Retrospective. Well below that is a source that failed.
  assert.ok(n.countries.length >= 200 && n.countries.every(c => /^[A-Z]{3}$/.test(c.iso3)), `${n.countries.length} countries`);
  assert.ok(has(c => c.num) >= 200 && has(c => /^Q\d+$/.test(c.qid)) >= 200, 'ISO numeric codes and Wikidata items');
  assert.ok(has(c => c.gw != null) >= 160, `${has(c => c.gw != null)} countries with a GW code`);
  assert.ok(has(c => c.leadership) >= 65, `${has(c => c.leadership)} countries with leadership data`);
  // Every indicator has values for at least 50 countries (central government debt, the sparsest, has 109).
  assert.ok(n.indicators.length >= 30, `${n.indicators.length} indicators`);
  for (const i of n.indicators) if (!ARCHIVED.has(i.code)) assert.ok(has(c => c.latest?.[i.code]) >= 50, `${i.code}: ${has(c => c.latest?.[i.code])} countries`);
  // The series behind each latest value.
  for (const c of n.countries) {
    const s = read(`national/data/series/${c.iso3}.json`);
    for (const code of Object.keys(c.latest)) assert.ok(s[code]?.length, `${c.iso3}: no ${code} series`);
  }
});

test('map, profile and comparison work', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/national`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr', { timeout: 20000 });
  const rows = await page.locator('#rows tr').count();
  const coloured = await page.locator('#map path[fill]:not([fill="#1b2833"])').count();
  await page.goto(`${BASE}/q/national#country=FRA`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dims .ind', { timeout: 20000 });
  const profile = await page.locator('#profile').innerText();
  await page.goto(`${BASE}/q/national#compare=FRA,DEU,GBR`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cmpsvg path[stroke-width="2"]', { timeout: 20000 });
  const cmpCols = await page.locator('#compare thead th').count();
  await browser.close();
  assert.ok(rows > 200, `rows: ${rows}`);
  assert.ok(coloured > 150, `coloured countries: ${coloured}`);
  assert.match(profile, /semi-presidential/i);
  assert.match(profile, /average time in office/i);
  assert.match(profile, /armed conflicts per year/i);
  assert.match(profile, /rule of law/i);
  assert.equal(cmpCols, 4);
  assert.deepEqual(errors, []);
});

test('compare: countries are added and removed on the Compare page itself', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/national#compare`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#cmpadd', { timeout: 20000 });
  const names = () => page.locator('#compare thead th a.cname').allTextContents(); // as written: the heading shows them in capitals
  const count = n => page.waitForFunction(k => document.querySelectorAll('#compare thead th a.cname').length === k, n, { timeout: 10000 });
  const add = async text => { await page.fill('#cmpq', text); await page.press('#cmpq', 'Enter'); };
  // Nothing chosen yet: the box is there, with every country on offer.
  assert.deepEqual(await names(), []);
  assert.ok(await page.locator('#cmplist option').count() > 200, 'every country is offered');
  assert.equal(await page.textContent('#cmpmsg'), '0 of 4 chosen');
  // A name in full, in any case; then the start of a name that only one country has.
  await add('france'); await count(1);
  await add('Germ'); await count(2);
  assert.deepEqual(await names(), ['France', 'Germany']);
  assert.equal(await page.evaluate(() => location.hash), '#compare=FRA,DEU');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmpq', 'the box keeps the focus for the next country');
  assert.equal(await page.locator('#cmplist option[value="France"]').count(), 0, 'a chosen country is no longer offered');
  // What cannot be added says why, and changes nothing.
  await add('zzzz');
  assert.match(await page.textContent('#cmpmsg'), /^No country matches “zzzz”\.$/);
  await add('France');
  assert.equal(await page.textContent('#cmpmsg'), 'France is already in the comparison.');
  await add('Ko');
  assert.match(await page.textContent('#cmpmsg'), /^Several match: Korea, Rep\., .*Kosovo\. Type more of the name\.$/);
  assert.deepEqual(await names(), ['France', 'Germany']);
  // A name that is also the start of another (Niger, Nigeria) means the country of that name.
  await add('Niger'); await count(3);
  await add('Japan'); await count(4);
  assert.deepEqual(await names(), ['France', 'Germany', 'Niger', 'Japan']);
  // Four is the limit: the box is switched off until one is removed, here on the page.
  assert.equal(await page.isDisabled('#cmpq'), true);
  assert.equal(await page.getAttribute('#cmpq', 'placeholder'), 'Four chosen: remove one to add another');
  await page.click('#compare [data-rm="DEU"]'); await count(3);
  assert.equal(await page.isDisabled('#cmpq'), false);
  assert.equal(await page.textContent('#ccount'), '3');
  assert.equal(await page.evaluate(() => location.hash), '#compare=FRA,NER,JPN');
  // The ranking's ticks follow what was chosen here.
  await page.click('#tab-btn-map');
  await page.waitForSelector('#rows [data-cmp="NER"]');
  assert.deepEqual(await page.$$eval('#rows [data-cmp]:checked', bs => bs.map(b => b.dataset.cmp).sort()), ['FRA', 'JPN', 'NER']);
  await browser.close();
  assert.deepEqual(errors, []);
});
