// War Focus's borders: Cliopatria v0.2.1 (CC BY 4.0), as the Omni-Map built them (omni/data/borders), cut into spans
// of years so a month of a war loads only its own years' rows (21 November 2026, when War Focus left CShapes 2.0).
//   node battlefield/focus/scripts/build-borders.mjs
// Inputs: omni/data/borders/index.json and its two files of the years War Focus shows, 1900-1999.topo.json and
// 2000-2024.topo.json (omni/scripts/build-borders.mjs writes them; this script never changes them).
// The order of steps; it writes nothing until every step has worked:
// 1. Reads the Omni-Map's borders index and checks each of the two files against its sha256 there, and that together
//    they hold every year from FIRST (1926, War Focus's first) to the index's last (2024); stops otherwise.
// 2. For each span of SPANS (below; they must cover FIRST to 2024 with no gap and no overlap), takes the rows a
//    month of those years can draw: Cliopatria's polities with a shape, not its composites (a name in brackets), the
//    rule of the Retrospective Battlefield (battlefield/scripts/history-places.mjs drawnRow), whose years meet the span.
//    Each row keeps its geometry and properties byte for byte; only the arcs it uses are kept, renumbered in order. No
//    point is moved or removed and no simplifier is used (the owner's decision of 17 November 2026).
// 3. Checks each span's file against LIMIT_GZ (110 KB gzipped, which keeps a war's first view within a tenth of what it
//    loaded on CShapes' one file) and the design's 1.5 MB limit.
// 4. Writes battlefield/focus/data/borders/<from>-<to>.topo.json for each span and index.json: format, source,
//    version, the Omni-Map file and its sha256 that each span was cut from, its rows, bytes and gzipped bytes.
// The spans were chosen on 21 November 2026 by joining years while a file stayed under LIMIT_GZ (1939-1940 is the
// heaviest, 108 KB). A month shows its year's border; 2025 and 2026 show 2024's, the last year Cliopatria holds.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { drawnRow } from '../../scripts/history-places.mjs';

const SITE = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = fileURLToPath(new URL('../data/borders/', import.meta.url));
const FIRST = 1926, LIMIT_GZ = 110 * 1024, DESIGN_GZ = 1.5 * 1024 * 1024;
const SPANS = [[1926, 1931], [1932, 1935], [1936, 1938], [1939, 1940], [1941, 1942], [1943, 1944], [1945, 1946], [1947, 1952],
  [1953, 1960], [1961, 1972], [1973, 1982], [1983, 1991], [1992, 1999], [2000, 2024]];

// ---- 1. The Omni-Map's files, checked
const omni = JSON.parse(readFileSync(join(SITE, 'omni/data/borders/index.json'), 'utf8'));
const files = omni.files.filter(f => f.to >= FIRST);
const last = Math.max(...files.map(f => f.to));
const topo = new Map();
for (const f of files) {
  const text = readFileSync(join(SITE, 'omni/data/borders', f.file));
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha !== f.sha256) throw new Error(`omni/data/borders/${f.file}: sha256 ${sha} is not the index's ${f.sha256}`);
  topo.set(f.file, JSON.parse(text));
}
for (let y = FIRST; y <= last; y++) if (!files.some(f => f.from <= y && y <= f.to)) throw new Error(`no Omni-Map file holds ${y}`);

// ---- 2. The spans
let prev = FIRST - 1;
for (const [a, b] of SPANS) { if (a !== prev + 1 || b < a) throw new Error(`span ${a}-${b} leaves a gap or overlaps`); prev = b; }
if (prev !== last) throw new Error(`the spans end in ${prev}, Cliopatria in ${last}`);
const drawn = g => drawnRow({ properties: g.properties, geometry: g.type ? {} : null });
function slice(t, a, b) {
  const geoms = t.objects.borders.geometries.filter(g => g.properties.f <= b && a <= g.properties.t && drawn(g));
  const used = new Map(), arcs = [];
  const map = i => { const k = i < 0 ? ~i : i; if (!used.has(k)) { used.set(k, arcs.length); arcs.push(t.arcs[k]); } const n = used.get(k); return i < 0 ? ~n : n; };
  const walk = x => (Array.isArray(x[0]) ? x.map(walk) : x.map(map));
  const out = geoms.map(g => ({ ...g, arcs: walk(g.arcs) }));
  return { rows: out.length, topo: { type: 'Topology', transform: t.transform, vm: { ...t.vm, from: a, to: b, cut: 'battlefield/focus/scripts/build-borders.mjs' },
    objects: { borders: { type: 'GeometryCollection', geometries: out } }, arcs } };
}
const pending = [], entries = [];
for (const [a, b] of SPANS) {
  const src = files.find(f => f.from <= a && b <= f.to);
  if (!src) throw new Error(`span ${a}-${b} crosses two Omni-Map files`);
  const { rows, topo: t } = slice(topo.get(src.file), a, b);
  const text = JSON.stringify(t), gz = gzipSync(text, { level: 9 }).length;
  // ---- 3. The limits
  if (gz > LIMIT_GZ || gz > DESIGN_GZ) throw new Error(`span ${a}-${b}: ${gz} bytes gzipped, over ${LIMIT_GZ}`);
  if (!rows) throw new Error(`span ${a}-${b}: no rows`);
  const file = `${a}-${b}.topo.json`;
  pending.push([file, text]);
  entries.push({ from: a, to: b, file, rows, bytes: Buffer.byteLength(text), gzip: gz, cutFrom: `omni/data/borders/${src.file}`, cutFromSha256: src.sha256 });
}

// ---- 4. The files
if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (/\.topo\.json$/.test(f) && !pending.some(([n]) => n === f)) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });
for (const [file, text] of pending) writeFileSync(join(OUT, file), text);
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ format: 'vm-warfocus-borders/1', source: 'cliopatria', version: omni.version,
  licence: 'CC BY 4.0', credit: 'Cliopatria v0.2.1, Seshat Global History Databank (CC BY 4.0)', from: FIRST, to: last,
  about: 'Cliopatria’s polities with a shape for each span of years, cut byte for byte from the Omni-Map’s borders (omni/data/borders). A month shows its year’s rows; a year after the last shows the last year’s.',
  spans: entries }, null, 1));
for (const e of entries) console.log(`${e.file}: ${e.rows} rows, ${e.bytes} bytes, ${e.gzip} gzipped`);
console.log(`${entries.length} spans, ${entries.reduce((s, e) => s + e.gzip, 0)} bytes gzipped in all`);
