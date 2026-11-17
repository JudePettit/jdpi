// Builds headlines/boundaries.json, the Global Headline Tracker's map: one shape for every one of VM's 197 countries
// (the United Nations members, the Holy See, Palestine, Kosovo and Taiwan, as integration/scripts/coverage.mjs defines
// them) and Greenland, each marked `covered` when headlines/outlets.json collects it (Jude's rule of 16 November 2026,
// design/PRP-STYLE.md §6: every country is drawn, and one with no data is hatched and says why). Simplified for the
// map's zoom levels (up to 5) and stored as TopoJSON.
// Source: datasets/geo-countries (Natural Earth 1:10m admin-0 countries, public domain), pinned to one commit, so a
// rebuild gives the same file. Simplification: mapshaper (npx mapshaper@0.7.98), weighted Visvalingam on shared
// borders, so neighbours still meet. Islands under 30 km² are dropped unless they are a country's largest part.
// Dots: a country whose largest part is under 3,000 km² (Vatican City, Monaco, Nauru, the small Caribbean islands, …),
// that the map kit has a dot for (Vanuatu), whose shape the source lacks or the simplification loses, or that the
// simplification leaves with under half its land, also gets a point, `dot` [lon, lat], which the page
// draws as a marker that stays clickable when the shape is a pixel across. Which countries need one is worked out here
// from this file at this scale; where the map kit (design/prp-mapkit.js) has a dot for the country, its position is the
// kit's (one table of dots for every VM map), otherwise it is the centroid of the largest part.
// Properties: code (ISO 3166-1 alpha-2, as in outlets.json), name (as shown), iso3, covered (true when outlets.json
// collects it), aliases (other names a link may use), dot. A second object, `unclaimed`, holds the two shapes the
// kit gives no country (Northern Cyprus, Somaliland): name, unclaimed: true, covered: false.
// Names: design/prp-focus.js's (the names the kit's dots and Documentary mode use), but for Czechia, which keeps the
// name the tracker has always shown. Aliases: Natural Earth's name and analytics/lib/countries.js's spellings.
// Rebuild when outlets.json gains or loses a country (tests/headlines.test.mjs checks that every one is covered):
//   node headlines/scripts/build-boundaries.mjs [--source countries.geojson]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { TERRITORIES, EXTRA_TARGET, KEEP } from '../../integration/scripts/coverage.mjs';
import { COUNTRIES } from '../../analytics/lib/countries.js';
import '../../design/prp-mapkit.js';
import '../../design/prp-focus.js';

