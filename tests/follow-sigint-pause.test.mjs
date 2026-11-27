// Follow-on correction (27 November 2026): SIGINT says a pause is running beside the age of the copy it shows.
// Since 26 November SIGINT's CelesTrak reader (sigint/lib/sources.js loadGp) leaves CelesTrak alone for 15 minutes after
// a failed download, as CelesTrak's usage policy asks (https://celestrak.org/usage-policy.php, updated 16 November
// 2026), and meanwhile returns the copy this browser kept, with its own time and with paused, retryAt and note. The
// Overview's CelesTrak row and the Satellites tab printed that copy's age alone, so a reader saw old data and no reason.
// They now give the reader's note beside the age, and mark the row "Needs attention", until the pause is over. The
// Overview says so too beside a weather copy young enough to be given without the note (the row is the Satellites
// tab's as well), and an open Satellites tab loads again, once the pause is over, what it held only because of it.
//   PRP_PAGES=0 node --test tests/follow-sigint-pause.test.mjs
// The page tests run against a server: JDPI_URL=http://localhost:9308 node --test tests/follow-sigint-pause.test.mjs
// No test contacts CelesTrak: every request to it is answered locally, and every other outside request is aborted
// except the CDN that serves satellite.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('sigint views: the Overview and Satellites rows take the pause note the CelesTrak reader returns', () => {
  const ov = read('sigint/views/overview.js'), sat = read('sigint/views/satellites.js');
  assert.match(ov, /r\.paused/, 'the Overview reads the reader’s paused flag');
  assert.match(ov, /r\.note/, 'the Overview prints the reader’s note');
  assert.match(sat, /r\.value\.paused/, 'the Satellites tab reads the paused flag of a kept copy');
  assert.match(sat, /r\.reason\?\.paused/, 'the Satellites tab reads the paused flag of a refusal');
  assert.match(sat, /r\.value\.note/, 'the Satellites tab prints the reader’s note');
  // Both read the pause the reader keeps (gpPause), not the network: the Overview for a copy young enough to be given
  // without the note, the Satellites tab to load again, once the pause is over, what was held only because of it.
  assert.match(ov, /gpPause\(\)/);
  assert.match(sat, /metPause && !reloading && !gpPause\(\)/);
  // No new request: neither view calls the reader with force, nor reads the pause on its own.
  assert.ok(!/loadGp\([^)]*force/.test(ov + sat));
});

const PAGE = process.env.JDPI_URL;
const skip = !PAGE && 'set JDPI_URL to run the page tests';
// Two GP records in CelesTrak's OMM shape (enough for the counts; the tests do not predict passes).
const OMM = [{ OBJECT_NAME: 'METEOR-M2 3', NORAD_CAT_ID: 57166 }, { OBJECT_NAME: 'NOAA 19', NORAD_CAT_ID: 33591 }];
const NOTE = /Server answered HTTP 503 at (\d\d:\d\d), so this page will not ask CelesTrak again before (\d\d:\d\d)/;

// The browser's kept copies (8 hours old, so out of date) and a pause that began 2 minutes ago, written once per tab
// before the page's own scripts run (a reload does not write them again).
const seed = ({ groups, omm, ageH = 8 }) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const now = Date.now();
  for (const g of groups) localStorage.setItem(`prp.sigint.gp.${g}`, JSON.stringify({ t: now - ageH * 3600e3, data: omm }));
  localStorage.setItem('prp.sigint.gpPausedUntil', JSON.stringify({ at: now - 2 * 60e3, until: now + 13 * 60e3, why: 'Server answered HTTP 503', status: 503 }));
};
// The pause is over: it began 16 minutes ago and ended a minute ago.
const endPause = () => {
  const now = Date.now();
  localStorage.setItem('prp.sigint.gpPausedUntil', JSON.stringify({ at: now - 16 * 60e3, until: now - 60e3, why: 'Server answered HTTP 503', status: 503 }));
};
// The times the page should print, written as the page writes times (lib/util.js hhmm).
const pauseTimes = page => page.evaluate(async () => {
  const { hhmm } = await import('/sigint/lib/util.js');
  const p = JSON.parse(localStorage.getItem('prp.sigint.gpPausedUntil'));
  return [hhmm(new Date(p.at)), hhmm(new Date(p.until))];
});

async function open(browser, base, counter) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(u => new URL(u).origin !== base, r => {
    const url = r.request().url();
    if (/celestrak\.org/.test(url)) {
      counter.asked++;
      return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(OMM) });
    }
    return /cdn\.jsdelivr\.net/.test(url) ? r.continue() : r.abort();
  });
  return { page, errors };
}
const row = page => page.evaluate(() => {
  const s = window.prpSigint.status.get('celestrak');
  return { state: s?.state || '', detail: s?.detail || '', tile: document.querySelector('#tiles [data-id="celestrak"]')?.textContent.replace(/\s+/g, ' ').trim() || '' };
});

