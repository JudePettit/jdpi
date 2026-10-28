// Encyclopaedia: Boolean tag Explorer, entity pages with links into modules, and the cross-suite linker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('a Boolean tag query finds John Mearsheimer, and his page links to where he appears', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/encyclopedia/index.html#explore`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr td', { timeout: 30000 });
  const total = await page.locator('#count').innerText();
  await page.fill('#query', 'Realist + "Structural realism" + American + "Political science"');
  await page.waitForTimeout(600);
  const names = await page.locator('#rows .name a').allInnerTexts();
  const err = await page.locator('#qerr').isVisible();
  // NOT and OR
  await page.fill('#query', 'Realist - "Offensive realism"');
  await page.waitForTimeout(600);
  const withoutOffensive = await page.locator('#rows .name a').allInnerTexts();
  await page.fill('#query', '"Austrian School" | "Chicago School"');
  await page.waitForTimeout(600);
  const either = await page.locator('#rows .name a').allInnerTexts();
  // Facet filter (Excel-style)
  await page.fill('#query', '');
  await page.locator('.facet button[data-toggle="Type"]').count();
  await page.goto(`${BASE}/encyclopedia/index.html#explore?q=${encodeURIComponent('Realist + "Structural realism" + American + "Political science"')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#rows .name a');
  await page.locator('#rows .name a', { hasText: 'Mearsheimer' }).click();
  await page.waitForSelector('.ment a', { timeout: 15000 });
  const entity = await page.locator('#entity').innerText();
  const links = await page.locator('.ment a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  await browser.close();
  assert.match(total, /\d/);
  assert.ok(names.some(n => /Mearsheimer/.test(n)), `results: ${names.join(', ')}`);
  assert.ok(names.some(n => /Waltz|Walt/.test(n)), 'other structural realists also match');
  assert.equal(err, false);
  assert.ok(!withoutOffensive.some(n => /Mearsheimer/.test(n)) && withoutOffensive.some(n => /Morgenthau/.test(n)), 'NOT excludes offensive realists');
  assert.ok(either.some(n => /Hayek|Mises/.test(n)) && either.some(n => /Friedman/.test(n)), 'OR combines schools');
  assert.match(entity, /appears in prp/i);
  assert.ok(links.some(h => /learning\.html\?course=politics/.test(decodeURIComponent(h))), 'links to the Politics lesson');
  assert.deepEqual(errors, []);
});

test('other modules link names into the Encyclopaedia', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.goto(`${BASE}/q/calendar?period=2020s&month=2022-02`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.eventrow', { timeout: 20000 });
  // Badges arrive shard by shard as the linker resolves titles; wait for several rather than the first.
  await page.waitForFunction(() => document.querySelectorAll('a.jdpi-ency').length >= 3, null, { timeout: 15000 }).catch(() => {});
  const n = await page.locator('a.jdpi-ency').count();
  const href = await page.locator('a.jdpi-ency').first().getAttribute('href');
  await browser.close();
  assert.ok(n >= 3, `badges: ${n}`);
  assert.match(href, /encyclopedia\/index\.html#Q\d+/);
});
