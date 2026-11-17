// The Omni-Map's pure core (design S1, PRP-SCHOLAR-USP-DESIGN.md 2, 3, 5.2, 5.7, 7.3 and the reader-pane contract):
//   design/vm-recipe.js  the view recipe VR/1 (3.2, 3.3)
//   design/vm-dates.js   a date at its recorded precision and calendar; EDTF only at export (3.2, 5.2)
//   design/vm-click.js   the click: the vm:click detail, the resolver and its rules (2.1, 2.5, contract 1, 2, 5, 6)
//   design/prp-map.js    the dated-borders format, sliceAt, the extent through PRPFocus, legends, the layer reader (7.3, 4.2)
//   design/vm-bundle.js  the saved research version: rows, features, the pin, the stored zip, three citations (5.7, 5.8)
// No page, no network, no data build: small fixtures in tests/fixtures/omni, among them a frozen copy of the lake
// records and tagged paragraphs the resolver reads (lake-records.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import '../design/prp-focus.js';
import '../design/prp-map.js';
import { KEYS, readRecipe, writeRecipe, sameRecipe, readHost, withHost } from '../design/vm-recipe.js';
import { toEdtf, fromEdtf, intervalToEdtf, valueDateToEdtf, yearOf, sortYear, addYears, formatYear, formatSpan, formatValueDate, precisionOf, precisionWord } from '../design/vm-dates.js';
import { clickDetail, kindOf, readPeriods, resolve, windowFor, frameFor, stepFor, followMessage, GESTURES } from '../design/vm-click.js';
import { COLUMNS, rowsCsv, featuresGeojson, pin, metadata, cslJson, ris, bibtex, apa, crc32, zipStored, readZip, bundleFiles, dataFiles } from '../design/vm-bundle.js';

const M = globalThis.PRPMap;
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
// The Master Index records and tagged paragraphs the resolver tests read, frozen (tests/fixtures/omni/lake-records.json),
// so the monthly lake refresh (lake-refresh.yml) and the re-tagging of the books cannot change what these tests assert.
const LAKE = read('./fixtures/omni/lake-records.json');
const lookup = q => LAKE.records[q] || null;
const digest = async bytes => createHash('sha256').update(bytes).digest();
const sha12 = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex').slice(0, 12);

/* ---------- VR/1 (3.2, 3.3) ---------- */
// 3.3's three examples, their placeholders filled: example 2's <hash> with a pin, example 3's <Q> with the war of 3.2's
// own example of a layer filter.
const EX1 = 'vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles,places&focus=Q153529&q=Q236853&from=neo:the-prince/3/c03-p03';
const EX2 = 'vr=1&t=1980..2025&at=2025&show=frame&step=y&fill=an:1&an=d%3Dnational-key-series%26filter%3Dindicator%3Aeq%3ASP.DYN.LE00.IN&focus=bbox:-25,34,45,72&rec=1&ds=national-key-series@20261115,borders@ne-5.1.1&pin=8f3a2c91d0be';
const EX3 = 'vr=1&t=-431..-404&show=upto&step=y&fill=borders&l=battles:partOf=Q33143,places&focus=Q844930,Q5690&film=1&pace=4&narr=gen&ds=cliopatria@v0.2.1,lake@20261115T1109Z';

test('VR/1: the three worked examples of 3.3 read and write back to the identical string', () => {
  for (const ex of [EX1, EX2, EX3]) {
    const r = readRecipe(ex);
    assert.ok(r, ex);
    assert.equal(writeRecipe(r), ex);
    assert.equal(writeRecipe(readRecipe('#' + ex)), ex, 'a leading # is read');
    assert.equal(writeRecipe(readRecipe('omni/index.html#' + ex)), ex, 'a whole address is read from its hash');
  }
  assert.deepEqual(readRecipe(EX1), {
    vr: 1, t: { from: 1446, to: 1514 }, at: 1494, show: 'frame', step: 'y', base: 'plain', fill: 'borders',
    l: [{ id: 'battles' }, { id: 'places' }], focus: ['Q153529'], q: 'Q236853', from: 'neo:the-prince/3/c03-p03',
  });
  const r2 = readRecipe(EX2);
  assert.equal(r2.an, 'd=national-key-series&filter=indicator:eq:SP.DYN.LE00.IN');
  assert.deepEqual(r2.focus, ['bbox:-25,34,45,72']);
  assert.deepEqual(r2.ds, [{ id: 'national-key-series', version: '20261115' }, { id: 'borders', version: 'ne-5.1.1' }]);
  assert.equal(r2.rec, 1); assert.equal(r2.pin, '8f3a2c91d0be'); assert.equal(r2.fill, 'an:1');
  const r3 = readRecipe(EX3);
  assert.deepEqual(r3.t, { from: -431, to: -404 });
  assert.deepEqual(r3.l, [{ id: 'battles', field: 'partOf', value: 'Q33143' }, { id: 'places' }]);
  assert.equal(r3.film, 1); assert.equal(r3.pace, 4); assert.equal(r3.narr, 'gen');
  assert.equal(KEYS[0], 'vr'); assert.equal(KEYS.at(-1), 'pin', 'the pin is written last, so a bundle appends it');
});

test('VR/1: equal recipes give equal strings whatever order their parts were given in; months and days', () => {
  const a = { q: 'Q236853', vr: 1, focus: ['Q153529'], t: { to: 1514, from: 1446 }, step: 'y', at: 1494 };
  const b = { at: 1494, t: { from: 1446, to: 1514 }, vr: 1, step: 'y', focus: ['Q153529'], q: 'Q236853' };
  assert.equal(writeRecipe(a), writeRecipe(b));
  assert.equal(writeRecipe(a), 'vr=1&t=1446..1514&at=1494&step=y&focus=Q153529&q=Q236853');
  const m = readRecipe('vr=1&t=1756-05..1763-02&at=1756-08-29&step=m');
  assert.deepEqual(m.t, { from: '1756-05', to: '1763-02' }); assert.equal(m.at, '1756-08-29');
  assert.equal(writeRecipe(m), 'vr=1&t=1756-05..1763-02&at=1756-08-29&step=m');
  assert.deepEqual(readRecipe('vr=1&t=-0431-05..-404').t, { from: '-0431-05', to: -404 }, 'a BC month');
});

test('VR/1: since, the start of a period the reader chose, follows at and round-trips (review X3)', () => {
  assert.equal(KEYS[KEYS.indexOf('at') + 1], 'since', 'written straight after the frame');
  const s = 'vr=1&t=1446..1514&at=1509&since=1495&show=upto&step=y&base=plain&fill=borders&l=battles';
  assert.equal(readRecipe(s).since, 1495);
  assert.equal(writeRecipe(readRecipe(s)), s);
  assert.equal(writeRecipe({ vr: 1, since: 1495, at: 1509, t: { from: 1446, to: 1514 }, show: 'upto' }), 'vr=1&t=1446..1514&at=1509&since=1495&show=upto');
  assert.equal(readRecipe('vr=1&at=1509&since=0').since, undefined, 'no year 0');
  assert.equal(readRecipe('vr=1&at=1509&since=x').since, undefined, 'a malformed start reads as absent');
  assert.equal(readRecipe('vr=1&at=-426&since=-431').since, -431, 'a BC start');
  assert.equal(writeRecipe({ vr: 1, at: 1509, since: null }), 'vr=1&at=1509', 'no start: the period at its rest');
});

