// Platform tests for PRP: the shell, its registry, and a smoke test of every submodule.
//   PRP_URL=https://jdpi.pages.dev node --test tests/platform.test.mjs      (or a local server: tests/tools/serve.mjs)
// Submodule-specific suites live with each submodule (e.g. political-atlas/tests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = (process.env.PRP_URL || process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const registry = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
const modules = registry.suites.flatMap(s => s.modules.map(m => ({ suite: s, m })));
const absolute = url => new URL(url, BASE + '/').href;
let browser, page;

before(async () => {
  browser = await chromium.launch({ channel: 'msedge' });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});
after(async () => { await browser?.close(); });

test('registry is well formed', () => {
  assert.equal(registry.platform.name, 'PRP');
  assert.equal(registry.platform.company, 'JDP-Iq');
  assert.deepEqual(registry.suites.map(s => s.id), ['rt', 'rs', 'oi', 'mm', 'ns', 'ds', 'kino']);
  assert.deepEqual(registry.suites.map(s => s.name), ['Realtime Intelligence', 'Retrospective Intelligence', 'i-Spy', 'Money Management', 'Natural Science', 'Digital Science', 'Kino']);
  const ids = modules.map(x => x.m.id);
  assert.equal(new Set(ids).size, ids.length, 'submodule ids are unique across modules');
  for (const { m } of modules) {
    assert.ok(['live', 'in-build', 'planned'].includes(m.status), `${m.id} status`);
    assert.ok(registry.kinds[m.kind], `${m.id} kind`);
    if (m.status === 'live') assert.ok(m.url, `${m.id} is live but has no url`);
    assert.ok(!m.submodules, `${m.id}: a page's views belong in "views" (in-page tabs), not sidebar submodules`);
  }
  const where = id => modules.find(x => x.m.id === id).suite.id;
  assert.equal(where('atlas'), 'rt'); assert.equal(where('war-focus'), 'rs'); assert.equal(where('traders'), 'mm');
  assert.equal(where('markets'), 'mm'); assert.equal(where('tally-stick'), 'mm'); assert.equal(where('algo-trader'), 'mm');
  assert.equal(where('science-briefing'), 'ns'); assert.equal(where('progress'), 'ns');
  for (const id of ['osint', 'sigint', 'geoint', 'osint-training']) assert.equal(where(id), 'oi');
  assert.equal(where('econ-briefing'), 'mm');
  for (const id of ['digital-briefing', 'data-analytics', 'integration-hub']) assert.equal(where(id), 'ds');
  for (const cat of ['political-events', 'political-figures', 'political-parties', 'wars', 'geopolitical-events', 'great-thinkers']) assert.equal(where(`kino-${cat}`), 'kino');
  assert.equal(modules.find(x => x.m.id === 'briefing').m.name, 'Intelligence Briefing');
});

test('every live submodule URL responds', async () => {
  const failures = [];
  for (const { m } of modules.filter(x => x.m.url && x.m.status === 'live')) {
    // Private pages that open in their own tab only need to answer: locked (401/403, or 503 while sign-in isn't set
    // up yet) counts, a missing page or network error doesn't.
    const res = await fetch(absolute(m.url), { redirect: 'follow' }).catch(e => ({ ok: false, status: e.message }));
    if (!res.ok && !(m.opensInNewTab && [401, 403, 503].includes(res.status))) failures.push(`${m.id}: ${m.url} → ${res.status}`);
  }
  assert.deepEqual(failures, []);
});

test('shell home shows every module and submodule', async () => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.group').count(), registry.suites.length);
  assert.equal(await page.locator('.tile').count(), modules.length);
  const nav = await page.textContent('#nav');
  for (const { m } of modules) assert.ok(nav.includes(m.name), `${m.name} in sidebar`);
  assert.ok(!/JDP-I(?!q)|H&P|F&E/.test(await page.textContent('body')), 'no old brand names on the home page');
  assert.deepEqual(errors, []);
});

