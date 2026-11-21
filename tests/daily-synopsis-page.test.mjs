// Daily Synopsis's page, in Microsoft Edge: the label in the page and in its metadata, for a day written by the model
// and for days of headlines alone; the day controls (earlier, later, the list of all days, the address #day=…); the
// 5 Sided Analysis's heading and its five sides in order, a side with no outlet saying so in words; the sides stacked
// in order at 390 and 360 pixels with no sideways scroll, in light and dark; the keyboard; no Documentary button.
// The made-up days of tests/fixtures/daily-synopsis (?data=fixture), and the committed days for the freshness line.
// npm run test:e2e -- tests/daily-synopsis-page.test.mjs serves the site locally and sets JDPI_URL; without it these skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';
import { LABEL, meta } from '../daily-synopsis/lib/day.mjs';

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/daily-synopsis-page.test.mjs)' };
const FIX = `${BASE}/daily-synopsis/index.html?data=fixture`;
const SIDES = ['far_left', 'left', 'centre', 'right', 'far_right'];

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  return errors;
}
const shown = (page, day) => page.waitForFunction(d => document.querySelector('#day')?.value === d && document.querySelectorAll('#stories > li.story').length > 0 && /stor(y|ies)/.test(document.querySelector('#status')?.textContent || ''), day, { timeout: 30000 });
const authorship = page => page.evaluate(() => ({ meta: document.querySelector('meta[name="vm-authorship"]').content, text: document.querySelector('#authorship').textContent, html: document.documentElement.dataset.authorship }));

