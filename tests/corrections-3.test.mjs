// War Focus: sides and dates (build 3 of the corrections from ChatGPT's page reviews, CONFIRMED.md, 25 November 2026).
//   front-pages-8   Egypt fought with the Allies only from its declaration of war, 24 February 1945
//                   (English Wikipedia, "Egypt in World War II": "On February 24, 1945, Egypt declared war on Germany
//                   and Japan"; until then it "remained formally neutral").
//   front-pages-7   Austria is no side of the Second World War: annexed by Germany on 12 March 1938 (English Wikipedia,
//                   "Anschluss"), it is shown held by the Axis (control), as Czechoslovakia is.
//   front-pages-9   The Battle of Iwo Jima began on 19 February 1945 (its English Wikipedia article's infobox, "19
//                   February – 26 March 1945"); Wikidata's start, 8 February (P580), gives no reference. War Focus's
//                   build has a list of date corrections, each with its source.
//   front-pages-10  A battle with two points in time (P585) is dated on both days, not the first alone: the atomic
//                   bombings of Hiroshima and Nagasaki, 6 and 9 August 1945 (Wikidata Q488).
//   front-pages-12  A war's name in the menu carries its years once: "Chinese Civil War (1927–1936)", not twice.
// After the second readers (26 November 2026):
//   - Several points in time are several days, not a span: the Vatican was bombed on 5 November 1943 and 1 March 1944
//     (Wikidata Q2909620) and is not under way in between; so too the raids on Yawata, Innoshima, Hitachi and Kamaishi.
//   - A point that holds a finer one is one date recorded twice: Operation Martin is March 1943 (Q19384597), Operation
//     Tarbrush May 1944 (Q7097614), not the whole year.
//   - Iran is on the Allied side from its declaration of war on Germany, 9 September 1943, not from its invasion of 25
//     August 1941 (the same rule as Egypt's).
//   - A corrected start keeps Wikidata's precision (sWp); a correction that cannot apply is refused or warned of; the
//     menu says "present" for every ongoing war.
// The page test runs against JDPI_URL (default live); PRP_PAGES=0 leaves it out.
// After the War Focus refresh was rehearsed (27 November 2026): War Focus is built again on the 2nd of each month from
// what Wikidata and Wikipedia then say, and the deploy that follows runs this file. The sides, the control and the start
// corrections are VM's own (wars.mjs, build.mjs DATE_FIXES) and are pinned outright; the days and ends Wikidata gives
// the battles named here are pinned only for the files built on 27 November 2026 (AS_BUILT, the index's `generated`),
// and the rules that read them are tested on fixtures of the same values whatever the day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { builtOn } from './tools/as-built.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const text = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(text(rel));
const { WARS } = await import('../battlefield/focus/scripts/wars.mjs');
const WW2 = WARS.find(w => w.id === 'ww2');
const ww2 = json('../battlefield/focus/data/wars/ww2.json');
const qOf = x => (Array.isArray(x) ? x[0] : x);
const AS_BUILT = builtOn(json('../battlefield/focus/data/index.json').generated, '2026-11-27');
// The Vatican's and Yawata's dates as Wikidata gave them on 27 November 2026 (Q2909620, Q4940734; P585).
const VATICAN = { q: 'Q2909620', n: 'Bombing of the Vatican', s: '1943-11-05', e: '1944-03-01', p: null, pts: ['1943-11-05', '1944-03-01'] };
const YAWATA = { q: 'Q4940734', n: 'Bombing of Yawata', s: '1944-06-01', e: '1945-08-08', p: 'm', pe: 'd', pts: ['1944-06', '1944-08-20', '1945-08-08'] };

test('front-pages-8: Egypt is on the Allied side only from its declaration of war, 24 February 1945', () => {
  assert.deepEqual(WW2.sides.a.q.filter(x => qOf(x) === 'Q79'), [['Q79', '1945-02-24']]);
  assert.deepEqual(ww2.sides.a.states.filter(s => s.q === 'Q79'), [{ q: 'Q79', from: '1945-02-24', to: null }], 'the committed file, rebuilt');
  assert.ok(!ww2.sides.b.states.some(s => s.q === 'Q79') && !ww2.control.some(c => c.q === 'Q79'), 'nor anything else before');
});

