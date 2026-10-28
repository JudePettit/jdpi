// Media check: image metadata read from the bytes of a file the user picked. EXIF (camera, times, GPS, embedded
// thumbnail), XMP (editing history, AI labels), IPTC captions, PNG text chunks and Content Credentials (C2PA) markers,
// for JPEG, PNG, WebP, HEIC/AVIF and TIFF. Nothing leaves the browser. Pure (no DOM), so tests/osint.test.mjs runs it in
// Node. It also writes small EXIF blocks, for the page's sample image and for the tests.

const ascii = (u8, at, n) => { let s = ''; for (let i = at; i < at + n && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
const utf8 = u8 => new TextDecoder('utf-8').decode(u8);
const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
const u32be = (u8, p) => ((u8[p] << 24) >>> 0) + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3];
const u32le = (u8, p) => u8[p] + (u8[p + 1] << 8) + (u8[p + 2] << 16) + ((u8[p + 3] << 24) >>> 0);
const pad2 = n => String(n).padStart(2, '0');
const SCAN_LIMIT = 16 * 1024 * 1024;

/** Find a byte string in u8 from `from`; -1 if absent. */
function indexOfBytes(u8, needle, from = 0, to = u8.length) {
  const n = needle.length, first = needle.charCodeAt(0);
  outer: for (let i = from; i <= Math.min(to, u8.length) - n; i++) {
    if (u8[i] !== first) continue;
    for (let j = 1; j < n; j++) if (u8[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

/** The container format from the first bytes. */
export function sniffFormat(u8) {
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
  if (u8[0] === 0x89 && ascii(u8, 1, 3) === 'PNG') return 'png';
  if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 4) === 'WEBP') return 'webp';
  if (ascii(u8, 4, 4) === 'ftyp') {
    const brands = ascii(u8, 8, 4) + ascii(u8, 16, Math.min(32, Math.max(0, u32be(u8, 0) - 16)));
    if (/avif|avis/.test(brands)) return 'avif';
    if (/heic|heix|hevc|heim|heis|hevx|mif1|msf1/.test(brands)) return 'heic';
    return 'video';
  }
  if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2A && u8[3] === 0) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[2] === 0 && u8[3] === 0x2A)) return 'tiff';
  if (ascii(u8, 0, 3) === 'GIF') return 'gif';
  if (u8[0] === 0x42 && u8[1] === 0x4D) return 'bmp';
  return 'unknown';
}
export const FORMAT_NAMES = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', heic: 'HEIC/HEIF', avif: 'AVIF', tiff: 'TIFF (or camera raw)', gif: 'GIF', bmp: 'BMP', video: 'Video (MP4/MOV)', unknown: 'Unknown' };

/* ---------------------------------------------------------------------------------------------------------------
   TIFF / EXIF
   --------------------------------------------------------------------------------------------------------------- */
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const IFD0_TAGS = {
  0x0100: 'ImageWidth', 0x0101: 'ImageHeight', 0x010E: 'ImageDescription', 0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
  0x0131: 'Software', 0x0132: 'ModifyDate', 0x013B: 'Artist', 0x013C: 'HostComputer', 0x8298: 'Copyright', 0x8769: 'ExifIFD', 0x8825: 'GPSIFD',
};
const IFD1_TAGS = { 0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength', 0x0103: 'Compression' };
const EXIF_TAGS = {
  0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal',
  0x9004: 'CreateDate', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9012: 'OffsetTimeDigitized', 0x9204: 'ExposureCompensation',
  0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920A: 'FocalLength', 0x927C: 'MakerNote', 0x9286: 'UserComment', 0x9290: 'SubSecTime',
  0x9291: 'SubSecTimeOriginal', 0x9292: 'SubSecTimeDigitized', 0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension', 0xA402: 'ExposureMode',
  0xA403: 'WhiteBalance', 0xA405: 'FocalLengthIn35mmFormat', 0xA406: 'SceneCaptureType', 0xA420: 'ImageUniqueID', 0xA430: 'CameraOwnerName',
  0xA431: 'BodySerialNumber', 0xA432: 'LensSpecification', 0xA433: 'LensMake', 0xA434: 'LensModel', 0xA435: 'LensSerialNumber',
};
const GPS_TAGS = {
  0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',
  0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x000B: 'GPSDOP', 0x000C: 'GPSSpeedRef', 0x000D: 'GPSSpeed',
  0x000E: 'GPSTrackRef', 0x000F: 'GPSTrack', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection', 0x0012: 'GPSMapDatum',
  0x0018: 'GPSDestBearing', 0x001B: 'GPSProcessingMethod', 0x001D: 'GPSDateStamp', 0x001F: 'GPSHPositioningError',
};

function readValue(dv, type, count, off, le) {
  if (type === 2) {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset + off, count);
    const end = bytes.indexOf(0);
    return utf8(end >= 0 ? bytes.subarray(0, end) : bytes).trim();
  }
  if ((type === 1 || type === 7) && count > 64) return { bytes: count };
  const one = i => {
    switch (type) {
      case 1: case 7: return dv.getUint8(off + i);
      case 3: return dv.getUint16(off + i * 2, le);
      case 4: return dv.getUint32(off + i * 4, le);
      case 5: return [dv.getUint32(off + i * 8, le), dv.getUint32(off + i * 8 + 4, le)];
      case 6: return dv.getInt8(off + i);
      case 8: return dv.getInt16(off + i * 2, le);
      case 9: return dv.getInt32(off + i * 4, le);
      case 10: return [dv.getInt32(off + i * 8, le), dv.getInt32(off + i * 8 + 4, le)];
      case 11: return dv.getFloat32(off + i * 4, le);
      case 12: return dv.getFloat64(off + i * 8, le);
      default: return null;
    }
  };
  if (count === 1 && type !== 7) return one(0);
  const out = [];
  for (let i = 0; i < count; i++) out.push(one(i));
  return out;
}

