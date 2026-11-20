// Builds the Omni-Map's population density before 1975 (PRP-SCHOLAR-USP-DESIGN.md 4.2, Jude's request of 2 November
// 2026, stage S5a) from HYDE 3.2.1, the History Database of the Global Environment (Klein Goldewijk et al., Utrecht
// University and PBL), as the DANS Data Station publishes it (doi:10.17026/DANS-25G-GEZ3; its record gives the licence
// CC0-1.0, its readme "CC BY 3.0"; both allow commercial use). HYDE 3.3, at Utrecht's own file server, sits behind a
// bot check, which VM does not get round: this is the release VM can reach by an open route.
//   node --max-old-space-size=6000 omni/scripts/build-density-hyde.mjs --zip <HYDE3_2_1-baseline.zip> --work <folder>
// --zip is the baseline archive (5.3 GB), downloaded by hand from RELEASE.url into a folder of its own outside the
// repository; --work is a folder of your own (never the repository) where each epoch's sums are kept (sum-<label>.f64),
// so a second run unpacks nothing. Nothing is fetched.
//
// The order of steps; it writes nothing into the site until every step has worked:
// 1. Checks the archive's size and sha256 against RELEASE and stops if either differs.
// 2. Reads its zip directory (zip64: the archive is over 4 GB) and finds each epoch's population grid
//    (baseline/asc/<label>_pop/popc_<label>.asc, labels such as 4000BC, 100AD, 1970AD). Keeps the epochs from 4000 BC
//    (the last at or before the map's first year, 3400 BC) to AD 1970 (the last before GHSL's grid begins in 1975).
//    HYDE's "0AD" is left out: VM's years have no year 0, and HYDE does not say whether it means 1 BC or AD 1.
// 3. For each epoch: unpacks popc_<label>.asc (people in each 5 arc-minute cell, an ESRI ASCII grid of 4,320 × 2,160;
//    the archive packs it with Deflate64, which inflate() below reads, each entry checked against its CRC-32) and adds
//    each cell's people to the 0.25° cell holding the cell's centre (1,440 × 720 cells from 180° W and 90° N, nine 5'
//    cells to each), in 64-bit floats.
// 4. Checks each epoch's world total against HYDE's own total for that year (baseline/txt/popc_c.txt, its row "Total",
//    in people, itself checked against the sum of its country rows): the build stops when they differ by more than one
//    part in a thousand.
// 5. Rounds each 0.25° cell to whole people and leaves out a cell of fewer than half a person, as the GHSL grid does
//    (omni/scripts/build-density.mjs), and uses the GHSL grid's classes (omni/data/layers/density/index.json, the
//    deciles of 2020), so a colour means the same density on both layers.
// 6. Writes omni/data/layers/density-hyde/<year>.json (vm-grid/1, as the GHSL grid) and index.json (each file's year,
//    HYDE's label, status, total, bytes, gzipped bytes and sha256, and the archive entry it came from), the layer's entry
//    in omni/data/layers.json, and takes the line "density-deep-time" (left out while HYDE was out of reach) off the
//    catalogue's absent list. Each file keeps its `built` when nothing else in it changes. Stops if a file passes 1.5 MB
//    gzipped.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync, fstatSync, createReadStream, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putLayer, putSource, dropAbsent, keepBuilt, measure, readJson, arg, stamp, LIMIT_GZ } from './layer-catalogue.mjs';
import { DEG, COLS, ROWS, R_KM, sparse } from './build-density.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/layers/density-hyde');
const LAYERS = join(ROOT, 'omni/data/layers.json');
const GHSL_INDEX = join(ROOT, 'omni/data/layers/density/index.json');
const SOURCES = join(ROOT, 'integration/sources.json');
export const RELEASE = {
  version: '3.2.1', file: 'HYDE3_2_1-baseline.zip', bytes: 5339653974,
  sha256: '5a847086cb199c75b739a7b099a8c48840e52fe5a4937882bd8fb26f86288714',
  url: 'https://archaeology.datastations.nl/api/access/datafile/5490328', doi: 'https://doi.org/10.17026/DANS-25G-GEZ3', read: '2026-11-20',
};
// Its entry in integration/sources.json, with the terms as read at the repository's own address on 20 November 2026.
export const SOURCE = {
  id: 'hyde-3.2.1',
  citation: 'Klein Goldewijk, C.G.M. (Utrecht University), with A. Beusen, J. Doelman and E. Stehfest (2017), Anthropogenic land-use estimates for the Holocene; HYDE 3.2 (release 3.2.1), DANS Data Station Archaeology, doi:10.17026/DANS-25G-GEZ3; the readme asks for: Klein Goldewijk, K., A. Beusen, J. Doelman and E. Stehfest (2017), Anthropogenic land-use estimates for the Holocene; HYDE 3.2, Earth System Science Data',
  short: 'HYDE 3.2.1', version: '3.2.1 baseline', licence: 'CC0 1.0', licenceUrl: 'http://creativecommons.org/publicdomain/zero/1.0',
  url: 'https://doi.org/10.17026/DANS-25G-GEZ3', file: 'https://archaeology.datastations.nl/api/access/datafile/5490328', accessed: '2026-11-18',
  terms: 'host', termsUrl: 'https://archaeology.datastations.nl/api/datasets/:persistentId/?persistentId=doi:10.17026/DANS-25G-GEZ3',
  termsQuote: 'license: CC0-1.0 (the record’s licence field); the file HYDE3_2_1-baseline.zip: restricted false',
  termsRead: '2026-11-20',
  readme: 'readme_release_HYDE3.2.1.txt (DANS file 5396388, read 20 November 2026, sha256 6513bb386e29c76096a4db6102e121832cf76fe3b2f36425dff333c11a4c514d), line 7: “The Creative Commons License (CC BY 3.0) applies to all of the HYDE data.”',
  databaseRight: 'CC0 1.0 waives the EU database right; CC BY 3.0, which the readme gives, says nothing of it. VM relies on the repository’s CC0 and credits HYDE as CC BY asks.',
  credit: 'Population before 1975: HYDE 3.2.1 (Klein Goldewijk et al. 2017, Utrecht University and PBL), CC0 1.0',
  changes: 'Each 5 arc-minute cell’s people (popc) added into 0.25° cells for the epochs 4000 BC to AD 1970, each epoch’s total checked against HYDE’s own, cells rounded to whole people and those under half a person left out (omni/scripts/build-density-hyde.mjs).',
};
export const FIRST = -4000, LAST = 1970;
// The 1970 epoch stands for the frames to 1974; from 1975 the GHSL grid (omni/scripts/build-density.mjs) holds the years.
export const UNTIL = 1974;

