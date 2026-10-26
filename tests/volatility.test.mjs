// Geopolitical Volatility: data is fresh, and the map, country page and comparison render.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('index data is recent and scores countries', async () => {
  const d = await (await fetch(`${BASE}/volatility/data/index.json`)).json();
  const age = (Date.now() - Date.parse(d.latest + 'T00:00:00Z')) / 864e5;
  const scored = Object.values(d.countries).filter(c => c.latest?.score != null);
  assert.ok(age < 4, `latest day ${d.latest}`);
  assert.ok(scored.length >= 40, `scored: ${scored.length}`);
  assert.ok(scored.every(c => c.latest.score >= 0 && c.latest.score <= 100));
  assert.equal(d.components.reduce((s, c) => s + c.weight, 0).toFixed(2), '1.00');
});

test('map, country page and comparison work', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/q/volatility`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr', { timeout: 20000 });
  const rows = await page.locator('#rows tr').count();
  const options = await page.locator('#metric option').count();
  await page.goto(`${BASE}/q/volatility#country=UKR`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#profile .stat', { timeout: 20000 });
  const profile = await page.locator('#profile').innerText();
  await page.goto(`${BASE}/q/volatility#tab=compare&compare=UKR,ISR,USA`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#compare table', { timeout: 20000 });
  const cmpCols = await page.locator('#compare thead th').count();
  await browser.close();
  assert.ok(rows >= 40, `rows: ${rows}`);
  assert.ok(options >= 18, `metrics: ${options}`);
  assert.match(profile, /30-day volatility/i);
  assert.match(profile, /political stability/i);
  assert.match(profile, /components/i);
  assert.equal(cmpCols, 4);
  assert.deepEqual(errors, []);
});
