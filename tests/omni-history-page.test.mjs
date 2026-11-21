// Digital Science · Omni-Map, stage S5b of PRP-SCHOLAR-USP-DESIGN.md (4.2), in Microsoft Edge: the four layers of
// history (conflict on territory, political change with elections and coups, the widened battles, breakthroughs).
// Each switch by keyboard fetches its data only then; the legend's words (classes, the conflict count strip, the gap
// before 1946 and its reason); a click on a state opens its own module at that country and year (Vietnam, 1968); the
// discipline filter kept in l=; the clutter rule at a fourth point layer; and the flagship address opening as before.
// npm run test:e2e -- tests/omni-history-page.test.mjs serves the site locally and sets JDPI_URL; without it these skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the page (npm run test:e2e -- tests/omni-history-page.test.mjs)' };
const LAYER_FILE = /\/omni\/data\/(layers\/(conflict-territory|political-change|elections|coups|breakthroughs|retro-keys)|base\/(countries\.topo|small-states)\.json)/;

function watch(page) {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errors.push(`console: ${m.text()} (${url})`);
  });
  page.on('request', r => { if (LAYER_FILE.test(r.url())) requests.push(new URL(r.url()).pathname); });
  return { errors, requests };
}
const ready = (page, frame = null) => page.waitForFunction(f => window.omniState?.ready && (f == null || window.omniState.frame === f), frame, { timeout: 60000 });
const st = page => page.evaluate(() => window.omniState);
async function settled(page, on) {
  await page.waitForFunction(ids => { const s = window.omniState; return s?.ready && s.lv && JSON.stringify(s.lv.on) === JSON.stringify(ids) && ids.filter(id => id !== 'battles').every(id => s.lv.drawn.includes(id) || s.lv.years[id] === null); }, on, { timeout: 60000 });
  return st(page);
}
const legendOf = (s, id) => s.legend.find(l => l.layer === id)?.text || '';

test('page: conflict on territory, switched on by keyboard at 1968, is fetched only then; its legend, strip and links; a click on North Vietnam opens its module', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1950..1990&at=1968&show=frame&step=y&base=plain&fill=borders&focus=Q881`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1968);
  let s = await settled(page, []);
  assert.deepEqual(requests, [], 'no layer file is fetched before a layer is switched on');
  const ids = await page.$$eval('#layers-body [role="switch"]', els => els.map(e => e.id));
  for (const id of ['ly-conflict-territory', 'ly-elections', 'ly-coups', 'ly-political-change', 'ly-breakthroughs']) assert.ok(ids.includes(id), `the list has ${id}`);
  assert.equal(await page.textContent('#ly-conflict-territory-what'), 'Holds 1946 to 2025. Off: its data loads when you switch it on.');

  await page.focus('#ly-conflict-territory');
  await page.keyboard.press('Space');
  s = await settled(page, ['conflict-territory']);
  assert.deepEqual([...new Set(requests)].sort(), ['/omni/data/base/countries.topo.json', '/omni/data/base/small-states.json', '/omni/data/layers/conflict-territory/conflicts.json']);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ly-conflict-territory', 'the focus stays on the switch');
  assert.match(s.recipe, /&fill=conflict-territory(&|$)/);
  const lg = legendOf(s, 'conflict-territory');
  for (const w of ['Conflict on territory', 'Minor conflict: 25 to 999 battle-related deaths in the year', 'War: 1,000 or more battle-related deaths in the year', 'Fighting outside its own territory (outlined)', 'UCDP', 'Armed conflicts a year, as UCDP counts them, 1946 to 2025'])
    assert.ok(lg.includes(w), `the legend says "${w}": ${lg.slice(0, 600)}`);
  assert.match(await page.getAttribute('.om-strip svg', 'aria-label'), /; \d+ in 1968$/);
  assert.ok(s.lv.counts['conflict-territory'].drawn > 10, 'states are drawn in 1968');
  // South Vietnam has no border VM can name (no crosswalk row, no Natural Earth country): listed, never guessed.
  assert.match(await page.getAttribute('[data-layer="conflict-territory"] [data-unplaced]', 'data-unplaced'), /Q180573/);
  // The list's links: North Vietnam (no ISO3 of today) by UCDP's own code, and the Vietnam War's War Focus.
  const hrefs = await page.$$eval('[data-list="conflict-territory"] li[data-q="Q172640"] a', as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.some(h => h.endsWith('/battlefield/history/index.html#y=1968&c=816')), hrefs.join(' '));
  assert.ok(hrefs.some(h => h.endsWith('/battlefield/focus/index.html#war=vietnam-war')), hrefs.join(' '));
  const usa = await page.$$eval('[data-list="conflict-territory"] li[data-q="Q30"] a', as => as.map(a => a.getAttribute('href')));
  assert.ok(usa.some(h => h.endsWith('/battlefield/history/index.html#y=1968&c=USA')), `the United States fights abroad and links by ISO3: ${usa.join(' ')}`);

  // A click on North Vietnam's label point on the map fills the pick panel with its module's link.
  await page.waitForFunction(() => window.omniState?.lv?.marks?.some(m => m.q === 'Q172640'), null, { timeout: 30000 });
  // The marks are read as the map stands; the click is tried again if the map was still moving.
  const picked = () => page.waitForFunction(() => /North Vietnam/.test(document.getElementById('ly-pick')?.textContent || ''), null, { timeout: 4000 }).then(() => true, () => false);
  let hit = false, seen = '';
  for (let i = 0; i < 4 && !hit; i++) {
    await page.locator('#map').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const mk = (await page.evaluate(() => window.omniState.lv.marks)).find(m => m.q === 'Q172640');
    const box = await page.locator('#map canvas').first().boundingBox();
    const xy = [box.x + mk.xy[0], box.y + mk.xy[1]];
    seen = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return `${el?.tagName}.${el?.className} pick=${document.getElementById('ly-pick')?.outerHTML.slice(0, 200)}`; }, xy);
    await page.mouse.click(...xy);
    hit = await picked();
  }
  if (!hit && process.env.OMNI_SHOT) await page.screenshot({ path: process.env.OMNI_SHOT });
  assert.ok(hit, `a click on North Vietnam names it in the pick panel (${seen})`);
  const pick = await page.$$eval('#ly-pick a', as => as.map(a => a.getAttribute('href')));
  assert.ok(pick.some(h => h.endsWith('/battlefield/history/index.html#y=1968&c=816')), pick.join(' '));
  assert.equal(await page.getAttribute('#ly-pick', 'aria-live'), 'polite');
  assert.deepEqual(errors, []);
});

test('page: at 1935 conflict on territory says what it holds and why VM holds nothing before 1946', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const { errors } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1930..1940&at=1935&show=frame&step=y&base=plain&fill=conflict-territory`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1935);
  const s = await settled(page, ['conflict-territory']);
  assert.equal(s.lv.years['conflict-territory'], null);
  assert.ok((await page.textContent('#ly-conflict-territory-what')).startsWith('Conflict on territory holds 1946 to 2025; the map is at 1935'));
  const lg = legendOf(s, 'conflict-territory');
  assert.match(lg, /holds 1946 to 2025; the map is at 1935\. Before 1946 VM holds no free conflict data/);
  assert.match(lg, /Correlates of War/);
  assert.deepEqual(errors, []);
});

