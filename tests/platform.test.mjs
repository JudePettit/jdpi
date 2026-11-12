// Platform tests for Vitruvian Manager (internally PRP): the shell, its registry, and a smoke test of every submodule.
//   PRP_URL=https://jdpi.pages.dev node --test tests/platform.test.mjs      (or a local server: tests/tools/serve.mjs)
// PRP_PAGES=0 (npm run test:unit) leaves out everything but the registry check.
// Submodule-specific suites live with each submodule (e.g. political-atlas/tests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';

const BASE = (process.env.PRP_URL || process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const registry = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
const modules = registry.suites.flatMap(s => s.modules.map(m => ({ suite: s, m })));
const absolute = url => new URL(url, BASE + '/').href;
// The Home page's intro, and the first words README.md and index.html's description give VM (November 2026).
const INTRO = "Vitruvian Manager's modules allow you to learn, earn, create, and control.";
// Every module with a box on the Home page: all but Home, whose own page it is.
const boxed = registry.suites.filter(s => s.id !== 'home');
let browser, page;

before(async () => {
  if (pageTest.skip) return; // PRP_PAGES=0: only the registry check runs, with no browser
  browser = await chromium.launch({ channel: 'msedge' });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});
after(async () => { await browser?.close(); });

test('registry is well formed', () => {
  assert.deepEqual([registry.platform.name, registry.platform.fullName, registry.platform.company], ['VM', 'Vitruvian Manager', 'JDP-Iq']);
  // The intro the Home page shows (and README.md and index.html open with): no ERP framing since November 2026.
  assert.equal(registry.platform.tagline, INTRO);
  // Home (home), the Home page's and the Dashboard's module, comes first, and Highbrowse (hb), the four briefings'
  // module, after Realtime Geopolitics (both November 2026); Bibliotheca, out of Kino into a module of its own, after Kino
  // (November 2026).
  assert.deepEqual(registry.suites.map(s => s.id), ['home', 'rt', 'hb', 'rs', 'oi', 'mm', 'ns', 'ds', 'kino', 'bibliotheca']);
  // A module's name is what the sidebar shows; its title is its overview page's heading, its box's on the Home page and
  // its pages' eyebrow.
  assert.deepEqual(registry.suites.map(s => s.name), ['Home', 'Realtime Geopolitics', 'Highbrowse', 'Retrospective Geopolitics', 'Int-Myst Mngmnt', 'Money Management', 'Natural Science', 'Digital Science', 'Kino', 'Bibliotheca']);
  assert.deepEqual(registry.suites.map(s => s.title), ['Home', 'Realtime Geopolitics', 'Highbrowse', 'Retrospective Geopolitics', 'International Mystery Management', 'Money Management', 'Natural Science', 'Digital Science', 'Kino', 'Bibliotheca']);
  // Every module says what you can do with it, in a line or two, for the back of its box on the Home page.
  for (const s of registry.suites) assert.ok(typeof s.summary === 'string' && s.summary.length >= 30 && s.summary.length <= 115 && /^[A-Z].*\.$/.test(s.summary), `${s.id}: summary "${s.summary}"`);
  assert.equal(new Set(registry.suites.map(s => s.summary)).size, registry.suites.length, 'each module its own summary');
  // Home holds the Dashboard, which the shell draws itself ("shell" in place of a url), under the old Workspace's name
  // too.
  assert.deepEqual(registry.suites[0].modules.map(m => [m.id, m.name, m.status, m.shell, m.url, m.aliases]), [['dashboard', 'Dashboard', 'live', 'dashboard', undefined, ['workspace']]]);
  // A module's own figure: the small one for the sidebar ("mark") and the large one for its overview ("figure"), files here.
  for (const s of registry.suites) for (const f of [s.mark, s.figure].filter(Boolean)) assert.ok(existsSync(new URL('../' + f, import.meta.url)), `${s.id}: ${f}`);
  assert.deepEqual(registry.suites.filter(s => s.mark).map(s => [s.id, s.mark, s.figure]), [['hb', 'design/brand-hb-icon.svg', 'design/brand-hb.svg']]);
  assert.ok(!/\bPRP\b|Personal Resource Planner|Realtime Intelligence|Retrospective Intelligence|i-Spy/.test(JSON.stringify(registry)), 'no old product or module name in the registry');
  assert.ok(!/\bERP\b/.test(JSON.stringify(registry)), 'no ERP framing in the registry');
  const ids = modules.map(x => x.m.id);
  assert.equal(new Set(ids).size, ids.length, 'submodule ids are unique across modules');
  for (const { m } of modules) {
    assert.ok(['live', 'in-build', 'planned'].includes(m.status), `${m.id} status`);
    assert.ok(registry.kinds[m.kind], `${m.id} kind`);
    if (m.status === 'live') assert.ok(m.url || m.shell, `${m.id} is live but has no url`);
    assert.ok(!m.shell || (m.shell === 'dashboard' && !m.url), `${m.id}: "shell" names a page the shell draws (the Dashboard), in place of a url`);
    assert.ok(!m.submodules, `${m.id}: a page's views belong in "views" (in-page tabs), not sidebar submodules`);
  }
  const where = id => modules.find(x => x.m.id === id).suite.id;
  assert.equal(where('atlas'), 'rt'); assert.equal(where('war-focus'), 'rs'); assert.equal(where('traders'), 'mm');
  assert.equal(where('markets'), 'mm'); assert.equal(where('tally-stick'), 'mm'); assert.equal(where('algo-trader'), 'mm');
  assert.equal(where('progress'), 'ns');
  for (const id of ['osint', 'sigint', 'geoint', 'osint-training']) assert.equal(where(id), 'oi');
  for (const id of ['data-analytics', 'integration-hub', 'iot-connect']) assert.equal(where(id), 'ds');
  for (const cat of ['political-events', 'political-figures', 'political-parties', 'wars', 'geopolitical-events', 'great-thinkers']) assert.equal(where(`kino-${cat}`), 'kino');
  // Bibliotheca was Kino's submodule until November 2026; it is a module now, its reader Neo Classic its one submodule
  // (the old id its alias, so #/kino/bibliotheca still opens it), on the same page.
  const bb = registry.suites.find(s => s.id === 'bibliotheca');
  assert.equal(bb.code, 'BB');
  assert.deepEqual(bb.modules.map(m => [m.id, m.name, m.url, m.aliases, m.views]), [['neo-classic', 'Neo Classic', 'bibliotheca/neo/index.html', ['bibliotheca'], undefined]]);
  assert.ok(!registry.suites.find(s => s.id === 'kino').modules.some(m => m.id === 'bibliotheca' || m.id === 'neo-classic'), 'nothing of Bibliotheca left in Kino');
  // The four briefings moved into Highbrowse from Realtime Geopolitics, Natural Science, Money Management and Digital
  // Science (they were asserted there before); each keeps its id and its page. The Global Headline Tracker stays.
  const hb = registry.suites.find(s => s.id === 'hb');
  assert.deepEqual(hb.modules.map(m => [m.id, m.name, m.url]), [['highbrowse', 'Highbrowse', 'highbrowse/index.html'], ['briefing', 'Political Briefing', 'q/briefing.html'],
    ['science-briefing', 'Scientific Briefing', 'science/briefing/index.html'], ['econ-briefing', 'Economics Briefing', 'econ/briefing/index.html'], ['digital-briefing', 'Digital Briefing', 'digital/briefing/index.html']]);
  assert.equal(where('headlines'), 'rt');
  assert.deepEqual(modules.find(x => x.m.id === 'highbrowse').m.views.map(v => [v.id, v.url]), [['today', 'highbrowse/index.html'], ['week', 'highbrowse/index.html#tab=week'], ['search', 'highbrowse/index.html#tab=search']]);
});

test('every live submodule URL responds', pageTest, async () => {
  const failures = [];
  for (const { m } of modules.filter(x => x.m.url && x.m.status === 'live')) {
    // Private pages that open in their own tab only need to answer: locked (401/403, or 503 while sign-in isn't set
    // up yet) counts, a missing page or network error doesn't.
    const res = await fetch(absolute(m.url), { redirect: 'follow' }).catch(e => ({ ok: false, status: e.message }));
    if (!res.ok && !(m.opensInNewTab && [401, 403, 503].includes(res.status))) failures.push(`${m.id}: ${m.url} → ${res.status}`);
  }
  assert.deepEqual(failures, []);
});

// The home (#/) was the Workspace, every module and submodule under the Today panel, until November 2026. It is now the
// Home page, every module as a box that turns over to what it does, and the Workspace is the Dashboard
// (#/home/dashboard): the tests that asserted the old home now assert the Home page here and the Dashboard below.
test('the Home page shows every module as a box, in registry order, under the new intro; Home leads the sidebar', pageTest, async () => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  // Every module but Home (this page is Home's own overview), in registry order: one link to the module's overview,
  // with its full title inside the box, its code and its mark where it has one on the front, and its summary on the
  // back.
  const boxes = await page.$$eval('#view ul.mods > li.mod', lis => lis.map(li => ({ id: li.dataset.suite, href: li.querySelector('a.mod-card').getAttribute('href'),
    name: li.querySelector('.mod-front .mod-name').textContent, code: li.querySelector('.mod-front .prp-code').textContent,
    mark: li.querySelector('.mod-front img.suite-mark')?.getAttribute('src') || null, does: li.querySelector('.mod-back .mod-does').textContent })));
  assert.deepEqual(boxes, boxed.map(s => ({ id: s.id, href: `#/${s.id}`, name: s.title, code: s.code, mark: s.mark || null, does: s.summary })));
  assert.equal(await page.locator('#view .group, #view .tile, #today').count(), 0, 'the Workspace\'s catalogue and Today panel are the Dashboard\'s now');
  // The intro: the new sentence, with no ERP framing, here and in index.html's description.
  assert.equal(await page.textContent('#view h1'), 'Home');
  assert.equal(await page.textContent('#view .prp-dek'), INTRO);
  assert.equal(await page.getAttribute('meta[name="description"]', 'content'), INTRO);
  assert.ok(!/JDP-I(?!q)|H&P|F&E|Personal Resource Planner|Realtime Intelligence|Retrospective Intelligence|i-Spy|\bERP\b/.test(await page.textContent('body')), 'no old brand names, and no ERP framing, on the Home page');
  // The brand: the Vitruvian Manager mark and name in the sidebar, its favicon, and the tab title (as index.html's <title>).
  assert.equal(await page.getAttribute('.brand img', 'src'), 'design/brand-vm.svg');
  assert.equal(await page.getAttribute('link[rel="icon"]', 'href'), 'design/brand-vm-icon.svg');
  assert.deepEqual([await page.textContent('.brand b'), await page.textContent('.brand small')], ['VM', 'Vitruvian Manager']);
  assert.equal(await page.title(), 'Vitruvian Manager');
  assert.equal((await page.textContent('#view .prp-eyebrow')).replace(/\s+/g, ' ').trim(), 'Vitruvian Manager · by JDP-Iq');
  // The sidebar: every module in registry order, Home first, with its Home page (current here, where the ⌂ Home item
  // was) and its Dashboard; every submodule's name.
  assert.deepEqual(await page.$$eval('#nav > details.suite', d => d.map(x => x.dataset.suite)), registry.suites.map(s => s.id));
  assert.deepEqual(await page.$$eval('#nav details[data-suite="home"] a', a => a.map(x => [x.getAttribute('href'), x.textContent.trim(), x.getAttribute('aria-current')])),
    [['#/', '⌂Home page', 'page'], ['#/home/dashboard', '⊞Dashboard', null]]);
  const nav = await page.textContent('#nav');
  for (const { m } of modules) assert.ok(nav.includes(m.name), `${m.name} in sidebar`);
  // International Mystery Management: its short name in the sidebar (the full title on hover), the full title in its
  // box.
  const oi = page.locator('#nav details[data-suite="oi"] > summary');
  assert.match(await oi.textContent(), /^OIInt-Myst Mngmnt/);
  assert.equal(await oi.getAttribute('title'), 'International Mystery Management');
  assert.equal(await page.textContent('.mod[data-suite="oi"] .mod-name'), 'International Mystery Management');
  // A screen reader gets each box as a link named by the module's title and described by its summary, whichever face is
  // up, in a list named Modules (the accessibility tree as the browser computes it).
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  const links = nodes.filter(n => n.role?.value === 'link' && !n.ignored).map(n => [n.name?.value, n.description?.value]);
  for (const s of boxed) assert.ok(links.some(([name, description]) => name === s.title && description === s.summary), `${s.id}: a link named "${s.title}" and described by its summary`);
  assert.ok(nodes.some(n => n.role?.value === 'list' && n.name?.value === 'Modules' && !n.ignored), 'the boxes are a list named Modules');
  assert.deepEqual(errors, []);
});