/* ---------- the archive: a zip reader for zip64 and for an archive held in memory ---------- */
/** A zip's entries: [{ name, method, cs, us, off }], from a reader rd(pos, len) → Buffer and the archive's size. */
export function zipEntries(rd, size) {
  const tail = rd(Math.max(0, size - 65557), Math.min(65557, size));
  const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error('no zip directory');
  let n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  if (n === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), e);
    if (loc < 0) throw new Error('a zip64 archive with no zip64 locator');
    const rec = rd(Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (rec.readUInt32LE(0) !== 0x06064b50) throw new Error('no zip64 directory record');
    n = Number(rec.readBigUInt64LE(32)); cdSize = Number(rec.readBigUInt64LE(40)); cdOff = Number(rec.readBigUInt64LE(48));
  }
  const cd = rd(cdOff, cdSize), out = [];
  for (let p = 0, i = 0; i < n; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('a broken zip directory');
    const method = cd.readUInt16LE(p + 10), nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let cs = cd.readUInt32LE(p + 20), us = cd.readUInt32LE(p + 24), off = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nl);
    for (let x = p + 46 + nl, end = x + xl; x + 4 <= end;) {
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
      if (id === 1) { let q = x + 4; if (us === 0xffffffff) { us = Number(cd.readBigUInt64LE(q)); q += 8; } if (cs === 0xffffffff) { cs = Number(cd.readBigUInt64LE(q)); q += 8; } if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); } }
      x += 4 + len;
    }
    out.push({ name, method, cs, us, off, crc: cd.readUInt32LE(p + 16) });
    p += 46 + nl + xl + cl;
  }
  return out;
}
/** One entry's bytes, unpacked (stored, deflated, or Deflate64, which HYDE's archive uses and Node's zlib does not
    read), checked against the CRC-32 the zip directory gives for it. */
