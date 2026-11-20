// The Omni-Map's second stage after its second review (Codex, 20 November 2026, X1–X8): each finding shown failing on
// the code as committed in e18c55e and passing once mended. The pure part runs in Node; the rest drives Microsoft Edge.
//   node --test tests/omni-review2-page.test.mjs                    (the pure test; the page tests skip)
//   npm run test:e2e -- tests/omni-review2-page.test.mjs            (serves the site locally and sets JDPI_URL)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni-review2-page.test.mjs)' };
const HEAD = 'vr=1&show=frame&step=y&base=plain';

// X2: a war filter with an empty part (w=wf-, w=wf--ukraine) names no war, in words, and never throws.
test('X2: a war id with an empty part is said to name no war; a well-formed one is named; neither throws', async () => {
  const { warName, filterWords } = await import('../omni/lib/layer-view.js');
  const e = { filter: { field: 't', label: 'Type of violence', values: [{ id: '1', name: 'state-based' }] } };
  for (const v of ['wf-', 'wf--ukraine', 'wf-ukraine-', 'wf-a--b']) {
    assert.equal(warName(v), null, v);
    assert.equal(filterWords(e, { field: 'w', value: v }), `the war “${v}” (an id that names no war, so none of it is drawn)`);
  }
  assert.equal(filterWords(e, { field: 'w', value: 'wf-russia-ukraine' }), 'the war Russia–Ukraine (wf-russia-ukraine)');
  assert.equal(filterWords(e, { field: 't', value: '1' }), 'type of violence state-based');
});

// The page's own errors, less the failed requests a test causes on purpose (allowed: a pattern of their URLs).
function watch(page, allowed = null) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && (!url.startsWith(BASE) || (allowed && allowed.test(url)))) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  return errors;
}
const ready = (page, frame) => page.waitForFunction(f => window.omniState?.ready && window.omniState.frame === f, frame, { timeout: 60000 });
// window.omniState is a snapshot made at each publish; a theme change publishes it again from what the page holds now.
const fresh = page => page.evaluate(() => { window.dispatchEvent(new CustomEvent('prp:themechange')); return window.omniState; });
// A route held until the test lets it go: { seen, release }.
async function hold(page, glob) {
  let release, seen;
  const gate = new Promise(r => { release = r; }), asked = new Promise(r => { seen = r; });
  await page.route(glob, async route => { seen(); await gate; await route.continue(); });
  return { asked, release };
}
async function open(t, viewport = { width: 1440, height: 900 }) {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport });
  t.after(() => page.close().catch(() => {}));
  return page;
}

test('page X1: a late answer for an older frame changes nothing drawn; the newer frame stands', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  const late = await hold(page, '**/omni/data/layers/density/1975.json');
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1970..1990&at=1975&fill=density-grid`, { waitUntil: 'domcontentloaded' });
  await late.asked; // the 1975 frame waits for its file
  await page.fill('#goto-year', '1980');
  await page.press('#goto-year', 'Enter');
  await page.waitForFunction(() => window.omniState?.ready && window.omniState.frame === 1980 && window.omniState.lv?.years?.['density-grid'] === 1980, null, { timeout: 60000 });
  const done = page.waitForResponse(r => /\/density\/1975\.json$/.test(r.url()), { timeout: 30000 });
  late.release();
  await done;
  await page.waitForTimeout(2000);
  const s = await fresh(page);
  assert.equal(s.frame, 1980);
  assert.equal(s.lv.years['density-grid'], 1980, 'the grid drawn is still 1980’s, not the late 1975 file');
  assert.deepEqual(s.lv.period, [1980, 1980]);
  assert.deepEqual(errors, []);
});

test('page X1: a layer switched off while its file loads is never drawn when the file comes', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1600..1620&at=1609&fill=borders`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1609);
  const late = await hold(page, '**/omni/data/layers/breakthroughs/events.json');
  await page.click('#ly-breakthroughs');
  await late.asked;
  await page.evaluate(() => { window.__before = window.omniState; });
  await page.click('#ly-breakthroughs'); // off again while its file is still loading
  await page.waitForFunction(() => window.omniState !== window.__before && window.omniState.ready, null, { timeout: 60000 });
  const done = page.waitForResponse(r => /\/breakthroughs\/events\.json$/.test(r.url()), { timeout: 30000 });
  late.release();
  await done;
  await page.waitForTimeout(1500);
  const s = await fresh(page);
  assert.deepEqual(s.lv.on, []);
  assert.ok(!s.lv.drawn.includes('breakthroughs'), `nothing of the layer switched off is drawn: ${s.lv.drawn}`);
  assert.ok(!('breakthroughs' in s.lv.years), JSON.stringify(s.lv.years));
  assert.equal(await page.isChecked('#ly-breakthroughs'), false);
  assert.deepEqual(errors, []);
});

