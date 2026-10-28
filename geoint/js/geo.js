// GEOINT & IMINT Dashboard: geodesy, coordinates, terrain, sun-and-shadow geometry and line of sight.
// Pure functions (no DOM, no network) so the Node tests can check them. Angles in degrees unless stated; distances in metres.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
export const R_MEAN = 6371008.8;       // IUGG mean Earth radius
export const R_AUTHALIC = 6371007.2;   // radius of the sphere with the WGS84 ellipsoid's surface area (for areas)
const WGS_A = 6378137, WGS_F = 1 / 298.257223563, WGS_B = WGS_A * (1 - WGS_F), WGS_E2 = WGS_F * (2 - WGS_F);

export const normDeg = d => ((d % 360) + 360) % 360;
/** Signed difference a − b folded into (−180, 180]. */
export const angleDiff = (a, b) => { let d = normDeg(a - b); if (d > 180) d -= 360; return d; };
const wrapLon = l => ((l + 540) % 360) - 180;
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------------------------------------------------------------- distance and direction */
/** Great-circle distance on the mean sphere (accurate to about 0.3 %). Points are [lat, lon]. */
export function haversine([lat1, lon1], [lat2, lon2], R = R_MEAN) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dp = (lat2 - lat1) * RAD, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Initial great-circle bearing from p to q, degrees clockwise from true north. */
export function bearing([lat1, lon1], [lat2, lon2]) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(Math.atan2(y, x) * DEG);
}
/** Point reached from p after `dist` metres on initial bearing `brng` (sphere). */
export function destination([lat, lon], brng, dist, R = R_MEAN) {
  const d = dist / R, t = brng * RAD, p1 = lat * RAD, l1 = lon * RAD;
  const sinP2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t);
  const p2 = Math.asin(clampN(sinP2, -1, 1));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * sinP2);
  return [p2 * DEG, wrapLon(l2 * DEG)];
}
/** Vincenty's inverse formula on the WGS84 ellipsoid (sub-millimetre). Returns null if it fails to converge (near-antipodal). */
export function vincenty([lat1, lon1], [lat2, lon2]) {
  const L = (lon2 - lon1) * RAD;
  const U1 = Math.atan((1 - WGS_F) * Math.tan(lat1 * RAD)), U2 = Math.atan((1 - WGS_F) * Math.tan(lat2 * RAD));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, prev, iter = 0, sinS, cosS, sigma, sinA, cos2A, cos2Sm, sinL, cosL;
  do {
    sinL = Math.sin(lambda); cosL = Math.cos(lambda);
    sinS = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinS === 0) return { distance: 0, initialBearing: 0, finalBearing: 0 };
    cosS = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinS, cosS);
    sinA = cosU1 * cosU2 * sinL / sinS;
    cos2A = 1 - sinA * sinA;
    cos2Sm = cos2A !== 0 ? cosS - 2 * sinU1 * sinU2 / cos2A : 0;
    const C = WGS_F / 16 * cos2A * (4 + WGS_F * (4 - 3 * cos2A));
    prev = lambda;
    lambda = L + (1 - C) * WGS_F * sinA * (sigma + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm * cos2Sm)));
  } while (Math.abs(lambda - prev) > 1e-12 && ++iter < 200);
  if (iter >= 200) return null;
  const u2 = cos2A * (WGS_A * WGS_A - WGS_B * WGS_B) / (WGS_B * WGS_B);
  const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sinS * (cos2Sm + B / 4 * (cosS * (-1 + 2 * cos2Sm * cos2Sm) - B / 6 * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2Sm * cos2Sm)));
  return {
    distance: WGS_B * A * (sigma - dS),
    initialBearing: normDeg(Math.atan2(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL) * DEG),
    finalBearing: normDeg(Math.atan2(cosU1 * sinL, -sinU1 * cosU2 + cosU1 * sinU2 * cosL) * DEG),
  };
}
/** Ellipsoidal distance and bearings, falling back to the sphere when Vincenty does not converge. */
export function inverse(p, q) {
  return vincenty(p, q) || { distance: haversine(p, q), initialBearing: bearing(p, q), finalBearing: normDeg(bearing(q, p) + 180) };
}
export const distance = (p, q) => inverse(p, q).distance;
export function pathLength(points) { let s = 0; for (let i = 1; i < points.length; i++) s += distance(points[i - 1], points[i]); return s; }