export function zipRead(rd, entry) {
  const lh = rd(entry.off, 30);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`${entry.name}: no local header`);
  const data = rd(entry.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28), entry.cs);
  let out;
  if (entry.method === 0) out = data;
  else if (entry.method === 8) out = inflateRawSync(data);
  else if (entry.method === 9) out = inflate(data, entry.us, { deflate64: true });
  else throw new Error(`${entry.name} is packed by method ${entry.method}`);
  if (out.length !== entry.us) throw new Error(`${entry.name}: ${out.length} bytes unpacked, not ${entry.us}`);
  if (entry.crc != null && (crc32(out) >>> 0) !== entry.crc) throw new Error(`${entry.name}: its CRC-32 does not match the zip directory's`);
  return out;
}

/* ---------- inflate, with Deflate64 (PKWARE's APPNOTE 4.4.5, method 9) ---------- */
// Deflate (RFC 1951) and Deflate64 differ in three places only: a 64 KB window, length code 285 (in Deflate64 a base
// of 3 with 16 extra bits; in Deflate the length 258) and distance codes 30 and 31 (32,769 and 49,153, 14 extra bits).
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 32769, 49153];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
/** A canonical Huffman code as a lookup table of 2^15 entries, indexed by the next 15 bits (least significant first):
    each entry is symbol × 16 + code length (0 where no code). */
function table(lengths) {
  const count = new Uint16Array(16), next = new Uint16Array(16), t = new Int32Array(1 << 15);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  for (let code = 0, l = 1; l < 16; l++) { code = (code + count[l - 1]) << 1; next[l] = code; }
  for (let s = 0; s < lengths.length; s++) {
    const l = lengths[s]; if (!l) continue;
    let c = next[l]++, r = 0;
    for (let k = 0; k < l; k++) { r = (r << 1) | (c & 1); c >>= 1; }
    for (let i = r; i < 1 << 15; i += 1 << l) t[i] = s * 16 + l;
  }
  return t;
}
let FIXED;
/** Inflates a raw Deflate (or, with deflate64, a Deflate64) stream whose unpacked size is known. */
export function inflate(src, size, { deflate64 = false } = {}) {
  const out = Buffer.alloc(size);
  let pos = 0, buf = 0, cnt = 0, op = 0;
  const need = n => { while (cnt < n) { buf |= (pos < src.length ? src[pos] : 0) << cnt; pos++; cnt += 8; } };
  const bits = n => { need(n); const v = buf & ((1 << n) - 1); buf >>>= n; cnt -= n; return v; };
  const sym = t => { need(15); const e = t[buf & 0x7fff]; const l = e & 15; if (!l) throw new Error('inflate: a code not in the table'); buf >>>= l; cnt -= l; return e >> 4; };
  for (let last = 0; !last;) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      pos -= cnt >> 3; buf = 0; cnt = 0; // to the next byte boundary, handing back the whole bytes read ahead
      const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      if (op + len > size) throw new Error('inflate: a stored block past the end');
      src.copy ? src.copy(out, op, pos, pos + len) : out.set(src.subarray(pos, pos + len), op);
      pos += len; op += len; continue;
    }
    let lt, dt;
    if (type === 1) {
      if (!FIXED) { const l = new Uint8Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288); FIXED = [table(l), table(new Uint8Array(32).fill(5))]; }
      [lt, dt] = FIXED;
    } else if (type === 2) {
      const hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, cl = new Uint8Array(19);
      for (let i = 0; i < hc; i++) cl[ORDER[i]] = bits(3);
      const ct = table(cl), lens = new Uint8Array(hl + hd);
      for (let i = 0; i < hl + hd;) {
        const s = sym(ct);
        if (s < 16) lens[i++] = s;
        else { const [rep, v] = s === 16 ? [3 + bits(2), lens[i - 1]] : s === 17 ? [3 + bits(3), 0] : [11 + bits(7), 0]; lens.fill(v, i, i + rep); i += rep; }
      }
      lt = table(lens.subarray(0, hl)); dt = table(lens.subarray(hl));
    } else throw new Error('inflate: block type 3');
    for (;;) {
      const s = sym(lt);
      if (s < 256) { out[op++] = s; continue; }
      if (s === 256) break;
      const k = s - 257;
      const len = deflate64 && k === 28 ? 3 + bits(16) : LBASE[k] + (LEXT[k] ? bits(LEXT[k]) : 0);
      const d = sym(dt);
      if (d >= 30 && !deflate64) throw new Error('inflate: distance code 30 or 31 in a Deflate stream');
      const dist = DBASE[d] + (DEXT[d] ? bits(DEXT[d]) : 0);
      if (dist > op || op + len > size) throw new Error('inflate: a copy outside the output');
      for (let i = 0; i < len; i++, op++) out[op] = out[op - dist];
    }
  }
  if (op !== size) throw new Error(`inflate: ${op} bytes, not ${size}`);
  return out;
}
const fileReader = file => { const fd = openSync(file, 'r'); return { fd, size: fstatSync(fd).size, rd: (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; } }; };

