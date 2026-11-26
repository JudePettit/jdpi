// Follow-ons to builds 9 and 14 of the page-review corrections (26 November 2026), Realtime Battlefield and its sister
// pages:
//   (1) Month by Month's evidence link named the Ethiopian war by its old name, "Ethiopia: Amhara and Oromia
//       insurgencies": monthly/data was built before battlefield/scripts/wars.mjs renamed it "Ethiopia: Amhara, Oromia
//       and Tigray". Rebuilt with node monthly/scripts/build.mjs --today 2026-11-26.
//   (2) q/battlefield.html printed "1 deaths" (a source, a conflict, a month's bar, a map circle, the archive's rows).
//   (3) q/battlefield.html and q/headlines.html said a paywalled story "never comes first" / "never takes the top place";
//       PRPAccess.leadFree (design/prp-access.js) moves the first free entry up, so a list with none free keeps its order
//       and a paywalled story then leads.
//   (4) battlefield/scripts/build-realtime.mjs named non-state conflicts, one-sided violence and interstate conflicts by
//       UCDP's conflict_name, whose " - " also falls inside actors' names, and required dyad_name, which it no longer
//       reads, but not side_a and side_b, which it does.
// The rows in (4) are UCDP's own (Candidate Events v26.01.26.09, the columns the build reads, each value as UCDP gives
// it): ids 645389, 629662, 620290, 624854, 645098, 626957, 644608 and 612579.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pageTest, launch } from './tools/pages.mjs';
import '../design/prp-access.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const json = p => JSON.parse(read(p));
const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const REALTIME = json('battlefield/data/realtime.json');

/* ---------------------------------------------------------------- (1) Month by Month: the war's name of today */
test('(1) Month by Month names each Realtime war as the Realtime Battlefield does, Ethiopia\'s for Amhara, Oromia and Tigray', () => {
  const marks = json('monthly/data/marks.json');
  const eth = marks.units.find(u => u.id === 'war:ethiopia');
  assert.equal(eth.name, 'Ethiopia: Amhara, Oromia and Tigray');
  assert.equal(eth.page.label, 'Realtime Battlefield: Ethiopia: Amhara, Oromia and Tigray');
  assert.equal(eth.fighting.evidence[0].page.label, 'Realtime Battlefield: Ethiopia: Amhara, Oromia and Tigray', 'the evidence link under the mark');
  // Every war unit, its own name and its links, as realtime.json names the war.
  for (const u of marks.units.filter(x => x.kind === 'war')) {
    const w = REALTIME.wars.find(x => 'war:' + x.id === u.id);
    if (!w) continue;
    assert.equal(u.name, w.name, u.id);
    for (const l of [u.page, ...(u.fighting?.evidence || []).map(e => e.page)].filter(Boolean)) {
      if (l.module === 'battlefield') assert.equal(l.label, `Realtime Battlefield: ${w.name}`, `${u.id}: ${l.url}`);
    }
  }
  // The old name is nowhere in Month by Month's files.
  const files = dir => readdirSync(join(ROOT, dir)).flatMap(f => (statSync(join(ROOT, dir, f)).isDirectory() ? files(`${dir}/${f}`) : [`${dir}/${f}`]));
  for (const f of files('monthly/data').filter(f => f.endsWith('.json'))) assert.doesNotMatch(read(f), /Amhara and Oromia insurgencies/, f);
});