test('a box turns over on hover and on keyboard focus, on a first tap on a touch screen (the second opens it), and with reduced motion its back shows without the turn', pageTest, async () => {
  // How far a box's turntable has turned (the m11 of its transform: 1 is the front, −1 turned over) and its back's
  // opacity.
  const look = (p, id) => p.$eval(`.mod[data-suite="${id}"]`, li => {
    const t = getComputedStyle(li.querySelector('.mod-turn')).transform;
    return { m11: Math.round((t === 'none' ? 1 : new DOMMatrix(t).m11) * 100) / 100, back: +getComputedStyle(li.querySelector('.mod-back')).opacity };
  });
  const turned = (p, id, m11) => p.waitForFunction(([id, m11]) => {
    const t = getComputedStyle(document.querySelector(`.mod[data-suite="${id}"] .mod-turn`)).transform;
    return Math.abs((t === 'none' ? 1 : new DOMMatrix(t).m11) - m11) < 0.01;
  }, [id, m11], { timeout: 5000 });
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  try {
    const p = await desk.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    for (const s of boxed) assert.deepEqual(await look(p, s.id), { m11: 1, back: 1 }, `${s.id}: front up`);
    // A mouse over a box turns it over, and only it; moving away turns it back. A click opens the module's overview.
    await p.hover('.mod[data-suite="rt"] .mod-card');
    await turned(p, 'rt', -1);
    assert.equal((await look(p, 'hb')).m11, 1, 'its neighbour stays');
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.mod[data-suite="rt"] .mod-turn')).transitionDuration), '0.55s', 'a turn, not a jump');
    await p.mouse.move(2, 850);
    await turned(p, 'rt', 1);
    // The keyboard: Tab from the Dashboard button to the first box turns it over, Tab on turns the next and the first
    // back, and Enter opens the module's overview.
    await p.focus('#view .home-dash');
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(() => document.activeElement.closest('.mod')?.dataset.suite), 'rt');
    await turned(p, 'rt', -1);
    await p.keyboard.press('Tab');
    await turned(p, 'hb', -1);
    await turned(p, 'rt', 1);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => location.hash === '#/hb', null, { timeout: 5000 });
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    await p.click('.mod[data-suite="ds"] .mod-card');
    await p.waitForFunction(() => location.hash === '#/ds', null, { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally { await desk.close(); }
  // A touch screen: the first tap turns a box over and stays on the Home page, a tap on another turns that one and the
  // first back, and a second tap on a turned box opens its module.
  const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  try {
    const p = await phone.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    await p.tap('.mod[data-suite="mm"] .mod-card');
    await turned(p, 'mm', -1);
    assert.equal(await p.evaluate(() => location.hash), '#/', 'the first tap only turns it');
    await p.tap('.mod[data-suite="ns"] .mod-card');
    await turned(p, 'ns', -1);
    await turned(p, 'mm', 1);
    assert.equal(await p.evaluate(() => location.hash), '#/');
    await p.tap('.mod[data-suite="ns"] .mod-card');
    await p.waitForFunction(() => location.hash === '#/ns', null, { timeout: 5000 });
  } finally { await phone.close(); }
  // Reduced motion: nothing turns. The back shows in place of the front at once, on hover and on keyboard focus.
  const still = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  try {
    const p = await still.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    assert.deepEqual(await look(p, 'kino'), { m11: 1, back: 0 });
    await p.hover('.mod[data-suite="kino"] .mod-card');
    assert.deepEqual(await look(p, 'kino'), { m11: 1, back: 1 }, 'hovered: the back, unturned');
    assert.equal(await p.$eval('.mod[data-suite="kino"] .mod-turn', el => getComputedStyle(el).transitionDuration), '0s');
    await p.mouse.move(2, 850);
    assert.deepEqual(await look(p, 'kino'), { m11: 1, back: 0 });
    await p.focus('#view .home-dash');
    await p.keyboard.press('Tab');
    assert.deepEqual(await look(p, 'rt'), { m11: 1, back: 1 }, 'focused: the back, unturned');
  } finally { await still.close(); }
});

test('the Home page works in light and dark, and at 360 px wide', pageTest, async () => {
  for (const [width, height, phone] of [[1280, 860, false], [360, 740, true]]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: theme });
    try {
      const p = await ctx.newPage();
      await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
      const seen = await p.evaluate(() => {
        // Contrast as WCAG works it out, between two computed colours.
        const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => +v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        const css = (el, k) => getComputedStyle(el)[k];
        const token = (el, v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; el.append(s); const c = css(s, 'color'); s.remove(); return c; };
        const view = document.getElementById('view');
        return {
          overflow: Math.max(document.documentElement.scrollWidth - innerWidth, view.scrollWidth - view.clientWidth),
          lefts: new Set([...document.querySelectorAll('.mod')].map(li => Math.round(li.getBoundingClientRect().left))).size,
          inside: [...document.querySelectorAll('.mod, .home-dash')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
          boxes: [...document.querySelectorAll('.mod')].map(li => {
            const front = li.querySelector('.mod-front'), back = li.querySelector('.mod-back');
            return { id: li.dataset.suite, front: css(front, 'backgroundColor') === token(li, '--prp-surface'), back: css(back, 'backgroundColor') === token(li, '--prp-accent-soft'),
              name: ratio(css(li.querySelector('.mod-name'), 'color'), css(front, 'backgroundColor')), icons: ratio(css(li.querySelector('.mod-subs'), 'color'), css(front, 'backgroundColor')),
              does: ratio(css(li.querySelector('.mod-does'), 'color'), css(back, 'backgroundColor')), go: ratio(css(li.querySelector('.mod-go'), 'color'), css(back, 'backgroundColor')) };
          }),
          dark: css(document.querySelector('.mod-front'), 'backgroundColor') === 'rgb(22, 27, 34)',
        };
      });
      const at = `${width} px, ${theme}`;
      assert.equal(seen.dark, theme === 'dark', `${at}: the faces follow the theme`);
      assert.ok(seen.overflow <= 0, `${at}: no sideways scroll (${seen.overflow} px)`);
      assert.ok(seen.inside, `${at}: every box and the Dashboard button within the screen`);
      if (width === 360) assert.equal(seen.lefts, 1, `${at}: one column`);
      for (const b of seen.boxes) {
        assert.ok(b.front && b.back, `${at}, ${b.id}: the front on the surface, the back on its module's soft tint`);
        for (const k of ['name', 'icons', 'does', 'go']) assert.ok(b[k] >= 4.5, `${at}, ${b.id}: ${k} contrast ${b[k].toFixed(2)}`);
      }
    } finally { await ctx.close(); }
  }
});

