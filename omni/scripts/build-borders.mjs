// Builds the Omni-Map's dated borders for every year Cliopatria holds (PRP-SCHOLAR-USP-DESIGN.md 7.3; stage S1 built
// 1400–1600 on 17 November 2026, the whole span followed on 18 November 2026).
//   node --max-old-space-size=6000 omni/scripts/build-borders.mjs --zip <cliopatria.geojson.zip> [--cache <folder>] [--root <folder>]
// --zip is the release's archive, downloaded by hand from the tag (below) to a folder outside the repository; the
// script checks it is that release's byte for byte, and reads the GeoJSON straight out of it (172 MB unpacked, so
// give Node the memory). --cache keeps Wikidata's answers in a folder of your own (never the repository): a run asks
// Wikidata only for the ids the cache lacks, and adds them to it. --root writes into another copy of the site
// (omni/data/... under that folder) instead of this one, to check a build before it replaces the committed files.
//
// The order of steps; it writes nothing until every step has worked:
// 1. Checks the archive's sha256 against v0.2.1's (RELEASE below) and stops if it differs; unpacks its one GeoJSON
//    file in memory, checking its CRC.
// 2. Reads the first and last year the rows hold (v0.2.1: -3400 and 2024) and stops unless SPANS (below) covers
//    exactly those years, with no gap and no overlap. Takes the rows overlapping each span (a row spanning two files is
//    in both), each with a row id: cl- and the first ten hex digits of sha256 of "<Name>|<FromYear>|<ToYear>|<Type>"
//    (stable across runs of one release, whatever script the name is written in), its area (km², rounded) and the box
//    of its geometry as Cliopatria gives it. RELATION rows (vassalages, alliances, unions) are kept; the page draws
//    them as outlines only. Years are Cliopatria's integers, unchanged (it writes BCE years as negative numbers, and
//    six of its rows end at 0; VM's core reads the years as history counts them, with no year 0).
// 3. Turns each span into TopoJSON with topojson-server (3.0.1, a script-only devDependency): a border two rows share
//    becomes one arc, so neighbours never gap or overlap, and coordinates are quantised to 1/100,000 of the file's
//    extent. No point is removed, and no simplifier is used: the largest file, the 1800s, is about 450 KB gzipped,
//    under a third of the design's 1.5 MB limit. The run stops if any file passes the limit (LIMIT_GZ): the owner
//    decided on 17 November 2026 against a simplifier, so a file too large is put to him, never thinned.
// 4. The crosswalk, qids.json (prp-map.js draws a Q-id only through it). (a) Every Wikidata id on a POLITY row is read
//    from Wikidata (wbgetentities: English and multilingual labels and aliases, the English Wikipedia title, and its
//    inception, dissolution, start and end; 50 a request, a second apart, User-Agent "VM build check
//    (https://jdpi.pages.dev)"). An id is used for a row only where one of those names matches the row's Name or
//    Wikipedia phrase (case, accents, punctuation and bracketed parts ignored) and, where Wikidata dates the item, its
//    years meet the row's own years (each row checked alone): basis "cliopatria-wikidata". A mismatch is listed under
//    `rejected` with both names and
//    why, and never used (Cliopatria tags its Kingdom of France rows Q207162, which Wikidata labels the Bourbon
//    Restoration in France and dates 1814–1830, though "Kingdom of France" is among its aliases). Where Wikidata's
//    years meet some of a name's rows and not others, the rows they do not meet are listed under `rejected` with their
//    `years`. The pairs rejected on 17 November 2026 (STAY_REJECTED) stay rejected in every year, by the owner's
//    decision of 18 November 2026, even where Wikidata's years now meet some of their rows.
//    RELATION rows carry the id of one of their parts, so they are not crosswalked. (b) A place in the Master Index
//    (lake/data/e, read from disk as it stands; qids.json records the lake manifest's `generated`) whose label is a
//    POLITY row's Name, and whose founding or dissolution date in the lake overlaps the row's years: basis "name" (so
//    Q70972, the Kingdom of France, reaches its rows).
// 5. Writes omni/data/borders/<from>-<to>.topo.json (a year below zero written m and its digits: m3400-m301.topo.json),
//    index.json and qids.json, and the borders layer's `built` and years in omni/data/layers.json (and its
//    `generated` in omni/data/layers.head.json, which every page's sidebar reads). index.json and
//    qids.json each keep the `built` they have when nothing else in them changes (builtFor), so a run on unchanged
//    inputs writes the same bytes and the views' pins stay. Prints rows, bytes and gzipped bytes per file, and names any
//    .topo.json file in the folder that the index no longer lists (it deletes nothing). Nothing else is written.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, inflateRawSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wikidataDate, bestClaim, yearSpan } from '../../lake/scripts/dates.mjs';
import { writeCatalogue } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
// The release: https://github.com/Seshat-Global-History-Databank/cliopatria/tree/v0.2.1 (tag of 3 October 2026; its
// archive is the file cliopatria.geojson.zip in the tag, git blob a1e7093b64990bf97cd3c31bda96de1cafed822c; Zenodo
// https://doi.org/10.5281/zenodo.23128623). Licence CC BY 4.0 (LICENSE.md at the tag), read 17 November 2026.
export const RELEASE = {
  version: 'v0.2.1',
  archive: 'cliopatria.geojson.zip',
  url: 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/v0.2.1/cliopatria.geojson.zip',
  bytes: 46005176,
  sha256: 'e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4',
  entry: 'cliopatria_polities_only_v021.geojson',
};
// The files, measured on 18 November 2026 before the build: each century of Cliopatria v0.2.1 built alone came to
// between 572 bytes gzipped (3400–3301 BC, one row) and 449,310 (the 1800s, 1,745 rows). Centuries are joined, from the
// first, while the sum of their sizes alone stays within JOIN_GZ, so the slider's early millennia are one small file
// each rather than thirty; no century is split, none needs it. 1400–1499 stays a file of its own, byte for byte the one
// built on 17 November 2026.
export const JOIN_GZ = 200_000;
export const LIMIT_GZ = 1.5 * 1024 * 1024; // the design's limit per file (7.3), gzipped
export const SPANS = [[-3400, -301], [-300, 199], [200, 499], [500, 699], [700, 899], [900, 999], [1000, 1099], [1100, 1199],
  [1200, 1299], [1300, 1399], [1400, 1499], [1500, 1599], [1600, 1699], [1700, 1799], [1800, 1899], [1900, 1999], [2000, 2024]];
