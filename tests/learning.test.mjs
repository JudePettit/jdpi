// Learning: the Finance and Economics (Money Management) and Politics (Retrospective Geopolitics) courses render,
// quizzes respond, progress saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('each course renders its lessons and quiz, in the right suite', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const seen = {};
  for (const [course, suite, mustSay] of [['finance', 'mm', /Compounding/], ['economics', 'mm', /werner/i], ['politics', 'rs', /mearsheimer/i]]) {
    await page.goto(`${BASE}/fe/learning?course=${course}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#toc button', { timeout: 20000 });
    const toc = await page.locator('#toc').innerText();
    seen[course] = {
      lessons: await page.locator('#toc button').count(),
      suite: await page.evaluate(() => document.documentElement.dataset.suite),
      tabs: await page.locator('.tabs a:not([hidden])').count(),
      mentions: mustSay.test(toc),
    };
  }
  // Answer a quiz question and mark a lesson complete.
  await page.goto(`${BASE}/fe/learning?course=finance`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.q .opt');
  await page.locator('.q').first().locator('.opt').first().click();
  const marked = await page.locator('.q').first().locator('.opt.right').count();
  const why = await page.locator('.q').first().locator('.why').isVisible();
  await page.click('#mark');
  const progress = await page.locator('#progress-label').innerText();
  await browser.close();
  assert.ok(seen.finance.lessons >= 20 && seen.economics.lessons >= 12 && seen.politics.lessons >= 10, JSON.stringify(seen));
  assert.equal(seen.finance.suite, 'mm');
  assert.equal(seen.politics.suite, 'rs');
  assert.equal(seen.finance.tabs, 2);
  assert.equal(seen.politics.tabs, 1);
  assert.ok(seen.economics.mentions && seen.politics.mentions);
  assert.equal(marked, 1);
  assert.ok(why);
  assert.match(progress, /^1 of/);
  assert.deepEqual(errors, []);
});
