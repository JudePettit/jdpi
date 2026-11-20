// Builds the Omni-Map's population density grid (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5a) from GHSL's GHS-POP
// R2023A, the European Commission's Joint Research Centre's population grids for 1975–2030 in five-year epochs.
//   node --max-old-space-size=6000 omni/scripts/build-density.mjs --zips <E1975.zip> <E1980.zip> … --work <folder>
// --zips are the twelve archives GHS_POP_E<year>_GLOBE_R2023A_4326_30ss_V1_0.zip, downloaded by hand from the JRC's
// open data site (ZIP_URL below), each into a folder of its own outside the repository; --work is a folder of your own
// (never the repository) where each archive's GeoTIFF is unpacked, summed and dropped; the sums stay there
// (sum-<year>.f64), so a second run reads them and unpacks nothing. Nothing is fetched: the terms were read at the
// addresses in integration/sources.json ("ghsl-pop").
//
// The order of steps:
// 1. For each archive: its sha256, and its year from its name. Unpacks the GeoTIFF (BigTIFF, 64-bit floats, LZW, tiles
//    of 256 pixels: GHSL's 30 arc-second grid in WGS84, 43,202 × 21,384 cells) into --work.
// 2. Decodes every tile (LZW, by lzw() below) and adds each cell's people to the 0.25° cell holding the cell's centre
//    (1,440 × 720 cells from 180° W and 90° N), in 64-bit floats.
// 3. Checks each epoch's total against the total the GHSL Data Package 2023 gives for it (TOTALS, its table 20): the
//    build stops when one differs by more than one part in a million.
// 4. Rounds each 0.25° cell to whole people and leaves out a cell of fewer than half a person. Density (people per km²)
//    is the cell's people over its area on a sphere of radius 6,371.0088 km (R²·Δλ·|sin φ1 − sin φ2|), worked out by
//    the page; the files hold people, so a download's figure is GHSL's own sum.
// 5. Sets the classes once, for every epoch: the nine deciles of density among the populated cells of 2020, each to
//    two significant figures (VM's choice, stated in the method), so a colour means the same density in every year.
// 6. Writes omni/data/layers/density/<year>.json (vm-grid/1: the populated cells as [step, people] pairs, the step
//    counted from the last populated cell in row order) and index.json (each file's year, status, total, bytes,
//    gzipped bytes and sha256, and the archive it came from with its sha256), and the layer's entry in
//    omni/data/layers.json. Each file keeps its `built` when nothing else in it changes, so a rerun writes the same
//    bytes. Stops if a file passes 1.5 MB gzipped.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync, fstatSync, createReadStream, createWriteStream, unlinkSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, keepBuilt, measure, readJson, arg, stamp, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/density');
const LAYERS = join(ROOT, 'omni/data/layers.json');
export const ZIP_URL = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E{year}_GLOBE_R2023A_4326_30ss/V1-0/GHS_POP_E{year}_GLOBE_R2023A_4326_30ss_V1_0.zip';
export const DEG = 0.25, COLS = 1440, ROWS = 720, R_KM = 6371.0088;
export const EPOCHS = [1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2030];
export const PROJECTED = [2025, 2030]; // "Future grids projections … 2025 and 2030" (GHSL Data Package 2023, table 10)
// The world's people in each epoch, from the GHSL Data Package 2023 (doi:10.2760/098587), table 20.
export const TOTALS = { 1975: 4069437259, 1980: 4444007748, 1985: 4861730652, 1990: 5316175909, 1995: 5743219510, 2000: 6148899024,
  2005: 6558176175, 2010: 6985603172, 2015: 7426597609, 2020: 7840952947, 2025: 8191988536, 2030: 8546141407 };
export const CLASS_YEAR = 2020;