test('VR/1: a malformed key reads as absent and never throws; a recipe that is not VR/1 reads as null', () => {
  const base = 'vr=1&t=1446..1514&at=1494&step=y';
  assert.equal(readRecipe(base.replace('1446..1514', '1446..x')).t, undefined);
  assert.equal(readRecipe(base.replace('1446..1514', '1514..1446')).t, undefined, 'a window that runs backwards');
  assert.equal(readRecipe(base.replace('1446..1514', '0..1514')).t, undefined, 'there is no year 0');
  assert.equal(readRecipe(base + '&step=w').step, 'y', 'the first step stands; a second, malformed one is ignored');
  assert.equal(readRecipe('vr=1&step=w').step, undefined);
  assert.equal(readRecipe('vr=1&pin=xyz').pin, undefined);
  assert.equal(readRecipe('vr=1&pin=8F3A2C91D0BE').pin, undefined, 'a pin is twelve lower-case hex digits');
  assert.equal(readRecipe('vr=1&l=a,b,c,d').l, undefined, 'at most three layers');
  assert.deepEqual(readRecipe('vr=1&l=a,b,c').l, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.equal(readRecipe('vr=1&focus=Q1,bbox:1,2,3').focus, undefined, 'a box needs four numbers');
  assert.equal(readRecipe('vr=1&focus=Q1,bbox:1,50,3,40').focus, undefined, 'a box whose south is north of its north');
  assert.deepEqual(readRecipe('vr=1&focus=ITA,gw:325,Q38,bbox:6,36,19,48').focus, ['ITA', 'gw:325', 'Q38', 'bbox:6,36,19,48']);
  assert.equal(readRecipe('vr=1&rec=3').rec, undefined);
  assert.equal(readRecipe('vr=1&pace=61').pace, undefined);
  assert.equal(readRecipe('vr=1&show=all').show, undefined);
  assert.equal(readRecipe('vr=1&base=topo').base, undefined);
  assert.equal(readRecipe('vr=1&q=Q0').q, undefined);
  assert.equal(readRecipe('vr=1&an=%E0%A4%A').an, undefined, 'a broken percent-encoding');
  assert.equal(readRecipe('vr=1&from=no-colon').from, undefined);
  assert.equal(readRecipe('vr=1&ds=lake').ds, undefined, 'a pin needs its version');
  assert.equal(readRecipe('vr=2&t=1446..1514'), null);
  assert.equal(readRecipe('t=1446..1514'), null, 'no version: not a VR/1 recipe');
  assert.equal(readRecipe(''), null); assert.equal(readRecipe(null), null); assert.equal(readRecipe(42), null);
  assert.equal(writeRecipe(null), ''); assert.equal(writeRecipe({ t: { from: 'x', to: 2 } }), 'vr=1');
});

test('VR/1: host is a frame-only key outside the recipe, never counted in a comparison', () => {
  assert.equal(readHost('#' + EX1 + '&host=neo'), 'neo');
  assert.equal(readHost(EX1 + '&host=kino'), 'kino');
  assert.equal(readHost(EX1 + '&host=other'), null);
  assert.equal(readHost(EX1), null);
  assert.equal(withHost(EX1, 'neo'), EX1 + '&host=neo');
  assert.equal(withHost(EX1 + '&host=kino', 'neo'), EX1 + '&host=neo');
  assert.equal(withHost(EX1, 'bad'), EX1);
  assert.equal(readRecipe(EX1 + '&host=neo').host, undefined);
  assert.ok(sameRecipe(EX1 + '&host=neo', EX1));
  assert.ok(sameRecipe(readRecipe(EX1), EX1));
  assert.ok(!sameRecipe(EX1, EX1.replace('at=1494', 'at=1495')));
  assert.ok(!sameRecipe('vr=2', 'vr=2'), 'what is not a recipe equals nothing');
});

/* ---------- dates (3.2, 5.2) ---------- */
test('vm-dates: the design\'s pinned cases: lake -0356 is EDTF -0355 is 356 BC; -426..-425 is -0425/-0424', () => {
  assert.equal(toEdtf('-0356'), '-0355');
  assert.equal(fromEdtf('-0355'), '-0356');
  assert.equal(formatValueDate({ from: '-0356', p: 9 }), '356 BC');
  assert.equal(formatYear(-356), '356 BC');
  assert.equal(intervalToEdtf('-426..-425'), '-0425/-0424');
  assert.equal(intervalToEdtf(-426, -425), '-0425/-0424');
  assert.equal(toEdtf('-0356-07-20'), '-0355-07-20');
  assert.equal(toEdtf('1495-07-06'), '1495-07-06');
  assert.equal(toEdtf(-1), '0000'); assert.equal(fromEdtf('0000'), '-0001');
  assert.equal(toEdtf(1494), '1494'); assert.equal(fromEdtf('1494'), '1494');
  assert.equal(toEdtf('nonsense'), null); assert.equal(fromEdtf('1494~'), null, 'no ~ is read: EDTF appears only at export');
});

test('vm-dates: years are signed historical years with no year 0', () => {
  assert.equal(yearOf('-0356-07-20'), -356); assert.equal(yearOf('1495-07-06'), 1495); assert.equal(yearOf(1494), 1494);
  assert.equal(yearOf({ from: '1509-05-14' }), 1509); assert.equal(yearOf('x'), null); assert.equal(yearOf(0), null);
  assert.equal(sortYear({ from: '1495-07-06', p: 11 }), 1495);
  assert.equal(addYears(-1, 1), 1); assert.equal(addYears(1, -1), -1); assert.equal(addYears(-431, 27), -404); assert.equal(addYears(1446, 68), 1514);
  assert.equal(formatSpan(1446, 1514), '1446–1514');
  assert.equal(formatSpan(-431, -404), '431–404 BC');
  assert.equal(formatSpan(-50, 14), '50 BC–AD 14');
  assert.equal(formatSpan(1494, 1494), '1494');
  assert.equal(precisionOf('1495-07-06'), 11); assert.equal(precisionOf('1513-12'), 10); assert.equal(precisionOf('-0323'), 9);
  assert.equal(precisionOf('1500', 7), 7);
  assert.equal(precisionWord(11), 'day'); assert.equal(precisionWord(7), 'century');
});

test('vm-dates: a date in words is never more precise than stored, with its calendar as its source records it', () => {
  assert.equal(formatValueDate({ from: '1509-05-14', p: 11, cal: 'julian' }), '14 May 1509 (Julian calendar)');
  assert.equal(formatValueDate({ from: '1495-07-06', p: 11, cal: 'gregorian' }, { source: 'Wikidata' }),
    '6 July 1495 (Gregorian calendar, as Wikidata records it; the Gregorian calendar began in 1582)');
  assert.equal(formatValueDate({ from: '1495-07-06', p: 11, cal: 'gregorian' }),
    '6 July 1495 (Gregorian calendar, as its source records it; the Gregorian calendar began in 1582)');
  assert.equal(formatValueDate({ from: '1695-07-06', p: 11, cal: 'gregorian' }), '6 July 1695', 'after 1582 Gregorian needs no note');
  assert.equal(formatValueDate({ from: '1495-07-06', p: 11 }), '6 July 1495', 'no calendar recorded: none is claimed');
  assert.equal(formatValueDate({ from: '1495-07-06', p: 10 }), 'July 1495');
  assert.equal(formatValueDate({ from: '1495-07-06', p: 9 }), '1495', 'a year never shows its month');
  assert.equal(formatValueDate({ from: '1500', p: 7 }), '15th century');
  assert.equal(formatValueDate({ from: '1560', p: 8 }), '1560s');
  assert.equal(formatValueDate({ from: '-2300', p: 9, approx: true }), 'c. 2300 BC');
  assert.equal(formatValueDate({ from: '-426', to: '-425', p: 9, orig: '426/5 BC' }), '426–425 BC (recorded as 426/5 BC)');
  assert.equal(formatValueDate({ from: '1990-03', p: 10, uncertain: true }), 'March 1990 (uncertain)');
  assert.equal(formatValueDate(null), '');
  assert.equal(valueDateToEdtf({ from: '1495-07-06', p: 9 }), '1495');
  assert.equal(valueDateToEdtf({ from: '1495-07-06', p: 11 }), '1495-07-06');
  assert.equal(valueDateToEdtf({ from: '1500', p: 7 }), '1401/1500', 'a century as Wikidata reads it');
  assert.equal(valueDateToEdtf({ from: '1492', to: '1496', p: 9 }), '1492/1496');
  assert.equal(valueDateToEdtf({ from: '-2300', p: 9, approx: true }), '-2299~');
});

/* ---------- the click (2.1, 2.5, contract 1, 2, 5, 6) ---------- */
const prince = { era: LAKE.era };
const para = (ch, id) => (LAKE.paragraphs[id]?.ch === ch ? { id, terms: LAKE.paragraphs[id].terms } : null);
// The paragraph's tagged places, in order of first appearance, as the reader hands them on.
const placesOf = p => [...new Set(p.terms.map(t => t.qid))].filter(q => lookup(q)?.type === 'place');
// The two battles VM holds for 1400–1600, with their dates as the planner read them from Wikidata on 17 November 2026.
const BATTLES = [
  { id: 'Q764793', q: 'Q764793', label: 'Battle of Fornovo', date: { from: '1495-07-06', p: 11, cal: 'gregorian' }, sortYear: 1495, pt: [10.1, 44.68333333] },
  { id: 'Q1754732', q: 'Q1754732', label: 'Battle of Agnadello', date: { from: '1509-05-14', p: 11, cal: 'julian' }, sortYear: 1509, pt: [9.56667, 45.45] },
];
const ludovico = lookup('Q236853');
const fromNeo = (p, ch, q) => ({ module: 'neo-classic', at: `bibliotheca/neo/index.html#book=the-prince&ch=${ch}&p=${p}&t=${q}`, passage: { book: 'the-prince', ch, p } });
const ctxFor = (p, extra = {}) => ({ today: '2026-11-17', era: prince.era, lookup, passagePlaces: placesOf(p), battles: BATTLES, ...extra });

test('resolve: Ludovico Sforza from The Prince III, c03-p03, with no periods record (2.1\'s test)', () => {
  assert.equal(ludovico.facts.born, '1452-07-27'); assert.equal(ludovico.facts.died, '1508-05-27');
  assert.equal(kindOf(ludovico), 'person');
  const r = resolve(ludovico, fromNeo('c03-p03', 3, 'Q236853'), ctxFor(para(3, 'c03-p03')));
  assert.deepEqual(Object.keys(r).sort(), ['offers', 'recipe', 'related', 'thin'], 'exactly the contract\'s four keys');
  const v = readRecipe(r.recipe);
  assert.deepEqual(v.t, { from: 1446, to: 1514 });
  assert.equal(v.at, 1494); assert.equal(v.step, 'y'); assert.equal(v.show, 'frame');
  assert.ok(v.focus.includes('Q153529'), 'the Duchy of Milan is in focus');
  assert.equal(r.recipe, 'vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853&from=neo:the-prince/3/c03-p03');
  const passage = r.offers.find(o => o.id === 'passage'), life = r.offers.find(o => o.id === 'life');
  assert.equal(passage.available, false); assert.equal(passage.reason, 'This paragraph has no periods record yet');
  assert.equal(life.available, true); assert.equal(life.name, 'Its whole life'); assert.equal(life.recipe, r.recipe);
  assert.equal(r.offers.find(o => o.id === 'entry').at, 'encyclopedia/index.html#Q236853');
  assert.equal(r.offers.find(o => o.id === 'wiki').at, 'https://en.wikipedia.org/wiki/Ludovico_Sforza');
  for (const o of r.offers) for (const k of ['id', 'name', 'at', 'why', 'available']) assert.ok(k in o, `${o.id} has ${k}`);
  const group = g => r.related.find(x => x.group === g)?.items.map(i => i.qid);
  assert.deepEqual(group('Offices'), ['Q58796672']);
  assert.deepEqual(group('Places in this passage'), ['Q70972', 'Q153529']);
  assert.deepEqual(group('Battles VM holds for these years'), ['Q764793', 'Q1754732']);
  for (const g of r.related) for (const i of g.items) for (const k of ['qid', 'label', 'why', 'at']) assert.ok(k in i);
  assert.equal(r.thin, false);
});

test('resolve: a checked periods record of 1499..1500 sets window and frame; an unchecked one is offered, never the default', () => {
  const fixture = read('./fixtures/omni/periods.json');
  const rec = readPeriods(fixture)('c03-p03');
  assert.ok(rec && rec.checkedBy);
  const from = { ...fromNeo('c03-p03', 3, 'Q236853'), periods: rec.periods, places: rec.places };
  const r = resolve(ludovico, from, ctxFor(para(3, 'c03-p03'), { record: rec }));
  const v = readRecipe(r.recipe);
  assert.deepEqual(v.t, { from: 1499, to: 1500 }); assert.equal(v.at, 1499); assert.equal(v.step, 'y');
  assert.deepEqual(v.focus, ['Q70972', 'Q153529']);
  const [first, second] = r.offers;
  assert.equal(first.id, 'passage'); assert.equal(first.available, true); assert.equal(first.recipe, r.recipe);
  assert.equal(second.id, 'life'); assert.deepEqual(readRecipe(second.recipe).t, { from: 1446, to: 1514 });
  // The same record with no second reader: the default stays the life, the passage is a chip.
  const unchecked = structuredClone(fixture);
  unchecked.checkedBy = null; unchecked.paragraphs['c03-p03'].checkedBy = null;
  const urec = readPeriods(unchecked)('c03-p03');
  assert.ok(urec && !urec.checkedBy);
  const u = resolve(ludovico, fromNeo('c03-p03', 3, 'Q236853'), ctxFor(para(3, 'c03-p03'), { record: urec }));
  assert.deepEqual(readRecipe(u.recipe).t, { from: 1446, to: 1514 }); assert.equal(readRecipe(u.recipe).at, 1494);
  const chip = u.offers.find(o => o.id === 'passage');
  assert.equal(chip.available, true); assert.deepEqual(readRecipe(chip.recipe).t, { from: 1499, to: 1500 });
  assert.match(chip.why, /not yet checked/);
  // readPeriods: a missing or malformed file, paragraph or period reads as no record.
  assert.equal(readPeriods(null)('c03-p03'), null);
  assert.equal(readPeriods(fixture)('c03-p04'), null);
  const bad = structuredClone(fixture); bad.paragraphs['c03-p03'].periods[0].basis = 'guessed';
  assert.equal(readPeriods(bad)('c03-p03'), null);
  const back = structuredClone(fixture); back.paragraphs['c03-p03'].periods[0] = { from: 1500, to: 1499, p: 9, basis: 'stated' };
  assert.equal(readPeriods(back)('c03-p03'), null);
});

test('resolve: a battle opens a year either side; a present-day Country is left out of focus (Fornovo, 2.3)', () => {
  const fornovo = lookup('Q764793');
  assert.equal(kindOf(fornovo), 'battle');
  assert.deepEqual(fornovo.rel.Country, [['Q38', 'Italy']]);
  assert.equal(lookup('Q38').facts.founded, '1946-06-18');
  const r = resolve(fornovo, fromNeo('c26-p08', 26, 'Q764793'), ctxFor(para(26, 'c26-p08')));
  const v = readRecipe(r.recipe);
  assert.deepEqual(v.t, { from: 1494, to: 1496 });
  assert.equal(v.step, 'y', 'the borders fill steps by year, the coarsest of the three');
  assert.ok(!v.focus?.includes('Q38'), 'modern Italy is never drawn for 1495');
  assert.ok(v.focus.includes('Q764793'), 'the battle\'s own point');
  const wf = r.offers.find(o => o.id === 'war-focus');
  assert.equal(wf.available, false); assert.equal(wf.reason, 'no War Focus file for this war');
  const withWar = resolve({ ...fornovo, rel: { ...fornovo.rel, 'Part of': [['Q1355145', 'Italian War of 1494–1498']] } },
    fromNeo('c26-p08', 26, 'Q764793'), ctxFor(para(26, 'c26-p08'), { wars: [{ id: 'italian-1494', qid: 'Q1355145', name: 'Italian War of 1494–1498' }] }));
  const wf2 = withWar.offers.find(o => o.id === 'war-focus');
  assert.equal(wf2.available, true); assert.equal(wf2.at, 'battlefield/focus/index.html#war=italian-1494');
  assert.equal(r.thin, false);
  assert.equal(kindOf({ type: 'conflict', facts: { start: '1494', end: '1498' } }), 'war');
  assert.equal(kindOf({ type: 'place' }), 'place'); assert.equal(kindOf({ type: 'idea' }), 'idea'); assert.equal(kindOf(null), null);
});

test('resolve: the window, frame and step rules on their own', () => {
  assert.deepEqual(windowFor({ facts: { born: '1452-07-27', died: '1508-05-27' } }, {}), { from: 1446, to: 1514, step: 'y', p: 11 });
  assert.deepEqual(windowFor({ facts: { date: '1495-07-06' } }, { kind: 'battle' }).from, 1494);
  assert.deepEqual([windowFor({ facts: { date: '1789-07-14' } }, { kind: 'event' })].map(w => [w.from, w.to]), [[1784, 1794]], 'a lone date: five years each way');
  const living = windowFor({ facts: { born: '1950-01-01' } }, { kind: 'person', today: '2026-11-17' });
  assert.deepEqual([living.from, living.to], [1942, 2026], 'a living person ends today, never in the future');
  assert.deepEqual([windowFor({ facts: { born: '1452' } }, { kind: 'person', today: '2026-11-17' })].map(w => [w.from, w.to]), [[1447, 1457]],
    'a birth with no death long ago is a lone date, not a life running to today');
  assert.equal(windowFor({ facts: {} }, {}), null);
  const w = windowFor({ facts: { founded: '1395-05-11', dissolved: '1797-10-17' } }, {});
  assert.deepEqual([w.from, w.to, w.step], [1350, 1840, '10y'], 'four centuries step by decades, rounded outward');
  // Astronomical year 0 is 1 BC (historical -1), never AD 1 (review X5): an eight-year life ending in 2 BC is widened
  // by one year each way, to 11 BC–1 BC; and a decade rounded up onto astronomical 0 ends in 1 BC too.
  const bc = windowFor({ facts: { born: '-0010', died: '-0002' } }, { kind: 'person' });
  assert.deepEqual([bc.from, bc.to], [-11, -1], '11 BC to 1 BC');
  const bcDecades = windowFor({ facts: { founded: '-0400', dissolved: '-0046' } }, { kind: 'place' });
  assert.deepEqual([bcDecades.from, bcDecades.to, bcDecades.step], [-441, -1, '10y'], 'rounded up by decades to astronomical 0: 1 BC');
  assert.equal(frameFor({ from: 1446, to: 1514 }, { era: [1494, 1527] }), 1494);
  assert.equal(frameFor({ from: 1446, to: 1514 }, { era: [1600, 1650] }), 1446, 'an era outside the window: the window\'s start');
  assert.equal(frameFor({ from: 1446, to: 1514 }, { passageYear: 1499, era: [1494, 1527] }), 1499);
  assert.equal(stepFor({ ends: 11, fill: 'y', from: 1494, to: 1496 }), 'y');
  assert.equal(stepFor({ ends: 11, fill: 'd', from: 1494, to: 1496 }), 'm', 'under five years: month');
  assert.equal(stepFor({ ends: 7, fill: 'y', from: 1300, to: 1400 }), 'c', 'a century-precision end');
  assert.equal(stepFor({ ends: 9, fill: 'y', from: -3000, to: 100 }), 'c', 'over 1,500 years');
});

test('resolve: an entry with no dates, no place and nothing related is thin, in 2.5\'s words; other kinds say so', () => {
  const nobody = { q: 'Q4115189', label: 'Nobody', type: 'person', facts: {}, rel: {} };
  const r = resolve(nobody, { module: 'neo-classic', at: 'x' }, { today: '2026-11-17' });
  assert.deepEqual(Object.keys(r).sort(), ['offers', 'recipe', 'related', 'thin']);
  assert.deepEqual(r.thin.missing, ['dates', 'place', 'related']);
  assert.equal(r.thin.text, 'VM holds little on Nobody yet: no dates, no place it can map, nothing related. What VM has is shown below.');
  assert.ok(readRecipe(r.recipe), 'still a VR/1 recipe');
  assert.equal(readRecipe(r.recipe).t, undefined, 'no window is invented');
  assert.ok(!r.offers.some(o => o.id === 'passage' && o.available), 'no screen holding nothing is offered');
  // One of the three is not thin; two missing are.
  const dated = resolve({ ...nobody, facts: { born: '1452' } }, { module: 'neo-classic', at: 'x' }, { today: '2026-11-17' });
  assert.deepEqual(dated.thin.missing, ['place', 'related']);
  assert.equal(dated.thin.text, 'VM holds little on Nobody yet: no place it can map, nothing related. What VM has is shown below.');
  const idea = resolve({ q: 'Q7272', label: 'socialism', type: 'idea', facts: {}, rel: {} }, { module: 'neo-classic', at: 'x' }, { today: '2026-11-17', era: [1847, 1888] });
  assert.match(idea.thin.text, /^VM builds its map view for people, places and battles first; socialism is an idea\./);
  assert.deepEqual(readRecipe(idea.recipe).t, { from: 1847, to: 1888 }, 'no dates of its own: the book\'s era');
});

test('vm:click: the detail is exactly the contract\'s shape, or null when malformed', () => {
  const ok = { subject: { qid: 'Q236853', label: 'Ludovico Sforza', kind: 'person' },
    from: { module: 'neo-classic', at: 'bibliotheca/neo/index.html#book=the-prince&ch=3&p=c03-p03&t=Q236853', passage: { book: 'the-prince', ch: 3, p: 'c03-p03', range: [710, 723] } },
    gesture: 'term' };
  assert.deepEqual(clickDetail(ok), { v: 1, ...ok });
  assert.deepEqual(clickDetail({ ...ok, extra: 1, subject: { ...ok.subject, key: 'ludovico', junk: 2 } }).subject,
    { qid: 'Q236853', key: 'ludovico', label: 'Ludovico Sforza', kind: 'person' }, 'unknown keys dropped');
  const withPeriods = clickDetail({ ...ok, from: { ...ok.from, periods: [{ from: 1499, to: 1500, p: 9, basis: 'stated' }], places: ['Q70972', 'ITA', 'gw:325'] } });
  assert.deepEqual(withPeriods.from.places, ['Q70972', 'ITA', 'gw:325']);
  assert.deepEqual(GESTURES, ['term', 'selection', 'scene', 'news', 'badge', 'name']);
  assert.equal(clickDetail({ ...ok, gesture: 'tap' }), null);
  assert.equal(clickDetail({ ...ok, subject: { ...ok.subject, qid: 'X1' } }), null);
  assert.equal(clickDetail({ ...ok, subject: { ...ok.subject, label: '' } }), null);
  assert.equal(clickDetail({ ...ok, from: { ...ok.from, module: '' } }), null);
  assert.equal(clickDetail({ ...ok, from: { ...ok.from, passage: { ...ok.from.passage, range: [5] } } }), null);
  assert.equal(clickDetail({ ...ok, from: { ...ok.from, passage: { ...ok.from.passage, range: [10, 5] } } }), null);
  assert.equal(clickDetail({ ...ok, from: { ...ok.from, places: ['Italy'] } }), null);
  assert.equal(clickDetail({ ...ok, from: { ...ok.from, periods: [{ from: 1500, to: 1499, p: 9, basis: 'stated' }] } }), null);
  assert.equal(clickDetail(null), null);
});

test('follow channel: the message has contract 6\'s shape', () => {
  const m = followMessage({ from: 'neo-classic', at: 'bibliotheca/neo/index.html#book=the-prince', recipe: EX1, label: 'Ludovico Sforza' });
  assert.deepEqual(m, { type: 'follow', from: 'neo-classic', at: 'bibliotheca/neo/index.html#book=the-prince', recipe: EX1, label: 'Ludovico Sforza' });
  assert.deepEqual(followMessage({ from: 'kino', at: 'kino/index.html', label: 'x' }), { type: 'follow', from: 'kino', at: 'kino/index.html', label: 'x' });
  assert.equal(followMessage({ from: 'kino', at: 'k', label: 'x', recipe: 'vr=2' }), null);
  assert.equal(followMessage({ from: 'kino', label: 'x' }), null);
});

/* ---------- the dated-borders core (7.3, 4.2) ---------- */
const topo = read('./fixtures/omni/mini.topo.json');
const fc = M.decode(topo);
const INDEX = { format: 'vm-borders-index/1', source: 'cliopatria', version: 'v0.2.1', from: 1400, to: 1600,
  files: [{ from: 1400, to: 1499, file: '1400-1499.topo.json' }, { from: 1500, to: 1600, file: '1500-1600.topo.json' }] };
const QIDS = { format: 'vm-qids/1', version: 'fixture', entries: {
  Q90000001: [{ name: 'Fixture West', from: 1450, to: 1499, basis: 'name' }],
  Q90000002: [{ name: 'Fixture East', from: 1494, to: 1520, basis: 'cliopatria-wikidata' }],
  Q90000003: [{ name: 'مثال', from: 1400, to: 1499, basis: 'name' }],
  Q90000006: [{ name: 'Fixture Null', from: 1500, to: 1510, basis: 'name' }],
}, rejected: [] };
const HELD = M.held(INDEX);

test('prp-map: decode turns the dated-borders TopoJSON into GeoJSON, shared and reversed arcs included', () => {
  assert.equal(fc.type, 'FeatureCollection');
  assert.deepEqual(fc.features.map(f => f.id), ['cl-0000000001', 'cl-0000000002', 'cl-0000000003', 'cl-0000000004', 'cl-0000000005', 'cl-0000000006']);
  assert.deepEqual(fc.features[0].geometry, { type: 'Polygon', coordinates: [[[6, 40], [6, 41], [5, 41], [5, 40], [6, 40]]] });
  assert.deepEqual(fc.features[1].geometry, { type: 'Polygon', coordinates: [[[6, 40], [7, 40], [7, 41], [6, 41], [6, 40]]] }, 'the shared arc, reversed');
  const c = fc.features[2].geometry;
  assert.equal(c.type, 'MultiPolygon'); assert.equal(c.coordinates.length, 2); assert.equal(c.coordinates[0].length, 2, 'outer ring and hole');
  const near = (a, b) => a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9);
  assert.ok(near(c.coordinates[0][1], [[8.3, 40.3], [8.3, 40.7], [8.7, 40.7], [8.7, 40.3], [8.3, 40.3]]));
  assert.equal(fc.features[5].geometry, null);
  assert.equal(fc.features[0].properties.n, 'Fixture West');
  assert.deepEqual(fc.vm, topo.vm);
  assert.equal(M.decode({ type: 'Topology', objects: {} }).features.length, 0);
  assert.throws(() => M.decode({ type: 'Nope' }), /not a TopoJSON/);
  assert.ok(M.validId('cl-0000000001')); assert.ok(!M.validId('cl-00000000g1')); assert.ok(!M.validId('x'));
});

