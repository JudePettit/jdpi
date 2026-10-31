// The period control (design/prp-period.js): its rules as pure functions on stop indices, and, when JDPI_URL is set
// (e.g. JDPI_URL=http://localhost:8787; never with PRP_PAGES=0), one mounted control driven in Edge as a reader would:
// value mode, a single time that travels, opening a period, the track, the keys, play, the address round trip and a drag
// with a real pointer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../design/prp-period.js';
import { pageTest, launch } from './tools/pages.mjs';

const R = globalThis.PRPPeriod.rules;
const st = (i, j, n, rest = 'first') => ({ i, j, n, rest });
const ij = s => [s.i, s.j];

test('stops: a value sits on its stop, else the last one before it; numbers and ISO dates', () => {
  const years = [-3000, -2900, 1, 50, 1684, 1688, 2026];
  assert.equal(R.indexOf(years, 1684), 4);
  assert.equal(R.indexOf(years, 1687), 4);   // between stops: the one before
  assert.equal(R.indexOf(years, '1687'), 4); // from an address
  assert.equal(R.indexOf(years, -5000), 0);  // before the first: the first
  assert.equal(R.indexOf(years, 3000), 6);   // after the last: the last
  assert.equal(R.indexOf(years, null), 0);
  assert.equal(R.indexOf(years, 'x'), 0);
  const months = ['2023-01', '2023-02', '2023-03', '2023-04'];
  assert.equal(R.indexOf(months, '2023-03'), 2);
  assert.equal(R.indexOf(months, '2023-03-15'), 2);
  assert.equal(R.indexOf(months, '2022-12'), 0);
  assert.equal(R.indexOf(months, '2024-01'), 3);
  const days = ['2026-09-29', '2026-09-30', '2026-10-01'];
  assert.equal(R.indexOf(days, '2026-09-30'), 1);
  assert.equal(R.indexOf(days, '2026-10-31'), 2);
  assert.ok(R.compare('2023-06', '2023-06-15') < 0 && R.compare(1500, 900) > 0);
});

test('push and pull: the start pushed past the end takes it along, the end pulled back past the start brings it', () => {
  for (const rest of ['first', 'end']) {
    assert.deepEqual(ij(R.startTo(st(2, 5, 10, rest), 7)), [7, 7], `${rest}: pushed`);
    assert.deepEqual(ij(R.startTo(st(2, 5, 10, rest), 4)), [4, 5], `${rest}: within`);
    assert.deepEqual(ij(R.endTo(st(4, 6, 10, rest), 1)), [1, 1], `${rest}: pulled`);
    assert.deepEqual(ij(R.endTo(st(4, 6, 10, rest), 8)), [4, 8], `${rest}: on`);
    assert.deepEqual(ij(R.startTo(st(2, 5, 10, rest), 99)), [9, 9], `${rest}: clamped`);
    assert.deepEqual(ij(R.endTo(st(2, 5, 10, rest), -4)), [0, 0], `${rest}: clamped`);
  }
  // A single time on a snapshot page travels as one when its end moves; only the start opens a period.
  assert.deepEqual(ij(R.endTo(st(5, 5, 10, 'end'), 8)), [8, 8]);
  assert.deepEqual(ij(R.endTo(st(5, 5, 10, 'end'), 2)), [2, 2]);
  assert.deepEqual(ij(R.startTo(st(5, 5, 10, 'end'), 2)), [2, 5]);
  assert.deepEqual(ij(R.startTo(st(5, 5, 10, 'end'), 8)), [8, 8]);
  // On an up-to page the end moves on from a resting start.
  assert.deepEqual(ij(R.endTo(st(0, 0, 10), 6)), [0, 6]);
});

test('rest: the first stop on an up-to page, the end on a snapshot page', () => {
  assert.equal(R.atRest(st(0, 5, 10)), true);
  assert.equal(R.atRest(st(1, 5, 10)), false);
  assert.equal(R.atRest(st(5, 5, 10)), false); // a single year away from the first stop is a period on an up-to page
  assert.equal(R.atRest(st(5, 5, 10, 'end')), true);
  assert.equal(R.atRest(st(0, 5, 10, 'end')), false);
});

