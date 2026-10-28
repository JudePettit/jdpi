// SIGINT Dashboard: feed normalisers (pure). Each turns one public API or local receiver format into the small shape
// the page draws, tolerating the format drift these feeds are known for (SWPC changed its Kp product from rows of
// arrays to objects in 2025; dump1090 forks name the same fields differently).
import { num, isNum } from './util.js';

const ms = t => {
  if (t == null) return null;
  if (isNum(t)) return t > 1e12 ? t : t * 1000;
  let s = String(t).trim();
  if (!s) return null;
  s = s.replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z'; // SWPC times are UTC without a zone
  const v = Date.parse(s);
  return Number.isFinite(v) ? v : null;
};
export const parseUtc = ms;
const str = v => { if (v == null) return null; const s = String(v).trim(); return s ? s : null; };

/* ---- Aircraft (ADS-B) ------------------------------------------------------------------------------------------- */
// dbFlags in readsb/tar1090 and the adsb.lol API: 1 military, 2 interesting, 4 PIA (privacy ICAO address), 8 LADD.
export const DBFLAG = { MILITARY: 1, INTERESTING: 2, PIA: 4, LADD: 8 };
const FT_PER_M = 3.28084, KT_PER_MS = 1.943844, FPM_PER_MS = 196.8504;

/** Normalise readsb / dump1090(-fa) / tar1090 aircraft.json, the adsb.lol and adsb.fi v2 APIs, or OpenSky states. */
export function normaliseAircraft(json, { now = Date.now() } = {}) {
  if (!json || typeof json !== 'object') return { now, aircraft: [], messages: null, format: 'unknown' };
  if ('states' in json && ('time' in json || Array.isArray(json.states))) {
    const t = num(json.time);
    const list = (json.states || []).filter(Array.isArray).map(s => finish({
      hex: String(s[0] || '').toLowerCase(), flight: str(s[1]), country: str(s[2]),
      lon: num(s[5]), lat: num(s[6]),
      altFt: num(s[7]) != null ? s[7] * FT_PER_M : num(s[13]) != null ? s[13] * FT_PER_M : null,
      onGround: s[8] === true, gsKt: num(s[9]) != null ? s[9] * KT_PER_MS : null, track: num(s[10]),
      vsFpm: num(s[11]) != null ? s[11] * FPM_PER_MS : null, squawk: str(s[14]),
      seenS: t != null && num(s[4]) != null ? Math.max(0, t - s[4]) : null,
      seenPosS: t != null && num(s[3]) != null ? Math.max(0, t - s[3]) : null,
    }));
    return { now: t != null ? t * 1000 : now, aircraft: list, messages: null, format: 'opensky' };
  }
  const arr = Array.isArray(json.aircraft) ? json.aircraft : Array.isArray(json.ac) ? json.ac : null;
  if (!arr) return { now, aircraft: [], messages: null, format: 'unknown' };
  const t = ms(json.now) ?? now;
  const aircraft = arr.filter(a => a && typeof a === 'object' && a.hex).map(a => {
    const alt = a.alt_baro ?? a.altitude ?? a.alt_geom;
    const onGround = alt === 'ground' || a.ground === true;
    return finish({
      hex: String(a.hex).toLowerCase(), flight: str(a.flight), reg: str(a.r ?? a.reg), type: str(a.t ?? a.type_code),
      desc: str(a.desc), lat: num(a.lat ?? a.rr_lat), lon: num(a.lon ?? a.rr_lon),
      altFt: onGround ? 0 : num(alt), onGround,
      gsKt: num(a.gs ?? a.speed), track: num(a.track ?? a.true_heading ?? a.mag_heading),
      vsFpm: num(a.baro_rate ?? a.geom_rate ?? a.vert_rate), squawk: str(a.squawk),
      emergency: a.emergency && a.emergency !== 'none' ? String(a.emergency) : null,
      category: str(a.category), seenS: num(a.seen), seenPosS: num(a.seen_pos), rssi: num(a.rssi),
      dbFlags: num(a.dbFlags) ?? 0, source: str(a.type), mlat: Array.isArray(a.mlat) && a.mlat.length > 0,
    });
  });
  return { now: t, aircraft, messages: num(json.messages), format: Array.isArray(json.ac) ? 'adsb-v2' : 'readsb' };
}
function finish(a) {
  if (a.lat != null && (Math.abs(a.lat) > 90 || a.lon == null || Math.abs(a.lon) > 180)) { a.lat = null; a.lon = null; }
  if (a.flight) a.flight = a.flight.replace(/[\s@]+/g, '') || null; // '@' pads unknown callsign characters
  const f = a.dbFlags || 0;
  a.military = !!(f & DBFLAG.MILITARY);
  a.pia = !!(f & DBFLAG.PIA);
  a.ladd = !!(f & DBFLAG.LADD);
  a.alert = squawkAlert(a.squawk) || (a.emergency ? emergencyLabel(a.emergency) : null);
  return a;
}
export function squawkAlert(sq) {
  return { 7500: 'Unlawful interference (7500)', 7600: 'Radio failure (7600)', 7700: 'Emergency (7700)' }[sq] || null;
}
const emergencyLabel = e => ({ general: 'Emergency', lifeguard: 'Medical (lifeguard)', minfuel: 'Minimum fuel', nordo: 'No radio', unlawful: 'Unlawful interference', downed: 'Downed aircraft' }[e] || 'Emergency');
/** Altitude bands for the map's sequential colour scale: 0 ground, 1 <1,000 ft … 5 ≥30,000 ft. */
export const ALT_BANDS = [
  { max: 0, label: 'On ground' }, { max: 1000, label: 'Below 1,000 ft' }, { max: 10000, label: '1,000–10,000 ft' },
  { max: 20000, label: '10,000–20,000 ft' }, { max: 30000, label: '20,000–30,000 ft' }, { max: Infinity, label: '30,000 ft and up' },
];
export function altitudeBand(a) {
  if (a.onGround) return 0;
  if (!isNum(a.altFt)) return 1;
  return ALT_BANDS.findIndex((b, i) => i > 0 && a.altFt < b.max);
}

