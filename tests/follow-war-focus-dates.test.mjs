// Follow-on to the war-pages build of 26 November 2026 (verifier's "Not done", item 6), built 27 November 2026.
// War Focus (battlefield/focus) against the Omni-Map's battles layer:
//   (a) dates   A battle Wikidata gives several points in time, and no start or end, keeps each as a date of its own
//               on War Focus as on the Omni-Map, by one rule (battlefield/focus/scripts/rules.mjs battleDates and
//               finestOf, which omni/scripts/build-battles.mjs imports, not a copy). War Focus's wars built before
//               that rule (21 and 22 November) gave the first point alone; three held such a battle (Wikidata, read
//               27 November 2026): the Markale massacres (Q1482369, P585 5 February 1994, preferred, and 28 August
//               1995, normal) in the Bosnian War, the Al-Shati refugee camp airstrike (Q122998566, P585 9 and 12
//               October 2023) in the Gaza war, and the bombing of Hankou (Q20039579, P585 3 and 14 October 1939) in
//               the Second Sino-Japanese War, which War Focus's Second World War already gave on both days. Those
//               three wars are rebuilt by the page's own build (--only).
//   (b) names   War Focus's build names a battle by VM's name where battlefield/focus/scripts/names-kept.mjs NAMES
//               keeps one (the table the Omni-Map's build exports too), else by Wikidata's English label: a build fed
//               Wikidata's label of 24 November 2026, "Shahadat of Yahya Sinwar", writes "killing of Yahya Sinwar".
//   After the second readers (27 November 2026): a closing "in World War II" no longer makes a raid of two days one that
//               lasted (the bombings of Kobe and Chiba); dates Wikidata marks deprecated are not read (Operation
//               Oyster, the invasion of Sicily); one unit's count keeps its own line's source and makes the side's
//               deaths at least that count (the Western Hubei Operation); a {{cite archive}} is cited by its holder (the
//               Swatow Operation). The Second Sino-Japanese War and the Second World War are rebuilt (--only).
//   Unit and data tests run with PRP_PAGES=0; the page test needs JDPI_URL (a local server: node tests/tools/serve.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const text = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(text(rel));
const read = new Map(), war = id => read.get(id) || read.set(id, json(`../battlefield/focus/data/wars/${id}.json`)).get(id);
const battle = (id, q) => war(id).battles.find(b => b.q === q);
const WARS = readdirSync(new URL('../battlefield/focus/data/wars/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
// What Wikidata and Wikipedia said on 27 November 2026 is pinned below only for the files built that day. War Focus is
// built again on the 2nd of each month (warfocus-refresh.yml) from what the sources then say, and the deploy that
// follows runs this file: an item or an article edited between two builds is no fault of the build, and must not hold
// back the deploy (as a pinned election date held back four refreshes on 27 November 2026). After a later build the
// rules are still tested here by fixture, and the shape of the built files whatever the day.
const AS_BUILT = json('../battlefield/focus/data/index.json').generated.slice(0, 10) === '2026-11-27';
const LATER = 'the files are a later build than 27 November 2026, and the sources may say otherwise now';

test('war-focus-dates: the Markale massacres, the Al-Shati airstrike and the bombing of Hankou keep both their dates', () => {
  if (AS_BUILT) {
    const markale = battle('bosnian-war', 'Q1482369');
    assert.deepEqual(markale.pts, ['1994-02-05', '1995-08-28']);
    assert.deepEqual([markale.s, markale.e, markale.p], ['1994-02-05', '1995-08-28', null]);
    const shati = battle('gaza-war', 'Q122998566');
    assert.deepEqual(shati.pts, ['2023-10-09', '2023-10-12']);
    assert.deepEqual([shati.s, shati.e], ['2023-10-09', '2023-10-12']);
    const hankou = battle('second-sino-japanese', 'Q20039579');
    assert.deepEqual(hankou.pts, ['1939-10-03', '1939-10-14']);
  }
  // One battle, one set of dates, in every war that lists it (Hankou is in the Second World War's file too).
  const copies = new Map();
  for (const id of WARS) for (const b of war(id).battles) (copies.get(b.q) || copies.set(b.q, []).get(b.q)).push({ id, b });
  let several = 0;
  for (const [q, l] of copies) {
    if (!l.some(x => x.b.pts)) continue;
    several++;
    for (const x of l) assert.deepEqual(x.b.pts, l[0].b.pts, `${q}: ${x.id} gives ${x.b.pts} where ${l[0].id} gives ${l[0].b.pts}`);
    // Whatever the build's day: several dates are two or more, each later than the one before; the battle runs from
    // the first to the last, and its end is not called unrecorded.
    const { pts, s, e, u } = l[0].b, cut = (d, as) => String(d).slice(0, as.length);
    assert.ok(pts.length > 1 && pts.every((d, i) => !i || pts[i - 1] < d), `${q}: ${pts}`);
    assert.deepEqual([cut(s, pts[0]), cut(e, pts.at(-1)), u ?? null], [pts[0], pts.at(-1), null], `${q}: ${s} to ${e}, ${pts}`);
  }
  assert.ok(several >= 1, 'War Focus holds a battle of several dates');
});

test('war-focus-dates: every battle both pages hold has the same separate dates on War Focus as on the Omni-Map', () => {
  const layer = json('../omni/data/layers/battles.json');
  const rows = layer.rows.filter(r => /^wf-/.test(r.war || ''));
  const by = new Map(rows.map(r => [r.q, r]));
  const from = r => r.dates?.map(d => String(d.from));
  // Only while the two pages were built from Wikidata within two days of each other: War Focus is rebuilt on the 2nd of
  // each month (warfocus-refresh.yml) and the Omni-Map's battles layer by hand, so a Wikidata edit between the two
  // builds is no fault of either page, and must not hold back the refresh's deploy.
  const wfBuilt = Date.parse(json('../battlefield/focus/data/index.json').generated), omBuilt = Date.parse(layer.built);
  if (Math.abs(wfBuilt - omBuilt) > 2 * 864e5) return;
  // The battles named in this part: Markale, Al-Shati, the Ardenne Abbey massacre and the atomic bombings of Hiroshima
  // and Nagasaki (Wikidata, read 27 November 2026).
  for (const [id, q] of [['bosnian-war', 'Q1482369'], ['gaza-war', 'Q122998566'], ['ww2', 'Q22947455'], ['ww2', 'Q488']]) {
    assert.ok(battle(id, q)?.pts?.length > 1, `${q}: War Focus gives its dates`);
    assert.deepEqual(from(by.get(q)), battle(id, q).pts, `${q}: the Omni-Map gives the same`);
  }
  let n = 0;
  for (const r of rows) {
    const b = battle(r.war.slice(3), r.q);
    assert.ok(b, `${r.q}: in ${r.war}`);
    if (r.dates || b.pts) { n++; assert.deepEqual(b.pts, r.dates?.map(d => String(d.from)), `${r.q} ${r.label}: War Focus ${b.pts}, the Omni-Map ${r.dates?.map(d => d.from)}`); }
  }
  // The War Focus battles the layer holds by another war's file (a battle two wars list keeps the first) agree too.
  for (const id of WARS) for (const b of war(id).battles) if (b.pts && by.has(b.q)) assert.deepEqual(by.get(b.q).dates?.map(d => String(d.from)), b.pts, `${id} ${b.q}`);
  assert.ok(n >= 7, `${n} battles of several dates on both pages`);
});

test('war-focus-dates: one rule for both pages, imported, not copied', async () => {
  const R = await import('../battlefield/focus/scripts/rules.mjs');
  const O = await import('../omni/scripts/build-battles.mjs');
  // Operation Martin: "1943" and "March 1943" are one date, the finer; two days are two dates.
  const martin = [{ v: '1943-00-00T00:00:00Z', p: 9 }, { v: '1943-03-00T00:00:00Z', p: 10 }];
  assert.deepEqual(R.finestOf(martin), [martin[1]]);
  assert.equal(R.holdsFiner(martin[0], martin[1]), true);
  assert.equal(R.holdsFiner(martin[1], martin[0]), false);
  const markale = [{ v: '1994-02-05T00:00:00Z', p: 11 }, { v: '1995-08-28T00:00:00Z', p: 11 }];
  assert.deepEqual(R.finestOf(markale), markale);
  assert.deepEqual(R.battleDates({ point: markale, name: 'Markale massacres' }).pts, ['1994-02-05', '1995-08-28']);
  // The Omni-Map's finestPoints is War Focus's finestOf over Wikidata's statements (every rank but deprecated).
  const claim = (t, precision, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: { time: t, precision } } } });
  const cs = [claim('+1943-00-00T00:00:00Z', 9), claim('+1943-03-00T00:00:00Z', 10), claim('+1943-05-02T00:00:00Z', 11, 'deprecated')];
  assert.deepEqual(O.finestPoints(cs), [cs[1]]);
  const omni = text('../omni/scripts/build-battles.mjs'), rules = text('../battlefield/focus/scripts/rules.mjs'), build = text('../battlefield/focus/scripts/build.mjs');
  assert.match(omni, /import \{ battleDates, finestOf \} from '\.\.\/\.\.\/battlefield\/focus\/scripts\/rules\.mjs';/);
  assert.doesNotMatch(omni, /const holds = /, 'no copy of the rule in the Omni-Map’s build');
  assert.match(rules, /const points = finestOf\(point\)\.filter\(x => wdDate\(x\.v, x\.p\)\);/);
  assert.match(build, /import \{ battleDates, fixDates,[^}]*\bbattlesFromRows\b[^}]*\} from '\.\/rules\.mjs';/);
});

