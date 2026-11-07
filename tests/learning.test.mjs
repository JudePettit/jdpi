// Learning: the Finance and Economics (Money Management) and Politics (Retrospective Geopolitics) courses render,
// quizzes respond, progress saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';
import { fileURLToPath } from 'node:url';
import { THINKERS, SPECTRUM_SCHOOL, spectrumTag } from '../lake/scripts/thinkers.mjs';
import { learning } from '../lake/scripts/adapters.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('politics: realism is taught as a school of its own, outside the line from left to right', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  assert.deepEqual(units.map(u => u.split(' · ')[0]), ['Introduction', 'Far left', 'Left wing', 'Centre', 'Right wing', 'Outside the spectrum', 'Far right', 'Comparing the spectrum'], 'the units, in their places');
  assert.equal(units[4], 'Right wing · Conservatism and market liberalism');
  assert.match(units[5], /Mearsheimer and the Realists/);
  // No sentence, heading, table cell or answer files the Realists or realism under the right.
  for (const line of md.split('\n')) assert.doesNotMatch(line, /\bright( wing)?\s*\((Realists?|Mearsheimer)|realism is closer to the right|the right is represented by|^# Right wing.*Realis/i, line);
  // The quiz on the crisis: its right answer is the Realists, not a place on the line.
  const crisis = md.slice(md.indexOf('? Which of these would most stress the balance of power'));
  assert.match(crisis.split('\n').find(l => l.startsWith('+ ')), /^\+ The Realists$/);
  // The Master Index takes its spectrum tag from the unit: Realists only, and none of them "Right wing".
  assert.equal(spectrumTag(units[5], ['Realist', 'Offensive realism']), 'Sui generis (Realist)');
  assert.equal(spectrumTag(units[5], ['Liberal institutionalist']), null, 'a critic taught in the unit takes no position from it');
  assert.equal(spectrumTag(units[6], ['Fascist', 'Far right']), 'Far right');
  assert.equal(spectrumTag(units[6], ['Historian', 'Scholar of fascism']), null, 'a scholar taught in the unit takes no position from it');
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning-politics').description;
  assert.doesNotMatch(desc, /right \(Mearsheimer/i);
  assert.match(desc, /Realists/);
  assert.match(desc, /right \(conservatism and market liberalism\)/);
});

test('politics: the mainstream right has its unit, in the form of the others, with no realist and no far right in it', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const unitOf = title => { const at = md.indexOf(`\n# ${title}`); return md.slice(at + 1, md.indexOf('\n# ', at + 1)); };
  const right = unitOf('Right wing · '), farLeft = unitOf('Far left · ');
  const heads = u => u.split('\n').filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/\b(the far left|the right)\b/gi, 'X'));
  assert.deepEqual(heads(right), ['## Thinkers of X', '### Shared commitments', '## X in power and its critics', '### What critics say', '### What defenders say']);
  assert.deepEqual(heads(right), heads(farLeft), 'the same headings as the far left');
  for (const name of ['Burke', 'Hayek', 'Friedman', 'Oakeshott', 'Buckley', 'Thatcher', 'Reagan', 'Kirk', 'Scruton']) assert.match(right, new RegExp(`\\*\\*[^*]*${name}`), `${name} is taught`);
  assert.match(right, /\*\*Neoliberalism\.\*\*.*used mostly by critics/);
  // Every lesson ends in a quiz with one right answer, as in the other units.
  for (const lesson of right.split('\n## ').slice(1)) {
    const qs = lesson.split('\n? ').slice(1);
    assert.ok(qs.length >= 1, 'a quiz');
    for (const q of qs) assert.equal(q.split('\n').filter(l => l.startsWith('+ ')).length, 1, q.split('\n')[0]);
  }
  // No realist under the right, and the far right stays in its own unit.
  assert.doesNotMatch(right, /Mearsheimer|Morgenthau|Waltz|Kissinger|Thucydides|Machiavelli|Hobbes|offensive realism|Mussolini|Hitler|fascis|Le Pen|Mudde/i);
  // The comparison has its five positions back, in order, with the Realists apart at the end.
  const head = md.split('\n').find(l => l.startsWith('| Question |'));
  assert.equal(head, '| Question | Far left | Left | Centre | Right | Far right | Realists (outside the line) |');
  const crisis = unitOf('Comparing the spectrum').slice(unitOf('Comparing the spectrum').indexOf('## A crisis'));
  assert.deepEqual([...crisis.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]), ['Far left', 'Left', 'Centre', 'Right', 'Far right', 'Realists (Mearsheimer)']);
  const table = unitOf('Comparing the spectrum').split('\n## ')[1];
  assert.match(table.split('\n').find(l => l.startsWith('+ ')), /^\+ Right$/);
  // The Master Index: the unit gives "Right wing" to the right's own thinkers and schools only.
  const unit = 'Right wing · Conservatism and market liberalism';
  assert.equal(spectrumTag(unit, ['Conservative', 'Right wing', 'Philosopher']), 'Right wing');
  for (const tags of [['Realist', 'Classical realism'], ['Liberal', 'Left wing', 'Philosopher'], ['School of thought', 'Centre right'], ['Third Way', 'Centrist']]) assert.equal(spectrumTag(unit, tags), null, tags.join(', '));
  // A thinker of the right named in another unit (Thatcher in a quiz on the left) takes no position from it.
  assert.equal(spectrumTag('Left wing · Social democracy and progressive liberalism', ['Conservative', 'Right wing', 'Head of government']), null);
});

