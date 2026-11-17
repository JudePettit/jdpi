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

// BF-08 (16 November 2026): a battle's figures from its English Wikipedia infobox, read by scripts/infobox.mjs. The
// expected readings were worked out by hand on real fields before the reader was written: a wrong number is worse than
// "No figure found", so a field the reader cannot read surely is refused, never guessed.
const INFOBOXES = JSON.parse(readFileSync(new URL('./fixtures/warfocus-infoboxes.json', import.meta.url), 'utf8'));
const asFig = f => (f ? [f.low, f.high, f.status, ...(f.atLeast ? ['+'] : [])] : null);
test('infobox: real casualty fields read as worked by hand, the refused refused', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  assert.ok(INFOBOXES.cases.length >= 40, `${INFOBOXES.cases.length} fields`);
  const wrong = [];
  for (const x of INFOBOXES.cases) {
    const r = readCasualties(x.fields, { infobox: x.infobox }), e = x.expect;
    const got = { state: r.state, d: asFig(r.deaths), c: asFig(r.cas) };
    if (JSON.stringify(got) !== JSON.stringify({ state: e.state, d: e.d, c: e.c })) wrong.push(`${x.battle}: got ${JSON.stringify(got)}, expected ${JSON.stringify({ state: e.state, d: e.d, c: e.c })}`);
    (e.sides || []).forEach((es, k) => {
      const s = r.sides[k] || {}, pair = f => (f ? [f.low, f.high] : null);
      if ('d' in es && JSON.stringify(pair(s.deaths)) !== JSON.stringify(es.d)) wrong.push(`${x.battle} side ${k + 1} deaths: ${JSON.stringify(pair(s.deaths))}, expected ${JSON.stringify(es.d)}`);
      if ('c' in es && JSON.stringify(pair(s.cas)) !== JSON.stringify(es.c)) wrong.push(`${x.battle} side ${k + 1} casualties: ${JSON.stringify(pair(s.cas))}, expected ${JSON.stringify(es.c)}`);
      if (es.refused && !s.refused) wrong.push(`${x.battle} side ${k + 1} should be refused`);
      if (!es.refused && s.refused) wrong.push(`${x.battle} side ${k + 1} refused (${s.refused.why}: ${s.refused.text})`);
      if (es.zero && !s.zero) wrong.push(`${x.battle} side ${k + 1} should read as a zero`);
      if (es.words && !s.words?.length) wrong.push(`${x.battle} side ${k + 1} should keep its words`);
    });
  }
  assert.deepEqual(wrong, []);
});

test('infobox: ranges, "+", "3,000/4,000" and "27 or 28" give a low and a high; ordinals, years and upper bounds are no figures', async () => {
  const { readCasualties, readLine } = await import('../battlefield/focus/scripts/infobox.mjs');
  const d = t => asFig(readCasualties({ deaths: t }).deaths);
  assert.deepEqual(d('1,000–2,000 killed'), [1000, 2000, 'estimate']);
  assert.deepEqual(d('1,000 to 2,000 killed'), [1000, 2000, 'estimate']);
  assert.deepEqual(d('~3,000/4,000 killed'), [3000, 4000, 'estimate']);
  assert.deepEqual(d('27 or 28 civilians'), [27, 28, 'estimate']);
  assert.deepEqual(d('10,000+ killed'), [10000, 10000, 'estimate', '+']);
  assert.deepEqual(d('over 300 killed'), [300, 300, 'estimate', '+']);
  assert.deepEqual(d('c. 1,200 killed'), [1200, 1200, 'estimate']);
  assert.deepEqual(d('1,428 killed'), [1428, 1428, 'fact']);
  for (const t of ['up to 300 killed', '35th Brigade destroyed 4', '1944 killed in the spring', '1.500 killed', '1,428–9 killed']) assert.notEqual(readLine(t).kind, 'items', t);
  assert.equal(readCasualties({ casualties1: 'Heavy', casualties2: 'Unknown' }).state, 'words', 'words are shown as words');
});

test('infobox: materiel, the sick, deserters and those who fled never add to deaths or casualties', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  const r = readCasualties({ casualties1: '120 killed<br>410 wounded<br>6 aircraft<br>3 tanks destroyed<br>2 ships sunk<br>40 horses', casualties2: '500 dead<br>1,000 sick<br>300 deserted<br>30,000+ civilians fled' });
  // The second side gives its killed only, so the casualties are the first side's, at least.
  assert.deepEqual([asFig(r.deaths), asFig(r.cas)], [[620, 620, 'estimate'], [530, 530, 'fact', '+']]);
  assert.ok(readCasualties({ casualties1: '2,200 killed, wounded, sick or captured' }).sides[0].refused, 'the sick joined with the counted kinds refuse the side');
  assert.equal(readCasualties({ casualties1: '8-10 Leopard 2 tanks destroyed, at least 2 captured' }).state, 'none', 'a figure after the tanks is tanks');
});

test('infobox: "killed and wounded" is never deaths; killed alone gives no casualties figure', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  const kw = readCasualties({ casualties1: '3,000 killed and wounded', casualties2: '200 killed' });
  assert.equal(kw.sides[0].deaths, null);
  assert.deepEqual(asFig(kw.sides[0].cas), [3000, 3000, 'fact']);
  assert.equal(kw.sides[1].cas, null, 'killed only: no casualties of its own');
  assert.ok(kw.sides[0].joined && kw.sides[1].killedOnly, 'each says why');
  assert.deepEqual(asFig(kw.deaths), [200, 200, 'fact', '+']);
});

test('infobox: a claim label governs the lines below it; a bracketed one after its lines, those above', async () => {
  const { readSide } = await import('../battlefield/focus/scripts/infobox.mjs');
  const below = readSide('Chinese claim:<br>2,954 killed<br>5,645 wounded<br>----<br>Japanese estimate:<br>5,203 killed');
  assert.deepEqual(below.readings.map(r => [r.by, r.deaths?.low]), [['Chinese claim', 2954], ['Japanese estimate', 5203]]);
  assert.equal(below.deaths.status, 'disputed');
  const above = readSide('45 killed<br>40 wounded<br><small>(French claim)</small><br>60–70 killed<br><small>(Algerian claim)</small>');
  assert.deepEqual(above.readings.map(r => [r.by, r.deaths?.low, r.deaths?.high]), [['French claim', 45, 45], ['Algerian claim', 60, 70]]);
  const each = readSide('28 killed (per the SOHR)<br>54 killed (per The Inside Source)');
  assert.deepEqual(each.readings.map(r => r.by), ['SOHR', 'The Inside Source']);
});

test('infobox: recorded, estimate, disputed; a VM sum of the sides is an estimate; a zero only where every side records none', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  assert.deepEqual(asFig(readCasualties({ casualties1: '799 killed' }).deaths), [799, 799, 'fact', '+'], 'one side, recorded');
  assert.deepEqual(asFig(readCasualties({ casualties1: '799 killed', casualties2: '44 killed' }).deaths), [843, 843, 'estimate'], 'VM adds the sides');
  assert.deepEqual(asFig(readCasualties({ casualties1: '799 killed', casualties2: 'None' }).deaths), [799, 799, 'fact'], 'the other side records none');
  assert.equal(readCasualties({ casualties1: '1,112 dead{{Citation needed|date=October 2026}}' }).deaths.status, 'disputed');
  assert.equal(readCasualties({ casualties1: "'''US Claim''': 8,000 dead" }).deaths.status, 'disputed');
  assert.equal(readCasualties({ casualties1: 'None', casualties2: 'None' }).state, 'zero');
  assert.deepEqual(asFig(readCasualties({ casualties: 'None' }).deaths), [0, 0, 'fact']);
  for (const [why, f] of [['one side\'s silence', { casualties1: 'None', casualties2: 'Unknown' }], ['"None known"', { casualties1: 'None known', casualties2: 'None known' }],
    ['a claimed zero', { casualties1: 'No casualties (Iraqi claim)', casualties2: 'None' }], ['a zero for part of it', { casualties1: 'None (second assault wave)', casualties2: 'None' }], ['"5 wounded"', { casualties1: '5 wounded', casualties2: 'None' }]])
    assert.notEqual(readCasualties(f).state, 'zero', why);
});

test('infobox: a reference becomes a short citation; a named reference used again cites the first', async () => {
  const { citationOf, namedRefs, readSide } = await import('../battlefield/focus/scripts/infobox.mjs');
  assert.equal(citationOf('{{cite book |last=Alexander |first=Bevin |year=1986 |title=Korea |pages=440–42}}'), 'Alexander 1986, pp. 440–42');
  assert.equal(citationOf('{{harvnb|Chinese Military Science Academy|2000|pp=102, 104}}.'), 'Chinese Military Science Academy 2000, pp. 102, 104');
  assert.equal(citationOf('{{cite web|url=http://www.muharipgaziler.org.tr/files/kore.doc |title=Korean War (Kore Savaşi) |publisher=Turkish War Veterans Association}}'), 'Turkish War Veterans Association');
  const named = namedRefs('x<ref name="Herring">George Herring, 1998, p.340</ref>');
  assert.deepEqual(readSide('2,000 killed<ref name="Herring"/>', { named }).readings[0].refs, ['George Herring, 1998, p.340']);
});

