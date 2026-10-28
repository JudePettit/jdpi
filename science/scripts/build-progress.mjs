// Timeline of Progress (PRP · Natural Science): enrich the curated canon (progress-seed.mjs) with facts from
// Wikidata and write science/progress/data/events.json.
//   node science/scripts/build-progress.mjs [--refresh] [--offline]
//
// 1. Resolve every name in the seed (discoveries, people, curated places) to a Wikidata item through English
//    Wikipedia (normalised titles, redirects and disambiguation flags), 50 titles per request.
// 2. Fetch the items with wbgetentities, 50 per request: discoveries (P189 location of discovery, P625, dates), people
//    (P569/P570 life, P27 citizenship, P106 occupation, P101 field, P108 employer, P1416 affiliation, P69 educated at
//    and P937 work location with their start/end qualifiers, P19 birthplace), then the institutions and places they
//    point to (labels, P625; P159/P276/P131 when an institution has no coordinates of its own), then the labels of
//    countries, occupations and fields.
// 3. Validate: each item's label must match the seed's name, people must be people and alive around their
//    breakthrough, places must have coordinates. Mismatches are logged and fixed through a Wikidata search, or dropped.
// 4. Place each event on the map (choosePlace in progress-lib.mjs: location of discovery, the discoverer's institution
//    at the time, their main institution, birthplace, the seed's fallback) and record the rule as positionBasis.
//    The seed's hand-set place anchors the person-based rules: an institution or birthplace more than ANCHOR_KM from
//    it is skipped, since Wikidata often lists later or honorary posts without dates. Locations of discovery that are
//    whole countries are not used; discovery sites far from the hand-set place are logged for review.
// 5. Write events.json: events, plus people and institution lookups.
// Answers are cached in progress-cache.json (compact, per item, with the date fetched). --refresh refetches anything
// older than 25 days (the monthly workflow uses it); --offline builds from the cache alone.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './progress-seed.mjs';
import { DISCIPLINES, BASIS, ANCHOR_KM, parseRef, nameMatches, choosePlace, eventInstitutions, looksInstitutional, seedProblems, distanceKm } from './progress-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const CACHE_FILE = join(here, 'progress-cache.json');
const OUT_FILE = join(ROOT, 'science/progress/data/events.json');
const UA = { 'User-Agent': 'PRP-TimelineOfProgress/1.0 (https://jdpi.pages.dev/science/progress/; monthly Wikidata enrichment of a curated list) Node.js' };
const WD = 'https://www.wikidata.org/w/api.php', WP = 'https://en.wikipedia.org/w/api.php';
const EARTH = 'http://www.wikidata.org/entity/Q2', HUMAN = 'Q5';
const DISAMBIGUATION = ['Q4167410', 'Q22808320']; // disambiguation page; human name disambiguation page
const NOT_A_DISCOVERY = ['Q3331189', 'Q13442814', HUMAN]; // an edition or translation, a scholarly article, a person
// A person found by searching (not by the seed's own title) must be described like someone in science or invention.
const SCIENCE = /scien|physic|chemi|biolog|astronom|mathemat|engineer|invent|physician|surgeon|doctor|naturalist|geolog|botan|zoolog|anatom|philosoph|medic|research|professor|academic|scholar|polymath|explor|aviat|astronaut|cosmonaut|comput|programm|genetic|pharmac|psycholog|meteorolog|oceanograph|pal(a)?eont|archaeolog|anthropolog|crystallograph|statistic|architect|technolog|biochem|neuro|cartograph|metallurg|clockmaker|instrument|optic/i;
const PROPS = ['P31', 'P189', 'P625', 'P575', 'P585', 'P571', 'P577', 'P569', 'P570', 'P27', 'P106', 'P101', 'P108', 'P1416', 'P69', 'P937', 'P19', 'P131', 'P159', 'P276'];