const { PRPMapkit, PRPFocus } = globalThis;
const COMMIT = '72f7d8069cbeef76757b3a49a1c38f8a7b5b5fd0'; // datasets/geo-countries, 15 Oct 2026
const SOURCE = `https://raw.githubusercontent.com/datasets/geo-countries/${COMMIT}/data/countries.geojson`;
const SOURCE_SHA256 = '392a03db8aa3ba82c105852655620129b11182b95dfc34ef046827ea7d0e5b8c';
const MAPSHAPER = 'mapshaper@0.7.98';
// In degrees, flat (so parallels such as the US–Canada border stay straight on the map): 0.025° is about half a pixel
// at zoom 5, the map's closest. Russia, Canada, the United States, China, Greenland and the other countries over
// 2 million km² take 0.08°: their Arctic and desert edges are most of the weight and are never seen that close. A
// country the tracker does not cover is drawn pale and hatched and carries no headlines, so it takes 0.17° (0.3° over
// 2 million km²): under half a pixel at zoom 2, the world view, and under 2 pixels at zoom 4. One under 30,000 km² (the
// Gambia, Brunei, Vanuatu, Fiji, the Solomon Islands, the small island states) takes 0.05°, about a pixel at zoom 5:
// at 0.15° the Gambia was a box with half its area and Vanuatu kept one island of twenty. That keeps the file under
// the 300 KB its test allows (with every uncovered country at 0.06° it was 354 KB; at 0.1°, 313 KB; with the small ones
// at 0.025°, 307 KB). A border a covered country shares with an uncovered one keeps the covered country's detail
// (mapshaper simplifies a shared arc for the finer of the two). Quantisation 50,000: 0.007°.
const INTERVAL = 'covered ? (this.area > 2e12 ? 0.08 : 0.025) : this.area < 3e10 ? 0.05 : (this.area > 2e12 ? 0.3 : 0.17)';
const SIMPLIFY = ['planar', 'variable', `interval=${INTERVAL}`, 'keep-shapes'], QUANTIZATION = 50000;
const MIN_PART_KM2 = 30, DOT_BELOW_KM2 = 3000;
const OUT = new URL('../boundaries.json', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

// The countries: VM's 197 (national/data/index.json less its territories, plus Taiwan and the Holy See) and Greenland.
const national = read('../../national/data/index.json').countries;
const TARGET = [...new Set([...national.map(c => c.iso3).filter(i => !TERRITORIES.has(i)), ...EXTRA_TARGET, ...KEEP])];
const ROW = new Map(COUNTRIES.map(r => [r[0], r]));
const NAMES = { CZE: 'Czechia' };
const ALIASES = { US: ['USA', 'US', 'America'], GB: ['UK', 'Britain', 'Great Britain'], VA: ['Holy See'], CZ: ['Czech Republic'],
  TR: ['Türkiye'], MK: ['Macedonia'], NL: ['Holland'], IE: ['Republic of Ireland'], CN: ["People's Republic of China"], RU: ['Russian Federation'],
  MD: ['Republic of Moldova'], KN: ['St Kitts and Nevis'], LC: ['St Lucia'], VC: ['St Vincent and the Grenadines'] };

const arg = process.argv.indexOf('--source');
const raw = arg > 0 ? readFileSync(process.argv[arg + 1]) : Buffer.from(await (await fetch(SOURCE, { headers: { 'User-Agent': 'VM boundaries build (static map rebuild)' } })).arrayBuffer());
const sha256 = createHash('sha256').update(raw).digest('hex');
if (sha256 !== SOURCE_SHA256) console.warn(`Warning: the source is not the pinned file (sha256 ${sha256}).`);
const source = JSON.parse(raw.toString('utf8'));
const covered = new Set(Object.keys(read('../outlets.json')));

// Which country each source shape is: by its ISO3, then by name (the kit gives the shape named Kosovo XKX). Northern
// Cyprus and Somaliland are no country (PRPMapkit.unclaimed): they are drawn too, hatched, so Somalia and Cyprus are not
// left with bare tiles beside them, but in an object of their own, `unclaimed`, so that `countries` holds only countries
// (integration/scripts/coverage.mjs reads it to place points, and there Somaliland still falls to CShapes' Somalia).
const bySource = new Map(), unclaimedSource = [];
for (const f of source.features) {
  const a3 = f.properties['ISO3166-1-Alpha-3'];
  const shape = { id: /^[A-Z]{3}$/.test(a3) ? a3 : null, properties: { name: f.properties.name } };
  const iso3 = PRPMapkit.countryOf(shape), own = iso3 ? null : PRPMapkit.unclaimed(shape);
  if (iso3 && !bySource.has(iso3)) bySource.set(iso3, f);
  if (own && !unclaimedSource.some(u => u.name === own)) unclaimedSource.push({ name: own, f });
}

// Area of a ring in km² (on the sphere), and the centroid of the largest part.
const R = 6371.0088, rad = Math.PI / 180;
const ringArea = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += (r[i + 1][0] - r[i][0]) * rad * (2 + Math.sin(r[i][1] * rad) + Math.sin(r[i + 1][1] * rad)); return Math.abs(a * R * R / 2); };
const partArea = p => ringArea(p[0]) - p.slice(1).reduce((s, hole) => s + ringArea(hole), 0);
function centroid(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1], k = x0 * y1 - x1 * y0;
    a += k; x += (x0 + x1) * k; y += (y0 + y1) * k;
  }
  return a ? [x / (3 * a), y / (3 * a)] : ring[0];
}
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const dotOf = (iso3, part) => PRPMapkit.dot(iso3) || (part ? centroid(part[0]).map(v => round(v)) : null);

const features = TARGET.map(iso3 => {
  const row = ROW.get(iso3);
  const code = row?.[1];
  if (!/^[A-Z]{2}$/.test(code || '')) throw new Error(`No ISO 3166-1 alpha-2 code for ${iso3} in analytics/lib/countries.js`);
  const f = bySource.get(iso3);
  const neName = f?.properties.name, name = NAMES[iso3] || PRPFocus.countryName(iso3) || neName || row[3];
  // A spelling with a ' / ' ('Soviet Union / Russia') is the Retrospective's: the page matches its last part already.
  const aliases = [...new Set([neName, ...row.slice(3), ...(ALIASES[code] || [])])].filter(a => a && a !== name && !a.includes(' / '));
  const properties = { code, name, iso3, covered: covered.has(code), ...(aliases.length ? { aliases } : {}) };
  if (!f) {
    // Not in the border file at all: the kit's dot stands for it.
    const dot = PRPMapkit.dot(iso3);
    if (!dot) throw new Error(`No boundary and no dot for ${iso3}`);
    return { type: 'Feature', properties: { ...properties, dot }, geometry: null };
  }
  const { parts, geometry } = shapeOf(f);
  // A dot: the largest part is under 3,000 km², or the kit has one for the country (Vanuatu: one table of dots for
  // every VM map). One more is added below for a country the simplification leaves with under half its land.
  if (parts[0].km2 < DOT_BELOW_KM2 || PRPMapkit.dot(iso3)) properties.dot = dotOf(iso3, parts[0].p);
  return { type: 'Feature', properties, geometry };
});
function shapeOf(f) {
  const parts = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => ({ p, km2: partArea(p) })).sort((a, b) => b.km2 - a.km2);
  const kept = parts.filter((x, i) => i === 0 || x.km2 >= MIN_PART_KM2).map(x => x.p);
  return { parts, geometry: kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept } };
}
// The two shapes no country is given: a name, `unclaimed: true` and `covered: false`, and no code.
for (const { name, f } of unclaimedSource) features.push({ type: 'Feature', properties: { name, unclaimed: true, covered: false }, geometry: shapeOf(f).geometry });
const KEPT_AT_LEAST = 0.5;
const notListed = [...covered].filter(c => !features.some(f => f.properties.code === c));
if (notListed.length) throw new Error(`outlets.json collects countries that are not among VM's 197 and Greenland: ${notListed.join(', ')}`);