export const QUANTISATION = 1e5;
/** A file's name from its years: 1400-1499.topo.json; a year below zero as m and its digits (m3400-m301.topo.json). */
export const fileName = (from, to) => { const y = n => (n < 0 ? `m${-n}` : String(n)); return `${y(from)}-${y(to)}.topo.json`; };
/** The pairs of Cliopatria's ids and names rejected on 17 November 2026, kept rejected in every year (the owner's
 *  decision of 18 November 2026). */
export const STAY_REJECTED = ['Q1074947|Kingdom of Pajana', 'Q10921634|Khoshut Khanate', 'Q112039853|Byzantine Empire',
  'Q1406298|Serbian Empire', 'Q202266|Old Kingdom of Norway', 'Q205662|Tokugawa Shogunate', 'Q207162|(Kingdom of France)',
  'Q207162|Kingdom of France', 'Q213763|County of Béarn', 'Q269109|Ryazan', 'Q28405|Joseon', 'Q29|Kingdom of Spain',
  'Q373981|Tahirid Sultanate', 'Q39|Swiss Confederation', 'Q5582862|Cuzco', 'Q577867|(Kingdom of Poland)',
  'Q577867|Kingdom of Poland', 'Q605051|County of Touraine', 'Q703919|Ngô Dynasty', 'Q751868|County of Brabant',
  'Q79861|Michoacán', 'Q83546|Principality of Vladimir-Suzdal', 'Q918153|Ceylon', 'Q9676|Isle of Man'];
