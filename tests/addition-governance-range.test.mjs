// HD-13 (25 November 2026, rank 3 of VM-VISUALISATION-STUDY.md): National Analysis draws the World Bank's six
// governance scores with the Bank's own 90% range: a faint band on the governance sparklines of a profile and on the
// Compare chart (its "score and range" choices), and a ranked view of every country with its range, the compared
// countries marked and a sentence saying whether their ranges overlap. The data is national/data/governance/
// (national/scripts/build.mjs on each refresh, through carry.mjs, or indicators.mjs --governance; national/lib/governance.js
// has the shape). Since 26 November 2026 the monthly refresh fetches these files again, so the figures read from the
// Bank's release of 25 September 2026 (RELEASE below) are checked only while the files are that release's, and skipped
// with a message once a newer one is in; the checks of shape run on every release.
// The unit tests check the shaping on made-up rows and the committed files; three figures are checked against the
// World Bank's API as read on 25-26 November 2026 (GOV_WGI_CC.SC, SC_LB and SC_UB, 2024: Denmark 94.0303422,
// 88.695444, 99.3652404; Ireland 79.421168, 74.131216, 84.7111201; the United Kingdom 77.9084469, 72.1771379,
// 83.6397559), rounded to one decimal as VM stores them. The page tests run against JDPI_URL, muted and closed whatever
// happens; before this addition the page had no range, no ranked view and no #govnote, and they fail there.
// After review (26 November 2026): the ranking says what it ranks (the Bank's API, read that day, scores 215 economies
// on GOV_WGI_CC.SC and 213 on GOV_WGI_GE.SC for 2025, eight of them not on VM's list), a rank's span rests on the
// country's own range, every row's "decimal" is 1, the chart's axis is 0 to 100, the ranking is a slider, and the
// score-only path, the label placement at 390 px and the theme colours are driven on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { GOVERNANCE, INDICATORS, governanceFiles, isCcBy4, licenceOf } from '../national/scripts/indicators.mjs';
import * as G from '../national/lib/governance.js';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const N = read('national/data/index.json');
const FILE = est => `national/data/${G.fileOf(est)}`;
const layer = est => read(FILE(est));
const NAMES = new Map(N.countries.map(c => [c.iso3, c.name]));

// ---- the series
test('the six governance indicators each have a score and its two bounds, by the World Bank\'s own codes', () => {
  const wgi = INDICATORS.filter(i => i.source === 3).map(i => i.code);
  assert.equal(wgi.length, 6);
  assert.deepEqual(GOVERNANCE.map(g => g.est), wgi);
  for (const g of GOVERNANCE) {
    const k = g.est.replace(/\.EST$/, '');
    assert.deepEqual([g.score, g.lower, g.upper], [`${k}.SC`, `${k}.SC_LB`, `${k}.SC_UB`]);
  }
  // The eighteen codes, as the World Bank's series list for source 3 names them (read 25 November 2026).
  assert.deepEqual(GOVERNANCE.flatMap(g => [g.score, g.lower, g.upper]).sort(), ['CC', 'GE', 'PV', 'RL', 'RQ', 'VA'].flatMap(x => [`GOV_WGI_${x}.SC`, `GOV_WGI_${x}.SC_LB`, `GOV_WGI_${x}.SC_UB`]));
  assert.ok(isCcBy4('CC BY-4.0') && isCcBy4('CC BY 4.0') && !isCcBy4('CC BY-NC 4.0') && !isCcBy4('') && !isCcBy4('SIPRI terms and conditions'));
});