test('the Dashboard: the old Workspace at #/home/dashboard (VM / Home / Dashboard), with its Today panel, every module and submodule, and the Home page\'s button to it', pageTest, async () => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    // The small button on the Home page opens it.
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    const button = p.locator('#view .home-head a.home-dash');
    assert.deepEqual(await button.evaluate(b => [b.getAttribute('href'), b.textContent.trim(), b.matches('.prp-btn.sm')]), ['#/home/dashboard', '⊞Dashboard', true]);
    await button.click();
    await p.waitForFunction(() => location.hash === '#/home/dashboard', null, { timeout: 5000 });
    // Its route, tab title and breadcrumb; drawn by the shell in its view, with no frame; current in the sidebar.
    await p.waitForSelector('#view #today');
    assert.equal(await p.title(), 'Dashboard · VM');
    assert.equal((await p.textContent('#crumbs')).replace(/\s+/g, ''), 'VM/Home/Dashboard');
    assert.deepEqual(await p.$$eval('#crumbs a', a => a.map(x => [x.textContent, x.getAttribute('href')])), [['VM', '#/'], ['Home', '#/']]);
    assert.equal(await p.textContent('#view h1'), 'Dashboard');
    assert.equal((await p.textContent('#view .prp-eyebrow')).replace(/\s+/g, ' ').trim(), 'Home · Dashboard');
    assert.ok(!/\bERP\b|Workspace/.test(await p.textContent('#view .head')), 'no ERP framing, and no Workspace');
    assert.deepEqual(await p.evaluate(() => [document.getElementById('view').hidden, document.getElementById('frames').hidden, document.documentElement.dataset.suite]), [false, true, 'home']);
    assert.equal(await p.locator('#frames iframe').count(), 0);
    assert.equal(await p.getAttribute('#nav a[data-route="home/dashboard"]', 'aria-current'), 'page');
    // The Today panel at its head (its four slots, filled or not: tests/highlights.test.mjs serves their data), then
    // the Workspace's counts and catalogue: every module and submodule, Home's included.
    assert.deepEqual(await p.$$eval('#today .today-card', c => c.map(x => x.dataset.group)), ['volatility', 'briefings', 'calendar', 'markets']);
    assert.equal(await p.getAttribute('#today', 'aria-label'), 'Today on your Dashboard');
    assert.equal(await p.locator('#view .prp-kpis.today-kpis .prp-kpi').count(), 4);
    assert.equal(await p.locator('#view .group').count(), registry.suites.length);
    assert.equal(await p.locator('#view .tile').count(), modules.length);
    assert.equal(await p.getAttribute('.group[data-suite="home"] .group-head a.more', 'href'), '#/', 'Home\'s overview is the Home page');
    assert.match(await p.textContent('.group[data-suite="oi"] h2'), /International Mystery Management$/);
    assert.deepEqual(errors, []);
  } finally { await p.close(); }
});