/** Area of a polygon (ring of [lat, lon], closed or not) on the authalic sphere, in m². Handles the antimeridian. */
export function polygonArea(points, R = R_AUTHALIC) {
  const n = points.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const [la1, lo1] = points[i], [la2, lo2] = points[(i + 1) % n];
    let dl = lo2 - lo1; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    s += dl * RAD * (2 + Math.sin(la1 * RAD) + Math.sin(la2 * RAD));
  }
  return Math.abs(s * R * R / 2);
}
/** Point a fraction f of the way along the great circle from p to q. */
export function interpolate([lat1, lon1], [lat2, lon2], f) {
  const d = haversine([lat1, lon1], [lat2, lon2], 1);
  if (d < 1e-12) return [lat1, lon1];
  const p1 = lat1 * RAD, l1 = lon1 * RAD, p2 = lat2 * RAD, l2 = lon2 * RAD;
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(z, Math.hypot(x, y)) * DEG, Math.atan2(y, x) * DEG];
}
/** Points along the great circle p → q (for drawing long lines that would otherwise be straight on the map). */
export function greatCircle(p, q, segments = 64) {
  const out = [];
  for (let i = 0; i <= segments; i++) out.push(interpolate(p, q, i / segments));
  // keep longitudes continuous so Leaflet does not draw across the whole map at the antimeridian
  for (let i = 1; i < out.length; i++) { while (out[i][1] - out[i - 1][1] > 180) out[i][1] -= 360; while (out[i][1] - out[i - 1][1] < -180) out[i][1] += 360; }
  return out;
}
/** n + 1 evenly spaced samples along a polyline, each { lat, lon, d } with d the distance from the start in metres. */
export function samplePath(points, n = 100) {
  if (points.length < 2) return [];
  const seg = []; let total = 0;
  for (let i = 1; i < points.length; i++) { const d = distance(points[i - 1], points[i]); seg.push(d); total += d; }
  const out = [];
  for (let k = 0; k <= n; k++) {
    let want = total * k / n, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, want / seg[i]) : 0;
    const [lat, lon] = interpolate(points[i], points[i + 1], f);
    out.push({ lat, lon, d: total * k / n });
  }
  return out;
}
/** Where two great circles, each given by a start point and a bearing, cross (the crossing ahead of both), or null. */
export function intersection(p1, brng1, p2, brng2) {
  const f1 = p1[0] * RAD, l1 = p1[1] * RAD, f2 = p2[0] * RAD, l2 = p2[1] * RAD;
  const t13 = brng1 * RAD, t23 = brng2 * RAD, df = f2 - f1, dl = l2 - l1;
  const d12 = 2 * Math.asin(Math.sqrt(Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2));
  if (Math.abs(d12) < 1e-12) return [p1[0], p1[1]];
  const ta = Math.acos(clampN((Math.sin(f2) - Math.sin(f1) * Math.cos(d12)) / (Math.sin(d12) * Math.cos(f1)), -1, 1));
  const tb = Math.acos(clampN((Math.sin(f1) - Math.sin(f2) * Math.cos(d12)) / (Math.sin(d12) * Math.cos(f2)), -1, 1));
  const t12 = Math.sin(l2 - l1) > 0 ? ta : 2 * Math.PI - ta;
  const t21 = Math.sin(l2 - l1) > 0 ? 2 * Math.PI - tb : tb;
  const a1 = t13 - t12, a2 = t21 - t23;
  if (Math.sin(a1) === 0 && Math.sin(a2) === 0) return null;   // the same great circle
  if (Math.sin(a1) * Math.sin(a2) < 0) return null;            // the lines diverge
  const cosA3 = -Math.cos(a1) * Math.cos(a2) + Math.sin(a1) * Math.sin(a2) * Math.cos(d12);
  const d13 = Math.atan2(Math.sin(d12) * Math.sin(a1) * Math.sin(a2), Math.cos(a2) + Math.cos(a1) * cosA3);
  const f3 = Math.asin(clampN(Math.sin(f1) * Math.cos(d13) + Math.cos(f1) * Math.sin(d13) * Math.cos(t13), -1, 1));
  const l3 = l1 + Math.atan2(Math.sin(t13) * Math.sin(d13) * Math.cos(f1), Math.cos(d13) - Math.sin(f1) * Math.sin(f3));
  return [f3 * DEG, wrapLon(l3 * DEG)];
}
const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = b => POINTS16[Math.round(normDeg(b) / 22.5) % 16];