/**
 * Parse a TIFF structure (an EXIF block starts with one) at `start` within u8: named tags of IFD0, the EXIF and GPS
 * sub-IFDs, and IFD1's thumbnail position (as an absolute offset in u8).
 */
export function parseTiff(u8, start = 0, length = u8.length - start) {
  const len = Math.min(length, u8.length - start);
  if (len < 8) throw new Error('TIFF block too short');
  const dv = new DataView(u8.buffer, u8.byteOffset + start, len);
  const order = dv.getUint16(0);
  if (order !== 0x4949 && order !== 0x4D4D) throw new Error('Not a TIFF block');
  const le = order === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new Error('Not a TIFF block');
  const seen = new Set();
  const out = { ifd0: {}, exif: {}, gps: {}, ifd1: {}, littleEndian: le };
  const readIfd = (off, names, target) => {
    if (!off || off + 2 > len || seen.has(off)) return 0;
    seen.add(off);
    const n = dv.getUint16(off, le);
    if (n > 512) return 0;
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > len) break;
      const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
      const name = names[tag];
      if (!name || !TYPE_SIZE[type]) continue;
      const size = TYPE_SIZE[type] * count;
      if (name === 'MakerNote') { target.MakerNote = { bytes: count }; continue; }
      const at = size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
      if (at + size > len || count > 1e6) continue;
      try { target[name] = readValue(dv, type, count, at, le); } catch { /* skip a broken entry */ }
    }
    const next = off + 2 + n * 12;
    return next + 4 <= len ? dv.getUint32(next, le) : 0;
  };
  const ifd1 = readIfd(dv.getUint32(4, le), IFD0_TAGS, out.ifd0);
  if (typeof out.ifd0.ExifIFD === 'number') readIfd(out.ifd0.ExifIFD, EXIF_TAGS, out.exif);
  if (typeof out.ifd0.GPSIFD === 'number') readIfd(out.ifd0.GPSIFD, GPS_TAGS, out.gps);
  if (ifd1) readIfd(ifd1, IFD1_TAGS, out.ifd1);
  delete out.ifd0.ExifIFD; delete out.ifd0.GPSIFD;
  const t = out.ifd1;
  out.thumbnail = typeof t.ThumbnailOffset === 'number' && t.ThumbnailLength > 0 && t.ThumbnailOffset + t.ThumbnailLength <= len
    ? { offset: start + t.ThumbnailOffset, length: t.ThumbnailLength } : null;
  return out;
}