test('war-focus-names: one table; a build fed Wikidata\'s label "Shahadat of Yahya Sinwar" writes "killing of Yahya Sinwar"', async () => {
  const T = await import('../battlefield/focus/scripts/names-kept.mjs');
  const O = await import('../omni/scripts/build-battles.mjs');
  const { battlesFromRows, battleDates } = await import('../battlefield/focus/scripts/rules.mjs');
  assert.equal(T.NAMES.Q130549291, 'killing of Yahya Sinwar');
  assert.equal(O.NAMES, T.NAMES, 'the Omni-Map’s NAMES is the same table');
  // battlesOf's query rows (build.mjs), as Wikidata's label service gave them from 24 to 27 November 2026.
  const wd = q => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
  const lit = value => ({ type: 'literal', value });
  const rows = [
    { b: wd('Q130549291'), bLabel: lit('Shahadat of Yahya Sinwar'), bDescription: lit('2024 event in the Israel–Hamas war'), pt: lit('2024-10-16T00:00:00Z'), ptp: lit('11'), article: { value: 'https://en.wikipedia.org/wiki/Killing_of_Yahya_Sinwar' } },
    { b: wd('Q122998566'), bLabel: lit('Al-Shati refugee camp airstrike'), pt: lit('2023-10-09T00:00:00Z'), ptp: lit('11') },
    { b: wd('Q122998566'), bLabel: lit('Al-Shati refugee camp airstrike'), pt: lit('2023-10-12T00:00:00Z'), ptp: lit('11') },
    { b: wd('Q1'), bLabel: lit('Q1'), pt: lit('2024-01-01T00:00:00Z'), ptp: lit('11') },
    { b: wd('Q2'), bLabel: lit('outside the war'), pt: lit('2024-01-01T00:00:00Z'), ptp: lit('11') },
  ];
  const within = new Set(['Q130549291', 'Q122998566', 'Q1']);
  // Without the table, Wikidata's label of those days would reach the page; with it (as build.mjs passes it), VM's name.
  assert.equal(battlesFromRows(rows, within).get('Q130549291').n, 'Shahadat of Yahya Sinwar');
  const by = battlesFromRows(rows, within, { names: T.NAMES });
  assert.equal(by.get('Q130549291').n, 'killing of Yahya Sinwar');
  assert.equal(by.get('Q130549291').w, 'Killing of Yahya Sinwar');
  assert.equal(by.get('Q122998566').n, 'Al-Shati refugee camp airstrike', 'any other battle keeps Wikidata’s label');
  assert.equal(by.has('Q1'), false, 'no English label: left out');
  assert.equal(by.has('Q2'), false, 'not within the war: left out');
  const t = by.get('Q122998566').t;
  assert.deepEqual(battleDates({ ...t, name: 'Al-Shati refugee camp airstrike' }).pts, ['2023-10-09', '2023-10-12']);
  // The build reads its rows so and writes each battle's n as it is (build.mjs).
  const build = text('../battlefield/focus/scripts/build.mjs');
  assert.match(build, /^import \{ NAMES \} from '\.\/names-kept\.mjs';$/m);
  assert.match(build, /const by = battlesFromRows\(rows, within, \{ cas, deaths, coords, names: NAMES \}\);/);
  assert.doesNotMatch(text('../battlefield/focus/scripts/rules.mjs'), /^import /m, 'rules.mjs keeps no imports (the realtime build and its tests read it alone)');
  assert.match(build, /battles: battles\.map\(\(\{ q, n, /);
  assert.doesNotMatch(build, /n: r\.bLabel\?\.value/, 'no name read past the table');
  // The file holds the name whatever Wikidata's label reads on the build's day (while Wikidata keeps the item within
  // the war), and the Method says how battles are named.
  const sinwar = battle('gaza-war', 'Q130549291');
  if (AS_BUILT) assert.ok(sinwar, 'the Gaza war lists it');
  if (sinwar) assert.equal(sinwar.n, 'killing of Yahya Sinwar');
  assert.match(text('../battlefield/focus/index.html'), /Their names are Wikidata's English labels, except where a label was lately changed away from the title of the battle's English Wikipedia article, when VM keeps the earlier name, as the Omni-Map does \(the killing of Yahya Sinwar, whose English label read ‘Shahadat of Yahya Sinwar’ from 24 to 27 November 2026\)\./);
});

// Second readers of 27 November 2026.
test('war-focus-dates: a closing "in World War II" does not make a raid of two days one that lasted (Kobe, Chiba)', async () => {
  const { battleDates, IN_WAR } = await import('../battlefield/focus/scripts/rules.mjs');
  const day = v => ({ v: `${v}T00:00:00Z`, p: 11 });
  // Wikidata Q4940711 and Q4940693, read 27 November 2026: two P585 each, no P580 or P582.
  const kobe = battleDates({ point: [day('1945-02-04'), day('1945-06-05')], name: 'bombing of Kobe in World War II' });
  assert.deepEqual([kobe.s, kobe.e, kobe.u, kobe.pts], ['1945-02-04', '1945-06-05', null, ['1945-02-04', '1945-06-05']]);
  assert.deepEqual(battleDates({ point: [day('1945-06-10'), day('1945-07-07')], name: 'Bombing of Chiba in World War II' }).pts, ['1945-06-10', '1945-07-07']);
  assert.equal(IN_WAR('Bombing of Sendai during World War II'), 'Bombing of Sendai');
  assert.equal(IN_WAR('Siege of Madrid during the Spanish Civil War'), 'Siege of Madrid');
  // A name that says it lasted still does, war or no war; and one point is read as before ("end not recorded").
  assert.equal(battleDates({ point: [day('1936-11-08'), day('1937-03-01')], name: 'Siege of Madrid during the Spanish Civil War' }).u, 'end');
  assert.equal(battleDates({ point: [day('1943-01-01'), day('1943-03-01')], name: 'Six-Day War' }).u, 'end');
  assert.equal(battleDates({ point: [day('1944-10-15')], name: 'Bombing of Braunschweig in World War II' }).u, 'end');
  assert.match(text('../battlefield/focus/index.html'), /\(the atomic bombings of Hiroshima and Nagasaki: 6 and 9 August 1945\), and a name’s closing ‘in World War II’ says which war it was part of, not that it lasted \(the bombing of Kobe: 4 February and 5 June 1945\);/);
  // The Second World War's file, rebuilt by the page's own build: both raids on both days, drawn in their months only.
  for (const [q, pts] of AS_BUILT ? [['Q4940711', ['1945-02-04', '1945-06-05']], ['Q4940693', ['1945-06-10', '1945-07-07']]] : []) {
    const b = battle('ww2', q);
    assert.deepEqual(b.pts, pts, `${q} ${b.n}`);
    assert.deepEqual([b.s, b.e, b.u ?? null], [pts[0], pts[1], null]);
  }
});

test('war-focus-dates: a date Wikidata marks deprecated is not read (Operation Oyster, the invasion of Sicily)', () => {
  const build = text('../battlefield/focus/scripts/build.mjs');
  const dates = /const DATES = `([\s\S]*?)`;/.exec(build)[1];
  for (const p of ['P585', 'P580', 'P582']) assert.match(dates, new RegExp(`p:${p} \\?(\\w+) \\. \\?\\1 psv:${p} \\[[^\\]]*\\] ; wikibase:rank \\?(\\w+) \\. FILTER\\(\\?\\2 != wikibase:DeprecatedRank\\)`), p);
  // Wikidata, read 27 November 2026: Oyster's end 14 April 1969 and Sicily's 17 August 1944 are deprecated (reason
  // Q41755623); neither is shown as Wikidata's end any more.
  if (AS_BUILT) {
    const oyster = battle('ww2', 'Q42886508'), sicily = battle('ww2', 'Q217981');
    assert.notEqual(oyster.u, 'conflict'); assert.equal(oyster.eW ?? null, null); assert.equal(oyster.s, '1942-12-06');
    assert.deepEqual([sicily.s, sicily.e, sicily.u ?? null, sicily.eW ?? null], ['1943-07-09', '1943-08-17', null, null]);
  }
  assert.match(text('../battlefield/focus/index.html'), /Their dates are Wikidata's at the precision it records them, leaving out any Wikidata marks as deprecated;/);
});

test('war-focus-dates: one unit\'s count is that unit\'s, at least the side\'s, and not another line\'s source (Western Hubei)', async () => {
  const I = await import('../battlefield/focus/scripts/infobox.mjs');
  // English Wikipedia, "Western Hubei Operation", revision 1386923707 (21 November 2026), casualties2 (its titles cut).
  const japan = 'According to the recollection of a veteran of the 19th Mountain Artillery Regiment : numerous infantry casualties with dozens of bodies of the fallen cremated after the battle.<ref>{{cite book |title=x |date=1987 |publisher=[[Asahi Sonorama]] |page=23}}</ref><br><br>65th Infantry Regiment : 42 killed.<ref>{{cite book |title=x |date=2007 |publisher=Aizuwakamatsu City History Research Association|page=68}}</ref><br><br>58th Infantry Regiment according to a veteran\'s recollection : many killed in action.<ref>{{cite book |title=x |date=1980 |publisher=Veterans Association of the 11th Company of the 58th Infantry Regiment |page=252}}</ref><br><br>116th Infantry Regiment : unknown.';
  const s = I.readSide(japan);
  assert.deepEqual([s.deaths.low, s.deaths.high, s.deaths.status, s.deaths.atLeast, s.deaths.by], [42, 42, 'fact', true, undefined]);
  assert.ok(s.deaths.refs.includes('Aizuwakamatsu City History Research Association 2007'));
  const china = '26th corps :<br>47 officers and 1,800 soldiers killed<br>124 officers and 2,699 soldiers wounded';
  const both = I.readCasualties({ casualties1: china, casualties2: japan });
  assert.deepEqual([both.deaths.low, both.deaths.atLeast], [1889, true]);
  // Words alone under a claimant's name lend it to no figure (Operation Shahi Tandar: the 8 captured are no ISAF claim).
  const t = I.readSide('"Several hundred killed" (ISAF claim)<br>8 captured');
  assert.deepEqual([t.cas.low, t.cas.by], [8, undefined]);
  // The two war files that hold it, rebuilt by the page's own build.
  for (const id of AS_BUILT ? ['second-sino-japanese', 'ww2'] : []) {
    const side = json(`../battlefield/focus/data/figures/${id}.json`).battles.Q17036086.sides[1];
    assert.deepEqual(side.d, { low: 42, high: 42, status: 'fact', atLeast: true }, id);
    assert.ok(side.refs.includes('Aizuwakamatsu City History Research Association 2007'));
    const fd = battle(id, 'Q17036086').fd;
    assert.deepEqual([fd.v, fd.atLeast], [1889, true], id);
  }
});

test('war-focus-dates: a {{cite archive}} is cited by its holder (the Swatow Operation)', async () => {
  const { citationOf } = await import('../battlefield/focus/scripts/infobox.mjs');
  // English Wikipedia, "Swatow Operation", revision 1386921114 (21 November 2026), casualties1's reference.
  assert.equal(citationOf('{{cite archive |item=同盟旬報第3巻第18号（通号073号）|item-url=https://www.jacar.archives.go.jp/das/meta/M23070014600 |collection=同盟旬報第3巻第18号（通号073号）|access-date=19 November 2026 |institution=Japan Center for Historical Records |pages=7-8}}'), 'Japan Center for Historical Records');
  assert.equal(citationOf('{{cite archive |item-url=https://www.jacar.archives.go.jp/das/meta/M23070014600}}'), 'jacar.archives.go.jp');
  if (!AS_BUILT) return;
  const sides = json('../battlefield/focus/data/figures/second-sino-japanese.json').battles.Q7654052.sides;
  assert.deepEqual(sides[0].refs, ['Japan Center for Historical Records']);
  assert.ok(!JSON.stringify(sides).includes('a named reference in the article'), 'the reused reference is named');
});

test('page: War Focus lists each of the three battles on both its dates, and draws it only in their months', AS_BUILT ? pageTest : { skip: LATER }, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const row = name => page.$$eval('#battles-rows tr', (rows, n) => { const r = rows.find(x => x.querySelector('button.rowbtn')?.textContent === n); return r ? { dates: r.children[1].textContent, cls: r.className } : null; }, name);
  const open = async (id, m, name) => {
    await page.goto(`${BASE}/battlefield/focus/#war=${id}&m=${m}&v=battles`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(([m, n]) => document.querySelector('#month')?.dataset.value === m && [...document.querySelectorAll('#battles-rows button.rowbtn')].some(b => b.textContent === n), [m, name], { timeout: 30000 });
    return row(name);
  };
  try {
    assert.equal((await open('bosnian-war', '1994-02', 'Markale massacres')).dates, '5 Feb 1994 and 28 Aug 1995');
    assert.equal((await open('bosnian-war', '1994-02', 'Markale massacres')).cls, 'sel');
    assert.equal((await open('bosnian-war', '1995-08', 'Markale massacres')).cls, 'sel');
    assert.equal((await open('bosnian-war', '1994-12', 'Markale massacres')).cls, '', 'not under way between the two');
    assert.equal((await open('gaza-war', '2023-10', 'Al-Shati refugee camp airstrike')).dates, '9 Oct 2023 and 12 Oct 2023');
    assert.equal((await open('second-sino-japanese', '1939-10', 'Bombing of Hankou')).dates, '3 Oct 1939 and 14 Oct 1939');
    assert.equal((await open('gaza-war', '2024-10', 'killing of Yahya Sinwar')).dates, '16 Oct 2024');
    assert.equal((await open('ww2', '1945-06', 'bombing of Kobe in World War II')).dates, '4 Feb 1945 and 5 Jun 1945');
    assert.equal((await open('ww2', '1945-07', 'Bombing of Chiba in World War II')).dates, '10 Jun 1945 and 7 Jul 1945');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
