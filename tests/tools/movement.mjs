// MP-12 (Jude, 17 November 2026: "Every map slider should have 3 small buttons which say "Independent Movement" "Move
// Together" and "Single Year" when you hover over them"): one check, run by each page's own test file on that page.
//   await movementCheck(page, { url, ready, from, to, single, readout, together, one });
// url    the page's address with a period and no move= (a path from the site's root, or a full URL)
// ready  page => a promise that resolves when the page has drawn its period
// from, to   the start's and the end's input selectors (#from, #year, …)
// single     the third button's name: 'Single Year', 'Single Month' or 'Single Day'
// readout    page => the text that names what the map shows (#year-big, #date, …)
// together, one   (text, s) => true when the readout shows the period s (s.from, s.to: the stops' values), and the
//                 one time s.to; by default a period has an en dash in its text and one time has none
// short  true on a page whose data can hold too few stops for the moves below (the Realtime archive starts again each
//        January, and until its fifth month there is no room to move a pair three stops back): the moves that need
//        the room are then left out and the rest is still checked; with one stop the control shows no buttons
// It checks: the three buttons and their names (tooltip and accessible name), Independent chosen; Move Together, then
// the end handle dragged by the pointer and the start handle moved by its keys, moves both, the span kept, and the
// readout follows; Single brings the handles onto one stop and the readout shows that one time; the address carries
// move=together and move=single and a reload restores Single; the same address with no move= opens as it did at first.
import assert from 'node:assert/strict';

export async function movementCheck(page, o) {
  const base = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
  const url = /^https?:/.test(o.url) ? o.url : base + o.url;
  const together = o.together || (t => t.includes('–'));
  const one = o.one || (t => !t.includes('–'));
  const state = () => page.evaluate(([f, t]) => {
    const a = document.querySelector(f), b = document.querySelector(t);
    return { from: a.dataset.value, to: b.dataset.value, i: +a.value, j: +b.value, address: location.search + location.hash,
      pressed: [...document.querySelectorAll('.prp-period-move[aria-pressed="true"]')].map(x => x.dataset.move) };
  }, [o.from, o.to]);
  const where = s => `${s.from}–${s.to} (${s.i}, ${s.j})`;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await o.ready(page);
  const n = await page.evaluate(t => { const e = document.querySelector(t); return e ? +e.max - +e.min + 1 : 0; }, o.to);
  if (o.short && n < 2) {
    assert.equal(await page.locator('.prp-period-move:visible').count(), 0, 'one stop: the control shows no movement buttons');
    return { n };
  }
  // The three buttons, their names as tooltip and as accessible name, Independent chosen.
  const buttons = await page.locator('.prp-period-move').evaluateAll(bs => bs.map(b => [b.dataset.move, b.getAttribute('aria-label'), b.title, b.getAttribute('aria-pressed')]));
  assert.deepEqual(buttons, [['independent', 'Independent Movement', 'Independent Movement', 'true'], ['together', 'Move Together', 'Move Together', 'false'], ['single', o.single, o.single, 'false']]);
  assert.equal(await page.locator('.prp-period-moves[role="group"]').getAttribute('aria-label'), 'Movement');
  const s0 = await state();
  const room = s0.i >= 3; // the moves below take the pair three stops back
  assert.ok(s0.j - s0.i >= 1 && (room || o.short), `the address opens a period away from the first stop: ${where(s0)}`);
  assert.doesNotMatch(s0.address, /move=/);

  // Move Together: the end handle dragged two stops back by the pointer takes the start along, the span kept.
  await page.locator('[data-move="together"]').click();
  await page.waitForFunction(() => /move=together/.test(location.search + location.hash), null, { timeout: 10000 });
  assert.deepEqual((await state()).pressed, ['together']);
  let s2;
  if (room) {
  await page.locator(o.to).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000); // the page settles (a late banner or map can move the control) before the thumb is found
  const drag = await page.evaluate(t => {
    const e = document.querySelector(t), r = e.getBoundingClientRect(), th = parseFloat(getComputedStyle(e.closest('.prp-period')).getPropertyValue('--prp-period-thumb')) || 16;
    const per = (r.width - th) / Math.max(1, +e.max - +e.min);
    return { x: r.left + th / 2 + (+e.value - +e.min) * per, y: r.top + r.height / 2, per };
  }, o.to);
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  for (const k of [1, 2, 3, 4]) await page.mouse.move(drag.x - (k / 2) * drag.per, drag.y);
  await page.mouse.up();
  const s1 = await state();
  assert.equal(s1.j, s0.j - 2, `the end dragged two stops back: ${where(s0)} to ${where(s1)}`);
  assert.equal(s1.j - s1.i, s0.j - s0.i, `the span kept: ${where(s0)} to ${where(s1)}`);
  // The start handle's own keys move both too.
  await page.locator(o.from).focus();
  await page.keyboard.press('ArrowLeft');
  s2 = await state();
  assert.deepEqual([s2.i, s2.j], [s1.i - 1, s1.j - 1], `the start's key moves both: ${where(s1)} to ${where(s2)}`);
  } else {
    s2 = await state();
    assert.deepEqual([s2.i, s2.j], [s0.i, s0.j], `choosing Move Together moves nothing: ${where(s0)} to ${where(s2)}`);
  }
  await page.waitForTimeout(300);
  const t2 = await o.readout(page);
  assert.ok(together(t2, s2), `the map shows ${where(s2)}: "${t2}"`);
  assert.match(s2.address, /move=together/);

  // Single: the start on the end's stop, one time shown.
  await page.locator('[data-move="single"]').click();
  await page.waitForFunction(() => /move=single/.test(location.search + location.hash), null, { timeout: 10000 });
  const s3 = await state();
  assert.deepEqual(s3.pressed, ['single']);
  assert.equal(s3.i, s3.j, `one stop: ${where(s3)}`);
  assert.equal(s3.to, s2.to, 'the end\'s time is kept');
  assert.equal(s3.from, s3.to);
  await page.waitForTimeout(300);
  const t3 = await o.readout(page);
  assert.ok(one(t3, s3), `the map shows one time, ${s3.to}: "${t3}"`);
  // Its keys move the one time.
  await page.locator(o.to).focus();
  await page.keyboard.press('ArrowLeft');
  const s4 = await state();
  assert.deepEqual([s4.i, s4.j], [Math.max(0, s3.j - 1), Math.max(0, s3.j - 1)], `Single moves as one: ${where(s4)}`);

  // A reload keeps Single and its time.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await o.ready(page);
  const s5 = await state();
  assert.deepEqual(s5.pressed, ['single'], `reloaded at ${s5.address}`);
  assert.deepEqual([s5.from, s5.to], [s4.from, s4.to]);
  assert.ok(one(await o.readout(page), s5));

  // The same address with no move= opens exactly as it did at first, Independent chosen.
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await o.ready(page);
  const s6 = await state();
  assert.deepEqual(s6.pressed, ['independent']);
  assert.deepEqual([s6.from, s6.to, s6.i, s6.j], [s0.from, s0.to, s0.i, s0.j]);
  assert.doesNotMatch(s6.address, /move=/);
  return { s0, s2, s3, s5, n };
}