test('figures: Wikidata leads, the infobox beside it (disputed by half again); a Wikidata 0 is a recorded zero; UCDP only where nothing else', async () => {
  const { battleFigures, wdStatements } = await import('../battlefield/focus/scripts/infobox.mjs');
  const entity = { claims: { P1120: [
    { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { amount: '+0' } } }, references: [{ snaks: { P143: [{}] } }] },
  ] } };
  const st = wdStatements(entity);
  assert.deepEqual(st, [{ p: 'P1120', rank: 'normal', v: 0, ref: 'wikipedia' }]);
  const zero = battleFigures({ wd: st, article: null });
  assert.deepEqual([zero.fd.v, zero.fd.status, zero.fd.src, zero.fwp], [0, 'fact', 'wikidata', undefined], 'Operation Red Dawn: Wikidata records none');
  const art = { title: 'Battle of X', rev: 1, ts: '2026-11-16T00:00:00Z', state: 'figure', deaths: { low: 3000, high: 3000, status: 'fact' }, cas: null, sides: [{ deaths: { low: 3000, high: 3000, status: 'fact', refs: ['A 2000'] } }] };
  const led = battleFigures({ deaths: 1000, wd: [{ p: 'P1120', v: 1000, rank: 'normal', ref: 'url' }], article: art });
  assert.deepEqual([led.fd.v, led.fd.status, led.fd.src, led.fd.alt.v], [1000, 'disputed', 'wikidata', 3000], 'Wikidata\'s 1,000 against the infobox\'s 3,000');
  assert.equal(battleFigures({ deaths: 2500, wd: [{ p: 'P1120', v: 2500, rank: 'normal', ref: 'stated' }], article: art }).fd, undefined, 'they agree: Wikidata\'s plain count, as before');
  const wp = battleFigures({ article: art });
  assert.deepEqual([wp.fd.v, wp.fd.status, wp.fd.src, wp.fd.uv], [3000, 'fact', 'wikipedia', undefined]);
  const ucdp = { v: 63, low: 60, high: 70, n: 12, km: 25 };
  assert.deepEqual(battleFigures({ article: { why: 'nobox' }, ucdp }), { fu: ucdp, fwp: 'nobox' });
  assert.equal(battleFigures({ article: art, ucdp }).fu, undefined, 'UCDP only where no source gives a figure');
  assert.deepEqual(battleFigures({ article: { ...art, state: 'unread', deaths: null, sides: [{ refused: { why: 'prose' } }] } }).fs, 'unread');
});

