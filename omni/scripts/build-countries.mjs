// Builds the Omni-Map's countries base from Natural Earth (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5a): today's
// countries at 1:110 million as TopoJSON, and a label point for each small state or territory that the 1:110 million
// file leaves out, from the 1:50 million file. The by-country layers (the World Bank's population density, and the
// layers of S5b and S5c) are drawn on it, joined by ISO 3166 alpha-3 code.
//   node omni/scripts/build-countries.mjs [--file110 <copy>] [--file50 <copy>]
// The order of steps:
// 1. Fetches SOURCES[k].url once each (User-Agent "VM build check (https://jdpi.pages.dev)"), or reads the copies given.
// 2. Checks each against the sha256 recorded below for tag v5.1.1 and stops if one differs (a new release is a change to
//    make by hand: read its terms again and record its hash here).
// 3. Gives each country its code (codeOf): Natural Earth's ISO_A3, else its ISO_A3_EH, else XKX for Kosovo (the code
//    the World Bank uses; VM's design/prp-mapkit.js does the same); N. Cyprus and Somaliland have none, and are drawn
//    with no by-country value. Each keeps its Wikidata id (q, Natural Earth's WIKIDATAID), so a by-country layer can
//    join a state by Q-id or by ISO3.
// 4. Writes omni/data/base/countries.topo.json (object "countries": each polygon with { id: 'ne-<ADM0_A3>', iso3, q, n:
//    Natural Earth's NAME }, quantised to 1/100,000 of the world's extent by topojson-server 3.0.1, no simplification),
//    omni/data/base/small-states.json (each state or territory of the 1:50 million file whose code the 1:110 million
//    file lacks, at Natural Earth's own LABEL_X, LABEL_Y), the countries layer's entry in omni/data/layers.json, and the
//    lines for both files in omni/data/base/README.md. Each file keeps its `built` when nothing in it changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, keepBuilt, measure, readJson, arg, stamp, UA, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/base');
const LAYERS = join(ROOT, 'omni/data/layers.json');
const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/';
export const SOURCES = {
  110: { url: RAW + 'ne_110m_admin_0_countries.geojson', sha256: '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f', read: '2026-11-18' },
  50: { url: RAW + 'ne_50m_admin_0_countries.geojson', sha256: '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb', read: '2026-11-18' },
};
export const QUANTISATION = 1e5;
const sha256 = b => createHash('sha256').update(b).digest('hex');

