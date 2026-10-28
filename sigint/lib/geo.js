// SIGINT Dashboard: geodesy helpers (pure). Distances on a sphere of mean radius; good to ~0.5% for display.

export const R_KM = 6371.0088;
export const KM_PER_NM = 1.852;
export const kmToNm = km => km / KM_PER_NM;
export const nmToKm = nm => nm * KM_PER_NM;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Initial great-circle bearing, degrees clockwise from true north, 0–360. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** The point distKm from (lat, lon) along an initial bearing. */
export function destination(lat, lon, brg, distKm) {
  const d = distKm / R_KM, b = rad(brg), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
}
/** A latitude/longitude box that contains a circle (clamped at the poles and the antimeridian). */
export function bboxAround(lat, lon, radiusKm) {
  const dLat = deg(radiusKm / R_KM);
  const c = Math.cos(rad(Math.min(89, Math.abs(lat))));
  const dLon = Math.min(180, dLat / Math.max(0.01, c));
  return { south: Math.max(-90, lat - dLat), north: Math.min(90, lat + dLat), west: Math.max(-180, lon - dLon), east: Math.min(180, lon + dLon) };
}
const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compass(brg, points = 16) {
  if (!Number.isFinite(brg)) return '–';
  const list = points === 8 ? POINTS8 : POINTS16;
  return list[Math.round((((brg % 360) + 360) % 360) / (360 / list.length)) % list.length];
}

/** Maidenhead grid locator (4, 6 or 8 characters), as amateur radio uses for station positions. */
export function maidenhead(lat, lon, length = 6) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  let x = Math.min(359.999999, Math.max(0, lon + 180)), y = Math.min(179.999999, Math.max(0, lat + 90));
  const A = 'ABCDEFGHIJKLMNOPQR', a = 'abcdefghijklmnopqrstuvwx';
  let s = A[Math.floor(x / 20)] + A[Math.floor(y / 10)];
  x %= 20; y %= 10;
  s += Math.floor(x / 2) + '' + Math.floor(y);
  if (length >= 6) { x = (x % 2) * 12; y = (y % 1) * 24; s += a[Math.floor(x)] + a[Math.floor(y)]; }
  if (length >= 8) { x = (x % 1) * 10; y = (y % 1) * 10; s += Math.floor(x) + '' + Math.floor(y); }
  return s;
}
/** Centre of a Maidenhead square, or null if the locator is malformed. */
export function fromMaidenhead(loc) {
  const s = String(loc || '').trim();
  if (!/^[A-Ra-r]{2}(\d{2}([A-Xa-x]{2}(\d{2})?)?)?$/.test(s)) return null;
  const u = s.toUpperCase();
  let lon = (u.charCodeAt(0) - 65) * 20 - 180, lat = (u.charCodeAt(1) - 65) * 10 - 90, w = 20, h = 10;
  if (s.length >= 4) { lon += +u[2] * 2; lat += +u[3]; w = 2; h = 1; }
  if (s.length >= 6) { lon += (u.charCodeAt(4) - 65) * (2 / 24); lat += (u.charCodeAt(5) - 65) * (1 / 24); w = 2 / 24; h = 1 / 24; }
  if (s.length >= 8) { lon += +u[6] * (2 / 240); lat += +u[7] * (1 / 240); w = 2 / 240; h = 1 / 240; }
  return { lat: lat + h / 2, lon: lon + w / 2 };
}

/** Parse "53.35", "-6.26", "53.35 N", "6.26W", "53°21'0\"N" or "53 21 00 N" to decimal degrees; null if not a coordinate. */
export function parseCoord(input, kind = 'lat') {
  if (input == null) return null;
  let s = String(input).trim().toUpperCase().replace(/,/g, '.');
  if (!s) return null;
  let sign = 1;
  const hemi = s.match(/[NSEW]/);
  if (hemi) { if (hemi[0] === 'S' || hemi[0] === 'W') sign = -1; if ((kind === 'lat') !== /[NS]/.test(hemi[0])) return null; s = s.replace(/[NSEW]/g, ' '); }
  if (s.trim().startsWith('-')) { sign *= -1; s = s.replace('-', ' '); }
  const parts = s.replace(/[°º'’′"”″]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0)) return null;
  const [d, m = 0, sec = 0] = parts;
  if (m >= 60 || sec >= 60) return null;
  const v = sign * (d + m / 60 + sec / 3600);
  const lim = kind === 'lat' ? 90 : 180;
  return Math.abs(v) <= lim ? v : null;
}
export function fmtLatLon(lat, lon, dp = 2) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '–';
  return `${Math.abs(lat).toFixed(dp)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(dp)}° ${lon >= 0 ? 'E' : 'W'}`;
}