/* ---------------------------------------------------------------- coordinate formats */
export function toDMS(v, isLat, secDigits = 1) {
  const hemi = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E');
  const a = Math.abs(v);
  let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), k = 10 ** secDigits, s = Math.round((mf - m) * 60 * k) / k;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(secDigits).padStart(secDigits ? 3 + secDigits : 2, '0')}″${hemi}`;
}
export const formatDMS = (lat, lon) => `${toDMS(lat, true)} ${toDMS(lon, false)}`;

function parseOne(part) {
  const s = part.trim().toUpperCase().replace(/[º˚]/g, '°').replace(/[′’‘´`]/g, "'").replace(/[″”“]/g, '"').replace(/''/g, '"');
  // Markers: ° (or D/DEG) for degrees, ' for minutes, " for seconds. Letters S/M are not markers, so "26 S" stays south.
  const m = s.match(/^([NSEW])?\s*([+-]?\d+(?:\.\d+)?)\s*(?:°|DEG|D)?\s*(?:(\d+(?:\.\d+)?)\s*'?\s*)?(?:(\d+(?:\.\d+)?)\s*"?\s*)?([NSEW])?$/);
  if (!m) return null;
  if (m[1] && m[5]) return null;
  const hemi = m[1] || m[5] || '';
  const deg = parseFloat(m[2]), min = m[3] ? parseFloat(m[3]) : 0, sec = m[4] ? parseFloat(m[4]) : 0;
  if (min >= 60 || sec >= 60 || ((m[3] || m[4]) && !Number.isInteger(Math.abs(deg)))) return null;
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  if (deg < 0 || m[2].startsWith('-') || hemi === 'S' || hemi === 'W') v = -v;
  return { v, axis: hemi === 'N' || hemi === 'S' ? 'lat' : hemi === 'E' || hemi === 'W' ? 'lon' : '' };
}
/**
 * Parse what people paste: "48.8584, 2.2945", "48.8584 2.2945", "48°51′30″N 2°17′40″E", "51 30 26 N, 0 7 39 W", "N 52.1 E 4.3"
 * or an MGRS reference such as "31U DQ 48251 11932". Returns [lat, lon] or null.
 */
export function parseCoordinates(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z][A-HJ-NP-V](\d{2}|\d{4}|\d{6}|\d{8}|\d{10})?$/.test(compact)) return fromMGRS(compact);
  let parts;
  if (raw.includes(',') && raw.split(',').length === 2) parts = raw.split(',');
  else if (raw.includes(';') && raw.split(';').length === 2) parts = raw.split(';');
  else {
    const hemi = raw.toUpperCase().match(/^(.*?\d[^NSEW]*[NS])\s*(.+)$/) || raw.toUpperCase().match(/^([NS][^NSEW]+?)\s+([EW].+)$/);
    if (hemi) parts = [hemi[1], hemi[2]];
    else { const nums = raw.trim().split(/\s+/); if (nums.length === 2) parts = nums; else return null; }
  }
  const a = parseOne(parts[0]), b = parseOne(parts[1]);
  if (!a || !b) return null;
  let lat, lon;
  if (a.axis === 'lon' || b.axis === 'lat') { lat = b.v; lon = a.v; } else { lat = a.v; lon = b.v; }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

