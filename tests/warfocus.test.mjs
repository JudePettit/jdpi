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

// Review of 12 November 2026: estimated months were shown to the nearest person. They are shares of a yearly or war
// total, so they are rounded (two significant figures, totals three) and marked ~; a recorded count stays exact.
test('figures: an estimate is rounded and marked, a recorded count is not', async () => {
  const { sig, deaths, estimateOf } = await import('../battlefield/focus/figures.mjs');
  assert.deepEqual([sig(123456, 2), sig(123456, 3), sig(98, 2), sig(37, 2), sig(0, 2), sig(999999, 3)], [120000, 123000, 98, 37, 0, 1000000]);
  assert.equal(deaths(123456, true), '~120,000');
  assert.equal(deaths(16634910, true, { total: true }), '~16,600,000');
  assert.equal(deaths(999999, true, { total: true }), '~1,000,000', 'a spread total back to the round figure it was spread from');
  assert.equal(deaths(4321, false), '4,321', 'a recorded count is exact');
  assert.equal(estimateOf('Correlates of War war total, spread across months by recorded battles'), 'Correlates of War’s war total');
  assert.equal(estimateOf('PRIO Battle Deaths annual totals, spread across months by UCDP events; UCDP GED recorded deaths (state-based violence)'), 'PRIO’s yearly totals');
  assert.equal(estimateOf('UCDP GED recorded deaths (state-based violence)'), '');
});

// Review of 15 November 2026 (historian, professor, strategist): the build rules in scripts/rules.mjs.
test('rules: a battle is part of a war only through items within the war\'s dates (the Iraq War is not the War in Afghanistan)', async () => {
  const { partsWithin } = await import('../battlefield/focus/scripts/rules.mjs');
  // Wikidata, November 2026: Kunduz airstrike → War in Afghanistan → war against the Islamic State → Iraqi insurgency →
  // Iraq War, and the Iraq War → Iraqi conflict → Operation Inherent Resolve → war against the Islamic State.
  const edges = [['Q1848486', 'Q182865'], ['Q182865', 'Q17507684'], ['Q17507684', 'Q926905'], ['Q926905', 'Q545449'], ['Q545449', 'Q47015896'],
    ['Q47015896', 'Q18357664'], ['Q18357664', 'Q17507684'], ['Q1330136', 'Q926905'], ['Q1804983', 'Q545449']].map(([c, parent]) => ({ c, parent }));
  const dates = new Map([['Q182865', { s: '2001-10-07', e: '2021-08-30' }], ['Q17507684', { s: '2014-06-13', e: null }], ['Q18357664', { s: '2014-06-15', e: null }],
    ['Q926905', { s: '2003-05-01', e: '2011-12-18' }], ['Q47015896', { s: '2003-03-20', e: null }], ['Q1330136', { s: '2004-11-07', e: '2004-12-23' }]]);
  const within = partsWithin(edges, dates, 'Q545449', { start: '2003-03-20', end: '2011-12-18' });
  assert.ok(within.has('Q1330136'), 'Second Battle of Fallujah, through the Iraqi insurgency');
  assert.ok(within.has('Q1804983'), 'Battle of Baghdad, directly');
  assert.ok(!within.has('Q1848486'), 'not the Kunduz airstrike, through the war against the Islamic State (2014 on)');
  assert.ok(!within.has('Q17507684') && !within.has('Q545449'), 'neither the later war nor the Iraq War itself');
});

