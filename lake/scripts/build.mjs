// Builds the JDP-I entity layer ("data lake") behind the Encyclopaedia.
//   node lake/scripts/build.mjs [--retro ../hp-retrospective]
// 1. Collect mentions from every module (adapters.mjs).
// 2. Resolve each mention's key to a Wikidata ID.
// 3. Fetch facts from Wikidata, plus one level of related entities (party, ideology, country, conflicts),
//    so parties and philosophies get pages too.
// 4. Add a plain-text summary per entity (Wikipedia REST API, CC BY-SA; cached in summary-cache.json).
// 5. Write static shards to lake/data/:
//    e/<n>.json   entities by Wikidata number % 512    t/<n>.json   English Wikipedia title → QID
//    index.json   compact search index                 keys.json    module keys (e.g. congress:P000197) → QID
//    manifest.json counts, sources, build time
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTERS } from './adapters.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const jdpiDir = resolve(here, '../..');
const retroArg = process.argv.indexOf('--retro');
const retroDir = resolve(retroArg > 0 ? process.argv[retroArg + 1] : join(jdpiDir, '../hp-retrospective'));
const OUT = join(jdpiDir, 'lake/data');
const UA = { 'User-Agent': 'JDP-I Encyclopaedia (https://jdpi.pages.dev; judep92@gmail.com)' };
const E_SHARDS = 512, T_SHARDS = 256;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const normTitle = t => String(t).replace(/_/g, ' ').trim().replace(/^./, c => c.toUpperCase());
export function titleShard(t) { let h = 2166136261; for (const c of normTitle(t)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % T_SHARDS; }
const entityShard = qid => +qid.slice(1) % E_SHARDS;

async function getJson(url, init = {}) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(1500 * (i + 1));
  }
  throw new Error(`HTTP failure: ${url.slice(0, 120)}`);
}
const wbget = params => getJson('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ...params }));

// ---- 1. Mentions
const mentions = [];
for (const [name, adapter] of Object.entries(ADAPTERS)) {
  try { const m = await adapter({ jdpiDir, retroDir }); mentions.push(...m); console.log(`${name}: ${m.length} mentions`); }
  catch (e) { console.warn(`${name}: skipped (${e.message})`); }
}

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
await fetchEntities([...byQid.keys()]);
// One level of related entities with their own pages (parties, ideologies, countries, conflicts, influences).
const related = new Set();
for (const q of byQid.keys()) { const e = raw.get(q); if (e) for (const p of PAGE_RELATIONS) refIds(e, p).forEach(x => related.add(x)); }
await fetchEntities([...related]);
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

// ---- 4. Summaries (cache shared with the calendar's)
const cachePath = join(here, 'summary-cache.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const calCache = join(jdpiDir, 'calendar/scripts/summary-cache.json');
if (existsSync(calCache)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(calCache, 'utf8')))) if (!(normTitle(k) in cache)) cache[normTitle(k)] = v;
const shorten = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= 600) return t; const c = t.slice(0, 600), e = c.lastIndexOf('. '); return e > 200 ? c.slice(0, e + 1) : c + '…'; };
const needSummary = [...raw.values()].map(e => e.sitelinks?.enwiki?.title).filter(t => t && !(normTitle(t) in cache));
let done = 0;
const queue = [...needSummary];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let t; (t = queue.shift());) {
    const r = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}?redirect=true`).catch(() => null);
    cache[normTitle(t)] = shorten(r?.extract);
    if (++done % 500 === 0) { console.log(`summaries ${done}/${needSummary.length}`); writeFileSync(cachePath, JSON.stringify(cache)); }
  }
}));
writeFileSync(cachePath, JSON.stringify(cache));

// ---- 5. Entity records and shards
const MODULE_ORDER = ['retrospective', 'historical-calendar', 'calendar', 'battlefield-history', 'battlefield', 'kardashev', 'traders', 'learning', 'learning-politics'];
const MODULE_NAMES = { retrospective: 'H&P Retrospective', 'historical-calendar': 'Historical Calendar', calendar: 'Realtime Calendar', 'battlefield-history': 'Retrospective Battlefield', battlefield: 'Realtime Battlefield', kardashev: 'Kardashev Tracker', traders: 'Trader Tracker', learning: 'Learning (F&E)', 'learning-politics': 'Learning (Politics)' };
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
  return {
    q, label: e.labels?.en?.value || title || q, desc: e.descriptions?.en?.value || '', type: typeOf(e),
    aliases: (e.aliases?.en || []).map(a => a.value).slice(0, 6), wiki: title, img: img || null,
    summary: title ? cache[normTitle(title)] || '' : '', facts, rel, mentions: mentionsOut, total: ms.length,
    tags: tagsFor(e, typeOf(e), ms),
  };
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'e'), { recursive: true }); mkdirSync(join(OUT, 't'), { recursive: true });
const eShards = Array.from({ length: E_SHARDS }, () => ({})), tShards = Array.from({ length: T_SHARDS }, () => ({}));
const index = [], typeCounts = {}, tagIds = new Map(), tagList = [];
const tagId = t => { if (!tagIds.has(t)) { tagIds.set(t, tagList.length); tagList.push(t); } return tagIds.get(t); };
for (const q of raw.keys()) {
  const r = record(q);
  eShards[entityShard(q)][q] = r;
  if (r.wiki) tShards[titleShard(r.wiki)][normTitle(r.wiki)] = q;
  // Per module: [module, first place it appears, number of places] — lets search results link straight in.
  const perModule = new Map();
  for (const m of r.mentions) { const x = perModule.get(m.m); if (x) x[2]++; else perModule.set(m.m, [m.m, m.u, 1]); }
  index.push([q, r.label, r.type, r.desc.slice(0, 80), r.total, r.aliases.slice(0, 3), r.tags.map(tagId), [...perModule.values()]]);
  typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
}
// Requested titles that were redirects also map to their entity.
for (const [t, q] of titleToQid) if (raw.has(q)) tShards[titleShard(t)][t] = q;
eShards.forEach((s, i) => writeFileSync(join(OUT, `e/${i}.json`), JSON.stringify(s)));
tShards.forEach((s, i) => writeFileSync(join(OUT, `t/${i}.json`), JSON.stringify(s)));
index.sort((a, b) => b[4] - a[4] || a[1].localeCompare(b[1]));
// index.json: { tags: ["Facet:Value", …], modules: {id: name}, rows: [[qid, label, type, desc, mentions, aliases, tagIds, [[module, url, count]]]] }
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ tags: tagList, modules: MODULE_NAMES, rows: index }));
writeFileSync(join(OUT, 'keys.json'), JSON.stringify(keys));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  generated: new Date().toISOString(), entities: raw.size, withMentions: byQid.size, mentions: mentions.length - unmatched,
  types: typeCounts, shards: { entities: E_SHARDS, titles: T_SHARDS },
  modules: Object.fromEntries(MODULE_ORDER.map(m => [m, mentions.filter(x => x.module === m).length])),
  sources: ['Wikidata (CC0)', 'Wikipedia summaries (CC BY-SA 4.0)', 'JDP-I modules'],
}, null, 1));
console.log(`wrote ${raw.size} entities`, typeCounts);