const rat = r => (Array.isArray(r) && r.length === 2 ? (r[1] ? r[0] / r[1] : NaN) : typeof r === 'number' ? r : NaN);
/** Degrees, minutes, seconds (three rationals) and a hemisphere letter → signed decimal degrees. */
export function dmsToDecimal(v, ref) {
  if (!Array.isArray(v)) return NaN;
  const parts = Array.isArray(v[0]) ? v.map(rat) : [rat(v)];
  const [d = NaN, m = 0, s = 0] = parts;
  let x = d + (m || 0) / 60 + (s || 0) / 3600;
  if (/^[SW]/i.test(String(ref || ''))) x = -x;
  return x;
}
/** An EXIF date ("2026:10:27 14:05:09") with an optional offset ("+01:00") → { text, iso, offset }; null if empty. */
export function exifDate(v, offset = '') {
  const m = String(v || '').match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === '0000') return null;
  const text = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  const off = /^[+-]\d{2}:\d{2}$/.test(String(offset || '')) ? offset : '';
  return { text, offset: off, iso: off ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}` : '', day: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/** The GPS block as decimal values; null when it holds no usable position. */
export function gpsFrom(g) {
  if (!g || g.GPSLatitude === undefined || g.GPSLongitude === undefined) return null;
  const lat = dmsToDecimal(g.GPSLatitude, g.GPSLatitudeRef), lon = dmsToDecimal(g.GPSLongitude, g.GPSLongitudeRef);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const alt = rat(g.GPSAltitude);
  const dir = rat(g.GPSImgDirection);
  const acc = rat(g.GPSHPositioningError);
  let time = '';
  const ds = String(g.GPSDateStamp || '').match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (ds && Array.isArray(g.GPSTimeStamp) && g.GPSTimeStamp.length === 3) {
    const [h, mi, s] = g.GPSTimeStamp.map(rat);
    if ([h, mi, s].every(Number.isFinite)) time = `${ds[1]}-${ds[2]}-${ds[3]}T${pad2(Math.floor(h))}:${pad2(Math.floor(mi))}:${pad2(Math.floor(s))}Z`;
  }
  return {
    lat, lon, nullIsland: Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6,
    alt: Number.isFinite(alt) ? (g.GPSAltitudeRef === 1 || (Array.isArray(g.GPSAltitudeRef) && g.GPSAltitudeRef[0] === 1) ? -alt : alt) : null,
    direction: Number.isFinite(dir) ? ((dir % 360) + 360) % 360 : null, directionRef: g.GPSImgDirectionRef === 'M' ? 'magnetic' : g.GPSImgDirectionRef === 'T' ? 'true' : '',
    accuracy: Number.isFinite(acc) ? acc : null, time, datum: g.GPSMapDatum || '',
  };
}

/* ---------------------------------------------------------------------------------------------------------------
   XMP, IPTC, PNG text
   --------------------------------------------------------------------------------------------------------------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()]);
const XMP_FIELDS = [
  'xmp:CreatorTool', 'xmp:CreateDate', 'xmp:ModifyDate', 'xmp:MetadataDate', 'photoshop:DateCreated', 'photoshop:Headline', 'photoshop:City',
  'photoshop:State', 'photoshop:Country', 'photoshop:Credit', 'photoshop:Source', 'photoshop:CaptionWriter', 'dc:title', 'dc:description', 'dc:creator', 'dc:rights',
  'dc:subject', 'xmpMM:DocumentID', 'xmpMM:OriginalDocumentID', 'xmpMM:InstanceID', 'Iptc4xmpCore:Location', 'Iptc4xmpCore:CountryCode',
  'Iptc4xmpExt:DigitalSourceType', 'exif:DateTimeOriginal', 'exif:GPSLatitude', 'exif:GPSLongitude', 'tiff:Make', 'tiff:Model', 'aux:Lens',
];
function xmpValue(xml, name) {
  let m = xml.match(new RegExp(`[\\s<]${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  if (m) return decodeEntities(m[1] ?? m[2]).trim();
  m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  const lis = [...m[1].matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/g)].map(x => decodeEntities(x[1].replace(/<[^>]+>/g, '').trim())).filter(Boolean);
  return lis.length ? lis.join('; ') : decodeEntities(m[1].replace(/<[^>]+>/g, '').trim());
}
/** Named fields and the editing history (xmpMM:History) from an XMP packet. */
export function parseXmp(xml) {
  const s = String(xml || '');
  const fields = {};
  for (const name of XMP_FIELDS) { const v = xmpValue(s, name); if (v) fields[name] = v; }
  const history = [];
  const block = (s.match(/<xmpMM:History[\s\S]*?<\/xmpMM:History>/) || [])[0] || '';
  for (const li of block.matchAll(/<rdf:li\b([^>]*?)(\/>|>([\s\S]*?)<\/rdf:li>)/g)) {
    const attrs = li[1] || '', inner = li[3] || '';
    const pick = k => { const a = attrs.match(new RegExp(`stEvt:${k}\\s*=\\s*"([^"]*)"`)); if (a) return decodeEntities(a[1]); const e = inner.match(new RegExp(`<stEvt:${k}>([\\s\\S]*?)</stEvt:${k}>`)); return e ? decodeEntities(e[1].trim()) : ''; };
    const ev = { action: pick('action'), when: pick('when'), software: pick('softwareAgent'), changed: pick('changed') };
    if (ev.action || ev.when || ev.software) history.push(ev);
  }
  return { fields, history, length: s.length };
}
export const DIGITAL_SOURCE_TYPES = {
  digitalCapture: 'Captured by a camera or recorder', negativeFilm: 'Scanned from a film negative', positiveFilm: 'Scanned from film', print: 'Scanned from a print',
  minorHumanEdits: 'Captured, with minor human edits', humanEdits: 'Captured, with human edits', compositeCapture: 'A composite of captured elements',
  algorithmicallyEnhanced: 'Captured, then enhanced by an algorithm', dataDrivenMedia: 'Generated from data (for example a chart)', digitalArt: 'Made by a person with digital tools',
  virtualRecording: 'A recording of a virtual scene', compositeSynthetic: 'A composite that includes synthetic elements', screenCapture: 'A screenshot',
  trainedAlgorithmicMedia: 'Made by generative AI', compositeWithTrainedAlgorithmicMedia: 'Edited with generative AI', algorithmicMedia: 'Made by an algorithm (not trained AI)',
};
export const sourceTypeKey = uri => String(uri || '').split('/').pop().trim();

const IPTC_FIELDS = { 5: 'ObjectName', 25: 'Keywords', 55: 'DateCreated', 60: 'TimeCreated', 80: 'Byline', 85: 'BylineTitle', 90: 'City', 92: 'Sublocation', 95: 'Province', 100: 'CountryCode', 101: 'Country', 103: 'TransmissionReference', 105: 'Headline', 110: 'Credit', 115: 'Source', 116: 'Copyright', 120: 'Caption', 122: 'Writer' };
/** IPTC IIM record 2 from a Photoshop "8BIM" resource block (JPEG APP13). */
export function parseIptc(u8) {
  const out = {};
  let p = 0;
  while (p + 12 <= u8.length) {
    if (ascii(u8, p, 4) !== '8BIM') break;
    const id = (u8[p + 4] << 8) | u8[p + 5];
    const nameLen = u8[p + 6];
    let q = p + 6 + 1 + nameLen;
    if (q % 2) q++;
    const size = u32be(u8, q);
    const data = u8.subarray(q + 4, q + 4 + size);
    if (id === 0x0404) {
      let r = 0;
      while (r + 5 <= data.length) {
        if (data[r] !== 0x1C) { r++; continue; }
        const rec = data[r + 1], ds = data[r + 2], n = (data[r + 3] << 8) | data[r + 4];
        const val = data.subarray(r + 5, r + 5 + n);
        r += 5 + n;
        if (rec !== 2 || !IPTC_FIELDS[ds]) continue;
        const name = IPTC_FIELDS[ds], text = utf8(val).trim();
        if (!text) continue;
        out[name] = name === 'Keywords' && out[name] ? out[name] + '; ' + text : text;
      }
    }
    p = q + 4 + size + (size % 2);
  }
  return Object.keys(out).length ? out : null;
}