/** HYDE's label of an epoch as a signed historical year: 4000BC → -4000, 1970AD → 1970; 0AD → null (no year 0). */
export function yearOf(label) {
  const m = /^(\d+)(BC|AD)$/i.exec(label);
  if (!m) return null;
  const n = +m[1];
  if (n === 0) return null;
  return m[2].toUpperCase() === 'BC' ? -n : n;
}

/* ---------- the grid ---------- */
/** Step 3: an ESRI ASCII grid of people per cell summed into the 0.25° cells, by each cell's centre. */
export function sumAscii(text) {
  let pos = 0;
  const head = {};
  for (let k = 0; k < 6; k++) {
    const end = text.indexOf('\n', pos), [key, v] = text.slice(pos, end).trim().split(/\s+/);
    head[key.toLowerCase()] = +v; pos = end + 1;
  }
  const { ncols, nrows, xllcorner, yllcorner } = head, nodata = head.nodata_value;
  // HYDE writes its cell as 0.0833333; it is 5 arc minutes (1/12°), and the rounding would drift the last rows' centres.
  const cellsize = Math.abs(head.cellsize - 1 / 12) < 1e-6 ? 1 / 12 : head.cellsize;
  if (!(ncols > 0 && nrows > 0 && cellsize > 0)) throw new Error('not an ESRI ASCII grid');
  const sum = new Float64Array(COLS * ROWS);
  let total = 0, r = 0, c = 0, i = pos;
  const L = text.length;
  while (i < L && r < nrows) {
    let ch = text.charCodeAt(i);
    if (ch <= 32) { i++; continue; }
    let j = i; while (j < L && text.charCodeAt(j) > 32) j++;
    const v = +text.slice(i, j); i = j;
    if (v > 0 && v !== nodata) {
      const lat = yllcorner + (nrows - r - 0.5) * cellsize, lon = xllcorner + (c + 0.5) * cellsize;
      const R = Math.floor((90 - lat) / DEG), C = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / DEG)));
      if (R >= 0 && R < ROWS) { sum[R * COLS + C] += v; total += v; }
    }
    if (++c === ncols) { c = 0; r++; }
  }
  if (r !== nrows) throw new Error(`the grid ends after ${r} of ${nrows} rows`);
  return { sum, total, head };
}
/** Step 4: HYDE's own world total for each year column of popc_c.txt: its row "Total", and the sum of its country
    rows, which must agree. The file is in people (its 1970 total is 3.69 billion; the readme's "in 1000" is said of
    pop_c.txt, a file this archive does not hold). Its columns are years, BC below zero ("-4000"). */
export function countryTotals(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].trim().split(/\s+/), total = {}, sum = {};
  const row = lines.find(l => /^Total\s/.test(l.trim()));
  if (!row) throw new Error('popc_c.txt has no row "Total"');
  const tv = row.trim().split(/\s+/);
  for (let k = 1; k < head.length; k++) { total[head[k]] = +tv[k]; sum[head[k]] = 0; }
  for (const l of lines.slice(1)) { if (l === row) continue; const v = l.trim().split(/\s+/); for (let k = 1; k < head.length; k++) sum[head[k]] += +v[k] || 0; }
  for (const k of Object.keys(total)) if (Math.abs(sum[k] - total[k]) > 1e-6 * Math.max(1, total[k])) throw new Error(`popc_c.txt: its country rows for ${k} do not add up to its row "Total"`);
  return total;
}