test('the Dashboard\'s health mark: quiet while the daily data check passes, naming what failed and when once it fails (status/health.json)', pageTest, async () => {
  // status/health.json as .github/scripts/freshness.mjs writes it, served in place of the real one.
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString();
  const short = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const RUN = 'https://github.com/JudePettit/jdpi/actions/runs/123';
  const failing = { generated: at(2), ok: false, problems: 3, run: RUN, failing: [
    { name: 'Scientific Briefing', what: 'science/briefing/data/stories.json', detail: '20 h old' },
    { name: 'Integration Hub catalogue', what: 'integration/catalog.json', detail: '3 days old' },
    { name: 'Scientific Briefing', what: 'live science/briefing/data/stories.json', detail: 'HTTP 500' }] };
  const open = async body => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    let asked = 0;
    await p.route('**/status/health.json', r => { asked++; return body === 404 ? r.fulfill({ status: 404, body: 'not found' }) : r.fulfill({ json: body }); });
    await p.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'networkidle' });
    await p.waitForSelector('#view #today');
    await p.waitForFunction(() => document.readyState === 'complete');
    await p.waitForTimeout(400); // the mark fills at idle time, like the Today panel
    const mark = await p.$eval('#view .head #health', el => ({ hidden: el.hidden, shown: !!el.offsetParent, cls: el.className, text: el.textContent.trim(), links: [...el.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.target]) }));
    return { p, errors, asked, mark };
  };
  // Failed: a visible mark in the header, in the "bad" status colour with words, naming each failing store once and the
  // check's date, with a link to the run.
  {
    const { p, errors, asked, mark } = await open(failing);
    try {
      assert.equal(asked, 1, 'read once');
      assert.deepEqual([mark.hidden, mark.shown, mark.cls], [false, true, 'prp-status bad dash-health']);
      assert.equal(mark.text, `Data check failed on ${short(failing.generated)}: Scientific Briefing, Integration Hub catalogue. Details`);
      assert.deepEqual(mark.links, [['Details', RUN, '_blank']]);
      // The mark sits under the intro, and the rest of the Dashboard is as before.
      assert.equal(await p.$eval('#view .head', h => h.lastElementChild.id), 'health');
      assert.equal(await p.textContent('#view h1'), 'Dashboard');
      assert.deepEqual(errors, []);
    } finally { await p.close(); }
  }
  // Passed (and recently): nothing to see. Nor when the file is missing or not yet written.
  for (const body of [{ generated: at(2), ok: true, problems: 0, failing: [], run: RUN }, 404, { nonsense: true }]) {
    const { p, errors, mark } = await open(body);
    try {
      assert.deepEqual([mark.hidden, mark.shown, mark.text], [true, false, ''], JSON.stringify(body));
      assert.deepEqual(errors, []);
    } finally { await p.close(); }
  }
  // The check has not run for more than three days: a warning that says since when, pass or fail.
  {
    const old = at(4 * 24);
    const { p, mark } = await open({ generated: old, ok: true, problems: 0, failing: [], run: RUN });
    try {
      assert.deepEqual([mark.hidden, mark.cls, mark.text], [false, 'prp-status warn dash-health', `The data check has not run since ${short(old)}. Details`]);
    } finally { await p.close(); }
  }
  // A run address that is not a GitHub Actions run is not linked.
  {
    const { p, mark } = await open({ ...failing, run: 'javascript:alert(1)' });
    try { assert.deepEqual([mark.hidden, mark.links], [false, []]); } finally { await p.close(); }
  }
});

