// War Focus (Retrospective Battlefield submodule): data covers the major wars, and the page plays a war month by month.
// The data tests read the committed battlefield/focus/data (which warfocus-refresh tests before committing), or the
// site's when JDPI_URL is set; the page tests run against JDPI_URL (default live) and PRP_PAGES=0 leaves them out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const fromSite = process.env.JDPI_URL && !pageTest.skip;
const dataFile = async path => (fromSite ? (await fetch(`${BASE}/${path}`)).json() : JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')));

test('index lists the major wars with Wikidata IDs and deaths', async () => {
  const d = await dataFile('battlefield/focus/data/index.json');
  const ids = d.wars.map(w => w.id);
  for (const id of ['ww2', 'korean-war', 'vietnam-war', 'iran-iraq', 'russia-ukraine']) assert.ok(ids.includes(id), id);
  assert.ok(d.wars.length >= 35, `wars: ${d.wars.length}`);
  assert.ok(d.wars.every(w => /^Q\d+$/.test(w.qid) && w.totalDeaths > 0), 'every war has a QID and deaths');
  const ww2 = d.wars.find(w => w.id === 'ww2');
  assert.ok(ww2.mappedBattles > 500, `WWII mapped battles: ${ww2.mappedBattles}`);
});

test('every war in the index has its file, and the two agree', async () => {
  const d = await dataFile('battlefield/focus/data/index.json');
  assert.match(d.gedThrough, /^\d{4}-\d{2}-\d{2}$/);
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`);
    assert.deepEqual([w.id, w.qid, w.battles.length, w.events, w.totalDeaths], [x.id, x.qid, x.battles, x.events, x.totalDeaths], x.id);
    // One entry a month in each monthly series; an ongoing war runs no later than the UCDP data.
    for (const k of ['deaths', 'estimated', 'cells', 'top']) assert.equal(w[k].length, w.months.length, `${x.id}: ${k}`);
    if (w.ongoing) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(w.dataThrough) && w.dataThrough <= d.gedThrough, `${x.id}: data through ${w.dataThrough}`);
  }
});

test('WWII plays month by month with sides, occupation and battles', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1940-07`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('path.state.side-b', { timeout: 20000 });
  const july40 = { date: await page.locator('#date').innerText(), occupied: await page.locator('path.state.occ-b').count(), usAllied: await page.evaluate(() => [...document.querySelectorAll('path.state.side-a')].length) };
  await page.locator('#next').click(); await page.locator('#next').click();
  const sept40 = await page.locator('#date').innerText();
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1942-01`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'January 1942', null, { timeout: 20000 });
  const jan42 = { battles: await page.locator('circle.battle').count(), panel: await page.locator('#panel').innerText(), qids: await page.locator('#panel [data-qid]').count() };
  await browser.close();
  assert.equal(july40.date, 'July 1940');
  assert.equal(sept40, 'September 1940');
  assert.ok(july40.occupied >= 6, `occupied countries July 1940: ${july40.occupied}`);
  assert.ok(jan42.battles > 100, `battles shown: ${jan42.battles}`);
  assert.match(jan42.panel, /United States/);
  assert.ok(jan42.qids > 3, 'battles carry Wikidata IDs for the Encyclopaedia linker');
  assert.deepEqual(errors, []);
});

test('Russia–Ukraine shows UCDP clashes and a running death toll; Battlefield links to War Focus', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=russia-ukraine&m=2022-03`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('circle.cell', { timeout: 20000 });
  const cells = await page.locator('circle.cell').count();
  const total = await page.locator('#c-total').innerText();
  await page.goto(`${BASE}/battlefield/history/#y=1950&w=u235`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[href*="../focus/index.html#war=korean-war"]', { timeout: 20000 });
  await browser.close();
  assert.ok(cells > 50, `clash cells: ${cells}`);
  assert.ok(+total.replace(/,/g, '') > 1000, `deaths so far: ${total}`);
  assert.deepEqual(errors, []);
});

test('a period of months sums its deaths and groups its clashes by place; the start handle back on the first month is the war so far', pageTest, async t => {
  const w = await dataFile('battlefield/focus/data/wars/russia-ukraine.json');
  const a = w.months.indexOf('2023-06'), b = w.months.indexOf('2023-11');
  const deaths = w.deaths.slice(a, b + 1).reduce((s, v) => s + v, 0);
  const places = new Set(w.cells.slice(a, b + 1).flat().map(c => `${c[0]},${c[1]}`)).size;
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=russia-ukraine&m=2023-11&f=2023-06`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'Jun – Nov 2023', null, { timeout: 20000 });
  const period = {
    label: (await page.locator('#date-label').textContent()).trim(), // textContent: the CSS upper-cases it
    inPeriod: (await page.locator('#c-month-label').textContent()).trim(),
    deaths: +(await page.locator('#c-month').innerText()).replace(/[~,]/g, ''),
    cells: await page.locator('circle.cell').count(),
    hash: await page.evaluate(() => location.hash),
    strip: await page.locator('#timeline .prp-period-strip path.area.in').count(),
  };
  await page.locator('#month-from').focus();
  await page.keyboard.press('Home');
  const rest = { date: await page.locator('#date').innerText(), hash: await page.evaluate(() => location.hash), label: (await page.locator('#c-month-label').textContent()).trim() };
  assert.deepEqual([period.label, period.inPeriod], ['Period', 'In the period']);
  assert.equal(period.deaths, deaths);
  assert.equal(period.cells, places, 'one clash circle per place over the period');
  assert.equal(period.hash, '#war=russia-ukraine&m=2023-11&f=2023-06');
  assert.equal(period.strip, 1, 'the strip draws the period solid');
  assert.deepEqual(rest, { date: 'November 2023', hash: '#war=russia-ukraine&m=2023-11', label: 'This month' });
  assert.deepEqual(errors, []);
});

test('a period of months: its battles figure is the panel\'s, a one-month period reads as its month, and an earlier month in the table widens it', pageTest, async t => {
  const w = await dataFile('battlefield/focus/data/wars/ww2.json');
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1943-11&f=1943-06`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'Jun – Nov 1943', null, { timeout: 20000 });
  // textContent: the CSS upper-cases the heading
  const battles = { figure: (await page.locator('#c-battles').textContent()).replace(/,/g, ''), panel: (await page.locator('#panel h3 .count').first().textContent()).match(/^[\d,]+/)?.[0].replace(/,/g, '') };
  // The start on the end, away from the first month: still a period (its own figures), named as one month.
  await page.evaluate(() => { location.hash = '#war=ww2&m=1943-11&f=1943-11'; });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'November 1943', null, { timeout: 10000 });
  const one = { label: (await page.locator('#date-label').textContent()).trim(), legend: await page.locator('#legend h4').textContent() };
  // A month in the deaths table before the period's start: the period begins there, its end kept.
  await page.evaluate(() => { location.hash = '#war=ww2&m=1943-11&f=1943-06&v=months'; });
  await page.waitForSelector('#months-rows tr.end', { timeout: 10000 });
  await page.locator(`#months-rows tr[data-k="${w.months.indexOf('1939-11')}"]`).click();
  const widened = { hash: await page.evaluate(() => location.hash), date: await page.locator('#date').textContent() };
  assert.equal(battles.figure, battles.panel, 'the battles in the period are those the panel lists as under way');
  assert.deepEqual(one, { label: 'Period', legend: 'November 1943' });
  assert.deepEqual(widened, { hash: '#war=ww2&m=1943-11&f=1939-11&v=months', date: 'Nov 1939 – Nov 1943' });
  assert.deepEqual(errors, []);
});