test('each module overview lists its submodules', async () => {
  for (const s of registry.suites) {
    await page.goto(`${BASE}/#/${s.id}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.list tbody tr').count(), s.modules.length, `${s.id} rows`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.suite), s.id);
  }
});

test('old addresses redirect to the new structure', async () => {
  for (const [from, to] of [['#/q/briefing', '#/rt/briefing'], ['#/hp/atlas', '#/rt/atlas'], ['#/fe/traders', '#/mm/traders'],
    ['#/fe/double-signal', '#/mm/algo-trader'], ['#/fe/trade-desk', '#/mm/markets'], ['#/rt/osint', '#/oi/osint'], ['#/rt/osint-training', '#/oi/osint-training'], ['#/hp/battlefield-history/war-focus', '#/rs/war-focus']]) {
    await page.goto(`${BASE}/${from}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(t => location.hash === t, to, { timeout: 5000 }).catch(() => {});
    assert.equal(await page.evaluate(() => location.hash), to, `${from} → ${to}`);
  }
});

test('each live submodule opens inside the shell workspace', async () => {
  const problems = [];
  for (const { suite, m } of modules.filter(x => x.m.status === 'live')) {
    await page.goto(`${BASE}/#/${suite.id}/${m.id}`, { waitUntil: 'domcontentloaded' });
    if (m.opensInNewTab) {
      // Submodules behind their own sign-in show a launch panel with a new-tab link instead of a frame.
      const href = await page.locator('#view a.prp-btn.primary[target=_blank]').getAttribute('href').catch(() => null);
      if (absolute(href || '') !== absolute(m.url)) problems.push(`${m.id}: launch link ${href}`);
      continue;
    }
    const frame = page.locator('#frames iframe.active');
    await frame.waitFor({ state: 'attached', timeout: 15000 });
    const src = await frame.getAttribute('src');
    if (absolute(src) !== absolute(m.url)) problems.push(`${m.id}: iframe src ${src}`);
    const crumbs = await page.textContent('#crumbs');
    if (!crumbs.includes(m.name)) problems.push(`${m.id}: breadcrumb "${crumbs}"`);
  }
  assert.deepEqual(problems, []);
});

test('view deep links open the right view of a page', async () => {
  const h = modules.find(x => x.m.id === 'headlines');
  for (const v of h.m.views) {
    await page.goto(`${BASE}/#/rt/headlines/${v.id}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#frames iframe.active').getAttribute('src'), v.url);
  }
});

test('deep links move their submodule\'s one frame: hash changes in place, other queries load in it', async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const WF = '#frames iframe[data-module="war-focus"]', CAL = '#frames iframe[data-module="historical-calendar"]';
    const focus = m => `#/rs/war-focus?at=${encodeURIComponent(`${BASE}/battlefield/focus/index.html#war=korean-war&m=${m}`)}`;
    const shown = (frame, want) => frame.waitForFunction(w => document.querySelector('#date')?.textContent === w, want, { timeout: 30000 });
    await p.goto(`${BASE}/${focus('1950-06')}`, { waitUntil: 'domcontentloaded' });
    const frame = await (await p.waitForSelector(WF, { timeout: 20000 })).contentFrame();
    await shown(frame, 'June 1950');
    await frame.evaluate(() => { window.prpSameDocument = true; });
    const before = await p.evaluate(() => history.length);
    // Three War Focus places, as Kino's Follow along opens them: one frame, whose view changes each time, without reloading.
    for (const [k, [m, label]] of [['1950-09', 'September 1950'], ['1952-10', 'October 1952'], ['1953-07', 'July 1953']].entries()) {
      await p.evaluate(h => { location.hash = h; }, focus(m));
      await shown(frame, label);
      assert.equal(await p.locator(WF).count(), 1, `one War Focus frame after ${m}`);
      assert.equal(await frame.evaluate(() => location.hash), `#war=korean-war&m=${m}`);
      assert.equal(await frame.evaluate(() => window.prpSameDocument), true, `${m}: a hash change in the same page, not a reload`);
      assert.equal(await p.evaluate(() => history.length), before + k + 1, 'only the shell\'s address adds to the history');
    }
    // Back follows the shell's address, and the frame follows it.
    await p.evaluate(() => history.back());
    await shown(frame, 'October 1952');
    // A plain visit shows the frame as it was left; "New tab" opens the page where it is now.
    await frame.click('#next');
    await shown(frame, 'November 1952');
    await p.click('#nav a[data-route="rs/war-focus"]');
    await p.waitForFunction(() => location.hash === '#/rs/war-focus');
    assert.equal(await p.locator(WF).count(), 1);
    assert.equal(await frame.evaluate(() => document.querySelector('#date').textContent), 'November 1952');
    await p.locator('#newtab').focus();
    // (Pages serves /battlefield/focus/index.html at its clean address, so that is where the page is now.)
    assert.equal(await p.locator('#newtab').getAttribute('href'), `${BASE}/battlefield/focus/#war=korean-war&m=1952-11`);
    // A deep link to the page's own address ("open War Focus", from another page) is a plain visit too.
    await p.evaluate(h => { location.hash = h; }, `#/rs/war-focus?at=${encodeURIComponent(`${BASE}/battlefield/focus/index.html`)}`);
    await p.waitForTimeout(1500);
    assert.equal(await frame.evaluate(() => `${window.prpSameDocument} ${document.querySelector('#date').textContent}`), 'true November 1952');
    // A different query loads the new address in the same frame; the Realtime Calendar (same page) keeps its own frame.
    const cal = m => `#/rs/historical-calendar?at=${encodeURIComponent(`${BASE}/q/calendar.html?period=history&month=${m}`)}`;
    await p.evaluate(h => { location.hash = h; }, cal('1989-11'));
    const calendar = await (await p.waitForSelector(CAL, { timeout: 20000 })).contentFrame();
    await calendar.waitForFunction(() => document.getElementById('monthpick')?.value === '1989-11', null, { timeout: 30000 });
    await p.evaluate(h => { location.hash = h; }, cal('1991-08'));
    await calendar.waitForFunction(() => document.getElementById('monthpick')?.value === '1991-08', null, { timeout: 30000 });
    assert.equal(await p.locator(CAL).count(), 1);
    await p.evaluate(() => { location.hash = '#/rt/calendar'; });
    await p.waitForSelector('#frames iframe.active[data-module="calendar"]', { timeout: 10000 });
    assert.equal(await p.locator(CAL).count(), 1);
    assert.equal(await p.locator('#frames iframe').count(), 3, 'War Focus, Historical Calendar, Realtime Calendar');
    assert.deepEqual(errors, []);
  } finally { await p.close(); }
});

test('submodules use the PRP design system', async () => {
  const report = [];
  for (const { m } of modules.filter(x => x.m.url && !x.m.opensInNewTab && x.m.status === 'live')) {
    const html = await fetch(absolute(m.url)).then(r => r.text()).catch(() => '');
    if (!/design\/(prp|jdpi)\.css/.test(html)) report.push(`${m.id}: does not load the PRP stylesheet`);
    if (/JDP-I(?!q)|>\s*Q\s*·|H&amp;P|F&amp;E/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) report.push(`${m.id}: still shows an old brand name`);
  }
  assert.deepEqual(report, []);
});

test('the shell\'s theme reaches module pages', async () => {
  await page.goto(`${BASE}/#/rt/volatility`, { waitUntil: 'domcontentloaded' });
  await page.click('[data-theme-choice=dark]');
  const frame = page.frameLocator('#frames iframe.active');
  await page.waitForTimeout(1500);
  assert.equal(await frame.locator('html').getAttribute('data-theme'), 'dark');
  await page.click('[data-theme-choice=system]');
});

test('the Documentary reader keeps its own styles beside the Kino now-playing bar', async () => {
  // The reader's music credit is .np inside .doc; the shell's bar is .kino-np, so the bar's rules must not reach it.
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}/#/rs/war-focus`, { waitUntil: 'domcontentloaded' });
  await p.locator('.doc-fab').click({ timeout: 20000 });
  await p.locator('#doc-np').waitFor({ state: 'attached', timeout: 10000 });
  const style = await p.locator('#doc-np').evaluate(el => ({ position: getComputedStyle(el).position, display: getComputedStyle(el).display }));
  await p.close();
  assert.equal(style.position, 'static');
  assert.notEqual(style.display, 'grid');
});

test('shell works at phone width', async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto(`${BASE}/#/rs`, { waitUntil: 'networkidle' });
  const { scroll, width } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
  await p.click('#menu');
  assert.ok(await p.locator('#side.open').count());
  await p.close();
});

