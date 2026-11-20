// The second review of the Omni-Map's stage-two builders and data (20 November 2026, findings X1 to X8). Each test
// failed on commit e18c55e as the review found it, and passes once its builder is mended and its layer rebuilt by its
// own script. The builders' new parts are read through namespace imports, so a part that is missing fails its own test
// and not the file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as L from '../omni/lib/layers.js';
import * as N from '../omni/lib/layers-now.js';
import * as WB from '../omni/scripts/build-wb.mjs';
import * as U from '../omni/scripts/build-ucdp-events.mjs';
import * as W from '../omni/scripts/build-wars.mjs';
import * as P from '../omni/scripts/build-political.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = p => readFileSync(join(ROOT, p));
const read = p => JSON.parse(raw(p).toString('utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const DOC = read('omni/data/layers.json');
const holds = (w, y) => w.from != null && w.from <= y && y <= (w.to ?? Infinity);

/* ---------------------------------------------------------------- X1: an originator's own terms decide */
test('X1: a World Bank series whose originator bars commercial use is left out, and cannot come back unseen', () => {
  assert.equal(typeof WB.originatorsOf, 'function', 'build-wb.mjs names each series’ originators from its metadata');
  const ihme = WB.originatorsOf('Global Burden of Disease Study 2023 (GBD 2023) Air Pollution Exposure Estimates, GBD Collaborator Network, publisher: Institute for Health Metrics and Evaluation (IHME)');
  const o = ihme.find(x => x.id === 'ihme');
  assert.ok(o && o.terms === 'barred', 'IHME’s terms bar commercial use');
  assert.match(o.termsUrl, /^https:\/\/www\.healthdata\.org\//); assert.match(o.read, /^\d{4}-\d\d-\d\d$/); assert.match(o.seen, /non-commercial/i);
  // Every barred originator names the address read and the day.
  for (const x of WB.ORIGINATORS.filter(x => x.terms === 'barred')) { assert.match(x.termsUrl, /^https:\/\//, x.id); assert.match(x.read, /^\d{4}-\d\d-\d\d$/, x.id); assert.ok(x.seen, x.id); }
  // A series naming a barred originator that BARRED gives no line for stops the build.
  assert.throws(() => WB.checkOriginators('XX.TEST.CODE', 'Some estimates, publisher: Institute for Health Metrics and Evaluation (IHME)'), /bar commercial use/);
  // The committed catalogue: PM2.5 is a line of `absent` with IHME's words, and no file of its values is held.
  assert.ok(!DOC.layers.some(l => l.wb === 'EN.ATM.PM25.MC.M3'), 'no layer of EN.ATM.PM25.MC.M3');
  const a = DOC.absent.find(x => x.wb === 'EN.ATM.PM25.MC.M3');
  assert.ok(a, 'EN.ATM.PM25.MC.M3 is listed as absent');
  assert.match(a.termsUrl, /healthdata\.org/); assert.match(a.seen, /non-commercial/i); assert.match(a.why, /IHME|Institute for Health Metrics/);
  assert.ok(!existsSync(join(ROOT, 'omni/data/layers/wb/EN.ATM.PM25.MC.M3.json')), 'no file of its values');
  // Every series VM still draws lists its originators: none barred; one whose terms VM read gives the address and day;
  // where any was not read, the method says so in those words.
  for (const e of DOC.layers.filter(l => l.wb)) {
    assert.ok(Array.isArray(e.originators) && e.originators.length, `${e.wb}: its originators`);
    for (const x of e.originators) {
      assert.ok(['free', 'not read'].includes(x.terms), `${e.wb}: ${x.name} is ${x.terms}`);
      if (x.terms === 'free') { assert.match(x.termsUrl, /^https:\/\//); assert.match(x.read, /^\d{4}-\d\d-\d\d$/); }
    }
    if (e.originators.some(x => x.terms === 'not read')) assert.match(e.method, /originator’s terms not read/, `${e.wb}: says its originator’s terms were not read`);
  }
});

/* ---------------------------------------------------------------- X2: counts per war */
test('X2: a war’s filtered events are its own, and the unfiltered total is unchanged', () => {
  const ix = read('omni/data/layers/ucdp-events/index.json');
  for (const f of ix.files) {
    const d = read(`omni/data/layers/ucdp-events/${f.file}`);
    for (const k of ['cells', 'country', 'listed']) for (const r of d[k]) assert.ok(Array.isArray(r[7]) && r[7].length <= 1, `${f.file} ${k}: a row holds one war’s counts (${JSON.stringify(r)})`);
  }
  // The review's worked example: 2000, cell 79707, May, state-based: two events of two wars.
  const d = read('omni/data/layers/ucdp-events/2000.json'), { rows } = N.cellRows(d);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const sum = rs => rs.reduce((s, r) => s + r.n, 0);
  const byWar = d.wars.reduce((s, w) => s + sum(L.inPeriod(rows, 2000, 2000, { field: 'w', value: w })), 0);
  assert.equal(byWar + sum(rows.filter(r => !r.w.length)), total, 'each war’s filtered events add up to the year’s');
  const may = rows.filter(r => r.cell === 79707 && r.t === '1');
  for (const w of ['ucdp-364', 'ucdp-218'].filter(w => d.wars.includes(w))) assert.equal(sum(may.filter(r => r.w.includes(w)).map(r => ({ n: r.byMonth[5]?.n || 0 }))), 1, `${w}: one event in May`);
  // The builder: two wars in one cell and month are two rows.
  const registry = { wars: [{ id: 'ucdp-7', ucdp: [7], from: 2000, to: 2010 }, { id: 'ucdp-8', ucdp: [8], from: 2000, to: 2010 }] };
  const ev = o => ({ year: 2005, month: 3, type: 1, prec: 1, lon: 30.5, lat: 50.45, country: 'Ukraine', conflict: 7, best: 2, low: 1, high: 4, ...o });
  const { years } = U.cellYears([ev(), ev({ conflict: 8, best: 5 })], { resolveName: () => ({ q: 'Q212', iso3: 'UKR' }), registry });
  assert.deepEqual(years[2005].cells.map(r => [r[3], r[4], r[7].map(i => years[2005].wars[i])]), [[1, 2, ['ucdp-7']], [1, 5, ['ucdp-8']]]);
});

/* ---------------------------------------------------------------- X3: a war holds only its own years */
test('X3: no conflict-year is given to a War Focus war outside that war’s years', () => {
  const reg = read('omni/data/layers/wars/registry.json'), byId = new Map(reg.wars.map(w => [w.id, w]));
  const terr = read('omni/data/layers/conflict-territory/conflicts.json');
  const bad = [];
  for (const [id, c] of Object.entries(terr.conflicts)) for (const [y, w] of Object.entries(c.wars)) if (byId.get(w).wf && !holds(byId.get(w), +y)) bad.push(`${id} ${y} ${w}`);
  assert.deepEqual(bad, [], 'e.g. conflict 230 in 1948 given to wf-yemen, which begins in 2014');
  assert.equal(terr.conflicts['230'].wars['1948'], 'ucdp-230', 'Yemen 1948 is the conflict’s own war');
  // The builder's rules.
  const wars = W.joinWars({ 230: { id: 230, location: 'Yemen (North Yemen)', years: [1948, 1962, 2014, 2015] } }, {}, [{ id: 'yemen', name: 'Yemen', qid: 'Q1', bf: 'u230' }], { yemen: { from: 2014, to: null } });
  assert.deepEqual(wars.map(w => [w.id, w.from, w.to]), [['wf-yemen', 2014, null], ['ucdp-230', 1948, 1962]]);
  assert.equal(W.warOf({ wars }, 230, 1948), 'ucdp-230'); assert.equal(W.warOf({ wars }, 230, 2015), 'wf-yemen');
  assert.equal(W.warOf({ wars: [{ id: 'wf-x', wf: 'x', ucdp: [5], from: 2000, to: 2005 }] }, 5, 1990), null, 'one War Focus war alone does not take a year outside its own');
  // The events layer agrees.
  for (const f of read('omni/data/layers/ucdp-events/index.json').files.filter(f => f.status === 'recorded')) {
    const d = read(`omni/data/layers/ucdp-events/${f.file}`);
    for (const k of ['cells', 'country', 'listed']) for (const r of d[k]) for (const i of r[7]) { const w = byId.get(d.wars[i]); if (w.wf) assert.ok(holds(w, f.year), `${f.year}: ${w.id} holds the year`); }
  }
});

/* ---------------------------------------------------------------- X4: the Master Index's precision */
test('X4: an election keeps the Master Index’s own precision, never one read from the date’s spelling', () => {
  const rec = { type: 'election', q: 'Q6070719', label: 'Irish European Constitution referendum', facts: { date: '2000' }, fp: { date: 8 }, rel: { Country: [['Q27', 'Ireland']] } };
  assert.equal(P.electionRows([rec], { today: '2026-11-20' }).rows[0].date.p, 8, 'a decade stays a decade');
  assert.equal(P.electionRows([{ ...rec, fp: undefined }], { today: '2026-11-20' }).rows[0].date.p, 9, 'no stored precision: the spelling');
  const row = read('omni/data/layers/elections/elections.json').rows.find(r => r.q === 'Q6070719');
  assert.ok(row && row.date.p === 8, 'the committed row of Q6070719 is a decade');
});

/* ---------------------------------------------------------------- X5: one statement, both roles */
test('X5: an office that is both head of state and head of government counts as both', () => {
  const b = role => ({ country: 'http://www.wikidata.org/entity/Q30', countryLabel: 'United States', iso: 'USA', office: 'http://www.wikidata.org/entity/Q11696', role,
    person: 'http://www.wikidata.org/entity/Q6279', personLabel: 'Joe Biden', st: 'http://www.wikidata.org/entity/statement/Q6279-5a5f0633', start: '2021-01-20T00:00:00Z', sp: '11' });
  const r = P.changeRows([b('hos'), b('hog')]);
  assert.deepEqual(r.terms.map(t => t.role).sort(), ['hog', 'hos']);
  assert.deepEqual(L.stateValues({ format: 'vm-terms/1', ...r }, 2021).map(s => s.v), [3]);
  const us = L.stateValues(read('omni/data/layers/political-change/terms.json'), 2021).find(s => s.q === 'Q30');
  assert.equal(us?.v, 3, 'the United States in 2021: a new head of state and of government');
});

/* ---------------------------------------------------------------- X6: retro-keys.json and its hashes in step */
// A copy of the builder and the files it reads, in a folder of the test's own, so the repository is never written.
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'vm-x6-'));
  for (const d of ['omni/scripts', 'lake/scripts', 'omni/data/layers']) mkdirSync(join(dir, d), { recursive: true });
  for (const f of readdirSync(join(ROOT, 'omni/scripts')).filter(f => f.endsWith('.mjs'))) copyFileSync(join(ROOT, 'omni/scripts', f), join(dir, 'omni/scripts', f));
  for (const f of ['dates.mjs', 'refs.mjs']) copyFileSync(join(ROOT, 'lake/scripts', f), join(dir, 'lake/scripts', f));
  for (const f of ['omni/data/layers.json', 'omni/data/layers.head.json', 'omni/data/layers/retro-keys.json']) copyFileSync(join(ROOT, f), join(dir, f));
  const retro = join(dir, 'countries.json');
  writeFileSync(retro, JSON.stringify({ built: '2099-01-01T00:00:00Z', countries: { 2: { iso3: 'USA', name: 'United States' } } }));
  return { dir, retro, run: args => spawnSync(process.execPath, [join(dir, 'omni/scripts/build-political.mjs'), ...args], { cwd: dir, encoding: 'utf8' }) };
}
test('X6: --only retro keeps the catalogue’s hashes of retro-keys.json in step, and a build that fails writes nothing', () => {
  const s = sandbox();
  try {
    const before = readFileSync(join(s.dir, 'omni/data/layers/retro-keys.json'));
    // A full build whose elections step fails (no Master Index here): nothing is written, retro-keys.json included.
    const bad = s.run(['--retro', s.retro]);
    assert.notEqual(bad.status, 0, 'the build stops');
    assert.ok(readFileSync(join(s.dir, 'omni/data/layers/retro-keys.json')).equals(before), 'retro-keys.json is not written by a build that fails');
    // --only retro: the file changes, and every catalogue entry listing it carries its new hash.
    const ok = s.run(['--only', 'retro', '--retro', s.retro]);
    assert.equal(ok.status, 0, ok.stderr);
    const now = readFileSync(join(s.dir, 'omni/data/layers/retro-keys.json'));
    assert.ok(!now.equals(before), 'the fixture changes the file');
    const cat = JSON.parse(readFileSync(join(s.dir, 'omni/data/layers.json'), 'utf8'));
    const listed = cat.layers.flatMap(l => (l.files || []).filter(f => f.file === 'omni/data/layers/retro-keys.json').map(f => [l.id, f]));
    assert.deepEqual(listed.map(([id]) => id).sort(), ['coups', 'elections', 'political-change']);
    for (const [id, f] of listed) { assert.equal(f.sha256, sha(now), `${id}: sha256`); assert.equal(f.bytes, now.length, `${id}: bytes`); }
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

/* ---------------------------------------------------------------- X7: Candidate rows joined by name */
test('X7: UCDP Candidate’s country rows are joined by name through VM’s crosswalk, never through a Gleditsch and Ward code', () => {
  const resolveName = n => (n === 'Ukraine' ? { q: 'Q212', iso3: 'UKR' } : null);
  const rt = { year: 2026, months: ['2026-01', '2026-02'], countries: {
    369: { name: 'Ukraine', iso3: 'XXX', series: { from: '2026-01', events: [3, 0], deaths: [10, 0] } },
    999: { name: 'Atlantis', iso3: 'ATL', series: { from: '2026-01', events: [2, 1], deaths: [1, 4] } } } };
  const c = U.candidateYear(rt, { resolveName });
  assert.deepEqual(c.country, [['UKR', 1, 0, 3, 10, null, null, []]], 'the ISO3 is the crosswalk’s, from the name; the Realtime file’s code-made ISO3 is not read');
  assert.deepEqual(c.unjoined, [{ name: 'Atlantis', events: 3, deaths: 5 }], 'a name the crosswalk cannot read is counted and listed, not drawn');
  // UCDP's names with their bracket as the Realtime Battlefield shortens them: "DR Congo" is UCDP's "DR Congo (Zaire)".
  assert.deepEqual(U.candidateResolver(() => null, 2026)('DR Congo'), { q: 'Q974', iso3: 'COD' });
  const d = read(`omni/data/layers/ucdp-events/${read('omni/data/layers/ucdp-events/index.json').files.at(-1).file}`);
  assert.equal(d.status, 'candidate'); assert.ok(Array.isArray(d.unjoined), 'the candidate file lists the names it could not join');
});

/* ---------------------------------------------------------------- X8: every candidate year kept */
test('X8: after the year rolls over, a Candidate year still awaiting UCDP’s yearly release is kept', () => {
  assert.equal(typeof U.keptCandidates, 'function', 'build-ucdp-events.mjs keeps the candidate years it already holds');
  const index = { files: [{ year: 2024, status: 'recorded' }, { year: 2025, status: 'recorded' }, { year: 2026, status: 'candidate' }] };
  assert.deepEqual(U.keptCandidates(index, 2025, 2027), [2026], 'GED ends at 2025 and the Realtime file has moved to 2027: 2026 stays');
  assert.deepEqual(U.keptCandidates(index, 2025, 2026), [], 'the Realtime year is rebuilt from the Realtime file');
  assert.deepEqual(U.keptCandidates(index, 2026, 2027), [], 'a year GED now records is GED’s');
  assert.throws(() => U.candidateGap([2024, 2025], [], 2027), /2026/, 'a missing year between GED and the Realtime file stops the build');
});

/* ================================================================ The third reading (Codex on f9e1004, 20 November 2026) */
// Each test below failed on f9e1004 and passes once mended; the page's findings are in omni-review2-page.test.mjs.

/* ---------------------------------------------------------------- 3rd X2: a barred originator by any spelling */
test('3rd X2: a barred originator is found however its name is spelt: bare abbreviation, lower case, beside another', () => {
  for (const [source, id] of [['IEA; World Bank (WB)', 'iea'], ['institute for health metrics and evaluation; World Bank (WB)', 'ihme'], ['IHME; World Bank (WB)', 'ihme'],
    ['ITU, World Bank (WB)', 'itu'], ['international telecommunication union; World Bank (WB)', 'itu'], ['SIPRI; World Bank (WB)', 'sipri'],
    ['stockholm international peace research institute, World Bank (WB)', 'sipri'], ['INTERNATIONAL ENERGY AGENCY and World Bank (WB)', 'iea']]) {
    assert.ok(WB.originatorsOf(source).some(o => o.id === id), `${source}: names ${id}`);
    assert.throws(() => WB.checkOriginators('SP.POP.TOTL', source), /bar commercial use/, source);
  }
  // An abbreviation is a whole word only: ITUC or PIEAS is not ITU or IEA.
  assert.deepEqual(WB.originatorsOf('ITUC survey; PIEAS; World Bank (WB)').map(o => o.id), ['world-bank']);
  // The other originators read in any case too.
  assert.deepEqual(WB.originatorsOf('world bank (wb); food and agriculture organization').map(o => o.id), ['world-bank', 'fao']);
});
test('3rd X2: every World Bank series VM draws still passes and names the originators its catalogue entry records', () => {
  const built = DOC.layers.filter(l => l.wb);
  assert.equal(built.length, 34, 'population density and the 33 series of National Analysis VM hosts');
  for (const e of built) {
    // The method quotes the series' Source as the World Bank's metadata gave it at the build (its line breaks joined).
    const m = /Its sources, as it names them: (.*?)\. Its originators, as/.exec(e.method);
    assert.ok(m, `${e.wb}: its method quotes its sources`);
    assert.deepEqual(WB.checkOriginators(e.wb, m[1]).map(o => o.name), e.originators.map(o => o.name), e.wb);
  }
});

/* ---------------------------------------------------------------- 3rd X4: a late focus never undoes a newer one */
// focus.js answers prp:focus through window.PRPFocus; here a stand-in hands its listener to the test.
function focusRig() {
  const fits = [], gates = [];
  let h = null;
  globalThis.window = { ...(globalThis.window || {}), PRPFocus: { listen: x => { h = x; }, resolve: t => ({ box: t.box || null, padding: 0 }) }, PRPMap: { ...(globalThis.window?.PRPMap || {}) } };
  return { fits, gates, h: () => h, map: { fit: (box) => fits.push(box) }, prepare: () => new Promise(r => gates.push(r)) };
}
test('3rd X4: a focus whose record arrives after a reset, or after a newer focus, changes nothing', async () => {
  const { listenFocus } = await import('../omni/lib/focus.js');
  // A reset while the first focus waits for its Q-id's record: the map stays home.
  let r = focusRig();
  let f = listenFocus({ getFile: null, data: 'http://x/omni/data/', map: () => r.map, home: () => 'HOME', qid: () => null, prepare: r.prepare });
  const late = r.h().focus({ countries: [], qids: ['Q1449'], box: 'GENOA' });
  r.h().reset();
  r.gates[0](); await late;
  assert.deepEqual(r.fits, ['HOME'], 'the reset stands');
  assert.equal(f.state().focused, null);
  // A newer focus while the first waits: the newer one stands.
  r = focusRig();
  f = listenFocus({ getFile: null, data: 'http://x/omni/data/', map: () => r.map, home: () => 'HOME', qid: () => null, prepare: r.prepare });
  const first = r.h().focus({ countries: [], qids: ['Q1449'], box: 'GENOA' });
  await r.h().focus({ countries: [], qids: [], box: 'ROME' });
  r.gates[0](); await first;
  assert.deepEqual(r.fits, ['ROME']);
  assert.equal(f.state().focused, 'ROME');
});

/* ---------------------------------------------------------------- 3rd X5: an event outside its conflict's listed years */
test('3rd X5: an event UCDP files under a conflict belongs to that conflict’s own war in any year; a War Focus war never outside its own', () => {
  const reg = read('omni/data/layers/wars/registry.json');
  // India: Kashmir (UCDP conflict 364): the Armed Conflict Dataset lists it from 1990; UCDP's event data has events of it in 1989.
  const own = reg.wars.find(w => w.id === 'ucdp-364');
  assert.equal(own.from, 1990);
  assert.equal(W.warOf(reg, 364, 1989), 'ucdp-364');
  const ev = read('omni/data/layers/ucdp-events/1989.json');
  assert.ok(ev.cells.some(r => r[7].includes(ev.wars.indexOf('ucdp-364'))), '1989’s events include conflict 364’s');
  // No War Focus war is returned outside its own dates, for any conflict and year.
  const ids = [...new Set(reg.wars.flatMap(w => w.ucdp))], byId = new Map(reg.wars.map(w => [w.id, w])), bad = [];
  for (const c of ids) for (let y = 1946; y <= 2026; y++) { const w = byId.get(W.warOf(reg, c, y)); if (w?.wf && !holds(w, y)) bad.push(`${c} ${y}: ${w.id}`); }
  assert.deepEqual(bad, []);
  // The registry says so in words: its own war's years are those the yearly list records; an event may fall outside them.
  assert.match(reg.about, /an event UCDP files under a conflict belongs to that conflict’s own war in any year, so an event can fall in a year outside the years listed for it/);
  assert.match(reg.about, /25 or more battle-related deaths/);
});

/* ---------------------------------------------------------------- 3rd X6: a misshapen file is read again */
test('3rd X6: a layer file of the wrong shape is forgotten, so the next frame reads it again and draws the repaired file', async () => {
  globalThis.window = { ...(globalThis.window || {}), PRPMap: { layerYear: (e, y) => y, heldText: () => null, esc: s => String(s) } };
  const { layerView } = await import('../omni/lib/layer-view.js');
  const good = raw('omni/data/layers/breakthroughs/events.json');
  const asked = [];
  const getFile = async url => { asked.push(url); const buf = asked.length === 1 ? Buffer.from('{}') : good; return { json: JSON.parse(buf.toString('utf8')), buf }; };
  const lv = layerView({ data: 'http://x/omni/data/', getFile, map: () => null, sources: () => [], onChange: () => {} });
  lv.init(DOC);
  lv.read({ vr: 1, l: [{ id: 'breakthroughs' }] });
  const bad = await lv.frame(1609);
  assert.equal(bad.length, 1); assert.match(bad[0], /is not of the shape this page reads/);
  const ok = await lv.frame(1609);
  assert.deepEqual([...ok], [], 'the repaired file loads');
  assert.equal(asked.length, 2, 'the file is fetched again, not taken from the cache');
});

/* ---------------------------------------------------------------- 3rd X8: the catalogue is read before any write */
test('3rd X8: a catalogue that cannot be read stops the political build before it writes anything', () => {
  for (const body of ['{"layers": [', '{}']) {
    const s = sandbox();
    try {
      writeFileSync(join(s.dir, 'omni/data/layers.json'), body);
      const before = readFileSync(join(s.dir, 'omni/data/layers/retro-keys.json'));
      const r = s.run(['--only', 'retro', '--retro', s.retro]);
      assert.notEqual(r.status, 0, `${body}: the build stops`);
      assert.match(r.stderr, /layers\.json/, `${body}: and names the catalogue`);
      assert.ok(readFileSync(join(s.dir, 'omni/data/layers/retro-keys.json')).equals(before), `${body}: retro-keys.json is not written`);
      assert.equal(readFileSync(join(s.dir, 'omni/data/layers.json'), 'utf8'), body, `${body}: the catalogue is left as it was`);
    } finally { rmSync(s.dir, { recursive: true, force: true }); }
  }
});