test('figures: a further source\'s figure is the battle\'s own, grouped and counted once, with its kind; the deadliest rank by deaths only, by the lowest figure', async () => {
  const { groupBattles, figureText, figureLine, deadliest, deadliestNote, completeness, completenessText, stateOf, searched } = await import('../battlefield/focus/figures.mjs');
  const list = [
    { q: 'Q1', n: 'Campaign', deaths: null, parts: ['Q2', 'Q3'], w: 'Campaign', fs: 'none', fwp: 'nofield' },
    { q: 'Q2', n: 'Battle A', deaths: null, up: 'Q1', fd: { low: 569, high: 1200, status: 'disputed', origin: 'vm', src: 'wikipedia' } },
    { q: 'Q3', n: 'Battle B', deaths: 400, up: 'Q1' },
    { q: 'Q4', n: 'Battle C', deaths: null, fd: { v: 218, status: 'fact', origin: 'source', src: 'wikipedia', atLeast: true, one: true } },
    { q: 'Q5', n: 'Battle D', deaths: null, fc: { v: 3000, status: 'estimate', origin: 'source', src: 'wikipedia' } },
    { q: 'Q6', n: 'Battle E', deaths: null, fd: { v: 0, status: 'fact', origin: 'source', src: 'wikidata' } },
    { q: 'Q7', n: 'Battle F', deaths: null, fs: 'unread', w: 'Battle F' },
    { q: 'Q8', n: 'Third Phase Offensive', deaths: null, fs: 'none', fwp: 'noart', s: '1950-12-31', p: 'd' },
  ];
  const g = groupBattles(list), one = g.byQ.get('Q1');
  assert.deepEqual([one.fig, one.from, one.kind], [969, 'parts', 'disputed'], 'the sum of its parts, by the lowest figure, no surer than its least sure part');
  // The sum with its range (review P1: the card and the lists give the same figure, the lowest first).
  assert.equal(figureText(one), '969–1,600 deaths, the sum of its parts\' figures');
  assert.equal(figureLine(g.byQ.get('Q2')), '569–1,200 deaths · Disputed or unreliable');
  assert.equal(figureLine(g.byQ.get('Q4')), 'at least 218 deaths · Recorded, one side');
  assert.equal(figureLine(g.byQ.get('Q5')), '3,000 casualties · Estimate');
  assert.equal(figureLine(g.byQ.get('Q6')), '0 deaths · Recorded');
  assert.equal(figureLine(g.byQ.get('Q7')), 'Figures not read');
  assert.equal(figureLine(g.byQ.get('Q8')), 'No figure found');
  const d = deadliest(g);
  assert.deepEqual(d.ranked.map(n => n.b.q), ['Q1', 'Q4'], 'deaths only: the campaign by its parts\' lowest figures, then 218');
  assert.deepEqual([d.estimates, d.disputed, d.casOnly, d.none], [0, 1, 1, 3]);
  // Of how many it ranks (review P9): the battles not counted under a larger one.
  assert.equal(deadliestNote(d), 'Of the 6 battles not counted under a larger one, ranked by deaths: 2 (1 disputed or unreliable), each by the lowest figure given. Not ranked: 1 with casualties only, 3 with no figure. Not added into the war\'s deaths by month.');
  assert.deepEqual(list.map(b => stateOf(b, g.byQ.get(b.q))), ['parts', 'figure', 'figure', 'figure', 'figure', 'zero', 'unread', 'none'], 'each battle in exactly one of five states');
  const c = completeness(list, g);
  assert.deepEqual([c.figure, c.recorded, c.estimate, c.disputed, c.zero, c.parts, c.unread, c.none, c.noArticle], [4, 2, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(completenessText(c), 'Figures for 4 of 8 battles: 2 recorded, 1 estimate, 1 disputed or unreliable; a recorded zero for 1; counted through their parts for 1; not read for 1; none found for 1 (1 without an article).');
  // In plain words (review P7): no English article is one Wikidata links to; a box VM could not read sends the reader to it.
  assert.equal(searched(list[7]), 'Searched: Wikidata (nothing recorded); English Wikipedia (no English article linked from Wikidata); UCDP (does not cover 1950).');
  assert.equal(searched(list[6]), 'Searched: Wikidata (nothing recorded); English Wikipedia (its casualties box has figures VM could not interpret surely: see the article); UCDP (does not cover its date).');
  assert.doesNotMatch(searched(list[6]) + figureLine(g.byQ.get('Q4')), /the reader/);
  // An infobox's figure for a whole gives way to its parts' sum where that is larger (the air raids on Japan's infobox
  // gives the US airmen's 2,691, at least; its parts hold over 500,000); Wikidata's own count for a whole still ranks it.
  const raids = groupBattles([
    { q: 'Q590545', n: 'air raids on Japan', deaths: null, parts: ['Q703203'], fd: { v: 2691, status: 'fact', src: 'wikipedia', atLeast: true, one: true } },
    { q: 'Q703203', n: 'atomic bombing of Hiroshima', deaths: 286818, up: 'Q590545' },
  ]).byQ.get('Q590545');
  assert.deepEqual([raids.fig, raids.from], [286818, 'parts']);
  const own = groupBattles([{ q: 'Q1', n: 'Whole', deaths: 20000, parts: ['Q2'] }, { q: 'Q2', n: 'Part', deaths: null, up: 'Q1', fd: { v: 22900, status: 'fact', src: 'wikipedia' } }]).byQ.get('Q1');
  assert.deepEqual([own.fig, own.from], [20000, 'own'], 'Wikidata\'s count for the whole, as before (WF2-03)');
});

// The review of 16 November 2026 (findings F1–F11): the patterns behind each misread, on the shapes the real fields take
// (the real fields themselves are cases in the fixture).
test('infobox (review F1, F4, F8, F11, P6, P12): split phrases, bracketed killed, partial and wider counts, "None reported", reference keys, materiel words', async () => {
  const { readSide, readCasualties, readLine, plainLines } = await import('../battlefield/focus/scripts/infobox.mjs');
  const fig = f => (f ? [f.low, f.high, f.status, ...(f.atLeast ? ['+'] : [])] : null);
  // F1: a phrase of kinds broken by a line break is one phrase; a bare figure takes the kinds on the next line; a kind
  // alone after a figure that already has one may be that figure's, so the side is not read.
  const split = readSide("'''Germany''':<br>150,000 killed,<br>wounded or captured");
  assert.deepEqual([fig(split.deaths), fig(split.cas)], [null, [150000, 150000, 'fact']]);
  assert.deepEqual(fig(readSide('11,609<br> killed and wounded, captured or missing').cas), [11609, 11609, 'fact']);
  assert.ok(readSide('1 killed<br />wounded').refused);
  assert.deepEqual(fig(readSide('1 killed<br />wounded unknown').deaths), [1, 1, 'fact'], 'words after a figure stay words');
  // F4: "(~40,000 killed)" under a total is its deaths, an estimate; the killed in brackets not read surely refuse the line.
  assert.deepEqual(fig(readSide('100,000+ casualties (~40,000 killed)').deaths), [40000, 40000, 'estimate']);
  assert.ok(readSide('2,000 casualties (1,000 killed in air raids, at least 1,000 lost at sea)').refused);
  assert.deepEqual(fig(readSide('551 civilian casualties (19 killed, 515 wounded, 17 unspecified)').deaths), [19, 19, 'fact'], 'read item by item');
  // F8: "est" without a full stop; a note that the figure covers part of the battle; a count that takes in another battle.
  assert.equal(readSide('3,250 POW (Soviet est)').cas.status, 'estimate');
  assert.deepEqual(fig(readSide("'''Total''' 26,000{{efn|Only between 28 August and 30 September}}").cas), [26000, 26000, 'estimate', '+']);
  assert.equal(readSide('1,375 killed (including Moro River battles)').deaths.status, 'estimate');
  assert.equal(readSide('3 militants killed (including Yahya Sinwar)').deaths.status, 'fact', 'a person named is no wider count');
  // F11: "None reported" is words; a deaths field's zero says nothing of casualties; every side's "None" says both.
  assert.equal(readCasualties({ fatalities: 'None reported' }).state, 'words');
  const dz = readCasualties({ deaths: 'None' });
  assert.deepEqual([fig(dz.deaths), dz.cas], [[0, 0, 'fact'], null]);
  assert.deepEqual(fig(readCasualties({ casualties1: 'None', casualties2: 'None' }).cas), [0, 0, 'fact']);
  // P6: a reference defined outside the lead is named as a reference, never by its key; an author and year is kept.
  assert.deepEqual(plainLines('2,000 killed<ref name=":0"/>')[0].refs, ['a named reference in the article']);
  assert.deepEqual(plainLines('2,000 killed<ref name="Smith 1990"/>')[0].refs, ['Smith 1990']);
  // P12: materiel in words is no reading of people.
  assert.equal(readLine('Several Stryker armoured fighting vehicles').kind, 'materiel');
  // "4-7,000": ends a hundred times apart are not read.
  assert.notEqual(readLine('4-7,000 civilians killed').kind, 'items');
});

test('infobox (review F2, F3, P2): a civilians field alone is said as the civilians\', a box of one later field is the whole battle\'s; an article of other dates is not read; every side is named', async () => {
  const { readCasualties, readArticle, battleFigures } = await import('../battlefield/focus/scripts/infobox.mjs');
  const fig = f => (f ? [f.low, f.high, f.status, ...(f.atLeast ? ['+'] : []), ...(f.one ? ['one'] : []), ...(f.civ ? ['civ'] : [])] : null);
  const tet = readCasualties({ casualties1: '12 Martians somewhere', casualties2: '45 Martians elsewhere', casualties3: "'''Civilian:''' 14,300 killed, 24,000 wounded, and 630,000 refugees" });
  assert.deepEqual(fig(tet.deaths), [14300, 14300, 'fact', '+', 'civ'], 'the civilians\' only, never "one side"');
  assert.equal(tet.sides[2].role, 'civ');
  const may = readCasualties({ casualties3: '500–1,000 dead<br />1,500 wounded' });
  assert.deepEqual([fig(may.deaths), fig(may.cas)], [[500, 1000, 'estimate'], [2000, 2500, 'estimate']], 'the whole event: no side missing');
  const box = '{{Infobox military conflict|conflict=Bara massacre|date=February 1992|deaths=35 killed}}';
  assert.equal(readArticle(box, { s: '2026-05-28', e: '2026-05-29' }).why, 'mismatch', 'Wikidata linked the 2026 massacre to the 1992 one');
  assert.equal(readArticle(box, { s: '1992-02-12', e: '1992-02-13' }).state, 'figure');
  const fx = battleFigures({ article: { ...readArticle(box, { s: '2026-05-28' }), title: 'Bara massacre (India)', rev: 1383066120, ts: '2026-11-01T00:00:00Z' } });
  assert.deepEqual([fx.fd, fx.fwp, fx.detail?.mismatch?.dy], [undefined, 'mismatch', [1992, 1992]]);
  const ongjin = readArticle('{{Infobox military conflict|date=25–26 June 1950|combatant1={{DPRK}}|combatant2={{ROK}}|casualties1=581 dead|casualties2=113 dead|casualties3=40 civilians killed}}', { s: '1950-06-25' });
  assert.deepEqual(ongjin.labels, { 1: 'North Korea', 2: 'South Korea' });
  const det = battleFigures({ article: { ...ongjin, title: 'Battle of Ongjin Peninsula', rev: 1, ts: '2026-11-01T00:00:00Z' } }).detail;
  assert.deepEqual(det.sides.map(s => s.label), ['North Korea', 'South Korea', 'Civilians']);
});

test('figures (review F9): Wikidata\'s qualifiers read in full: at least, a minimum and a maximum, presumably, an unknown value\'s limits', async () => {
  const { wdStatements, battleFigures } = await import('../battlefield/focus/scripts/infobox.mjs');
  const { ownFigure, rangeText } = await import('../battlefield/focus/figures.mjs');
  const st = (amount, rank, qual, extra = {}) => ({ rank, mainsnak: amount == null ? { snaktype: 'somevalue' } : { snaktype: 'value', datavalue: { value: { amount: `+${amount}` } } }, qualifiers: { ...(qual ? { P1480: [{ datavalue: { value: { id: qual } } }] } : {}), ...extra }, references: [{ snaks: { P143: [{}] } }] });
  const lim = (k, v) => ({ [k]: [{ datavalue: { value: { amount: `+${v}` } } }] });
  // The Sumpul River massacre: 300, the minimum (preferred), and 600, the maximum.
  const sumpul = wdStatements({ claims: { P1120: [st(300, 'preferred', 'Q10585806'), st(600, 'normal', 'Q10578722')] } });
  assert.deepEqual(sumpul.map(s => [s.v, s.bound, s.q]), [[300, 'min', ['the minimum']], [600, 'max', ['the maximum']]]);
  const b1 = { deaths: 300, ...battleFigures({ deaths: 300, wd: sumpul }) };
  assert.deepEqual([b1.fd.low, b1.fd.high, b1.fd.status, b1.fd.uv], [300, 600, 'estimate', 'w']);
  assert.equal(rangeText(ownFigure(b1, 'd')), '300–600');
  // The Nanjing Massacre: 300,000, "greater than or equal to".
  const nanjing = { deaths: 300000, ...battleFigures({ deaths: 300000, wd: wdStatements({ claims: { P1120: [st(300000, 'normal', 'Q55935291')] } }) }) };
  assert.equal(rangeText(ownFigure(nanjing, 'd')), 'at least 300,000');
  assert.equal(ownFigure(nanjing, 'd').status, 'estimate');
  // "Presumably": disputed or unreliable.
  assert.equal(battleFigures({ deaths: 50, wd: wdStatements({ claims: { P1120: [st(50, 'normal', 'Q18122778')] } }) }).fd.status, 'disputed');
  // Sabra and Shatila: an unknown value with a lower limit of 460 and an upper of 3,500.
  const sabra = { deaths: null, ...battleFigures({ wd: wdStatements({ claims: { P1120: [st(null, 'normal', null, { ...lim('P5447', 460), ...lim('P5448', 3500) })] } }) }) };
  assert.deepEqual([sabra.fd.low, sabra.fd.high, sabra.fd.status, sabra.fd.src], [460, 3500, 'estimate', 'wikidata']);
  assert.equal(rangeText(ownFigure(sabra, 'd')), '460–3,500');
});

test('figures (review F7, F10, P1, P3, P4, P8, P12): one figure for card and lists, casualties below the deaths said so, "recorded" only of a recorded count, whose figure it is', async () => {
  const { groupBattles, figureText, figureLine, shownFigure, ownFigure, deadliest, deadliestNote } = await import('../battlefield/focus/figures.mjs');
  // F7: casualties below the deaths beside them are no figure for the whole.
  assert.equal(ownFigure({ deaths: 1018, fc: { v: 68, status: 'fact', src: 'wikipedia' } }, 'c').below, true);
  // F10: Wikidata's 550 beside the infobox's 35–50: both readings, ranked by the lower.
  const dachau = { q: 'Q1', n: 'Dachau liberation reprisals', deaths: 550, fd: { v: 550, status: 'disputed', src: 'wikidata', alt: { low: 35, high: 50, status: 'fact', src: 'wikipedia' } } };
  assert.deepEqual([ownFigure(dachau, 'd').low, ownFigure(dachau, 'd').high], [35, 550]);
  const list = [dachau,
    { q: 'Q2', n: 'Whole', deaths: null, parts: ['Q3', 'Q4', 'Q5'], fd: { v: 282, status: 'fact', src: 'wikipedia', atLeast: true, one: true } },
    { q: 'Q3', n: 'Part A', deaths: 1000, up: 'Q2', cas: 300 },
    { q: 'Q4', n: 'Part B', deaths: null, up: 'Q2', fd: { v: 284, status: 'estimate', src: 'wikipedia' }, fc: { v: 400, status: 'estimate', src: 'wikipedia' } },
    { q: 'Q5', n: 'Part C', deaths: null, up: 'Q2' },
    { q: 'Q6', n: 'Battle of Somewhere', deaths: null, fd: { v: 14300, status: 'fact', src: 'wikipedia', atLeast: true, civ: true } },
    { q: 'Q7', n: 'First Battle of Sirte', deaths: null, fd: { v: 1, status: 'fact', src: 'wikipedia', uv: 1 } },
    { q: 'Q8', n: 'Battle of Berlin', deaths: 200000, fd: { v: 200000, status: 'estimate', src: 'wikidata', uv: 1 } },
  ];
  const g = groupBattles(list), whole = g.byQ.get('Q2');
  // P1: the whole is counted through its parts (1,284 against the article's 282): its card and its line say the same.
  assert.deepEqual([shownFigure(whole, 'd').low, shownFigure(whole, 'd').from, shownFigure(whole, 'd').status], [1284, 'parts', 'estimate']);
  assert.equal(figureLine(whole), '1,284 deaths, the sum of its parts\' figures · Estimate');
  // P3: the parts' casualties (700 of two parts, one part giving none) are "at least", and below the deaths: no figure
  // for the whole.
  const cw = shownFigure(whole, 'c');
  assert.deepEqual([cw.low, cw.atLeast, cw.below, cw.status], [700, true, true, 'estimate']);
  // P8, R3-01: "recorded" only of a recorded count; P12: one death.
  assert.equal(figureText(g.byQ.get('Q7')), '1 death');
  assert.equal(figureText({ ...whole, shown: [g.byQ.get('Q3')], fig: 282, from: 'own', ownFig: ownFigure(list[1], 'd'), kind: 'fact', wdOnly: false, sum: 1284 }), 'at least 282 deaths given for the whole; its parts\' figures add up to 1,284');
  // P4: whose figure, in words of its own, apart from the kind; F2: the civilians' only.
  assert.equal(figureLine(g.byQ.get('Q7')), '1 death · Recorded · the article cites nothing for it');
  assert.equal(figureLine(g.byQ.get('Q8')), '200,000 deaths · Estimate · Wikidata, no reference');
  assert.equal(figureLine(g.byQ.get('Q6')), 'at least 14,300 deaths · Recorded, civilians only');
  const d = deadliest(g);
  assert.deepEqual(d.ranked.map(n => n.b.q), ['Q8', 'Q2', 'Q1', 'Q7'], 'Dachau by its lower reading, 35; the civilians-only battle not ranked');
  assert.match(deadliestNote(d), /^Of the 5 battles not counted under a larger one, ranked by deaths: 4 .*Not ranked: 1 with civilian deaths only\./);
});

// The second review of BF-08 (16 November 2026, X2–X8): each finding's case, as the reviewer gave it.
test('figures (second review X2): the infobox\'s "at least" beside Wikidata\'s count keeps the range open at the top', async () => {
  const { groupBattles, figureLine, ownFigure } = await import('../battlefield/focus/figures.mjs');
  // The Good Friday Battle: Wikidata 9, the infobox at least 14 (9 and 5 or more): 14 is no upper limit.
  const gf = { q: 'Q23787738', n: 'Good Friday Battle', deaths: 9, fd: { v: 9, status: 'disputed', src: 'wikidata', uv: 'w', alt: { v: 14, status: 'estimate', origin: 'vm', src: 'wikipedia', atLeast: true } } };
  assert.deepEqual([ownFigure(gf, 'd').low, ownFigure(gf, 'd').high, ownFigure(gf, 'd').atLeast], [9, 14, true]);
  assert.equal(figureLine(groupBattles([gf]).byQ.get('Q23787738')), '9–14 or more deaths · Disputed or unreliable · Wikidata, imported from Wikipedia, no other reference');
  // An infobox reading below Wikidata's leaves Wikidata's top, closed.
  const below = { q: 'Q1', n: 'X', deaths: 550, fd: { v: 550, status: 'disputed', src: 'wikidata', alt: { low: 35, high: 50, status: 'fact', src: 'wikipedia', atLeast: true } } };
  assert.equal(ownFigure(below, 'd').atLeast, undefined);
});

test('infobox (second review X3): a first or second side, or an attack\'s field, that counts only civilians is the civilians\' figure, not ranked', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  const { groupBattles, figureLine, deadliest } = await import('../battlefield/focus/figures.mjs');
  // The bombing of Granollers: the Republic's side gives its civilians killed, the Nationalists' none.
  const gr = readCasualties({ casualties1: '100–224 civilians killed', casualties2: 'None' });
  assert.deepEqual([gr.deaths.low, gr.deaths.high, gr.deaths.civ, gr.deaths.one], [100, 224, true, undefined]);
  assert.equal(readCasualties({ deaths: '27 or 28 civilians' }).deaths.civ, true, 'an attack on civilians (the Mekelle shelling)');
  // A side's soldiers beside another's civilians, or a field that names soldiers too, is no civilians' figure.
  assert.equal(readCasualties({ casualties1: '581 dead', casualties2: '40 civilians killed' }).deaths.civ, undefined);
  assert.equal(readCasualties({ casualties1: '30 soldiers and 12 civilians killed', casualties2: 'None' }).deaths.civ, undefined);
  const b = { q: 'Q3022501', n: 'Bombing of Granollers', deaths: null, fd: { low: 100, high: 224, status: 'estimate', src: 'wikipedia', civ: true } };
  const g = groupBattles([b]);
  assert.equal(figureLine(g.byQ.get('Q3022501')), '100–224 deaths · Estimate, civilians only');
  assert.deepEqual([deadliest(g).ranked.length, deadliest(g).civ], [0, 1]);
});

test('infobox (second review X4): an attack\'s casualties are its deaths, injuries and missing together', async () => {
  const { readCasualties } = await import('../battlefield/focus/scripts/infobox.mjs');
  assert.deepEqual(asFig(readCasualties({ deaths: '10', injuries: '20', missing: '5' }).cas), [35, 35, 'fact']);
  assert.deepEqual(asFig(readCasualties({ deaths: '10', injuries: '20' }).cas), [30, 30, 'fact'], 'as before without a missing field');
});

test('build (second review X5): a battle whose source failed keeps its last figures only where they were figured from the same Wikidata counts', async () => {
  const { keptFigures } = await import('../battlefield/focus/scripts/infobox.mjs');
  const old = { q: 'Q23787738', deaths: 9, cas: null, fd: { v: 9, status: 'disputed', src: 'wikidata', alt: { v: 14, status: 'estimate', src: 'wikipedia', atLeast: true } }, fc: { v: 17, status: 'fact', src: 'wikipedia', atLeast: true, one: true } };
  assert.deepEqual(keptFigures({ q: 'Q23787738', deaths: 9, cas: 0 }, old), { fd: old.fd, fc: old.fc });
  // Wikidata's count moved to 30 while its statements could not be read: the old 9-against-14 no longer describes it.
  assert.equal(keptFigures({ q: 'Q23787738', deaths: 30, cas: 0 }, old), null);
  assert.equal(keptFigures({ q: 'Q1', deaths: 9 }, null), null);
});

test('figures (second review X7): Wikidata\'s "at least" is open at the top: an infobox reading above it is no disagreement', async () => {
  const { battleFigures } = await import('../battlefield/focus/scripts/infobox.mjs');
  const art = v => ({ title: 'Battle of X', rev: 1, ts: '2026-11-16T00:00:00Z', state: 'figure', deaths: { low: v, high: v, status: 'fact' }, cas: null, sides: [] });
  const atLeast100 = [{ p: 'P1120', v: 100, rank: 'normal', atLeast: true, q: ['at least'], ref: 'stated' }];
  const up = battleFigures({ deaths: 100, wd: atLeast100, article: art(300) }).fd;
  assert.deepEqual([up.status, up.atLeast, up.alt], ['estimate', true, undefined]);
  assert.equal(battleFigures({ deaths: 100, wd: atLeast100, article: art(50) }).fd.status, 'disputed', 'below an "at least" by half again is still a disagreement');
  // An unknown value with a lower limit only (at least 100), the same.
  const lim = [{ p: 'P1120', unknown: true, low: 100, high: 100, atLeast: true, rank: 'normal', ref: 'stated' }];
  const l = battleFigures({ wd: lim, article: art(300) }).fd;
  assert.deepEqual([l.status, l.alt], ['estimate', undefined]);
});

test('figures (second review X8): Wikidata\'s "no value" for casualties is a recorded zero, as for deaths', async () => {
  const { battleFigures, wdStatements } = await import('../battlefield/focus/scripts/infobox.mjs');
  const { groupBattles, figureLine, stateOf, completeness } = await import('../battlefield/focus/figures.mjs');
  const st = wdStatements({ claims: { P1590: [{ rank: 'normal', mainsnak: { snaktype: 'novalue' }, references: [{ snaks: { P248: [{ datavalue: { value: { id: 'Q1' } } }] } }] }] } });
  assert.deepEqual(st, [{ p: 'P1590', rank: 'normal', v: 0, ref: 'stated', in: 'Q1' }]);
  const fx = battleFigures({ wd: st, article: null });
  assert.deepEqual(fx.fc, { v: 0, status: 'fact', src: 'wikidata' });
  const b = { q: 'Q1', n: 'Battle of X', deaths: null, cas: null, ...fx };
  delete b.detail;
  const g = groupBattles([b]);
  assert.equal(stateOf(b, g.byQ.get('Q1')), 'zero');
  assert.equal(figureLine(g.byQ.get('Q1')), '0 casualties · Recorded');
  assert.equal(completeness([b], g).zero, 1);
  // The infobox's casualties beside Wikidata's "no value": both, disputed, as for deaths.
  const art = { title: 'Battle of X', rev: 1, ts: '2026-11-16T00:00:00Z', state: 'figure', deaths: null, cas: { low: 50, high: 50, status: 'fact' }, sides: [{ cas: { low: 50, high: 50, status: 'fact', refs: ['A 2000'] } }] };
  const both = battleFigures({ wd: st, article: art }).fc;
  assert.deepEqual([both.v, both.status, both.src, both.alt], [50, 'disputed', 'wikipedia', { v: 0, src: 'wikidata' }]);
});

// 16 November 2026: over a period the side layer read only the period's two ends, so France, at war on the Allied side
// in September 1939 and again in May 1945, read as unchanged across its occupation, and a state on a side only between
// the ends was not shown. Every month between the handles is read now (as the Kardashev Tracker's periodPowers, 7bfe77d).
test('sides: over a period every month between the handles is read: a side held at any step, and a change at any step', async () => {
  const { sideOf, periodSides } = await import('../battlefield/focus/sides.mjs');
  const ww2 = await dataFile('battlefield/focus/data/wars/ww2.json');
  const at = m => { const d = m + '-15'; return { m, d: d < ww2.start ? ww2.start : d }; };
  const months = ww2.months.slice(ww2.months.indexOf('1939-09'), ww2.months.indexOf('1945-05') + 1).map(at);
  assert.equal(sideOf(ww2, 220, '1942-03-15'), 'occ-b', 'France held by the Axis in 1942');
  const ps = periodSides(ww2, [220, 325, 255, 2], months);
  const runs = gw => ps.get(gw).runs.map(r => [r.side, r.from, r.to]);
  assert.deepEqual(runs(325), [['side-b', '1940-06', '1943-08'], ['side-a', '1943-10', '1945-05']], 'Italy: Axis from June 1940 to the armistice, then co-belligerent');
  assert.deepEqual(runs(220), [['side-a', '1939-09', '1940-06'], ['occ-b', '1940-07', '1944-08'], ['side-a', '1944-09', '1945-05']], 'France: at war, occupied, at war');
  assert.equal(ps.get(220).changed, true, 'France changed, though both ends are Allied');
  assert.deepEqual([ps.get(255).changed, ps.get(255).last, ps.get(255).held], [false, 'side-b', 'side-b']);
  assert.deepEqual([ps.get(2).runs, ps.get(2).changed], [[{ side: 'side-a', from: '1941-12', to: '1945-05' }], true], 'the United States from December 1941');
  // Ending in September 1943, Italy is on no side in the last month, and is shown in the side it last held, faded.
  const to43 = periodSides(ww2, [325], ww2.months.slice(0, ww2.months.indexOf('1943-09') + 1).map(at)).get(325);
  assert.deepEqual([to43.last, to43.held, to43.earlier], ['', 'side-b', true]);
  // The handles together: one month, nothing changed.
  const one = periodSides(ww2, [220], [at('1942-03')]).get(220);
  assert.deepEqual([one.last, one.changed, one.earlier], ['occ-b', false, false]);
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

// Jude's decision of 17 November 2026 (VM-DECISIONS-17NOV.md G, under H5's rule): the Red Sea crisis is not the Gaza war,
// and UCDP's figures for it (conflict 16099: 130 battle deaths in 2024, 781 in 2025) do not give it an entry of its own.
test('rules: the Red Sea crisis and all its parts are left out of the Gaza war, by any path; nothing else is', async () => {
  const { partsWithin } = await import('../battlefield/focus/scripts/rules.mjs');
  const { LEFT_OUT, leftOutOf, WARS } = await import('../battlefield/focus/scripts/wars.mjs');
  // Wikidata's "part of" (P361), as it read on 17 November 2026: the Red Sea crisis (Q123285238) is part of the Houthi
  // involvement in the Gaza war (Q124819767), itself part of the Gaza war (Q122962941); the seizures of the St Nikolas
  // and of an Iranian dhow are part of the crisis; the United States' strikes in Yemen of March and April 2025
  // (Q133287207) are part of the crisis and of the Gaza war directly, and hold the Ras Isa, Farwa and Saada strikes. The
  // July 2024 Houthi–Israel attacks (Q127638355) and the Israeli attack on Doha (Q136190686) are not in the crisis.
  const edges = [['Q124819767', 'Q122962941'], ['Q123285238', 'Q124819767'], ['Q124253753', 'Q123285238'], ['Q124301569', 'Q123285238'],
    ['Q133287207', 'Q123285238'], ['Q133287207', 'Q122962941'], ['Q133894632', 'Q133287207'], ['Q134006902', 'Q133287207'], ['Q134437528', 'Q133287207'],
    ['Q127638355', 'Q122962941'], ['Q127638355', 'Q124819767'], ['Q136190686', 'Q122962941']].map(([c, parent]) => ({ c, parent }));
  const within = partsWithin(edges, new Map(), 'Q122962941', { start: '2023-10-07', end: '2025-10-10' });
  assert.ok(within.has('Q133287207') && within.has('Q134437528'), 'by Wikidata alone the crisis and the strikes in Yemen are the Gaza war\'s');
  const left = leftOutOf('gaza-war', edges);
  assert.deepEqual([...left.keys()].sort(), ['Q123285238', 'Q124253753', 'Q124301569', 'Q133287207', 'Q133894632', 'Q134006902', 'Q134437528']);
  assert.ok(!left.has('Q127638355') && !left.has('Q136190686') && !left.has('Q124819767'), 'the July 2024 attacks, Doha and the Houthi involvement stay');
  assert.equal(leftOutOf('yemen', edges).size, 0, 'no other war loses anything');
  // Every row names its war, its reason with UCDP's figures, and the source the figures are from.
  for (const r of LEFT_OUT) {
    assert.ok(WARS.some(w => w.id === r.war), r.war);
    assert.match(r.qid, /^Q\d+$/);
    assert.match(r.url, /^https:\/\/ucdp\.uu\.se\//);
  }
  const red = LEFT_OUT.find(r => r.qid === 'Q123285238');
  assert.equal(red.ucdp, 16099);
  assert.match(red.why, /130 battle deaths in 2024 and 781 in 2025/);
  assert.match(red.why, /below the 1,000 battle deaths in a year that War Focus asks of an interstate war/);
});

test('data: the Gaza war lists none of the Red Sea crisis and says why in its file', async () => {
  const w = await dataFile('battlefield/focus/data/wars/gaza-war.json');
  const gone = ['Q123285238', 'Q124253753', 'Q124301569', 'Q133287207', 'Q133894632', 'Q134006902', 'Q134437528'];
  assert.deepEqual(w.battles.filter(b => gone.includes(b.q)).map(b => b.n), []);
  assert.ok(w.battles.some(b => b.q === 'Q127638355'), 'the July 2024 Houthi–Israel attacks stay');
  assert.equal(w.leftOut?.length, 1);
  assert.equal(w.leftOut[0].q, 'Q123285238');
  assert.equal(w.leftOut[0].items, gone.length);
  assert.match(w.leftOut[0].why, /781 in 2025/);
  for (const b of w.battles) for (const k of ['up', 'upAlso', 'parts']) assert.ok(![b[k] || []].flat().some(q => gone.includes(q)), `${b.q} ${k}`);
});

test('the page gives the line for what is left out of a war, from its file', () => {
  const app = readFileSync(new URL('../battlefield/focus/app.js', import.meta.url), 'utf8');
  const note = app.slice(app.indexOf('class="src-note"'));
  assert.match(note, /w\.leftOut \|\| \[\]\)\.map\(x => `<b>Left out of this war:<\/b> \$\{esc\(x\.why\)\}/);
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

// S0, the spread fix (16 November 2026): a total spread by recorded battles let a battle Wikidata dates only to its
// year weigh every month of that year ("Battle of Łódź", 1939, weighed January to August 1939, before the war began,
// and so pulled WWII's spread towards 1939's later months). Only a battle whose start and end are known to the month
// weighs; the committed spreads are those the rule gives.
test('rules: a battle dated only to its year weighs no month of a spread total', async () => {
  const { monthWeights } = await import('../battlefield/focus/scripts/rules.mjs');
  const months = ['1939-09', '1939-10', '1939-11', '1939-12'];
  assert.deepEqual(monthWeights(months, [{ s: '1939-01-01', e: '1939-12-31', p: 'y' }]), [1, 1, 1, 1], 'a year-dated battle weighs none');
  assert.deepEqual(monthWeights(months, [{ s: '1939-09-01', e: '1939-12-31', p: null, pe: 'y' }]), [1, 1, 1, 1], 'nor one whose end is known only to the year');
  assert.deepEqual(monthWeights(months, [{ s: '1939-09-01', e: '1939-10-06', p: null }]), [2, 2, 1, 1], 'a day-dated battle weighs each month it spans');
  assert.deepEqual(monthWeights(months, [{ s: '1939-11-01', e: '1939-11-30', p: 'm' }, { s: '1939-10-05', p: null, pe: 'd', e: '1939-12-02' }]), [1, 2, 3, 2]);
  assert.deepEqual(monthWeights(months, [{ s: '1939-09-17', p: 'y', pe: 'd', e: '1939-10-06' }]), [1, 1, 1, 1], 'a start known only to the year');
});

test('data: every spread by recorded battles is the rule\'s (a year-dated battle weighs no month)', async () => {
  const { monthWeights, apportion } = await import('../battlefield/focus/scripts/rules.mjs');
  const d = await dataFile('battlefield/focus/data/index.json');
  let checked = 0;
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`);
    const weights = monthWeights(w.months, w.battles.filter(b => b.s));
    const est = w.months.map((m, i) => i).filter(i => w.estimated[i]);
    // A Correlates of War total is one spread over its months; PRIO's, one a year. A spread whose months hold UCDP
    // events is weighted by them, not by battles (scripts/build.mjs spread).
    const groups = /^Correlates of War/.test(w.deathsSource) ? [est] : [...new Set(est.map(i => w.months[i].slice(0, 4)))].map(y => est.filter(i => w.months[i].startsWith(y)));
    for (const g of groups.filter(g => g.length && !g.some(i => w.cells[i].length))) {
      const total = g.reduce((s, i) => s + w.deaths[i], 0);
      assert.deepEqual(g.map(i => w.deaths[i]), apportion(total, g.map(i => weights[i])), `${x.id}: the spread over ${w.months[g[0]]}–${w.months[g.at(-1)]}`);
      checked++;
    }
  }
  assert.ok(checked > 50, `spreads checked: ${checked}`);
  // Second World War: no year-dated battle of 1939 draws deaths to its first months.
  const ww2 = await dataFile('battlefield/focus/data/wars/ww2.json');
  assert.ok(ww2.battles.some(b => b.p === 'y' && b.s.startsWith('1939')), 'the 1939 year-dated battles are still listed');
});

// S0 (16 November 2026): a battle whose start falls before its war's says so beside its dates (WWII: the Adriatic
// Campaign, April 1939; the air raids on Japan, 15 August 1939). A start dated only to a month or a year counts only
// when the whole month or year is before the war: "1939" alone does not say whether it was before September.
test('figures: a battle that begins before its war\'s start says so', async () => {
  const { beforeWarNote } = await import('../battlefield/focus/figures.mjs');
  assert.equal(beforeWarNote({ s: '1939-08-15', p: null }, '1939-09-01'), 'begins before the war’s start');
  assert.equal(beforeWarNote({ s: '1939-04-01', p: 'm' }, '1939-09-01'), 'begins before the war’s start');
  assert.equal(beforeWarNote({ s: '1939-09-01', p: 'm' }, '1939-09-01'), '', 'its month is the war\'s first');
  assert.equal(beforeWarNote({ s: '1939-01-01', p: 'y' }, '1939-09-01'), '', 'a year that holds the start');
  assert.equal(beforeWarNote({ s: '1938-01-01', p: 'y' }, '1939-09-01'), 'begins before the war’s start');
  assert.equal(beforeWarNote({ s: '1939-09-02' }, '1939-09-01'), '');
  assert.equal(beforeWarNote({ s: null, u: 'undated' }, '1939-09-01'), '');
  const ww2 = await dataFile('battlefield/focus/data/wars/ww2.json');
  const before = ww2.battles.filter(b => beforeWarNote(b, ww2.start)).map(b => b.n).sort();
  assert.deepEqual(before, ['Adriatic Campaign of World War II', 'air raids on Japan']);
  const app = readFileSync(new URL('../battlefield/focus/app.js', import.meta.url), 'utf8');
  assert.match(app, /beforeWarNote\(b, state\.war\?\.start\)/, 'the page writes it beside the battle\'s dates');
});

// S0 (16 November 2026): the documentary's opening reads the first sentences of the war's English Wikipedia summary
// aloud; they are Wikipedia's words (CC BY-SA 4.0), so the narration says whose they are, and the captions with it.
test('figures: the documentary credits Wikipedia for the sentences it reads from its article', async () => {
  const { wikipediaIntro } = await import('../battlefield/focus/figures.mjs');
  assert.equal(wikipediaIntro(['World War II was a global conflict.', 'It lasted six years.'], 'World War II'),
    'Wikipedia’s article “World War II” says: World War II was a global conflict. It lasted six years.');
  assert.equal(wikipediaIntro([], 'World War II'), '');
  const app = readFileSync(new URL('../battlefield/focus/app.js', import.meta.url), 'utf8');
  assert.match(app, /intro \+= ' ' \+ wikipediaIntro\(said\.slice\(0, 3\), w\.wiki\)/);
  assert.doesNotMatch(app, /said\.slice\(0, 3\)\.join/, 'no sentence of the article is read without its credit');
  const html = readFileSync(new URL('../battlefield/focus/index.html', import.meta.url), 'utf8');
  assert.match(html, /opening sentences the documentary reads[^<]*Wikipedia, CC BY-SA 4\.0/);
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

// BF-08: every battle in one of five states; every figure with its kind and source; every detail named by its revision
// or statement; the completeness counts the data's; nothing that is no figure written as one.
test('data: every battle has a figure with its kind and source, a recorded zero, or a reason; its detail names the revision or statement read', async () => {
  const { groupBattles, stateOf, completeness, ownFigure } = await import('../battlefield/focus/figures.mjs');
  const d = await dataFile('battlefield/focus/data/index.json');
  assert.match(d.sources.wikipedia, /CC BY-SA 4\.0/);
  const states = { figure: 0, zero: 0, parts: 0, unread: 0, none: 0 }, bad = [];
  let all = 0, fu = 0;
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`), det = (await dataFile(`battlefield/focus/data/figures/${x.id}.json`)).battles, g = groupBattles(w.battles);
    for (const b of w.battles) {
      all++;
      const s = stateOf(b, g.byQ.get(b.q));
      states[s]++;
      for (const f of [b.fd, b.fc].filter(Boolean)) {
        if (!['fact', 'estimate', 'disputed'].includes(f.status) || !['wikidata', 'wikipedia'].includes(f.src)) bad.push(`${x.id} ${b.q}: ${JSON.stringify(f)}`);
        const lo = f.low ?? f.v, hi = f.high ?? f.v;
        if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi >= lo)) bad.push(`${x.id} ${b.q}: no sure range ${JSON.stringify(f)}`);
        if (f.src === 'wikipedia' && !det[b.q]?.wp?.rev) bad.push(`${x.id} ${b.q}: a Wikipedia figure without the revision read`);
      }
      if (b.fs && (ownFigure(b, 'd') || ownFigure(b, 'c'))) bad.push(`${x.id} ${b.q}: a state of no figure beside a figure`);
      if (!['figure', 'zero', 'parts'].includes(s) && b.fs != null && !['words', 'unread'].includes(b.fs)) bad.push(`${x.id} ${b.q}: no figure and an unknown reason (${b.fs})`);
      if (s === 'none' && b.w && !b.fwp && b.fs !== 'words') bad.push(`${x.id} ${b.q}: an article but no word on why it gave no figure`);
      if (b.fu) { fu++; if (!(b.s >= '1989-01-01' && b.fu.n > 0 && b.fu.km === 25 && b.fu.v >= 0)) bad.push(`${x.id} ${b.q}: UCDP nearby ${JSON.stringify(b.fu)}`); if (s === 'figure') bad.push(`${x.id} ${b.q}: UCDP nearby beside a figure`); }
      for (const st of det[b.q]?.wd || []) if (!/^P(1120|1590|1339|1446)$/.test(st.p) || !['preferred', 'normal'].includes(st.rank)) bad.push(`${x.id} ${b.q}: statement ${JSON.stringify(st)}`);
      if (det[b.q]?.wp && !(det[b.q].wp.rev > 0 && /^\d{4}-\d\d-\d\dT/.test(det[b.q].wp.ts) && det[b.q].wp.t)) bad.push(`${x.id} ${b.q}: revision ${JSON.stringify(det[b.q].wp)}`);
    }
    // The completeness counts are the data's: each battle in exactly one state.
    const c = completeness(w.battles, g);
    assert.equal(c.figure + c.zero + c.parts + c.unread + c.none, w.battles.length, `${x.id}: five states`);
    assert.equal(c.recorded + c.estimate + c.disputed, c.figure, `${x.id}: kinds`);
  }
  assert.deepEqual(bad.slice(0, 20), []);
  assert.equal(Object.values(states).reduce((a, v) => a + v, 0), all);
  // Most battles have a figure now (BF-08 found 495 with deaths and 18 with casualties of 4,242 on 16 November 2026).
  assert.ok(states.figure > all / 2, `${states.figure} of ${all} battles with a figure`);
});

// The review of 16 November 2026 (R3-03, R3-04): the scheduled refresh keeps the articles it read between runs, has the
// time to read them, gives up on a source that is down instead of running out of time, and rebuilds the Master Index's
// War Focus lines in its own commit, so the lake never states last month's figures.
test('workflow: the refresh caches the articles, has an hour, stops asking a source that is down, and rebuilds the Master Index lines it commits', () => {
  const yml = readFileSync(new URL('../.github/workflows/warfocus-refresh.yml', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../battlefield/focus/scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(yml, /timeout-minutes: 60/);
  assert.match(yml, /uses: actions\/cache@v4\s+with:\s+path: \/tmp\/warfocus-src\/wikipedia/);
  assert.match(yml, /node lake\/scripts\/build\.mjs --only battlefield && node --test tests\/master-index\.test\.mjs/);
  assert.match(yml, /git checkout -- lake\/data/);
  assert.match(yml, /paths: battlefield\/focus\/data monthly\/data lake\/data/);
  assert.match(build, /signal: AbortSignal\.timeout\(TIMEOUT\)[\s\S]*signal: AbortSignal\.timeout\(TIMEOUT\)/, 'both sources give up a hung request');
  assert.match(build, /if \(breaker\.wikipedia >= DOWN\) return null/);
  assert.match(build, /breaker\.wikidata < DOWN/);
});

// The review of 16 November 2026: an article of other dates gives no figure (F3); every side is named (P2); casualties
// shown as a battle's are never fewer than its deaths (F7, P3); the civilians' figure alone is never ranked (F2).
test('data: every Wikipedia figure is from an article of the battle\'s own years; every side named; casualties never shown below the deaths', async () => {
  const { groupBattles, shownFigure, deadliest } = await import('../battlefield/focus/figures.mjs');
  const { fitsYears } = await import('../battlefield/focus/scripts/infobox.mjs');
  const d = await dataFile('battlefield/focus/data/index.json'), bad = [];
  let read = 0;
  for (const x of d.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`), det = (await dataFile(`battlefield/focus/data/figures/${x.id}.json`)).battles, g = groupBattles(w.battles);
    for (const b of w.battles) {
      const wp = det[b.q]?.wp;
      if (wp) { read++; if (wp.dy && !fitsYears(wp.dy, b.s, b.e)) bad.push(`${x.id} ${b.q} ${b.n}: its article's box is dated ${wp.dy.join('–')}`); }
      if (b.fwp === 'mismatch' && (b.fd?.src === 'wikipedia' || b.fc?.src === 'wikipedia')) bad.push(`${x.id} ${b.q}: a figure from an article of other dates`);
      for (const s of det[b.q]?.sides || []) if ((s.d || s.c) && (!s.label || /^Side \d/.test(s.label))) bad.push(`${x.id} ${b.q} ${b.n}: a side with a figure and no name (${s.n})`);
      const n = g.byQ.get(b.q), df = shownFigure(n, 'd'), cf = shownFigure(n, 'c');
      if (df && cf && cf.high < df.low && !cf.below) bad.push(`${x.id} ${b.q} ${b.n}: casualties ${cf.high} shown below deaths ${df.low}`);
    }
    for (const n of deadliest(g).ranked) if (n.from === 'own' && n.ownFig.civ) bad.push(`${x.id} ${n.b.q}: ranked on the civilians' deaths alone`);
  }
  assert.ok(read > 2000, `${read} articles read`);
  assert.deepEqual(bad.slice(0, 20), []);
  // The Barah massacre of 2026 is not given the Bara massacre of 1992's 35 dead.
  const sudan = await dataFile('battlefield/focus/data/wars/sudan-2023.json'), barah = sudan.battles.find(b => b.q === 'Q140245459');
  if (barah?.w === 'Bara massacre (India)') assert.equal(barah.fwp, 'mismatch');
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

// BF-08 (16 November 2026): every battle shows a figure with its kind and source, a recorded zero, "Figures not read" or
// "No figure found" with what was searched; never a bare dash, in the window, the lists, the table or the tooltips.
test('page: no battle shows a bare dash; the Battle of Wawon gives each side\'s losses with the source and revision read', pageTest, async t => {
  // Every expectation is worked out from the committed data by figures.mjs, never written in (review R3-02): an edit to
  // an article's box or a new Wikidata link changes the data at the next refresh, and must not stop the deploy gate.
  const kw = await dataFile('battlefield/focus/data/wars/korean-war.json'), det = await dataFile('battlefield/focus/data/figures/korean-war.json');
  const { groupBattles, completeness, completenessText, shownFigure, rangeText, kindWords, searched, stateOf, figureLine } = await import('../battlefield/focus/figures.mjs');
  const g = groupBattles([...kw.battles, ...(kw.undated || [])]);
  const by = n => kw.battles.find(b => b.w === n || b.n === n);
  // Wawon (the battle of Jude's screenshot), or failing it any battle with figures from both sides of its article.
  const wawon = (det.battles[by('Battle of Wawon')?.q]?.wp && by('Battle of Wawon')) || kw.battles.find(b => det.battles[b.q]?.sides?.filter(s => s.d || s.c).length >= 2);
  const haman = kw.battles.find(b => shownFigure(g.byQ.get(b.q), 'd')?.status === 'estimate');
  const third = kw.battles.find(b => stateOf(b, g.byQ.get(b.q)) === 'none' && b.s);
  // The card and the list say the same of every battle (review P1): a few of each kind, wholes counted through parts too.
  const sample = [...new Set([...kw.battles.filter(b => g.byQ.get(b.q).from === 'parts').slice(0, 3), ...kw.battles.filter(b => shownFigure(g.byQ.get(b.q), 'c')?.below).slice(0, 2), ...kw.battles.filter(b => stateOf(b, g.byQ.get(b.q)) === 'figure').slice(0, 3)])];
  const browser = await launch();
  t.after(() => browser.close());
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/battlefield/focus/#war=korean-war&m=1953-07`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#fig-complete', { timeout: 20000 });
    // The completeness line is the data's.
    const c = completeness(kw.battles, groupBattles(kw.battles));
    assert.equal(await page.locator('#fig-complete').innerText(), completenessText(c), `${width}px: the completeness line`);
    assert.match(await page.locator('#deadliest-note').innerText(), /^Of the [\d,]+ battles not counted under a larger one, ranked by deaths: [\d,]+.*Not added into the war's deaths by month\.$/);
    // No bare dash in the panel's lists of battles.
    const bare = await page.evaluate(() => [...document.querySelectorAll('#panel .blist li small')].filter(s => /(^|·)\s*[–-]\s*($|·)/.test(s.textContent)).length);
    assert.equal(bare, 0, `${width}px: a bare dash in the battle lists`);
    // The Battles tab: each figure with its kind; none spans both cells and says what was searched.
    await page.evaluate(() => document.querySelector('#tab-battles').click());
    await page.waitForSelector('#battles-rows tr', { timeout: 10000 });
    const cells = await page.evaluate(() => [...document.querySelectorAll('#battles-rows td.num, #battles-rows td.nofig-cell')].map(td => td.textContent.trim()));
    assert.ok(cells.length >= kw.battles.length, `${width}px: ${cells.length} figure cells`);
    assert.ok(!cells.some(x => /^[–-]?$/.test(x)), `${width}px: an empty or dashed figure cell in the Battles tab`);
    assert.equal(await page.locator('#battles-note').innerText(), completenessText(c));
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(sideways, 0, `${width}px scrolls sideways`);
    // Wawon's window: each side's figure with its kind, as the data has them, and the revision read.
    const open = async q => {
      await page.evaluate(() => document.querySelector('#modal-close').click());
      await page.evaluate(x => document.querySelector(`#battles-rows [data-b="${x}"]`).click(), q);
      await page.waitForFunction(() => document.querySelector('#fig-detail')?.getAttribute('aria-busy') === 'false', null, { timeout: 10000 });
      return page.evaluate(() => ({ boxes: [...document.querySelectorAll('#modal-body .stat.fig')].map(s => s.innerText), detail: document.querySelector('#fig-detail').innerText, focus: !!document.activeElement?.closest('#modal') }));
    };
    const card = await open(wawon.q), wd = shownFigure(g.byQ.get(wawon.q), 'd');
    assert.ok(card.focus, 'the keyboard is in the window (review P11)');
    if (wd) { assert.ok(card.boxes[0].includes(rangeText(wd)), `${card.boxes[0]} has ${rangeText(wd)}`); assert.match(card.boxes[0], new RegExp(kindWords(wd.status), 'i')); }
    for (const s of det.battles[wawon.q].sides.filter(s => s.d)) assert.ok(card.detail.includes(`${rangeText(s.d)} killed`), `${s.label}: ${rangeText(s.d)} killed`);
    for (const s of det.battles[wawon.q].sides) assert.ok(s.label && !/^Side \d/.test(s.label) && card.detail.includes(s.label), `every side named: ${s.label}`);
    assert.match(card.detail, new RegExp(`revision ${det.battles[wawon.q].wp.rev}`));
    assert.match(card.detail, /CC BY-SA 4\.0/);
    assert.ok(!card.boxes.some(x => /^\s*(Deaths|Casualties)\s*[–-]\s*$/m.test(x)), 'no dash in the boxes');
    // An estimate says so in words; a battle with nothing says what was searched.
    assert.match((await open(haman.q)).boxes[0], /Estimate/i);
    assert.match((await open(third.q)).boxes[0], /No figure found/);
    assert.equal(await page.locator('#modal-body .searched').innerText(), searched(third));
    // The card's figure and kind are the list's, for wholes counted through their parts as for any battle (review P1).
    for (const b of sample) {
      const n = g.byQ.get(b.q), line = figureLine(n), boxes = (await open(b.q)).boxes;
      for (const [k, m] of [[0, 'd'], [1, 'c']]) {
        const f = shownFigure(n, m);
        if (!f) continue;
        if (f.below) { assert.match(boxes[k], /Not given for the whole/, `${b.n}: casualties below the deaths`); continue; }
        assert.ok(boxes[k].includes(rangeText(f)) && new RegExp(kindWords(f.status), 'i').test(boxes[k]), `${b.n} ${m}: ${boxes[k]} against ${rangeText(f)} ${kindWords(f.status)}`);
        if (k === 0) assert.ok(line.startsWith(rangeText(f)) && line.includes(kindWords(f.status)), `${b.n}: the list says ${line}`);
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${width}px: the window scrolls sideways`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('page: over a period the side layer reads every month: Italy, Axis until its armistice, is shown faded in September 1943', pageTest, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // From October 1939 (a start on the war's first month rests there: the war so far, not a period).
  await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1943-09&f=1939-10`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('path.state').length > 10 && /Oct 1939/.test(document.querySelector('#date')?.textContent || ''), null, { timeout: 20000 });
  const cls = gw => page.evaluate(g => d3.selectAll('path.state').filter(f => f.properties.gw === g).attr('class'), gw);
  assert.match(await cls(325), /\bside-b earlier\b/, 'Italy in the side it last held, faded');
  assert.match(await cls(220), /\bocc-b\b.*\bchanged\b/, 'France held by the Axis, and changed in the period');
  assert.match(await page.locator('#legend').innerText(), /On a side earlier in the period/);
  assert.match(await page.locator('#caption').innerText(), /faded with a broken outline in the side they last held/);
  // The handles together: as before, nothing faded or outlined.
  await page.evaluate(() => { location.hash = '#war=ww2&m=1943-09'; });
  await page.waitForFunction(() => document.querySelector('#date')?.textContent === 'September 1943', null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('path.state.earlier').length), 0);
  assert.deepEqual(errors, []);
});

// 17 November 2026 (the verifier of BF-08, 16 November): a count of one was written with a plural noun: "1 deaths in 1
// recorded clash" (UCDP nearby, Operation Bøllebank), "at least 1 deaths" (the Palestro Ambush), "at least 1
// casualties", "Figures for 0 of 1 battles" (Khalkhin Gol). Every count now takes its noun from one helper
// (figures.mjs noun and count). Every line War Focus writes from the committed data is read here for a count of one
// with a plural noun, and the test also checks it found counts of one, so it cannot pass on no data.
const ONE_PLURAL = /(^|[^\d,.~–-])1 (deaths|casualties|battles|operations|clashes|recorded clashes|months|parts|estimates|steps)\b/;
test('every count of one takes the singular, through one helper, in every line War Focus writes from its data', async () => {
  const F = await import('../battlefield/focus/figures.mjs');
  assert.equal(F.count?.(1, 'death'), '1 death');
  assert.equal(F.count(2500, 'death'), '2,500 deaths');
  assert.equal(F.count(0, 'recorded clash', 'recorded clashes'), '0 recorded clashes');
  assert.equal(F.count(1, 'casualty', 'casualties'), '1 casualty');
  assert.equal(F.noun(1, 'battle'), 'battle');
  assert.equal(F.noun(3, 'battle'), 'battles');
  const index = await dataFile('battlefield/focus/data/index.json');
  const bad = [], ones = new Set();
  const read = (where, s) => {
    if (!s) return;
    if (ONE_PLURAL.test(s)) bad.push(`${where}: ${s}`);
    const m = s.match(/(^|[^\d,.~–-])1 (death|casualty|battle|recorded clash)\b/);
    if (m) ones.add(m[2]);
  };
  for (const x of index.wars) {
    const w = await dataFile(`battlefield/focus/data/wars/${x.id}.json`), all = [...w.battles, ...(w.undated || [])], g = F.groupBattles(all);
    for (const b of all) {
      const n = g.byQ.get(b.q);
      read(`${x.id} ${b.n}`, n && F.figureLine(n));
      read(`${x.id} ${b.n}`, n && F.figureText(n));
      read(`${x.id} ${b.n}`, F.searched(b));
    }
    read(x.id, F.completenessText(F.completeness(all, g)));
    read(x.id, F.deadliestNote(F.deadliest(g)));
  }
  assert.deepEqual(bad, [], 'a count of one with a plural noun');
  for (const one of ['death', 'recorded clash', 'battle']) assert.ok(ones.has(one), `the data has a count of one ${one} to check (found: ${[...ones].join(', ')})`);
});

// 17 November 2026 (the same verifier): on a phone a battle's window jumped while its detail loaded: centred, it moved
// up by half of what the detail (each side's figures and the sources read, from data/figures/<war>.json) added, and the
// links and "Go to <month>" below the detail moved down with it, as the reader went to choose the month. The window now
// keeps its top and the detail comes last, so nothing above it moves. The detail's file is held here until the window
// is measured, as on a slow connection. The page's own counts of one (the clashes' tooltip and the deadliest clashes,
// UCDP's line in the window) take the singular too.
test('page: a battle\'s window keeps its place while its detail loads, and a count of one is singular, at 390 and 1440 wide', pageTest, async t => {
  const F = await import('../battlefield/focus/figures.mjs');
  const w = await dataFile('battlefield/focus/data/wars/bosnian-war.json'), g = F.groupBattles([...w.battles, ...(w.undated || [])]);
  // From the data: a battle with no figure whose UCDP line is one death in one clash; a month whose deadliest clashes
  // include one of a single death; a month with a mark for one death in one clash.
  const one = w.battles.find(b => b.s && b.fu?.v === 1 && b.fu?.n === 1 && ['none', 'unread'].includes(F.stateOf(b, g.byQ.get(b.q))));
  const topMonth = w.months[w.top.findIndex(c => c.some(x => x[1] === 1))];
  const cellMonth = w.months[w.cells.findIndex(c => c.some(x => x[2] === 1 && x[3] === 1))];
  assert.ok(one && topMonth && cellMonth, 'the Bosnian War has a count of one of each kind');
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let release; const held = new Promise(r => { release = r; });
    await page.route(/\/data\/figures\//, async r => { await held; await r.continue(); });
    const go = async m => {
      await page.goto(`${BASE}/battlefield/focus/#war=bosnian-war&m=${m}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(x => document.querySelector('#date')?.textContent && document.querySelector('#panel h2') && location.hash.includes(`m=${x}`), m, { timeout: 20000 });
    };
    // The deadliest clashes of a month with one of a single death.
    await go(topMonth);
    const panel = await page.locator('#panel').innerText();
    assert.match(panel, /Deadliest clashes this month[\s\S]*\b1 death · \S/i, `${width}: the deadliest clashes`);
    // F1 (the review of 17 November): the dot keeps a space on each side, so it never runs into the place's name.
    assert.doesNotMatch(panel, /\bdeaths? ·\S/, `${width}: a space after the dot`);
    assert.doesNotMatch(panel, ONE_PLURAL, `${width}: the panel`);
    // A clash's mark of one death in one clash: its tooltip.
    await page.goto('about:blank');
    await go(cellMonth);
    await page.waitForFunction(() => document.querySelectorAll('#map circle.cell').length, null, { timeout: 20000 });
    const tip = await page.evaluate(() => {
      const c = d3.selectAll('#map circle.cell').filter(d => d[2] === 1 && d[3] === 1).node(), b = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
      return document.querySelector('#tooltip').innerText;
    });
    assert.match(tip, /^1 death\s*1 recorded clash\b/, `${width}: the tooltip reads ${tip}`);
    // The battle's window, its detail held.
    await page.evaluate(() => document.querySelector('#tab-battles').click());
    await page.waitForSelector('#battles-rows tr', { timeout: 10000 });
    await page.evaluate(q => document.querySelector(`#battles-rows [data-b="${q}"]`).click(), one.q);
    await page.waitForSelector('#modal:not([hidden]) #fig-detail[aria-busy="true"]', { timeout: 10000 });
    const at = () => page.evaluate(() => Object.fromEntries([['window', '.modal-box'], ['title', '#modal-title'], ['figures', '#modal-body .figs'], ['ucdp', '#modal-body .ucdp-near'],
      ['wikidata', '#modal-body a[href*="wikidata.org"]'], ['go to', '#jump'], ['detail', '#fig-detail']].map(([k, s]) => [k, document.querySelector(s) && Math.round(document.querySelector(s).getBoundingClientRect().top)])));
    const tall = () => page.evaluate(() => document.querySelector('.modal-box').getBoundingClientRect().height);
    const before = await at(), height0 = await tall();
    assert.ok(before['go to'] != null, `${width}: the window offers its month`);
    release();
    await page.waitForFunction(() => document.querySelector('#fig-detail')?.getAttribute('aria-busy') === 'false', null, { timeout: 20000 });
    await page.waitForTimeout(100);
    const after = await at(), height1 = await tall();
    assert.ok(height1 > height0, `${width}: the detail came in (${height0} -> ${height1})`);
    assert.deepEqual(after, before, `${width}: nothing in the window moved as its detail came in`);
    assert.match(await page.locator('#modal-body .ucdp-near').innerText(), /UCDP, nearby: 1 death in 1 recorded clash within/);
    assert.equal(await page.locator('#modal-body .searched').innerText(), F.searched(one));
    assert.match(F.searched(one), /1 death in 1 recorded clash within/);
    assert.doesNotMatch(await page.locator('#modal-body').innerText(), ONE_PLURAL, `${width}: the window`);
    // The window stays on screen, and the page does not scroll sideways.
    const box = await page.evaluate(() => { const b = document.querySelector('.modal-box').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    assert.ok(box.top >= 0 && box.bottom <= height, `${width}: the window on screen (${box.top}–${box.bottom})`);
    assert.equal(box.sideways, 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
