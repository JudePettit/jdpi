// Learning: the Finance and Economics (Money Management) and Politics (Retrospective Geopolitics) courses render,
// quizzes respond, progress saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';
import { spectrumTag } from '../lake/scripts/thinkers.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('politics: realism is taught as a school of its own, outside the line from left to right', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  assert.deepEqual(units.map(u => u.split(' · ')[0]), ['Introduction', 'Far left', 'Left wing', 'Centre', 'Outside the spectrum', 'Far right', 'Comparing the spectrum'], 'the units, in their places');
  assert.match(units[4], /Mearsheimer and the Realists/);
  // No sentence, heading, table cell or answer files the Realists or realism under the right.
  for (const line of md.split('\n')) assert.doesNotMatch(line, /\bright( wing)?\s*\((Realists?|Mearsheimer)|realism is closer to the right|the right is represented by|^# Right wing/i, line);
  // The quiz on the crisis: its right answer is the Realists, not a place on the line.
  const crisis = md.slice(md.indexOf('? Which of these would most stress the balance of power'));
  assert.match(crisis.split('\n').find(l => l.startsWith('+ ')), /^\+ The Realists$/);
  // The Master Index takes its spectrum tag from the unit: Realists only, and none of them "Right wing".
  assert.equal(spectrumTag(units[4], ['Realist', 'Offensive realism']), 'Sui generis (Realist)');
  assert.equal(spectrumTag(units[4], ['Liberal institutionalist']), null, 'a critic taught in the unit takes no position from it');
  assert.equal(spectrumTag(units[5], ['Fascist']), 'Far right');
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning-politics').description;
  assert.doesNotMatch(desc, /right \(Mearsheimer/i);
  assert.match(desc, /Realists/);
});

test('each course renders its lessons and quiz, in the right suite', pageTest, async () => {
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
