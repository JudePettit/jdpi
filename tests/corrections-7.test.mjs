// Build 7 of the ChatGPT review corrections (vm-workflows/chatgpt-taskmaster/CONFIRMED.md, 25 November 2026): National
// Analysis, the page's own words and layout (q/national.html). Each page test failed before its correction and passes
// after it; 'pestle-3 data' checks the stored coverage the correction relies on. Every expected figure is read from the committed data, never fixed, so a monthly refresh passes as long as the
// page shows what the data says. The page tests run against JDPI_URL, muted and closed whatever happens.
//   pestle-3  coverage is rounded once: 21 of the 22 core indicators reads 95%, not 96%
//   pestle-2  (and front-pages-51) overall pressure is described as the average of the dimensions' shares
//   pestle-4  the table's note explains "too few (n%)"
//   pestle-1  on a phone the score column fits, Overall pressure (a repeat of it) is hidden with Overall chosen, and a
//             cue says that the table scrolls sideways, also when the table widens with no new render
// After the second readers (25 November 2026): a coverage change over a period is the difference of the two
// percentages shown beside it, and the legend's note for Overall starts "the".
// The rule's own change (overall from the unrounded shares) and the poverty label are in
// tests/corrections-7-rebuild.test.mjs, as they go with the rebuilt data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const N = read('national/data/index.json'), P = read('national/data/years/pressure.json');
const CORE = N.indicators.filter(i => i.core).length;
// Coverage as the page must show it: the count of core indicators with a value, recovered from the stored share and
// rounded once.
const cov = v => (v == null ? '–' : Math.round((Math.round(v * CORE) / CORE) * 100) + '%');
const twice = v => Math.round(v * 100) + '%'; // the old, double rounding
const cellAt = (iso, y) => P.values[P.countries.indexOf(iso)]?.[y - P.from] || null;
const OVERALL = 'average, across the dimensions scored, of the share of each one\'s indicators worsening';

test('pestle-3 data: the stored coverage is a count of 22 in thousandths, and some of it rounds high twice', () => {
  assert.equal(CORE, 22);
  for (const c of N.countries) if (c.coverage != null) assert.ok(Math.abs(c.coverage * CORE - Math.round(c.coverage * CORE)) < 0.02, `${c.iso3}: ${c.coverage}`);
  // 21 of 22 is 0.9545…, stored as 0.955: once rounded it is 95%, twice 96%.
  assert.deepEqual([cov(0.955), twice(0.955), cov(0.455), twice(0.455), cov(1), cov(0)], ['95%', '96%', '45%', '46%', '100%', '0%']);
  assert.ok(N.countries.some(c => c.coverage != null && cov(c.coverage) !== twice(c.coverage)), 'a Latest coverage the double rounding shows a point high');
});