test('front-pages-7: Austria is no side of the Second World War, only held by the Axis, as Czechoslovakia is', () => {
  for (const s of ['a', 'b']) assert.ok(!WW2.sides[s].q.some(x => qOf(x) === 'Q40'), `wars.mjs side ${s}`);
  for (const s of ['a', 'b']) assert.ok(!ww2.sides[s].states.some(x => x.q === 'Q40'), `ww2.json side ${s}`);
  assert.deepEqual(ww2.control.filter(c => c.q === 'Q40'), [{ q: 'Q40', side: 'b', from: '1939-09-01', to: '1945-04-13' }], 'still drawn hatched as held');
  assert.ok(ww2.names.Q40, 'and still named');
  // The pattern it follows: Czechoslovakia is held, not a side.
  assert.ok(!ww2.sides.b.states.some(x => x.q === 'Q33946') && ww2.control.some(c => c.q === 'Q33946'));
});

test('front-pages-10: a battle with several points in time is dated on each day, not the first alone, and not as a span', async () => {
  const { battleDates } = await import('../battlefield/focus/scripts/rules.mjs');
  const P = (v, p = 11) => ({ v: v + 'T00:00:00Z', p });
  // Wikidata Q488, read 25 November 2026: two P585 values of normal rank, 6 and 9 August 1945, in either order (as the
  // build's query gives them, without Wikidata's leading +).
  const point = [P('1945-08-09'), P('1945-08-06')];
  const d = battleDates({ point, name: 'atomic bombings of Hiroshima and Nagasaki' });
  assert.deepEqual([d.s, d.e, d.u, d.pts], ['1945-08-06', '1945-08-09', null, ['1945-08-06', '1945-08-09']], 'first and last for sorting, each day in pts');
  // Two values a day apart stay two dated days, not a span.
  assert.deepEqual(battleDates({ point: [P('1944-06-06'), P('1944-06-07')], name: 'Battle of X' }).pts, ['1944-06-06', '1944-06-07']);
  // The Vatican (Q2909620): two raids, 5 November 1943 and 1 March 1944. Yawata (Q4940734): June 1944 (to the month),
  // 20 August 1944 and 8 August 1945. Each point at its own precision.
  assert.deepEqual(battleDates({ point: [P('1944-03-01'), P('1943-11-05')], name: 'Bombing of the Vatican' }).pts, ['1943-11-05', '1944-03-01']);
  assert.deepEqual(battleDates({ point: [P('1944-06-01', 10), P('1944-08-20'), P('1945-08-08')], name: 'Bombing of Yawata' }).pts, ['1944-06', '1944-08-20', '1945-08-08']);
  // One point in time is still a one-day battle with no pts; the same day twice is one day; a campaign's point is still
  // only its start; a battle with a start and an end is a span.
  const one = battleDates({ point: [point[1]], name: 'Battle of Y' });
  assert.deepEqual([one.s, one.e, one.pts], ['1945-08-06', '1945-08-06', undefined]);
  assert.equal(battleDates({ point: [P('1945-08-06'), P('1945-08-06')], name: 'Battle of Y' }).pts, undefined);
  assert.equal(battleDates({ point, name: 'Okinawa campaign' }).e, null);
  assert.equal(battleDates({ start: [P('1944-06-06')], end: [P('1944-08-30')], point, name: 'Battle of Z' }).pts, undefined);
  // The committed file, rebuilt (Wikidata as read on 27 November 2026).
  const by = new Map(ww2.battles.map(b => [b.q, b]));
  if (AS_BUILT) {
    assert.deepEqual(['s', 'e', 'pts'].map(k => by.get('Q488')[k]), ['1945-08-06', '1945-08-09', ['1945-08-06', '1945-08-09']]);
    for (const x of [VATICAN, YAWATA]) assert.deepEqual(['n', 's', 'e', 'p', 'pe', 'pts'].map(k => by.get(x.q)[k] ?? null), ['n', 's', 'e', 'p', 'pe', 'pts'].map(k => x[k] ?? null), x.n);
  }
  // Every battle of the war with pts has two days or more, its first and last as s and e, and no doubt about its end.
  for (const b of ww2.battles.filter(x => x.pts)) assert.ok(b.pts.length > 1 && b.s.startsWith(b.pts[0]) && b.e.startsWith(b.pts.at(-1)) && !b.u, b.q);
});