/* ---- Ships (AIS) ------------------------------------------------------------------------------------------------ */
export const NAV_STATUS = ['Under way (engine)', 'At anchor', 'Not under command', 'Restricted manoeuvrability', 'Constrained by draught',
  'Moored', 'Aground', 'Fishing', 'Under way (sailing)', 'Reserved', 'Reserved', 'Towing astern', 'Pushing / towing alongside', 'Reserved', 'AIS-SART / MOB / EPIRB', 'Not defined'];
/** AIS ship type code to a detailed label. */
export function shipTypeLabel(code) {
  const c = num(code);
  if (c == null || c === 0) return 'Unknown';
  if (c >= 20 && c <= 29) return 'Wing in ground';
  const s = { 30: 'Fishing', 31: 'Towing', 32: 'Towing (large)', 33: 'Dredging', 34: 'Diving ops', 35: 'Military ops', 36: 'Sailing', 37: 'Pleasure craft',
    50: 'Pilot vessel', 51: 'Search and rescue', 52: 'Tug', 53: 'Port tender', 54: 'Anti-pollution', 55: 'Law enforcement', 58: 'Medical transport', 59: 'Non-combatant' }[c];
  if (s) return s;
  if (c >= 40 && c <= 49) return 'High-speed craft';
  if (c >= 60 && c <= 69) return 'Passenger';
  if (c >= 70 && c <= 79) return 'Cargo';
  if (c >= 80 && c <= 89) return 'Tanker';
  return 'Other';
}
/** Colour group for the map (at most three colours, then Other): cargo & tankers, passenger, fishing. */
export function shipGroup(code) {
  const c = num(code);
  if (c == null) return 'other';
  if (c >= 70 && c <= 89) return 'cargo';
  if ((c >= 60 && c <= 69) || (c >= 40 && c <= 49)) return 'passenger';
  if (c === 30) return 'fishing';
  return 'other';
}
export const SHIP_GROUPS = [
  { id: 'cargo', label: 'Cargo and tankers', token: '--prp-cat-1' },
  { id: 'passenger', label: 'Passenger and high-speed', token: '--prp-cat-2' },
  { id: 'fishing', label: 'Fishing', token: '--prp-cat-3' },
  { id: 'other', label: 'Other and unknown', token: '--prp-faint' },
];
/** Normalise AIS-catcher's web viewer JSON (/api/ships.json) or the PRP bridge's aisstream.io snapshot. */
export function normaliseShips(json) {
  const arr = Array.isArray(json?.ships) ? json.ships : Array.isArray(json) ? json : [];
  const ships = arr.filter(s => s && num(s.mmsi) != null).map(s => {
    let lat = num(s.lat ?? s.latitude), lon = num(s.lon ?? s.longitude);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) { lat = null; lon = null; }
    let heading = num(s.heading ?? s.TrueHeading); if (heading == null || heading >= 360) heading = null;
    let cog = num(s.cog ?? s.Cog); if (cog == null || cog >= 360) cog = null;
    let sog = num(s.speed ?? s.sog ?? s.Sog); if (sog == null || sog >= 102.2) sog = null;
    const type = num(s.shiptype ?? s.type ?? s.shipType);
    const status = num(s.status ?? s.navStatus);
    return {
      mmsi: num(s.mmsi), name: str(s.shipname ?? s.name ?? s.ShipName)?.replace(/@+$/, '').trim() || null,
      callsign: str(s.callsign)?.replace(/@+$/, '').trim() || null, imo: num(s.imo) || null,
      lat, lon, sogKt: sog, cog, heading, type, typeLabel: shipTypeLabel(type), group: shipGroup(type),
      status: status != null && status >= 0 && status < 16 ? status : null, destination: str(s.destination)?.replace(/@+$/, '').trim() || null,
      country: str(s.country), ageS: num(s.last_signal ?? s.ageS), draught: num(s.draught) || null,
    };
  });
  return { ships, station: json?.station && num(json.station.lat) != null ? { lat: num(json.station.lat), lon: num(json.station.lon) } : null };
}