/* ---------------------------------------------------------------- UTM and MGRS (WGS84) */
const K0 = 0.9996;
export function utmZone(lat, lon) {
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (lon >= 180) zone = 60;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31; else if (lon >= 9 && lon < 21) zone = 33; else if (lon >= 21 && lon < 33) zone = 35; else if (lon >= 33 && lon < 42) zone = 37;
  }
  return zone;
}
export function toUTM(lat, lon, forceZone) {
  const zone = forceZone || utmZone(lat, lon);
  const e2 = WGS_E2, e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
  const p = lat * RAD, l0 = ((zone - 1) * 6 - 177) * RAD;
  const N = WGS_A / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = Math.cos(p) * (lon * RAD - l0);
  const M = WGS_A * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
  const easting = K0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let northing = K0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere: lat < 0 ? 'S' : 'N', easting, northing };
}
export function fromUTM(zone, hemisphere, easting, northing) {
  const e2 = WGS_E2, e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = easting - 500000, y = hemisphere === 'S' ? northing - 10000000 : northing;
  const mu = y / K0 / (WGS_A * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = WGS_A / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2;
  const R1 = WGS_A * (1 - e2) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), D = x / (N1 * K0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = ((zone - 1) * 6 - 177) * RAD + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lat * DEG, lon * DEG];
}
const BANDS = 'CDEFGHJKLMNPQRSTUVWX', COLS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', ROWS = 'ABCDEFGHJKLMNPQRSTUV';
const MIN_NORTHING = { C: 1100000, D: 2000000, E: 2800000, F: 3700000, G: 4600000, H: 5500000, J: 6400000, K: 7300000, L: 8200000, M: 9100000,
  N: 0, P: 800000, Q: 1700000, R: 2600000, S: 3500000, T: 4400000, U: 5300000, V: 6200000, W: 7000000, X: 7900000 };
export const latBand = lat => (lat < -80 || lat > 84 ? null : BANDS[Math.min(19, Math.floor((lat + 80) / 8))]);
/** MGRS reference ("18S UJ 23487 06483") truncated to `digits` per axis (5 = 1 m). Null outside 80°S–84°N (polar UPS). */
export function toMGRS(lat, lon, digits = 5) {
  const band = latBand(lat);
  if (!band) return null;
  const { zone, easting, northing } = toUTM(lat, lon);
  const set = ((zone - 1) % 6) + 1;
  const col = COLS[([0, 8, 16][(set - 1) % 3] + Math.floor(easting / 100000) - 1) % 24];
  const row = ROWS[(Math.floor(northing / 100000) + (set % 2 === 0 ? 5 : 0)) % 20];
  const k = 10 ** (5 - digits);
  const pad = v => String(Math.floor((v % 100000) / k)).padStart(digits, '0');
  return digits ? `${zone}${band} ${col}${row} ${pad(easting)} ${pad(northing)}` : `${zone}${band} ${col}${row}`;
}
/** MGRS → [lat, lon] at the centre of the referenced square, or null. */
export function fromMGRS(ref) {
  const m = String(ref ?? '').toUpperCase().replace(/\s+/g, '').match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/);
  if (!m) return null;
  const zone = +m[1], band = m[2], digits = m[5];
  if (zone < 1 || zone > 60 || digits.length % 2 || digits.length > 10) return null;
  const set = ((zone - 1) % 6) + 1;
  const ci = COLS.indexOf(m[3]) - [0, 8, 16][(set - 1) % 3];
  if (ci < 0 || ci > 7) return null;
  let ri = ROWS.indexOf(m[4]) - (set % 2 === 0 ? 5 : 0);
  if (ri < 0) ri += 20;
  const half = digits.length / 2, cell = 10 ** (5 - half);
  const e = half ? +digits.slice(0, half) * cell : 0, n = half ? +digits.slice(half) * cell : 0;
  let north100k = ri * 100000;
  while (north100k < MIN_NORTHING[band]) north100k += 2000000;
  const ll = fromUTM(zone, band >= 'N' ? 'N' : 'S', (ci + 1) * 100000 + e + cell / 2, north100k + n + cell / 2);
  return Number.isFinite(ll[0]) && Math.abs(ll[0]) <= 90 ? ll : null;
}