test('prp-map: sliceAt is inclusive at both ends; fileFor and held know the span VM holds', () => {
  const ids = y => M.sliceAt(fc, y).map(f => f.id.slice(-1));
  assert.deepEqual(ids(1449), ['3']);
  assert.deepEqual(ids(1450), ['1', '3']);
  assert.deepEqual(ids(1494), ['1', '2', '3', '4', '5']);
  assert.deepEqual(ids(1499), ['1', '2', '3', '4', '5']);
  assert.deepEqual(ids(1500), ['2', '6']);
  assert.deepEqual(HELD, { from: 1400, to: 1600 });
  assert.equal(M.fileFor(INDEX, 1399), null); assert.equal(M.fileFor(INDEX, 1601), null);
  assert.equal(M.fileFor(INDEX, 1400).file, '1400-1499.topo.json'); assert.equal(M.fileFor(INDEX, 1499).file, '1400-1499.topo.json');
  assert.equal(M.fileFor(INDEX, 1500).file, '1500-1600.topo.json'); assert.equal(M.fileFor(INDEX, 1600).file, '1500-1600.topo.json');
  assert.equal(M.fileFor(INDEX, '1494-07'), INDEX.files[0], 'a month reads by its year');
  assert.equal(M.fileFor(null, 1494), null);
});