// The header figures keep their widths, so opening a period moves nothing under the reader's pointer: before, the
// longer figures wrapped under the dek (or onto a new row on a phone) and dropped the timeline and the map mid-drag.
test('opening a period keeps the timeline where it was, on a desktop and on a phone, and nothing scrolls sideways', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  // The start's first move off the first month, then a period: June 1943 ("Jun – Nov 1943"), and on a phone September
  // 2022 (the widest kind of label, "Sep 2022 – Sep 2024").
  for (const [width, war, month, from, label] of [[1280, 'ww2', '1943-11', '1943-06', 'Jun – Nov 1943'], [390, 'russia-ukraine', '2024-09', '2022-09', 'Sep 2022 – Sep 2024']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${BASE}/battlefield/focus/#war=${war}&m=${month}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#date')?.textContent !== '–' && document.querySelectorAll('path.state').length > 10, null, { timeout: 20000 });
    await page.waitForSelector('.jdpi-returnbar', { timeout: 15000 }); // prp-bar.js adds it after load, moving the page down
    await page.evaluate(() => document.fonts.ready);
    const track = () => page.evaluate(() => { const r = document.querySelector('#timeline .prp-period-range').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), width: Math.round(r.width), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    const rest = await track();
    await page.locator('#month-from').focus();
    await page.keyboard.press('ArrowRight'); // a drag's first move
    const first = await track();
    await page.evaluate(h => { location.hash = h; }, `#war=${war}&m=${month}&f=${from}`);
    await page.waitForFunction(l => document.querySelector('#date').textContent === l, label, { timeout: 10000 });
    const open = await track();
    assert.deepEqual(first, rest, `${width}px, the first move`);
    assert.deepEqual(open, rest, `${width}px, ${label}`);
    assert.equal(rest.sideways, 0, `${width}px scrolls sideways`);
    await page.close();
  }
});
