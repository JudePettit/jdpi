// Builds the JDP-I entity layer ("data lake") behind the Encyclopaedia.
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
import { ADAPTERS } from './adapters.mjs';
import { recordAliases } from './aliases.mjs';
import { lostCounts, refuseIfLost } from '../../calendar/scripts/guard.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const jdpiDir = resolve(here, '../..');
const retroArg = process.argv.indexOf('--retro');
const retroDir = resolve(retroArg > 0 ? process.argv[retroArg + 1] : join(jdpiDir, '../hp-retrospective'));
const OUT = join(jdpiDir, 'lake/data');
const UA = { 'User-Agent': 'JDP-I Encyclopaedia (https://jdpi.pages.dev; judep92@gmail.com)' };
const E_SHARDS = 512, T_SHARDS = 256;
// --only <adapter,…>: the named adapters' mentions added to the committed lake/data, so a module's new entities (a
// Bibliotheca book's cast) reach the Encyclopaedia before the monthly build, which makes the same records from scratch.
// Only their entities, and the related entities the lake lacks, are fetched, a request a second at most. An entity
// only these modules mention is made again, or goes with its last mention unless an entity with mentions relates to it;
// an entity other modules mention too keeps its record, with these modules' mentions, names and "Appears in" tags
// replaced; every other record, title and key stays as committed. Wikipedia summaries wait for the full build (an
// entity new to the lake shows its summary only if the cache has it). A module's id is its adapter's name here.
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
const MODULE_ORDER = ['retrospective', 'historical-calendar', 'calendar', 'battlefield-history', 'war-focus', 'battlefield', 'kardashev', 'traders', 'learning', 'learning-politics', 'progress', 'bibliotheca'];
// The new lake is written beside the old one and swapped in at the end (below). A build interrupted between the two
// renames leaves the old data as lake/data.old: it is put back first, so this build compares against it rather than
// against nothing. With no previous manifest at all (a first build), the guards have nothing to compare with, and only
// --allow-drop goes on.
const NEW = `${OUT}.new`, OLD = `${OUT}.old`;
if (!existsSync(OUT) && existsSync(OLD)) renameSync(OLD, OUT);
if (!existsSync(join(OUT, 'manifest.json'))) refuseIfLost(['the previous lake/data/manifest.json (nothing to compare this build with)']);
const prevManifest = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {};
const mentions = [], failed = [];
for (const [name, adapter] of Object.entries(ADAPTERS)) {
  if (ONLY && !ONLY.has(name)) continue;
  try { const m = await adapter({ jdpiDir, retroDir }); mentions.push(...m); console.log(`${name}: ${m.length} mentions`); }
  catch (e) { failed.push(`the ${name} adapter (${e.message})`); console.warn(`${name}: skipped (${e.message})`); }
}
const moduleCounts = mentions.reduce((n, m) => { n[m.module] = (n[m.module] || 0) + 1; return n; }, {});
// --only: the modules this run speaks for (the adapters named, and any module they report).
const MODS = ONLY ? new Set([...ONLY, ...Object.keys(moduleCounts)]) : null;
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
const PERSON = new Set(['Q5']), CONFLICT = new Set(['Q198', 'Q180684', 'Q350604', 'Q178561', 'Q8465', 'Q103495', 'Q645883', 'Q1261499', 'Q124734', 'Q831663', 'Q2001676', 'Q1006311', 'Q3119160', 'Q188055']);
const PLACE = new Set(['Q6256', 'Q3624078', 'Q3024240', 'Q7275', 'Q48349', 'Q417175', 'Q1250464', 'Q133442', 'Q1763527', 'Q107390', 'Q35657', 'Q34876', 'Q515', 'Q5119', 'Q15634554', 'Q28171280', 'Q112099', 'Q161243', 'Q131569']);
const PARTY = new Set(['Q7278', 'Q233591', 'Q1393724', 'Q6440541', 'Q2510446']);
const IDEA = new Set(['Q12909644', 'Q179805', 'Q7257', 'Q1387659', 'Q2198855', 'Q12345877', 'Q11660', 'Q5891', 'Q4692']);
const ORG = new Set(['Q4830453', 'Q6881511', 'Q891723', 'Q43229', 'Q783794', 'Q484652', 'Q163740', 'Q245065']);
function typeOf(e) {
  const p31 = (e.claims?.P31 || []).map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);
  const label = e.labels?.en?.value || '';
  const has = s => p31.some(x => s.has(x));
  if (has(PERSON) || e.claims?.P569) return 'person';
  if (/election|referendum/i.test(label)) return 'election';
  if (has(CONFLICT) || /\b(war|battle|siege|invasion|insurgency|conflict|revolt|rebellion|uprising|massacre|genocide|coup)\b/i.test(label)) return 'conflict';
  if (has(PARTY)) return 'party';
  if (has(IDEA) || /ism$/i.test(label)) return 'idea';
  if (has(PLACE) || e.claims?.P36) return 'place';
  if (has(ORG)) return 'organisation';
  if (e.claims?.P585 || e.claims?.P580) return 'event';
  return 'topic';
}
const time = c => { const v = c?.mainsnak?.datavalue?.value; if (!v?.time) return null; const p = v.precision; const t = v.time.replace(/^\+/, ''); return p >= 11 ? t.slice(0, 10) : p === 10 ? t.slice(0, 7) : t.replace(/^(-?\d+).*/, '$1'); };
const refIds = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak.datavalue?.value?.id).filter(Boolean);