test('prp-map: featuresFor and its reasons, in the design\'s words', () => {
  const ok = M.featuresFor(fc, QIDS, 'Q90000001', 1494, HELD);
  assert.deepEqual(ok.features.map(f => f.id), ['cl-0000000001']); assert.equal(ok.reason, null);
  assert.deepEqual(M.qidRows(QIDS, 'Q90000002', 1494).map(r => r.name), ['Fixture East']);
  assert.deepEqual(M.qidRows(QIDS, 'Q90000002', 1493), []);
  assert.equal(M.featuresFor(fc, QIDS, 'Q90000001', 1395, HELD).reason, 'outside-slice');
  assert.equal(M.featuresFor(fc, QIDS, 'Q90000002', 1460, HELD).reason, 'not-this-year');
  assert.equal(M.featuresFor(fc, QIDS, 'Q99999999', 1494, HELD).reason, 'not-outlined');
  assert.equal(M.featuresFor(fc, QIDS, 'Q90000006', 1505, HELD).reason, 'not-outlined', 'a row with no geometry draws nothing');
  assert.equal(M.reasonText('outside-slice', { held: HELD }), 'VM holds borders for 1400–1600 only');
  assert.equal(M.reasonText('not-this-year', { year: 1494 }), 'Cliopatria has no outline for it in 1494');
  assert.equal(M.reasonText('not-outlined', { point: true }), 'VM cannot outline this');
  assert.equal(M.reasonText('not-outlined', { point: false }), 'VM cannot outline this, and holds no coordinates for it yet');
  assert.equal(M.reasonText('nothing-placeable'), 'VM cannot place this');
});

