// National Analysis: map, country profile (overview + PESTLE), and side-by-side comparison.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('map, profile and comparison work', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
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
  await page.waitForSelector('#cmpsvg path', { timeout: 20000 });
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
