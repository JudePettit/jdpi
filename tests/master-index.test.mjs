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
  encyclopedia: 'the Master Index itself: it reads the lake that every other submodule feeds',
  briefing: STORIES, 'econ-briefing': STORIES, 'science-briefing': STORIES, 'digital-briefing': STORIES, headlines: STORIES,
  highbrowse: 'a view of the four briefings’ stories (exempt above): its stories, topics and search are theirs, with no entities of its own',
  atlas: 'another repository (political-atlas), whose leaders, parties and countries have no Wikidata IDs yet: its adapter, by Wikipedia title, is queued',
  markets: 'another repository (trade-desk): its tickers become company items (Wikidata P414 and P249) later',
  osint: 'a workbench of search tools and a case notebook, with few names of its own',
  sigint: 'live signals (aircraft, ships, satellites, the spectrum), with few names of its own',
  geoint: 'satellite imagery, maps and measuring tools, with few names of its own',
  'osint-training': 'courses in tradecraft, which name few entities; the Learning adapter reads only the Finance, Economics and Politics courses',
  'data-analytics': 'a tool over the other submodules’ datasets, with no entities of its own',
  'integration-hub': 'a catalogue and API of the other submodules’ datasets (the Master Index’s among them), with no entities of its own',
  // Month by Month (15 November 2026): its wars and countries are Realtime Battlefield's, War Focus's and National
  // Analysis's, already in the Master Index through their adapters, and each of its names carries that link (data-qid or
  // its Wikipedia link). An adapter of its own needs a lake build with the network (lake-refresh.yml, the 3rd).
  monthly: 'marks on the wars and countries of Realtime Battlefield, War Focus and National Analysis, whose adapters already put them in the Master Index; its names link there',
  'iot-connect': 'Controls the user’s own devices through the local bridge; names no people, places or events',
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
    if (!(manifest.modules?.[m] > 0) || !index.modules?.[m]) problems.push(`${m}: not in the committed lake; run node lake/scripts/build.mjs --only ${adapter}`);
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
test('committed lake, after the full build: Alexander the Great\'s birth is in the Julian calendar, and every disputed date differs', t => {
  if (!afterFullBuild(t)) return;
  assert.ok((lakeRecords().get('Q8409')?.fcal || []).includes('born'), 'Alexander the Great: born in the Julian calendar (Wikidata, read 16 November 2026)');
  for (const r of lakeRecords().values()) {
    for (const f of r.fcal || []) assert.ok(r.facts[f], `${r.q}: fcal ${f} is a fact`);
    for (const [f, alts] of Object.entries(r.fd || {})) { assert.ok(r.facts[f] && alts.length, `${r.q}: fd ${f}`); for (const [v] of alts) assert.notEqual(v, r.facts[f], `${r.q} ${f}`); }
  }
});