test('"Skip to content" moves focus into the workspace and keeps the route', async () => {
  for (const [route, target] of [['#/ns/progress', 'frame'], ['#/rt', 'Realtime Intelligence'], ['#/', 'Workspace']]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    try {
      await p.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector(target === 'frame' ? '#frames iframe.active' : '#view h1');
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(() => document.activeElement.className), 'skip', `${route}: the first Tab stop`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      const now = await p.evaluate(() => ({ hash: location.hash, frame: document.activeElement === document.querySelector('#frames:not([hidden]) iframe.active'),
        heading: document.activeElement.matches('#view h1') ? document.activeElement.textContent : null }));
      assert.equal(now.hash, route, `${route}: the route is unchanged`);
      if (target === 'frame') assert.ok(now.frame, `${route}: focus is in the submodule's frame`);
      else assert.equal(now.heading, target, `${route}: focus is on the page heading`);
    } finally { await p.close(); }
  }
});

test('phone drawer: out of the tab order when closed, modal when open, closed by Escape, the scrim and its links', async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const open = () => p.evaluate(() => document.getElementById('side').classList.contains('open'));
  try {
    await p.goto(`${BASE}/#/ns/progress`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#frames iframe.active');
    await p.locator('.doc-fab').waitFor({ state: 'visible', timeout: 15000 });
    // Closed: the off-screen drawer is inert, so Tab goes from the skip link straight to ☰.
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'menu');
    assert.equal(await p.evaluate(() => document.getElementById('side').inert), true);
    // Opened from the keyboard: focus in the search box, the rest of the page inert and under the scrim (the
    // Documentary button included), and Tab stays in the drawer.
    await p.keyboard.press('Enter');
    assert.equal(await open(), true);
    assert.deepEqual(await p.evaluate(() => ({ focus: document.activeElement.id, mainInert: document.getElementById('main').inert, expanded: document.getElementById('menu').getAttribute('aria-expanded') })),
      { focus: 'find', mainInert: true, expanded: 'true' });
    const overFab = await p.evaluate(() => { const r = document.querySelector('.doc-fab').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
    assert.equal(overFab, 'scrim', 'the Documentary button is under the scrim');
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press('Tab');
      assert.ok(await p.evaluate(() => !!document.activeElement.closest('#side')), 'Tab stays in the drawer');
    }
    // Escape closes it and puts focus back on ☰.
    await p.keyboard.press('Escape');
    assert.deepEqual(await p.evaluate(() => ({ open: document.getElementById('side').classList.contains('open'), focus: document.activeElement.id, mainInert: document.getElementById('main').inert })),
      { open: false, focus: 'menu', mainInert: false });
    // A tap on the scrim closes it, and so do its close button and a link to the page already shown (no hashchange).
    await p.tap('#menu');
    await p.tap('#scrim', { position: { x: 360, y: 420 } });
    assert.equal(await open(), false, 'scrim');
    await p.tap('#menu');
    await p.tap('#side-close');
    assert.equal(await open(), false, 'close button');
    await p.tap('#menu');
    await p.tap('#nav a[data-route="ns/progress"]');
    await p.waitForFunction(() => !document.getElementById('side').classList.contains('open'), null, { timeout: 2000 });
    assert.equal(await p.evaluate(() => location.hash), '#/ns/progress');
  } finally { await p.close(); }
});

