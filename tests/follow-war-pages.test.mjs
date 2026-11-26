// War pages: the follow-ons the corrections of 26 November 2026 left (jdpi-corrections-verify.md, builds 2 and 3).
//   war-focus-method   War Focus's Method says what build 3 made its build do: a battle whose Wikidata start, given
//                      with no reference, differs from its English Wikipedia article is shown from the article's start
//                      with both dates (the Battle of Iwo Jima: 19 February 1945, its article's infobox, revision
//                      1387000548, read 26 November 2026; Wikidata Q180182 P580 8 February 1945); several points in time
//                      are several days (Q488: P585 6 and 9 August 1945); a date given twice is the finer; and a state
//                      takes its side from its entry into the war (Iran 9 September 1943, "Declarations of war during
//                      World War II", revision 1386501129; Egypt 24 February 1945, "Egypt in World War II", revision
//                      1374628527; Austria annexed 12 March 1938, "Anschluss", revision 1387085266; all read 26 November).
//   western-sahara     Western Sahara's `since` is 1976: Wikidata Q6250 has no inception (P571); its country (P17)
//                      Spanish Sahara (Q689837) runs 1958–1976, and Spanish Sahara's end (P576) is 6 February 1976 (read
//                      26 November 2026). history-places.mjs SINCE_FROM holds the rule; the build must still call it.
//   omni-territory     The Omni-Map's conflict-territory layer places every conflict the Retrospective Battlefield
//                      places otherwise than UCDP's location where it does, by year where it moved (history-fought.mjs
//                      FOUGHT_IN, every u… entry; Hyderabad's two alone keep UCDP's location), dates Western Sahara
//                      from 1976 as the Battlefield does (history-places.mjs SINCE_FROM), and
//                      gives each conflict's type in its last active year, with its type by year where it changed (UCDP/
//                      PRIO ACD v26.1: Cuba, 242, internal 1953 and 1956–58, internationalised internal 1961).
//   omni-battles       The Omni-Map's battles layer dates several points in time as several days and takes War Focus's
//                      corrected start (Iwo Jima from 19 February 1945, Wikidata's 8 February named), reads points in
//                      time at every rank but deprecated as War Focus does (the Ardenne Abbey massacre, 7 and 8 June
//                      1944), names a battle as War Focus does (the killing of Yahya Sinwar: Wikidata's English label
//                      was changed on 24 November 2026; its enwiki article is "Killing of Yahya Sinwar"), and credits
//                      English Wikipedia in its legend for the start it takes from it.
//   catalogue          integration/scripts/build-catalog.mjs: retrospective-wars' `type` is the last active year's type;
//                      war-focus-battles gains start_wikidata and pts, each described.
// The page test runs against JDPI_URL (default live); PRP_PAGES=0 leaves it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const text = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(text(rel));
const methodOf = html => /<p><b>Method\.<\/b>([\s\S]*?)<\/p>/.exec(html)?.[1] || '';

// A Wikidata time statement, as wbgetentities gives it.
const time = (t, precision = 11, rank = 'normal', extra = {}) => ({ rank, mainsnak: { snaktype: 'value', datavalue: { value: { time: t, precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } }, ...extra });
const point = { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { latitude: 34.39, longitude: 132.45, precision: 0.01 } } } };