test('prp-map: the extent goes through PRPFocus; an unoutlined entity becomes a point; nothing placeable is the world', () => {
  const both = M.extent({ focus: ['Q90000001', 'Q90000002'], year: 1494, fc, qids: QIDS, held: HELD });
  assert.deepEqual(both.hits, ['Q90000001', 'Q90000002']); assert.deepEqual(both.misses, []);
  const [w, s, e, n] = both.box;
  assert.ok(w <= 5 && s <= 40 && e >= 7 && n >= 41, `box ${both.box} holds both polygons`);
  assert.equal(both.padding, 40, 'PRPFocus\'s 40 px rule');
  const pt = M.extent({ focus: ['Q90000001', 'Q99999999'], year: 1494, fc, qids: QIDS, held: HELD, pointOf: { Q99999999: [12, 45] } });
  assert.ok(globalThis.PRPFocus.contains(pt.box, [12, 45]) && globalThis.PRPFocus.contains(pt.box, [5, 40]));
  assert.deepEqual(pt.points, ['Q99999999']);
  assert.deepEqual(pt.misses, [{ qid: 'Q99999999', reason: 'not-outlined', point: true, text: 'VM cannot outline this' }]);
  const none = M.extent({ focus: ['Q88888888'], year: 1494, fc, qids: QIDS, held: HELD });
  assert.equal(none.box, null); assert.equal(none.text, 'VM cannot place this');
  assert.deepEqual(none.misses, [{ qid: 'Q88888888', reason: 'not-outlined', point: false, text: 'VM cannot outline this, and holds no coordinates for it yet' }]);
  const box = M.extent({ focus: ['bbox:6,36,19,48'], year: 1494, fc, qids: QIDS, held: HELD });
  assert.ok(globalThis.PRPFocus.contains(box.box, [6, 36]) && globalThis.PRPFocus.contains(box.box, [19, 48]));
  const out = M.extent({ focus: ['Q90000001'], year: 1700, fc, qids: QIDS, held: HELD });
  assert.equal(out.misses[0].reason, 'outside-slice'); assert.equal(out.misses[0].text, 'VM holds borders for 1400–1600 only');
});