// ---- the shaping, on made-up rows (each with the display precision the World Bank gives its rows, "decimal": 1)
const ROW = (iso, year, value, decimal = 1) => ({ countryiso3code: iso, date: String(year), value, decimal });
test('a layer: the years that hold a score, gaps kept, bounds rounded to a tenth, a score without bounds kept alone', () => {
  const rows = {
    score: [ROW('AAA', 1996, 50.04), ROW('AAA', 1998, 51.26), ROW('BBB', 1998, 20), ROW('WLD', 1998, 40), ROW('CCC', 2000, null), ROW('BBB', 2000, 22.95)],
    lower: [ROW('AAA', 1996, 45.049), ROW('AAA', 1998, 46), ROW('BBB', 1998, 15), ROW('DDD', 2000, 10), ROW('BBB', 2000, 18)],
    upper: [ROW('AAA', 1996, 55.0), ROW('AAA', 1998, 56.5), ROW('BBB', 1998, 25), ROW('DDD', 2000, 30)],
  };
  const L = G.rangeLayer({ est: 'GOV_WGI_XX.EST', label: 'Test' }, rows, ['AAA', 'BBB', 'CCC', 'DDD']);
  assert.deepEqual(L.years, [1996, 1998, 2000], 'only years with a score; 1997 is not invented');
  assert.deepEqual(L.codes, { score: 'GOV_WGI_XX.SC', lower: 'GOV_WGI_XX.SC_LB', upper: 'GOV_WGI_XX.SC_UB' });
  assert.deepEqual(L.values[0], [[50, 45, 55], [51.3, 46, 56.5], null]);
  assert.deepEqual(L.values[1], [null, [20, 15, 25], [23]], 'BBB 2000: a lower bound but no upper, so the score alone');
  assert.equal(L.values[2], null, 'no score at all: null');
  assert.equal(L.values[3], null, 'bounds with no score are not kept');
  assert.ok(!L.countries.includes('WLD'), 'a code not on the list is not given a row');
  assert.deepEqual(G.countsByYear(L), [{ year: 1996, ranged: 1, scoreOnly: 0 }, { year: 1998, ranged: 2, scoreOnly: 0 }, { year: 2000, ranged: 0, scoreOnly: 1 }]);
  assert.deepEqual(G.rangeAt(L, 1, 2000), { score: 23, lower: null, upper: null });
  assert.equal(G.rangeAt(L, 0, 2000), null);
  assert.equal(G.rangeAt(L, 0, 1997), null, 'a year not held');
  assert.deepEqual(G.rangeSeries(L, 1), [[1998, 20, 15, 25], [2000, 23, null, null]]);
  assert.deepEqual([G.yearFor(L, 1997), G.yearFor(L, 1995), G.yearFor(L, Infinity), G.yearFor(L, 1998)], [1996, null, 2000, 1998]);
  // A code not on the list is named, not hidden (the Bank serves no aggregates for these series: every row is an economy).
  assert.deepEqual(L.outside, [{ name: 'WLD', years: [1998] }]);
});

test('a layer names the economies the Bank scores that the list leaves out, under the Bank\'s names, by year', () => {
  // The Bank serves Taiwan, China and a few more with an empty countryiso3code (GOV_WGI_CC.SC, 2025, read 26 November 2026).
  const away = (name, year, value) => ({ countryiso3code: '', country: { id: '', value: name }, date: String(year), value, decimal: 1 });
  const rows = { score: [ROW('AAA', 1996, 50), ROW('AAA', 1998, 52), away('Taiwan, China', 1998, 71.9), away('Jersey', 1996, 68.7), away('Jersey', 1998, null), away('Niue', 2005, 38.9)], lower: [away('Taiwan, China', 1998, 60)], upper: [] };
  const L = G.rangeLayer({ est: 'GOV_WGI_XX.EST', label: 'Test' }, rows, ['AAA']);
  assert.deepEqual(L.outside, [{ name: 'Jersey', years: [1996] }, { name: 'Taiwan, China', years: [1998] }], 'a year the list holds no score for (Niue, 2005) is not one of its years');
  assert.deepEqual([G.outsideIn(L, 1996), G.outsideIn(L, 1998), G.outsideIn(L, 2000)], [['Jersey'], ['Taiwan, China'], []]);
  assert.ok(!JSON.stringify(L.values).includes('71.9'), 'their figures are not kept');
});

