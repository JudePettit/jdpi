// Trader Tracker: House trades (filters, member view) and 13F investors (runs against JDPI_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('Congress trades filter by member and ticker; investors show 13F holdings', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/fe/traders?tab=congress`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#trades tr td', { timeout: 20000 });
  const rows = await page.locator('#trades tr').count();
  await page.fill('#member-search', 'Pelosi');
  await page.locator('.member', { hasText: 'Pelosi' }).click();
  await page.selectOption('#f-days', '9999');
  const title = await page.locator('#trades-title').innerText();
  const pelosi = await page.locator('#trades').innerText();
  await page.click('.tabs button[data-tab=investors]');
  await page.locator('.card', { hasText: 'Warren Buffett' }).click();
  const detail = await page.locator('#investor-detail').innerText();
  await browser.close();
  assert.ok(rows > 50, `rows: ${rows}`);
  assert.match(title, /Pelosi/);
  assert.match(pelosi, /Spouse/);
  assert.match(detail, /BERKSHIRE|Berkshire/);
  assert.match(detail, /APPLE|Apple|AMERICAN EXPRESS|American Express/);
  assert.deepEqual(errors, []);
});