test('several points in time: the page draws the battle only in their months, and the month weights count only those', async () => {
  const app = text('../battlefield/focus/app.js');
  const pick = name => { const m = new RegExp(`^const ${name} = (.*);$`, 'm').exec(app); assert.ok(m, name); return m[1]; };
  const { overlaps, underWay } = new Function(`const ptMonth = ${pick('ptMonth')}; const overlaps = ${pick('overlaps')}; const underWay = ${pick('underWay')}; return { overlaps, underWay };`)();
  // The two battles as War Focus's file held them on 27 November 2026 (VATICAN, YAWATA; checked against the file above).
  const vatican = VATICAN;
  assert.equal(underWay(vatican, '1943-12', '1943-12'), false, 'not under way in December 1943, between its raids');
  for (const m of ['1943-11', '1944-03']) assert.equal(underWay(vatican, m, m), true, m);
  assert.equal(underWay(vatican, '1943-12', '1944-02'), false, 'nor in a period between them');
  assert.equal(underWay(vatican, '1943-12', '1944-03'), true, 'but in a period that holds a raid');
  const yawata = YAWATA;
  assert.deepEqual(['1944-06', '1944-07', '1944-08', '1945-01', '1945-08'].map(m => underWay(yawata, m, m)), [true, false, true, false, true]);
  // A battle with a start and an end is under way throughout, as before.
  assert.equal(overlaps({ s: '1944-06-06', e: '1944-08-30', p: null }, '1944-07', '1944-07'), true);
  const { monthWeights, endAgainstArticle } = await import('../battlefield/focus/scripts/rules.mjs');
  assert.deepEqual(monthWeights(['1943-11', '1943-12', '1944-01', '1944-02', '1944-03'], [{ s: '1943-11-05', e: '1944-03-01', p: null, pts: ['1943-11-05', '1944-03-01'] }]), [2, 1, 1, 1, 2]);
  assert.deepEqual(monthWeights(['1944-01', '1944-06', '1944-07'], [{ s: '1944-01-01', e: '1944-06-30', p: 'y', pe: 'm', pts: ['1944', '1944-06'] }]), [1, 2, 1], 'a point dated to its year weighs no month');
  // A battle of separate days has no end to check against its article.
  const raids = { s: '1944-06-01', e: '1945-08-08', p: 'm', pe: 'd', u: null, pts: ['1944-06', '1944-08-20', '1945-08-08'] };
  assert.equal(endAgainstArticle(raids, { d: '1944-06-16', p: null }), raids);
});

test('a point in time that holds a finer one is the same date twice: Operation Martin in March 1943, Tarbrush in May 1944', async () => {
  const { battleDates } = await import('../battlefield/focus/scripts/rules.mjs');
  // Wikidata, read 26 November 2026: Q19384597 P585 "1943" (precision 9, no reference) and "March 1943" (10, one
  // reference); Q7097614 "1944" (9, none) and "May 1944" (10, one). English Wikipedia, "Operation Martin": the
  // Norwegians returned to Norway in March 1943.
  const martin = battleDates({ point: [{ v: '1943-00-00T00:00:00Z', p: 9 }, { v: '1943-03-00T00:00:00Z', p: 10 }], name: 'Operation Martin' });
  assert.deepEqual([martin.s, martin.p, martin.e, martin.pe, martin.pts], ['1943-03-01', 'm', '1943-03-31', null, undefined]);
  const tarbrush = battleDates({ point: [{ v: '1944-05-01T00:00:00Z', p: 10 }, { v: '1944-01-01T00:00:00Z', p: 9 }], name: 'Operation Tarbrush' });
  assert.deepEqual([tarbrush.s, tarbrush.p, tarbrush.e], ['1944-05-01', 'm', '1944-05-31']);
  // A year that holds no finer point stays.
  assert.deepEqual(battleDates({ point: [{ v: '1943-01-01T00:00:00Z', p: 9 }, { v: '1944-03-01T00:00:00Z', p: 10 }], name: 'Operation W' }).pts, ['1943', '1944-03']);
  // The committed file, rebuilt (Wikidata as read on 27 November 2026).
  const by = new Map(ww2.battles.map(b => [b.q, b]));
  if (!AS_BUILT) return;
  assert.deepEqual(['s', 'e', 'p', 'pe'].map(k => by.get('Q19384597')[k] ?? null), ['1943-03-01', '1943-03-31', 'm', null], 'Operation Martin');
  assert.deepEqual(['s', 'e', 'p', 'pe'].map(k => by.get('Q7097614')[k] ?? null), ['1944-05-01', '1944-05-31', 'm', null], 'Operation Tarbrush');
});