test('page: a written day and days of headlines alone, each labelled in the page and its metadata; the day controls', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = watch(page);
  await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
  await shown(page, '2026-11-17');
  assert.equal(await page.isVisible('#fixture'), true, 'the test-fixture notice');
  assert.match(await page.textContent('#fixture'), /Test fixture/);
  let a = await authorship(page);
  assert.equal(a.meta, meta('model'));
  assert.equal(a.html, 'model');
  assert.ok(a.text.includes(LABEL.model), 'the model label, before the first sentence');
  assert.equal(await page.isVisible('#lead'), true);
  const order = await page.evaluate(() => { const l = document.querySelector('#label'), d = document.querySelector('#lead'); return !!(l.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING); });
  assert.ok(order, 'the label comes before the written text');
  assert.equal(await page.locator('#stories > li.story').count(), 3);
  assert.match(await page.textContent('#stories > li.story:first-child .digest'), /Ruritania’s parliament passed the 2027 budget/);
  assert.equal(await page.locator('#unavailable').count(), 0);
  assert.doesNotMatch(await page.textContent('#label'), /null|undefined/, 'no empty value printed');
  // Every link on the page is https or an address on the page itself.
  const hrefs = await page.$$eval('#main a', as => as.map(x => x.getAttribute('href')));
  assert.ok(hrefs.every(h => /^https:\/\//.test(h) || /^#day=\d{4}-\d{2}-\d{2}&h=s\d+-\d+$/.test(h) || h === '#positions'), hrefs.join(' '));
  assert.equal(await page.getByRole('button', { name: /documentary/i }).count(), 0, 'no Documentary button');
  assert.doesNotMatch(await page.textContent('body'), /Documentary/);

  // Later: 18 November, whose draft was refused: the rules label and the one plain line.
  assert.equal(await page.isDisabled('#later'), false);
  await page.click('#later');
  await shown(page, '2026-11-18');
  assert.match(page.url(), /#day=2026-11-18$/);
  a = await authorship(page);
  assert.equal(a.meta, meta('rules'));
  assert.ok(a.text.includes(LABEL.rules));
  assert.equal(await page.textContent('#unavailable'), LABEL.unavailable);
  assert.equal(await page.isVisible('#lead'), false);
  assert.equal(await page.locator('.digest').count(), 0, 'no sentence of VM\'s: the outlets\' headlines alone');
  assert.equal(await page.isDisabled('#later'), true, 'the newest day');
  // The list of all days, newest first; the address of a day.
  assert.deepEqual(await page.$$eval('#day option', os => os.map(o => o.value)), ['2026-11-18', '2026-11-17', '2026-11-16']);
  assert.deepEqual(await page.$$eval('#all a', as => as.map(x => x.getAttribute('href'))), ['#day=2026-11-18', '#day=2026-11-17', '#day=2026-11-16']);
  await page.click('#all a[href="#day=2026-11-16"]');
  await shown(page, '2026-11-16');
  assert.equal(await page.isDisabled('#earlier'), true, 'the oldest day');
  assert.equal(await page.textContent('#unavailable'), LABEL.unavailable, 'no draft: the same plain line');
  await page.selectOption('#day', '2026-11-17');
  await shown(page, '2026-11-17');
  assert.match(page.url(), /#day=2026-11-17$/);
  // A day straight from its address, in a new tab.
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto(`${FIX}#day=2026-11-16`, { waitUntil: 'domcontentloaded' });
  await shown(p2, '2026-11-16');
  await p2.close();
  assert.deepEqual(errors, []);
});

test('page: the 5 Sided Analysis: its heading, five sides in order by name, a side with none saying so, the not-proof line', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = watch(page);
  await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
  await shown(page, '2026-11-17');
  const stories = page.locator('#stories > li.story');
  for (let k = 0; k < 3; k++) {
    const s = stories.nth(k);
    assert.equal(await s.locator('h3').textContent(), '5 Sided Analysis');
    assert.deepEqual(await s.locator('.sides > li').evaluateAll(ls => ls.map(l => l.dataset.side)), SIDES);
    assert.deepEqual((await s.locator('.side-h').allTextContents()).map(x => x.replace(/\s·.*$/, '').trim()), ['Far left', 'Left', 'Centre', 'Right', 'Far right'], 'each side named in words');
    assert.equal(await s.locator('.not-proof').textContent(), LABEL.notProof);
  }
  // The flood story: no far-left and no far-right outlet; each says so in words, and the others have their headline.
  const floods = stories.nth(1);
  assert.equal(await floods.locator('.side-far_left .no-side').textContent(), LABEL.noSide);
  assert.equal(await floods.locator('.side-far_right .no-side').textContent(), LABEL.noSide);
  assert.match(await floods.locator('.side-far_left .count').textContent(), /0 outlets/);
  assert.equal(await floods.locator('.side-right .headline').count(), 1);
  assert.match(await floods.locator('.side-right .headline').textContent(), /⚠/, 'the caution flag beside its outlet');
  assert.match(await floods.locator('.closing').textContent(), /Left and right of centre alike/);
  // The budget story: a written sentence on each side, and the comparison.
  const budget = stories.nth(0);
  assert.equal(await budget.locator('.side .written').count(), 5);
  assert.match(await budget.locator('.closing').textContent(), /^Left and right of centre: Left of centre the headlines put the hospital cuts first, while right of centre they put the tax cuts/);
  // The summit story: not one to compare, and it says why.
  assert.equal(await stories.nth(2).locator('.five-note').textContent(), LABEL.fiveNotEligible);
  assert.equal(await stories.nth(2).locator('.written').count(), 0);
  // A cited headline: its link goes to the headline, by keyboard.
  const cite = budget.locator('.digest .cites a').first();
  const href = await cite.getAttribute('href');
  await cite.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(h => document.activeElement?.id === `h-2026-11-17-${h.split('&h=')[1]}`, href, { timeout: 10000 });
  assert.deepEqual(errors, []);
});

// The review of 21 November 2026. A day that is not kept, or an address that names no day: the newest day is shown, the
// address is put in step with it (no new history entry), and a plain line says so.
test('page: a day that is not kept, or an address that names no day, shows the newest day and says so', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = watch(page);
  for (const [hash, line] of [['2026-11-19', /^No digest is kept for Thursday 19 Nov 2026; the newest day is shown\./], ['2099-01-01', /^No digest is kept for Thursday 1 Jan 2099; the newest day is shown\./], ['nonsense', /^That address names no day; the newest day is shown\./], ['2026-02-30', /^That address names no day; the newest day is shown\./]]) {
    await page.goto(`${FIX}#day=${hash}`, { waitUntil: 'domcontentloaded' });
    await shown(page, '2026-11-18');
    assert.match(page.url(), /#day=2026-11-18$/, `${hash}: the address names the day shown`);
    assert.match(await page.textContent('#status'), line, hash);
    assert.equal(await page.textContent('#title'), 'Daily Synopsis: Wednesday 18 Nov 2026');
  }
  // The same when the address is changed on an open page; Back then leaves the page, as no entry was added.
  await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
  await shown(page, '2026-11-17');
  const before = await page.evaluate(() => history.length);
  await page.evaluate(() => { location.hash = 'day=2026-11-15'; });
  await shown(page, '2026-11-18');
  assert.match(page.url(), /#day=2026-11-18$/);
  assert.match(await page.textContent('#status'), /^No digest is kept for Sunday 15 Nov 2026/);
  assert.equal(await page.evaluate(() => history.length), before + 1, 'one entry for the hash typed, none for putting it in step');
  // A day that is kept, after one that was not: no stale line.
  await page.click('#earlier');
  await shown(page, '2026-11-17');
  assert.doesNotMatch(await page.textContent('#status'), /not kept|names no day/);
  assert.deepEqual(errors, []);
});

// The second review of 21 November 2026, X5: a day file that reads as JSON but has the wrong shape changes nothing on the
// page; the status line says so, and the day shown, its heading and the chooser stay in step. X6: a day with no story
// that met the threshold says so in one plain line.
test('page: a day file of the wrong shape leaves the page as it was; a day with no story says so', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = watch(page);
  for (const body of ['{}', '{"day":"2026-11-16","stories":[{}]}']) {
    await page.unrouteAll();
    await page.route('**/tests/fixtures/daily-synopsis/data/days/2026-11-16.json', route => route.fulfill({ contentType: 'application/json', body }));
    await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
    await shown(page, '2026-11-17');
    const before = await page.textContent('#stories');
    await page.click('#earlier');
    await page.waitForFunction(() => /could not be read just now/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 15000 });
    assert.equal(await page.textContent('#status'), 'Monday 16 Nov 2026 could not be read just now. Tuesday 17 Nov 2026 is still shown.', body);
    assert.equal(await page.textContent('#title'), 'Daily Synopsis: Tuesday 17 Nov 2026', 'the heading names the day shown');
    assert.equal(await page.inputValue('#day'), '2026-11-17', 'the chooser names the day shown');
    assert.equal(await page.textContent('#stories'), before, 'the day\'s stories as they were');
    assert.equal(await page.isDisabled('#earlier'), false);
    // Later steps from the day shown, 17 November, to 18 November.
    await page.click('#later');
    await shown(page, '2026-11-18');
  }
  // Straight from the address: nothing was shown, and nothing is drawn.
  await page.goto(`${FIX}#day=2026-11-16`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /could not be read just now/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 15000 });
  assert.equal(await page.textContent('#status'), 'Monday 16 Nov 2026 could not be read just now.');
  assert.equal(await page.locator('#stories > li').count(), 0);
  // A day with no story that met the threshold.
  await page.unrouteAll();
  const empty = JSON.parse(await (await fetch(`${BASE}/tests/fixtures/daily-synopsis/data/days/2026-11-16.json`)).text());
  empty.stories = [];
  await page.route('**/tests/fixtures/daily-synopsis/data/days/2026-11-16.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(empty) }));
  await page.goto(`${FIX}#day=2026-11-16`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#no-stories'), null, { timeout: 15000 });
  assert.equal(await page.textContent('#no-stories'), LABEL.noStories);
  assert.equal(await page.locator('#stories > li').count(), 1);
  assert.equal(await page.textContent('#title'), 'Daily Synopsis: Monday 16 Nov 2026');
  assert.deepEqual(errors, []);
});

// A story whose written 5 Sided Analysis the check refused, on a day whose digest it published; and correction notes.
// The day is made by the same code the build uses (check.mjs and day.mjs), from the fixture's input and its good draft
// with one side citing another side's item; the page is given it in place of the fixture's 17 November.
test('page: a refused written analysis keeps its five sides and says so; correction notes are shown as text', PAGE, async t => {
  const { readFileSync } = await import('node:fs');
  const { checkDraft } = await import('../daily-synopsis/lib/check.mjs');
  const { rulesDay, withDraft } = await import('../daily-synopsis/lib/day.mjs');
  const fx = p => readFileSync(new URL(`./fixtures/daily-synopsis/${p}`, import.meta.url), 'utf8');
  const input = JSON.parse(fx('data/input/2026-11-17.json')), draft = JSON.parse(fx('draft-good.json'));
  draft.stories[1].five.sides.right[0].cites = ['s2-1'];
  const r = checkDraft(input, JSON.stringify(draft));
  assert.equal(r.ok, true);
  assert.equal(r.five.s2.ok, false);
  const day = withDraft(rulesDay(input, { generated: '2026-11-17T08:20:00.000Z' }), input, draft, r, { checked: '2026-11-17T12:20:00.000Z' });
  const notes = [{ day: '2026-11-17', date: '2026-11-18', story: null, text: 'A note on the whole day <b>in bold?</b>' }, { day: '2026-11-17', date: '2026-11-19', story: 's1', text: 'A note on the budget story.' }];
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, colorScheme] of [[1440, 'light'], [360, 'dark']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
    const errors = watch(page);
    await page.route('**/tests/fixtures/daily-synopsis/data/days/2026-11-17.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(day) }));
    await page.route('**/tests/fixtures/daily-synopsis/data/corrections.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'vm-daily-synopsis-corrections/1', notes }) }));
    await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
    await shown(page, '2026-11-17');
    const floods = page.locator('#stories > li.story').nth(1);
    assert.equal(await floods.locator('.five-note').textContent(), LABEL.fiveUnavailable);
    assert.equal(await floods.locator('.written').count(), 0);
    assert.equal(await floods.locator('.closing').count(), 0);
    assert.deepEqual(await floods.locator('.sides > li').evaluateAll(ls => ls.map(l => l.dataset.side)), SIDES, 'the five sides kept, in order');
    assert.ok(await floods.locator('.digest').count() === 1, 'the story\'s digest is published');
    assert.equal(await page.locator('#stories > li.story').nth(0).locator('.side .written').count(), 5, 'the other story keeps its written analysis');
    assert.equal(await page.isVisible('#corrections'), true);
    assert.equal(await page.textContent('#corr-list'), 'Wednesday 18 Nov 2026: A note on the whole day <b>in bold?</b>', 'the day\'s note, as text');
    assert.equal(await page.locator('#corr-list b').count(), 1, 'only VM\'s own date is bold');
    assert.equal(await page.textContent('#story-s1 .story-corr'), 'Correction, Thursday 19 Nov 2026: A note on the budget story.');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}: no sideways scroll`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

// Where the five positions come from: a link in the label, beside the 5 Sided Analysis's line, to the Method paragraph,
// which keeps the day shown and its address.
test('page: the label links to where the five positions come from, and the day stays', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = watch(page);
  await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
  await shown(page, '2026-11-17');
  const a = page.locator('#label a[href="#positions"]');
  assert.equal(await a.textContent(), 'Where the five positions come from');
  assert.match(await page.textContent('#positions'), /AllSides Media Bias Ratings.*Media Bias\/Fact Check.*editorial slant, not its accuracy/s);
  assert.match(await page.textContent('#positions'), /The check tests the text’s form and that its words, names and figures come from the reports it cites; it cannot test that a sentence is true to them\./, 'the limit of the check, where a reader sees it');
  await a.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'positions', null, { timeout: 10000 });
  assert.match(page.url(), /#day=2026-11-17$/, 'the address still names the day');
  assert.equal(await page.inputValue('#day'), '2026-11-17');
  const inView = await page.evaluate(() => { const r = document.querySelector('#positions').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  assert.ok(inView, 'the paragraph is brought into view');
  assert.deepEqual(errors, []);
});

test('page: by keyboard alone, the day controls and the list of days', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
  await shown(page, '2026-11-17');
  await page.focus('#earlier');
  await page.keyboard.press('Enter');
  await shown(page, '2026-11-16');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'later', 'the oldest day: Earlier is off, so the focus moves to Later');
  await page.keyboard.press('Space');
  await shown(page, '2026-11-17');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'later', 'the focus stays on the control used');
  await page.focus('#all a[href="#day=2026-11-18"]');
  await page.keyboard.press('Enter');
  await shown(page, '2026-11-18');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'title', 'the focus goes to the day\'s heading');
  const ring = await page.evaluate(() => { document.querySelector('#earlier').focus(); return getComputedStyle(document.activeElement).outlineStyle; });
  assert.notEqual(ring, 'none', 'a focus ring');
});

for (const width of [390, 360]) for (const colorScheme of ['light', 'dark']) {
  test(`page: ${width} px, ${colorScheme}: the sides stacked in order, no sideways scroll`, PAGE, async t => {
    const browser = await launch({ args: ['--mute-audio'] });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme });
    const errors = watch(page);
    await page.goto(`${FIX}#day=2026-11-17`, { waitUntil: 'domcontentloaded' });
    await shown(page, '2026-11-17');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll');
    const boxes = await page.locator('#stories > li.story:first-child .sides > li').evaluateAll(ls => ls.map(l => { const r = l.getBoundingClientRect(); return { x: Math.round(r.left), y: r.top, w: r.width }; }));
    assert.equal(boxes.length, 5);
    assert.ok(boxes.every(b => b.x === boxes[0].x), 'one column');
    for (let k = 1; k < 5; k++) assert.ok(boxes[k].y > boxes[k - 1].y, 'far left to far right, top to bottom');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lum = bg.match(/\d+/g).slice(0, 3).map(Number).reduce((s, v) => s + v, 0) / 3;
    if (colorScheme === 'dark') assert.ok(lum < 80, `a dark page (${bg})`); else assert.ok(lum > 200, `a light page (${bg})`);
    assert.deepEqual(errors, []);
  });
}

test('page: the committed days, with the freshness line the sidebar gives', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = watch(page);
  const index = await (await fetch(`${BASE}/daily-synopsis/data/index.json`)).json();
  await page.goto(`${BASE}/daily-synopsis/index.html`, { waitUntil: 'domcontentloaded' });
  await shown(page, index.latest);
  assert.equal(await page.isVisible('#fixture'), false, 'no fixture notice on the real days');
  await page.waitForFunction(() => /Digest for/.test(document.querySelector('#meta')?.textContent || ''), null, { timeout: 15000 });
  assert.match(await page.textContent('#meta'), /^(Late: digest|Digest) for \d{1,2} [A-Z][a-z]{2}( \d{4})? · daily, checked four times a day$/);
  const a = await authorship(page);
  const day = await (await fetch(`${BASE}/daily-synopsis/data/days/${index.latest}.json`)).json();
  assert.equal(a.meta, day.label.meta);
  assert.ok(a.text.includes(day.label.text));
  assert.equal(await page.locator('#stories > li.story').count(), day.stories.length);
  assert.deepEqual(errors, []);
});