/* ---------------------------------------------------------------- web-map tiles and terrain */
/** Web Mercator tile containing a point at zoom z, and the pixel within that 256 px tile. */
export function tileOf(lat, lon, z) {
  const n = 2 ** z, la = clampN(lat, -85.05112878, 85.05112878) * RAD;
  const fx = (wrapLon(lon) + 180) / 360 * n, fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  const x = Math.min(n - 1, Math.floor(fx)), y = Math.min(n - 1, Math.floor(fy));
  return { x, y, z, px: Math.min(255, Math.floor((fx - x) * 256)), py: Math.min(255, Math.floor((fy - y) * 256)) };
}
export const metersPerPixel = (lat, z) => 40075016.686 * Math.cos(lat * RAD) / (256 * 2 ** z);
/** Mapzen/Tilezen "Terrarium" PNG encoding: metres = R × 256 + G + B ÷ 256 − 32768. */
export const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;
/**
 * Hillshade (Esri/Horn method) of a w × h elevation grid (row 0 = north), cell size in metres.
 * Returns illumination 0…1 per cell; flat ground under a 45° sun gives cos 45° ≈ 0.707.
 */
export function hillshade(elev, w, h, cell, { azimuth = 315, altitude = 45, zFactor = 1 } = {}) {
  const out = new Float32Array(w * h);
  const zen = (90 - altitude) * RAD, cz = Math.cos(zen), sz = Math.sin(zen);
  const az = normDeg(360 - azimuth + 90) * RAD;
  const at = (x, y) => elev[clampN(y, 0, h - 1) * w + clampN(x, 0, w - 1)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1), d = at(x - 1, y), f = at(x + 1, y), g = at(x - 1, y + 1), hh = at(x, y + 1), i = at(x + 1, y + 1);
    const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell), dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * cell);
    const slope = Math.atan(zFactor * Math.hypot(dzdx, dzdy));
    let aspect = 0;
    if (dzdx !== 0) { aspect = Math.atan2(dzdy, -dzdx); if (aspect < 0) aspect += 2 * Math.PI; }
    else if (dzdy > 0) aspect = Math.PI / 2; else if (dzdy < 0) aspect = 3 * Math.PI / 2;
    out[y * w + x] = Math.max(0, cz * Math.cos(slope) + sz * Math.sin(slope) * Math.cos(az - aspect));
  }
  return out;
}

/* ---------------------------------------------------------------- sun, shadows and chronolocation */
/** Shadow length of an object of height h when the sun is `altitude` degrees high (Infinity at or below the horizon). */
export const shadowLength = (h, altitude) => (altitude > 0 ? h / Math.tan(altitude * RAD) : Infinity);
/** Sun altitude implied by an object of height h casting a shadow of length L on level ground. */
export const altitudeFromShadow = (h, L) => (h > 0 && L > 0 ? Math.atan(h / L) * DEG : NaN);
/** A shadow points directly away from the sun. */
export const shadowBearing = sunAzimuth => normDeg(sunAzimuth + 180);
export const sunAzimuthFromShadow = shadowDir => normDeg(shadowDir + 180);

/**
 * Chronolocation: scan `days` days from `startMs` (a UTC instant, normally local midnight) for the times when the sun stood
 * where a measured shadow says it was. Give the sun `azimuth` (from the shadow's direction), its `altitude` (from the
 * height-to-shadow ratio) or both, with tolerances. getPosition(date, lat, lon) must return { azimuth, altitude } in degrees
 * (azimuth clockwise from north), as SunCalc 2 does. Returns windows of consecutive matching times, best first.
 */
