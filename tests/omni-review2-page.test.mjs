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

/* ================================================================ The third reading (Codex on f9e1004, 20 November 2026) */
// Each test below failed on f9e1004 and passes once mended; the Node-level findings are in omni-review2-data.test.mjs.

test('page 3rd X1: an older recipe whose subject is read late never replaces the newer view', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  // Q1449, Genoa: its Master Index record is in lake/data/e/425.json, held until the newer recipe has drawn.
  const late = await hold(page, '**/lake/data/e/425.json');
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1980..2010&at=1990&fill=borders&q=Q1449`, { waitUntil: 'domcontentloaded' });
  await late.asked;
  await page.evaluate(h => { location.hash = h; }, `${HEAD}&t=1980..2010&at=2000&fill=borders`);
  await ready(page, 2000);
  const done = page.waitForResponse(r => /\/lake\/data\/e\/425\.json$/.test(r.url()), { timeout: 30000 });
  late.release();
  await done;
  await page.waitForTimeout(2000);
  const s = await fresh(page);
  assert.equal(s.frame, 2000, 'the newer recipe’s year stands');
  assert.match(s.recipe, /at=2000/);
  assert.doesNotMatch(s.recipe, /q=Q1449/);
  assert.deepEqual(errors, []);
});

test('page 3rd X3: an address with l=battles whose file fails to load opens with the switch off, and says why', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page, /\/omni\/data\/layers\/battles\.json/);
  await page.route('**/omni/data/layers/battles.json', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }));
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1490..1500&at=1495&fill=borders&l=battles`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1495);
  assert.equal(await page.isChecked('#ly-battles'), false);
  assert.match(await page.textContent('#ly-note'), /The battles could not load \(HTTP 404 for \/omni\/data\/layers\/battles\.json\), so their switch is off\./);
  const s = await page.evaluate(() => window.omniState);
  assert.doesNotMatch(s.recipe, /l=battles/);
  assert.deepEqual(s.layers, ['borders']);
  assert.deepEqual(errors, []);
});

test('page 3rd X7: a layer that failed to load and then loads leaves no "could not load" line behind', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page, /\/omni\/data\/layers\/breakthroughs\/events\.json/);
  let first = true;
  await page.route('**/omni/data/layers/breakthroughs/events.json', route => {
    if (!first) return route.continue();
    first = false;
    return route.fulfill({ status: 503, contentType: 'text/plain', body: 'busy' });
  });
  await page.goto(`${BASE}/omni/index.html#${HEAD}&t=1600..1620&at=1609&fill=borders&l=breakthroughs`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1609);
  assert.match(await page.textContent('#focus-body'), /A layer's data could not load: HTTP 503/);
  await page.click('#ly-breakthroughs'); // off
  await page.waitForFunction(() => window.omniState?.ready && !window.omniState.lv.on.includes('breakthroughs'), null, { timeout: 60000 });
  await page.click('#ly-breakthroughs'); // on again: the file loads this time
  await page.waitForFunction(() => window.omniState?.ready && window.omniState.lv.drawn.includes('breakthroughs'), null, { timeout: 60000 });
  assert.doesNotMatch(await page.textContent('#focus-body'), /could not load/);
  assert.deepEqual(errors, []);
});

test('page 3rd X9: a fill= or base= the recipe cannot read is named, escaped, not dropped in silence', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  const tail = 't=1600..1620&at=1609';
  for (const [hash, said] of [
    [`vr=1&show=frame&step=y&base=plain&fill=invalid!&${tail}`, 'fill=invalid! is not a layer VM holds, so it is not drawn.'],
    [`vr=1&show=frame&step=y&base=unknown&fill=borders&${tail}`, 'base=unknown is not a base VM holds, so the plain base is drawn.'],
    [`vr=1&show=frame&step=y&base=plain&fill=%3Cimg%20src%3Dx%3E&${tail}`, 'fill=<img src=x> is not a layer VM holds, so it is not drawn.']]) {
    await page.goto(`${BASE}/omni/index.html#${hash}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1609);
    const notes = await page.$$eval('#focus-body .om-notes li', ls => ls.map(l => l.textContent));
    assert.ok(notes.includes(said), `${hash}: ${JSON.stringify(notes)}`);
    assert.equal(await page.locator('#focus-body img').count(), 0, 'written as text, never as markup');
  }
  assert.deepEqual(errors, []);
});

// Found by the live check of 20 November 2026: an address whose l= named four layers without all=1 drew none of them
// and said nothing (design/vm-recipe.js leaves such an l= out of the recipe).
test('page live check: an l= the recipe cannot read is named, escaped, not dropped in silence', PAGE, async t => {
  const page = await open(t);
  const errors = watch(page);
  const head = 'vr=1&t=1960..1980&at=1968&show=frame&step=y&base=plain&fill=borders';
  for (const [hash, said, on] of [
    [`${head}&l=elections,coups,breakthroughs,calendar-events`, 'l= has 4 entries and an address holds at most 3 layers (12 with all=1, “Show anyway”), so none of them is drawn.', []],
    [`${head}&l=elections,coups,breakthroughs,calendar-events,a,b,c,d,e,f,g,h,i&all=1`, 'l= has 13 entries and an address holds at most 12 layers, so none of them is drawn.', []],
    [`${head}&l=%3Cimg%20src%3Dx%3E`, 'l=<img src=x> could not be read, so no layer it names is drawn.', []],
    // Counted as the reader counts (the second reader's two points on the first mend): an encoded comma inside a
    // filter's value is no entry; an empty part is one; the first all= stands, and only the literal 1 lifts the limit.
    [`${head}&l=elections:kind=a%2Cb%2Cc%2Cd,invalid!`, 'l=elections:kind=a,b,c,d,invalid! could not be read, so no layer it names is drawn.', []],
    [`${head}&l=elections,,coups,breakthroughs`, 'l= has 4 entries and an address holds at most 3 layers (12 with all=1, “Show anyway”), so none of them is drawn.', []],
    [`${head}&l=elections,coups,breakthroughs,calendar-events,a,b,c,d,e,f,g,h,i&all=%31&all=1`, 'l= has 13 entries and an address holds at most 3 layers (12 with all=1, “Show anyway”), so none of them is drawn.', []],
    [`${head}&l=elections,coups,breakthroughs,calendar-events&all&all=1`, 'l= has 4 entries and an address holds at most 3 layers (12 with all=1, “Show anyway”), so none of them is drawn.', []],
    [`${head}&l=elections,coups,breakthroughs,calendar-events&all=1`, null, ['elections', 'coups', 'breakthroughs', 'calendar-events']]]) {
    await page.goto(`${BASE}/omni/index.html#${hash}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, 1968);
    const notes = await page.$$eval('#focus-body .om-notes li', ls => ls.map(l => l.textContent));
    if (said) assert.ok(notes.includes(said), `${hash}: ${JSON.stringify(notes)}`);
    else assert.ok(!notes.some(n => /^l=/.test(n)), `a readable l= draws and no note names it: ${JSON.stringify(notes)}`);
    assert.deepEqual(await page.evaluate(() => window.omniState.lv.on), on, hash);
    assert.equal(await page.locator('#focus-body img').count(), 0, 'written as text, never as markup');
  }
  assert.deepEqual(errors, []);
});
