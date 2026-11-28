// The Master Index standard (lake/README.md), enforced. Every live submodule in registry.json reports what it mentions
// to the Master Index through an adapter in lake/scripts/adapters.mjs (ADAPTERS, with the submodules each one files
// its mentions under in ADAPTER_MODULES), or is exempt below with its reason. Every submodule an adapter reports is
// named for the Master Index (MODULE_NAMES in lake/scripts/build.mjs), ordered and counted by the build (MODULE_ORDER),
// opened in its own suite (MODULE_SUITE in encyclopedia/index.html), and in the committed lake. Then the adapters of
// Kino, National Analysis and Geopolitical Volatility against their submodules' data, and an entry's links to them on
// the Master Index page. The page test needs a site (JDPI_URL; npm run test:e2e serves one), the rest no browser and no
// network:   npm run test:unit -- tests/master-index.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { ADAPTERS, ADAPTER_MODULES, JDPI, kino, pestle, volatility } from '../lake/scripts/adapters.mjs';
import { wikidataDate, datedFacts, formatDate, centuryTag } from '../lake/scripts/dates.mjs';
import { shortCounts, countOf, recount, canRecount } from '../lake/scripts/counts.mjs';
import { bestClaim } from '../lake/scripts/dates.mjs';
import * as resolveRules from '../lake/scripts/resolve.mjs';
import { traders, retrospective } from '../lake/scripts/adapters.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CATEGORY_IDS, flatScenes } from '../kino/lib/format.js';
import { readAt, onOwnPage } from '../kino/lib/links.js';
import { pageTest, launch } from './tools/pages.mjs';
import { groupBattles, figureLine } from '../battlefield/focus/figures.mjs';
import { CANON, CANON_REFS, CANON_TYPES, CANON_LABELS, CANON_BY_QID, canonNote, canonContext } from '../lake/scripts/canon.mjs';
import { TAG_GROUPS } from '../lake/scripts/thinkers.mjs';
import { recordAliases } from '../lake/scripts/aliases.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const text = p => readFileSync(join(ROOT, p), 'utf8');
const read = p => JSON.parse(text(p));
const QID = /^Q[1-9]\d*$/;
const registry = read('registry.json');
const LIVE = registry.suites.flatMap(s => s.modules.filter(m => m.status === 'live').map(m => ({ ...m, suite: s.id })));
const SUBMODULE = new Map(registry.suites.flatMap(s => s.modules.map(m => [m.id, { ...m, suite: s.id }])));

// The live submodules no adapter reports, each with the reason. A new submodule in neither an adapter's list
// (ADAPTER_MODULES) nor here fails the first test, which says what to do.
// The page linker (design/jdpi-entities.js) badges only a Wikipedia link, a data-qid or a data-entity-key, and the
// stories carry none of them: their names are a publisher's text, not entities with IDs.
const STORIES = 'stories, not entities: news items whose names carry no Wikidata ID or Wikipedia link, so the page linker has '
  + 'nothing to badge yet; marking the countries each story is filed under with data-qid is to come';
const EXEMPT = {
  dashboard: 'the shell’s own page (the Home module’s, once the Workspace): a few lines from other submodules’ data over every module and submodule, with no entities of its own',
  // The Master Index itself was exempt here, as the page that reads the lake, until 25 November 2026: it now reports
  // VM's canon list through the canon adapter (OWN_LIST below).
  briefing: STORIES, 'econ-briefing': STORIES, 'science-briefing': STORIES, 'digital-briefing': STORIES, headlines: STORIES,
  highbrowse: 'a view of the four briefings’ stories (exempt above): its stories, topics and search are theirs, with no entities of its own',
  'daily-synopsis': 'the Political Briefing’s stories of each day (exempt above), grouped and laid out by side, with a short checked digest of their headlines: no entities of its own',
  atlas: 'another repository (political-atlas), whose leaders, parties and countries have no Wikidata IDs yet: its adapter, by Wikipedia title, is queued',
  markets: 'another repository (trade-desk): its tickers become company items (Wikidata P414 and P249) later',
  osint: 'a workbench of search tools and a case notebook, with few names of its own',
  sigint: 'live signals (aircraft, ships, satellites, the spectrum), with few names of its own',
  geoint: 'satellite imagery, maps and measuring tools, with few names of its own',
  'osint-training': 'courses in tradecraft, which name few entities; the Learning adapter reads only the Finance, Economics and Politics courses',
  'data-analytics': 'a tool over the other submodules’ datasets, with no entities of its own',
  'integration-hub': 'a catalogue and API of the other submodules’ datasets (the Master Index’s among them), with no entities of its own',
  // Month by Month was exempt here from 15 November 2026 until its adapter (lake/scripts/adapters.mjs, monthly) came on
  // 17 November; its mentions reached the lake with the full build of 18 November 2026 (MI-12).
  'iot-connect': 'Controls the user’s own devices through the local bridge; names no people, places or events',
  // The Omni-Map (S1, 17 November 2026): its outlines are Cliopatria's rows, named as the source names them, not Master Index
  // entities; its battles are the Master Index's own (read from the lake), and its click comes from Neo Book, which reports.
  'omni-map': 'a map of other sources’ dated borders and of battles the Master Index already holds, opened from Neo Book’s tagged names; names no entities of its own',
  // Tally Stick and Algo Trader were exempt here (private) until 15 November 2026, when they became views of Auto
  // Trader (Omni Trade and Algo Trader); the traders adapter reports Auto Trader's public part, Investor Impersonator.
};

// A constant as a file writes it (`const NAME = {…}` or `[…]`), read without running the file: build.mjs builds the
// lake when it runs, and encyclopedia/index.html is a page. The literal is evaluated on its own, so it names nothing
// else; it comes back as plain JSON (an object from another context would fail a deep comparison).
function constant(file, name) {
  const src = text(file), at = src.indexOf(`const ${name} = `);
  assert.ok(at >= 0, `${file} defines ${name}`);
  const from = src.indexOf('=', at) + 2;
  let depth = 0, quote = null, i = from;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
    else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) break;
  }
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${src.slice(from, i + 1)})`)));
}

const declared = new Map(Object.entries(ADAPTER_MODULES).flatMap(([adapter, mods]) => mods.map(m => [m, adapter])));
// The rule's one written exception. The lake makes its entries only from what a submodule's page mentions (lake/README.md);
// the canon adapter alone reports a list instead of a page: VM's canon list (lake/scripts/canon.mjs), one hand-kept and
// reviewed file of the entries the canon review's references name (ledger MI-12, step F4), filed under the Master Index
// itself, so those entries exist although no other submodule mentions them yet, and the bodies named in "Member of" tags
// have entries to link to (F5). Its mentions are honest about it: each says it is VM's canon list, names its references,
// and links to the list on the Master Index's own page (the tests of the canon below).
const OWN_LIST = { encyclopedia: { adapter: 'canon', why: 'VM’s canon list, a reviewed list rather than a page: the entries the canon review’s references name, and the bodies the "Member of" tags name (MI-12, F4 and F5)' } };
// A submodule whose adapter is new and whose mentions wait for the lake's next full build (one with the network:
// lake-refresh.yml, on the 3rd of each month), with the date that build is due (a note: the test does not read the
// clock). Once the committed lake holds the submodule, the test below fails until its line here is taken out.
// Month by Month waited here from 17 November until the full build of 18 November 2026 put it in the lake.
const AWAITING_BUILD = {};

test('registry: every live submodule reports to the Master Index through an adapter, or is exempt with its reason', () => {
  const missing = LIVE.filter(m => !declared.has(m.id) && !(m.id in EXEMPT)).map(m => `${m.suite}/${m.id} (${m.name})`);
  assert.deepEqual(missing, [], `Not in the Master Index: ${missing.join('; ')}. Give each an adapter in lake/scripts/adapters.mjs `
    + '(in ADAPTERS, and its submodules in ADAPTER_MODULES), name them in MODULE_NAMES and MODULE_ORDER (lake/scripts/build.mjs) and '
    + 'MODULE_SUITE (encyclopedia/index.html), and run node lake/scripts/build.mjs --only <adapter> (lake/README.md, "Adding a module"); '
    + 'or, if it names no entities of its own, add it to EXEMPT in tests/master-index.test.mjs with the reason.');
  const live = new Set(LIVE.map(m => m.id));
  for (const [id, why] of Object.entries(EXEMPT)) {
    assert.ok(live.has(id), `EXEMPT ${id}: registry.json has no live submodule of that id; take it out`);
    assert.ok(!declared.has(id), `EXEMPT ${id}: the ${declared.get(id)} adapter reports it now; take the exemption out`);
    assert.ok(typeof why === 'string' && why.length >= 20, `EXEMPT ${id}: say why`);
  }
  for (const [m, adapter] of declared) assert.ok(SUBMODULE.has(m), `ADAPTER_MODULES.${adapter}: registry.json has no submodule ${m}`);
  assert.equal(declared.size, Object.values(ADAPTER_MODULES).flat().length, 'each submodule is one adapter’s');
  // The exception to "made only from module mentions", with its reason: the one adapter that reports a list.
  for (const [m, { adapter, why }] of Object.entries(OWN_LIST)) {
    assert.equal(declared.get(m), adapter, `${m}: the ${adapter} adapter reports it`);
    assert.deepEqual(ADAPTER_MODULES[adapter], [m], `${adapter}: files under ${m} alone`);
    assert.ok(why.length >= 40, `${m}: say why`);
  }
});

test('adapters: each reports the submodules it declares and no other, with keys, and links the shell opens', async t => {
  assert.deepEqual(Object.keys(ADAPTER_MODULES).sort(), Object.keys(ADAPTERS).sort(), 'ADAPTER_MODULES lists the submodules of every adapter in ADAPTERS');
  // The Retrospective adapter reads its own repository (../hp-retrospective, which the lake refresh checks out beside
  // this one and CI does not): there its submodules are as declared.
  const retroDir = join(ROOT, '../hp-retrospective');
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    if (name === 'retrospective' && !existsSync(join(retroDir, 'data/countries.json'))) { t.diagnostic('retrospective: ../hp-retrospective is not here, so its adapter is not run'); continue; }
    const mentions = await adapter({ jdpiDir: ROOT, retroDir }), seen = new Set(mentions.map(m => m.module));
    assert.deepEqual([...seen].filter(m => !ADAPTER_MODULES[name].includes(m)), [], `${name}: submodules its mentions carry that ADAPTER_MODULES.${name} does not list`);
    assert.deepEqual(ADAPTER_MODULES[name].filter(m => !seen.has(m)), [], `${name}: declared submodules it reports nothing for`);
    const bad = [];
    for (const m of mentions) {
      const k = m.key || {}, mod = SUBMODULE.get(m.module);
      if (!mod) { bad.push(`${m.url}: registry.json has no submodule ${m.module}`); continue; }
      if (!(QID.test(k.qid || '') || (k.title && !k.qid) || (k.bioguide && !k.qid))) bad.push(`${m.url}: key ${JSON.stringify(k)} is a Wikidata ID, a Wikipedia title or a Bioguide ID`);
      if (!m.label || !m.context) bad.push(`${m.url}: a label and a context`);
      // The Master Index opens a mention through the shell (#/<suite>/<module>?at=<url>), which frames only the
      // submodule's own page (shell.js, deepLink).
      if (!/^https:\/\//.test(m.url || '') || !onOwnPage({ at: m.url }, mod.url, JDPI)) bad.push(`${m.url}: not on ${mod.name}'s page (${mod.url})`);
      if (bad.length > 20) break;
    }
    assert.deepEqual(bad, [], `${name}: ${bad.slice(0, 5).join('; ')}`);
  }
});

test('build and page: every submodule an adapter reports is named, counted, opened in its suite, and in the lake', () => {
  const NAMES = constant('lake/scripts/build.mjs', 'MODULE_NAMES'), ORDER = constant('lake/scripts/build.mjs', 'MODULE_ORDER');
  const SUITE = constant('encyclopedia/index.html', 'MODULE_SUITE'), SHOWN = constant('encyclopedia/index.html', 'MODULE_NAME');
  const manifest = read('lake/data/manifest.json'), index = read('lake/data/index.json');
  const problems = [];
  for (const [m, adapter] of declared) {
    const sub = SUBMODULE.get(m);
    if (!NAMES[m]) problems.push(`${m}: no name in MODULE_NAMES (lake/scripts/build.mjs)`);
    if (!ORDER.includes(m)) problems.push(`${m}: not in MODULE_ORDER (lake/scripts/build.mjs), so the build neither counts nor guards it`);
    if (SUITE[m] !== sub?.suite) problems.push(`${m}: MODULE_SUITE (encyclopedia/index.html) has ${SUITE[m]}, registry.json ${sub?.suite}`);
    if (SHOWN[m] && SHOWN[m] !== NAMES[m]) problems.push(`${m}: the Master Index page shows "${SHOWN[m]}", the build names it "${NAMES[m]}"`);
    const inLake = manifest.modules?.[m] > 0 && index.modules?.[m];
    if (m in AWAITING_BUILD) { if (inLake) problems.push(`${m}: in the committed lake now; take it out of AWAITING_BUILD`); }
    else if (!inLake) problems.push(`${m}: not in the committed lake; run node lake/scripts/build.mjs --only ${adapter}`);
  }
  for (const m of ORDER) if (!declared.has(m)) problems.push(`MODULE_ORDER ${m}: no adapter reports it`);
  // The committed index names submodules only: --only <adapter> speaks for the adapter's submodules (ADAPTER_MODULES),
  // and never files the adapter's own name ("kino" is a suite, not a submodule) among the Master Index's modules.
  for (const m of Object.keys(index.modules || {})) if (!SUBMODULE.has(m)) problems.push(`lake/data/index.json names a module ${m}, which registry.json has no submodule of`);
  // A link the Master Index opens in the shell goes to the suite registry.json has the submodule in.
  for (const [m, s] of Object.entries(SUITE)) if (SUBMODULE.get(m)?.suite !== s) problems.push(`MODULE_SUITE ${m}: ${s}, but registry.json has ${SUBMODULE.has(m) ? `it in ${SUBMODULE.get(m).suite}` : 'no such submodule'}`);
  assert.deepEqual(problems, []);
});

/* ---------------------------------------------------------------- Kino */
const scripts = CATEGORY_IDS.flatMap(category => {
  const dir = join(ROOT, 'kino/data', category);
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ category, doc: read(`kino/data/${category}/${f}`) })) : [];
});
const focusWars = new Map(read('battlefield/focus/data/index.json').wars.map(w => [w.id, w]));
const nationalIndex = read('national/data/index.json'), countries = new Map(nationalIndex.countries.map(c => [c.iso3, c]));
const breakthroughs = new Map(read('science/progress/data/events.json').events.map(e => [e.id, e]));
// The Wikidata IDs a scene names (the oracle for the adapter): its Master Index link, its portrait, and a link to a
// War Focus war, a National Analysis or Political Atlas country or an Invention Timeline breakthrough, by their data.
function sceneQids(s) {
  const out = new Set();
  if (s.visual?.kind === 'portrait' && s.visual.qid) out.add(s.visual.qid);
  if (!s.link) return out;
  const at = readAt(s.link);
  const q = { encyclopedia: () => at.qid, 'war-focus': () => focusWars.get(at.war)?.qid, pestle: () => countries.get(at.country)?.qid,
    atlas: () => countries.get(at.country)?.qid, progress: () => breakthroughs.get(at.e)?.q }[s.link.module]?.();
  if (q) out.add(q);
  return out;
}

test('Kino adapter: one mention per film and entity it names, under its category, at the first scene that names it', () => {
  const mentions = kino({ jdpiDir: ROOT });
  assert.ok(scripts.length >= 18 && mentions.length >= 100, `${scripts.length} films, ${mentions.length} mentions`);
  const byDoc = new Map();
  for (const m of mentions) {
    const u = new URL(m.url), h = new URLSearchParams(u.hash.slice(1));
    assert.equal(u.origin + u.pathname, `${JDPI}kino/index.html`, m.url);
    const doc = h.get('doc');
    (byDoc.get(doc) || byDoc.set(doc, []).get(doc)).push({ ...m, cat: u.searchParams.get('cat'), scene: h.get('s') });
  }
  assert.deepEqual([...byDoc.keys()].sort(), scripts.map(x => x.doc.id).sort(), 'every film, and only films');
  for (const { category, doc } of scripts) {
    const ms = byDoc.get(doc.id), scenes = flatScenes(doc), at = `${category}/${doc.id}`;
    assert.equal(new Set(ms.map(m => m.key.qid)).size, ms.length, `${at}: one mention per entity`);
    for (const m of ms) {
      assert.match(m.key.qid, QID, at);
      assert.equal(m.module, `kino-${category}`, at);
      assert.equal(SUBMODULE.get(m.module)?.suite, 'kino', `${at}: ${m.module} is a Kino submodule`);
      assert.equal(m.cat, category, `${at}: on its category's page`);
      assert.equal(m.context, doc.title, at);
      assert.equal(m.date, String(doc.era[0]), at);
      if (m.scene) {
        const k = scenes.findIndex(s => s.id === m.scene);
        assert.ok(k >= 0, `${at}: no scene ${m.scene}`);
        assert.ok(sceneQids(scenes[k]).has(m.key.qid), `${at} ${m.scene} names ${m.key.qid}`);
        assert.ok(scenes.slice(0, k).every(s => !sceneQids(s).has(m.key.qid)), `${at}: ${m.key.qid} at the first scene that names it`);
      }
    }
    const of = q => ms.find(m => m.key.qid === q);
    // A subject is what the whole film is about: its mention opens the film at the start.
    for (const s of doc.subjects) assert.equal(of(s.qid)?.scene, null, `${at}: subject ${s.qid} ${s.label} at the start`);
    // Everything a scene names is there, and nothing else: an item only the Wikidata sources list (where the facts come
    // from, works among them whose names are common words) is not fed.
    const named = new Set([...doc.subjects.map(s => s.qid), ...scenes.flatMap(s => [...sceneQids(s)])]);
    for (const q of named) assert.ok(of(q), `${at}: ${q}`);
    assert.deepEqual(ms.filter(m => !named.has(m.key.qid)).map(m => m.key.qid), [], `${at}: only what it names`);
  }
  // A few by name: a subject, a person a scene links to, a war and a country through their submodules' data, and a
  // breakthrough on the Invention Timeline; and the Prince, which Machiavelli's course lists only among its sources.
  const url = (cat, doc, s) => `${JDPI}kino/index.html?cat=${cat}#doc=${doc}${s ? `&s=${s}` : ''}`;
  const has = (q, u) => mentions.some(m => m.key.qid === q && m.url === u);
  assert.ok(has('Q8016', url('political-figures', 'winston-churchill')), 'Churchill: his film, from the start');
  assert.ok(has('Q11613', url('wars', 'korean-war', 'united-nations')), 'Truman: the Korean War at the scene that links to him');
  assert.ok(has('Q8663', url('political-parties', 'chinese-communist-party', 'party-state')), 'the Korean War through War Focus, in the Communist Party’s film');
  assert.ok(has('Q117', url('geopolitical-events', 'end-of-empire-in-africa', 'legacy')), 'Ghana through National Analysis');
  assert.ok(has('Q80811', url('geopolitical-events', 'cuban-missile-crisis', 'balance')), 'Sputnik 1 through the Invention Timeline');
  assert.ok(!mentions.some(m => m.key.qid === 'Q131719' || m.key.qid === 'Q58784'), 'not the Prince or Capital, which would be the words "Prince" and "Capital" in every book');
});

/* ---------------------------------------------------------------- National Analysis and Volatility */
// The deep links are the pages' own: #country=<ISO3> opens a country's profile on q/national.html and on
// q/volatility.html (each reads it in readHash; tests/national.test.mjs and tests/volatility.test.mjs open them).

test('National Analysis adapter: every country with its Wikidata ID, linked to its profile', () => {
  const mentions = pestle({ jdpiDir: ROOT }), withId = nationalIndex.countries.filter(c => c.qid);
  assert.ok(withId.length >= 200 && withId.every(c => QID.test(c.qid)), 'Wikidata IDs');
  // A country without one (the World Bank's Channel Islands and Kosovo) is left out: its name taken for a title is no key.
  assert.equal(mentions.length, withId.length);
  for (const c of withId) {
    const m = mentions.filter(x => x.url === `${JDPI}q/national.html#country=${c.iso3}`);
    assert.equal(m.length, 1, c.iso3);
    assert.equal(m[0].module, 'pestle');
    assert.deepEqual(m[0].key, { qid: c.qid }, c.iso3);
    assert.match(m[0].context, /^Country profile: \d+ political, economic, social, technological, legal and environmental indicators, \d{4}–\d{4}$/);
  }
});

