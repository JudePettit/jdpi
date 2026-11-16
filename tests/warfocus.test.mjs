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

// RV-05, part A, error 1 (the outside review; Jude approved its "parent/child events with explicit aggregation rules",
// 15 November 2026). The Second World War's "Deadliest battles" ranked the atomic bombings of Hiroshima and Nagasaki
// (Q488, 286,818) beside its two parts, Hiroshima (Q703203, 286,818) and Nagasaki (Q4382340, 162,083): the same deaths
// twice. And Q488's 286,818 was not its own: Wikidata gives Q488 two figures, Hiroshima's and Nagasaki's, and the build
// kept the larger. One rule for every war: a whole and its parts (P361 or P527 between two items of the war's list).
test('rules: a whole and its parts are linked both ways, each part under one whole, and a figure of the whole\'s that is a part\'s is left to the part', async () => {
  const { linkParts, ownDeaths } = await import('../battlefield/focus/figures.mjs');
  // Wikidata, 16 November 2026: Q488 is part of the air raids on Japan (Q590545), as is the Bombing of Tokyo (Q59886);
  // the Doolittle Raid (Q713516) is part of both Q59886 and Q590545; Q488 has Hiroshima and Nagasaki as parts (P527)
  // and they are part of it (P361). Links to an item outside the list (Q8, the Pacific War) and to itself are no links.
  const qids = ['Q590545', 'Q713516', 'Q488', 'Q703203', 'Q4382340', 'Q59886', 'Q1'];
  const edges = [['Q488', 'Q590545'], ['Q703203', 'Q488'], ['Q4382340', 'Q488'], ['Q713516', 'Q59886'], ['Q713516', 'Q590545'], ['Q59886', 'Q590545'],
    ['Q488', 'Q8'], ['Q1', 'Q1'], ['Q703203', 'Q488']].map(([c, parent]) => ({ c, parent }));
  const L = linkParts(qids, edges);
  assert.deepEqual(L.get('Q488'), { up: 'Q590545', upAlso: [], parts: ['Q703203', 'Q4382340'] });
  assert.deepEqual([L.get('Q703203').up, L.get('Q4382340').up], ['Q488', 'Q488']);
  assert.deepEqual(L.get('Q713516'), { up: 'Q59886', upAlso: ['Q590545'], parts: [] }, 'under the whole that is itself a part of the other');
  assert.deepEqual(L.get('Q590545'), { up: null, upAlso: [], parts: ['Q488', 'Q59886'] }, 'its parts in the list\'s order, the Doolittle Raid under Tokyo only');
  assert.deepEqual(L.get('Q1'), { up: null, upAlso: [], parts: [] });
  // Two wholes, neither part of the other: the one with fewer parts, then the lower QID number.
  const two = linkParts(['Q30', 'Q20', 'Q5', 'Q6'], [['Q5', 'Q30'], ['Q5', 'Q20'], ['Q6', 'Q30']].map(([c, parent]) => ({ c, parent })));
  assert.deepEqual([two.get('Q5').up, two.get('Q5').upAlso], ['Q20', ['Q30']]);
  assert.deepEqual(linkParts(['Q30', 'Q20', 'Q5'], [['Q5', 'Q30'], ['Q5', 'Q20']].map(([c, parent]) => ({ c, parent }))).get('Q5').up, 'Q20');
  // The second reader (WF2-04): before fewer parts and the lower QID, the whole whose own recorded figure is at least
  // the part's (it contains it), then the whole whose dates contain the part's. The Misterei massacre (97 deaths) is
  // part of the Battle of Geneina (no figure) and of the Masalit genocide (10,800): under the genocide, whose figure
  // already holds it, not counted again through the Darfur campaign. The 2023 Dnipro airstrike (14 January 2023, 46) is
  // part of the Dnipro strikes (25 October 2022, the lower QID) and of the 14 January 2023 strikes (46): under the second.
  const facts = new Map([['Q2', { v: 0, s: '2023-06-01', e: '2023-06-30' }], ['Q30', { v: 10800, s: '2023-04-24', e: '2023-11-30' }], ['Q97', { v: 97, s: '2023-06-14', e: '2023-06-14' }]]);
  const mis = linkParts(['Q2', 'Q30', 'Q97', 'Q98'], [['Q97', 'Q2'], ['Q97', 'Q30'], ['Q98', 'Q30']].map(([c, parent]) => ({ c, parent })), facts);
  assert.deepEqual([mis.get('Q97').up, mis.get('Q97').upAlso], ['Q30', ['Q2']], 'under the whole whose own figure contains it');
  const dnipro = new Map([['Q112', { v: 0, s: '2022-10-25', e: '2022-10-25' }], ['Q116', { v: 46, s: '2023-01-14', e: '2023-01-14' }], ['Q115', { v: 46, s: '2023-01-14', e: '2023-01-14' }]]);
  assert.equal(linkParts(['Q112', 'Q116', 'Q115'], [['Q115', 'Q112'], ['Q115', 'Q116']].map(([c, parent]) => ({ c, parent })), dnipro).get('Q115').up, 'Q116');
  const dated = new Map([['Q3', { v: 0, s: '1940-05-10', e: '1940-06-25' }], ['Q4', { v: 0, s: '1940-04-08', e: '1940-06-10' }], ['Q8', { v: 0, s: '1940-04-14', e: '1940-05-05' }]]);
  assert.equal(linkParts(['Q3', 'Q4', 'Q8'], [['Q8', 'Q3'], ['Q8', 'Q4']].map(([c, parent]) => ({ c, parent })), dated).get('Q8').up, 'Q4', 'the Siege of Fort Hegra under the Norwegian Campaign, whose dates hold it, not the Battle of France');
  // A cycle (each part of the other) is broken: one of the two stays at the top.
  const cyc = linkParts(['Q10', 'Q11'], [['Q10', 'Q11'], ['Q11', 'Q10']].map(([c, parent]) => ({ c, parent })));
  assert.equal([cyc.get('Q10').up, cyc.get('Q11').up].filter(Boolean).length, 1);
  // Q488's two figures are its parts' own; the Israeli invasion of the Gaza Strip keeps its largest; Operation Arnon's
  // one figure is its one part's (274).
  assert.deepEqual(ownDeaths([286818, 162083], new Set([286818, 162083])), { deaths: null, dv: [286818, 162083] });
  assert.deepEqual(ownDeaths([21052, 30275], new Set([97, 800])), { deaths: 30275, dv: [30275, 21052] });
  assert.deepEqual(ownDeaths([274], new Set([274])), { deaths: null, dv: [274] });
  assert.deepEqual(ownDeaths([87], new Set()), { deaths: 87, dv: null });
  assert.deepEqual(ownDeaths([], new Set([5])), { deaths: null, dv: null });
});