/* ---- Space weather (NOAA SWPC) ---------------------------------------------------------------------------------- */
/** Planetary K index, 3-hourly. Accepts the 2025+ object rows, the forecast product, and the older array-of-arrays. */
export function normaliseKp(json) {
  if (!Array.isArray(json)) return [];
  let rows = json;
  if (Array.isArray(json[0])) {
    const head = json[0].map(h => String(h).toLowerCase());
    const it = head.indexOf('time_tag'), ik = head.findIndex(h => h === 'kp'), io = head.indexOf('observed');
    rows = json.slice(1).map(r => ({ time_tag: r[it], kp: r[ik], observed: io >= 0 ? r[io] : 'observed' }));
  }
  return rows.map(r => ({ t: ms(r.time_tag), kp: num(r.kp ?? r.Kp ?? r.kp_index), kind: String(r.observed ?? 'observed').toLowerCase() }))
    .filter(r => r.t != null && r.kp != null).sort((a, b) => a.t - b.t);
}
/** The latest one-minute estimated Kp. */
export function latestKp1m(json) {
  if (!Array.isArray(json) || !json.length) return null;
  const r = json[json.length - 1];
  const kp = num(r.estimated_kp ?? r.kp_index);
  return kp == null ? null : { t: ms(r.time_tag), kp };
}
/** NOAA G-scale level for a Kp value (Kp 5 = G1 … Kp 9 = G5; "9-" (8.67) is still G4). */
export const kpToG = kp => !isNum(kp) ? 0 : kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0;
export function kpWord(kp) {
  if (!isNum(kp)) return '–';
  const g = kpToG(kp);
  if (g) return `Storm G${g}`;
  return kp >= 4 ? 'Active' : kp >= 3 ? 'Unsettled' : 'Quiet';
}
/** GOES X-ray flux in one band (default the long 0.1–0.8 nm channel that defines flare classes). */
export function normaliseXray(json, band = '0.1-0.8nm') {
  if (!Array.isArray(json)) return [];
  return json.filter(r => r && r.energy === band).map(r => ({ t: ms(r.time_tag), flux: num(r.flux) }))
    .filter(r => r.t != null && r.flux != null && r.flux > 0).sort((a, b) => a.t - b.t);
}
/** Flare class for a long-channel flux in W/m²: A, B, C, M, X with one decimal (X can exceed 9.9). */
export function xrayClass(flux) {
  if (!isNum(flux) || flux <= 0) return '–';
  const steps = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]];
  for (const [c, base] of steps) if (flux >= base) return c + (Math.floor((flux / base) * 10) / 10).toFixed(1);
  return 'A0.0';
}
/** Real-time solar wind, one row per minute from the active spacecraft (SWPC's RTSW feeds list several). */
export function normaliseWind(json) {
  if (!Array.isArray(json)) return [];
  return pickActive(json).map(r => ({ t: ms(r.time_tag), speed: num(r.proton_speed), density: num(r.proton_density), source: r.source }))
    .filter(r => r.t != null && r.speed != null);
}
export function normaliseMag(json) {
  if (!Array.isArray(json)) return [];
  return pickActive(json).map(r => ({ t: ms(r.time_tag), bt: num(r.bt), bz: num(r.bz_gsm ?? r.bz_gse), source: r.source }))
    .filter(r => r.t != null && r.bz != null);
}
function pickActive(rows) {
  const any = rows.some(r => r && r.active === true);
  const seen = new Map();
  for (const r of rows) {
    if (!r || (any && r.active !== true)) continue;
    const k = r.time_tag;
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => ms(a.time_tag) - ms(b.time_tag));
}
/** NOAA space weather scales: current R/S/G and the next days' probabilities. */
export function normaliseScales(json) {
  if (!json || typeof json !== 'object') return null;
  const pick = k => json[k];
  const now = pick('0');
  const level = x => ({ scale: num(x?.Scale), text: str(x?.Text) });
  const days = ['1', '2', '3'].map(k => pick(k)).filter(Boolean).map(d => ({
    date: str(d.DateStamp), rMinor: num(d.R?.MinorProb), rMajor: num(d.R?.MajorProb), sProb: num(d.S?.Prob), g: num(d.G?.Scale),
  }));
  return now ? { at: ms(`${now.DateStamp}T${now.TimeStamp}`), R: level(now.R), S: level(now.S), G: level(now.G), days, yesterday: pick('-1') ? { R: level(pick('-1').R), S: level(pick('-1').S), G: level(pick('-1').G) } : null } : null;
}
/** SWPC alerts, newest first, with a one-line title taken from the message body. */
export function normaliseAlerts(json, limit = 12) {
  if (!Array.isArray(json)) return [];
  return json.map(a => {
    const text = String(a.message || '').replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const title = lines.find(l => /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT|EXTENDED WARNING|CANCEL)/i.test(l)) || lines[0] || a.product_id;
    return { id: str(a.product_id), issued: ms(a.issue_datetime), title, text };
  }).filter(a => a.issued != null).sort((a, b) => b.issued - a.issued).slice(0, limit);
}