/* ---------- the archive and the GeoTIFF ---------- */
const sha256File = file => new Promise((ok, no) => { const h = createHash('sha256'); createReadStream(file).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });
/** Unpacks one entry of a zip (stored or deflated, offsets within 4 GB) to a file. */
export async function unzipEntry(zip, test, outFile) {
  const fd = openSync(zip, 'r'), size = fstatSync(fd).size;
  const rd = (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
  const tail = rd(Math.max(0, size - 65557), Math.min(65557, size));
  const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error(`${zip}: no zip directory`);
  const n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  const cd = rd(cdOff, cdSize);
  for (let p = 0, i = 0; i < n; i++) {
    const method = cd.readUInt16LE(p + 10), cs = cd.readUInt32LE(p + 20), nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), off = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (!test(name)) continue;
    const lh = rd(off, 30), start = off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    closeSync(fd);
    const src = createReadStream(zip, { start, end: start + cs - 1 });
    if (method === 0) await pipeline(src, createWriteStream(outFile));
    else if (method === 8) await pipeline(src, createInflateRaw(), createWriteStream(outFile));
    else throw new Error(`${zip}: ${name} is packed by method ${method}`);
    return name;
  }
  closeSync(fd);
  throw new Error(`${zip}: no entry matches`);
}
/** A BigTIFF's first directory: { rd, tags, close }. */
export function openTiff(file) {
  const fd = openSync(file, 'r');
  const rd = (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
  const h = rd(0, 16);
  if (h.toString('latin1', 0, 2) !== 'II' || h.readUInt16LE(2) !== 43) throw new Error(`${file} is not a little-endian BigTIFF`);
  const ifd = Number(h.readBigUInt64LE(8)), n = Number(rd(ifd, 8).readBigUInt64LE(0)), e = rd(ifd + 8, n * 20);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8, 17: 1, 18: 8 }, tags = {};
  for (let i = 0; i < n; i++) {
    const o = i * 20, tag = e.readUInt16LE(o), type = e.readUInt16LE(o + 2), cnt = Number(e.readBigUInt64LE(o + 4)), bytes = size[type] * cnt;
    const buf = bytes <= 8 ? e.subarray(o + 12, o + 12 + bytes) : rd(Number(e.readBigUInt64LE(o + 12)), bytes);
    const vals = [];
    for (let k = 0; k < cnt; k++) {
      const q = k * size[type];
      vals.push(type === 3 ? buf.readUInt16LE(q) : type === 4 ? buf.readUInt32LE(q) : type === 16 ? Number(buf.readBigUInt64LE(q)) : type === 12 ? buf.readDoubleLE(q) : buf[q]);
    }
    tags[tag] = type === 2 ? String.fromCharCode(...vals).replace(/\0+$/, '') : vals;
  }
  return { rd, tags, close: () => closeSync(fd) };
}
/** TIFF's LZW (most significant bit first, the code width growing one code early), into `out`; returns bytes written. */
export function lzw(src, out) {
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Int32Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; len[i] = 1; }
  let next = 258, width = 9, bit = 0, op = 0, prev = -1;
  const total = src.length * 8;
  while (bit + width <= total) {
    const b = bit >> 3;
    const word = (src[b] << 16) | ((src[b + 1] ?? 0) << 8) | (src[b + 2] ?? 0);
    const code = (word >> (24 - (bit & 7) - width)) & ((1 << width) - 1);
    bit += width;
    if (code === 257) break;
    if (code === 256) { next = 258; width = 9; prev = -1; continue; }
    let c = code;
    if (prev < 0) { if (op < out.length) out[op++] = suffix[c]; prev = c; continue; }
    if (c < next) {
      if (next < 4096) { prefix[next] = prev; suffix[next] = first[c]; first[next] = first[prev]; len[next] = len[prev] + 1; next++; }
    } else if (c === next && next < 4096) {
      prefix[next] = prev; suffix[next] = first[prev]; first[next] = first[prev]; len[next] = len[prev] + 1; next++;
    } else throw new Error(`LZW code ${c} out of order`);
    const L = len[c];
    let p = op + L - 1;
    for (let k = c; k >= 0 && p >= op; k = prefix[k]) { if (p < out.length) out[p] = suffix[k]; p--; }
    op = Math.min(op + L, out.length);
    prev = code;
    if (next + 1 >= (1 << width) && width < 12) width++;
  }
  return op;
}
/** Step 2: every 30 arc-second cell's people added into the 0.25° cells. */
export function sumTiff(file, { log = () => {} } = {}) {
  const t = openTiff(file);
  try {
    const W = t.tags[256][0], H = t.tags[257][0], TW = t.tags[322][0], TH = t.tags[323][0], offs = t.tags[324], cnts = t.tags[325];
    if (t.tags[258][0] !== 64 || t.tags[339]?.[0] !== 3 || t.tags[259][0] !== 5) throw new Error(`${file}: not 64-bit floats packed by LZW`);
    if ((t.tags[317]?.[0] ?? 1) !== 1) throw new Error(`${file}: a predictor VM does not read`);
    const [sx, sy] = t.tags[33550], [, , , x0, y0] = t.tags[33922];
    const sum = new Float64Array(COLS * ROWS), raw = new Uint8Array(TW * TH * 8), dv = new DataView(raw.buffer), across = Math.ceil(W / TW);
    let total = 0;
    for (let i = 0; i < offs.length; i++) {
      if (!cnts[i]) continue;
      raw.fill(0);
      lzw(t.rd(offs[i], cnts[i]), raw);
      const tc = i % across, tr = Math.floor(i / across);
      for (let r = 0; r < TH; r++) {
        const py = tr * TH + r; if (py >= H) break;
        const R = Math.floor((90 - (y0 - (py + 0.5) * sy)) / DEG); if (R < 0 || R >= ROWS) continue;
        for (let c = 0; c < TW; c++) {
          const px = tc * TW + c; if (px >= W) break;
          const v = dv.getFloat64((r * TW + c) * 8, true); if (!(v > 0)) continue;
          const C = Math.min(COLS - 1, Math.max(0, Math.floor((x0 + (px + 0.5) * sx + 180) / DEG)));
          sum[R * COLS + C] += v; total += v;
        }
      }
      if (i % 2000 === 0) log(`  tile ${i} of ${offs.length}`);
    }
    return { sum, total };
  } finally { t.close(); }
}
/* ---------- cells, classes and files ---------- */
/** A 0.25° row's area in km² (row 0 starts at 90° N). */
export const cellArea = row => { const r = Math.PI / 180, a = (90 - row * DEG) * r, b = (90 - (row + 1) * DEG) * r; return R_KM * R_KM * DEG * r * Math.abs(Math.sin(a) - Math.sin(b)); };
/** Step 4: the populated cells as [step, people] pairs (whole people, a cell under half a person left out). */
export function sparse(sum) {
  const out = []; let last = 0, total = 0, cells = 0;
  for (let i = 0; i < sum.length; i++) { const p = Math.round(sum[i]); if (p < 1) continue; out.push(i - last, p); last = i; total += p; cells++; }
  return { cells: out, total, count: cells };
}
/** The cells back as { index, people } (the page's reader is omni/lib/grid.js; this is the builder's own, for the check). */
export function unsparse(cells) { const out = []; let i = 0; for (let k = 0; k < cells.length; k += 2) { i += cells[k]; out.push({ index: i, people: cells[k + 1] }); } return out; }
const sig2 = x => +x.toPrecision(2);
/** Step 5: the nine deciles of density among the populated cells, each to two significant figures. */
export function classes(sum) {
  const d = [];
  for (let i = 0; i < sum.length; i++) { const p = Math.round(sum[i]); if (p >= 1) d.push(p / cellArea(Math.floor(i / COLS))); }
  d.sort((a, b) => a - b);
  const out = [];
  for (let k = 1; k <= 9; k++) { const v = sig2(d[Math.floor(d.length * k / 10)]); if (!out.length || v > out.at(-1)) out.push(v); }
  return out;
}
export const statusOf = year => (PROJECTED.includes(year) ? 'projection' : 'modelled');