test('page: political change at 1968 links each state to the Political Retrospective; elections and coups at their countries', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1960..1970&at=1968&show=upto&step=y&base=plain&fill=political-change&l=elections,coups`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1968);
  const s = await settled(page, ['political-change', 'elections', 'coups']);
  assert.ok([...new Set(requests)].includes('/omni/data/layers/retro-keys.json'));
  const lg = legendOf(s, 'political-change');
  for (const w of ['A new head of government', 'A new head of state', 'Both', 'Wikidata']) assert.ok(lg.includes(w), `the legend says "${w}"`);
  const hrefs = await page.$$eval('[data-list="political-change"] a', as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.some(h => /^https:\/\/hp-retrospective\.pages\.dev\/#y=1968&c=Q\d+$/.test(h)), hrefs.slice(0, 5).join(' '));
  // The period of an up-to view: elections and coups from 1960 to 1968, at their countries.
  assert.deepEqual(s.lv.period, [1960, 1968]);
  assert.ok(s.lv.counts.elections.drawn > 0 && s.lv.counts.coups.drawn > 0);
  assert.match(legendOf(s, 'coups'), /Drawn: \d+ from 1960 to 1968/);
  assert.deepEqual(errors, []);
});

test('page: the discipline filter is kept in l=; a fourth point layer switches off the oldest', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1600..1700&at=1700&show=upto&step=y&base=plain&fill=borders&l=breakthroughs:d=astro`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1700);
  let s = await settled(page, ['breakthroughs']);
  assert.deepEqual(s.lv.filters, { breakthroughs: { field: 'd', value: 'astro' } });
  assert.equal(await page.inputValue('#ly-breakthroughs-filter'), 'astro');
  assert.match(s.recipe, /l=breakthroughs:d=astro/);
  assert.match(legendOf(s, 'breakthroughs'), /discipline Astronomy & Space only \(l=breakthroughs:d=astro\)/);
  const astro = s.lv.counts.breakthroughs.drawn;
  await page.selectOption('#ly-breakthroughs-filter', '');
  await page.waitForFunction(() => !window.omniState?.lv?.filters?.breakthroughs, null, { timeout: 30000 });
  s = await settled(page, ['breakthroughs']);
  assert.ok(s.lv.counts.breakthroughs.drawn > astro, 'all disciplines draw more');
  assert.doesNotMatch(s.recipe, /breakthroughs:d=/);
  assert.match(await page.evaluate(() => document.querySelector('[data-list="breakthroughs"] a[href*="science/progress/index.html#y="]')?.getAttribute('href') || ''), /science\/progress\/index\.html#y=\d+&e=/);

  // Clutter: three point layers on, a fourth switches off the oldest and says so.
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1600..1700&at=1700&show=upto&step=y&base=plain&fill=borders&l=battles,elections,coups`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1700);
  await settled(page, ['battles', 'elections', 'coups']);
  await page.focus('#ly-breakthroughs');
  await page.keyboard.press('Space');
  s = await settled(page, ['elections', 'coups', 'breakthroughs']);
  assert.match(await page.textContent('#ly-note'), /^Battles switched off: the map draws at most 3 point or line layers at a time/);
  assert.deepEqual(errors, []);
});

test('page: the flagship address opens as before S5b (borders and its two battles, no layer of S5b fetched)', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { errors, requests } = watch(page);
  await page.goto(`${BASE}/omni/index.html#vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853`, { waitUntil: 'domcontentloaded' });
  await ready(page, 1494);
  const s = await settled(page, ['battles']);
  assert.deepEqual(s.layers, ['borders', 'battles']);
  assert.deepEqual(requests, []);
  assert.equal(await page.textContent('#battles-held'), 'VM holds 2 battles for these years');
  assert.deepEqual(errors, []);
});
