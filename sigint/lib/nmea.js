// SIGINT Dashboard: NMEA 0183 parser and GNSS state for a USB GPS/GNSS receiver read over Web Serial (pure).
// Handles GGA, RMC, GSA, GSV, GNS, VTG and TXT from GPS, GLONASS, Galileo, BeiDou, QZSS and NavIC talkers, with or
// without the NMEA 4.10 system and signal IDs that multi-band receivers (u-blox M9/F9 and similar) add.

export const CONSTELLATIONS = [
  { id: 'GPS', label: 'GPS', token: '--prp-cat-1' },
  { id: 'GLONASS', label: 'GLONASS', token: '--prp-cat-2' },
  { id: 'Galileo', label: 'Galileo', token: '--prp-cat-3' },
  { id: 'BeiDou', label: 'BeiDou', token: '--prp-cat-4' },
  { id: 'QZSS', label: 'QZSS', token: '--prp-cat-5' },
  { id: 'NavIC', label: 'NavIC', token: '--prp-cat-6' },
  { id: 'SBAS', label: 'SBAS (EGNOS, WAAS…)', token: '--prp-cat-7' },
];
const TALKER = { GP: 'GPS', GL: 'GLONASS', GA: 'Galileo', GB: 'BeiDou', BD: 'BeiDou', GQ: 'QZSS', QZ: 'QZSS', GI: 'NavIC', IR: 'NavIC' };
const SYSTEM_ID = { 1: 'GPS', 2: 'GLONASS', 3: 'Galileo', 4: 'BeiDou', 5: 'QZSS', 6: 'NavIC' };
export const FIX_QUALITY = { 0: 'No fix', 1: 'GPS', 2: 'DGPS / SBAS', 3: 'PPS', 4: 'RTK fixed', 5: 'RTK float', 6: 'Dead reckoning', 7: 'Manual', 8: 'Simulator' };

/** Which constellation a PRN belongs to when only the number is known (NMEA 4.0 / u-blox extended numbering). */
export function constellationOfPrn(prn, talker) {
  if (talker && TALKER[talker]) {
    if (talker === 'GP' && prn >= 33 && prn <= 64) return 'SBAS';
    if (talker === 'GP' && prn >= 120 && prn <= 158) return 'SBAS';
    return TALKER[talker];
  }
  if (prn >= 1 && prn <= 32) return 'GPS';
  if ((prn >= 33 && prn <= 64) || (prn >= 120 && prn <= 158)) return 'SBAS';
  if (prn >= 65 && prn <= 96) return 'GLONASS';
  if (prn >= 193 && prn <= 202) return 'QZSS';
  if (prn >= 201 && prn <= 263) return 'BeiDou';
  if (prn >= 301 && prn <= 336) return 'Galileo';
  if (prn >= 401 && prn <= 463) return 'BeiDou';
  return 'GPS';
}

export function checksumOk(line) {
  const m = /^[$!]([^*]*)\*([0-9A-Fa-f]{2})\s*$/.exec(line);
  if (!m) return false;
  let x = 0;
  for (let i = 0; i < m[1].length; i++) x ^= m[1].charCodeAt(i);
  return x === parseInt(m[2], 16);
}
const n = v => (v === undefined || v === '' ? null : Number.isFinite(+v) ? +v : null);
/** ddmm.mmmm / dddmm.mmmm with a hemisphere letter to signed decimal degrees. */
export function nmeaCoord(v, hemi) {
  if (!v) return null;
  const dot = v.indexOf('.');
  const degLen = (dot < 0 ? v.length : dot) - 2;
  if (degLen < 1) return null;
  const d = +v.slice(0, degLen), m = +v.slice(degLen);
  if (!Number.isFinite(d) || !Number.isFinite(m)) return null;
  const val = d + m / 60;
  return hemi === 'S' || hemi === 'W' ? -val : val;
}