// Second reader, 15 November 2026 (finding E): below a wider operation, a part fought elsewhere is not the war's.
test('rules: below an item also part of something outside the war, only the parts within the war\'s theatre', async () => {
  const { partsWithin, stateBoxes } = await import('../battlefield/focus/scripts/rules.mjs');
  // Wikidata, November 2026: Operation Enduring Freedom (Q326668) is part of the War in Afghanistan (Q182865) and of
  // the War on Terror (Q185729); its parts include Operation Anaconda in Afghanistan, OEF – Philippines (Q2631285), OEF
  // – Horn of Africa (Q1195810) and the capture of the So San (Q5655209) in the Arabian Sea; Battle of Tora Bora directly.
  const edges = [['Q326668', 'Q182865'], ['Q326668', 'Q185729'], ['Q1046346', 'Q326668'], ['Q2631285', 'Q326668'], ['Q1195810', 'Q326668'],
    ['Q5655209', 'Q326668'], ['Q30304278', 'Q182865']].map(([c, parent]) => ({ c, parent }));
  const places = new Map([['Q326668', [66, 33]], ['Q1046346', [69.4, 33.2]], ['Q2631285', [125, 7.5]], ['Q1195810', [48, 9.5]], ['Q5655209', [48, 12]], ['Q30304278', [70.28, 34.09]]]);
  const points = [[69.2, 34.5], [65.7, 31.6], [62.2, 34.3], [68.9, 36.7], [71.2, 35], [64.1, 31.5]]; // UCDP events in Afghanistan
  const topo = JSON.parse(readFileSync(new URL('../battlefield/history/data/borders.topo.json', import.meta.url), 'utf8'));
  const boxes = stateBoxes(topo, '2001-10-07', '2021-08-30');
  const states = [2, 200, 700].flatMap(gw => boxes.get(gw) || []);
  assert.ok(boxes.get(700)?.length && boxes.get(2)?.length > 1, 'Afghanistan, and the United States in parts (Alaska and Hawaii apart)');
  const span = { start: '2001-10-07', end: '2021-08-30' };
  const before = partsWithin(edges, new Map(), 'Q182865', span);
  assert.ok(before.has('Q2631285') && before.has('Q5655209'), 'by dates alone the other theatres came in');
  const within = partsWithin(edges, new Map(), 'Q182865', span, { places, points, states });
  assert.deepEqual([...within].sort(), ['Q1046346', 'Q30304278', 'Q326668'], 'Operation Anaconda, Tora Bora and OEF itself, nothing elsewhere');
  // A side's territory that reaches into the fighting's area counts: the Bangladesh Liberation War's western front of
  // December 1971 (Battle of Longewala, in India) stays below the Indo-Pakistani war of 1971, shared with the Indo-Pakistani wars.
  const bd = [['Q2', 'Q1'], ['Q2', 'Q9'], ['Q3', 'Q2'], ['Q4', 'Q1'], ['Q5', 'Q1'], ['Q6', 'Q1'], ['Q7', 'Q1'], ['Q8', 'Q1']].map(([c, parent]) => ({ c, parent }));
  const bdPlaces = new Map([['Q3', [70.16, 27.52]], ['Q4', [90.4, 23.7]], ['Q5', [91.8, 22.3]], ['Q6', [89.5, 22.8]], ['Q7', [90.4, 24.7]], ['Q8', [91.9, 24.9]]]);
  const b71 = stateBoxes(topo, '1971-03-26', '1971-12-16');
  assert.ok(partsWithin(bd, new Map(), 'Q1', { start: '1971-03-26', end: '1971-12-16' }, { places: bdPlaces, states: [750, 770].flatMap(gw => b71.get(gw) || []) }).has('Q3'));
  assert.ok(!partsWithin(bd, new Map(), 'Q1', { start: '1971-03-26', end: '1971-12-16' }, { places: bdPlaces }).has('Q3'), 'without its states, it would not');
});

