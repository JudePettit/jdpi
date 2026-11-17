// Builds the Omni-Map's dated borders for 1400–1600 from Cliopatria (PRP-SCHOLAR-USP-DESIGN.md 7.3, stage S1).
//   node --max-old-space-size=6000 omni/scripts/build-borders.mjs --zip <cliopatria.geojson.zip> [--cache <folder>]
// --zip is the release's archive, downloaded by hand from the tag (below) to a folder outside the repository; the
// script checks it is that release's byte for byte, and reads the GeoJSON straight out of it (172 MB unpacked, so
// give Node the memory). --cache keeps Wikidata's answers in a folder of your own (never the repository), so a second
// run asks Wikidata nothing.
//
// The order of steps; it writes nothing until every step has worked:
// 1. Checks the archive's sha256 against v0.2.1's (RELEASE below) and stops if it differs; unpacks its one GeoJSON
//    file in memory, checking its CRC.
// 2. Takes the rows overlapping each span (SPANS: 1400–1499, 1500–1600; a row spanning both is in both), each with a
//    row id: cl- and the first ten hex digits of sha256 of "<Name>|<FromYear>|<ToYear>|<Type>" (stable across runs of
//    one release, whatever script the name is written in), its area (km², rounded) and the box of its geometry as
//    Cliopatria gives it. RELATION rows (vassalages, alliances, unions) are kept; the page draws them as outlines only.
// 3. Turns each span into TopoJSON with topojson-server (3.0.1, a script-only devDependency): a border two rows share
//    becomes one arc, so neighbours never gap or overlap, and coordinates are quantised to 1/100,000 of the file's
//    extent. No point is removed: the files come to about a tenth of the design's 1.5 MB limit (gzipped), so no
//    simplifier is used.
// 4. The crosswalk, qids.json (prp-map.js draws a Q-id only through it). (a) Every Wikidata id on a POLITY row is read
//    from Wikidata (wbgetentities: English and multilingual labels and aliases, the English Wikipedia title, and its
//    inception, dissolution, start and end; 50 a request, a second apart, User-Agent "VM build check
//    (https://jdpi.pages.dev)"). An id is used for a row only where one of those names matches the row's Name or
//    Wikipedia phrase (case, accents, punctuation and bracketed parts ignored) and, where Wikidata dates the item, its
//    years meet the rows' years: basis "cliopatria-wikidata". A mismatch is listed under `rejected` with both names and
//    why, and never used (Cliopatria tags its Kingdom of France rows Q207162, which Wikidata labels the Bourbon
//    Restoration in France and dates 1814–1830, though "Kingdom of France" is among its aliases).
//    RELATION rows carry the id of one of their parts, so they are not crosswalked. (b) A place in the Master Index
//    (lake/data/e, read from disk) whose label is a POLITY row's Name, and whose founding or dissolution date in the
//    lake overlaps the row's years: basis "name" (so Q70972, the Kingdom of France, reaches its rows).
// 5. Writes omni/data/borders/<from>-<to>.topo.json, index.json and qids.json, and the borders layer's `built` and
//    years in omni/data/layers.json. index.json and qids.json each keep the `built` they have when nothing else in them
//    changes (builtFor), so a run on unchanged inputs writes the same bytes and the views' pins stay. Prints rows,
//    bytes and gzipped bytes per file. Nothing else is written.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, inflateRawSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wikidataDate, bestClaim, yearSpan } from '../../lake/scripts/dates.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/borders');
const LAYERS = join(ROOT, 'omni/data/layers.json');
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
export const SPANS = [[1400, 1499], [1500, 1600]];
export const QUANTISATION = 1e5;
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
export function crosswalk(rows, items, places) {
  const byPair = new Map(); // `${q}|${name}` → { q, name, spans, wiki }
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
    const years = item ? itemYears(item) : null, spans = mergeSpans(e.spans);
    const met = years ? spans.filter(([f, t]) => years[0] <= t && f <= years[1]) : spans;
    const show = y => (Number.isFinite(y) ? y : null);
    if (!item) rejected.push({ q: e.q, name: e.name, wikidataLabel: null, why: 'Wikidata has no such item' });
    else if (!ours.some(n => n && theirs.has(n))) rejected.push({ q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata gives the item another name' });
    else if (!met.length) rejected.push({ q: e.q, name: e.name, wikidataLabel: label, why: 'Wikidata dates the item to other years', wikidataYears: [show(years[0]), show(years[1])] });
    else add(e.q, e.name, met, 'cliopatria-wikidata');
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
/** The lake's places with their labels and years (founded, dissolved), read from the committed shards. */
export function lakePlaces(dir = join(ROOT, 'lake/data/e')) {
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    for (const r of Object.values(JSON.parse(readFileSync(join(dir, f), 'utf8')))) {
      if (r?.type !== 'place' || !r.label) continue;
      out.push({ q: r.q, label: r.label, from: yearOf(r.facts?.founded), to: yearOf(r.facts?.dissolved) });
    }
  }
  return out;
}

async function wikidataItems(ids, cacheDir) {
  const items = new Map(), cacheFile = cacheDir ? join(cacheDir, 'cliopatria-qids-wikidata-3.json') : null;
  const DATES = ['P571', 'P576', 'P580', 'P582'];
  const keep = e => ({ id: e.id, labels: e.labels, aliases: e.aliases, sitelinks: e.sitelinks, claims: Object.fromEntries(DATES.filter(p => e.claims?.[p]).map(p => [p, e.claims[p]])) });
  if (cacheFile && existsSync(cacheFile)) { const c = JSON.parse(readFileSync(cacheFile, 'utf8')); if (ids.every(q => q in c.items)) { for (const q of ids) if (c.items[q]) items.set(q, c.items[q]); return { items, read: c.read }; } }
  const read = stamp();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
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
    for (const [k, e] of Object.entries(j.entities)) if (!('missing' in e)) items.set(back.get(k) || k, keep(e));
    console.log(`Wikidata: ${Math.min(i + 50, ids.length)} of ${ids.length} ids read`);
    await sleep(1000);
  }
  if (cacheFile) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, JSON.stringify({ read, items: Object.fromEntries(ids.map(q => [q, items.get(q) || null])) })); }
  return { items, read };
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
  cat.generated = cat.layers.map(x => x.built).filter(Boolean).sort().at(-1);
  writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
}

