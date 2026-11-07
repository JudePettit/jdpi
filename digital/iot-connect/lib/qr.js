// IoT Connect: a QR code encoder, hand-written (ISO/IEC 18004), for the phone remote's pairing address. Byte mode,
// error correction level M (about 15% of the symbol can be damaged), versions 1 to 10 (up to 213 bytes: the pairing
// address is about 45), and the mask with the lowest penalty. It follows the standard's steps in order: the data
// bits, Reed-Solomon error correction per block, interleaving, the function patterns, the zigzag placement, masking,
// and the format and version information. No DOM, no network: the Remote tab draws the result as SVG.

// Per version 1-10 at level M: error-correction codewords per block, and the number of blocks.
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ECC_M = 0; // the format bits' code for level M (L 1, M 0, Q 3, H 2)

/** Multiply in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1 (0x11D). */
export function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
/** The Reed-Solomon generator polynomial of a degree, highest coefficient (always 1) left out. */
export function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
/** The error-correction codewords of a block of data codewords. */
export function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ r.shift();
    r.push(0);
    for (let i = 0; i < divisor.length; i++) r[i] ^= gfMul(divisor[i], factor);
  }
  return r;
}

/** Modules available for data and error correction in a version (everything but the function patterns). */
export function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
  return n;
}
export const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver - 1] * BLOCKS[ver - 1];
/** Byte-mode capacity of a version at level M. */
export const capacity = ver => Math.floor((dataCodewords(ver) * 8 - 4 - (ver < 10 ? 8 : 16)) / 8);

export function alignmentPositions(ver) {
  if (ver === 1) return [];
  const size = ver * 4 + 17, n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** The 15 format bits for a level code and a mask (BCH(15,5), then XOR 101010000010010). */
export function formatBits(eccCode, mask) {
  const data = (eccCode << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
/** The 18 version bits (Golay(18,6)), for version 7 and up. */
export function versionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

export const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The data codewords of a text: mode, count, the bytes, terminator, padding. */
export function encodeData(bytes, ver) {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** Split into blocks, add each block's error correction, and interleave. */
export function addEcc(data, ver) {
  const nBlocks = BLOCKS[ver - 1], ecc = ECC_PER_BLOCK[ver - 1], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
  const div = rsDivisor(ecc), blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const d = data.slice(k, k + shortLen - ecc + (i < nShort ? 0 : 1));
    k += d.length;
    const e = rsRemainder(d, div);
    if (i < nShort) d.push(0); // a placeholder, so every block has the same length; skipped below
    blocks.push(d.concat(e));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (i !== shortLen - ecc || j >= nShort) out.push(blocks[j][i]);
  return out;
}

function grid(size, v) { return Array.from({ length: size }, () => new Array(size).fill(v)); }

/** Draw everything that is not data: finders, separators, timing, alignment, the dark module, format and version. */
function functionPatterns(ver) {
  const size = ver * 4 + 17, m = grid(size, false), fn = grid(size, false);
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver), last = al.length - 1;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(m, fn, 0); // reserved now, drawn for real once the mask is chosen
  if (ver >= 7) {
    const bits = versionBits(ver);
    for (let i = 0; i < 18; i++) { const dark = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }
  return { size, m, fn };
}
function drawFormat(m, fn, bits) {
  const size = m.length;
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  const bit = i => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the dark module
}

/** The zigzag order of the data modules: two columns at a time, right to left, up then down, skipping column 6. */
export function zigzag(size, fn) {
  const order = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - v : v;
      if (!fn[y][x]) order.push([x, y]);
    }
  }
  return order;
}

/** The standard's penalty score: runs, 2×2 blocks, finder-like patterns, and the balance of dark and light. */
export function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map(r => r[x]));
  for (const line of lines) {
    for (let i = 0; i < size;) { let j = i; while (j < size && line[j] === line[i]) j++; if (j - i >= 5) score += 3 + (j - i - 5); i = j; }
    const s = line.map(v => (v ? 1 : 0)).join('');
    for (const pat of ['10111010000', '00001011101']) for (let k = s.indexOf(pat); k >= 0; k = s.indexOf(pat, k + 1)) score += 40;
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3; }
  let dark = 0;
  for (const r of m) for (const v of r) if (v) dark++;
  const total = size * size;
  score += Math.ceil(Math.abs(dark * 20 - total * 10) / total - 1) * 10;
  return score;
}

/**
 * The QR code of a text: { version, size, mask, modules } where modules[y][x] is true for a dark module. The caller
 * adds the four-module quiet zone around it.
 */
export function qrEncode(text, { minVersion = 1 } = {}) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let ver = Math.max(1, minVersion);
  while (ver <= 10 && bytes.length > capacity(ver)) ver++;
  if (ver > 10) throw new Error('Too long for a QR code here (at most 213 bytes).');
  const code = addEcc(encodeData(bytes, ver), ver);
  const base = functionPatterns(ver);
  const order = zigzag(base.size, base.fn);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.m.map(r => r.slice()), fn = base.fn.map(r => r.slice());
    order.forEach(([x, y], i) => { const bit = i < code.length * 8 ? ((code[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false; m[y][x] = bit !== MASKS[mask](x, y); });
    drawFormat(m, fn, formatBits(ECC_M, mask));
    const p = penalty(m);
    if (!best || p < best.p) best = { p, mask, m };
  }
  return { version: ver, size: base.size, mask: best.mask, modules: best.m };
}

/** One SVG path for the dark modules, in module units, offset by the quiet zone. */
export function qrPath(modules, quiet = 4) {
  let d = '';
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (!row[x]) { x++; continue; }
      let w = 1; while (x + w < row.length && row[x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}