test('rules: a battle\'s end checked against its Wikipedia article', async () => {
  const { infoboxEnd, endAgainstArticle } = await import('../battlefield/focus/scripts/rules.mjs');
  // Battle of Bakhmut, English Wikipedia, November 2026 (the infobox's date field, shortened).
  const bakhmut = "{{Short description|Battle}}\n{{Use dmy dates|date=July 2026}}\n{{Infobox military conflict\n| conflict = Battle of Bakhmut\n| partof = [[Eastern Ukraine campaign]]\n| date = July 2022<ref name=\":30\"/>{{efn|The start date is not well defined. Attacks on the distant approaches took place in early July 2022.<ref name=\":31\"/>}} – 20 May 2023{{efn|There is no clear consensus on the end date.}}\n| place = [[Bakhmut]]\n}}";
  assert.deepEqual(infoboxEnd(bakhmut), { d: '2023-05-20', p: null });
  // A date field over several lines, with a reference holding other dates (Battle of Stalingrad).
  assert.deepEqual(infoboxEnd("{{Infobox military conflict\n| date = 17 July 1942<ref group=\"Note\">The start is debated, 23 August 1942. {{bulleted list|\n|a}}</ref> – 2 February 1943<br />({{Age in years, months, weeks and days|month1=07|day1=17|year1=1942|month2=02|day2=02|year2=1943}})\n| place = Stalingrad\n}}"), { d: '1943-02-02', p: null });
  assert.deepEqual(infoboxEnd('{{Infobox military conflict\n| date = 22–24 November and 10–11 December 1971\n| place = Hilli\n}}'), { d: '1971-12-11', p: null });
  assert.deepEqual(infoboxEnd('{{Infobox military conflict\n| date = March – September 1968\n}}'), { d: '1968-09-30', p: 'm' });
  assert.equal(infoboxEnd('{{Infobox military conflict\n| date = 24 February 2022 – present\n}}'), null, 'ongoing');
  assert.equal(infoboxEnd('{{Infobox military conflict\n| date = 1941–1944\n}}'), null, 'a year alone');
  assert.equal(infoboxEnd('No infobox | date = 1 May 1945'), null);
  // Wikidata: 9 August 2022 – 7 January 2024. Drawn to 20 May 2023, marked uncertain with both ends.
  const wd = { s: '2022-08-09', e: '2024-01-07', p: null, pe: null, u: null, eW: null };
  assert.deepEqual(endAgainstArticle(wd, { d: '2023-05-20', p: null }), { s: '2022-08-09', e: '2023-05-20', p: null, pe: null, u: 'conflict', eW: '2024-01-07', eA: '2023-05-20' });
  assert.equal(endAgainstArticle(wd, { d: '2023-12-20', p: null }), wd, 'within a month: as Wikidata has it');
  assert.equal(endAgainstArticle(wd, { d: '2022-07-31', p: 'm' }), wd, 'an article end before the start is no check');
  // Battle of Hilli: Wikidata ends it 18 December 1971, after the war (16 December); the article, 11 December.
  const hilli = { s: '1971-11-22', e: null, p: null, pe: null, u: 'after', eW: '1971-12-18' };
  assert.equal(endAgainstArticle(hilli, { d: '1971-12-11', p: null }, '1971-12-16'), hilli, 'not over a month apart');
  assert.equal(endAgainstArticle({ ...hilli, eW: '1972-03-01' }, { d: '1971-12-11', p: null }, '1971-12-16').e, '1971-12-11');
  assert.equal(endAgainstArticle({ ...hilli, eW: '1972-03-01' }, { d: '1972-01-11', p: null }, '1971-12-16').e, null, 'nor to an article end after the war');
});

test('rules: Wikidata dates at their precision; a decade is no date; no end, an end before the start or after the war is no span', async () => {
  const { battleDates, wdDate } = await import('../battlefield/focus/scripts/rules.mjs');
  const t = (v, p = 11) => ({ v: v + 'T00:00:00Z', p });
  assert.equal(wdDate('2020-01-01T00:00:00Z', 8, true), null, '"the 2020s" is not 31 December 2020');
  assert.equal(wdDate('2024-01-01T00:00:00Z', 9, true), '2024-12-31');
  assert.equal(wdDate('2023-10-01T00:00:00Z', 10, true), '2023-10-31');
  // 2022 Kherson counteroffensive: start 29 Aug 2022 and a point in time "2020s" (it was shown ending 31 Dec 2020).
  assert.deepEqual(battleDates({ start: [t('2022-08-29')], point: [t('2020-01-01', 8)], name: '2022 Kherson counteroffensive' }), { s: '2022-08-29', e: null, p: null, pe: null, u: 'end', eW: null });
  // Battle of Kharkiv: a start and no end is not a one-day battle.
  assert.equal(battleDates({ start: [t('2022-02-24')], name: 'Battle of Kharkiv' }).u, 'end');
  // Snake Island campaign: a point in time alone, for a campaign, is its start.
  assert.equal(battleDates({ point: [t('2022-02-24')], name: 'Snake Island campaign' }).u, 'end');
  // An airstrike's point in time is its day.
  assert.deepEqual(battleDates({ point: [t('2009-09-04')], name: 'Kunduz airstrike' }), { s: '2009-09-04', e: '2009-09-04', p: null, pe: null, u: null, eW: null });
  // Operation Iron Hammer: Wikidata ends it (3 Jan 2006) before its start (30 Nov 2006).
  assert.deepEqual(battleDates({ start: [t('2006-11-30')], end: [t('2006-01-03')], name: 'Operation Iron Hammer' }), { s: '2006-11-30', e: null, p: null, pe: null, u: 'order', eW: '2006-01-03' });
  // Ending after the war's own end is not drawn running past it; a year-precision end in the war's last year is.
  assert.equal(battleDates({ start: [t('1942-12-06')], end: [t('1969-04-14')], name: 'Operation Oyster', warEnd: '1945-09-02' }).u, 'after');
  assert.deepEqual(battleDates({ start: [t('1945-03-01', 10)], end: [t('1945-01-01', 9)], name: 'X', warEnd: '1945-09-02' }), { s: '1945-03-01', e: '1945-12-31', p: 'm', pe: 'y', u: null, eW: null });
  // A decade alone (Siege of Tigray, "the 2020s"): listed as undated, not dropped (second reader, finding A); no date
  // at all, or a century, is no battle.
  assert.deepEqual(battleDates({ point: [t('2020-01-01', 8)], name: 'Siege of Tigray' }), { s: null, e: null, p: null, pe: null, u: 'undated', eW: null, dec: 2020 });
  assert.equal(battleDates({ point: [t('1900-01-01', 7)], name: 'Y' }), null, 'a century is no date');
  assert.equal(battleDates({ name: 'Y' }), null, 'no date, no battle');
  const { decadeFits } = await import('../battlefield/focus/scripts/rules.mjs');
  assert.ok(decadeFits(2020, '2020-11-03', '2022-11-02') && decadeFits(1930, '1939-09-01', '1945-09-02') && !decadeFits(1950, '1939-09-01', '1945-09-02'));
});