test('the sidebar can be hidden to give the page the whole width, remembered, and "/" brings it back', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/#/rt/briefing`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#nav .nav-item');
    const state = () => p.evaluate(() => ({ side: getComputedStyle(document.querySelector('#side')).display,
      main: Math.round(document.querySelector('#main').getBoundingClientRect().width), expanded: document.querySelector('#collapse').getAttribute('aria-expanded') }));
    const open = await state();
    assert.equal(open.side, 'flex');
    await p.click('#collapse');
    const shut = await state();
    assert.deepEqual([shut.side, shut.expanded], ['none', 'false']);
    assert.ok(shut.main > open.main, `the page widens: ${open.main} -> ${shut.main}`);
    assert.equal(await p.getAttribute('#collapse', 'aria-label'), 'Show navigation');
    // Remembered, and applied before first paint.
    await p.reload({ waitUntil: 'domcontentloaded' });
    assert.equal((await state()).side, 'none');
    // "/" brings the sidebar back at its search box.
    await p.keyboard.press('/');
    assert.equal((await state()).side, 'flex');
    assert.equal(await p.evaluate(() => document.activeElement?.id), 'find');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
  // On a phone the sidebar is the drawer: no switch, and ☰ still opens it.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await phone.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#menu');
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#collapse')).display), 'none');
    await p.click('#menu');
    assert.equal(await p.evaluate(() => document.querySelector('#side').classList.contains('open')), true);
  } finally { await phone.close(); }
});