test('ranked: best first, ties share a rank and go by name; ranges overlap or not, or cannot be said', () => {
  const L = { years: [2020], countries: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'], values: [[[60, 50, 70]], [[80, 72, 88]], [[60, 55, 65]], [[30]], null] };
  const names = new Map([['AAA', 'Zed'], ['BBB', 'Bee'], ['CCC', 'Alpha'], ['DDD', 'Dee']]);
  const list = G.ranked(L, 2020, names);
  assert.deepEqual(list.map(r => [r.iso3, r.rank]), [['BBB', 1], ['CCC', 2], ['AAA', 2], ['DDD', 4]]);
  assert.equal(G.overlaps(list[1], list[2]), true);
  assert.equal(G.overlaps(list[0], list[1]), false);
  assert.equal(G.overlaps({ score: 1, lower: 1, upper: 2 }, { score: 3, lower: 2, upper: 4 }), true, 'touching ends overlap');
  assert.equal(G.overlaps(list[0], list[3]), null, 'no bound: cannot be said');
  // The ranks AAA would take with its score anywhere in 50 to 70, the others held at theirs: 2nd (at 70, below BBB's
  // 80) to 3rd (at 50, below BBB and CCC); it overlaps CCC only.
  assert.deepEqual(G.rankSpan(list, 'AAA'), { from: 2, to: 3, count: 2 });
  assert.deepEqual(G.rankSpan(list, 'BBB'), { from: 1, to: 1, count: 1 });
  assert.equal(G.rankSpan(list, 'DDD'), null);
  // One country with a very wide range (WWW, 5 to 95) overlaps AAA but does not stretch AAA's ranks to its own 2nd.
  const wide = G.ranked({ years: [2020], countries: ['AAA', 'WWW', 'CCC', 'DDD', 'EEE'], values: [[[10, 0, 20]], [[50, 5, 95]], [[80, 75, 85]], [[15, 10, 20]], [[5, 1, 9]]] }, 2020);
  assert.deepEqual(wide.map(r => [r.iso3, r.rank]), [['CCC', 1], ['WWW', 2], ['DDD', 3], ['AAA', 4], ['EEE', 5]]);
  assert.deepEqual(G.rankSpan(wide, 'AAA'), { from: 3, to: 5, count: 4 }, 'at 20 below CCC and WWW; at 0 below all four');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111].map(G.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd', '111th']);
});

// ---- the job's licence check
test('the job writes nothing unless every series\' licence reads CC BY 4.0, and stops on a reply that is not rows', async () => {
  const meta = licence => ({ source: [{ concept: [{ variable: [{ metatype: [{ id: 'License_Type', value: licence }] }] }] }] });
  const rows = [{ page: 1, pages: 1, total: 1 }, [ROW('AAA', 2020, 50)]];
  const fake = (licence, data = rows) => async url => (url.includes('/metadata') ? meta(licence) : url.includes('/sources/3?') ? [{}, [{ lastupdated: '2026-09-25' }]] : data);
  assert.equal(licenceOf(meta('CC BY-4.0')), 'CC BY-4.0');
  const files = await governanceFiles({ getJson: fake('CC BY-4.0'), countries: ['AAA'], accessed: '2026-11-26' });
  assert.equal(files.length, 6);
  const L = JSON.parse(files[0][1]);
  assert.deepEqual([files[0][0], L.released, L.source.licence, L.values], ['governance/GOV_WGI_PV.json', '2026-09-25', 'CC BY 4.0', [[[50, 50, 50]]]]);
  await assert.rejects(governanceFiles({ getJson: fake('Custom license'), countries: ['AAA'], accessed: '2026-11-26' }), /not CC BY 4\.0/);
  await assert.rejects(governanceFiles({ getJson: fake('CC BY-4.0', [{ message: [{ value: 'The indicator was not found' }] }]), countries: ['AAA'], accessed: '2026-11-26' }), /not found/);
  await assert.rejects(governanceFiles({ getJson: fake('CC BY-4.0', [{ pages: 1 }, []]), countries: ['AAA'], accessed: '2026-11-26' }), /no country has a score/);
  // The values are kept as the source rounds them: a row giving another precision stops the job.
  assert.equal(G.DECIMALS, 1);
  await assert.rejects(governanceFiles({ getJson: fake('CC BY-4.0', [{ page: 1, pages: 1 }, [ROW('AAA', 2020, 50.25, 2)]]), countries: ['AAA'], accessed: '2026-11-26' }), /gives 2 decimal places/);
  await assert.rejects(governanceFiles({ getJson: fake('CC BY-4.0', [{ page: 1, pages: 1 }, [{ countryiso3code: 'AAA', date: '2020', value: 50 }]]), countries: ['AAA'], accessed: '2026-11-26' }), /gives no decimal places/);
});

// ---- the committed data
test('the committed files: six layers in index.json\'s country order, each range around its score within 0 to 100, to a tenth', () => {
  let bytes = 0;
  for (const g of GOVERNANCE) {
    assert.ok(existsSync(new URL(`../${FILE(g.est)}`, import.meta.url)), FILE(g.est));
    bytes += statSync(new URL(`../${FILE(g.est)}`, import.meta.url)).size;
    const L = layer(g.est);
    assert.equal(L.layer, 'wgi-range');
    assert.equal(L.indicator, g.est);
    assert.deepEqual(L.codes, { score: g.score, lower: g.lower, upper: g.upper });
    assert.equal(L.source.licence, 'CC BY 4.0');
    assert.deepEqual(L.countries, N.countries.map(c => c.iso3));
    assert.deepEqual(L.years, [...L.years].sort((a, b) => a - b));
    assert.equal(L.years[0], 1996);
    assert.ok(!L.years.includes(1997) && !L.years.includes(1999) && !L.years.includes(2001), 'every two years until 2002');
    for (const row of L.values) {
      if (!row) continue;
      assert.equal(row.length, L.years.length);
      for (const c of row) {
        if (!c) continue;
        assert.ok(c.length === 3 || c.length === 1);
        for (const v of c) assert.ok(v >= 0 && v <= 100 && Math.abs(Math.round(v * 10) - v * 10) < 1e-9, `${g.est}: ${v}`);
        if (c.length === 3) assert.ok(c[1] <= c[0] && c[0] <= c[2], `${g.est}: ${c}`);
      }
    }
    const counts = G.countsByYear(L);
    assert.ok(counts.at(-1).ranged > 180, `${g.est}, ${counts.at(-1).year}: ${counts.at(-1).ranged} countries with a range`);
  }
  // The weight: six files, small beside index.json (870 KB) and the yearly layer; under 600 KB in all.
  assert.ok(bytes < 600 * 1024, `${bytes} bytes`);
});

// The release the pinned figures below were read from (the World Bank's source 3, lastupdated). A newer release in the
// files skips them, with a message, rather than failing the refresh's data or the deploy's tests.
const RELEASE = '2026-09-25';
const newerRelease = est => {
  let r;
  try { r = layer(est).released; } catch { return false; } // no file: the test runs, and fails as it should
  return r === RELEASE ? false : `the files are the World Bank's release of ${r}, not ${RELEASE}, which these figures were read from`;
};

test('three figures equal the World Bank\'s: control of corruption, 2024, Denmark, Ireland and the United Kingdom', { skip: newerRelease('GOV_WGI_CC.EST') }, () => {
  const L = layer('GOV_WGI_CC.EST'), at = iso => G.rangeAt(L, L.countries.indexOf(iso), 2024);
  assert.deepEqual(at('DNK'), { score: 94, lower: 88.7, upper: 99.4 });
  assert.deepEqual(at('IRL'), { score: 79.4, lower: 74.1, upper: 84.7 });
  assert.deepEqual(at('GBR'), { score: 77.9, lower: 72.2, upper: 83.6 });
  assert.equal(G.overlaps(at('IRL'), at('GBR')), true);
  assert.equal(G.overlaps(at('DNK'), at('GBR')), false);
});

test('the ranking counts what the Bank scores: the countries ranked and the economies named as left out make up its total', { skip: newerRelease('GOV_WGI_CC.EST') || newerRelease('GOV_WGI_GE.EST') }, () => {
  // The World Bank's API, read 26 November 2026: GOV_WGI_CC.SC, 2025, 215 economies with a value; GOV_WGI_GE.SC, 2025,
  // 213. Eight come with no ISO3 code and are not on VM's list: Anguilla, the Cook Islands, French Guiana, Jersey,
  // Martinique, Niue, Reunion and Taiwan, China.
  const EIGHT = ['Anguilla', 'Cook Islands', 'French Guiana', 'Jersey', 'Martinique', 'Niue', 'Reunion', 'Taiwan, China'];
  for (const [est, total] of [['GOV_WGI_CC.EST', 215], ['GOV_WGI_GE.EST', 213]]) {
    const L = layer(est);
    assert.equal(L.years.at(-1), 2025, est);
    assert.deepEqual(G.outsideIn(L, 2025), EIGHT, est);
    assert.equal(G.ranked(L, 2025).length + G.outsideIn(L, 2025).length, total, est);
  }
});

// ---- the page
const NEWEST = est => layer(est).years.at(-1);
const shown = est => { const L = layer(est), y = NEWEST(est), list = G.ranked(L, y, NAMES); return { L, y, list, at: iso => list.find(r => r.iso3 === iso) }; };
const words = x => (x.lower == null ? `${x.score.toFixed(1)} (no range given)` : `${x.score.toFixed(1)} (90% range ${x.lower.toFixed(1)} to ${x.upper.toFixed(1)})`);

async function govPage(t, width = 1440, scheme = 'light') {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const open = async hash => { await page.goto('about:blank'); await page.goto(`${BASE}/q/national${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); };
  return { page, errors, open };
}

test('page: Compare ranks every country with its range, marks the compared ones and says whether their ranges overlap', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  const CC = 'GOV_WGI_CC.EST', { list, y, at } = shown(CC);
  await open('#compare=IRL,GBR,DNK');
  await page.waitForSelector('#ranksvg .mk circle', { timeout: 30000 });
  await page.selectOption('#rankind', CC);
  await page.waitForFunction(() => /Control of corruption/.test(document.querySelector('#rankcap')?.textContent || ''), null, { timeout: 20000 });
  // Every country a dot, every range a line; the three compared ones marked.
  assert.equal(await page.locator('#ranksvg .all circle.dot').count(), list.length);
  assert.equal(await page.locator('#ranksvg .all line.iv').count(), list.filter(r => r.lower != null).length);
  assert.equal(await page.locator('#ranksvg .mk circle').count(), 3);
  // The caveat and the source beside it.
  const cap = await page.textContent('#rankcap');
  assert.match(cap, new RegExp(`Control of corruption, ${y}`));
  assert.match(cap, /perceptions of governance, drawn from many surveys and expert assessments, not a measure of democracy/);
  assert.match(cap, /0 to 100 governance score/);
  assert.match(cap, /not the estimate of about −2\.5 to 2\.5/);
  assert.match(cap, /where two countries’ ranges overlap, the data cannot tell them apart/);
  assert.match(cap, /GOV_WGI_CC\.SC, GOV_WGI_CC\.SC_LB and GOV_WGI_CC\.SC_UB \(CC BY 4\.0\)/);
  // What is ranked, said as it is: the countries on the page's list, and the economies the Bank scores that it leaves out.
  const out = G.outsideIn(layer(CC), y);
  assert.ok(out.length > 0);
  assert.ok(cap.includes(`every one of the ${list.length} countries on this page’s list that the World Bank scores (the Bank scores ${list.length + out.length} economies that year;`), cap);
  assert.match(cap, /Taiwan, China/);
  assert.ok(!/every country the World Bank scores/.test(cap));
  assert.match(cap, /ranges stop at 0 and 100, the ends of the scale/);
  assert.match(cap, /not meant as a definitive ranking of how well governments perform \(its WGI Usage Advisory\)/);
  // Each compared country's rank and range, as the data gives them; each pair's overlap, as the data decides it.
  const say = await page.textContent('#ranksay');
  for (const iso of ['IRL', 'GBR', 'DNK']) {
    assert.ok(say.includes(`${NAMES.get(iso)} is ${G.ordinal(at(iso).rank)} of the ${list.length} ranked here, with ${words(at(iso))}`), `${iso} in: ${say}`);
    const sp = G.rankSpan(list, iso);
    assert.ok(say.includes(sp.from === sp.to ? `anywhere within its range it would still rank ${G.ordinal(sp.from)}` : `anywhere within its range it would rank between ${G.ordinal(sp.from)} and ${G.ordinal(sp.to)}`), `${iso}: ${JSON.stringify(sp)} in ${say}`);
  }
  // Plain English: "the United Kingdom", with no possessive on a name.
  assert.match(say, /The United Kingdom is \d+(st|nd|rd|th) of the/);
  for (const [a, b] of [['IRL', 'GBR'], ['IRL', 'DNK'], ['GBR', 'DNK']]) {
    const o = G.overlaps(at(a), at(b)), pair = await page.textContent(`#ranksay [data-pair="${a},${b}"]`);
    const the = iso => (iso === 'GBR' ? 'the ' : '') + NAMES.get(iso);
    assert.ok(pair.startsWith(`The ranges of ${the(a)} and ${the(b)} ${o ? 'overlap: the data cannot tell them apart' : 'do not overlap'}`), `${a} and ${b}: ${pair}`);
  }
  assert.equal(await page.textContent('label:has(#rankind) .prp-label'), 'Ranked, each with its range');
  // The text alternative: every country, with the same figures.
  await page.click('#rankdt summary');
  await page.waitForSelector('#rankdata tbody tr');
  assert.equal(await page.locator('#rankdata tbody tr').count(), list.length);
  for (const iso of ['IRL', 'GBR', 'DNK']) {
    const cells = await page.$$eval(`#rankdata tr[data-iso="${iso}"] td`, tds => tds.map(td => td.textContent));
    const x = at(iso);
    assert.deepEqual(cells, [String(x.rank), `${NAMES.get(iso)} (compared)`, x.score.toFixed(1), `${x.lower.toFixed(1)}–${x.upper.toFixed(1)}`]);
  }
  // By keyboard: a slider; the arrow keys step through the ranking, the line under it shows the country, and the
  // slider's own value text carries the same words to a screen reader (no live region repeats it on every redraw).
  const sv = () => page.$eval('#ranksvg', s => ({ role: s.getAttribute('role'), min: s.getAttribute('aria-valuemin'), max: s.getAttribute('aria-valuemax'), now: s.getAttribute('aria-valuenow'), text: s.getAttribute('aria-valuetext'), label: s.getAttribute('aria-label') }));
  assert.equal(await page.$eval('#rankread', p => p.getAttribute('aria-live')), null);
  await page.focus('#ranksvg');
  await page.keyboard.press('Home');
  const read = await page.textContent('#rankread');
  assert.match(read, new RegExp(`^1st of the ${list.length} ranked here: ${NAMES.get(list[0].iso3)}, ${words(list[0]).replace(/[()]/g, '\\$&')}`));
  let s = await sv();
  assert.deepEqual([s.role, s.min, s.max, s.now, s.text], ['slider', '1', String(list.at(-1).rank), '1', read]);
  assert.match(s.label, /Home, End, Page Up and Page Down jump/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('#rankread'), new RegExp(`of the ${list.length} ranked here: ${NAMES.get(list[1].iso3)},`));
  await page.keyboard.press('End');
  s = await sv();
  assert.equal(s.now, String(list.at(-1).rank));
  assert.equal(s.text, await page.textContent('#rankread'));
  assert.deepEqual(errors, []);
});

test('page: a year before the indicators begin gives no ranking, and the caption says only that', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  await open('#compare=SOM,VEN,SGP&year=1990');
  await page.waitForFunction(() => /no ranking for 1990/.test(document.querySelector('#rankcap')?.textContent || ''), null, { timeout: 30000 });
  const cap = await page.textContent('#rankcap');
  assert.match(cap, /The governance indicators begin in 1996, so there is no ranking for 1990\./);
  assert.match(cap, /not a measure of democracy/);
  assert.match(cap, /CC BY 4\.0/);
  assert.ok(!/each a dot|best on the left|countries on this page’s list/.test(cap), cap);
  assert.match(await page.textContent('#ranksvg'), /No scores for this year/);
  assert.deepEqual(errors, []);
});

test('page: a country with a score but no range shows the score alone, and the pair sentence names it, not one whose range starts at 0', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  const GE = 'GOV_WGI_GE.EST', L = layer(GE), y = NEWEST(GE), j = L.years.indexOf(y), k = L.countries.indexOf('IRL');
  const sk = L.countries.indexOf('SSD');
  if (!newerRelease(GE)) assert.equal(L.values[sk][j][1], 0, 'South Sudan\'s range starts at 0.0 in the newest year (GOV_WGI_GE.SC_LB)');
  // The real file, with Ireland's newest cell cut to its score alone.
  const cut = structuredClone(L); cut.values[k][j] = [L.values[k][j][0]];
  await page.route('**/national/data/governance/GOV_WGI_GE.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cut) }));
  await open('#compare=SSD,IRL');
  await page.waitForSelector('#ranksvg .mk circle', { timeout: 30000 });
  await page.selectOption('#cmpind', `range:${GE}`);
  await page.waitForFunction(() => /GOV_WGI_GE\.SC,/.test(document.querySelector('#rankcap')?.textContent || ''), null, { timeout: 20000 });
  await page.waitForSelector('#ranksay [data-pair="SSD,IRL"]');
  const score = L.values[k][j][0].toFixed(1);
  assert.match(await page.textContent('#ranksay [data-iso="IRL"]'), /the Bank gives a score but no range for it that year, so it is shown as the score alone/);
  assert.equal(await page.textContent('#ranksay [data-pair="SSD,IRL"]'), 'Whether the ranges of South Sudan and Ireland overlap cannot be said: the Bank gives a score with no range for Ireland.');
  await page.click('#cmpdt summary');
  await page.waitForSelector('#cmpdata tbody tr');
  const cells = await page.$$eval('#cmpdata tbody tr', (rs, y) => [...rs.find(r => r.firstElementChild.textContent === String(y)).querySelectorAll('td.num')].map(td => td.textContent), y);
  assert.equal(cells[1], `${score} (no range)`);
  assert.match(await page.textContent('#cmpcap'), new RegExp(`Ireland: a score but no range in ${y}, shown as the score alone`));
  await page.click('#rankdt summary');
  await page.waitForSelector('#rankdata tr[data-iso="IRL"]');
  assert.equal(await page.textContent('#rankdata tr[data-iso="IRL"] td:last-child'), 'none given');
  assert.deepEqual(errors, []);
});

test('page at 390 px: the compared countries\' names sit by their own ranges, or are joined to them by a leader line, and never overlap', pageTest, async t => {
  const { page, errors, open } = await govPage(t, 390, 'dark');
  await open('#compare=SOM,VEN,SGP');
  await page.waitForSelector('#ranksvg .mk circle', { timeout: 30000 });
  await page.selectOption('#rankind', 'GOV_WGI_VA.EST');
  await page.waitForFunction(() => /GOV_WGI_VA\.SC,/.test(document.querySelector('#rankcap')?.textContent || ''), null, { timeout: 20000 });
  const marks = await page.$$eval('#ranksvg .mk g[data-iso]', gs => gs.map(g => {
    const t = g.querySelector('text.lbl').getBBox(), top = Math.min(...[...g.querySelectorAll('line.iv-mk, circle')].map(e => e.getBBox().y)), lead = g.querySelector('line.lead');
    return { iso: g.dataset.iso, box: { x: t.x, y: t.y, w: t.width, h: t.height }, top, lead: lead ? { y1: +lead.getAttribute('y1'), y2: +lead.getAttribute('y2') } : null };
  }));
  assert.equal(marks.length, 3);
  for (const m of marks) {
    const gap = m.top - (m.box.y + m.box.h);
    if (m.lead) assert.ok(m.lead.y1 <= m.box.y + m.box.h + 4 && m.lead.y2 >= m.top - 3, `${m.iso}: the leader joins its name to its range ${JSON.stringify(m)}`);
    else assert.ok(gap >= -2 && gap <= 12, `${m.iso}: the name sits just above its own range (${gap} px) ${JSON.stringify(m)}`);
  }
  for (let a = 0; a < marks.length; a++) for (let b = a + 1; b < marks.length; b++) {
    const A = marks[a].box, B = marks[b].box;
    assert.ok(!(A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h), `${marks[a].iso} and ${marks[b].iso} overlap`);
  }
  assert.deepEqual(errors, []);
});

test('page: the Compare chart\'s score and range, its caption, and its table hold the same figures as the data', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  const CC = 'GOV_WGI_CC.EST', L = layer(CC), cell = (iso, yr) => { const x = G.rangeAt(L, L.countries.indexOf(iso), yr); return `${x.score.toFixed(1)} (${x.lower.toFixed(1)}–${x.upper.toFixed(1)})`; };
  await open('#compare=IRL,GBR,DNK');
  await page.waitForSelector('#cmpsvg path[stroke-width="2"]', { timeout: 30000 });
  // The default chart is as before: the first indicator's estimate, no band.
  assert.equal(await page.locator('#cmpsvg .rband').count(), 0);
  await page.selectOption('#cmpind', `range:${CC}`);
  await page.waitForFunction(() => document.querySelectorAll('#cmpsvg .rband').length === 3, null, { timeout: 20000 });
  const cap = await page.textContent('#cmpcap');
  assert.match(cap, /the World Bank’s governance score, 0 to 100/);
  assert.match(cap, /moves from the estimate \(about −2\.5 to 2\.5\)/);
  assert.match(cap, /not a measure of democracy/);
  assert.match(cap, /cannot tell them apart/);
  assert.match(cap, /\(CC BY 4\.0\)/);
  assert.match(cap, /ranges stop at 0 and 100, the ends of the scale/);
  assert.match(cap, /The line and band join the years that have a value: the indicators were published every two years until 2002 \(1996, 1998 and 2000\), then every year\./);
  // The axis runs the whole scale, 0 to 100, as the ranking's does, whatever the countries' figures.
  const ticks = await page.$$eval('#cmpsvg .axis text', ts => ts.map(t => t.textContent));
  assert.ok(ticks.includes('0') && ticks.includes('100'), ticks.join(' '));
  // The ranking follows the chart's choice.
  assert.equal(await page.$eval('#rankind', s => s.value), CC);
  await page.click('#cmpdt summary');
  await page.waitForSelector('#cmpdata tbody tr');
  const heads = await page.$$eval('#cmpdata thead th', ths => ths.map(th => th.textContent));
  assert.deepEqual(heads, ['Year', 'Ireland', 'United Kingdom', 'Denmark']);
  for (const yr of [2024, 2010, 1996]) {
    const cells = await page.$$eval('#cmpdata tbody tr', (rs, yr) => [...rs.find(r => r.firstElementChild.textContent === String(yr)).querySelectorAll('td.num')].map(td => td.textContent), yr);
    assert.deepEqual(cells, ['IRL', 'GBR', 'DNK'].map(iso => cell(iso, yr)), String(yr));
  }
  // 2024 as read from the World Bank's API (the header of this file).
  if (!newerRelease(CC)) assert.deepEqual(['IRL', 'GBR', 'DNK'].map(iso => cell(iso, 2024)), ['79.4 (74.1–84.7)', '77.9 (72.2–83.6)', '94.0 (88.7–99.4)']);
  assert.deepEqual(errors, []);
});

