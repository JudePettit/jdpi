// The Omni-Map's layer catalogue (omni/data/layers.json) as a builder writes it (stage S5a). build-borders.mjs's
// updateLayer changes an entry that is already there; a layer that a builder writes from nothing (the countries base,
// the population layers, and those of S5b and S5c) puts its whole entry with putLayer, and a layer VM leaves out for
// want of free data stays in the catalogue's `absent` list with putAbsent. Both keep the file's order (an entry put
// again stays where it was; a new one goes at the end) and its `generated` (the newest `built` of its layers).
// Every writer of layers.json also writes layers.head.json beside it (writeCatalogue): a file of a few bytes holding
// only `generated`, which every page's sidebar reads for the Omni-Map's line, so the catalogue can grow with each
// layer without weighing on every page (tests/freshness-labels.test.mjs keeps the sidebar's files under 60,000 bytes).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

export const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
export const LIMIT_GZ = 1.5 * 1024 * 1024; // the design's limit per file (7.3), gzipped
export const UA = { 'User-Agent': 'VM build check (https://jdpi.pages.dev)' };

const read = file => JSON.parse(readFileSync(file, 'utf8'));
/** The head beside a catalogue: omni/data/layers.json → omni/data/layers.head.json. */
export const headOf = file => file.replace(/\.json$/, '.head.json');
/** Writes the catalogue and its head (only `generated`, which the sidebar's freshness line reads). */
export function writeCatalogue(file, cat) {
  writeFileSync(file, JSON.stringify(cat, null, 2) + '\n');
  writeFileSync(headOf(file), JSON.stringify({ format: 'vm-layers-head/1', of: 'omni/data/layers.json', generated: cat.generated }, null, 2) + '\n');
}
export const readJson = file => { try { return existsSync(file) ? read(file) : null; } catch { return null; } };

/** The `built` a file keeps: its own when nothing else in it changes, else `now` (as build-borders.mjs's builtFor). */
export function keepBuilt(prev, next, now, key = 'built') {
  if (!prev || typeof prev[key] !== 'string') return now;
  const rest = o => JSON.stringify({ ...o, [key]: null });
  return rest(prev) === rest(next) ? prev[key] : now;
}

/** Bytes, gzipped bytes and sha256 of a file's text, as the indexes list them. */
export function measure(text) {
  const b = Buffer.from(text);
  return { bytes: b.length, gzip: gzipSync(b, { level: 9 }).length, sha256: createHash('sha256').update(b).digest('hex') };
}

/** Puts a layer's whole entry; it keeps the `built` it has when nothing else in it changes. Returns the entry. */
export function putLayer(file, entry, now = stamp()) {
  const cat = read(file);
  const i = cat.layers.findIndex(x => x.id === entry.id);
  const next = { ...entry, built: entry.built ?? now };
  if (i >= 0) { next.built = entry.built ?? keepBuilt(cat.layers[i], { ...entry, built: null }, now); cat.layers[i] = next; }
  else cat.layers.push(next);
  cat.generated = cat.layers.map(x => x.built).filter(Boolean).sort().at(-1);
  writeCatalogue(file, cat);
  return next;
}

/** Puts a line for a layer VM leaves out: { id, title, geometry, why, seen, url, termsUrl?, read, source? }.
    `why` is VM's own words (the page labels them so); `seen` is what VM read on the source's own pages (its licence,
    its answer to a download), never a person's words; it is not called `quote`, which the site keeps for quotations
    held in Bibliotheca. `url` is where the files are, `termsUrl` where the terms were read. */
export function putAbsent(file, line) {
  const cat = read(file);
  cat.absent = Array.isArray(cat.absent) ? cat.absent : [];
  const i = cat.absent.findIndex(x => x.id === line.id);
  if (i >= 0) cat.absent[i] = line; else cat.absent.push(line);
  writeCatalogue(file, cat);
}

/** Takes a line off the `absent` list once its layer is built. */
export function dropAbsent(file, id) {
  const cat = read(file);
  if (!Array.isArray(cat.absent) || !cat.absent.some(x => x.id === id)) return;
  cat.absent = cat.absent.filter(x => x.id !== id);
  writeCatalogue(file, cat);
}

/** Takes a layer's entry off the catalogue (a layer found, after it was built, to rest on data that is not free). */
export function dropLayer(file, id) {
  const cat = read(file);
  if (!cat.layers.some(x => x.id === id)) return;
  cat.layers = cat.layers.filter(x => x.id !== id);
  cat.generated = cat.layers.map(x => x.built).filter(Boolean).sort().at(-1);
  writeCatalogue(file, cat);
}

/** Puts a source's entry in integration/sources.json, by id, keeping the file's order. */
export function putSource(file, source) {
  const doc = read(file);
  const i = doc.sources.findIndex(s => s.id === source.id);
  if (i >= 0) doc.sources[i] = source; else doc.sources.push(source);
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

/** The value after a flag: --zip a.zip → 'a.zip'; every value after it up to the next flag with { many: true }. */
export function arg(name, { many = false } = {}) {
  const i = process.argv.indexOf(name);
  if (i < 0) return many ? [] : null;
  if (!many) return process.argv[i + 1] ?? null;
  const out = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j]);
  return out;
}
