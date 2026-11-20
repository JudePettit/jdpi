// Digital Science · Omni-Map, stage S5c of PRP-SCHOLAR-USP-DESIGN.md (4.2), in Microsoft Edge: the layers of now.
// The World Bank's indicators sit under one disclosure; one switched on by keyboard fetches its own file only; UCDP's
// events fetch the frame's year alone and the calendars' events the frame's decade alone; a fourth point layer
// switches off the oldest; the Volatility score shows the last day of its year; prp:focus with ISO3 fits the map; a
// tagged name opens VM's card (a modifier-click goes to Wikipedia as before); and the page has no sideways scroll at
// 390 and 360 pixels, in light and dark.
// npm run test:e2e -- tests/omni-now-page.test.mjs serves the site locally and sets JDPI_URL; without it these skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni-now-page.test.mjs)' };
const NOW_FILE = /\/omni\/data\/(layers\/(wb|gvi|ucdp-events|calendar)\/[^?]+|base\/(countries\.topo|small-states)\.json)/;

function watch(page) {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  page.on('request', r => { if (NOW_FILE.test(r.url())) requests.push(new URL(r.url()).pathname); });
  return { errors, requests };
}
const ready = (page, frame = null) => page.waitForFunction(f => window.omniState?.ready && (f == null || window.omniState.frame === f), frame, { timeout: 60000 });
const st = page => page.evaluate(() => window.omniState);
async function settled(page, on) {
  await page.waitForFunction(ids => { const s = window.omniState; return s?.ready && s.lv && JSON.stringify(s.lv.on) === JSON.stringify(ids) && ids.filter(id => id !== 'battles').every(id => s.lv.drawn.includes(id) || s.lv.years[id] === null); }, on, { timeout: 60000 });
  return st(page);
}
const legendOf = (s, id) => s.legend.find(l => l.layer === id)?.text || '';
const press = async (page, sel) => { await page.focus(sel); await page.keyboard.press('Space'); };

test('page: the World Bank group, UCDP\'s cells and the calendars\' events by keyboard, each fetching only its frame\'s file; a fourth point layer gives way', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=2000..2025&at=2024&show=frame&step=y&base=plain&fill=borders`, { waitUntil: 'domcontentloaded' });
  await ready(page, 2024);
  await settled(page, []);
  assert.deepEqual(requests, [], 'nothing of S5c is fetched before a layer is switched on');
  // The World Bank's indicators: one disclosure, closed, its summary reached by keyboard.
  const group = page.locator('#layers-body li[data-group="wb"] > details');
  assert.equal(await group.evaluate(d => d.open), false);
  assert.match(await page.textContent('#layers-body li[data-group="wb"] > details > summary'), /World Bank indicators, by country: \d+ layers, one fill at a time/);
  await page.focus('#layers-body li[data-group="wb"] > details > summary');
  await page.keyboard.press('Enter');
  assert.equal(await group.evaluate(d => d.open), true, 'Enter opens it');
  await press(page, '#ly-wb-ny-gdp-mktp-cd');
  let s = await settled(page, ['wb-ny-gdp-mktp-cd']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/base/countries.topo.json', '/omni/data/base/small-states.json', '/omni/data/layers/wb/NY.GDP.MKTP.CD.json']);
  assert.match(s.recipe, /&fill=wb:NY\.GDP\.MKTP\.CD(&|$)/);
  assert.match(legendOf(s, 'wb-ny-gdp-mktp-cd'), /World Bank WDI/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ly-wb-ny-gdp-mktp-cd', 'the focus stays on the switch');

  // UCDP's events: the index and 2024's file, no other year.
  requests.length = 0;
  await press(page, '#ly-ucdp-events');
  s = await settled(page, ['wb-ny-gdp-mktp-cd', 'ucdp-events']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/layers/ucdp-events/2024.json', '/omni/data/layers/ucdp-events/index.json']);
  assert.ok(s.lv.counts['ucdp-events'].drawn > 2000, 'cells drawn (and clustered)');
  const lg = legendOf(s, 'ucdp-events');
  for (const w of ['Organised violence', 'UCDP GED', 'CC BY 4.0', 'Not drawn:', 'only to the country']) assert.ok(lg.includes(w), `the legend says "${w}": ${lg.slice(0, 500)}`);
  assert.equal(await page.textContent('#ly-ucdp-events-what'), 'Holds 1989 to 2026. On: the map shows its cells of 2024.');
  // The type filter, kept in l=.
  await page.selectOption('#ly-ucdp-events-filter', '3');
  await page.waitForFunction(() => /l=ucdp-events:t=3/.test(window.omniState?.recipe || ''), null, { timeout: 30000 });

  // The calendars' events: the index and the 2020s file alone.
  requests.length = 0;
  await press(page, '#ly-calendar-events');
  s = await settled(page, ['wb-ny-gdp-mktp-cd', 'ucdp-events', 'calendar-events']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/layers/calendar/2020s.json', '/omni/data/layers/calendar/index.json']);
  assert.ok(s.lv.counts['calendar-events'].drawn > 50);
  assert.match(legendOf(s, 'calendar-events'), /VM Calendars/);
  const links = await page.$$eval('[data-list="calendar-events"] a', as => as.map(a => a.getAttribute('href')));
  assert.ok(links.some(h => /\/q\/calendar\.html\?event=2024-/.test(h)), links.slice(0, 4).join(' '));

  // The clutter rule at four point layers: battles, then elections switches off the oldest, UCDP's events.
  await press(page, '#ly-battles');
  await settled(page, ['wb-ny-gdp-mktp-cd', 'ucdp-events', 'calendar-events', 'battles']);
  await press(page, '#ly-elections');
  s = await settled(page, ['wb-ny-gdp-mktp-cd', 'calendar-events', 'battles', 'elections']);
  assert.match(s.lv.note, /switched off: the map draws at most 3 point or line layers/);
  assert.match(await page.textContent('#ly-note'), /Organised violence/);
  assert.deepEqual(errors, []);
});

test('page: the Volatility score shows the last day of its year; prp:focus with ISO3 fits the map, and reset fits it back', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=2020..2026&at=2026&show=frame&step=y&base=plain&fill=gvi`, { waitUntil: 'domcontentloaded' });
  await ready(page, 2026);
  const s = await settled(page, ['gvi']);
  assert.ok(requests.includes('/omni/data/layers/gvi/index.json') && requests.includes('/omni/data/layers/gvi/2026.json'));
  assert.ok(!requests.some(r => /\/wb\//.test(r)));
  const last = await page.evaluate(() => fetch('data/layers/gvi/index.json').then(r => r.json()).then(j => j.last));
  assert.equal(await page.getAttribute('[data-layer="gvi"] [data-day]', 'data-day'), last, 'drawn: the last day held');
  assert.match(legendOf(s, 'gvi'), /VM’s own score/);
  // prp:focus with ISO3: the map fits France, then the view's own box again.
  await page.waitForFunction(() => window.omniState?.map?.ready !== false && typeof window.omniFocus === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { countries: ['FRA'] } })));
  await page.waitForFunction(() => window.omniFocus().focused, null, { timeout: 30000 });
  const f = await page.evaluate(() => window.omniFocus());
  assert.deepEqual(f.countries, ['FRA']);
  const [w, so, e, n] = f.focused;
  assert.ok(w > -10 && e < 15 && so > 38 && n < 55, `France's main parts, not French Guiana: ${f.focused}`);
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => { const m = document.querySelector('#map'); return m && window.omniState?.map; });
  assert.ok(c !== undefined);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { reset: true } })));
  await page.waitForFunction(() => window.omniFocus().focused === null, null, { timeout: 30000 });
  assert.equal(await page.locator('button:has-text("Documentary")').count(), 0, 'no Documentary button of its own');
  assert.deepEqual(errors, []);
});