/* ---------------------------------------------------------------- (2) "1 death", not "1 deaths" */
test('(2) q/battlefield.html: every count of deaths or events it prints agrees with its number', () => {
  const page = read('q/battlefield.html');
  // No figure is printed straight before a plural noun any more: each goes through plural() (or a test for one).
  const fixed = page.match(/\$\{fmt\([^`]*?\)\} (deaths|events)\b/);
  assert.equal(fixed, null, `a figure printed before a fixed plural: ${fixed?.[0]}`);
  assert.ok(!page.includes('&nbsp;deaths · '), 'the year\'s totals');
  assert.ok(!page.includes("list.length + ' groups'"), 'the list\'s count of groups');
  // plural() is defined before anything can draw (with fmt), once.
  const def = page.indexOf('const plural = (n, one) =>');
  assert.ok(def > 0 && def < page.indexOf('function warRow'), 'plural() beside fmt()');
  assert.equal(page.split('const plural =').length, 2, 'one definition');
  // The rule itself.
  const fmt = n => Number(n).toLocaleString('en-GB');
  const plural = eval(page.slice(def + 'const plural = '.length, page.indexOf(';', def)));
  assert.equal(plural(1, 'death'), '1 death');
  assert.equal(plural(0, 'death'), '0 deaths');
  assert.equal(plural(12911, 'death'), '12,911 deaths');
  // The committed data has such counts of one, so the page met them.
  assert.ok(REALTIME.wars.some(w => w.conflicts.some(c => c.deaths === 1)), 'a conflict of one death');
  assert.ok(REALTIME.wars.some(w => w.monthly.some(m => m.sources.some(s => s.headline && s.deaths === 1))), 'a source of one death');
  // After the second readers: the conflicts list's remainder ("+ 1 smaller conflicts" for a war of 13 conflicts).
  assert.ok(!page.includes('} smaller conflicts'), 'the conflicts list\'s remainder');
  assert.ok(page.includes("+ ${plural(w.conflicts.length - 12, 'smaller conflict')}"), 'the remainder goes through plural()');
  assert.equal(plural(13 - 12, 'smaller conflict'), '1 smaller conflict');
  const thirteen = REALTIME.wars.filter(w => w.conflicts.length === 13).map(w => w.id);
  assert.ok(thirteen.length > 0, 'the committed data has a war of exactly 13 conflicts, so the page met "+ 1"');
});

test('(2) q/headlines.html: a count of one story or one outlet is singular', () => {
  const page = read('q/headlines.html');
  assert.doesNotMatch(page, /length\+' stories/, 'no count of stories before a fixed plural');
  assert.doesNotMatch(page, /\.size\+' outlets'/, 'no count of outlets before a fixed plural');
  const def = page.indexOf('const plural=');
  assert.ok(def > 0 && def < page.indexOf('function renderArticles'), 'plural() defined before the lists draw');
  assert.equal(page.split('const plural=').length, 2, 'one definition');
  const plural = eval(page.slice(def + 'const plural='.length, page.indexOf(';', def)));
  assert.equal(plural(1, 'story', 'stories'), '1 story');
  assert.equal(plural(20, 'story', 'stories'), '20 stories');
  assert.equal(plural(1, 'outlet'), '1 outlet');
  assert.equal(plural(0, 'outlet'), '0 outlets');
  // The five places that print the count: the GDELT list (fresh, saved and drawn), the archive and the day's outlets.
  assert.equal(page.split("plural(rows.length,'story','stories')").length - 1, 4);
  assert.equal(page.split("plural(cached.rows.length,'story','stories')").length - 1, 1);
  assert.ok(page.includes("plural(new Set(rows.map(r=>r.outlet)).size,'outlet')"), 'the day\'s count of outlets');
});

test('(2) page: a war briefing with a conflict and a source of one death says "1 death"', pageTest, async () => {
  // Iraq's other armed violence, September 2026: two conflicts and one source of a single death each (realtime.json).
  const w = REALTIME.wars.find(x => x.id === 'other-iraq'), m = w.monthly.find(x => x.month === '2026-09');
  assert.ok(w.conflicts.some(c => c.deaths === 1) && m.sources.some(s => s.headline && s.deaths === 1), 'the data still has them');
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/battlefield.html?view=archive&month=2026-09&war=other-iraq`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#side .detail .conf') && document.querySelector('#lefttail .arow'), null, { timeout: 60000 });
    const text = (await page.locator('body').innerText()).replace(/\d,\d/g, '0');
    assert.doesNotMatch(text, /(^|[^\d])1 (deaths|events)\b/, 'no count of one in the plural');
    const conf = await page.locator('#side .detail .conf').allInnerTexts();
    assert.ok(conf.some(t => /(^|[^\d])1 death$/.test(t.trim())), `a conflict of one death: ${conf.join(' | ')}`);
    const src = await page.locator('#side .detail .src small').allInnerTexts();
    assert.ok(src.some(t => / · 1 death$/.test(t.trim())), `a source of one death: ${src.join(' | ')}`);
    await page.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('(2) page: a war of 13 conflicts says "+ 1 smaller conflict"', pageTest, async () => {
  const w = REALTIME.wars.find(x => x.conflicts.length === 13 && x.status === 'active');
  assert.ok(w, 'the data still has an active war of exactly 13 conflicts');
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/battlefield.html?war=${w.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#side .detail .conf'), null, { timeout: 60000 });
    const text = await page.locator('#side .detail').innerText();
    assert.match(text, /\+ 1 smaller conflict\b(?!s)/, `${w.id}: the remainder in the singular`);
    await page.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* ---------------------------------------------------------------- (3) when a paywalled story can lead */
test('(3) the rule the pages describe: the first free entry leads, and a list with none free keeps its order', () => {
  const A = globalThis.PRPAccess, free = x => x.access === 'free';
  const L = ['paid', 'signup', 'free', 'paid', 'free'].map((access, n) => ({ n, access }));
  assert.deepEqual(A.leadFree(L, free).map(x => x.n), [2, 0, 1, 3, 4]);
  assert.deepEqual(A.leadFree(L.filter(x => !free(x)), free).map(x => x.n), [0, 1, 3], 'none free: a paywalled story comes first');
  // q/headlines.html's day: each outlet led by its first free story, the first outlet so led moved to the top.
  const g = A.leadFreeGroups([[{ access: 'paid' }], [{ access: 'paid' }, { access: 'free' }]], free);
  assert.equal(g[0][0].access, 'free');
  assert.equal(A.leadFreeGroups([[{ access: 'paid' }], [{ access: 'signup' }]], free)[0][0].access, 'paid', 'no outlet with a free story: a paywalled one leads');
});

test('(3) q/battlefield.html and q/headlines.html say when a paywalled story leads, not that it never does', () => {
  const bf = read('q/battlefield.html'), hl = read('q/headlines.html');
  for (const [f, t] of [['q/battlefield.html', bf], ['q/headlines.html', hl]]) {
    for (const old of ['never comes first', 'never takes the top place', 'keeps its place lower down']) assert.ok(!t.includes(old), `${f} still says "${old}"`);
  }
  // Realtime Battlefield: one list, leadFree over every story found, then the first 12 (line "PRPAccess.leadFree(").
  assert.ok(bf.includes('PRPAccess.leadFree(rows.filter(r => !seen.has(r.url) && seen.add(r.url)), r => PRPAccess.isFree(cls(r))).slice(0, 12)'), 'the code the sentence describes');
  assert.ok(bf.includes('Free sources lead: the first story from an outlet anyone can read takes the top place and the rest keep their order, so a story from an outlet behind a paywall or a sign-up comes first only when none of these is free.'), 'the Realtime Battlefield\'s sentence');
  // Global Headline Tracker: the day's outlets (leadFreeGroups), the ranked list and the GDELT fallback (leadFree).
  assert.ok(hl.includes('PRPAccess.leadFreeGroups('), 'the day\'s outlets');
  assert.equal(hl.split('PRPAccess.leadFree(').length - 1, 2, 'the ranked list and the fallback');
  assert.ok(hl.includes('so a story or an outlet behind a paywall or a sign-up takes the top place only when none in its list is free (otherwise the first free one takes the top place and the rest keep their order, in the fallback\'s list too)'), 'the Global Headline Tracker\'s sentence');
});

/* ---------------------------------------------------------------- (4) build-realtime.mjs: conflicts named "A v B" */
const COLS = ['id', 'year', 'type_of_violence', 'conflict_new_id', 'conflict_name', 'side_a', 'side_b', 'country', 'country_id', 'region', 'adm_1', 'where_description', 'latitude', 'longitude', 'date_prec', 'date_start', 'date_end', 'deaths_civilians', 'best', 'source_headline', 'source_office'];
const ucdp = (id, type, conflict, name, side_a, side_b, country, gw, region, adm_1, lat, lon, prec, day, best, civilians) =>
  ({ id, year: '2026', type_of_violence: type, conflict_new_id: conflict, conflict_name: name, side_a, side_b, country, country_id: gw, region, adm_1, where_description: '',
    latitude: lat, longitude: lon, date_prec: prec, date_start: `${day} 00:00:00.000`, date_end: `${day} 00:00:00.000`, deaths_civilians: civilians, best, source_headline: '', source_office: '' });
const ROWS = [
  ucdp('645389', '1', '16905', 'Iran - Israel, United States of America', 'Government of Iran', 'Government of Israel, Government of United States of America', 'Iran', '630', 'Middle East', '', '26.660000', '56.520000', '1', '2026-09-23', '1', '1'),
  ucdp('629662', '1', '10771', 'DR Congo (Zaire) - Rwanda', 'Government of DR Congo (Zaire)', 'Government of Rwanda', 'DR Congo (Zaire)', '490', 'Africa', 'Sud Kivu province', '-3.348100', '29.104300', '1', '2026-04-10', '12', '0'),
  ucdp('620290', '1', '16099', 'United Kingdom, United States of America - Yemen', 'Government of United Kingdom, Government of United States of America', 'Government of Yemen (North Yemen)', 'Yemen (North Yemen)', '678', 'Middle East', 'Hudaydah governorate', '14.616922', '42.909973', '1', '2026-02-01', '4', '4'),
  ucdp('624854', '3', '15699', 'FARC - Segunda Marquetalia  - Civilians', 'FARC - Segunda Marquetalia', 'Civilians', 'Colombia', '100', 'Americas', 'Nariño department', '1.166667', '-78.166667', '1', '2026-03-11', '1', '0'),
  ucdp('645098', '2', '16799', 'Jalisco Cartel New Generation, Sinaloa Cartel - Los Chapitos - Sinaloa Cartel - Los Mayos', 'Jalisco Cartel New Generation, Sinaloa Cartel - Los Chapitos', 'Sinaloa Cartel - Los Mayos', 'Mexico', '70', 'Americas', 'Sinaloa state', '24.790320', '-107.387820', '1', '2026-09-01', '1', '0'),
  ucdp('626957', '2', '16494', 'Los Lobos  - Los Saobox', 'Los Lobos', 'Los Saobox', 'Ecuador', '130', 'Americas', 'El Oro province', '-3.250000', '-79.850000', '1', '2026-03-02', '1', '0'),
  ucdp('644608', '1', '107', 'XXX70', 'XXX70', 'XXX70', 'Mexico', '70', 'Americas', 'Sinaloa state', '23.232900', '-106.406200', '1', '2026-09-09', '2', '0'),
  ucdp('612579', '1', '221', 'Myanmar (Burma): Karen', 'Government of Myanmar (Burma)', 'KNU', 'Myanmar (Burma)', '775', 'Asia', 'Bago region', '18.807718', '96.488567', '1', '2026-01-11', '2', '0'),
];
const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';
// The build writes battlefield/data/realtime.json beside itself, so it runs in a copy of the files it imports.
const TREE = ['package.json', 'battlefield/scripts/build-realtime.mjs', 'battlefield/scripts/csv.mjs', 'battlefield/scripts/wars.mjs', 'battlefield/scripts/realtime-insight.mjs',
  'battlefield/scripts/ucdp.mjs', 'battlefield/focus/scripts/rules.mjs', 'monthly/scripts/series.mjs', 'calendar/scripts/guard.mjs', 'integration/scripts/heads.mjs',
  'design/prp-trends.js', 'design/prp-access.js', 'design/prp-tex.js', 'highbrowse/analysis.js', 'national/data/index.json'];
function build(rows, cols) {
  const dir = mkdtempSync(join(tmpdir(), 'follow-bw-'));
  try {
    for (const f of TREE) { mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(dir, f)); }
    writeFileSync(join(dir, 'events.csv'), csv(rows, cols));
    const r = spawnSync(process.execPath, [join(dir, 'battlefield/scripts/build-realtime.mjs'), join(dir, 'events.csv'), '26.01.26.09'], { cwd: dir, encoding: 'utf8' });
    let data = null;
    try { data = JSON.parse(readFileSync(join(dir, 'battlefield/data/realtime.json'), 'utf8')); } catch { /* not written */ }
    return { status: r.status, stderr: r.stderr, data };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('(4) build-realtime.mjs: a conflict is named "A v B" from UCDP\'s sides, states by their name on the day', () => {
  const { status, stderr, data } = build(ROWS, COLS); // no dyad_name column: the build no longer needs it
  assert.equal(status, 0, stderr);
  const names = Object.fromEntries(data.wars.flatMap(w => w.conflicts).map(c => [c.id, c.name]));
  assert.deepEqual(names, {
    16905: 'Iran v Israel and United States of America', // interstate: the states on each side of UCDP's name
    10771: 'DR Congo v Rwanda', // and each by its name in 2026, not "DR Congo (Zaire)"
    16099: 'United Kingdom and United States of America v Yemen',
    15699: 'FARC - Segunda Marquetalia v Civilians', // one-sided: " - " stays only inside the actor's own name
    16799: 'Jalisco Cartel New Generation and Sinaloa Cartel - Los Chapitos v Sinaloa Cartel - Los Mayos', // non-state
    16494: 'Los Lobos v Los Saobox', // UCDP's doubled space gone with the join
    107: 'unidentified armed group (Mexico)', // a state-based conflict within a state keeps UCDP's name
    221: 'Myanmar: Karen', // its state by the name of 2026, not "Myanmar (Burma)"
  });
});

test('(4) build-realtime.mjs, after the second readers: an alliance with a state named "X and Y" keeps UCDP\'s comma list; a count of one is singular', () => {
  // A CONSTRUCTED row, not UCDP's: UCDP's row 645389 with its conflict re-numbered and its name and sides changed so that
  // one side holds a state whose own name has " and " in it. It is built in a temporary copy and published nowhere.
  const made = { ...ROWS[0], id: '1', conflict_new_id: '99901', conflict_name: 'Iran - Trinidad and Tobago, United States of America',
    side_b: 'Government of Trinidad and Tobago, Government of United States of America' };
  const { status, stderr, data } = build([made], COLS);
  assert.equal(status, 0, stderr);
  const all = data.wars.flatMap(w => w.conflicts);
  assert.equal(all.find(c => c.id === 99901).name, 'Iran v Trinidad and Tobago, United States of America', 'as realtime-insight.mjs sideOf keeps it');
  // That one event is its war's only one, with one death: "1 death in 1 recorded event", not "1 deaths in 1 recorded events".
  const w = data.wars.find(x => x.conflicts.some(c => c.id === 99901));
  assert.equal(w.events, 1); assert.equal(w.deaths, 1);
  assert.match(w.summary, /^1 death in 1 recorded event so far this year;/, w.summary);
  // And the plural stays for other counts (the eight UCDP rows above: Myanmar's Karen, 2 deaths in 1 event).
  const many = build(ROWS, COLS).data.wars;
  assert.ok(many.some(x => /^\d[\d,]* deaths in \d[\d,]* recorded events? so far this year;/.test(x.summary) && x.deaths !== 1), many.map(x => x.summary).join(' | '));
  for (const x of many) assert.doesNotMatch(x.summary, /(^|[^\d,])1 (deaths|recorded events)\b/, x.summary);
});

test('(4) build-realtime.mjs: a file without side_a or side_b is refused at the start, as the guard says', () => {
  for (const k of ['side_a', 'side_b']) {
    const { status, stderr, data } = build(ROWS, COLS.filter(c => c !== k));
    assert.notEqual(status, 0, `${k} missing: refused`);
    assert.match(stderr, new RegExp(`is not a UCDP candidate events file this build can read: no ${k}`));
    assert.equal(data, null, 'nothing written');
  }
  const src = read('battlefield/scripts/build-realtime.mjs');
  assert.doesNotMatch(src.match(/const COLUMNS = \[[^\]]*\]/)[0], /dyad_name/, 'the guard asks only for what the build reads');
});