/** The spans checked against the rows' first and last years: an error naming what is wrong, or null. */
export function checkSpans(spans, first, last) {
  const s = [...spans].sort((a, b) => a[0] - b[0]);
  if (!s.length) return 'no spans';
  if (s[0][0] !== first || s.at(-1)[1] !== last) return `the rows hold ${first} to ${last}; SPANS covers ${s[0][0]} to ${s.at(-1)[1]}`;
  for (let i = 0; i < s.length; i++) {
    if (s[i][0] > s[i][1]) return `${s[i][0]}–${s[i][1]} ends before it starts`;
    if (i && s[i][0] !== s[i - 1][1] + 1) return `a gap or an overlap between ${s[i - 1][1]} and ${s[i][0]}`;
  }
  return null;
}
const UA = { 'User-Agent': 'VM build check (https://jdpi.pages.dev)' };
const sha256 = b => createHash('sha256').update(b).digest('hex');
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

/** The row id: cl- and ten hex digits of sha256 of Name|FromYear|ToYear|Type. */
export const rowId = p => `cl-${sha256(Buffer.from(`${p.Name}|${p.FromYear}|${p.ToYear}|${p.Type}`, 'utf8')).slice(0, 10)}`;
/** A name compared with another: no case, accents, punctuation or bracketed parts. */
export const norm = s => String(s ?? '').replace(/_/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const round5 = x => Math.round(x * 1e5) / 1e5;
function boxOf(geometry) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [round5(w), round5(s), round5(e), round5(n)];
}

/** One file out of a zip archive (stored or deflated, no zip64), its CRC checked. */
export function unzipEntry(buf, name) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const entry = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (entry !== name) continue;
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('zip64 is not read here');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    const out = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
    if (!out) throw new Error(`compression method ${method} is not read here`);
    if (out.length !== usize || crc32(out) !== crc) throw new Error(`${name}: size or CRC does not match the archive's record`);
    return out;
  }
  throw new Error(`${name} is not in the archive`);
}

/** Rows of one span as GeoJSON features with VM's short properties. */
export function rowsFor(features, from, to) {
  return features.filter(x => x.properties.FromYear <= to && x.properties.ToYear >= from && x.geometry).map(x => {
    const p = x.properties;
    return { type: 'Feature', properties: { id: rowId(p), n: p.Name, f: p.FromYear, t: p.ToYear, k: p.Type, q: /^Q[1-9]\d*$/.test(p.Wikidata || '') ? p.Wikidata : null,
      a: Math.round(p.Area || 0), w: p.Wikipedia || null, b: boxOf(x.geometry) }, geometry: x.geometry };
  });
}

/** Spans of years, merged where they touch or overlap: [[1402, 1406], [1407, 1421]] → [[1402, 1421]]. */
export function mergeSpans(spans) {
  const out = [];
  for (const [f, t] of [...spans].sort((a, b) => a[0] - b[0])) { const last = out.at(-1); if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t); else out.push([f, t]); }
  return out;
}

/** The names Wikidata gives an item: English and multilingual labels and aliases, and its English Wikipedia title. */
export function namesOf(item) {
  const out = [];
  for (const l of ['en', 'mul']) { if (item?.labels?.[l]) out.push(item.labels[l].value); for (const a of item?.aliases?.[l] || []) out.push(a.value); }
  if (item?.sitelinks?.enwiki?.title) out.push(item.sitelinks.enwiki.title);
  return out;
}

/** The years an item can have existed by Wikidata: from its inception (P571, else start P580) to its dissolution
 *  (P576, else end P582), each widened to its precision (1500 at century precision is 1401–1500); an end it does not
 *  give is open. Null when it gives neither. */