const AI_PNG_KEYS = /^(parameters|prompt|workflow|Dream|sd-metadata|invokeai_metadata|generation_data|NovelAI|Comment)$/i;

/* ---------------------------------------------------------------------------------------------------------------
   Containers
   --------------------------------------------------------------------------------------------------------------- */
function emptyMeta(format, size) {
  return { format, formatName: FORMAT_NAMES[format] || format, size, width: null, height: null, tiff: null, gps: null, xmp: null, xmpRaw: '', iptc: null, pngText: [], pngTime: '', comment: '', c2pa: null, thumbnail: null, warnings: [] };
}
function addTiff(meta, u8, start, length, where) {
  if (meta.tiff) return;
  try { meta.tiff = parseTiff(u8, start, length); meta.tiff.where = where; meta.thumbnail = meta.tiff.thumbnail; } catch (e) { meta.warnings.push(`Could not read the EXIF block (${e.message}).`); }
}
function addXmp(meta, text) {
  if (!text || meta.xmpRaw) return;
  meta.xmpRaw = text.slice(0, 200000);
  meta.xmp = parseXmp(text);
}
const isC2paBox = (u8, at, to) => indexOfBytes(u8, 'c2pa', at, to) >= 0 && (indexOfBytes(u8, 'jumb', at, to) >= 0 || indexOfBytes(u8, 'jumd', at, to) >= 0);

function readJpeg(u8, meta) {
  let p = 2;
  while (p + 4 <= u8.length) {
    if (u8[p] !== 0xFF) { meta.warnings.push('The JPEG structure is irregular; some metadata may be missed.'); break; }
    const marker = u8[p + 1];
    if (marker === 0xFF) { p++; continue; }
    if (marker === 0xD9 || marker === 0xDA) break;
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { p += 2; continue; }
    const len = (u8[p + 2] << 8) | u8[p + 3];
    const s = p + 4, e = p + 2 + len;
    if (len < 2 || e > u8.length) break;
    if (marker === 0xE1) {
      if (ascii(u8, s, 6) === 'Exif\0\0') addTiff(meta, u8, s + 6, len - 8, 'JPEG APP1');
      else if (ascii(u8, s, 29) === 'http://ns.adobe.com/xap/1.0/\0') addXmp(meta, utf8(u8.subarray(s + 29, e)));
    } else if (marker === 0xED && ascii(u8, s, 14) === 'Photoshop 3.0\0') {
      meta.iptc = meta.iptc || parseIptc(u8.subarray(s + 14, e));
    } else if (marker === 0xEB && ascii(u8, s, 2) === 'JP' && isC2paBox(u8, s, e)) {
      meta.c2pa = { where: 'JPEG APP11 (JUMBF)' };
    } else if (marker === 0xFE) {
      meta.comment = meta.comment || utf8(u8.subarray(s, e)).replace(/\0+$/, '').trim().slice(0, 2000);
    } else if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker) && meta.width === null) {
      meta.height = (u8[s + 1] << 8) | u8[s + 2];
      meta.width = (u8[s + 3] << 8) | u8[s + 4];
    }
    p = e;
  }
}
function readPng(u8, meta) {
  let p = 8;
  while (p + 12 <= u8.length) {
    const len = u32be(u8, p), type = ascii(u8, p + 4, 4), d = u8.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { meta.width = u32be(d, 0); meta.height = u32be(d, 4); }
    else if (type === 'eXIf') addTiff(meta, u8, p + 8, len, 'PNG eXIf chunk');
    else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const z = d.indexOf(0);
      const key = latin1(d.subarray(0, z < 0 ? Math.min(d.length, 79) : z));
      let value = '';
      if (type === 'tEXt') value = latin1(d.subarray(z + 1));
      else if (type === 'zTXt') value = '(compressed text)';
      else {
        const compressed = d[z + 1] === 1;
        let q = z + 3;
        q = d.indexOf(0, q) + 1; // language tag
        q = d.indexOf(0, q) + 1; // translated keyword
        value = compressed ? '(compressed text)' : utf8(d.subarray(q));
      }
      if (key === 'XML:com.adobe.xmp') addXmp(meta, value);
      else meta.pngText.push({ key, value: value.slice(0, 4000), ai: AI_PNG_KEYS.test(key) && !/^Comment$/i.test(key) || (/^Comment$/i.test(key) && /steps|sampler|cfg|seed|prompt/i.test(value)) });
    } else if (type === 'tIME' && len >= 7) {
      meta.pngTime = `${(d[0] << 8) | d[1]}-${pad2(d[2])}-${pad2(d[3])}T${pad2(d[4])}:${pad2(d[5])}:${pad2(d[6])}Z`;
    } else if (type === 'caBX') meta.c2pa = { where: 'PNG caBX chunk' };
    if (type === 'IEND') break;
    p += 12 + len;
  }
}
function readWebp(u8, meta) {
  let p = 12;
  while (p + 8 <= u8.length) {
    const type = ascii(u8, p, 4), len = u32le(u8, p + 4), s = p + 8;
    if (type === 'VP8X' && len >= 10) { meta.width = 1 + (u8[s + 4] | (u8[s + 5] << 8) | (u8[s + 6] << 16)); meta.height = 1 + (u8[s + 7] | (u8[s + 8] << 8) | (u8[s + 9] << 16)); }
    else if (type === 'EXIF') { const off = ascii(u8, s, 6) === 'Exif\0\0' ? 6 : 0; addTiff(meta, u8, s + off, len - off, 'WebP EXIF chunk'); }
    else if (type === 'XMP ') addXmp(meta, utf8(u8.subarray(s, s + len)));
    else if (type === 'C2PA') meta.c2pa = { where: 'WebP C2PA chunk' };
    p = s + len + (len % 2);
  }
}
/** HEIC, AVIF and anything else: find an "Exif\0\0" marker followed by a TIFF header. */
function scanExif(u8, meta) {
  const end = Math.min(u8.length, SCAN_LIMIT);
  let i = 0;
  while ((i = indexOfBytes(u8, 'Exif\0\0', i, end)) >= 0) {
    const t = ascii(u8, i + 6, 4);
    if (t === 'II*\0' || t === 'MM\0*') { addTiff(meta, u8, i + 6, u8.length - i - 6, `${FORMAT_NAMES[meta.format] || 'File'} EXIF item`); return; }
    i += 6;
  }
}