test('Volatility adapter: every country scored on a day the index holds, by National Analysis’s Wikidata ID, linked to it', () => {
  const v = read('volatility/data/index.json'), qid = new Map(read('national/data/brief.json').countries.map(c => [c.iso3, c.qid]));
  const mentions = volatility({ jdpiDir: ROOT });
  const scored = Object.entries(v.countries).filter(([, c]) => c.days.some(d => d[1] != null)), withId = scored.filter(([iso3]) => qid.get(iso3));
  assert.ok(scored.length >= 50 && scored.length < Object.keys(v.countries).length, `${scored.length} of ${Object.keys(v.countries).length} countries scored`);
  // The few National Analysis gives no ID (Taiwan, Jersey, Vatican City) are left out, with the countries never scored.
  assert.ok(withId.length >= scored.length - 10, `${scored.length - withId.length} scored countries without a Wikidata ID`);
  assert.equal(mentions.length, withId.length, 'a mention for each scored country with an ID, none for the others');
  for (const [iso3, c] of withId) {
    const m = mentions.filter(x => x.url === `${JDPI}q/volatility.html#country=${iso3}`);
    assert.equal(m.length, 1, iso3);
    assert.equal(m[0].module, 'volatility');
    assert.deepEqual(m[0].key, { qid: qid.get(iso3) }, iso3);
    const last = c.days.filter(d => d[1] != null).at(-1);
    assert.equal(m[0].date, last[0], `${iso3}: dated by its latest score`);
    assert.ok(m[0].context.includes(last[1].toFixed(1)), `${iso3}: ${m[0].context}`);
  }
});

test('Month by Month adapter: each mark its Marks tab shows, by its Wikidata ID or its war’s article, linked to it there', () => {
  // A fixture as monthly/scripts/build.mjs writes marks.json: a War Focus war with a mark, the Realtime Battlefield war
  // marked for the same fighting (its primaryUnit is the War Focus one; the page shows both), a Realtime Battlefield war
  // of its own (no Wikidata ID, its article), an ended War Focus war (no mark, not on the page), a country with an ID
  // and no mark, and a unit with neither key.
  const dir = mkdtempSync(join(tmpdir(), 'mi-monthly-'));
  try {
    mkdirSync(join(dir, 'monthly/data'), { recursive: true });
    const unit = (id, extra) => ({ id, kind: id.split(':')[0], name: id, qid: null, wiki: null, iso3: null, primary: true, primaryUnit: id, countries: [], ...extra });
    writeFileSync(join(dir, 'monthly/data/marks.json'), JSON.stringify({ month: '2026-09', units: [
      unit('focus:yemen', { name: 'Yemeni civil war', qid: 'Q19686631', wiki: 'Yemeni civil war (2014–present)', fighting: { month: '2026-09', direction: 'worse', words: 'More deaths recorded', confidence: 'low' } }),
      unit('war:yemen', { name: 'Yemen', wiki: 'Yemeni_civil_war_(2014–present)', primary: false, primaryUnit: 'focus:yemen', fighting: { direction: 'worse', words: 'More deaths recorded', confidence: 'low' } }),
      unit('war:haiti', { name: 'Haiti: gangs and the state', wiki: 'Haitian_crisis_(2018–present)', fighting: { direction: 'same', words: 'No large change by this rule', confidence: 'medium' } }),
      unit('focus:chaco', { name: 'Chaco War', qid: 'Q223126', primary: false, fighting: { month: '2026-09', direction: 'none', words: 'No mark', why: { code: 'ended', text: 'This war ended on 12 June 1935, so it has no mark for September 2026. Its months are in its year strip on War Focus.' } } }),
      unit('country:SDN', { kind: 'country', name: 'Sudan', qid: 'Q1049', iso3: 'SDN', fighting: { direction: 'none', words: 'No mark', why: { code: 'uncertain', text: 'Too uncertain to mark: 3 of the rule\'s checks lower its confidence (listed below).' } } }),
      unit('war:nameless', { fighting: { direction: 'same', words: 'No large change by this rule' } }),
    ] }));
    const at = id => `${JDPI}q/monthly.html#tab=marks&month=2026-09&unit=${encodeURIComponent(id)}`;
    assert.deepEqual(ADAPTERS.monthly({ jdpiDir: dir }).map(m => [m.key, m.label, m.module, m.url, m.date, m.context]), [
      [{ qid: 'Q19686631' }, 'Yemeni civil war', 'monthly', at('focus:yemen'), '2026-09', 'Monthly mark for September 2026: More deaths recorded (low confidence).'],
      [{ title: 'Yemeni civil war (2014–present)' }, 'Yemen', 'monthly', at('war:yemen'), '2026-09', 'Monthly mark for September 2026: More deaths recorded (low confidence).'],
      [{ title: 'Haitian crisis (2018–present)' }, 'Haiti: gangs and the state', 'monthly', at('war:haiti'), '2026-09', 'Monthly mark for September 2026: No large change by this rule (medium confidence).'],
      [{ qid: 'Q1049' }, 'Sudan', 'monthly', at('country:SDN'), '2026-09', 'Monthly mark for September 2026: No mark. Too uncertain to mark: 3 of the rule\'s checks lower its confidence.'],
    ]);
    assert.deepEqual(ADAPTERS.monthly({ jdpiDir: join(dir, 'none') }), [], 'no marks file: no mentions');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // On the committed data: a mention for each unit block the Marks tab draws (q/monthly.html's three lists: Realtime
  // Battlefield's wars, War Focus's wars marked this month, the countries), keyed, and no other.
  const marks = read('monthly/data/marks.json');
  const drawn = marks.units.filter(u => u.kind === 'war' || u.kind === 'country' || (u.kind === 'focus' && u.primary && u.fighting.month === marks.month));
  assert.match(text('q/monthly.html'), /M\.units\.filter\(u => u\.kind === 'focus' && u\.primary && u\.fighting\.month === M\.month\)/, 'the page still lists War Focus’s wars by that rule');
  const mentions = ADAPTERS.monthly({ jdpiDir: ROOT });
  assert.ok(mentions.length >= 15 && mentions.every(m => m.module === 'monthly' && (QID.test(m.key.qid || '') || m.key.title)));
  assert.deepEqual(mentions.map(m => decodeURIComponent(new URL(m.url).hash.match(/unit=([^&]+)/)[1])), drawn.filter(u => u.qid || u.wiki).map(u => u.id));
});

/* ---------------------------------------------------------------- the committed lake */
test('committed lake: the new submodules’ mentions where their adapters put them, and the books’ names kept', () => {
  const shards = new Map(), entity = q => { const i = +q.slice(1) % 512; if (!shards.has(i)) shards.set(i, read(`lake/data/e/${i}.json`)); return shards.get(i)[q]; };
  const linked = (q, m, u) => entity(q)?.mentions.some(x => x.m === m && x.u === u);
  assert.ok(linked('Q8016', 'kino-political-figures', `${JDPI}kino/index.html?cat=political-figures#doc=winston-churchill`), 'Churchill in Kino');
  assert.ok(linked('Q117', 'pestle', `${JDPI}q/national.html#country=GHA`), 'Ghana in National Analysis');
  assert.ok(entity('Q117').tags.includes('Appears in:National Analysis') && entity('Q8016').tags.includes('Appears in:Kino · Political Figures'), '"Appears in" tags');
  assert.ok(entity('Q30').mentions.some(x => x.m === 'volatility' && x.u === `${JDPI}q/volatility.html#country=USA`), 'the United States in Volatility');
  // Kino names Cesare Borgia (a portrait in Machiavelli's course), whom the Prince names "Duke Valentino": a module
  // that gives no names leaves the record's as they were (build.mjs, onlyMerge), the book's among them.
  const borgia = entity('Q187998');
  assert.ok(borgia.mentions.some(x => x.m === 'kino-great-thinkers') && borgia.mentions.some(x => x.m === 'neo-classic'), 'Cesare Borgia in Kino and the Bibliotheca (its reader, Neo Book)');
  assert.ok(borgia.aliases.includes('Duke Valentino'), `the Prince's name for him: ${borgia.aliases.join(', ')}`);
});

// ---- Dates (ledger MI-08). Wikidata's times are signed years with a precision; until November 2026 the build cut a
// date BC to ten characters ("-0356-07-20" to "-0356-07-2") and the page read it through a JS Date, so Alexander the
// Great was "Born 7 August 1929"; a century or a decade was shown as a year.
const wd = (time, precision, circa) => ({ mainsnak: { datavalue: { value: { time, precision } } }, ...(circa ? { qualifiers: { P1480: [{ datavalue: { value: { id: 'Q5727902' } } }] } } : {}) });
// The page's own fmtDate, read out of encyclopedia/index.html, so the page and dates.mjs are held to the same answers.
function pageFmtDate() {
  const src = text('encyclopedia/index.html'), at = src.indexOf('const fmtDate = ');
  assert.ok(at >= 0, 'encyclopedia/index.html defines fmtDate');
  const end = src.slice(at).search(/\r?\n\};/);
  return vm.runInNewContext(`(${src.slice(at + 'const fmtDate = '.length, at + end).trim()}\n})`);
}
test('dates: a Wikidata time kept and shown at its precision: a date BC, a year, a century, a full date', () => {
  assert.deepEqual(wikidataDate(wd('-0356-07-20T00:00:00Z', 11)), { v: '-0356-07-20', p: 11, c: false }, 'a day BC, whole');
  assert.deepEqual(wikidataDate(wd('-0323-00-00T00:00:00Z', 9)), { v: '-0323', p: 9, c: false }, 'a year BC');
  assert.deepEqual(wikidataDate(wd('+1513-12-10T00:00:00Z', 11)), { v: '1513-12-10', p: 11, c: false }, 'a full date');
  assert.deepEqual(wikidataDate(wd('+1500-00-00T00:00:00Z', 7, true)), { v: '1500', p: 7, c: true }, 'a century, circa');
  assert.deepEqual(wikidataDate(wd('+0476-09-04T00:00:00Z', 10)), { v: '0476-09', p: 10, c: false }, 'a month');
  assert.equal(wikidataDate({ mainsnak: { snaktype: 'somevalue' } }), null, 'an unknown value');
  assert.deepEqual(datedFacts({ P569: [wd('+1500-00-00T00:00:00Z', 7, true)], P570: [wd('-0323-06-10T00:00:00Z', 11)] }, { P569: 'born', P570: 'died' }),
    { facts: { born: '1500', died: '-0323-06-10' }, fp: { born: 7 }, fc: ['born'] });
  const page = pageFmtDate();
  for (const [args, want] of [
    [['-0356-07-20'], '20 July 356 BC'], [['-0323'], '323 BC'], [['-0356-07'], 'July 356 BC'], [['1513-12-10'], '10 December 1513'], [['1513-12'], 'December 1513'],
    [['1532'], '1532'], [['0476'], '476'], [['0050-03-15'], '15 March 50'], [['1500', 7], '15th century'], [['1501', 7], '16th century'], [['-0500', 7], '5th century BC'],
    [['1560', 8], '1560s'], [['1500', 9, true], 'c. 1500'], [['1000', 6], '1st millennium'], [['-13798000000', 3], 'c. 13,798,000,000 BC'], [['2024-03-05'], '5 March 2024'],
  ]) {
    assert.equal(formatDate(...args), want, `dates.mjs ${JSON.stringify(args)}`);
    assert.equal(page(...args), want, `the page ${JSON.stringify(args)}`);
  }
});
test('committed lake: Alexander the Great was born in 356 BC and died in 323 BC; no date is cut short', () => {
  const alexander = read(`lake/data/e/${8409 % 512}.json`).Q8409;
  assert.deepEqual([alexander.facts.born, alexander.facts.died], ['-0356-07-20', '-0323-06-10']);
  assert.deepEqual([formatDate(alexander.facts.born), formatDate(alexander.facts.died)], ['20 July 356 BC', '10 June 323 BC']);
  const cut = [];
  for (let i = 0; i < 512; i++) for (const r of Object.values(read(`lake/data/e/${i}.json`))) {
    for (const [k, v] of Object.entries(r.facts)) if (!/^-?\d{4,}(-\d\d(-\d\d)?)?$/.test(v)) cut.push(`${r.q} ${k} ${v}`);
    for (const [k, p] of Object.entries(r.fp || {})) if (!(k in r.facts) || !(p < 9)) cut.push(`${r.q} fp ${k} ${p}`);
    for (const k of r.fc || []) if (!(k in r.facts)) cut.push(`${r.q} fc ${k}`);
  }
  assert.deepEqual(cut, [], 'every date a whole year, month or day, its precision and circa only for its dates');
});

// ---- A tag visible in a book is an appearance (ledger BI-19). Until November 2026 the Bibliotheca adapter read only
// the books' casts, so an entity the reader tags that the lake knew from elsewhere (the Prince's "Milan", the Duchy of
// Milan) showed "Appears in Vitruvian Manager · 0 — Not mentioned directly" beside the tag.
test('committed lake: every entity a book is tagged with appears in that book, as often as it is tagged (the Prince’s Milan never 0)', () => {
  const shards = new Map(), entity = q => { const i = +q.slice(1) % 512; if (!shards.has(i)) shards.set(i, read(`lake/data/e/${i}.json`)); return shards.get(i)[q]; };
  const missing = [];
  for (const f of readdirSync(join(ROOT, 'bibliotheca/data/books')).filter(x => x.endsWith('.json'))) {
    const book = read(`bibliotheca/data/books/${f}`), counts = new Map();
    for (const c of book.chapters) for (const p of c.paragraphs) for (const t of p.terms || []) counts.set(t.qid, (counts.get(t.qid) || 0) + 1);
    for (const [q, n] of counts) {
      const r = entity(q);
      if (!r || !r.total) { missing.push(`${book.slug} ${q}: ${r ? 'total 0' : 'not in the lake'}`); continue; }
      const m = r.mentions.find(x => x.m === 'neo-classic' && x.u.includes(`#book=${book.slug}&`));
      // A record keeps its first 300 places, in module order (build.mjs), so a country the Retrospective names
      // hundreds of times may hold its book mention only in its total.
      if (!m) { if (r.mentions.length < 300) missing.push(`${book.slug} ${q} ${r.label}: no mention of the book`); continue; }
      if (!m.c.includes(`, ${n} time${n === 1 ? '' : 's'}, as `)) missing.push(`${book.slug} ${q} ${r.label}: tagged ${n} times, the lake says "${m.c}"`);
    }
  }
  assert.deepEqual(missing, []);
  const milan = entity('Q153529'), inPrince = milan.mentions.filter(x => x.m === 'neo-classic' && x.u.includes('#book=the-prince&'));
  assert.equal(inPrince.length, 1, 'the Duchy of Milan in The Prince');
  assert.match(inPrince[0].c, /^Named in The Prince \(Niccolò Machiavelli, 1532\), \d+ times, as Milan/);
  assert.ok(milan.total > 0 && milan.tags.includes('Appears in:Bibliotheca'), 'counted, and filed under Bibliotheca');
});

// ---- The recount (--only, after the monthly refresh re-tags the books) gives the total the full build gives. Until
// November 2026 it took out only the book share the kept list showed, and a record keeps 300 places: with 300 earlier
// appearances and one in a book, the full build said 301 and the recount 302.
test('recount: --only gives the full build’s total whatever the 300-place cap, or a place named twice', () => {
  const at = (module, i) => ({ module, url: `${JDPI}${module}#${i}`, context: '', date: null });
  // The full build's record (build.mjs, record): each place once, the first 300 in module order, `n` for the short ones.
  const full = all => {
    const seen = new Set(), mentions = [];
    for (const x of all) { if (seen.has(x.module + x.url)) continue; seen.add(x.module + x.url); mentions.push({ m: x.module, u: x.url, c: x.context, d: x.date }); if (mentions.length >= 300) break; }
    const n = shortCounts(all, mentions);
    return { mentions, total: all.length, ...(Object.keys(n).length ? { n } : {}) };
  };
  const own = new Set(['neo-classic']), merge = (old, mine) => {
    const kept = [...old.mentions.filter(x => !own.has(x.m)), ...full(mine).mentions].slice(0, 300);
    return { ...recount(old, own, mine, kept), kept };
  };
  const retro = Array.from({ length: 300 }, (_, i) => at('retrospective', i)), book = [at('neo-classic', 'the-prince')];
  const old = full([...retro, ...book]);
  assert.equal(old.total, 301);
  assert.equal(old.mentions.length, 300, 'the book mention past the cap');
  assert.deepEqual(old.n, { 'neo-classic': 1 }, 'the book share kept beside the list');
  const same = merge(old, book);
  assert.equal(same.total, 301, 'the same tags recounted: the full build’s 301, not 302');
  assert.deepEqual(same.n, { 'neo-classic': 1 });
  const two = [...book, at('neo-classic', 'the-discourses')], more = merge(old, two);
  assert.equal(more.total, full([...retro, ...two]).total, 'a second book: 302, as the full build');
  assert.deepEqual(more.n, { 'neo-classic': 2 });
  assert.equal(merge(old, []).total, 300, 'the book untagged: the Retrospective’s 300');
  // 299 earlier places: the book mention is the 300th, shown, and no `n`; a second book goes past the cap.
  const under = full([...retro.slice(0, 299), ...book]);
  assert.equal(under.n, undefined);
  const past = merge(under, two);
  assert.deepEqual([past.total, past.n], [301, { 'neo-classic': 2 }], 'the second book past the cap, counted');
  assert.equal(merge(full([...retro.slice(0, 299), ...two]), book).total, 300, 'and recounted back to one');
  // A place named twice by another module (the Retrospective names a country many times on one page) stays counted.
  const twice = full([at('retrospective', 0), at('retrospective', 0), ...book]);
  assert.deepEqual([twice.total, twice.n], [3, { retrospective: 2 }]);
  assert.deepEqual(merge(twice, book), { total: 3, n: { retrospective: 2 }, kept: twice.mentions });
  // A record committed before `n` (the list in full, each place once) is recounted as before.
  const plain = { mentions: [{ m: 'retrospective', u: 'a' }, { m: 'neo-classic', u: 'b' }], total: 2 };
  assert.equal(recount(plain, own, [...book, ...book.map(x => ({ ...x, url: 'c' }))], []).total, 3);
  assert.equal(countOf(old, 'retrospective'), 300);
});

/* ---------------------------------------------------------------- the sweep's ten fixes (MI-10) */
// The Master Index sweep of 15 November 2026 (PRP-MASTER-INDEX-SWEEP.md) read all 14,064 records and named ten fixes,
// each made at its builder (lake/scripts/resolve.mjs, dates.mjs, counts.mjs, build.mjs, adapters.mjs; Bibliotheca's era
// and shelf; the Master Index page). Each test below holds the builder's rule now, as a unit case. Where the data can
// only be brought in line by a full build (every record made again: the disambiguation pages left out, dates by rank,
// `n` on every short record, the summaries checked), its data check binds from the manifest's `fullBuild` stamp, which
// only a full build by the corrected builder writes (the lake refresh of 3 December 2026); LAKE_RULES=all runs those
// checks on any data, as a check of a scratch full build. The rest bind on the data as committed.
const resolveFns = resolveRules;
const lakeManifest = read('lake/data/manifest.json');
const FULL = Boolean(lakeManifest.fullBuild) || process.env.LAKE_RULES === 'all';
const afterFullBuild = t => { if (!FULL) t.diagnostic('the data check binds from the first full build by the corrected builder (lake-refresh, 3 December 2026; manifest.fullBuild)'); return FULL; };
// The types Polity, Period, Site and Series came on 21 November 2026 (types.mjs): their data checks bind from the first
// full build made after that day, which types every record again from Wikidata's classes.
const TYPES_BUILD = (FULL && String(lakeManifest.fullBuild || '') >= '2026-11-21') || process.env.LAKE_RULES === 'all';
const afterTypesBuild = t => { if (!TYPES_BUILD) t.diagnostic('the data check binds from the first full build after the four types came (21 November 2026; manifest.fullBuild)'); return TYPES_BUILD; };
let allRecords = null;
const lakeRecords = () => {
  if (!allRecords) { allRecords = new Map(); for (let i = 0; i < 512; i++) for (const [q, r] of Object.entries(read(`lake/data/e/${i}.json`))) allRecords.set(q, r); }
  return allRecords;
};
const yearIn = d => (d ? parseInt(String(d), 10) : null);