export function chronolocate({ lat, lon, startMs, days = 1, getPosition, azimuth, altitude, tolAz = 3, tolAlt = 2, stepMin = 2, refineSec = 20 }) {
  const hasAz = Number.isFinite(azimuth), hasAlt = Number.isFinite(altitude);
  if (!hasAz && !hasAlt) return { windows: [], evaluated: 0 };
  let evaluated = 0;
  const score = t => {
    const p = getPosition(new Date(t), lat, lon); evaluated++;
    if (!(p.altitude > 0)) return { err: Infinity, p };
    const ea = hasAz ? Math.abs(angleDiff(p.azimuth, azimuth)) / tolAz : 0, eb = hasAlt ? Math.abs(p.altitude - altitude) / tolAlt : 0;
    return { err: Math.hypot(ea, eb), p };
  };
  const step = stepMin * 60000, end = startMs + days * 864e5, raw = [];
  let cur = null;
  for (let t = startMs; t < end; t += step) {
    const { err } = score(t);
    if (err <= 1) { if (!cur) cur = { start: t, end: t }; else cur.end = t; }
    else if (cur) { raw.push(cur); cur = null; }
  }
  if (cur) raw.push(cur);
  // Refine each window at a finer step, including one coarse step either side.
  const fine = Math.max(1000, refineSec * 1000);
  const windows = raw.map(w => {
    let best = null, first = null, last = null;
    for (let t = Math.max(startMs, w.start - step); t <= Math.min(end, w.end + step); t += fine) {
      const { err, p } = score(t);
      if (err <= 1) { if (first === null) first = t; last = t; if (!best || err < best.err) best = { t, err, azimuth: p.azimuth, altitude: p.altitude }; }
    }
    return best ? { start: first, end: last, best: best.t, error: best.err, azimuth: best.azimuth, altitude: best.altitude } : null;
  }).filter(Boolean);
  windows.sort((a, b) => a.error - b.error || a.start - b.start);
  return { windows, evaluated };
}

/**
 * Line of sight along a terrain profile [{ d, h }] (metres from the start, ground height in metres), with the observer
 * `observerHeight` above the first point and the target `targetHeight` above the last. Earth curvature and standard
 * refraction (k = 0.13) are applied. Returns visibility, the first obstruction and the profile adjusted for curvature.
 */
export function lineOfSight(profile, { observerHeight = 1.7, targetHeight = 0, k = 0.13, R = R_MEAN } = {}) {
  if (!profile || profile.length < 2) return null;
  const D = profile[profile.length - 1].d;
  const hA = profile[0].h + observerHeight, hB = profile[profile.length - 1].h + targetHeight;
  const Reff = R / (1 - k);
  let minClearance = Infinity, obstruction = null;
  const adjusted = profile.map(p => {
    const bulge = D > 0 ? p.d * (D - p.d) / (2 * Reff) : 0;
    const sight = hA + (hB - hA) * (D > 0 ? p.d / D : 0);
    const ground = p.h + bulge, clearance = sight - ground;
    if (p.d > 0 && p.d < D) {
      if (clearance < minClearance) minClearance = clearance;
      if (clearance < 0 && !obstruction) obstruction = { d: p.d, h: p.h, clearance };
    }
    return { d: p.d, ground, sight, clearance };
  });
  return { visible: !obstruction, minClearance, obstruction, observer: hA, target: hB, adjusted };
}

/* ---------------------------------------------------------------- time zones (IANA, via Intl) */
export function tzOffsetMinutes(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}
/** Wall-clock day ("2024-07-01") and time ("12:00") in an IANA zone → UTC milliseconds. */
export function zonedToUtc(day, time, timeZone) {
  const [y, mo, d] = day.split('-').map(Number), [hh, mm] = String(time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, hh || 0, mm || 0);
  let utc = guess - tzOffsetMinutes(guess, timeZone) * 60000;
  const off2 = tzOffsetMinutes(utc, timeZone);
  utc = guess - off2 * 60000;
  return utc;
}
export function utcToZoned(ms, timeZone) {
  const offset = tzOffsetMinutes(ms, timeZone), t = new Date(ms + offset * 60000).toISOString();
  return { day: t.slice(0, 10), time: t.slice(11, 16), offset };
}
export const fmtOffset = min => `UTC${min < 0 ? '−' : '+'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}:${String(Math.abs(min) % 60).padStart(2, '0')}`;
/** A whole-hour "Etc/GMT±N" zone from longitude, for when no real zone is known (note the POSIX sign inversion). */
export function etcZoneForLon(lon) {
  const h = clampN(Math.round(lon / 15), -12, 14);
  return h === 0 ? 'Etc/GMT' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}
