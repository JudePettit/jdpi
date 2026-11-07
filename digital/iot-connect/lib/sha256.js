// IoT Connect: SHA-256 and HMAC-SHA-256, hand-written (FIPS 180-4, RFC 2104), and the phone remote's request
// signature. A phone opens the remote over plain HTTP on the home Wi-Fi, where WebCrypto's `subtle` is missing (it
// needs a secure page), so the signature cannot lean on it. The bridge serves the phone its own copy of the same
// algorithm; tests/iot-connect.test.mjs checks this one against Node's crypto and the bridge's phoneSignature, and the
// page tests' fake phone signs with it. No DOM, no network: it runs the same in a browser and in Node.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

/** SHA-256 of a Uint8Array, as 32 bytes. */
export function sha256(bytes) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const n = bytes.length, total = Math.ceil((n + 9) / 64) * 64, m = new Uint8Array(total);
  m.set(bytes); m[n] = 0x80;
  const hi = Math.floor(n / 0x20000000), lo = (n * 8) >>> 0; // the length in bits, as two 32-bit words
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, hi); dv.setUint32(total - 4, lo);
  const w = new Uint32Array(64);
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(4 * i, H[i]);
  return out;
}

/** HMAC-SHA-256 (RFC 2104) of message bytes under key bytes. */
export function hmacSha256(key, msg) {
  const k = new Uint8Array(64);
  k.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + msg.length), outer = new Uint8Array(96);
  for (let i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
  inner.set(msg, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

export const utf8 = s => new TextEncoder().encode(String(s));
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
/** Bytes from base64url (the remote key's form), without atob, so Node and every browser agree. */
export function fromBase64url(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const clean = String(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of clean) {
    const v = A.indexOf(ch);
    if (v < 0) throw new Error('Not base64url');
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return new Uint8Array(out);
}

/** The text a phone signs, one item a line: method, path and query, the body's SHA-256, the time and the nonce. */
export const signingText = (method, path, body, ts, nonce) => [method, path, hex(sha256(utf8(body || ''))), ts, nonce].join('\n');

/** The signature, as the bridge checks it: the HMAC key is the SHA-256 of the remote key, which is all it keeps. */
export function phoneSignature(remoteKey, method, path, body, ts, nonce) {
  return hex(hmacSha256(sha256(fromBase64url(remoteKey)), utf8(signingText(method, path, body, ts, nonce))));
}

/** The X-VM-Sig header for one request. */
export function signHeader({ phone, key, method, path, body = '', ts, nonce }) {
  if (!/^[0-9a-f]{16,64}$/.test(nonce)) throw new Error('The nonce is 16 to 64 hex characters.');
  return `phone=${phone},ts=${ts},nonce=${nonce},sig=${phoneSignature(key, method, path, body, ts, nonce)}`;
}