test('page: a profile\'s governance rows draw the score with its range, give its figures in words, and say what they are', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  await open('#country=IRL');
  await page.waitForSelector('#profile .ind[data-code="GOV_WGI_CC.EST"] .gsc', { timeout: 30000 });
  for (const g of GOVERNANCE) {
    const L = layer(g.est), y = L.years.at(-1), x = G.rangeAt(L, L.countries.indexOf('IRL'), y);
    assert.equal(await page.locator(`#profile .ind[data-code="${g.est}"] svg.spark[data-range] path.rband`).count(), 1, g.est);
    assert.match(await page.textContent(`#profile .ind[data-code="${g.est}"] .gsc`), new RegExp(`World Bank score, ${y}: ${words(x).replace(/[()]/g, '\\$&')}`), g.est);
  }
  const note = await page.textContent('#govnote');
  assert.match(note, /not a measure of democracy/);
  assert.match(note, /0 to 100 governance score/);
  assert.match(note, /CC BY 4\.0/);
  assert.match(note, /ranges stop at 0 and 100, the ends of the scale/);
  assert.match(await page.innerText('#govnote'), /the small line beside it, with its range shaded/, 'at 1440 px the line is drawn, and the note says so');
  const method = await page.textContent('#govmethod');
  assert.match(method, /GOV_WGI_xx\.SC_LB/);
  assert.match(method, /the small lines in a profile’s governance rows, the “score and range” choices of the Compare countries chart, and the ranking under it/);
  assert.match(method, /to one decimal, the precision the World Bank’s API gives for these series/);
  assert.match(method, /ranges stop at 0 and 100/);
  assert.match(method, /Usage Advisory/);
  assert.match(method, /the Bank also scores a few economies the list leaves out/);
  assert.deepEqual(errors, []);
});