/** Parse one sentence; returns null for blank lines, { type: 'BAD' } for a failed checksum, otherwise a typed object. */
export function parseSentence(line, { requireChecksum = false } = {}) {
  line = String(line || '').trim();
  if (!line || (line[0] !== '$' && line[0] !== '!')) return null;
  const hasCs = /\*[0-9A-Fa-f]{2}$/.test(line);
  if (hasCs && !checksumOk(line)) return { type: 'BAD', raw: line };
  if (!hasCs && requireChecksum) return { type: 'BAD', raw: line };
  const body = line.slice(1, hasCs ? line.lastIndexOf('*') : undefined);
  const f = body.split(',');
  const head = f[0];
  if (head.length < 5) return null;
  const talker = head.startsWith('P') ? 'P' : head.slice(0, 2), type = head.startsWith('P') ? head : head.slice(2);
  switch (type) {
    case 'GGA': return { type, talker, time: f[1] || null, lat: nmeaCoord(f[2], f[3]), lon: nmeaCoord(f[4], f[5]), quality: n(f[6]) ?? 0, numSv: n(f[7]), hdop: n(f[8]), alt: n(f[9]), geoidSep: n(f[11]) };
    case 'RMC': return { type, talker, time: f[1] || null, valid: f[2] === 'A', lat: nmeaCoord(f[3], f[4]), lon: nmeaCoord(f[5], f[6]), sogKn: n(f[7]), cog: n(f[8]), date: f[9] || null, mode: f[12] || null };
    case 'GSA': {
      const prns = f.slice(3, 15).map(n).filter(v => v != null && v > 0);
      return { type, talker, auto: f[1] === 'A', fix: n(f[2]) ?? 1, prns, pdop: n(f[15]), hdop: n(f[16]), vdop: n(f[17]), systemId: n(f[18]) };
    }
    case 'GSV': {
      const total = n(f[1]), index = n(f[2]), inView = n(f[3]);
      const rest = f.slice(4);
      const signalId = rest.length % 4 === 1 ? rest.pop() : null; // NMEA 4.10 appends a signal ID
      const sats = [];
      for (let i = 0; i < rest.length; i += 4) {
        const prn = n(rest[i]);
        if (prn == null) continue;
        sats.push({ prn, el: n(rest[i + 1]), az: n(rest[i + 2]), snr: n(rest[i + 3]) });
      }
      return { type, talker, total, index, inView, sats, signalId: signalId === '' ? null : signalId };
    }
    case 'GNS': return { type, talker, time: f[1] || null, lat: nmeaCoord(f[2], f[3]), lon: nmeaCoord(f[4], f[5]), modes: f[6] || '', numSv: n(f[7]), hdop: n(f[8]), alt: n(f[9]), geoidSep: n(f[10]) };
    case 'VTG': return { type, talker, cog: n(f[1]), sogKn: n(f[5]), sogKmh: n(f[7]) };
    case 'TXT': return { type, talker, text: f.slice(4).join(',').trim() };
    case 'ZDA': return { type, talker, time: f[1] || null, day: n(f[2]), month: n(f[3]), year: n(f[4]) };
    default: return { type, talker, fields: f.slice(1) };
  }
}

/** A line splitter for a serial text stream: push chunks, get whole lines back. */
export function lineSplitter() {
  let rest = '';
  return chunk => {
    rest += chunk;
    const parts = rest.split(/\r?\n/);
    rest = parts.pop();
    if (rest.length > 4096) rest = rest.slice(-512); // a stream that never sends a newline is not NMEA
    return parts.filter(l => l.length);
  };
}

export function createGnssState() {
  return {
    fix: { quality: 0, dim: 1, valid: false }, lat: null, lon: null, alt: null, timeUtc: null, date: null,
    numSv: null, hdop: null, pdop: null, vdop: null, sogKn: null, cog: null,
    sats: new Map(),     // key "GPS:12" → { sys, prn, el, az, snr, used, seen, signals: Set }
    used: new Map(),     // system → Set(prn), from GSA
    gsv: new Map(),      // talker:signal → in-progress list
    sentences: 0, bad: 0, lastAt: 0, text: [], history: [], antenna: null, fixLosses: 0, _hadFix: false,
  };
}
const fmtTime = t => (t && t.length >= 6 ? `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}` : null);

