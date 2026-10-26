// Political Calendar: event types, month jump, year view and country highlighting (runs against JDPI_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('Feb 2022 shows the invasion of Ukraine; highlighting and the year view work', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/calendar?period=2020s&month=2022-02`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.eventrow', { timeout: 20000 });
  const feb = await page.locator('#eventrows').innerText();
  const filters = await page.locator('.filter').count();
  await page.fill('#countrypick', 'Ukraine');
  await page.click('#countryadd');
  const countries = new Set(await page.locator('.eventcountry').allInnerTexts().then(t => t.map(x => x.split(' · ')[0])));
  await page.click('.viewbtn[data-view=year]');
  const months = await page.locator('.ymonth').count();
  const url = page.url();
  await browser.close();
  assert.match(feb, /Russia launches full-scale invasion of Ukraine/);
  assert.ok(filters >= 8, `filters: ${filters}`);
  assert.deepEqual([...countries], ['Ukraine']);
  assert.equal(months, 12);
  assert.match(url, /countries=Ukraine/);
  assert.deepEqual(errors, []);
});