export const METHOD = (breaks, years) => 'VM’s own text. People per km², from HYDE 3.2.1, the History Database of the Global Environment (Klein Goldewijk, Beusen, Doelman and Stehfest 2017, Utrecht University and PBL Netherlands Environmental Assessment Agency), baseline estimate, as the DANS Data Station publishes it (doi:10.17026/DANS-25G-GEZ3). Licence: the repository’s record gives CC0 1.0 (read 20 November 2026), which also waives the EU database right; HYDE’s own readme gives CC BY 3.0, which allows commercial use but says nothing of that right; VM credits HYDE as the readme asks. HYDE’s readme describes it as historical population estimates combined with land use, from 10,000 BCE to 2015 CE, on cells of 5 arc minutes. VM’s note: a cell is a modelled reconstruction, not a count, and the further back the epoch the less it rests on records. How VM made this layer (omni/scripts/build-density-hyde.mjs): it took HYDE’s population counts (popc) for ' + years.length + ' epochs from 4000 BC (the last before the map’s first year, 3400 BC) to AD 1970 (the last before the GHSL grid begins in 1975), added the people of every 5 arc-minute cell into cells of 0.25° (about 28 km at the equator) by the cell’s centre, checked each epoch’s world total against HYDE’s own world total (its table popc_c.txt, within one part in a thousand), rounded each cell to whole people and left out a cell of fewer than half a person. Density is the cell’s people over its area on a sphere of radius 6,371.0088 km. HYDE’s epochs are a thousand years apart before AD 1, a century apart to 1700 and ten years apart after; a frame between two epochs shows the epoch before it, and the legend says which. HYDE’s epoch “0 AD” is left out, since VM counts no year 0 and HYDE does not say whether it means 1 BC or AD 1. The classes are the GHSL grid’s (the nine deciles of density among the populated cells of 2020: ' + breaks.join(', ') + ' people per km²), so a colour means the same density on both layers. The grid is drawn only as cells, never on today’s countries.';

const sha256File = file => new Promise((ok, no) => { const h = createHash('sha256'); createReadStream(file).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });

async function main() {
  const zip = arg('--zip'), work = arg('--work');
  if (!zip || !work) throw new Error('Usage: node --max-old-space-size=6000 omni/scripts/build-density-hyde.mjs --zip <HYDE3_2_1-baseline.zip> --work <folder>');
  mkdirSync(work, { recursive: true });
  const ghsl = readJson(GHSL_INDEX);
  if (!ghsl?.breaks?.length) throw new Error(`${GHSL_INDEX}: the GHSL grid's classes are needed (build omni/scripts/build-density.mjs first)`);
  // Step 1.
  const z = fileReader(zip);
  if (z.size !== RELEASE.bytes) throw new Error(`${zip} is ${z.size} bytes, not ${RELEASE.bytes}`);
  const shaCache = join(work, 'archive.sha256');
  const sha = existsSync(shaCache) && readFileSync(shaCache, 'utf8').startsWith(`${z.size} `) ? readFileSync(shaCache, 'utf8').split(' ')[1].trim() : await sha256File(zip);
  if (sha !== RELEASE.sha256) throw new Error(`${zip}: sha256 ${sha} is not HYDE ${RELEASE.version}'s`);
  writeFileSync(shaCache, `${z.size} ${sha}\n`);
  // Step 2.
  const entries = zipEntries(z.rd, z.size);
  const pops = entries.map(e => ({ e, m: /(?:^|\/)asc\/(\d+(?:BC|AD))_pop\/popc_\1\.asc$/i.exec(e.name) })).filter(x => x.m)
    .map(x => ({ entry: x.e, label: x.m[1], year: yearOf(x.m[1]) })).filter(x => x.year != null && x.year >= FIRST && x.year <= LAST)
    .sort((a, b) => a.year - b.year);
  if (!pops.length) throw new Error('no population grid (asc/<label>_pop/popc_<label>.asc) in the zip');
  const popc = entries.find(e => /(?:^|\/)txt\/popc_c\.txt$/i.test(e.name));
  if (!popc) throw new Error('no txt/popc_c.txt in the zip');
  const totals = countryTotals(zipRead(z.rd, popc).toString('latin1'));
  // Steps 3 and 4.
  const now = stamp(), epochs = [];
  for (const p of pops) {
    const cache = join(work, `sum-${p.label}.f64`);
    let sum, total;
    if (existsSync(cache) && existsSync(cache + '.json') && JSON.parse(readFileSync(cache + '.json', 'utf8')).archive === RELEASE.sha256) {
      sum = new Float64Array(readFileSync(cache).buffer.slice(0)); total = JSON.parse(readFileSync(cache + '.json', 'utf8')).total;
    } else {
      ({ sum, total } = sumAscii(zipRead(z.rd, p.entry).toString('latin1')));
      writeFileSync(cache, Buffer.from(sum.buffer)); writeFileSync(cache + '.json', JSON.stringify({ archive: RELEASE.sha256, total }));
    }
    const own = totals[String(p.year)];
    if (own == null) throw new Error(`popc_c.txt has no column ${p.year}`);
    const off = Math.abs(total - own) / own;
    console.log(`${p.label}: ${Math.round(total)} people (HYDE's own total: ${Math.round(own)}; off by ${(off * 1e3).toFixed(4)} per thousand)`);
    if (off > 1e-3) throw new Error(`${p.label}: the grid's total differs from HYDE's own total`);
    epochs.push({ ...p, sum, total });
  }
  // Steps 5 and 6.
  const breaks = ghsl.breaks, years = epochs.map(e => e.year), files = [], texts = [];
  for (const e of epochs) {
    const s = sparse(e.sum), name = `${e.year < 0 ? `m${-e.year}` : e.year}.json`, prev = readJson(join(OUT, name));
    const doc = { format: 'vm-grid/1', layer: 'density-hyde', source: 'hyde-3.2.1', source_loc: e.entry.name, year: e.year, label: e.label, status: 'modelled',
      built: null, deg: DEG, cols: COLS, rows: ROWS, west: -180, north: 90, unit: 'people', total: s.total, populated: s.count, cells: s.cells };
    doc.built = keepBuilt(prev, doc, now);
    const text = JSON.stringify(doc) + '\n', m = measure(text);
    if (m.gzip > LIMIT_GZ) throw new Error(`${name} is ${m.gzip} bytes gzipped, over the limit`);
    texts.push([name, text]);
    files.push({ year: e.year, label: e.label, file: name, status: 'modelled', total: s.total, populated: s.count, ...m, from: { file: RELEASE.file, entry: e.entry.name, url: RELEASE.url, sha256: RELEASE.sha256 } });
  }
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of texts) writeFileSync(join(OUT, name), text);
  for (const f of files) console.log(`${f.file}: ${f.populated} cells, ${f.total} people, ${f.bytes} bytes, ${f.gzip} gzipped`);
  const index = { format: 'vm-grid-index/1', layer: 'density-hyde', source: 'hyde-3.2.1', version: `HYDE ${RELEASE.version} baseline`, built: null, deg: DEG, cols: COLS, rows: ROWS,
    west: -180, north: 90, radiusKm: R_KM, unit: 'people', measure: 'people per km²', breaks, breaksFrom: 'the GHSL grid (omni/data/layers/density/index.json, 2020)', years, files };
  index.built = keepBuilt(readJson(join(OUT, 'index.json')), index, now);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  const listed = new Set([...files.map(f => f.file), 'index.json']);
  const stale = readdirSync(OUT).filter(f => !listed.has(f));
  if (stale.length) console.log(`No longer in the index, to be removed by hand: ${stale.join(', ')}`);
  putLayer(LAYERS, {
    id: 'density-hyde', module: 'omni-map', title: 'Population density before 1975 (HYDE)', role: 'fill', geometry: 'grid',
    time: { field: 'epoch', from: years[0], to: years.at(-1), until: UNTIL, step: 'listed', stepWords: 'a thousand years apart before AD 1, a century apart to 1700, ten years apart after', precision: 'year', values: years, shows: 'the epoch at or before the frame' },
    data: 'omni/data/layers/density-hyde/index.json', split: 'year', space: 'cells of 0.25°, about 28 km across at the equator', measure: 'people per km² (0.25° cells)', status: 'modelled',
    style: { kind: 'classes', breaks, unit: 'people per km²', scheme: 'sequential' },
    legend: 'Population: HYDE 3.2.1 baseline (Klein Goldewijk et al. 2017, Utrecht University and PBL), CC0 1.0 (its readme: CC BY 3.0) – a modelled reconstruction, summed into 0.25° cells by Vitruvian Manager',
    source: 'hyde-3.2.1', method: METHOD(breaks, years), open: true, pinnable: true, built: index.built,
  });
  dropAbsent(LAYERS, 'density-deep-time');
  putSource(SOURCES, SOURCE);
  closeSync(z.fd);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
