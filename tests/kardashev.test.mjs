// Kardashev Tracker: century slider, map bubbles, ranking and chart (runs against JDPI_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('AD 1 is led by Rome and Han; 2025 by China, with K ≈ 0.73', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/kardashev/#y=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.rank[data-id]', { timeout: 20000 });
  const ad1 = await page.locator('.rank[data-id]').evaluateAll(els => els.slice(0, 2).map(e => e.dataset.id));
  const bubbles = await page.locator('circle.bubble').count();
  const areas = await page.locator('#chart path').count();
  await page.locator('#step').fill('43'); await page.locator('#step').dispatchEvent('input');
  const top2025 = await page.locator('.rank[data-id]').first().getAttribute('data-id');
  const k = await page.locator('#kval').innerText();
  await page.locator('.rank[data-id]').first().click();
  const detail = await page.locator('#panel').innerText();
  await browser.close();
  assert.deepEqual(ad1.sort(), ['han', 'rome']);
  assert.ok(bubbles >= 4, `bubbles: ${bubbles}`);
  assert.ok(areas >= 10, `chart areas: ${areas}`);
  assert.equal(top2025, 'prc');
  assert.match(k, /K 0\.7[23]/);
  assert.match(detail, /largest estimated share/);
  assert.deepEqual(errors, []);
});