test('page X2: an address with a war filter that names no war opens, and says so', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  for (const w of ['wf-', 'wf--ukraine']) {
    await page.goto(`${BASE}/omni/index.html#${HEAD}&t=2020..2026&at=2024&fill=borders&l=ucdp-events:w=${w}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 2024);
    assert.match(await page.textContent('#ly-ucdp-events-what'), new RegExp(`the war “${w}” \\(an id that names no war, so none of it is drawn\\)`));
  }
  assert.deepEqual(errors, []);
});

test('page X3: a layer file of the wrong shape gets the page’s loading note, not "Drawn: 0" and not an error', PAGE, async t => {
  for (const body of ['{}', '{"rows":5}']) {
    const page = await open(t);
    const errors = watch(page);
    await page.route('**/omni/data/layers/breakthroughs/events.json', route => route.fulfill({ status: 200, contentType: 'application/json', body }));
    await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1600..1620&at=1609&fill=borders&l=breakthroughs`, { waitUntil: 'domcontentloaded' });
    await ready(page, 1609);
    const s = await page.evaluate(() => window.omniState);
    assert.ok(!s.lv.drawn.includes('breakthroughs'), `${body}: not drawn`);
    assert.match(await page.textContent('#focus-body'), /A layer's data could not load: Breakthroughs in science and technology: VM’s file omni\/data\/layers\/breakthroughs\/events\.json is not of the shape this page reads, so it is not drawn/, body);
    assert.match(await page.textContent('#ly-breakthroughs-what'), /its data could not load, so nothing of it is drawn/, body);
    assert.doesNotMatch(await page.textContent('#legend-body'), /Drawn: 0/, body);
    assert.deepEqual(errors, [], body);
    await page.close();
  }
});

test('page X4: the battles failing to load put their switch back and say why', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page, /\/omni\/data\/layers\/battles\.json/);
  await page.route('**/omni/data/layers/battles.json', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }));
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1490..1500&at=1495&fill=borders`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1495);
  await page.click('#ly-battles');
  await page.waitForFunction(() => document.getElementById('ly-battles')?.checked === false && /could not load/.test(document.getElementById('ly-note')?.textContent || ''), null, { timeout: 20000 });
  assert.match(await page.textContent('#ly-note'), /The battles could not load \(HTTP 404 for \/omni\/data\/layers\/battles\.json\), so their switch is off again\./);
  const s = await page.evaluate(() => window.omniState);
  assert.doesNotMatch(s.recipe, /l=battles/);
  assert.deepEqual(s.layers, ['borders']);
  assert.deepEqual(errors, []);
});

test('page X5: the layer holding the clicked object (q=) is never the one the clutter rule drops, whatever its kind', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  const on = ids => page.waitForFunction(n => window.omniState?.ready && window.omniState.lv?.on.includes(n), ids, { timeout: 60000 });
  // Q7385535: the Ryukyu Islands legislative election of 1968, a row of the elections layer.
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1960..1980&at=1968&fill=borders&l=elections,coups,breakthroughs&q=Q7385535`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1968);
  await page.waitForFunction(() => window.omniState.lv.drawn.includes('elections'), null, { timeout: 60000 });
  await page.click('#ly-calendar-events');
  await on('calendar-events');
  let s = await page.evaluate(() => window.omniState);
  assert.deepEqual(s.lv.on, ['elections', 'breakthroughs', 'calendar-events'], 'the coups give way, not the subject’s elections');
  assert.match(await page.textContent('#ly-note'), /^Coups switched off/);
  // Four point layers under "Show anyway" (all=1; without it a recipe holds three): unticked, the subject's stays.
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1960..1980&at=1968&fill=borders&l=elections,coups,breakthroughs,calendar-events&all=1&q=Q7385535`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page, 1968);
  await page.waitForFunction(() => window.omniState.lv.drawn.includes('elections') && window.omniState.lv.on.length === 4, null, { timeout: 60000 });
  await page.click('#ly-anyway');
  await page.waitForFunction(() => window.omniState?.ready && window.omniState.lv?.on.length === 3, null, { timeout: 60000 });
  s = await page.evaluate(() => window.omniState);
  assert.deepEqual(s.lv.on, ['elections', 'breakthroughs', 'calendar-events']);
  assert.match(await page.textContent('#ly-note'), /^Coups switched off/);
  assert.deepEqual(errors, []);
});

test('page X6: a click on a battle’s point opens the pick panel, with its War Focus', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  // The view of the Battle of Shantou (Q4872362, 1927): the map is fitted to its point, so the point is at its centre.
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1920..1935&at=1927&fill=borders&l=battles&focus=Q4872362&q=Q4872362`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1927);
  assert.ok((await page.evaluate(() => window.omniState.battles.drawn)).includes('Q4872362'));
  const picked = () => page.waitForFunction(() => /Battle of Shantou/.test(document.getElementById('ly-pick')?.textContent || ''), null, { timeout: 4000 }).then(() => true, () => false);
  let hit = false;
  for (let i = 0; i < 4 && !hit; i++) {
    await page.waitForTimeout(800);
    const box = await page.locator('#map canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    hit = await picked();
  }
  assert.ok(hit, 'a click on the battle names it in the pick panel');
  const hrefs = await page.$$eval('#ly-pick a', as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.some(h => h.endsWith('/battlefield/focus/index.html#war=chinese-civil-war-1')), hrefs.join(' '));
  assert.ok(hrefs.some(h => h.endsWith('/encyclopedia/index.html#Q4872362')), hrefs.join(' '));
  assert.deepEqual(errors, []);
});

test('page X7: prp:focus with a Q-id the view has not read loads its point from the lake and fits it', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1980..2000&at=1990&fill=borders`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1990);
  await page.waitForFunction(() => typeof window.omniFocus === 'function', null, { timeout: 30000 });
  // Q1449, Genoa: no border in VM's crosswalk; its point is in lake/data/e/425.json.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prp:focus', { detail: { qids: ['Q1449'] } })));
  await page.waitForFunction(() => window.omniFocus().focused, null, { timeout: 20000 });
  const [w, s, e, n] = (await page.evaluate(() => window.omniFocus())).focused;
  assert.ok(w <= 8.94 && e >= 8.93 && s <= 44.41 && n >= 44.40, `the box holds Genoa's point: ${[w, s, e, n]}`);
  assert.deepEqual(errors, []);
});
