// Builds the JDP-I entity layer ("data lake") behind the Master Index.
//   node lake/scripts/build.mjs [--retro ../hp-retrospective] [--allow-drop] [--only <adapter,…>]
//   --only adds the named adapters' mentions to the committed lake between full builds (below, at ONLY).
// 1. Collect mentions from every module (adapters.mjs).
// 2. Resolve each mention's key to a Wikidata ID.
// 3. Fetch facts from Wikidata, plus one level of related entities (party, ideology, country, conflicts),
//    so parties and philosophies get pages too.
// 4. Add a plain-text summary per entity (Wikipedia REST API, CC BY-SA; cached in summary-cache.json).
// 5. Write static shards to lake/data/:
//    e/<n>.json   entities by Wikidata number % 512    t/<n>.json   English Wikipedia title → QID
//    index.json   compact search index                 keys.json    module keys (e.g. congress:P000197) → QID
//    manifest.json counts, sources, build time
// Guard: the build stops when a module's adapter fails, or a module's mentions halve, or the entities fall by a tenth
// against the committed manifest; --allow-drop goes on anyway. The new lake/data is written beside the old one and
// swapped in at the end, so a build that fails part-way leaves the committed files whole.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTERS, ADAPTER_MODULES, ADAPTER_TAG_GROUPS } from './adapters.mjs';
import { recordAliases } from './aliases.mjs';
import { wikidataDate, datedFacts, bestClaim, centuryTag } from './dates.mjs';
import { wikidataPoint } from './coords.mjs';
import { shortCounts, recount } from './counts.mjs';
import { isDisambiguation, getBatched, entityLabel, nameOf, otherLabel, shownName, uniqueNames, titleAlias, summaryFor, restSummary, isQid, REDIRECT_BADGES } from './resolve.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';
import { typeOf } from './types.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const jdpiDir = resolve(here, '../..');
const retroArg = process.argv.indexOf('--retro');
const retroDir = resolve(retroArg > 0 ? process.argv[retroArg + 1] : join(jdpiDir, '../hp-retrospective'));
const OUT = join(jdpiDir, 'lake/data');
// VM_UA: a run by hand names itself (a check run: "VM build check (https://jdpi.pages.dev)").
const UA = { 'User-Agent': process.env.VM_UA || 'JDP-I Master Index (https://jdpi.pages.dev)' };
const E_SHARDS = 512, T_SHARDS = 256;
// --only <adapter,…>: the named adapters' mentions added to the committed lake/data, so a module's new entities (a
// Bibliotheca book's cast) reach the Master Index before the monthly build, which makes the same records from scratch.
// Only their entities, and the related entities the lake lacks, are fetched, a request a second at most. An entity
// only these modules mention is made again, or goes with its last mention unless an entity with mentions relates to it;
// an entity other modules mention too keeps its record, with these modules' mentions, names and "Appears in" tags
// replaced; every other record, title and key stays as committed. Wikipedia summaries: --only fetches those of the
// entities it fetches whose titles the cache lacks (until November 2026 it fetched none, so 91 entities it brought in
// had no summary until the next full build); a record other modules mention too keeps its own. The modules a run
// speaks for are its adapters' own (ADAPTER_MODULES in adapters.mjs: --only kino is Kino's six submodules), and any
// module they report. A record made before `n` (counts.mjs) whose total exceeds its places is not recounted by a run
// that cannot tell whose the extra mentions are (counts.mjs canRecount): the run stops, naming them, unless --allow-drop
// (then they stay as committed).
const onlyAt = process.argv.indexOf('--only');
const ONLY = onlyAt > 0 ? new Set(String(process.argv[onlyAt + 1] || '').split(',').filter(Boolean)) : null;
if (ONLY) for (const n of ONLY) if (!ADAPTERS[n]) { console.error(`--only ${n}: adapters.mjs has no such adapter (${Object.keys(ADAPTERS).join(', ')})`); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ONLY ? Math.max(ms, 1000) : ms));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const normTitle = t => String(t).replace(/_/g, ' ').trim().replace(/^./, c => c.toUpperCase());
export function titleShard(t) { let h = 2166136261; for (const c of normTitle(t)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % T_SHARDS; }
const entityShard = qid => +qid.slice(1) % E_SHARDS;

async function getJson(url, init = {}) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {} // a refused connection or a body cut off mid-read: tried again like an HTTP error
    await sleep(1500 * (i + 1));
  }
  throw new Error(`HTTP failure: ${url.slice(0, 120)}`);
}
const wbget = params => getJson('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ...params }));

// ---- 1. Mentions. An adapter that throws (a module's file missing or re-shaped) would drop all of that module's
// mentions, thousands of them, and a module whose mentions halve against the committed manifest has lost its links.
// Either stops the build here, before an hour of Wikidata and Wikipedia requests. The Realtime Calendar's mentions
// (its last 180 days) pass into the Historical Calendar as they age, so the two calendars are counted together.
// Every module an adapter reports is listed (tests/master-index.test.mjs): the order of an entity's appearances on its
// Master Index page, so a country's profile pages (National Analysis, Volatility) follow its Retrospective entry.
const MODULE_ORDER = ['retrospective', 'pestle', 'volatility', 'historical-calendar', 'calendar', 'battlefield-history', 'war-focus', 'battlefield', 'monthly', 'kardashev', 'traders', 'learning', 'learning-politics', 'progress', 'neo-classic',
  'kino-political-events', 'kino-political-figures', 'kino-political-parties', 'kino-wars', 'kino-geopolitical-events', 'kino-great-thinkers'];
// The new lake is written beside the old one and swapped in at the end (below). A build interrupted between the two
// renames leaves the old data as lake/data.old: it is put back first, so this build compares against it rather than
// against nothing. With no previous manifest at all (a first build), the guards have nothing to compare with, and only
// --allow-drop goes on.
const NEW = `${OUT}.new`, OLD = `${OUT}.old`;
if (!existsSync(OUT) && existsSync(OLD)) renameSync(OLD, OUT);
if (!existsSync(join(OUT, 'manifest.json'))) refuseIfLost(['the previous lake/data/manifest.json (nothing to compare this build with)']);
const prevManifest = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {};
// The labels the last build gave (its index), which a name falls back to before it is ever shown as a bare QID
// (resolve.mjs nameOf; the sweep of 15 November 2026 found Donald Trump shown as "Q22686" where a label batch failed).
// (The index's second column is the shown name, which is what a related name shows as too.)
const committedLabel = new Map();
try { for (const r of JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')).rows || []) if (r[1] && !isQid(r[1])) committedLabel.set(r[0], r[1]); } catch {}
const mentions = [], failed = [];
for (const [name, adapter] of Object.entries(ADAPTERS)) {
  if (ONLY && !ONLY.has(name)) continue;
  try { const m = await adapter({ jdpiDir, retroDir }); mentions.push(...m); console.log(`${name}: ${m.length} mentions`); }
  catch (e) { failed.push(`the ${name} adapter (${e.message})`); console.warn(`${name}: skipped (${e.message})`); }
}
const moduleCounts = mentions.reduce((n, m) => { n[m.module] = (n[m.module] || 0) + 1; return n; }, {});
// --only: the modules this run speaks for (the named adapters' own, and any module they report), so a submodule an
// adapter has stopped reporting (a Kino category with no film left) loses its mentions rather than keeping them.
const MODS = ONLY ? new Set([...[...ONLY].flatMap(n => ADAPTER_MODULES[n] || [n]), ...Object.keys(moduleCounts)]) : null;
// --only: whether these modules give entities names of their own (a mention's `aliases`; only Bibliotheca does yet).
const NAMED = mentions.some(m => m.aliases?.length);
const calendarsTogether = ({ calendar = 0, 'historical-calendar': history = 0, ...rest }) => ({ ...rest, calendars: calendar + history });
// A module taken out of MODULE_ORDER is a decision, not a loss: only the ones still listed are compared.
const prevModules = Object.fromEntries(Object.entries(prevManifest.modules || {}).filter(([m]) => MODULE_ORDER.includes(m) && (!MODS || MODS.has(m))));
refuseIfLost([...failed, ...lostCounts(calendarsTogether(prevModules), calendarsTogether(moduleCounts))]);

// ---- 2. Resolve keys → QIDs
const titleToQid = new Map(), bioguideToQid = new Map();
const titles = [...new Set(mentions.filter(m => m.key.title).map(m => normTitle(m.key.title)))];
for (const batch of chunks(titles, 50)) {
  const r = await wbget({ sites: 'enwiki', titles: batch.join('|'), props: 'sitelinks', sitefilter: 'enwiki', redirects: 'yes' });
  for (const e of Object.values(r?.entities || {})) if (e.id && e.sitelinks?.enwiki) titleToQid.set(normTitle(e.sitelinks.enwiki.title), e.id);
  await sleep(150);
}
// Titles that redirect resolve to the target's sitelink; map any unresolved requested title by asking Wikipedia.
const unresolved = titles.filter(t => !titleToQid.has(t));
for (const batch of chunks(unresolved, 50)) {
  const r = await getJson('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', titles: batch.join('|'), redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item' }));
  const back = new Map();
  for (const x of [...(r?.query?.normalized || []), ...(r?.query?.redirects || [])]) back.set(x.to, [...(back.get(x.from) || [x.from])]);
  for (const p of Object.values(r?.query?.pages || {})) {
    const q = p.pageprops?.wikibase_item;
    if (!q) continue;
    titleToQid.set(normTitle(p.title), q);
    for (const orig of back.get(p.title) || []) titleToQid.set(normTitle(orig), q);
  }
  await sleep(150);
}
const bioguides = [...new Set(mentions.filter(m => m.key.bioguide).map(m => m.key.bioguide))];
if (bioguides.length) {
  const q = `SELECT ?item ?id WHERE { VALUES ?id { ${bioguides.map(b => `"${b}"`).join(' ')} } ?item wdt:P1157 ?id. }`;
  const r = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } });
  for (const b of r?.results?.bindings || []) bioguideToQid.set(b.id.value, b.item.value.split('/').pop());
}
const qidOf = k => k.qid || (k.title && titleToQid.get(normTitle(k.title))) || (k.bioguide && bioguideToQid.get(k.bioguide)) || null;
const byQid = new Map(), keys = {};
let unmatched = 0;
for (const m of mentions) {
  const q = qidOf(m.key);
  if (!q) { unmatched++; continue; }
  if (m.entityKey) keys[m.entityKey] = q;
  (byQid.get(q) || byQid.set(q, []).get(q)).push(m);
}
console.log(`resolved ${byQid.size} entities; ${unmatched} mentions unmatched`);
// --only: the committed records, and the entities these modules mentioned before (they are made again, or go).
const committed = new Map(), before = new Set();
if (ONLY) {
  for (let i = 0; i < E_SHARDS; i++) for (const [q, r] of Object.entries(JSON.parse(readFileSync(join(OUT, `e/${i}.json`), 'utf8')))) committed.set(q, r);
  for (const r of committed.values()) if (r.mentions.some(m => MODS.has(m.m))) before.add(r.q);
}

// ---- 3. Facts from Wikidata
const PROPS = { P569: 'born', P570: 'died', P571: 'founded', P576: 'dissolved', P580: 'start', P582: 'end', P585: 'date' };
const REL = { P27: 'Citizenship', P17: 'Country', P102: 'Party', P1142: 'Ideology', P135: 'Movement', P106: 'Occupation', P101: 'Field of work', P39: 'Positions held', P607: 'Conflicts', P710: 'Participants', P1001: 'Jurisdiction', P737: 'Influenced by', P463: 'Member of' };
// Facets for the Explorer's tag filters: Wikidata relations shown as tags.
const TAG_FACETS = { P106: 'Occupation', P101: 'Field', P135: 'Movement', P1142: 'Ideology', P102: 'Party', P39: 'Position held', P607: 'Conflict', P463: 'Member of' };
const PAGE_RELATIONS = ['P102', 'P1142', 'P135', 'P17', 'P27', 'P607', 'P737']; // related entities that get their own pages
// The entity types (person, place, war…) from Wikidata's P31: lake/scripts/types.mjs.
// A date at its precision, the year first and signed: "-0356-07-20" is 20 July 356 BC (dates.mjs). Cut to ten
// characters, as it was until November 2026, a date BC lost its last digit ("-0356-07-2"), which the page read as 1929.
const time = c => wikidataDate(c)?.v ?? null;
const refIds = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);