export const METHOD = (breaks) => 'VM’s own text. People per km², from GHSL’s GHS-POP R2023A (Schiavina, Freire, Carioli and MacManus 2023, European Commission, Joint Research Centre, doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE), described in the GHSL Data Package 2023 (doi:10.2760/098587). Licence: CC BY 4.0, which the data’s copyright notice says covers any copyright and sui generis (database) right. What GHSL says of the grids, from its Data Package: the people of each census unit (CIESIN’s GPWv4.11) are spread over the 30 arc-second cells by built-up volume, and the totals are those of the UN’s World Population Prospects 2022 and World Urbanization Prospects 2018; 1975–2020 are modelled from censuses and the built-up surface seen from space, and 2025 and 2030 are projections (“Future grids projections”), which the legend says. How VM made this layer (omni/scripts/build-density.mjs): it added the people of every 30 arc-second cell into cells of 0.25° (about 28 km at the equator) by the cell’s centre, checked each year’s world total against the Data Package’s table 20 (within one part in a million), rounded each 0.25° cell to whole people and left out a cell of fewer than half a person, so the empty sea and ice are blank. Density is the cell’s people over its area on a sphere of radius 6,371.0088 km. The classes are VM’s: the nine deciles of density among the populated cells of 2020, rounded to two significant figures (' + breaks.join(', ') + ' people per km²), kept the same for every year so a colour means the same density in each. A frame between two epochs shows the epoch before it, and says so; a frame before 1975 shows nothing, and says that GHSL holds 1975 to 2030 (the layer “Population density before 1975 (HYDE)” holds the years before, from HYDE 3.2.1, on the same cells and classes). A cell is a modelled spread of a census, not a count of the people in it: GHSL’s own accuracy notes are in its Data Package.';

