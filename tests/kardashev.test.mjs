// Kardashev Tracker: century slider, map bubbles, ranking and chart (runs against JDPI_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { pageTest, launch } from './tools/pages.mjs';

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

test('a period compares its two ends: 1500 to 1900, rings for the start, a change column; the start handle on the end is one step', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/kardashev/#y=1900&f=1500`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.rank[data-id]', { timeout: 20000 });
  const period = {
    big: await page.locator('#year-big').innerText(),
    label: (await page.locator('#year-label').textContent()).trim(), // textContent: the CSS upper-cases it
    k: await page.locator('#kval').innerText(),
    h2: await page.locator('#panel h2').innerText(),
    rings: await page.locator('circle.ring-a').count(),
    regions: await page.locator('#panel .regrow').count(),
  };
  await page.locator('#tab-table').click();
  const head = await page.locator('#table-head th').allInnerTexts();
  await page.locator('#step-from').focus();
  await page.keyboard.press('End'); // the start pushed to the last step takes the end along: one step, 2025
  const one = { big: await page.locator('#year-big').innerText(), hash: await page.evaluate(() => location.hash), rings: await page.locator('circle.ring-a').count() };
  assert.deepEqual([period.big, period.label, period.h2], ['1500–1900', 'Period', '1500 to 1900']);
  assert.match(period.k, /^K 0\.\d\d → 0\.\d\d$/);
  assert.ok(period.rings >= 4, `rings: ${period.rings}`);
  assert.ok(period.regions >= 4, `regions: ${period.regions}`);
  assert.ok(head.some(h => /share 1500/i.test(h)) && head.some(h => /change/i.test(h)), head.join(' | '));
  assert.deepEqual(one, { big: '2025', hash: '#y=2025&v=table', rings: 0 });
  assert.deepEqual(errors, []);
});

// On a phone the year and the rating stack, at rest and in a period alike: side by side, a period's longer figures
// pushed the page sideways, and its longer line under the rating dropped the timeline and the map mid-drag.
test('a period on a phone: nothing scrolls sideways and the timeline stays where it was', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/kardashev/#y=-1000`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.rank[data-id]', { timeout: 20000 });
  await page.waitForSelector('.jdpi-returnbar', { timeout: 15000 }); // prp-bar.js adds it after load, moving the page down
  await page.evaluate(() => document.fonts.ready);
  const track = () => page.evaluate(() => { const r = document.querySelector('#timeline .prp-period-range').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  const rest = await track();
  await page.locator('#step-from').focus();
  await page.keyboard.press('ArrowLeft'); // a drag's first move
  const first = await track();
  for (let k = 1; k < 10; k++) await page.keyboard.press('ArrowLeft'); // on to 2000 BC, the widest figures
  const period = await track();
  assert.equal(await page.locator('#year-big').textContent(), '2000 BC–1000 BC');
  assert.deepEqual(first, rest, 'the first move');
  assert.deepEqual(period, rest, 'the period opened');
  assert.equal(rest.sideways, 0);
  assert.deepEqual(errors, []);
});