test('Iran is on the Allied side only from its declaration of war on Germany, 9 September 1943', () => {
  // English Wikipedia, read 26 November 2026: "Declarations of war during World War II" (revision 1386501129), Iran on
  // Germany 1943-09-09; "Allies of World War II" (revision 1385751416), Iran 9 September 1943. Its occupation from 1941
  // stays drawn (control).
  assert.deepEqual(WW2.sides.a.q.filter(x => qOf(x) === 'Q794'), [['Q794', '1943-09-09']]);
  assert.deepEqual(ww2.sides.a.states.filter(s => s.q === 'Q794'), [{ q: 'Q794', from: '1943-09-09', to: null }], 'the committed file, rebuilt');
  assert.ok(!ww2.sides.b.states.some(s => s.q === 'Q794'));
  assert.deepEqual(ww2.control.filter(c => c.q === 'Q794'), [{ q: 'Q794', side: 'a', from: '1941-09-17', to: '1945-09-02' }]);
  assert.match(text('../battlefield/focus/scripts/wars.mjs'), /declared war on Germany on 9 September 1943 \(English\s+\/\/\s+Wikipedia, "Declarations of war during World War II", revision 1386501129/);
});

test('front-pages-9: date corrections, each with its source; the Battle of Iwo Jima from 19 February 1945', async () => {
  const { fixDates } = await import('../battlefield/focus/scripts/rules.mjs');
  const wd = { s: '1945-02-08', e: '1945-03-26', p: null, pe: null, u: null, eW: null };
  assert.deepEqual(fixDates(wd, { q: 'Q180182', s: '1945-02-19' }), { ...wd, s: '1945-02-19', sW: '1945-02-08' }, 'Wikidata\'s start kept beside');
  assert.equal(fixDates(wd, null), wd, 'no correction, no change');
  assert.equal(fixDates({ ...wd, s: '1945-02-19' }, { q: 'Q180182', s: '1945-02-19' }).sW, undefined, 'Wikidata mended: nothing to say');
  // A start Wikidata gives to the month becomes the day the source gives, and Wikidata's keeps its month (sWp), so the
  // page says "February 1945", not "1 Feb 1945"; the end keeps its own precision.
  assert.deepEqual(fixDates({ s: '1945-02-01', e: '1945-03-26', p: 'm', pe: 'd', u: null }, { s: '1945-02-19' }), { s: '1945-02-19', e: '1945-03-26', p: null, pe: null, u: null, sW: '1945-02-01', sWp: 'm' });
  assert.deepEqual(fixDates({ s: '1945-02-01', e: '1945-03-31', p: 'm', pe: null, u: null }, { s: '1945-02-19' }), { s: '1945-02-19', e: '1945-03-31', p: null, pe: 'm', u: null, sW: '1945-02-01', sWp: 'm' });
  assert.throws(() => fixDates(wd, { q: 'Q180182', s: '1945-04-01' }), /after its end/, 'a correction past the end is refused');
  // A correction that cannot apply is refused, not dropped unseen: a battle with no date, one dated only to its decade,
  // one of several separate days.
  assert.throws(() => fixDates(null, { q: 'Q1', s: '1945-02-19' }), /no start/);
  assert.throws(() => fixDates({ s: null, e: null, u: 'undated', dec: 1940 }, { q: 'Q1', s: '1945-02-19' }), /no start/);
  assert.throws(() => fixDates({ s: '1945-02-01', e: '1945-03-01', p: null, pts: ['1945-02-01', '1945-03-01'] }, { q: 'Q1', s: '1945-02-19' }), /several separate days/);
  assert.equal(fixDates(null, undefined), null, 'no correction, nothing to refuse');
  // The list in the build names its war and its source for every entry, and an entry whose battle is not among that
  // war's battles is warned of.
  const build = text('../battlefield/focus/scripts/build.mjs');
  const list = build.slice(build.indexOf('const DATE_FIXES = ['), build.indexOf('];', build.indexOf('const DATE_FIXES = [')));
  assert.match(list, /\{ war: 'ww2', q: 'Q180182', s: '1945-02-19'/);
  const entries = list.split('\n').filter(l => /q: 'Q\d+'/.test(l));
  assert.ok(entries.length >= 1);
  for (const entry of entries) assert.match(entry, /^\s*\{ war: '[a-z0-9-]+', q: 'Q\d+', s: '\d{4}-\d{2}-\d{2}', source: '[^']+', url: 'https:\/\/en\.wikipedia\.org\/w\/index\.php\?oldid=\d+'/, entry);
  assert.match(build, /fixDates\(battleDates\(/, 'applied where the dates are read');
  assert.match(build, /for \(const f of DATE_FIXES\) if \(f\.war === warId && !out\.some\(b => b\.q === f\.q\)\) console\.warn\(/);
  // The committed file, rebuilt; and the page names Wikipedia as a source of dates as well as of figures. The start is
  // DATE_FIXES' whatever the day; the end and Wikidata's start are Wikidata's as read on 27 November 2026.
  const iwo = ww2.battles.find(b => b.q === 'Q180182');
  assert.equal(iwo.s, '1945-02-19');
  if (AS_BUILT) assert.deepEqual([iwo.s, iwo.e, iwo.sW, iwo.sWp], ['1945-02-19', '1945-03-26', '1945-02-08', undefined]);
  assert.match(json('../battlefield/focus/data/index.json').sources.wikipedia, /the casualty fields of each battle’s infobox and, where the page says so, its dates, at the revision named/);
  // The page says where the start comes from, at Wikidata's precision.
  assert.match(text('../battlefield/focus/app.js'), /b\.sW \? ` · start as its Wikipedia article gives it; Wikidata starts it \$\{atPrec\(b\.sW, b\.sWp\)\}` : ''/);
});

test('front-pages-12: a war\'s name in the menu carries its years once', () => {
  const app = text('../battlefield/focus/app.js');
  const src = /^const menuName = (w => .*);$/m.exec(app);
  assert.ok(src, 'app.js names a war in the menu with menuName');
  assert.match(app, /<option value="\$\{esc\(w\.id\)\}">\$\{esc\(menuName\(w\)\)\}<\/option>/);
  const menuName = new Function(`return ${src[1]}`)();
  const idx = json('../battlefield/focus/data/index.json');
  const names = new Map(idx.wars.map(w => [w.id, menuName(w)]));
  assert.equal(names.get('chinese-civil-war-1'), 'Chinese Civil War (1927–1936)');
  assert.equal(names.get('chinese-civil-war-2'), 'Chinese Civil War (1946–1949)');
  assert.equal(names.get('afghanistan-2001'), 'War in Afghanistan (2001–2021)');
  assert.equal(names.get('sudan-2023'), 'Sudanese civil war (2023–present)');
  assert.equal(names.get('ww2'), 'World War II (1939–1945)');
  assert.equal(names.get('yemen'), 'Yemeni civil war (2014–present)', 'one word for every ongoing war, as Sudan\'s own name has it');
  for (const n of names.values()) assert.doesNotMatch(n, /–now\)/);
  for (const [id, n] of names) assert.equal((n.match(/\(\d{4}/g) || []).length, 1, `${id}: ${n}`);
});

test('page: the Allies of October 1939 leave out Egypt and Iran, the Axis Austria; several days listed, not a span; Iwo Jima from 19 Feb 1945; the menu names each war\'s years once', pageTest, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1939-10`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#month')?.dataset.value === '1939-10' && document.querySelectorAll('#panel .side-list').length === 2, null, { timeout: 30000 });
    const [allies, axis] = await page.$$eval('#panel .side-list', l => l.map(x => x.textContent));
    assert.match(allies, /United Kingdom/);
    assert.doesNotMatch(allies, /Egypt/);
    assert.doesNotMatch(allies, /Iran/);
    assert.match(axis, /Germany/);
    assert.doesNotMatch(axis, /Austria/);
    const options = await page.$$eval('#war option', l => l.map(o => o.textContent));
    assert.ok(options.includes('Chinese Civil War (1927–1936)'), options.join(' | '));
    for (const o of options) assert.equal((o.match(/\(\d{4}/g) || []).length, 1, o);
    await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=1945-03&v=battles`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Iwo Jima's row, by the name its file gives it: from DATE_FIXES' 19 February whatever the day, and Wikidata's start
    // beside it while Wikidata's differs; the rest as Wikidata gave it on 27 November 2026.
    const iwoB = ww2.battles.find(b => b.q === 'Q180182');
    await page.waitForFunction(n => [...document.querySelectorAll('#battles-rows button.rowbtn')].some(b => b.textContent === n), iwoB.n, { timeout: 30000 });
    const iwo = await page.$$eval('#battles-rows tr', (rows, n) => rows.find(r => r.querySelector('button.rowbtn')?.textContent === n)?.children[1].textContent, iwoB.n);
    assert.match(iwo, /^19 Feb 1945 – /);
    if (iwoB.sW) assert.match(iwo, / · start as its Wikipedia article gives it; Wikidata starts it /);
    if (AS_BUILT) assert.equal(iwo, '19 Feb 1945 – 26 Mar 1945 · start as its Wikipedia article gives it; Wikidata starts it 8 Feb 1945');
    const row = name => page.$$eval('#battles-rows tr', (rows, n) => { const r = rows.find(x => x.querySelector('button.rowbtn')?.textContent === n); return r ? { dates: r.children[1].textContent, cls: r.className } : null; }, name);
    // The page's rule, whatever the day, on every battle the file gives several days (pts) under a name of its own: its
    // days listed ("X and Y", "X, Y and Z"), each ending in its own year, never a span.
    const named = n => ww2.battles.filter(b => b.n === n).length === 1;
    const several = ww2.battles.filter(b => b.s && b.pts && named(b.n));
    assert.ok(several.length >= 1, 'a battle of several days to check');
    for (const b of several) {
      const r = await row(b.n);
      assert.ok(r, `${b.n}: listed`);
      const dates = r.dates.split(' · ')[0], parts = dates.split(/, | and /);
      assert.doesNotMatch(dates, / – /, `${b.n}: not a span`);
      assert.match(dates, /^.+ and .+$/, `${b.n}: its days listed`);
      assert.equal(parts.length, b.pts.length, `${b.n}: ${dates}`);
      parts.forEach((p, i) => assert.ok(p.endsWith(b.pts[i].slice(0, 4)), `${b.n}: ${p} is ${b.pts[i]}`));
    }
    if (AS_BUILT) {
      assert.equal((await row('atomic bombings of Hiroshima and Nagasaki')).dates, '6 Aug 1945 and 9 Aug 1945');
      assert.equal((await row('Bombing of the Vatican')).dates, '5 Nov 1943 and 1 Mar 1944');
      assert.equal((await row('Bombing of Yawata')).dates, 'June 1944, 20 Aug 1944 and 8 Aug 1945');
      assert.equal((await row('Operation Martin')).dates, 'March 1943');
    }
    // A battle of several days is not under way in a month between them (the Vatican in December 1943, as the file held
    // it on 27 November); it is in the month of its first (November 1943). The months are the file's, whatever the day.
    // Refresh pins 2 (28 November 2026): the battle is picked by that rule from the file, the Vatican first, so a later
    // build whose Vatican leaves no month between its raids checks another battle (Yawata, Kobe, Innoshima held one on
    // 27 November), and one with no such battle says so (a skip) instead of passing on nothing.
    const next = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
    const gapOf = b => {
      const first = b?.s && b.pts?.length > 1 && named(b.n) && b.pts[0].length >= 7 ? b.pts[0].slice(0, 7) : null, between = first && next(first);
      return first && between < b.pts[1].slice(0, 7) && !b.pts.some(d => d.startsWith(between)) ? [[between, ''], [first, 'sel']] : null;
    };
    const vat = ww2.battles.find(b => b.q === 'Q2909620');
    const pick = gapOf(vat) ? vat : ww2.battles.find(gapOf);
    if (AS_BUILT) assert.deepEqual([pick?.q, gapOf(pick)], ['Q2909620', [['1943-12', ''], ['1943-11', 'sel']]]);
    await t.test('a battle of several days is not under way in a month between them, and is in the month of its first', async st => {
      if (!pick) { st.skip('no battle of War Focus\'s Second World War file has several days with a month between its first two: nothing to check'); return; }
      for (const [m, cls] of gapOf(pick)) {
        await page.goto(`${BASE}/battlefield/focus/#war=ww2&m=${m}&v=battles`, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(([x, n]) => document.querySelector('#month')?.dataset.value === x && [...document.querySelectorAll('#battles-rows button.rowbtn')].some(b => b.textContent === n), [m, pick.n], { timeout: 30000 });
        assert.equal((await row(pick.n)).cls, cls, `${pick.n}, ${m}`);
      }
    });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