async function main() {
  const zips = arg('--zips', { many: true }), work = arg('--work');
  if (!work) throw new Error('--work <folder> is needed (a folder of your own, outside the repository)');
  mkdirSync(work, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const now = stamp(), epochs = [];
  for (const zip of zips) {
    const m = /GHS_POP_E(\d{4})_GLOBE_R2023A_4326_30ss_V1_0\.zip$/.exec(basename(zip));
    if (!m) throw new Error(`${zip} is not a GHS-POP R2023A archive`);
    const year = +m[1], cache = join(work, `sum-${year}.f64`);
    const sha = await sha256File(zip);
    let sum, total;
    if (existsSync(cache) && existsSync(cache + '.json') && JSON.parse(readFileSync(cache + '.json', 'utf8')).sha256 === sha) {
      sum = new Float64Array(readFileSync(cache).buffer.slice(0)); total = JSON.parse(readFileSync(cache + '.json', 'utf8')).total;
    } else {
      const tif = join(work, `E${year}.tif`);
      console.log(`${year}: unpacking ${basename(zip)}`);
      await unzipEntry(zip, n => /\.tif$/.test(n), tif);
      console.log(`${year}: summing`);
      ({ sum, total } = sumTiff(tif, { log: s => console.log(s) }));
      unlinkSync(tif);
      writeFileSync(cache, Buffer.from(sum.buffer)); writeFileSync(cache + '.json', JSON.stringify({ sha256: sha, total }));
    }
    const off = Math.abs(total - TOTALS[year]) / TOTALS[year];
    console.log(`${year}: ${Math.round(total)} people (table 20: ${TOTALS[year]}; off by ${(off * 1e6).toFixed(3)} per million)`);
    if (off > 1e-6) throw new Error(`${year}: the total differs from the Data Package's table 20`);
    epochs.push({ year, zip: basename(zip), sha, sum, total });
  }
  epochs.sort((a, b) => a.year - b.year);
  const years = epochs.map(e => e.year);
  if (JSON.stringify(years) !== JSON.stringify(EPOCHS)) throw new Error(`the twelve epochs are needed (have ${years.join(', ')})`);
  const breaks = classes(epochs.find(e => e.year === CLASS_YEAR).sum);
  const files = [];
  for (const e of epochs) {
    const s = sparse(e.sum), name = `${e.year}.json`, prev = readJson(join(OUT, name));
    const doc = { format: 'vm-grid/1', layer: 'density-grid', source: 'ghsl-pop', source_loc: e.zip.replace(/\.zip$/, '.tif'), year: e.year, status: statusOf(e.year),
      built: null, deg: DEG, cols: COLS, rows: ROWS, west: -180, north: 90, unit: 'people', total: s.total, populated: s.count, cells: s.cells };
    doc.built = keepBuilt(prev, doc, now);
    const text = JSON.stringify(doc) + '\n', m = measure(text);
    if (m.gzip > LIMIT_GZ) throw new Error(`${name} is ${m.gzip} bytes gzipped, over the limit`);
    writeFileSync(join(OUT, name), text);
    files.push({ year: e.year, file: name, status: doc.status, total: s.total, populated: s.count, ...m, from: { file: e.zip, url: ZIP_URL.replaceAll('{year}', e.year), sha256: e.sha } });
    console.log(`${name}: ${s.count} cells, ${s.total} people, ${m.bytes} bytes, ${m.gzip} gzipped`);
  }
  const index = { format: 'vm-grid-index/1', layer: 'density-grid', source: 'ghsl-pop', version: 'R2023A V1-0', built: null, deg: DEG, cols: COLS, rows: ROWS,
    west: -180, north: 90, radiusKm: R_KM, unit: 'people', measure: 'people per km²', breaks, breaksFrom: CLASS_YEAR, years, files };
  index.built = keepBuilt(readJson(join(OUT, 'index.json')), index, now);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  const listed = new Set([...files.map(f => f.file), 'index.json']);
  const stale = readdirSync(OUT).filter(f => !listed.has(f));
  if (stale.length) console.log(`No longer in the index, to be removed by hand: ${stale.join(', ')}`);
  putLayer(LAYERS, {
    id: 'density-grid', module: 'omni-map', title: 'Population density (grid)', role: 'fill', geometry: 'grid',
    time: { field: 'epoch', from: years[0], to: years.at(-1), step: '5y', precision: 'year', values: years, shows: 'the epoch at or before the frame' },
    data: 'omni/data/layers/density/index.json', split: 'year', space: 'cells of 0.25°, about 28 km across at the equator', measure: 'people per km² (0.25° cells)', status: 'modelled',
    statusBy: [{ from: PROJECTED[0], status: 'projection' }],
    style: { kind: 'classes', breaks, unit: 'people per km²', scheme: 'sequential' },
    legend: 'Population: GHSL GHS-POP R2023A (European Commission, JRC, Schiavina et al. 2023), CC BY 4.0 – summed into 0.25° cells by Vitruvian Manager',
    source: 'ghsl-pop', method: METHOD(breaks), open: true, pinnable: true, built: index.built,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
