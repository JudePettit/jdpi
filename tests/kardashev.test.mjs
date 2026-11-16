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

// Until 16 November 2026 this test asserted that a period compared its two ends (a dashed ring for each power's share
// at the first step). Jude, 15 November (MP-07): a period is every step between the handles, so it now asserts that
// the map holds every power of 1500 to 1900 (27 by hand from the data, 18 of them gone by 1900, drawn faded), with the
// two ends still compared in the table; the start handle pushed onto the end is one step, with nothing faded.
test('a period is every step between the handles: 1500 to 1900 maps all 27 powers, the ends compared in the table; the start handle on the end is one step', pageTest, async t => {
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
    discs: await page.locator('circle.bubble').count(),
    gone: await page.locator('circle.bubble.gone').count(),
    regions: await page.locator('#panel .regrow').count(),
  };
  await page.locator('#tab-table').click();
  const head = await page.locator('#table-head th').allInnerTexts();
  await page.locator('#step-from').focus();
  await page.keyboard.press('End'); // the start pushed to the last step takes the end along: one step, 2025
  const one = { big: await page.locator('#year-big').innerText(), hash: await page.evaluate(() => location.hash), gone: await page.locator('circle.bubble.gone').count() };
  assert.deepEqual([period.big, period.label, period.h2], ['1500–1900', 'Period', '1500 to 1900']);
  assert.match(period.k, /^K 0\.\d\d → 0\.\d\d$/);
  assert.deepEqual([period.discs, period.gone], [27, 18]);
  assert.ok(period.regions >= 4, `regions: ${period.regions}`);
  assert.ok(head.some(h => /share 1500/i.test(h)) && head.some(h => /change/i.test(h)), head.join(' | '));
  assert.deepEqual(one, { big: '2025', hash: '#y=2025&v=table', gone: 0 });
  assert.deepEqual(errors, []);
});

