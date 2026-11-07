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
import { CATEGORY_IDS, flatScenes } from '../kino/lib/format.js';
import { readAt, onOwnPage } from '../kino/lib/links.js';
import { pageTest, launch } from './tools/pages.mjs';

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
  'iot-connect': 'Controls the user’s own devices through the local bridge; names no people, places or events',
  'tally-stick': 'private: a trading ledger, which has no place in a public index',
  'algo-trader': 'private: trading agents and their rules, which have no place in a public index',
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
  assert.ok(borgia.mentions.some(x => x.m === 'kino-great-thinkers') && borgia.mentions.some(x => x.m === 'bibliotheca'), 'Cesare Borgia in Kino and the Bibliotheca');
  assert.ok(borgia.aliases.includes('Duke Valentino'), `the Prince's name for him: ${borgia.aliases.join(', ')}`);
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
  assert.deepEqual(ghana['Kino · Geopolitical Events']?.map(a => [a.href, a.text]),
    [[route('kino', 'kino-geopolitical-events', 'kino/index.html?cat=geopolitical-events#doc=end-of-empire-in-africa&s=legacy'), 'The End of Empire in Africa, 1951–1980']]);
  const borgia = await entry('Q187998');
  assert.deepEqual(borgia['Kino · Great Thinkers']?.map(a => a.href), [route('kino', 'kino-great-thinkers', 'kino/index.html?cat=great-thinkers#doc=niccolo-machiavelli&s=cesare-borgia')], JSON.stringify(borgia));
  assert.ok(borgia.Bibliotheca?.length, 'and his Bibliotheca appearance beside it');
  // And back: a Volatility country's Master Index button opens its entry (#Q117), not the Explorer.
  await page.goto(`${BASE}/q/volatility.html#country=GHA`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const button = page.locator('#profile a', { hasText: 'Master Index' });
  await button.waitFor({ timeout: 20000 });
  assert.equal(await button.getAttribute('href'), `${BASE}/encyclopedia/index.html#Q117`);
  assert.deepEqual(errors, []);
});