test('rules: a whole and its parts count each death once: the whole a heading over its parts, never ranked beside them', async () => {
  const { groupBattles, figureText } = await import('../battlefield/focus/figures.mjs');
  const b = (q, n, deaths, x = {}) => ({ q, n, deaths, cas: null, ...x });
  const list = [
    b('Q590545', 'air raids on Japan', null, { parts: ['Q488', 'Q59886'] }),
    b('Q488', 'atomic bombings of Hiroshima and Nagasaki', null, { up: 'Q590545', parts: ['Q703203', 'Q4382340'], cas: 201779, dv: [286818, 162083] }),
    b('Q703203', 'atomic bombing of Hiroshima', 286818, { up: 'Q488', dAt: '2013-08-31' }),
    b('Q4382340', 'atomic bombing of Nagasaki', 162083, { up: 'Q488', dAt: '2013-08-31' }),
    b('Q59886', 'Bombing of Tokyo', 105400, { up: 'Q590545', parts: ['Q713516'] }),
    b('Q713516', 'Doolittle Raid', 87, { up: 'Q59886', upAlso: ['Q590545'], parts: ['Q7'] }),
    b('Q7', 'Ogu Air Raid', 10, { up: 'Q713516' }),
    b('Q192660', 'Battle of Okinawa', 200656),
    b('Q150812', 'Invasion of Poland', null, { parts: ['Q9'] }), b('Q9', 'Battle of the Border', null, { up: 'Q150812' }),
    b('Q702638', 'Operation Tannenberg', 20000, { parts: ['Q11'] }), b('Q11', 'Intelligenzaktion', 22900, { up: 'Q702638' }),
    b('Q5', 'casualties only', null, { cas: 500 }),
  ];
  const g = groupBattles(list);
  assert.deepEqual(g.ranked.map(n => n.b.q), ['Q590545', 'Q192660', 'Q702638', 'Q5'], 'wholes and lone battles only; the invasion of Poland has no figure');
  const air = g.ranked[0], atom = g.byQ.get('Q488'), tokyo = g.byQ.get('Q59886');
  assert.deepEqual([atom.fig, atom.from], [448901, 'parts'], 'no figure of its own: its parts\' together');
  assert.deepEqual([tokyo.fig, tokyo.from], [105400, 'own'], 'recorded for the whole, more than its parts\'');
  assert.deepEqual([air.fig, air.from], [448901 + 105400, 'parts']);
  // The second reader (WF2-03): where a whole has its own recorded figure, it is ranked by it, even where its parts'
  // add up to more (Operation Tannenberg's 20,000, its part's 22,900 covering 1939–1945; the October 7 attacks' 1,200,
  // a part's 579 where Wikipedia gives 5): one faulty part never overrides a figure recorded for the whole. The parts'
  // sum is kept (`sum`) and said.
  assert.deepEqual([g.byQ.get('Q702638').fig, g.byQ.get('Q702638').from, g.byQ.get('Q702638').sum], [20000, 'own', 22900], 'its own figure, not the larger part');
  assert.equal(figureText(g.byQ.get('Q702638')), '20,000 deaths recorded for the whole; its parts\' figures add up to 22,900');
  assert.deepEqual(air.shown.map(n => n.b.q), ['Q488', 'Q59886']);
  assert.deepEqual(atom.shown.map(n => n.b.q), ['Q703203', 'Q4382340']);
  const flat = ns => ns.flatMap(n => [n.b.q, ...flat(n.shown)]);
  assert.equal(new Set(flat(g.ranked)).size, flat(g.ranked).length, 'no item twice');
  assert.equal(g.total, g.ranked.reduce((s, n) => s + n.fig, 0));
  assert.equal(g.total, 448901 + 105400 + 200656 + 20000, 'each death once');
  // A figure counted long after the event (WF2-01: the cities' registers of the dead, counted to 2013, which take in
  // people who died in later years) says so, and the year goes only with the share counted in it.
  assert.equal(figureText(atom), '448,901 deaths, the sum of its parts\' recorded figures, counted in 2013 (a late count, which can include later deaths)');
  assert.equal(figureText(air), '554,301 deaths, the sum of its parts\' recorded figures; 448,901 of them counted in 2013 (a late count, which can include later deaths)');
  assert.equal(figureText(tokyo), '105,400 deaths recorded for the whole');
  assert.equal(figureText(g.byQ.get('Q703203')), '286,818 deaths, counted in 2013 (a late count, which can include later deaths)');
  assert.deepEqual(air.late, [['2013', 448901]]);
  assert.equal(figureText(g.byQ.get('Q5')), '500 casualties');
  assert.equal(figureText(g.byQ.get('Q150812')), '');
  // A whole whose parts have no figures counts as itself.
  assert.deepEqual([g.byQ.get('Q713516').fig, g.byQ.get('Q713516').from], [87, 'own']);
});

