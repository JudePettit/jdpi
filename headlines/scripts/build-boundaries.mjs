// Builds headlines/boundaries.json, the Global Headline Tracker's map: one shape for each country it collects
// (the keys of headlines/outlets.json), simplified for the map's zoom levels (up to 5) and stored as TopoJSON.
// Source: datasets/geo-countries (Natural Earth 1:10m admin-0 countries, public domain), pinned to one commit, so a
// rebuild gives the same file. Simplification: mapshaper (npx mapshaper@0.7.98), weighted Visvalingam on shared
// borders, so neighbours still meet. Islands under 30 km² are dropped unless they are a country's largest part, and a
// country whose largest part is under 3,000 km² (Vatican City, Monaco, the small Caribbean islands, …) also gets a
// point, `dot` [lon, lat], which the page draws as a marker that stays clickable when the shape is a pixel across.
// Properties: code (ISO 3166-1 alpha-2, as in outlets.json), name (as shown), iso3, aliases (other names a link may use).
// Rebuild when outlets.json gains a country (tests/headlines.test.mjs checks that every one has a shape):
//   node headlines/scripts/build-boundaries.mjs [--source countries.geojson]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const COMMIT = '72f7d8069cbeef76757b3a49a1c38f8a7b5b5fd0'; // datasets/geo-countries, 15 Oct 2026
const SOURCE = `https://raw.githubusercontent.com/datasets/geo-countries/${COMMIT}/data/countries.geojson`;
const SOURCE_SHA256 = '392a03db8aa3ba82c105852655620129b11182b95dfc34ef046827ea7d0e5b8c';
const MAPSHAPER = 'mapshaper@0.7.98';
// In degrees, flat (so parallels such as the US–Canada border stay straight on the map): 0.025° is about half a pixel
// at zoom 5, the map's closest. Russia, Canada, the United States, China and Greenland (over 2 million km²) take 0.08°:
// their Arctic coasts are most of the weight and are never seen that close. Quantisation 50,000: 0.007°.
const SIMPLIFY = ['planar', 'variable', 'interval=this.area > 2e12 ? 0.08 : 0.025', 'keep-shapes'], QUANTIZATION = 50000;
const MIN_PART_KM2 = 30, DOT_BELOW_KM2 = 3000;
const OUT = new URL('../boundaries.json', import.meta.url);

// Names as the rest of PRP writes them, where Natural Earth's differ; its own name stays an alias, so old links and
// saved watchlist entries still match.
const NAMES = { US: 'United States', RS: 'Serbia', BS: 'Bahamas', VA: 'Vatican City' };
const ALIASES = { US: ['USA', 'US', 'America'], GB: ['UK', 'Britain', 'Great Britain'], VA: ['Holy See'], CZ: ['Czech Republic'],
  TR: ['Türkiye'], MK: ['Macedonia'], NL: ['Holland'], IE: ['Republic of Ireland'], CN: ["People's Republic of China"], RU: ['Russian Federation'],
  MD: ['Republic of Moldova'], KN: ['St Kitts and Nevis'], LC: ['St Lucia'], VC: ['St Vincent and the Grenadines'] };
// Covered countries Natural Earth gives no ISO code.
const BY_NAME = { XK: 'Kosovo' };

const arg = process.argv.indexOf('--source');
const raw = arg > 0 ? readFileSync(process.argv[arg + 1]) : Buffer.from(await (await fetch(SOURCE)).arrayBuffer());
const sha256 = createHash('sha256').update(raw).digest('hex');
if (sha256 !== SOURCE_SHA256) console.warn(`Warning: the source is not the pinned file (sha256 ${sha256}).`);
const source = JSON.parse(raw.toString('utf8'));
const covered = Object.keys(JSON.parse(readFileSync(new URL('../outlets.json', import.meta.url), 'utf8')));

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

const features = covered.map(code => {
  const f = source.features.find(x => x.properties['ISO3166-1-Alpha-2'] === code) || source.features.find(x => x.properties.name === BY_NAME[code]);
  if (!f) throw new Error(`No boundary for ${code} in the source`);
  const parts = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => ({ p, km2: partArea(p) })).sort((a, b) => b.km2 - a.km2);
  const kept = parts.filter((x, i) => i === 0 || x.km2 >= MIN_PART_KM2).map(x => x.p);
  const neName = f.properties.name, name = NAMES[code] || neName, iso3 = f.properties['ISO3166-1-Alpha-3'];
  const aliases = [...new Set([neName, ...(ALIASES[code] || [])])].filter(a => a !== name);
  const properties = { code, name, ...(/^[A-Z]{3}$/.test(iso3) ? { iso3 } : {}), ...(aliases.length ? { aliases } : {}) };
  if (parts[0].km2 < DOT_BELOW_KM2) properties.dot = centroid(parts[0].p[0]).map(v => round(v));
  return { type: 'Feature', properties, geometry: kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept } };
});

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
  // A shape smaller than the quantisation grid (Vatican City) comes out empty; its dot stands for it.
  const codes = topo.objects.countries.geometries.filter(g => g.type || g.properties.dot).map(g => g.properties.code);
  const missing = covered.filter(c => !codes.includes(c));
  if (missing.length) throw new Error(`Lost in simplification: ${missing.join(', ')}`);
  topo.meta = { source: SOURCE, sha256, built: `${MAPSHAPER} -simplify ${SIMPLIFY.join(' ')}; quantization ${QUANTIZATION}` };
  const json = JSON.stringify(topo);
  writeFileSync(OUT, json + '\n');
  console.log(`headlines/boundaries.json: ${codes.length} countries, ${topo.arcs.length} arcs, ${(json.length / 1024).toFixed(1)} KB (${(gzipSync(json).length / 1024).toFixed(1)} KB gzipped); dots: ${features.filter(f => f.properties.dot).map(f => f.properties.code).join(' ')}`);
} finally { rmSync(dir, { recursive: true, force: true }); }