// Jude, 15 November 2026 (MP-07): "The map slider on Kardashev Tracker is only showing one year at a time", and, of the
// Maurya Empire's panel over 100 to 1400, "Highlighted text should say "during this time period" instead of "in either
// year" as there can be more than 2 years being analyzed at a time." A period is every step between the handles. The
// expected answers are worked out by hand from kardashev/data/energy.json: 100 to 1400 is 14 steps and 37 powers, 4 at
// 100 and 14 at 1400, so 23 are gone by 1400; the Song dynasty was among the powers only at 1000, 1100 and 1200, at its
// largest ~50% in 1100 (50.05%), and the Tang only at 700, 800 and 900, at its largest ~41% in 700 (40.65%).
const NO_EITHER = /either year|both years|in either|two years/i;
async function open(page, hash) {
  await page.goto(`${BASE}/kardashev/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#panel h2', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('circle.bubble').length > 0, null, { timeout: 20000 });
}
const words = page => page.evaluate(() => [document.body.innerText, document.querySelector('#map').getAttribute('aria-label'), document.querySelector('#modal')?.innerText || ''].join('\n'));

test('100 to 1400: every power of the fourteen steps is on the map, at its largest share, the gone ones faded', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1400&f=100');
  assert.equal(await page.locator('circle.bubble').count(), 37);
  assert.equal(await page.locator('circle.bubble.gone').count(), 23);
  for (const id of ['song', 'tang', 'yuan', 'sui', 'abbasid', 'gupta']) assert.equal(await page.locator(`circle.bubble.gone[data-id="${id}"]`).count(), 1, `${id}: on the map, faded`);
  for (const id of ['ming', 'byzantium', 'delhi']) assert.equal(await page.locator(`circle.bubble:not(.gone)[data-id="${id}"]`).count(), 1, `${id}: on the map, still there in 1400`);
  // The Song's disc is the period's largest, sized by its share in 1100, and its tooltip says so.
  const r = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('circle.bubble')].map(c => [c.dataset.id, +c.getAttribute('r')])));
  assert.equal(Math.max(...Object.values(r)), r.song);
  assert.ok(r.song > r.ming && r.ming > r.yuan, JSON.stringify({ song: r.song, ming: r.ming, yuan: r.yuan }));
  const box = await page.locator('#map').boundingBox();
  await page.locator('circle.bubble[data-id="song"]').dispatchEvent('mousemove', { clientX: box.x + 200, clientY: box.y + 100 });
  const tip = await page.locator('#tooltip').innerText();
  assert.match(tip, /Song dynasty/);
  assert.match(tip, /~50%[^\n]*1100/);
  assert.match(tip, /3 of the period's 14 steps/);
  assert.match(tip, /±30–50%/, 'the estimate is marked as rough');
  // The key and the caption name the period, not two years.
  const key = await page.locator('#ringkey').innerText();
  assert.match(key, /100 to 1400/i);
  assert.match(key, /largest share/i);
  assert.doesNotMatch(key, /share in 100\b|ring/i);
  const caption = await page.locator('#caption').innerText();
  assert.match(caption, /14 steps from 100 to 1400/);
  assert.match(caption, /largest/);
  assert.doesNotMatch(caption, /dashed ring|share in 100\b/);
  // The chart shades the period between its two lines.
  const band = await page.evaluate(() => { const b = document.querySelector('#periodband'), f = document.querySelector('#fromline'), y = document.querySelector('#yearline'); return b && { shown: b.getAttribute('visibility') !== 'hidden', x: +b.getAttribute('x'), w: +b.getAttribute('width'), from: +f.getAttribute('x1'), to: +y.getAttribute('x1') }; });
  assert.ok(band?.shown, 'the period is shaded');
  assert.ok(Math.abs(band.x - band.from) < 0.5 && Math.abs(band.x + band.w - band.to) < 0.5, JSON.stringify(band));
  assert.doesNotMatch(await words(page), NO_EITHER);
  assert.deepEqual(errors, []);
});

test('100 to 1400: the panel, the summary and the table read every step of the period', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The summary: the largest shares within the period, with their years, and the powers that rose and fell inside it.
  await open(page, 'y=1400&f=100');
  const tops = await page.locator('#panel .rank[data-id]').evaluateAll(els => els.slice(0, 3).map(e => [e.dataset.id, e.querySelector('b').textContent, e.querySelector('.rv .chg')?.textContent]));
  assert.deepEqual(tops, [['song', '~50%', 'in 1100'], ['rome', '~42%', 'in 200'], ['tang', '~41%', 'in 700']]);
  const panel = await page.locator('#panel').innerText();
  // Review of 16 November 2026: "New during the period 14" counted only the powers there at the end (33 of the 37 were
  // not there in 100), and "gone by 1400" meant 23 powers on the map and in the rows but 4 under its own heading. Each
  // list now says what it counts, "gone by 1400" means only those there at the start, and the key adds them up.
  assert.match(panel, /New by 1400\s*14 · not among the powers in 100/i);
  assert.match(panel, /Gone by 1400\s*4 · among the powers in 100/i);
  assert.match(panel, /Rose and fell within the period\s*19 · at neither end/i);
  assert.match(panel, /Song dynasty/);
  assert.equal((panel.match(/gone by 1400/gi) || []).length, 1, 'gone by 1400 is said once, of the four');
  assert.doesNotMatch(panel, /New during the period/i);
  // Two pairs of powers share a name: in a list, each carries its years.
  assert.match(panel, /Indian kingdoms \(combined, 184 BC–319\)/);
  assert.match(panel, /Indian kingdoms \(combined, 551–1205\)/);
  const key = await page.locator('#ringkey').innerText();
  assert.match(key, /Faded: not among the powers in 1400 \(4 gone by then, 19 rose and fell\)/i);
  assert.equal(await page.locator('circle.bubble.gone').count(), 4 + 19, 'the faded discs are the ones the key counts');
  assert.doesNotMatch(await words(page), NO_EITHER);
  // A power that rose and fell inside the period: its shares at the steps where it was among the powers.
  await open(page, 'y=1400&f=100&p=song');
  const song = await page.locator('#panel').innerText();
  assert.match(song, /Among the powers at 3 of the period's 14 steps, from 1000 to 1200\./);
  assert.match(song, /Largest share within the period: ~50% in 1100\./);
  assert.match(song, /1000: ~38%[^\n]*1100: ~50%[^\n]*1200: ~32%/);
  assert.match(song, /Did not exist in 1400\./);
  assert.doesNotMatch(song, NO_EITHER);
  // Byzantium, there at 1400 but not at 100: its first and last within the period.
  await open(page, 'y=1400&f=100&p=byzantium');
  const byz = await page.locator('#panel').innerText();
  assert.match(byz, /Among the powers at 11 of the period's 14 steps, from 400 to 1400\./);
  assert.match(byz, /Largest share within the period: ~22% in 500\./);
  assert.match(byz, /Not among the powers in 100, at the period's start\./);
  // Jude's screenshot: the Maurya Empire over 100 to 1400 (it was among the powers only in 300 BC and 200 BC).
  await open(page, 'y=1400&f=100&p=maurya');
  const maurya = await page.locator('#panel').innerText();
  assert.match(maurya, /Not among the powers during this time period\./);
  assert.match(maurya, /Did not exist during this time period\./);
  assert.doesNotMatch(await words(page), NO_EITHER);
  // The table: every power of the period, by its largest share, with the year of it and the ends.
  await open(page, 'y=1400&f=100&v=table');
  await page.waitForSelector('#table-rows tr[data-id]');
  assert.equal(await page.locator('#table-rows tr[data-id]').count(), 37);
  assert.match(await page.locator('#table-title').innerText(), /100 to 1400 · 37/);
  // The largest share and its year share one cell (review of 16 November 2026: thirteen columns overflowed at 1440).
  const row = await page.locator('#table-rows tr[data-id="song"] td').allInnerTexts();
  assert.ok(row.includes('~50% in 1100') && row.includes('3 of 14'), row.join(' | '));
  const head = await page.locator('#table-head th').allTextContents();
  assert.ok(head.some(h => /largest share/i.test(h)) && head.some(h => /share 100$/i.test(h)) && head.some(h => /share 1400/i.test(h)), head.join(' | '));
  assert.doesNotMatch(await words(page), NO_EITHER);
  assert.deepEqual(errors, []);
});

// A period of exactly two steps, 1900 to 1950 (by hand: 14 powers, 9 at each end, 5 gone by 1950: the Qing, the
// German, Russian and Japanese Empires and the Ottoman Empire), and the whole run, 2000 BC to 2025 (77 powers; the
// largest share within it the Song's ~50% in 1100; the Qing's 47% in 1800, after the estimates turn firmer, has no ~).
test('a period of two steps and the whole run read every step, with the largest shares by hand', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1950&f=1900');
  assert.equal(await page.locator('circle.bubble').count(), 14);
  assert.deepEqual((await page.locator('circle.bubble.gone').evaluateAll(els => els.map(e => e.dataset.id))).sort(), ['germany-emp', 'japan-emp', 'ottoman', 'qing', 'russia-emp']);
  await open(page, 'y=1950&f=1900&p=qing');
  const qing = await page.locator('#panel').innerText();
  assert.match(qing, /Among the powers at 1 of the period's 2 steps, in 1900\./);
  assert.match(qing, /No longer among the powers in 1950, at the period's end\./);
  await open(page, 'y=1950&f=1900&p=usa');
  assert.match(await page.locator('#panel').innerText(), /Between the ends: \d+% in 1900, 28% in 1950: up \d+(\.\d)? percentage points\./);
  await open(page, 'y=1950&f=1900&p=maurya');
  assert.match(await page.locator('#panel').innerText(), /Not among the powers during this time period\./);
  await open(page, 'y=2025&f=-2000');
  assert.equal(await page.locator('circle.bubble').count(), 77);
  assert.match(await page.locator('#ringkey').innerText(), /2000 BC to 2025/i);
  const tops = await page.locator('#panel .rank[data-id]').evaluateAll(els => els.slice(0, 2).map(e => [e.dataset.id, e.querySelector('b').textContent, e.querySelector('.rv .chg')?.textContent]));
  assert.deepEqual(tops, [['song', '~50%', 'in 1100'], ['qing', '47%', 'in 1800']]);
  await open(page, 'y=2025&f=-2000&p=maurya');
  const maurya = await page.locator('#panel').innerText();
  assert.match(maurya, /Among the powers at 2 of the period's 44 steps, from 300 BC to 200 BC\./);
  assert.match(maurya, /Largest share within the period: ~27% in 300 BC\./);
  assert.doesNotMatch(await words(page), NO_EITHER);
  assert.deepEqual(errors, []);
});

// With the handles together the page is exactly as it was: one step's powers, nothing faded, no key, no shaded period,
// the original caption and table, the step's own year in the panel.
test('one step (the handles together) is as before the period read every step', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1100&p=song');
  const one = await page.evaluate(() => ({
    discs: document.querySelectorAll('circle.bubble').length, gone: document.querySelectorAll('circle.bubble.gone').length,
    key: document.querySelector('#ringkey').hidden, band: document.querySelector('#periodband')?.getAttribute('visibility'),
    caption: document.querySelector('#caption').textContent, aria: document.querySelector('#map').getAttribute('aria-label'),
  }));
  assert.deepEqual(one, {
    discs: 12, gone: 0, key: true, band: 'hidden', aria: "Circles on each power's capital, sized by its share of world energy capture",
    caption: "(a) Each power's capital, its circle sized by its estimated share of world energy capture and coloured by region. (b) The shares of the sixteen largest powers over time, stacked, with everyone else in grey.",
  });
  const song = await page.locator('#panel').innerText();
  assert.match(song, /In 1100\n/i); // innerText: the CSS upper-cases the heading
  assert.doesNotMatch(song, /within the period|of the period's/);
  await open(page, 'y=1100&v=table');
  await page.waitForSelector('#table-rows tr[data-id]');
  assert.deepEqual(await page.locator('#table-head th').allTextContents(), ['#', 'Empire or country', 'Region', 'Share', 'People', 'kcal per person a day', 'Power', 'Rating']);
  assert.equal(await page.locator('#table-title').innerText(), 'Powers in 1100 · 12');
  assert.deepEqual(errors, []);
});

// Review of 12 November 2026: the uncertainty stood only in the method. A share before 1800 now carries ~ beside it,
// with its meaning (the method's own ±30–50%) in the panel, the table and the tooltip; a later share carries none.
test('before 1800 every share is marked as rough beside its value, with what the mark means; after, none is', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const look = async y => {
    await page.goto(`${BASE}/kardashev/#y=${y}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(w => document.querySelector('#year-big')?.textContent === w && document.querySelector('.rank[data-id] b'), y < 0 ? `${-y} BC` : String(y), { timeout: 20000 });
    return { shares: await page.locator('#panel .rank b').allInnerTexts(), note: await page.locator('#panel .note').allInnerTexts() };
  };
  const early = await look(1500), late = await look(1900);
  assert.ok(early.shares.length > 5 && early.shares.every(s => /^~\d/.test(s)), early.shares.join(' '));
  assert.ok(early.note.some(n => /Before 1800 a share is an estimate, accurate only to within about ±30–50%/.test(n)), early.note.join(' | '));
  assert.ok(late.shares.length > 5 && late.shares.every(s => /^\d/.test(s)), late.shares.join(' '));
  assert.ok(!late.note.some(n => /±30–50%/.test(n)));
  await page.goto(`${BASE}/kardashev/#y=1500&v=table`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#table-rows tr[data-id]', { timeout: 20000 });
  assert.match(await page.locator('#table-note').innerText(), /±30–50%/);
  assert.match(await page.locator('#table-rows tr[data-id] td.num').nth(1).innerText(), /^~/);
  assert.deepEqual(errors, []);
});