const raw = new Map();
async function fetchEntities(ids) {
  for (const batch of chunks(ids.filter(q => !raw.has(q)), 50)) {
    const r = await wbget({ ids: batch.join('|'), props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en', sitefilter: 'enwiki' });
    for (const [q, e] of Object.entries(r?.entities || {})) if (!e.missing) raw.set(q, e);
    await sleep(200);
  }
}
await fetchEntities([...byQid.keys(), ...before]);
// One level of related entities with their own pages (parties, ideologies, countries, conflicts, influences).
const related = new Set();
for (const q of byQid.keys()) { const e = raw.get(q); if (e) for (const p of PAGE_RELATIONS) refIds(e, p).forEach(x => related.add(x)); }
await fetchEntities([...related].filter(q => !committed.has(q)));
// Labels for everything referenced in facts (positions held etc.), so facts read as names.
const labelOnly = new Set();
for (const e of raw.values()) for (const p of Object.keys(REL)) refIds(e, p).forEach(x => { if (!raw.has(x)) labelOnly.add(x); });
const labels = new Map([...raw].map(([q, e]) => [q, e.labels?.en?.value || q]));
for (const batch of chunks([...labelOnly], 50)) {
  const r = await wbget({ ids: batch.join('|'), props: 'labels', languages: 'en' });
  for (const [q, e] of Object.entries(r?.entities || {})) labels.set(q, e.labels?.en?.value || q);
  await sleep(150);
}
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
const needSummary = ONLY ? [] : [...raw.values()].map(e => e.sitelinks?.enwiki?.title).filter(t => t && !(normTitle(t) in cache));
let done = 0, unfetched = 0;
const queue = [...needSummary];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let t; (t = queue.shift());) {
    // A missing article (404, null) is cached as no summary; a request that failed is left out of the cache, so the
    // next build asks again rather than keeping '' for good.
    const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}?redirect=true`).catch(() => undefined);
    if (r === undefined) unfetched++; else cache[normTitle(t)] = shorten(r?.extract);
    if (++done % 500 === 0) { console.log(`summaries ${done}/${needSummary.length}`); writeFileSync(cachePath, JSON.stringify(cache)); }
  }
}));
if (!ONLY) writeFileSync(cachePath, JSON.stringify(cache));
if (unfetched) console.warn(`${unfetched} of ${needSummary.length} summaries could not be fetched; the next build tries them again`);

// ---- 5. Entity records and shards
const MODULE_NAMES = { retrospective: 'Political Retrospective', 'historical-calendar': 'Historical Calendar', calendar: 'Realtime Calendar', 'battlefield-history': 'Retrospective Battlefield', 'war-focus': 'War Focus', battlefield: 'Realtime Battlefield', kardashev: 'Kardashev Tracker', traders: 'Auto Trader', learning: 'Learning · Finance & Economics', 'learning-politics': 'Learning · Politics', progress: 'Invention Timeline', 'science-briefing': 'Scientific Briefing', 'osint-training': 'Intel Training', bibliotheca: 'Bibliotheca' };
const TYPE_NAMES = { person: 'Person', place: 'Place or state', conflict: 'War or conflict', election: 'Election', party: 'Political party', idea: 'Idea or school of thought', organisation: 'Organisation', event: 'Event', topic: 'Topic' };
function tagsFor(e, type, ms) {
  const tags = new Set([`Type:${TYPE_NAMES[type]}`]);
  for (const q of refIds(e, 'P27')) tags.add(`Nationality:${demonym.get(q) || labels.get(q) || q}`);
  for (const [p, facet] of Object.entries(TAG_FACETS)) for (const q of refIds(e, p).slice(0, 15)) { const l = labels.get(q); if (l && !/^Q\d+$/.test(l)) tags.add(`${facet}:${l.replace(/^./, c => c.toUpperCase())}`); }
  const when = time(e.claims?.P569?.[0]) || time(e.claims?.P585?.[0]) || time(e.claims?.P580?.[0]) || time(e.claims?.P571?.[0]);
  if (when) { const y = parseInt(when, 10); if (Number.isFinite(y)) { const c = Math.floor((Math.abs(y) - 1) / 100) + 1; tags.add(`Century:${c}${[, 'st', 'nd', 'rd'][c % 100 > 10 && c % 100 < 14 ? 0 : c % 10] || 'th'} century${y < 0 ? ' BC' : ''}`); } }
  for (const m of ms) { tags.add(`Appears in:${MODULE_NAMES[m.module] || m.module}`); for (const [f, v] of m.tags || []) if (v) tags.add(`${f}:${v}`); }
  return [...tags];
}
function record(q) {
  const e = raw.get(q), title = e.sitelinks?.enwiki?.title || null;
  const facts = {};
  for (const [p, name] of Object.entries(PROPS)) { const v = time(e.claims?.[p]?.[0]); if (v) facts[name] = v; }
  const rel = {};
  for (const [p, name] of Object.entries(REL)) { const ids = [...new Set(refIds(e, p))].slice(0, 12); if (ids.length) rel[name] = ids.map(x => [x, labels.get(x) || x]); }
  const img = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const ms = (byQid.get(q) || []).sort((a, b) => MODULE_ORDER.indexOf(a.module) - MODULE_ORDER.indexOf(b.module) || String(a.date || '').localeCompare(String(b.date || '')));
  // Keep each place once (some modules mention the same entity many times on one page).
  const seen = new Set(), mentionsOut = [];
  for (const m of ms) { const k = m.module + m.url; if (seen.has(k)) continue; seen.add(k); mentionsOut.push({ m: m.module, u: m.url, c: m.context, d: m.date || null }); if (mentionsOut.length >= 300) break; }
  // Wikidata's first six aliases, tidied, then the names a module's own text uses (a mention's `aliases`: a book's
  // "Duke Valentino" for Cesare Borgia), so Bibliotheca's tagger finds the entity in the book (aliases.mjs). Only a
  // trailing comma or space, or the full stop after a regnal number ("Alexander VI."), goes: an abbreviation keeps its
  // stop, or William Withering's "With." would be "With", a term at every sentence that opens with the word in every
  // book the monthly refresh re-tags.
  const label = e.labels?.en?.value || title || q;
  return {
    q, label, desc: e.descriptions?.en?.value || '', type: typeOf(e),
    aliases: recordAliases((e.aliases?.en || []).map(a => a.value), label, ms.flatMap(m => m.aliases || [])), wiki: title, img: img || null,
    summary: title ? cache[normTitle(title)] || '' : '', facts, rel, mentions: mentionsOut, total: ms.length,
    tags: tagsFor(e, typeOf(e), ms),
  };
}
// --only: the committed records with these modules' entities made again (ONLY, at the top). An entity only they
// mention is made from scratch; one other modules mention too keeps its record, with these modules' mentions, names
// and "Appears in" tags replaced (a tag a mention gave of its own waits for the full build to go); an entity left with
// no mention stays only if one with mentions relates to it, as the full build would fetch it, and the related entities
// it brought go with it on the same terms; the related entities the lake lacked are made as the full build makes them.
function onlyMerge() {
  const out = new Map(committed), gone = new Set(), own = m => MODS.has(m.m), mine = q => byQid.get(q) || [];
  const touched = new Set([...byQid.keys(), ...before]);
  for (const q of touched) {
    if (!raw.has(q)) { console.warn(`--only: Wikidata did not return ${q}; its record stays as committed`); continue; }
    const old = committed.get(q), others = (old?.mentions || []).filter(m => !own(m));
    if (!others.length) { out.set(q, record(q)); continue; }
    const fresh = record(q);
    const ms = [...others, ...fresh.mentions].sort((a, b) => MODULE_ORDER.indexOf(a.m) - MODULE_ORDER.indexOf(b.m) || String(a.d || '').localeCompare(String(b.d || ''))).slice(0, 300);
    const appears = new Set([...MODS].map(m => `Appears in:${MODULE_NAMES[m] || m}`));
    const add = mine(q).flatMap(m => [`Appears in:${MODULE_NAMES[m.module] || m.module}`, ...(m.tags || []).filter(([, v]) => v).map(([f, v]) => `${f}:${v}`)]);
    out.set(q, { ...old, aliases: fresh.aliases, mentions: ms, total: old.total - (old.mentions.length - others.length) + mine(q).length,
      tags: [...new Set([...old.tags.filter(t => !appears.has(t)), ...add])] });
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
const only = ONLY ? onlyMerge() : null;
const records = only ? only.out : new Map([...raw.keys()].map(q => [q, record(q)]));
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
  index.push([q, r.label, r.type, r.desc.slice(0, 80), r.total, r.aliases.slice(0, 3), r.tags.map(t => tagIds.get(t)), [...perModule.values()]]);
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
writeFileSync(join(NEW, 'manifest.json'), JSON.stringify({
  generated: new Date().toISOString(), entities: records.size,
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