// S0 (16 November 2026): Sparta (Q5690) was typed a topic: Wikidata makes it a polis (Q148837) and an ancient city
// (Q15661340), neither among the place types, and it has no capital (P36). The type rules live in lake/scripts/types.mjs.
test('types: a polis or an ancient city is a place (Sparta)', async () => {
  const { typeOf, PLACE } = await import('../lake/scripts/types.mjs');
  const e = (label, p31, more = {}) => ({ labels: { en: { value: label } }, claims: { P31: p31.map(id => ({ mainsnak: { datavalue: { value: { id } } } })), ...more } });
  assert.equal(typeOf(e('Sparta', ['Q15661340', 'Q148837', 'Q93342462'])), 'place');
  assert.equal(typeOf(e('Athens', ['Q148837'])), 'place');
  assert.ok(PLACE.has('Q6256') && PLACE.has('Q148837') && PLACE.has('Q15661340'));
  // The rest as before: a person, an election, a war by its label, a party, an idea, a country, an event, a topic.
  assert.equal(typeOf(e('Niccolò Machiavelli', ['Q5'])), 'person');
  assert.equal(typeOf(e('2026 South Sudanese general election', ['Q40231'])), 'election');
  assert.equal(typeOf(e('Peloponnesian War', ['Q180684'])), 'conflict');
  assert.equal(typeOf(e('Italy', ['Q6256'])), 'place');
  assert.equal(typeOf(e('Something', [], { P585: [{}] })), 'event');
  assert.equal(typeOf(e('Something', [])), 'topic');
  assert.match(text('lake/scripts/build.mjs'), /import \{ typeOf \} from '\.\/types\.mjs';/);
});
test('committed lake, after the full build: Sparta is a place', t => {
  if (!afterFullBuild(t)) return;
  assert.equal(lakeRecords().get('Q5690')?.type, 'place');
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
  const bad = [], day = /^-?\d+-\d\d-\d\d$/;
  let both = 0;
  for (const r of lakeRecords().values()) {
    if (!r.facts.born || !r.facts.died) continue;
    both++;
    const b = yearSpan(r.facts.born, r.fp?.born), d = yearSpan(r.facts.died, r.fp?.died);
    if (!b || !d) continue;
    const said = `${r.q} ${r.label}: born ${r.facts.born}${r.fp?.born ? ` (p${r.fp.born})` : ''}, died ${r.facts.died}${r.fp?.died ? ` (p${r.fp.died})` : ''}`;
    if (b[0] > d[1]) bad.push(said);
    // In one year, two full dates in order (a year BC runs January to December too).
    else if (b[1] === b[0] && d[1] === d[0] && b[0] === d[0] && day.test(r.facts.born) && day.test(r.facts.died) && r.facts.born.slice(-5) > r.facts.died.slice(-5)) bad.push(said);
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
    // A party the Retrospective links to Wikidata (no English article) is keyed by that ID, so it has its mention.
    assert.ok(ms.some(m => m.key.qid === 'Q12876078' && /^Party of /.test(m.context)), 'the Greek party named Q12876078 there');
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
test('committed lake: War Focus’s atomic bombings read as War Focus counts them, each death once', () => {
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

// S0, the second reader (16 November 2026): War Focus's wars whose deaths are a Correlates of War total read in the
// Master Index as "… 16,634,907 battle deaths" with no word whose figure it is, where COW's terms keep only a cited
// total (integration/scripts/cite-only.mjs). The line names the Correlates of War and the citation its terms ask for;
// the line opens War Focus, whose panel and Sources give the citation with the link. The adapter writes it, and the
// committed lake carries it (warfocus-refresh's --only battlefield and the monthly full build write the same).
test('Master Index: a War Focus war whose deaths are a Correlates of War total names the source and its citation', async () => {
  const { CITE_ONLY, HOSTED } = await import('../integration/scripts/cite-only.mjs');
  const cow = CITE_ONLY.cow, focus = read('battlefield/focus/data/index.json');
  assert.ok(cow.short && cow.citation.includes('Sarkees') && cow.short.includes('Resort to War'), 'a short form of the citation');
  const cowWars = focus.wars.filter(w => cow.match.test(w.deathsSource || ''));
  assert.ok(cowWars.length >= 9 && cowWars.some(w => w.id === 'ww2'), 'the COW wars are found by their deathsSource');
  const { battlefield } = await import('../lake/scripts/adapters.mjs');
  // The war's own line (an undated battle's line opens the same address, so a war is found by its own Wikidata ID).
  const warQ = new Map(focus.wars.map(w => [w.id, w.qid]));
  const lines = new Map(battlefield({ jdpiDir: ROOT }).filter(m => m.module === 'war-focus' && !/&m=/.test(m.url) && m.key.qid === warQ.get(m.url.split('#war=')[1])).map(m => [m.url.split('#war=')[1], m.context]));
  for (const w of focus.wars) {
    const c = lines.get(w.id);
    assert.ok(c, `${w.id}: its line`);
    if (cowWars.includes(w)) assert.ok(c.includes(`${w.totalDeaths.toLocaleString('en-GB')} battle deaths`) && c.includes('Correlates of War') && c.includes(cow.short), `${w.id}: ${c}`);
    else assert.doesNotMatch(c, /Correlates of War/, `${w.id}: only a COW total names COW`);
  }
  // The committed lake: every War Focus war line with a COW total.
  const all = lakeRecords();
  let seen = 0;
  for (const w of cowWars) {
    const ms = all.get(w.qid)?.mentions.filter(m => m.m === 'war-focus' && m.u.endsWith(`#war=${w.id}`) && /battles and operations/.test(m.c)) || [];
    for (const m of ms) { seen++; assert.equal(m.c, lines.get(w.id), `lake ${w.qid} (${w.id}): ${m.c}`); }
  }
  assert.ok(seen >= 9, `the lake's COW war lines (${seen})`);
  assert.ok(HOSTED.some(h => h.source === 'cow' && h.dir === 'lake/data/e' && h.kind === 'total'), 'the lake is listed among what VM hosts from COW');
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
  assert.equal(alexander.Born, '20 July 356 BC');
  assert.equal(alexander.Died, '10 June 323 BC');
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