/** Read every kind of metadata this page understands from a file's bytes. */
export function readMetadata(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = sniffFormat(u8);
  const meta = emptyMeta(format, u8.length);
  if (format === 'jpeg') readJpeg(u8, meta);
  else if (format === 'png') readPng(u8, meta);
  else if (format === 'webp') readWebp(u8, meta);
  else if (format === 'tiff') addTiff(meta, u8, 0, u8.length, 'TIFF header');
  if (!meta.tiff && format !== 'jpeg' && format !== 'png' && format !== 'webp' && format !== 'tiff') scanExif(u8, meta);
  if (!meta.xmp) {
    const end = Math.min(u8.length, SCAN_LIMIT);
    const a = indexOfBytes(u8, '<x:xmpmeta', 0, end);
    if (a >= 0) { const b = indexOfBytes(u8, '</x:xmpmeta>', a, Math.min(u8.length, a + 2e6)); if (b > a) addXmp(meta, utf8(u8.subarray(a, b + 12))); }
  }
  if (!meta.c2pa && isC2paBox(u8, 0, Math.min(u8.length, SCAN_LIMIT))) meta.c2pa = { where: 'JUMBF box in the file' };
  if (meta.tiff) {
    const { ifd0, exif } = meta.tiff;
    meta.gps = gpsFrom(meta.tiff.gps);
    if (meta.width === null) { meta.width = exif.PixelXDimension ?? ifd0.ImageWidth ?? null; meta.height = exif.PixelYDimension ?? ifd0.ImageHeight ?? null; }
  }
  if (!meta.gps && meta.xmp?.fields['exif:GPSLatitude'] && meta.xmp.fields['exif:GPSLongitude']) {
    const x = s => { const m = String(s).match(/^(\d+),(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?([NSEW])$/i); return m ? (+m[1] + m[2] / 60 + (m[3] ? m[3] / 3600 : 0)) * (/[SW]/i.test(m[4]) ? -1 : 1) : NaN; };
    const lat = x(meta.xmp.fields['exif:GPSLatitude']), lon = x(meta.xmp.fields['exif:GPSLongitude']);
    if (Number.isFinite(lat) && Number.isFinite(lon)) meta.gps = { lat, lon, nullIsland: !lat && !lon, alt: null, direction: null, directionRef: '', accuracy: null, time: '', datum: '', fromXmp: true };
  }
  return meta;
}

/* ---------------------------------------------------------------------------------------------------------------
   Plain-English reading: rows for the page, and what they do and don't prove
   --------------------------------------------------------------------------------------------------------------- */
const ORIENT = { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored, rotated 90°', 6: 'Rotated 90° clockwise', 7: 'Mirrored, rotated 270°', 8: 'Rotated 90° anticlockwise' };
const EDITORS = /photoshop|lightroom|gimp|affinity|pixelmator|snapseed|canva|picsart|facetune|capture one|darktable|luminar|photopea|paint\.net|krita|vsco|meitu|faceapp|lensa|firefly|midjourney|dall.?e|stable diffusion|imagen|gemini|chatgpt/i;
const exposure = t => { const v = rat(t); return Number.isFinite(v) && v > 0 ? (v >= 1 ? `${+v.toFixed(1)} s` : `1/${Math.round(1 / v)} s`) : ''; };
/** "Apple iPhone 15 Pro", "Canon EOS R5" (without repeating the make when the model already starts with it). */
export function cameraName(ifd0 = {}) {
  const make = String(ifd0.Make || '').trim(), model = String(ifd0.Model || '').trim();
  if (!make) return model;
  return model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? model : [make, model].filter(Boolean).join(' ');
}

/** Rows to show, grouped: [{ group, rows: [{ label, value, personal, mono }] }]. */
export function describe(meta) {
  const ifd0 = meta.tiff?.ifd0 || {}, ex = meta.tiff?.exif || {}, x = meta.xmp?.fields || {}, ip = meta.iptc || {};
  const groups = [];
  const g = (group, rows) => { const r = rows.filter(row => row && row.value !== '' && row.value != null); if (r.length) groups.push({ group, rows: r }); };
  const taken = exifDate(ex.DateTimeOriginal, ex.OffsetTimeOriginal), made = exifDate(ex.CreateDate, ex.OffsetTimeDigitized), mod = exifDate(ifd0.ModifyDate, ex.OffsetTime);
  const tlabel = d => d ? d.text + (d.offset ? ` (UTC${d.offset})` : ' (no time zone recorded)') : '';
  g('Capture', [
    { label: 'Camera', value: cameraName(ifd0) },
    { label: 'Lens', value: [ex.LensMake, ex.LensModel].filter(Boolean).join(' ') || x['aux:Lens'] || '' },
    { label: 'Taken', value: tlabel(taken), mono: true },
    { label: 'Digitised', value: made && made.text !== taken?.text ? tlabel(made) : '', mono: true },
    { label: 'Exposure', value: [exposure(ex.ExposureTime), Number.isFinite(rat(ex.FNumber)) ? `f/${+rat(ex.FNumber).toFixed(1)}` : '', ex.ISO ? `ISO ${Array.isArray(ex.ISO) ? ex.ISO[0] : ex.ISO}` : '', Number.isFinite(rat(ex.FocalLength)) ? `${+rat(ex.FocalLength).toFixed(1)} mm` : '', ex.FocalLengthIn35mmFormat ? `(${ex.FocalLengthIn35mmFormat} mm full-frame equivalent)` : ''].filter(Boolean).join(' · ') },
    { label: 'Orientation', value: ifd0.Orientation && ifd0.Orientation !== 1 ? ORIENT[ifd0.Orientation] || String(ifd0.Orientation) : '' },
    { label: 'Maker notes', value: ex.MakerNote ? `Present (${ex.MakerNote.bytes.toLocaleString('en-GB')} bytes of ${ifd0.Make || 'manufacturer'} data; ExifTool can read them)` : '' },
  ]);
  const gp = meta.gps;
  g('Location', gp ? [
    { label: 'Position', value: `${gp.lat.toFixed(6)}, ${gp.lon.toFixed(6)}${gp.fromXmp ? ' (from XMP)' : ''}`, mono: true },
    { label: 'Altitude', value: gp.alt != null ? `${Math.round(gp.alt)} m` : '' },
    { label: 'Camera facing', value: gp.direction != null ? `${Math.round(gp.direction)}° ${gp.directionRef ? `(${gp.directionRef} north)` : ''}`.trim() : '' },
    { label: 'Accuracy', value: gp.accuracy != null ? `± ${Math.round(gp.accuracy)} m (as reported by the device)` : '' },
    { label: 'GPS time', value: gp.time ? gp.time.replace('T', ' ').replace('Z', ' UTC') : '', mono: true },
  ] : []);
  const hist = meta.xmp?.history || [];
  const dst = sourceTypeKey(x['Iptc4xmpExt:DigitalSourceType']);
  g('Editing and provenance', [
    { label: 'Software', value: ifd0.Software || '' },
    { label: 'Saved', value: mod && mod.text !== taken?.text ? tlabel(mod) : '', mono: true },
    { label: 'Created with', value: x['xmp:CreatorTool'] || '' },
    { label: 'Edit history', value: hist.length ? `${hist.length} step${hist.length === 1 ? '' : 's'}: ` + hist.slice(-4).map(h => [h.action, h.software, h.when && h.when.slice(0, 19).replace('T', ' ')].filter(Boolean).join(', ')).join(' → ') : '' },
    { label: 'Source type', value: dst ? (DIGITAL_SOURCE_TYPES[dst] || dst) + ' (IPTC digital source type)' : '' },
    { label: 'Content Credentials', value: meta.c2pa ? `C2PA manifest found (${meta.c2pa.where}); signature not checked here` : '' },
    { label: 'Embedded thumbnail', value: meta.thumbnail ? 'Present: compare it with the main image' : '' },
    { label: 'Document ID', value: x['xmpMM:OriginalDocumentID'] || x['xmpMM:DocumentID'] || '', mono: true },
    { label: 'PNG text', value: meta.pngText.length ? meta.pngText.map(t => t.key).join(', ') : '' },
    { label: 'PNG saved', value: meta.pngTime ? meta.pngTime.replace('T', ' ').replace('Z', ' UTC') : '', mono: true },
    { label: 'JPEG comment', value: meta.comment || '' },
  ]);
  g('Description and credits', [
    { label: 'Headline', value: ip.Headline || x['photoshop:Headline'] || '' },
    { label: 'Caption', value: ip.Caption || x['dc:description'] || ifd0.ImageDescription || '' },
    { label: 'Title', value: ip.ObjectName || x['dc:title'] || '' },
    { label: 'Place', value: [ip.Sublocation || x['Iptc4xmpCore:Location'], ip.City || x['photoshop:City'], ip.Province || x['photoshop:State'], ip.Country || x['photoshop:Country']].filter(Boolean).join(', ') },
    { label: 'Date created', value: ip.DateCreated ? ip.DateCreated.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : x['photoshop:DateCreated'] || '' },
    { label: 'Credit', value: [ip.Credit || x['photoshop:Credit'], ip.Source || x['photoshop:Source']].filter(Boolean).join(' · ') },
    { label: 'Keywords', value: ip.Keywords || x['dc:subject'] || '' },
    { label: 'Copyright', value: ip.Copyright || ifd0.Copyright || x['dc:rights'] || '' },
  ]);
  g('Details that can identify a person', [
    { label: 'Author', value: ip.Byline || x['dc:creator'] || ifd0.Artist || '', personal: true },
    { label: 'Camera owner', value: ex.CameraOwnerName || '', personal: true },
    { label: 'Camera serial', value: ex.BodySerialNumber || '', personal: true, mono: true },
    { label: 'Lens serial', value: ex.LensSerialNumber || '', personal: true, mono: true },
    { label: 'Image ID', value: ex.ImageUniqueID || '', personal: true, mono: true },
    { label: 'Computer', value: ifd0.HostComputer || '', personal: true },
  ]);
  return groups;
}

/** What the metadata can and can't support: [{ tone: 'info'|'warn'|'good', text }]. */
export function assess(meta) {
  const notes = [], ifd0 = meta.tiff?.ifd0 || {}, ex = meta.tiff?.exif || {}, x = meta.xmp?.fields || {};
  const hasCamera = !!(ifd0.Make || ifd0.Model);
  const empty = !meta.tiff && !meta.xmp && !meta.iptc && !meta.pngText.length && !meta.c2pa;
  if (empty) notes.push({ tone: 'info', text: 'No metadata found. That is normal for images saved from social networks and messaging apps, which strip it on upload: its absence proves nothing either way. Trace the image’s first appearance with reverse image search instead.' });
  const dst = sourceTypeKey(x['Iptc4xmpExt:DigitalSourceType']);
  if (dst === 'trainedAlgorithmicMedia' || dst === 'compositeSynthetic' || dst === 'algorithmicMedia') notes.push({ tone: 'warn', text: `Labelled as “${DIGITAL_SOURCE_TYPES[dst]}” by the software that made it (IPTC digital source type). Labels can be removed, so their absence does not mean an image is genuine.` });
  if (dst === 'compositeWithTrainedAlgorithmicMedia') notes.push({ tone: 'warn', text: 'Labelled as edited with generative AI (IPTC digital source type).' });
  if (meta.pngText.some(t => t.ai)) notes.push({ tone: 'warn', text: 'The PNG carries image-generation settings (prompt, sampler or workflow text of the kind Stable Diffusion tools and ComfyUI write). It was very probably made or edited with an AI image generator.' });
  if (meta.c2pa) notes.push({ tone: 'good', text: 'Content Credentials (C2PA) are present. This page does not check the signature: verify it with the Content Credentials inspector. A valid credential tells you who signed the file’s history, not that the scene is real or the caption true.' });
  if (hasCamera) notes.push({ tone: 'info', text: `Camera metadata (${cameraName(ifd0)}) suggests this copy may be close to the original file. Anyone can write these fields with free tools such as ExifTool, so treat them as a claim to corroborate.` });
  const taken = exifDate(ex.DateTimeOriginal, ex.OffsetTimeOriginal);
  if (taken && !taken.offset) notes.push({ tone: 'warn', text: 'The capture time has no time zone. Camera clocks are often wrong, never set, or left on another zone: check the time against the light, shadows and weather in the picture.' });
  const mod = exifDate(ifd0.ModifyDate);
  if (taken && mod && mod.text > taken.text) notes.push({ tone: 'info', text: `The file was saved again after it was taken (taken ${taken.text}, saved ${mod.text}). Re-saving is routine (rotation, export) and is not evidence of manipulation on its own.` });
  const editor = [ifd0.Software, x['xmp:CreatorTool'], ...(meta.xmp?.history || []).map(h => h.software)].find(s => s && EDITORS.test(s));
  if (editor) notes.push({ tone: 'info', text: `Processed with ${editor}. That shows the file was edited or exported, not what was changed: look for the edit history and compare with other copies.` });
  if (meta.gps) {
    if (meta.gps.nullIsland) notes.push({ tone: 'warn', text: 'The position is 0°, 0° (“Null Island”, in the Atlantic): almost always an empty GPS field, not a real location.' });
    else notes.push({ tone: 'info', text: 'The device recorded a position. Phones can be wrong by tens of metres (more indoors or between tall buildings), can reuse a stale fix, and the field can be edited. Confirm it by matching the scene to satellite and street-level imagery.' });
    if (meta.gps.accuracy > 100) notes.push({ tone: 'warn', text: `The device reported low accuracy (± ${Math.round(meta.gps.accuracy)} m).` });
  }
  if (meta.thumbnail) notes.push({ tone: 'info', text: 'The file holds an embedded thumbnail. Compare it with the main image: some editors update the picture but not the thumbnail, so a difference can reveal a change.' });
  if (ex.CameraOwnerName || ex.BodySerialNumber || ex.LensSerialNumber || ifd0.Artist || x['dc:creator'] || meta.iptc?.Byline) notes.push({ tone: 'warn', text: 'Some fields can identify a person (owner, author, serial numbers). They are personal data: note them only if your question needs them, and do not publish them.' });
  return notes;
}

/* ---------------------------------------------------------------------------------------------------------------
   Writing EXIF (for the sample image and tests)
   --------------------------------------------------------------------------------------------------------------- */
/**
 * An EXIF APP1 payload ("Exif\0\0" + TIFF) from entries [tag, type, value] per IFD. Values: strings (ASCII, type 2),
 * numbers or arrays of numbers (types 1, 3, 4, 7), rationals [num, den] or arrays of them (types 5, 10).
 */
export function writeExif({ ifd0 = [], exif = [], gps = [] } = {}, { littleEndian = false } = {}) {
  const le = littleEndian;
  const ifds = [{ entries: [...ifd0] }];
  if (exif.length) ifds.push({ entries: [...exif], pointer: 0x8769 });
  if (gps.length) ifds.push({ entries: [...gps], pointer: 0x8825 });
  for (const d of ifds.slice(1)) ifds[0].entries.push([d.pointer, 4, 0]);
  const encode = ([tag, type, v]) => {
    let bytes;
    if (type === 2) bytes = [...new TextEncoder().encode(String(v)), 0];
    const vals = type === 2 ? bytes : (Array.isArray(v) && !(type === 5 || type === 10) ? v : Array.isArray(v) && Array.isArray(v[0]) ? v : [v]);
    const count = type === 2 ? bytes.length : vals.length;
    return { tag, type, count, vals, size: TYPE_SIZE[type] * count };
  };
  for (const d of ifds) { d.entries.sort((a, b) => a[0] - b[0]); d.enc = d.entries.map(encode); d.size = 2 + d.enc.length * 12 + 4; }
  let off = 8;
  for (const d of ifds) { d.off = off; off += d.size; }
  for (const d of ifds) for (const e of d.enc) if (e.size > 4) { e.dataOff = off; off += e.size + (e.size % 2); }
  const buf = new Uint8Array(off), dv = new DataView(buf.buffer);
  buf.set(le ? [0x49, 0x49] : [0x4D, 0x4D]); dv.setUint16(2, 42, le); dv.setUint32(4, ifds[0].off, le);
  for (const d of ifds.slice(1)) ifds[0].enc.find(e => e.tag === d.pointer).vals = [d.off];
  const put = (at, type, vals) => {
    vals.forEach((v, i) => {
      switch (type) {
        case 1: case 2: case 7: dv.setUint8(at + i, v); break;
        case 3: dv.setUint16(at + i * 2, v, le); break;
        case 4: dv.setUint32(at + i * 4, v, le); break;
        case 9: dv.setInt32(at + i * 4, v, le); break;
        case 5: dv.setUint32(at + i * 8, v[0], le); dv.setUint32(at + i * 8 + 4, v[1], le); break;
        case 10: dv.setInt32(at + i * 8, v[0], le); dv.setInt32(at + i * 8 + 4, v[1], le); break;
      }
    });
  };
  for (const d of ifds) {
    dv.setUint16(d.off, d.enc.length, le);
    d.enc.forEach((e, i) => {
      const at = d.off + 2 + i * 12;
      dv.setUint16(at, e.tag, le); dv.setUint16(at + 2, e.type, le); dv.setUint32(at + 4, e.count, le);
      if (e.size > 4) { dv.setUint32(at + 8, e.dataOff, le); put(e.dataOff, e.type, e.vals); } else put(at + 8, e.type, e.vals);
    });
    dv.setUint32(d.off + 2 + d.enc.length * 12, 0, le);
  }
  const out = new Uint8Array(6 + buf.length);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0]); out.set(buf, 6);
  return out;
}
/** A JPEG with an EXIF APP1 segment inserted after SOI (and after a JFIF APP0, if any). */
export function insertExif(jpeg, payload) {
  const u8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  if (sniffFormat(u8) !== 'jpeg') throw new Error('Not a JPEG');
  let at = 2;
  if (u8[2] === 0xFF && u8[3] === 0xE0) at = 4 + ((u8[4] << 8) | u8[5]);
  const seg = new Uint8Array(4 + payload.length);
  seg.set([0xFF, 0xE1, ((payload.length + 2) >> 8) & 0xFF, (payload.length + 2) & 0xFF]); seg.set(payload, 4);
  const out = new Uint8Array(u8.length + seg.length);
  out.set(u8.subarray(0, at)); out.set(seg, at); out.set(u8.subarray(at), at + seg.length);
  return out;
}
/** Rationals for decimal degrees: [[d,1],[m,1],[s×100,100]]. */
export function toDms(x) {
  const a = Math.abs(x), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}