export function itemYears(item) {
  const one = ps => { for (const p of ps) { const d = wikidataDate(bestClaim(item?.claims?.[p])); if (d) return yearSpan(d.v, d.p); } return null; };
  const a = one(['P571', 'P580']), b = one(['P576', 'P582']);
  return a || b ? [a ? a[0] : -Infinity, b ? b[1] : Infinity] : null;
}

/** The crosswalk from the rows, Wikidata's items for their ids and the lake's places. A Cliopatria id is used for a
 *  name only where Wikidata gives the item that name and, where it dates the item, its years meet the rows' years
 *  (Q207162 has "Kingdom of France" among its aliases, but its years are 1814–1830). */
export function crosswalk(rows, items, places, { stay = [] } = {}) {
  const byPair = new Map(); // `${q}|${name}` → { q, name, spans, wiki }
  const kept = new Set(stay);
  for (const r of rows) {
    const p = r.properties;
    if (p.k !== 'POLITY' || !p.q) continue;
    const k = `${p.q}|${p.n}`;
    if (!byPair.has(k)) byPair.set(k, { q: p.q, name: p.n, spans: [], wiki: new Set() });
    const e = byPair.get(k); e.spans.push([p.f, p.t]); if (p.w) e.wiki.add(p.w);
  }
  const entries = {}, rejected = [];
  const add = (q, name, spans, basis) => { (entries[q] ||= []).push(...mergeSpans(spans).map(([from, to]) => ({ name, from, to, basis }))); };
  for (const e of [...byPair.values()].sort((a, b) => a.q.localeCompare(b.q) || a.name.localeCompare(b.name))) {
    const item = items.get(e.q);
    const theirs = new Set(namesOf(item).map(norm)), ours = [e.name, ...e.wiki].map(norm);
    const label = item ? (item.labels?.en?.value || item.labels?.mul?.value || null) : null;
    // Each row's years are checked, then the rows that meet Wikidata's years are merged (and those that do not):
    // merged first, a run of rows reaching into Wikidata's years would carry the rows before them in with it.
    const years = item ? itemYears(item) : null;
    const meets = ([f, t]) => !years || (years[0] <= t && f <= years[1]);
    const met = mergeSpans(e.spans.filter(meets)), unmet = mergeSpans(e.spans.filter(s => !meets(s)));
    const show = y => (Number.isFinite(y) ? y : null);
    const dated = years ? { wikidataYears: [show(years[0]), show(years[1])] } : {};
    if (!item) rejected.push({ q: e.q, name: e.name, wikidataLabel: null, why: 'Wikidata has no such item' });
    else if (!ours.some(n => n && theirs.has(n))) rejected.push({ q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata gives the item another name' });
    else if (!met.length) rejected.push({ q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata dates the item to other years', ...dated });
    else if (kept.has(`${e.q}|${e.name}`)) {
      // Rejected on 17 November 2026, and kept so in every year: the rows Wikidata's years do not meet with that
      // reason, and those they do meet with the decision's.
      const stayWhy = 'VM rejected this id for this name on 17 November 2026 and keeps it rejected in every year (the owner\'s decision of 18 November 2026)';
      rejected.push(unmet.length ? { q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata dates the item to other years', ...dated, years: unmet, kept: { years: met, why: stayWhy } }
        : { q: e.q, name: e.name, wikidataLabel: label, why: stayWhy, ...dated, years: met });
    } else {
      add(e.q, e.name, met, 'cliopatria-wikidata');
      // The rows whose years Wikidata's do not meet: listed, never used.
      if (unmet.length) rejected.push({ q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata dates the item to other years', ...dated, years: unmet });
    }
  }
  // (b) By name, from the Master Index's places.
  const polityRows = new Map();
  for (const r of rows) if (r.properties.k === 'POLITY') (polityRows.get(r.properties.n) || polityRows.set(r.properties.n, []).get(r.properties.n)).push([r.properties.f, r.properties.t]);
  const rejectedPair = new Set(rejected.map(r => `${r.q}|${r.name}`));
  for (const pl of places) {
    const spans = polityRows.get(pl.label);
    if (!spans || rejectedPair.has(`${pl.q}|${pl.label}`) || entries[pl.q]?.some(r => r.name === pl.label)) continue;
    if (pl.from == null && pl.to == null) continue; // no dates in the lake: the years cannot be checked
    const held = spans.filter(([f, t]) => (pl.from == null || pl.from <= t) && (pl.to == null || f <= pl.to));
    if (held.length) add(pl.q, pl.label, held, 'name');
  }
  const sorted = {};
  for (const q of Object.keys(entries).sort((a, b) => +a.slice(1) - +b.slice(1))) sorted[q] = entries[q].sort((a, b) => a.from - b.from || a.name.localeCompare(b.name));
  return { entries: sorted, rejected };
}

const yearOf = v => { const y = parseInt(String(v ?? ''), 10); return Number.isFinite(y) && y !== 0 ? y : null; };
const BORDER_TYPES = new Set(['place', 'polity']);
/** The lake's places and polities (states that no longer exist, typed apart from places on 21 November 2026, so the
 *  crosswalk still matches them by name) with their labels and years (founded, dissolved), read from the committed
 *  shards. A site, a period or any other type is not a border. */
export function lakePlaces(dir = join(ROOT, 'lake/data/e')) {
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    for (const r of Object.values(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
      if (!BORDER_TYPES.has(r?.type) || !r.label) continue;
      out.push({ q: r.q, label: r.label, from: yearOf(r.facts?.founded), to: yearOf(r.facts?.dissolved) });
    }
  }
  return out;
}

/** The readings a crosswalk rests on, from the cache's: { read: the latest, readings: [{ read, ids }] } for the ids
 *  asked, each id counted under the reading that gave it (a cache from before 18 November 2026 has one reading). */
export function readingsOf(cache, ids) {
  const at = new Map();
  for (const r of cache?.readings || [{ read: cache?.read, ids: Object.keys(cache?.items || {}) }]) for (const q of r.ids || []) if (!at.has(q)) at.set(q, r.read);
  const count = new Map();
  for (const q of ids) { const r = at.get(q); if (r) count.set(r, (count.get(r) || 0) + 1); }
  const readings = [...count].map(([read, n]) => ({ read, ids: n })).sort((a, b) => a.read.localeCompare(b.read));
  return { read: readings.at(-1)?.read || null, readings };
}

async function wikidataItems(ids, cacheDir) {
  const items = new Map(), cacheFile = cacheDir ? join(cacheDir, 'cliopatria-qids-wikidata-3.json') : null;
  const DATES = ['P571', 'P576', 'P580', 'P582'];
  const keep = e => ({ id: e.id, labels: e.labels, aliases: e.aliases, sitelinks: e.sitelinks, claims: Object.fromEntries(DATES.filter(p => e.claims?.[p]).map(p => [p, e.claims[p]])) });
  // The cache: { read, items, readings: [{ read, ids }] }. Only the ids it lacks are asked for, and added to it.
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : { read: null, items: {} };
  if (!cache.readings) cache.readings = cache.read ? [{ read: cache.read, ids: Object.keys(cache.items) }] : [];
  const missing = ids.filter(q => !(q in cache.items));
  const read = stamp(), got = new Map();
  if (missing.length) console.log(`Wikidata: ${ids.length - missing.length} of ${ids.length} ids from the cache; asking for ${missing.length}`);
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&formatversion=2&props=labels%7Caliases%7Csitelinks%7Cclaims&languages=en%7Cmul&sitefilter=enwiki&ids=${batch.join('%7C')}`;
    let j = null;
    for (let tries = 0; tries < 4 && !j; tries++) {
      const res = await fetch(u, { headers: UA });
      if (res.status === 429 || res.status >= 500) { const wait = (+res.headers.get('retry-after') || 30) * 1000; console.log(`Wikidata answered ${res.status}: waiting ${wait / 1000} s`); await sleep(wait); continue; }
      if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
      j = await res.json();
    }
    if (!j) throw new Error('Wikidata kept refusing: try later');
    if (j.error) throw new Error(`Wikidata: ${j.error.info}`);
    // A redirected id comes back under its target's id: keep it under the id Cliopatria gives.
    const back = new Map(Object.values(j.entities).filter(e => e.redirects).map(e => [e.redirects.to, e.redirects.from]));
    for (const [k, e] of Object.entries(j.entities)) if (!('missing' in e)) got.set(back.get(k) || k, keep(e));
    console.log(`Wikidata: ${Math.min(i + 50, missing.length)} of ${missing.length} ids read`);
    await sleep(1000);
  }
  if (missing.length) {
    for (const q of missing) cache.items[q] = got.get(q) || null;
    cache.readings.push({ read, ids: missing });
    if (!cache.read) cache.read = read;
    if (cacheFile) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(cache)); }
  }
  for (const q of ids) if (cache.items[q]) items.set(q, cache.items[q]);
  return { items, ...readingsOf(cache, ids) };
}

/** The `built` stamp a file is written with: the one it already has when nothing else in it would change (the same
 *  archive, Wikidata reading and lake give the same bytes, so the pins borders@ and qids@ stay as they were); else
 *  `now`. prev is the file as it stands (parsed, or null); next is what would be written, its own `built` ignored. */
export function builtFor(prev, next, now) {
  if (!prev || typeof prev.built !== 'string') return now;
  const rest = o => JSON.stringify({ ...o, built: null });
  return rest(prev) === rest(next) ? prev.built : now;
}
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/** The borders layer's entry in the catalogue: its build and years (the text is written by hand). */
export function updateLayer(file, id, fields) {
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  const l = cat.layers.find(x => x.id === id);
  if (!l) throw new Error(`${file} has no layer ${id}`);
  Object.assign(l, { built: fields.built }); Object.assign(l.time, fields.time);
  if (typeof fields.method === 'string') l.method = fields.method; // a builder whose rows say what its method is (S5b's battles)
  cat.generated = cat.layers.map(x => x.built).filter(Boolean).sort().at(-1);
  // With its head beside it (omni/data/layers.head.json: only `generated`, which every page's sidebar reads).
  writeCatalogue(file, cat);
}

async function main() {
  const zip = arg('--zip');
  if (!zip) { console.error('Usage: node --max-old-space-size=6000 omni/scripts/build-borders.mjs --zip <cliopatria.geojson.zip> [--cache <folder>] [--root <folder>]'); process.exit(2); }
  const site = resolve(arg('--root') || ROOT);
  const OUT = join(site, 'omni/data/borders'), LAYERS = join(site, 'omni/data/layers.json');
  const buf = readFileSync(zip);
  if (buf.length !== RELEASE.bytes || sha256(buf) !== RELEASE.sha256) { console.error(`${zip} is not Cliopatria ${RELEASE.version}'s archive (sha256 ${sha256(buf)}): stopping`); process.exit(1); }
  // topojson-server is loaded here, not at the top, so the pure steps above can be imported (and tested) without it.
  const { topology } = await import('topojson-server');
  const geo = JSON.parse(unzipEntry(buf, RELEASE.entry).toString('utf8'));
  const withShape = geo.features.filter(x => x.geometry);
  let first = Infinity, last = -Infinity;
  for (const x of withShape) { first = Math.min(first, x.properties.FromYear); last = Math.max(last, x.properties.ToYear); }
  console.log(`Cliopatria ${RELEASE.version}: ${geo.features.length} rows, from ${first} to ${last}`);
  const wrong = checkSpans(SPANS, first, last);
  if (wrong) { console.error(`SPANS does not fit the release: ${wrong}. Stopping; nothing written.`); process.exit(1); }
  const now = stamp(), files = [], all = new Map();
  for (const [from, to] of SPANS) {
    const rows = rowsFor(geo.features, from, to);
    const ids = new Set(rows.map(r => r.properties.id));
    if (ids.size !== rows.length) throw new Error(`${from}-${to}: two rows share an id`);
    const topo = topology({ borders: { type: 'FeatureCollection', features: rows } }, QUANTISATION);
    topo.vm = { format: 'vm-borders/1', source: 'cliopatria', version: RELEASE.version, from, to };
    const text = JSON.stringify(topo), bytes = Buffer.from(text, 'utf8');
    const file = fileName(from, to), gzip = gzipSync(bytes, { level: 9 }).length;
    console.log(`${file}: ${rows.length} rows, ${bytes.length} bytes, ${gzip} gzipped`);
    // Over the limit: stop and say so (no simplifier: the owner's decision of 17 November 2026).
    if (gzip > LIMIT_GZ) { console.error(`${file} is ${gzip} bytes gzipped, over the limit of ${LIMIT_GZ}. Stopping; nothing written.`); process.exit(1); }
    files.push({ from, to, file, rows: rows.length, bytes: bytes.length, gzip, sha256: sha256(bytes), text });
    for (const r of rows) all.set(r.properties.id, r); // a row in two files is counted once
  }
  const rows = [...all.values()];
  const qs = [...new Set(rows.filter(r => r.properties.k === 'POLITY' && r.properties.q).map(r => r.properties.q))].sort();
  const { items, read, readings } = await wikidataItems(qs, arg('--cache'));
  // The Master Index as it stands on disk (another job may be rebuilding it): its build time is recorded.
  const lake = readJson(join(ROOT, 'lake/data/manifest.json'));
  const places = lakePlaces();
  const { entries, rejected } = crosswalk(rows, items, places, { stay: STAY_REJECTED });
  mkdirSync(OUT, { recursive: true });
  for (const f of files) { writeFileSync(join(OUT, f.file), f.text); delete f.text; }
  // Each file keeps its `built` where its content is unchanged (builtFor), so a second run on the same inputs writes
  // the same bytes; the layer's `built` is the later of the two.
  const index = { format: 'vm-borders-index/1', source: 'cliopatria', version: RELEASE.version, built: null, from: first, to: last,
    archive: { url: RELEASE.url, sha256: RELEASE.sha256 }, quantisation: QUANTISATION, files };
  index.built = builtFor(readJson(join(OUT, 'index.json')), index, now);
  const qids = { format: 'vm-qids/1', version: `cliopatria@${RELEASE.version}`, built: null, wikidata: { read, ids: qs.length, readings },
    lake: { generated: lake?.generated || null, places: places.length }, entries, rejected };
  qids.built = builtFor(readJson(join(OUT, 'qids.json')), qids, now);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  writeFileSync(join(OUT, 'qids.json'), JSON.stringify(qids, null, 1) + '\n');
  const total = files.reduce((a, f) => ({ bytes: a.bytes + f.bytes, gzip: a.gzip + f.gzip }), { bytes: 0, gzip: 0 });
  console.log(`${files.length} files, ${total.bytes} bytes, ${total.gzip} gzipped`);
  console.log(`qids.json: ${Object.keys(entries).length} Q-ids, ${rejected.length} rejections; the lake as built ${lake?.generated} (${places.length} places)`);
  const listed = new Set(files.map(f => f.file));
  const stale = readdirSync(OUT).filter(f => f.endsWith('.topo.json') && !listed.has(f));
  if (stale.length) console.log(`No longer in the index, to be removed by hand: ${stale.join(', ')}`);
  updateLayer(LAYERS, 'borders', { built: [index.built, qids.built].sort().at(-1), time: { from: first, to: last } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