test('page: a tagged name opens VM\'s card by pointer and keyboard; a modifier-click goes to Wikipedia; no sideways scroll at 390 and 360, light and dark', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, scheme] of [[1440, 'light'], [390, 'dark'], [360, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme });
    // Wikipedia is never reached: a stub answers, so a modifier-click can be seen to go there.
    await ctx.route(/https:\/\/en\.wikipedia\.org\/.*/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
    const page = await ctx.newPage();
    const { errors } = watch(page);
    await page.goto(`${BASE}/omni/index.html#vr=1&at=1934&show=frame&step=y&base=plain&fill=borders`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1934);
    await page.evaluate(() => {
      const p = document.createElement('p'); p.id = 'card-test';
      p.innerHTML = '<a id="wl" href="https://en.wikipedia.org/wiki/Carlos_Mendieta">Carlos Mendieta</a> and <span id="sq" data-qid="Q879932">Mendieta</span>';
      document.querySelector('main, body').prepend(p);
    });
    await page.waitForSelector('#wl[data-jdpi-card="Q879932"]', { timeout: 30000 });
    await page.waitForSelector('#sq[data-jdpi-card="Q879932"]', { timeout: 30000 });
    // Pointer: the name opens the card, not Wikipedia.
    await page.click('#wl');
    await page.waitForSelector('#jdpi-card:not([hidden]) [data-offer="life"]', { timeout: 30000 });
    assert.equal(page.url().includes('wikipedia'), false);
    const card = page.locator('#jdpi-card');
    assert.equal(await card.getAttribute('role'), 'dialog');
    assert.equal(await page.textContent('#jdpi-card-t'), 'Carlos Mendieta');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'jdpi-card-t', 'the focus moves to the card');
    const offers = await page.$$eval('#jdpi-card [data-offer]', as => as.map(a => [a.dataset.offer, a.getAttribute('href')]));
    assert.deepEqual(offers.map(o => o[0]), ['life', 'entry', 'wiki']);
    assert.match(offers[0][1], /\/omni\/index\.html#vr=1&.*q=Q879932/);
    const look = await card.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; });
    assert.notEqual(look[0], look[1], `${scheme}: the card is readable`);
    const tree = await page.locator('#jdpi-card').ariaSnapshot();
    assert.match(tree, /dialog "Carlos Mendieta"/); assert.match(tree, /link "Open on the Omni-Map/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}: no sideways scroll with the card open`);
    // Escape shuts it and gives focus back to the name.
    await page.keyboard.press('Escape');
    assert.equal(await card.isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'wl');
    // Keyboard: Enter on the focused name opens the card.
    await page.keyboard.press('Enter');
    await page.waitForSelector('#jdpi-card:not([hidden]) [data-offer="entry"]', { timeout: 30000 });
    await page.click('.jdpi-card-x');
    // A data-qid name opens it too.
    await page.click('#sq');
    await page.waitForSelector('#jdpi-card:not([hidden]) [data-offer="entry"]', { timeout: 30000 });
    await page.keyboard.press('Escape');
    // A modifier-click goes to Wikipedia, as before: a new tab, no card.
    const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.click('#wl', { modifiers: ['Control'] })]);
    await tab.waitForURL(/en\.wikipedia\.org\/wiki\/Carlos_Mendieta/, { timeout: 15000 });
    await tab.close();
    assert.equal(await card.isHidden(), true, 'no card on a modifier-click');
    if (width < 768) {
      await page.evaluate(() => document.getElementById('card-test').remove());
      await page.locator('#layers-body li[data-group="wb"] > details > summary').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}: no sideways scroll with the World Bank's list open`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