/** Apply one parsed sentence to the state. `now` is a millisecond timestamp (for staleness). */
export function updateGnss(st, msg, now = Date.now()) {
  if (!msg) return st;
  if (msg.type === 'BAD') { st.bad++; return st; }
  st.sentences++; st.lastAt = now;
  switch (msg.type) {
    case 'GGA':
      if (msg.time) st.timeUtc = fmtTime(msg.time);
      st.fix.quality = msg.quality;
      if (msg.quality > 0 && msg.lat != null) { st.lat = msg.lat; st.lon = msg.lon; st.alt = msg.alt; }
      st.numSv = msg.numSv; if (msg.hdop != null) st.hdop = msg.hdop;
      trackFix(st, msg.quality > 0);
      break;
    case 'GNS':
      if (msg.time) st.timeUtc = fmtTime(msg.time);
      if (msg.lat != null && /[ADPRFEM]/.test(msg.modes)) { st.lat = msg.lat; st.lon = msg.lon; st.alt = msg.alt; }
      if (msg.numSv != null) st.numSv = msg.numSv; if (msg.hdop != null) st.hdop = msg.hdop;
      break;
    case 'RMC':
      if (msg.time) st.timeUtc = fmtTime(msg.time);
      if (msg.date && msg.date.length === 6) st.date = `20${msg.date.slice(4, 6)}-${msg.date.slice(2, 4)}-${msg.date.slice(0, 2)}`;
      st.fix.valid = msg.valid;
      if (msg.valid && msg.lat != null) { st.lat = msg.lat; st.lon = msg.lon; }
      if (msg.sogKn != null) st.sogKn = msg.sogKn; if (msg.cog != null) st.cog = msg.cog;
      break;
    case 'VTG': if (msg.sogKn != null) st.sogKn = msg.sogKn; if (msg.cog != null) st.cog = msg.cog; break;
    case 'GSA': {
      st.fix.dim = msg.fix; st.pdop = msg.pdop ?? st.pdop; st.hdop = msg.hdop ?? st.hdop; st.vdop = msg.vdop ?? st.vdop;
      // Without a system ID a GN talker's list mixes constellations: sort each PRN by its number.
      const sbas = prn => (prn >= 33 && prn <= 64) || (prn >= 120 && prn <= 158);
      const bySys = new Map();
      for (const prn of msg.prns) {
        let sys = msg.systemId ? SYSTEM_ID[msg.systemId] || 'GPS' : constellationOfPrn(prn, msg.talker === 'GN' ? null : msg.talker);
        if (sys === 'GPS' && sbas(prn)) sys = 'SBAS';
        if (!bySys.has(sys)) bySys.set(sys, new Set());
        bySys.get(sys).add(prn);
      }
      const own = msg.systemId ? SYSTEM_ID[msg.systemId] : msg.talker === 'GN' ? null : TALKER[msg.talker] || 'GPS';
      const systems = own ? [own, ...(own === 'GPS' ? ['SBAS'] : [])] : [...bySys.keys()];
      for (const sys of systems) st.used.set(sys, Object.assign(bySys.get(sys) || new Set(), { at: now }));
      markUsed(st);
      break;
    }
    case 'GSV': {
      const key = `${msg.talker}:${msg.signalId ?? ''}`;
      if (msg.index === 1 || !st.gsv.has(key)) st.gsv.set(key, []);
      st.gsv.get(key).push(...msg.sats);
      if (msg.index === msg.total || msg.inView === 0) {
        commitGsv(st, msg.talker, msg.signalId, st.gsv.get(key), now);
        st.gsv.delete(key);
      }
      break;
    }
    case 'TXT': {
      st.text.push(msg.text); if (st.text.length > 12) st.text.shift();
      const ant = /ANTSTATUS=(\w+)/i.exec(msg.text); if (ant) st.antenna = ant[1].toUpperCase();
      break;
    }
  }
  return st;
}
function trackFix(st, has) {
  if (st._hadFix && !has) st.fixLosses++;
  st._hadFix = has;
}
function commitGsv(st, talker, signalId, list, now) {
  // A satellite heard on several signals (L1, L5…) keeps one reading per signal and shows its best C/N0.
  const sig = signalId ?? '';
  const listed = new Set(), systems = new Set();
  for (const s of list) {
    const sys = constellationOfPrn(s.prn, talker === 'GN' ? null : talker);
    const key = `${sys}:${s.prn}`;
    listed.add(key); systems.add(sys);
    const sat = st.sats.get(key) || { sys, prn: s.prn, el: null, az: null, bySig: {}, used: false };
    sat.el = s.el ?? sat.el; sat.az = s.az ?? sat.az; sat.bySig[sig] = s.snr; sat.seen = now;
    st.sats.set(key, sat);
  }
  // Satellites of this talker that this signal no longer lists lose that signal's reading (and go when none is left).
  const own = TALKER[talker];
  for (const [key, sat] of st.sats) {
    if (listed.has(key)) continue;
    const mine = own ? sat.sys === own || (talker === 'GP' && sat.sys === 'SBAS') : systems.has(sat.sys);
    if (!mine || !(sig in sat.bySig)) continue;
    delete sat.bySig[sig];
    if (!Object.keys(sat.bySig).length) st.sats.delete(key);
  }
  for (const sat of st.sats.values()) {
    const v = Object.values(sat.bySig).filter(x => x != null);
    sat.snr = v.length ? Math.max(...v) : null;
  }
  markUsed(st);
}
function markUsed(st) {
  for (const s of st.sats.values()) s.used = !!st.used.get(s.sys)?.has(s.prn);
}
/** Drop satellites not reported for maxAge ms (a constellation the receiver stopped tracking). */
export function pruneGnss(st, now = Date.now(), maxAge = 10000) {
  for (const [k, s] of st.sats) if (now - s.seen > maxAge) st.sats.delete(k);
  for (const [k, set] of st.used) if (now - (set.at || 0) > maxAge) st.used.delete(k);
  return st;
}
/** Headline figures plus simple interference indicators. */
export function gnssSummary(st) {
  const sats = [...st.sats.values()];
  const heard = sats.filter(s => s.snr != null && s.snr > 0).map(s => s.snr).sort((a, b) => b - a);
  const top4 = heard.slice(0, 4);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const dim = st.fix.quality > 0 ? (st.fix.dim >= 3 ? '3D' : st.fix.dim === 2 ? '2D' : 'Fix') : st.fix.valid ? 'Fix' : 'No fix';
  return {
    fix: dim, quality: FIX_QUALITY[st.fix.quality] ?? `Quality ${st.fix.quality}`, hasFix: st.fix.quality > 0 || st.fix.valid,
    inView: sats.length, heard: heard.length, used: sats.filter(s => s.used).length || st.numSv || 0,
    cn0Top4: mean(top4), cn0Mean: mean(heard), strong: heard.filter(v => v >= 35).length,
    hdop: st.hdop, pdop: st.pdop, vdop: st.vdop,
  };
}
/** Plain-language read of the indicators. Jamming lowers every C/N0 at once; spoofing can keep C/N0 high but move the fix. */
export function interferenceHint(sum) {
  if (!sum || !sum.inView) return { level: 'idle', text: 'Waiting for satellites.' };
  if (!sum.hasFix && sum.heard > 4 && (sum.cn0Top4 ?? 0) < 25) return { level: 'bad', text: 'Satellites are in view but every signal is weak and there is no fix. With a clear view of the sky, that pattern suggests interference (or a damaged antenna).' };
  if ((sum.cn0Top4 ?? 0) < 30) return { level: 'warn', text: 'The strongest signals are below 30 dB-Hz. Indoors this is normal; outdoors with open sky it can mean interference or a poor antenna.' };
  if (sum.hdop != null && sum.hdop > 5) return { level: 'warn', text: 'Poor geometry (HDOP above 5): positions will be loose. Move to open sky.' };
  return { level: 'good', text: 'Signal levels and geometry look normal.' };
}