test('each module overview lists its submodules', pageTest, async () => {
  // (Home's overview is the Home page, with its own tests above; #/home lands there.)
  for (const s of boxed) {
    await page.goto(`${BASE}/#/${s.id}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.list tbody tr').count(), s.modules.length, `${s.id} rows`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.suite), s.id);
    // The overview is the module's landing page: its full title as the heading and in the tab, the short name in the breadcrumb.
    assert.equal(await page.textContent('#view h1'), s.title, `${s.id} heading`);
    assert.equal(await page.title(), `${s.title} · VM`);
    assert.equal(await page.textContent('#crumbs b'), s.name);
  }
});

test('old addresses redirect to the new structure', pageTest, async () => {
  // The four briefings' old addresses (and the oldest, #/q/briefing, which went to #/rt/briefing before) now land in
  // Highbrowse, where the briefings moved in November 2026.
  for (const [from, to] of [['#/q/briefing', '#/hb/briefing'], ['#/rt/briefing', '#/hb/briefing'], ['#/ns/science-briefing', '#/hb/science-briefing'],
    ['#/mm/econ-briefing', '#/hb/econ-briefing'], ['#/fe/econ-briefing', '#/hb/econ-briefing'], ['#/ds/digital-briefing', '#/hb/digital-briefing'],
    ['#/hp/atlas', '#/rt/atlas'], ['#/fe/traders', '#/mm/traders'],
    ['#/fe/double-signal', '#/mm/algo-trader'], ['#/fe/trade-desk', '#/mm/markets'], ['#/rt/osint', '#/oi/osint'], ['#/rt/osint-training', '#/oi/osint-training'], ['#/hp/battlefield-history/war-focus', '#/rs/war-focus'],
    // The Workspace became the Dashboard (November 2026): its old name lands there; Home's overview is the Home page.
    ['#/workspace', '#/home/dashboard'], ['#/home/workspace', '#/home/dashboard'], ['#/home', '#/'],
    // Bibliotheca left Kino for a module of its own (November 2026): its old submodule and view land on Neo Classic.
    ['#/kino/bibliotheca', '#/bibliotheca/neo-classic'], ['#/kino/bibliotheca/neo-classic', '#/bibliotheca/neo-classic'], ['#/bibliotheca/bibliotheca', '#/bibliotheca/neo-classic']]) {
    await page.goto(`${BASE}/${from}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(t => location.hash === t, to, { timeout: 5000 }).catch(() => {});
    assert.equal(await page.evaluate(() => location.hash), to, `${from} → ${to}`);
  }
  // A bookmarked deep link keeps its place: the old address with ?at= lands in Highbrowse with it, and the briefing's
  // frame opens there.
  const at = encodeURIComponent(`${BASE}/science/briefing/index.html#d=physics&w=7d`);
  await page.goto(`${BASE}/#/ns/science-briefing?at=${at}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(t => location.hash === t, `#/hb/science-briefing?at=${at}`, { timeout: 5000 }).catch(() => {});
  assert.equal(await page.evaluate(() => location.hash), `#/hb/science-briefing?at=${at}`);
  const sci = await (await page.waitForSelector('#frames iframe.active[data-module="science-briefing"]', { timeout: 15000 })).contentFrame();
  await sci.waitForFunction(() => document.querySelector('#chips [data-v="physics"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 30000 });
  assert.match(await page.textContent('#crumbs'), /Highbrowse.*Scientific Briefing/);
});

test('a module with its own figure shows it in the sidebar, on the Home page, on the Dashboard and on its overview', pageTest, async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    // Highbrowse's mark beside its code (decorative: the name is beside it), and no other module's.
    assert.deepEqual(await p.$$eval('#nav details > summary img.suite-mark', imgs => imgs.map(i => [i.closest('details').dataset.suite, i.getAttribute('src'), i.alt, i.naturalWidth > 0])),
      [['hb', 'design/brand-hb-icon.svg', '', true]]);
    assert.match(await p.textContent('#nav details[data-suite="hb"] > summary'), /^HBHighbrowse/);
    // In its box on the Home page, and no other box has one; and beside its heading on the Dashboard.
    assert.deepEqual(await p.$$eval('#view .mod img.suite-mark', imgs => imgs.map(i => [i.closest('.mod').dataset.suite, i.getAttribute('src'), i.alt, i.naturalWidth > 0])),
      [['hb', 'design/brand-hb-icon.svg', '', true]]);
    await p.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'networkidle' });
    assert.equal(await p.getAttribute('.group[data-suite="hb"] .group-head img.suite-mark', 'src'), 'design/brand-hb-icon.svg');
    await p.goto(`${BASE}/#/hb`, { waitUntil: 'networkidle' });
    assert.deepEqual(await p.$eval('#view .head img.suite-figure', i => [i.getAttribute('src'), i.naturalWidth > 0]), ['design/brand-hb.svg', true]);
    assert.equal(await p.textContent('#view h1'), 'Highbrowse');
    await p.goto(`${BASE}/#/rs`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('#view .head img').count(), 0, 'a module without one shows none');
    assert.deepEqual(errors, []);
  } finally { await p.close(); }
});