// ---- Fix 1. A Wikimedia disambiguation page is no entity (sweep 4b): eight were entries, five of them human name
// disambiguation pages (Q22808320), which a test on Q4167410 alone misses.
test('resolve: an item that is a Wikimedia disambiguation page, of any kind, is no entity', () => {
  const p31 = (...ids) => ({ claims: { P31: ids.map(id => ({ rank: 'normal', mainsnak: { datavalue: { value: { id } } } })) } });
  for (const q of ['Q4167410', 'Q22808320', 'Q66480449', 'Q141143653']) assert.equal(resolveFns.isDisambiguation(p31(q)), true, q);
  assert.equal(resolveFns.isDisambiguation(p31('Q5')), false, 'a human');
  assert.equal(resolveFns.isDisambiguation({ claims: { P31: [{ rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q4167410' } } } }, { mainsnak: { datavalue: { value: { id: 'Q5' } } } }] } }), false, 'a deprecated class is not its class');
  // The build leaves such a key out with a warning naming the module and key, and gives such a related item no page.
  const src = text('lake/scripts/build.mjs');
  assert.match(src, /isDisambiguation\(e\)\) \{ disambiguation\.add\(q\); continue; \}/, 'fetchEntities keeps no disambiguation page');
  assert.match(src, /console\.warn\(`\$\{m\.module\} \$\{JSON\.stringify\(m\.key\)\} → \$\{q\} is a Wikimedia disambiguation page; left out`\)/, 'and says which module and key');
});
test('traders adapter: an investor is keyed by his own article where his name is a disambiguation page (David Einhorn)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mi10-'));
  try {
    mkdirSync(join(dir, 'traders/data'), { recursive: true });
    writeFileSync(join(dir, 'traders/data/congress.json'), JSON.stringify({ members: [] }));
    writeFileSync(join(dir, 'traders/data/investors.json'), JSON.stringify({ investors: [
      { cik: 1489933, person: 'David Einhorn', wiki: 'David Einhorn (hedge fund manager)', fund: 'Greenlight Capital', style: 'Value', period: '2026-06-30' },
      { cik: 1067983, person: 'Warren Buffett', fund: 'Berkshire Hathaway', style: 'Value', period: '2026-06-30' }] }));
    const ms = traders({ jdpiDir: dir });
    assert.deepEqual(ms.map(m => [m.key.title, m.label]), [['David Einhorn (hedge fund manager)', 'David Einhorn'], ['Warren Buffett', 'Warren Buffett']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // The Auto Trader's builder gives him that article (traders/scripts/build-13f.mjs), so its refresh writes it.
  assert.match(text('traders/scripts/build-13f.mjs'), /\{ cik: 1489933, person: 'David Einhorn', wiki: 'David Einhorn \(hedge fund manager\)'/);
});
test('committed lake: no entry with mentions is a disambiguation page, and no "Led" term starts before 16 or after death', t => {
  if (!afterFullBuild(t)) return;
  const bad = [];
  for (const r of lakeRecords().values()) {
    if (r.mentions.length && (/disambiguation page/i.test(r.desc) || resolveFns.DISAMBIGUATION_TEXT.test(r.summary || ''))) bad.push(`${r.q} ${r.label}: a disambiguation page`);
    const born = yearIn(r.facts.born), died = yearIn(r.facts.died);
    for (const m of r.mentions) {
      const led = m.m === 'retrospective' && String(m.c).match(/^Led .+, (\d{4})–/);
      if (!led) continue;
      const y = +led[1];
      if ((born !== null && y < born + 16) || (died !== null && y > died)) bad.push(`${r.q} ${r.label} (${r.facts.born || '?'}–${r.facts.died || ''}): "${m.c}"`);
    }
  }
  assert.deepEqual(bad, []);
});

// ---- Fix 2. Each date from Wikidata's best statement (sweep 1b): the 2026 South Sudanese general election showed its
// first P585, a deprecated 2018-07.
test('dates: the preferred statement, else the first normal one, never a deprecated one', () => {
  const at = (rank, time, precision = 11) => ({ rank, ...wd(time, precision) });
  assert.deepEqual(datedFacts({ P585: [at('deprecated', '+2018-07-00T00:00:00Z', 10), at('normal', '+2027-02-11T00:00:00Z')] }, { P585: 'date' }).facts, { date: '2027-02-11' }, 'the South Sudanese election');
  assert.deepEqual(datedFacts({ P569: [at('normal', '+1900-01-01T00:00:00Z'), at('preferred', '+1901-05-02T00:00:00Z')] }, { P569: 'born' }).facts, { born: '1901-05-02' }, 'a preferred after a normal wins');
  assert.deepEqual(datedFacts({ P570: [at('deprecated', '+1950-00-00T00:00:00Z', 9)] }, { P570: 'died' }).facts, {}, 'only a deprecated statement: no fact');
  assert.equal(bestClaim([]), null);
  assert.equal(bestClaim(undefined), null);
  // The Century tag reads the same statement (build.mjs tagsFor, dates.mjs centuryTag).
  assert.match(text('lake/scripts/build.mjs'), /centuryTag\(\[e\.claims\?\.P569, e\.claims\?\.P585, e\.claims\?\.P580, e\.claims\?\.P571\]\.map\(bestClaim\)\.find\(c => wikidataDate\(c\)\)\)/);
});

// S0 (16 November 2026), "dates.mjs keeps disputes and calendars": a date Wikidata gives in the Julian calendar was
// kept and shown as if Gregorian (Alexander the Great's birth, -0356-07-20, is Julian there), and where Wikidata gives
// two best-rank values for a date (all preferred, or all normal with none preferred) only the first was kept, so a
// disputed date read as settled. The lake keeps `fcal` (the facts in the Julian calendar) and `fd` (each disputed
// fact's other values with their precisions); the page says both.
test('dates: a Julian date says so, and a date with two best-rank values in Wikidata keeps both', async () => {
  const { factText } = await import('../lake/scripts/dates.mjs');
  const JUL = 'http://www.wikidata.org/entity/Q1985786', GRE = 'http://www.wikidata.org/entity/Q1985727';
  const c = (time, precision, calendarmodel = GRE, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: { time, precision, calendarmodel } } } });
  assert.deepEqual(wikidataDate(c('-0356-07-20T00:00:00Z', 11, JUL)), { v: '-0356-07-20', p: 11, c: false, cal: 'julian' });
  assert.deepEqual(wikidataDate(c('+1952-02-06T00:00:00Z', 11)), { v: '1952-02-06', p: 11, c: false }, 'Gregorian is the default, unmarked');
  const facts = claims => datedFacts(claims, { P569: 'born', P570: 'died' });
  assert.deepEqual(facts({ P569: [c('+1452-04-15T00:00:00Z', 11, JUL), c('+1452-04-14T00:00:00Z', 11, JUL)] }),
    { facts: { born: '1452-04-15' }, fp: {}, fc: [], fcal: ['born'], fd: { born: [['1452-04-14', 11]] } }, 'two normal values, none preferred: disputed');
  assert.equal(facts({ P569: [c('+1452-04-15T00:00:00Z', 11, GRE, 'preferred'), c('+1452-04-14T00:00:00Z', 11)] }).fd, undefined, 'a preferred value settles it');
  assert.equal(facts({ P569: [c('+1452-04-15T00:00:00Z', 11), c('+1452-00-00T00:00:00Z', 9)] }).fd, undefined, 'the same year, less precise: no dispute');
  assert.equal(facts({ P569: [c('+1500-00-00T00:00:00Z', 7), c('+1452-04-15T00:00:00Z', 11)] }).fd, undefined, 'a year within the century given: no dispute');
  assert.equal(facts({ P569: [c('+1452-04-15T00:00:00Z', 11), { ...c('+1460-00-00T00:00:00Z', 9), rank: 'deprecated' }] }).fd, undefined, 'a deprecated value is never a dispute');
  assert.deepEqual(facts({ P570: [c('+1519-05-02T00:00:00Z', 11, JUL, 'preferred'), c('+1519-05-03T00:00:00Z', 11, JUL, 'preferred'), c('+1520-00-00T00:00:00Z', 9)] }).fd, { died: [['1519-05-03', 11]] }, 'among the preferred only');
  // Shown: the calendar beside the date, and every value of a disputed one (dates.mjs and the page, the same answers).
  const page = pageFmtDate(), src = text('encyclopedia/index.html'), at = src.indexOf('const factText = ');
  assert.ok(at >= 0, 'encyclopedia/index.html defines factText');
  const pageFact = vm.runInNewContext(`(${src.slice(at + 'const factText = '.length, at + src.slice(at).search(/\r?\n\};/)).trim()}\n})`, { fmtDate: page });
  for (const [args, want] of [[['-0356-07-20', undefined, false, 'julian'], '20 July 356 BC (Julian calendar)'], [['1500', 7, false, 'julian'], '15th century (Julian calendar)'], [['1952-02-06', undefined, false, undefined], '6 February 1952']]) {
    assert.equal(formatDate(...args), want); assert.equal(page(...args), want);
  }
  const rec = { facts: { born: '1452-04-15' }, fcal: ['born'], fd: { born: [['1452-04-14', 11]] } };
  assert.equal(factText(rec, 'born'), '15 April 1452 or 14 April 1452 (Julian calendar; Wikidata gives both)');
  assert.equal(pageFact(rec, 'born'), factText(rec, 'born'));
  assert.equal(factText({ facts: { died: '1945' }, fp: {} }, 'died'), '1945');
  assert.match(src, /esc\(factText\(e, f\)\)/, 'the entry\'s facts are written by factText');
  // The builder keeps them on the record.
  assert.match(text('lake/scripts/build.mjs'), /const \{ facts, fp, fc, fcal = \[\], fd = \{\} \} = datedFacts\(e\.claims, PROPS\);/);
  assert.match(text('lake/scripts/build.mjs'), /\.\.\.\(fcal\.length \? \{ fcal \} : \{\}\), \.\.\.\(Object\.keys\(fd\)\.length \? \{ fd \} : \{\}\)/);
});
// The second reviewer (17 November 2026, X2): each other value keeps its own calendar. The October Revolution's 25
// October 1917 (Julian) and 7 November 1917 (Gregorian) are one day, so no dispute; two values that are different
// days in different calendars each say which calendar they are in, on the page as in dates.mjs.
test('dates: a second value in the other calendar keeps its calendar, and the same day in both is no dispute', async () => {
  const { factText } = await import('../lake/scripts/dates.mjs');
  const JUL = 'http://www.wikidata.org/entity/Q1985786', GRE = 'http://www.wikidata.org/entity/Q1985727';
  const c = (time, precision, calendarmodel = GRE, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: { time, precision, calendarmodel } } } });
  const facts = claims => datedFacts(claims, { P585: 'date', P569: 'born' });
  const src = text('encyclopedia/index.html'), at = src.indexOf('const factText = ');
  const pageFact = vm.runInNewContext(`(${src.slice(at + 'const factText = '.length, at + src.slice(at).search(/\r?\n\};/)).trim()}\n})`, { fmtDate: pageFmtDate() });
  const both = (rec, f, want) => { assert.equal(factText(rec, f), want); assert.equal(pageFact(rec, f), want, 'the page gives the same'); };
  // The same day, in either order: one date, its own calendar named.
  const oct = facts({ P585: [c('+1917-10-25T00:00:00Z', 11, JUL), c('+1917-11-07T00:00:00Z', 11, GRE)] });
  assert.deepEqual(oct, { facts: { date: '1917-10-25' }, fp: {}, fc: [], fcal: ['date'] }, 'Julian first: the same day');
  both(oct, 'date', '25 October 1917 (Julian calendar)');
  const nov = facts({ P585: [c('+1917-11-07T00:00:00Z', 11, GRE), c('+1917-10-25T00:00:00Z', 11, JUL)] });
  assert.deepEqual(nov, { facts: { date: '1917-11-07' }, fp: {}, fc: [] }, 'Gregorian first: the same day');
  both(nov, 'date', '7 November 1917');
  assert.equal(facts({ P585: [c('+1917-10-25T00:00:00Z', 11, JUL), c('+1917-11-00T00:00:00Z', 10, GRE)] }).fd, undefined, 'the month that day falls in, in the other calendar');
  assert.equal(facts({ P569: [c('-0356-07-20T00:00:00Z', 11, JUL), c('-0356-07-15T00:00:00Z', 11, GRE)] }).fd, undefined, 'a day BC, the same in both (five days apart then)');
  // Different days in different calendars: each value says its calendar.
  const jg = facts({ P569: [c('+1452-04-15T00:00:00Z', 11, JUL), c('+1452-04-14T00:00:00Z', 11, GRE)] });
  assert.deepEqual(jg.fd, { born: [['1452-04-14', 11, 'gregorian']] });
  both(jg, 'born', '15 April 1452 (Julian calendar) or 14 April 1452 (Gregorian calendar); Wikidata gives both');
  const gj = facts({ P569: [c('+1452-04-24T00:00:00Z', 11, GRE), c('+1452-04-15T00:00:00Z', 11, JUL), c('+1452-04-20T00:00:00Z', 11, JUL)] });
  assert.deepEqual(gj.fd, { born: [['1452-04-20', 11, 'julian']] }, 'Julian 15 April 1452 is Gregorian 24 April: no dispute; Julian 20 April is');
  both(gj, 'born', '24 April 1452 (Gregorian calendar) or 20 April 1452 (Julian calendar); Wikidata gives both');
  assert.deepEqual(facts({ P569: [c('+1452-04-15T00:00:00Z', 11, JUL), c('+1452-04-15T00:00:00Z', 11, GRE)] }).fd, { born: [['1452-04-15', 11, 'gregorian']] }, 'one value written in both calendars is two days');
  // In one calendar, as before: the calendar once for them all, and no third element.
  both({ facts: { born: '1452-04-15' }, fcal: ['born'], fd: { born: [['1452-04-14', 11]] } }, 'born', '15 April 1452 or 14 April 1452 (Julian calendar; Wikidata gives both)');
});
test('committed lake, after the full build: Alexander the Great\'s birth is in the Julian calendar, and every disputed date differs', t => {
  if (!afterFullBuild(t)) return;
  assert.ok((lakeRecords().get('Q8409')?.fcal || []).includes('born'), 'Alexander the Great: born in the Julian calendar (Wikidata, read 16 November 2026)');
  for (const r of lakeRecords().values()) {
    for (const f of r.fcal || []) assert.ok(r.facts[f], `${r.q}: fcal ${f} is a fact`);
    for (const [f, alts] of Object.entries(r.fd || {})) { assert.ok(r.facts[f] && alts.length, `${r.q}: fd ${f}`); for (const [v, , k] of alts) assert.ok(v !== r.facts[f] || k, `${r.q} ${f}: the same value, unless in the other calendar`); }
  }
});

// S0 (16 November 2026): Sparta (Q5690) was typed a topic: Wikidata makes it a polis (Q148837) and an ancient city
// (Q15661340), neither among the place types, and it has no capital (P36). The type rules live in lake/scripts/types.mjs.
// Since 21 November 2026 a polis is a polity, a state that no longer exists (the four new types, below); an ancient city
// that is neither a polis nor a city-state, nor an archaeological site, stays a place.
// A dated statement as Wikidata gives one (a year, normal rank): what a date sign needs to count (typeOf's dated).
const STATED = { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1900-00-00T00:00:00Z', precision: 9 } } } };
test('types: a polis is a polity, and an ancient city a place (Sparta)', async () => {
  const { typeOf, PLACE } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = {}) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...more } });
  assert.equal(typeOf(e('Sparta', ['Q15661340', 'Q148837', 'Q93342462'])), 'polity');
  assert.equal(typeOf(e('Athens', ['Q148837'])), 'polity');
  assert.equal(typeOf(e('An ancient city', ['Q15661340'])), 'place');
  assert.ok(PLACE.has('Q6256') && PLACE.has('Q148837') && PLACE.has('Q15661340'));
  // The rest as before: a person, an election, a war by its label, a party, an idea, a country, an event, a topic.
  assert.equal(typeOf(e('Niccolò Machiavelli', ['Q5'])), 'person');
  assert.equal(typeOf(e('2026 South Sudanese general election', ['Q40231'])), 'election');
  assert.equal(typeOf(e('Peloponnesian War', ['Q180684'])), 'conflict');
  assert.equal(typeOf(e('Italy', ['Q6256'])), 'place');
  assert.equal(typeOf(e('Something', [], { P585: [{}] })), 'event');
  assert.equal(typeOf(e('Something', [])), 'topic');
  assert.match(text('lake/scripts/build.mjs'), /import \{ typeOf\b[^}]*\} from '\.\/types\.mjs';/);
});
test('committed lake, after the full build: Sparta is a polity', t => {
  if (!afterTypesBuild(t)) return;
  assert.equal(lakeRecords().get('Q5690')?.type, 'polity');
});

