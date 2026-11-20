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

test('play from a snapshot page\'s opening period travels through every stop, as from the single last time', () => {
  // The opening (the last two stops) plays as one time from the first stop, not one step of growth and a stop.
  let s = st(8, 9, 10, 'end'), mode = R.playMode(s);
  assert.equal(mode, 'travel');
  assert.deepEqual(ij(s = R.playStart(s, mode)), [0, 0]);
  assert.deepEqual(ij(s = R.playTick(s, mode)), [1, 1]);
  for (let k = 2; k < 10; k++) assert.deepEqual(ij(s = R.playTick(s, mode)), [k, k]);
  assert.equal(R.playTick(s, mode), null);
  assert.equal(R.playMode(st(0, 1, 2, 'end')), 'travel');   // two stops: the opening is the whole track
  // Any other period still grows: one ending earlier, a longer one, and the same stops on an up-to page.
  assert.equal(R.playMode(st(7, 8, 10, 'end')), 'grow');
  assert.equal(R.playMode(st(7, 9, 10, 'end')), 'grow');
  assert.equal(R.playMode(st(8, 9, 10)), 'grow');
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

// Jude, 14 November 2026: the handles opened on top of each other on the snapshot maps. An address that names no time
// at all (bare) now opens with the start one stop before the end, a two-step period; one that names a time keeps it.
test('opening: a bare snapshot address opens one stop apart; an up-to page, one stop and named times are unchanged', () => {
  const years = Array.from({ length: 100 }, (_, k) => 1926 + k), months = ['2026-01', '2026-02', '2026-03'], steps = [-2000, -1000, 1, 1000, 2025];
  assert.equal(R.openStart(years, 2025), 2024);
  assert.equal(R.openStart(years, null), 2024);   // no end given: the last stop's
  assert.equal(R.openStart(steps, 2025), 1000);   // the stop before, however far back it lies
  assert.equal(R.openStart(months, '2026-03'), '2026-02');
  assert.equal(R.openStart(years, 1926), null);   // the end on the first stop: one time
  assert.equal(R.openStart([2026], 2026), null);  // one stop: one handle position
  assert.equal(R.openStart([], null), null);
  assert.equal(R.readStart(years, null, 2025, 'end', true), 2024);
  assert.equal(R.readStart(months, null, '2026-03', 'end', true), '2026-02');
  assert.equal(R.readStart([2026], null, 2026, 'end', true), null);
  assert.equal(R.readStart([], null, null, 'end', true), null);
  // Up-to pages already open apart (the start on the first stop): bare changes nothing there.
  assert.equal(R.readStart(months, null, '2026-03', 'first', true), null);
  // An address that names a time is not bare, and reads as before: one year, or its period.
  assert.equal(R.readStart(years, null, 1950, 'end'), null);
  assert.equal(R.readStart(years, '1939', 1945, 'end'), 1939);
  // The opening period, written and read back, is the same period (it is away from rest, so its start is written).
  const p = { atRest: false, from: R.openStart(years, 2025) };
  assert.equal(R.readStart(years, String(R.startParam(p)), 2025, 'end'), 2024);
  assert.equal(R.atRest({ i: 98, j: 99, n: 100, rest: 'end' }), false);
  assert.deepEqual(R.layering({ i: 98, j: 99, n: 100, rest: 'end' }), { topFrom: false, joined: false });
});

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: a mounted control travels, opens a period, follows the track, the keys and play', BASE ? pageTest : { skip: 'set JDPI_URL to test the control in a browser' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
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

// MP-03 (15 Nov 2026): on a phone the opening is as many stops apart as gives at least about 24 px at the drawn width.
test('opening on a phone: openSteps spaces the handles at least 24 px apart; the opening of that many steps still plays as one', () => {
  const years = Array.from({ length: 100 }, (_, k) => 1926 + k);
  assert.equal(R.openSteps(100, 300), 8);          // 99 gaps over 300 px: 3 px a step, 8 steps for 24 px
  assert.equal(R.openSteps(100, 1200), 2);
  assert.equal(R.openSteps(3, 300), 1);            // a short track: one step is wide already
  assert.equal(R.openSteps(100, 0), 1);            // no width known: one step
  assert.equal(R.openSteps(5, 10), 4);             // never more than the track holds
  assert.equal(R.openStart(years, 2025, 8), 2017);
  assert.equal(R.openStart(years, 1930, 8), 1926); // not before the first stop
  assert.equal(R.readStart(years, null, 2025, 'end', true, 8), 2017);
  const s = { i: 91, j: 99, n: 100, rest: 'end' };
  assert.equal(R.playMode(s, 8), 'travel');
  assert.equal(R.playMode(s), 'grow');             // a period the reader made is not the opening
  assert.equal(R.playMode({ ...s, i: 98 }), 'travel');
});

// MP-12 (Jude, 17 November 2026): three movements, Independent Movement, Move Together and Single Year.
const mv = (i, j, n, m, rest = 'first') => ({ i, j, n, rest, m });

test('movements, Independent: the rules as they were (no m, or m independent, give the same)', () => {
  for (const rest of ['first', 'end']) for (const [i, j] of [[2, 5], [5, 5], [0, 0], [0, 9]]) for (const k of [0, 3, 5, 7, 9]) {
    const a = st(i, j, 10, rest), b = mv(i, j, 10, 'independent', rest), tag = `${rest} ${i},${j} → ${k}`;
    assert.deepEqual(ij(R.startTo(b, k)), ij(R.startTo(a, k)), `start ${tag}`);
    assert.deepEqual(ij(R.endTo(b, k)), ij(R.endTo(a, k)), `end ${tag}`);
    assert.deepEqual(ij(R.trackTo(b, k)), ij(R.trackTo(a, k)), `track ${tag}`);
    assert.equal(R.trackMoves(b, k), R.trackMoves(a, k), `track moves ${tag}`);
    for (const d of [-1, 1]) assert.deepEqual(ij(R.stepBy(b, d)), ij(R.stepBy(a, d)), `step ${d} ${tag}`);
    assert.equal(R.playMode(b), R.playMode(a), `play ${tag}`);
  }
});

test('movements, Move Together: drag, keys, track and steps move both and keep the span, at both ends too', () => {
  for (const rest of ['first', 'end']) {
    const s = mv(2, 5, 10, 'together', rest);
    // A drag (or a key, which moves the same input) on the start or the end carries the other by as much.
    assert.deepEqual(ij(R.startTo(s, 4)), [4, 7], `${rest}: start dragged on`);
    assert.deepEqual(ij(R.endTo(s, 3)), [0, 3], `${rest}: end dragged back`);
    assert.deepEqual(ij(R.startTo(s, 8)), [6, 9], `${rest}: past the last stop, the pair stops with its span`);
    assert.deepEqual(ij(R.endTo(s, 99)), [6, 9], `${rest}: End key`);
    assert.deepEqual(ij(R.endTo(s, 1)), [0, 3], `${rest}: before the first stop, the pair stops with its span`);
    assert.deepEqual(ij(R.startTo(s, 0)), [0, 3], `${rest}: Home key on the start`);
    // ‹ › move both one stop, and stop at the ends with the span kept.
    assert.deepEqual(ij(R.stepBy(s, 1)), [3, 6]);
    assert.deepEqual(ij(R.stepBy(s, -1)), [1, 4]);
    assert.deepEqual(ij(R.stepBy(mv(6, 9, 10, 'together', rest), 1)), [6, 9]);
    assert.deepEqual(ij(R.stepBy(mv(0, 3, 10, 'together', rest), -1)), [0, 3]);
    assert.deepEqual(ij(R.stepBy(s, -1, true)), [2, 5]); // a value between stops: back to its own stop first
    // The track: the nearer handle lands there, the other keeps the span.
    assert.deepEqual(ij(R.trackTo(s, 1)), [1, 4]);
    assert.equal(R.trackMoves(s, 1), 'from');
    assert.deepEqual(ij(R.trackTo(s, 8)), [5, 8]);
    assert.deepEqual(ij(R.trackTo(s, 0)), [0, 3]);
    assert.deepEqual(ij(R.trackTo(mv(2, 5, 10, 'together', rest), 9)), [6, 9]);
    // A span of nothing moves as one; the whole track cannot move.
    assert.deepEqual(ij(R.endTo(mv(4, 4, 10, 'together', rest), 7)), [7, 7]);
    assert.deepEqual(ij(R.startTo(mv(0, 9, 10, 'together', rest), 5)), [0, 9]);
  }
  assert.deepEqual(ij(R.shift(mv(2, 5, 10, 'together'), 2.4)), [4, 7]);
});

test('movements, Move Together: play moves both one stop a tick; from the last stop it begins again at the first', () => {
  let s = mv(2, 5, 10, 'together', 'end'), mode = R.playMode(s);
  assert.equal(mode, 'shift');
  assert.equal(R.playMode(mv(9, 9, 10, 'together', 'end')), 'shift');
  assert.deepEqual(ij(s = R.playStart(s, mode)), [2, 5]); // not at the end: on from where it is
  assert.deepEqual(ij(s = R.playTick(s, mode)), [3, 6]);
  for (let k = 4; k <= 6; k++) assert.deepEqual(ij(s = R.playTick(s, mode)), [k, k + 3]);
  assert.equal(R.playTick(s, mode), null);              // the end on the last stop: play stops, the span kept
  assert.deepEqual(ij(R.playStart(s, mode)), [0, 3]);   // pressed again: from the first stop, the span kept
  assert.deepEqual(ij(R.playStart(mv(0, 9, 10, 'together'), 'shift')), [0, 9]);
  assert.equal(R.playTick(mv(0, 9, 10, 'together'), 'shift'), null); // the whole track: nothing to play
});

test('movements, Single Year: one stop, moved as one by drag, keys, track, steps and play', () => {
  for (const rest of ['first', 'end']) {
    const s = mv(4, 4, 10, 'single', rest);
    assert.deepEqual(ij(R.startTo(s, 2)), [2, 2], `${rest}: start dragged back`);
    assert.deepEqual(ij(R.startTo(s, 7)), [7, 7], `${rest}: start dragged on`);
    assert.deepEqual(ij(R.endTo(s, 1)), [1, 1], `${rest}: end dragged back`);
    assert.deepEqual(ij(R.endTo(s, 99)), [9, 9], `${rest}: End key`);
    assert.deepEqual(ij(R.trackTo(s, 6)), [6, 6], `${rest}: track`);
    assert.equal(R.trackMoves(mv(2, 2, 10, 'single', rest), 1), 'to');
    assert.deepEqual(ij(R.stepBy(s, 1)), [5, 5]);
    assert.deepEqual(ij(R.stepBy(s, -1)), [3, 3]);
    assert.deepEqual(ij(R.stepBy(mv(9, 9, 10, 'single', rest), 1)), [9, 9]);
    assert.deepEqual(ij(R.stepBy(mv(0, 0, 10, 'single', rest), -1)), [0, 0]);
    let p = mv(9, 9, 10, 'single', rest);
    const mode = R.playMode(p);
    assert.equal(mode, 'travel');
    assert.deepEqual(ij(p = R.playStart(p, mode)), [0, 0]);
    assert.deepEqual(ij(R.playTick(p, mode)), [1, 1]);
  }
  assert.deepEqual(ij(R.collapse(mv(2, 7, 10, 'single'))), [7, 7]); // choosing it brings the start onto the end
  // Its name follows the stops: a slider of months or days would be plainly misnamed "Single Year".
  assert.equal(R.singleName([1926, 1927]), 'Single Year');
  assert.equal(R.singleName([-3000, -2900, 1684]), 'Single Year');
  assert.equal(R.singleName(['2023-01', '2023-02']), 'Single Month');
  assert.equal(R.singleName(['-0431-05', '-0431-06']), 'Single Month');
  assert.equal(R.singleName(['2026-09-29', '2026-09-30']), 'Single Day');
  assert.equal(R.singleName([]), 'Single Year');
});

test('movements in the address: one parameter, written only away from the page\'s default, read back as the default', () => {
  const P = globalThis.PRPPeriod;
  assert.equal(P.MOVE_PARAM, 'move');
  assert.deepEqual(P.MOVES, ['independent', 'together', 'single']);
  assert.equal(R.movementParam('independent'), null);
  assert.equal(R.movementParam('together'), 'together');
  assert.equal(R.movementParam('single'), 'single');
  assert.equal(R.movementParam('single', 'single'), null);           // a page whose default is Single
  assert.equal(R.movementParam('independent', 'single'), 'independent');
  assert.equal(R.movementParam('nonsense'), null);
  for (const raw of [null, undefined, '', 'x', 'apart']) assert.equal(R.readMovement(raw), 'independent', String(raw)); // an old address
  assert.equal(R.readMovement(null, 'together'), 'together');
  assert.equal(R.readMovement('Together'), 'together');
  assert.equal(R.readMovement(' single '), 'single');
  for (const m of P.MOVES) for (const dflt of P.MOVES) assert.equal(R.readMovement(R.movementParam(m, dflt), dflt), m, `${m} on a ${dflt} page`);
});

/* A small document, just enough of the DOM for PRPPeriod.mount to run in Node: elements with attributes, classes,
   children, events and a box for the track. Inputs keep value, min and max as properties, as the real ones do. */
class FakeEl {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.kids = []; this.parent = null; this.dataset = {}; this.style = {}; this.on = {}; this.hidden = false; this.text = ''; this.value = ''; this.min = ''; this.max = ''; }
  get children() { return this.kids; }
  get lastChild() { return this.kids.at(-1) || null; }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get classList() {
    const get = () => new Set(this.className.split(/\s+/).filter(Boolean)), put = c => { this.className = [...c].join(' '); };
    return { add: (...n) => { const c = get(); n.forEach(x => c.add(x)); put(c); }, contains: n => get().has(n),
      toggle: (n, on) => { const c = get(); if (on ?? !c.has(n)) c.add(n); else c.delete(n); put(c); } };
  }
  get id() { return this.attrs.get('id') || ''; }
  set textContent(v) { this.text = String(v); this.kids = []; }
  get textContent() { return this.text + this.kids.map(k => k.textContent).join(''); }
  setAttribute(k, v) { if (k === 'value') this.value = String(v); this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  append(...n) { for (const c of n) { c.remove(); c.parent = this; this.kids.push(c); } }
  replaceChildren(...n) { this.kids.forEach(c => { c.parent = null; }); this.kids = []; this.append(...n); }
  remove() { if (this.parent) { this.parent.kids = this.parent.kids.filter(c => c !== this); this.parent = null; } }
  addEventListener(t, f) { (this.on[t] ||= []).push(f); }
  dispatch(t, ev = {}) { (this.on[t] || []).forEach(f => f({ type: t, target: this, ...ev })); }
  click() { this.dispatch('click'); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 990, height: 4 }; }
  all(pred, out = []) { for (const c of this.kids) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  find(sel) { return this.all(e => (sel.startsWith('#') ? e.id === sel.slice(1) : e.classList.contains(sel.slice(1))))[0] || null; }
}
const fakeDoc = () => { const doc = { createElement: t => new FakeEl(doc, t), createElementNS: (_, t) => new FakeEl(doc, t) }; return doc; };
const years = Array.from({ length: 100 }, (_, k) => 1926 + k);
function mountFake(opts = {}) {
  const el = new FakeEl(fakeDoc(), 'div'), changes = [];
  const period = globalThis.PRPPeriod.mount(el, { onChange: p => changes.push(p), ...opts });
  const q = sel => el.find(sel);
  const pressed = () => el.all(e => e.classList.contains('prp-period-move')).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset?.move || b.getAttribute('data-move'));
  const drag = (which, v) => { const inp = period.inputs[which]; inp.value = String(v); inp.dispatch('input'); };
  const last = () => { const p = changes.at(-1); return p && { from: p.from, to: p.to, source: p.source, movement: p.movement }; };
  return { el, period, changes, q, pressed, drag, last };
}

test('movement buttons: three, named, one chosen; the default is Independent and set() and the opening are unchanged', () => {
  for (const rest of ['first', 'end']) {
    const plain = mountFake({ stops: years, rest, from: rest === 'end' ? 2024 : null, to: 2025, play: { interval: 50 } });
    const { el, period, changes, pressed } = plain;
    const box = plain.q('.prp-period-moves');
    assert.ok(box && !box.hidden, `${rest}: drawn`);
    assert.equal(box.getAttribute('role'), 'group');
    assert.equal(box.getAttribute('aria-label'), 'Movement');
    const btns = box.children;
    assert.deepEqual(btns.map(b => b.getAttribute('aria-label')), ['Independent Movement', 'Move Together', 'Single Year']);
    assert.deepEqual(btns.map(b => b.getAttribute('title')), ['Independent Movement', 'Move Together', 'Single Year']);
    assert.ok(btns.every(b => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button'));
    assert.deepEqual(pressed(), ['independent']);
    assert.equal(el.dataset.movement, 'independent');
    // The buttons sit with ‹ ▶ ›, after them and before the track.
    assert.deepEqual(el.children.map(c => c.className), ['prp-period-btn', 'prp-period-btn play', 'prp-period-btn', 'prp-period-moves', 'prp-period-slider']);
    // Nothing reported at mount; set() reports as before, with the movement added.
    assert.equal(changes.length, 0);
    assert.equal(period.movement(), 'independent');
    const p = period.get();
    assert.deepEqual([p.from, p.to, p.atRest, p.movement], rest === 'end' ? [2024, 2025, false, 'independent'] : [1926, 2025, true, 'independent']);
    period.set(1939, 1945);
    assert.equal(changes.length, 1);
    assert.deepEqual(Object.keys(changes[0]).sort(), ['atRest', 'from', 'fromIndex', 'playing', 'single', 'source', 'stops', 'to', 'toIndex', 'movement'].sort());
    assert.deepEqual(plain.last(), { from: 1939, to: 1945, source: 'set', movement: 'independent' });
    period.set(null, 1950);
    assert.deepEqual([period.get().from, period.get().to], rest === 'end' ? [1950, 1950] : [1926, 1950]);
  }
  // A page's names, titles and ids; a page that switches the buttons off.
  const named = mountFake({ stops: years, ids: { together: 'mv-t' }, titles: { single: 'One year (S)' } });
  assert.equal(named.q('#mv-t').getAttribute('data-move'), 'together');
  assert.equal(named.q('.prp-period-moves').children[2].getAttribute('title'), 'One year (S)');
  assert.equal(mountFake({ stops: years, movements: false }).q('.prp-period-moves'), null);
});

test('movement buttons: a press chooses one, reports it once, and Single brings the start onto the end', () => {
  const t = mountFake({ stops: years, rest: 'end', from: 1939, to: 1945 });
  t.q('.prp-period-moves').children[1].click();
  assert.deepEqual(t.pressed(), ['together']);
  assert.equal(t.changes.length, 1);
  assert.deepEqual(t.last(), { from: 1939, to: 1945, source: 'movement', movement: 'together' }); // the period kept
  t.q('.prp-period-moves').children[1].click();                                                // again: no change
  assert.equal(t.changes.length, 1);
  t.q('.prp-period-moves').children[2].click();
  assert.deepEqual(t.pressed(), ['single']);
  assert.deepEqual(t.last(), { from: 1945, to: 1945, source: 'movement', movement: 'single' });
  assert.equal(t.changes.length, 2);
  t.q('.prp-period-moves').children[0].click();
  assert.deepEqual(t.last(), { from: 1945, to: 1945, source: 'movement', movement: 'independent' }); // the one year kept
  assert.equal(t.changes.length, 3);
  // A page's own choice (its address): silent, and anything unknown is the page's default.
  assert.equal(t.period.setMovement('single', { silent: true }).movement, 'single');
  assert.equal(t.changes.length, 3);
  assert.deepEqual(t.pressed(), ['single']);
  assert.equal(t.period.setMovement('nonsense').movement, 'independent');
  assert.equal(t.changes.length, 4);
  // A page whose default is another opens on it, and reads an unknown movement as it.
  const d = mountFake({ stops: years, movement: 'together', from: 1990, to: 2000 });
  assert.deepEqual(d.pressed(), ['together']);
  assert.equal(d.period.setMovement('x').movement, 'together');
});

test('movement buttons keep a value between stops (exact), as the silent path does', () => {
  const stops = [1600, 1684, 1700, 1750];
  for (const [m, button] of [['together', 1], ['independent', 0]]) {
    const t = mountFake({ stops, exact: true, from: 1600, to: 1687 });
    if (m === 'independent') t.period.setMovement('together', { silent: true });
    t.q('.prp-period-moves').children[button].click();
    assert.equal(t.changes.length, 1, m);
    assert.deepEqual([t.last().from, t.last().to, t.last().movement], [1600, 1687, m]);
  }
  const s = mountFake({ stops, exact: true, from: 1600, to: 1687 });
  s.q('.prp-period-moves').children[2].click();
  assert.deepEqual([s.last().from, s.last().to, s.last().movement], [1687, 1687, 'single']);
  const quiet = mountFake({ stops, exact: true, from: 1600, to: 1687 });
  quiet.period.setMovement('single', { silent: true });
  assert.deepEqual([quiet.period.get().from, quiet.period.get().to], [1687, 1687]); // a press and a reload agree
});

test('Move Together over the whole track does not play; Single names the start as the end on every page', () => {
  const plays = [];
  const t = mountFake({ stops: [2000, 2001, 2002, 2003], from: 2000, to: 2003, movement: 'together', play: { interval: 5 }, onPlay: on => plays.push(on) });
  t.period.play();
  assert.deepEqual([plays, t.changes.length, t.period.get().playing], [[], 0, false]);
  for (const rest of ['first', 'end']) {
    const s = mountFake({ stops: years, rest, to: 1945, movement: 'single' });
    assert.equal(s.period.inputs.from.getAttribute('aria-valuetext'), '1945 (the same as the end)', rest);
  }
  const upto = mountFake({ stops: years, from: 1939, to: 1945 });
  assert.equal(upto.period.inputs.from.getAttribute('aria-valuetext'), '1939');
});

test('movement by drag and keys on a mounted control: Together keeps the span at both ends, Single moves as one', () => {
  const t = mountFake({ stops: years, rest: 'end', from: 1939, to: 1945, movement: 'together' });
  t.drag('to', 1950);                                    // the end dragged on 5 years: the start follows
  assert.deepEqual(t.last(), { from: 1944, to: 1950, source: 'input', movement: 'together' });
  t.drag('from', 1930);                                  // the start dragged back: the end follows
  assert.deepEqual(t.last(), { from: 1930, to: 1936, source: 'input', movement: 'together' });
  t.drag('to', 2025);                                    // End on the end handle: the pair at the last stop, span kept
  assert.deepEqual(t.last(), { from: 2019, to: 2025, source: 'input', movement: 'together' });
  assert.deepEqual([t.period.inputs.from.value, t.period.inputs.to.value], ['2019', '2025']);
  t.drag('from', 2024);                                  // pushed against the end of the track: the pair stays
  assert.deepEqual([t.period.inputs.from.value, t.period.inputs.to.value], ['2019', '2025']); // the thumb put back
  const n = t.changes.length;
  t.drag('from', 1926);                                  // Home on the start: the pair at the first stop
  assert.deepEqual(t.last(), { from: 1926, to: 1932, source: 'input', movement: 'together' });
  t.drag('to', 1927);                                    // pulled against the first stop: the pair stays
  assert.equal(t.changes.length, n + 1);
  assert.deepEqual([t.period.get().from, t.period.get().to], [1926, 1932]);
  // The track: the nearer handle lands there.
  t.q('.prp-period-track').dispatch('click', { clientX: 990 * (60 / 99) });
  assert.deepEqual(t.last(), { from: 1980, to: 1986, source: 'track', movement: 'together' });

  for (const rest of ['first', 'end']) {
    const s = mountFake({ stops: years, rest, from: 1939, to: 1945, movement: 'single' });
    assert.deepEqual([s.period.get().from, s.period.get().to, s.period.get().single], [1945, 1945, true]); // the opening, as one
    s.drag('from', 1930);
    assert.deepEqual(s.last(), { from: 1930, to: 1930, source: 'input', movement: 'single' });
    s.drag('to', 1960);
    assert.deepEqual(s.last(), { from: 1960, to: 1960, source: 'input', movement: 'single' });
    s.q('.prp-period-track').dispatch('click', { clientX: 990 * (10 / 99) });
    assert.deepEqual(s.last(), { from: 1936, to: 1936, source: 'track', movement: 'single' });
    s.period.set(1939, 1945);                            // set() keeps the movement's rule: the end's one year
    assert.deepEqual(s.last(), { from: 1945, to: 1945, source: 'set', movement: 'single' });
  }
});

test('movement by step and play on a mounted control', async () => {
  const t = mountFake({ stops: years, rest: 'end', from: 2015, to: 2020, movement: 'together', play: { interval: 5 } });
  const [prev, , next] = t.el.children;
  next.click();
  assert.deepEqual(t.last(), { from: 2016, to: 2021, source: 'step', movement: 'together' });
  prev.click(); prev.click();
  assert.deepEqual(t.last(), { from: 2014, to: 2019, source: 'step', movement: 'together' });
  t.period.play();
  await new Promise(r => setTimeout(r, 200));
  assert.equal(t.period.get().playing, false);           // stopped with the end on the last stop
  const plays = t.changes.filter(p => p.source === 'play');
  assert.ok(plays.length >= 5 && plays.every(p => p.to - p.from === 5), JSON.stringify(plays.map(p => [p.from, p.to])));
  assert.deepEqual([t.period.get().from, t.period.get().to], [2020, 2025]);
  next.click();                                          // at the end: the pair stays
  assert.deepEqual([t.period.get().from, t.period.get().to], [2020, 2025]);
  t.period.play();                                       // again: from the first stop, the span kept
  assert.deepEqual([t.changes.at(-1).from, t.changes.at(-1).to, t.changes.at(-1).source], [1926, 1931, 'play']);
  t.period.stop();

  const s = mountFake({ stops: years, rest: 'first', from: 1990, to: 2000, movement: 'single', play: { interval: 5 } });
  const [sPrev, , sNext] = s.el.children;
  sNext.click();
  assert.deepEqual(s.last(), { from: 2001, to: 2001, source: 'step', movement: 'single' });
  sPrev.click();
  assert.deepEqual(s.last(), { from: 2000, to: 2000, source: 'step', movement: 'single' });
  s.period.set(null, 2022);
  s.period.play();
  await new Promise(r => setTimeout(r, 100));
  assert.ok(s.changes.filter(p => p.source === 'play').every(p => p.from === p.to));
  assert.deepEqual([s.period.get().from, s.period.get().to, s.period.get().playing], [2025, 2025, false]);
  // A press on a movement button stops play.
  s.period.set(null, 1930, { silent: true });
  s.period.play();
  assert.equal(s.period.get().playing, true);
  s.q('.prp-period-moves').children[0].click();
  assert.equal(s.period.get().playing, false);
});

test('movement on months and days: Single Month, Single Day; a control of one stop hides the buttons', () => {
  const months = mountFake({ stops: ['2023-01', '2023-02', '2023-03', '2023-04'], rest: 'end', from: '2023-02', to: '2023-04' });
  assert.equal(months.q('.prp-period-moves').children[2].getAttribute('aria-label'), 'Single Month');
  months.q('.prp-period-moves').children[2].click();
  assert.deepEqual(months.last(), { from: '2023-04', to: '2023-04', source: 'movement', movement: 'single' });
  months.drag('from', 1);                                // indices, not values, on these stops
  assert.deepEqual(months.last(), { from: '2023-02', to: '2023-02', source: 'input', movement: 'single' });
  const days = mountFake({ stops: ['2026-09-29', '2026-09-30', '2026-10-01'], movement: 'single' });
  assert.equal(days.q('.prp-period-moves').children[2].getAttribute('title'), 'Single Day');
  assert.deepEqual([days.period.get().from, days.period.get().to], ['2026-10-01', '2026-10-01']);
  // A page's own name wins.
  assert.equal(mountFake({ stops: ['2023-01', '2023-02'], names: { single: 'Single Year' } }).q('.prp-period-moves').children[2].getAttribute('aria-label'), 'Single Year');
  // One stop: nothing to move; the buttons come back when more stops arrive. No stops yet: drawn, and a press reports nothing.
  const one = mountFake({ stops: [2026] });
  assert.equal(one.q('.prp-period-moves').hidden, true);
  one.period.update({ stops: [2025, 2026] });
  assert.equal(one.q('.prp-period-moves').hidden, false);
  const empty = mountFake({ stops: [] });
  assert.equal(empty.q('.prp-period-moves').hidden, false);
  empty.q('.prp-period-moves').children[1].click();
  assert.equal(empty.changes.length, 0);
  assert.equal(empty.period.movement(), 'together');
  // update() with Single chosen keeps the one time.
  empty.period.setMovement('single', { silent: true });
  empty.period.update({ stops: years, from: 1939, to: 1945 });
  assert.deepEqual([empty.period.get().from, empty.period.get().to], [1945, 1945]);
});

test('page: the movement buttons by pointer, touch and keyboard, with a focus ring, light and dark, at 390 px', BASE ? pageTest : { skip: 'set JDPI_URL to test the control in a browser' }, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, scheme, touch] of [[1000, 'light', false], [390, 'dark', true]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 500 }, colorScheme: scheme, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/design/prp-period.js`);
    await page.setContent(`<!doctype html><html class="prp" data-suite="rs"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${BASE}/design/prp.css"></head>
      <body style="margin:0;padding:0 16px"><div id="years"></div><script src="${BASE}/design/prp-period.js"></script></body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => {
      window.changes = [];
      window.snap = PRPPeriod.mount(document.querySelector('#years'), { stops: Array.from({ length: 100 }, (_, k) => 1926 + k), rest: 'end', from: 1939, to: 1945,
        ids: { from: 'from', to: 'year', prev: 'prev', play: 'play', next: 'next' }, play: { interval: 60 }, onChange: p => window.changes.push(p) });
    });
    const pressed = () => page.locator('.prp-period-move[aria-pressed="true"]').evaluateAll(b => b.map(x => x.dataset.move));
    const period = () => page.evaluate(() => { const p = window.snap.get(); return [p.from, p.to, p.movement]; });
    assert.deepEqual(await pressed(), ['independent'], `${width}: Independent chosen at first`);
    assert.equal(await page.locator('.prp-period-move[title="Move Together"]').count(), 1);
    // The row fits: nothing beyond the page's gutter, the track still a usable width, no horizontal scroll.
    const fit = await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      return { right: Math.max(...[...document.querySelectorAll('#years > *')].map(e => e.getBoundingClientRect().right)), track: r('.prp-period-track').width,
        scroll: document.documentElement.scrollWidth, moves: r('.prp-period-moves').width, h: r('.prp-period-move').height };
    });
    assert.ok(fit.right <= width - 16 + 0.5 && fit.scroll <= width, `${width}: ${JSON.stringify(fit)}`);
    assert.ok(fit.track >= 120, `${width}: the track keeps ${fit.track}px`);
    assert.ok(fit.h >= 24, `${width}: a target of at least 24px (${fit.h})`);
    // The chosen button is drawn by its inset bar as well as its colour; the colours follow the scheme by the tokens.
    const look = await page.evaluate(() => {
      const cs = e => getComputedStyle(e), on = document.querySelector('.prp-period-move[aria-pressed="true"]'), off = document.querySelector('.prp-period-move[aria-pressed="false"]');
      return { on: cs(on).boxShadow, off: cs(off).boxShadow, bg: cs(off).backgroundColor, page: cs(document.body).backgroundColor };
    });
    assert.match(look.on, /inset/);
    assert.equal(look.off, 'none');
    const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number); return (r + g + b) / 3; };
    assert.ok(scheme === 'dark' ? lum(look.bg) < 128 : lum(look.bg) > 128, `${scheme}: ${look.bg}`);
    // Pointer (or touch): Move Together, then the end handle's keys carry the start by the span.
    if (touch) await page.locator('[data-move="together"]').tap(); else await page.locator('[data-move="together"]').click();
    assert.deepEqual(await pressed(), ['together']);
    assert.deepEqual(await period(), [1939, 1945, 'together']);
    await page.locator('#year').focus();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await period(), [1940, 1946, 'together']);
    await page.keyboard.press('End');
    assert.deepEqual(await period(), [2019, 2025, 'together']);
    await page.locator('#prev').click();
    assert.deepEqual(await period(), [2018, 2024, 'together']);
    // Keyboard: Tab to Single Year, a visible focus ring, Space chooses it; Enter on Independent goes back.
    await page.locator('[data-move="together"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.move), 'single');
    const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return [cs.outlineStyle, parseFloat(cs.outlineWidth)]; });
    assert.deepEqual(ring, ['solid', 2]);
    await page.keyboard.press('Space');
    assert.deepEqual(await pressed(), ['single']);
    assert.deepEqual(await period(), [2024, 2024, 'single']);
    await page.locator('#from').focus();
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await period(), [2023, 2023, 'single']);
    await page.locator('#play').click();                  // the one year travels on to the last stop and stops there
    await page.waitForFunction(() => !window.snap.get().playing);
    const played = await page.evaluate(() => window.changes.filter(p => p.source === 'play').map(p => [p.from, p.to]));
    assert.deepEqual(played, [[2024, 2024], [2025, 2025]]);
    await page.locator('[data-move="independent"]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await pressed(), ['independent']);
    assert.equal(await page.evaluate(() => window.changes.filter(p => p.source === 'movement').length), 3);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