test('prp-map: polityAt finds the smallest POLITY holding a point (holes and relations left out); labelPoint', () => {
  assert.equal(M.polityAt(fc, 1494, [5.5, 40.5])?.id, 'cl-0000000001', 'the duchy, not the larger realm or the league');
  assert.equal(M.polityAt(fc, 1494, [6.5, 40.5])?.id, 'cl-0000000002');
  assert.equal(M.polityAt(fc, 1494, [8.1, 40.1])?.id, 'cl-0000000003');
  assert.equal(M.polityAt(fc, 1494, [10.1, 40.1])?.id, 'cl-0000000003', 'the second part of a MultiPolygon');
  assert.equal(M.polityAt(fc, 1494, [8.5, 40.5]), null, 'inside the hole');
  assert.equal(M.polityAt(fc, 1494, [20, 20]), null);
  assert.equal(M.polityAt(fc, 1460, [6.5, 40.5]), null, 'no polity there that year');
  assert.deepEqual(M.labelPoint(fc.features[0]), [5.5, 40.5]);
  assert.equal(M.labelPoint(fc.features[5]), null);
  assert.equal(M.esc('<b>مثال</b> & "x"'), '&lt;b&gt;مثال&lt;/b&gt; &amp; &quot;x&quot;', 'names are escaped for HTML labels, written as given');
});

const BORDERS = { id: 'borders', module: 'omni-map', title: 'Borders', geometry: 'polygon',
  time: { field: 'f..t', from: 1400, to: 1600, step: 'y', precision: 'year' }, data: 'omni/data/borders/index.json',
  measure: null, status: 'reconstruction', borderPrecision: [{ to: 1499, p: 'c' }, { from: 1500, p: 'y' }], style: {},
  legend: 'Borders: Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager', source: 'cliopatria',
  method: 'Cliopatria\'s polygons for 1400–1600.', open: true, pinnable: true };
