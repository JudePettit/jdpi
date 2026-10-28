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
  assert.deepEqual(registry.suites.map(s => s.id), ['rt', 'rs', 'mm', 'ns', 'kino']);
  assert.deepEqual(registry.suites.map(s => s.name), ['Realtime Intelligence', 'Retrospective Intelligence', 'Money Management', 'Natural Science', 'Kino']);
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
  for (const id of ['osint', 'sigint', 'geoint', 'osint-training']) assert.equal(where(id), 'rt');
  assert.equal(where('econ-briefing'), 'mm');
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
    ['#/fe/double-signal', '#/mm/algo-trader'], ['#/fe/trade-desk', '#/mm/markets'], ['#/hp/battlefield-history/war-focus', '#/rs/war-focus']]) {
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

test('shell works at phone width', async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto(`${BASE}/#/rs`, { waitUntil: 'networkidle' });
  const { scroll, width } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
  await p.click('#menu');
  assert.ok(await p.locator('#side.open').count());
  await p.close();
});