test('rules: a UCDP period estimate is shared out over its days; a spread total adds up to its source; COW only over its own years', async () => {
  const { eventMonths, apportion, cowMonths } = await import('../battlefield/focus/scripts/rules.mjs');
  // UCDP 13243, 7,986 deaths near Pokrovsk dated 21 Aug – 20 Oct 2025 (date_prec 5): 11, 30 and 20 of its 61 days.
  assert.deepEqual(eventMonths('2025-08-21', '2025-10-20', 7986, '2022-02-24', '2026-09-30'), [['2025-08', 1440], ['2025-09', 3928], ['2025-10', 2618]]);
  assert.deepEqual(eventMonths('2025-08-03', '2025-08-09', 40, '2022-02-24', '2026-09-30'), [['2025-08', 40]], 'a week in one month stays in it');
  // Gulf War: 17 Jan – 1 Mar 1991, the war ending 28 Feb: only its days in the war.
  assert.deepEqual(eventMonths('1991-01-17', '1991-03-01', 9505, '1990-08-02', '1991-02-28').map(([m]) => m), ['1991-01', '1991-02']);
  assert.equal(eventMonths('1991-01-17', '1991-03-01', 9505, '1990-08-02', '1991-02-28').reduce((s, [, n]) => s + n, 0), 9505);
  assert.deepEqual(apportion(1000000, [3, 3, 3]), [333334, 333333, 333333]);
  assert.equal(apportion(999999.6, [1, 2, 3, 4, 5, 6, 7]).reduce((s, v) => s + v, 0), 1000000);
  const months = ['1937-07', '1937-12', '1941-12', '1942-01', '1945-09'];
  assert.deepEqual(cowMonths(months, [[1937, 2], [1938, 2], [1939, 2], [1940, 2], [1941, 2]]), [0, 1, 2]);
});