// Every wbgetentities of IDs goes through getBatched (resolve.mjs): a batch Wikidata answers with an error (one ID it
// refuses fails all fifty) is split and asked again, so one bad ID no longer leaves fifty names unread.
const wbgetIds = (ids, params, pause) => getBatched(ids, async batch => { const r = await wbget({ ids: batch.join('|'), ...params }); await sleep(pause); return r; });
const raw = new Map(), disambiguation = new Set();
// A Wikimedia disambiguation page is no entity (resolve.mjs isDisambiguation): a related item that is one gets no
// page (its name stays text where it is named), and a module key that resolves to one is left out below.
async function fetchEntities(ids) {
  // Labels in English and the multilingual "mul" (an item Wikidata labels once for every language), for entityLabel.
  const got = await wbgetIds(ids.filter(q => !raw.has(q)), { props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en|mul', sitefilter: 'enwiki' }, 200);
  for (const [q, e] of Object.entries(got)) { if (e.missing) continue; if (isDisambiguation(e)) { disambiguation.add(q); continue; } raw.set(q, e); }
}
await fetchEntities([...byQid.keys(), ...before]);
// The module keys that resolve to a disambiguation page ("David Einhorn", the Retrospective's "Juan Bosch" until it
// linked the politician's article): left out, with a warning naming the module and key, so the module can link the
// right article; until then the entity has no entry rather than one about a list of namesakes.
for (const q of [...byQid.keys()].filter(x => disambiguation.has(x))) {
  for (const m of byQid.get(q)) console.warn(`${m.module} ${JSON.stringify(m.key)} → ${q} is a Wikimedia disambiguation page; left out`);
  unmatched += byQid.get(q).length;
  byQid.delete(q);
  for (const [k, v] of Object.entries(keys)) if (v === q) delete keys[k];
}
// One level of related entities with their own pages (parties, ideologies, countries, conflicts, influences).
const related = new Set();
for (const q of byQid.keys()) { const e = raw.get(q); if (e) for (const p of PAGE_RELATIONS) refIds(e, p).forEach(x => related.add(x)); }
await fetchEntities([...related].filter(q => !committed.has(q)));
for (const q of disambiguation) related.delete(q);
// Labels for everything referenced in facts (positions held etc.), so facts read as names.
const labelOnly = new Set();
for (const e of raw.values()) for (const p of Object.keys(REL)) refIds(e, p).forEach(x => { if (!raw.has(x)) labelOnly.add(x); });
const fetchedLabel = new Map();
for (const [q, e] of Object.entries(await wbgetIds([...labelOnly], { props: 'labels', languages: 'en|mul' }, 150))) { const l = e.labels?.en?.value || e.labels?.mul?.value; if (l) fetchedLabel.set(q, l); }
// An item with neither an English nor a multilingual label (the Retrospective's parties named by their QID): its label
// in another language (resolve.mjs otherLabel), asked for those few alone, so its name is never a bare QID.
const foreign = new Map();
const unnamed = [...[...raw].filter(([, e]) => !e.labels?.en && !e.labels?.mul).map(([q]) => q), ...[...labelOnly].filter(q => !fetchedLabel.has(q) && !committedLabel.has(q))];
for (const [q, e] of Object.entries(await wbgetIds(unnamed, { props: 'labels' }, 150))) { const l = otherLabel(e.labels); if (l) foreign.set(q, l); }
const labels = new Map([...raw].map(([q, e]) => [q, entityLabel(e, { title: e.sitelinks?.enwiki?.title, committed: committedLabel.get(q), other: foreign.get(q), q })]));
for (const q of labelOnly) { const n = nameOf(q, { fetched: fetchedLabel, committed: committedLabel }); labels.set(q, n !== q ? n : foreign.get(q) || q); }
// Nationality tags read better as demonyms ("American" rather than "United States of America").
const demonym = new Map();
const citizenships = [...new Set([...raw.values()].flatMap(e => refIds(e, 'P27')))];
for (const batch of chunks(citizenships, 50)) {
  const r = await wbget({ ids: batch.join('|'), props: 'claims' });
  for (const [q, e] of Object.entries(r?.entities || {})) {
    const d = (e.claims?.P1549 || []).map(c => c.mainsnak.datavalue?.value).find(v => v?.language === 'en');
    if (d) demonym.set(q, d.text.replace(/^./, c => c.toUpperCase()));
  }
  await sleep(150);
}
console.log(`fetched ${raw.size} entities (${related.size} related), ${labelOnly.size} labels, ${demonym.size} demonyms`);
// Wikidata batches that come back empty (an error object read as no entities, a title lookup that failed) leave
// fewer entities; a tenth fewer than the committed manifest is not a month's ordinary change.
if (!ONLY) refuseIfLost(lostCounts({ entities: prevManifest.entities || 0, 'entities with mentions': prevManifest.withMentions || 0 },
  { entities: raw.size, 'entities with mentions': byQid.size }, { keep: 0.9 }));

// ---- 4. Summaries (cache shared with the calendar's)
const cachePath = join(here, 'summary-cache.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const calCache = join(jdpiDir, 'calendar/scripts/summary-cache.json');
if (existsSync(calCache)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(calCache, 'utf8')))) if (!(normTitle(k) in cache)) cache[normTitle(k)] = v;
const shorten = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= 600) return t; const c = t.slice(0, 600), e = c.lastIndexOf('. '); return e > 200 ? c.slice(0, e + 1) : c + '…'; };
// Every entity fetched whose title the cache lacks, in a full build and in --only alike (fix 6 of the sweep: --only
// fetched none, so the entities it brought in waited a month for theirs). A title whose sitelink Wikidata marks as a
// redirect is not asked for: its summary would be another article's (resolve.mjs summaryFor).
const needSummary = [...new Set([...raw.values()].filter(e => e.sitelinks?.enwiki?.title && !(e.sitelinks.enwiki.badges || []).some(b => REDIRECT_BADGES.has(b))).map(e => e.sitelinks.enwiki.title))].filter(t => !(normTitle(t) in cache));
const fetchedNow = new Set();
let done = 0, unfetched = 0;
const queue = [...needSummary];
await Promise.all(Array.from({ length: ONLY ? 2 : 8 }, async () => {
  for (let t; (t = queue.shift());) {
    // A missing article (404, null) is cached as no summary; a request that failed is left out of the cache, so the
    // next build asks again rather than keeping '' for good. No redirect is followed to another article: an answer
    // whose title is not the one asked for (a redirect's target), or a disambiguation page, is cached as no summary
    // (resolve.mjs restSummary). Until November 2026 the request asked for ?redirect=true, and First Phase Offensive's
    // summary was the Korean War's.
    const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`).catch(() => undefined);
    if (r === undefined) unfetched++; else { cache[normTitle(t)] = shorten(restSummary(r, t)); fetchedNow.add(normTitle(t)); }
    if (++done % 500 === 0 && !ONLY) { console.log(`summaries ${done}/${needSummary.length}`); writeFileSync(cachePath, JSON.stringify(cache)); }
    if (ONLY) await sleep(500);
  }
}));
if (needSummary.length) console.log(`summaries: ${done} asked for, ${fetchedNow.size} answered`);
// A full build writes the cache it used (the calendar's entries in it); --only adds only what it fetched to the lake's
// own file, so a small run leaves the rest of the file as it was.
if (!ONLY) writeFileSync(cachePath, JSON.stringify(cache));
else if (fetchedNow.size) { const own = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}; for (const t of fetchedNow) own[t] = cache[t]; writeFileSync(cachePath, JSON.stringify(own)); }
if (unfetched) console.warn(`${unfetched} of ${needSummary.length} summaries could not be fetched; the next build tries them again`);

// ---- 5. Entity records and shards
// The names "Appears in" shows; a Kino category's carries the suite's name, since "Wars" alone would be anyone's.
const MODULE_NAMES = { retrospective: 'Political Retrospective', pestle: 'National Analysis', volatility: 'Geopolitical Volatility', 'historical-calendar': 'Historical Calendar', calendar: 'Realtime Calendar', 'battlefield-history': 'Retrospective Battlefield', 'war-focus': 'War Focus', battlefield: 'Realtime Battlefield', monthly: 'Month by Month', kardashev: 'Kardashev Tracker', traders: 'Investor Impersonator', learning: 'Learning · Finance & Economics', 'learning-politics': 'Learning · Politics', progress: 'Invention Timeline', 'science-briefing': 'Scientific Briefing', 'osint-training': 'Intel Training', 'neo-classic': 'Bibliotheca',
  'kino-political-events': 'Kino · Political Events', 'kino-political-figures': 'Kino · Political Figures', 'kino-political-parties': 'Kino · Political Parties', 'kino-wars': 'Kino · Wars', 'kino-geopolitical-events': 'Kino · Geopolitical Events', 'kino-great-thinkers': 'Kino · Great Thinkers' };
const TYPE_NAMES = { person: 'Person', place: 'Place or state', conflict: 'War or conflict', election: 'Election', party: 'Political party', idea: 'Idea or school of thought', organisation: 'Organisation', event: 'Event', topic: 'Topic' };
function tagsFor(e, type, ms) {
  const tags = new Set([`Type:${TYPE_NAMES[type]}`]);
  for (const q of refIds(e, 'P27')) tags.add(`Nationality:${demonym.get(q) || labels.get(q) || q}`);
  for (const [p, facet] of Object.entries(TAG_FACETS)) for (const q of refIds(e, p).slice(0, 15)) { const l = labels.get(q); if (l && !/^Q\d+$/.test(l)) tags.add(`${facet}:${l.replace(/^./, c => c.toUpperCase())}`); }
  // The first of birth, date, start and inception that Wikidata gives, by its best statement; none from a date coarser
  // than a century (dates.mjs centuryTag: Moses's 2nd millennium BC is no "20th century BC").
  const century = centuryTag([e.claims?.P569, e.claims?.P585, e.claims?.P580, e.claims?.P571].map(bestClaim).find(c => wikidataDate(c)));
  if (century) tags.add(century);
  for (const m of ms) { tags.add(`Appears in:${MODULE_NAMES[m.module] || m.module}`); for (const [f, v] of m.tags || []) if (v) tags.add(`${f}:${v}`); }
  return [...tags];
}
function record(q) {
  const e = raw.get(q), title = e.sitelinks?.enwiki?.title || null;
  // Each date at its precision; `fp` keeps the precisions coarser than a year (a decade, a century) and `fc` the dates
  // the source marks circa, so the page shows "15th century" or "c. 1500", not a year Wikidata does not give (dates.mjs).
  const { facts, fp, fc, fcal = [], fd = {} } = datedFacts(e.claims, PROPS);
  const rel = {};
  for (const [p, name] of Object.entries(REL)) { const ids = [...new Set(refIds(e, p))].slice(0, 12); if (ids.length) rel[name] = ids.map(x => [x, nameOf(x, { fetched: labels, committed: committedLabel })]); }
  const img = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  // Its point, from the best P625 statement (coords.mjs): [lon, lat] as Wikidata gives it, with its precision in degrees
  // as `ptp`, so the Omni-Map can place it (PRP-SCHOLAR-USP-DESIGN.md 2.1 rule 5, stage S1; first written by the full
  // build of 3 December 2026). A record with no coordinates on the Earth has neither.
  const point = wikidataPoint(bestClaim(e.claims?.P625));
  const ms = (byQid.get(q) || []).sort((a, b) => MODULE_ORDER.indexOf(a.module) - MODULE_ORDER.indexOf(b.module) || String(a.date || '').localeCompare(String(b.date || '')));
  // Keep each place once (some modules mention the same entity many times on one page). A book's mention keeps where in
  // the book the name occurs (`w`: [chapter number, its first tagged paragraph, times, chapter heading], adapters.mjs
  // bibliotheca), which the page lists under the book's line.
  const seen = new Set(), mentionsOut = [];
  for (const m of ms) { const k = m.module + m.url; if (seen.has(k)) continue; seen.add(k); mentionsOut.push({ m: m.module, u: m.url, c: m.context, d: m.date || null, ...(m.where?.length ? { w: m.where } : {}) }); if (mentionsOut.length >= 300) break; }
  // The places it appears in: what the page's header "Appears in Vitruvian Manager · N" counts, a book being one place
  // however often it names the entity (Jude, 15 November 2026, BI-19 and MI-10). The list holds them all up to 300;
  // `places` is kept only beyond that, where the list stops short.
  const places = new Set(ms.map(m => m.module + m.url)).size;
  // Wikidata's first six aliases, tidied, then the names a module's own text uses (a mention's `aliases`: a book's
  // "Duke Valentino" for Cesare Borgia), so Bibliotheca's tagger finds the entity in the book (aliases.mjs). Only a
  // trailing comma or space, or the full stop after a regnal number ("Alexander VI."), goes: an abbreviation keeps its
  // stop, or William Withering's "With." would be "With", a term at every sentence that opens with the word in every
  // book the monthly refresh re-tags.
  // The label: English, else the multilingual label, the article's title, a module's own name for it, the last build's,
  // another language's; a bare QID only with none of them (resolve.mjs entityLabel; eight entries were "Q4887122" and
  // the like until November 2026). `name`, only where it differs, is what the page shows: a person's label without the
  // realm after a regnal number or a comma title ("Frederik X", label "Frederik X of Denmark", resolve.mjs shownName).
  const label = entityLabel(e, { title, names: ms.map(m => m.label), committed: committedLabel.get(q), other: foreign.get(q), q });
  // Short only where Wikipedia's title is the short name, or with no article (the second reader's F1; uniqueNames below
  // takes back one that another entry would show too); Wikipedia's title kept among a person's aliases (titleAlias).
  const type = typeOf(e), name = shownName(label, type, { title });
  // The summary only where it is the article's own; else `ns` says why there is none (resolve.mjs summaryFor).
  const { summary, ns } = summaryFor(e.sitelinks?.enwiki, title ? cache[normTitle(title)] : undefined);
  // `n`: the modules the kept list shows short (a place named twice, or past the 300th), so --only can recount (counts.mjs).
  const n = shortCounts(ms, mentionsOut);
  return {
    q, label, ...(name !== label ? { name } : {}), desc: e.descriptions?.en?.value || '', type,
    aliases: titleAlias(recordAliases((e.aliases?.en || []).map(a => a.value), label, ms.flatMap(m => m.aliases || [])), { label, name, title, type }), wiki: title, img: img || null,
    summary, ...(ns ? { ns } : {}), facts, ...(Object.keys(fp).length ? { fp } : {}), ...(point ? { pt: point.pt, ...(point.p ? { ptp: point.p } : {}) } : {}), ...(fc.length ? { fc } : {}), ...(fcal.length ? { fcal } : {}), ...(Object.keys(fd).length ? { fd } : {}), rel, mentions: mentionsOut, total: ms.length, ...(places !== mentionsOut.length ? { places } : {}), ...(Object.keys(n).length ? { n } : {}),
    tags: tagsFor(e, type, ms),
  };
}
// --only: the committed records with these modules' entities made again (ONLY, at the top). An entity only they
// mention is made from scratch; one other modules mention too keeps its record, with these modules' mentions, names
// and "Appears in" tags replaced, and the tag groups only these adapters give (ADAPTER_TAG_GROUPS) made again (any
// other tag a mention gave of its own waits for the full build to go), the tags it keeps in their order; an entity left with
// no mention stays only if one with mentions relates to it, as the full build would fetch it, and the related entities
// it brought go with it on the same terms; the related entities the lake lacked are made as the full build makes them.
// Names: a record keeps no note of which module gave which, so modules that give names (NAMED: Bibliotheca) have the
// record's made again from Wikidata and their mentions, as before; modules that give none (Kino, National Analysis,
// Volatility) leave them as committed, or Cesare Borgia would lose the Prince's "Duke Valentino" to a Kino portrait,
// and the books their terms.
function onlyMerge() {
  const out = new Map(committed), gone = new Set(), own = m => MODS.has(m.m), mine = q => byQid.get(q) || [];
  const ownGroups = new Set([...ONLY].flatMap(n => ADAPTER_TAG_GROUPS[n] || []));
  const touched = new Set([...byQid.keys(), ...before]);
  for (const q of touched) {
    const old = committed.get(q), others = (old?.mentions || []).filter(m => !own(m));
    // A disambiguation page these modules mentioned (resolve.mjs): it goes with their mentions, or, where other modules
    // mention it too, stays as committed until the full build leaves it out.
    if (disambiguation.has(q)) { if (!others.length) gone.add(q); else console.warn(`--only: ${q} is a disambiguation page that other modules mention; it stays as committed until the full build`); continue; }
    if (!raw.has(q)) { console.warn(`--only: Wikidata did not return ${q}; its record stays as committed`); continue; }
    if (!others.length) { out.set(q, record(q)); continue; }
    const fresh = record(q);
    const ms = [...others, ...fresh.mentions].sort((a, b) => MODULE_ORDER.indexOf(a.m) - MODULE_ORDER.indexOf(b.m) || String(a.d || '').localeCompare(String(b.d || ''))).slice(0, 300);
    const appears = new Set([...MODS].map(m => `Appears in:${MODULE_NAMES[m] || m}`));
    const add = mine(q).flatMap(m => [`Appears in:${MODULE_NAMES[m.module] || m.module}`, ...(m.tags || []).filter(([, v]) => v).map(([f, v]) => `${f}:${v}`)]);
    const next = new Set([...old.tags.filter(t => !appears.has(t) && !ownGroups.has(t.split(':')[0])), ...add]);
    // The total less these modules' old share, counted from `n` where the list showed it short, plus their new one; a
    // record whose list cannot show that share (counts.mjs canRecount) is refused, and stays as committed.
    let counted;
    try { counted = recount(old, MODS, mine(q), ms, { adapters: ONLY }); } catch (e) { if (!e.record) throw e; refused.push(e.message); continue; }
    const { total, n } = counted, { n: _, name: __, places: ___, ...kept } = old;
    // The places: those of the other modules (all of them when the list was not cut at 300) and these modules' anew.
    const placesNow = (old.places ?? old.mentions.length) - old.mentions.filter(own).length + (fresh.places ?? fresh.mentions.length);
    const shown = shownName(kept.label, kept.type, { title: kept.wiki });
    out.set(q, { q: kept.q, label: kept.label, ...(shown !== kept.label ? { name: shown } : {}), ...kept, aliases: NAMED ? fresh.aliases : old.aliases, mentions: ms, total,
      ...(placesNow !== ms.length ? { places: placesNow } : {}), ...(Object.keys(n).length ? { n } : {}),
      tags: [...old.tags.filter(t => next.has(t)), ...[...next].filter(t => !old.tags.includes(t))] });
  }
  const pageRel = new Set(PAGE_RELATIONS.map(p => REL[p]));
  const relOf = r => Object.entries(r?.rel || {}).filter(([k]) => pageRel.has(k)).flatMap(([, list]) => list.map(([x]) => x));
  const kept = new Set([...out.values()].filter(r => r.mentions.length).flatMap(relOf));
  for (const q of touched) {
    const r = out.get(q);
    if (!r || r.mentions.length || kept.has(q)) continue;
    for (const x of relOf(committed.get(q) || r)) if (out.get(x) && !out.get(x).mentions.length && !kept.has(x)) gone.add(x);
    gone.add(q);
  }
  for (const q of gone) out.delete(q);
  for (const q of related) if (raw.has(q) && !out.has(q)) out.set(q, record(q));
  return { out, gone, touched };
}
const refused = [];
const only = ONLY ? onlyMerge() : null;
// counts.mjs canRecount: the records this run could not recount, named; the build stops unless --allow-drop.
refuseIfLost(refused.length ? [`${refused.length} records this --only run cannot recount (${refused.slice(0, 5).join('; ')}${refused.length > 5 ? '; …' : ''})`] : []);
const records = only ? only.out : new Map([...raw.keys()].map(q => [q, record(q)]));
// No two entries shown by one name (the second reader's F1: Albert II of Monaco and Albert II of Belgium were both
// "Albert II"): a short name another entry also shows, or has as its label, is taken back, on every record written.
const namesBack = uniqueNames(records);
if (namesBack.length) console.log(`${namesBack.length} short names kept as labels, another entry being shown by them (${namesBack.slice(0, 8).join(', ')}${namesBack.length > 8 ? ', …' : ''})`);
const readOut = f => JSON.parse(readFileSync(join(OUT, f), 'utf8'));
// Everything is written into lake/data.new; only when all of it is there does it replace lake/data.
rmSync(NEW, { recursive: true, force: true });
mkdirSync(join(NEW, 'e'), { recursive: true }); mkdirSync(join(NEW, 't'), { recursive: true });
// --only starts from the committed titles (the redirects the last full build found stay), less the entities that go.
const eShards = Array.from({ length: E_SHARDS }, () => ({}));
const tShards = Array.from({ length: T_SHARDS }, (_, i) => (only ? Object.fromEntries(Object.entries(readOut(`t/${i}.json`)).filter(([, q]) => !only.gone.has(q))) : {}));
const index = [], typeCounts = {};
// A tag's id is its place in the sorted list of every tag, so the same records give the same index.json whatever
// order Wikidata answered in or --only met them (numbered as they came, an identical rerun renumbered them all).
const tagList = [...new Set([...records.values()].flatMap(r => r.tags))].sort();
const tagIds = new Map(tagList.map((t, i) => [t, i]));
for (const [q, r] of records) {
  eShards[entityShard(q)][q] = r;
  if (r.wiki) tShards[titleShard(r.wiki)][normTitle(r.wiki)] = q;
  // Per module: [module, first place it appears, number of places] — lets search results link straight in.
  const perModule = new Map();
  for (const m of r.mentions) { const x = perModule.get(m.m); if (x) x[2]++; else perModule.set(m.m, [m.m, m.u, 1]); }
  // The row shows the record's shown name; where that differs from the label, the label leads its aliases, so a search
  // for "Frederik X of Denmark" still finds "Frederik X".
  index.push([q, r.name || r.label, r.type, r.desc.slice(0, 80), r.total, (r.name ? [r.label, ...r.aliases] : r.aliases).slice(0, 3), r.tags.map(t => tagIds.get(t)), [...perModule.values()]]);
  typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
}
// Requested titles that were redirects also map to their entity.
for (const [t, q] of titleToQid) if (records.has(q)) tShards[titleShard(t)][t] = q;
eShards.forEach((s, i) => writeFileSync(join(NEW, `e/${i}.json`), JSON.stringify(s)));
tShards.forEach((s, i) => writeFileSync(join(NEW, `t/${i}.json`), JSON.stringify(s)));
index.sort((a, b) => b[4] - a[4] || a[1].localeCompare(b[1]));
// index.json: { tags: ["Facet:Value", …], modules: {id: name}, rows: [[qid, label, type, desc, mentions, aliases, tagIds, [[module, url, count]]]] }
// --only keeps the committed module names (and adds its own), and the committed keys of the entities that stay.
const modulesOut = only ? { ...readOut('index.json').modules, ...Object.fromEntries([...MODS].map(m => [m, MODULE_NAMES[m] || m])) } : MODULE_NAMES;
writeFileSync(join(NEW, 'index.json'), JSON.stringify({ tags: tagList, modules: modulesOut, rows: index }));
writeFileSync(join(NEW, 'keys.json'), JSON.stringify(only ? { ...Object.fromEntries(Object.entries(readOut('keys.json')).filter(([, q]) => !only.gone.has(q))), ...keys } : keys));
// --only counts the mentions as committed less these modules' then, plus theirs now (their keys are Wikidata IDs, all
// resolved), and the entities with mentions anew.
const priorOwn = [...(MODS || [])].reduce((n, m) => n + (prevManifest.modules?.[m] || 0), 0);
// `fullBuild`: when the last full build ran (a full build writes it, --only keeps it), since `generated` is any run's
// time. The tests that hold the data to rules only a full build can bring in (every record made again, with `n`)
// bind from it (tests/master-index.test.mjs).
const stamp = new Date().toISOString();
writeFileSync(join(NEW, 'manifest.json'), JSON.stringify({
  generated: stamp, ...(ONLY ? (prevManifest.fullBuild ? { fullBuild: prevManifest.fullBuild } : {}) : { fullBuild: stamp }), entities: records.size,
  withMentions: only ? [...records.values()].filter(r => r.mentions.length).length : byQid.size,
  mentions: only ? (prevManifest.mentions || 0) - priorOwn + mentions.length - unmatched : mentions.length - unmatched,
  types: typeCounts, shards: { entities: E_SHARDS, titles: T_SHARDS },
  modules: Object.fromEntries(MODULE_ORDER.map(m => [m, MODS && !MODS.has(m) ? prevManifest.modules?.[m] || 0 : moduleCounts[m] || 0])),
  sources: ['Wikidata (CC0)', 'Wikipedia summaries (CC BY-SA 4.0)', 'JDP-I modules'],
}, null, 1));
// The swap: the old lake/data steps aside, the new one takes its name, and the old one goes. If the second rename
// fails, the old one is put back; if even that fails (a file held open on Windows), it stays in lake/data.old, where the
// next build finds it.
rmSync(OLD, { recursive: true, force: true });
if (existsSync(OUT)) renameSync(OUT, OLD);
try { renameSync(NEW, OUT); } catch (e) {
  try { if (existsSync(OLD)) renameSync(OLD, OUT); } catch (e2) { console.error(`Putting lake/data back failed too (${e2.message}); the previous data is in lake/data.old.`); }
  throw e;
}
rmSync(OLD, { recursive: true, force: true });
console.log(`wrote ${records.size} entities${only ? ` (--only ${[...ONLY].join(', ')}: ${only.touched.size} of theirs made again or kept, ${records.size - committed.size + only.gone.size} new, ${only.gone.size} gone)` : ''}`, typeCounts);