/** The EXIF block for the page's sample photo: a public place (George's Quay, Dublin, looking north across the Liffey to the Custom House), a camera, a time and a heading. */
export function sampleExif() {
  const lat = 53.347420, lon = -6.253350;
  return writeExif({
    ifd0: [[0x010F, 2, 'PRP'], [0x0110, 2, 'Sample Camera S1'], [0x0131, 2, 'PRP sample generator 1.0'], [0x0132, 2, '2026:10:27 15:42:10'], [0x0112, 3, 1]],
    exif: [[0x9003, 2, '2026:10:27 15:41:58'], [0x9011, 2, '+00:00'], [0x829A, 5, [1, 250]], [0x829D, 5, [28, 10]], [0x8827, 3, 100], [0x920A, 5, [52, 10]], [0xA434, 2, 'Sample lens 5.2mm f/2.8']],
    gps: [[0x0000, 1, [2, 3, 0, 0]], [0x0001, 2, 'N'], [0x0002, 5, toDms(lat)], [0x0003, 2, 'W'], [0x0004, 5, toDms(lon)], [0x0005, 1, 0], [0x0006, 5, [6, 1]],
      [0x0007, 5, [[15, 1], [41, 1], [57, 1]]], [0x0010, 2, 'T'], [0x0011, 5, [3550, 10]], [0x001D, 2, '2026:10:27'], [0x001F, 5, [8, 1]]],
  });
}
