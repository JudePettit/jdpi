// GEOINT & IMINT Dashboard: small pure helpers (no DOM, no network), shared by the page and the Node tests.

export const TABS = ['overview', 'imagery', 'hazards', 'features', 'measure', 'cookbook', 'hardware', 'law'];
export const TAB_NAMES = {
  overview: 'Overview', imagery: 'Imagery', hazards: 'Fires & hazards', features: 'Features',
  measure: 'Measure & geolocate', cookbook: 'Software Cookbook', hardware: 'Hardware Guide', law: 'Law & ethics',
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

/* ---------- URL hash state ----------
   #tab=imagery&ll=48.12345,35.12345&z=7&d=2025-01-08 …  Values are short strings; each view validates its own keys.
   Older links that use ?tab= in the query string open the same tab. */
const FIRST = ['tab', 'll', 'z'];
const enc = v => encodeURIComponent(String(v)).replace(/%2C/gi, ',').replace(/%3A/gi, ':').replace(/%2F/gi, '/');

export function parseHash(hash = '', search = '') {
  const out = {};
  const read = str => {
    for (const part of String(str).replace(/^[#?]/, '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : safeDecode(part.slice(i + 1));
      if (k) out[k] = v;
    }
  };
  read(search); // the query string first, so the hash wins
  read(hash);
  out.tab = TABS.includes(out.tab) ? out.tab : 'overview';
  return out;
}
function safeDecode(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } }

export function buildHash(state) {
  const keys = Object.keys(state).filter(k => state[k] !== undefined && state[k] !== null && state[k] !== '' && state[k] !== false);
  keys.sort((a, b) => {
    const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return '#' + keys.map(k => `${enc(k)}=${enc(state[k] === true ? 1 : state[k])}`).join('&');
}

/** "48.12345,35.5" → [48.12345, 35.5] (or null when invalid). */
export function parseLatLon(s) {
  const m = String(s ?? '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}
export const fmtLatLon = (lat, lon, d = 5) => `${lat.toFixed(d)},${lon.toFixed(d)}`;

/* ---------- Dates (calendar days in UTC, as satellite products use) ---------- */
export const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const isoDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day, n) => isoDay(Date.parse(day + 'T00:00:00Z') + n * 864e5);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export const clampDay = (day, min, max) => (min && day < min ? min : max && day > max ? max : day);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = day => { if (!isISODate(day)) return String(day ?? ''); const [y, m, d] = day.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
export function fmtUTC(ms, { seconds = false } = {}) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const t = d.toISOString();
  return `${fmtDay(t.slice(0, 10))}, ${t.slice(11, seconds ? 19 : 16)} UTC`;
}
/** "5 min ago", "3 h ago", "2 days ago" relative to now. */
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/* ---------- Numbers ---------- */
export const fmtNum = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '–';
  if (m < 1000) return `${fmtNum(m, m < 10 ? 1 : 0)} m`;
  return `${fmtNum(m / 1000, m < 10000 ? 2 : m < 100000 ? 1 : 0)} km`;
}
export const fmtMiles = m => `${fmtNum(m / 1609.344, m < 16093 ? 2 : 1)} mi`;
export const fmtNautical = m => `${fmtNum(m / 1852, m < 18520 ? 2 : 1)} nmi`;
export function fmtArea(m2) {
  if (!Number.isFinite(m2)) return '–';
  if (m2 < 10000) return `${fmtNum(m2, 0)} m²`;
  if (m2 < 1e6) return `${fmtNum(m2 / 1e4, 2)} ha`;
  return `${fmtNum(m2 / 1e6, m2 < 1e8 ? 2 : 0)} km²`;
}
export const fmtDeg = (d, digits = 1) => (Number.isFinite(d) ? `${d.toFixed(digits)}°` : '–');

/* ---------- CSV (RFC 4180, quoted fields) ---------- */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Plain-text slug for ids and links: "Google Earth Pro (historical)" → "google-earth-pro-historical". */
export const slug = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