async function main() {
  const zip = arg('--zip');
  if (!zip) { console.error('Usage: node --max-old-space-size=6000 omni/scripts/build-borders.mjs --zip <cliopatria.geojson.zip> [--cache <folder>]'); process.exit(2); }
  const buf = readFileSync(zip);
  if (buf.length !== RELEASE.bytes || sha256(buf) !== RELEASE.sha256) { console.error(`${zip} is not Cliopatria ${RELEASE.version}'s archive (sha256 ${sha256(buf)}): stopping`); process.exit(1); }
  // topojson-server is loaded here, not at the top, so the pure steps above can be imported (and tested) without it.
  const { topology } = await import('topojson-server');
  const geo = JSON.parse(unzipEntry(buf, RELEASE.entry).toString('utf8'));
  console.log(`Cliopatria ${RELEASE.version}: ${geo.features.length} rows`);
  const now = stamp(), files = [], all = [];
  for (const [from, to] of SPANS) {
    const rows = rowsFor(geo.features, from, to);
    const ids = new Set(rows.map(r => r.properties.id));
    if (ids.size !== rows.length) throw new Error(`${from}-${to}: two rows share an id`);
    const topo = topology({ borders: { type: 'FeatureCollection', features: rows } }, QUANTISATION);
    topo.vm = { format: 'vm-borders/1', source: 'cliopatria', version: RELEASE.version, from, to };
    const text = JSON.stringify(topo), bytes = Buffer.from(text, 'utf8');
    const file = `${from}-${to}.topo.json`;
    files.push({ from, to, file, rows: rows.length, bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, sha256: sha256(bytes), text });
    all.push(...rows);
  }
  const qs = [...new Set(all.filter(r => r.properties.k === 'POLITY' && r.properties.q).map(r => r.properties.q))].sort();
  const { items, read } = await wikidataItems(qs, arg('--cache'));
  const { entries, rejected } = crosswalk(all, items, lakePlaces());
  mkdirSync(OUT, { recursive: true });
  for (const f of files) { writeFileSync(join(OUT, f.file), f.text); delete f.text; console.log(`${f.file}: ${f.rows} rows, ${f.bytes} bytes, ${f.gzip} gzipped`); }
  // Each file keeps its `built` where its content is unchanged (builtFor), so a second run on the same inputs writes
  // the same bytes; the layer's `built` is the later of the two.
  const index = { format: 'vm-borders-index/1', source: 'cliopatria', version: RELEASE.version, built: null, from: SPANS[0][0], to: SPANS.at(-1)[1],
    archive: { url: RELEASE.url, sha256: RELEASE.sha256 }, quantisation: QUANTISATION, files };
  index.built = builtFor(readJson(join(OUT, 'index.json')), index, now);
  const qids = { format: 'vm-qids/1', version: `cliopatria@${RELEASE.version}`, built: null, wikidata: { read, ids: qs.length }, entries, rejected };
  qids.built = builtFor(readJson(join(OUT, 'qids.json')), qids, now);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  writeFileSync(join(OUT, 'qids.json'), JSON.stringify(qids, null, 1) + '\n');
  console.log(`qids.json: ${Object.keys(entries).length} Q-ids, ${rejected.length} of Cliopatria's ids rejected`);
  updateLayer(LAYERS, 'borders', { built: [index.built, qids.built].sort().at(-1), time: { from: SPANS[0][0], to: SPANS.at(-1)[1] } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
