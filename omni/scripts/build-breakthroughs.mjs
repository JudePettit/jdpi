// Builds the Omni-Map's layer 5, breakthroughs (PRP-SCHOLAR-USP-DESIGN.md 4.2 and stage S5b), from the Invention
// Timeline's held file, with its discipline as a filter (l=breakthroughs:d=astro, the Invention Timeline's B part).
//   node omni/scripts/build-breakthroughs.mjs
// No fetch. The file's own source line says what is Wikidata's and what is VM's: "Wikidata (CC0), via wbgetentities;
// selection, titles and notes by Vitruvian Manager". So each row keeps its Wikidata item for the fact, and its title
// and note are marked as VM's own text; its place keeps the Invention Timeline's placing rule (positionBasis), and a
// place set by hand ("fallback", "curated") is marked as VM's placing. A year the timeline marks circa (ca) is "c.".
// The 4.3 items of the Invention Timeline (stated precision, selection rule, VM's own text) are applied here, inside the
// layer; the Invention Timeline's own pages are not changed by this script.
//
// The order of steps:
// 1. Reads science/progress/data/events.json (its events, disciplines and placing rules).
// 2. Keeps each event with a year and a place: { id, q, year, circa, d, title, note, pt, basis, placeQ, placeName }.
// 3. Writes omni/data/layers/breakthroughs/events.json, the layer's entry in omni/data/layers.json (and its head,
//    layers.head.json), and the vm-invention entry of integration/sources.json (version and accessed from events.json,
//    terms from the wikidata entry; the entry's other fields, such as standing and databaseRight, are kept). The
//    `built` stamp moves only when the rows change.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepStamp } from './history-common.mjs';
import { stamp, measure, putLayer } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/breakthroughs/events.json');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const VM_PLACED = ['fallback', 'curated']; // placing rules by which VM, not Wikidata, chose the point

/** Step 2: the rows from the Invention Timeline's events. */
export function breakthroughRows(doc) {
  return (doc.events || []).filter(e => Number.isInteger(e.y) && e.y !== 0 && Number.isFinite(e.place?.lat) && Number.isFinite(e.place?.lon)).map(e => ({
    id: e.id, ...(e.q ? { q: e.q } : {}), label: e.t, note: e.n || null, sortYear: e.y, ...(e.ca ? { circa: true } : {}), d: e.d || [],
    pt: [e.place.lon, e.place.lat], basis: e.positionBasis, placeName: e.place.n || null, ...(e.place.q ? { placeQ: e.place.q } : {}),
    vmPlaced: VM_PLACED.includes(e.positionBasis),
    src: { date: { id: 'vm-invention', loc: `science/progress/data/events.json#${e.id}`, line: `Invention Timeline (science/progress/data/events.json, ${e.id}): ${e.q ? `the fact is Wikidata ${e.q}’s; ` : ''}its title and note are VM’s own text` } },
  })).sort((a, b) => a.sortYear - b.sortYear || a.id.localeCompare(b.id));
}

export function entry(file, m, doc) {
  return { id: 'breakthroughs', module: 'progress', title: 'Breakthroughs in science and technology', role: 'point', geometry: 'point',
    time: { field: 'year', from: file.from, to: file.to, step: 'y', precision: 'year' }, data: 'omni/data/layers/breakthroughs/events.json',
    measure: null, status: 'VM’s selection', style: { kind: 'points', token: '--prp-good' },
    filter: { field: 'd', label: 'Discipline', values: (doc.disciplines || []).map(d => ({ id: d.id, name: d.name })) },
    legend: 'Breakthroughs: the Invention Timeline (Wikidata, CC0; selection, titles and notes by Vitruvian Manager)', source: 'vm-invention',
    method: `VM’s own text. The ${file.rows.length} breakthroughs of VM’s Invention Timeline (science/progress), ${file.from < 0 ? `${-file.from} BC` : file.from} to ${file.to}: which events are in it is VM’s choice, and every title and note is VM’s own text; the facts behind each (its Wikidata item) are Wikidata’s (CC0). A year the timeline marks as approximate is written “c.”. Each point is placed by the Invention Timeline’s rule for it, which the point’s card names (the place of discovery, the site, or the discoverer’s institution, work place, school or birthplace, each from Wikidata); ${file.rows.filter(r => r.vmPlaced).length} are placed by hand by VM, where Wikidata gives no place or would mislead, and say so. A discipline can be chosen alone (the filter in the layer’s address: l=breakthroughs:d=astro).`,
    open: true, pinnable: true, built: file.built, files: [{ file: 'omni/data/layers/breakthroughs/events.json', ...m }] };
}

export const SOURCE = { id: 'vm-invention',
  citation: 'Vitruvian Manager, Invention Timeline (science/progress/data/events.json): selection, titles and notes by Vitruvian Manager; facts from Wikidata (CC0), via wbgetentities',
  short: 'VM Invention Timeline', version: null, licence: 'VM’s own selection and text; facts CC0 1.0 (Wikidata)', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  url: 'https://jdpi.pages.dev/science/progress/', accessed: null, terms: 'host',
  credit: 'Breakthroughs: VM’s Invention Timeline (facts: Wikidata, CC0)', changes: 'Read as held, its discipline kept as a filter (omni/scripts/build-breakthroughs.mjs).' };

async function main() {
  const doc = JSON.parse(readFileSync(join(ROOT, 'science/progress/data/events.json'), 'utf8'));
  const rows = breakthroughRows(doc);
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const body = { layer: 'breakthroughs', format: 'vm-layer/1', source: 'vm-invention', built: null, from: rows[0].sortYear, to: rows.at(-1).sortYear, of: doc.generated || null,
    about: 'VM’s own text. The Invention Timeline’s breakthroughs, each with its Wikidata item, its year (c. where approximate), its disciplines, and its point by the timeline’s placing rule; titles and notes are VM’s own text.',
    basis: doc.basis, disciplines: doc.disciplines, rows };
  const file = { ...body, built: keepStamp(prev, body, stamp()) };
  const text = JSON.stringify(file) + '\n';
  mkdirSync(join(ROOT, 'omni/data/layers/breakthroughs'), { recursive: true });
  writeFileSync(OUT, text);
  const m = measure(text);
  const S = join(ROOT, 'integration/sources.json');
  const { putSource } = await import('./layer-catalogue.mjs');
  // Its facts are Wikidata's, so its terms are Wikidata's (CC0): the terms VM read are taken from Wikidata's own entry.
  // The entry's other fields (its standing and database right, set when the sources were checked for commercial use)
  // are kept: putSource replaces the whole entry.
  const held = JSON.parse(readFileSync(S, 'utf8')).sources;
  const wd = held.find(s => s.id === 'wikidata') || {}, was = held.find(s => s.id === SOURCE.id) || {};
  putSource(S, { ...was, ...SOURCE, version: doc.generated || null, accessed: (doc.generated || '').slice(0, 10) || null, termsUrl: wd.termsUrl, termsQuote: wd.termsQuote, termsRead: wd.termsRead });
  putLayer(LAYERS, entry(file, m, doc));
  console.log(`events.json: ${rows.length} breakthroughs, ${file.from}–${file.to}; ${m.bytes} bytes, ${m.gzip} gzipped; built ${file.built}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