test('each live submodule opens inside the shell workspace', pageTest, async () => {
  const problems = [];
  // (The Dashboard is drawn by the shell itself, with no frame: its own test is above.)
  for (const { suite, m } of modules.filter(x => x.m.status === 'live' && !x.m.shell)) {
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

test('view deep links open the right view of a page', pageTest, async () => {
  const h = modules.find(x => x.m.id === 'headlines');
  for (const v of h.m.views) {
    await page.goto(`${BASE}/#/rt/headlines/${v.id}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#frames iframe.active').getAttribute('src'), v.url);
  }
});

test('deep links move their submodule\'s one frame: hash changes in place, other queries load in it', pageTest, async () => {
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

test('the Vitruvian Manager figure plays while a submodule loads, goes with the load, and never for a hash-only move', pageTest, async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#nav .nav-item');
    // A log, kept by the page itself, of each new frame (when its load starts) and its load event, and of the figure
    // going up and down.
    await p.evaluate(() => {
      window.loaderLog = [];
      const log = what => loaderLog.push([what, performance.now()]);
      new MutationObserver(ms => { for (const m of ms) {
        for (const n of m.addedNodes) { if (n.classList?.contains('vm-loader')) log('shown'); if (n.tagName === 'IFRAME') { log('frame'); n.addEventListener('load', () => log('load')); } }
        for (const n of m.removedNodes) if (n.classList?.contains('vm-loader')) log('removed');
      } }).observe(document.getElementById('frames'), { childList: true });
    });
    // War Focus is held back 1.2 s so its load is slow for certain: the figure goes up 300 ms in and comes down with the load.
    await p.route(u => u.pathname.endsWith('/battlefield/focus/index.html'), async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
    await p.evaluate(() => { location.hash = '#/rs/war-focus'; });
    const figure = p.locator('#frames .vm-loader');
    await figure.waitFor({ state: 'attached', timeout: 5000 });
    // design/vm-loading.svg inlined, centred in the workspace over the loading frame, playing, hidden from screen readers
    // (the loading bar is the progress bar) and letting every click through.
    const look = await figure.evaluate(el => {
      const w = document.getElementById('frames').getBoundingClientRect(), r = el.getBoundingClientRect();
      return { dx: Math.round(r.left + r.width / 2 - (w.left + w.width / 2)), dy: Math.round(r.top + r.height / 2 - (w.top + w.height / 2)), size: Math.round(r.width),
        art: el.querySelector(':scope > svg > title')?.textContent, hidden: el.getAttribute('aria-hidden'), events: getComputedStyle(el).pointerEvents,
        playing: el.getAnimations({ subtree: true }).length };
    });
    assert.ok(Math.abs(look.dx) <= 1 && Math.abs(look.dy) <= 1, `centred (${look.dx}, ${look.dy})`);
    assert.ok(look.size >= 112 && look.size <= 160, `size ${look.size}`);
    assert.deepEqual([look.art, look.hidden, look.events], ['Loading', 'true', 'none']);
    assert.ok(look.playing > 5, `the figure is animated (${look.playing} animations)`);
    await figure.waitFor({ state: 'detached', timeout: 30000 });
    const log = await p.evaluate(() => loaderLog);
    const at = what => log.find(e => e[0] === what)?.[1];
    assert.deepEqual(log.map(e => e[0]).filter(w => w === 'shown' || w === 'removed'), ['shown', 'removed'], JSON.stringify(log));
    // Up no sooner than 300 ms into the load (timers run late on a busy machine, so no upper bound short of the load
    // itself), and down with the load event, never held past it.
    const shownAfter = at('shown') - at('frame'), after = at('removed') - at('load');
    assert.ok(shownAfter >= 280, `shown ${Math.round(shownAfter)} ms into the load (expected 300 or later)`);
    assert.ok(after >= -5 && after <= 300, `removed ${Math.round(after)} ms after the load event (expected with it)`);
    // A hash-only move (a deep link into the same page), and a plain visit to a frame that has loaded: no figure.
    await p.evaluate(() => { loaderLog.length = 0; });
    await p.evaluate(h => { location.hash = h; }, `#/rs/war-focus?at=${encodeURIComponent(`${BASE}/battlefield/focus/index.html#war=korean-war&m=1950-06`)}`);
    await p.waitForTimeout(1200);
    await p.evaluate(() => { location.hash = '#/rs'; });
    await p.waitForSelector('#view h1');
    await p.evaluate(() => { location.hash = '#/rs/war-focus'; });
    await p.waitForTimeout(800);
    assert.deepEqual(await p.evaluate(() => loaderLog), [], 'no figure without a new page to load');
    assert.equal(await p.locator('#frames iframe[data-module="war-focus"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await p.close(); }
  // With reduced motion nothing moves: no fade, and the SVG's own rule stops every animation in it (one still frame,
  // the figure standing in his wheel). The page is held back a moment so the figure can be looked at.
  const still = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  try {
    const p = await still.newPage();
    await p.route(u => u.pathname.endsWith('/science/progress/index.html'), async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
    await p.goto(`${BASE}/#/ns/progress`, { waitUntil: 'domcontentloaded' });
    const figure = p.locator('#frames .vm-loader');
    await figure.waitFor({ state: 'attached', timeout: 10000 });
    assert.deepEqual(await figure.evaluate(el => [el.querySelector(':scope > svg > title')?.textContent, el.getAnimations({ subtree: true }).length]), ['Loading', 0]);
  } finally { await still.close(); }
});

test('submodules use the PRP design system', pageTest, async () => {
  const report = [];
  for (const { m } of modules.filter(x => x.m.url && !x.m.opensInNewTab && x.m.status === 'live')) {
    const html = await fetch(absolute(m.url)).then(r => r.text()).catch(() => '');
    if (!/design\/(prp|jdpi)\.css/.test(html)) report.push(`${m.id}: does not load the PRP stylesheet`);
    if (/JDP-I(?!q)|>\s*Q\s*·|H&amp;P|F&amp;E/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) report.push(`${m.id}: still shows an old brand name`);
  }
  assert.deepEqual(report, []);
});

test('the shell\'s theme reaches module pages', pageTest, async () => {
  await page.goto(`${BASE}/#/rt/volatility`, { waitUntil: 'domcontentloaded' });
  await page.click('[data-theme-choice=dark]');
  const frame = page.frameLocator('#frames iframe.active');
  await page.waitForTimeout(1500);
  assert.equal(await frame.locator('html').getAttribute('data-theme'), 'dark');
  await page.click('[data-theme-choice=system]');
});

test('the Documentary reader keeps its own styles beside the Kino now-playing bar', pageTest, async () => {
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

test('shell works at phone width', pageTest, async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto(`${BASE}/#/rs`, { waitUntil: 'networkidle' });
  const { scroll, width } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(scroll <= width + 1, `page is ${scroll}px wide on ${width}px`);
  await p.click('#menu');
  assert.ok(await p.locator('#side.open').count());
  await p.close();
});

test('"Skip to content" moves focus into the workspace and keeps the route', pageTest, async () => {
  // The home's heading was Workspace until November 2026: the Home page's is Home, and the Workspace is the Dashboard.
  for (const [route, target] of [['#/ns/progress', 'frame'], ['#/rt', 'Realtime Geopolitics'], ['#/', 'Home'], ['#/home/dashboard', 'Dashboard']]) {
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

test('phone drawer: out of the tab order when closed, modal when open, closed by Escape, the scrim and its links', pageTest, async () => {
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

test('the sidebar can be hidden to give the page the whole width, remembered, and "/" brings it back', pageTest, async () => {
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

/* ---- The installable app (November 2026): manifest.json, its icons, and the offline worker sw.js ------------------- */
const fileOf = p => new URL('../' + p, import.meta.url);
/** A PNG's width and height, from its IHDR chunk. */
const pngSize = p => { const b = readFileSync(fileOf(p)); assert.equal(b.toString('latin1', 1, 4), 'PNG', `${p} is a PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('the app: the manifest meets Chrome’s install criteria, its icons are the sizes it says, and iOS has its icon', () => {
  const m = JSON.parse(readFileSync(fileOf('manifest.json'), 'utf8'));
  assert.deepEqual([m.name, m.short_name, m.start_url, m.scope, m.display, m.id], ['Vitruvian Manager', 'VM', '/', '/', 'standalone', '/']);
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/); assert.match(m.background_color, /^#[0-9a-f]{6}$/);
  for (const i of m.icons) { const [w, h] = pngSize(i.src); assert.equal(`${w}x${h}`, i.sizes, i.src); assert.equal(i.type, 'image/png'); }
  const has = (size, purpose) => m.icons.some(i => i.sizes === size && (i.purpose || 'any').split(' ').includes(purpose));
  assert.ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'), 'icons of 192 and 512 px, and a maskable 512');
  // The one shortcut only opens IoT Connect's Remote tab: an address, never an action.
  assert.deepEqual(m.shortcuts.map(s => [s.name, s.url]), [['Remote', '/#/ds/iot-connect/remote']]);
  assert.ok(registry.suites.find(s => s.id === 'ds').modules.find(x => x.id === 'iot-connect').views.some(v => v.id === 'remote'));
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180]);
  const html = readFileSync(fileOf('index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest.json">/); assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon.png">/);
  assert.match(readFileSync(fileOf('shell.js'), 'utf8'), /navigator\.serviceWorker\.register\('sw\.js'\)/, 'the shell registers the worker');
  const headers = readFileSync(fileOf('_headers'), 'utf8');
  for (const p of ['/manifest.json', '/sw.js']) assert.match(headers, new RegExp(`\\n${p.replace('.', '\\.')}\\r?\\n  Cache-Control: no-cache`), `${p} is always revalidated`);
  assert.ok(existsSync(fileOf('design/scripts/render-icons.mjs')), 'the icons’ script');
});

test('the app: the offline worker keeps the shell and IoT Connect’s own files, and leaves every other request alone', async () => {
  const handlers = {}, cached = new Map(), fetched = [];
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, registration: { scope: 'https://jdpi.pages.dev/' }, skipWaiting: async () => {} };
  const sandbox = {
    self, URL, Promise, console,
    fetch: async url => { fetched.push(String(url.url || url)); return { ok: true, type: 'basic', redirected: false, clone() { return this; } }; },
    caches: { open: async () => ({ put: async (k, v) => { cached.set(k, v); } }), match: async k => cached.get(k), keys: async () => ['vm-shell-0', 'vm-shell-1', 'other'], delete: async () => true },
    Response: { error: () => 'error' },
  };
  vm.runInNewContext(readFileSync(fileOf('sw.js'), 'utf8'), sandbox);
  const keyOf = (url, method = 'GET') => self.vmKeyOf({ url, method }, self.registration.scope);
  // Every file it keeps exists (the site root and IoT Connect's folder are their index.html).
  let waits = [];
  handlers.install({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  assert.ok(fetched.length >= 25, `${fetched.length} files fetched at install`);
  for (const u of fetched) {
    const p = new URL(u).pathname.slice(1);
    assert.ok(existsSync(fileOf(p === '' || p.endsWith('/') ? p + 'index.html' : p)), `${p} exists`);
  }
  for (const u of ['https://jdpi.pages.dev/', 'https://jdpi.pages.dev/index.html', 'https://jdpi.pages.dev/?x=1', 'https://jdpi.pages.dev/shell.js', 'https://jdpi.pages.dev/registry.json',
    'https://jdpi.pages.dev/digital/iot-connect/', 'https://jdpi.pages.dev/digital/iot-connect/index.html', 'https://jdpi.pages.dev/digital/iot-connect/lib/qr.js', 'https://jdpi.pages.dev/manifest.json']) assert.ok(keyOf(u), `keeps ${u}`);
  for (const u of ['https://jdpi.pages.dev/api/v1/catalog', 'https://jdpi.pages.dev/mcp', 'https://jdpi.pages.dev/lake/data/manifest.json', 'https://jdpi.pages.dev/integration/catalog.json',
    'https://jdpi.pages.dev/digital/briefing/data/stories.json', 'https://jdpi.pages.dev/status/health.json', 'https://jdpi.pages.dev/sw.js', 'https://jdpi.pages.dev/sigint/',
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans', 'https://jdpi.pages.dev.evil.example/shell.js', 'http://localhost:8790/iot/status', 'http://127.0.0.1:8790/health']) assert.equal(keyOf(u), null, `leaves ${u} alone`);
  assert.equal(keyOf('https://jdpi.pages.dev/registry.json', 'POST'), null, 'never a POST');
  // A request it leaves alone is not answered by it at all; one it keeps is network first, from the copy offline.
  let answered = null;
  handlers.fetch({ request: { url: 'http://localhost:8790/iot/devices', method: 'GET' }, respondWith: p => { answered = p; }, waitUntil() {} });
  assert.equal(answered, null);
  handlers.fetch({ request: { url: 'https://jdpi.pages.dev/shell.js', method: 'GET' }, respondWith: p => { answered = p; }, waitUntil() {} });
  assert.ok(answered && (await answered).ok);
  sandbox.fetch = async () => { throw new TypeError('offline'); };
  handlers.fetch({ request: { url: 'https://jdpi.pages.dev/shell.js', method: 'GET' }, respondWith: p => { answered = p; }, waitUntil() {} });
  assert.equal(await answered, cached.get('https://jdpi.pages.dev/shell.js'), 'offline: the copy');
  waits = [];
  handlers.activate({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
});

test('the app: with the worker, the shell and IoT Connect open with no connection', pageTest, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    // The shell does not register the worker in a browser a test drives (so routed requests stay visible): register it here.
    await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await p.waitForFunction(async () => (await (await caches.open('vm-shell-1')).keys()).length >= 25, null, { timeout: 20000 });
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#nav details.suite', { state: 'attached' }); // in the phone drawer, closed
    assert.equal(await p.locator('#nav details.suite').count(), registry.suites.length, 'the shell, offline');
    await p.goto(`${BASE}/digital/iot-connect/#tab=remote`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#tab-remote[aria-selected="true"]');
    assert.equal(await p.textContent('h1'), 'IoT Connect', 'IoT Connect, offline');
    await ctx.setOffline(false);
    await p.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
  } finally { await ctx.close(); }
});