// The second reader of the rule (16 November 2026), WF2-02, WF2-04, WF2-05: the narrator, a battle's window and the map.
test('rules: the narrator speaks a whole\'s own toll only; a sum of parts is said as one, with the year of a late count', async () => {
  const { groupBattles, endLine, plural } = await import('../battlefield/focus/figures.mjs');
  const said = n => `${Math.round(n / 1000)} thousand`;
  const g = groupBattles([
    { q: 'Q590545', n: 'air raids on Japan', deaths: null, parts: ['Q488', 'Q59886'] },
    { q: 'Q488', n: 'atomic bombings of Hiroshima and Nagasaki', deaths: null, up: 'Q590545', parts: ['Q703203', 'Q4382340'] },
    { q: 'Q703203', n: 'atomic bombing of Hiroshima', deaths: 286818, up: 'Q488', dAt: '2013-08-31' },
    { q: 'Q4382340', n: 'atomic bombing of Nagasaki', deaths: 162083, up: 'Q488', dAt: '2013-08-31' },
    { q: 'Q59886', n: 'Bombing of Tokyo', deaths: 105400, up: 'Q590545' },
    { q: 'Q192660', n: 'Battle of Okinawa', deaths: 200656 },
    { q: 'Q6', n: 'Battle of Small', deaths: 400 },
  ]);
  assert.equal(endLine(g.byQ.get('Q590545').b, g.byQ.get('Q590545'), said), 'The air raids on Japan end, with some 554 thousand deaths recorded in their parts; some 449 thousand of them counted in 2013, a late count, which can include later deaths.');
  assert.equal(endLine(g.byQ.get('Q192660').b, g.byQ.get('Q192660'), said), 'The Battle of Okinawa ends, at a cost of some 201 thousand lives.');
  assert.equal(endLine(g.byQ.get('Q6').b, g.byQ.get('Q6'), said), '', 'under ten thousand: not told');
  for (const n of ['air raids on Japan', 'atomic bombings of Hiroshima and Nagasaki', 'Arctic convoys', 'Baedeker raids']) assert.equal(plural(n), true, n);
  for (const n of ['Battle of Okinawa', 'Bombing of Tokyo', 'Siege of Leningrad', 'Operation Barbarossa']) assert.equal(plural(n), false, n);
});
test('rules: a battle\'s window explains a figure left to a part, under whichever whole the part is counted', async () => {
  const { leftToParts } = await import('../battlefield/focus/figures.mjs');
  // The 14 January 2023 strikes give 46, the Dnipro airstrike's own; the airstrike may sit under another whole.
  const battles = [
    { q: 'Q116207054', n: '14 January 2023 strikes', deaths: null, dv: [46], parts: [] },
    { q: 'Q112114955', n: 'Dnipro strikes', deaths: null, parts: ['Q116206525'] },
    { q: 'Q116206525', n: '2023 Dnipro residential building airstrike', deaths: 46, up: 'Q112114955', upAlso: ['Q116207054'] },
  ];
  assert.deepEqual(leftToParts(battles[0], battles).map(x => [x.v, x.part.q]), [[46, 'Q116206525']]);
  assert.deepEqual(leftToParts(battles[2], battles), []);
});
test('rules: on the map a part with casualties only, under a whole whose deaths are recorded, gets the smallest mark', async () => {
  const { groupBattles, markValue } = await import('../battlefield/focus/figures.mjs');
  const g = groupBattles([
    { q: 'Q59886', n: 'Bombing of Tokyo', deaths: 105400, cas: null, parts: ['Q51881408'], lat: 35.7, lon: 139.8, s: '1942-04-18' },
    { q: 'Q51881408', n: 'Bombing of Tokyo (10 March 1945)', deaths: null, cas: 124711, up: 'Q59886', lat: 35.7, lon: 139.8, s: '1945-03-10' },
    { q: 'Q5', n: 'casualties only', deaths: null, cas: 500, lat: 1, lon: 1, s: '1945-01-01' },
  ]);
  for (const n of g.byQ.values()) n.drawn = n.fig; // as loadWar sets it (no mapped part has deaths here)
  assert.equal(markValue(g.byQ.get('Q51881408')), 0, 'the same people are not drawn twice');
  assert.equal(markValue(g.byQ.get('Q59886')), 105400);
  assert.equal(markValue(g.byQ.get('Q5')), 500, 'a lone battle with casualties only is drawn by them, as before');
});
// WF2-06 and WF2-09: casualties read as statements (Q488's 201,779 is a count of living survivors, hibakusha, P805);
// battles that start on the same day in QID order; an item with two places, at its first part's.
test('rules: casualties as statements, never one about something else (P805); ties by QID; a whole with two places at its first part\'s', async () => {
  const { casualtiesOf, byStart, pickCoord } = await import('../battlefield/focus/scripts/rules.mjs');
  assert.equal(casualtiesOf([{ v: 201779, rank: 'normal', about: 'Q598936' }]), null, 'the hibakusha are survivors, not casualties of the bombings');
  assert.equal(casualtiesOf([{ v: 100, rank: 'normal' }, { v: 300, rank: 'normal' }]), 300);
  assert.equal(casualtiesOf([{ v: 100, rank: 'preferred' }, { v: 300, rank: 'normal' }]), 100, 'the preferred statement');
  assert.equal(casualtiesOf([{ v: 900, rank: 'deprecated' }]), null);
  const list = [{ q: 'Q30', s: '1945-08-06' }, { q: 'Q4', s: '1945-08-06' }, { q: 'Q9', s: null }, { q: 'Q2', s: '1945-01-01' }, { q: 'Q7', s: null }];
  assert.deepEqual(list.sort(byStart).map(b => b.q), ['Q2', 'Q4', 'Q30', 'Q7', 'Q9']);
  const hiroshima = [34.395, 132.455], nagasaki = [32.75, 129.876];
  assert.deepEqual(pickCoord([nagasaki, hiroshima], [hiroshima]), hiroshima, 'the atomic bombings at Hiroshima, its first part');
  assert.deepEqual(pickCoord([nagasaki, hiroshima], []), nagasaki, 'no parts: the southern-most, the same every run');
  assert.deepEqual(pickCoord([hiroshima], [nagasaki]), hiroshima, 'one place: its own');
  assert.equal(pickCoord([], []), null);
});

