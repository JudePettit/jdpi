// Addition HD-13 (25 November 2026; rank 1 of VM-VISUALISATION-STUDY.md): the Retrospective Battlefield's two charts
// above the table, conflicts by type each year from 1946 and UCDP's battle deaths with their range from 1989
// (battlefield/history/trends.js, trends.css, index.html, app.js).
// The pinned figures were counted today straight from UCDP's own files, the ones the data files name by sha256:
//   UcdpPrioConflict_v26_1.csv (2aea044f…5447): rows per year by type_of_conflict;
//   BattleDeaths_v26_1_conf.csv (b34ecb57…1147): bd_best, bd_low and bd_high summed by year.
// The unit tests read the data files and the module; the page tests run against JDPI_URL
// (JDPI_URL=http://localhost:<port> node --test tests/addition-conflict-trend.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const root = new URL('../', import.meta.url);
const json = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const text = p => readFile(new URL(p, root), 'utf8');
const T = await import(new URL('battlefield/history/trends.js', root)).catch(() => ({}));

// UCDP/PRIO ACD v26.1, conflicts by type_of_conflict (1 colonial, 2 interstate, 3 civil, 4 internationalised civil).
const ACD = {
  1946: { 1: 5, 2: 2, 3: 8, 4: 2, all: 17 },
  1991: { 1: 0, 2: 2, 3: 49, 4: 2, all: 53 },
  2024: { 1: 0, 2: 4, 3: 36, 4: 19, all: 59 },
  2025: { 1: 0, 2: 8, 3: 35, 4: 22, all: 65 },
};
// UCDP BRD v26.1, conflict level, summed by year: best, low, high.
const BRD = { 1989: [55667, 51133, 85681], 1991: [70355, 68111, 91419], 2022: [284981, 255298, 378706], 2025: [153643, 141388, 237196] };
const gb = n => n.toLocaleString('en-GB');

test('trend data: each year’s conflicts by the type UCDP gives them that year, from 1946; 1926–1945 uncoded, never zero', async () => {
  assert.equal(typeof T.typeCounts, 'function', 'trends.js exports typeCounts');
  const data = await json('battlefield/history/data/wars.json');
  const rows = T.typeCounts(data);
  assert.equal(rows.length, data.lastYear - data.firstYear + 1);
  assert.equal(rows[0].year, 1926); assert.equal(rows.at(-1).year, 2025);
  for (const [y, c] of Object.entries(ACD)) {
    const r = rows.find(x => x.year === +y);
    assert.ok(r.coded, `${y} is coded`);
    assert.deepEqual(r.counts, { 3: c[3], 4: c[4], 2: c[2], 1: c[1] }, `${y}: the counts of UCDP’s file`);
    assert.equal(r.total, c.all, `${y}: all conflicts`);
  }
  // 2024 counted by each conflict's last-year type would give 34 civil and 21 internationalised: the year's own type
  // gives UCDP's 36 and 19 (build 2's correction, battlefield-history-2).
  const lastYearRule = {};
  for (const w of data.wars) if (w.src === 'ucdp' && w.years.some(([y]) => y === 2024)) lastYearRule[w.type] = (lastYearRule[w.type] || 0) + 1;
  assert.equal(lastYearRule['Civil conflict'], 34, 'the old rule’s figure, for contrast');
  assert.equal(rows.find(x => x.year === 2024).counts[3], 36);
  // Every UCDP conflict-year is counted once: 2,816 rows in ACD v26.1.
  assert.equal(rows.filter(r => r.coded).reduce((s, r) => s + r.total, 0), 2816);
  for (const r of rows.filter(x => x.year < 1946)) {
    assert.equal(r.coded, false, `${r.year} is not coded`);
    assert.equal(r.counts, null, `${r.year}: no counts, not zeros`);
    assert.equal(r.total, null);
    assert.ok(r.listed > 0, `${r.year}: the wars on VM’s list are counted apart`);
  }
  assert.equal(rows.find(r => r.year === 1939).listed, 9);
  // A conflict whose type changed is counted under each year's own (Cuba, u242: civil in 1953, internationalised in 1961).
  const cuba = { firstYear: 1950, ucdpFrom: 1950, lastYear: 1961, types: data.types, wars: [{ id: 'u242', src: 'ucdp', type: 'Internationalised civil conflict', years: [[1953, 1, 3], [1961, 1, 4]] }] };
  const cr = T.typeCounts(cuba);
  assert.equal(cr.find(r => r.year === 1953).counts[3], 1); assert.equal(cr.find(r => r.year === 1953).counts[4], 0);
  assert.equal(cr.find(r => r.year === 1961).counts[4], 1);
});

