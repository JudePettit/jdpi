// Rebuilds the country table in design/prp-focus.js: ISO3 → Gleditsch–Ward code, the box of each country's main parts
// (whole degrees, rounded outward) and its common English name. Shapes: Natural Earth 1:50m via world-atlas@2.0.2;
// codes and names: National Analysis (national/data/index.json, World Bank names made everyday below).
// Run from the repository root:  node design/scripts/focus-countries.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import '../prp-focus.js';

const FILE = new URL('../prp-focus.js', import.meta.url);
const { geoBBox } = globalThis.PRPFocus;
const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json')).json();
const national = JSON.parse(readFileSync(new URL('../../national/data/index.json', import.meta.url), 'utf8'));
// Countries the World Bank does not list.
const EXTRA = [{ iso3: 'TWN', num: '158', gw: 713, name: 'Taiwan' }];
const all = [...national.countries, ...EXTRA];
const byNum = new Map(all.filter(c => c.num).map(c => [String(c.num).padStart(3, '0'), c]));
const byName = new Map(all.map(c => [c.name.toLowerCase(), c]));
// World Bank names as people say them.
const COMMON = { BHS: 'Bahamas', BRN: 'Brunei', CIV: 'Ivory Coast', COD: 'Democratic Republic of the Congo', COG: 'Republic of the Congo', CPV: 'Cape Verde',
  CZE: 'Czech Republic', EGY: 'Egypt', FSM: 'Micronesia', GMB: 'Gambia', HKG: 'Hong Kong', IRN: 'Iran', KGZ: 'Kyrgyzstan', KNA: 'Saint Kitts and Nevis',
  KOR: 'South Korea', LAO: 'Laos', LCA: 'Saint Lucia', MAC: 'Macau', MAF: 'Saint Martin', NRU: 'Nauru', PRI: 'Puerto Rico', PRK: 'North Korea', PSE: 'Palestine',
  RUS: 'Russia', SOM: 'Somalia', STP: 'São Tomé and Príncipe', SVK: 'Slovakia', SXM: 'Sint Maarten', SYR: 'Syria', TLS: 'East Timor', TUR: 'Turkey',
  VCT: 'Saint Vincent and the Grenadines', VEN: 'Venezuela', VIR: 'US Virgin Islands', VNM: 'Vietnam', YEM: 'Yemen' };

// TopoJSON → GeoJSON geometry (quantized, delta-encoded arcs), enough for world-atlas.
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
const ring = ids => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
const geometry = g => (g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.arcs.map(ring) }
  : g.type === 'MultiPolygon' ? { type: 'MultiPolygon', coordinates: g.arcs.map(p => p.map(ring)) } : null);

// A country can be several features (Australia and Ashmore Reef share a code): all its shapes are boxed together.
const shapes = new Map();
for (const g of topo.objects.countries.geometries) {
  const c = byNum.get(g.id) || byName.get(String(g.properties?.name || '').toLowerCase());
  const geo = c && geometry(g);
  if (geo) (shapes.get(c.iso3) || shapes.set(c.iso3, { c, geos: [] }).get(c.iso3)).geos.push(geo);
}
const rows = new Map();
for (const [iso3, { c, geos }] of shapes) {
  const [w, s, e, n] = geoBBox({ type: 'GeometryCollection', geometries: geos });
  const name = (COMMON[iso3] || c.name).replace(/[;:]/g, ' ');
  rows.set(iso3, `${iso3}${c.gw ?? ''}:${Math.floor(w)},${Math.floor(s)},${Math.ceil(e)},${Math.ceil(n)}:${name}`);
}
const missing = all.filter(c => !rows.has(c.iso3)).map(c => `${c.iso3} ${c.name}`);
const table = [...rows.keys()].sort().map(k => rows.get(k)).join(';');
const src = readFileSync(FILE, 'utf8');
writeFileSync(FILE, src.replace(/const COUNTRIES = '(?:[^'\\]|\\.)*';/, () => `const COUNTRIES = '${table.replace(/'/g, "\\'")}';`));
console.log(`${rows.size} countries written (${table.length} characters).${missing.length ? ` Not in Natural Earth 1:50m: ${missing.join(', ')}.` : ''}`);