test('the page states the rule for a whole and its parts in its method text', () => {
  const app = readFileSync(new URL('../battlefield/focus/app.js', import.meta.url), 'utf8');
  const note = app.slice(app.indexOf('class="src-note"'));
  assert.match(note, /<b>Wholes and their parts:<\/b>/);
  assert.match(note, /each death is counted once/);
  assert.match(note, /heading over its parts/);
  // The second reader (WF2-03, WF2-04, WF2-01): a whole's own figure ranks it; a part of two wholes is counted under
  // one, which its window names; a late count says so.
  assert.match(note, /ranked by the figure recorded for the whole where there is one/);
  assert.match(note, /a part of two wholes is counted under one of them, which its window names/);
  assert.match(note, /can include people who died of their injuries in later years/);
});
// WF2-07: the Integration Hub's battles carry the page's figure, counted once, so a reader can total a war as the page does.
test('the Hub\'s War Focus battles give the figure counted once, where it is from, and every whole a part is under', () => {
  const src = readFileSync(new URL('../integration/scripts/build-catalog.mjs', import.meta.url), 'utf8');
  const spec = src.slice(src.indexOf("id: 'war-focus-battles'"), src.indexOf("id: 'war-focus-monthly-deaths'"));
  for (const f of ['deaths_counted_once', 'figure_from', 'also_part_of']) assert.match(spec, new RegExp(`\\['${f}', `), `${f} described`);
  assert.match(spec, /add deaths_counted_once over the rows with no part_of/);
  assert.doesNotMatch(spec, /which already includes its parts/);
});