test('the track moves the nearer handle, a tie the end; a single time on a snapshot page jumps', () => {
  assert.deepEqual(ij(R.trackTo(st(2, 8, 10), 3)), [3, 8]);
  assert.deepEqual(ij(R.trackTo(st(2, 8, 10), 7)), [2, 7]);
  assert.deepEqual(ij(R.trackTo(st(2, 8, 10), 5)), [2, 5]); // a tie moves the end
  assert.deepEqual(ij(R.trackTo(st(4, 4, 10, 'end'), 9)), [9, 9]);
  assert.deepEqual(ij(R.trackTo(st(4, 4, 10, 'end'), 1)), [1, 1]);
  assert.deepEqual(ij(R.trackTo(st(2, 8, 10, 'end'), 3)), [3, 8]);
  assert.equal(R.trackMoves(st(2, 8, 10), 3), 'from');
  assert.equal(R.trackMoves(st(2, 8, 10), 5), 'to');
  assert.equal(R.trackMoves(st(4, 4, 10, 'end'), 1), 'to');
});

test('steps move the end: back from a value between stops goes to its own stop; a snapshot single time travels', () => {
  assert.deepEqual(ij(R.stepBy(st(0, 4, 10), -1)), [0, 3]);
  assert.deepEqual(ij(R.stepBy(st(0, 4, 10), -1, true)), [0, 4]); // #y=1687 on the 1684 stop: back to 1684 first
  assert.deepEqual(ij(R.stepBy(st(0, 4, 10), 1, true)), [0, 5]);
  assert.deepEqual(ij(R.stepBy(st(3, 4, 10), -1)), [3, 3]);
  assert.deepEqual(ij(R.stepBy(st(3, 3, 10), -1)), [2, 2]);       // pulled along on an up-to page
  assert.deepEqual(ij(R.stepBy(st(6, 6, 10, 'end'), 1)), [7, 7]);
  assert.deepEqual(ij(R.stepBy(st(6, 6, 10, 'end'), -1)), [5, 5]);
  assert.deepEqual(ij(R.stepBy(st(2, 6, 10, 'end'), 1)), [2, 7]);
  assert.deepEqual(ij(R.stepBy(st(9, 9, 10, 'end'), 1)), [9, 9]);
});

test('play runs from the start of the period and stops at the last stop', () => {
  // An up-to page grows the period from the resting start; from the last stop it begins again at the start handle.
  let s = st(0, 9, 10), mode = R.playMode(s);
  assert.equal(mode, 'grow');
  assert.deepEqual(ij(s = R.playStart(s, mode)), [0, 0]);
  assert.deepEqual(ij(s = R.playTick(s, mode)), [0, 1]);
  assert.deepEqual(ij(R.playStart(st(3, 9, 10), 'grow')), [3, 3]);
  assert.deepEqual(ij(R.playStart(st(3, 6, 10), 'grow')), [3, 6]); // not at the end: on from where it is
  assert.equal(R.playTick(st(0, 9, 10), 'grow'), null);
  // A snapshot page's single time travels, from the first stop when it was at the last.
  s = st(9, 9, 10, 'end'); mode = R.playMode(s);
  assert.equal(mode, 'travel');
  assert.deepEqual(ij(s = R.playStart(s, mode)), [0, 0]);
  assert.deepEqual(ij(s = R.playTick(s, mode)), [1, 1]);
  // A snapshot page's period grows from its start, as on an up-to page.
  assert.equal(R.playMode(st(2, 9, 10, 'end')), 'grow');
  assert.deepEqual(ij(R.playStart(st(2, 9, 10, 'end'), 'grow')), [2, 2]);
  assert.deepEqual(ij(R.playTick(st(2, 2, 10, 'end'), 'grow')), [2, 3]);
});

test('layering, fill, ticks and bars', () => {
  // The handle in front is the one that can move off: the start, once it meets the end away from the first stop.
  assert.deepEqual(R.layering(st(5, 5, 10)), { topFrom: true, joined: true });
  assert.deepEqual(R.layering(st(0, 0, 10)), { topFrom: false, joined: true });
  assert.deepEqual(R.layering(st(0, 0, 10, 'end')), { topFrom: true, joined: true });
  assert.deepEqual(R.layering(st(2, 5, 10, 'end')), { topFrom: false, joined: false });
  assert.deepEqual(R.fillOf(st(2, 5, 11)), { left: 0.2, width: 0.3 });
  assert.deepEqual(R.fillOf(st(0, 0, 1)), { left: 0, width: 0 });
  assert.equal(R.tickAt([1926, 1927, 1928, 1929, 1930], 1928), 0.5);
  assert.equal(R.barHeight(0, 10), 0);
  assert.equal(R.barHeight(10, 10), 1);
  assert.ok(Math.abs(R.barHeight(1, 100) - 0.208) < 1e-9);
});