// The source record as integration/sources.json carries it (5.1), with the licence the planner read on 17 November 2026.
const SOURCES = [{ id: 'cliopatria', citation: 'Cliopatria v0.2.1, Seshat Global History Databank', short: 'Cliopatria', version: 'v0.2.1', licence: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.23128623', accessed: '2026-11-17', terms: 'host' }];

test('prp-map: readLayer checks 4.2\'s catalogue shape; borderPrecisionAt; the legend\'s words; heldMessage', () => {
  assert.deepEqual(M.readLayer(BORDERS), { ok: true, entry: BORDERS, errors: [] });
  for (const k of ['source', 'method', 'time', 'pinnable']) {
    const e = { ...BORDERS }; delete e[k];
    const r = M.readLayer(e); assert.equal(r.ok, false, k); assert.ok(r.errors.some(x => x.includes(k)), k);
  }
  assert.equal(M.readLayer({ ...BORDERS, time: { ...BORDERS.time, step: 'w' } }).ok, false);
  assert.equal(M.readLayer({ ...BORDERS, time: { ...BORDERS.time, from: 1700 } }).ok, false, 'from after to');
  assert.equal(M.readLayer({ ...BORDERS, geometry: 'blob' }).ok, false);
  assert.equal(M.readLayer(null).ok, false);
  assert.equal(M.borderPrecisionAt(BORDERS, 1494), 'c');
  assert.equal(M.borderPrecisionAt(BORDERS, 1499), 'c');
  assert.equal(M.borderPrecisionAt(BORDERS, 1500), 'y');
  assert.equal(M.borderPrecisionAt({ ...BORDERS, borderPrecision: undefined }, 1494), null);
  const lg = M.legend(BORDERS, { sources: SOURCES, year: 1494 });
  const all = lg.lines.join('\n');
  for (const w of ['Cliopatria v0.2.1', 'CC BY 4.0', 'century precision', 'one version of each border']) assert.ok(all.includes(w), w);
  assert.equal(lg.title, 'Borders'); assert.equal(lg.credit, BORDERS.legend); assert.equal(lg.method, BORDERS.method);
  const later = M.legend(BORDERS, { sources: SOURCES, year: 1550 }).lines.join('\n');
  assert.ok(later.includes('year precision') && !later.includes('century precision'));
  assert.ok(M.legend({ ...BORDERS, source: 'nowhere' }, { sources: SOURCES, year: 1494 }).lines.join('\n').includes('not in VM\'s list of sources'));
  assert.equal(M.heldMessage('battle', 2), 'VM holds 2 battles for these years');
  assert.equal(M.heldMessage('battle', 1), 'VM holds 1 battle for these years');
  assert.equal(M.heldMessage('battle', 0), 'VM holds no battles for these years');
});

/* ---------- the saved research version (5.7, 5.8) ---------- */
const ROW = { Entity: 'Fixture West', Code: 'Q90000001', date: '1450/1499', precision: 'year', value: 1000, low: '', high: '', measure: 'cliopatria-area-km2',
  status: '', by: '', origin: 'source', source_id: 'cliopatria', source_loc: '', layer: 'borders', feature_id: 'cl-0000000001' };

test('bundle: rows.csv has 5.8\'s columns, quotes RFC 4180 style and guards formulas; EDTF dates stay as written', () => {
  assert.deepEqual(COLUMNS, ['Entity', 'Code', 'date', 'precision', 'value', 'low', 'high', 'measure', 'status', 'by', 'origin', 'source_id', 'source_loc', 'layer', 'feature_id']);
  const csv = rowsCsv([ROW, { ...ROW, Entity: '=HYPERLINK("x")', date: '-0425/-0424', value: -5 }, { ...ROW, Entity: 'Say "hi", then go', Code: '@x' }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], COLUMNS.join(','));
  assert.equal(lines[1], 'Fixture West,Q90000001,1450/1499,year,1000,,,cliopatria-area-km2,,,source,cliopatria,,borders,cl-0000000001');
  assert.ok(lines[2].startsWith('"\'=HYPERLINK(""x"")",'), lines[2]);
  assert.ok(lines[2].includes(',-0425/-0424,') && lines[2].includes(',-5,'), 'a BC date and a negative number are not formulas to guard');
  assert.ok(lines[3].startsWith('"Say ""hi"", then go",\'@x,'));
  assert.ok(csv.endsWith('\r\n'));
});

test('bundle: the pin is the first 12 hex of sha256 of recipe.txt, rows.csv and features.geojson joined by newlines', async () => {
  const recipe = EX1, csv = rowsCsv([ROW]), geo = featuresGeojson(fc.features.slice(0, 2));
  assert.equal(await pin(recipe, csv, geo, digest), sha12(`${recipe}\n${csv}\n${geo}`));
  assert.match(await pin(recipe, csv, geo, digest), /^[0-9a-f]{12}$/);
  assert.equal(await pin(recipe, csv, geo, async b => createHash('sha256').update(b).digest('hex')), sha12(`${recipe}\n${csv}\n${geo}`), 'a digest may give hex');
  // features.geojson is canonical: keys sorted, features by id, the same text whatever order they came in.
  assert.equal(featuresGeojson([fc.features[1], fc.features[0]]), geo);
  const parsed = JSON.parse(geo);
  assert.equal(parsed.type, 'FeatureCollection'); assert.deepEqual(parsed.features.map(f => f.id), ['cl-0000000001', 'cl-0000000002']);
  assert.ok(geo.startsWith('{"features":[{"geometry":'));
});

test('bundle: a stored zip of its own, CRC32 as zlib computes it, read back; a flipped byte is refused', () => {
  const rnd = Uint8Array.from({ length: 4096 }, (_, i) => (i * 2654435761) >>> 24);
  assert.equal(crc32(rnd), zlib.crc32(rnd));
  assert.equal(crc32(new Uint8Array(0)), 0);
  const files = [{ name: 'recipe.txt', text: EX1 }, { name: 'données/é.json', bytes: rnd }];
  const zip = zipStored(files);
  assert.ok(zip instanceof Uint8Array);
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50, 'a local file header first');
  assert.equal(new DataView(zip.buffer).getUint32(14, true), zlib.crc32(Buffer.from(EX1)), 'its CRC32 is zlib\'s');
  assert.equal(new DataView(zip.buffer).getUint16(8, true), 0, 'stored, no compression');
  const back = readZip(zip);
  assert.deepEqual(back.map(f => f.name), ['recipe.txt', 'données/é.json']);
  assert.equal(new TextDecoder().decode(back[0].bytes), EX1);
  assert.deepEqual([...back[1].bytes], [...rnd]);
  assert.deepEqual(zipStored(files), zip, 'fixed timestamps: the same files give the same bytes');
  const bad = zip.slice(); bad[30 + 'recipe.txt'.length + 3] ^= 1;
  assert.throws(() => readZip(bad), /CRC/);
  assert.throws(() => readZip(new Uint8Array([1, 2, 3])), /not a zip/);
});

const VIEW = {
  recipe: 'vr=1&t=1446..1514&at=1494&show=frame&step=y&base=plain&fill=borders&l=battles&focus=Q70972,Q153529&q=Q236853&ds=cliopatria@v0.2.1&from=neo:the-prince/3/c03-p03',
  rows: [{ ...ROW, feature_id: 'cl-0000000002', Entity: 'Fixture East', Code: 'Q90000002' }, ROW],
  features: [fc.features[1], fc.features[0]],
  choices: { clutter: [], events: [] },
  made: '2026-11-17T10:00:00Z', vmCommit: null, deployment: 'https://jdpi.pages.dev', code: [{ path: 'design/prp-map.js', sha256: 'ab'.repeat(32) }],
  datasets: [{ id: 'cliopatria', version: 'v0.2.1', sha256: 'e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4', licence: 'CC BY 4.0', citation: 'Cliopatria v0.2.1' }],
  qids: ['Q70972', 'Q153529'], from: 'neo:the-prince/3/c03-p03', subject: 'Ludovico Sforza', window: [1446, 1514],
  liveUrl: 'https://jdpi.pages.dev/omni/index.html#vr=1&t=1446..1514', providers: ['Cliopatria v0.2.1 (Bennett et al. 2025) – processed by Vitruvian Manager'],
};

test('bundle: the nine files; rows equal features; the pin verifies from the files alone; metadata of 5.7', async () => {
  const { pin: p, files } = await bundleFiles(VIEW, digest);
  assert.deepEqual(files.map(f => f.name), ['recipe.txt', 'rows.csv', 'features.geojson', 'choices.json', 'metadata.json', 'README.txt', 'citation.csl.json', 'citation.ris', 'citation.bib']);
  const text = n => files.find(f => f.name === n).text;
  assert.ok(!text('recipe.txt').includes('pin='));
  assert.equal(p, sha12(`${text('recipe.txt')}\n${text('rows.csv')}\n${text('features.geojson')}`), 'anyone can verify the pin');
  const csvIds = text('rows.csv').trim().split('\r\n').slice(1).map(l => l.split(',').at(-1));
  assert.deepEqual(csvIds, JSON.parse(text('features.geojson')).features.map(f => f.id), 'rows equal the features, in the same order');
  const meta = JSON.parse(text('metadata.json'));
  for (const k of ['pin', 'made', 'vmCommit', 'deployment', 'recipe', 'datasets', 'qids', 'from', 'code']) assert.ok(k in meta, k);
  assert.equal(meta.pin, p); assert.equal(meta.vmCommit, null); assert.equal(meta.recipe, `${VIEW.recipe}&pin=${p}`);
  assert.equal(readRecipe(meta.recipe).pin, p, 'the recipe with its pin is still VR/1');
  assert.match(text('README.txt'), /Zenodo or OSF/); assert.match(text('README.txt'), new RegExp(p));
  // Review X2: the README says what the pin does not cover (the time, the licences, the citations).
  assert.match(text('README.txt'), /The pin covers those three files only\. choices\.json, metadata\.json \(the time, the deployment, the licences\)/);
  assert.match(text('README.txt'), /citation files are not covered by it/);
  const csl = JSON.parse(text('citation.csl.json'));
  assert.equal(csl[0].type, 'dataset'); assert.equal(csl[0].version, p);
  assert.deepEqual(csl[0].author, [{ literal: 'JDP-Iq' }]); assert.equal(csl[0].publisher, 'Vitruvian Manager');
  assert.equal(csl[0].title, 'Ludovico Sforza, 1446–1514');
  assert.ok(csl[0].note.includes('Cliopatria v0.2.1 (Bennett et al. 2025) – processed by Vitruvian Manager'));
  assert.deepEqual(csl[0].issued, { 'date-parts': [[2026, 11, 17]] });
  assert.ok(text('citation.ris').startsWith('TY  - DATA\r\n')); assert.ok(text('citation.ris').trim().endsWith('ER  -'));
  assert.ok(text('citation.bib').startsWith('@misc{vm-view-' + p));
  // The citation names the pinned address (finding S6): the recipe with its ds= pins and its pin=.
  assert.equal(apa({ ...VIEW, pin: p }), `JDP-Iq. (2026). Ludovico Sforza, 1446–1514 [Data set, version ${p}]. Vitruvian Manager. https://jdpi.pages.dev/omni/index.html#${VIEW.recipe}&pin=${p}`);
  assert.deepEqual(metadata({ ...VIEW, pin: p, recipe: meta.recipe }), meta);
  // Zipped and read back, the pin still verifies.
  const back = readZip(zipStored(files)).map(f => ({ name: f.name, text: new TextDecoder().decode(f.bytes) }));
  const t2 = n => back.find(f => f.name === n).text;
  assert.equal(sha12(`${t2('recipe.txt')}\n${t2('rows.csv')}\n${t2('features.geojson')}`), p);
  assert.equal(cslJson({ ...VIEW, pin: p })[0].version, p); assert.ok(ris({ ...VIEW, pin: p }).includes(`ET  - ${p}`)); assert.ok(bibtex({ ...VIEW, pin: p }).includes(`version = {${p}}`));
});

test('download: 5.8\'s three files; a cite-only source gives no rows, only where to get them', () => {
  const sources = { cliopatria: { id: 'cliopatria', terms: 'host', citation: 'Cliopatria v0.2.1', short: 'Cliopatria', licence: 'CC BY 4.0', url: 'https://doi.org/10.5281/zenodo.23128623' },
    cow: { id: 'cow', terms: 'cite-only', citation: 'Correlates of War', short: 'COW', url: 'https://correlatesofwar.org/data-sets/' } };
  const rows = [ROW, { ...ROW, source_id: 'cow', feature_id: 'x' }];
  const files = dataFiles({ ...VIEW, rows, sources, made: '2026-11-17T10:00:00Z' });
  assert.deepEqual(files.map(f => f.name), ['ludovico-sforza-1446-1514.csv', 'ludovico-sforza-1446-1514.metadata.json', 'README.txt']);
  const csv = files[0].text.trim().split('\r\n');
  assert.equal(csv.length, 2, 'the header and the one hostable row'); assert.ok(!files[0].text.includes('cow'));
  const meta = JSON.parse(files[1].text);
  for (const k of ['recipe', 'versions', 'columns', 'dateDownloaded', 'licences']) assert.ok(k in meta, k);
  assert.ok(meta.columns.value.citationShort && meta.columns.value.citationLong && 'descriptionProcessing' in meta.columns.value && 'unit' in meta.columns.value);
  assert.ok(files[2].text.includes('https://correlatesofwar.org/data-sets/'), 'where to get the cite-only rows');
});

/* ---------- the review of 17 November 2026: its findings, each a test ---------- */
const CLIO = { id: 'cliopatria', terms: 'host', citation: 'Cliopatria v0.2.1', short: 'Cliopatria', version: 'v0.2.1', licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://doi.org/10.5281/zenodo.23128623',
  credit: 'Borders: Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0 – processed by Vitruvian Manager', changes: 'The rows of 1400–1600 only.' };

test('S2: every file set that passes on a CC BY source holds its licence address, its credit and VM\'s changes', async () => {
  const view = { ...VIEW, datasets: [{ ...VIEW.datasets[0], licenceUrl: CLIO.licenceUrl, credit: CLIO.credit, changes: CLIO.changes }], sources: [CLIO] };
  const { files } = await bundleFiles(view, digest);
  const meta = JSON.parse(files.find(f => f.name === 'metadata.json').text);
  assert.equal(meta.datasets[0].licenceUrl, CLIO.licenceUrl); assert.equal(meta.datasets[0].credit, CLIO.credit); assert.equal(meta.datasets[0].changes, CLIO.changes);
  const readme = files.find(f => f.name === 'README.txt').text;
  for (const w of [CLIO.licenceUrl, CLIO.credit, CLIO.changes]) assert.ok(readme.includes(w), `the bundle's README: ${w}`);
  const data = dataFiles(view);
  assert.deepEqual(JSON.parse(data[1].text).licences, [{ source: 'cliopatria', licence: 'CC BY 4.0', licenceUrl: CLIO.licenceUrl, credit: CLIO.credit, changes: CLIO.changes }]);
  for (const w of [CLIO.licenceUrl, CLIO.credit, CLIO.changes]) assert.ok(data[2].text.includes(w), `the download's README: ${w}`);
});

test('S6, S17: the citations name the pinned address (ds= and pin=); the README keeps the live view apart and says what "deployment" is', async () => {
  const { pin: p, files, citeUrl } = await bundleFiles(VIEW, digest);
  assert.equal(citeUrl, `https://jdpi.pages.dev/omni/index.html#${VIEW.recipe}&pin=${p}`);
  const text = n => files.find(f => f.name === n).text;
  assert.equal(JSON.parse(text('citation.csl.json'))[0].URL, citeUrl);
  assert.ok(text('citation.ris').includes(`UR  - ${citeUrl}\r\n`));
  assert.ok(text('citation.bib').includes(`url = {${citeUrl}}`));
  assert.ok(text('README.txt').includes(`Cite as: JDP-Iq. (2026). Ludovico Sforza, 1446–1514 [Data set, version ${p}]. Vitruvian Manager. ${citeUrl}`));
  assert.ok(text('README.txt').includes(`Live view (today's data, not this bundle): ${VIEW.liveUrl}`));
  assert.match(text('README.txt'), /the site's address, not a per-deployment address/);
});

test('S14, E10, R11: a source whose version is the time VM read it is said as "read <date>"', () => {
  const BATTLES_LAYER = { ...BORDERS, id: 'battles', geometry: 'point', source: 'wikidata', status: 'as Wikidata records them', time: { ...BORDERS.time, field: 'date', precision: 'day' } };
  delete BATTLES_LAYER.borderPrecision;
  const lg = M.legend(BATTLES_LAYER, { sources: [{ id: 'wikidata', short: 'Wikidata', version: '2026-11-17T05:22:14Z', licence: 'CC0 1.0' }], year: 1495 });
  assert.equal(lg.lines[0], 'Source: Wikidata, read 17 November 2026, CC0 1.0');
  assert.equal(M.legend(BORDERS, { sources: SOURCES, year: 1494 }).lines[0], 'Source: Cliopatria v0.2.1, CC BY 4.0', 'a release tag is printed as it is');
});

test('S7, S11: a bundle\'s border rows and features keep the source\'s own Wikidata id apart from VM\'s crosswalk, and their years at the source\'s precision', () => {
  const qids = { ...QIDS, rejected: [{ q: 'Q207162', name: 'Fixture West', wikidataLabel: 'Bourbon Restoration', why: 'Wikidata dates the item to other years' }] };
  const west = { ...fc.features[0], properties: { ...fc.features[0].properties, q: 'Q207162' } };
  const p = M.bundleProps(west, qids, 1494);
  assert.equal('q' in p, false, 'no bare q');
  assert.equal(p.cliopatria_q, 'Q207162'); assert.equal(p.vm_q, 'Q90000001');
  assert.equal(p.cliopatria_q_rejected, true); assert.equal(p.cliopatria_q_why, 'Wikidata dates the item to other years');
  const east = M.bundleProps(fc.features[1], qids, 1494);
  assert.equal(east.cliopatria_q, null); assert.equal(east.vm_q, 'Q90000002'); assert.equal('cliopatria_q_rejected' in east, false);
  assert.equal(M.qidFor(qids, 'Fixture West', 1494), 'Q90000001'); assert.equal(M.qidFor(qids, 'Fixture West', 1440), null);
  const row = M.borderRow(west, { qids, year: 1494, precision: 'c' });
  assert.equal(row.date, '1450/1499'); assert.equal(row.precision, 'year', 'the row\'s years as Cliopatria records them');
  assert.match(row.status, /century/, 'VM\'s century rule is said in its own column');
  assert.equal(row.Code, 'Q90000001'); assert.equal(row.feature_id, 'cl-0000000001'); assert.equal(row.source_id, 'cliopatria');
  assert.equal(M.borderRow(fc.features[1], { qids, year: 1550, precision: 'y' }).status, 'reconstruction');
});

test('S18: a present-day sovereign state (a member of the United Nations with no end) is never put in focus', () => {
  const romagna = lookup('Q244482');
  assert.deepEqual(romagna.rel.Country.map(x => x[0]), ['Q38', 'Q238']);
  assert.equal(lookup('Q238').facts.founded, '0301-09-03');
  const r = resolve(romagna, fromNeo('c03-p17', 3, 'Q244482'), ctxFor(para(3, 'c03-p17')));
  const v = readRecipe(r.recipe);
  assert.ok(!(v.focus || []).includes('Q238'), `San Marino today is not Romagna's polity in 1494 (${v.focus})`);
  assert.ok(v.focus.includes('Q153529') && v.focus.includes('Q170174'), 'the passage\'s polities stay');
});

test('S1: the offer of the view shown says why it opens on its frame', () => {
  const r = resolve(ludovico, fromNeo('c03-p03', 3, 'Q236853'), ctxFor(para(3, 'c03-p03')));
  const life = r.offers.find(o => o.id === 'life');
  assert.match(life.why, /1446–1514/);
  assert.match(life.why, /opens on 1494, the start of the book's era \(1494–1527\)/);
  assert.match(life.why, /this paragraph has no periods record yet, so VM has not dated it/);
  const fixture = read('./fixtures/omni/periods.json'), rec = readPeriods(fixture)('c03-p03');
  const dated = resolve(ludovico, { ...fromNeo('c03-p03', 3, 'Q236853'), periods: rec.periods }, ctxFor(para(3, 'c03-p03'), { record: rec }));
  assert.match(dated.offers.find(o => o.id === 'passage').why, /opens on 1499, the paragraph's first year/);
});

test('S19: the periods fixture marks 1499..1500 as inferred, not stated (c03-p03 names events, not years)', () => {
  const p = read('./fixtures/omni/periods.json').paragraphs['c03-p03'];
  assert.equal(p.periods[0].basis, 'inferred'); assert.equal(p.basis, 'inferred');
});