test('data: each battle under its own war, with no impossible dates', async () => {
  const d = await dataFile('battlefield/focus/data/index.json');
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`);
    for (const b of w.battles) {
      if (!b.s) { assert.ok(b.u === 'undated' && Number.isInteger(b.dec) && !b.e, `${x.id}: ${b.n} has no start and is not dated to a decade`); continue; }
      assert.ok(!b.e || b.e >= b.s, `${x.id}: ${b.n} ends ${b.e}, before its start ${b.s}`);
      const earliest = b.e && ({ y: b.e.slice(0, 4) + '-01-01', m: b.e.slice(0, 7) + '-01' }[b.pe || b.p] || b.e);
      if (b.e && w.end) assert.ok(earliest <= w.end, `${x.id}: ${b.n} ends ${b.e}, after the war`);
      if (!b.e) assert.match(b.u || '', /^(end|order|after)$/, `${x.id}: ${b.n} has no end and no reason`);
      if (b.u === 'conflict') assert.ok(b.eW > b.e && b.eA === b.e, `${x.id}: ${b.n} is drawn to the earlier end`);
    }
  }
  // Second reader, 15 November 2026. A battle Wikidata dates only to the decade is kept, undated (finding A).
  const tg = await dataFile('battlefield/focus/data/wars/tigray.json'), sot = tg.battles.find(b => b.q === 'Q121090645');
  assert.ok(sot && sot.u === 'undated' && sot.dec === 2020, 'the Siege of Tigray stays in the Tigray war, undated');
  const ww2b = (await dataFile('battlefield/focus/data/wars/ww2.json')).battles;
  assert.ok(ww2b.some(b => b.q === 'Q19845675') && ww2b.some(b => b.q === 'Q4940724'), 'nor do the bombardments of Venlo and the Bombing of South-East Asia leave WWII');
  // Battle of Bakhmut ended with the city's fall on 20 May 2023 (Wikipedia), not on Wikidata's 7 January 2024 (finding B).
  const bk = (await dataFile('battlefield/focus/data/wars/russia-ukraine.json')).battles.find(b => b.q === 'Q112114958');
  assert.ok(bk && bk.e <= '2023-05-31' && bk.u === 'conflict' && bk.eW === '2024-01-07', `Bakhmut drawn to ${bk?.e}`);
  // The War in Afghanistan holds no Operation Enduring Freedom part fought elsewhere (finding E).
  const af = await dataFile('battlefield/focus/data/wars/afghanistan-2001.json');
  assert.deepEqual(af.battles.filter(b => ['Q2631285', 'Q1195810', 'Q5655209'].includes(b.q)).map(b => b.n), []);
  assert.deepEqual(af.battles.filter(b => b.lat != null && (b.lon < 55 || b.lon > 80 || b.lat < 24 || b.lat > 42)).map(b => b.n), []);
  // The Iraq War's battles are in Iraq (and its borders): before, 29 of its 61 mapped battles were in Afghanistan.
  const iq = await dataFile('battlefield/focus/data/wars/iraq-war.json');
  const away = iq.battles.filter(b => b.lat != null && (b.lon < 38 || b.lon > 49 || b.lat < 29 || b.lat > 38));
  assert.deepEqual(away.map(b => b.n), []);
  assert.ok(!iq.battles.some(b => /Kunduz|Sangin|Musa Qala|Kamdesh|Operation Medusa/.test(b.n)));
  const ru = await dataFile('battlefield/focus/data/wars/russia-ukraine.json'), k = b => ru.battles.find(x => x.n === b);
  assert.equal(k('2022 Kherson counteroffensive').u, 'end', 'its "2020s" point in time is not an end of 31 Dec 2020');
  assert.ok(k('Battle of Kharkiv').e !== k('Battle of Kharkiv').s, 'a start with no end is not one day');
});

test('data: UCDP period estimates are spread over their months; COW totals stay whole and within COW\'s years', async () => {
  const ru = await dataFile('battlefield/focus/data/wars/russia-ukraine.json'), at = (w, m) => w.deaths[w.months.indexOf(m)];
  // Before: August 2025 20,891 then September 1,693, from period estimates put on 1 and 21 August.
  assert.ok(at(ru, '2025-08') < 2 * at(ru, '2025-09') && at(ru, '2025-09') < 2 * at(ru, '2025-08'), `Aug ${at(ru, '2025-08')}, Sep ${at(ru, '2025-09')}`);
  assert.ok(ru.shared[ru.months.indexOf('2025-09')] > 0, 'September carries a share of the period events');
  assert.match(ru.deathsSource, /shared out over the days of that period/);
  // Gulf War: before, January 1991 25,969 and February 2,276 (the air campaign's period estimates on 17 January).
  const g = await dataFile('battlefield/focus/data/wars/gulf-war.json');
  assert.ok(at(g, '1991-02') > at(g, '1991-01') / 2, `Jan ${at(g, '1991-01')}, Feb ${at(g, '1991-02')}`);
  // Second Sino-Japanese War: COW's war 130 is 1,000,000 battle deaths, 1937–41 (no missing-value code), not 999,999
  // spread over 1937–45.
  const sj = await dataFile('battlefield/focus/data/wars/second-sino-japanese.json');
  assert.equal(sj.totalDeaths, 1000000);
  assert.deepEqual(sj.covered, ['1937-07', '1941-12']);
  assert.ok(sj.months.every((m, i) => m <= '1941-12' || (sj.deaths[i] === 0 && !sj.estimated[i])), 'no share after 1941');
  assert.match(sj.deathsSource, /World War II/);
  const d = await dataFile('battlefield/focus/data/index.json');
  const cow = new Map(JSON.parse(readFileSync(new URL('../battlefield/history/data/wars.json', import.meta.url), 'utf8')).wars.map(w => [w.id, w.deaths]));
  for (const x of d.wars.filter(x => /^Correlates of War/.test(x.deathsSource))) assert.equal(x.totalDeaths, cow.get(x.bf), `${x.id}: the spread total adds up to COW's`);
});