test('value mode: consecutive whole numbers are the inputs\' values, anything else stop indices', () => {
  assert.equal(R.consecutive(Array.from({ length: 100 }, (_, k) => 1926 + k)), true);
  assert.equal(R.consecutive([-3000, -2900, -2800]), false);
  assert.equal(R.consecutive(['2023-01', '2023-02']), false);
  assert.equal(R.consecutive([2025]), false);
});

test('the address: the start is written only away from rest, and reads back to the same period', () => {
  const years = Array.from({ length: 100 }, (_, k) => 1926 + k), months = ['2023-04', '2023-05', '2023-06', '2023-07'];
  assert.equal(R.startParam({ atRest: true, from: 2025 }), null);
  assert.equal(R.startParam({ atRest: false, from: 1939 }), 1939);
  // Snapshot: a start at or after the end, absent or unreadable, is at rest.
  assert.equal(R.readStart(years, '1939', 1945, 'end'), 1939);
  for (const raw of ['1945', '1950', null, '', 'abc']) assert.equal(R.readStart(years, raw, 1945, 'end'), null, String(raw));
  // Up-to: a start on or before the first stop is at rest; a start after the end is left to set(), which makes it the end.
  assert.equal(R.readStart(months, '2023-06', '2023-07'), '2023-06');
  assert.equal(R.readStart(months, '2023-04', '2023-07'), null);
  assert.equal(R.readStart(months, '2022-01', '2023-07'), null);
  assert.equal(R.readStart(months, '2023-07', '2023-05'), '2023-07');
  for (const p of [{ atRest: false, from: 1939 }, { atRest: true, from: 1945 }]) assert.equal(R.readStart(years, R.startParam(p) == null ? null : String(R.startParam(p)), 1945, 'end'), p.atRest ? null : p.from);
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: a mounted control travels, opens a period, follows the track, the keys and play', BASE ? pageTest : { skip: 'set JDPI_URL to test the control in a browser' }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/design/prp-period.js`); // any page on the site, so the stylesheet and script load from it
  await page.setContent(`<!doctype html><html class="prp" data-suite="rs"><head><link rel="stylesheet" href="${BASE}/design/prp.css"></head>
    <body style="padding:20px"><div id="years"></div><div id="months" style="margin-top:30px"></div><script src="${BASE}/design/prp-period.js"></script></body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => {
    window.changes = [];
    const years = Array.from({ length: 100 }, (_, k) => 1926 + k);
    window.snap = PRPPeriod.mount(document.querySelector('#years'), { stops: years, rest: 'end', ids: { from: 'from', to: 'year', prev: 'prev', play: 'play', next: 'next' },
      play: { interval: 60, label: 'Play through the years' }, ticks: [{ at: 1926, text: '1926' }, { at: 1970, text: '1970', kind: 'key' }, { at: 2025, text: '2025' }], onChange: p => window.changes.push(p) });
    window.upto = PRPPeriod.mount(document.querySelector('#months'), { stops: ['2023-01', '2023-02', '2023-03', '2023-04'], strip: [3, 0, 5, 1], exact: false,
      ids: { from: 'm-from', to: 'm-to' }, steps: true, onChange: p => window.changes.push(p) });
  });
  const last = () => page.evaluate(() => { const p = window.changes.at(-1); return p && { from: p.from, to: p.to, atRest: p.atRest, source: p.source }; });
  const values = () => page.evaluate(() => [document.querySelector('#from').value, document.querySelector('#year').value]);
  // At rest: the start rides on the end, in front and ringed; the inputs carry years; only the thumbs take the pointer.
  assert.deepEqual(await values(), ['2025', '2025']);
  assert.equal(await page.locator('#years .prp-period-range.joined.top-from').count(), 1);
  assert.match(await page.locator('#from').getAttribute('aria-valuetext'), /^2025 \(the same as the end\)$/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#year')).pointerEvents), 'none');
  assert.deepEqual(await page.locator('#years .prp-period-ticks span').evaluateAll(s => s.map(x => x.className)), ['start', 'key', 'end']);
  // The end handle moves a single year as one, as the one-handled slider did.
  await page.locator('#year').fill('1990'); await page.locator('#year').dispatchEvent('input');
  assert.deepEqual(await values(), ['1990', '1990']);
  assert.deepEqual(await last(), { from: 1990, to: 1990, atRest: true, source: 'input' });
  // The start opens a period; the fill spans it.
  await page.locator('#from').fill('1980'); await page.locator('#from').dispatchEvent('input');
  assert.deepEqual(await last(), { from: 1980, to: 1990, atRest: false, source: 'input' });
  assert.equal(await page.locator('#years .prp-period-range.joined').count(), 0);
  assert.ok(Math.abs(await page.evaluate(() => parseFloat(document.querySelector('#years .prp-period-fill').style.width)) - 1000 / 99) < 0.01);
  // A click on the track near 2020 moves the nearer handle, the end.
  const box = await page.locator('#years .prp-period-track').boundingBox();
  await page.mouse.click(box.x + box.width * (94 / 99), box.y + box.height / 2);
  assert.deepEqual(await last(), { from: 1980, to: 2020, atRest: false, source: 'track' });
  // Home on the focused end handle pulls the start back with it: one year again, at rest; End then travels.
  await page.locator('#year').press('Home');
  assert.deepEqual(await last(), { from: 1926, to: 1926, atRest: true, source: 'input' });
  await page.locator('#year').press('End');
  assert.deepEqual(await values(), ['2025', '2025']);
  // ‹ steps the single year back; play travels from the first year; a second press stops it.
  await page.locator('#prev').click();
  assert.deepEqual(await last(), { from: 2024, to: 2024, atRest: true, source: 'step' });
  await page.locator('#next').click();
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Pause');
  await page.waitForFunction(() => window.snap.get().to >= 1929);
  await page.locator('#play').click();
  const played = await page.evaluate(() => window.snap.get());
  assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play through the years');
  assert.ok(played.from === played.to && played.to >= 1929 && played.to < 2000, JSON.stringify(played));
  // The address round trip: a start read back from a written one gives the same period.
  const trip = await page.evaluate(() => {
    const p = window.snap.set(1939, 1945, { silent: true }), f = PRPPeriod.rules.startParam(p);
    const back = window.snap.set(PRPPeriod.rules.readStart(p.stops, String(f), 1945, 'end'), 1945, { silent: true });
    const rest = window.snap.set(PRPPeriod.rules.readStart(p.stops, '1950', 1945, 'end'), 1945, { silent: true });
    return [f, back.from, back.to, back.atRest, rest.atRest, rest.from];
  });
  assert.deepEqual(trip, [1939, 1939, 1945, false, true, 1945]);
  // A real pointer on the joined handles: the start's thumb (in front, ringed) dragged back 60px opens a period, follows
  // the pointer (to within a year) and leaves the end where it was. On a page, nothing beside or above the control may
  // change size as the period opens (design/PRP-STYLE.md), or the track moves under the pointer.
  const at = await page.locator('#from').evaluate(e => {
    const r = e.getBoundingClientRect(), t = parseFloat(getComputedStyle(e.closest('.prp-period')).getPropertyValue('--prp-period-thumb')) || 16;
    return { x: r.left + t / 2 + ((+e.value - +e.min) / Math.max(1, +e.max - +e.min)) * (r.width - t), y: r.top + r.height / 2, year: (r.width - t) / Math.max(1, +e.max - +e.min) };
  });
  const dragged = [];
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) { await page.mouse.move(at.x - 6 * k, at.y); dragged.push((await values()).map(Number)); }
  await page.mouse.up();
  assert.ok(dragged.every(([f, t], k) => t === 1945 && f <= (k ? dragged[k - 1][0] : 1945)), JSON.stringify(dragged));
  assert.ok(Math.abs(dragged.at(-1)[0] - (1945 - 60 / at.year)) <= 1, `60px back from 1945 at ${at.year.toFixed(1)}px a year: ${dragged.at(-1)[0]}`);
  assert.deepEqual(await last(), { from: dragged.at(-1)[0], to: 1945, atRest: false, source: 'input' });
  // An up-to control of months: indices, not values; a strip with the period's bars in the accent; set() on a start
  // after the end makes it the end.
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#m-from').value, document.querySelector('#m-to').value, document.querySelector('#m-to').dataset.value]), ['0', '3', '2023-04']);
  assert.equal(await page.locator('#months .prp-period-strip rect').count(), 4);
  assert.equal(await page.locator('#months .prp-period-strip rect.in').count(), 4);
  await page.locator('#m-from').fill('2'); await page.locator('#m-from').dispatchEvent('input');
  assert.equal(await page.locator('#months .prp-period-strip rect.in').count(), 2);
  assert.deepEqual(await page.evaluate(() => { const p = window.upto.set('2023-04', '2023-02', { silent: true }); return [p.from, p.to, p.atRest]; }), ['2023-02', '2023-02', false]);
  assert.deepEqual(errors, []);
});