test('data: every whole and part in a war\'s list carries the link both ways; the atomic bombings head Hiroshima and Nagasaki', async () => {
  const { groupBattles } = await import('../battlefield/focus/figures.mjs');
  const d = await dataFile('battlefield/focus/data/index.json');
  let links = 0;
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`), by = new Map(w.battles.map(b => [b.q, b]));
    for (const b of w.battles) {
      if (b.up) { links++; assert.ok(b.up !== b.q && by.get(b.up)?.parts?.includes(b.q), `${x.id}: ${b.q} is under ${b.up}, which does not list it`); }
      for (const p of b.parts || []) assert.equal(by.get(p)?.up, b.q, `${x.id}: ${b.q} lists ${p}, which is not under it`);
      for (const p of b.upAlso || []) assert.ok(by.has(p) && p !== b.up, `${x.id}: ${b.q} also under ${p}`);
      let n = b, k = 0; while (n.up && k++ <= w.battles.length) n = by.get(n.up);
      assert.ok(k <= w.battles.length, `${x.id}: ${b.q} is in a cycle`);
    }
    const flat = ns => ns.flatMap(n => [n.b.q, ...flat(n.shown)]), f = flat(groupBattles(w.battles).ranked);
    assert.equal(new Set(f).size, f.length, `${x.id}: an item twice in the ranking`);
  }
  assert.ok(links > 500, `links: ${links}`);
  const ww2 = new Map((await dataFile('battlefield/focus/data/wars/ww2.json')).battles.map(b => [b.q, b]));
  assert.deepEqual([ww2.get('Q703203').up, ww2.get('Q4382340').up], ['Q488', 'Q488']);
  assert.deepEqual(ww2.get('Q488').parts, ['Q703203', 'Q4382340']);
  // Bound to the structure, not to today's figures (WF2-08: an edit on Wikidata must not stop the monthly refresh): a
  // figure Q488 carries that is one of its parts' own is left to that part, and its own deaths are null when all are.
  const partsOwn = new Set(ww2.get('Q488').parts.map(p => ww2.get(p).deaths).filter(Boolean));
  const own = (ww2.get('Q488').dv || [ww2.get('Q488').deaths]).filter(v => v && !partsOwn.has(v));
  assert.equal(ww2.get('Q488').deaths, own.length ? Math.max(...own) : null, 'its figures that are its parts\' are left to them');
  // WF2-06: no casualties figure is a statement about something else (Q488's hibakusha, P805), and WF2-09: battles
  // that start on the same day are in QID order.
  if (ww2.get('Q488').cas !== null) assert.notEqual(ww2.get('Q488').cas, 201779, 'the living survivors are no casualties');
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`);
    for (let i = 1; i < w.battles.length; i++) {
      const a = w.battles[i - 1], b = w.battles[i];
      if (a.s === b.s) assert.ok(+a.q.slice(1) < +b.q.slice(1), `${x.id}: ${a.q} and ${b.q} start on ${a.s} out of QID order`);
    }
  }
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