const argv = process.argv.slice(2);
const REFRESH = argv.includes('--refresh'), OFFLINE = argv.includes('--offline'), MAX_AGE_DAYS = 25;
const TODAY = new Date().toISOString().slice(0, 10), THIS_YEAR = new Date().getUTCFullYear();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const uniq = a => [...new Set(a.filter(Boolean))];
const ageDays = d => (Date.parse(TODAY) - Date.parse(d || '1970-01-01')) / 864e5;
const fresh = x => !!x && (!REFRESH || ageDays(x.t) < MAX_AGE_DAYS);
const r3 = x => Math.round(x * 1e3) / 1e3;
const cap = s => String(s ?? '').replace(/^./, c => c.toUpperCase()); // Wikidata labels of concepts start lower-case

// ---------------------------------------------------------------- cache
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
for (const k of ['titles', 'items', 'labels', 'search']) cache[k] ||= {};
const items = cache.items;
function saveCache() {
  // One entry per line, keys sorted: monthly refreshes give small, readable diffs.
  const part = o => `{\n${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(',\n')}\n}`;
  writeFileSync(CACHE_FILE, `{"version":1,\n"titles":${part(cache.titles)},\n"items":${part(cache.items)},\n"labels":${part(cache.labels)},\n"search":${part(cache.search)}}\n`);
}