test('page: a year the Bank published none shows the year before and says so; files that fail say so and keep the estimate', pageTest, async t => {
  const { page, errors, open } = await govPage(t);
  await open('#compare=IRL,GBR&year=1997');
  await page.waitForFunction(() => /1996/.test(document.querySelector('#rankcap')?.textContent || ''), null, { timeout: 30000 });
  assert.match(await page.textContent('#rankcap'), /published no scores for 1997, so this is 1996/);
  await page.route('**/national/data/governance/**', r => r.fulfill({ status: 404, body: 'gone' }));
  await open('#country=FRA');
  await page.waitForSelector('#govnote', { timeout: 30000 });
  assert.match(await page.textContent('#govnote'), /could not load, so the governance rows show the estimate alone/);
  assert.equal(await page.locator('#profile svg.spark[data-range]').count(), 0);
  assert.ok(await page.locator('#profile .ind[data-code="GOV_WGI_CC.EST"] svg.spark path').count() > 0, 'the estimate\'s sparkline, as before');
  await open('#compare=FRA,DEU');
  await page.waitForFunction(() => /could not load/.test(document.querySelector('#ranksay')?.textContent || ''), null, { timeout: 30000 });
  await page.selectOption('#cmpind', 'range:GOV_WGI_CC.EST');
  await page.waitForFunction(() => /could not load/.test(document.querySelector('#cmpcap')?.textContent || ''), null, { timeout: 20000 });
  assert.deepEqual(errors, []);
});