test('the page claims only what it draws: sides and whole-country occupation, not who held what', () => {
  const html = readFileSync(new URL('../battlefield/focus/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /who held what/i, 'front lines are not drawn, so the page does not promise who held what');
  assert.match(html, /Front lines are not drawn/);
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const wf = reg.suites.flatMap(s => s.modules).find(m => m.id === 'war-focus');
  assert.doesNotMatch(wf.description, /fronts|territory/i, 'nor does its registry description');
});

test('the page says whose its estimated deaths are, rounded; UCDP\'s counts stay exact', pageTest, async t => {
  const ww2 = await dataFile('battlefield/focus/data/wars/ww2.json'), k = ww2.months.indexOf('1942-01');
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1942-01`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'January 1942', null, { timeout: 20000 });
  const month = await page.locator('#c-month').innerText(), note = await page.locator('#c-month-note').innerText();
  const digits = month.replace(/[~,]/g, '').replace(/0+$/, '').length;
  assert.match(month, /^~[\d,]+$/);
  assert.ok(digits <= 2, `an estimated month to two significant figures: ${month} (the data says ${ww2.deaths[k]})`);
  assert.match(note, /^Estimate from Correlates of War/);
  assert.match(await page.locator('#c-total').innerText(), /^~/);
  await page.goto(`${BASE}/battlefield/focus/#war=russia-ukraine&m=2023-03`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'March 2023', null, { timeout: 20000 });
  const ru = await dataFile('battlefield/focus/data/wars/russia-ukraine.json');
  assert.equal((await page.locator('#c-month').innerText()).replace(/,/g, ''), String(ru.deaths[ru.months.indexOf('2023-03')]), 'UCDP\'s count, exactly');
  // March 2023 carries a share of events UCDP dates only to a longer period (review of 15 November 2026), and says so.
  assert.equal(await page.locator('#c-month-note').innerText(), `UCDP, ${ru.shared[ru.months.indexOf('2023-03')].toLocaleString('en-GB')} spread from periods`);
  // A COW war's month outside COW's own years has no figure, not "none recorded".
  await page.goto(`${BASE}/battlefield/focus/#war=second-sino-japanese&m=1943-05`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'May 1943', null, { timeout: 20000 });
  assert.equal(await page.locator('#c-month-note').innerText(), 'No figure in the source');
  assert.equal(await page.locator('#c-month').innerText(), '–');
  // Nor does the running total read as all of the war's deaths, as if no one died after 1941 (second reader, 15 Nov).
  const soFar = await page.locator('#panel .stat', { hasText: 'Deaths so far' }).locator('small').innerText();
  assert.equal(soFar, 'to December 1941; no figure after');
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
  assert.ok(jan42.qids > 3, 'battles carry Wikidata IDs for the Master Index linker');
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

// MP-03 (15 Nov 2026): a war opened with no month shows its first two months, the handles one month apart, so both
// are visible; an address that names a month keeps it.
test('a war opens on its first two months, with both handles visible one month apart', pageTest, async () => {
  const ww2 = JSON.parse(readFileSync(new URL('../battlefield/focus/data/wars/ww2.json', import.meta.url), 'utf8'));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${BASE}/battlefield/focus/#war=ww2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(m => document.querySelector('#month')?.dataset.value === m, ww2.months[1], { timeout: 20000 });
    assert.equal(await page.evaluate(() => document.querySelector('#month-from').dataset.value), ww2.months[0]);
    assert.match(page.url(), new RegExp(`#war=ww2&m=${ww2.months[1]}$`));
    await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1942-01`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#month')?.dataset.value === '1942-01', null, { timeout: 20000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