// RV-05 A1: the deadliest battles list a whole once, as a heading over its parts, never beside them.
test('WWII\'s deadliest battles list the atomic bombings once, as a heading over Hiroshima and Nagasaki', pageTest, async t => {
  const ww2 = await dataFile('battlefield/focus/data/wars/ww2.json'), up = new Map(ww2.battles.map(b => [b.q, b.up]));
  // The line expected, from the data by the page's own rule (WF2-08: no figure written into the test).
  const { groupBattles, figureText } = await import('../battlefield/focus/figures.mjs');
  const atomLine = figureText(groupBattles(ww2.battles).byQ.get('Q488'));
  const browser = await launch();
  t.after(() => browser.close());
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1945-09`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#panel ul.deadliest', { timeout: 20000 });
    const got = await page.evaluate(() => {
      const ul = document.querySelector('#panel ul.deadliest');
      const top = [...ul.children].filter(li => li.tagName === 'LI').map(li => li.dataset.q);
      const atom = ul.querySelector('li[data-q="Q488"]');
      return { top, atom: atom && { line: atom.querySelector(':scope > small').textContent, parts: [...atom.querySelectorAll(':scope > ul.parts > li')].map(li => li.dataset.q) },
        hiroshima: ul.querySelectorAll('li[data-q="Q703203"]').length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    // No two entries of the ranking are a whole and its part (or further down the same whole).
    const above = q => { const s = new Set(); for (let u = up.get(q); u; u = up.get(u)) s.add(u); return s; };
    for (const q of got.top) assert.ok(![...above(q)].some(u => got.top.includes(u)), `${width}px: ${q} is ranked beside a whole it is part of`);
    assert.ok(got.atom, `${width}px: the atomic bombings are in the list`);
    assert.deepEqual(got.atom.parts, ['Q703203', 'Q4382340'], 'Hiroshima and Nagasaki under it');
    assert.ok(atomLine && got.atom.line.includes(atomLine), `${width}px: "${got.atom.line}" gives ${atomLine}`);
    assert.equal(got.hiroshima, 1, 'Hiroshima once');
    assert.equal(got.sideways, 0, `${width}px scrolls sideways`);
    assert.deepEqual(errors, []);
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