test('trend data: battle deaths each year from 1989, best in its band from low to high; a missing year is a gap, not zero', async () => {
  assert.equal(typeof T.deathsSeries, 'function', 'trends.js exports deathsSeries');
  const layer = await json('omni/data/layers/conflict-territory/conflicts.json');
  const s = T.deathsSeries(layer);
  assert.equal(s[0].year, 1989, 'the first year UCDP’s free series gives');
  assert.equal(s.at(-1).year, 2025);
  assert.equal(s.length, 37);
  for (const [y, [best, low, high]] of Object.entries(BRD)) {
    const d = s.find(x => x.year === +y);
    assert.deepEqual([d.best, d.low, d.high], [best, low, high], `${y}: UCDP BRD v26.1 summed`);
    assert.equal(d.without, 0, `${y}: every conflict has a figure`);
  }
  const b = T.seriesBounds(T.typeCounts(await json('battlefield/history/data/wars.json')), s);
  assert.deepEqual([b.typesFrom, b.typesTo, b.deathsFrom, b.deathsTo], [1946, 2025, 1989, 2025]);
  assert.equal(b.maxHigh, 378706, '2022’s high is the largest');
  assert.equal(b.maxTotal, 65);
  assert.ok(b.ordered, 'low ≤ best ≤ high every year');
  // A year the layer does not hold, and a conflict with no figure.
  const toy = { to: 1992, years: { 1988: { c: { 1: [1] } }, 1989: { c: { 1: [1, 30, 25, 40], 2: [2, 1000, 900, 1500] } }, 1991: { c: { 1: [1] } }, 1992: { c: { 1: [1, 50, 50, 60], 2: [1] } } } };
  const ts = T.deathsSeries(toy);
  assert.deepEqual(ts.map(d => d.year), [1989, 1990, 1991, 1992]);
  assert.deepEqual(ts[0], { year: 1989, best: 1030, low: 925, high: 1540, n: 2, without: 0 });
  assert.equal(ts[1].best, null, '1990, not held: a gap');
  assert.equal(ts[2].best, null, '1991, no conflict with a figure: a gap');
  assert.deepEqual([ts[3].best, ts[3].without], [50, 1]);
  assert.deepEqual(T.periodDeaths(s, 1985, 1989), { from: 1989, to: 1989, best: 55667, low: 51133, high: 85681 });
  assert.equal(T.periodDeaths(s, 1950, 1980), null);
  // In words (after review, 26 November): a year before 1989 says UCDP's series starts then (PRIO's free 1946–2008
  // series exists, so "no free figure" would be wrong); a year before 1946 says what VM's list lacks, not that
  // Wikidata gives no type; a period wholly before 1989 still gives a figure, its distinct conflicts (UcdpPrioConflict
  // v26_1.csv, distinct conflict_id: 96 in 1960–75, 108 in 1990–2000, 40 in 1946–50).
  const data = await json('battlefield/history/data/wars.json'), counts = T.typeCounts(data);
  assert.equal(T.yearSentence(1975, counts, s), '1975: 30 armed conflicts (24 civil, 4 internationalised civil, 2 interstate); UCDP’s battle-death series starts in 1989.');
  assert.equal(T.yearSentence(1939, counts, s), '1939: types not coded; 9 wars on VM’s list from Wikidata, with no UCDP type and no battle-death figure.');
  assert.doesNotMatch(T.yearSentence(1975, counts, s) + T.yearSentence(1939, counts, s), /no free/);
  assert.deepEqual(T.periodConflicts(data, 1960, 1975), { ucdp: 96, listed: 0 });
  assert.equal(T.periodSentence(data, s, 1960, 1975), 'Shaded, 1960–1975: 96 armed conflicts.');
  assert.equal(T.periodSentence(data, s, 1990, 2000), 'Shaded, 1990–2000: 108 armed conflicts; 593,942 battle deaths in all (low 572,271, high 790,439).');
  assert.match(T.periodSentence(data, s, 1930, 1950), /^Shaded, 1930–1950: \d+ wars on VM’s list to 1945 and 40 armed conflicts in UCDP’s record from 1946\.$/);
  // With no layer, a period says nothing about deaths rather than a fragment.
  assert.equal(T.periodSentence(data, [], 1960, 1975), 'Shaded, 1960–1975: 96 armed conflicts.');
  // The Omni-Map layer and wars.json end in the same year, so Figure 3 and Figure 2 end together; when a refresh moves
  // one, this fails until the other follows.
  assert.equal(layer.to, data.lastYear, 'the deaths layer ends where wars.json ends');
});