// On a phone the year and the rating stack, at rest and in a period alike: side by side, a period's longer figures
// pushed the page sideways, and its longer line under the rating dropped the timeline and the map mid-drag.
// Jude, 14 November 2026: the handles opened on top of each other. With no year in its address the tracker opens one
// step apart, on the last two steps, shown as any period is; an address that names one step keeps it.
test('opened with no year, the handles stand one step apart and the tracker shows the last two steps as a period', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const steps = (await (await fetch(`${BASE}/kardashev/data/energy.json`)).json()).steps.map(s => s.year), [a, b] = steps.slice(-2);
  const label = y => (y < 0 ? `${-y} BC` : y === 1 ? 'AD 1' : String(y));
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/kardashev/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.rank[data-id]', { timeout: 20000 });
  const handles = () => page.evaluate(() => {
    const el = document.querySelector('#timeline'), t = parseFloat(getComputedStyle(el).getPropertyValue('--prp-period-thumb')) || 16;
    const at = i => { const b = i.getBoundingClientRect(); return b.left + t / 2 + ((+i.value - +i.min) / Math.max(1, +i.max - +i.min)) * (b.width - t); };
    const f = el.querySelector('input.from'), to = el.querySelector('input.to');
    return { from: f.dataset.value, to: to.dataset.value, apart: at(to) - at(f) > 0, joined: el.querySelector('.prp-period-range').classList.contains('joined') };
  });
  assert.deepEqual(await handles(), { from: String(a), to: String(b), apart: true, joined: false });
  assert.equal(await page.locator('#year-big').innerText(), `${label(a)}–${label(b)}`);
  assert.equal((await page.locator('#year-label').textContent()).trim(), 'Period');
  assert.equal(await page.locator('#panel h2').innerText(), `${label(a)} to ${label(b)}`);
  assert.match(await page.locator('#kval').innerText(), /^K 0\.\d\d → 0\.\d\d$/);
  // Every power of 2000 and 2025 (by hand: the six of 2000 and the United Kingdom, new in 2025), none gone by 2025.
  assert.deepEqual([await page.locator('circle.bubble').count(), await page.locator('circle.bubble.gone').count()], [7, 0]);
  assert.match(await page.locator('#ringkey').innerText(), /2000 to 2025/i);
  // Review of 16 November 2026: the lines above held on the page that compared only the ends too; these do not.
  assert.match(await page.locator('#ringkey').innerText(), /largest share within the period/i);
  assert.match(await page.locator('#map').getAttribute('aria-label'), /at any of the 2 steps from 2000 to 2025/);
  assert.equal(await page.evaluate(() => location.hash), `#y=${b}&f=${a}`);
  // An address that names one step keeps it.
  await page.goto(`${BASE}/kardashev/#y=${b}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(y => document.querySelector('#year-big')?.textContent === y, label(b), { timeout: 20000 });
  assert.deepEqual(await handles(), { from: String(b), to: String(b), apart: false, joined: true });
  assert.deepEqual(errors, []);
});

// Play from that opening runs through the centuries from the first step, as play from the single last step did.
test('play from the opening travels through the steps from the first, one step at a time', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const steps = (await (await fetch(`${BASE}/kardashev/data/energy.json`)).json()).steps.map(s => s.year);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/kardashev/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.rank[data-id]', { timeout: 20000 });
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Pause');
  // The end runs on past the first step, the start with it (one step, travelling).
  await page.waitForFunction(first => { const f = document.querySelector('#step-from'), s = document.querySelector('#step'); return +s.dataset.value > first && f.dataset.value === s.dataset.value; }, steps[0], { timeout: 8000 });
  await page.locator('#play').click();
  const at = await page.evaluate(() => [document.querySelector('#step-from').dataset.value, document.querySelector('#step').dataset.value].map(Number));
  assert.ok(at[0] === at[1] && at[1] > steps[0] && at[1] < steps.at(-2), JSON.stringify(at));
  assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play through the centuries');
  assert.deepEqual(errors, []);
});

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

// Review of 16 November 2026, the map over a period: in the China cluster of 100 to 1400 eight discs share the Song's
// capital, seven of them gone; faded at 0.3 and drawn by size, they stacked up to look solid, over the Ming's solid disc.
// The faded discs are now drawn beneath every disc still there and nearly hollow; a chosen faded disc shows the solid
// ring every selection has; a name moved under a large disc onto another one is left out; and the powers still there
// at the period's end are named first.
test('over a period the faded discs lie beneath the ones still there, nearly hollow, and a chosen one shows its ring', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1400&f=100&p=song');
  const map = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('circle.bubble')], gone = cs.map(c => c.classList.contains('gone'));
    const sel = document.querySelector('circle.bubble.sel'), ming = document.querySelector('circle.bubble[data-id="ming"]');
    const s = getComputedStyle(sel), m = getComputedStyle(ming);
    return {
      lastGone: gone.lastIndexOf(true), firstThere: gone.indexOf(false),
      goneFill: Math.max(...cs.filter(c => c.classList.contains('gone') && !c.classList.contains('sel')).map(c => +getComputedStyle(c).fillOpacity)),
      sel: { id: sel.dataset.id, dash: s.strokeDasharray, width: s.strokeWidth },
      ming: { dash: m.strokeDasharray, fill: +m.fillOpacity },
    };
  });
  assert.ok(map.lastGone < map.firstThere, `every faded disc comes before every disc still there: ${map.lastGone} < ${map.firstThere}`);
  assert.ok(map.goneFill <= 0.15, `a faded disc is nearly hollow: ${map.goneFill}`);
  assert.ok(map.ming.fill > 0.8 && map.ming.dash === 'none', JSON.stringify(map.ming));
  assert.equal(map.sel.id, 'song');
  assert.equal(map.sel.dash, 'none', 'the chosen faded disc has the solid ring');
  assert.equal(map.sel.width, '1.6px');
  // Names: the Ming (there in 1400) is named, and no name moved under its own disc lands on another power's disc.
  const names = await page.evaluate(() => [...document.querySelectorAll('text.blabel')].map(l => {
    const id = l.__data__.id, own = document.querySelector(`circle.bubble[data-id="${id}"]`), b = l.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const on = [...document.querySelectorAll('circle.bubble')].filter(c => c !== own && c.getAttribute('cx') !== own.getAttribute('cx')
      && Math.hypot(+c.getAttribute('cx') - cx, +c.getAttribute('cy') - cy) < +c.getAttribute('r')).map(c => c.dataset.id);
    return { id, shown: l.getAttribute('visibility') !== 'hidden', below: +l.getAttribute('y') > +own.getAttribute('cy'), on };
  }));
  assert.ok(names.find(n => n.id === 'ming')?.shown, JSON.stringify(names.find(n => n.id === 'ming')));
  for (const n of names) if (n.shown && n.below) assert.deepEqual(n.on, [], `${n.id}'s name, moved under its disc, sits on another power's disc`);
  assert.deepEqual(errors, []);
});

// Review of 16 November 2026, the layout over a period: the thirteen-column table overflowed its panel at 1440 by 900,
// and at 1024 by 768 the map shrank to a strip (12 px over the whole run) as the window's height was shared out.
test('over a period the table fits its panel at 1440 by 900 and the map keeps its height on a short window', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const errors = [];
  for (const hash of ['y=1400&f=100&v=table', 'y=2025&f=-2000&v=table']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/kardashev/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#table-rows tr[data-id]', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    const fit = await page.evaluate(() => { const s = document.querySelector('.tablescroll'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
    assert.ok(fit.sw <= fit.cw, `${hash}: the table fits (${fit.sw} <= ${fit.cw})`);
    await page.close();
  }
  for (const [w, h, hash, least] of [[1024, 768, 'y=2025&f=-2000', 200], [1024, 768, 'y=1400&f=100', 200], [1024, 768, 'y=1400', 130], [1440, 900, 'y=1400&f=100', 280]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errors.push(e.message));
    await open(page, hash);
    await page.evaluate(() => document.fonts.ready);
    const look = await page.evaluate(() => ({ map: Math.round(document.querySelector('#map').getBoundingClientRect().height), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    assert.ok(look.map >= least, `${w}x${h} ${hash}: the map is ${look.map} px tall (at least ${least})`);
    assert.equal(look.sideways, 0);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

// Review of 16 November 2026: five powers are in the data but listed at no step, their years falling between two
// (the Mongol Empire, 1206 to 1270; the Qin, the Five Dynasties, Weimar and Nazi Germany, the Republic of China). The
// Master Index links to them (#y=1206&p=mongol) threw in the panel and left the page half drawn; and a #y that is not a
// step left the step shown where it was. The address's year now goes to the nearest step (a tie to the earlier).
test('a power listed at no step opens with its panel and the page whole, and a year between steps goes to the nearest', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'y=1400&f=100&p=mongol');
  const mongol = await page.locator('#panel').innerText();
  assert.equal(await page.locator('#panel h2').innerText(), 'Mongol Empire');
  assert.match(mongol, /Not among the powers during this time period\./);
  assert.match(mongol, /Its years, 1206 to 1270, fall between the tracker's steps, so it has no share here\./);
  assert.doesNotMatch(mongol, /Over time/i);
  assert.match(await page.locator('#caption').innerText(), /14 steps from 100 to 1400/);
  assert.doesNotMatch(await page.locator('#status').innerText(), /Could not load/);
  await page.locator('#tab-table').click();
  assert.match(await page.locator('#table-title').innerText(), /100 to 1400 · 37/);
  // The Master Index's own address: 1206 is not a step, so the nearest, 1200, is shown.
  await open(page, 'y=1206&p=mongol');
  assert.equal(await page.locator('#year-big').innerText(), '1200');
  assert.match(await page.locator('#panel').innerText(), /Did not exist in 1200\./);
  assert.equal(await page.evaluate(() => location.hash), '#y=1200&p=mongol');
  // A move by hash to another such power shows its own panel, not the last one's.
  await open(page, 'y=1400&f=100&p=maurya');
  await page.evaluate(() => { location.hash = 'y=1400&f=100&p=roc'; });
  await page.waitForFunction(() => document.querySelector('#panel h2')?.textContent === 'Republic of China', null, { timeout: 10000 });
  for (const [hash, year] of [['y=-221&p=qin', '200 BC'], ['y=1919&p=germany-weimar', '1900'], ['y=1940', '1950'], ['y=1875', '1850']]) {
    await open(page, hash);
    assert.equal(await page.locator('#year-big').innerText(), year, hash);
  }
  assert.deepEqual(errors, []);
});