/** Step 3: a Natural Earth country's ISO 3166 alpha-3 code, or null. */
export function codeOf(p) {
  const ok = c => typeof c === 'string' && /^[A-Z]{3}$/.test(c);
  if (ok(p.ISO_A3)) return p.ISO_A3;
  if (ok(p.ISO_A3_EH)) return p.ISO_A3_EH;
  if (p.ADM0_A3 === 'KOS') return 'XKX';
  return null;
}
/** Step 4: the polygons with the properties VM keeps. */
export function countries(fc) {
  return fc.features.map(f => ({ type: 'Feature', properties: { id: `ne-${f.properties.ADM0_A3}`, iso3: codeOf(f.properties), q: qOf(f.properties), n: f.properties.NAME }, geometry: f.geometry }));
}
/** Step 3: a Natural Earth country's Wikidata id (its WIKIDATAID, public domain like the rest), or null. */
export const qOf = p => (typeof p.WIKIDATAID === 'string' && /^Q\d+$/.test(p.WIKIDATAID) ? p.WIKIDATAID : null);
/** Step 4: the label points of the states and territories the 1:110 million file leaves out. */
export function smallStates(fc110, fc50) {
  const held = new Set(fc110.features.map(f => f.properties.ADM0_A3));
  return fc50.features.filter(f => !held.has(f.properties.ADM0_A3) && f.properties.TYPE !== 'Indeterminate')
    .map(f => ({ id: `ne-${f.properties.ADM0_A3}`, iso3: codeOf(f.properties), q: qOf(f.properties), n: f.properties.NAME, type: f.properties.TYPE, at: [+f.properties.LABEL_X.toFixed(4), +f.properties.LABEL_Y.toFixed(4)] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const METHOD = n => 'VM’s own text. Today’s countries, from Natural Earth’s Admin 0 – Countries at 1:110 million, release v5.1.1 (13 May 2022), with a point for each of the ' + n + ' small states and territories that file leaves out (the Siachen Glacier, which Natural Earth calls indeterminate, is not one), at the label point Natural Earth’s 1:50 million file gives it. Natural Earth is in the public domain. Its borders are de facto ones, as Natural Earth draws them, and they are today’s: the design keeps today’s map off every year before 1886, so VM draws this base only from 1886, and a by-country value of a year before 2022 is drawn on today’s borders, which the legend says. Each country is joined to by-country data by its ISO 3166 alpha-3 code: Natural Earth’s ISO_A3, else its ISO_A3_EH, else XKX for Kosovo, the code the World Bank uses; N. Cyprus and Somaliland have no code and take no value. Each country also keeps the Wikidata id Natural Earth gives it (WIKIDATAID), for joins by Q-id. Converted to TopoJSON by topojson-server 3.0.1, quantised to 1/100,000 of the world’s extent, with no simplification (omni/scripts/build-countries.mjs).';

async function get(k, file) {
  const buf = file ? readFileSync(file) : Buffer.from(await (await fetch(SOURCES[k].url, { headers: UA })).arrayBuffer());
  if (sha256(buf) !== SOURCES[k].sha256) throw new Error(`${SOURCES[k].url}: sha256 ${sha256(buf)} is not the one recorded for v5.1.1`);
  return JSON.parse(buf.toString('utf8'));
}

async function main() {
  const now = stamp();
  const fc110 = await get(110, arg('--file110')), fc50 = await get(50, arg('--file50'));
  const { topology } = await import('topojson-server');
  const topo = topology({ countries: { type: 'FeatureCollection', features: countries(fc110) } }, QUANTISATION);
  const prevTopo = readJson(join(OUT, 'countries.topo.json'));
  topo.vm = { format: 'vm-countries/1', source: 'natural-earth', version: 'v5.1.1', file: SOURCES[110].url, sha256: SOURCES[110].sha256, built: null };
  const same = prevTopo?.vm && JSON.stringify({ ...prevTopo, vm: { ...prevTopo.vm, built: null } }) === JSON.stringify(topo);
  topo.vm.built = same ? prevTopo.vm.built : now;
  const topoText = JSON.stringify(topo) + '\n';
  const small = { format: 'vm-small-states/1', source: 'natural-earth', version: 'v5.1.1', file: SOURCES[50].url, sha256: SOURCES[50].sha256, built: null, points: smallStates(fc110, fc50) };
  small.built = keepBuilt(readJson(join(OUT, 'small-states.json')), small, now);
  const smallText = JSON.stringify(small, null, 1) + '\n';
  const a = measure(topoText), b = measure(smallText);
  for (const [n, m] of [['countries.topo.json', a], ['small-states.json', b]]) if (m.gzip > LIMIT_GZ) throw new Error(`${n} is over the limit`);
  writeFileSync(join(OUT, 'countries.topo.json'), topoText);
  writeFileSync(join(OUT, 'small-states.json'), smallText);
  console.log(`countries.topo.json: ${fc110.features.length} countries, ${a.bytes} bytes, ${a.gzip} gzipped`);
  console.log(`small-states.json: ${small.points.length} points, ${b.bytes} bytes, ${b.gzip} gzipped`);
  const built = [topo.vm.built, small.built].sort().at(-1);
  putLayer(LAYERS, {
    id: 'countries', module: 'omni-map', title: 'Countries today', role: 'base', geometry: 'polygon',
    time: { field: 'today', from: 1886, to: 2024, step: 'y', precision: 'year' },
    data: 'omni/data/base/countries.topo.json', points: 'omni/data/base/small-states.json', space: 'today’s borders, drawn from 1886', measure: null, status: 'today’s borders (Natural Earth v5.1.1, 2022)',
    style: { kind: 'outline' }, legend: 'Countries: Natural Earth v5.1.1 (public domain). Made with Natural Earth.',
    source: 'natural-earth-admin0', method: METHOD(small.points.length), open: true, pinnable: true, built,
    files: [{ file: 'omni/data/base/countries.topo.json', ...a }, { file: 'omni/data/base/small-states.json', ...b }],
  });
  const readme = readFileSync(join(OUT, 'README.md'), 'utf8').split('\n## The countries base')[0].trimEnd();
  writeFileSync(join(OUT, 'README.md'), `${readme}

## The countries base

\`countries.topo.json\` is Natural Earth's Admin 0 – Countries at 1:110 million and \`small-states.json\` a label point for
each of the ${small.points.length} states and territories that file leaves out, from the 1:50 million file, both release v5.1.1,
written by \`omni/scripts/build-countries.mjs\` (TopoJSON quantised to 1/100,000, no simplification; each country's
ISO 3166 alpha-3 code kept for joins).

- Addresses: ${SOURCES[110].url} (sha256 ${SOURCES[110].sha256}) and ${SOURCES[50].url} (sha256 ${SOURCES[50].sha256})
- Read: ${SOURCES[110].read}
- Sizes: countries.topo.json ${a.bytes} bytes (${a.gzip} gzipped); small-states.json ${b.bytes} bytes (${b.gzip} gzipped)

These are today's borders: the Omni-Map draws them only from 1886, and says so before then. The terms are the same
as for the land above.
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