test('war-focus-method: the Method says a battle starts as its article gives it, several points are several days, and sides run from entry into the war', () => {
  const m = methodOf(text('../battlefield/focus/index.html'));
  assert.ok(m, 'the Method paragraph');
  assert.match(m, /Wikidata's start for a battle, given with no reference, differs from its English Wikipedia article's, the battle is shown from the article's start, with both dates \(the Battle of Iwo Jima: 19 February 1945, not 8 February\)/);
  assert.match(m, /several points in time, no start or end, and a name that does not say it lasted \(a campaign, an offensive, a siege\), each is a date of its own \(a day, or only a month or a year where that is all Wikidata gives\), not a span, and the battle is drawn and counted only in their months \(the atomic bombings of Hiroshima and Nagasaki: 6 and 9 August 1945\)/);
  assert.doesNotMatch(m, /each is a day of its own/, 'a point may be a month (Bombing of Yawata: June 1944)');
  assert.match(m, /gives one date twice, at two precisions \(a year, and a month in it\), the finer is used/);
  assert.match(m, /a state takes its side from the day it entered the war \(in World War II, as a rule, its declaration of war: Iran from 9 September 1943, Egypt from 24 February 1945\) and leaves it on the day it left, and a state annexed before the war, as Austria was in March 1938, is on neither side, only held \(Cliopatria draws it inside Germany, so the line under the map names it as held\)/);
  assert.doesNotMatch(m, /hatched as held|is no side/, 'Austria has no shape of its own to hatch');
  // The Method's examples are the data's.
  const ww2 = json('../battlefield/focus/data/wars/ww2.json');
  const iwo = ww2.battles.find(b => b.q === 'Q180182'), a = ww2.battles.find(b => b.q === 'Q488');
  assert.equal(iwo.s, '1945-02-19'); assert.equal(iwo.sW, '1945-02-08');
  assert.deepEqual(a.pts, ['1945-08-06', '1945-08-09']);
  const allies = ww2.sides.a.states;
  assert.equal(allies.find(s => s.q === 'Q79').from, '1945-02-24');
  assert.equal(allies.find(s => s.q === 'Q794').from, '1943-09-09');
  assert.ok(!ww2.sides.b.states.some(s => s.q === 'Q40') && ww2.control.some(c => c.q === 'Q40' && c.side === 'b'), 'Austria held, no side');
  for (const y of ['1939', '1944']) {
    assert.ok(ww2.lands[y].inside.some(([q, inside]) => q === 'Q40' && inside === 'Q183'), `${y}: Cliopatria draws Austria inside Germany`);
    assert.ok(ww2.unplaced[y].includes('Q40'), `${y}: so the line under the map names it`);
  }
  // A point of a battle's several may be a month: the Bombing of Yawata, June 1944 (Wikidata gives no day).
  assert.deepEqual(ww2.battles.find(b => b.q === 'Q4940734').pts, ['1944-06', '1944-08-20', '1945-08-08']);
});

test('western-sahara: its `since` is the end of its country (P17) Spanish Sahara, 1976; "today’s Western Sahara" in 1975', async () => {
  const { SINCE_FROM, sinceFrom } = await import('../battlefield/scripts/history-places.mjs');
  const { placeName } = await import('../battlefield/history/names.js');
  assert.equal(SINCE_FROM.Q6250, 'Q689837');
  // Q6250's P17 statements as Wikidata gives them (read 26 November 2026).
  const p17 = (id, from, to) => ({ rank: 'normal', mainsnak: { datavalue: { value: { id } } }, qualifiers: { P580: [{ datavalue: { value: { time: `+${from}-00-00T00:00:00Z` } } }], ...(to ? { P582: [{ datavalue: { value: { time: `+${to}-00-00T00:00:00Z` } } }] } : {}) } });
  const e = { claims: { P17: [p17('Q80702', 1884, 1976), p17('Q1191986', 1946, 1958), p17('Q689837', 1958, 1976), p17('Q40362', 1976)] } };
  assert.equal(sinceFrom('Q6250', e), 1976);
  assert.equal(sinceFrom('Q1028', e), null, 'a place SINCE_FROM does not name');
  assert.equal(sinceFrom('Q6250', { claims: { ...e.claims, P571: [time('+1990-01-01T00:00:00Z')] } }), null, 'an inception of its own wins');
  assert.throws(() => sinceFrom('Q6250', { claims: { P17: [p17('Q689837', 1958)] } }), /no end time/);
  const ws = { n: 'Western Sahara', iso3: 'ESH', since: sinceFrom('Q6250', e) };
  assert.equal(placeName(ws, 1975), 'today’s Western Sahara');
  assert.equal(placeName(ws, 1976), 'Western Sahara');
});

// A todo until the main session wires sinceFrom into build-history.mjs (not this part's file: line 254, `?? sinceFrom(q,
// e)`) and rebuilds the Retrospective Battlefield in full (--names-only does not rewrite `since`); then a plain test.
test('western-sahara: places.json carries it once build-history.mjs writes SINCE_FROM\'s year', { todo: 'build-history.mjs (not this part\'s file) must take sinceFrom where P571 gives none, then the Retrospective Battlefield is rebuilt in full' }, () => {
  assert.equal(json('../battlefield/history/data/places.json').places.Q6250.since, 1976);
});

test('omni-territory: every conflict the Retrospective Battlefield places otherwise is placed as it places it, by year where it moved; the type is the last year\'s, by year where it changed', async () => {
  const { territoryRows, placedAt, KEEP_UCDP } = await import('../omni/scripts/build-conflict-territory.mjs');
  const { FOUGHT_IN } = await import('../battlefield/scripts/history-fought.mjs');
  // Every u… entry of FOUGHT_IN, as build-history.mjs reads it: `loc` in every year, `years` in the years listed.
  assert.deepEqual(placedAt(298, 1983), ['Q1030']);
  assert.deepEqual(placedAt(418, 2003), ['Q43', 'Q889', 'Q843'], 'the United States against al-Qaida, placed by year');
  assert.equal(placedAt(418, 2018), null, 'a year FOUGHT_IN does not list keeps UCDP’s location');
  assert.deepEqual(placedAt(426, 1995), ['Q822'], 'Israel: Southern Lebanon, in Lebanon');
  assert.deepEqual(placedAt(250, 1956), ['Q28'], 'Hungary – Soviet Union, in Hungary');
  assert.deepEqual(placedAt(420, 2003), ['Q796'], 'Iraq 2003, in Iraq');
  assert.equal(placedAt(242, 1958), null, 'a conflict FOUGHT_IN does not name keeps UCDP’s location');
  assert.deepEqual(KEEP_UCDP, [226, 11884]);
  for (const id of KEEP_UCDP) { assert.ok(FOUGHT_IN[`u${id}`]); assert.equal(placedAt(id, 1948), null, `u${id}: Hyderabad keeps UCDP’s location`); }
  const NE = { 'South Africa': { q: 'Q258', iso3: 'ZAF' }, Cuba: { q: 'Q241', iso3: 'CUB' }, 'United States of America': { q: 'Q30', iso3: 'USA' } };
  const row = (id, y, loc, side, type) => ({ conflict_id: String(id), year: String(y), location: loc, side_a: `Government of ${side}`, side_a_2nd: '', side_b: 'Rebels', side_b_2nd: '', incompatibility: '1', territory_name: '', type_of_conflict: String(type), intensity_level: '1', gwno_loc: '560' });
  const out = territoryRows([row(298, 1983, 'South Africa', 'South Africa', 3), row(242, 1958, 'Cuba', 'Cuba', 3), row(242, 1961, 'Cuba', 'Cuba', 4), row(242, 1953, 'Cuba', 'Cuba', 3), row(418, 2003, 'United States of America', 'United States of America', 4), row(418, 2018, 'United States of America', 'United States of America', 4)], [], n => NE[n] || null, { wars: [] },
    { fought: placedAt, known: q => ({ Q1030: 'NAM', Q43: 'TUR', Q889: 'AFG', Q843: 'PAK' }[q] ? { q, iso3: { Q1030: 'NAM', Q43: 'TUR', Q889: 'AFG', Q843: 'PAK' }[q] } : null) });
  assert.deepEqual(out.unread, []);
  assert.deepEqual(out.years[1983].t, { Q1030: [298] }, 'Namibia holds the war');
  assert.deepEqual(out.years[1983].a, { Q258: [298] }, 'South Africa fought outside its own territory');
  assert.deepEqual(out.places.Q1030, { q: 'Q1030', iso3: 'NAM', ucdp: null });
  assert.deepEqual(Object.keys(out.years[2003].t).sort(), ['Q43', 'Q843', 'Q889']); assert.deepEqual(out.years[2003].a, { Q30: [418] });
  assert.deepEqual(out.years[2018].t, { Q30: [418] }, 'not listed: UCDP’s location');
  assert.equal(out.places.Q258.gw, '560', 'the state UCDP gives keeps its number for the Battlefield’s link');
  assert.equal(out.conflicts[242].type, 'internationalised internal', 'the last active year’s type');
  assert.deepEqual(out.conflicts[242].typeYears, { 1953: 'internal', 1958: 'internal', 1961: 'internationalised internal' });
  assert.equal(out.conflicts[298].typeYears, undefined, 'one type throughout: no typeYears');
});

test('omni-territory: the rebuilt layer places Namibia, Palestine, Western Sahara and Timor-Leste, and types Cuba by year', () => {
  const t = json('../omni/data/layers/conflict-territory/conflicts.json');
  assert.deepEqual(t.years[1983].t.Q1030, [298]); assert.ok(!t.years[1983].t.Q258?.includes(298)); assert.ok(t.years[1983].a.Q258.includes(298));
  assert.deepEqual(t.years[1977].t.Q6250, [331, 428]); assert.deepEqual(t.years[1977].t.Q1028, [331]); assert.deepEqual(t.years[1977].t.Q1025, [428]);
  assert.deepEqual(t.years[1985].t.Q6250, [331]);
  assert.deepEqual(t.years[1998].t.Q574, [330]); assert.ok(t.years[1998].a.Q252.includes(330)); assert.ok(!(t.years[1998].t.Q252 || []).includes(330));
  assert.deepEqual(t.years[2025].t.Q23792, [234]); assert.ok(t.years[2025].t.Q801.includes(234));
  for (const q of ['Q574', 'Q6250', 'Q23792']) assert.equal(t.places[q].ucdp, null, `${q}: placed by VM, not named by UCDP`);
  // Every conflict FOUGHT_IN places otherwise, not the five alone (the second readers, 26 November 2026).
  assert.deepEqual(t.years[1995].t.Q822, [426]); assert.ok(!(t.years[1995].t.Q801 || []).includes(426)); assert.ok(t.years[1995].a.Q801.includes(426));
  for (const q of ['Q43', 'Q889', 'Q843']) assert.ok(t.years[2003].t[q].includes(418), `2003: al-Qaida in ${q}`);
  assert.ok(!(t.years[2003].t.Q30 || []).includes(418) && t.years[2003].a.Q30.includes(418));
  assert.deepEqual(t.years[2003].t.Q796.filter(id => id === 420), [420]);
  for (const q of ['Q30', 'Q145', 'Q408']) assert.ok(!(t.years[2003].t[q] || []).includes(420) && t.years[2003].a[q].includes(420), `2003: ${q} fought in Iraq`);
  assert.ok(t.years[1956].t.Q28.includes(250) && !(t.years[1956].t.Q15180 || []).includes(250) && t.years[1956].a.Q15180.includes(250), '1956: in Hungary');
  assert.deepEqual(t.years[1946].t.Q193714, [207], '1946: Mandatory Palestine, not today’s Israel');
  assert.ok(!(t.years[1946].t.Q801 || []).includes(207));
  assert.deepEqual(t.years[1950].t.Q185682, [216], 'the First Indochina War: French Indochina');
  assert.ok(t.years[1947].t.Q1240096.includes(11884), 'Hyderabad keeps UCDP’s location (KEEP_UCDP)');
  assert.equal(t.places.Q801.gw, '666', 'Israel keeps UCDP’s number for the Battlefield’s link');
  // Western Sahara's `since`: the end of its country before, Spanish Sahara, as the Retrospective Battlefield reads it.
  assert.equal(t.places.Q6250.since, 1976); assert.equal(t.places.Q6250.src.loc, 'Q6250#P17');
  assert.equal(t.conflicts[242].type, 'internationalised internal');
  assert.deepEqual(t.conflicts[242].typeYears, { 1953: 'internal', 1956: 'internal', 1957: 'internal', 1958: 'internal', 1961: 'internationalised internal' });
  // As the Retrospective Battlefield has it: the last year's type, and 65 conflicts whose type changed.
  const wars = json('../battlefield/history/data/wars.json');
  const byId = new Map(wars.wars.filter(w => w.src === 'ucdp').map(w => [w.id, w]));
  const name = { 'internal': 'Civil conflict', 'internationalised internal': 'Internationalised civil conflict', 'interstate': 'Interstate war', 'extrasystemic': 'Colonial war' };
  let changed = 0;
  for (const [id, c] of Object.entries(t.conflicts)) {
    const w = byId.get(`u${id}`);
    if (name[c.type] && w) assert.equal(w.type.toLowerCase(), name[c.type].toLowerCase(), `${id}: the Battlefield's type`);
    if (c.typeYears) changed++;
  }
  assert.equal(changed, 65);
  const L = json('../omni/data/layers.json').layers.find(l => l.id === 'conflict-territory');
  assert.match(L.method, /so a conflict the Retrospective Battlefield places elsewhere is placed as it places it \(battlefield\/scripts\/history-fought\.mjs\), by year where the fighting moved: among them the war of 2003 in Iraq/);
  assert.match(L.method, /as English Wikipedia’s “Western Sahara War” records Polisario’s raids on both, in the government’s state too/);
  assert.match(L.method, /Hyderabad’s conflicts of 1947–48 alone keep UCDP’s location/);
  assert.doesNotMatch(L.method, /the few fought outside it/, 'no list of five given as the whole');
  assert.match(t.about, /`type` is UCDP’s type in its last active year/);
  assert.match(t.about, /for Western Sahara, which has none, the year Wikidata ends its country before, Spanish Sahara \(P17, 1976\)/);
});

test('omni-battles: several points in time are several days; a point that holds a finer one gives way; War Focus\'s corrected start is used', async () => {
  const { battleRow, finestPoints, focusDates } = await import('../omni/scripts/build-battles.mjs');
  const label = q => q;
  const q488 = { id: 'Q488', labels: { en: { value: 'atomic bombings of Hiroshima and Nagasaki' } }, claims: { P585: [time('+1945-08-06T00:00:00Z'), time('+1945-08-09T00:00:00Z')], P625: [point] } };
  const r = battleRow(q488, label);
  assert.deepEqual(r.dates.map(d => d.from), ['1945-08-06', '1945-08-09']);
  assert.equal(r.date.from, '1945-08-06'); assert.equal(r.date.to, undefined, 'not a span'); assert.equal(r.sortYear, 1945);
  assert.match(r.src.date.line, /two values, each a date of its own, not a span: 6 August 1945 and 9 August 1945/);
  // A campaign's points are not separate days (battleDates' rule); nor is one point.
  assert.equal(battleRow({ ...q488, labels: { en: { value: 'Okinawa campaign' } } }, label).dates, undefined);
  assert.equal(battleRow({ ...q488, claims: { ...q488.claims, P585: [q488.claims.P585[0]] } }, label).dates, undefined);
  // Operation Martin: "1943" and "March 1943" are one date, the finer.
  const martin = [time('+1943-00-00T00:00:00Z', 9), time('+1943-03-00T00:00:00Z', 10)];
  assert.deepEqual(finestPoints(martin), [martin[1]]);
  assert.equal(battleRow({ id: 'Q19384597', labels: { en: { value: 'Operation Martin' } }, claims: { P585: martin, P625: [point] } }, label).date.from, '1943-03');
  // Every rank but deprecated, as War Focus's query (p:P585) reads it: the Ardenne Abbey massacre, 7 June 1944
  // (preferred) and 8 June (normal), both days; a deprecated value is left out; a year BC is kept.
  const ardenne = [time('+1944-06-07T00:00:00Z', 11, 'preferred'), time('+1944-06-08T00:00:00Z')];
  assert.equal(finestPoints(ardenne).length, 2);
  assert.deepEqual(battleRow({ id: 'Q22947455', labels: { en: { value: 'Ardenne Abbey massacre' } }, claims: { P585: ardenne, P625: [point] } }, label).dates.map(d => d.from), ['1944-06-07', '1944-06-08']);
  assert.equal(finestPoints([...ardenne, time('+1944-06-20T00:00:00Z', 11, 'deprecated')]).length, 2);
  assert.equal(finestPoints([time('-0490-00-00T00:00:00Z', 9)]).length, 1);
  // A battle War Focus holds is named as War Focus shows it; NAMES keeps a name Wikidata's label was lately changed from.
  const { NAMES, focusNames } = await import('../omni/scripts/build-battles.mjs');
  const sinwar = { id: 'Q130549291', labels: { en: { value: 'Shahadat of Yahya Sinwar' } }, claims: { P585: [time('+2024-10-16T00:00:00Z')], P625: [point] } };
  assert.equal(NAMES.Q130549291, 'killing of Yahya Sinwar');
  assert.equal(battleRow(sinwar, label).label, 'killing of Yahya Sinwar');
  assert.equal(battleRow({ ...q488, labels: { en: { value: 'a new label' } } }, label, null, null, 'atomic bombings of Hiroshima and Nagasaki').label, 'atomic bombings of Hiroshima and Nagasaki', 'War Focus’s name');
  assert.equal(focusNames().get('Q130549291'), 'killing of Yahya Sinwar');
  // Iwo Jima: War Focus's start (its article's), with Wikidata's kept.
  const iwo = { id: 'Q180182', labels: { en: { value: 'Battle of Iwo Jima' } }, claims: { P580: [time('+1945-02-08T00:00:00Z')], P582: [time('+1945-03-26T00:00:00Z')], P625: [point] } };
  const fix = focusDates().get('Q180182');
  assert.deepEqual(fix, { s: '1945-02-19', sW: '1945-02-08', w: 'Battle of Iwo Jima' });
  const ri = battleRow(iwo, label, 'wf-ww2', fix);
  assert.deepEqual([ri.date.from, ri.date.to, ri.wikidataFrom], ['1945-02-19', '1945-03-26', '1945-02-08']);
  assert.equal(ri.src.date.id, 'wikipedia');
  assert.match(ri.src.date.line, /English Wikipedia, “Battle of Iwo Jima”.*19 February 1945; Wikidata Q180182 starts it 8 February 1945 \(start time, P580: no reference\)/);
  assert.equal(battleRow(iwo, label).date.from, '1945-02-08', 'no correction, Wikidata’s start');
  assert.equal(battleRow({ ...iwo, claims: { ...iwo.claims, P580: [time('+1945-02-19T00:00:00Z')] } }, label, null, fix).wikidataFrom, undefined, 'once Wikidata agrees, nothing to correct');
});

test('omni-battles: the rebuilt layer dates Hiroshima and Nagasaki on both days and Iwo Jima from 19 February 1945', async () => {
  const f = json('../omni/data/layers/battles.json');
  const by = new Map(f.rows.map(r => [r.q, r]));
  assert.deepEqual(by.get('Q488').dates.map(d => d.from), ['1945-08-06', '1945-08-09']);
  assert.equal(by.get('Q180182').date.from, '1945-02-19'); assert.equal(by.get('Q180182').wikidataFrom, '1945-02-08');
  assert.deepEqual(by.get('Q2909620').dates.map(d => d.from), ['1943-11-05', '1944-03-01'], 'the Vatican: two raids, not a span');
  const sources = new Set(json('../integration/sources.json').sources.map(s => s.id));
  for (const r of f.rows) {
    assert.ok(sources.has(r.src.date.id) && r.src.date.loc, `${r.q}: its date's source`);
    if (!r.dates) continue;
    assert.ok(r.dates.length > 1 && r.date.from === r.dates[0].from && !r.date.to, `${r.q}: its first day, no span`);
    assert.deepEqual([...r.dates.map(d => d.from)].sort(), r.dates.map(d => d.from), `${r.q}: in order`);
  }
  // Every War Focus battle the layer holds starts as War Focus shows it.
  const ww2 = json('../battlefield/focus/data/wars/ww2.json');
  for (const b of ww2.battles.filter(b => b.sW && by.has(b.q))) assert.equal(by.get(b.q).date.from, b.s, `${b.q}: War Focus's start`);
  // The Ardenne Abbey massacre on both its days, as War Focus gives it (Wikidata: 7 June preferred, 8 June normal).
  assert.deepEqual(by.get('Q22947455').dates.map(d => d.from), ['1944-06-07', '1944-06-08']);
  assert.deepEqual(ww2.battles.find(b => b.q === 'Q22947455').pts, ['1944-06-07', '1944-06-08']);
  // Every battle both pages hold has War Focus's name (the killing of Yahya Sinwar, not Wikidata's new label).
  const gaza = json('../battlefield/focus/data/wars/gaza-war.json');
  assert.equal(by.get('Q130549291').label, gaza.battles.find(b => b.q === 'Q130549291').n);
  assert.equal(by.get('Q130549291').label, 'killing of Yahya Sinwar');
  const { focusNames } = await import('../omni/scripts/build-battles.mjs');
  for (const [q, n] of focusNames()) if (by.has(q)) assert.equal(by.get(q).label, n, `${q}: War Focus's name`);
  const L = json('../omni/data/layers.json').layers.find(l => l.id === 'battles');
  assert.match(L.method, /each is a date of its own \(a day, or only a month or a year where that is all Wikidata gives\), not a span \(the atomic bombings of Hiroshima and Nagasaki, 6 and 9 August 1945\), and every one is read that Wikidata does not mark deprecated/);
  assert.match(L.method, /the Battle of Iwo Jima: 19 February 1945, not 8 February/);
  assert.match(L.method, /a start taken from English Wikipedia is CC BY-SA 4.0/);
  assert.doesNotMatch(JSON.stringify(f.rows), /each a day of its own/, 'a point may be a month');
  // The legend names English Wikipedia for the start it gives (Iwo Jima's), set by the build from the rows.
  assert.equal(L.legend, 'Battles: Wikidata (CC0), each date and point with its Wikidata item and property; one start, as War Focus gives it, from the battle’s English Wikipedia article (CC BY-SA 4.0, as a fact), named in its row (Battle of Iwo Jima)');
  const { battlesLegend } = await import('../omni/scripts/build-battles.mjs');
  assert.equal(L.legend, battlesLegend(f));
  assert.equal(battlesLegend({ rows: f.rows.filter(r => r.src.date.id === 'wikidata') }), 'Battles: Wikidata (CC0), each date and point with its Wikidata item and property');
});

test('catalogue: retrospective-wars says its type is the last active year\'s; war-focus-battles gives start_wikidata and pts, described', () => {
  const s = text('../integration/scripts/build-catalog.mjs');
  assert.match(s, /\['type', 'Conflict type in its last active year \(civil, internationalised civil, interstate, colonial…\)/);
  assert.match(s, /start_wikidata: b\.sW \|\| null, pts: b\.pts \? b\.pts\.join\(', '\) : null/);
  assert.match(s, /\['start_wikidata', 'Wikidata\\'s start, where War Focus shows the battle from its English Wikipedia article\\'s start instead/);
  assert.match(s, /\['pts', 'For a battle Wikidata gives several points in time and no start or end, each date, comma-separated \(YYYY-MM-DD a day, YYYY-MM a month, YYYY a year\): separate dates, not a span/);
  assert.match(s, /\['end', 'End date: Wikidata\\'s, except where Wikidata ends the battle more than a month after its English Wikipedia article does, when it is the article\\'s \(the page marks it uncertain and gives both\); for a battle of several dates \(pts\), the last of them, not the end of a span'\]/);
  assert.match(s, /licence: 'Wikidata CC0; the figure_ columns, and a start or end War Focus takes from the battle\\'s English Wikipedia article, from English Wikipedia, CC BY-SA 4\.0/);
  // The cases the notes name are the data's: Sangin's end is its article's (eA), Wikidata's later one (eW) not exported.
  const sangin = json('../battlefield/focus/data/wars/afghanistan-2001.json').battles.find(b => b.q === 'Q4872292');
  assert.deepEqual([sangin.e, sangin.eA, sangin.eW], ['2011-10-31', '2011-10-31', '2014-05-31']);
});

test('page: War Focus\'s Method names the article\'s start, the several days and the dates of joining', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${BASE}/battlefield/focus/#war=ww2`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const t = await page.$eval('#sources', el => el.textContent);
    assert.match(t, /the Battle of Iwo Jima: 19 February 1945, not 8 February/);
    assert.match(t, /the atomic bombings of Hiroshima and Nagasaki: 6 and 9 August 1945/);
    assert.match(t, /Iran from 9 September 1943, Egypt from 24 February 1945/);
    assert.match(t, /Austria was in March 1938, is on neither side, only held \(Cliopatria draws it inside Germany/);
    await page.close();
  } finally { await browser.close(); }
});
