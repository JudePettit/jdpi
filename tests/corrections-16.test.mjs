// Build 16 of the ChatGPT page-review corrections (25 November 2026), fault battlefield-history-1: in the
// Retrospective Battlefield's table view the note naming the places VM cannot draw on a border ran past the bottom of
// its grid cell onto the Sources footer (live, at 1440 px, in 71 of 100 years; by 54 px in 1942). The cause was
// `.tablepanel { height: 100% }` inside a cell of fixed height, with the note below the panel. Every table view
// (section.view, which War Focus and the Kardashev Tracker share) is now a flex column, and the panel takes the room
// the note leaves (battlefield/history/styles.css).
// The unit test reads the stylesheet; the page tests run against JDPI_URL (npm run test:e2e -- tests/corrections-16.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const css = await readFile(new URL('../battlefield/history/styles.css', import.meta.url), 'utf8');
const rule = sel => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.#]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';

test('styles: the table view is a flex column and its panel shrinks to leave room for the note under it', () => {
  assert.match(rule('section.view'), /display: flex;/);
  assert.match(rule('section.view'), /flex-direction: column;/);
  const panel = rule('.tablepanel');
  assert.match(panel, /flex: 1 1 auto;/);
  assert.match(panel, /min-height: 0;/);
  assert.doesNotMatch(panel, /height: 100%/, 'a panel the full height of the cell pushes the note out of it');
  assert.match(css, /\[hidden\] \{ display: none !important; \}/, 'a hidden view stays hidden');
  assert.match(css, /\.tablepanel \{ height: auto; max-height: 75vh; \}/, 'the phone rule still caps the panel');
});

async function measure(page, path, year) {
  await page.goto(`${BASE}${path}#y=${year}&v=table`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#view-table').hidden && document.querySelectorAll('#table-rows tr').length > 0, null, { timeout: 30000 });
  return page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const view = document.querySelector('#view-table'), note = document.querySelector('#table-unplaced'), foot = document.querySelector('footer.sources');
    const panel = view.querySelector('.tablepanel');
    return { noteShown: !!note && !note.hidden, noteBottom: note ? r(note).bottom : 0, viewBottom: r(view).bottom, footTop: r(foot).top,
      panelBottom: r(panel).bottom, noteTop: note ? r(note).top : 0, panelHeight: r(panel).height, scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
  });
}

test('page: in the table view of 1942 the unplaced-places note sits above the Sources footer, inside its cell', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const y of [1942, 1940, 1953, 2011]) {
      const m = await measure(page, '/battlefield/history/', y);
      assert.ok(m.noteShown, `${y}: the note names the places that cannot be drawn`);
      assert.ok(m.noteBottom <= m.footTop, `${y}: the note's bottom (${m.noteBottom}) runs past the footer's top (${m.footTop})`);
      assert.ok(m.noteBottom <= m.viewBottom + 0.5, `${y}: the note's bottom (${m.noteBottom}) spills out of its cell (${m.viewBottom})`);
      assert.ok(m.panelBottom <= m.noteTop, `${y}: the panel (to ${m.panelBottom}) and the note (from ${m.noteTop}) overlap`);
      assert.ok(m.panelHeight > 200, `${y}: the table keeps most of the cell (${m.panelHeight} px)`);
    }
    // A year with no note: the panel fills the cell as before.
    const none = await measure(page, '/battlefield/history/', 2020);
    assert.ok(!none.noteShown, '2020 has no unplaced places');
    assert.ok(Math.abs(none.panelBottom - none.viewBottom) <= 1, `2020: the panel fills its cell (${none.panelBottom} against ${none.viewBottom})`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: on a phone the table view of 1942 keeps the note above the footer and does not scroll sideways', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const m = await measure(page, '/battlefield/history/', 1942);
    assert.ok(m.noteShown);
    assert.ok(m.noteBottom <= m.footTop, `the note's bottom (${m.noteBottom}) runs past the footer's top (${m.footTop})`);
    assert.ok(m.panelHeight <= 844 * 0.75 + 1, `the phone rule caps the panel at 75vh (${m.panelHeight} px)`);
    assert.ok(m.scrollWidth <= m.width, `the page scrolls sideways (${m.scrollWidth} > ${m.width})`);
  } finally { await browser.close(); }
});

test('page: the pages that share the stylesheet keep a table panel the height of its cell (Kardashev, War Focus)', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/kardashev/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.click('#tab-table');
    await page.waitForFunction(() => !document.querySelector('#view-table').hidden, null, { timeout: 30000 });
    const k = await page.evaluate(() => { const v = document.querySelector('#view-table'); return [v.getBoundingClientRect().bottom, v.querySelector('.tablepanel').getBoundingClientRect().bottom, v.querySelector('.tablepanel').getBoundingClientRect().height]; });
    assert.ok(Math.abs(k[0] - k[1]) <= 1 && k[2] > 200, `Kardashev: the panel fills its cell (${k.join(', ')})`);
    await page.goto(`${BASE}/battlefield/focus/`, { waitUntil: 'networkidle', timeout: 60000 });
    for (const id of ['battles', 'months']) {
      await page.click(`#tab-${id}`);
      await page.waitForFunction(v => !document.querySelector(`#view-${v}`).hidden, id, { timeout: 30000 });
      const f = await page.evaluate(v => { const s = document.querySelector(`#view-${v}`); return [s.getBoundingClientRect().bottom, s.querySelector('.tablepanel').getBoundingClientRect().bottom, s.querySelector('.tablepanel').getBoundingClientRect().height]; }, id);
      assert.ok(Math.abs(f[0] - f[1]) <= 1 && f[2] > 200, `War Focus ${id}: the panel fills its cell (${f.join(', ')})`);
    }
  } finally { await browser.close(); }
});
