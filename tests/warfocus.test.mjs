// War Focus (Retrospective Battlefield submodule): data covers the major wars, and the page plays a war month by month.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('index lists the major wars with Wikidata IDs and deaths', async () => {
  const d = await (await fetch(`${BASE}/battlefield/focus/data/index.json`)).json();
  const ids = d.wars.map(w => w.id);
  for (const id of ['ww2', 'korean-war', 'vietnam-war', 'iran-iraq', 'russia-ukraine']) assert.ok(ids.includes(id), id);
  assert.ok(d.wars.length >= 35, `wars: ${d.wars.length}`);
  assert.ok(d.wars.every(w => /^Q\d+$/.test(w.qid) && w.totalDeaths > 0), 'every war has a QID and deaths');
  const ww2 = d.wars.find(w => w.id === 'ww2');
  assert.ok(ww2.mappedBattles > 500, `WWII mapped battles: ${ww2.mappedBattles}`);
});

test('WWII plays month by month with sides, occupation and battles', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1940-07`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('path.state.side-b', { timeout: 20000 });
  const july40 = { date: await page.locator('#date').innerText(), occupied: await page.locator('path.state.occ-b').count(), usAllied: await page.evaluate(() => [...document.querySelectorAll('path.state.side-a')].length) };
  await page.locator('#next').click(); await page.locator('#next').click();
  const sept40 = await page.locator('#date').innerText();
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1942-01`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'January 1942', null, { timeout: 20000 });
  const jan42 = { battles: await page.locator('circle.battle').count(), panel: await page.locator('#panel').innerText(), qids: await page.locator('#panel [data-qid]').count() };
  await browser.close();
  assert.equal(july40.date, 'July 1940');
  assert.equal(sept40, 'September 1940');
  assert.ok(july40.occupied >= 6, `occupied countries July 1940: ${july40.occupied}`);
  assert.ok(jan42.battles > 100, `battles shown: ${jan42.battles}`);
  assert.match(jan42.panel, /United States/);
  assert.ok(jan42.qids > 3, 'battles carry Wikidata IDs for the Encyclopaedia linker');
  assert.deepEqual(errors, []);
});

test('Russia–Ukraine shows UCDP clashes and a running death toll; Battlefield links to War Focus', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=russia-ukraine&m=2022-03`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('circle.cell', { timeout: 20000 });
  const cells = await page.locator('circle.cell').count();
  const total = await page.locator('#c-total').innerText();
  await page.goto(`${BASE}/battlefield/history/#y=1950&w=u235`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href*="../focus/index.html#war=korean-war"]', { timeout: 20000 });
  await browser.close();
  assert.ok(cells > 50, `clash cells: ${cells}`);
  assert.ok(+total.replace(/,/g, '') > 1000, `deaths so far: ${total}`);
  assert.deepEqual(errors, []);
});