/* ---- HF propagation from WSPR spots (wspr.live) ------------------------------------------------------------------ */
export const WSPR_BANDS = { '-1': 'LF', 0: 'MF', 1: '160 m', 3: '80 m', 5: '60 m', 7: '40 m', 10: '30 m', 13: '22 m', 14: '20 m', 18: '17 m', 21: '15 m', 24: '12 m', 28: '10 m', 40: '8 m', 50: '6 m', 70: '4 m', 144: '2 m', 432: '70 cm', 1296: '23 cm' };
/** SQL for wspr.live: spots decoded in the last `minutes` by receivers within ~boxDeg of a point, per band. */
export function wsprQuery(lat, lon, { minutes = 60, boxDeg = 4 } = {}) {
  const f = v => Number(v).toFixed(2);
  const dLon = Math.min(60, boxDeg / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const m = Math.max(5, Math.min(360, Math.round(minutes)));
  return 'SELECT band, count() AS spots, uniq(rx_sign) AS receivers, uniq(tx_sign) AS transmitters, max(distance) AS max_km, round(median(snr)) AS snr ' +
    `FROM wspr.rx WHERE time > now() - INTERVAL ${m} MINUTE AND rx_lat BETWEEN ${f(lat - boxDeg)} AND ${f(lat + boxDeg)} ` +
    `AND rx_lon BETWEEN ${f(lon - dLon)} AND ${f(lon + dLon)} GROUP BY band ORDER BY band FORMAT JSON`;
}
export function normaliseWspr(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map(r => ({ band: num(r.band), label: WSPR_BANDS[r.band] ?? `${r.band} MHz`, spots: num(r.spots) ?? 0, receivers: num(r.receivers) ?? 0,
    transmitters: num(r.transmitters) ?? 0, maxKm: num(r.max_km) ?? 0, snr: num(r.snr) })).filter(r => r.band != null);
}

/* ---- Meshtastic HTTP API (/json/nodes) and OpenWebRX (/status.json) ------------------------------------------------ */
export function normaliseMeshNodes(json) {
  const arr = json?.data?.nodes ?? json?.nodes ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.filter(n => n && (n.id || n.num != null)).map(n => {
    const id = str(n.id) || (num(n.num) != null ? '!' + (n.num >>> 0).toString(16).padStart(8, '0') : null);
    const p = n.position || {};
    let lat = num(p.latitude ?? (p.latitude_i != null ? p.latitude_i / 1e7 : null));
    let lon = num(p.longitude ?? (p.longitude_i != null ? p.longitude_i / 1e7 : null));
    if (lat == null || lon == null || (lat === 0 && lon === 0)) { lat = null; lon = null; }
    return {
      num: num(n.num) ?? (id && /^![0-9a-f]{8}$/i.test(id) ? parseInt(id.slice(1), 16) : null), id,
      longName: str(n.long_name ?? n.longName), shortName: str(n.short_name ?? n.shortName), hwModel: num(n.hw_model ?? n.hwModel),
      lat, lon, alt: num(p.altitude), lastHeard: num(n.last_heard ?? n.lastHeard), snr: num(n.snr),
      viaMqtt: n.via_mqtt === true || n.via_mqtt === 'true', hopsAway: num(n.hops_away ?? n.hopsAway), battery: num(n.battery_level), rssi: null,
    };
  });
}
export function normaliseOwrxStatus(json) {
  if (!json || typeof json !== 'object') return null;
  const rx = json.receiver || {};
  return {
    name: str(rx.name), location: str(rx.location), admin: null, version: str(json.version),
    lat: num(rx.gps?.lat), lon: num(rx.gps?.lon), maxClients: num(json.max_clients),
    sdrs: (Array.isArray(json.sdrs) ? json.sdrs : []).map(s => ({ name: str(s.name), type: str(s.type),
      profiles: (Array.isArray(s.profiles) ? s.profiles : []).map(p => ({ name: str(p.name), centerHz: num(p.center_freq), rate: num(p.sample_rate) })) })),
  };
}

/* ---- Series helper ------------------------------------------------------------------------------------------------ */
/** Reduce a time series to at most ~max points, keeping each bucket's minimum and maximum so spikes (flares) survive. */
export function downsample(points, max, key = 'v') {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const size = Math.ceil(points.length / Math.max(2, Math.floor(max / 2)));
  const out = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    let lo = chunk[0], hi = chunk[0];
    for (const p of chunk) { if (p[key] < lo[key]) lo = p; if (p[key] > hi[key]) hi = p; }
    if (lo === hi) out.push(lo); else out.push(...(lo.t <= hi.t ? [lo, hi] : [hi, lo]));
  }
  return out;
}
