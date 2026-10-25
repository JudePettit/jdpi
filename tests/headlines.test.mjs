// Country Headlines: top stories per outlet from Supabase (runs against JDPI_URL, default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
