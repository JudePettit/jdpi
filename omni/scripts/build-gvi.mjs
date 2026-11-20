// Builds the Omni-Map's layer 9 (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5c): VM's Geopolitical Volatility Index by
// country and day, drawn on Natural Earth's countries of today (joined by the ISO3 code Volatility keys its rows by).
//   node omni/scripts/build-gvi.mjs
// The order of steps:
// 1. Reads the kept days, volatility/data/kept/<year>.json (written by volatility/scripts/ingest.mjs each night, before
//    index.json's 365-day cut: [day, score, coverage, method] for each country), every year there is.
// 2. For each year, lists its days in order, and each country's score on each day (null where Volatility could not
//    score it: too few events or sources), its coverage of each day as one letter (h high, m medium, l low,
//    i insufficient) and the method that scored each day; a country's name is Volatility's own.
// 3. Writes omni/data/layers/gvi/<year>.json (vm-gvi/1), one file a year, so the page loads only the frame's year, and
//    omni/data/layers/gvi/index.json, which lists each year's file with its first and last day, bytes, gzipped bytes and
//    sha256. A file keeps its `built` when nothing in it changes.
// 4. Puts the layer's entry in omni/data/layers.json: time.from and time.to are the first and last years held, and
//    time.first and time.last the first and last days; its classes are VM's, at Volatility's own bands (40 elevated, 70
//    high) with steps of ten between; pinnable, now that the days are kept.
// Nothing is written until every step has worked. The score is VM's own (status "VM's own score"), from GDELT 2.0.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, keepBuilt, measure, readJson, stamp, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const KEPT = join(ROOT, 'volatility/data/kept');
const OUT = join(ROOT, 'omni/data/layers/gvi');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const BREAKS = [30, 40, 50, 60, 70];

/** Step 2: one year's file body from its kept file: { days, methods, values: { iso3: [score|null] }, cov: { iso3: 'hhm…' }, names }. */
export function yearDoc(kept) {
  const days = [...new Set(Object.values(kept.countries).flatMap(c => c.days.map(r => r[0])))].sort();
  const at = new Map(days.map((d, i) => [d, i]));
  const methods = days.map(() => null), values = {}, cov = {}, names = {};
  for (const iso of Object.keys(kept.countries).sort()) {
    if (!/^[A-Z]{3}$/.test(iso)) continue;
    const c = kept.countries[iso], v = days.map(() => null), k = days.map(() => '-');
    for (const [d, score, coverage, method] of c.days) {
      const i = at.get(d);
      v[i] = score ?? null; k[i] = coverage || '-';
      if (method && !methods[i]) methods[i] = method;
    }
    if (v.every(x => x == null)) continue;
    values[iso] = v; cov[iso] = k.join(''); names[iso] = c.name;
  }
  return { days, methods, values, cov, names };
}

function main() {
  if (!existsSync(KEPT)) throw new Error(`${KEPT} is missing: run node volatility/scripts/ingest.mjs --keep-only first`);
  const years = readdirSync(KEPT).filter(f => /^\d{4}\.json$/.test(f)).map(f => +f.slice(0, 4)).sort((a, b) => a - b);
  if (!years.length) throw new Error('No kept year of Volatility days');
  const now = stamp(), outs = [];
  for (const y of years) {
    const body = yearDoc(JSON.parse(readFileSync(join(KEPT, `${y}.json`), 'utf8')));
    if (!body.days.length) continue;
    const doc = { format: 'vm-gvi/1', layer: 'gvi', source: 'vm-volatility', year: y, built: null, from: `volatility/data/kept/${y}.json`, join: 'iso3', ...body };
    const file = join(OUT, `${y}.json`);
    doc.built = keepBuilt(readJson(file), doc, now);
    const text = JSON.stringify(doc) + '\n', m = measure(text);
    if (m.gzip > LIMIT_GZ) throw new Error(`gvi/${y}.json is over the limit`);
    outs.push({ y, file, text, m, doc });
  }
  const first = outs[0].doc.days[0], last = outs.at(-1).doc.days.at(-1);
  const index = { format: 'vm-gvi-index/1', layer: 'gvi', built: null, first, last, files: outs.map(o => ({ year: o.y, file: `${o.y}.json`, first: o.doc.days[0], last: o.doc.days.at(-1), days: o.doc.days.length, countries: Object.keys(o.doc.values).length, ...o.m })) };
  const ixFile = join(OUT, 'index.json');
  index.built = keepBuilt(readJson(ixFile), index, now);
  const ixText = JSON.stringify(index, null, 1) + '\n';
  // Every step has worked: write.
  mkdirSync(OUT, { recursive: true });
  for (const o of outs) writeFileSync(o.file, o.text);
  writeFileSync(ixFile, ixText);
  for (const o of outs) console.log(`gvi/${o.y}.json: ${o.doc.days.length} days, ${Object.keys(o.doc.values).length} countries; ${o.m.bytes} bytes, ${o.m.gzip} gzipped`);
  const methods = [...new Set(outs.flatMap(o => o.doc.methods).filter(Boolean))];
  putLayer(LAYERS, {
    id: 'gvi', module: 'volatility', title: 'Volatility score (by country, by day)', role: 'fill', geometry: 'polygon',
    time: { field: 'day', from: years[0], to: years.at(-1), step: 'd', precision: 'day', first, last, shows: 'the last day held of the frame’s year' },
    data: 'omni/data/layers/gvi/index.json', split: 'year', on: 'countries', space: 'by country, drawn on today’s borders (Natural Earth v5.1.1, 2022)',
    measure: 'Geopolitical Volatility Index, 0 to 100', status: 'VM’s own score',
    style: { kind: 'classes', breaks: BREAKS, unit: 'GVI', scheme: 'sequential', cut: 'VM’s classes at Volatility’s own bands (40 elevated, 70 high), with steps of ten between' },
    legend: 'Volatility score: VM’s own Geopolitical Volatility Index, from GDELT 2.0’s events (free for any use, with citation), on Natural Earth’s countries of today',
    source: 'vm-volatility',
    method: `VM’s own text. VM’s Geopolitical Volatility Index (Volatility, q/volatility.html; method ${methods.join(', ') || 'as each day records it'}), one score from 0 to 100 for each country and day, from ${first} to ${last}: five components scored from GDELT 2.0’s events that day (conflict and security, political escalation, civil unrest, economic disruption, cross-border spread), each ranked against the trailing 90 days and shrunk towards the middle where there are few reports (volatility/scripts/gvi.mjs). It is VM’s own score, not a measurement: a day with too few events or sources is not scored and the country is left blank. The days are kept by volatility/scripts/ingest.mjs in volatility/data/kept/ before Volatility’s index drops days older than a year, so every day since ${first} stays. The map shows one day, the last VM holds of the frame’s year; each country’s coverage that day (high, medium, low) is in the bundle. Drawn on Natural Earth’s countries of today, joined by ISO 3166 alpha-3 code. The classes are VM’s, at Volatility’s own bands (40 and over elevated, 70 and over high) with steps of ten between (omni/scripts/build-gvi.mjs).`,
    open: true, pinnable: true, built: index.built,
    files: [{ file: 'omni/data/layers/gvi/index.json', ...measure(ixText) }, ...outs.map(o => ({ file: `omni/data/layers/gvi/${o.y}.json`, ...o.m }))],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