test('page pestle-1 to pestle-4: coverage rounded once, overall pressure described as it is worked out, the note explains "too few", and a phone sees the score', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const drawn = p => p.waitForFunction(() => window.__naDrawn && window.__naDrawn.view === document.querySelector('#yrlabel').textContent, null, { timeout: 20000 });
  const open = async (p, hash) => { await p.goto('about:blank'); await p.goto(`${BASE}/q/national${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForSelector('#rows tr', { state: 'attached', timeout: 20000 }); await drawn(p); };
  const row = (p, iso) => p.$$eval(`#rows tr[data-iso="${iso}"] td`, tds => tds.map(td => td.textContent.trim()));
  const tip = async iso => { await page.locator(`#map path.land[data-iso="${iso}"]`).dispatchEvent('mousemove', { clientX: 600, clientY: 500 }); await page.waitForSelector('#tip:not([hidden])'); return page.textContent('#tip'); };

  // pestle-3. At Latest, a country with 21 of 22 (0.955) reads 95% in the table, the tooltip and its profile, and
  // under PESTLE coverage; in 1999 the same from pressure.json.
  const drawnIsos = async () => new Set(await page.$$eval('#map path.land[data-iso]', ps => ps.map(x => x.dataset.iso)));
  await open(page, '#map');
  const shapes = await drawnIsos();
  const hi = N.countries.find(c => shapes.has(c.iso3) && c.overall != null && c.coverage != null && cov(c.coverage) !== twice(c.coverage));
  assert.ok(hi, 'a country on the map whose coverage rounds high twice');
  assert.equal((await row(page, hi.iso3))[5], cov(hi.coverage), `${hi.iso3}'s coverage in the table`);
  assert.match(await tip(hi.iso3), new RegExp(`coverage ${cov(hi.coverage)}`), `${hi.iso3}'s tooltip`);
  await open(page, '#map&measure=coverage');
  assert.ok((await row(page, hi.iso3))[3].startsWith(cov(hi.coverage)), `${hi.iso3} under PESTLE coverage: ${(await row(page, hi.iso3))[3]}`);
  await page.goto('about:blank');
  await page.goto(`${BASE}/q/national#country=${hi.iso3}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('#profile .stat')].some(s => s.querySelector('span')?.textContent === 'PESTLE pressure'), null, { timeout: 20000 });
  const note = await page.$$eval('#profile .stat', ss => ss.find(s => s.querySelector('span')?.textContent === 'PESTLE pressure').querySelector('small').textContent);
  assert.match(note, new RegExp(`^latest · coverage ${cov(hi.coverage)}`), note);
  const y99 = N.countries.find(c => cellAt(c.iso3, 1999)?.[0] != null && cov(cellAt(c.iso3, 1999)[7] / 1000) !== twice(cellAt(c.iso3, 1999)[7] / 1000));
  await open(page, '#map&year=1999');
  assert.equal((await row(page, y99.iso3))[5], cov(cellAt(y99.iso3, 1999)[7] / 1000), `${y99.iso3}'s 1999 coverage`);

  // pestle-2 and pestle-4. With Overall chosen, the legend and the caption give overall pressure as the average of the
  // dimensions' shares; a single dimension keeps its own words. The note under the table says so of the column, which
  // is headed "Overall pressure", whatever the measure, and explains "too few (n%)".
  await open(page, '#map');
  // The legend's note follows the ramp's end, "60%+": it starts "the", so "60%+ average" is not read as one phrase.
  assert.equal(await page.$eval('#legend .note', n => n.textContent), `the ${OVERALL}`, await page.textContent('#legend'));
  const cap = await page.textContent('#mapcap');
  assert.ok(cap.includes(`more pressure overall, a higher ${OVERALL}`), cap);
  assert.doesNotMatch(cap, /more of a dimension's indicators are worsening/);
  const heads = await page.$$eval('#thead th', ths => ths.map(th => th.textContent.trim().replace(/[↑↓]$/, '')));
  assert.equal(heads[4], 'Overall pressure');
  const tnote = await page.textContent('#tblnote');
  assert.ok(tnote.includes(`Overall pressure is the ${OVERALL}`), tnote);
  assert.doesNotMatch(tnote, /Pressure is the share of a dimension's indicators/);
  assert.ok(tnote.includes('“too few (n%)” a score from fewer than three of the six dimensions, not coloured or ranked'), tnote);
  await open(page, '#map&measure=political');
  assert.equal(await page.inputValue('#metric'), 'p_political');
  const legP = await page.textContent('#legend');
  assert.ok(legP.includes('of the indicators worsening') && !legP.includes(OVERALL), legP);
  assert.match(await page.textContent('#mapcap'), /more of a dimension's indicators are worsening/);
  assert.equal((await page.$$eval('#thead th', ths => ths.map(th => th.textContent.trim())))[4], 'Overall pressure', 'the column is the overall score whatever the measure');
  // A wide screen keeps every column, and the cue stays hidden while nothing runs past the box.
  await open(page, '#map');
  assert.ok(await page.isVisible('#thead th.pc') && await page.isVisible('#thead th.rg'));
  assert.equal(await page.isHidden('#tblcue'), true);
  // The table widening with no new render (as when the web font arrives) brings the cue, and narrowing again hides it:
  // the box keeps its size, so only watching the table itself sees it.
  const wide = await page.evaluate(() => { const a = document.querySelector('#rows tr td.cn a'), was = a.textContent; a.textContent = 'W'.repeat(400); return was; });
  await page.waitForFunction(() => !document.querySelector('#tblcue').hidden, null, { timeout: 5000 });
  await page.evaluate(was => { document.querySelector('#rows tr td.cn a').textContent = was; }, wide);
  await page.waitForFunction(() => document.querySelector('#tblcue').hidden, null, { timeout: 5000 });

  // pestle-3, after the second readers. Over a period, a coverage change is the difference of the two percentages
  // shown beside it (21 of 22 to 20 of 22 reads 95%, 91% and −4 pt, not −5 pt), in the table and in Rose most · Fell
  // most; a period in which the two would differ for some country, from the data.
  const pts = v => Math.round((Math.round((v / 1000) * CORE) / CORE) * 100);
  const odd = P.countries.filter(iso => { const a = cellAt(iso, 2000), b = cellAt(iso, 2020); if (a?.[7] == null || b?.[7] == null) return false; const d = (b[7] - a[7]) / 1000; return Math.sign(d) * Math.round((Math.round(Math.abs(d) * CORE) / CORE) * 100) !== pts(b[7]) - pts(a[7]); });
  assert.ok(odd.length > 0, 'a country whose coverage change, 2000 to 2020, rounds away from its two ends');
  await open(page, '#map&from=2000&year=2020&measure=coverage');
  const per = await page.$$eval('#rows tr', rs => rs.map(r => [r.dataset.iso, ...[...r.children].slice(3, 6).map(td => td.textContent.trim())]));
  const num = s => +s.replace('−', '-').replace('±', '').match(/^[-+]?\d+/)[0];
  let seen = 0;
  for (const [iso, a, b, d] of per) {
    if (!/^\d+%$/.test(a) || !/^\d+%$/.test(b)) continue;
    assert.equal(num(d), num(b) - num(a), `${iso}: ${a} → ${b} shows ${d}`);
    seen++;
  }
  assert.ok(seen > 150 && odd.every(iso => per.some(r => r[0] === iso)), `${seen} coverage changes checked, ${odd.join(' ')} among them`);
  for (const li of await page.$$eval('#rose li, #fell li', ls => ls.filter(l => l.querySelector('a')).map(l => [l.querySelector('a').getAttribute('href').split('=')[1], l.textContent]))) {
    const r = per.find(x => x[0] === li[0]);
    assert.ok(li[1].includes(r[3]), `${li[0]} in Rose most · Fell most: ${li[1]}, the table ${r[3]}`);
  }

  // pestle-1. A phone (390 px), with Overall chosen, at Latest and in 2012: the score column is wholly inside the
  // table's box; Pressure and Region are hidden by CSS (the cells stay, so cells keep their places), Region is shown
  // under the country's name, and a partial score carries its "partial" mark in the score cell. The cue shows exactly
  // while the table runs past its box.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('pageerror', e => errors.push(e.message));
  const layout = () => phone.evaluate(() => {
    const box = document.querySelector('#tblbox'), b = box.getBoundingClientRect(), th = [...document.querySelectorAll('#thead th')];
    const tr = document.querySelector('#rows tr'), name = tr.querySelector('td.cn');
    return {
      cells: tr.children.length, heads: th.length, scoreRight: th[3].getBoundingClientRect().right, boxRight: b.right,
      shown: th.map(x => getComputedStyle(x).display !== 'none'), region: getComputedStyle(name, '::after').content, regionOf: name.dataset.region,
      over: box.scrollWidth > box.clientWidth + 1, cue: !document.querySelector('#tblcue').hidden && getComputedStyle(document.querySelector('#tblcue')).display !== 'none',
      page: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  for (const h of ['#map', '#map&year=2012']) {
    await open(phone, h);
    const L = await layout();
    assert.ok(L.scoreRight <= L.boxRight + 1, `${h}: the score column ends at ${L.scoreRight}, the box at ${L.boxRight}`);
    assert.deepEqual([L.cells, L.heads], [6, 6], `${h}: every cell is still in the table`);
    assert.deepEqual(L.shown, [true, true, false, true, false, true], `${h}: Region and Pressure hidden`);
    assert.equal(L.region, JSON.stringify(L.regionOf), `${h}: the region under the name`);
    assert.equal(L.cue, L.over, `${h}: the cue shows exactly while the table runs past its box`);
    assert.ok(L.page, `${h}: the page itself does not scroll sideways`);
  }
  const part = P.countries.find(iso => { const x = cellAt(iso, 2012); return x && x[0] != null && x[8] >= 3 && x[8] < 6; });
  assert.ok(part, 'a partial score in 2012');
  const mark = await phone.$eval(`#rows tr[data-iso="${part}"] td.sc`, td => [td.hasAttribute('data-part'), getComputedStyle(td, '::after').content]);
  assert.deepEqual(mark, [true, '"partial"'], `${part}'s score cell carries "partial"`);
  const whole = P.countries.find(iso => cellAt(iso, 2012)?.[8] === 6);
  assert.equal(await phone.$eval(`#rows tr[data-iso="${whole}"] td.sc`, td => td.hasAttribute('data-part')), false, `${whole}: six dimensions, no mark`);
  // Another measure keeps its Pressure column (it is then the only overall figure), and so runs past the box: the cue
  // says so.
  await open(phone, '#map&year=2012&measure=political');
  const Lp = await layout();
  assert.deepEqual(Lp.shown, [true, true, false, true, true, true], 'Pressure shown with Political pressure chosen');
  assert.equal(Lp.cue, Lp.over);
  assert.ok(Lp.over && Lp.cue, 'the table runs past the box on a phone, and the cue says so');
  assert.match(await phone.textContent('#tblcue'), /Scroll the table sideways/);
  await phone.close();
  assert.deepEqual(errors, []);
});