// ---------------------------------------------------------------- HTTP (polite: one request at a time, paced, maxlag)
let calls = 0;
async function api(base, params) {
  if (OFFLINE) throw new Error(`--offline, but this is not cached: ${params.action} ${String(params.ids || params.titles || params.search).slice(0, 80)}`);
  const url = `${base}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let attempt = 1; ; attempt++) {
    if (calls++) await sleep(400);
    try {
      const res = await fetch(url, { headers: UA });
      const wait = +res.headers.get('retry-after') || 0;
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { wait });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error?.code === 'maxlag') throw Object.assign(new Error('maxlag'), { wait: Math.max(wait, 5) });
      if (j.error) throw new Error(`${j.error.code}: ${j.error.info}`);
      return j;
    } catch (err) {
      if (attempt >= 6) throw err;
      await sleep(Math.max(err.wait || 0, 2 * attempt) * 1000);
    }
  }
}
// The API separates values with "|"; a value that contains one (a few Wikipedia titles do) needs the U+001F form.
const multi = vals => (vals.some(v => v.includes('|')) ? `\x1f${vals.join('\x1f')}` : vals.join('|'));

/**
 * English Wikipedia titles → { q, title, src, dab?, frag? } in cache.titles. First Wikidata's own sitelinks (exact
 * titles; this also finds people whose article is an intentional redirect, such as each of the Wright brothers), then
 * English Wikipedia for the rest (normalised titles and redirects).
 */
async function resolveTitles(titles) {
  const todo = uniq(titles).filter(t => !fresh(cache.titles[t]) || !cache.titles[t].src);
  const rest = [];
  for (const batch of chunks(todo, 50)) {
    const j = await api(WD, { action: 'wbgetentities', sites: 'enwiki', titles: multi(batch), props: 'sitelinks', sitefilter: 'enwiki', maxlag: '5' });
    const found = new Map();
    for (const e of Object.values(j.entities || {})) if (/^Q\d+$/.test(e.id || '') && e.sitelinks?.enwiki?.title) found.set(e.sitelinks.enwiki.title, e.id);
    for (const t of batch) { const q = found.get(t); if (q) cache.titles[t] = { t: TODAY, src: 'wikidata', q, title: t }; else rest.push(t); }
  }
  for (const batch of chunks(rest, 50)) {
    const j = await api(WP, { action: 'query', formatversion: '2', redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item|disambiguation', titles: multi(batch) });
    const step = new Map(), frag = new Map();
    for (const x of j.query?.normalized || []) step.set(x.from, x.to);
    for (const x of j.query?.redirects || []) { step.set(x.from, x.to); if (x.tofragment) frag.set(x.from, x.tofragment); }
    const pages = new Map((j.query?.pages || []).map(p => [p.title, p]));
    for (const t of batch) {
      let cur = t, f = null;
      for (let i = 0; i < 5 && step.has(cur); i++) { f = frag.get(cur) || f; cur = step.get(cur); }
      const p = pages.get(cur), ok = p && !p.missing && !p.invalid;
      cache.titles[t] = { t: TODAY, src: 'wikipedia', q: (ok && p.pageprops?.wikibase_item) || null, ...(ok ? { title: p.title } : {}),
        ...(ok && p.pageprops && 'disambiguation' in p.pageprops ? { dab: 1 } : {}), ...(f ? { frag: f } : {}) };
    }
  }
}

// ---------------------------------------------------------------- Wikidata items, stored compactly
const timeYear = t => { const m = /^([+-]?)(\d+)-/.exec(t || ''); return m ? (m[1] === '-' ? -1 : 1) * +m[2] : null; };  // JSON years are historical: -0384 = 384 BC
function statement(s) {
  const dv = s.mainsnak?.datavalue;
  if (s.mainsnak?.snaktype !== 'value' || !dv) return null;
  const st = {};
  if (dv.type === 'wikibase-entityid') st.q = dv.value.id;
  else if (dv.type === 'time') { st.y = timeYear(dv.value.time); st.pr = dv.value.precision; }
  else if (dv.type === 'globecoordinate') { if (dv.value.globe && dv.value.globe !== EARTH) return null; st.ll = [r3(dv.value.latitude), r3(dv.value.longitude)]; }
  else return null;
  const qual = p => { const x = s.qualifiers?.[p]?.find(z => z.snaktype === 'value'); return x ? timeYear(x.datavalue?.value?.time) : null; };
  const a = qual('P580'), b = qual('P582'), pt = qual('P585');
  if (a != null) st.s = a;
  if (b != null) st.e = b;
  if (pt != null && a == null && b == null) st.s = st.e = pt;
  if (s.rank === 'preferred') st.preferred = 1;
  return st;
}
function compact(e) {
  const out = { t: TODAY, l: e.labels?.en?.value || e.labels?.mul?.value || null };
  if (e.descriptions?.en?.value) out.d = e.descriptions.en.value;
  const al = uniq([...(e.aliases?.en || []), ...(e.aliases?.mul || [])].map(a => a.value)).slice(0, 8);
  if (al.length) out.a = al;
  if (e.sitelinks?.enwiki?.title) out.w = e.sitelinks.enwiki.title;
  const c = {};
  for (const p of PROPS) {
    const list = (e.claims?.[p] || []).filter(s => s.rank !== 'deprecated').map(statement).filter(Boolean);
    if (list.length) c[p] = list.slice(0, 40);
  }
  if (Object.keys(c).length) out.c = c;
  return out;
}
async function fetchItems(qids) {
  const todo = uniq(qids).filter(q => /^Q\d+$/.test(q) && !fresh(items[q]));
  for (const batch of chunks(todo, 50)) {
    const j = await api(WD, { action: 'wbgetentities', ids: batch.join('|'), props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en|mul', sitefilter: 'enwiki', maxlag: '5' });
    for (const q of batch) { const e = j.entities?.[q]; items[q] = !e || 'missing' in e ? { t: TODAY, missing: 1 } : compact(e); }
    process.stdout.write('.');
  }
}
async function fetchLabels(qids) {
  const todo = uniq(qids).filter(q => /^Q\d+$/.test(q) && !items[q]?.l && !fresh(cache.labels[q]));
  for (const batch of chunks(todo, 50)) {
    const j = await api(WD, { action: 'wbgetentities', ids: batch.join('|'), props: 'labels', languages: 'en|mul', maxlag: '5' });
    for (const q of batch) { const e = j.entities?.[q]; cache.labels[q] = { t: TODAY, l: e?.labels?.en?.value || e?.labels?.mul?.value || null }; }
  }
}
async function searchItems(name) {
  const key = name.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  if (!fresh(cache.search[key])) {
    const j = await api(WD, { action: 'wbsearchentities', search: key, language: 'en', type: 'item', limit: '10' });
    cache.search[key] = { t: TODAY, ids: (j.search || []).map(s => s.id) };
  }
  return cache.search[key].ids;
}

// ---------------------------------------------------------------- reading items
const claims = (q, p) => items[q]?.c?.[p] || [];
const pick = sts => sts.find(s => s.preferred) || sts[0];
const has = (q, p, v) => claims(q, p).some(s => s.q === v);
const label = q => items[q]?.l || cache.labels[q]?.l || items[q]?.w || null;
const namesOf = q => [items[q]?.l, items[q]?.w, ...(items[q]?.a || [])];
/** A year from a time property, if it is given at least to the precision asked for (9 = year, 7 = century). */
const yearOf = (q, p, minPrecision = 0) => { const s = pick(claims(q, p).filter(x => x.y != null && (x.pr ?? 9) >= minPrecision)); return s ? s.y : null; };
/** Coordinates of an item: its own (P625), or those of its headquarters, location or administrative area. */
function coordOf(q, hop = 0) {
  if (!items[q] || items[q].missing) return null;
  const own = pick(claims(q, 'P625').filter(s => s.ll));
  if (own) return own.ll;
  if (hop) return null;
  for (const p of ['P159', 'P276', 'P131']) for (const s of claims(q, p)) { const ll = s.q && coordOf(s.q, 1); if (ll) return ll; }
  return null;
}
const hopTargets = qs => qs.filter(q => items[q] && !items[q].missing && !claims(q, 'P625').some(s => s.ll)).flatMap(q => ['P159', 'P276', 'P131'].flatMap(p => claims(q, p).map(s => s.q)));
const placeMemo = new Map();
function place(q) {
  if (!q) return null;
  if (!placeMemo.has(q)) {
    const ll = coordOf(q);
    placeMemo.set(q, ll ? { lat: ll[0], lon: ll[1], label: label(q) || q, inst: looksInstitutional(items[q].l, items[q].d) } : null);
  }
  return placeMemo.get(q);
}
const INST_PROPS = ['P108', 'P1416', 'P69'], PLACE_PROPS = [...INST_PROPS, 'P937', 'P19'];
/** Everything people point to (institutions, work places, birthplaces), then their headquarters/locations for coordinates. */
async function fetchPlacesOf(qs) {
  await fetchItems(qs.flatMap(q => PLACE_PROPS.flatMap(p => claims(q, p).map(s => s.q))).concat(qs.flatMap(q => claims(q, 'P189').map(s => s.q))));
  const all = qs.flatMap(q => [q, ...PLACE_PROPS.flatMap(p => claims(q, p).map(s => s.q)), ...claims(q, 'P189').map(s => s.q)]);
  await fetchItems(hopTargets(uniq(all)));
}

// ---------------------------------------------------------------- 0. the seed
const seedBad = SEED.map(e => [e.id, seedProblems(e)]).filter(([, p]) => p.length);
if (seedBad.length) throw new Error(`Seed problems: ${JSON.stringify(seedBad)}`);
const dupes = SEED.map(e => e.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) throw new Error(`Duplicate ids: ${dupes.join(', ')}`);

// A ref is one name in the seed to resolve: an item (the discovery), a person, or a place.
const refs = new Map();
function ref(kind, raw, e) {
  const k = `${kind}|${raw}`;
  if (!refs.has(k)) { const { qid, name } = parseRef(raw); refs.set(k, { kind, raw, qid, name: name || raw, years: [], events: [], q: null }); }
  const r = refs.get(k);
  r.years.push(e.y); r.events.push(e.id);
  return r;
}
const refOf = (kind, raw) => (raw ? refs.get(`${kind}|${raw}`) : null);
const itemRaw = e => (e.q ? `${e.q} ${e.w || e.t}` : e.w);
for (const e of SEED) {
  if (itemRaw(e)) ref('item', itemRaw(e), e);
  for (const p of e.p) ref('person', p, e);
  for (const pl of [e.at, e.fb]) if (pl) ref('place', pl, e);
}
const R = [...refs.values()];
console.log(`Seed: ${SEED.length} events; ${R.filter(r => r.kind === 'item').length} discovery items, ${R.filter(r => r.kind === 'person').length} people, ${R.filter(r => r.kind === 'place').length} places to resolve`);

// ---------------------------------------------------------------- 1–2. resolve and fetch
await resolveTitles(R.filter(r => !r.qid).map(r => r.name));
for (const r of R) r.cand = r.qid || cache.titles[r.name]?.q || null;
await fetchItems(R.map(r => r.cand));
await fetchPlacesOf(R.filter(r => r.kind !== 'place').map(r => r.cand).filter(Boolean));
await fetchItems(hopTargets(R.filter(r => r.kind === 'place').map(r => r.cand).filter(Boolean)));
saveCache();

// ---------------------------------------------------------------- 3. validate, fix, log
const seedById = new Map(SEED.map(e => [e.id, e]));
for (const r of R) r.loose = r.events.some(id => seedById.get(id).ca) || Math.min(...r.years) < 1500; // dates approximate
/** Why q is not an acceptable item for ref r (null when it is). */
function why(r, q) {
  if (!q) return 'no English Wikipedia article or Wikidata item';
  const it = items[q];
  if (!it || it.missing) return `${q} is missing on Wikidata`;
  if (DISAMBIGUATION.some(v => has(q, 'P31', v))) return `${q} is a disambiguation page`;
  if (!nameMatches(r.name, namesOf(q))) return `${q} is “${it.l}”, not “${r.name}”`;
  if (r.kind === 'person') {
    // A QID written into the seed is the curator's choice (it may be a group, such as the Banū Mūsā brothers).
    if (!has(q, 'P31', HUMAN) && q !== r.qid) return `${q} (“${it.l}”) is not a person`;
    const b = yearOf(q, 'P569', 9), d = yearOf(q, 'P570', 9), y0 = Math.min(...r.years), y1 = Math.max(...r.years);
    if (b != null && b > y0 + (r.loose ? 25 : -10)) return `${q} (“${it.l}”) was born in ${b}, too late for ${y0}`;
    if (d != null && d < y1 - (r.loose ? 150 : 30)) return `${q} (“${it.l}”) died in ${d}, long before ${y1}`;
  }
  if (r.kind === 'place' && !coordOf(q)) return `${q} (“${it.l}”) has no coordinates`;
  return null;
}
/** A search result must also pass stricter checks than the seed's own title (namesakes are common). */
function whyFound(r, q) {
  const w = why(r, q);
  if (w) return w;
  if (r.kind === 'person') {
    if (yearOf(q, 'P569') == null && yearOf(q, 'P570') == null) return `${q} has no life dates`;
    if (!SCIENCE.test(items[q].d || '')) return `${q} is described as “${items[q].d || '—'}”`;
  }
  if (r.kind === 'item' && NOT_A_DISCOVERY.some(v => has(q, 'P31', v))) return `${q} is an edition, an article or a person`;
  return null;
}
const report = { fixed: [], dropped: [], redirected: [], years: [] };
let failing = R.filter(r => why(r, r.cand));
for (const r of R) if (!why(r, r.cand)) r.q = r.cand;
// Explicit QIDs that do not match their name: try the name as a Wikipedia title first.
await resolveTitles(failing.filter(r => r.qid).map(r => r.name));
await fetchItems(failing.filter(r => r.qid).map(r => cache.titles[r.name]?.q));
for (const r of failing.filter(r => r.qid)) {
  const q = cache.titles[r.name]?.q;
  if (q && !why(r, q)) { report.fixed.push(`${r.kind} “${r.name}”: ${r.qid} → ${q} (${why(r, r.qid)}; found by Wikipedia title)`); r.q = q; }
}
// Then search Wikidata and take the first candidate (those with an English Wikipedia article first) that passes.
for (const r of failing.filter(r => !r.q)) {
  const ids = await searchItems(r.name);
  await fetchItems(ids);
  if (r.kind === 'place') await fetchItems(hopTargets(ids));
  const q = [...ids].sort((a, b) => !!items[b]?.w - !!items[a]?.w).find(x => !whyFound(r, x));
  const reason = why(r, r.cand);
  if (q) { report.fixed.push(`${r.kind} “${r.name}” (${r.events.join(', ')}): ${r.cand || '—'} → ${q} “${label(q)}”, ${items[q].d || 'no description'} (${reason}; found by Wikidata search)`); r.q = q; }
  else report.dropped.push(`${r.kind} “${r.name}” (${r.events.join(', ')}): ${reason}`);
}
for (const r of R) if (r.q && r.kind === 'person' && cache.titles[r.name]?.title && cache.titles[r.name].title !== r.name && r.q === cache.titles[r.name].q) report.redirected.push(`${r.name} → ${cache.titles[r.name].title}`);
const peopleQ = uniq(R.filter(r => r.kind === 'person').map(r => r.q));
await fetchPlacesOf(uniq([...peopleQ, ...R.filter(r => r.kind === 'item').map(r => r.q)]));
await fetchLabels(peopleQ.flatMap(q => ['P27', 'P106', 'P101'].flatMap(p => claims(q, p).map(s => s.q))));
saveCache();

// ---------------------------------------------------------------- 4. place every event
const sts = (q, p) => claims(q, p).filter(s => s.q).map(({ q: v, s, e, preferred }) => ({ q: v, s, e, preferred }));
const personModel = q => ({ qid: q, born: yearOf(q, 'P569'), died: yearOf(q, 'P570'), employer: sts(q, 'P108'), affiliation: sts(q, 'P1416'),
  educated: sts(q, 'P69'), work: sts(q, 'P937'), birthplace: claims(q, 'P19').map(s => s.q).filter(Boolean) });
const shared = new Map();
for (const q of peopleQ) for (const v of uniq([...sts(q, 'P108'), ...sts(q, 'P1416')].map(s => s.q))) shared.set(v, (shared.get(v) || 0) + 1);
const weight = q => shared.get(q) || 0;

// A location of discovery that is a whole country or continent says too little to place a dot.
const COARSE = ['Q6256', 'Q3624078', 'Q7275', 'Q5107', 'Q9430'];
const coarse = q => COARSE.some(v => has(q, 'P31', v));
const events = [], usedPeople = new Set(), usedInst = new Set(), basisCount = {};
report.review = [];
for (const e of SEED) {
  const item = refOf('item', itemRaw(e))?.q || null;
  const loc = item ? claims(item, 'P189').map(s => s.q).filter(Boolean) : [];
  if (loc.some(coarse)) report.review.push(`${e.id}: location of discovery ${loc.filter(coarse).map(label).join(', ')} is a country or larger; not used`);
  const ev = { year: e.y, at: refOf('place', e.at)?.q, fb: refOf('place', e.fb)?.q,
    item: item ? { qid: item, label: label(item), loc: loc.filter(q => !coarse(q)), coord: pick(claims(item, 'P625').filter(s => s.ll))?.ll } : null };
  const people = uniq(e.p.map(p => refOf('person', p)?.q));
  const models = people.map(personModel);
  const chosen = choosePlace(ev, models, place, weight);
  if (!chosen) { report.dropped.push(`event ${e.id}: no position found`); continue; }
  // A site placed by its own coordinates is named after a place there (its location, or the seed's place) rather than
  // by the item's label ("discovery of nuclear fission"); a location far away is where an object is kept now.
  const anchor = place(ev.fb), km = q => { const p = place(q); return p ? distanceKm([chosen.lat, chosen.lon], [p.lat, p.lon]) : Infinity; };
  if (chosen.basis === 'site') {
    const here = [...claims(item, 'P276').map(s => s.q), ev.fb].find(q => q && km(q) <= 25);
    chosen.name = here ? label(here) : chosen.name.replace(/^./, c => c.toUpperCase());
  }
  if (anchor && ['discovery', 'site'].includes(chosen.basis) && km(ev.fb) > 25)
    report.review.push(`${e.id}: ${chosen.basis} “${chosen.name}” is ${Math.round(distanceKm([chosen.lat, chosen.lon], [anchor.lat, anchor.lon]))} km from the seed’s place “${e.fb}”`);
  const inst = eventInstitutions(ev, models, place, chosen).filter(q => label(q));
  if (item) {
    const wy = ['P575', 'P585', 'P577', 'P571'].map(p => yearOf(item, p, 9)).find(y => y != null);
    if (wy != null && Math.abs(wy - e.y) > (e.y > 1500 ? 3 : 60)) report.years.push(`${e.id}: seed ${e.y}, Wikidata ${wy} (${label(item)})`);
  }
  basisCount[chosen.basis] = (basisCount[chosen.basis] || 0) + 1;
  people.forEach(q => usedPeople.add(q));
  inst.forEach(q => usedInst.add(q));
  if (['shared-institution', 'institution-at-time', 'institution', 'education'].includes(chosen.basis) || (chosen.basis !== 'birthplace' && place(chosen.qid)?.inst)) usedInst.add(chosen.qid);
  const wiki = item ? items[item].w : (e.w && cache.titles[e.w]?.q && !cache.titles[e.w]?.dab ? e.w : null);
  events.push({
    id: e.id, y: e.y, ...(e.ca ? { ca: 1 } : {}), d: e.d.split(/\s+/), t: e.t, n: e.n,
    ...(item ? { q: item } : {}), ...(wiki ? { w: wiki } : {}),
    place: { q: chosen.qid, n: cap(chosen.name), lat: r3(chosen.lat), lon: r3(chosen.lon) },
    positionBasis: chosen.basis, ...(chosen.via ? { via: chosen.via } : {}),
    people, inst,
  });
}
events.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));

// ---------------------------------------------------------------- 5. lookups and output
const labelsOf = (q, p, n) => uniq([...claims(q, p)].sort((a, b) => (b.preferred || 0) - (a.preferred || 0)).map(s => label(s.q)).filter(l => l && !/^Q\d+$/.test(l))).slice(0, n);
const people = {};
for (const q of [...usedPeople].sort((a, b) => +a.slice(1) - +b.slice(1))) {
  const it = items[q];
  const inst = uniq(INST_PROPS.flatMap(p => [...sts(q, p)].sort((a, b) => (b.preferred || 0) - (a.preferred || 0)).map(s => s.q))).filter(v => label(v)).slice(0, 8);
  inst.forEach(v => usedInst.add(v));
  // approx: Wikidata gives the birth or death only to the decade or century.
  const approx = ['P569', 'P570'].some(p => { const s = pick(claims(q, p).filter(x => x.y != null)); return s && (s.pr ?? 9) < 9; });
  people[q] = { name: it.l || it.w, ...(it.w ? { wiki: it.w } : {}), ...(it.d ? { desc: it.d } : {}),
    ...(yearOf(q, 'P569') != null ? { born: yearOf(q, 'P569') } : {}), ...(yearOf(q, 'P570') != null ? { died: yearOf(q, 'P570') } : {}), ...(approx ? { approx: 1 } : {}),
    country: labelsOf(q, 'P27', 2), occupation: labelsOf(q, 'P106', 4), field: labelsOf(q, 'P101', 4), inst };
}
const institutions = {};
for (const q of [...usedInst].sort((a, b) => +a.slice(1) - +b.slice(1))) {
  const it = items[q] || {}, ll = coordOf(q);
  institutions[q] = { name: cap(label(q)), ...(ll ? { lat: r3(ll[0]), lon: r3(ll[1]) } : {}), ...(it.w ? { wiki: it.w } : {}), ...(it.d ? { desc: it.d.slice(0, 140) } : {}) };
}

const out = {
  generated: new Date().toISOString(),
  firstYear: -3000, lastYear: THIS_YEAR,
  source: 'Wikidata (CC0), via wbgetentities; selection, titles and notes by PRP',
  disciplines: DISCIPLINES, basis: BASIS,
  counts: { events: events.length, people: Object.keys(people).length, institutions: Object.keys(institutions).length, positionBasis: basisCount },
  events, people, institutions,
};
mkdirSync(dirname(OUT_FILE), { recursive: true });
const text = JSON.stringify(out);
writeFileSync(OUT_FILE, text);
saveCache();

console.log(`\n${calls} API requests. Wrote ${OUT_FILE} (${(text.length / 1024).toFixed(0)} KB): ${events.length} events, ${Object.keys(people).length} people, ${Object.keys(institutions).length} institutions.`);
console.log('Positions:', Object.entries(basisCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
for (const [k, list] of Object.entries(report)) if (list.length) console.log(`\n${k} (${list.length}):\n  ${list.join('\n  ')}`);
if (text.length > 1.5 * 1024 * 1024) { console.error('events.json is over 1.5 MB'); process.exitCode = 1; }
