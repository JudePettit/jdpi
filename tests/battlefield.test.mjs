// Realtime and Retrospective Battlefield (runs against JDPI_URL, default live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

async function open(path) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { browser, page, errors };
}

test('Realtime: live view lists extant wars and plots events; a war opens its briefing', async () => {
  const { browser, page, errors } = await open('q/battlefield?view=live');
  await page.waitForSelector('.warrow', { timeout: 20000 });
  const wars = await page.locator('.warrow').count();
  const markers = await page.locator('path.leaflet-interactive').count();
  await page.locator('.warrow').first().click();
  await page.waitForSelector('.detail h2');
  const briefing = await page.locator('.detail').innerText();
  await browser.close();
  assert.ok(wars >= 10, `wars: ${wars}`);
  assert.ok(markers >= 100, `markers: ${markers}`);
  assert.match(briefing, /deaths/);
  assert.match(briefing, /background/i);
  assert.deepEqual(errors, []);
});

test('Realtime: archive view shows a month with an insight per war', async () => {
  const { browser, page, errors } = await open('q/battlefield?view=archive&month=2026-03');
  await page.waitForSelector('.arow', { timeout: 20000 });
  const month = await page.locator('#month').inputValue();
  const rows = await page.locator('.arow').count();
  const first = await page.locator('.arow p').first().innerText();
  await browser.close();
  assert.equal(month, '2026-03');
  assert.ok(rows >= 10, `rows: ${rows}`);
  assert.match(first, /^March: .* events, about .* deaths/);
  assert.deepEqual(errors, []);
});

test('Retrospective: 1939 shows World War II; 2025 shows dozens of conflicts', async () => {
  const { browser, page, errors } = await open('battlefield/history/#y=1939');
  await page.waitForSelector('#panel .war', { timeout: 20000 });
  const y1939 = await page.locator('#panel').innerText();
  await page.evaluate(() => { location.hash = '#y=2025'; });
  await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2025');
  const n2025 = await page.locator('#panel .war').count();
  const red = await page.locator('path.shape[fill="var(--c-war)"]').count();
  await browser.close();
  assert.match(y1939, /World War II/);
  assert.ok(n2025 >= 40, `2025 conflicts: ${n2025}`);
  assert.ok(red >= 5, `countries at war: ${red}`);
  assert.deepEqual(errors, []);
});
