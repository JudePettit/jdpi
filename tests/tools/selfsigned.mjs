// A throwaway certificate authority and leaf certificates for the IoT Connect tests, made fresh each run in memory and
// never written to disk or committed. Node can sign but cannot build an X.509 certificate, so the DER is put together
// here by hand (RFC 5280): an EC P-256 key, ecdsa-with-SHA256, a name with one CN, and the few extensions TLS needs.
import { generateKeyPairSync, sign, randomBytes, X509Certificate } from 'node:crypto';

const len = n => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]));
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts.map(p => (Buffer.isBuffer(p) ? p : Buffer.from(p)))); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const seq = (...p) => tlv(0x30, ...p), set = (...p) => tlv(0x31, ...p);
function oid(s) {
  const n = s.split('.').map(Number), out = [40 * n[0] + n[1]];
  for (const v of n.slice(2)) { const b = []; let x = v; do { b.unshift(x & 127); x >>= 7; } while (x); for (let i = 0; i < b.length - 1; i++) b[i] |= 128; out.push(...b); }
  return tlv(0x06, Buffer.from(out));
}
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8'));
const time = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const name = cn => seq(set(seq(oid('2.5.4.10'), utf8('VM test'))), set(seq(oid('2.5.4.3'), utf8(cn))));
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));

/** A positive 8-byte serial in its shortest DER form: the first byte has its top bit clear (positive) and is never zero
 *  (a leading zero byte would be padding, which OpenSSL refuses as "illegal padding" about one time in 214). */
export function serialNumber() { const s = randomBytes(8); s[0] = 0x40 | (s[0] & 0x3f); return s; }

function certificate({ subject, issuer, publicKey, signingKey, ca = false, ips = [], dnsNames = [] }) {
  const serial = serialNumber();
  const now = Date.now();
  const exts = [seq(oid('2.5.29.19'), tlv(0x01, Buffer.from([0xff])), tlv(0x04, ca ? seq(tlv(0x01, Buffer.from([0xff]))) : seq()))];
  if (ca) exts.push(seq(oid('2.5.29.15'), tlv(0x01, Buffer.from([0xff])), tlv(0x04, tlv(0x03, Buffer.from([0x01, 0x06])))));
  if (ips.length || dnsNames.length) {
    const alt = [...dnsNames.map(d => tlv(0x82, Buffer.from(d))), ...ips.map(ip => tlv(0x87, Buffer.from(ip.split('.').map(Number))))];
    exts.push(seq(oid('2.5.29.17'), tlv(0x04, seq(...alt))));
  }
  const tbs = seq(tlv(0xa0, tlv(0x02, Buffer.from([2]))), tlv(0x02, serial), ECDSA_SHA256, name(issuer), seq(time(new Date(now - 86400e3)), time(new Date(now + 30 * 86400e3))),
    name(subject), publicKey.export({ type: 'spki', format: 'der' }), tlv(0xa3, seq(...exts)));
  const sig = sign('sha256', tbs, signingKey);
  const der = seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  return `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
}

/** A root that signs the test leaves. */
export function makeCA(cn = 'VM test root') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const certPem = certificate({ subject: cn, issuer: cn, publicKey, signingKey: privateKey, ca: true });
  return { cn, certPem, privateKey };
}
/** A leaf for a fake device: CN (the Hue bridge id, say) and IP addresses in its subjectAltName. */
export function makeLeaf(ca, { cn = '127.0.0.1', ips = ['127.0.0.1'], dnsNames = [] } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const certPem = certificate({ subject: cn, issuer: ca.cn, publicKey, signingKey: ca.privateKey, ips, dnsNames });
  return { certPem, keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), fingerprint: new X509Certificate(certPem).fingerprint256 };
}