// MI-12, step F3 of VM-MASTER-INDEX-CANON-REVIEW.md (fault 7), and row 10 of VM-ATLAS-TOPICS-SUGGESTIONS.md part D
// (18 November 2026). Each entity below is given the P31 classes, the dates and the capital Wikidata gave it that day
// (wbgetentities, read-only), so each line fails on the rule that typed it wrong.
test('types: the review’s corrections: schools of economics, the Nazi Party, the EU, treaties, just war theory, the non-ideas', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  // Schools of economic thought (Q3048444) were topics.
  for (const l of ['Keynesian economics', 'Austrian school', 'Chicago school of economics', 'post-Keynesian economics', 'New Keynesian economics', 'Neo-Keynesian economics']) assert.equal(typeOf(e(l, ['Q3048444'])), 'idea', l);
  assert.equal(typeOf(e('classical economics', ['Q3048444', 'Q137189000'])), 'idea');
  // The Nazi Party: a political party in Germany, a defunct party, a state party; none was a party class.
  assert.equal(typeOf(e('Nazi Party', ['Q15811108', 'Q2023214', 'Q40482169', 'Q1469680'], ['P571'])), 'party');
  // The European Union: an international organisation before a place, though it has a capital (P36).
  assert.equal(typeOf(e('European Union', ['Q4120211', 'Q120121699', 'Q1335818', 'Q170156'], ['P36', 'P571'])), 'organisation');
  // A treaty (Q131569) was a place; it is an event, with or without its date.
  assert.equal(typeOf(e('Paris Agreement', ['Q131569', 'Q5381350', 'Q5133412'], ['P585'])), 'event');
  assert.equal(typeOf(e('Schengen Agreement', ['Q131569'], ['P585'])), 'event');
  assert.equal(typeOf(e('START II', ['Q131569'], ['P585'])), 'event');
  assert.equal(typeOf(e('A treaty with no date', ['Q131569'])), 'event');
  // "war" in a doctrine's label does not make it a conflict.
  assert.equal(typeOf(e('just war theory', ['Q117850'])), 'idea');
  // Not ideas: a label ending in "mechanism" or "magnetism", software, a group of philosophers.
  assert.equal(typeOf(e('Antikythera mechanism', ['Q220659', 'Q211586', 'Q5275'], ['P580'])), 'topic');
  assert.equal(typeOf(e('Higgs mechanism', ['Q517596'])), 'topic');
  assert.equal(typeOf(e('electromagnetism', ['Q4162444'])), 'topic');
  assert.equal(typeOf(e('AlphaFold', ['Q7397', 'Q117349473', 'Q11660'], ['P571'])), 'topic');
  assert.equal(typeOf({ id: 'Q208238', ...e('Vienna Circle', ['Q1387659'], ['P571']) }), 'organisation');
  // The atlas's row 10: the Zhou dynasty is a state as the Shang is (a polity since 21 November 2026); the partition of
  // India an event, not a war.
  assert.equal(typeOf(e('Zhou dynasty', ['Q12857432', 'Q836688', 'Q11514315'], ['P571'])), 'polity');
  assert.equal(typeOf(e('Shang dynasty', ['Q836688', 'Q12857432', 'Q11042', 'Q1292119', 'Q11514315'], ['P36', 'P571'])), 'polity');
  assert.equal(typeOf(e('partition of India', ['Q8465', 'Q518554', 'Q198'], ['P585'])), 'event');
  // Unchanged: the party named Renaissance, a war, a school of thought, an -ism, a country, a person.
  assert.equal(typeOf(e('Renaissance', ['Q7278'], ['P571'])), 'party');
  assert.equal(typeOf(e('Peloponnesian War', ['Q180684'])), 'conflict');
  assert.equal(typeOf(e('Frankfurt School', ['Q1387659'], ['P571'])), 'idea');
  assert.equal(typeOf(e('liberalism', [])), 'idea');
  assert.equal(typeOf(e('Italy', ['Q6256'], ['P36'])), 'place');
  // A country that Wikidata also makes a supranational union is no organisation: a place, and since 21 November 2026,
  // as a historical country dissolved in 1991 (P576, read 21 November 2026), a polity.
  assert.equal(typeOf(e('Soviet Union', ['Q512187', 'Q842112', 'Q3024240', 'Q3624078', 'Q1335818', 'Q7275', 'Q6256'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('John Mearsheimer', ['Q5'], ['P569'])), 'person');
});
// The fixer's pass (18 November 2026): the parties whose only class is a kind of party below political party (each a
// subclass of Q7278 in Wikidata that day), the Virginia school (no class at all), and entries a war word in the label
// made conflicts though their class is no war. Each is given the classes and dates Wikidata gave it that day.
test('types: every kind of party is a party; a war word does not make a protest, a sanction or a ceasefire a war', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  const parties = [['Norwegian Labour Party', ['Q108564724']], ['Progressive Party', ['Q3282509']], ['Democratic Party', ['Q23702035']],
    ['Union of the Democratic Centre', ['Q6065085', 'Q388602']], ['Communist Party of Ukraine', ['Q115326462']], ['We Continue the Change', ['Q43791339', 'Q388602']],
    ['Croatian Independent Democrats', ['Q43639983']], ['European People\'s Party', ['Q24649']], ['Green Party of Canada', ['Q3778417']]];
  for (const [l, p31] of parties) assert.equal(typeOf(e(l, p31, ['P571'])), 'party', l);
  assert.equal(typeOf(e('Ottoman Liberal People\'s Party', ['Q136193351'])), 'party');
  assert.equal(typeOf({ id: 'Q3482308', ...e('Virginia school of political economy', []) }), 'idea');
  // No war: a protest and an international reaction with dates are events; a sanction, an arrest warrant, aid and a list
  // are topics; a ceasefire with its date is an event.
  assert.equal(typeOf(e('protests against the 2026 Iran war', ['Q273120'], ['P580'])), 'event');
  assert.equal(typeOf(e('Gaza war protests', ['Q175331', 'Q273120'], ['P585', 'P580'])), 'event');
  assert.equal(typeOf(e('international reactions to the Gaza war', ['Q100886746'], ['P585', 'P580'])), 'event');
  assert.equal(typeOf(e('Twelve-Day War ceasefire', ['Q208383'], ['P585'])), 'event');
  assert.equal(typeOf(e('international sanctions during the Russo-Ukrainian war', ['Q2061202'])), 'topic');
  assert.equal(typeOf(e('International Criminal Court arrest warrants for Israel–Hamas war figures', ['Q584041'])), 'topic');
  assert.equal(typeOf(e('Humanitarian aid during the Gaza war', ['Q826745'])), 'topic');
  assert.equal(typeOf(e('list of attacks in Iraq during Iraq War and after', ['Q13406463'])), 'topic');
  // Unchanged: a massacre, a coup and an invasion are still conflicts by the word in their label.
  assert.equal(typeOf(e('Srebrenica massacre', ['Q135010', 'Q173462', 'Q41397', 'Q3199915'], ['P580'])), 'conflict');
  assert.equal(typeOf(e('2023 Gabon coup d\'état', ['Q3449092'], ['P585'])), 'conflict');
  assert.equal(typeOf(e('2003 invasion of Iraq', ['Q467011'], ['P580'])), 'conflict');
  // A parliamentary group and a political movement are not parties.
  assert.equal(typeOf(e('A parliamentary group', ['Q36378425'])), 'topic');
});