test('page: the Overview says CelesTrak is not asked again until the pause ends, beside the kept copy’s age, and stops saying it after', { skip }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const base = new URL(PAGE).origin, counter = { asked: 0 };
    const { page, errors } = await open(browser, base, counter);
    await page.addInitScript(seed, { groups: ['weather'], omm: OMM });
    const checked = () => page.waitForFunction(() => /^Checked/.test(document.querySelector('#feeds-checked')?.textContent || ''), null, { timeout: 60000 });
    await page.goto(`${base}/sigint/index.html#tab=overview`, { waitUntil: 'domcontentloaded' });
    await checked();
    assert.equal(counter.asked, 0, 'CelesTrak is not asked during the pause');
    const [at, until] = await pauseTimes(page);
    let r = await row(page);
    assert.equal(r.detail, `2 weather satellites, cached 8 h ago. Server answered HTTP 503 at ${at}, so this page will not ask CelesTrak again before ${until}.`);
    assert.equal(r.state, 'warn');
    assert.match(r.tile, /Needs attention/);
    assert.match(r.tile, NOTE);

    // The pause is over: the next check asks CelesTrak once, and the row says no more about a pause.
    await page.evaluate(endPause);
    await page.evaluate(() => { document.querySelector('#feeds-checked').textContent = ''; });
    await page.click('#check-all');
    await checked();
    assert.equal(counter.asked, 1, 'after the pause the check asks CelesTrak once');
    r = await row(page);
    assert.equal(r.detail, '2 weather satellites, just downloaded.');
    assert.equal(r.state, 'ok');
    assert.ok(!/will not ask CelesTrak/.test(r.tile), r.tile);
    assert.match(r.tile, /Working/);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});

test('page: during a pause the Overview says so beside a weather copy young enough to need no download, and not after', { skip }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const base = new URL(PAGE).origin, counter = { asked: 0 };
    const { page, errors } = await open(browser, base, counter);
    // The weather copy is 2 hours old (under the reader's 6), and a pause begun elsewhere is running.
    await page.addInitScript(seed, { groups: ['weather'], omm: OMM, ageH: 2 });
    const checked = () => page.waitForFunction(() => /^Checked/.test(document.querySelector('#feeds-checked')?.textContent || ''), null, { timeout: 60000 });
    await page.goto(`${base}/sigint/index.html#tab=overview`, { waitUntil: 'domcontentloaded' });
    await checked();
    const [at, until] = await pauseTimes(page);
    let r = await row(page);
    assert.equal(r.detail, `2 weather satellites, cached 2 h ago. Server answered HTTP 503 at ${at}, so this page will not ask CelesTrak again before ${until}.`);
    assert.equal(r.state, 'warn');
    assert.match(r.tile, /Needs attention/);

    // The pause is over: the copy is still young enough, so CelesTrak is not asked, and the row is as before.
    await page.evaluate(endPause);
    await page.evaluate(() => { document.querySelector('#feeds-checked').textContent = ''; });
    await page.click('#check-all');
    await checked();
    r = await row(page);
    assert.equal(r.detail, '2 weather satellites, cached 2 h ago.');
    assert.equal(r.state, 'ok');
    assert.equal(counter.asked, 0, 'CelesTrak is never asked for a copy young enough');
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});

test('page: the Satellites tab says CelesTrak is not asked again until the pause ends, beside the elements’ age, and stops saying it after', { skip }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const base = new URL(PAGE).origin, counter = { asked: 0 };
    const { page, errors } = await open(browser, base, counter);
    // Copies of two groups are kept; the amateur group has none, so the reader refuses it with the pause's note.
    await page.addInitScript(seed, { groups: ['weather', 'stations'], omm: OMM });
    const loaded = () => page.waitForFunction(() => /elements/.test(window.prpSigint?.status.get('celestrak')?.detail || ''), null, { timeout: 60000 });
    await page.goto(`${base}/sigint/index.html#tab=satellites`, { waitUntil: 'domcontentloaded' });
    await loaded();
    assert.equal(counter.asked, 0, 'CelesTrak is not asked during the pause');
    const [at, until] = await pauseTimes(page);
    let r = await row(page);
    assert.equal(r.detail, `4 satellites in 2 groups; elements 8 h ago. Server answered HTTP 503 at ${at}, so this page will not ask CelesTrak again before ${until}.`);
    assert.equal(r.state, 'warn');
    assert.match(await page.textContent('#meta-feeds'), /Orbits \(CelesTrak\) needs attention/);

    // The same with every group kept: the note is still given, once.
    await page.evaluate(omm => localStorage.setItem('prp.sigint.gp.amateur', JSON.stringify({ t: Date.now() - 8 * 3600e3, data: omm })), OMM);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loaded();
    r = await row(page);
    assert.equal(counter.asked, 0);
    assert.equal(r.detail, `6 satellites in 3 groups; elements 8 h ago. Server answered HTTP 503 at ${at}, so this page will not ask CelesTrak again before ${until}.`);
    assert.equal(r.state, 'warn');

    // The pause is over while the tab stays open: within its next tick (10 s) the tab asks CelesTrak for each group it
    // held only as a kept copy, once, and the row says no more about a pause.
    await page.evaluate(endPause);
    await page.waitForFunction(() => !/will not ask CelesTrak/.test(window.prpSigint.status.get('celestrak')?.detail || ''), null, { timeout: 40000 });
    assert.equal(counter.asked, 3, 'after the pause each out-of-date group is asked for once');
    r = await row(page);
    assert.match(r.detail, /^6 satellites in 3 groups; elements (now|\d+ s ago)\.$/);
    assert.equal(r.state, 'ok');
    // Later ticks ask no more, and a reload uses the copies just kept.
    await page.waitForTimeout(11000);
    assert.equal(counter.asked, 3, 'the tab does not ask again once it holds fresh copies');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loaded();
    assert.equal(counter.asked, 3, 'a reload uses the fresh copies');
    r = await row(page);
    assert.match(r.detail, /^6 satellites in 3 groups; elements (now|\d+ s ago)\.$/);
    assert.equal(r.state, 'ok');
    assert.ok(!/will not ask CelesTrak/.test(r.detail));
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); }
});