const dir = mkdtempSync(join(tmpdir(), 'hl-boundaries-'));
try {
  const input = join(dir, 'countries.json'), output = join(dir, 'out.json');
  writeFileSync(input, JSON.stringify({ type: 'FeatureCollection', features }));
  const args = ['--yes', MAPSHAPER, '-i', input, 'name=countries', '-simplify', ...SIMPLIFY, '-o', output, 'format=topojson', `quantization=${QUANTIZATION}`];
  // One command line with quoted arguments: npx is a .cmd file on Windows, which only runs through a shell (and finds
  // its own folder only when its name is not quoted).
  const quote = s => (process.platform === 'win32' ? `"${s}"` : `'${s}'`);
  if (spawnSync(['npx', ...args.map(quote)].join(' '), { stdio: 'inherit', shell: true }).status !== 0) throw new Error('mapshaper failed');
  const topo = JSON.parse(readFileSync(output, 'utf8'));
  // A shape smaller than the quantisation grid (Vatican City) comes out empty: it takes a dot (the kit's where it has
  // one), which stands for it.
  // So is a country the simplification leaves with under half its land (an archipelago whose small islands are lost).
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
  const ringOf = ids => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
  const keptKm2 = g => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []).reduce((s, p) => s + partArea(p.map(ringOf)), 0);
  const all = topo.objects.countries.geometries;
  for (const g of all) {
    if (g.properties.dot || g.properties.unclaimed) continue;
    const f = bySource.get(g.properties.iso3);
    const largest = f && shapeOf(f).parts[0].p;
    if (g.type && f && keptKm2(g) >= KEPT_AT_LEAST * shapeOf(f).parts.reduce((s, x) => s + x.km2, 0)) continue;
    const dot = dotOf(g.properties.iso3, largest);
    if (dot) g.properties.dot = dot;
  }
  topo.objects.countries.geometries = all.filter(g => !g.properties.unclaimed);
  const unclaimed = all.filter(g => g.properties.unclaimed);
  if (unclaimed.length) topo.objects.unclaimed = { type: 'GeometryCollection', geometries: unclaimed };
  const codes = topo.objects.countries.geometries.filter(g => g.type || g.properties.dot).map(g => g.properties.code);
  const missing = features.filter(f => !f.properties.unclaimed).map(f => f.properties.code).filter(c => !codes.includes(c));
  if (missing.length) throw new Error(`Lost in simplification: ${missing.join(', ')}`);
  topo.meta = { source: SOURCE, sha256, built: `${MAPSHAPER} -simplify ${SIMPLIFY.join(' ')}; quantization ${QUANTIZATION}`,
    dots: 'design/prp-mapkit.js where it has the country, else the centroid of the largest part' };
  const json = JSON.stringify(topo);
  writeFileSync(OUT, json + '\n');
  const g = topo.objects.countries.geometries;
  console.log(`headlines/boundaries.json: ${codes.length} countries (${g.filter(x => x.properties.covered).length} covered) and ${unclaimed.length} shapes given to no country (${unclaimed.map(x => x.properties.name).join(', ')}), ${topo.arcs.length} arcs, ${(json.length / 1024).toFixed(1)} KB (${(gzipSync(json).length / 1024).toFixed(1)} KB gzipped); dots: ${g.filter(x => x.properties.dot).map(x => x.properties.code).join(' ')}; no shape: ${g.filter(x => !x.type).map(x => x.properties.code).join(' ') || 'none'}`);
} finally { rmSync(dir, { recursive: true, force: true }); }