test('trend sources: the versions the data files name, with their licences, beside the charts; the Method gains a paragraph', async () => {
  const data = await json('battlefield/history/data/wars.json'), layer = await json('omni/data/layers/conflict-territory/conflicts.json');
  assert.equal(T.versionOf(data.files['ucdp-acd'].file), '26.1');
  assert.equal(T.versionOf(layer.files['ucdp-brd'].file), '26.1');
  const html = await text('battlefield/history/index.html');
  const src = (html.match(/<p class="trends-src"[^>]*>([\s\S]*?)<\/p>/)?.[1] || '').replace(/<[^>]+>/g, '');
  assert.match(src, /UCDP\/PRIO Armed Conflict Dataset v26\.1/);
  assert.match(src, /UCDP Battle-Related Deaths Dataset v26\.1/);
  assert.match(src, /CC BY 4\.0/); assert.match(src, /Wikidata \(CC0\)/);
  // UCDP's licence asks for the dataset's publication: for BRD v26.1, Davies, Pettersson & Öberg 2026
  // (ucdp.uu.se/downloads, read 25 November 2026).
  assert.match(src, /both cited as Davies, Pettersson &amp; Öberg 2026/);
  assert.match(html, /UCDP Battle-Related Deaths Dataset v26\.1 \(conflict level; Davies, Pettersson &amp; Öberg 2026\)/);
  // The years and versions beside the charts are those of the data (and trends.js writes them from it at mount).
  const s = T.deathsSeries(layer), span = `${s[0].year}–${s.at(-1).year}`, brd = `v${T.versionOf(layer.files['ucdp-brd'].file)}`;
  for (const [k, v] of [['brd-span', span], ['brd-v', brd], ['acd-v', `v${T.versionOf(data.files['ucdp-acd'].file)}`], ['acd-span', `${data.ucdpFrom}–${data.lastYear}`]]) {
    const all = [...html.matchAll(new RegExp(`data-trend="${k}">([^<]*)<`, 'g'))].map(m => m[1]);
    assert.ok(all.length > 0, `${k} is marked`);
    for (const t of all) assert.equal(t, v, `${k}: the page's text is the data's`);
  }
  assert.ok(html.includes(`the battle deaths of the chart above the table, ${span}: UCDP Battle-Related Deaths Dataset ${brd}`), 'the footer gives the data’s years and version');
  assert.doesNotMatch(html.slice(html.indexOf('id="trends"'), html.indexOf('class="prp-panel tablepanel"')), /no free battle-death/);
  const cav = html.match(/<p class="trends-caveat"[^>]*>([\s\S]*?)<\/p>/)?.[1] || '';
  assert.match(cav, /battle deaths in state-based conflicts only, and only from 1989/);
  assert.match(cav, /one-sided violence/); assert.match(cav, /non-state violence/);
  assert.match(cav, /stacked from 1946; 1926–1945 is not coded, since UCDP’s coding starts in 1946 and Wikidata names each war of those years only by its kind/);
  assert.doesNotMatch(cav, /Wikidata gives no type/, 'Wikidata does give a kind (war, civil war, revolt): what it lacks is UCDP’s coding');
  assert.match(cav, /a conflict of 25 deaths counts the same as a world war/);
  assert.match(html, /<p><b>Method: the charts above the table\.<\/b>/);
  // VM's names for the types, with UCDP's own (the ACD v26.1 codebook, type_of_conflict: 1 extrasystemic,
  // 2 interstate, 3 intrastate, 4 internationalized intrastate; read 26 November 2026).
  assert.match(html, /civil \(UCDP’s intrastate\), internationalised civil \(internationalised intrastate\), interstate, or colonial \(extrasystemic\), stacked from the bottom in that order/);
  assert.match(html, /<figcaption><b>Figure 2\.<\/b> Armed conflicts each year, by type as UCDP codes it, stacked from the bottom: civil, internationalised civil, interstate, colonial\./);
  assert.match(html, /<figcaption><b>Figure 3\.<\/b> Battle deaths each year, <span data-trend="brd-span">[^<]+<\/span>, on a time scale of its own/);
  assert.match(html, /<li class="trend-key-order">From the bottom:<\/li><li><span class="sw t3"><\/span>Civil<\/li><li><span class="sw t4"><\/span>Internationalised civil<\/li><li><span class="sw t2"><\/span>Interstate<\/li><li><span class="sw t1"><\/span>Colonial<\/li>/, 'the key runs in stacking order and says so');
  assert.match(html, /Sources\.<\/b>[^<]*<a [^>]*>ucdp\.uu\.se\/downloads<\/a>\); the battle deaths of the chart above the table, 1989–2025: UCDP Battle-Related Deaths Dataset v26\.1/);
  // The charts sit in the table view, above its table; the page's own d3 draws them, and no new library is loaded.
  const view = html.slice(html.indexOf('id="view-table"'), html.indexOf('class="prp-panel tablepanel"'));
  assert.match(view, /id="trends"/);
  assert.equal((html.match(/<script [^>]*src="https?:/g) || []).length, 1, 'd3 is the only script from a CDN, as before');
  assert.match(html, /<link rel="stylesheet" href="trends\.css">/);
  assert.doesNotMatch(await text('battlefield/history/trends.css'), /#[0-9a-f]{3,6}\b/i, 'colours are tokens only');
});

test('trend colours and roles: the four types are blue, amber, pink and green; each chart is a slider; one live region', async () => {
  // design/prp.css categorical tokens: cat-1 #2a78d6/#3987e5, cat-4 #eda100/#c98500, cat-5 #e87ba4/#d55181,
  // cat-6 #008300. The dataviz validator (validate_palette.js --pairs all, light on #ffffff and dark on #161b22)
  // passes this set on every pair; cat-1 with cat-7 (the old internationalised colour) fails it (protan ΔE 1.9 dark).
  const css = await text('battlefield/history/trends.css');
  const v = Object.fromEntries([...css.matchAll(/--t-(\w+): var\(--prp-cat-(\d)\)/g)].map(m => [m[1], +m[2]]));
  assert.deepEqual(v, { civil: 1, intl: 4, inter: 5, colonial: 6 });
  const html = await text('battlefield/history/index.html');
  assert.match(html, /<svg id="trend-types-svg" tabindex="0" role="slider"[^>]*aria-labelledby="trend-types-label"/);
  assert.match(html, /<svg id="trend-deaths-svg" tabindex="0" role="slider"[^>]*aria-labelledby="trend-deaths-label"/);
  assert.match(html, /<p class="trends-readout" id="trends-readout">/, 'the visible readout is not a live region');
  assert.match(html, /<p class="trends-live" id="trends-live" aria-live="polite"><\/p>/);
  assert.match(html, /<p class="trends-nodeaths" id="trends-nodeaths" hidden>/);
});

test('trend layout: trends.css repeats styles.css’s two screen heights, and they agree', async () => {
  // trends.css grows the one-screen page by the charts' height while the table view shows, and so must start from
  // styles.css's heights (another build's file): a change to one fails here until the other follows.
  const css = await text('battlefield/history/trends.css'), base = await text('battlefield/history/styles.css');
  const plain = base.match(/^\.screen \{[^}]*height: ([^;}]+)/m)?.[1].trim(), bar = base.match(/^\.jdpi-returnbar \+ \.screen \{[^}]*height: ([^;}]+)/m)?.[1].trim();
  assert.ok(plain && bar, 'styles.css gives both heights');
  const tPlain = css.match(/^\s*\.screen:has\(#view-table:not\(\[hidden\]\)\) \{ height: calc\((.+) \+ var\(--trends-room, 0px\)\); \}/m)?.[1];
  const tBar = css.match(/^\s*\.jdpi-returnbar \+ \.screen:has\(#view-table:not\(\[hidden\]\)\) \{ height: calc\((.+) \+ var\(--trends-room, 0px\)\); \}/m)?.[1];
  assert.equal(tPlain, plain); assert.equal(tBar, bar);
});

/* ---------------------------------------------------------------- page tests */
async function openTable(page, hash) {
  await page.goto(`${BASE}/battlefield/history/#${hash}&v=table`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#trend-types-svg g.bars rect').length > 100 && document.querySelectorAll('#trends-rows tr').length === 100, null, { timeout: 30000 });
}
const barFigures = (page, y) => page.evaluate(y => Object.fromEntries([...document.querySelectorAll(`#trend-types-svg g.bars rect[data-year="${y}"]`)].map(r => [r.dataset.type, +r.dataset.n])), y);
const rowFigures = (page, y) => page.evaluate(y => {
  const tr = document.querySelector(`#trends-rows tr[data-year="${y}"]`);
  return Object.fromEntries([...tr.querySelectorAll('td')].map(td => [td.dataset.type || td.dataset.k || 'other', td.textContent]));
}, y);

test('page: the charts stand above the table with UCDP’s figures for 1946, 1991 and 2025, the caveat and the sources; no errors at 1440 px', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // The map view first, as a reader opens the page: its frame is measured, to compare after the table view.
    await page.goto(`${BASE}/battlefield/history/#y=1991`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#map path.shape').length > 50, null, { timeout: 30000 });
    const frame = () => page.evaluate(() => ['.map-wrap', '#view-map', '#panel', 'footer.sources'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.height)]; }));
    await page.waitForSelector('.jdpi-returnbar', { timeout: 10000 }).catch(() => {});
    // Once the page has settled (design/prp-bar.js puts its return bar over the page a moment after the load).
    let before = await frame();
    for (let k = 0; k < 20; k++) { await page.waitForTimeout(300); const now = await frame(); if (JSON.stringify(now) === JSON.stringify(before)) break; before = now; }
    assert.equal(await page.locator('#trends').isVisible(), false, 'the charts are not in the map view');
    await openTable(page, 'y=1991');
    for (const y of [1946, 1991, 2025]) {
      const c = ACD[y];
      assert.deepEqual(await barFigures(page, y), { 1: c[1], 2: c[2], 3: c[3], 4: c[4] }, `${y}: the bars`);
      const row = await rowFigures(page, y);
      assert.deepEqual([row[3], row[4], row[2], row[1], row.total], [c[3], c[4], c[2], c[1], c.all].map(String), `${y}: the table`);
    }
    for (const [y, [best, low, high]] of Object.entries(BRD)) {
      const pt = await page.evaluate(y => { const c = document.querySelector(`#trend-deaths-svg g.pts circle[data-year="${y}"]`); return c && [+c.dataset.best, +c.dataset.low, +c.dataset.high]; }, y);
      assert.deepEqual(pt, [best, low, high], `${y}: the line and band`);
      const row = await rowFigures(page, y);
      assert.deepEqual([row.best, row.low, row.high], [gb(best), gb(low), gb(high)], `${y}: the table`);
    }
    // 1926–1945: one strip that says the types are not coded, and the table says it of every year; no bar there.
    assert.equal(await page.locator('#trend-types-svg g.uncoded text').textContent(), 'Not coded');
    assert.equal(await page.locator('#trend-types-svg g.bars rect[data-year="1939"]').count(), 0);
    assert.match(await page.locator('#trends-rows tr[data-year="1939"]').textContent(), /Not coded \(9 wars on VM’s list from Wikidata\)/);
    assert.match(await page.locator('#trends-rows tr[data-year="1960"]').textContent(), /–/);
    // The readout gives the year shown in words, with the same figures.
    assert.equal(await page.locator('#trends-readout').textContent(), '1991: 53 armed conflicts (49 civil, 2 internationalised civil, 2 interstate); 70,355 battle deaths, UCDP’s best estimate (low 68,111, high 91,419).');
    assert.match(await page.locator('#trends-caveat').innerText(), /state-based conflicts only, and only from 1989/);
    assert.match(await page.locator('#trends-src').innerText(), /UCDP\/PRIO Armed Conflict Dataset v26\.1.*UCDP Battle-Related Deaths Dataset v26\.1.*CC BY 4\.0.*Wikidata \(CC0\)/s);
    // Above the table, and the table keeps its room: the page grows by the charts' height.
    const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { trends: r('#trends'), panel: r('.tablepanel'), view: r('#view-table'), sw: document.documentElement.scrollWidth, w: innerWidth }; });
    assert.ok(g.trends.bottom <= g.panel.top, 'the charts sit above the table');
    // The table and the note under it keep the cell they had (499 px at 1440 × 900 before the charts).
    assert.ok(g.view.bottom - g.panel.top >= 480, `the table keeps its room (${g.view.bottom - g.panel.top} px)`);
    assert.ok(g.sw <= g.w, 'no sideways scroll');
    // The map view is as it was: the charts are not in it.
    await page.locator('#tab-map').click();
    await page.waitForFunction(() => !document.querySelector('#view-map').hidden);
    assert.equal(await page.locator('#trends').isVisible(), false);
    assert.deepEqual(await frame(), before, 'the map, its panel and the footer stand where they stood');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the charts follow the period, read out a year by keyboard, and show it with Enter', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await openTable(page, 'y=2000&f=1990');
    const shade = () => page.evaluate(() => {
      const p = document.querySelector('#trend-types-svg rect.period').getBBox(), mid = y => { const r = document.querySelector(`#trend-types-svg g.bars rect[data-year="${y}"]`).getBBox(); return r.x + r.width / 2; };
      return { left: p.x, right: p.x + p.width, a: mid(1990), b: mid(2000), before: mid(1989), after: mid(2001), out: document.querySelectorAll('#trend-types-svg g.bars rect.out').length };
    });
    const s = await shade();
    assert.ok(s.left < s.a && s.b < s.right, 'the shade covers 1990–2000');
    assert.ok(s.before < s.left && s.right < s.after, 'and no more');
    assert.ok(s.out > 0, 'the bars outside the period fade');
    assert.match(await page.locator('#trends-readout').textContent(), /^2000: 40 armed conflicts .* Shaded, 1990–2000: 108 armed conflicts; 593,942 battle deaths in all \(low 572,271, high 790,439\)\.$/);
    assert.equal(await page.locator('#trends-rows tr.in').count(), 11);
    // A change of period moves the shade.
    await page.evaluate(() => { location.hash = '#y=2022&v=table'; });
    await page.waitForFunction(() => document.querySelector('#trends-readout').textContent.startsWith('2022:'));
    assert.equal((await shade()).out, 0, 'one year: no bar fades');
    // Keyboard: Tab to the chart, ← reads 2021, Enter shows it.
    // The live region spoke the change of period; a pointer passing over the bars changes the visible readout only.
    assert.match(await page.locator('#trends-live').textContent(), /^2022: /);
    const live = await page.locator('#trends-live').textContent();
    const box = await page.locator('#trend-types-svg').boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    assert.doesNotMatch(await page.locator('#trends-readout').textContent(), /^2022: /, 'hover reads a year on screen');
    assert.equal(await page.locator('#trends-live').textContent(), live, 'and says nothing to a screen reader');
    await page.mouse.move(0, 0);
    await page.locator('#trend-types-svg').focus();
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#trends-readout').textContent(), /^2021: /);
    // Each chart is a slider whose value is the year, in words.
    const sl = await page.evaluate(() => { const e = document.querySelector('#trend-types-svg'); return ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'].map(k => e.getAttribute(k)); });
    assert.deepEqual(sl.slice(0, 4), ['slider', '1926', '2025', '2021']);
    assert.match(sl[4], /^2021: \d+ armed conflicts/);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#trend-types-svg').getAttribute('aria-valuenow'), '2022');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#year-big').textContent === '2021');
    assert.match(page.url(), /#y=2021/);
    await page.locator('#trend-deaths-svg').focus();
    await page.keyboard.press('Home');
    assert.match(await page.locator('#trends-readout').textContent(), /^1989: 41 armed conflicts .*55,667 battle deaths/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: at 390 px the charts stack, fit the screen and keep their figures; the dark theme draws them in its own tokens', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await openTable(page, 'y=2025');
      const g = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        return { types: r('#trend-types-svg'), deaths: r('#trend-deaths-svg'), panel: r('.tablepanel'), trends: r('#trends'), sw: document.documentElement.scrollWidth, w: innerWidth,
          fill: getComputedStyle(document.querySelector('#trend-types-svg g.layer.t3 rect')).fill,
          intl: getComputedStyle(document.querySelector('#trend-types-svg g.layer.t4 rect')).fill,
          ...(() => { const seg = ['3', '4', '2'].map(t => { const r = document.querySelector(`#trend-types-svg g.bars rect[data-year="2025"][data-type="${t}"]`); return [+r.getAttribute('y'), +r.getAttribute('height')]; });
            return { seg, gapOk: Math.abs(seg[1][0] + seg[1][1] + 1 - seg[0][0]) < 0.01 && Math.abs(seg[2][0] + seg[2][1] + 1 - seg[1][0]) < 0.01 }; })(),
          bg: getComputedStyle(document.body).backgroundColor,
          tick: getComputedStyle(document.querySelector('#trend-deaths-svg .tick text')).fill };
      });
      assert.ok(g.sw <= g.w, `${colorScheme}: no sideways scroll (${g.sw})`);
      assert.ok(g.types.right <= g.w && g.deaths.right <= g.w, `${colorScheme}: the charts fit`);
      assert.ok(g.deaths.top >= g.types.bottom, `${colorScheme}: stacked`);
      assert.ok(g.trends.bottom <= g.panel.top, `${colorScheme}: above the table`);
      assert.deepEqual(await barFigures(page, 2025), { 1: 0, 2: 8, 3: 35, 4: 22 });
      // The civil bars take --prp-cat-1 of the theme (design/prp.css: #2a78d6 light, #3987e5 dark).
      assert.equal(g.fill, colorScheme === 'dark' ? 'rgb(57, 135, 229)' : 'rgb(42, 120, 214)', `${colorScheme}: bars`);
      // Internationalised civil, the band above, is amber (--prp-cat-4: #eda100 light, #c98500 dark), far from blue.
      assert.equal(g.intl, colorScheme === 'dark' ? 'rgb(201, 133, 0)' : 'rgb(237, 161, 0)', `${colorScheme}: internationalised`);
      // A 1 px gap of the surface parts two segments where both are tall enough to keep their colour.
      assert.ok(g.gapOk, `${colorScheme}: the 2025 segments are parted (${JSON.stringify(g.seg)})`);
      assert.notEqual(g.tick, g.bg, `${colorScheme}: the ticks stand out`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

for (const [name, answer] of [['a 404', { status: 404, contentType: 'text/plain', body: 'Not found' }], ['Pages’ HTML page for a missing path', { status: 200, contentType: 'text/html', body: '<!doctype html><title>VM</title><p>Not here</p>' }]]) {
  test(`page: when the battle-death layer answers with ${name}, Figure 2 and the table are still drawn and a note says the deaths are missing`, pageTest, async () => {
    const browser = await launch({ args: ['--mute-audio'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/omni/data/layers/conflict-territory/conflicts.json', r => r.fulfill(answer));
      await openTable(page, 'y=1991');
      const g = await page.evaluate(() => ({ bars: document.querySelectorAll('#trend-types-svg g.bars rect').length, rows: document.querySelectorAll('#trends-rows tr').length,
        deathsHidden: document.querySelector('#trend-deaths').hidden, note: !document.querySelector('#trends-nodeaths').hidden, noteText: document.querySelector('#trends-nodeaths').textContent,
        readout: document.querySelector('#trends-readout').textContent }));
      assert.ok(g.bars > 100, `the bars (${g.bars})`);
      assert.equal(g.rows, 100);
      assert.equal(g.deathsHidden, true, 'Figure 3 is left out');
      assert.equal(g.note, true); assert.match(g.noteText, /battle-death figures could not be loaded/);
      assert.equal(g.readout, '1991: 53 armed conflicts (49 civil, 2 internationalised civil, 2 interstate).');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('page: a period wholly before 1989 ends its readout on a figure, not a fragment (390 px, dark)', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await openTable(page, 'y=1975&f=1960');
    assert.equal(await page.locator('#trends-readout').textContent(), '1975: 30 armed conflicts (24 civil, 4 internationalised civil, 2 interstate); UCDP’s battle-death series starts in 1989. Shaded, 1960–1975: 96 armed conflicts.');
    // Figure 2 marks 1989, where Figure 3 begins; Figure 3's caption gives its span.
    assert.equal(await page.locator('#trend-types-svg g.split text').textContent(), '1989 →');
    assert.equal(await page.locator('#trend-deaths figcaption').innerText(), 'Figure 3. Battle deaths each year, 1989–2025, on a time scale of its own (UCDP).');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