// MI-12, MI-13 and MI-07 (21 November 2026): the types Polity, Period, Site and Series (VM-ATLAS-TOPICS-SUGGESTIONS.md
// part D and question 3 of part E; PRP-SCHOLAR-USP-DESIGN.md 7.1). Each entity is given the P31 classes and the signs
// Wikidata gave it on 21 November 2026 (wbgetentities, read-only), so each line fails on the rule that types it.
test('types: a state that no longer exists is a polity; a country, a city lived in today and a region stay places', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  // The owner's examples of a polity: dynasties, empires, ancient Egypt, a city republic.
  assert.equal(typeOf(e('Zhou dynasty', ['Q12857432', 'Q836688', 'Q11514315'], ['P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Shang dynasty', ['Q836688', 'Q12857432', 'Q11042', 'Q1292119', 'Q11514315'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Achaemenid Empire', ['Q3024240', 'Q11514315'], ['P36', 'P580', 'P582', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('ancient Egypt', ['Q28171280', 'Q3502482', 'Q3024240', 'Q1620908'], ['P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Neo-Assyrian Empire', ['Q3024240', 'Q11514315', 'Q1292119', 'Q48349'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Republic of Florence', ['Q3624078', 'Q3024240'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Inca Empire', ['Q3024240'], ['P36', 'P580', 'P582', 'P571', 'P576'])), 'polity');
  // A dynasty that is also a historical period is a polity (a state before a period); so is a sovereign state that is
  // also a historical country (Ming, the Soviet Union), and a city-state that is also an archaeological site.
  assert.equal(typeOf(e('Ming dynasty', ['Q50068795', 'Q3624078', 'Q11042', 'Q11514315', 'Q1292119'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Classical Athens', ['Q148837', 'Q839954', 'Q133442', 'Q102202066'], ['P36', 'P571'])), 'polity');
  assert.equal(typeOf(e('Kingdom of Pergamon', ['Q3932025'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Latvian Soviet Socialist Republic', ['Q236036'], ['P36', 'P571', 'P576'])), 'polity');
  // A colony, a confederation, an empire or a republic with a date it was dissolved (P576): a polity.
  assert.equal(typeOf(e('Italian Libya', ['Q133156'], ['P36', 'P571', 'P576', 'P582'])), 'polity');
  assert.equal(typeOf(e('Crown Colony of Malta', ['Q1351282'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Confederation of the Rhine', ['Q170156'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('British Empire', ['Q1790360', 'Q1620908'], ['P36', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Independent Albania', ['Q7270'], ['P36', 'P571', 'P576'])), 'polity');
  // Review D4: Wikidata records the end of a military occupation as its end time (P582), not a date of dissolution; the
  // Ukrainian occupation of Kursk Oblast (Q129167851, read 21 November 2026) has P582 May 2025 and no P576.
  assert.equal(typeOf(e('Ukrainian occupation of Kursk Oblast', ['Q188686'], ['P36', 'P580', 'P582', 'P571'])), 'polity');
  // Second review X1 (21 November 2026): a date is a sign only when Wikidata's best statement states one. A dissolution
  // stated as 'no value' or 'unknown value', or only a deprecated date, ends nothing: the record would show no date.
  const noValue = { rank: 'normal', mainsnak: { snaktype: 'novalue' } }, unknown = { rank: 'normal', mainsnak: { snaktype: 'somevalue' } };
  const deprecated = { ...STATED, rank: 'deprecated' };
  const withP = (ent, p, claims) => ({ ...ent, claims: { ...ent.claims, [p]: claims } });
  const libya = e('Italian Libya', ['Q133156'], ['P36', 'P571']), sovereign = e('A state of today', ['Q6256', 'Q3624078', 'Q3024240'], ['P36', 'P571']);
  for (const claims of [[noValue], [unknown], [deprecated], []]) {
    assert.equal(typeOf(withP(libya, 'P576', claims)), 'place', 'a colony with no stated date of dissolution stays a place');
    assert.equal(typeOf(withP(sovereign, 'P576', claims)), 'place', 'a state of today with no stated date of dissolution stays a place');
    assert.equal(typeOf(withP(e('An occupation', ['Q188686'], ['P36', 'P580', 'P571']), 'P582', claims)), 'place', 'an occupation with no stated end stays a place');
  }
  assert.equal(typeOf(withP(libya, 'P576', [deprecated, STATED])), 'polity', 'a stated date beside a deprecated one counts');
  assert.equal(typeOf(withP(sovereign, 'P576', [STATED])), 'polity', 'a historical country with a stated dissolution is a polity');
  // An end time makes no state that exists today a polity, and no territory without one.
  assert.equal(typeOf(e('India', ['Q6256', 'Q3624078', 'Q223832'], ['P36', 'P571', 'P582'])), 'place');
  // A period's end time is not a dissolution: Ottoman Palestine (Q2909425, read 21 November 2026) stays a period.
  assert.equal(typeOf(e('Ottoman Palestine', ['Q11514315', 'Q1620908', 'Q161243'], ['P580', 'P582', 'P625'])), 'period');
  // States that exist today stay places, a former dominion (India) and a colonial power (France) among them; so do a
  // territory with no date it was dissolved, a region, and a city lived in today, whatever its old classes: Rome, Venice
  // (an Italian city-state), Hong Kong (a city-state), the island of Samos (a polis), Byblos (an archaeological site).
  assert.equal(typeOf(e('France', ['Q3624078', 'Q20181813', 'Q51576574', 'Q7270', 'Q6256'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('India', ['Q6256', 'Q3624078', 'Q223832'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Greenland', ['Q66724388', 'Q192611', 'Q112099', 'Q161243', 'Q788176'], ['P36'])), 'place');
  assert.equal(typeOf(e('Tuscany', ['Q16110'], ['P36'])), 'place');
  assert.equal(typeOf(e('Rome', ['Q902814', 'Q3685476', 'Q1200957', 'Q200250', 'Q51929311', 'Q1187811', 'Q1549591', 'Q747074', 'Q108178728', 'Q5119'], ['P571'])), 'place');
  assert.equal(typeOf(e('Venice', ['Q747074', 'Q581830', 'Q2264924', 'Q515', 'Q1549591', 'Q4115680'], ['P571'])), 'place');
  assert.equal(typeOf(e('Hong Kong', ['Q779415', 'Q515', 'Q1549591', 'Q200250', 'Q208511', 'Q161243', 'Q133442'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Samos', ['Q23442', 'Q148837'], ['P36'])), 'place');
  assert.equal(typeOf(e('Byblos', ['Q486972', 'Q839954', 'Q515', 'Q133442'], ['P571'])), 'place');
  // A sovereign state or a country with no date of dissolution exists today, whatever older class Wikidata also gives it.
  assert.equal(typeOf(e('United States', ['Q3624078', 'Q1489259', 'Q6256', 'Q99541706', 'Q1520223', 'Q5035794'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Indonesia', ['Q3624078', 'Q11815167', 'Q1520223', 'Q112099', 'Q6256', 'Q99541706', 'Q179164'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Georgia', ['Q6256', 'Q3624078', 'Q179164', 'Q7270', 'Q4209223', 'Q236036', 'Q140892892'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Liechtenstein', ['Q3624078', 'Q208500', 'Q179164', 'Q136361597', 'Q26879769', 'Q244381', 'Q6256'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Monaco', ['Q3624078', 'Q179164', 'Q208500', 'Q133442', 'Q902814', 'Q6256'], ['P36', 'P571'])), 'place');
  assert.equal(typeOf(e('Vatican City', ['Q133442', 'Q171441', 'Q123480', 'Q6256', 'Q3624078'], ['P36', 'P571'])), 'place');
  // A family dynasty is no state (the Ptolemaic dynasty; its kingdom is the polity).
  assert.notEqual(typeOf(e('Ptolemaic dynasty', ['Q164950'], ['P580', 'P582', 'P571', 'P576'])), 'polity');
  assert.equal(typeOf(e('Ptolemaic Kingdom', ['Q3932025'], ['P36', 'P571', 'P576'])), 'polity');
});
test('types: a named span of history is a period; a movement, a war, a revolution and a party stay what they are', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  assert.equal(typeOf(e('Migration Period', ['Q11514315', 'Q177626'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Iron Age', ['Q15401633'], ['P580'])), 'period');
  assert.equal(typeOf(e('Bronze Age', ['Q15401699'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Middle Ages', ['Q17522177', 'Q11514315'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Industrial Revolution', ['Q11514315'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Late Period of ancient Egypt', ['Q816829'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Islamic Golden Age', ['Q186081', 'Q238526'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Middle kingdoms of India', ['Q11514315'])), 'period');
  // A movement that Wikidata also classes as a period is a period; one it does not stays an idea (the Renaissance and
  // the Age of Enlightenment are a cultural movement in Wikidata, not a period).
  assert.equal(typeOf(e('High Renaissance', ['Q968159', 'Q32880', 'Q11514315', 'Q1292119'], ['P580', 'P582'])), 'period');
  assert.equal(typeOf(e('Renaissance', ['Q968159', 'Q2198855'], ['P580', 'P582'])), 'idea');
  assert.equal(typeOf(e('Age of Enlightenment', ['Q2198855'], ['P580', 'P582'])), 'idea');
  assert.equal(typeOf(e('Renaissance', ['Q7278'], ['P571'])), 'party');
  // A war Wikidata also calls a period stays a war, by its class or, as VM holds the Cold War, by its label.
  assert.equal(typeOf(e('World War II', ['Q103495', 'Q11514315'], ['P580', 'P582'])), 'conflict');
  assert.equal(typeOf(e('Cold War', ['Q4176199', 'Q1469686', 'Q864113', 'Q11514315'], ['P585', 'P580', 'P582'])), 'conflict');
  assert.equal(typeOf(e('Colombian conflict', ['Q124734', 'Q11514315'], ['P580'])), 'conflict');
  // A revolution or a historical event Wikidata also calls a period stays an event; an age of the Earth is no period.
  assert.equal(typeOf(e('French Revolution', ['Q13418847', 'Q10931', 'Q11514315'], ['P580', 'P582'])), 'event');
  assert.equal(typeOf(e('age of the Earth', ['Q186081', 'Q100343219'], ['P580'])), 'event');
  // A year's events in a country are a series, not a period.
  assert.equal(typeOf(e('2006 in Iceland', ['Q18340514'], ['P585'])), 'series');
});
test('types: an archaeological site, a monument or a historic building is a site; an institution in a building is not', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  assert.equal(typeOf(e('Great Pyramid of Giza', ['Q4363262', 'Q839954', 'Q66108498', 'Q175582', 'Q381885'], ['P625', 'P571'])), 'site');
  assert.equal(typeOf(e('Pyramid of Djoser', ['Q1456099', 'Q839954', 'Q175582'], ['P625', 'P571'])), 'site');
  assert.equal(typeOf(e('Pantheon', ['Q867143', 'Q21752084', 'Q120560', 'Q96376684', 'Q14752696', 'Q92755865', 'Q3867560', 'Q112132548', 'Q112132522'], ['P625', 'P571'])), 'site');
  assert.equal(typeOf(e('Hagia Sophia', ['Q32815', 'Q33506', 'Q96371632', 'Q96440023', 'Q811979', 'Q35112127', 'Q16970', 'Q97588309'], ['P576', 'P625', 'P571'])), 'site');
  assert.equal(typeOf(e('Uraniborg', ['Q1254933', 'Q16560', 'Q3395377', 'Q1497375', 'Q19860854'], ['P625', 'P571'])), 'site');
  assert.equal(typeOf(e('Stonehenge', ['Q935773', 'Q4989906', 'Q839954', 'Q16735822', 'Q1035294'], ['P571', 'P576', 'P625'])), 'site');
  // An ancient city that is an archaeological site and no polis or city-state is a site (a site that is also a city).
  assert.equal(typeOf(e('Pompeii', ['Q839954', 'Q15661340'], ['P571', 'P625'])), 'site');
  assert.equal(typeOf(e('Ur', ['Q15661340', 'Q839954'], ['P571', 'P576', 'P625'])), 'site');
  // A city lived in today stays a place, though Wikidata also makes it a tell (Jericho) or an archaeological site.
  assert.equal(typeOf(e('Jericho', ['Q515', 'Q755017'], ['P571', 'P625'])), 'place');
  // A museum, a university, a college building and an artefact are not sites.
  assert.equal(typeOf(e('British Museum', ['Q17431399', 'Q3343298', 'Q207694', 'Q33506', 'Q708676'], ['P625', 'P571'])), 'topic');
  assert.equal(typeOf(e('Sorbonne', ['Q1244442', 'Q38723'], ['P625', 'P571'])), 'topic');
  assert.equal(typeOf(e('Trinity College', ['Q1055028', 'Q1244442', 'Q19844914', 'Q2385804', 'Q2467461', 'Q3918', 'Q708676'], ['P625', 'P571'])), 'topic');
  assert.equal(typeOf(e('Antikythera mechanism', ['Q220659', 'Q211586', 'Q5275'], ['P580'])), 'topic');
  // A battle at a historic site stays a war.
  assert.equal(typeOf(e('Battle of Batina', ['Q178561', 'Q1081138'], ['P580', 'P582', 'P625'])), 'conflict');
});
test('types: an entry that is only a grouping of others is a series; a war that has battles stays a war', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  assert.equal(typeOf(e('Balkan Wars', ['Q104212151'], ['P580', 'P582', 'P527'])), 'series');
  assert.equal(typeOf(e('Italian Wars of 1499–1504', ['Q104212151'], ['P580', 'P582'])), 'series');
  assert.equal(typeOf(e('Wars of Alexander the Great', ['Q130525743', 'Q104212151'], ['P580', 'P582', 'P527'])), 'series');
  assert.equal(typeOf(e('2006 in Iceland', ['Q18340514'], ['P585'])), 'series');
  // A war Wikidata also classes as a war or a civil war, or that VM holds as a war by its label, stays a war.
  assert.equal(typeOf(e('Napoleonic Wars', ['Q104212151', 'Q198'], ['P580', 'P582', 'P527'])), 'conflict');
  assert.equal(typeOf(e('Punic Wars', ['Q104212151', 'Q198'], ['P580', 'P582', 'P527'])), 'conflict');
  assert.equal(typeOf(e('Myanmar conflict', ['Q8465', 'Q104212151'], ['P580'])), 'conflict');
  assert.equal(typeOf(e('War in the Sahel', ['Q104212151'], ['P580', 'P527'])), 'conflict');
  // An entry with a class of its own besides the grouping is not only a grouping: a protest, an ethnic conflict, a written
  // work.
  assert.equal(typeOf(e('2011–2012 Iranian protests', ['Q18340514', 'Q273120'], ['P580', 'P582', 'P585'])), 'event');
  assert.equal(typeOf(e('Yugoslav Wars', ['Q104212151', 'Q766875'], ['P580', 'P582', 'P527'])), 'event');
  assert.equal(typeOf(e('Hippocratic Corpus', ['Q47461344', 'Q17518870'])), 'topic');
});
test('types: every type typeOf gives has a name a reader sees, and the build takes the names from the rules', async () => {
  const { TYPES, TYPE_NAMES } = await import('../lake/scripts/types.mjs');
  assert.deepEqual([...TYPES].sort(), ['conflict', 'election', 'event', 'idea', 'organisation', 'party', 'period', 'person', 'place', 'polity', 'series', 'site', 'topic']);
  for (const t of TYPES) assert.ok(TYPE_NAMES[t], t);
  assert.deepEqual(Object.keys(TYPE_NAMES).sort(), [...TYPES].sort());
  assert.equal(TYPE_NAMES.polity, 'Polity'); assert.equal(TYPE_NAMES.period, 'Period'); assert.equal(TYPE_NAMES.site, 'Site'); assert.equal(TYPE_NAMES.series, 'Series');
  // No other type is renamed.
  assert.equal(TYPE_NAMES.place, 'Place or state'); assert.equal(TYPE_NAMES.idea, 'Idea or school of thought'); assert.equal(TYPE_NAMES.conflict, 'War or conflict');
  const build = text('lake/scripts/build.mjs');
  assert.match(build, /import \{ typeOf, TYPE_NAMES \} from '\.\/types\.mjs';/);
  assert.doesNotMatch(build, /const TYPE_NAMES =/);
});
// Review R3 (21 November 2026): the title says what the body checks. That no person, party or election can move is held
// at its cause, typeOf's order (the next test); here the data is checked for a person's or an election's signs.
test('committed lake, after the first full build with the four types: the owner’s polities, each new type held, and no entry of the four with a person’s or an election’s signs', t => {
  if (!afterTypesBuild(t)) return;
  const recs = lakeRecords();
  // The Zhou and Shang dynasties, the Achaemenid Empire, ancient Egypt, the Neo-Assyrian Empire, the Republic of Florence
  // and the Inca Empire are polities; France and India places; the Renaissance party a party.
  const want = { Q35216: 'polity', Q128938: 'polity', Q389688: 'polity', Q11768: 'polity', Q10914393: 'polity', Q148540: 'polity', Q28573: 'polity',
    Q142: 'place', Q668: 'place', Q23731823: 'party', Q8683: 'conflict', Q37200: 'site', Q165725: 'series', Q1474884: 'period' };
  for (const [q, type] of Object.entries(want)) { assert.ok(recs.has(q), `${q} is in the lake`); assert.equal(recs.get(q).type, type, `${q} ${recs.get(q).label}`); }
  const types = new Set([...recs.values()].map(r => r.type));
  for (const ty of ['polity', 'period', 'site', 'series']) assert.ok(types.has(ty), `some entry is a ${ty}`);
  // A person is typed by a birth (P569) or the class human, an election by its label: none of the four may carry either.
  const four = new Set(['polity', 'period', 'site', 'series']);
  assert.deepEqual([...recs.values()].filter(r => four.has(r.type) && (r.facts?.born || /election|referendum/i.test(r.label || ''))).map(r => `${r.q} ${r.label}`), []);
});
test('types: no rule of the four types reaches a person, an election, a party or a war, whatever other classes they carry', async () => {
  const { typeOf } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = []) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...Object.fromEntries(more.map(p => [p, [STATED]])) } });
  // A human with a historical country's, a period's, a site's and a series' classes is still a person.
  assert.equal(typeOf(e('Someone', ['Q5', 'Q3024240', 'Q11514315', 'Q839954', 'Q20937557'], ['P569', 'P576'])), 'person');
  // An election's label wins over a polity's, a period's or a series' class.
  assert.equal(typeOf(e('1920 election', ['Q3024240', 'Q11514315', 'Q18340514'], ['P576'])), 'election');
  // A party (a defunct political party) with a state's class and a date of dissolution stays a party.
  assert.equal(typeOf(e('Some Party', ['Q7278', 'Q7275'], ['P36', 'P576'])), 'party');
  // A war (Wikidata's class) that is also a series of wars or a historical period stays a war.
  assert.equal(typeOf(e('Punic Wars', ['Q198', 'Q104212151'], ['P580', 'P582'])), 'conflict');
  assert.equal(typeOf(e('Some War', ['Q198', 'Q11514315'], ['P580', 'P582'])), 'conflict');
});
test('committed lake, after the full build: the review’s type corrections hold', t => {
  if (!afterFullBuild(t)) return;
  const recs = lakeRecords();
  const want = { Q83937: 'idea', Q203411: 'idea', Q847001: 'idea', Q271857: 'idea', Q60224: 'idea', Q936174: 'idea', Q7320: 'party', Q458: 'organisation',
    Q21707860: 'event', Q2822795: 'event', Q1187969: 'event', Q847198: 'idea', Q182324: 'topic', Q747702: 'topic', Q11406: 'topic', Q60827595: 'topic',
    Q208238: 'organisation', Q129053: 'event', Q23731823: 'party',
    // The fixer's pass: kinds of party, the Virginia school, a protest, a ceasefire and a sanction.
    Q190219: 'party', Q208242: 'party', Q691730: 'party', Q2263934: 'party', Q3482308: 'idea', Q138511807: 'event', Q135068588: 'event', Q17373979: 'topic' };
  // Each must be in the lake: an entry a later build drops is named here, not passed over.
  for (const [q, type] of Object.entries(want)) { assert.ok(recs.has(q), `${q} is in the lake`); assert.equal(recs.get(q).type, type, `${q} ${recs.get(q).label}`); }
  // No treaty is a place.
  assert.deepEqual([...recs.values()].filter(r => r.type === 'place' && /\b(treaty|agreement|accords?|convention|protocol)\b/i.test(r.desc || '')).map(r => r.label), []);
});

// S0 (16 November 2026): no death precedes a birth. Each date is read at its precision (fp; Wikidata's own reading: a
// century 1500 is 1401–1500, a millennium 2000 is 1001–2000), so a born "1400" at century precision (Giorgio Scali, died
// 1382) is no fault. Binds on the data as committed; a fault the full build brings is fixed at its builder.
test('committed lake: no death precedes a birth, each date read at its precision', () => {
  // The years a value can mean at its precision (fp: 8 a decade, 7 a century, 6 a millennium; coarser: any year).
  const yearSpan = (v, p) => {
    const y = parseInt(String(v), 10);
    if (!Number.isFinite(y)) return null;
    if (p == null || p >= 9) return [y, y];
    if (p === 8) return [Math.floor(y / 10) * 10, Math.floor(y / 10) * 10 + 9];
    const size = p === 7 ? 100 : p === 6 ? 1000 : null;
    if (!size) return [-Infinity, Infinity];
    const n = Math.floor((Math.abs(y) - 1) / size) + 1;
    return y > 0 ? [(n - 1) * size + 1, n * size] : [-(n * size), -((n - 1) * size + 1)];
  };
  assert.deepEqual(yearSpan('1400', 7), [1301, 1400]);
  assert.deepEqual(yearSpan('-0500', 7), [-500, -401]);
  assert.deepEqual(yearSpan('1560', 8), [1560, 1569]);
  // A date as the span of days it can mean, [first, last], each [year, month, day]: a month or a day fills in what the
  // value gives (a year BC runs January to December too), so a death wholly before a birth is seen at a month's
  // precision as at a day's (the second reviewer, 17 November 2026, X5: born 1900-12, died 1900-01 passed).
  const daySpan = (v, p) => {
    const ys = yearSpan(v, p);
    if (!ys) return null;
    const m = String(v).match(/^-?\d+(?:-(\d\d))?(?:-(\d\d))?$/), mo = ys[0] === ys[1] && m?.[1] ? +m[1] : 0, dd = mo && m?.[2] ? +m[2] : 0;
    return [[ys[0], mo || 1, dd || 1], [ys[1], mo || 12, dd || 31]];
  };
  const before = (x, y) => x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] < y[2];
  const diesFirst = r => { const b = daySpan(r.facts.born, r.fp?.born), d = daySpan(r.facts.died, r.fp?.died); return !!(b && d && before(d[1], b[0])); };
  const rec = (born, died, fp) => ({ facts: { born, died }, ...(fp ? { fp } : {}) });
  assert.ok(diesFirst(rec('1900-12', '1900-01')), 'a month wholly before the month of birth');
  assert.ok(diesFirst(rec('1900-12-05', '1900-12-04')) && diesFirst(rec('1901', '1900-12-31')) && diesFirst(rec('-0300-05', '-0300-04-30')));
  assert.ok(!diesFirst(rec('1900-12', '1900-12-01')) && !diesFirst(rec('1900', '1900-01')) && !diesFirst(rec('1900-06-01', '1900-06')), 'the same month, or a year that holds it: no fault');
  assert.ok(!diesFirst(rec('1400', '1382-01-01', { born: 7 })), 'Giorgio Scali: a century read at its precision');
  const bad = [];
  let both = 0;
  for (const r of lakeRecords().values()) {
    if (!r.facts.born || !r.facts.died) continue;
    both++;
    if (diesFirst(r)) bad.push(`${r.q} ${r.label}: born ${r.facts.born}${r.fp?.born ? ` (p${r.fp.born})` : ''}, died ${r.facts.died}${r.fp?.died ? ` (p${r.fp.died})` : ''}`);
  }
  assert.ok(both > 1000, `records with both dates: ${both}`);
  assert.deepEqual(bad, []);
});
// The second reader (F2, 16 November 2026): Moses's preferred birth date is -2000 at millennium precision (6), and the
// tag read its year as "20th century BC", a century Wikidata does not give; 13 records had tags such as "660000th
// century BC" (the Chicxulub crater, Lucy). A date coarser than a century gives no Century tag.
test('dates: a Century tag only from a date at least as precise as a century', () => {
  const claim = (time, precision) => ({ rank: 'preferred', ...wd(time, precision) });
  assert.equal(centuryTag(claim('-2000-00-00T00:00:00Z', 6)), null, 'Moses: the 2nd millennium BC is no century');
  assert.equal(centuryTag(claim('-66000000-00-00T00:00:00Z', 3)), null, 'the Chicxulub crater');
  assert.equal(centuryTag(claim('+1500-00-00T00:00:00Z', 7)), 'Century:15th century');
  assert.equal(centuryTag(claim('-0356-07-20T00:00:00Z', 11)), 'Century:4th century BC');
  assert.equal(centuryTag(claim('+1901-05-02T00:00:00Z', 11)), 'Century:20th century');
  assert.equal(centuryTag(null), null);
});
test('committed lake: no Century tag comes from a date coarser than a century', t => {
  const fromCoarse = r => { const k = ['born', 'date', 'start', 'founded'].find(f => r.facts[f]); return k && (r.fp?.[k] ?? 9) < 7 && r.tags.some(x => x.startsWith('Century:')); };
  // Moses, made again by the Bibliotheca run of 16 November, binds now; every record from the next full build.
  assert.equal(fromCoarse(lakeRecords().get('Q9077')), false, 'Moses');
  if (!afterFullBuild(t)) return;
  assert.deepEqual([...lakeRecords().values()].filter(fromCoarse).map(r => `${r.q} ${r.label}`), []);
});
// Elections whose label year is more than a year from Wikidata's own date for them, each checked on Wikidata (16
// November 2026); they stay listed until Wikidata is corrected.
const ELECTION_DATES_WIKIDATA_HAS = {
  Q139761779: 'the 2026 Slovak referendum: Wikidata’s only P585 is the year 0202 (a typo)',
  Q15984054: 'the 1911 Croatian parliamentary election: Wikidata’s only P585 is 2015-12-17',
  Q17087354: 'the 1935 Salvadoran presidential election: Wikidata’s only P585 is 1939-01-15',
  Q16949505: 'the October 2013 Australian Labor Party leadership election: Wikidata’s only P585 is 2010-10-13',
  Q116998636: 'the Berlin 2030 climate referendum: its label names the target year; the vote was on 2023-03-26',
};
test('committed lake: an election’s label year is within a year of its date', t => {
  for (const why of Object.values(ELECTION_DATES_WIKIDATA_HAS)) assert.ok(why.length > 20);
  if (!afterFullBuild(t)) return;
  const bad = [];
  for (const r of lakeRecords().values()) {
    if (r.type !== 'election' || r.q in ELECTION_DATES_WIKIDATA_HAS || !r.facts.date || (r.fp?.date ?? 9) < 9) continue;
    const years = (r.label.match(/\b(1[89]\d\d|20\d\d)\b/g) || []).map(Number), y = yearIn(r.facts.date);
    if (years.length && !years.some(x => Math.abs(x - y) <= 1)) bad.push(`${r.q} ${r.label}: ${r.facts.date}`);
  }
  assert.deepEqual(bad, []);
});

// ---- Fix 3. No related name is a bare QID (sweep 3a): Donald Trump was "Q22686" in 54 Participants lists, where a
// label batch had come back with an error.
test('resolve: a batch that comes back with an error is split and asked again; a name falls back to the last build’s label', async () => {
  const asked = [], warned = [];
  const ids = Array.from({ length: 120 }, (_, i) => `Q${i + 1}`);
  ids.splice(77, 0, 'Q0');
  const got = await resolveFns.getBatched(ids, async batch => { asked.push(batch.length); return batch.includes('Q0') ? { error: { code: 'no-such-entity' } } : { entities: Object.fromEntries(batch.map(q => [q, { id: q, labels: { en: { value: `name of ${q}` } } }])) }; }, { warn: m => warned.push(m) });
  assert.deepEqual(Object.keys(got).sort(), ids.filter(q => q !== 'Q0').sort(), 'every other ID answered');
  assert.equal(warned.length, 1, 'the bad ID alone left out, with a warning');
  assert.match(warned[0], /Q0 \(no-such-entity\)/);
  assert.ok(Math.max(...asked) === 50, 'batches of fifty');
  await assert.rejects(resolveFns.getBatched(['Q1'], async () => { throw new Error('HTTP failure'); }), /HTTP failure/, 'a network failure is no bad ID: the build stops');
  assert.equal(resolveFns.nameOf('Q22686', { fetched: new Map(), committed: new Map([['Q22686', 'Donald Trump']]) }), 'Donald Trump');
  assert.equal(resolveFns.nameOf('Q22686', { fetched: new Map([['Q22686', 'Donald Trump']]) }), 'Donald Trump');
  assert.equal(resolveFns.nameOf('Q9', { fetched: new Map([['Q9', 'Q9']]) }), 'Q9', 'nothing else to say');
});
test('committed lake: no related name is a bare QID where that QID has a labelled entry', t => {
  if (!afterFullBuild(t)) return;
  const all = lakeRecords(), bad = [];
  for (const r of all.values()) for (const [rel, list] of Object.entries(r.rel || {})) for (const [q, l] of list) if (resolveFns.isQid(l) && all.get(q)?.label && !resolveFns.isQid(all.get(q).label)) bad.push(`${r.q} ${rel}: ${q}`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} bare QIDs`);
});

// ---- Fix 4. A summary is the article's own (sweep 4c, 5b): 88 were another article's (a redirect's target), 11 a
// disambiguation page's.
test('resolve: a summary is the article’s own: not a redirect’s target, not a disambiguation page', () => {
  assert.deepEqual(resolveFns.summaryFor({ title: 'First Phase Offensive', badges: ['Q70893996'] }, 'The Korean War was an armed conflict …'), { summary: '', ns: 'redirect' });
  assert.deepEqual(resolveFns.summaryFor({ title: 'Battle of Livno', badges: [] }, 'Battle of Livno is the name of several battles fought near Livno'), { summary: '', ns: 'disambiguation' });
  assert.deepEqual(resolveFns.summaryFor({ title: 'Ivar Lykke' }, 'Ivar Lykke may refer to:'), { summary: '', ns: 'disambiguation' });
  assert.deepEqual(resolveFns.summaryFor({ title: 'Hegel' }, 'Georg Wilhelm Friedrich Hegel was a German philosopher.'), { summary: 'Georg Wilhelm Friedrich Hegel was a German philosopher.' });
  const celsius = 'The degree Celsius is the unit of temperature on the Celsius scale. The degree Celsius can refer to a specific point on the scale.';
  assert.deepEqual(resolveFns.summaryFor({ title: 'Degree Celsius' }, celsius), { summary: celsius }, 'an article whose lead says a term “can refer to” one of its senses keeps its summary');
  assert.deepEqual(resolveFns.summaryFor({ title: 'X' }, undefined), { summary: '', ns: 'unfetched' });
  assert.deepEqual(resolveFns.summaryFor({ title: 'X' }, ''), { summary: '', ns: 'empty' });
  assert.deepEqual(resolveFns.summaryFor(undefined, 'text'), { summary: '' }, 'no article, no summary, nothing to explain');
  // Wikipedia's REST answer: another article's title (a redirect followed) or a disambiguation page is cached as none.
  assert.equal(resolveFns.restSummary({ type: 'standard', titles: { canonical: 'Korean_War', normalized: 'Korean War' }, extract: 'The Korean War …' }, 'First Phase Offensive'), '');
  assert.equal(resolveFns.restSummary({ type: 'disambiguation', titles: { canonical: 'David_Einhorn' }, extract: 'David Einhorn may refer to' }, 'David Einhorn'), '');
  assert.equal(resolveFns.restSummary({ type: 'standard', titles: { canonical: 'Pyrrhus_of_Epirus', normalized: 'Pyrrhus of Epirus' }, extract: 'Pyrrhus was …' }, 'Pyrrhus of Epirus'), 'Pyrrhus was …');
  assert.doesNotMatch(text('lake/scripts/build.mjs'), /\}\?redirect=true`/, 'no summary request follows a redirect to another article');
  // The second reader (F3): an "intentional sitelink to redirect" (Q70894304) often leads to an article on the same
  // subject (Sicily (island), the Persian Empire), so the page's note says only what is so: no article of its own.
  const note = constant('encyclopedia/index.html', 'NO_SUMMARY').redirect;
  assert.match(note, /no article of its own under this title/);
  assert.doesNotMatch(note, /would not be this entry/);
});
test('committed lake: no summary lists namesakes, and First Phase Offensive has none of the Korean War’s', t => {
  if (!afterFullBuild(t)) return;
  const all = lakeRecords();
  const bad = [...all.values()].filter(r => resolveFns.DISAMBIGUATION_TEXT.test(r.summary || '')).map(r => `${r.q} ${r.label}`);
  assert.deepEqual(bad, []);
  for (const q of ['Q15932430', 'Q906313', 'Q112034457', 'Q703203']) if (all.has(q)) assert.ok(!all.get(q).summary || all.get(q).ns !== 'redirect', q);
  assert.equal(all.get('Q15932430')?.summary || '', '', 'First Phase Offensive');
});

// ---- Fix 5. --only recounts only what its list can show (sweep 2b): 1,139 records made before `n` have a total over
// their places; a run of an adapter that names a place twice would have counted the rest twice.
test('recount: a record made without n whose total exceeds its places is refused by a run that cannot tell whose they are', () => {
  const old = { q: 'Q183297', label: 'İsmet İnönü', mentions: [{ m: 'retrospective', u: 'a' }, { m: 'neo-classic', u: 'b' }], total: 5 };
  const own = new Set(['retrospective']), mine = [{ module: 'retrospective', url: 'a' }, { module: 'retrospective', url: 'a' }];
  assert.throws(() => recount(old, own, mine, old.mentions, { adapters: new Set(['retrospective']) }), e => e.record === 'Q183297' && /İsmet İnönü: total 5 over 2 places and no n/.test(e.message));
  assert.equal(canRecount(old, new Set(['retrospective']), mine), false);
  // A run whose adapter gives each place once (Bibliotheca) can: the list shows its share in full.
  const book = [{ module: 'neo-classic', url: 'b' }];
  assert.equal(canRecount(old, new Set(['bibliotheca']), book), true);
  assert.equal(recount(old, new Set(['neo-classic']), book, old.mentions, { adapters: new Set(['bibliotheca']) }).total, 5);
  assert.equal(canRecount(old, new Set(['bibliotheca']), [...book, ...book]), false, 'unless it names a place twice itself');
  assert.equal(canRecount({ ...old, mentions: Array.from({ length: 300 }, (_, i) => ({ m: 'x', u: i })), total: 301 }, new Set(['bibliotheca']), book), false, 'nor at the 300-place cap');
  assert.equal(canRecount({ ...old, n: { retrospective: 4 } }, new Set(['retrospective']), mine), true, 'with n it can');
  assert.equal(canRecount({ ...old, total: 2 }, new Set(['retrospective']), mine), true, 'nor is a record without a shortfall refused');
  // The build passes its adapters, and collects the refusals before stopping (build.mjs onlyMerge).
  assert.match(text('lake/scripts/build.mjs'), /recount\(old, MODS, mine\(q\), ms, \{ adapters: ONLY \}\)/);
});
test('committed lake: every record whose total exceeds its places carries n', t => {
  if (!afterFullBuild(t)) return;
  const bad = [...lakeRecords().values()].filter(r => r.total > r.mentions.length && !r.n).map(r => `${r.q} ${r.label} ${r.total}/${r.mentions.length}`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} records`);
});

// ---- Fix 6. Every entity with an article has its summary, or says why not (sweep 5a): 91 had none, brought in by
// --only runs that fetched no summaries. --only now fetches them; the full build of 3 December fills the rest.
const WAR_FOCUS_WITHOUT_SUMMARY = ['Q116385387', 'Q24255637', 'Q23641762', 'Q25303279', 'Q24291590', 'Q25242026', 'Q24083372', 'Q25242046'];
test('committed lake: the War Focus battles brought in by --only have their summaries, or say why not', () => {
  assert.doesNotMatch(text('lake/scripts/build.mjs'), /const needSummary = ONLY \? \[\]/, '--only fetches the summaries it lacks');
  const all = lakeRecords(), bad = [];
  for (const q of WAR_FOCUS_WITHOUT_SUMMARY) { const r = all.get(q); if (r && r.wiki && !r.summary && !r.ns) bad.push(`${q} ${r.label}`); }
  assert.deepEqual(bad, []);
});
test('committed lake: every record with an article has its summary, or says why not (ns)', t => {
  if (!afterFullBuild(t)) return;
  const withArticle = [...lakeRecords().values()].filter(r => r.wiki), none = withArticle.filter(r => !r.summary);
  assert.deepEqual(none.filter(r => !['redirect', 'disambiguation', 'empty', 'unfetched'].includes(r.ns)).map(r => r.q).slice(0, 20), []);
  assert.ok(none.filter(r => r.ns === 'unfetched').length <= withArticle.length / 100, 'at most one in a hundred left for the next build to ask again');
});

// ---- Fix 7. Every Neo Book link opens a paragraph that marks the name (sweep 2a): four cast names the reader did not
// mark (the Prince's Caesar, Scipio, Maximinus, Julian) linked to paragraphs with no tag.
test('committed lake: every Neo Book link’s term is marked in the paragraph it opens', () => {
  const books = new Map(), bad = [];
  for (const r of lakeRecords().values()) for (const m of r.mentions) {
    if (m.m !== 'neo-classic') continue;
    const h = new URLSearchParams(new URL(m.u).hash.slice(1)), slug = h.get('book');
    if (!books.has(slug)) books.set(slug, read(`bibliotheca/data/books/${slug}.json`));
    const p = books.get(slug).chapters.find(c => c.n === +h.get('ch'))?.paragraphs.find(x => x.id === h.get('p'));
    if (!p?.terms?.some(t => t.qid === h.get('t'))) bad.push(`${r.q} ${r.label}: ${slug} ${h.get('p')}`);
  }
  assert.deepEqual(bad, []);
});

// ---- Fix 9. Names (sweep 3b to 3e).
test('names: a person’s shown name drops the realm after a regnal number or a comma title; the label stays for matching', () => {
  const shown = resolveFns.shownName;
  for (const [label, want] of [['Frederik X of Denmark', 'Frederik X'], ['Albert II, Prince of Monaco', 'Albert II'], ['Louis XII of France', 'Louis XII'],
    ['Guillaume V, Grand Duke of Luxembourg', 'Guillaume V'], ['Baudouin I of Belgium', 'Baudouin I'], ['Alexander I of Yugoslavia', 'Alexander I'],
    ['Catherine of Aragon', 'Catherine of Aragon'], ['John of Gaunt', 'John of Gaunt'], ['William Thomson, 1st Baron Kelvin', 'William Thomson, 1st Baron Kelvin'],
    ['Pope Alexander VI', 'Pope Alexander VI'], ['Ptolemy I Soter', 'Ptolemy I Soter']]) assert.equal(shown(label, 'person'), want, label);
  assert.equal(shown('Louis XII of France', 'place'), 'Louis XII of France', 'persons only');
  assert.equal(shown('Kingdom of France', 'place'), 'Kingdom of France');
});
// The second reader (F1, 16 November 2026): the short name made two entries one ("Albert II" for Q3910, Albert II,
// Prince of Monaco, and Q3911, Albert II of Belgium) and gave some eighteen kings a name Wikipedia keeps with its realm
// because it is ambiguous (Ferdinand II of Aragon, Charles VIII of France). The short name is shown only where it is the
// entry's Wikipedia title (Wikipedia has judged it plain: "Frederik X", "Louis XII"), or, with no article, where no
// other entry would be shown by it; the Wikipedia title stays among the names a search finds.
test('names: the short name only where it is Wikipedia’s own title, or no other entry’s; never two entries one name', () => {
  const shown = resolveFns.shownName;
  assert.equal(shown('Frederik X of Denmark', 'person', { title: 'Frederik X' }), 'Frederik X', 'Wikipedia’s title');
  assert.equal(shown('Louis XII of France', 'person', { title: 'Louis XII' }), 'Louis XII');
  assert.equal(shown('Ferdinand II of Aragon', 'person', { title: 'Ferdinand II of Aragon' }), 'Ferdinand II of Aragon', 'Wikipedia keeps the realm');
  assert.equal(shown('Albert II, Prince of Monaco', 'person', { title: 'Albert II, Prince of Monaco' }), 'Albert II, Prince of Monaco');
  assert.equal(shown('Rainier III, Prince of Monaco', 'person', { title: 'Rainier III of Monaco' }), 'Rainier III, Prince of Monaco');
  // No article: the short name, unless another entry would show the same (uniqueNames, after every record is made).
  const recs = new Map([
    ['Q3910', { q: 'Q3910', label: 'Albert II, Prince of Monaco', name: 'Albert II', type: 'person' }],
    ['Q3911', { q: 'Q3911', label: 'Albert II of Belgium', name: 'Albert II', type: 'person' }],
    ['Q7', { q: 'Q7', label: 'Zog I of Albania', name: 'Zog I', type: 'person' }],
    ['Q8', { q: 'Q8', label: 'Haakon VII of Norway', name: 'Haakon VII', type: 'person' }],
    ['Q9', { q: 'Q9', label: 'Haakon VII', type: 'ship' }],
  ]);
  assert.deepEqual(resolveFns.uniqueNames(recs).sort(), ['Q3910', 'Q3911', 'Q8']);
  assert.deepEqual([...recs.values()].map(r => r.name || r.label), ['Albert II, Prince of Monaco', 'Albert II of Belgium', 'Zog I', 'Haakon VII of Norway', 'Haakon VII']);
  // Wikipedia's title is kept as a name a search finds where it is neither the label nor the shown name.
  assert.deepEqual(resolveFns.titleAlias(['Rainier Louis Henri Maxence Bertrand Grimaldi'], { label: 'Rainier III, Prince of Monaco', title: 'Rainier III of Monaco', type: 'person' }), ['Rainier Louis Henri Maxence Bertrand Grimaldi', 'Rainier III of Monaco']);
  assert.deepEqual(resolveFns.titleAlias(['Frederik X of Denmark'], { label: 'Frederik X of Denmark', name: 'Frederik X', title: 'Frederik X', type: 'person' }), ['Frederik X of Denmark']);
  assert.deepEqual(resolveFns.titleAlias([], { label: 'Kingdom of France', title: 'Kingdom of France (987–1792)', type: 'place' }), [], 'persons only');
  assert.deepEqual(resolveFns.titleAlias(['R.Br.'], { label: 'Robert Brown', title: 'Robert Brown (botanist, born 1773)', type: 'person' }), ['R.Br.'], 'no bracketed title');
  assert.deepEqual(resolveFns.titleAlias([], { label: 'Nabis', title: 'Nabis of Sparta', type: 'person' }), ['Nabis of Sparta']);
  // The build applies both (build.mjs), and the page's "Also" line leaves out a name the heading already shows.
  assert.match(text('lake/scripts/build.mjs'), /uniqueNames\(records\)/);
  assert.match(text('encyclopedia/index.html'), /\.filter\(a => a !== shownAs\)/);
});
// Binds on the data as committed: every build, --only included, applies uniqueNames to all the records it writes.
test('committed lake: no two entries share a shown name the rule made', () => {
  const by = new Map();
  for (const r of lakeRecords().values()) for (const n of new Set([r.name || r.label])) (by.get(n) || by.set(n, []).get(n)).push(r);
  const bad = [...by.entries()].filter(([, rs]) => rs.length > 1 && rs.some(r => r.name)).map(([n, rs]) => `${n}: ${rs.map(r => r.q).join(', ')}`);
  assert.deepEqual(bad, []);
});
test('names: no English label falls back to the article’s title, the multilingual label, a module’s name, the last build’s, another language; never a QID while there is a name', () => {
  const label = resolveFns.entityLabel;
  assert.equal(label({ id: 'Q1', labels: { en: { value: 'English' }, mul: { value: 'Mul' } } }, { title: 'Title' }), 'English');
  assert.equal(label({ id: 'Q1', labels: { mul: { value: 'Frisinnade folkpartiet' } } }, { title: 'Liberal Party (Sweden)' }), 'Liberal Party (Sweden)', 'the article’s title before the multilingual label, as before');
  assert.equal(label({ id: 'Q4887122', labels: { mul: { value: 'Frisinnade folkpartiet' } } }), 'Frisinnade folkpartiet');
  assert.equal(label({ id: 'Q1', labels: {} }, { names: ['Q1', 'Party of the Nation'] }), 'Party of the Nation', 'a module’s name, never its QID');
  assert.equal(label({ id: 'Q12876078', labels: {} }, { names: ['Q12876078'], other: 'Κόμμα' }), 'Κόμμα');
  assert.equal(label({ id: 'Q9', labels: {} }), 'Q9');
  assert.equal(resolveFns.otherLabel({ el: { value: 'Κόμμα' }, de: { value: 'Partei' } }), 'Partei', 'a Latin-script language first');
});
test('names: a Retrospective event that opens with a QID names the leader, in the lake and the calendar alike', () => {
  const leaders = [{ name: 'Sunak', full: 'Rishi Sunak', start: '2022-10-25' }, { name: 'Truss', full: 'Liz Truss', start: '2022-09-06' }];
  assert.equal(resolveFns.leaderText('Q20055561 takes power', leaders, '2022-10-25'), 'Rishi Sunak takes power');
  assert.equal(resolveFns.leaderText('Q20055561 takes power', leaders, '1999-01-01'), 'Q20055561 takes power', 'no leader that day: as it was');
  assert.equal(resolveFns.leaderText('Sunak takes power', leaders, '2022-10-25'), 'Sunak takes power');
  assert.match(text('calendar/scripts/build-events.mjs'), /const text = leaderText\(e\.text, c\.leaders, e\.date\);/, 'the calendar builds its titles from it');
  // The Retrospective adapter, on the Retrospective's own data where it is checked out beside this repository.
  const retroDir = join(ROOT, '../hp-retrospective');
  if (!existsSync(join(retroDir, 'data/countries.json'))) return;
  return retrospective({ retroDir }).then(ms => {
    assert.deepEqual(ms.filter(m => /(^|: )Q[1-9]\d* /.test(m.context)).map(m => m.context), [], 'no context names a QID');
    // Until its full rebuild of 21 November 2026 the Retrospective's data held one party under a bare Wikidata ID
    // (Q12876078, a Greek party with neither an English name nor an English article, on Emmanouil Tsouderos), and
    // this test held its mention. The Retrospective's own rule since 17 November leaves such a party out
    // (hp-retrospective scripts/build-parties.mjs), and the rebuild applied it: no party link names a bare ID.
    assert.ok(ms.some(m => /^Party of /.test(m.context)), 'leaders’ parties have their mentions');
    assert.deepEqual(ms.filter(m => /^Party of /.test(m.context) && /^Q[1-9]\d*$/.test(m.label || '')).map(m => m.label), [], 'no party is named by a bare ID');
  });
});
test('committed lake: no label or shown name is a bare QID, and no shown person name ends in its realm', t => {
  if (!afterFullBuild(t)) return;
  const bad = [], names = new Set([...lakeRecords().values()].flatMap(r => [r.label, r.name].filter(Boolean)));
  for (const r of lakeRecords().values()) {
    if (resolveFns.isQid(r.name || r.label)) bad.push(`${r.q}: named ${r.name || r.label}`);
    // A realm stays where Wikipedia's own title keeps it, or the short name would be another entry's (F1 above).
    const short = resolveFns.shownName(r.label, r.type, { title: r.wiki });
    if (r.type === 'person' && !r.name && short !== r.label && !names.has(short)) bad.push(`${r.q}: shown as ${r.label}`);
    for (const m of r.mentions) if (/(^|: )Q[1-9]\d* /.test(m.c)) bad.push(`${r.q}: "${m.c}"`);
  }
  assert.deepEqual(bad, []);
});

// ---- Fix 10. What "Appears in Vitruvian Manager · N" counts (sweep 2c; Jude, 15 November 2026, BI-19 and MI-10): the
// places the entry appears in, a book being one; each line follows module, submodule, then the submodule's place, and
// a book's line says how many times and where the name occurs.
test('page: the header counts the places the card lists, under registry.json’s module and submodule names', () => {
  const src = text('encyclopedia/index.html');
  assert.match(src, /const places = e\.places \?\? e\.mentions\.length;/);
  assert.match(src, /<h3>Appears in Vitruvian Manager · \$\{places\.toLocaleString\('en-GB'\)\}<\/h3>/);
  const SUITE = constant('encyclopedia/index.html', 'MODULE_SUITE'), SUITE_NAME = constant('encyclopedia/index.html', 'SUITE_NAME'), PLACE = constant('encyclopedia/index.html', 'PLACE_NAME');
  const suites = new Map(registry.suites.map(s => [s.id, s.name])), problems = [];
  for (const [m] of declared) {
    if (PLACE[m] !== SUBMODULE.get(m)?.name) problems.push(`${m}: PLACE_NAME "${PLACE[m]}", registry.json "${SUBMODULE.get(m)?.name}"`);
    if (SUITE_NAME[SUITE[m]] !== suites.get(SUITE[m])) problems.push(`${m}: its module ${SUITE[m]} is "${SUITE_NAME[SUITE[m]]}", registry.json "${suites.get(SUITE[m])}"`);
  }
  assert.deepEqual(problems, []);
  // On the committed data: İsmet İnönü's total counts five mentions given at two places; his header says 2.
  const inonu = lakeRecords().get('Q183297');
  assert.equal(inonu.places ?? inonu.mentions.length, new Set(inonu.mentions.map(m => m.m + m.u)).size);
  // Kept beyond the 300-place cap only (build.mjs), and right where it is kept.
  for (const r of lakeRecords().values()) if (r.places !== undefined) assert.ok(r.mentions.length >= 300 && r.places > r.mentions.length, r.q);
});
test('committed lake: every book line says where in the book, its chapters’ times adding up to the line’s', () => {
  const bad = [];
  let lines = 0;
  for (const r of lakeRecords().values()) for (const m of r.mentions) {
    if (m.m !== 'neo-classic') continue;
    lines++;
    const times = +(m.c.match(/, (\d+) times?, as /) || [])[1];
    const sum = (m.w || []).reduce((s, w) => s + w[2], 0);
    if (!m.w?.length || sum !== times || !m.w.every(([ch, p, n]) => Number.isInteger(ch) && /^c\d{2,}-[a-z]\d+/.test(p) && n > 0)) bad.push(`${r.q} ${r.label}: "${m.c}" ${JSON.stringify(m.w)}`);
  }
  assert.ok(lines > 500, `${lines} book lines`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} lines`);
  // The Duchy of Milan: one place, The Prince, its chapters.
  const milan = lakeRecords().get('Q153529'), inPrince = milan.mentions.find(x => x.m === 'neo-classic' && x.u.includes('#book=the-prince&'));
  assert.ok(inPrince.w.length > 1 && inPrince.w.every(([ch, p]) => p.startsWith(`c${String(ch).padStart(2, '0')}-`)), JSON.stringify(inPrince.w));
});
// The War Focus rule in the lake (RV-05 A1): an event listed with its parts gives the figure War Focus shows for it.
test('committed lake: War Focus’s atomic bombings read as War Focus counts them, each death once', async t => {
  // A comparison of two builds (refresh pins, 27 November 2026): the lake's War Focus lines are rebuilt from War Focus's
  // files in the War Focus refresh, which throws them away and commits War Focus alone when that step fails; the lake
  // then describes the files before, and the deploy would fail on battles whose parts Wikidata has since changed. So the
  // lines are compared while the lake was built no earlier than War Focus (manifest.generated against index.generated),
  // which the refresh's own Master Index step always is. (manifest.generated is any lake run's stamp: an --only run of
  // another adapter after a failed War Focus lake step would bring the comparison back on stale lines; the scheduled
  // lake refresh is a full build, so it cannot.)
  const { readAfter } = await import('./tools/as-built.mjs');
  const lakeBuilt = read('lake/data/manifest.json').generated, focusBuilt = read('battlefield/focus/data/index.json').generated;
  if (!readAfter(lakeBuilt, focusBuilt)) { t.diagnostic(`the lake (${lakeBuilt}) was built before War Focus (${focusBuilt}): not compared`); return; }
  const all = lakeRecords(), at = (q, war) => all.get(q).mentions.find(m => m.m === 'war-focus' && m.u.includes(`#war=${war}`))?.c;
  // The lines expected, from War Focus's data by its own rule (figures.mjs), not written in (the second reader, WF2-08
  // and F4: an edit on Wikidata would otherwise stop the refresh), with a late count's year on its share alone (WF2-01).
  const ww2 = read('battlefield/focus/data/wars/ww2.json'), g = groupBattles(ww2.battles).byQ;
  // The line as War Focus shows it, with its kind (figureLine: review R3-01, never an estimate stated bare).
  for (const q of ['Q488', 'Q703203', 'Q4382340']) assert.equal(at(q, 'ww2'), `Part of World War II; ${figureLine(g.get(q))}`, q);
  assert.match(at('Q488', 'ww2'), /the sum of its parts' recorded figures, counted in \d{4} \(a late count, which can include later deaths\) · Recorded$/);
  // The Japan Campaign: the year goes with the share counted in it, never with the whole sum (Okinawa's is no 2013 count).
  const japan = g.get('Q709352');
  if (japan?.fig && japan.late.length && japan.late.reduce((s, [, v]) => s + v, 0) < japan.fig) {
    assert.equal(at('Q709352', 'ww2'), `Part of World War II; ${figureLine(japan)}`);
    assert.match(at('Q709352', 'ww2'), /; [\d,]+ of them counted in \d{4} \(a late count/);
  }
});

// The free-data rule (Jude, MP-11, 17 November 2026; built 20 November): the Correlates of War's terms bar commercial use
// and redistribution, so War Focus's nine wars before 1946 lost the COW totals they showed. Their Master Index line gives
// the battles alone, with no figure and no word of COW (the adapter's deathsOf gives '' for a war with no total), and
// cite-only.mjs lists nothing VM hosts from COW. Before 20 November the nine lines read "… battle deaths (the
// Correlates of War …)".
test('Master Index: War Focus’s wars before 1946 carry no battle-death figure and no war line names the Correlates of War', async () => {
  const { HOSTED } = await import('../integration/scripts/cite-only.mjs');
  assert.deepEqual(HOSTED, [], 'VM hosts nothing from a cite-only source');
  const focus = read('battlefield/focus/data/index.json');
  const early = focus.wars.filter(w => w.start < '1946');
  assert.ok(early.length >= 9 && early.some(w => w.id === 'ww2'), 'the wars before 1946');
  for (const w of focus.wars) assert.doesNotMatch(w.deathsSource || '', /Correlates of War|COW/, `${w.id}: ${w.deathsSource}`);
  for (const w of early) assert.equal(w.totalDeaths, null, `${w.id}: no total`);
  const { battlefield } = await import('../lake/scripts/adapters.mjs');
  // The war's own line (an undated battle's line opens the same address, so a war is found by its own Wikidata ID).
  const warQ = new Map(focus.wars.map(w => [w.id, w.qid]));
  const lines = new Map(battlefield({ jdpiDir: ROOT }).filter(m => m.module === 'war-focus' && !/&m=/.test(m.url) && m.key.qid === warQ.get(m.url.split('#war=')[1])).map(m => [m.url.split('#war=')[1], m.context]));
  for (const w of focus.wars) {
    const c = lines.get(w.id);
    assert.ok(c, `${w.id}: its line`);
    assert.doesNotMatch(c, /Correlates of War/, `${w.id}: ${c}`);
    if (w.totalDeaths == null) assert.match(c, /battles and operations$/, `${w.id}: the battles alone: ${c}`);
    else assert.ok(c.endsWith(`, ${w.totalDeaths.toLocaleString('en-GB')} battle deaths`), `${w.id}: ${c}`);
  }
});

// The committed lake carries the same lines once it is rebuilt (lake-refresh.yml, or
// VM_UA="VM build check (https://jdpi.pages.dev)" node lake/scripts/build.mjs --only battlefield).
test('Master Index: the committed lake names no Correlates of War total on a War Focus war line', () => {
  const all = lakeRecords(), focus = read('battlefield/focus/data/index.json');
  const bad = [];
  for (const w of focus.wars) {
    for (const m of all.get(w.qid)?.mentions.filter(m => m.m === 'war-focus' && m.u.endsWith(`#war=${w.id}`)) || []) {
      if (/Correlates of War/.test(m.c)) bad.push(`${w.id}: ${m.c}`);
    }
  }
  assert.deepEqual(bad, [], 'rebuild the lake: node lake/scripts/build.mjs --only battlefield');
});

/* ---------------------------------------------------------------- the page */
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
test('page: framed as in the shell, an entry opens its Kino, National Analysis and Volatility appearances there, and Volatility opens the entry', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch();
  t.after(() => browser.close()); // a failed assertion must not leave the browser open
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // In a frame the Master Index links through the shell, #/<suite>/<module>?at=<the place> in the top window, as it
  // does inside the shell; a plain page frames it here, so the test does not depend on the shell's own code.
  const entry = async q => {
    await page.setContent(`<iframe title="Master Index" src="${BASE}/encyclopedia/index.html#${q}" style="width:1250px;height:850px;border:0"></iframe>`);
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    await frame.waitForSelector('#entity .group .ment a', { timeout: 30000 });
    return frame.locator('#entity .group').evaluateAll(gs => Object.fromEntries(gs.map(g => [g.querySelector('h4').firstChild.textContent,
      [...g.querySelectorAll('.ment a')].map(a => ({ href: a.getAttribute('href'), target: a.target, text: a.textContent }))])));
  };
  const route = (suite, module, at) => `${BASE}/#/${suite}/${module}?at=${encodeURIComponent(`${BASE}/${at}`)}`;
  const ghana = await entry('Q117');
  assert.deepEqual(ghana['National Analysis']?.map(a => [a.href, a.target]), [[route('rt', 'pestle', 'q/national.html#country=GHA'), '_top']], JSON.stringify(ghana));
  assert.deepEqual(ghana['Geopolitical Volatility']?.map(a => a.href), [route('rt', 'volatility', 'q/volatility.html#country=GHA')]);
  // Each submodule under its module, by registry.json's names (MI-10): Kino's "Geopolitical Events" under "Kino".
  assert.deepEqual(ghana['Geopolitical Events']?.map(a => [a.href, a.text]),
    [[route('kino', 'kino-geopolitical-events', 'kino/index.html?cat=geopolitical-events#doc=end-of-empire-in-africa&s=legacy'), 'The End of Empire in Africa, 1951–1980']]);
  const borgia = await entry('Q187998');
  assert.deepEqual(borgia['Great Thinkers']?.map(a => a.href), [route('kino', 'kino-great-thinkers', 'kino/index.html?cat=great-thinkers#doc=niccolo-machiavelli&s=cesare-borgia')], JSON.stringify(borgia));
  assert.ok(borgia['Neo Book']?.length, 'and his Bibliotheca appearance (its reader, Neo Book) beside it');
  // Bibliotheca is a module of its own (November 2026): the book opens in its reader, Neo Book, there; so does each of
  // the chapters its line lists.
  for (const a of borgia['Neo Book']) assert.ok(a.href.startsWith(`${BASE}/#/bibliotheca/neo-classic?at=${encodeURIComponent(`${BASE}/bibliotheca/neo/index.html#book=`)}`), a.href);
  // And back: a Volatility country's Master Index button opens its entry (#Q117), not the Explorer.
  await page.goto(`${BASE}/q/volatility.html#country=GHA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const button = page.locator('#profile a', { hasText: 'Master Index' });
  await button.waitFor({ timeout: 20000 });
  assert.equal(await button.getAttribute('href'), `${BASE}/encyclopedia/index.html#Q117`);
  assert.deepEqual(errors, []);
});

// The review of 12 November 2026: a search for Machiavelli left facets with nothing in them on the page, and "PRP" in
// its text. A facet with no values under the other filters is left out (one with a value selected stays, to be
// cleared), and what a person reads says Vitruvian Manager or VM; file names, ids, classes and keys keep "prp".
test('page: facets with nothing in them are hidden, and the page says VM, never PRP', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/encyclopedia/index.html#explore`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#facets .facet', { timeout: 30000 });
  const facets = () => page.$$eval('#facets .facet > button', bs => bs.map(b => [b.dataset.toggle, b.querySelector('.n').textContent]));
  const all = await facets();
  await page.fill('#name', 'Machiavelli');
  await page.waitForFunction(() => /^[1-9]\d* entr/.test(document.querySelector('#count').textContent) && document.querySelectorAll('#rows tr').length < 20, null, { timeout: 10000 });
  const some = await facets();
  assert.ok(some.length && some.length < all.length, `fewer facets (${some.length} of ${all.length}) once the search narrows the entries`);
  for (const [f, n] of some) assert.ok(/^[1-9]/.test(n) || /selected/.test(n), `${f} is shown with ${n} values`);
  // Each facet left out has no value among the entries that match: the page's own rows and tags say so.
  const hidden = all.map(([f]) => f).filter(f => !some.some(([g]) => g === f));
  const empty = await page.evaluate(names => names.filter(f => rows.filter(r => matches(r)).every(r => r[6].every(t => tagFacet[t] !== f))), hidden);
  assert.deepEqual(empty, hidden);
  // What a person reads: the title, the description, the text and the sort's options.
  const text = await page.evaluate(() => [document.title, document.querySelector('meta[name=description]').content, document.body.innerText, [...document.querySelectorAll('option')].map(o => o.textContent).join(' ')].join(' '));
  assert.doesNotMatch(text, /\bPRP\b/);
  assert.match(text, /Most appearances in VM/);
  await page.goto(`${BASE}/encyclopedia/index.html#Q1399`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#entity .ehead h2', { timeout: 30000 });
  assert.match(await page.title(), / · Master Index · VM$/);
  assert.deepEqual(errors, []);
});

test('page: Alexander the Great’s facts read 356 BC and 323 BC, and the Duchy of Milan appears in The Prince', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const facts = async q => {
    await page.goto(`${BASE}/encyclopedia/index.html#${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#entity .ehead h2', { timeout: 30000 });
    return page.$$eval('#entity .facts dt', dts => Object.fromEntries(dts.map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
  };
  const alexander = await facts('Q8409');
  // Wikidata gives both dates in the Julian calendar, and since the full build of 18 November 2026 the record says so
  // (fcal; lake/scripts/dates.mjs, S0 of 16 November 2026, which names this birth).
  assert.equal(alexander.Born, '20 July 356 BC (Julian calendar)');
  assert.equal(alexander.Died, '10 June 323 BC (Julian calendar)');
  await facts('Q153529');
  const card = await page.$eval('#entity .card:has(.group, .note) h3', h => h.closest('.card').innerText);
  assert.doesNotMatch(card, /· 0\b|Not mentioned directly/, card);
  // Under its module (shown in capitals) and submodule, Neo Book (MI-10).
  assert.match(card, /BIBLIOTHECA\s+Neo Book[\s\S]*Named in The Prince \(Niccolò Machiavelli, 1532\), \d+ times, as Milan/, card);
  assert.deepEqual(errors, []);
});

// MI-10's fix 10 on the page: the header counts places (a book is one), each line reads module, submodule, then the
// submodule's place, and a book's line lists the chapters the name occurs in, each opening the book there.
test('page: the Duchy of Milan appears in one place, Bibliotheca · Neo Book · The Prince, with the chapters it is named in', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const card = async q => {
    await page.goto(`${BASE}/encyclopedia/index.html#${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#entity .ehead h2', { timeout: 30000 });
    return page.$eval('#entity .card:has(.group, .note) h3', h => {
      const c = h.closest('.card');
      return { head: h.textContent, suites: [...c.querySelectorAll('.suite')].map(s => [s.querySelector('.sname')?.textContent, [...s.querySelectorAll('.group h4')].map(x => x.firstChild.textContent)]),
        chapters: [...c.querySelectorAll('.inbook a')].map(a => [a.textContent, new URL(a.href).hash]) };
    });
  };
  const milan = await card('Q153529'), lake = read(`lake/data/e/${153529 % 512}.json`).Q153529;
  assert.equal(milan.head, `Appears in Vitruvian Manager · ${lake.mentions.length}`);
  assert.deepEqual(milan.suites.find(([s]) => s === 'Bibliotheca'), ['Bibliotheca', ['Neo Book']], JSON.stringify(milan.suites));
  const w = lake.mentions.find(m => m.m === 'neo-classic').w;
  assert.equal(milan.chapters.length, w.length, 'a link for each chapter it is named in');
  for (const [[label, hash], [ch, p, n, heading]] of milan.chapters.map((c, i) => [c, w[i]])) {
    assert.equal(label, `${heading || `Chapter ${ch}`}${n > 1 ? ` (${n})` : ''}`);
    assert.match(hash, new RegExp(`#book=the-prince&ch=${ch}&p=${p}&t=Q153529$`));
  }
  // İsmet İnönü: five mentions given at two places; the header counts the places.
  const inonu = await card('Q183297'), r = read(`lake/data/e/${183297 % 512}.json`).Q183297;
  assert.equal(inonu.head, `Appears in Vitruvian Manager · ${r.mentions.length}`);
  assert.ok(r.total > r.mentions.length, 'more mentions than places');
  assert.ok(inonu.suites.every(([s, subs]) => s && subs.length), JSON.stringify(inonu.suites));
  assert.deepEqual(errors, []);
});

// Month by Month's adapter (17 November 2026): every link it gives the Master Index opens the Marks tab at that mark.
test('page: each Month by Month mention opens its mark at the top of the Marks tab, on a wide screen and a phone', BASE ? pageTest : { skip: 'set JDPI_URL to test the page' }, async () => {
  const mentions = ADAPTERS.monthly({ jdpiDir: ROOT });
  const browser = await launch({ args: ['--mute-audio'] });
  const errors = [], bad = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', e => errors.push(e.message));
      for (const m of mentions) {
        const id = 'u-' + decodeURIComponent(m.url.split('unit=')[1]).replace(/[^a-z0-9-]/gi, '-');
        await page.goto('about:blank');
        await page.goto(m.url.replace(JDPI, `${BASE}/`), { waitUntil: 'domcontentloaded', timeout: 30000 });
        const top = await page.waitForSelector(`#${id}`, { timeout: 15000 }).then(() => page.waitForFunction(i => { const r = document.getElementById(i).getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight / 2 ? [r.top] : false; }, id, { timeout: 5000 })).then(h => h.jsonValue()).catch(() => null);
        // (The top comes back in a list: a mark that lands at exactly 0 pixels is at the top, and a bare 0 would read as "not yet".)
        if (top == null) bad.push(`${width}: ${m.label} (${id})`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(bad, [], 'not opened at its mark');
  assert.deepEqual(errors, []);
});

// The second review of 18 November 2026 (X2): the school's own entry carries its School value, also when it is in the
// lake only because a thinker's record relates to it.
test('schools: a school related to its thinker carries its own School value, and a namesake that is not related does not', async () => {
  const { schoolSelfTags } = await import('../lake/scripts/thinkers.mjs');
  const recs = new Map([
    ['Q1', { q: 'Q1', label: 'Robert Lucas', type: 'person', rel: { Movement: [['Q2', 'new classical macroeconomics']] }, tags: ['Type:Person', 'School:New classical macroeconomics'] }],
    ['Q2', { q: 'Q2', label: 'new classical macroeconomics', type: 'idea', rel: {}, tags: ['Type:Idea or school of thought'] }],
    ['Q3', { q: 'Q3', label: 'Hans Morgenthau', type: 'person', rel: { Movement: [['Q4', 'Realism']] }, tags: ['School:Realism'] }],
    ['Q4', { q: 'Q4', label: 'Realism', type: 'idea', rel: {}, tags: ['Type:Idea or school of thought', 'School:Realism'] }],
    ['Q5', { q: 'Q5', label: 'realism', type: 'idea', rel: {}, tags: ['Type:Idea or school of thought'] }],
    ['Q6', { q: 'Q6', label: 'New classical macroeconomics', type: 'topic', rel: {}, tags: [] }],
  ]);
  assert.deepEqual(schoolSelfTags(recs), ['Q2 new classical macroeconomics']);
  assert.deepEqual(recs.get('Q2').tags, ['Type:Idea or school of thought', 'School:New classical macroeconomics']);
  assert.deepEqual(recs.get('Q4').tags, ['Type:Idea or school of thought', 'School:Realism'], 'a value is given once');
  assert.deepEqual(recs.get('Q5').tags, ['Type:Idea or school of thought'], 'the painters\' realism is not the Realists\'');
  assert.deepEqual(recs.get('Q6').tags, [], 'ideas only');
  assert.deepEqual(schoolSelfTags(recs), [], 'a second pass gives nothing');
  assert.match(text('lake/scripts/build.mjs'), /schoolSelfTags\(records\)/);
  // The committed lake: every School value's related entry of the same name carries it.
  const all = new Map();
  for (let i = 0; i < lakeManifest.shards.entities; i++) for (const [q, r] of Object.entries(read(`lake/data/e/${i}.json`))) all.set(q, r);
  assert.ok(all.get('Q60238').tags.includes('School:New classical macroeconomics'), 'new classical macroeconomics');
  assert.deepEqual(schoolSelfTags(all), [], 'no school in the lake is left without its own value');
});

/* ---------------------------------------------------------------- VM's canon list (MI-12, steps F4 to F6 and F10) */
// lake/scripts/canon.mjs: the entries a reader of politics expects the Master Index to hold, from the references the
// canon review (VM-MASTER-INDEX-CANON-REVIEW.md) names, each read from Wikidata on 25 November 2026. The canon adapter
// reports them as the Master Index's own mentions (OWN_LIST above says why), and a tag it gives carries its reference.
const CANON_GROUPS = ['School', 'Ideology', 'Field', 'Theory', 'Event type', 'Conflict'];
const CANON_LISTS = ['ideas', 'schools', 'organisations', 'events', 'individuals'];
const CODE = new RegExp(`^(${Object.keys(CANON_REFS).map(c => c.replace('-', '\\-')).join('|')})\\b`);
test('canon: each item has its QID, its type, its references, and each tag its reference, in a group the lake has', async () => {
  const { TYPES, typeOf } = await import('../lake/scripts/types.mjs');
  const index = read('lake/data/index.json'), groups = new Set(index.tags.map(t => t.slice(0, t.indexOf(':'))));
  const bad = [], seen = new Set();
  for (const i of CANON) {
    const at = `${i.q} ${i.label}`;
    if (!QID.test(i.q) || seen.has(i.q)) bad.push(`${at}: a QID, once`);
    seen.add(i.q);
    if (!i.label || !TYPES.includes(i.type) || ![1, 2, null].includes(i.tier) || !CANON_LISTS.includes(i.list)) bad.push(`${at}: a label, a type, a tier and its list`);
    if (!i.refs.length || i.refs.some(c => !(c in CANON_REFS))) bad.push(`${at}: references by their codes (${i.refs})`);
    for (const [g, v, ref] of i.tags) {
      if (!CANON_GROUPS.includes(g) || !groups.has(g)) bad.push(`${at}: ${g} is a group the lake has, and no new one`);
      if (!v || /^\s|\s$/.test(v)) bad.push(`${at}: ${g} has a value`);
      if (!CODE.test(ref) || ref.length < 8) bad.push(`${at}: ${g}:${v} names its reference (${ref})`);
    }
    // Every item with no hand tag says why, a held one too (the second reader, 26 November 2026: eight held schools had
    // none, their School tag being the Learning courses').
    if (!i.tags.length && !(i.untagged?.length >= 20)) bad.push(`${at}: untagged, and says why`);
    if (i.held) { if ('aliases' in i) bad.push(`${at}: held, so the entry keeps its own names`); }
    else if (!Array.isArray(i.aliases) || new Set(i.aliases).size !== i.aliases.length || i.aliases.some(a => !a || a === i.label)) bad.push(`${at}: its reviewed names, each once, the label not among them`);
  }
  assert.deepEqual(bad, []);
  for (const [q, { type, why }] of Object.entries(CANON_TYPES)) {
    const i = CANON_BY_QID.get(q);
    assert.ok(i && !i.held && i.type === type && why.length >= 40, `CANON_TYPES ${q}: an item of the list, its type and why`);
    assert.equal(typeOf({ id: q, claims: {} }), type, `${q}: typeOf reads it first`);
  }
  for (const { q, label, why, read: day } of CANON_LABELS) assert.ok(CANON_BY_QID.get(q) && label && label !== CANON_BY_QID.get(q).label && why.length >= 40 && /^2026-11-2[5-9]$/.test(day), `CANON_LABELS ${q}`);
  assert.equal(canonNote('OPS, § Political theory'), 'VM’s canon list, from OPS, § Political theory');
});

test('canon adapter: one mention per item, by the Master Index, linked to its list, saying it is VM’s canon list, with each tag’s reference as its note', async () => {
  const { canon, CANON_URL, canonUrl } = await import('../lake/scripts/adapters.mjs');
  const mentions = await canon(), mod = SUBMODULE.get('encyclopedia');
  const memOnly = CANON.filter(i => i.refs.every(c => c === 'MEM'));
  // The review had these from its own memory alone, and no reference read names them: they are no mention (the page
  // names no source it cannot show). The four parties and the Muslim Brotherhood were "VA3, IGO" or "IGO" by the
  // review's blanket column until 26 November 2026, though neither page names them. All but the Muslim Brotherhood are
  // entries already, through other modules.
  assert.deepEqual(memOnly.map(i => i.label), ['Muslim Brotherhood', 'Communist Party of the Soviet Union', 'Chinese Communist Party', 'Nazi Party', 'National Fascist Party', 'Winston Churchill', 'Mikhail Gorbachev']);
  assert.deepEqual(memOnly.filter(i => !i.held).map(i => i.q), ['Q133207']);
  assert.equal(mentions.length, CANON.length - memOnly.length);
  assert.equal(new Set(mentions.map(m => m.key.qid)).size, mentions.length, 'one mention per item');
  for (const m of mentions) {
    const i = CANON_BY_QID.get(m.key.qid), refs = i.refs.filter(c => c !== 'MEM');
    assert.equal(m.module, 'encyclopedia');
    // The list, narrowed by the name filter to the item, so it is in the first rows (the list shows 100 of 239 at once).
    assert.equal(m.url, canonUrl(m.label));
    assert.ok(m.url.startsWith(`${CANON_URL}&name=`) && decodeURIComponent(m.url.split('&name=')[1]) === m.label, m.url);
    assert.ok(onOwnPage({ at: m.url }, mod.url, JDPI), m.url);
    assert.equal(m.context, `${canonContext(refs)}.`);
    assert.match(m.context, /^VM’s canon list, from the references named: /);
    for (const c of refs) assert.ok(m.context.includes(`${c} (${CANON_REFS[c]})`), `${i.label}: names ${c}`);
    assert.ok(!m.context.includes('MEM'), `${i.label}: no reference from memory`);
    assert.deepEqual(m.tags, i.tags.map(([g, v, ref]) => [g, v, { note: `VM’s canon list, from ${ref}` }]));
    assert.ok(!('aliases' in m), `${i.label}: the mention gives no names (build.mjs keeps the reviewed ones, or the entry’s own)`);
    const held = CANON_LABELS.find(x => x.q === i.q);
    assert.equal(m.label, held ? held.label : i.label);
  }
  assert.equal(decodeURIComponent(CANON_URL.split('q=')[1]), '"Appears in:Master Index"');
});

// The review's own items, pinned (the second reader, 26 November 2026: every canon test took its list from canon.mjs,
// so an item dropped from the file passed them all). Tier 1 is the review's tables C2 to C6, Tier 2 its B3 items made
// entries, and the rest the bodies of step F5. Dropping an item, or moving it between tiers, fails here.
const CANON_TIER1 = [
  'Q23', 'Q91', 'Q361', 'Q362', 'Q458', 'Q517', 'Q859', 'Q868', 'Q1001', 'Q1048', 'Q1065', 'Q2269', 'Q2487', 'Q2763',
  'Q3588', 'Q4604', 'Q6186', 'Q6199', 'Q6206', 'Q6216', 'Q6223', 'Q6229', 'Q6235', 'Q6527', 'Q6534', 'Q7159',
  'Q7164', 'Q7167', 'Q7169', 'Q7172', 'Q7174', 'Q7178', 'Q7184', 'Q7252', 'Q7260', 'Q7264', 'Q7272', 'Q7310',
  'Q7320', 'Q7768', 'Q7785', 'Q7795', 'Q7801', 'Q7804', 'Q7825', 'Q8016', 'Q8023', 'Q8409', 'Q8442', 'Q8458',
  'Q8663', 'Q8669', 'Q8676', 'Q8683', 'Q8698', 'Q8707', 'Q8729', 'Q8736', 'Q8740', 'Q9235', 'Q9294', 'Q9312',
  'Q9353', 'Q9387', 'Q9438', 'Q10806', 'Q10859', 'Q12562', 'Q15975', 'Q17427', 'Q19771', 'Q30487', 'Q34296',
  'Q37151', 'Q37470', 'Q37621', 'Q38130', 'Q41644', 'Q42008', 'Q42388', 'Q44918', 'Q46362', 'Q47488', 'Q51122',
  'Q60025', 'Q60224', 'Q60238', 'Q60571', 'Q76430', 'Q77148', 'Q78994', 'Q79854', 'Q79896', 'Q81299', 'Q83201',
  'Q83937', 'Q101638', 'Q121254', 'Q123759', 'Q126065', 'Q128135', 'Q128160', 'Q129053', 'Q133207', 'Q139596',
  'Q140694', 'Q142988', 'Q150995', 'Q154705', 'Q154959', 'Q159385', 'Q160590', 'Q161227', 'Q162527', 'Q162719',
  'Q163931', 'Q167651', 'Q178598', 'Q179848', 'Q179975', 'Q180490', 'Q185729', 'Q188181', 'Q188532', 'Q189280',
  'Q189746', 'Q192125', 'Q192139', 'Q192769', 'Q201712', 'Q203411', 'Q204886', 'Q209158', 'Q211930', 'Q230533',
  'Q243630', 'Q267932', 'Q271857', 'Q299938', 'Q373177', 'Q382861', 'Q471183', 'Q485207', 'Q494792', 'Q545449',
  'Q674530', 'Q689128', 'Q760037', 'Q794394', 'Q847001', 'Q847198', 'Q854537', 'Q877848', 'Q896666', 'Q936174',
  'Q1061896', 'Q1125082', 'Q1186378', 'Q1291690', 'Q1326430', 'Q1342733', 'Q1472670', 'Q1661415', 'Q1761068',
  'Q1761621', 'Q1764511', 'Q1783023', 'Q1822951', 'Q1949683', 'Q2745901', 'Q3054672', 'Q3092681', 'Q3268778',
  'Q5128352', 'Q5186732', 'Q5251484', 'Q6778656', 'Q6992186', 'Q7234129', 'Q15984000',
];
const CANON_TIER2 = [
  'Q4264', 'Q7779', 'Q7809', 'Q7817', 'Q8475', 'Q8908', 'Q41550', 'Q41984', 'Q42908', 'Q42970', 'Q43056', 'Q47543',
  'Q154640', 'Q159454', 'Q177859', 'Q183725', 'Q188592', 'Q191582', 'Q193235', 'Q193272', 'Q220945', 'Q277252',
  'Q318693', 'Q862603',
];
const CANON_F5 = [
  'Q4230', 'Q17495', 'Q25079', 'Q42262', 'Q128064', 'Q151991', 'Q170424', 'Q170481', 'Q188822', 'Q190008', 'Q191384',
  'Q205995', 'Q212712', 'Q233611', 'Q294278', 'Q340195', 'Q376150', 'Q380340', 'Q496967', 'Q605326', 'Q624307',
  'Q656801', 'Q663492', 'Q688638', 'Q703593', 'Q782942', 'Q789769', 'Q827525', 'Q842008', 'Q842490', 'Q899770',
  'Q939743', 'Q1043527', 'Q1125994', 'Q1137381', 'Q2029901', 'Q3369762', 'Q3772571', 'Q4783148', 'Q5611262',
  'Q7248622', 'Q7886981',
];
const byNumber = (a, b) => a.slice(1) - b.slice(1);
test('canon: the list holds every item of the review, in its tier: 180 of Tier 1, 24 of Tier 2 and 42 bodies of F5', () => {
  assert.deepEqual([CANON_TIER1.length, CANON_TIER2.length, CANON_F5.length], [180, 24, 42]);
  assert.equal(CANON.length, 246);
  for (const [tier, list] of [[1, CANON_TIER1], [2, CANON_TIER2], [null, CANON_F5]]) {
    assert.deepEqual(CANON.filter(i => i.tier === tier).map(i => i.q).sort(byNumber), list, `tier ${tier}`);
    if (tier === null) assert.ok(list.every(q => CANON_BY_QID.get(q).refs.includes('F5')), 'an F5 body names F5');
  }
});

// The references whose pages were read again on 26 November 2026 (Wikipedia's Vital articles level 3 and level 4
// History, its List of intergovernmental organizations and English school article, and the SEP), and the items each
// names: a code stands beside an item only where its page names it. The review's blanket columns ("VA3,VA4H",
// "VA3,IGO", "VA3,SEP") had given VA3 to 56 items it does not list, IGO to the parties and to bodies the list does not
// hold, and ES and SEP to items neither names (the second reader). A code added to an item must be read first and
// added here.
const CANON_NAMED_BY = {
  VA3: ['Q23', 'Q91', 'Q361', 'Q362', 'Q458', 'Q517', 'Q859', 'Q868', 'Q1001', 'Q1048', 'Q1065', 'Q2269', 'Q4604',
    'Q6186', 'Q6199', 'Q6206', 'Q6216', 'Q6223', 'Q6229', 'Q6235', 'Q6534', 'Q7167', 'Q7169', 'Q7174', 'Q7178', 'Q7260',
    'Q7272', 'Q8023', 'Q8409', 'Q8683', 'Q8698', 'Q9294', 'Q9312', 'Q9353', 'Q12562', 'Q101638', 'Q179848', 'Q192769',
    'Q230533'],
  VA4H: ['Q361', 'Q362', 'Q2269', 'Q2487', 'Q2763', 'Q3588', 'Q6534', 'Q8663', 'Q8669', 'Q8676', 'Q8683', 'Q8698',
    'Q8707', 'Q8729', 'Q8736', 'Q8740', 'Q10806', 'Q10859', 'Q12562', 'Q46362', 'Q51122', 'Q78994', 'Q126065', 'Q128160',
    'Q129053', 'Q150995', 'Q154705', 'Q161227', 'Q179848', 'Q179975', 'Q185729', 'Q192769', 'Q230533', 'Q382861',
    'Q545449', 'Q689128', 'Q896666'],
  IGO: ['Q458', 'Q1065', 'Q4230', 'Q4264', 'Q7159', 'Q7164', 'Q7172', 'Q7184', 'Q7768', 'Q7779', 'Q7785', 'Q7795',
    'Q7801', 'Q7804', 'Q7809', 'Q7817', 'Q7825', 'Q8475', 'Q8908', 'Q17495', 'Q19771', 'Q37470', 'Q38130', 'Q41550',
    'Q41644', 'Q41984', 'Q42262', 'Q47488', 'Q47543', 'Q81299', 'Q83201', 'Q123759', 'Q151991', 'Q159454', 'Q170424',
    'Q170481', 'Q183725', 'Q188532', 'Q188592', 'Q188822', 'Q190008', 'Q191384', 'Q191582', 'Q193235', 'Q193272',
    'Q205995', 'Q233611', 'Q243630', 'Q277252', 'Q294278', 'Q318693', 'Q340195', 'Q376150', 'Q380340', 'Q485207',
    'Q496967', 'Q605326', 'Q656801', 'Q663492', 'Q782942', 'Q789769', 'Q827525', 'Q842490', 'Q899770', 'Q1043527',
    'Q1764511', 'Q3772571'],
  ES: ['Q9312', 'Q154959', 'Q188181', 'Q1342733', 'Q1783023', 'Q7234129'],
  SEP: ['Q859', 'Q868', 'Q1048', 'Q4604', 'Q6199', 'Q6206', 'Q6527', 'Q7167', 'Q8409', 'Q8458', 'Q9235', 'Q9312',
    'Q9353', 'Q9387', 'Q9438', 'Q15975', 'Q37621', 'Q42008', 'Q44918', 'Q60025', 'Q77148', 'Q79896', 'Q101638',
    'Q140694', 'Q154959', 'Q160590', 'Q178598', 'Q192125', 'Q204886', 'Q847198', 'Q877848', 'Q1326430'],
};
test('canon: a reference read again names each item that cites it, and no other', () => {
  for (const [code, list] of Object.entries(CANON_NAMED_BY)) assert.deepEqual(CANON.filter(i => i.refs.includes(code)).map(i => i.q).sort(byNumber), list, code);
  // The context the page shows names those references alone (Tocqueville's was "VA3 …; SEP …", neither naming him).
  assert.equal(canonContext(CANON_BY_QID.get('Q140694').refs), 'VM’s canon list, from the references named: SEP (Stanford Encyclopedia of Philosophy)');
  assert.deepEqual(CANON_BY_QID.get('Q188532').refs, ['IGO', 'MEM'], 'Bretton Woods: IGO names it in a "See also"; VA3 and VA4H do not');
});

test('aliases: an item of the canon list keeps its reviewed names instead of Wikidata’s; every other record as before', () => {
  assert.deepEqual(recordAliases(['CP', 'Party', 'L'], 'L', ['Duke'], ['Reviewed name', 'Reviewed name', 'L', 'Other,']), ['Reviewed name', 'Other', 'Duke']);
  assert.deepEqual(recordAliases(['CP', 'Party', 'L'], 'L', ['Duke'], []), ['Duke'], 'an empty reviewed list keeps no Wikidata name');
  assert.deepEqual(recordAliases(['CP', 'Party', 'L'], 'L', ['Duke']), ['CP', 'Party', 'Duke']);
  assert.match(text('lake/scripts/build.mjs'), /recordAliases\([^\n]*CANON_BY_QID\.get\(q\)\?\.aliases\)/);
});

test('index rows: a description longer than 80 characters is cut at a word and ends "…"', () => {
  const { shortDesc } = resolveFns;
  const saakashvili = 'Georgian and Ukrainian politician, third President of Georgia (2004–2013) and Governor of Odesa Oblast (2015–2016)';
  assert.equal(shortDesc(saakashvili, 80), 'Georgian and Ukrainian politician, third President of Georgia (2004–2013) and…');
  assert.equal(shortDesc('A short one', 80), 'A short one');
  assert.equal(shortDesc('x'.repeat(80), 80), 'x'.repeat(80), 'exactly the limit stays whole');
  assert.equal(shortDesc('x'.repeat(90), 80), 'x'.repeat(79) + '…', 'one long word is cut at the limit');
  assert.equal(shortDesc('a'.repeat(70) + ', b ' + 'c'.repeat(20), 80), 'a'.repeat(70) + ', b…');
  assert.equal(shortDesc('a'.repeat(76) + ', bcdefgh', 80), 'a'.repeat(76) + '…', 'the cut’s trailing comma goes');
  for (const s of [saakashvili, 'y '.repeat(60), 'z'.repeat(200)]) assert.ok(shortDesc(s, 80).length <= 80);
  // The second reader (26 November 2026): a description that fits is left as it is, a no-break space or a double one
  // too (fifteen rows had theirs rewritten); a long first word is not cut inside a surrogate pair; and an opening
  // bracket or quote at the cut goes with the punctuation.
  assert.equal(shortDesc('Minister of State', 80), 'Minister of State');
  assert.equal(shortDesc('one  two', 80), 'one  two');
  assert.equal(shortDesc('a'.repeat(78) + '\u{1D400}\u{1D400}bbbb', 80), 'a'.repeat(78) + '…', 'no lone surrogate');
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(shortDesc('a'.repeat(77) + '\u{1D400}'.repeat(5), 80)));
  for (const open of ['(', '[', '{', '“', '‘', '«']) assert.equal(shortDesc('a'.repeat(78) + open + 'b'.repeat(10), 80), 'a'.repeat(78) + '…', `"${open}" at the cut goes`);
  assert.equal(shortDesc('a'.repeat(70) + ' "said" ' + 'c'.repeat(20), 80), 'a'.repeat(70) + ' "said"…', 'a closing straight quote stays');
  assert.match(text('lake/scripts/build.mjs'), /index\.push\(\[q, r\.name \|\| r\.label, r\.type, shortDesc\(r\.desc, 80\)/);
});

// Each row's description is what shortDesc makes of its record's (the second reader: the earlier test let any prefix
// that ended "…" pass, a cut mid-word among them), and none ends inside a word.
test('committed lake: no index row’s description stops mid-word', () => {
  const { shortDesc } = resolveFns;
  const recs = lakeRecords(), bad = [];
  for (const r of read('lake/data/index.json').rows) {
    const full = String(recs.get(r[0])?.desc ?? '');
    const flat = full.replace(/\s+/g, ' ').trim(), kept = r[3].endsWith('…') ? r[3].slice(0, -1) : null;
    if (r[3] !== shortDesc(full, 80) || (kept !== null && /\S/.test(flat[kept.length] ?? ' ') && !/[\s,;:.\-–—(\[{“‘«]/.test(flat[kept.length]) && kept.includes(' '))) bad.push(`${r[0]} ${r[1]}: ${r[3]}`);
    if (bad.length > 10) break;
  }
  assert.deepEqual(bad, []);
});

// F10. Every Tier 1 item has its entry and its type, carries each tag the list gives it with its reference as the note,
// and has at least one tag of its school, its kind, its parent or its event type: School (its school); Ideology, Field,
// Theory or Movement (what kind of idea it is, or what a body or a person works in); Member of or Conflict (the body or
// the war it is part of); Event type. The exceptions are the items no reference read gives such a tag and Wikidata gives
// none either: each is named here, and canon.mjs says why (its `untagged`).
const KIND_GROUPS = ['School', 'Ideology', 'Field', 'Theory', 'Movement', 'Member of', 'Conflict', 'Event type'];
const CANON_UNTAGGED = {
  Q7167: 'colonialism', Q44918: 'rule of law', Q79896: 'separation of powers', Q1472670: 'new world order',
  Q6216: 'liberalism', Q7169: 'conservatism', Q7272: 'socialism', Q6186: 'communism',
  Q6199: 'anarchism', Q6223: 'fascism', Q6206: 'capitalism', Q6229: 'authoritarianism',
  Q180490: 'populism', Q7264: 'Marxism', Q209158: 'Christian democracy', Q7310: 'Nazism',
  Q1661415: 'green politics', Q7260: 'imperialism', Q7174: 'democracy', Q204886: 'federalism',
  Q847198: 'just war theory', Q760037: 'counter-insurgency', Q7768: 'ASEAN', Q123759: 'Organization of American States',
  Q485207: 'Shanghai Cooperation Organisation', Q243630: 'BRICS', Q7795: 'Organization of the Petroleum Exporting Countries', Q7785: 'Commonwealth of Nations',
  Q1764511: 'G7', Q19771: 'G20', Q37470: 'United Nations Security Council', Q41644: 'Warsaw Pact',
  Q7801: 'International Court of Justice', Q81299: 'Organization for Security and Co-operation in Europe', Q83201: 'Non-Aligned Movement', Q12562: 'Protestant Reformation',
  Q150995: 'Peace of Westphalia', Q192769: 'American Revolution', Q689128: 'Haitian Revolution', Q2269: 'Industrial Revolution',
  Q46362: 'Congress of Vienna', Q3588: 'European Revolutions of 1848', Q154705: 'unification of Germany', Q51122: 'Unification of Italy',
  Q8707: 'Meiji Restoration', Q179848: 'Scramble for Africa', Q8698: 'Great Depression', Q230533: 'decolonization',
  Q126065: 'Iranian Revolution', Q10806: 'September 11 attacks', Q188532: 'Bretton Woods system', Q6534: 'French Revolution',
  Q8729: 'Russian Revolution', Q129053: 'partition of India', Q8683: 'Cold War', Q382861: 'Revolutions of 1989',
};
const CANON_NO_ENTRY = { Q133207: 'Muslim Brotherhood' };
test('canon: an item with no entry is one whose only reference is the review’s memory, and says so', () => {
  for (const [q, label] of Object.entries(CANON_NO_ENTRY)) {
    const i = CANON_BY_QID.get(q);
    assert.ok(i.label === label && !i.held && i.refs.every(c => c === 'MEM') && /no entry/.test(i.untagged), q);
  }
});
test('committed lake: every Tier 1 item of the canon list has its entry, its type and a tag of its kind, or is named untagged with its reason (F10)', () => {
  const recs = lakeRecords(), index = read('lake/data/index.json'), rows = new Set(index.rows.map(r => r[0])), bad = [], untagged = {};
  for (const i of CANON) {
    const r = recs.get(i.q), at = `${i.q} ${i.label}`;
    // An item new to the lake whose only reference is the review's memory gives no mention, so it has an entry only
    // when a module mentions it: the Muslim Brotherhood alone, which no reference read names (canon.mjs says so).
    if (CANON_NO_ENTRY[i.q]) { if (r || rows.has(i.q)) bad.push(`${at}: an entry now; take it out of CANON_NO_ENTRY`); continue; }
    if (!r || !rows.has(i.q)) { bad.push(`${at}: no entry`); continue; }
    if (i.refs.some(c => c !== 'MEM') && !(r.tags.includes('Appears in:Master Index') && r.mentions.some(m => m.m === 'encyclopedia'))) bad.push(`${at}: appears in the Master Index’s own list`);
    if (i.tier !== 1) continue;
    if (r.type !== i.type) bad.push(`${at}: ${r.type}, not ${i.type}`);
    for (const [g, v, ref] of i.tags) if (!r.tags.includes(`${g}:${v}`) || r.tn?.[`${g}:${v}`] !== canonNote(ref)) bad.push(`${at}: ${g}:${v}, with its reference`);
    if (!r.tags.some(t => KIND_GROUPS.includes(t.slice(0, t.indexOf(':'))))) untagged[i.q] = r.name || r.label;
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(untagged, CANON_UNTAGGED, 'the untagged Tier 1 items, each named in CANON_UNTAGGED');
  for (const q of Object.keys(CANON_UNTAGGED)) assert.ok(CANON_BY_QID.get(q).untagged?.length >= 20, `${q}: canon.mjs says why it is untagged`);
  assert.ok(read('lake/data/manifest.json').modules.encyclopedia > 0, 'the manifest counts the list');
});

test('committed lake: every body the canon list holds for a "Member of" tag is an entry, so the tag links to it (F5)', () => {
  const rows = new Set(read('lake/data/index.json').rows.map(r => r[0]));
  assert.deepEqual(CANON.filter(i => i.list === 'organisations' && !rows.has(i.q) && !CANON_NO_ENTRY[i.q]).map(i => `${i.q} ${i.label}`), []);
  // The page links a related entry where the index holds it (encyclopedia/index.html, byQid).
  assert.match(text('encyclopedia/index.html'), /byQid\.has\(/);
});

// Names the lake holds although Wikidata has moved them to its multilingual aliases, which the lake does not read
// (build.mjs ALIAS_HOLD; the second reader, 26 November 2026: Linnaeus lost all six names at the --only bibliotheca
// recount, and the Origin "The Origin of Species", so the Master Index's name search no longer found "Linnæus").
// And a held label keeps the general concept's name out of a canon item's names (Q7234129 is postcolonial IR, not
// postcolonialism, Q265425).
test('committed lake: names held against Wikidata’s move to multilingual aliases, and a canon label held apart from the concept’s', () => {
  const recs = lakeRecords();
  assert.match(text('lake/scripts/build.mjs'), /recordAliases\([^\n]*aliasHold\.get\(q\)/);
  for (const n of ['Carolo Linnaeo', 'Carl von Linnaeus', 'Carl Linnæus', 'Carolus a Linné', 'Karl von Linné', 'Linnæus']) assert.ok(recs.get('Q1043').aliases.includes(n), `Linnaeus: ${n}`);
  assert.ok(recs.get('Q20124').aliases.includes('The Origin of Species'));
  const pc = recs.get('Q7234129');
  assert.equal(pc.label, 'Postcolonial international relations');
  assert.ok(![pc.label, pc.name, ...pc.aliases].some(n => /^postcolonialism$/i.test(n || '')), 'not "Postcolonialism"');
  // Two names a book or a reader uses that the list had left out.
  assert.ok(recs.get('Q1761621').aliases.includes('sea power'));
  assert.ok(recs.get('Q7184').aliases.includes('North Atlantic Treaty Organization'));
});