test('politics: a unit gives its position to its own school only, never to the scholars and critics it teaches', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  const farRight = units.find(u => u.startsWith('Far right · '));
  const tagsOf = name => THINKERS.find(t => t[0] === name)[2];
  // Mudde, Paxton and Griffin are taught in the far right's unit as its scholars: they take no position from it.
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) assert.equal(spectrumTag(farRight, tagsOf(name)), null, name);
  for (const name of ['Benito Mussolini', 'Adolf Hitler', 'Jean-Marie Le Pen', 'Fascism']) assert.equal(spectrumTag(farRight, tagsOf(name)), 'Far right', name);
  // In every unit, everyone the Master Index places there belongs to that position's school.
  const mentions = learning({ jdpiDir: fileURLToPath(new URL('..', import.meta.url)) }).filter(x => x.module === 'learning-politics');
  const placed = mentions.flatMap(x => x.tags.filter(t => t[0] === 'Political spectrum').map(t => [x.label, t[1], x.tags.map(g => g[1])]));
  assert.ok(placed.length >= 60, `${placed.length} placed`);
  for (const [label, s, tags] of placed) assert.ok(SPECTRUM_SCHOOL[s].some(t => tags.includes(t)), `${label} takes ${s} without belonging to its school`);
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) assert.ok(mentions.some(x => x.label === name) && !placed.some(p => p[0] === name), `${name} is taught and placed nowhere`);
  // Beveridge's report is a wrong answer in a quiz on the centre: he stays the left's only.
  assert.deepEqual([...new Set(placed.filter(p => p[0] === 'William Beveridge').map(p => p[1]))], ['Left wing']);
});

test('politics: the crisis lesson is titled for its six answers (Kino\'s link to it: tests/kino.test.mjs)', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const heads = md.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3));
  assert.ok(heads.includes('A crisis seen six ways') && !heads.some(h => /five ways/.test(h)), 'the new title');
  assert.ok(heads.includes('Five answers to the same questions'), 'the comparison table keeps its title');
  const crisis = md.slice(md.indexOf('## A crisis seen six ways')).split('\n## ')[0].split('\n? ')[0];
  assert.equal([...crisis.matchAll(/^- \*\*/gm)].length, 6, 'six answers');
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
