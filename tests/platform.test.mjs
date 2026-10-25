// Platform tests for JDP-I: the shell, its registry, and a smoke test of every module.
//   JDPI_URL=https://jdpi.pages.dev node --test tests/platform.test.mjs
// Module-specific suites live with each module (e.g. political-atlas/tests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const registry = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
const modules = registry.suites.flatMap(s => s.modules.map(m => ({ suite: s, m })));
const absolute = url => new URL(url, BASE + '/').href;
// Modules whose restyle is waiting on an external publish step; reported, not failed.
const PENDING_STYLE = new Set(['briefing', 'volatility', 'pestle', 'double-signal']);
let browser, page;

before(async () => {
  browser = await chromium.launch({ channel: 'msedge' });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});
after(async () => { await browser?.close(); });

test('registry is well formed', () => {
  const ids = registry.suites.map(s => s.id);
  assert.deepEqual(ids, ['q', 'hp', 'fe']);
  for (const s of registry.suites) {
    const mids = s.modules.map(m => m.id);
    assert.equal(new Set(mids).size, mids.length, `duplicate module id in ${s.id}`);
    for (const m of s.modules) {
      assert.ok(['live', 'in-build', 'planned'].includes(m.status), `${m.id} status`);
      if (m.status === 'live') assert.ok(m.url, `${m.id} is live but has no url`);
    }
  }
  assert.ok(registry.suites.find(s => s.id === 'hp').modules.some(m => m.id === 'retrospective'), 'Retrospective is in H&P');
});

test('every live module URL responds', async () => {
  const failures = [];
  for (const { m } of modules.filter(x => x.m.url)) {
    const urls = [m.url, ...(m.submodules || []).map(s => s.url)];
    for (const u of urls) {
      const res = await fetch(absolute(u), { redirect: 'follow' }).catch(e => ({ ok: false, status: e.message }));
      if (!res.ok) failures.push(`${m.id}: ${u} → ${res.status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('shell home lists every suite and module', async () => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.suite-card').count(), 3);
  const nav = await page.textContent('#nav');
  for (const { m } of modules) assert.ok(nav.includes(m.name), `${m.name} in sidebar`);
  assert.deepEqual(errors, []);
});

test('each suite overview renders its modules', async () => {
  for (const s of registry.suites) {
    await page.goto(`${BASE}/#/${s.id}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.mod-card').count(), s.modules.length, `${s.id} module cards`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.suite), s.id);
  }
});

test('each live module opens inside the shell workspace', async () => {
  const problems = [];
  for (const { suite, m } of modules) {
    await page.goto(`${BASE}/#/${suite.id}/${m.id}`, { waitUntil: 'domcontentloaded' });
    if (!m.url) {
      if (!(await page.locator('.placeholder').count())) problems.push(`${m.id}: no in-build placeholder`);
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

test('submodule deep links open the right page', async () => {
  const cal = modules.find(x => x.m.id === 'calendar');
  for (const sub of cal.m.submodules) {
    await page.goto(`${BASE}/#/q/calendar/${sub.id}`, { waitUntil: 'domcontentloaded' });
    const src = await page.locator('#frames iframe.active').getAttribute('src');
    assert.equal(src, sub.url);
  }
});

test('modules use the JDP-I design system', async () => {
  const report = [];
  for (const { m } of modules.filter(x => x.m.url)) {
    const html = await fetch(absolute(m.url)).then(r => r.text()).catch(() => '');
    const styled = html.includes('jdpi.pages.dev/design/jdpi.css') || html.includes('../design/jdpi.css') || html.includes('design/jdpi.css');
    if (!styled && !PENDING_STYLE.has(m.id)) report.push(`${m.id}: does not load the JDP-I stylesheet`);
    if (!styled && PENDING_STYLE.has(m.id)) console.log(`  note: ${m.id} not restyled live yet (waiting on publish)`);
  }
  assert.deepEqual(report, []);
});

test('Q pages load inside the shell without script errors', async () => {
  for (const path of ['q/calendar.html?period=contemporary', 'q/headlines.html?view=current']) {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' });
    assert.deepEqual(errors, [], `${path} script errors`);
    await p.close();
  }
});

test('shell works at phone width', async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto(`${BASE}/#/hp`, { waitUntil: 'networkidle' });
  const { scroll, width } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
  await p.click('#menu');
  assert.ok(await p.locator('#side.open').count());
  await p.close();
});