const themed = new Map(); // scheme → the colours read (the light test, last, compares them with the dark)
for (const [width, scheme] of [[390, 'dark'], [1440, 'dark'], [390, 'light']]) {
  test(`page at ${width} px, ${scheme}: the pictures fit, nothing scrolls sideways, no page errors`, pageTest, async t => {
    const { page, errors, open } = await govPage(t, width, scheme);
    await open('#compare=IRL,GBR,DNK');
    await page.waitForSelector('#ranksvg .mk circle', { timeout: 30000 });
    await page.selectOption('#cmpind', 'range:GOV_WGI_VA.EST');
    await page.waitForSelector('#cmpsvg .rband', { timeout: 20000 });
    const fit = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: innerWidth, rank: document.querySelector('#ranksvg').getBoundingClientRect().right, chart: document.querySelector('#cmpsvg').getBoundingClientRect().right }));
    assert.ok(fit.page <= fit.view + 1, `page ${fit.page} in ${fit.view}`);
    assert.ok(fit.rank <= fit.view && fit.chart <= fit.view, JSON.stringify(fit));
    // The band and the marks are drawn in the theme's colours: the dots in the theme's own muted token, read in the same page.
    const fills = await page.evaluate(() => {
      const probe = document.createElement('i'); probe.style.color = 'var(--prp-muted)'; document.body.append(probe);
      const muted = getComputedStyle(probe).color; probe.remove();
      return { band: getComputedStyle(document.querySelector('#cmpsvg .rband')).fill, bg: getComputedStyle(document.body).backgroundColor, dot: getComputedStyle(document.querySelector('#ranksvg .dot')).fill, muted };
    });
    assert.notEqual(fills.band, fills.bg);
    assert.equal(fills.dot, fills.muted);
    themed.set(scheme, fills);
    if (themed.has('light') && themed.has('dark')) {
      assert.notEqual(themed.get('light').muted, themed.get('dark').muted, 'the light and dark themes give the dots different colours');
      assert.notEqual(themed.get('light').bg, themed.get('dark').bg);
    }
    await open('#country=IRL');
    await page.waitForSelector('#profile .gsc', { timeout: 30000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // On a phone the small lines are hidden, and the note does not promise them.
    if (width <= 700) assert.ok(!/small line/.test(await page.innerText('#govnote')), await page.innerText('#govnote'));
    assert.deepEqual(errors, []);
  });
}
