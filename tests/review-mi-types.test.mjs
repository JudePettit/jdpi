// Reviewer's test (21 November 2026, the four types job, MI-12/MI-13/MI-07): choice 7 says a click on a series opens
// its Master Index entry. In Neo Book a click in the text on a tagged series stays on the Map tab and shows the series'
// card, whose own note says "VM opens its Master Index entry". The vm:click listener (bibliotheca/neo/app.js, the
// window 'vm:click' handler) calls renderMap() a second time after useTerm has already set S.mapByClick back to false,
// and the first call, the only one that saw the click, is superseded by S.mapSeq. No book tags a series yet, so the
// test adds one tagged name to a real paragraph, written the way lib/text.js writes a term.
// Fixed the same day: S.mapByClick now holds the clicked term until a renderMap for it has decided, and the card's note
// says what holds on every page ("its Master Index entry lists them").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('Neo Book: a click in the text on a series opens its Master Index entry (choice 7)', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/bibliotheca/neo/index.html#book=the-prince&ch=3`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#c03-p03 a.term', { state: 'attached', timeout: 30000 });
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.className = 'term'; a.dataset.qid = 'Q165725'; a.dataset.jdpiEncy = 'Q165725'; a.id = 'review-series';
      a.href = '../../encyclopedia/index.html#Q165725'; a.textContent = 'Balkan Wars';
      document.getElementById('c03-p03').append(' ', a);
    });
    await page.locator('#review-series').click();
    await page.waitForFunction(() => document.querySelector('#tab-ency')?.getAttribute('aria-selected') === 'true', null, { timeout: 10000 })
      .catch(() => null);
    const state = await page.evaluate(() => ({
      tab: [...document.querySelectorAll('[role=tab][aria-selected=true]')].map(t => t.id),
      ency: document.getElementById('ency-frame').hidden ? null : document.getElementById('ency-frame').getAttribute('src'),
      card: document.getElementById('map-card').closest('[hidden]') || document.getElementById('map-card').hidden ? null : document.getElementById('map-card').innerText.slice(0, 120),
    }));
    assert.deepEqual(state.tab, ['tab-ency'], `the Master Index tab, not the Map tab with the series' card: ${JSON.stringify(state)}`);
    assert.match(state.ency || '', /encyclopedia\/(index\.html)?#Q165725/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
